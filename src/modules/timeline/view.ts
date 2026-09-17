// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The timeline view. A ruler, one track per thread, pins as tags in the thread's colour,
// events dashed, ranges as bars, a Written track of dots from `created`, and a tray of
// undated scenes. Click a pin to open its note; drag it along the axis to change its date.

import type { Core } from "../../core/modules.js";
import type { ViewHandle } from "../../host/host.js";
import { fromDays } from "../../core/storydate.js";
import { TimelineModel, type Item, type SceneRef, type Timeline } from "./model.js";

const DRAG_THRESHOLD = 4;
type Axis = "story" | "manuscript";

export function mountTimelineView(core: Core, el: HTMLElement, anchorPath: string): ViewHandle {
  const model = new TimelineModel(core, anchorPath);
  const root = document.createElement("div");
  root.className = "lh-root lh-tl";
  el.appendChild(root);

  const head = document.createElement("div");
  head.className = "lh-tl-head";
  const title = document.createElement("div");
  title.className = "lh-tl-title";
  const hint = document.createElement("div");
  hint.className = "lh-tl-hint";
  const axisRow = document.createElement("div");
  axisRow.className = "lh-tl-axis";
  const axisLabel = document.createElement("span");
  axisLabel.textContent = "Axis";
  const axisButtons = new Map<Axis, HTMLButtonElement>();
  for (const [id, label] of [["manuscript", "Manuscript order"], ["story", "Story date"]] as [Axis, string][]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lh-map-tool";
    b.textContent = label;
    b.addEventListener("click", () => {
      axis = id;
      axisChosen = true;
      void render();
    });
    axisButtons.set(id, b);
  }
  axisRow.append(axisLabel, ...axisButtons.values());
  head.append(title, hint, axisRow);
  let axis: Axis = "story";
  let axisChosen = false;

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
    title.textContent = `${tl.projectTitle}`;
    board.replaceChildren();
    const dated = tl.lanes.some((l) => l.items.length > 0);
    if (!axisChosen) axis = dated ? "story" : "manuscript";
    for (const [id, b] of axisButtons) b.classList.toggle("lh-map-tool-active", id === axis);
    hint.textContent =
      axis === "story"
        ? `Story date${tl.calendar.kind === "gregorian" ? "" : tl.calendar.kind === "custom" ? ", this project's own calendar" : ", counted"}. Click a pin to open its scene, drag it to change the date. Events are dashed.`
        : "Manuscript order. Every scene in binder order, in its thread. Click a pin to open it; switch to story date to place scenes in time.";

    if (axis === "manuscript") {
      renderManuscript(tl);
      return;
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
      const name = document.createElement("span");
      name.className = "lh-tl-lane-name";
      if (lane.color !== null) {
        const dot = document.createElement("i");
        dot.className = "lh-tl-lab";
        dot.style.background = laneColor(lane.color);
        name.appendChild(dot);
      }
      name.append(document.createTextNode(lane.name));
      track.appendChild(name);
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
        dot.title = `${w.title}, created ${formatDays(w.days)}`;
        dot.addEventListener("click", () => void core.host.openNote(w.doc.path));
        track.appendChild(dot);
      }
      board.appendChild(track);
    }

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

  /** The manuscript-order axis: every scene, dated or not, evenly along the binder. */
  const renderManuscript = (tl: Timeline) => {
    tray.replaceChildren();
    const ruler = document.createElement("div");
    ruler.className = "lh-tl-ruler";
    const parts = new Map<string, number>();
    tl.scenes.forEach((s, i) => {
      const rel = tl.root ? s.doc.path.slice(tl.root.length + 1) : s.doc.path;
      const segs = rel.split("/");
      const part = segs.length > 2 ? (segs[1] ?? "").replace(/^\d+\s+/, "") : "";
      if (part && !parts.has(part)) parts.set(part, i);
    });
    for (const [part, i] of parts) {
      const tick = document.createElement("span");
      tick.className = "lh-tl-tick lh-tl-tick-major";
      tick.style.left = `${(tl.scenes[i]?.position ?? 0) * 100}%`;
      tick.style.transform = "none";
      tick.textContent = part;
      ruler.appendChild(tick);
    }
    board.appendChild(ruler);
    const lanes: { name: string; color: number | null; scenes: SceneRef[] }[] = [];
    tl.labels.forEach((name, i) => {
      const items = tl.scenes.filter((s) => s.label === name);
      if (items.length) lanes.push({ name, color: i, scenes: items });
    });
    const unl = tl.scenes.filter((s) => !s.label);
    if (unl.length) lanes.push({ name: lanes.length ? "Unlabelled" : "Manuscript", color: null, scenes: unl });
    for (const lane of lanes) {
      const track = document.createElement("div");
      track.className = "lh-tl-track";
      const name = document.createElement("span");
      name.className = "lh-tl-lane-name";
      if (lane.color !== null) {
        const dot = document.createElement("i");
        dot.className = "lh-tl-lab";
        dot.style.background = laneColor(lane.color);
        name.appendChild(dot);
      }
      name.append(document.createTextNode(lane.name));
      track.appendChild(name);
      for (const s of lane.scenes) {
        const pin = document.createElement("div");
        pin.className = "lh-tl-pin lh-tl-pin-static";
        pin.style.left = `${4 + s.position * 92}%`;
        pin.tabIndex = 0;
        pin.setAttribute("role", "button");
        const tag = document.createElement("span");
        tag.className = "lh-tl-tag";
        if (lane.color !== null) {
          const dot = document.createElement("i");
          dot.className = "lh-tl-lab";
          dot.style.background = laneColor(lane.color);
          tag.appendChild(dot);
        }
        tag.append(document.createTextNode(s.title));
        pin.appendChild(tag);
        pin.title = s.synopsis ?? s.title;
        const open = () => void core.host.openNote(s.doc.path);
        pin.addEventListener("click", open);
        pin.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            open();
          }
        });
        track.appendChild(pin);
      }
      board.appendChild(track);
    }
    if (lanes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lh-tl-empty";
      empty.textContent = "No scenes in this project yet.";
      board.appendChild(empty);
    }
  };

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
    const tag = document.createElement("span");
    tag.className = "lh-tl-tag";
    if (color !== null) {
      const dot = document.createElement("i");
      dot.className = "lh-tl-lab";
      dot.style.background = laneColor(color);
      tag.appendChild(dot);
    }
    tag.append(document.createTextNode(item.title));
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
      unsubscribe();
      root.remove();
    },
  };
}

const LANE_COLORS = ["red", "blue", "green", "yellow", "sea", "moss", "graphite", "ink"];

export function laneColor(index: number): string {
  return `var(--lh-color-${LANE_COLORS[index % LANE_COLORS.length]})`;
}

function formatDays(days: number): string {
  const { year, month, day } = fromDays(days);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
