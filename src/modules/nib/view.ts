// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Nib's margin panel. A transcript, a few suggested questions drawn from the project, and
// a question box. Answers are cards: a short reply and the scenes it cites, each a link.

import type { Core } from "../../core/modules.js";
import type { ViewHandle } from "../../host/host.js";
import { ask, perform, type Answer } from "./answers.js";
import { nudgesFor, type Nudge } from "./nudges.js";

export const NIB_VIEW_TYPE = "longhand-nib";

/** Open sidebar chats, so the corner nib can hand a question to one that already exists. */
const live = new Set<{ submit: (q: string) => Promise<void>; say: (text: string) => void }>();
/** A question waiting for the sidebar to mount, with what Nib said in the corner just before. */
let pending: { question: string; preface: string | null } | null = null;
/** Nudges already spoken this session, by key. Said once, then never again. */
const spoken = new Set<string>();
/** The conversation so far this session. The sidebar re-renders it whenever it mounts. */
type Turn = { you: string; answer: Answer } | { nib: string };
const history: Turn[] = [];

/** Put a question to Nib in the sidebar, opening it if needed. `preface` is what Nib just said in the corner. */
export async function askInSidebar(core: Core, question: string, contextPath = "", preface: string | null = null): Promise<void> {
  const view = [...live][0];
  if (view) {
    if (preface) view.say(preface);
    await core.host.openView(NIB_VIEW_TYPE, { path: contextPath });
    await view.submit(question);
    return;
  }
  pending = { question, preface };
  await core.host.openView(NIB_VIEW_TYPE, { path: contextPath });
}

/** Test hook. */
export function clearHistory(): void {
  history.length = 0;
}

const NIB_MARK =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="28,10 50,10 50,60 39,76 28,60" fill="currentColor"/><circle cx="39" cy="44" r="3.5" fill="var(--lh-paper)"/><line x1="39" y1="47" x2="39" y2="62" stroke="var(--lh-paper)" stroke-width="3"/><path d="M28 86 H 86" stroke="currentColor" stroke-width="9" stroke-linecap="round"/></svg>';

/** The mark grown into a character: eyes above the breather hole, a badge, a scribble, a halo. */
const NIB_CHARACTER =
  '<svg viewBox="0 0 100 100" aria-hidden="true">' +
  '<circle class="lh-nc-halo" cx="39" cy="45" r="20"/>' +
  '<g class="lh-nc-character">' +
  '<g class="lh-nc-head">' +
  '<polygon class="lh-nc-body" points="28,10 50,10 50,60 39,76 28,60"/>' +
  '<line class="lh-nc-slit" x1="39" y1="47" x2="39" y2="62"/>' +
  '<circle class="lh-nc-hole" cx="39" cy="44" r="3.5"/>' +
  '<g class="lh-nc-eyes">' +
  '<ellipse class="lh-nc-eye" cx="33.5" cy="27" rx="4.2" ry="5"/><ellipse class="lh-nc-eye" cx="44.5" cy="27" rx="4.2" ry="5"/>' +
  '<circle class="lh-nc-pupil" cx="33.5" cy="27.5" r="2"/><circle class="lh-nc-pupil" cx="44.5" cy="27.5" r="2"/>' +
  '<rect class="lh-nc-lid" x="28.5" y="21" width="21" height="12"/>' +
  '<path class="lh-nc-brow" d="M29 19 q4.5 -3 9 0"/><path class="lh-nc-brow" d="M40 19 q4.5 -3 9 0"/>' +
  '</g>' +
  '<circle class="lh-nc-badge" cx="52" cy="12" r="5"/>' +
  '</g>' +
  '<path class="lh-nc-line" d="M28 86 H 86"/>' +
  '<path class="lh-nc-scribble" d="M30 86 q6 -8 12 0 t12 0 t12 0 t12 0"/>' +
  '</g></svg>';

export type NibState = "idle" | "noticed" | "thinking" | "found" | "notnow" | "doubletake" | "joke";

/** What the sidebar tells the character: it is working, it has answered, it told the joke. */
type NibEvent = "asking" | "answered" | "joke";
const eventListeners = new Set<(e: NibEvent) => void>();
function emit(e: NibEvent): void {
  for (const l of eventListeners) l(e);
}

