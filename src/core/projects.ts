// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The project registry. A project is any folder with a `_Project.md`. Documents are the
// Markdown files under it, in binder order: numeric prefix on each path segment, then the
// `order` field, then name. Ids come from frontmatter and are cached until the host reports
// a change.

import type { FileChange, Host } from "../host/host.js";
import * as fm from "./frontmatter.js";
import { SPEC_VERSION, Spec, type Document } from "./spec.js";
import { words } from "./text.js";

export const PROJECT_NOTE = "_Project.md";
const HIDDEN_DIRS = new Set(["_snapshots", "_attachments"]);

export interface Project {
  /** folder path without trailing slash; "" for the vault root */
  root: string;
  notePath: string;
  title: string;
  version: number | null;
}

export class Projects {
  private index: Map<string, Document> | null = null;
  /** paths whose index entry is stale and is re-read on the next use */
  private stale = new Set<string>();
  private rootsCache: Project[] | null = null;
  private docsCache = new Map<string, Document[]>();
  /** per-path values computed from a document, dropped when that path changes */
  private derivedCache = new Map<string, Map<string, unknown>>();
  private warned = new Set<string>();
  /** a project the writer picked by hand; forgotten when a note from another project opens */
  private chosen: string | null = null;
  /** the project last shown, so panels have one to show when nothing is open */
  private remembered: string | null = null;
  private currentListeners = new Set<(p: Project | null) => void>();

  constructor(
    private readonly host: Host,
    private readonly spec: Spec,
  ) {
    host.onFileChanged((c) => this.changed(c));
    host.onActiveFileChanged((path) => void this.activeChanged(path));
  }

  /**
   * The project every project-level panel shows: the one picked by hand, else the active
   * note's, else the one last shown, else the first. Null only when the vault has none.
   */
  async current(): Promise<Project | null> {
    const roots = await this.roots();
    if (roots.length === 0) return null;
    const find = (root: string | null) => (root === null ? null : (roots.find((r) => r.root === root) ?? null));
    const picked = find(this.chosen);
    if (picked) return this.remember(picked);
    const active = this.host.activeFile();
    const own = active ? await this.projectOf(active) : null;
    if (own) return this.remember(own);
    return this.remember(find(this.remembered) ?? roots[0]!);
  }

  /** The project the writer picked by hand, if any. */
  chosenRoot(): string | null {
    return this.chosen;
  }

  choose(root: string | null): void {
    this.chosen = root;
    if (root !== null) this.remembered = root;
    void this.notifyCurrent();
  }

  onCurrentChanged(cb: (p: Project | null) => void): () => void {
    this.currentListeners.add(cb);
    return () => this.currentListeners.delete(cb);
  }

  private remember(p: Project): Project {
    this.remembered = p.root;
    return p;
  }

  private async activeChanged(path: string | null): Promise<void> {
    const own = path ? await this.projectOf(path) : null;
    if (own && own.root !== this.chosen) this.chosen = null;
    await this.notifyCurrent();
  }

  private async notifyCurrent(): Promise<void> {
    const p = await this.current();
    for (const l of this.currentListeners) l(p);
  }

  /** One file changed: forget only what depended on it. */
  private changed(c: FileChange): void {
    if (c.path.endsWith(PROJECT_NOTE) || c.oldPath?.endsWith(PROJECT_NOTE)) queueMicrotask(() => void this.notifyCurrent());
    const isNote = (p: string | undefined) => !!p && p.toLowerCase().endsWith(".md");
    if (c.kind === "rename" && c.oldPath && !isNote(c.oldPath) && !isNote(c.path)) {
      // a folder moved: every path under it changed without its own event
      this.index = null;
      this.stale.clear();
      this.derivedCache.clear();
    } else if (isNote(c.path) || isNote(c.oldPath)) {
      for (const m of this.derivedCache.values()) {
        m.delete(c.path);
        if (c.oldPath) m.delete(c.oldPath);
      }
      if (this.index) {
        if (c.oldPath) this.index.delete(c.oldPath);
        if (c.kind === "delete") this.index.delete(c.path);
        else this.stale.add(c.path);
      }
    } else return;
    this.rootsCache = null;
    this.docsCache.clear();
  }

