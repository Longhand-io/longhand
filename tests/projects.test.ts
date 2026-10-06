// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore } from "../src/core/modules.js";
import { MemoryHost } from "../src/host/memory.js";

import { note } from "./fixtures.js";

const doc = (id: string, extra: { [k: string]: string | number } = {}) => note({ id, type: "text", ...extra });

// The same shape the importer writes for the synthetic fixture, plus a second project.
function fixtureVault(): MemoryHost {
  return new MemoryHost({
    "Fixture Novel/_Project.md": '---\nlonghand: 1\ntitle: "Fixture Novel"\n---\n',
    "Fixture Novel/Manuscript/01 Part One/01 Part One.md": doc("P1"),
    "Fixture Novel/Manuscript/01 Part One/01 The Letter- A Beginning-.md": doc("C1"),
    "Fixture Novel/Manuscript/01 Part One/02 The Tin.md": doc("C2"),
    "Fixture Novel/Manuscript/01 Part One/03 Verse.md": doc("C3"),
    "Fixture Novel/Manuscript/01 Part One/10 Late.md": doc("C10"),
    "Fixture Novel/Research/01 Gazette.md": doc("PDF1", { type: "pdf" }),
    "Fixture Novel/Research/02 Map notes.md": doc("N1"),
    "Fixture Novel/_snapshots/C1/2020-01-20T04-27-36Z First Draft.md": doc("C1"),
    "Fixture Novel/.scriv2obsidian.json": "{}",
    "Other/_Project.md": '---\nlonghand: 1\n---\n',
    "Other/Manuscript/Beta.md": doc("O2", { order: 2 }),
    "Other/Manuscript/Alpha.md": doc("O1", { order: 1 }),
    "Other/Manuscript/Gamma.md": doc("O3", { order: 3 }),
    "Loose note.md": doc("L"),
  });
}

test("finds project roots by their project note", async () => {
  const core = createCore(fixtureVault());
  const roots = await core.projects.roots();
  assert.deepEqual(
    roots.map((r) => r.root),
    ["Fixture Novel", "Other"],
  );
  assert.equal((await core.projects.projectOf("Fixture Novel/Manuscript/01 Part One/02 The Tin.md"))?.root, "Fixture Novel");
  assert.equal(await core.projects.projectOf("Loose note.md"), null);
});

test("L2.3-a1: documents come back in binder order, numeric prefixes first, snapshots hidden", async () => {
  const core = createCore(fixtureVault());
  const docs = await core.projects.documents("Fixture Novel");
  assert.deepEqual(
    docs.map((d) => d.id),
    ["P1", "C1", "C2", "C3", "C10", "PDF1", "N1"],
  );
});

test("order fields sort a project written with --no-prefix", async () => {
  const core = createCore(fixtureVault());
  const docs = await core.projects.documents("Other");
  assert.deepEqual(
    docs.map((d) => d.id),
    ["O1", "O2", "O3"],
  );
});

test("resolves id to path and back, and drops the cache on change", async () => {
  const host = fixtureVault();
  const core = createCore(host);
  assert.equal((await core.projects.byId("C2"))?.path, "Fixture Novel/Manuscript/01 Part One/02 The Tin.md");
  assert.equal((await core.projects.byPath("Fixture Novel/Research/02 Map notes.md"))?.id, "N1");
  await host.writeFile("Fixture Novel/Manuscript/02 Part Two/01 New.md", doc("NEW"));
  assert.equal((await core.projects.byId("NEW"))?.path, "Fixture Novel/Manuscript/02 Part Two/01 New.md");
});

test("warns once when a project note declares a newer spec", async () => {
  const host = new MemoryHost({ "Future/_Project.md": "---\nlonghand: 2\n---\n" });
  const core = createCore(host);
  await core.projects.roots();
  await core.projects.roots();
  assert.equal(host.notices.length, 1);
  assert.ok(host.notices[0]?.includes("spec 2"));
});

const PROJECT = '---\nlonghand: 1\ntitle: "Novel"\n---\n';

/** A host that runs `during` once, in the middle of its next read: a change that lands while the registry is reading. */
class InterruptingHost extends MemoryHost {
  during: (() => Promise<void>) | null = null;

  override async readFile(path: string): Promise<string> {
    const text = await super.readFile(path);
    const run = this.during;
    this.during = null;
    if (run) await run();
    return text;
  }
}

test("a vault that loads file by file, as a host does at startup, ends with every document indexed", async () => {
  const host = new MemoryHost();
  const core = createCore(host);
  // the project note arriving makes the registry look for the current project, which starts
  // the index while the rest of the vault is still on its way
  await host.writeFile("Novel/_Project.md", PROJECT);
  await host.writeFile("Novel/Draft/01 One.md", doc("A"));
  await host.writeFile("Novel/Draft/02 Two.md", doc("B"));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(
    (await core.projects.documents("Novel")).map((d) => d.id),
    ["A", "B"],
  );
});

test("a note that appears while the index is being built is not lost", async () => {
  const host = new InterruptingHost({ "Novel/_Project.md": PROJECT, "Novel/Draft/01 One.md": doc("A") });
  host.during = () => host.writeFile("Novel/Draft/02 Two.md", doc("B"));
  const core = createCore(host);
  await core.projects.documents("Novel");
  assert.deepEqual(
    (await core.projects.documents("Novel")).map((d) => d.id),
    ["A", "B"],
  );
});

test("a note renamed while the index is being built is indexed under its new path only", async () => {
  const host = new InterruptingHost({ "Novel/_Project.md": PROJECT, "Novel/Draft/01 One.md": doc("A"), "Novel/Draft/02 Two.md": doc("B") });
  host.during = () => host.renameFile("Novel/Draft/01 One.md", "Novel/Draft/03 One.md");
  const core = createCore(host);
  await core.projects.documents("Novel");
  assert.deepEqual(
    (await core.projects.documents("Novel")).map((d) => d.path),
    ["Novel/Draft/02 Two.md", "Novel/Draft/03 One.md"],
  );
});

test("a folder moved while the index is being built leaves no document under its old path", async () => {
  const host = new InterruptingHost({ "Novel/_Project.md": PROJECT, "Novel/Draft/01 One.md": doc("A"), "Novel/Draft/02 Two.md": doc("B") });
  host.during = () => host.renameFile("Novel/Draft", "Novel/Manuscript");
  const core = createCore(host);
  await core.projects.documents("Novel");
  assert.deepEqual(
    (await core.projects.documents("Novel")).map((d) => d.path),
    ["Novel/Manuscript/01 One.md", "Novel/Manuscript/02 Two.md"],
  );
});

test("a note changed again while changes are being read keeps its newest text", async () => {
  const one = "Novel/Draft/01 One.md";
  const host = new InterruptingHost({ "Novel/_Project.md": PROJECT, [one]: doc("A", { title: "first" }), "Novel/Draft/02 Two.md": doc("B") });
  const core = createCore(host);
  await core.projects.documents("Novel");
  await host.writeFile(one, doc("A", { title: "second" }));
  host.during = () => host.writeFile(one, doc("A", { title: "third" }));
  await core.projects.byId("A");
  assert.equal((await core.projects.byId("A"))?.title, "third");
});
