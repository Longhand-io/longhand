// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The drawing layer: an SVG over the map that renders shapes in the paper-and-ink style and
// hosts the tools. Coordinates on the note are fractions; here they are user units in a
// viewBox 1000 wide, so strokes, glyphs, and text scale with the map. No drawing library.

import type { Shape, ShapeStyle, ShapeType } from "../../core/spec.js";
import { alongLine, bounds, centroid, midpoint, simplify, type Point } from "./geometry.js";

export type Tool = "select" | "circle" | "rect" | "polygon" | "line" | "text";

export const VB_W = 1000;
const SVG = "http://www.w3.org/2000/svg";
const SIMPLIFY_TOLERANCE = 5; // user units; about half a percent of the width
const MIN_DRAG = 3; // user units before a press is a shape
const MOVE_THRESHOLD = 2;
const PEAK_SPACING = 34;
const LABEL_SIZE = 18;
const TEXT_SIZE = 24;

export interface DrawLayerOptions {
  onSelect(shape: Shape | null): void;
  /** commit a new shape list; the layer re-renders when setShapes is called back */
  onChange(shapes: Shape[]): void;
  onHover(shape: Shape, anchor: Element): void;
  onLeave(): void;
  promptText(): Promise<string | null>;
  newId(): string;
}

export interface DrawLayer {
  readonly svg: SVGSVGElement;
  setShapes(shapes: Shape[], aspect: number): void;
  setTool(tool: Tool): void;
  tool(): Tool;
  setStyle(style: ShapeStyle): void;
  select(id: string | null): void;
  selected(): Shape | null;
  destroy(): void;
}

