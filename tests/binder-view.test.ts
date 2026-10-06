// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore } from "../src/core/modules.js";
import { MemoryHost } from "../src/host/memory.js";
import { BINDER_VIEW, binderModule } from "../src/modules/binder/index.js";

import { fakeDom, settle, type FakeElement } from "./dom.js";
import { note } from "./fixtures.js";

const doc = (id: string, type: string) => note({ id, type });

function vault(): MemoryHost {
  return new MemoryHost({
    "Novel/_Project.md": "---\nlonghand: 1\n---\n",
    "Novel/Draft/01 Part One/01 The Letter.md": doc("C1", "text"),
    "Novel/Draft/01 Part One/02 The Tin.md": doc("C2", "text"),
    "Novel/Draft/02 Part Two/01 Return.md": doc("C3", "text"),
    "Other/_Project.md": "---\nlonghand: 1\n---\n",
    "Other/Manuscript/01 Alpha.md": doc("O1", "text"),
  });
}

/** The binder mounted the way the host mounts it, on a note in Part One. */
async function mounted(): Promise<{ host: MemoryHost; el: FakeElement }> {
  const host = vault();
  const core = createCore(host);
  await binderModule.register(core);
  host.setActive("Novel/Draft/01 Part One/02 The Tin.md");
  const el = fakeDom();
  host.views.get(BINDER_VIEW)!.mount(el as unknown as HTMLElement, { path: "" });
  await settle();
  return { host, el };
}

const isAdd = (e: FakeElement) => e.classList.contains("lh-binder-add");
const row = (el: FakeElement, name: string) => {
  const found = el.all((e) => e.classList.contains("lh-binder-row") && e.all((n) => n.classList.contains("lh-binder-name") && n.text === name).length > 0);
  assert.equal(found.length, 1, `one row named ${name}`);
  return found[0]!;
};

test("L4.2-d2: the + in the binder's header makes a scene beside the note you are in", async () => {
  const { host, el } = await mounted();
  const head = el.all((e) => e.classList.contains("lh-binder-head"))[0]!;
  host.prompts.push("Verse");
  head.all(isAdd)[0]!.click();
  await settle();
  assert.ok(host.files.has("Novel/Draft/01 Part One/03 Verse.md"));
  assert.equal(row(el, "Verse").all(isAdd).length, 1, "the tree shows the new scene, with its own +");
});

test("L4.2-d2: the + on a folder's row makes the note in that folder, and does not open the folder's row", async () => {
  const { host, el } = await mounted();
  host.prompts.push("Homecoming");
  row(el, "Part Two").all(isAdd)[0]!.click();
  await settle();
  assert.ok(host.files.has("Novel/Draft/02 Part Two/02 Homecoming.md"));
  assert.equal(row(el, "Part Two").all((e) => e.classList.contains("lh-binder-twisty"))[0]!.text, "▾", "still open: the click did not reach the row");
});

test("L4.2-d2: the + on a note's row makes the new one beside it", async () => {
  const { host, el } = await mounted();
  host.prompts.push("After");
  row(el, "Return").all(isAdd)[0]!.click();
  await settle();
  assert.ok(host.files.has("Novel/Draft/02 Part Two/02 After.md"));
});
