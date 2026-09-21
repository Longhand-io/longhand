// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Appearances: where a note (a place, a character, anything) turns up in the manuscript.
// Never stored. A document appears when it links to the target, or, when the target note
// carries `match_names: true`, when its text contains the target's title or an alias as a
// whole word. Computed in binder order from the files, so it cannot go stale.

import * as fm from "./frontmatter.js";
import type { Core } from "./modules.js";
import type { Document } from "./spec.js";
import { stripPrefix } from "./naming.js";
import { baseName, resolveLinkText } from "./wikilink.js";

export interface Appearance {
  doc: Document;
  /** "Part One" or "Part One, Chapter Two": the folders between the project root and the file, prefixes stripped */
  chapter: string;
  /** the document title, numeric prefix stripped */
  title: string;
  /** the sentence around the first mention, plain text */
  sentence: string;
  /** range of the mention inside `sentence` */
  matchStart: number;
  matchEnd: number;
}

export interface Subject {
  path: string;
  title: string;
  kind: string;
  aliases: string[];
  matchNames: boolean;
  /** resolved vault paths of the subject note's `attachments` */
  attachments: string[];
}

const KIND: { [type: string]: string } = {
  setting: "Place",
  character: "Character",
  text: "Scene",
  folder: "Folder",
  map: "Map",
  event: "Event",
  pdf: "Research",
  image: "Image",
  web: "Web page",
  other: "Research",
};

export async function readSubject(core: Core, path: string): Promise<Subject> {
  const doc = await core.spec.read(path);
  const aliasesRaw = fm.get(doc.fields, "aliases");
  const aliases = Array.isArray(aliasesRaw) ? aliasesRaw.filter((a): a is string => typeof a === "string" && a.trim() !== "") : [];
  const attRaw = fm.get(doc.fields, "attachments");
  const attachments: string[] = [];
  if (Array.isArray(attRaw)) {
    for (const a of attRaw) {
      if (typeof a !== "string") continue;
      const resolved = resolveLinkText(core.host.resolveLink.bind(core.host), a, path);
      if (resolved) attachments.push(resolved);
    }
  }
  return {
    path,
    title: doc.title ?? stripPrefix(baseName(path)),
    kind: KIND[doc.type ?? ""] ?? "Note",
    aliases,
    matchNames: fm.get(doc.fields, "match_names") === true,
    attachments,
  };
}

/** Every document in the subject's project that mentions it, in binder order. */
export async function appearances(core: Core, subject: Subject): Promise<Appearance[]> {
  return scan(core, subject, subject.matchNames ? "as-configured" : "links-only");
}

/**
 * Documents that name the subject but do not count yet: name matches while matching is off,
 * with no link and no `places` entry. What an audit offers to attach.
 */
export async function candidates(core: Core, subject: Subject): Promise<Appearance[]> {
  const counted = new Set((await appearances(core, subject)).map((a) => a.doc.path));
  const byName = await scan(core, subject, "names-always");
  return byName.filter((a) => !counted.has(a.doc.path));
}

type Mode = "links-only" | "as-configured" | "names-always";

async function scan(core: Core, subject: Subject, mode: Mode): Promise<Appearance[]> {
  const project = await core.projects.projectOf(subject.path);
  const root = project ? project.root : "";
  const docs = await core.projects.documents(root);
  const useNames = mode === "names-always" || (mode === "as-configured" && subject.matchNames);
  const names = useNames ? [subject.title, ...subject.aliases].filter((n) => n.trim() !== "") : [];
  const nameRe = names.length ? wholeWord(names) : null;
  const out: Appearance[] = [];
  for (const doc of docs) {
    if (doc.path === subject.path) continue;
    if (doc.type && !(doc.type === "text" || doc.type === "folder")) continue;
    const flat = await flattened(core, doc);
    const plain = flat.plain;
    const links = flat.links.filter((l) => l.resolved === subject.path);
    let start = -1;
    let end = -1;
    let sentence: { text: string; start: number; end: number } | null = null;
    if (links.length > 0) {
      start = links[0]!.start;
      end = links[0]!.end;
    } else if (mode !== "names-always" && placesLinkTo(core, doc, subject.path)) {
      // set here by frontmatter: show the synopsis or the opening sentence, nothing to mark
      const synopsis = fm.get(doc.fields, "synopsis");
      const opening = typeof synopsis === "string" && synopsis.trim() ? synopsis.trim() : sentenceAround(plain, 0, 0).text;
      sentence = { text: opening, start: 0, end: 0 };
    } else if (nameRe) {
      const m = nameRe.exec(plain);
      if (m && m.index !== undefined) {
        start = m.index;
        end = m.index + m[0].length;
      }
    }
    if (!sentence && start < 0) continue;
    const s = sentence ?? sentenceAround(plain, start, end);
    out.push({
      doc,
      chapter: chapterOf(doc.path, root),
      title: doc.title ?? stripPrefix(baseName(doc.path)),
      sentence: s.text,
      matchStart: s.start,
      matchEnd: s.end,
    });
  }
  return out;
}

