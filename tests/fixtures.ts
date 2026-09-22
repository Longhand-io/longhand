// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Shared builders for test vaults: `note` writes frontmatter the way the importer does, so a
// test never hand-types YAML.

import { serialize, set, type Frontmatter, type Value } from "../src/core/frontmatter.js";

/** A note's text from its fields and body, quoted the way the spec writes them. */
export function note(fields: { [key: string]: Value | undefined }, body = ""): string {
  const fm: Frontmatter = { entries: [], body, present: true, newline: "\n" };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) set(fm, k, v);
  return serialize(fm);
}

/** A scene with an id and a title, and whatever else the test needs. */
export function scene(id: string, title: string, body = "", extra: { [key: string]: Value | undefined } = {}): string {
  return note({ id, type: "text", title, ...extra }, body);
}