export function mountNibView(core: Core, el: HTMLElement, contextPath = ""): ViewHandle {
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
  const chipsToggle = document.createElement("button");
  chipsToggle.type = "button";
  chipsToggle.className = "lh-nib-chips-toggle";
  chipsToggle.textContent = "Suggestions";
  chipsToggle.hidden = true;
  chipsToggle.addEventListener("click", () => {
    chips.hidden = !chips.hidden;
  });

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
  root.append(head, transcript, chipsToggle, chips, form);

  const stepAside = () => {
    // the answers need the room; the chips step aside once there is a conversation
    chips.hidden = true;
    chipsToggle.hidden = false;
  };

  const youLine = (q: string) => {
    const you = document.createElement("div");
    you.className = "lh-nib-you";
    you.textContent = q;
    transcript.appendChild(you);
  };

  const say = (text: string) => {
    history.push({ nib: text });
    const card = document.createElement("div");
    card.className = "lh-nib-answer";
    const p = document.createElement("p");
    p.textContent = text;
    card.appendChild(p);
    transcript.appendChild(card);
    transcript.scrollTop = transcript.scrollHeight;
  };

  const submit = async (question: string) => {
    const q = question.trim();
    if (!q) return;
    input.value = "";
    stepAside();
    youLine(q);
    const card = document.createElement("div");
    card.className = "lh-nib-answer lh-nib-thinking";
    card.textContent = "Looking…";
    transcript.appendChild(card);
    transcript.scrollTop = transcript.scrollHeight;
    let answer: Answer;
    emit("asking");
    try {
      answer = await ask(core, q);
    } catch (err) {
      console.error("[longhand] nib", err);
      answer = { kind: "help", text: "Something in the files would not read. The console has the detail.", cites: [] };
    }
    history.push({ you: q, answer });
    emit(answer.text.includes("That was the one joke") ? "joke" : "answered");
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
    if (a.actions && a.actions.length) {
      const row = document.createElement("div");
      row.className = "lh-nib-actions";
      for (const action of a.actions) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "lh-nib-chip lh-nib-action";
        b.textContent = action.label;
        b.addEventListener("click", async () => {
          b.disabled = true;
          let said: string;
          try {
            said = await perform(core, action);
          } catch (err) {
            console.error("[longhand] nib action", err);
            said = "That edit did not go through. The console has the detail.";
          }
          say(said);
        });
        row.appendChild(b);
      }
      card.appendChild(row);
    }
  };

  const replay = () => {
    for (const turn of history) {
      if ("nib" in turn) {
        const card = document.createElement("div");
        card.className = "lh-nib-answer";
        const p = document.createElement("p");
        p.textContent = turn.nib;
        card.appendChild(p);
        transcript.appendChild(card);
      } else {
        youLine(turn.you);
        const card = document.createElement("div");
        card.className = "lh-nib-answer";
        renderAnswer(card, turn.answer);
        transcript.appendChild(card);
      }
    }
    if (history.length) stepAside();
    transcript.scrollTop = transcript.scrollHeight;
  };

  const greet = async () => {
    if (history.length || !contextPath) return;
    const doc = await core.projects.byPath(contextPath);
    if (!doc) return;
    const card = document.createElement("div");
    card.className = "lh-nib-answer";
    const p = document.createElement("p");
    const title = doc.title ?? contextPath;
    p.textContent =
      doc.type === "map"
        ? `You are on ${title}. Ask what is set at a place, who has been where, or which pins have no scene yet.`
        : `You are in ${title}. Ask who is in it, how long it is, or where something was last seen.`;
    card.appendChild(p);
    transcript.appendChild(card);
  };

  const renderChips = async () => {
    chips.replaceChildren();
    const suggestions = await suggest(core, contextPath);
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
  const handle = { submit, say };
  live.add(handle);
  replay();
  void greet()
    .then(renderChips)
    .then(() => {
      if (pending) {
        const p = pending;
        pending = null;
        if (p.preface) say(p.preface);
        return submit(p.question);
      }
      return undefined;
    });
  input.focus();

  return {
    destroy() {
      live.delete(handle);
      unsubscribe();
      root.remove();
    },
  };
}

