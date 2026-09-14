// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { get, parse, serialize, set } from "../src/core/frontmatter.js";

const NOTE = `---
id: "C1"
title: "The Letter: A Beginning?"
# a comment another tool left here
type: "text"
created: "2021-05-22T19:12:38-07:00"
tags:
  - "winter-fair"
  - "letters"
include: true
order: 3
someone_elses_field: {nested: [1, 2]}

meta:
  Source: "Attic box"
  Rating: 4
bookmarks: ["[[02 The Tin]]", "[[Sample]]"]
pins:
  - to: "[[02 The Tin]]"
    x: 0.22
    y: 0.44
    label: The house
  - to: "[[03 Winter Fair]]"
    x: 0.66
    y: 0.36
---
Body text stays as it is.

> [!note] Notes
> Keep this.
`;

test("L2.2-a1: a note with unknown fields and comments round-trips byte for byte", () => {
  const fm = parse(NOTE);
  assert.equal(serialize(fm), NOTE);
});

test("reads every scalar shape the spec uses", () => {
  const fm = parse(NOTE);
  assert.equal(get(fm, "id"), "C1");
  assert.equal(get(fm, "title"), "The Letter: A Beginning?");
  assert.equal(get(fm, "include"), true);
  assert.equal(get(fm, "order"), 3);
  assert.deepEqual(get(fm, "tags"), ["winter-fair", "letters"]);
  assert.deepEqual(get(fm, "bookmarks"), ["[[02 The Tin]]", "[[Sample]]"]);
  assert.deepEqual(get(fm, "meta"), { Source: "Attic box", Rating: 4 });
  assert.equal(get(fm, "missing"), undefined);
});

test("reads a block list of mappings", () => {
  const pins = get(parse(NOTE), "pins");
  assert.deepEqual(pins, [
    { to: "[[02 The Tin]]", x: 0.22, y: 0.44, label: "The house" },
    { to: "[[03 Winter Fair]]", x: 0.66, y: 0.36 },
  ]);
});

test("setting one field rewrites only that field", () => {
  const fm = parse(NOTE);
  set(fm, "pins", [{ to: "[[04 Chapel]]", x: 0.5, y: 0.5 }]);
  const out = serialize(fm);
  const expected = NOTE.replace(
    `pins:
  - to: "[[02 The Tin]]"
    x: 0.22
    y: 0.44
    label: The house
  - to: "[[03 Winter Fair]]"
    x: 0.66
    y: 0.36
`,
    `pins:
  - to: "[[04 Chapel]]"
    x: 0.5
    y: 0.5
`,
  );
  assert.equal(out, expected);
  assert.ok(out.includes("# a comment another tool left here"));
  assert.ok(out.includes("someone_elses_field: {nested: [1, 2]}"));
});

test("appending a field keeps everything else and adds at the end", () => {
  const fm = parse("---\nid: \"X\"\n---\nhello\n");
  set(fm, "width", 1600);
  assert.equal(serialize(fm), "---\nid: \"X\"\nwidth: 1600\n---\nhello\n");
});

test("removing a field removes only its lines", () => {
  const fm = parse(NOTE);
  set(fm, "meta", undefined);
  const out = serialize(fm);
  assert.ok(!out.includes("Attic box"));
  assert.ok(out.includes("bookmarks:"));
  assert.ok(out.includes("someone_elses_field"));
});

test("a note without frontmatter gains one only when a field is set", () => {
  const plain = "just a body\n";
  const fm = parse(plain);
  assert.equal(serialize(fm), plain);
  set(fm, "id", "N1");
  assert.equal(serialize(fm), '---\nid: "N1"\n---\njust a body\n');
});

test("CRLF notes keep CRLF", () => {
  const text = "---\r\nid: \"A\"\r\n---\r\nbody\r\n";
  const fm = parse(text);
  assert.equal(serialize(fm), text);
  set(fm, "title", "T");
  assert.equal(serialize(fm), '---\r\nid: "A"\r\ntitle: "T"\r\n---\r\nbody\r\n');
});

test("strings are written JSON-quoted, matching the importer", () => {
  const fm = parse("---\nid: \"A\"\n---\n");
  set(fm, "title", 'Say "hi": ok');
  assert.ok(serialize(fm).includes('title: "Say \\"hi\\": ok"'));
  assert.equal(get(fm, "title"), 'Say "hi": ok');
});
