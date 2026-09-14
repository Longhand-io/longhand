// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The place card: what a pin shows on hover. The target's name and kind, its aliases, the
// images and notes pinned to it, a search box, and every scene set there with the sentence
// that names it. All computed from the files when the card opens; nothing is stored.

import { appearances, readSubject, type Appearance, type Subject } from "../../core/appearances.js";
import type { Core } from "../../core/modules.js";
import { baseName } from "../../core/wikilink.js";
import { isImagePath } from "./model.js";

export interface PlaceCard {
  el: HTMLElement;
  /** fills the card; safe to call again, it reuses the last result until `invalidate` */
  load(): Promise<void>;
  invalidate(): void;
}

export function createPlaceCard(core: Core, targetPath: string, label: string): PlaceCard {
  const el = document.createElement("div");
  el.className = "lh-map-card";
  el.hidden = true;

  const head = document.createElement("div");
  head.className = "lh-map-card-head";
  const name = document.createElement("a");
  name.className = "lh-map-card-name";
  name.textContent = label;
  name.href = "#";
  name.addEventListener("click", (ev) => {
    ev.preventDefault();
    void core.host.openNote(targetPath);
  });
  const meta = document.createElement("span");
  meta.className = "lh-map-card-meta";
  meta.textContent = "Reading the manuscript…";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search scenes set here";
  search.setAttribute("aria-label", `Search scenes set at ${label}`);
  head.append(name, meta, search);

  const strip = document.createElement("div");
  strip.className = "lh-map-card-attachments";
  const list = document.createElement("ul");
  list.className = "lh-map-card-scenes";
  const none = document.createElement("div");
  none.className = "lh-map-card-none";
  none.hidden = true;
  el.append(head, strip, list, none);

  // the card must not start a drag, add a pin, or scroll the stage
  for (const type of ["pointerdown", "dblclick", "contextmenu"]) {
    el.addEventListener(type, (ev) => ev.stopPropagation());
  }
  el.addEventListener("wheel", (ev) => ev.stopPropagation(), { passive: true });

  let subject: Subject | null = null;
  let scenes: Appearance[] | null = null;
  let loading: Promise<void> | null = null;

  const renderList = () => {
    if (!scenes) return;
    const q = search.value.trim().toLowerCase();
    list.replaceChildren();
    let n = 0;
    for (const sc of scenes) {
      const hay = `${sc.chapter} ${sc.title} ${sc.sentence}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      n++;
      const li = document.createElement("li");
      li.tabIndex = 0;
      li.setAttribute("role", "link");
      const ch = document.createElement("div");
      ch.className = "lh-map-card-chapter";
      ch.textContent = sc.chapter;
      const ti = document.createElement("div");
      ti.className = "lh-map-card-title";
      ti.textContent = sc.title;
      const ex = document.createElement("div");
      ex.className = "lh-map-card-excerpt";
      ex.append(document.createTextNode(sc.sentence.slice(0, sc.matchStart)));
      const mark = document.createElement("mark");
      mark.textContent = sc.sentence.slice(sc.matchStart, sc.matchEnd);
      ex.append(mark, document.createTextNode(sc.sentence.slice(sc.matchEnd)));
      li.append(ch, ti, ex);
      const open = () => void core.host.openNote(sc.doc.path);
      li.addEventListener("click", open);
      li.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") open();
      });
      list.appendChild(li);
    }
    none.textContent = scenes.length === 0 ? "No scene links here yet." : "No scene matches.";
    none.hidden = n > 0;
  };
  search.addEventListener("input", renderList);

  const renderHead = () => {
    if (!subject || !scenes) return;
    name.textContent = subject.title || label;
    const count = `${scenes.length} ${scenes.length === 1 ? "scene" : "scenes"}`;
    const also = subject.aliases.length ? `. Also “${subject.aliases.join("”, “")}”` : "";
    const hint = subject.matchNames ? "" : subject.aliases.length ? ". Name matching is off" : "";
    meta.textContent = `${subject.kind}, ${count}${also}${hint}`;
    strip.replaceChildren();
    strip.hidden = subject.attachments.length === 0;
    for (const att of subject.attachments) {
      const fig = document.createElement("figure");
      if (isImagePath(att)) {
        const img = document.createElement("img");
        img.src = core.host.resourceUrl(att);
        img.alt = baseName(att);
        img.draggable = false;
        fig.appendChild(img);
      } else {
        const tile = document.createElement("div");
        tile.className = "lh-map-card-note";
        tile.textContent = "note";
        fig.appendChild(tile);
      }
      const cap = document.createElement("figcaption");
      cap.textContent = baseName(att);
      fig.appendChild(cap);
      fig.addEventListener("click", () => void core.host.openNote(att));
      strip.appendChild(fig);
    }
  };

  const load = (): Promise<void> => {
    if (scenes) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      try {
        subject = await readSubject(core, targetPath);
        scenes = await appearances(core, subject);
        renderHead();
        renderList();
      } catch (err) {
        meta.textContent = `Could not read ${targetPath}`;
        console.error("[longhand] place card", err);
      } finally {
        loading = null;
      }
    })();
    return loading;
  };

  const invalidate = () => {
    subject = null;
    scenes = null;
    meta.textContent = "Reading the manuscript…";
  };

  return { el, load, invalidate };
}
