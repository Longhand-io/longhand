// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The map model: everything the map does to a note, with no DOM. The view calls this;
// the tests call this. Every change is one frontmatter write of `pins` and nothing else.

import type { Core } from "../../core/modules.js";
import { clamp01, type MapNote, type Pin } from "../../core/spec.js";
import { baseName, parseWikilink } from "../../core/wikilink.js";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "avif"];
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
    let imagePath: string | null = null;
    if (note.image) {
      const link = parseWikilink(note.image);
      imagePath = this.core.host.resolveLink(link ? link.target : note.image, this.path);
    }
    const aspect = note.width && note.height && note.width > 0 && note.height > 0 ? note.width / note.height : null;
    return { ...note, imagePath, aspect };
  }

  /** The vault path a pin points at, or null when the link does not resolve. */
  targetOf(pin: Pin): string | null {
    const link = parseWikilink(pin.to);
    return this.core.host.resolveLink(link ? link.target : pin.to, this.path);
  }

  labelOf(pin: Pin): string {
    if (pin.label) return pin.label;
    const link = parseWikilink(pin.to);
    if (link?.alias) return link.alias;
    return baseName(link ? link.target : pin.to);
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

  async setImage(imagePath: string | null): Promise<void> {
    await this.core.spec.setField(this.path, "image", imagePath ? this.core.host.linkTo(imagePath, this.path) : undefined);
  }
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

/** A safe file name from a title, with the spec's character rules. */
export function safeName(title: string): string {
  const cleaned = title
    .replace(/[/\\:*?"<>|#^[\]]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Untitled").slice(0, 120);
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().toUpperCase();
  // fallback for hosts without WebCrypto: still a v4-shaped id
  const hex = "0123456789ABCDEF";
  let s = "";
  for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
