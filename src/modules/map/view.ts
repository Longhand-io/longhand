// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The flat map view. An image (or a blank canvas) with pins on top. Hover a pin for its place
// card, click to open its note, drag to move it, double-click the map to add one, right-click
// or press Delete to remove one. Every change goes through MapModel, which writes only `pins`.
//
// Plain DOM, no map library. The stage keeps the image's aspect ratio and pins are placed
// with percentages, so the same note draws the same at any size.

import type { Core } from "../../core/modules.js";
import type { ViewHandle } from "../../host/host.js";
import type { Pin } from "../../core/spec.js";
import { createPlaceCard, type PlaceCard } from "./card.js";
import { MapModel, type ResolvedMap } from "./model.js";

const DRAG_THRESHOLD = 4; // px before a press becomes a drag
const NUDGE = 0.005; // arrow-key step in fractions
const HIDE_DELAY = 260; // ms of grace when the pointer leaves a pin or its card
const CARD_GAP = 12; // px between a pin and its card

export function mountMapView(core: Core, el: HTMLElement, path: string): ViewHandle {
  const model = new MapModel(core, path);
  const root = document.createElement("div");
  root.className = "lh-root lh-map";
  el.appendChild(root);

  const toolbar = document.createElement("div");
  toolbar.className = "lh-map-toolbar";
  const titleEl = document.createElement("div");
  titleEl.className = "lh-map-title";
  const hint = document.createElement("div");
  hint.className = "lh-map-hint";
  hint.textContent = core.host.isMobile
    ? "Tap a pin for its scenes. Press and hold the map to add one."
    : "Hover a pin for its scenes, click to open its note, drag to move it. Double-click the map to add a pin, right-click one to remove it.";
  const edit = document.createElement("button");
  edit.className = "lh-map-edit";
  edit.type = "button";
  edit.textContent = "Edit note";
  edit.title = "Open this map's note as text";
  edit.addEventListener("click", () => void core.host.openNoteAsMarkdown(path));
  toolbar.append(titleEl, hint, edit);

  const scroll = document.createElement("div");
  scroll.className = "lh-map-scroll";
  const stage = document.createElement("div");
  stage.className = "lh-map-stage";
  scroll.appendChild(stage);
  root.append(toolbar, scroll);

  let current: ResolvedMap | null = null;
  let writing = false;
  let disposed = false;

  // ---- place cards ----
  const cards = new Map<string, PlaceCard>();
  let openCard: { pinEl: HTMLElement; card: PlaceCard } | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const cardFor = (target: string, label: string): PlaceCard => {
    let card = cards.get(target);
    if (!card) {
      card = createPlaceCard(core, target, label);
      card.el.addEventListener("mouseenter", cancelHide);
      card.el.addEventListener("mouseleave", scheduleHide);
      stage.appendChild(card.el);
      cards.set(target, card);
    }
    return card;
  };

  const placeCard = (pinEl: HTMLElement, cardEl: HTMLElement) => {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const px = pinEl.offsetLeft;
    const py = pinEl.offsetTop;
    const w = cardEl.offsetWidth || 304;
    const h = cardEl.offsetHeight || 240;
    const half = (pinEl.offsetWidth || 0) / 2 + CARD_GAP;
    let left = px + half;
    let top = py - h / 2;
    if (left + w > sw - 8) left = px - half - w;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (top + h > sh - 8) top = Math.max(8, sh - h - 8);
    cardEl.style.left = `${left}px`;
    cardEl.style.top = `${top}px`;
  };

  const showCard = (pinEl: HTMLElement, pin: Pin) => {
    cancelHide();
    const target = model.targetOf(pin);
    if (!target) return;
    if (openCard && openCard.pinEl !== pinEl) hideCard();
    const card = cardFor(target, model.labelOf(pin));
    openCard = { pinEl, card };
    pinEl.classList.add("lh-map-pin-open");
    card.el.hidden = false;
    placeCard(pinEl, card.el);
    void card.load().then(() => {
      if (openCard?.card === card) placeCard(pinEl, card.el);
    });
  };

  const hideCard = () => {
    cancelHide();
    if (!openCard) return;
    openCard.card.el.hidden = true;
    openCard.pinEl.classList.remove("lh-map-pin-open");
    openCard = null;
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimer = setTimeout(hideCard, HIDE_DELAY);
  };

  function cancelHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  }

  const invalidateCards = () => {
    for (const c of cards.values()) c.invalidate();
    if (openCard) void openCard.card.load();
  };

  // ---- rendering ----
  const render = async () => {
    if (disposed) return;
    const note = await model.load();
    current = note;
    titleEl.textContent = note.title ?? path;
    hideCard();
    for (const c of cards.values()) c.el.remove();
    stage.replaceChildren();
    stage.classList.toggle("lh-map-blank", !note.imagePath);

    if (note.imagePath) {
      const img = document.createElement("img");
      img.className = "lh-map-image";
      img.draggable = false;
      img.alt = note.title ?? "map";
      img.src = core.host.resourceUrl(note.imagePath);
      img.addEventListener("load", () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          stage.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
        }
      });
      stage.appendChild(img);
      if (note.aspect) stage.style.aspectRatio = String(note.aspect);
    } else {
      stage.style.aspectRatio = String(note.aspect ?? 16 / 10);
      if (note.image) {
        const missing = document.createElement("div");
        missing.className = "lh-map-missing";
        missing.textContent = `Image not found: ${note.image}`;
        stage.appendChild(missing);
      }
    }

    note.pins.forEach((pin, index) => stage.appendChild(pinElement(pin, index)));
    for (const c of cards.values()) stage.appendChild(c.el);
  };

  const pinElement = (pin: Pin, index: number): HTMLElement => {
    const pinEl = document.createElement("div");
    pinEl.className = "lh-map-pin";
    pinEl.style.left = `${pin.x * 100}%`;
    pinEl.style.top = `${pin.y * 100}%`;
    pinEl.tabIndex = 0;
    pinEl.setAttribute("role", "button");
    pinEl.dataset["index"] = String(index);
    const target = model.targetOf(pin);
    if (!target) pinEl.classList.add("lh-map-pin-unresolved");
    const tag = document.createElement("span");
    tag.className = "lh-map-tag";
    tag.textContent = model.labelOf(pin);
    pinEl.appendChild(tag);
    pinEl.title = target ? target : `${pin.to} (not found)`;

    let startX = 0;
    let startY = 0;
    let dragging = false;
    let pressed = false;

    pinEl.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      pressed = true;
      dragging = false;
      startX = ev.clientX;
      startY = ev.clientY;
      pinEl.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    pinEl.addEventListener("pointermove", (ev) => {
      if (!pressed) return;
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      if (!dragging) hideCard();
      dragging = true;
      pinEl.classList.add("lh-map-pin-dragging");
      const { x, y } = fractionAt(ev.clientX, ev.clientY);
      pinEl.style.left = `${x * 100}%`;
      pinEl.style.top = `${y * 100}%`;
    });
    const release = async (ev: PointerEvent) => {
      if (!pressed) return;
      pressed = false;
      pinEl.releasePointerCapture(ev.pointerId);
      pinEl.classList.remove("lh-map-pin-dragging");
      if (dragging) {
        const { x, y } = fractionAt(ev.clientX, ev.clientY);
        await write(() => model.movePin(index, x, y));
      } else if (core.host.isMobile || ev.pointerType === "touch") {
        // no hover on touch: a tap shows the card, whose name opens the note
        if (openCard?.pinEl === pinEl) hideCard();
        else showCard(pinEl, pin);
      } else {
        await open(pin);
      }
    };
    pinEl.addEventListener("pointerup", (ev) => void release(ev));
    pinEl.addEventListener("pointercancel", () => {
      pressed = false;
      dragging = false;
      pinEl.classList.remove("lh-map-pin-dragging");
      void render();
    });
    pinEl.addEventListener("mouseenter", () => showCard(pinEl, pin));
    pinEl.addEventListener("mouseleave", scheduleHide);
    pinEl.addEventListener("focus", () => showCard(pinEl, pin));
    pinEl.addEventListener("blur", scheduleHide);
    pinEl.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      void remove(pin, index);
    });
    pinEl.addEventListener("dblclick", (ev) => ev.stopPropagation());
    pinEl.addEventListener("keydown", (ev) => {
      const key = ev.key;
      if (key === "Enter" || key === " ") {
        ev.preventDefault();
        void open(pin);
      } else if (key === "Escape") {
        hideCard();
      } else if (key === "Delete" || key === "Backspace") {
        ev.preventDefault();
        void remove(pin, index);
      } else if (key === "F2") {
        ev.preventDefault();
        void rename(pin, index);
      } else if (key.startsWith("Arrow")) {
        ev.preventDefault();
        const dx = key === "ArrowLeft" ? -NUDGE : key === "ArrowRight" ? NUDGE : 0;
        const dy = key === "ArrowUp" ? -NUDGE : key === "ArrowDown" ? NUDGE : 0;
        void write(() => model.movePin(index, pin.x + dx, pin.y + dy));
      }
    });
    return pinEl;
  };

  const fractionAt = (clientX: number, clientY: number) => {
    const r = stage.getBoundingClientRect();
    const x = r.width > 0 ? (clientX - r.left) / r.width : 0;
    const y = r.height > 0 ? (clientY - r.top) / r.height : 0;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  };

  const write = async (fn: () => Promise<unknown>) => {
    writing = true;
    try {
      await fn();
    } finally {
      writing = false;
    }
    await render();
  };

  const open = async (pin: Pin) => {
    const target = model.targetOf(pin);
    if (!target) {
      core.host.notify(`${pin.to} does not resolve to a note.`);
      return;
    }
    await core.host.openNote(target);
  };

  const remove = async (pin: Pin, index: number) => {
    hideCard();
    const ok = await core.host.confirm(`Remove the pin "${model.labelOf(pin)}"? The note it points at is untouched.`, "Remove pin");
    if (!ok) return;
    await write(() => model.removePin(index));
  };

  const rename = async (pin: Pin, index: number) => {
    const label = await core.host.prompt("Pin label", model.labelOf(pin));
    if (label === null) return;
    await write(() => model.setLabel(index, label));
  };

  const add = async (clientX: number, clientY: number) => {
    const { x, y } = fractionAt(clientX, clientY);
    const target = await core.host.pickFile("note", "Pin which note here?");
    if (!target) return;
    await write(() => model.addPin(target, x, y));
  };

  stage.addEventListener("dblclick", (ev) => {
    if ((ev.target as HTMLElement).closest(".lh-map-pin, .lh-map-card")) return;
    void add(ev.clientX, ev.clientY);
  });
  stage.addEventListener("pointerdown", (ev) => {
    if (!(ev.target as HTMLElement).closest(".lh-map-pin, .lh-map-card")) hideCard();
  });

  // long press on touch adds a pin
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  stage.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType !== "touch" || (ev.target as HTMLElement).closest(".lh-map-pin, .lh-map-card")) return;
    pressTimer = setTimeout(() => void add(ev.clientX, ev.clientY), 550);
  });
  const clearPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  };
  stage.addEventListener("pointerup", clearPress);
  stage.addEventListener("pointermove", clearPress);
  stage.addEventListener("pointercancel", clearPress);

  const unsubscribe = core.host.onFileChanged((change) => {
    if (writing) return;
    if (change.path === path || (current?.imagePath && change.path === current.imagePath)) {
      void render();
      return;
    }
    // any other note may have gained or lost a mention
    invalidateCards();
  });

  void render();

  return {
    destroy() {
      disposed = true;
      cancelHide();
      unsubscribe();
      root.remove();
    },
  };
}
