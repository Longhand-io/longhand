// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Frontmatter that round-trips. A note's frontmatter is kept as a list of top-level
// entries, each with its original lines. Reading parses an entry on demand; writing
// replaces only the entry that changed and leaves every other byte alone, including
// comments, blank lines, and fields this plugin has never heard of. That is the
// spec's "unknown fields are preserved" rule, enforced by construction.
//
// The parser covers the YAML subset the spec uses: scalars, flow lists, block lists
// of scalars, block lists of mappings, and nested mappings. Anything else is kept as
// raw lines and returned as null when read.

export type Scalar = string | number | boolean | null;
export type Value = Scalar | Value[] | { [key: string]: Value };

export interface Entry {
  /** null for a comment or blank line at the top level */
  key: string | null;
  lines: string[];
}

export interface Frontmatter {
  entries: Entry[];
  body: string;
  /** false when the note had no frontmatter block at all */
  present: boolean;
  newline: "\n" | "\r\n";
}

const KEY_LINE = /^([A-Za-z0-9_][A-Za-z0-9_ .\-]*?):(?:[ \t]+(.*))?$/;

export function parse(text: string): Frontmatter {
  const newline: "\n" | "\r\n" = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(newline);
  if (lines[0] !== "---") {
    return { entries: [], body: text, present: false, newline };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---" || lines[i] === "...") {
      end = i;
      break;
    }
  }
  if (end < 0) {
    return { entries: [], body: text, present: false, newline };
  }
  const entries: Entry[] = [];
  for (let i = 1; i < end; i++) {
    const line = lines[i] ?? "";
    const m = KEY_LINE.exec(line);
    if (m && !isIndented(line)) {
      entries.push({ key: m[1] ?? "", lines: [line] });
      continue;
    }
    const last = entries[entries.length - 1];
    const continuation = isIndented(line) || line.startsWith("- ") || line === "-" || line === "";
    if (last && last.key !== null && continuation) {
      last.lines.push(line);
      continue;
    }
    entries.push({ key: null, lines: [line] });
  }
  const body = lines.slice(end + 1).join(newline);
  return { entries, body, present: true, newline };
}

function isIndented(line: string): boolean {
  return line.startsWith(" ") || line.startsWith("\t");
}

export function serialize(fm: Frontmatter): string {
  if (!fm.present && fm.entries.length === 0) {
    return fm.body;
  }
  const nl = fm.newline;
  const out: string[] = ["---"];
  for (const e of fm.entries) {
    out.push(...e.lines);
  }
  out.push("---");
  return out.join(nl) + nl + fm.body;
}

export function get(fm: Frontmatter, key: string): Value | undefined {
  const e = fm.entries.find((x) => x.key === key);
  if (!e) return undefined;
  return parseEntry(e.lines);
}

export function has(fm: Frontmatter, key: string): boolean {
  return fm.entries.some((x) => x.key === key);
}

/** Replace or append one field. Passing undefined removes it. */
export function set(fm: Frontmatter, key: string, value: Value | undefined): void {
  const idx = fm.entries.findIndex((x) => x.key === key);
  if (value === undefined) {
    if (idx >= 0) fm.entries.splice(idx, 1);
    return;
  }
  const lines = formatEntry(key, value);
  if (idx >= 0) {
    fm.entries[idx] = { key, lines };
  } else {
    fm.entries.push({ key, lines });
  }
  fm.present = true;
}

// ---- reading ----

function parseEntry(lines: string[]): Value {
  const first = lines[0] ?? "";
  const m = KEY_LINE.exec(first);
  const inline = (m?.[2] ?? "").trim();
  const rest = trimTrailingBlank(lines.slice(1));
  if (inline !== "" && inline !== "|" && inline !== ">") {
    return parseInline(inline);
  }
  if (rest.length === 0) return null;
  return parseBlock(rest);
}

function trimTrailingBlank(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? "").trim() === "") end--;
  return lines.slice(0, end);
}

function indentOf(line: string): number {
  let n = 0;
  while (n < line.length && (line[n] === " " || line[n] === "\t")) n++;
  return n;
}

