// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Counting words the way a writer expects: the body, without frontmatter, comments, or
// Markdown punctuation, with a hyphenated word as one.

import * as fm from "./frontmatter.js";

export function words(text: string): number {
  const body = fm.parse(text).body;
  const plain = body
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, t: string, a?: string) => a ?? t)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]/g, " ");
  const m = plain.match(/[\p{L}\p{N}'’-]+/gu);
  return m ? m.length : 0;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
