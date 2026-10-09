// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// What the inspector shows for one note, read from its frontmatter and its notes callout.
// Nothing here touches the DOM.

import * as fm from "../../core/frontmatter.js";
import type { Core } from "../../core/modules.js";
import { splitPrefix } from "../../core/naming.js";
import { splitNotes } from "../../core/notes.js";
import { listSnapshots, type Snapshot } from "../../core/snapshots.js";
import { isProse, typeLabel } from "../../core/spec.js";
import { words } from "../../core/text.js";

export interface Inspection {
  path: string;
  title: string;
  /** the note's kind as a writer names it: Scene, Folder, Character */
  kind: string;
  status: string | null;
  label: string | null;
  /** words of prose, the notes left out; null for a note that carries none */
  words: number | null;
  synopsis: string | null;
  notes: string | null;
  /** this note's snapshots, newest first; empty outside a project or without an id */
  snapshots: Snapshot[];
}

/** Everything the inspector shows for the note at `path`; null when it is not a note the vault has. */
export async function inspect(core: Core, path: string): Promise<Inspection | null> {
  const doc = await core.projects.byPath(path);
  if (!doc) return null;
  const base = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  const parts = splitNotes(doc.fields.body);
  const project = doc.id ? await core.projects.projectOf(path) : null;
  return {
    path,
    title: doc.title ?? splitPrefix(base).rest,
    kind: typeLabel(doc.type),
    status: str(fm.get(doc.fields, "status")),
    label: str(fm.get(doc.fields, "label")),
    words: isProse(doc) ? words(parts.text) : null,
    synopsis: str(fm.get(doc.fields, "synopsis")),
    notes: parts.notes || null,
    snapshots: project && doc.id ? listSnapshots(core.host.listFiles(), project.root, doc.id) : [],
  };
}

function str(v: fm.Value | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/** One line of a note as spans: `**bold**`, `*italic*`, and backslash escapes; everything else as written. */
export function spans(line: string): Span[] {
  const out: Span[] = [];
  const push = (text: string, style: { bold?: boolean; italic?: boolean } = {}) => {
    if (text === "") return;
    const last = out[out.length - 1];
    if (last && !!last.bold === !!style.bold && !!last.italic === !!style.italic) last.text += text;
    else out.push({ text, ...style });
  };
  const re = /\\(.)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let at = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    push(line.slice(at, m.index));
    if (m[1] !== undefined) push(m[1]);
    else if (m[2] !== undefined) push(unescape(m[2]), { bold: true });
    else if (m[3] !== undefined) push(unescape(m[3]), { italic: true });
    at = m.index + m[0].length;
  }
  push(line.slice(at));
  return out;
}

function unescape(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}
