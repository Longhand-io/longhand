// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Nib's retrieval answers: the questions that need lookup, not reading. Everything here is
// computed from the files through the core, with no model and no network. The hosted Nib
// answers the rest behind the same panel later. Voice rules: second person, brief, names the
// file or scene it means, never praises the writing, one joke ever.

import { appearances, candidates, placesLinkTo, readSubject, type Appearance } from "../../core/appearances.js";
import * as fm from "../../core/frontmatter.js";
import type { Core } from "../../core/modules.js";
import type { Document } from "../../core/spec.js";
import { stripPrefix } from "../../core/naming.js";
import { formatCount, words } from "../../core/text.js";
import { baseName, resolveLinkText } from "../../core/wikilink.js";

export interface Cite {
  label: string;
  detail?: string;
  path: string;
}

/** Something Nib offers to do. Every action is one frontmatter edit the writer can see and undo. */
export interface Action {
  label: string;
  kind: "set-place" | "match-names";
  /** the setting or character note */
  subject: string;
  /** the scene, for set-place */
  scene?: string;
}

export interface Answer {
  text: string;
  cites: Cite[];
  actions?: Action[];
  /** what kind of question this was, for tests and for the suggestion chips */
  kind: "last-seen" | "set-at" | "unused" | "who-in" | "length" | "on-map" | "audit" | "open" | "help";
}

/** Where Nib is looking: the active note's project, the whole vault, or nowhere yet. */
export interface Scope {
  kind: "project" | "vault" | "none";
  root: string;
  title: string;
}

/** A project the writer chose by hand, which wins until a note in another project opens. */
let chosenRoot: string | null = null;

export function chooseScope(root: string | null): void {
  chosenRoot = root;
}

export async function scopeOf(core: Core, path: string | null = core.host.activeFile()): Promise<Scope> {
  const project = path ? await core.projects.projectOf(path) : null;
  if (project && chosenRoot !== null && project.root !== chosenRoot) chosenRoot = null;
  const root = chosenRoot ?? project?.root ?? null;
  if (root !== null) {
    const p = (await core.projects.roots()).find((r) => r.root === root);
    if (p) {
      const note = await core.spec.read(p.notePath);
      return { kind: "project", root: p.root, title: note.title ?? (p.root || "this vault") };
    }
  }
  if (!path) return { kind: "none", root: "", title: "" };
  return { kind: "vault", root: "", title: "the whole vault" };
}

/** Every project with its title, for offering one to open. */
export async function projectsToOpen(core: Core): Promise<{ title: string; notePath: string; root: string }[]> {
  const out: { title: string; notePath: string; root: string }[] = [];
  for (const p of await core.projects.roots()) {
    const note = await core.spec.read(p.notePath);
    out.push({ title: note.title ?? (p.root || "Vault"), notePath: p.notePath, root: p.root });
  }
  return out;
}

let jokeTold = false;

/** Test hook: forget the joke was told. */
export function resetJoke(): void {
  jokeTold = false;
}

export async function ask(core: Core, question: string): Promise<Answer> {
  const q = question.trim().replace(/[?.!]+$/, "");
  let m: RegExpExecArray | null;

  if ((m = /^(?:open|go\s+to|show\s+me)\s+(.+)$/i.exec(q))) {
    return open(core, m[1] ?? "");
  }

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
  if ((m = /^(?:which|what)\s+scenes\s+(?:mention|name|could\s+be\s+(?:set\s+)?at|might\s+be\s+(?:set\s+)?at)\s+(.+)$/i.exec(q)) || (m = /^(?:audit|find\s+scenes\s+(?:that\s+)?mention(?:ing)?)\s+(.+)$/i.exec(q))) {
    return audit(core, m[1] ?? "");
  }
  if ((m = /^how\s+(?:long|many\s+words)\s+(?:is|are|in)?\s*(.+)$/i.exec(q)) || (m = /^word\s*count(?:\s+(?:of|for))?\s+(.+)$/i.exec(q))) {
    return length(core, m[1] ?? "");
  }
  return help();
}

// ---- the answers ----

/** Open a project by title, or a note by name. The way in when nothing is open. */
async function open(core: Core, name: string): Promise<Answer> {
  const n = name.trim().toLowerCase().replace(/^(?:the\s+)/, "");
  for (const p of await projectsToOpen(core)) {
    if (p.title.toLowerCase() === n || p.root.toLowerCase() === n) {
      await core.host.openNote(p.notePath);
      return { kind: "open", text: `${p.title} is open. Ask me about it.`, cites: [{ label: p.title, path: p.notePath }] };
    }
  }
  const doc = await findNote(core, name);
  if (doc) {
    await core.host.openNote(doc.path);
    return { kind: "open", text: `${doc.title ?? stripPrefix(baseName(doc.path))} is open.`, cites: [cite(doc)] };
  }
  const projects = await projectsToOpen(core);
  return {
    kind: "open",
    text: projects.length ? `I cannot find “${name.trim()}”. The projects here are ${projects.map((p) => p.title).join(", ")}.` : `I cannot find “${name.trim()}”, and there is no project here yet: a folder with a _Project.md note.`,
    cites: projects.map((p) => ({ label: p.title, path: p.notePath })),
  };
}

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
  const title = scene.title ?? stripPrefix(baseName(scene.path));
  if (present.length === 0) {
    return { kind: "who-in", text: `No character note is linked from or named in ${title}. ${people.length === 0 ? "There are no character notes yet." : ""}`.trim(), cites: [cite(scene)] };
  }
  return { kind: "who-in", text: `${present.map((c) => c.label).join(", ")} ${present.length === 1 ? "is" : "are"} in ${title}.`, cites: present };
}

