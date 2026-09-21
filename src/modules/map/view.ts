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
import { SHAPE_COLORS, SHAPE_STYLES, type Pin, type Shape, type ShapeColor, type ShapeStyle } from "../../core/spec.js";
import { createPlaceCard, type PlaceCard } from "./card.js";
import { COLOR_LABELS, ICONS, STYLE_LABELS, TOOLS, createDrawLayer, type Tool } from "./draw.js";
import { clean as cleanShape, MapModel, type ResolvedMap } from "./model.js";

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
  edit.className = "lh-map-tool lh-map-edit";
  edit.type = "button";
  edit.textContent = "Edit note";
  edit.title = "Open this map's note as text";
  edit.addEventListener("click", () => void core.host.openNoteAsMarkdown(path));
  toolbar.append(titleEl, hint, edit);

  // ---- tools row ----
  const tools = document.createElement("div");
  tools.className = "lh-map-tools";
  const iconButton = (icon: string, title: string, label?: string): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lh-map-tool";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
    if (label) b.append(document.createTextNode(label));
    return b;
  };
  const toolButtons = new Map<Tool, HTMLButtonElement>();
  for (const t of TOOLS) {
    const b = iconButton(t.icon, `${t.label} — ${t.key.toUpperCase()} or ${t.num}. ${t.hint}`);
    b.addEventListener("click", () => setTool(t.id));
    toolButtons.set(t.id, b);
    tools.appendChild(b);
  }
  const divider = () => {
    const d = document.createElement("span");
    d.className = "lh-map-divider";
    return d;
  };
  tools.appendChild(divider());
  let handMode = false;
  const handBtn = iconButton(ICONS.hand, "Hand-drawn — H. New shapes get a wavering pen line instead of a clean one");
  handBtn.addEventListener("click", () => setHand(!handMode));
  const setHand = (on: boolean) => {
    handMode = on;
    handBtn.classList.toggle("lh-map-tool-active", on);
    layer.setHand(on);
  };
  tools.appendChild(handBtn);
  const swatchRow = (onPick: (c: ShapeColor | null) => void): { el: HTMLElement; set: (c: ShapeColor | null) => void } => {
    const row = document.createElement("span");
    row.className = "lh-map-swatches";
    const buttons = new Map<ShapeColor | null, HTMLButtonElement>();
    const make = (c: ShapeColor | null) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lh-map-swatch";
      b.title = c ? COLOR_LABELS[c] : "Default ink for the style";
      if (c) b.style.setProperty("--swatch", `var(--lh-color-${c})`);
      else b.classList.add("lh-map-swatch-none");
      b.addEventListener("click", () => {
        set(c);
        onPick(c);
      });
      buttons.set(c, b);
      row.appendChild(b);
    };
    make(null);
    for (const c of SHAPE_COLORS) make(c);
    const set = (c: ShapeColor | null) => {
      for (const [k, b] of buttons) b.classList.toggle("lh-map-swatch-active", k === c);
    };
    set(null);
    return { el: row, set };
  };
  const toolSwatches = swatchRow((c) => layer.setColor(c));
  tools.appendChild(toolSwatches.el);
  tools.appendChild(divider());
  const styleSelect = document.createElement("select");
  styleSelect.className = "lh-map-style";
  styleSelect.title = "Style for new shapes";
  for (const s of SHAPE_STYLES) {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = STYLE_LABELS[s];
    styleSelect.appendChild(o);
  }
  styleSelect.addEventListener("change", () => layer.setStyle(styleSelect.value as ShapeStyle));
  const undoBtn = iconButton(ICONS.undo, "Undo the last drawing change — Cmd or Ctrl+Z");
  undoBtn.disabled = true;
  undoBtn.addEventListener("click", () => void undo());
  tools.append(styleSelect, undoBtn);

  // ---- properties row, shown for the selected shape ----
  const props = document.createElement("div");
  props.className = "lh-map-props";
  props.hidden = true;
  const propLabel = document.createElement("input");
  propLabel.type = "text";
  propLabel.placeholder = "Label";
  propLabel.className = "lh-map-prop-label";
  const propStyle = styleSelect.cloneNode(true) as HTMLSelectElement;
  propStyle.title = "Style";
  const propHand = iconButton(ICONS.hand, "Hand-drawn");
  propHand.addEventListener("click", () => {
    const s = layer.selected();
    if (s) void selectedPatch({ hand: s.hand ? undefined : true });
  });
  const propSwatches = swatchRow((c) => void selectedPatch({ color: c ?? undefined }));
  const textButton = (label: string, extraClass = ""): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `lh-map-tool${extraClass ? " " + extraClass : ""}`;
    b.textContent = label;
    return b;
  };
  const propLink = textButton("Link to note…");
  const propUnlink = textButton("Unlink");
  const propDelete = textButton("Delete", "lh-map-tool-danger");
  props.append(propLabel, propStyle, propHand, propSwatches.el, propLink, propUnlink, propDelete);

  const scroll = document.createElement("div");
  scroll.className = "lh-map-scroll";
  const stage = document.createElement("div");
  stage.className = "lh-map-stage";
  scroll.appendChild(stage);
  root.append(toolbar, tools, props, scroll);

  let current: ResolvedMap | null = null;
  let writing = false;
  let disposed = false;
  let aspect = 16 / 10;
  const undoStack: Shape[][] = [];

  const commitShapes = async (next: Shape[]) => {
    if (current) undoStack.push(current.shapes);
    if (undoStack.length > 50) undoStack.shift();
    undoBtn.disabled = false;
    await write(() => model.setShapes(next));
  };

  const undo = async () => {
    const prev = undoStack.pop();
    undoBtn.disabled = undoStack.length === 0;
    if (!prev) return;
    await write(() => model.setShapes(prev));
  };

  const layer = createDrawLayer(stage, {
    onSelect: (shape) => showProps(shape),
    onChange: (next) => void commitShapes(next),
    onHover: (shape, anchor) => {
      const target = model.targetOfShape(shape);
      if (target) showCard(anchor as HTMLElement, target, shape.label ?? target);
    },
    onLeave: () => scheduleHide(),
    promptText: () => core.host.prompt("Label", ""),
    newId: () => model.newShapeId(),
    onToolChange: (tool) => {
      for (const [id, b] of toolButtons) b.classList.toggle("lh-map-tool-active", id === tool);
      hint.textContent = TOOLS.find((t) => t.id === tool)?.hint ?? "";
      root.focus({ preventScroll: true });
    },
  });

  const setTool = (tool: Tool) => layer.setTool(tool);

  const showProps = (shape: Shape | null) => {
    props.hidden = !shape;
    if (!shape) return;
    propLabel.value = shape.label ?? "";
    propStyle.value = shape.style ?? "outline";
    propStyle.disabled = shape.type === "text";
    propHand.classList.toggle("lh-map-tool-active", !!shape.hand);
    propHand.disabled = shape.type === "text";
    propSwatches.set(shape.color ?? null);
    const target = model.targetOfShape(shape);
    propLink.textContent = shape.to ? `Linked: ${shape.to}` : "Link to note…";
    propLink.classList.toggle("lh-map-pin-unresolved", !!shape.to && !target);
    propUnlink.hidden = !shape.to;
  };

  const selectedPatch = async (patch: { [K in keyof Shape]?: Shape[K] | undefined }) => {
    const s = layer.selected();
    if (!s || !current) return;
    await commitShapes(current.shapes.map((x) => (x.id === s.id ? cleanShape({ ...x, ...patch } as Shape) : x)));
  };
  propLabel.addEventListener("change", () => void selectedPatch({ label: propLabel.value.trim() }));
  propLabel.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") propLabel.blur();
  });
  propStyle.addEventListener("change", () => void selectedPatch({ style: propStyle.value as ShapeStyle }));
  propLink.addEventListener("click", async () => {
    const target = await core.host.pickFile("note", "Link this shape to which note?");
    if (!target) return;
    await selectedPatch({ to: core.host.linkTo(target, path) });
  });
  propUnlink.addEventListener("click", () => void selectedPatch({ to: undefined }));
  propDelete.addEventListener("click", async () => {
    const s = layer.selected();
    if (!s || !current) return;
    await commitShapes(current.shapes.filter((x) => x.id !== s.id));
  });

  root.tabIndex = -1;
  root.addEventListener("keydown", (ev) => {
    const inField = (ev.target as HTMLElement).matches("input, select, textarea");
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "z" && !inField) {
      ev.preventDefault();
      void undo();
    } else if ((ev.key === "Delete" || ev.key === "Backspace") && !inField && layer.selected()) {
      ev.preventDefault();
      propDelete.click();
    } else if (ev.key === "Escape" && !inField) {
      if (layer.tool() !== "select") setTool("select");
      else layer.select(null);
    } else if (!inField && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      const k = ev.key.toLowerCase();
      const tool = TOOLS.find((t) => t.key === k || t.num === k);
      if (tool) {
        ev.preventDefault();
        setTool(tool.id);
      } else if (k === "h") {
        ev.preventDefault();
        setHand(!handMode);
      }
    }
  });

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

  const placeCard = (anchor: HTMLElement, cardEl: HTMLElement) => {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const sr = stage.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const px = ar.left + ar.width / 2 - sr.left;
    const py = ar.top + ar.height / 2 - sr.top;
    const w = cardEl.offsetWidth || 304;
    const h = cardEl.offsetHeight || 240;
    const half = ar.width / 2 + CARD_GAP;
    let left = px + half;
    let top = py - h / 2;
    if (left + w > sw - 8) left = px - half - w;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (top + h > sh - 8) top = Math.max(8, sh - h - 8);
    cardEl.style.left = `${left}px`;
    cardEl.style.top = `${top}px`;
  };

  const showCard = (pinEl: HTMLElement, target: string, label: string) => {
    cancelHide();
    if (openCard && openCard.pinEl !== pinEl) hideCard();
    const card = cardFor(target, label);
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
    layer.svg.remove();
    stage.replaceChildren();
    stage.classList.toggle("lh-map-blank", !note.imagePath);
    aspect = note.aspect ?? aspect;

    if (note.imagePath) {
      const img = document.createElement("img");
      img.className = "lh-map-image";
      img.draggable = false;
      img.alt = note.title ?? "map";
      img.src = core.host.resourceUrl(note.imagePath);
      img.addEventListener("load", () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          stage.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
          aspect = img.naturalWidth / img.naturalHeight;
          if (current) layer.setShapes(current.shapes, aspect);
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

    stage.appendChild(layer.svg);
    layer.setShapes(note.shapes, aspect);
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
        else hover();
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
    const hover = () => {
      const t = model.targetOf(pin);
      if (t) showCard(pinEl, t, model.labelOf(pin));
    };
    pinEl.addEventListener("mouseenter", hover);
    pinEl.addEventListener("mouseleave", scheduleHide);
    pinEl.addEventListener("focus", hover);
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
    if (layer.tool() !== "select") return;
    if ((ev.target as HTMLElement).closest(".lh-map-pin, .lh-map-card, .lh-shape")) return;
    void add(ev.clientX, ev.clientY);
  });
  stage.addEventListener("pointerdown", (ev) => {
    if (!(ev.target as HTMLElement).closest(".lh-map-pin, .lh-map-card, .lh-shape")) {
      hideCard();
      if (layer.tool() === "select") layer.select(null);
    }
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

  let cardTimer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = core.host.onFileChanged((change) => {
    if (writing) return;
    if (change.path === path || (current?.imagePath && change.path === current.imagePath)) {
      void render();
      return;
    }
    // another note in this project may have gained or lost a mention; refresh after a beat
    if (!change.path.toLowerCase().endsWith(".md")) return;
    if (cardTimer) clearTimeout(cardTimer);
    cardTimer = setTimeout(invalidateCards, 300);
  });

  setTool("select");
  void render();

  return {
    destroy() {
      disposed = true;
      cancelHide();
      if (cardTimer) clearTimeout(cardTimer);
      unsubscribe();
      layer.destroy();
      root.remove();
    },
  };
}

