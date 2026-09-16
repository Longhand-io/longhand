// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Nib's retrieval answers: the questions that need lookup, not reading. Everything here is
// computed from the files through the core, with no model and no network. The hosted Nib
// answers the rest behind the same panel later. Voice rules: second person, brief, names the
// file or scene it means, never praises the writing, one joke ever.

import { appearances, readSubject, type Appearance } from "../../core/appearances.js";
import * as fm from "../../core/frontmatter.js";
import type { Core } from "../../core/modules.js";
import type { Document } from "../../core/spec.js";
import { baseName, parseWikilink } from "../../core/wikilink.js";

export interface Cite {
  label: string;
  detail?: string;
  path: string;
  /** open as a map rather than as text */
  map?: boolean;
}

export interface Answer {
  text: string;
  cites: Cite[];
  /** what kind of question this was, for tests and for the suggestion chips */
  kind: "last-seen" | "set-at" | "unused" | "who-in" | "length" | "on-map" | "help";
}

let jokeTold = false;

/** Test hook: forget the joke was told. */
export function resetJoke(): void {
  jokeTold = false;
}

export async function ask(core: Core, question: string): Promise<Answer> {
  const q = question.trim().replace(/[?.!]+$/, "");
  let m: RegExpExecArray | null;

  if ((m = /^(?:where|when)\s+(?:was|is|were|are)\s+(.+?)\s+last(?:\s+seen)?$/i.exec(q)) || (m = /^last\s+seen[:\s]+(.+)$/i.exec(q)) || (m = /^where(?:'s|\s+is|\s+was)\s+(.+?)(?:\s+now)?$/i.exec(q))) {
    if (!/\bon\s+(?:the|a)\s+map$/i.test(q)) return lastSeen(core, m[1] ?? "");
  }
  if ((m = /^where(?:'s|\s+is)\s+(.+?)\s+on\s+(?:the|a)\s+map$/i.exec(q)) || (m = /^(?:is\s+)?(.+?)\s+(?:pinned|on\s+the\s+map)$/i.exec(q))) {
    return onMap(core, m[1] ?? "");
  }
  if ((m = /^(?:what(?:'s|\s+is)\s+set\s+(?:at|in)|what\s+happens\s+(?:at|in)|(?:which|what)\s+scenes\s+(?:are\s+)?(?:at|in|set\s+(?:at|in))|scenes\s+(?:at|in))\s+(.+)$/i.exec(q))) {
    return setAt(core, m[1] ?? "");
  }
  if (/^(?:which|what)\s+(?:places|settings|locations)\s+(?:have|has|with)\s+no\s+scenes?$/i.test(q) || /^unused\s+(?:places|settings)$/i.test(q)) {
    return unused(core, "setting");
  }
  if (/^(?:which|what|who)\s+(?:characters|people)\s+(?:have|has|with)\s+no\s+scenes?$/i.test(q) || /^unused\s+(?:characters|people)$/i.test(q)) {
    return unused(core, "character");
  }
  if ((m = /^who(?:'s|\s+is|\s+appears|\s+was)\s+in\s+(.+)$/i.exec(q))) {
    return whoIn(core, m[1] ?? "");
  }
  if ((m = /^how\s+(?:long|many\s+words)\s+(?:is|are|in)?\s*(.+)$/i.exec(q)) || (m = /^word\s*count(?:\s+(?:of|for))?\s+(.+)$/i.exec(q))) {
    return length(core, m[1] ?? "");
  }
  return help();
}

// ---- the answers ----

async function lastSeen(core: Core, name: string): Promise<Answer> {
  const doc = await findNote(core, name);
  if (!doc) return unknown(name);
  const subject = await readSubject(core, doc.path);
  const found = await appearances(core, subject);
  const last = found[found.length - 1];
  if (!last) {
    const hint = subject.matchNames ? "Nothing links to it and no scene names it." : "Nothing links to it. Name matching is off on that note.";
    return { kind: "last-seen", text: `${subject.title} does not appear in the manuscript. ${hint}`, cites: [cite(doc)] };
  }
  const where = last.chapter ? `${last.chapter}, ${last.title}` : last.title;
  return {
    kind: "last-seen",
    text: `${subject.title} was last in ${where}: “${last.sentence}”${found.length > 1 ? ` That is the last of ${found.length} scenes.` : ""}`,
    cites: found
      .slice(-3)
      .reverse()
      .map((a) => citeAppearance(a)),
  };
}

async function setAt(core: Core, name: string): Promise<Answer> {
  const doc = await findNote(core, name);
  if (!doc) return unknown(name);
  const subject = await readSubject(core, doc.path);
  const found = await appearances(core, subject);
  if (found.length === 0) {
    return { kind: "set-at", text: `No scene is set at ${subject.title} yet. ${subject.matchNames ? "" : "Link a scene to it, or turn on name matching on the note."}`.trim(), cites: [cite(doc)] };
  }
  return {
    kind: "set-at",
    text: `${found.length} ${found.length === 1 ? "scene mentions" : "scenes mention"} ${subject.title}, in order.`,
    cites: found.map((a) => citeAppearance(a)),
  };
}

async function unused(core: Core, type: "setting" | "character"): Promise<Answer> {
  const root = await scopeRoot(core);
  const docs = (await core.projects.documents(root)).filter((d) => d.type === type);
  const noun = type === "setting" ? "places" : "characters";
  if (docs.length === 0) return { kind: "unused", text: `There are no ${type} notes in this project yet.`, cites: [] };
  const empty: Document[] = [];
  for (const d of docs) {
    const subject = await readSubject(core, d.path);
    if ((await appearances(core, subject)).length === 0) empty.push(d);
  }
  if (empty.length === 0) return { kind: "unused", text: `Every one of the ${docs.length} ${noun} has at least one scene.`, cites: [] };
  return {
    kind: "unused",
    text: `${empty.length} of ${docs.length} ${noun} ${empty.length === 1 ? "has" : "have"} no scene: nothing links to ${empty.length === 1 ? "it" : "them"} and no scene names ${empty.length === 1 ? "it" : "them"}.`,
    cites: empty.map((d) => cite(d)),
  };
}

async function whoIn(core: Core, name: string): Promise<Answer> {
  const scene = await findNote(core, name);
  if (!scene) return unknown(name);
  const root = await scopeRoot(core);
  const people = (await core.projects.documents(root)).filter((d) => d.type === "character");
  const present: Cite[] = [];
  for (const p of people) {
    const subject = await readSubject(core, p.path);
    const hit = (await appearances(core, subject)).find((a) => a.doc.path === scene.path);
    if (hit) present.push({ label: subject.title, detail: `“${hit.sentence}”`, path: p.path });
  }
  const title = scene.title ?? baseName(scene.path);
  if (present.length === 0) {
    return { kind: "who-in", text: `No character note is linked from or named in ${title}. ${people.length === 0 ? "There are no character notes yet." : ""}`.trim(), cites: [cite(scene)] };
  }
  return { kind: "who-in", text: `${present.map((c) => c.label).join(", ")} ${present.length === 1 ? "is" : "are"} in ${title}.`, cites: present };
}

async function length(core: Core, what: string): Promise<Answer> {
  const root = await scopeRoot(core);
  const w = what.trim().toLowerCase();
  const docs = await core.projects.documents(root);
  const isText = (d: Document) => d.type === "text" || d.type === "folder" || d.type === null;
  if (/^(?:the\s+)?(?:manuscript|book|novel|project|draft|whole thing|everything)$/.test(w)) {
    let total = 0;
    let n = 0;
    for (const d of docs) {
      if (!isText(d)) continue;
      total += words(await core.host.readFile(d.path));
      n++;
    }
    return { kind: "length", text: `${fmt(total)} words across ${n} documents.`, cites: [] };
  }
  const doc = await findNote(core, what);
  if (doc) {
    const n = words(await core.host.readFile(doc.path));
    return { kind: "length", text: `${doc.title ?? baseName(doc.path)} is ${fmt(n)} words.`, cites: [cite(doc)] };
  }
  // a folder?
  const folder = docs.filter((d) => isText(d) && d.path.toLowerCase().split("/").some((seg) => seg.replace(/^\d+\s+/, "") === w));
  if (folder.length) {
    let total = 0;
    for (const d of folder) total += words(await core.host.readFile(d.path));
    return { kind: "length", text: `${what.trim()} is ${fmt(total)} words across ${folder.length} documents.`, cites: [] };
  }
  return unknown(what);
}

async function onMap(core: Core, name: string): Promise<Answer> {
  const doc = await findNote(core, name);
  if (!doc) return unknown(name);
  const root = await scopeRoot(core);
  const maps = (await core.projects.documents(root)).filter((d) => d.type === "map");
  const hits: Cite[] = [];
  for (const mdoc of maps) {
    const note = core.spec.mapFromDocument(mdoc);
    const resolves = (link: string) => {
      const l = parseWikilink(link);
      return core.host.resolveLink(l ? l.target : link, mdoc.path) === doc.path;
    };
    const pins = note.pins.filter((p) => resolves(p.to)).length;
    const shapes = note.shapes.filter((s) => s.to && resolves(s.to)).length;
    if (pins + shapes > 0) {
      const parts = [];
      if (pins) parts.push(`${pins} ${pins === 1 ? "pin" : "pins"}`);
      if (shapes) parts.push(`${shapes} ${shapes === 1 ? "shape" : "shapes"}`);
      hits.push({ label: note.title ?? baseName(mdoc.path), detail: parts.join(", "), path: mdoc.path, map: true });
    }
  }
  const title = doc.title ?? baseName(doc.path);
  if (hits.length === 0) return { kind: "on-map", text: `${title} is not on any map in this project.${maps.length ? "" : " There are no maps yet."}`, cites: [cite(doc)] };
  return { kind: "on-map", text: `${title} is on ${hits.map((h) => h.label).join(" and ")}.`, cites: hits };
}

function help(): Answer {
  const lines = [
    "I answer from your files. Ask me:",
    "where was Mara last seen",
    "what is set at Stillwater",
    "who is in 03 Winter Fair",
    "which places have no scene",
    "how long is Part One",
    "where is the house on the map",
    "Reading the prose itself is the hosted Nib, which is off.",
  ];
  let text = lines.join("\n");
  if (!jokeTold) {
    jokeTold = true;
    text += "\nIt looks like you're writing a novel. Would you like help with that? That was the one joke. It will not happen again.";
  }
  return { kind: "help", text, cites: [] };
}

function unknown(name: string): Answer {
  return { kind: "help", text: `I cannot find a note called “${name.trim()}”. Titles, aliases, and file names all work.`, cites: [] };
}

// ---- helpers ----

async function scopeRoot(core: Core): Promise<string> {
  const active = core.host.activeFile();
  const project = active ? await core.projects.projectOf(active) : null;
  if (project) return project.root;
  const roots = await core.projects.roots();
  return roots[0]?.root ?? "";
}

/** A note by title, alias, or file name, case-insensitively; exact matches first, then a contains match. */
export async function findNote(core: Core, name: string): Promise<Document | null> {
  const norm = (s: string) => s.trim().toLowerCase().replace(/^\d+\s+/, "").replace(/^(?:the\s+)/, "");
  const n = norm(name);
  if (!n) return null;
  const root = await scopeRoot(core);
  const docs = await core.projects.documents(root);
  const titleOf = (d: Document) => norm(d.title ?? baseName(d.path));
  let best = docs.find((d) => titleOf(d) === n || norm(baseName(d.path)) === n);
  if (best) return best;
  for (const d of docs) {
    const aliases = fm.get(d.fields, "aliases");
    if (Array.isArray(aliases) && aliases.some((a) => typeof a === "string" && norm(a) === n)) return d;
  }
  best = docs.find((d) => titleOf(d).includes(n));
  return best ?? null;
}

function cite(d: Document): Cite {
  return { label: d.title ?? baseName(d.path), path: d.path };
}

function citeAppearance(a: Appearance): Cite {
  return { label: a.title, detail: `${a.chapter ? a.chapter + " · " : ""}“${a.sentence}”`, path: a.doc.path };
}

export function words(text: string): number {
  const body = fm.parse(text).body;
  const plain = body
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, t: string, a?: string) => a ?? t)
    .replace(/[#>*_`~]/g, " ");
  const m = plain.match(/[\p{L}\p{N}'’-]+/gu);
  return m ? m.length : 0;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
