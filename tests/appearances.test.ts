// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { appearances, chapterOf, readSubject, sentenceAround } from "../src/core/appearances.js";
import { createCore } from "../src/core/modules.js";
import { MemoryHost } from "../src/host/memory.js";

function vault(settingExtra = ""): MemoryHost {
  return new MemoryHost({
    "Novel/_Project.md": "---\nlonghand: 1\n---\n",
    "Novel/Research/Stillwater.md": `---\nid: "S1"\ntype: "setting"\ntitle: "Stillwater"\naliases: ["the crossing"]\nattachments: ["[[Ford.png]]", "[[Ferry notes]]"]\n${settingExtra}---\nA ford below the mountains.\n`,
    "Novel/Research/Ford.png": "PNG",
    "Novel/Research/Ferry notes.md": '---\nid: "R2"\ntype: "text"\n---\nThe ferry ran until 1900.\n',
    "Novel/Manuscript/01 Part One/01 The Letter.md":
      '---\nid: "C1"\ntype: "text"\ntitle: "The Letter"\n---\nMara found the letter. She read it twice. The ferryman at [[Stillwater]] would not take it and would not say why.\n\n> [!note] Notes\n> Check the postmark.\n',
    "Novel/Manuscript/01 Part One/02 The Tin.md":
      '---\nid: "C2"\ntype: "text"\ntitle: "The Tin"\n---\nShe paid for **the crossing** with the last of the buttons.\n',
    "Novel/Manuscript/02 Part Two/01 Return.md":
      '---\nid: "C3"\ntype: "text"\ntitle: "Return"\n---\nNothing here. A stillwatered pond, not the place.\n',
    "Novel/Manuscript/02 Part Two/02 Aliased.md":
      '---\nid: "C4"\ntype: "text"\ntitle: "Aliased"\n---\nThey met at [[Stillwater|the ford]] after dark.\n',
    "Novel/Maps/Map.md": '---\nid: "M"\ntype: "map"\npins:\n  - to: "[[Stillwater]]"\n    x: 0.5\n    y: 0.5\n---\n',
  });
}

test("subject carries title, kind, aliases, and resolved attachments", async () => {
  const core = createCore(vault());
  const s = await readSubject(core, "Novel/Research/Stillwater.md");
  assert.equal(s.title, "Stillwater");
  assert.equal(s.kind, "Place");
  assert.deepEqual(s.aliases, ["the crossing"]);
  assert.deepEqual(s.attachments, ["Novel/Research/Ford.png", "Novel/Research/Ferry notes.md"]);
  assert.equal(s.matchNames, false);
});

test("links count as appearances; the sentence around the link is returned with the mention marked", async () => {
  const core = createCore(vault());
  const s = await readSubject(core, "Novel/Research/Stillwater.md");
  const found = await appearances(core, s);
  assert.deepEqual(
    found.map((a) => [a.chapter, a.title]),
    [
      ["Part One", "The Letter"],
      ["Part Two", "Aliased"],
    ],
  );
  const first = found[0]!;
  assert.equal(first.sentence, "The ferryman at Stillwater would not take it and would not say why.");
  assert.equal(first.sentence.slice(first.matchStart, first.matchEnd), "Stillwater");
  const second = found[1]!;
  assert.equal(second.sentence.slice(second.matchStart, second.matchEnd), "the ford");
});

test("name matching is off unless the note opts in, then matches title and aliases as whole words", async () => {
  const core = createCore(vault("match_names: true\n"));
  const s = await readSubject(core, "Novel/Research/Stillwater.md");
  assert.equal(s.matchNames, true);
  const found = await appearances(core, s);
  assert.deepEqual(
    found.map((a) => a.title),
    ["The Letter", "The Tin", "Aliased"],
  );
  const tin = found[1]!;
  assert.equal(tin.sentence, "She paid for the crossing with the last of the buttons.");
  assert.equal(tin.sentence.slice(tin.matchStart, tin.matchEnd), "the crossing");
});

test("the subject itself, maps, and non-text notes are never appearances", async () => {
  const core = createCore(vault("match_names: true\n"));
  const s = await readSubject(core, "Novel/Research/Stillwater.md");
  const paths = (await appearances(core, s)).map((a) => a.doc.path);
  assert.ok(!paths.includes("Novel/Research/Stillwater.md"));
  assert.ok(!paths.includes("Novel/Maps/Map.md"));
});

test("sentence extraction handles first, middle, last, and newline-bounded sentences", () => {
  const p = "One here. Two there! Three?\nFour on a new line";
  assert.equal(sentenceAround(p, 0, 3).text, "One here.");
  assert.equal(sentenceAround(p, 10, 13).text, "Two there!");
  assert.equal(sentenceAround(p, 21, 26).text, "Three?");
  const four = sentenceAround(p, 28, 32);
  assert.equal(four.text, "Four on a new line");
  assert.equal(four.text.slice(four.start, four.end), "Four");
});

test("chapter labels drop the manuscript folder and numeric prefixes", () => {
  assert.equal(chapterOf("Novel/Manuscript/01 Part One/02 The Tin.md", "Novel"), "Part One");
  assert.equal(chapterOf("Novel/Manuscript/01 Part One/03 Act/02 The Tin.md", "Novel"), "Part One, Act");
  assert.equal(chapterOf("Novel/Manuscript/02 The Tin.md", "Novel"), "Manuscript");
  assert.equal(chapterOf("Manuscript/02 The Tin.md", ""), "Manuscript");
});
