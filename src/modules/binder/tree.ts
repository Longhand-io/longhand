// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The binder's data: a project's documents as a tree in binder order, with word counts, and
// the plan for moving a sibling: renames when the folder is numbered, `order` fields when it
// is not. Nothing here touches the DOM.

import type { Core } from "../../core/modules.js";
import { nextName, safeName } from "../../core/naming.js";
import type { Document } from "../../core/spec.js";
import { words } from "../../core/text.js";

export interface Node {
  /** vault path of the file, or of the folder */
  path: string;
  name: string;
  /** the numeric prefix as written, "" when none */
  prefix: string;
  kind: "folder" | "doc";
  type: string | null;
  doc: Document | null;
  /** the folder's own note, when it has one */
  note: Document | null;
  children: Node[];
  words: number;
  status: string | null;
  label: string | null;
}

const PREFIX = /^(\d+)\s+/;

export function splitPrefix(name: string): { prefix: string; rest: string } {
  const m = PREFIX.exec(name);
  return m ? { prefix: m[1] ?? "", rest: name.slice(m[0].length) } : { prefix: "", rest: name };
}

/** Build the tree for a project root from its documents in binder order. */
export async function buildTree(core: Core, root: string): Promise<Node> {
  const docs = await core.projects.documents(root);
  const top: Node = { path: root, name: root, prefix: "", kind: "folder", type: null, doc: null, note: null, children: [], words: 0, status: null, label: null };
  const folders = new Map<string, Node>([[root, top]]);
  const folderFor = (path: string): Node => {
    const existing = folders.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf("/");
    const parent = folderFor(slash >= 0 ? path.slice(0, slash) : "");
    const base = slash >= 0 ? path.slice(slash + 1) : path;
    const { prefix, rest } = splitPrefix(base);
    const node: Node = { path, name: rest, prefix, kind: "folder", type: "folder", doc: null, note: null, children: [], words: 0, status: null, label: null };
    parent.children.push(node);
    folders.set(path, node);
    return node;
  };
  for (const doc of docs) {
    const slash = doc.path.lastIndexOf("/");
    const dir = slash >= 0 ? doc.path.slice(0, slash) : "";
    const base = (slash >= 0 ? doc.path.slice(slash + 1) : doc.path).replace(/\.md$/i, "");
    const parent = folderFor(dir);
    const { prefix, rest } = splitPrefix(base);
    const folderBase = dir.slice(dir.lastIndexOf("/") + 1);
    const count = doc.type === "text" || doc.type === null || doc.type === "folder" ? words(await core.host.readFile(doc.path)) : 0;
    const status = fieldStr(doc, "status");
    const label = fieldStr(doc, "label");
    if (base === folderBase && parent !== top) {
      // the folder's own note
      parent.note = doc;
      parent.words += count;
      parent.status = status;
      parent.label = label;
      continue;
    }
    parent.children.push({
      path: doc.path,
      name: doc.title ?? rest,
      prefix,
      kind: "doc",
      type: doc.type,
      doc,
      note: null,
      children: [],
      words: count,
      status,
      label,
    });
  }
  // documents() is in binder order but folders were created on first sight; re-sort every level
  const sortLevel = (n: Node) => {
    if (n.kind !== "folder") return;
    n.children.sort((a, b) => compareNames(a, b));
    for (const c of n.children) sortLevel(c);
    n.words = n.children.reduce((sum, c) => sum + c.words, n.note ? words(n.note.fields.body) : 0);
  };
  sortLevel(top);
  return top;
}

function compareNames(a: Node, b: Node): number {
  const pa = a.prefix ? Number(a.prefix) : null;
  const pb = b.prefix ? Number(b.prefix) : null;
  if (pa !== null && pb !== null && pa !== pb) return pa - pb;
  if (pa !== null && pb === null) return -1;
  if (pa === null && pb !== null) return 1;
  const oa = a.doc?.order ?? null;
  const ob = b.doc?.order ?? null;
  if (oa !== null && ob !== null && oa !== ob) return oa - ob;
  return baseOf(a.path).localeCompare(baseOf(b.path), undefined, { numeric: true });
}

function baseOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function fieldStr(doc: Document, key: string): string | null {
  const e = doc.fields.entries.find((x) => x.key === key);
  if (!e) return null;
  const line = e.lines[0] ?? "";
  const m = /:\s*"?([^"]*)"?\s*$/.exec(line);
  return m && m[1] ? m[1] : null;
}

export interface Move {
  /** file or folder renames, old path to new path, applied in this order */
  renames: [string, string][];
  /** `order` fields to write, path to value, when the folder is not numbered */
  orders: [string, number][];
}

/**
 * Move a sibling from one position to another. When the siblings carry numeric prefixes the
 * ones whose position changes are renamed; otherwise every sibling gets an `order`.
 */
export function planMove(siblings: Node[], from: number, to: number): Move {
  const next = siblings.slice();
  const [moved] = next.splice(from, 1);
  if (!moved) return { renames: [], orders: [] };
  next.splice(to > from ? to - 1 : to, 0, moved);
  const numbered = siblings.some((s) => s.prefix !== "");
  if (!numbered) {
    return { renames: [], orders: next.map((n, i) => [n.path, i + 1]) };
  }
  const width = Math.max(2, ...siblings.map((s) => s.prefix.length));
  const renames: [string, string][] = [];
  next.forEach((n, i) => {
    const wanted = String(i + 1).padStart(width, "0");
    if (n.prefix === wanted) return;
    const dir = n.path.slice(0, n.path.lastIndexOf("/") + 1);
    const base = baseOf(n.path);
    const ext = n.kind === "doc" && base.toLowerCase().endsWith(".md") ? ".md" : "";
    const rest = splitPrefix(base.slice(0, base.length - ext.length)).rest;
    renames.push([n.path, `${dir}${wanted} ${rest}${ext}`]);
  });
  return { renames, orders: [] };
}

/** Apply a move: renames through the host, which keeps links intact; orders through the spec. */
export async function applyMove(core: Core, move: Move): Promise<void> {
  // two-step renames avoid a clash when 02 and 03 swap
  const temp: [string, string][] = [];
  for (const [from, to] of move.renames) {
    const dir = from.slice(0, from.lastIndexOf("/") + 1);
    const tmp = `${dir}~${safeName(baseOf(to))}`;
    await core.host.renameFile(from, tmp);
    temp.push([tmp, to]);
  }
  for (const [tmp, to] of temp) await core.host.renameFile(tmp, to);
  for (const [path, n] of move.orders) await core.spec.setField(path, "order", n);
}

export { nextName };
