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

/** Resolve link text as written in a note, `[[Target|alias]]` or bare, to a vault path. */
export function resolveLinkText(resolve: (target: string, from: string) => string | null, text: string, from: string): string | null {
  const link = parseWikilink(text);
  return resolve(link ? link.target : text, from);
}

/** The display text of a link as a writer reads it: the alias, else the target's file name. */
export function linkLabel(text: string): string {
  const link = parseWikilink(text);
  if (link?.alias) return link.alias;
  return baseName(link ? link.target : text);
}

/** File name without folder or extension. */
export function baseName(path: string): string {
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
