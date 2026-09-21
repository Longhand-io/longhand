// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Typed access to spec fields on a note. Everything goes through frontmatter.ts so
// unknown fields survive every write.

import type { Host } from "../host/host.js";
import * as fm from "./frontmatter.js";
import type { Value } from "./frontmatter.js";

export const SPEC_VERSION = 1;

export type NoteType = "text" | "folder" | "pdf" | "image" | "web" | "other" | "event" | "character" | "setting" | "map";

/** What each note type is, as a writer names it, and whether it carries prose. */
export const NOTE_TYPES: { id: NoteType; label: string; prose: boolean }[] = [
  { id: "text", label: "Scene", prose: true },
  { id: "folder", label: "Folder", prose: true },
  { id: "character", label: "Character", prose: false },
  { id: "setting", label: "Place", prose: false },
  { id: "event", label: "Event", prose: false },
  { id: "map", label: "Map", prose: false },
  { id: "pdf", label: "Research", prose: false },
  { id: "image", label: "Image", prose: false },
  { id: "web", label: "Web page", prose: false },
  { id: "other", label: "Research", prose: false },
];

/** A document that carries manuscript prose: a scene, a folder note, or a note with no type. */
export function isProse(doc: { type: NoteType | null }): boolean {
  return doc.type === null || NOTE_TYPES.find((t) => t.id === doc.type)?.prose === true;
}

export function typeLabel(type: NoteType | null): string {
  return NOTE_TYPES.find((t) => t.id === type)?.label ?? "Note";
}

export interface Document {
  path: string;
  id: string | null;
  title: string | null;
  type: NoteType | null;
  order: number | null;
  fields: fm.Frontmatter;
}

export interface Pin {
  to: string;
  x: number;
  y: number;
  label?: string;
}

export type ShapeType = "circle" | "rect" | "polygon" | "line" | "text";
export type ShapeStyle = "outline" | "wood" | "water" | "hills" | "road" | "river" | "route";
export const SHAPE_STYLES: ShapeStyle[] = ["outline", "wood", "water", "hills", "road", "river", "route"];
export type ShapeColor = "ink" | "graphite" | "red" | "blue" | "green" | "yellow" | "sea" | "moss";
export const SHAPE_COLORS: ShapeColor[] = ["ink", "graphite", "red", "blue", "green", "yellow", "sea", "moss"];

/** A drawn shape on a map. Coordinates are fractions of the drawn width and height, like pins. */
export interface Shape {
  id: string;
  type: ShapeType;
  /** circle, rect, text: the centre */
  x?: number;
  y?: number;
  /** circle: radius as a fraction of the width */
  r?: number;
  /** rect: size */
  w?: number;
  h?: number;
  /** polygon, line: the points */
  points?: [number, number][];
  style?: ShapeStyle;
  /** a named ink from the brand palette; themes map names to values */
  color?: ShapeColor;
  /** drawn by hand: a slightly wavering double stroke instead of a clean one */
  hand?: boolean;
  label?: string;
  to?: string;
  tags?: string[];
}

export interface MapNote extends Document {
  /** the raw `image` link text, or null for a blank canvas */
  image: string | null;
  width: number | null;
  height: number | null;
  relief: string | null;
  pins: Pin[];
  shapes: Shape[];
}

export class Spec {
  constructor(private readonly host: Host) {}

  async read(path: string): Promise<Document> {
    const text = await this.host.readFile(path);
    return this.fromText(path, text);
  }

  fromText(path: string, text: string): Document {
    const fields = fm.parse(text);
    return {
      path,
      id: str(fm.get(fields, "id")),
      title: str(fm.get(fields, "title")),
      type: str(fm.get(fields, "type")) as NoteType | null,
      order: num(fm.get(fields, "order")),
      fields,
    };
  }

  async readMap(path: string): Promise<MapNote> {
    const doc = await this.read(path);
    return this.mapFromDocument(doc);
  }

  mapFromDocument(doc: Document): MapNote {
    const raw = fm.get(doc.fields, "pins");
    const pins: Pin[] = [];
    if (Array.isArray(raw)) {
      for (const p of raw) {
        if (typeof p !== "object" || p === null || Array.isArray(p)) continue;
        const to = str(p["to"]);
        const x = num(p["x"]);
        const y = num(p["y"]);
        if (to === null || x === null || y === null) continue;
        const pin: Pin = { to, x: clamp01(x), y: clamp01(y) };
        const label = str(p["label"]);
        if (label !== null) pin.label = label;
        pins.push(pin);
      }
    }
    const rawShapes = fm.get(doc.fields, "shapes");
    const shapes: Shape[] = [];
    if (Array.isArray(rawShapes)) {
      for (const s of rawShapes) {
        const shape = shapeFromValue(s);
        if (shape) shapes.push(shape);
      }
    }
    return {
      ...doc,
      image: str(fm.get(doc.fields, "image")),
      width: num(fm.get(doc.fields, "width")),
      height: num(fm.get(doc.fields, "height")),
      relief: str(fm.get(doc.fields, "relief")),
      pins,
      shapes,
    };
  }

