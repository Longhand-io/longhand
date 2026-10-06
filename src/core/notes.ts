// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Document notes. Scrivener keeps a notes pane beside each document; in the vault they are a
// callout titled Notes inside the note itself, so they travel with the text and need no
// second file. This is the one place that knows the callout's shape.

const HEAD = /^>\s*\[!note\][+-]?\s+Notes\s*$/i;

export interface NoteParts {
  /** the body without the notes callout */
  text: string;
  /** what the callout says, without its quote marks; null when the note has none */
  notes: string | null;
}

/** Split a note's body into its text and its notes. */
export function splitNotes(body: string): NoteParts {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => HEAD.test(l));
  if (start < 0) return { text: body, notes: null };
  let end = start + 1;
  while (end < lines.length && (lines[end] ?? "").startsWith(">")) end++;
  const notes = lines
    .slice(start + 1, end)
    .map((l) => l.replace(/^> ?/, "").trimEnd())
    .join("\n")
    .trim();
  return { text: [...lines.slice(0, start), ...lines.slice(end)].join("\n"), notes };
}
