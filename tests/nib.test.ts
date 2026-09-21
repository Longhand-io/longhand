// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore } from "../src/core/modules.js";
import { MemoryHost } from "../src/host/memory.js";
import { ask, findNote, perform, resetJoke, scopeOf, words } from "../src/modules/nib/answers.js";
import { nibModule } from "../src/modules/nib/index.js";
import { askInSidebar, clearHistory, suggest } from "../src/modules/nib/view.js";

function vault(): MemoryHost {
  return new MemoryHost({
    "Novel/_Project.md": '---\nlonghand: 1\ntitle: "Harrowmere"\n---\n',
    "Novel/Manuscript/01 Part One/01 The Letter.md":
      '---\nid: "C1"\ntype: "text"\ntitle: "The Letter"\n---\nMara found the letter. She read it twice at [[Stillwater]].\n',
    "Novel/Manuscript/01 Part One/02 The Tin.md": '---\nid: "C2"\ntype: "text"\ntitle: "The Tin"\n---\nShe paid for the crossing. [[Tom]] said nothing.\n',
    "Novel/Manuscript/02 Part Two/01 Return.md": '---\nid: "C3"\ntype: "text"\ntitle: "Return"\n---\nMara came back to the house. It was smaller.\n',
    "Novel/People/Mara.md": '---\nid: "P1"\ntype: "character"\ntitle: "Mara"\naliases: ["the Harrow girl"]\nmatch_names: true\n---\n',
    "Novel/People/Tom.md": '---\nid: "P2"\ntype: "character"\ntitle: "Tom"\n---\n',
    "Novel/People/Reverend Ashe.md": '---\nid: "P3"\ntype: "character"\ntitle: "Reverend Ashe"\n---\n',
    "Novel/Research/Stillwater.md": '---\nid: "S1"\ntype: "setting"\ntitle: "Stillwater"\naliases: ["the crossing"]\nmatch_names: true\n---\n',
    "Novel/Research/Harrow Wood.md": '---\nid: "S2"\ntype: "setting"\ntitle: "Harrow Wood"\n---\n',
    "Novel/Maps/Harrowmere.md": '---\nid: "M1"\ntype: "map"\ntitle: "Harrowmere"\nwidth: 1600\nheight: 1000\npins:\n  - to: "[[Stillwater]]"\n    x: 0.5\n    y: 0.5\nshapes:\n  - id: "s1"\n    type: "circle"\n    x: 0.2\n    y: 0.2\n    r: 0.05\n    to: "[[Stillwater]]"\n---\n',
  });
}

test("finds notes by title, alias, prefix-stripped file name, and contains", async () => {
  const core = createCore(vault());
  assert.equal((await findNote(core, "mara"))?.path, "Novel/People/Mara.md");
  assert.equal((await findNote(core, "the Harrow girl"))?.path, "Novel/People/Mara.md");
  assert.equal((await findNote(core, "the tin"))?.path, "Novel/Manuscript/01 Part One/02 The Tin.md");
  assert.equal((await findNote(core, "Ashe"))?.path, "Novel/People/Reverend Ashe.md");
  assert.equal(await findNote(core, "nobody"), null);
});

test("where was X last seen: the last appearance in binder order, with the sentence", async () => {
  const core = createCore(vault());
  const a = await ask(core, "Where was Mara last seen?");
  assert.equal(a.kind, "last-seen");
  assert.match(a.text, /^Mara was last in Part Two, Return: “Mara came back to the house\.”/);
  assert.equal(a.cites[0]?.path, "Novel/Manuscript/02 Part Two/01 Return.md");
  const none = await ask(core, "where is Reverend Ashe");
  assert.match(none.text, /does not appear/);
});

test("what is set at X lists every scene; who is in X lists characters; unused places", async () => {
  const core = createCore(vault());
  const at = await ask(core, "What is set at Stillwater?");
  assert.equal(at.kind, "set-at");
  assert.deepEqual(
    at.cites.map((c) => c.label),
    ["The Letter", "The Tin"],
  );
  const who = await ask(core, "who is in The Tin");
  assert.equal(who.text, "Tom is in The Tin.");
  const unused = await ask(core, "Which places have no scene?");
  assert.deepEqual(
    unused.cites.map((c) => c.label),
    ["Harrow Wood"],
  );
  const people = await ask(core, "which characters have no scene");
  assert.deepEqual(
    people.cites.map((c) => c.label),
    ["Reverend Ashe"],
  );
});

test("length: a scene, a folder, the whole manuscript", async () => {
  const core = createCore(vault());
  assert.equal(words("---\nid: \"x\"\n---\nOne two [[Three|three]] **four** %% not this %% five.\n"), 5);
  assert.match((await ask(core, "how long is The Tin")).text, /^The Tin is \d+ words\.$/);
  assert.match((await ask(core, "how long is Part One")).text, /^Part One is \d+ words across 2 documents\.$/);
  assert.match((await ask(core, "how long is the manuscript")).text, /^\d+ words across 3 documents\.$/);
});

