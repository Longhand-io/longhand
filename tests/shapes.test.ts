// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore } from "../src/core/modules.js";
import { formatPoints, parsePoints, type Shape } from "../src/core/spec.js";
import { MemoryHost } from "../src/host/memory.js";
import { alongLine, centroid, midpoint, simplify } from "../src/modules/map/geometry.js";
import { MapModel } from "../src/modules/map/model.js";

const MAP = `---
id: "M1"
type: "map"
title: "Harrowmere"
width: 1600
height: 1000
pins: []
shapes:
  - id: "s-wood"
    type: "polygon"
    points: "0.2,0.5 0.3,0.45 0.35,0.6 0.22,0.62"
    style: "wood"
    label: "Harrow Wood"
    to: "[[Harrow Wood]]"
  - id: "s-river"
    type: "line"
    points: "0.5,0.2 0.52,0.5 0.48,0.8"
    style: "river"
  - id: "s-town"
    type: "circle"
    x: 0.6
    y: 0.7
    r: 0.02
    color: "red"
    hand: true
    label: "Whitby"
    tags: ["town"]
  - id: "bad"
    type: "polygon"
    points: "0.1,0.1"
---
`;

function vault(): MemoryHost {
  return new MemoryHost({
    "Novel/_Project.md": "---\nlonghand: 1\n---\n",
    "Novel/Maps/Harrowmere.md": MAP,
    "Novel/Research/Harrow Wood.md": '---\nid: "W"\ntype: "setting"\ntitle: "Harrow Wood"\n---\n',
  });
}

test("shapes parse from the note; a polygon with one point is dropped", async () => {
  const core = createCore(vault());
  const note = await core.spec.readMap("Novel/Maps/Harrowmere.md");
  assert.deepEqual(
    note.shapes.map((s) => s.id),
    ["s-wood", "s-river", "s-town"],
  );
  const wood = note.shapes[0]!;
  assert.equal(wood.type, "polygon");
  assert.equal(wood.style, "wood");
  assert.equal(wood.to, "[[Harrow Wood]]");
  assert.deepEqual(wood.points, [
    [0.2, 0.5],
    [0.3, 0.45],
    [0.35, 0.6],
    [0.22, 0.62],
  ]);
  assert.deepEqual(note.shapes[2]!.tags, ["town"]);
  assert.equal(note.shapes[2]!.color, "red");
  assert.equal(note.shapes[2]!.hand, true);
});

test("colour and hand survive a rewrite, and clearing them removes the fields", async () => {
  const host = vault();
  const core = createCore(host);
  const m = new MapModel(core, "Novel/Maps/Harrowmere.md");
  await m.updateShape("s-town", { label: "Whitby town" });
  let text = host.files.get("Novel/Maps/Harrowmere.md")!;
  assert.ok(text.includes('    color: "red"\n    hand: true\n    label: "Whitby town"\n'));
  await m.updateShape("s-town", { color: undefined, hand: undefined });
  text = host.files.get("Novel/Maps/Harrowmere.md")!;
  assert.ok(!text.includes("color:") && !text.includes("hand:"));
});

test("writing shapes touches only the shapes block and keeps the SVG-style points string", async () => {
  const host = vault();
  const core = createCore(host);
  const m = new MapModel(core, "Novel/Maps/Harrowmere.md");
  const note = await m.load();
  const road: Shape = { id: "s-road", type: "line", points: [[0.1, 0.9], [0.9, 0.85]], style: "road" };
  await m.setShapes([...note.shapes, road]);
  const text = host.files.get("Novel/Maps/Harrowmere.md")!;
  assert.ok(text.includes('  - id: "s-road"\n    type: "line"\n    points: "0.1,0.9 0.9,0.85"\n    style: "road"\n'));
  assert.ok(text.includes('title: "Harrowmere"\nwidth: 1600\nheight: 1000\npins: []\nshapes:\n'));
  assert.ok(!text.includes('id: "bad"'), "the invalid shape is not written back");
});

test("points round-trip and clamp", () => {
  assert.deepEqual(parsePoints("0.1,0.2 1.5,-0.3  0.5,0.5"), [
    [0.1, 0.2],
    [1, 0],
    [0.5, 0.5],
  ]);
  assert.equal(formatPoints([[0.123456, 0.5], [1, 0]]), "0.1235,0.5 1,0");
});

test("model: update, move, remove, and link a shape", async () => {
  const host = vault();
  const core = createCore(host);
  const m = new MapModel(core, "Novel/Maps/Harrowmere.md");
  await m.updateShape("s-town", { label: "Whitby, 1897", style: "outline" });
  let note = await m.load();
  assert.equal(note.shapes[2]!.label, "Whitby, 1897");
  assert.equal(note.shapes[2]!.style, "outline");
  await m.linkShape("s-town", "Novel/Research/Harrow Wood.md");
  note = await m.load();
  assert.equal(note.shapes[2]!.to, "[[Harrow Wood]]");
  assert.equal(m.targetOfShape(note.shapes[2]!), "Novel/Research/Harrow Wood.md");
  await m.linkShape("s-town", null);
  note = await m.load();
  assert.equal(note.shapes[2]!.to, undefined);
  await m.removeShape("s-river");
  note = await m.load();
  assert.deepEqual(
    note.shapes.map((s) => s.id),
    ["s-wood", "s-town"],
  );
  assert.match(m.newShapeId(), /^s-[a-z0-9]{6}$/);
});

test("geometry: simplify keeps corners and drops jitter", () => {
  const line: [number, number][] = [];
  for (let i = 0; i <= 100; i++) line.push([i, (i % 2) * 0.4]);
  line.push([100, 100]);
  const s = simplify(line, 1);
  assert.deepEqual(s, [
    [0, 0],
    [100, 0],
    [100, 100],
  ]);
  assert.deepEqual(centroid([[0, 0], [2, 0], [2, 2], [0, 2]]), [1, 1]);
  assert.deepEqual(midpoint([[0, 0], [10, 0]]), [5, 0]);
  assert.equal(alongLine([[0, 0], [100, 0]], 25).length, 4);
});
