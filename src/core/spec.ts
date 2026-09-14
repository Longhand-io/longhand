// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Typed access to spec fields on a note. Everything goes through frontmatter.ts so
// unknown fields survive every write.

import type { Host } from "../host/host.js";
import * as fm from "./frontmatter.js";
import type { Value } from "./frontmatter.js";

export const SPEC_VERSION = 1;

export type NoteType = "text" | "folder" | "pdf" | "image" | "web" | "other" | "event" | "character" | "setting" | "map";

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

export interface MapNote extends Document {
  /** the raw `image` link text, or null for a blank canvas */
  image: string | null;
  width: number | null;
  height: number | null;
  relief: string | null;
  pins: Pin[];
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
    return {
      ...doc,
      image: str(fm.get(doc.fields, "image")),
      width: num(fm.get(doc.fields, "width")),
      height: num(fm.get(doc.fields, "height")),
      relief: str(fm.get(doc.fields, "relief")),
      pins,
    };
  }

  /** Write one field and save. Returns false when nothing changed. */
  async setField(path: string, key: string, value: Value | undefined): Promise<boolean> {
    const before = await this.host.readFile(path);
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
