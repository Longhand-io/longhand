// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The map model: everything the map does to a note, with no DOM. The view calls this;
// the tests call this. Every change is one frontmatter write of `pins` and nothing else.

import type { Core } from "../../core/modules.js";
import { IMAGE_EXTENSIONS } from "../../host/host.js";
import { clamp01, type MapNote, type Pin, type Shape } from "../../core/spec.js";
import { baseName, linkLabel, resolveLinkText } from "../../core/wikilink.js";
import { newId } from "../../core/naming.js";

export { IMAGE_EXTENSIONS };
export const DEFAULT_CANVAS = { width: 1600, height: 1000 };

export interface ResolvedMap extends MapNote {
  /** vault path of the image, or null for a blank canvas or a broken link */
  imagePath: string | null;
  /** aspect ratio to draw at, width / height; from `width` and `height` when present */
  aspect: number | null;
}

export class MapModel {
  constructor(
    private readonly core: Core,
    readonly path: string,
  ) {}

  async load(): Promise<ResolvedMap> {
    const note = await this.core.spec.readMap(this.path);
    const imagePath = note.image ? this.resolve(note.image) : null;
    const aspect = note.width && note.height && note.width > 0 && note.height > 0 ? note.width / note.height : null;
    return { ...note, imagePath, aspect };
  }

  /** A link as written on this note, to a vault path; null when it does not resolve. */
  resolve(linkText: string): string | null {
    return resolveLinkText(this.core.host.resolveLink.bind(this.core.host), linkText, this.path);
  }

  /** The vault path a pin points at, or null when the link does not resolve. */
  targetOf(pin: Pin): string | null {
    return this.resolve(pin.to);
  }

  labelOf(pin: Pin): string {
    return pin.label || linkLabel(pin.to);
  }

  async addPin(targetPath: string, x: number, y: number, label?: string): Promise<Pin> {
    const note = await this.core.spec.readMap(this.path);
    const pin: Pin = { to: this.core.host.linkTo(targetPath, this.path), x: clamp01(x), y: clamp01(y) };
    if (label && label !== baseName(targetPath)) pin.label = label;
    await this.core.spec.setPins(this.path, [...note.pins, pin]);
    return pin;
  }

  async movePin(index: number, x: number, y: number): Promise<void> {
    const note = await this.core.spec.readMap(this.path);
    const pin = note.pins[index];
    if (!pin) return;
    note.pins[index] = { ...pin, x: clamp01(x), y: clamp01(y) };
    await this.core.spec.setPins(this.path, note.pins);
  }

  async setLabel(index: number, label: string): Promise<void> {
    const note = await this.core.spec.readMap(this.path);
    const pin = note.pins[index];
    if (!pin) return;
    const next: Pin = { to: pin.to, x: pin.x, y: pin.y };
    if (label.trim() !== "") next.label = label.trim();
    note.pins[index] = next;
    await this.core.spec.setPins(this.path, note.pins);
  }

  async removePin(index: number): Promise<void> {
    const note = await this.core.spec.readMap(this.path);
    if (!note.pins[index]) return;
    note.pins.splice(index, 1);
    await this.core.spec.setPins(this.path, note.pins);
  }

  // ---- shapes ----

  async setShapes(shapes: Shape[]): Promise<void> {
    await this.core.spec.setShapes(this.path, shapes);
  }

  /** Merge `patch` into one shape; a key set to undefined removes that field. */
  async updateShape(id: string, patch: { [K in keyof Shape]?: Shape[K] | undefined }): Promise<void> {
    const note = await this.core.spec.readMap(this.path);
    const next = note.shapes.map((s) => (s.id === id ? clean({ ...s, ...patch } as Shape) : s));
    await this.core.spec.setShapes(this.path, next);
  }

  async removeShape(id: string): Promise<void> {
    const note = await this.core.spec.readMap(this.path);
    await this.core.spec.setShapes(this.path, note.shapes.filter((s) => s.id !== id));
  }

  async linkShape(id: string, targetPath: string | null): Promise<void> {
    const to = targetPath ? this.core.host.linkTo(targetPath, this.path) : undefined;
    await this.updateShape(id, { to });
  }

  targetOfShape(shape: Shape): string | null {
    return shape.to ? this.resolve(shape.to) : null;
  }

  newShapeId(): string {
    let s = "";
    for (let i = 0; i < 6; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)];
    return `s-${s}`;
  }

  async setImage(imagePath: string | null): Promise<void> {
    await this.core.spec.setField(this.path, "image", imagePath ? this.core.host.linkTo(imagePath, this.path) : undefined);
  }
}

/** Drop undefined and empty optional fields so a patched shape carries only what it means. */
export function clean(s: Shape): Shape {
  const out: Shape = { id: s.id, type: s.type };
  for (const k of ["x", "y", "r", "w", "h"] as const) if (s[k] !== undefined) out[k] = s[k];
  if (s.points) out.points = s.points;
  if (s.style) out.style = s.style;
  if (s.color) out.color = s.color;
  if (s.hand) out.hand = true;
  if (s.label) out.label = s.label;
  if (s.to) out.to = s.to;
  if (s.tags && s.tags.length) out.tags = s.tags;
  return out;
}

/** Text for a new map note. Blank canvas unless an image is given. */
export function newMapNote(core: Core, title: string, imagePath: string | null, atPath: string): string {
  const fields: { [k: string]: string | number | (string | number)[] } = {
    id: newId(),
    type: "map",
    title,
  };
  if (imagePath) {
    fields["image"] = core.host.linkTo(imagePath, atPath);
  } else {
    fields["width"] = DEFAULT_CANVAS.width;
    fields["height"] = DEFAULT_CANVAS.height;
  }
  fields["pins"] = [];
  return core.spec.newNote(fields, "");
}

export function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf(".");
  return dot >= 0 && IMAGE_EXTENSIONS.includes(path.slice(dot + 1).toLowerCase());
}

export { safeName } from "../../core/naming.js";
