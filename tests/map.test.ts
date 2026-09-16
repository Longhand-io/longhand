// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore } from "../src/core/modules.js";
import { MemoryHost } from "../src/host/memory.js";
import { mapModule } from "../src/modules/map/index.js";
import { MapModel, isImagePath, newMapNote, safeName } from "../src/modules/map/model.js";

const MAP = `---
id: "3C7D0E2B-9A15-4F6E-8B21-5D4A7C9E1F30"
type: "map"
title: "Whitby, 1897"
image: "[[Research/02 Map.png]]"
# left by hand
pins:
  - to: "[[02 The Tin]]"
    x: 0.22
    y: 0.44
    label: "The house"
---
Notes about the map.
`;

function vault(): MemoryHost {
  return new MemoryHost({
    "Novel/_Project.md": "---\nlonghand: 1\n---\n",
    "Novel/Maps/Whitby.md": MAP,
    "Novel/Research/02 Map.png": "PNG",
    "Novel/Manuscript/02 The Tin.md": '---\nid: "C2"\n---\n',
    "Novel/Manuscript/03 Winter Fair.md": '---\nid: "C3"\n---\n',
  });
}

test("loads a map note with its image resolved and pins parsed", async () => {
  const core = createCore(vault());
  const m = new MapModel(core, "Novel/Maps/Whitby.md");
  const note = await m.load();
  assert.equal(note.title, "Whitby, 1897");
  assert.equal(note.imagePath, "Novel/Research/02 Map.png");
  assert.equal(note.aspect, null);
  assert.equal(note.pins.length, 1);
  assert.equal(m.targetOf(note.pins[0]!), "Novel/Manuscript/02 The Tin.md");
  assert.equal(m.labelOf(note.pins[0]!), "The house");
});

test("adding a pin appends to pins and touches nothing else", async () => {
  const host = vault();
  const core = createCore(host);
  const m = new MapModel(core, "Novel/Maps/Whitby.md");
  await m.addPin("Novel/Manuscript/03 Winter Fair.md", 0.66, 0.36);
  const text = host.files.get("Novel/Maps/Whitby.md")!;
  assert.equal(
    text,
    `---
id: "3C7D0E2B-9A15-4F6E-8B21-5D4A7C9E1F30"
type: "map"
title: "Whitby, 1897"
image: "[[Research/02 Map.png]]"
# left by hand
pins:
  - to: "[[02 The Tin]]"
    x: 0.22
    y: 0.44
    label: "The house"
  - to: "[[03 Winter Fair]]"
    x: 0.66
    y: 0.36
---
Notes about the map.
`,
  );
});

test("moving a pin clamps to the image and rounds to four places", async () => {
  const host = vault();
  const core = createCore(host);
  const m = new MapModel(core, "Novel/Maps/Whitby.md");
  await m.movePin(0, 1.7, 0.123456);
  const note = await m.load();
  assert.deepEqual(note.pins[0], { to: "[[02 The Tin]]", x: 1, y: 0.1235, label: "The house" });
});

test("removing and relabelling pins", async () => {
  const host = vault();
  const core = createCore(host);
  const m = new MapModel(core, "Novel/Maps/Whitby.md");
  await m.setLabel(0, "  Harrow house ");
  assert.equal((await m.load()).pins[0]?.label, "Harrow house");
  await m.setLabel(0, "");
  assert.equal((await m.load()).pins[0]?.label, undefined);
  assert.equal(m.labelOf((await m.load()).pins[0]!), "02 The Tin");
  await m.removePin(0);
  assert.deepEqual((await m.load()).pins, []);
  assert.ok(host.files.get("Novel/Maps/Whitby.md")!.includes("pins: []"));
  assert.ok(host.files.get("Novel/Maps/Whitby.md")!.includes("# left by hand"));
});

test("a pin whose note is gone is kept and reported unresolved", async () => {
  const host = vault();
  host.files.delete("Novel/Manuscript/02 The Tin.md");
  const core = createCore(host);
  const m = new MapModel(core, "Novel/Maps/Whitby.md");
  const note = await m.load();
  assert.equal(note.pins.length, 1);
  assert.equal(m.targetOf(note.pins[0]!), null);
});

