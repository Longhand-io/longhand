// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The timeline view. A ruler, one track per thread, pins as tags in the thread's colour,
// events dashed, ranges as bars, a Written track of dots from `created`, and a tray of
// undated scenes. Click a pin to open its note; drag it along the axis to change its date.

import type { Core } from "../../core/modules.js";
import type { ViewHandle } from "../../host/host.js";
import { currentProject, projectPicker, rememberProject } from "../../core/picker.js";
import { formatStoryDate } from "../../core/storydate.js";
import { TimelineModel, type Item, type SceneRef, type Timeline } from "./model.js";

const DRAG_THRESHOLD = 4;
type Axis = "story" | "manuscript";

export function mountTimelineView(core: Core, el: HTMLElement, anchorPath: string): ViewHandle {
  let model = new TimelineModel(core, anchorPath);
  const root = document.createElement("div");
  root.className = "lh-root lh-tl";
  el.appendChild(root);

  const head = document.createElement("div");
  head.className = "lh-tl-head";
  const picker = projectPicker(core, (c) => {
    model = new TimelineModel(core, c.notePath);
    void render();
  });
  const hint = document.createElement("div");
  hint.className = "lh-tl-hint";
  const axisRow = document.createElement("div");
  axisRow.className = "lh-tl-axis";
  const axisLabel = document.createElement("span");
  axisLabel.textContent = "Axis";
  const toolButton = (label: string, title: string, fn: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lh-map-tool";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", fn);
    return b;
  };
  const axisButtons = new Map<Axis, HTMLButtonElement>();
  for (const [id, label] of [["manuscript", "Manuscript order"], ["story", "Story date"]] as [Axis, string][]) {
    axisButtons.set(
      id,
      toolButton(label, `Lay the threads out by ${label.toLowerCase()}`, () => {
        axis = id;
        axisChosen = true;
        void render();
      }),
    );
  }
  axisRow.append(axisLabel, ...axisButtons.values());
  // zoom: fit the whole story, or widen the board so a year, then a month, gets room
  const zoomRow = document.createElement("div");
  zoomRow.className = "lh-tl-axis";
  const zoomLabel = document.createElement("span");
  zoomLabel.textContent = "Zoom";
  const zoomButton = toolButton;
  let zoom = 1; // board width as a multiple of the viewport
  const zoomOut = zoomButton("−", "Zoom out", () => setZoom(zoom / 1.6));
  const zoomFit = zoomButton("Fit", "The whole story in the window", () => setZoom(1));
  const zoomIn = zoomButton("+", "Zoom in", () => setZoom(zoom * 1.6));
  zoomRow.append(zoomLabel, zoomOut, zoomFit, zoomIn);
  head.append(picker.el, hint, axisRow, zoomRow);
  let axis: Axis = "story";
  let axisChosen = false;
  const setZoom = (z: number) => {
    const before = scroll.scrollLeft / Math.max(1, board.clientWidth);
    zoom = Math.min(64, Math.max(1, z));
    board.style.width = zoom === 1 ? "" : `${zoom * 100}%`;
    zoomFit.classList.toggle("lh-map-tool-active", zoom === 1);
    layoutPins();
    scroll.scrollLeft = before * board.clientWidth;
  };

  const scroll = document.createElement("div");
  scroll.className = "lh-tl-scroll";
  const board = document.createElement("div");
  board.className = "lh-tl-board";
  scroll.appendChild(board);

  const tray = document.createElement("div");
  tray.className = "lh-tl-tray";
  root.append(head, scroll, tray);

  let current: Timeline | null = null;
  let writing = false;
  let disposed = false;

  const fraction = (days: number) => (current ? (days - current.min) / (current.max - current.min) : 0);
  const daysAt = (clientX: number, within: HTMLElement = board) => {
    const r = within.getBoundingClientRect();
    const f = r.width > 0 ? (clientX - r.left) / r.width : 0;
    return current ? current.min + Math.min(1, Math.max(0, f)) * (current.max - current.min) : 0;
  };

  const render = async () => {
    if (disposed) return;
    const tl = await model.load();
    current = tl;
    rememberProject(tl.root);
    await picker.refresh(tl.root);
    board.replaceChildren();
    const dated = tl.lanes.some((l) => l.items.length > 0);
    if (!axisChosen) axis = dated ? "story" : "manuscript";
    for (const [id, b] of axisButtons) b.classList.toggle("lh-map-tool-active", id === axis);
    hint.textContent =
      axis === "story"
        ? `Story date${tl.calendar.kind === "gregorian" ? "" : tl.calendar.kind === "custom" ? ", this project's own calendar" : ", counted"}. Click a pin to open its scene, drag it to change the date. Events are dashed.`
        : "Manuscript order. Every scene in binder order, a card in its thread. Click a card to open it; drag it to another thread to change its label.";

    if (axis === "manuscript") {
      board.style.width = "";
      renderManuscript(tl);
      return;
    }
    board.style.width = zoom === 1 ? "" : `${zoom * 100}%`;

    // parts: the shape of the book along the axis
    if (tl.parts.length) {
      const band = document.createElement("div");
      band.className = "lh-tl-parts";
      for (const p of tl.parts) {
        const span = document.createElement("span");
        span.className = "lh-tl-part";
        span.style.left = `${fraction(p.start) * 100}%`;
        span.style.width = `${Math.max(0.6, (fraction(p.end) - fraction(p.start)) * 100)}%`;
        span.textContent = p.name;
        span.title = `${p.name}: ${p.count} dated ${p.count === 1 ? "scene" : "scenes"}, ${tl.calendar.format(p.start, "day")} to ${tl.calendar.format(p.end, "day")}`;
        band.appendChild(span);
      }
      board.appendChild(band);
    }

    // ruler
    const ruler = document.createElement("div");
    ruler.className = "lh-tl-ruler";
    for (const t of tl.calendar.ticks(tl.min, tl.max)) {
      const tick = document.createElement("span");
      tick.className = "lh-tl-tick" + (t.major ? " lh-tl-tick-major" : "");
      tick.style.left = `${fraction(t.days) * 100}%`;
      tick.textContent = t.label;
      ruler.appendChild(tick);
    }
    board.appendChild(ruler);

    // threads
    for (const lane of tl.lanes) {
      const track = document.createElement("div");
      track.className = "lh-tl-track";
      track.appendChild(labelled("span", "lh-tl-lane-name", lane.name, lane.color));
      for (const item of lane.items) track.appendChild(pinFor(item, lane.color));
      board.appendChild(track);
    }
    if (tl.lanes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lh-tl-empty";
      empty.textContent = "No scene has a story date yet. Give one a date in its frontmatter, or pick a scene below.";
      board.appendChild(empty);
    }

    // written
    if (tl.written.length) {
      const track = document.createElement("div");
      track.className = "lh-tl-track lh-tl-track-written";
      const name = document.createElement("span");
      name.className = "lh-tl-lane-name";
      name.textContent = "Written";
      track.appendChild(name);
      const wmin = Math.min(...tl.written.map((w) => w.days));
      const wmax = Math.max(...tl.written.map((w) => w.days));
      for (const w of tl.written) {
        const dot = document.createElement("span");
        dot.className = "lh-tl-dot";
        dot.style.left = `${(wmax === wmin ? 0.5 : (w.days - wmin) / (wmax - wmin)) * 92 + 4}%`;
        dot.title = `${w.title}, created ${formatStoryDate(w.days, "day")}`;
        dot.addEventListener("click", () => void core.host.openNote(w.doc.path));
        track.appendChild(dot);
      }
      board.appendChild(track);
    }

    layoutPins();

    // undated tray
    tray.replaceChildren();
    if (tl.undated.length) {
      const label = document.createElement("span");
      label.className = "lh-tl-tray-label";
      label.textContent = `${tl.undated.length} undated ${tl.undated.length === 1 ? "scene" : "scenes"}:`;
      tray.appendChild(label);
      for (const d of tl.undated) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "lh-nib-chip";
        chip.textContent = d.title ?? d.path;
        chip.title = "Give this scene a story date";
        chip.addEventListener("click", async () => {
          const v = await core.host.prompt(`Story date for ${d.title ?? d.path}: ${tl.calendar.hint}`, "");
          if (!v) return;
          const parsed = tl.calendar.parse(v);
          if (!parsed) {
            core.host.notify(`${v} is not a date I can place. Use ${tl.calendar.hint}.`);
            return;
          }
          await write(() => model.setDate(d.path, parsed.days, parsed.precision));
        });
        tray.appendChild(chip);
      }
    }
  };

  /**
   * The manuscript-order axis, as the threads board: one column per thread, one row per scene
   * in binder order, a card in its thread's column, a thread line running down each lane.
   * Drag a card to another lane and the scene's label changes.
   */
  const renderManuscript = (tl: Timeline) => {
    tray.replaceChildren();
    const threads: { name: string; color: number | null; key: string | null }[] = tl.labels.map((name, i) => ({ name, color: i, key: name }));
    const hasUnlabelled = tl.scenes.some((s) => !s.label);
    if (hasUnlabelled || threads.length === 0) threads.push({ name: threads.length ? "Unlabelled" : "Manuscript", color: null, key: null });
    const grid = document.createElement("div");
    grid.className = "lh-th";
    grid.style.gridTemplateColumns = `3rem repeat(${threads.length}, minmax(11rem, 1fr))`;
    const corner = document.createElement("div");
    corner.className = "lh-th-head";
    grid.appendChild(corner);
    for (const th of threads) grid.appendChild(labelled("div", "lh-th-head", th.name, th.color));
    if (tl.scenes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lh-tl-empty";
      empty.style.gridColumn = `1 / span ${threads.length + 1}`;
      empty.textContent = "No scenes in this project yet.";
      grid.appendChild(empty);
    }
    tl.scenes.forEach((s, i) => {
      const ord = document.createElement("div");
      ord.className = "lh-th-ord";
      ord.textContent = String(i + 1);
      grid.appendChild(ord);
      for (const th of threads) {
        const lane = document.createElement("div");
        lane.className = "lh-th-lane" + (i === tl.scenes.length - 1 ? " lh-th-lane-last" : "") + (i === 0 ? " lh-th-lane-first" : "");
        if (th.color !== null) lane.style.setProperty("--lane", laneColor(th.color));
        const mine = (s.label ?? null) === th.key;
        if (mine) lane.appendChild(cardFor(s, th.color));
        lane.addEventListener("dragover", (ev) => {
          if (!dragged || mine) return;
          ev.preventDefault();
          lane.classList.add("lh-th-lane-over");
        });
        lane.addEventListener("dragleave", () => lane.classList.remove("lh-th-lane-over"));
        lane.addEventListener("drop", (ev) => {
          ev.preventDefault();
          lane.classList.remove("lh-th-lane-over");
          if (!dragged || mine) return;
          const path = dragged;
          dragged = null;
          void write(() => model.setLabel(path, th.key));
        });
        grid.appendChild(lane);
      }
    });
    board.appendChild(grid);
  };

  let dragged: string | null = null;
  const cardFor = (s: SceneRef, color: number | null): HTMLElement => {
    const card = document.createElement("div");
    card.className = "lh-card";
    if (color !== null) card.style.borderLeftColor = laneColor(color);
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.draggable = true;
    const t = document.createElement("div");
    t.className = "lh-card-t";
    t.textContent = s.title;
    card.appendChild(t);
    if (s.synopsis) {
      const syn = document.createElement("div");
      syn.className = "lh-card-s";
      syn.textContent = s.synopsis;
      card.appendChild(syn);
    }
    const open = () => void core.host.openNote(s.doc.path);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
    card.addEventListener("dragstart", (ev) => {
      dragged = s.doc.path;
      card.classList.add("lh-card-dragging");
      ev.dataTransfer?.setData("text/plain", s.doc.path);
    });
    card.addEventListener("dragend", () => {
      dragged = null;
      card.classList.remove("lh-card-dragging");
    });
    return card;
  };

  /** Pins that would overlap in a track go to the next row down; the track grows to fit. */
  const layoutPins = () => {
    for (const track of board.querySelectorAll<HTMLElement>(".lh-tl-track:not(.lh-tl-track-written)")) {
      const pins = [...track.querySelectorAll<HTMLElement>(".lh-tl-pin")].sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));
      const rowEnds: number[] = [];
      const trackRect = track.getBoundingClientRect();
      for (const pin of pins) {
        pin.style.top = "";
        const tag = pin.querySelector<HTMLElement>(".lh-tl-tag");
        const width = tag ? tag.getBoundingClientRect().width : 80;
        const centre = trackRect.left + (parseFloat(pin.style.left) / 100) * trackRect.width;
        const left = centre - width / 2;
        let row = rowEnds.findIndex((end) => end + 8 <= left);
        if (row < 0) {
          row = rowEnds.length;
          rowEnds.push(0);
        }
        rowEnds[row] = left + width;
        pin.style.top = `${1.9 + row * 2.3}rem`;
        pin.style.setProperty("--row", String(row));
        pin.dataset["row"] = String(row);
      }
      track.style.height = `${2.6 + Math.max(1, rowEnds.length) * 2.3}rem`;
    }
  };
  const resize = new ResizeObserver(() => layoutPins());
  resize.observe(board);

  const pinFor = (item: Item, color: number | null): HTMLElement => {
    const pin = document.createElement("div");
    pin.className = "lh-tl-pin" + (item.kind === "event" ? " lh-tl-pin-event" : "");
    pin.style.left = `${fraction(item.start.days) * 100}%`;
    pin.tabIndex = 0;
    pin.setAttribute("role", "button");
    if (item.end) {
      const bar = document.createElement("span");
      bar.className = "lh-tl-range";
      bar.style.width = `${(fraction(item.end.days) - fraction(item.start.days)) * 100}%`;
      pin.appendChild(bar);
    }
    const tag = labelled("span", "lh-tl-tag", item.title, color);
    pin.appendChild(tag);
    const when = model.labelFor(item.start) + (item.end ? ` to ${model.labelFor(item.end)}` : "");
    pin.title = item.synopsis ? `${when}. ${item.synopsis}` : when;

    let startX = 0;
    let pressed = false;
    let dragging = false;
    pin.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      pressed = true;
      dragging = false;
      startX = ev.clientX;
      pin.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    pin.addEventListener("pointermove", (ev) => {
      if (!pressed) return;
      if (!dragging && Math.abs(ev.clientX - startX) < DRAG_THRESHOLD) return;
      dragging = true;
      pin.classList.add("lh-tl-pin-dragging");
      const track = pin.parentElement ?? board;
      pin.style.left = `${fraction(daysAt(ev.clientX, track)) * 100}%`;
      pin.title = model.labelFor({ ...item.start, days: Math.round(daysAt(ev.clientX, track)) });
    });
    const release = async (ev: PointerEvent) => {
      if (!pressed) return;
      pressed = false;
      pin.releasePointerCapture(ev.pointerId);
      pin.classList.remove("lh-tl-pin-dragging");
      if (dragging) {
        const days = daysAt(ev.clientX, pin.parentElement ?? board);
        await write(() => model.setDate(item.doc.path, days, item.start.precision));
      } else {
        await core.host.openNote(item.doc.path);
      }
    };
    pin.addEventListener("pointerup", (ev) => void release(ev));
    pin.addEventListener("pointercancel", () => {
      pressed = false;
      void render();
    });
    pin.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        void core.host.openNote(item.doc.path);
      }
    });
    return pin;
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

  const unsubscribe = core.host.onFileChanged((change) => {
    if (writing) return;
    if (!current || change.path.startsWith(current.root ? current.root + "/" : "")) void render();
  });
  void render();

  return {
    destroy() {
      disposed = true;
      resize.disconnect();
      unsubscribe();
      root.remove();
    },
  };
}

const LANE_COLORS = ["red", "blue", "green", "yellow", "sea", "moss", "graphite", "ink"];

export function laneColor(index: number): string {
  return `var(--lh-color-${LANE_COLORS[index % LANE_COLORS.length]})`;
}

/** An element carrying a thread's colour dot and a name. */
function labelled(tag: "span" | "div", className: string, name: string, color: number | null): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  if (color !== null) {
    const dot = document.createElement("i");
    dot.className = "lh-tl-lab";
    dot.style.background = laneColor(color);
    el.appendChild(dot);
  }
  el.append(document.createTextNode(name));
  return el;
}
