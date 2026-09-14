// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

/** A parsed `[[target|alias]]` or `![[target]]`. */
export interface Wikilink {
  target: string;
  alias: string | null;
  embed: boolean;
}

const LINK = /^(!?)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]$/;

export function parseWikilink(text: string): Wikilink | null {
  const m = LINK.exec(text.trim());
  if (!m) return null;
  return { target: (m[2] ?? "").trim(), alias: m[3] !== undefined ? m[3] : null, embed: m[1] === "!" };
}

export function wikilink(target: string, alias?: string | null): string {
  return alias ? `[[${target}|${alias}]]` : `[[${target}]]`;
}

/** The link target for a vault path: the file name without extension, or the full path without extension. */
export function linkTarget(path: string, short: boolean): string {
  const noExt = path.replace(/\.md$/i, "");
  if (!short) return noExt;
  const slash = noExt.lastIndexOf("/");
  return slash >= 0 ? noExt.slice(slash + 1) : noExt;
}

/** File name without folder or extension. */
export function baseName(path: string): string {
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