test("a blank canvas has no image and an aspect from width and height", async () => {
  const host = vault();
  host.files.set("Novel/Maps/Blank.md", '---\nid: "B"\ntype: "map"\ntitle: "Blank"\nwidth: 1600\nheight: 1000\npins: []\n---\n');
  const core = createCore(host);
  const note = await new MapModel(core, "Novel/Maps/Blank.md").load();
  assert.equal(note.imagePath, null);
  assert.equal(note.aspect, 1.6);
});

test("a new map note is blank unless an image is given, and links the image relative to the note", () => {
  const core = createCore(vault());
  const blank = newMapNote(core, "Harbour", null, "Novel/Maps/Harbour.md");
  assert.match(blank, /^---\nid: "[0-9A-F-]{36}"\ntype: "map"\ntitle: "Harbour"\nwidth: 1600\nheight: 1000\npins: \[\]\n---\n$/);
  const withImage = newMapNote(core, "Harbour", "Novel/Research/02 Map.png", "Novel/Maps/Harbour.md");
  assert.ok(withImage.includes('image: "[[02 Map.png]]"'));
  assert.ok(!withImage.includes("width:"));
});

test("module registers the view and three commands; open as map only when the active note is a map", async () => {
  const host = vault();
  const core = createCore(host);
  await mapModule.register(core);
  assert.ok(host.views.has("longhand-map"));
  assert.equal(host.autoViews.length, 1);
  assert.equal(host.autoViews[0]!.when("Novel/Maps/Whitby.md"), true);
  assert.equal(host.autoViews[0]!.when("Novel/Manuscript/02 The Tin.md"), false);
  assert.equal(host.fileMenu.length, 2);
  assert.equal(host.fileMenu[0]!.check("Novel/Maps/Whitby.md"), true);
  assert.equal(host.fileMenu[1]!.on, "folder");
  assert.equal(host.ribbon.length, 1);
  assert.equal(host.ribbon[0]!.title, "New map");
  assert.deepEqual([...host.commands.keys()].sort(), ["map-new", "map-open", "map-set-image"]);
  host.active = "Novel/Manuscript/02 The Tin.md";
  assert.equal(host.commands.get("map-open")!.check!(), false);
  host.active = "Novel/Maps/Whitby.md";
  assert.equal(host.commands.get("map-open")!.check!(), true);
  await host.commands.get("map-open")!.run();
  assert.deepEqual(host.openedViews, [{ type: "longhand-map", state: { path: "Novel/Maps/Whitby.md" } }]);
});

test("new map command writes into the project's Maps folder and opens it", async () => {
  const host = vault();
  const core = createCore(host);
  await mapModule.register(core);
  host.active = "Novel/Manuscript/02 The Tin.md";
  host.prompts.push("Whitby"); // title collides with the existing map
  host.picks.push(null); // blank canvas
  await host.commands.get("map-new")!.run();
  assert.ok(host.files.has("Novel/Maps/Whitby (2).md"));
  assert.equal(host.openedViews[0]?.state.path, "Novel/Maps/Whitby (2).md");
});

test("new map from a folder's menu lands in that folder; the ribbon uses the active project's Maps folder", async () => {
  const host = vault();
  const core = createCore(host);
  await mapModule.register(core);
  host.prompts.push("Harbour");
  host.picks.push(null);
  await host.fileMenu[1]!.run("Novel/Research");
  assert.ok(host.files.has("Novel/Research/Harbour.md"));
  host.active = "Novel/Manuscript/02 The Tin.md";
  host.prompts.push("Coast");
  host.picks.push("Novel/Research/02 Map.png");
  await host.ribbon[0]!.run();
  assert.ok(host.files.has("Novel/Maps/Coast.md"));
  assert.ok(host.files.get("Novel/Maps/Coast.md")!.includes('image: "[[02 Map.png]]"'));
});

test("helpers", () => {
  assert.equal(isImagePath("a/b.PNG"), true);
  assert.equal(isImagePath("a/b.md"), false);
  assert.equal(safeName('Whitby: 1897 / "the harbour"?'), "Whitby- 1897 - -the harbour--");
});