/** A few questions that fit what is on screen, so the first click shows what Nib can do. */
export async function suggest(core: Core, contextPath = ""): Promise<string[]> {
  const anchor = contextPath || core.host.activeFile();
  const project = anchor ? await core.projects.projectOf(anchor) : (await core.projects.roots())[0] ?? null;
  const docs = await core.projects.documents(project ? project.root : "");
  const out: string[] = [];
  const context = contextPath ? await core.projects.byPath(contextPath) : null;
  if (context?.type === "map") {
    // the places this map points at
    const note = core.spec.mapFromDocument(context);
    const targets = [...note.pins.map((p) => p.to), ...note.shapes.map((s) => s.to ?? "")].filter((t) => t !== "");
    const seen = new Set<string>();
    for (const t of targets) {
      const label = t.replace(/^\[\[|\]\]$/g, "").split("|").pop()?.replace(/^\d+\s+/, "") ?? "";
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push(`What is set at ${label}?`);
      if (out.length >= 2) break;
    }
    out.push("Which places have no scene?");
  } else if (context?.type === "text" && context.title) {
    out.push(`Who is in ${context.title}?`, `How long is ${context.title}?`);
  }
  const character = docs.find((d) => d.type === "character");
  const setting = docs.find((d) => d.type === "setting");
  const scene = docs.find((d) => d.type === "text");
  if (character?.title) out.push(`Where was ${character.title} last seen?`);
  if (!context && setting?.title) out.push(`What is set at ${setting.title}?`);
  if (!context && scene?.title) out.push(`Who is in ${scene.title}?`);
  if (!context) out.push("Which places have no scene?");
  out.push("How long is the manuscript?");
  if (setting?.title && docs.some((d) => d.type === "map") && context?.type !== "map") out.push(`Where is ${setting.title} on the map?`);
  return [...new Set(out)].slice(0, 6);
}

/**
 * The character in the corner. It idles, and when it has noticed something true about the
 * view on screen it shows a badge and, on hover or click, a speech bubble with the observation,
 * a follow-up, and a question box. Asking hands the conversation to the sidebar; the nib stays.
 */
