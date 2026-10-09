// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore } from "../src/core/modules.js";
import { splitNotes } from "../src/core/notes.js";
import { MemoryHost } from "../src/host/memory.js";
import { INSPECTOR_VIEW, inspectorModule } from "../src/modules/inspector/index.js";
import { inspect, spans } from "../src/modules/inspector/model.js";

import { note } from "./fixtures.js";

const BODY = "The tin was under the stair.  \nShe left it there.\n\n> [!note] Notes\n> **Focus:** the tin, not the letter.  \n>\n> Ask whether Tom *knows*.\n";

test("splitNotes takes the Notes callout out of the body and drops its quote marks", () => {
  const parts = splitNotes(BODY);
  assert.equal(parts.notes, "**Focus:** the tin, not the letter.\n\nAsk whether Tom *knows*.");
  assert.equal(parts.text, "The tin was under the stair.  \nShe left it there.\n\n");
});

test("splitNotes leaves a body with no Notes callout as it is, and another callout is not notes", () => {
  const body = "Prose.\n\n> [!warning] Careful\n> Not a note.\n";
  assert.deepEqual(splitNotes(body), { text: body, notes: null });
});

test("splitNotes keeps prose that follows the callout", () => {
  const parts = splitNotes("Before.\n\n> [!note] Notes\n> One.\n\nAfter.\n");
  assert.equal(parts.notes, "One.");
  assert.equal(parts.text, "Before.\n\n\nAfter.\n");
});

test("L4.3-d1: the inspector reads title, kind, status, label, synopsis, notes, and words without the notes", async () => {
  const path = "Novel/Draft/02 The Tin.md";
  const host = new MemoryHost({
    "Novel/_Project.md": '---\nlonghand: 1\n---\n',
    [path]: note({ id: "C2", type: "text", title: "The Tin", status: "First Draft", label: "Mara", synopsis: "Mara finds the tin." }, BODY),
    "Novel/Draft/03 Untitled-.md": note({ id: "C3", type: "text" }, "One two three.\n"),
    "Novel/People/Mara.md": note({ id: "M", type: "character", title: "Mara" }, "Her sister's keeper.\n"),
  });
  const core = createCore(host);
  assert.deepEqual(await inspect(core, path), {
    path,
    title: "The Tin",
    kind: "Scene",
    status: "First Draft",
    label: "Mara",
    words: 10,
    synopsis: "Mara finds the tin.",
    notes: "**Focus:** the tin, not the letter.\n\nAsk whether Tom *knows*.",
    snapshots: [],
  });
  const bare = await inspect(core, "Novel/Draft/03 Untitled-.md");
  assert.equal(bare?.title, "Untitled-");
  assert.equal(bare?.synopsis, null);
  assert.equal(bare?.notes, null);
  assert.equal(bare?.words, 3);
  assert.equal((await inspect(core, "Novel/People/Mara.md"))?.words, null);
  assert.equal(await inspect(core, "Novel/Draft/99 Missing.md"), null);
});

test("spans reads bold, italic, and escapes, and leaves the rest as written", () => {
  assert.deepEqual(spans("**Focus:** the *tin*, 2 * 3, a\\_b"), [
    { text: "Focus:", bold: true },
    { text: " the " },
    { text: "tin", italic: true },
    { text: ", 2 * 3, a_b" },
  ]);
  assert.deepEqual(spans(""), []);
});

test("the inspector registers a right-sidebar view and a command that opens it", async () => {
  const host = new MemoryHost();
  await inspectorModule.register(createCore(host));
  assert.equal(host.views.get(INSPECTOR_VIEW)?.placement, "right");
  await host.commands.get("inspector-open")!.run();
  assert.deepEqual(host.openedViews, [{ type: INSPECTOR_VIEW, state: { path: "" } }]);
});
