// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore } from "../src/core/modules.js";
import { words } from "../src/core/text.js";
import { MemoryHost } from "../src/host/memory.js";
import { applyMove, buildTree, planMove, splitPrefix } from "../src/modules/binder/tree.js";

import { note, scene } from "./fixtures.js";

const doc = (id: string, title: string, body = "", extra: { [k: string]: string } = {}) => scene(id, title, body ? body + "\n" : "", extra);

function vault(): MemoryHost {
  return new MemoryHost({
    "Novel/_Project.md": '---\nlonghand: 1\ntitle: "Harrowmere"\n---\n',
    "Novel/Manuscript/01 Part One/01 Part One.md": note({ id: "P1", type: "folder", title: "Part One" }, "Part One begins here.\n"),
    "Novel/Manuscript/01 Part One/01 The House.md": doc("C1", "The House", "one two three four", { status: "Revised", label: "Mara" }),
    "Novel/Manuscript/01 Part One/02 The Tin.md": doc("C2", "The Tin", "five six"),
    "Novel/Manuscript/01 Part One/03 Verse.md": doc("C3", "Verse", "seven"),
    "Novel/Manuscript/02 Part Two/01 Return.md": doc("C4", "Return", "eight nine ten"),
    "Novel/People/Mara.md": note({ id: "M", type: "character", title: "Mara" }, "not counted\n"),
    "Novel/Notes/Beta.md": scene("N2", "Beta", "b\n", { order: 2 }),
    "Novel/Notes/Alpha.md": scene("N1", "Alpha", "a\n", { order: 1 }),
  });
}

test("the tree follows the folders in binder order, with folder notes and summed words", async () => {
  const core = createCore(vault());
  const tree = await buildTree(core, "Novel");
  assert.deepEqual(
    tree.children.map((c) => [c.name, c.kind, c.words]),
    [
      ["Manuscript", "folder", 14],
      ["Notes", "folder", 2],
      ["People", "folder", 0],
    ],
  );
  const ms = tree.children[0]!;
  assert.deepEqual(
    ms.children.map((c) => [c.name, c.prefix, c.words]),
    [
      ["Part One", "01", 11],
      ["Part Two", "02", 3],
    ],
  );
  const one = ms.children[0]!;
  assert.equal(one.note?.path, "Novel/Manuscript/01 Part One/01 Part One.md");
  assert.deepEqual(
    one.children.map((c) => [c.name, c.words, c.status, c.label]),
    [
      ["The House", 4, "Revised", "Mara"],
      ["The Tin", 2, null, null],
      ["Verse", 1, null, null],
    ],
  );
  assert.deepEqual(tree.children[1]!.children.map((c) => c.name), ["Alpha", "Beta"], "order fields sort an unnumbered folder");
  assert.equal(tree.words, 16);
  assert.deepEqual(splitPrefix("012 Chapter"), { prefix: "012", rest: "Chapter" });
});

test("moving a numbered sibling renames only the files whose number changes, in two steps", async () => {
  const host = vault();
  const core = createCore(host);
  const one = (await buildTree(core, "Novel")).children[0]!.children[0]!;
  // move Verse (index 2) to the top (before index 0)
  const move = planMove(one.children, 2, 0);
  assert.deepEqual(move.renames, [
    ["Novel/Manuscript/01 Part One/03 Verse.md", "Novel/Manuscript/01 Part One/01 Verse.md"],
    ["Novel/Manuscript/01 Part One/01 The House.md", "Novel/Manuscript/01 Part One/02 The House.md"],
    ["Novel/Manuscript/01 Part One/02 The Tin.md", "Novel/Manuscript/01 Part One/03 The Tin.md"],
  ]);
  assert.deepEqual(move.orders, []);
  await applyMove(core, move);
  const after = (await buildTree(core, "Novel")).children[0]!.children[0]!;
  assert.deepEqual(after.children.map((c) => c.name), ["Verse", "The House", "The Tin"]);
  assert.ok(host.files.has("Novel/Manuscript/01 Part One/01 Verse.md"));
  assert.ok(!host.files.has("Novel/Manuscript/01 Part One/03 Verse.md"));
  assert.ok(![...host.files.keys()].some((p) => p.includes("/~")), "no temporary names left behind");
});

test("moving in an unnumbered folder writes order fields for every sibling", async () => {
  const host = vault();
  const core = createCore(host);
  const notes = (await buildTree(core, "Novel")).children[1]!;
  const move = planMove(notes.children, 0, 2); // Alpha after Beta
  assert.deepEqual(move.renames, []);
  assert.deepEqual(move.orders, [
    ["Novel/Notes/Beta.md", 1],
    ["Novel/Notes/Alpha.md", 2],
  ]);
  await applyMove(core, move);
  assert.ok(host.files.get("Novel/Notes/Alpha.md")!.includes("order: 2"));
  const after = (await buildTree(core, "Novel")).children[1]!;
  assert.deepEqual(after.children.map((c) => c.name), ["Beta", "Alpha"]);
});

test("moving a folder renumbers its siblings and the folder itself", async () => {
  const host = vault();
  const core = createCore(host);
  const ms = (await buildTree(core, "Novel")).children[0]!;
  const move = planMove(ms.children, 1, 0); // Part Two before Part One
  assert.deepEqual(move.renames, [
    ["Novel/Manuscript/02 Part Two", "Novel/Manuscript/01 Part Two"],
    ["Novel/Manuscript/01 Part One", "Novel/Manuscript/02 Part One"],
  ]);
  await applyMove(core, move);
  assert.ok(host.files.has("Novel/Manuscript/01 Part Two/01 Return.md"));
  assert.ok(host.files.has("Novel/Manuscript/02 Part One/01 The House.md"));
});

test("word count ignores frontmatter, comments, and link syntax", () => {
  assert.equal(words('---\nid: "x"\n---\nOne two [[Three|three]] **four** %% not this %% five-six.\n'), 5);
});
