// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// What Nib notices on its own. The lesson from the Office Assistant: speak only on a strong
// signal, say something specific and true, say it once, and be easy to dismiss. Every nudge
// here is computed from the files for the view on screen; nothing is guessed.

import { appearances, readSubject } from "../../core/appearances.js";
import type { Core } from "../../core/modules.js";
import { baseName, parseWikilink } from "../../core/wikilink.js";
import { words, type Cite } from "./answers.js";

export interface Nudge {
  /** stable per fact, so it is shown once per session */
  key: string;
  text: string;
  cites: Cite[];
  /** a question that follows from the nudge, offered as the bubble's action */
  ask?: string;
}

export async function nudgesFor(core: Core, contextPath: string): Promise<Nudge[]> {
  const doc = await core.projects.byPath(contextPath);
  if (!doc) return [];
  if (doc.type === "map") return mapNudges(core, contextPath);
  if (doc.type === "text" || doc.type === null) return sceneNudges(core, contextPath);
  return [];
}

async function mapNudges(core: Core, path: string): Promise<Nudge[]> {
  const doc = await core.projects.byPath(path);
  if (!doc) return [];
  const note = core.spec.mapFromDocument(doc);
  const out: Nudge[] = [];
  const targets = new Map<string, string>(); // resolved path -> label as written
  const broken: string[] = [];
  const links = [...note.pins.map((p) => ({ to: p.to, label: p.label })), ...note.shapes.filter((s) => s.to).map((s) => ({ to: s.to!, label: s.label }))];
  for (const l of links) {
    const link = parseWikilink(l.to);
    const resolved = core.host.resolveLink(link ? link.target : l.to, path);
    if (!resolved) broken.push(l.label ?? (link ? link.target : l.to));
    else if (!targets.has(resolved)) targets.set(resolved, l.label ?? baseName(resolved).replace(/^\d+\s+/, ""));
  }
  if (broken.length) {
    out.push({
      key: `${path}:broken:${broken.join("|")}`,
      text: broken.length === 1 ? `A pin on this map points at a note that does not exist: ${broken[0]}.` : `${broken.length} pins on this map point at notes that do not exist: ${broken.join(", ")}.`,
      cites: [],
    });
  }
  const sceneless: Cite[] = [];
  for (const [target, label] of targets) {
    const t = await core.projects.byPath(target);
    if (!t || t.type === "text" || t.type === "folder") continue; // a pin straight to a scene is fine
    const subject = await readSubject(core, target);
    if ((await appearances(core, subject)).length === 0) sceneless.push({ label, path: target });
  }
  if (sceneless.length) {
    const first = sceneless[0]!;
    out.push({
      key: `${path}:sceneless:${sceneless.map((c) => c.path).join("|")}`,
      text:
        sceneless.length === 1
          ? `${first.label} is on this map but no scene is set there yet.`
          : `${sceneless.length} places on this map have no scene yet: ${sceneless.map((c) => c.label).join(", ")}.`,
      cites: sceneless,
      ask: sceneless.length === 1 ? `Which scenes mention ${first.label}?` : "Which places have no scene?",
    });
  }
  // places that carry scenes but are missing from this map
  const project = await core.projects.projectOf(path);
  const settings = (await core.projects.documents(project ? project.root : "")).filter((d) => d.type === "setting" && !targets.has(d.path));
  const missing: Cite[] = [];
  for (const s of settings) {
    const subject = await readSubject(core, s.path);
    const n = (await appearances(core, subject)).length;
    if (n > 0) missing.push({ label: subject.title, detail: `${n} ${n === 1 ? "scene" : "scenes"}`, path: s.path });
  }
  if (missing.length) {
    const first = missing[0]!;
    out.push({
      key: `${path}:missing:${missing.map((c) => c.path).join("|")}`,
      text:
        missing.length === 1
          ? `${first.label} has ${first.detail} and is not on this map.`
          : `${missing.length} places with scenes are not on this map: ${missing.map((c) => c.label).join(", ")}.`,
      cites: missing,
      ask: `Where is ${first.label} on the map?`,
    });
  }
  return out;
}

async function sceneNudges(core: Core, path: string): Promise<Nudge[]> {
  const doc = await core.projects.byPath(path);
  if (!doc) return [];
  const out: Nudge[] = [];
  const text = await core.host.readFile(path);
  if (words(text) === 0) {
    out.push({ key: `${path}:empty`, text: `${doc.title ?? baseName(path)} has no text yet.`, cites: [] });
  }
  return out;
}