export function createDrawLayer(stage: HTMLElement, opts: DrawLayerOptions): DrawLayer {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "lh-draw");
  svg.appendChild(defs());
  const shapesG = el("g", { class: "lh-draw-shapes" });
  const overlayG = el("g", { class: "lh-draw-overlay" });
  svg.append(shapesG, overlayG);
  stage.appendChild(svg);

  let shapes: Shape[] = [];
  let aspect = 1.6;
  let vbH = VB_W / aspect;
  let currentTool: Tool = "select";
  let currentStyle: ShapeStyle = "outline";
  let selectedId: string | null = null;
  const groups = new Map<string, SVGGElement>();

  const toUser = (p: Point): Point => [p[0] * VB_W, p[1] * vbH];
  const toFrac = (p: Point): Point => [clamp(p[0] / VB_W), clamp(p[1] / vbH)];
  const pointerUser = (ev: PointerEvent): Point => {
    const r = svg.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * VB_W, ((ev.clientY - r.top) / r.height) * vbH];
  };

  // ---- rendering ----
  const render = () => {
    svg.setAttribute("viewBox", `0 0 ${VB_W} ${vbH}`);
    shapesG.replaceChildren();
    groups.clear();
    for (const s of shapes) {
      const g = renderShape(s);
      groups.set(s.id, g);
      shapesG.appendChild(g);
    }
    renderSelection();
  };

  const renderShape = (s: Shape): SVGGElement => {
    const style = s.style ?? "outline";
    const g = el("g", { class: `lh-shape lh-shape-${s.type} lh-style-${style}`, "data-id": s.id }) as SVGGElement;
    let labelAt: Point | null = null;
    switch (s.type) {
      case "circle": {
        const [cx, cy] = toUser([s.x ?? 0, s.y ?? 0]);
        const r = (s.r ?? 0) * VB_W;
        g.appendChild(el("circle", { cx, cy, r, ...paint(style, true) }));
        if (style === "hills") g.appendChild(peaksInside(cx - r, cy - r, r * 2, r * 2, (x, y) => Math.hypot(x - cx, y - cy) < r));
        labelAt = [cx, cy];
        break;
      }
      case "rect": {
        const [x, y] = toUser([(s.x ?? 0) - (s.w ?? 0) / 2, (s.y ?? 0) - (s.h ?? 0) / 2]);
        const w = (s.w ?? 0) * VB_W;
        const h = (s.h ?? 0) * vbH;
        g.appendChild(el("rect", { x, y, width: w, height: h, ...paint(style, true) }));
        if (style === "hills") g.appendChild(peaksInside(x, y, w, h, () => true));
        labelAt = [x + w / 2, y + h / 2];
        break;
      }
      case "polygon": {
        const pts = (s.points ?? []).map(toUser);
        const d = pathOf(pts, true);
        g.appendChild(el("path", { d, ...paint(style, true) }));
        if (style === "hills") {
          const b = bounds(pts);
          g.appendChild(peaksInside(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY, (x, y) => inPolygon([x, y], pts)));
        }
        labelAt = centroid(pts);
        break;
      }
      case "line": {
        const pts = (s.points ?? []).map(toUser);
        const d = pathOf(pts, false);
        if (style === "hills") {
          g.appendChild(el("path", { d, fill: "none", stroke: "transparent", "stroke-width": 24 }));
          g.appendChild(peaksAlong(pts));
        } else {
          g.appendChild(el("path", { d, fill: "none", stroke: "transparent", "stroke-width": 18, class: "lh-hit" }));
          g.appendChild(el("path", { d, ...paint(style, false) }));
          if (style === "route" && pts.length >= 2) g.appendChild(arrowHead(pts));
        }
        labelAt = midpoint(pts);
        if (labelAt) labelAt = [labelAt[0], labelAt[1] - 8];
        break;
      }
      case "text": {
        const [x, y] = toUser([s.x ?? 0, s.y ?? 0]);
        const t = el("text", { x, y, class: "lh-shape-label lh-shape-text", "font-size": TEXT_SIZE, "text-anchor": "middle" });
        t.textContent = s.label ?? "";
        g.appendChild(t);
        labelAt = null;
        break;
      }
    }
    if (labelAt && s.label) {
      const t = el("text", { x: labelAt[0], y: labelAt[1], class: "lh-shape-label", "font-size": LABEL_SIZE, "text-anchor": "middle" });
      t.textContent = s.label;
      g.appendChild(t);
    }
    if (s.to) g.classList.add("lh-shape-linked");
    wireShape(g, s);
    return g;
  };

  const renderSelection = () => {
    overlayG.replaceChildren();
    const s = shapes.find((x) => x.id === selectedId);
    if (!s) return;
    const b = shapeBounds(s);
    if (!b) return;
    overlayG.appendChild(
      el("rect", { x: b.minX - 6, y: b.minY - 6, width: b.maxX - b.minX + 12, height: b.maxY - b.minY + 12, class: "lh-draw-selection" }),
    );
    if (s.type === "circle" || s.type === "rect") {
      const handle = el("circle", { cx: b.maxX, cy: s.type === "circle" ? (b.minY + b.maxY) / 2 : b.maxY, r: 7, class: "lh-draw-handle" });
      wireResize(handle, s);
      overlayG.appendChild(handle);
    }
  };

  const shapeBounds = (s: Shape) => {
    switch (s.type) {
      case "circle": {
        const [cx, cy] = toUser([s.x ?? 0, s.y ?? 0]);
        const r = (s.r ?? 0) * VB_W;
        return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
      }
      case "rect": {
        const [x, y] = toUser([(s.x ?? 0) - (s.w ?? 0) / 2, (s.y ?? 0) - (s.h ?? 0) / 2]);
        return { minX: x, minY: y, maxX: x + (s.w ?? 0) * VB_W, maxY: y + (s.h ?? 0) * vbH };
      }
      case "polygon":
      case "line":
        return bounds((s.points ?? []).map(toUser));
      case "text": {
        const [x, y] = toUser([s.x ?? 0, s.y ?? 0]);
        const w = ((s.label ?? "").length * TEXT_SIZE) / 1.8;
        return { minX: x - w / 2, minY: y - TEXT_SIZE, maxX: x + w / 2, maxY: y + 6 };
      }
    }
  };

  // ---- interaction: select and move ----
  const wireShape = (g: SVGGElement, s: Shape) => {
    g.addEventListener("mouseenter", () => {
      if (s.to) opts.onHover(s, g);
    });
    g.addEventListener("mouseleave", () => {
      if (s.to) opts.onLeave();
    });
    g.addEventListener("pointerdown", (ev) => {
      if (currentTool !== "select" || ev.button !== 0) return;
      ev.stopPropagation();
      ev.preventDefault();
      const start = pointerUser(ev);
      let moved = false;
      g.setPointerCapture(ev.pointerId);
      const onMove = (mv: PointerEvent) => {
        const p = pointerUser(mv);
        const dx = p[0] - start[0];
        const dy = p[1] - start[1];
        if (!moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
        moved = true;
        g.setAttribute("transform", `translate(${dx} ${dy})`);
        overlayG.setAttribute("transform", `translate(${dx} ${dy})`);
      };
      const onUp = (up: PointerEvent) => {
        g.removeEventListener("pointermove", onMove);
        g.removeEventListener("pointerup", onUp);
        g.removeEventListener("pointercancel", onUp);
        g.releasePointerCapture(up.pointerId);
        g.removeAttribute("transform");
        overlayG.removeAttribute("transform");
        select(s.id);
        if (moved) {
          const p = pointerUser(up);
          commit(shapes.map((x) => (x.id === s.id ? translated(x, (p[0] - start[0]) / VB_W, (p[1] - start[1]) / vbH) : x)));
        }
      };
      g.addEventListener("pointermove", onMove);
      g.addEventListener("pointerup", onUp);
      g.addEventListener("pointercancel", onUp);
    });
  };

  const wireResize = (handle: SVGElement, s: Shape) => {
    handle.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      ev.stopPropagation();
      ev.preventDefault();
      handle.setPointerCapture(ev.pointerId);
      const [cx, cy] = toUser([s.x ?? 0, s.y ?? 0]);
      let next: Shape = s;
      const onMove = (mv: PointerEvent) => {
        const p = pointerUser(mv);
        if (s.type === "circle") {
          next = { ...s, r: Math.max(MIN_DRAG, Math.hypot(p[0] - cx, p[1] - cy)) / VB_W };
        } else {
          next = { ...s, w: Math.max(MIN_DRAG, (p[0] - cx) * 2) / VB_W, h: Math.max(MIN_DRAG, (p[1] - cy) * 2) / vbH };
        }
        const g = groups.get(s.id);
        if (g) {
          const fresh = renderShape(next);
          shapesG.replaceChild(fresh, g);
          groups.set(s.id, fresh);
        }
      };
      const onUp = (up: PointerEvent) => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.releasePointerCapture(up.pointerId);
        if (next !== s) commit(shapes.map((x) => (x.id === s.id ? next : x)));
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  };

  // ---- interaction: drawing tools ----
  let drawing: { start: Point; points: Point[]; temp: SVGElement | null } | null = null;

  svg.addEventListener("pointerdown", (ev) => {
    if (currentTool === "select" || ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const p = pointerUser(ev);
    if (currentTool === "text") {
      void opts.promptText().then((text) => {
        if (!text || !text.trim()) return;
        const [x, y] = toFrac(p);
        commit([...shapes, { id: opts.newId(), type: "text", x, y, label: text.trim() }], true);
      });
      return;
    }
    svg.setPointerCapture(ev.pointerId);
    drawing = { start: p, points: [p], temp: null };
  });

  svg.addEventListener("pointermove", (ev) => {
    if (!drawing) return;
    const p = pointerUser(ev);
    drawing.points.push(p);
    drawing.temp?.remove();
    drawing.temp = previewOf(currentTool, drawing.start, p, drawing.points);
    if (drawing.temp) overlayG.appendChild(drawing.temp);
  });

  const finishDrawing = (ev: PointerEvent) => {
    if (!drawing) return;
    const d = drawing;
    drawing = null;
    d.temp?.remove();
    svg.releasePointerCapture(ev.pointerId);
    const p = pointerUser(ev);
    const shape = shapeFrom(currentTool, d.start, p, d.points);
    if (shape) commit([...shapes, shape], true);
  };
  svg.addEventListener("pointerup", finishDrawing);
  svg.addEventListener("pointercancel", finishDrawing);

  const previewOf = (tool: Tool, start: Point, p: Point, points: Point[]): SVGElement | null => {
    const paintAttrs = { ...paint(currentStyle, tool === "polygon"), class: "lh-draw-preview" };
    switch (tool) {
      case "circle":
        return el("circle", { cx: start[0], cy: start[1], r: Math.hypot(p[0] - start[0], p[1] - start[1]), ...paintAttrs });
      case "rect":
        return el("rect", {
          x: Math.min(start[0], p[0]),
          y: Math.min(start[1], p[1]),
          width: Math.abs(p[0] - start[0]),
          height: Math.abs(p[1] - start[1]),
          ...paintAttrs,
        });
      case "polygon":
        return el("path", { d: pathOf(points, true), ...paintAttrs });
      case "line":
        return el("path", { d: pathOf(points, false), fill: "none", ...paint(currentStyle, false), class: "lh-draw-preview" });
      default:
        return null;
    }
  };

  const shapeFrom = (tool: Tool, start: Point, p: Point, points: Point[]): Shape | null => {
    const id = opts.newId();
    const style = currentStyle;
    switch (tool) {
      case "circle": {
        const r = Math.hypot(p[0] - start[0], p[1] - start[1]);
        if (r < MIN_DRAG) return null;
        const [x, y] = toFrac(start);
        return { id, type: "circle", x, y, r: r / VB_W, style };
      }
      case "rect": {
        const w = Math.abs(p[0] - start[0]);
        const h = Math.abs(p[1] - start[1]);
        if (w < MIN_DRAG || h < MIN_DRAG) return null;
        const [x, y] = toFrac([(start[0] + p[0]) / 2, (start[1] + p[1]) / 2]);
        return { id, type: "rect", x, y, w: w / VB_W, h: h / vbH, style };
      }
      case "polygon": {
        const pts = simplify(points, SIMPLIFY_TOLERANCE);
        if (pts.length < 3) return null;
        return { id, type: "polygon", points: pts.map(toFrac), style };
      }
      case "line": {
        const pts = simplify(points, SIMPLIFY_TOLERANCE);
        if (pts.length < 2) return null;
        return { id, type: "line", points: pts.map(toFrac), style };
      }
      default:
        return null;
    }
  };

  // ---- api ----
  const commit = (next: Shape[], selectNew = false) => {
    const added = selectNew ? next[next.length - 1] : undefined;
    if (added) selectedId = added.id;
    opts.onChange(next);
  };

  function select(id: string | null) {
    selectedId = id;
    renderSelection();
    opts.onSelect(shapes.find((x) => x.id === id) ?? null);
  }

  return {
    svg,
    setShapes(next, nextAspect) {
      shapes = next;
      aspect = nextAspect;
      vbH = VB_W / aspect;
      render();
      if (selectedId && !shapes.some((x) => x.id === selectedId)) selectedId = null;
      opts.onSelect(shapes.find((x) => x.id === selectedId) ?? null);
    },
    setTool(tool) {
      currentTool = tool;
      svg.classList.toggle("lh-draw-active", tool !== "select");
      stage.classList.toggle("lh-map-drawing", tool !== "select");
      if (tool !== "select") select(null);
    },
    tool: () => currentTool,
    setStyle(style) {
      currentStyle = style;
    },
    select,
    selected: () => shapes.find((x) => x.id === selectedId) ?? null,
    destroy() {
      svg.remove();
    },
  };
}

// ---- the paper-and-ink palette ----

function paint(style: ShapeStyle, closed: boolean): { [attr: string]: string | number } {
  switch (style) {
    case "wood":
      return closed ? { fill: "url(#lh-wood)", stroke: "#9AA898", "stroke-width": 1 } : { fill: "none", stroke: "#9AA898", "stroke-width": 1.5 };
    case "water":
      return closed ? { fill: "#CFD9DD", stroke: "#A9B9C1", "stroke-width": 1 } : { fill: "none", stroke: "#9DB0BF", "stroke-width": 2.5, "stroke-linecap": "round" };
    case "hills":
      return { fill: closed ? "transparent" : "none", stroke: "none" };
    case "road":
      return { fill: closed ? "transparent" : "none", stroke: "#B8B2A4", "stroke-width": 1.4, "stroke-dasharray": "5 4" };
    case "river":
      return { fill: closed ? "transparent" : "none", stroke: "#9DB0BF", "stroke-width": 2.6, "stroke-linecap": "round", "stroke-linejoin": "round" };
    case "route":
      return { fill: closed ? "transparent" : "none", stroke: "var(--lh-ink)", "stroke-width": 1.6, "stroke-dasharray": "3 4", "stroke-linecap": "round" };
    case "outline":
    default:
      return { fill: closed ? "transparent" : "none", stroke: "#8F978B", "stroke-width": 1.2, "stroke-linejoin": "round" };
  }
}

function defs(): SVGDefsElement {
  const d = el("defs") as SVGDefsElement;
  const wood = el("pattern", { id: "lh-wood", width: 12, height: 12, patternUnits: "userSpaceOnUse" });
  wood.append(
    el("rect", { width: 12, height: 12, fill: "#DCE3D6" }),
    el("circle", { cx: 3.5, cy: 3.5, r: 1.6, fill: "#A9B8A3" }),
    el("circle", { cx: 9.5, cy: 8.5, r: 1.4, fill: "#A9B8A3" }),
  );
  d.appendChild(wood);
  return d;
}

function peak(x: number, y: number, size = 22): SVGElement {
  const g = el("g", { class: "lh-peak" });
  const half = size / 2;
  g.append(
    el("path", { d: `M${x - half} ${y} l ${half} ${-size * 0.9} l ${half} ${size * 0.9} z`, fill: "#C4C9BE", stroke: "#8F978B", "stroke-width": 1, "stroke-linejoin": "round" }),
    el("path", { d: `M${x} ${y - size * 0.9} l ${size * 0.16} ${size * 0.28} l ${-size * 0.32} 0 z`, fill: "#F3F4F1" }),
  );
  return g;
}

function peaksAlong(pts: Point[]): SVGElement {
  const g = el("g");
  for (const [x, y] of alongLine(pts, PEAK_SPACING)) g.appendChild(peak(x, y));
  return g;
}

function peaksInside(x: number, y: number, w: number, h: number, inside: (px: number, py: number) => boolean): SVGElement {
  const g = el("g");
  const step = PEAK_SPACING;
  let row = 0;
  for (let py = y + step * 0.8; py <= y + h; py += step * 0.75, row++) {
    for (let px = x + (row % 2 ? step / 2 : 0) + step / 2; px <= x + w; px += step) {
      if (inside(px, py)) g.appendChild(peak(px, py));
    }
  }
  return g;
}

function arrowHead(pts: Point[]): SVGElement {
  const a = pts[pts.length - 2]!;
  const b = pts[pts.length - 1]!;
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const size = 9;
  const p1: Point = [b[0] - size * Math.cos(angle - 0.5), b[1] - size * Math.sin(angle - 0.5)];
  const p2: Point = [b[0] - size * Math.cos(angle + 0.5), b[1] - size * Math.sin(angle + 0.5)];
  return el("path", { d: `M${p1[0]} ${p1[1]} L${b[0]} ${b[1]} L${p2[0]} ${p2[1]}`, fill: "none", stroke: "var(--lh-ink)", "stroke-width": 1.6, "stroke-linecap": "round" });
}

function pathOf(pts: Point[], closed: boolean): string {
  if (pts.length === 0) return "";
  const parts = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`);
  return parts.join(" ") + (closed ? " Z" : "");
}

function inPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    const hit = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function translated(s: Shape, dx: number, dy: number): Shape {
  const c = (n: number) => Math.min(1, Math.max(0, n));
  const out: Shape = { ...s };
  if (s.x !== undefined) out.x = c(s.x + dx);
  if (s.y !== undefined) out.y = c(s.y + dy);
  if (s.points) out.points = s.points.map(([x, y]) => [c(x + dx), c(y + dy)] as Point);
  return out;
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function el(name: string, attrs: { [attr: string]: string | number } = {}): SVGElement {
  const e = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "select", label: "Select", hint: "Click a shape to select it, drag to move it" },
  { id: "circle", label: "Circle", hint: "Drag from the centre" },
  { id: "rect", label: "Rectangle", hint: "Drag a corner" },
  { id: "polygon", label: "Region", hint: "Draw around an area; it closes itself" },
  { id: "line", label: "Line", hint: "Draw a river, road, or route" },
  { id: "text", label: "Label", hint: "Click where the words go" },
];

export const STYLE_LABELS: { [k in ShapeStyle]: string } = {
  outline: "Outline",
  wood: "Wood",
  water: "Water",
  hills: "Hills",
  road: "Road",
  river: "River",
  route: "Route",
};

export type { ShapeType };
