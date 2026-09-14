// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { baseName, linkTarget, parseWikilink, wikilink } from "../src/core/wikilink.js";

test("parses plain, aliased, embedded, and headed links", () => {
  assert.deepEqual(parseWikilink("[[02 The Tin]]"), { target: "02 The Tin", alias: null, embed: false });
  assert.deepEqual(parseWikilink("[[02 The Tin|the tin]]"), { target: "02 The Tin", alias: "the tin", embed: false });
  assert.deepEqual(parseWikilink("![[Research/02 Map.png]]"), { target: "Research/02 Map.png", alias: null, embed: true });
  assert.deepEqual(parseWikilink("[[Ch04#Rain|rain]]"), { target: "Ch04", alias: "rain", embed: false });
  assert.equal(parseWikilink("not a link"), null);
});

test("builds links and targets", () => {
  assert.equal(wikilink("A", "b"), "[[A|b]]");
  assert.equal(wikilink("A"), "[[A]]");
  assert.equal(linkTarget("Manuscript/01 Part One/02 The Tin.md", true), "02 The Tin");
  assert.equal(linkTarget("Manuscript/01 Part One/02 The Tin.md", false), "Manuscript/01 Part One/02 The Tin");
  assert.equal(baseName("Research/02 Map.png"), "02 Map");
  assert.equal(baseName("Top.md"), "Top");
});