  async setShapes(path: string, shapes: Shape[]): Promise<boolean> {
    return this.setField(path, "shapes", shapes.map(shapeToValue));
  }

  /** Write one field and save. Returns false when nothing changed. */
  async setField(path: string, key: string, value: Value | undefined): Promise<boolean> {
    const before = await this.host.readFile(path, true);
    const fields = fm.parse(before);
    fm.set(fields, key, value);
    const after = fm.serialize(fields);
    if (after === before) return false;
    await this.host.writeFile(path, after);
    return true;
  }

  async setPins(path: string, pins: Pin[]): Promise<boolean> {
    const value: Value[] = pins.map((p) => {
      const o: { [k: string]: Value } = { to: p.to, x: round(p.x), y: round(p.y) };
      if (p.label !== undefined && p.label !== "") o["label"] = p.label;
      return o;
    });
    return this.setField(path, "pins", value);
  }

  /** The spec version a project note declares; null when it has none. */
  projectVersion(text: string): number | null {
    return num(fm.get(fm.parse(text), "longhand"));
  }

  /** Text for a brand-new note. */
  newNote(fields: { [k: string]: Value }, body = ""): string {
    const f: fm.Frontmatter = { entries: [], body, present: true, newline: "\n" };
    for (const [k, v] of Object.entries(fields)) fm.set(f, k, v);
    return fm.serialize(f);
  }
}

function shapeFromValue(v: Value): Shape | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const id = str(v["id"]);
  const type = str(v["type"]);
  if (!id || !type || !["circle", "rect", "polygon", "line", "text"].includes(type)) return null;
  const s: Shape = { id, type: type as ShapeType };
  for (const k of ["x", "y"] as const) {
    const n = num(v[k]);
    if (n !== null) s[k] = clamp01(n);
  }
  for (const k of ["r", "w", "h"] as const) {
    const n = num(v[k]);
    if (n !== null) s[k] = Math.max(0, n);
  }
  const pts = str(v["points"]);
  if (pts !== null) s.points = parsePoints(pts);
  const style = str(v["style"]);
  if (style !== null && (SHAPE_STYLES as string[]).includes(style)) s.style = style as ShapeStyle;
  const color = str(v["color"]);
  if (color !== null && (SHAPE_COLORS as string[]).includes(color)) s.color = color as ShapeColor;
  if (v["hand"] === true) s.hand = true;
  const label = str(v["label"]);
  if (label !== null) s.label = label;
  const to = str(v["to"]);
  if (to !== null) s.to = to;
  const tags = v["tags"];
  if (Array.isArray(tags)) s.tags = tags.filter((t): t is string => typeof t === "string");
  if ((s.type === "polygon" || s.type === "line") && (!s.points || s.points.length < 2)) return null;
  if ((s.type === "circle" || s.type === "rect" || s.type === "text") && (s.x === undefined || s.y === undefined)) return null;
  return s;
}

function shapeToValue(s: Shape): { [k: string]: Value } {
  const o: { [k: string]: Value } = { id: s.id, type: s.type };
  for (const k of ["x", "y", "r", "w", "h"] as const) if (s[k] !== undefined) o[k] = round(s[k]);
  if (s.points) o["points"] = formatPoints(s.points);
  if (s.style) o["style"] = s.style;
  if (s.color) o["color"] = s.color;
  if (s.hand) o["hand"] = true;
  if (s.label !== undefined && s.label !== "") o["label"] = s.label;
  if (s.to) o["to"] = s.to;
  if (s.tags && s.tags.length) o["tags"] = s.tags;
  return o;
}

/** "0.12,0.44 0.2,0.5" to pairs; the SVG points format, so it stays readable in YAML. */
export function parsePoints(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const pair of text.trim().split(/\s+/)) {
    const [a, b] = pair.split(",");
    const x = Number(a);
    const y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([clamp01(x), clamp01(y)]);
  }
  return out;
}

export function formatPoints(points: [number, number][]): string {
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
}

function str(v: Value | undefined): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function num(v: Value | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round(n: number): number {
  return Math.round(clamp01(n) * 10000) / 10000;
}