/** A block of lines that all belong to one value, at whatever indent the first line has. */
function parseBlock(lines: string[]): Value {
  const nonBlank = lines.filter((l) => l.trim() !== "");
  if (nonBlank.length === 0) return null;
  const base = indentOf(nonBlank[0] ?? "");
  const items = splitItems(lines, base);
  const firstHead = (items[0]?.[0] ?? "").trimStart();
  if (firstHead.startsWith("- ") || firstHead === "-") {
    return items.map((it) => parseListItem(it));
  }
  const obj: { [key: string]: Value } = {};
  for (const itemLines of items) {
    const head = (itemLines[0] ?? "").trimStart();
    const km = KEY_LINE.exec(head);
    if (!km) continue;
    const key = km[1] ?? "";
    const inline = (km[2] ?? "").trim();
    const tail = trimTrailingBlank(itemLines.slice(1));
    if (inline !== "") {
      obj[key] = parseInline(inline);
    } else if (tail.length > 0) {
      obj[key] = parseBlock(tail);
    } else {
      obj[key] = null;
    }
  }
  return obj;
}

/** Group lines into items, each starting at `base` indent with its deeper continuation lines. */
function splitItems(lines: string[], base: number): string[][] {
  const items: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.trim() === "") {
      if (current) current.push(line);
      continue;
    }
    const ind = indentOf(line);
    if (current !== null && ind === base) {
      items.push(current);
      current = [line];
    } else if (current === null) {
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current) items.push(current);
  return items;
}

function parseListItem(lines: string[]): Value {
  const first = lines[0] ?? "";
  const head = first.trimStart();
  const dashIndent = indentOf(first);
  const after = (head === "-" ? "" : head.slice(2)).trim();
  const tail = trimTrailingBlank(lines.slice(1));
  const km = KEY_LINE.exec(after);
  if (km && !looksQuoted(after)) {
    // a mapping whose first key sits on the dash line; re-indent it to join the tail
    const rebased = [" ".repeat(dashIndent + 2) + after, ...tail];
    return parseBlock(rebased);
  }
  if (after === "" && tail.length > 0) {
    return parseBlock(tail);
  }
  return parseInline(after);
}

function looksQuoted(s: string): boolean {
  return s.startsWith('"') || s.startsWith("'") || s.startsWith("[") || s.startsWith("{");
}

export function parseInline(s: string): Value {
  const t = s.trim();
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1).trim();
    if (inner === "") return [];
    return splitFlow(inner).map((x) => parseScalar(x.trim()));
  }
  return parseScalar(t);
}

function splitFlow(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i] ?? "";
    if (quote) {
      cur += c;
      if (c === "\\" && quote === '"') {
        cur += s[i + 1] ?? "";
        i++;
      } else if (c === quote) {
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim() !== "") out.push(cur);
  return out;
}

export function parseScalar(s: string): Scalar {
  if (s.startsWith('"')) {
    const end = s.lastIndexOf('"');
    const raw = s.slice(0, end + 1);
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw.slice(1, -1);
    }
  }
  if (s.startsWith("'")) {
    const end = s.lastIndexOf("'");
    return s.slice(1, end).replace(/''/g, "'");
  }
  const hash = s.indexOf(" #");
  const plain = (hash >= 0 ? s.slice(0, hash) : s).trim();
  if (plain === "" || plain === "~" || plain === "null") return null;
  if (plain === "true") return true;
  if (plain === "false") return false;
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(plain)) return Number(plain);
  return plain;
}

// ---- writing ----

function formatEntry(key: string, value: Value): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${key}: []`];
    return [`${key}:`, ...formatList(value, 2)];
  }
  if (isObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return [`${key}: {}`];
    return [`${key}:`, ...formatMap(value, 2)];
  }
  return [`${key}: ${formatScalar(value)}`];
}

function formatList(items: Value[], indent: number): string[] {
  const pad = " ".repeat(indent);
  const out: string[] = [];
  for (const it of items) {
    if (isObject(it)) {
      const inner = formatMap(it, indent + 2);
      if (inner.length === 0) {
        out.push(`${pad}- {}`);
        continue;
      }
      out.push(`${pad}- ${(inner[0] ?? "").trimStart()}`);
      out.push(...inner.slice(1));
    } else if (Array.isArray(it)) {
      out.push(`${pad}-`);
      out.push(...formatList(it, indent + 2));
    } else {
      out.push(`${pad}- ${formatScalar(it)}`);
    }
  }
  return out;
}

function formatMap(obj: { [key: string]: Value }, indent: number): string[] {
  const pad = " ".repeat(indent);
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) out.push(`${pad}${k}: []`);
      else out.push(`${pad}${k}:`, ...formatList(v, indent + 2));
    } else if (isObject(v)) {
      out.push(`${pad}${k}:`, ...formatMap(v, indent + 2));
    } else {
      out.push(`${pad}${k}: ${formatScalar(v)}`);
    }
  }
  return out;
}

export function formatScalar(v: Scalar): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  // strings are always quoted, JSON-style, to match the importer
  return JSON.stringify(v);
}

function isObject(v: Value): v is { [key: string]: Value } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
