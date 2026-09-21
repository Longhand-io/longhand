// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore } from "../src/core/modules.js";
import { childrenOf, nextName, nowIso, uniquePath } from "../src/core/naming.js";
import { MemoryHost } from "../src/host/memory.js";
import { binderModule, KINDS, placeFor } from "../src/modules/binder/index.js";

const doc = (id: string, type: string) => `---\nid: "${id}"\ntype: "${type}"\n---\n`;

function vault(): MemoryHost {
  return new MemoryHost({
    "Novel/_Project.md": "---\nlonghand: 1\n---\n",
    "Novel/Draft/01 Part One/01 The Letter.md": doc("C1", "text"),
    "Novel/Draft/01 Part One/02 The Tin.md": doc("C2", "text"),
    "Novel/Draft/02 Part Two/01 Return.md": doc("C3", "text"),
    "Novel/Research/Gazette.md": doc("R1", "pdf"),
    "Novel/People/Mara.md": doc("P1", "character"),
    "Novel/Research/Stillwater.md": doc("S1", "setting"),
    "Loose.md": doc("L", "text"),
  });
}

test("naming: next prefix at the siblings' width, or none when siblings are unnumbered", () => {
  assert.equal(nextName(["01 A.md", "02 B.md", "notes.txt"], "The Tin"), "03 The Tin");
  assert.equal(nextName(["001 A.md", "002 B.md"], "C"), "003 C");
  assert.equal(nextName(["Alpha.md", "Beta.md"], "Gamma"), "Gamma");
  assert.equal(nextName([], "First: one?"), "First- one-");
  assert.deepEqual(childrenOf(["a/b.md", "a/c/d.md", "a/c/e.md", "x.md"], "a"), ["b.md", "c"]);
  assert.deepEqual(childrenOf(["a/b.md", "x.md"], ""), ["a", "x.md"]);
  assert.equal(uniquePath((p) => p === "a/b.md", "a/b.md"), "a/b (2).md");
  assert.equal(uniquePath((p) => p === "a/b", "a/b"), "a/b (2)");
  assert.match(nowIso(new Date(2026, 8, 15, 9, 5, 7)), /^2026-09-15T09:05:07[+-]\d{2}:\d{2}$/);
});

test("placement: scenes next to the active scene, else the manuscript folder whatever it is called", async () => {
  const host = vault();
  const core = createCore(host);
  host.active = "Novel/Draft/02 Part Two/01 Return.md";
  assert.equal(await placeFor(core, "scene"), "Novel/Draft/02 Part Two");
  assert.equal(await placeFor(core, "folder"), "Novel/Draft/02 Part Two");
  host.active = "Novel/Research/Gazette.md";
  assert.equal(await placeFor(core, "scene"), "Novel/Research");
  host.active = "Novel/_Project.md";
  assert.equal(await placeFor(core, "scene"), "Novel/Draft");
});

test("placement: characters and settings go where the project already keeps them, else Research; maps to Maps", async () => {
  const host = vault();
  const core = createCore(host);
  host.active = "Novel/Draft/01 Part One/01 The Letter.md";
  assert.equal(await placeFor(core, "character"), "Novel/People");
  assert.equal(await placeFor(core, "setting"), "Novel/Research");
  assert.equal(await placeFor(core, "event"), "Novel/Research");
  assert.equal(await placeFor(core, "map"), "Novel/Maps");
});

test("New scene writes id, type, title, created, numbered after its siblings, and opens it", async () => {
  const host = vault();
  const core = createCore(host);
  await binderModule.register(core);
  host.active = "Novel/Draft/01 Part One/02 The Tin.md";
  host.prompts.push("Verse");
  await host.commands.get("new-scene")!.run();
  const path = "Novel/Draft/01 Part One/03 Verse.md";
  const text = host.files.get(path);
  assert.ok(text, "note created at the next number");
  assert.match(text!, /^---\nid: "[0-9A-F-]{36}"\ntype: "text"\ntitle: "Verse"\ncreated: "\d{4}-\d{2}-\d{2}T[^"]+"\n---\n$/);
  assert.deepEqual(host.openedAsMarkdown, [path]);
});

test("New… asks for the kind; New here… uses the folder; New folder creates a folder", async () => {
  const host = vault();
  const core = createCore(host);
  await binderModule.register(core);
  assert.equal(host.ribbon.length, 2);
  assert.equal(host.views.get("longhand-binder")?.placement, "left");
  host.choices.push(KINDS.find((k) => k.label === "Character"));
  host.prompts.push("Tom");
  await host.commands.get("new")!.run();
  assert.ok(host.files.has("Novel/People/Tom.md"));
  assert.ok(host.files.get("Novel/People/Tom.md")!.includes('type: "character"'));

  host.choices.push(KINDS.find((k) => k.label === "Scene"));
  host.prompts.push("Prologue");
  await host.fileMenu.find((m) => m.on === "folder")!.run("Novel/Draft/02 Part Two");
  assert.ok(host.files.has("Novel/Draft/02 Part Two/02 Prologue.md"));

  host.prompts.push("Part Three");
  await host.commands.get("new-folder")!.run();
  assert.ok(host.folders.includes("Novel/Draft/03 Part Three"), "no active note, so the manuscript root");
});

test("New project makes a folder with a project note and a first chapter, and the panels can find it", async () => {
  const host = new MemoryHost({});
  const core = createCore(host);
  await binderModule.register(core);
  host.choices.push(KINDS.find((k) => k.label === "Project"));
  host.prompts.push("Saltmarsh: a novel");
  await host.commands.get("new")!.run();
  const note = host.files.get("Saltmarsh- a novel/_Project.md");
  assert.ok(note && note.includes("longhand: 1") && note.includes('title: "Saltmarsh: a novel"'));
  assert.ok(host.files.has("Saltmarsh- a novel/Manuscript/01 Chapter One.md"));
  assert.deepEqual((await core.projects.roots()).map((r) => r.root), ["Saltmarsh- a novel"]);
});
