// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore } from "../src/core/modules.js";
import { MemoryHost } from "../src/host/memory.js";
import { nudgesFor } from "../src/modules/nib/nudges.js";

function vault(): MemoryHost {
  return new MemoryHost({
    "Novel/_Project.md": "---\nlonghand: 1\n---\n",
    "Novel/Manuscript/01 The Letter.md": '---\nid: "C1"\ntype: "text"\ntitle: "The Letter"\n---\nShe read it twice at [[Stillwater]].\n',
    "Novel/Manuscript/02 Empty.md": '---\nid: "C2"\ntype: "text"\ntitle: "Empty"\n---\n',
    "Novel/Research/Stillwater.md": '---\nid: "S1"\ntype: "setting"\ntitle: "Stillwater"\n---\n',
    "Novel/Research/Harrow Wood.md": '---\nid: "S2"\ntype: "setting"\ntitle: "Harrow Wood"\n---\n',
    "Novel/Maps/Harrowmere.md":
      '---\nid: "M1"\ntype: "map"\ntitle: "Harrowmere"\nwidth: 1600\nheight: 1000\npins:\n  - to: "[[Harrow Wood]]"\n    x: 0.2\n    y: 0.2\n    label: "The wood"\n  - to: "[[Nowhere]]"\n    x: 0.4\n    y: 0.4\n  - to: "[[01 The Letter]]"\n    x: 0.6\n    y: 0.6\n---\n',
  });
}

test("a map notices broken pins, pinned places with no scene, and places with scenes that are missing", async () => {
  const core = createCore(vault());
  const nudges = await nudgesFor(core, "Novel/Maps/Harrowmere.md");
  assert.deepEqual(
    nudges.map((n) => n.text),
    [
      "A pin on this map points at a note that does not exist: Nowhere.",
      "The wood is on this map but no scene is set there yet.",
      "Stillwater has 1 scene and is not on this map.",
    ],
  );
  assert.equal(nudges[1]?.ask, "Which places have no scene?");
  assert.equal(nudges[2]?.ask, "Where is Stillwater on the map?");
  assert.ok(nudges.every((n) => n.key.startsWith("Novel/Maps/Harrowmere.md:")));
});

test("a scene with no text gets one nudge; a scene with text gets none", async () => {
  const core = createCore(vault());
  assert.deepEqual((await nudgesFor(core, "Novel/Manuscript/02 Empty.md")).map((n) => n.text), ["Empty has no text yet."]);
  assert.deepEqual(await nudgesFor(core, "Novel/Manuscript/01 The Letter.md"), []);
  assert.deepEqual(await nudgesFor(core, "Novel/Research/Stillwater.md"), []);
});
