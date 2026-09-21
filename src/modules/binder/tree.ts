// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The binder's data: a project's documents as a tree in binder order, with word counts, and
// the plan for moving a sibling: renames when the folder is numbered, `order` fields when it
// is not. Nothing here touches the DOM.

import * as fm from "../../core/frontmatter.js";
import type { Core } from "../../core/modules.js";
import { safeName, splitPrefix } from "../../core/naming.js";
import type { Document } from "../../core/spec.js";

export interface Node {
  /** vault path of the file, or of the folder */
  path: string;
  name: string;
  /** the numeric prefix as written, "" when none */
  prefix: string;
  kind: "folder" | "doc";
  type: string | null;
  doc: Document | null;
  /** the folder's own note, when it has one, and its words */
  note: Document | null;
  noteWords: number;
  children: Node[];
  words: number;
  status: string | null;
  label: string | null;
}

export { splitPrefix };

/** Build the tree for a project root from its documents in binder order. */
export async function buildTree(core: Core, root: string): Promise<Node> {
  const docs = await core.projects.documents(root);
  const top: Node = { path: root, name: root, prefix: "", kind: "folder", type: null, doc: null, note: null, noteWords: 0, children: [], words: 0, status: null, label: null };
  const folders = new Map<string, Node>([[root, top]]);
  const folderFor = (path: string): Node => {
    const existing = folders.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf("/");
    const parent = folderFor(slash >= 0 ? path.slice(0, slash) : "");
    const base = slash >= 0 ? path.slice(slash + 1) : path;
    const { prefix, rest } = splitPrefix(base);
    const node: Node = { path, name: rest, prefix, kind: "folder", type: "folder", doc: null, note: null, noteWords: 0, children: [], words: 0, status: null, label: null };
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
    const count = doc.type === "text" || doc.type === null || doc.type === "folder" ? await core.projects.wordsOf(doc.path) : 0;
    const status = str(fm.get(doc.fields, "status"));
    const label = str(fm.get(doc.fields, "label"));
    if (base === folderBase && parent !== top) {
      // the folder's own note; its words are added in the roll-up below
      parent.note = doc;
      parent.noteWords = count;
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
      noteWords: 0,
      children: [],
      words: count,
      status,
      label,
    });
  }
  // documents() arrives in binder order and folders are created on first sight, so every
  // level is already ordered; this pass only rolls the word counts up
  const rollUp = (n: Node) => {
    if (n.kind !== "folder") return;
    for (const c of n.children) rollUp(c);
    n.words = n.children.reduce((sum, c) => sum + c.words, n.noteWords);
  };
  rollUp(top);
  return top;
}

function baseOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function str(v: fm.Value | undefined): string | null {
  return typeof v === "string" && v !== "" ? v : null;
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