/** Does the document's `places` frontmatter link to the subject? */
export function placesLinkTo(core: Core, doc: Document, subjectPath: string): boolean {
  const places = fm.get(doc.fields, "places");
  if (!Array.isArray(places)) return false;
  return places.some((p) => typeof p === "string" && resolveLinkText(core.host.resolveLink.bind(core.host), p, doc.path) === subjectPath);
}

interface Flattened {
  plain: string;
  /** every wikilink in the body: where its display text sits in `plain` and the path it resolves to */
  links: { start: number; end: number; resolved: string | null }[];
}

const WIKILINK = /!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

/** A document's body as plain text with every link resolved, cached until the document changes. */
async function flattened(core: Core, doc: Document): Promise<Flattened> {
  return (await core.projects.derived("flat", doc.path, (d) => flatten(d.fields.body, d.path, core))) ?? { plain: "", links: [] };
}

/** Markdown to plain text with wikilinks shown as their display text, recording where each link resolves. */
export function flatten(body: string, from: string, core: Core): Flattened {
  let text = body
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/^>\s*\[![^\]]*\][^\n]*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]+\](?::.*)?/g, "")
    .replace(/\*\*|__|\*|~~/g, "");
  let plain = "";
  const links: Flattened["links"] = [];
  let last = 0;
  for (const m of text.matchAll(WIKILINK)) {
    const idx = m.index ?? 0;
    plain += text.slice(last, idx);
    const target = (m[1] ?? "").trim();
    const display = m[2] !== undefined && m[2] !== "" ? m[2] : baseName(target);
    links.push({ start: plain.length, end: plain.length + display.length, resolved: core.host.resolveLink(target, from) });
    plain += display;
    last = idx + m[0].length;
  }
  plain += text.slice(last);
  text = "";
  return { plain, links };
}

function wholeWord(names: string[]): RegExp {
  const alts = names
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, "iu");
}

/** The sentence containing [start, end) in `plain`, with the range re-based to the sentence. */
export function sentenceAround(plain: string, start: number, end: number): { text: string; start: number; end: number } {
  const boundary = /[.!?]["'”’)]*\s|\n/g;
  let sStart = 0;
  let sEnd = plain.length;
  for (const m of plain.matchAll(boundary)) {
    const cut = (m.index ?? 0) + m[0].length;
    if (cut <= start) sStart = cut;
    else {
      sEnd = (m.index ?? 0) + m[0].length - (m[0].endsWith("\n") ? 1 : 1);
      break;
    }
  }
  let text = plain.slice(sStart, sEnd);
  const lead = text.length - text.trimStart().length;
  text = text.trim();
  return { text, start: Math.max(0, start - sStart - lead), end: Math.max(0, end - sStart - lead) };
}

export { stripPrefix };

/** "Part One, Chapter Two" from the folders between the project root and the file. */
export function chapterOf(path: string, root: string): string {
  const rel = root === "" ? path : path.slice(root.length + 1);
  const segs = rel.split("/");
  segs.pop();
  if (segs.length > 1) segs.shift(); // the manuscript folder itself is not a chapter
  return segs.map(stripPrefix).join(", ");
}
