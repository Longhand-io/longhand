// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// File naming under the spec: the numeric prefix that keeps binder order, and the
// character rules for titles.

const PREFIX = /^(\d+)\s+/;

/** A safe file name from a title, with the spec's character rules. */
export function safeName(title: string): string {
  const cleaned = title
    .replace(/[/\\:*?"<>|#^[\]]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Untitled").slice(0, 120);
}

/**
 * The name a new sibling should get. When the existing siblings use numeric prefixes,
 * the new one gets the next number at the same width; otherwise no prefix.
 */
export function nextName(siblingNames: string[], title: string): string {
  let max = 0;
  let width = 0;
  let prefixed = 0;
  for (const name of siblingNames) {
    const m = PREFIX.exec(name);
    if (!m) continue;
    prefixed++;
    const digits = m[1] ?? "";
    max = Math.max(max, Number(digits));
    width = Math.max(width, digits.length);
  }
  const base = safeName(title);
  if (prefixed === 0) return base;
  const next = String(max + 1).padStart(Math.max(width, 2), "0");
  return `${next} ${base}`;
}

/** The folder part of a path, "" for the root. */
export function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash) : "";
}

/** Immediate children names of a folder, from a full file list. */
export function childrenOf(files: string[], folder: string): string[] {
  const prefix = folder === "" ? "" : folder + "/";
  const names = new Set<string>();
  for (const f of files) {
    if (!f.startsWith(prefix)) continue;
    const rest = f.slice(prefix.length);
    const slash = rest.indexOf("/");
    names.add(slash >= 0 ? rest.slice(0, slash) : rest);
  }
  return [...names];
}

/** A path that does not exist yet, adding " (2)", " (3)" before the extension. */
export function uniquePath(exists: (p: string) => boolean, path: string): string {
  if (!exists(path)) return path;
  const dot = path.lastIndexOf(".");
  const stem = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path;
  const ext = dot > path.lastIndexOf("/") ? path.slice(dot) : "";
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!exists(candidate)) return candidate;
  }
  return path;
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().toUpperCase();
  const hex = "0123456789ABCDEF";
  let s = "";
  for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Local time with offset, the way the importer writes created and modified. */
export function nowIso(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