  async roots(): Promise<Project[]> {
    if (this.rootsCache) return this.rootsCache;
    const out: Project[] = [];
    for (const doc of (await this.ensureIndex()).values()) {
      const path = doc.path;
      if (path !== PROJECT_NOTE && !path.endsWith("/" + PROJECT_NOTE)) continue;
      const root = path === PROJECT_NOTE ? "" : path.slice(0, -PROJECT_NOTE.length - 1);
      const raw = fm.get(doc.fields, "longhand");
      const version = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
      if (version !== null && version > SPEC_VERSION && !this.warned.has(path)) {
        this.warned.add(path);
        this.host.notify(
          `${root || "This vault"} uses Longhand spec ${version}; this plugin reads ${SPEC_VERSION}. Fields it does not know are kept as they are.`,
        );
      }
      out.push({ root, notePath: path, title: doc.title ?? (root || "Vault"), version });
    }
    this.rootsCache = out.sort((a, b) => a.root.localeCompare(b.root));
    return this.rootsCache;
  }

  /** A value computed from one document, cached until that document changes. */
  async derived<T>(name: string, path: string, compute: (doc: Document) => T): Promise<T | null> {
    let m = this.derivedCache.get(name);
    if (!m) {
      m = new Map();
      this.derivedCache.set(name, m);
    }
    if (m.has(path)) return m.get(path) as T;
    const doc = await this.byPath(path);
    if (!doc) return null;
    const v = compute(doc);
    m.set(path, v);
    return v;
  }

  /** The document's word count, cached until it changes. */
  async wordsOf(path: string): Promise<number> {
    return (await this.derived("words", path, (d) => words(d.fields.body))) ?? 0;
  }

  /** The innermost project a path belongs to, or null. */
  async projectOf(path: string): Promise<Project | null> {
    let best: Project | null = null;
    for (const p of await this.roots()) {
      if (p.root === "" || path === p.root || path.startsWith(p.root + "/")) {
        if (!best || p.root.length > best.root.length) best = p;
      }
    }
    return best;
  }

  /** Every Markdown document under a project root, in binder order. */
  async documents(root: string): Promise<Document[]> {
    const cached = this.docsCache.get(root);
    if (cached) return cached;
    const index = await this.ensureIndex();
    const docs: Document[] = [];
    for (const doc of index.values()) {
      if (!inRoot(doc.path, root) || isHidden(doc.path, root)) continue;
      docs.push(doc);
    }
    docs.sort((a, b) => compareBinder(a, b, root));
    this.docsCache.set(root, docs);
    return docs;
  }

  async byId(id: string): Promise<Document | null> {
    for (const doc of (await this.ensureIndex()).values()) {
      if (doc.id === id) return doc;
    }
    return null;
  }

  async byPath(path: string): Promise<Document | null> {
    return (await this.ensureIndex()).get(path) ?? null;
  }

  private async ensureIndex(): Promise<Map<string, Document>> {
    if (this.index) {
      for (const path of this.stale) {
        try {
          this.index.set(path, this.spec.fromText(path, await this.host.readFile(path)));
        } catch {
          this.index.delete(path);
        }
      }
      this.stale.clear();
      return this.index;
    }
    const index = new Map<string, Document>();
    const files = this.host.listFiles();
    for (const path of files) {
      if (!path.toLowerCase().endsWith(".md")) continue;
      try {
        index.set(path, this.spec.fromText(path, await this.host.readFile(path)));
      } catch {
        // a file that vanished between listing and reading; skip it
      }
    }
    // a host that has not finished loading reports no files; do not remember that
    if (files.length > 0) this.index = index;
    return index;
  }
}

function inRoot(path: string, root: string): boolean {
  return root === "" || path.startsWith(root + "/");
}

function isHidden(path: string, root: string): boolean {
  const rel = root === "" ? path : path.slice(root.length + 1);
  const segs = rel.split("/");
  if (segs[segs.length - 1] === PROJECT_NOTE) return true;
  return segs.some((s) => HIDDEN_DIRS.has(s) || s.startsWith("."));
}

const PREFIX = /^(\d+)\s+/;

/** Binder order: per path segment, numeric prefix first, then `order`, then name. */
export function compareBinder(a: Document, b: Document, root: string): number {
  const sa = rel(a.path, root).split("/");
  const sb = rel(b.path, root).split("/");
  const n = Math.min(sa.length, sb.length);
  for (let i = 0; i < n; i++) {
    const x = sa[i] ?? "";
    const y = sb[i] ?? "";
    if (x === y) continue;
    const px = PREFIX.exec(x);
    const py = PREFIX.exec(y);
    if (px && py && Number(px[1]) !== Number(py[1])) return Number(px[1]) - Number(py[1]);
    if (px && !py) return -1;
    if (!px && py) return 1;
    const lastA = i === sa.length - 1;
    const lastB = i === sb.length - 1;
    if (lastA && lastB && a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
    return x.localeCompare(y, undefined, { numeric: true });
  }
  return sa.length - sb.length;
}

function rel(path: string, root: string): string {
  return root === "" ? path : path.slice(root.length + 1);
}
