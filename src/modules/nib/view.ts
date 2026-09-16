// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Nib's margin panel. A transcript, a few suggested questions drawn from the project, and
// a question box. Answers are cards: a short reply and the scenes it cites, each a link.

import type { Core } from "../../core/modules.js";
import type { ViewHandle } from "../../host/host.js";
import { ask, type Answer } from "./answers.js";

const NIB_MARK =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="28,10 50,10 50,60 39,76 28,60" fill="currentColor"/><circle cx="39" cy="44" r="3.5" fill="var(--lh-paper)"/><line x1="39" y1="47" x2="39" y2="62" stroke="var(--lh-paper)" stroke-width="3"/><path d="M28 86 H 86" stroke="currentColor" stroke-width="9" stroke-linecap="round"/></svg>';

export function mountNibView(core: Core, el: HTMLElement): ViewHandle {
  const root = document.createElement("div");
  root.className = "lh-root lh-nib";
  el.appendChild(root);

  const head = document.createElement("div");
  head.className = "lh-nib-head";
  head.innerHTML = `<span class="lh-nib-mark">${NIB_MARK}</span>`;
  const title = document.createElement("div");
  title.innerHTML = `<div class="lh-nib-title">Nib</div><div class="lh-nib-sub">Answers from your files. Off the network.</div>`;
  head.appendChild(title);

  const transcript = document.createElement("div");
  transcript.className = "lh-nib-transcript";

  const chips = document.createElement("div");
  chips.className = "lh-nib-chips";

  const form = document.createElement("form");
  form.className = "lh-nib-form";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Ask Nib";
  input.setAttribute("aria-label", "Ask Nib");
  const send = document.createElement("button");
  send.type = "submit";
  send.textContent = "Ask";
  form.append(input, send);
  root.append(head, transcript, chips, form);

  const submit = async (question: string) => {
    const q = question.trim();
    if (!q) return;
    input.value = "";
    const you = document.createElement("div");
    you.className = "lh-nib-you";
    you.textContent = q;
    transcript.appendChild(you);
    const card = document.createElement("div");
    card.className = "lh-nib-answer lh-nib-thinking";
    card.textContent = "Looking…";
    transcript.appendChild(card);
    transcript.scrollTop = transcript.scrollHeight;
    let answer: Answer;
    try {
      answer = await ask(core, q);
    } catch (err) {
      console.error("[longhand] nib", err);
      answer = { kind: "help", text: "Something in the files would not read. The console has the detail.", cites: [] };
    }
    card.classList.remove("lh-nib-thinking");
    renderAnswer(card, answer);
    transcript.scrollTop = transcript.scrollHeight;
  };

  const renderAnswer = (card: HTMLElement, a: Answer) => {
    card.replaceChildren();
    for (const line of a.text.split("\n")) {
      const p = document.createElement("p");
      p.textContent = line;
      card.appendChild(p);
    }
    if (a.cites.length) {
      const list = document.createElement("ul");
      list.className = "lh-nib-cites";
      for (const c of a.cites) {
        const li = document.createElement("li");
        li.tabIndex = 0;
        li.setAttribute("role", "link");
        const label = document.createElement("span");
        label.className = "lh-nib-cite-label";
        label.textContent = c.map ? `Open ${c.label} as a map` : `Open ${c.label}`;
        li.appendChild(label);
        if (c.detail) {
          const d = document.createElement("span");
          d.className = "lh-nib-cite-detail";
          d.textContent = c.detail;
          li.appendChild(d);
        }
        const open = () => (c.map ? void core.host.openView("longhand-map", { path: c.path }) : void core.host.openNote(c.path));
        li.addEventListener("click", open);
        li.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") open();
        });
        list.appendChild(li);
      }
      card.appendChild(list);
    }
  };

  const renderChips = async () => {
    chips.replaceChildren();
    const suggestions = await suggest(core);
    for (const s of suggestions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lh-nib-chip";
      b.textContent = s;
      b.addEventListener("click", () => void submit(s));
      chips.appendChild(b);
    }
  };

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void submit(input.value);
  });

  const unsubscribe = core.host.onFileChanged(() => void renderChips());
  void renderChips();
  input.focus();

  return {
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}

/** A few questions that fit this project, so the first click shows what Nib can do. */
async function suggest(core: Core): Promise<string[]> {
  const active = core.host.activeFile();
  const project = active ? await core.projects.projectOf(active) : (await core.projects.roots())[0] ?? null;
  const docs = await core.projects.documents(project ? project.root : "");
  const out: string[] = [];
  const character = docs.find((d) => d.type === "character");
  const setting = docs.find((d) => d.type === "setting");
  const scene = docs.find((d) => d.type === "text");
  if (character?.title) out.push(`Where was ${character.title} last seen?`);
  if (setting?.title) out.push(`What is set at ${setting.title}?`);
  if (scene?.title) out.push(`Who is in ${scene.title}?`);
  out.push("Which places have no scene?");
  out.push("How long is the manuscript?");
  if (setting?.title && docs.some((d) => d.type === "map")) out.push(`Where is ${setting.title} on the map?`);
  return out;
}