test("on the map: pins and shapes that link to the note", async () => {
  const core = createCore(vault());
  const a = await ask(core, "where is Stillwater on the map");
  assert.equal(a.kind, "on-map");
  assert.equal(a.text, "Stillwater is on Harrowmere.");
  assert.equal(a.cites[0]?.detail, "1 pin, 1 shape");
  assert.match((await ask(core, "is Harrow Wood on the map")).text, /not on any map/);
});

test("anything else gets the help card, and the joke exactly once", async () => {
  resetJoke();
  const core = createCore(vault());
  const first = await ask(core, "write me a better opening");
  assert.equal(first.kind, "help");
  assert.match(first.text, /That was the one joke/);
  const second = await ask(core, "and another");
  assert.doesNotMatch(second.text, /joke/);
  assert.match(second.text, /hosted Nib, which is off/);
});

test("module is off by default and registers a right-hand view and the Ask Nib command", async () => {
  const host = vault();
  const core = createCore(host);
  assert.equal(nibModule.defaultEnabled, false);
  await nibModule.register(core);
  assert.equal(host.views.get("longhand-nib")?.placement, "right");
  assert.ok(host.commands.has("nib-ask"));
  assert.equal(host.overlays.length, 1);
  assert.equal(host.overlays[0]?.id, "nib");
  await nibModule.unregister?.();
  assert.equal(host.overlays.length, 0);
});

test("a question from the corner opens the sidebar with the context, carrying what Nib said", async () => {
  clearHistory();
  const host = vault();
  const core = createCore(host);
  await askInSidebar(core, "Which places have no scene?", "Novel/Maps/Harrowmere.md", "Harrow Wood is on this map but no scene is set there yet.");
  assert.deepEqual(host.openedViews, [{ type: "longhand-nib", state: { path: "Novel/Maps/Harrowmere.md" } }]);
});

test("scope follows the active note: a project, the whole vault, or nothing open", async () => {
  const host = vault();
  host.files.set("Loose.md", '---\nid: "L"\ntype: "text"\ntitle: "Loose"\n---\nA note outside any project mentions Mara.\n');
  const core = createCore(host);
  host.active = "Novel/Manuscript/02 The Tin.md";
  assert.equal((await scopeOf(core)).title, "Harrowmere");
  host.active = "Loose.md";
  assert.equal((await scopeOf(core)).kind, "vault");
  host.active = null;
  assert.equal((await scopeOf(core)).kind, "none");
  assert.deepEqual(await suggest(core, ""), ["Open Harrowmere"]);
  const opened = await ask(core, "Open Harrowmere");
  assert.equal(opened.kind, "open");
  assert.deepEqual(host.opened, ["Novel/_Project.md"]);
  const missing = await ask(core, "open Nowhere");
  assert.match(missing.text, /The projects here are Harrowmere/);
});

test("suggestions follow the context: a map asks about its places, a scene about itself", async () => {
  const core = createCore(vault());
  const onMap = await suggest(core, "Novel/Maps/Harrowmere.md");
  assert.equal(onMap[0], "What is set at Stillwater?");
  assert.ok(onMap.includes("Which places have no scene?"));
  const inScene = await suggest(core, "Novel/Manuscript/01 Part One/02 The Tin.md");
  assert.deepEqual(inScene.slice(0, 2), ["Who is in The Tin?", "How long is The Tin?"]);
});

test("audit: scenes that name a place without counting, and the two fixes land as frontmatter", async () => {
  const host = vault();
  host.files.set("Novel/Manuscript/02 Part Two/02 Wood.md", '---\nid: "C5"\ntype: "text"\ntitle: "Wood"\n---\nThey hid in Harrow Wood until dark.\n');
  const core = createCore(host);
  const a = await ask(core, "Which scenes mention Harrow Wood?");
  assert.equal(a.kind, "audit");
  assert.deepEqual(
    a.cites.map((c) => c.label),
    ["Wood"],
  );
  assert.deepEqual(
    a.actions?.map((x) => x.kind),
    ["set-place", "match-names"],
  );
  const said = await perform(core, a.actions![0]!);
  assert.match(said, /^Wood is set at Harrow Wood/);
  assert.ok(host.files.get("Novel/Manuscript/02 Part Two/02 Wood.md")!.includes('places:\n  - "[[Harrow Wood]]"\n'));
  assert.ok(host.files.get("Novel/Manuscript/02 Part Two/02 Wood.md")!.includes("They hid in Harrow Wood until dark."), "prose untouched");
  const after = await ask(core, "What is set at Harrow Wood?");
  assert.deepEqual(
    after.cites.map((c) => c.label),
    ["Wood"],
  );
  const again = await perform(core, a.actions![0]!);
  assert.match(again, /already set at/);
  const match = await perform(core, a.actions![1]!);
  assert.match(match, /Name matching is on/);
  assert.ok(host.files.get("Novel/Research/Harrow Wood.md")!.includes("match_names: true"));
  const nothingLeft = await ask(core, "audit Harrow Wood");
  assert.match(nothingLeft.text, /already counts/);
});
