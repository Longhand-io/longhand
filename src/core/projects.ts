// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The project registry. A project is any folder with a `_Project.md`. Documents are the
// Markdown files under it, in binder order: numeric prefix on each path segment, then the
// `order` field, then name. Ids come from frontmatter and are cached until the host reports
// a change.

import type { Host } from "../host/host.js";
import { SPEC_VERSION, Spec, type Document } from "./spec.js";

export const PROJECT_NOTE = "_Project.md";
const HIDDEN_DIRS = new Set(["_snapshots", "_attachments"]);

export interface Project {
  /** folder path without trailing slash; "" for the vault root */
  root: string;
  notePath: string;
  version: number | null;
}

export class Projects {
  private index: Map<string, Document> | null = null;
  private warned = new Set<string>();

  constructor(
    private readonly host: Host,
    private readonly spec: Spec,
  ) {
    host.onFileChanged(() => {
      this.index = null;
    });
  }

  async roots(): Promise<Project[]> {
    const out: Project[] = [];
    for (const path of this.host.listFiles()) {
      if (path !== PROJECT_NOTE && !path.endsWith("/" + PROJECT_NOTE)) continue;
      const root = path === PROJECT_NOTE ? "" : path.slice(0, -PROJECT_NOTE.length - 1);
      const version = this.spec.projectVersion(await this.host.readFile(path));
      if (version !== null && version > SPEC_VERSION && !this.warned.has(path)) {
        this.warned.add(path);
        this.host.notify(
          `${root || "This vault"} uses Longhand spec ${version}; this plugin reads ${SPEC_VERSION}. Fields it does not know are kept as they are.`,
        );
      }
      out.push({ root, notePath: path, version });
    }
    return out.sort((a, b) => a.root.localeCompare(b.root));
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
    const index = await this.ensureIndex();
    const docs: Document[] = [];
    for (const doc of index.values()) {
      if (!inRoot(doc.path, root) || isHidden(doc.path, root)) continue;
      docs.push(doc);
    }
    return docs.sort((a, b) => compareBinder(a, b, root));
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
    if (this.index) return this.index;
    const index = new Map<string, Document>();
    for (const path of this.host.listFiles()) {
      if (!path.toLowerCase().endsWith(".md")) continue;
      const text = await this.host.readFile(path);
      index.set(path, this.spec.fromText(path, text));
    }
    this.index = index;
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