export function mountNibDock(core: Core, el: HTMLElement, initialContext: string, follow = false): ViewHandle {
  let contextPath = initialContext;
  const dock = document.createElement("div");
  dock.className = "lh-root lh-nib-dock" + (follow ? " lh-nib-dock-global" : "");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "lh-nib-dock-button lh-nc lh-nc-idle";
  button.title = "Nib";
  button.setAttribute("aria-label", "Nib");
  button.innerHTML = NIB_CHARACTER;

  // ---- the character's states, each fired by something real ----
  const STATES: NibState[] = ["idle", "noticed", "thinking", "found", "notnow", "doubletake", "joke"];
  let stateTimer: ReturnType<typeof setTimeout> | null = null;
  const restingState = (): NibState => (current ? "noticed" : "idle");
  const setState = (s: NibState, thenRestAfterMs?: number) => {
    if (stateTimer) clearTimeout(stateTimer);
    stateTimer = null;
    for (const x of STATES) button.classList.remove(`lh-nc-${x}`);
    void button.offsetWidth; // restart one-shot animations
    button.classList.add(`lh-nc-${s}`);
    if (thenRestAfterMs) stateTimer = setTimeout(() => setState(restingState()), thenRestAfterMs);
  };
  const pupils = button.querySelectorAll<SVGElement>(".lh-nc-pupil");
  const onMove = (ev: PointerEvent) => {
    if (button.classList.contains("lh-nc-idle")) return;
    const r = button.getBoundingClientRect();
    const dx = ev.clientX - (r.left + r.width * 0.39);
    const dy = ev.clientY - (r.top + r.height * 0.27);
    const len = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, len / 240) * 2.2;
    for (const p of pupils) p.style.transform = `translate(${(dx / len) * reach}px, ${(dy / len) * reach}px)`;
  };
  const onLeave = () => {
    for (const p of pupils) p.style.transform = "";
  };
  const eyeSurface: EventTarget = follow ? document : el;
  eyeSurface.addEventListener("pointermove", onMove as EventListener);
  eyeSurface.addEventListener("pointerleave", onLeave);
  const onEvent = (e: NibEvent) => {
    if (e === "asking") setState("thinking");
    else if (e === "joke") setState("joke", 1400);
    else setState("found", 1100);
  };
  eventListeners.add(onEvent);

  const bubble = document.createElement("div");
  bubble.className = "lh-nib-bubble";
  bubble.hidden = true;
  const bubbleText = document.createElement("p");
  bubbleText.className = "lh-nib-bubble-text";
  const bubbleCites = document.createElement("ul");
  bubbleCites.className = "lh-nib-cites";
  const actions = document.createElement("div");
  actions.className = "lh-nib-bubble-actions";
  const askBtn = document.createElement("button");
  askBtn.type = "button";
  askBtn.className = "lh-nib-chip";
  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.className = "lh-nib-chip";
  dismissBtn.textContent = "Not now";
  actions.append(askBtn, dismissBtn);
  const form = document.createElement("form");
  form.className = "lh-nib-form lh-nib-bubble-form";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Ask Nib";
  input.setAttribute("aria-label", "Ask Nib");
  const send = document.createElement("button");
  send.type = "submit";
  send.textContent = "Ask";
  form.append(input, send);
  bubble.append(bubbleText, bubbleCites, actions, form);
  dock.append(bubble, button);
  el.appendChild(dock);

  let current: Nudge | null = null;
  let greeting = "";
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let popTimer: ReturnType<typeof setTimeout> | null = null;
  let announced: string | null = null;

  const show = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    bubble.hidden = false;
    if (button.classList.contains("lh-nc-idle")) setState("noticed");
  };
  const hide = () => {
    bubble.hidden = true;
    if (!stateTimer) setState(restingState());
  };
  const scheduleHide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (document.activeElement !== input) hide();
    }, 400);
  };

  const renderBubble = () => {
    bubbleCites.replaceChildren();
    if (current) {
      bubbleText.textContent = current.text;
      for (const c of current.cites.slice(0, 3)) {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.className = "lh-nib-cite-label";
        label.textContent = `Open ${c.label}`;
        li.appendChild(label);
        if (c.detail) {
          const d = document.createElement("span");
          d.className = "lh-nib-cite-detail";
          d.textContent = c.detail;
          li.appendChild(d);
        }
        li.addEventListener("click", () => void core.host.openNote(c.path));
        bubbleCites.appendChild(li);
      }
      askBtn.hidden = !current.ask;
      askBtn.textContent = current.ask ?? "";
      dismissBtn.hidden = false;
    } else {
      bubbleText.textContent = greeting;
      askBtn.hidden = true;
      dismissBtn.hidden = true;
    }
    button.classList.toggle("lh-nc-has-nudge", !!current);
  };

  const look = async () => {
    const doc = contextPath ? await core.projects.byPath(contextPath) : null;
    const title = doc?.title ?? contextPath;
    greeting = !doc
      ? "Ask me where someone was last seen, what is set at a place, or how long the manuscript is."
      : doc.type === "map"
        ? `You are on ${title}. Ask me what is set at a place, or who has been where.`
        : `You are in ${title}. Ask me who is in it, or where someone was last seen.`;
    let nudges: Nudge[] = [];
    try {
      nudges = await nudgesFor(core, contextPath);
    } catch (err) {
      console.error("[longhand] nib nudges", err);
    }
    const before = current?.key ?? null;
    current = nudges.find((n) => !spoken.has(n.key)) ?? null;
    renderBubble();
    if (!current && !stateTimer) setState("idle");
    // it speaks up on its own, once per fact, after a beat, and steps back if you ignore it
    if (current && current.key !== announced && bubble.hidden) {
      announced = current.key;
      if (current.kind === "broken" && before !== current.key) setState("doubletake", 1600);
      else setState("noticed");
      if (popTimer) clearTimeout(popTimer);
      popTimer = setTimeout(() => {
        if (!current || bubble.hidden === false) return;
        show();
        hideTimer = setTimeout(() => {
          if (document.activeElement !== input && !bubble.matches(":hover")) hide();
        }, 9000);
      }, 1400);
    }
  };

  const handOff = async (question: string) => {
    const preface = current ? current.text : null;
    if (current) spoken.add(current.key);
    current = null;
    hide();
    renderBubble();
    await askInSidebar(core, question, contextPath, preface);
  };

  button.addEventListener("click", () => {
    if (bubble.hidden) {
      show();
      input.focus();
    } else hide();
  });
  button.addEventListener("mouseenter", show);
  button.addEventListener("mouseleave", scheduleHide);
  bubble.addEventListener("mouseenter", show);
  bubble.addEventListener("mouseleave", scheduleHide);
  askBtn.addEventListener("click", () => void handOff(current?.ask ?? ""));
  dismissBtn.addEventListener("click", () => {
    if (current) spoken.add(current.key);
    current = null;
    bubble.hidden = true;
    renderBubble();
    setState("notnow", 1300);
  });
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    void handOff(q);
  });
  dock.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !bubble.hidden) hide();
  });

  const unsubscribe = core.host.onFileChanged(() => void look());
  const unfollow = follow
    ? core.host.onActiveFileChanged((path) => {
        if ((path ?? "") === contextPath) return;
        contextPath = path ?? "";
        bubble.hidden = true;
        void look();
      })
    : () => {};
  void look();

  return {
    destroy() {
      unsubscribe();
      unfollow();
      eventListeners.delete(onEvent);
      eyeSurface.removeEventListener("pointermove", onMove as EventListener);
      eyeSurface.removeEventListener("pointerleave", onLeave);
      if (hideTimer) clearTimeout(hideTimer);
      if (popTimer) clearTimeout(popTimer);
      if (stateTimer) clearTimeout(stateTimer);
      dock.remove();
    },
  };
}
