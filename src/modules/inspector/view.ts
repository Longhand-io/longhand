// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The inspector view: the note you are in, seen from the side. Its title, kind, status,
// label, and words, then the synopsis, the document notes, and the note's snapshots, in the
// right sidebar while the text stays in the editor. It reads; the note is changed in the editor.

import type { Core } from "../../core/modules.js";
import type { ViewHandle } from "../../host/host.js";
import { formatCount } from "../../core/text.js";
import { inspect, spans, type Inspection } from "./model.js";

export const INSPECTOR_VIEW_TYPE = "longhand-inspector";

const isNote = (path: string | null): path is string => !!path && path.toLowerCase().endsWith(".md");

export function mountInspectorView(core: Core, el: HTMLElement): ViewHandle {
  const root = document.createElement("div");
  root.className = "lh-root lh-inspector";
  el.appendChild(root);

  // the sidebar taking focus is not a change of note, so the last note stays on show
  let path: string | null = isNote(core.host.activeFile()) ? core.host.activeFile() : null;
  let disposed = false;
  /** renders overlap when the note changes while one is reading; only the latest may draw */
  let turn = 0;

  const render = async () => {
    if (disposed) return;
    const mine = ++turn;
    const shown = path ? await inspect(core, path) : null;
    if (disposed || mine !== turn) return;
    root.replaceChildren();
    if (!shown) {
      root.appendChild(para("lh-inspector-empty", "Open a note and its synopsis and notes show here."));
      return;
    }
    root.append(head(shown), section("Synopsis", shown.synopsis, "No synopsis yet. It is the synopsis field at the top of the note."));
    root.append(section("Notes", shown.notes, "No notes yet. They live in a callout titled Notes at the end of the note."));
    root.append(snapshots(shown));
  };

  const snapshots = (shown: Inspection): HTMLElement => {
    const box = document.createElement("div");
    box.className = "lh-inspector-section";
    const h = document.createElement("div");
    h.className = "lh-inspector-heading";
    h.textContent = "Snapshots";
    box.appendChild(h);
    if (shown.snapshots.length === 0) {
      box.appendChild(para("lh-inspector-none", "None yet. Take snapshot, from the command palette or the note's menu, keeps a copy under a title."));
      return box;
    }
    const list = document.createElement("ul");
    list.className = "lh-inspector-snapshots";
    for (const s of shown.snapshots) {
      const li = document.createElement("li");
      li.className = "lh-inspector-snapshot";
      li.tabIndex = 0;
      li.setAttribute("role", "link");
      const when = document.createElement("span");
      when.className = "lh-inspector-when";
      when.textContent = s.when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
      const title = document.createElement("span");
      title.className = "lh-inspector-snapshot-title";
      title.textContent = s.title;
      li.append(when, title);
      const open = () => void core.host.openNote(s.path);
      li.addEventListener("click", open);
      li.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") open();
      });
      list.appendChild(li);
    }
    box.appendChild(list);
    return box;
  };

  const head = (shown: Inspection): HTMLElement => {
    const box = document.createElement("div");
    box.className = "lh-inspector-head";
    const title = document.createElement("div");
    title.className = "lh-inspector-title";
    title.textContent = shown.title;
    const meta = document.createElement("div");
    meta.className = "lh-inspector-meta";
    const facts = [shown.kind, shown.status, shown.label, shown.words === null ? null : `${formatCount(shown.words)} words`];
    for (const fact of facts) {
      if (!fact) continue;
      const s = document.createElement("span");
      s.className = "lh-inspector-fact";
      s.textContent = fact;
      meta.appendChild(s);
    }
    box.append(title, meta);
    return box;
  };

  const section = (name: string, text: string | null, none: string): HTMLElement => {
    const box = document.createElement("div");
    box.className = "lh-inspector-section";
    const h = document.createElement("div");
    h.className = "lh-inspector-heading";
    h.textContent = name;
    box.appendChild(h);
    if (!text) {
      box.appendChild(para("lh-inspector-none", none));
      return box;
    }
    for (const block of text.split(/\n\s*\n/)) {
      const p = document.createElement("p");
      p.className = "lh-inspector-text";
      for (const [i, line] of block.split("\n").entries()) {
        if (i > 0) p.appendChild(document.createElement("br"));
        for (const span of spans(line)) {
          const node = document.createElement(span.bold ? "strong" : span.italic ? "em" : "span");
          node.textContent = span.text;
          p.appendChild(node);
        }
      }
      box.appendChild(p);
    }
    return box;
  };

  const unsubActive = core.host.onActiveFileChanged((active) => {
    if (!isNote(active) || active === path) return;
    path = active;
    void render();
  });
  const unsubFiles = core.host.onFileChanged((change) => {
    if (change.kind === "rename" && change.oldPath === path) path = change.path;
    // a new snapshot lands in _snapshots, not at this path; redraw for that too
    if (change.path === path || change.path.includes("/_snapshots/") || change.path.startsWith("_snapshots/")) void render();
  });
  void render();

  return {
    destroy() {
      disposed = true;
      unsubActive();
      unsubFiles();
      root.remove();
    },
  };
}

function para(cls: string, text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = cls;
  p.textContent = text;
  return p;
}
