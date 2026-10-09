// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Snapshots in the files store: one full copy of a document per snapshot, under the
// project's _snapshots folder, in a folder named by the document's id so the copies follow
// the document through renames. The spec fixes the layout; this is its reader and writer.

import type { Core } from "./modules.js";
import { safeName } from "./naming.js";

export const SNAPSHOTS_DIR = "_snapshots";

export interface Snapshot {
  /** vault path of the copy */
  path: string;
  /** when it was taken, from the file name */
  when: Date;
  title: string;
}

/** `YYYY-MM-DDTHH-MM-SSZ`, UTC, so names sort in time order on every filesystem. */
export function stamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace(/:/g, "-") + "Z";
}

const NAME = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z (.*)\.md$/;

/** Where a snapshot of the document with `id` goes, under the project at `root`. */
export function snapshotPath(root: string, id: string, when: Date, title: string): string {
  const dir = root === "" ? SNAPSHOTS_DIR : `${root}/${SNAPSHOTS_DIR}`;
  return `${dir}/${id}/${stamp(when)} ${safeName(title)}.md`;
}

/** The snapshots of the document with `id` under `root`, newest first. */
export function listSnapshots(files: string[], root: string, id: string): Snapshot[] {
  const dir = (root === "" ? SNAPSHOTS_DIR : `${root}/${SNAPSHOTS_DIR}`) + `/${id}/`;
  const out: Snapshot[] = [];
  for (const path of files) {
    if (!path.startsWith(dir)) continue;
    const m = NAME.exec(path.slice(dir.length));
    if (!m) continue;
    out.push({ path, when: new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`), title: m[5] ?? "" });
  }
  return out.sort((a, b) => b.when.getTime() - a.when.getTime());
}

export type TakeResult = { ok: true; path: string } | { ok: false; reason: "no-note" | "no-id" | "no-project" };

/** Copy the note at `path` as it is on disk into the project's snapshot store. */
export async function takeSnapshot(core: Core, path: string, title: string, when = new Date()): Promise<TakeResult> {
  const doc = await core.projects.byPath(path);
  if (!doc) return { ok: false, reason: "no-note" };
  if (!doc.id) return { ok: false, reason: "no-id" };
  const project = await core.projects.projectOf(path);
  if (!project) return { ok: false, reason: "no-project" };
  const text = await core.host.readFile(path, true);
  const to = snapshotPath(project.root, doc.id, when, title);
  await core.host.writeFile(to, text);
  return { ok: true, path: to };
}