/** The audit: scenes that name a place but do not count yet, each with a one-click way to attach it. */
async function audit(core: Core, name: string): Promise<Answer> {
  const doc = await findNote(core, name);
  if (!doc) return unknown(name);
  const subject = await readSubject(core, doc.path);
  const have = await appearances(core, subject);
  const could = await candidates(core, subject);
  const title = subject.title;
  if (could.length === 0) {
    const text = have.length
      ? `Every scene that names ${title} already counts: ${have.length} ${have.length === 1 ? "scene" : "scenes"}. No others mention it by name.`
      : `No scene names ${title}${subject.aliases.length ? ` or “${subject.aliases.join("”, “")}”` : ""}. Nothing to attach; write the scene, or add an alias the manuscript uses.`;
    return { kind: "audit", text, cites: have.map(citeAppearance) };
  }
  const actions: Action[] = could.map((a) => ({ label: `Set ${a.title} at ${title}`, kind: "set-place", subject: doc.path, scene: a.doc.path }));
  if (!subject.matchNames) actions.push({ label: `Count every mention of ${title} from now on`, kind: "match-names", subject: doc.path });
  return {
    kind: "audit",
    text: `${could.length} ${could.length === 1 ? "scene names" : "scenes name"} ${title} without counting${have.length ? ` (${have.length} already ${have.length === 1 ? "does" : "do"})` : ""}. Pick the ones that are set there, or count every mention.`,
    cites: could.map(citeAppearance),
    actions,
  };
}

/** Carry out an action. Returns what Nib says afterwards. Every change is a frontmatter edit. */
export async function perform(core: Core, action: Action): Promise<string> {
  const subject = await core.projects.byPath(action.subject);
  const subjectTitle = subject?.title ?? stripPrefix(baseName(action.subject));
  if (action.kind === "match-names") {
    await core.spec.setField(action.subject, "match_names", true);
    return `Name matching is on for ${subjectTitle}. Every scene that names it counts now. It is one line in that note's frontmatter.`;
  }
  if (!action.scene) return "Nothing to do.";
  const scene = await core.projects.byPath(action.scene);
  if (!scene) return `I cannot find ${action.scene} any more.`;
  if (placesLinkTo(core, scene, action.subject)) return `${scene.title ?? stripPrefix(baseName(scene.path))} is already set at ${subjectTitle}.`;
  const existing = fm.get(scene.fields, "places");
  const list = Array.isArray(existing) ? existing.filter((p): p is string => typeof p === "string") : [];
  list.push(core.host.linkTo(action.subject, scene.path));
  await core.spec.setField(action.scene, "places", list);
  return `${scene.title ?? stripPrefix(baseName(scene.path))} is set at ${subjectTitle}: a places entry in its frontmatter, nothing in the prose.`;
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
    return { kind: "length", text: `${formatCount(total)} words across ${n} documents.`, cites: [] };
  }
  const doc = await findNote(core, what);
  if (doc) {
    const n = words(await core.host.readFile(doc.path));
    return { kind: "length", text: `${doc.title ?? stripPrefix(baseName(doc.path))} is ${formatCount(n)} words.`, cites: [cite(doc)] };
  }
  // a folder?
  const folder = docs.filter((d) => isText(d) && d.path.toLowerCase().split("/").some((seg) => stripPrefix(seg) === w));
  if (folder.length) {
    let total = 0;
    for (const d of folder) total += words(await core.host.readFile(d.path));
    return { kind: "length", text: `${what.trim()} is ${formatCount(total)} words across ${folder.length} documents.`, cites: [] };
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
    const resolves = (link: string) => resolveLinkText(core.host.resolveLink.bind(core.host), link, mdoc.path) === doc.path;
    const pins = note.pins.filter((p) => resolves(p.to)).length;
    const shapes = note.shapes.filter((s) => s.to && resolves(s.to)).length;
    if (pins + shapes > 0) {
      const parts = [];
      if (pins) parts.push(`${pins} ${pins === 1 ? "pin" : "pins"}`);
      if (shapes) parts.push(`${shapes} ${shapes === 1 ? "shape" : "shapes"}`);
      hits.push({ label: note.title ?? stripPrefix(baseName(mdoc.path)), detail: parts.join(", "), path: mdoc.path });
    }
  }
  const title = doc.title ?? stripPrefix(baseName(doc.path));
  if (hits.length === 0) return { kind: "on-map", text: `${title} is not on any map in this project.${maps.length ? "" : " There are no maps yet."}`, cites: [cite(doc)] };
  return { kind: "on-map", text: `${title} is on ${hits.map((h) => h.label).join(" and ")}.`, cites: hits };
}

function help(): Answer {
  const lines = [
    "I answer from your files. Ask me:",
    "where was Mara last seen",
    "what is set at Stillwater",
    "which scenes mention Harrow Wood",
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

/** The active note's project, else the whole vault. Nib never silently picks a project. */
async function scopeRoot(core: Core): Promise<string> {
  return (await scopeOf(core)).root;
}

/** A note by title, alias, or file name, case-insensitively; exact matches first, then a contains match. */
export async function findNote(core: Core, name: string): Promise<Document | null> {
  const norm = (s: string) => s.trim().toLowerCase().replace(/^(?:the\s+)/, "");
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

export { words };

