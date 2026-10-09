// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore } from "../src/core/modules.js";
import { listSnapshots, snapshotPath, stamp, takeSnapshot } from "../src/core/snapshots.js";
import { MemoryHost } from "../src/host/memory.js";
import { inspect } from "../src/modules/inspector/model.js";
import { snapshotsModule } from "../src/modules/snapshots/index.js";

import { note } from "./fixtures.js";

const WHEN = new Date(Date.UTC(2026, 9, 8, 3, 14, 15));

function vault(): MemoryHost {
  return new MemoryHost({
    "Novel/_Project.md": "---\nlonghand: 1\n---\n",
    "Novel/Draft/02 The Tin.md": note({ id: "C2", type: "text", title: "The Tin" }, "Under the stair.\n"),
    "Novel/Draft/03 No id.md": "Just text.\n",
    "Novel/_snapshots/C2/2020-01-20T04-27-36Z First Draft.md": note({ id: "C2", type: "text" }, "Older.\n"),
    "Novel/_snapshots/C2/2021-06-01T10-00-00Z Untitled.md": note({ id: "C2", type: "text" }, "Newer.\n"),
    "Novel/_snapshots/C2/stray.txt": "",
    "Loose.md": note({ id: "L", type: "text" }, "Outside any project.\n"),
  });
}

test("a snapshot's path is the spec's: project, _snapshots, the id, a UTC stamp, the title as a file name", () => {
  assert.equal(stamp(WHEN), "2026-10-08T03-14-15Z");
  assert.equal(snapshotPath("Novel", "C2", WHEN, "before the cut: act 2?"), "Novel/_snapshots/C2/2026-10-08T03-14-15Z before the cut- act 2-.md");
  assert.equal(snapshotPath("", "C2", WHEN, ""), "_snapshots/C2/2026-10-08T03-14-15Z Untitled.md");
});

test("listing reads only this document's snapshots, newest first, and skips what is not a snapshot", () => {
  const got = listSnapshots(vault().listFiles(), "Novel", "C2");
  assert.deepEqual(
    got.map((s) => [s.title, s.when.toISOString()]),
    [
      ["Untitled", "2021-06-01T10:00:00.000Z"],
      ["First Draft", "2020-01-20T04:27:36.000Z"],
    ],
  );
  assert.deepEqual(listSnapshots(vault().listFiles(), "Novel", "C9"), []);
});

test("L3.1-d1: taking a snapshot copies the note as it is on disk, and the inspector lists it first", async () => {
  const host = vault();
  const core = createCore(host);
  const path = "Novel/Draft/02 The Tin.md";
  const result = await takeSnapshot(core, path, "before the cut", WHEN);
  assert.deepEqual(result, { ok: true, path: "Novel/_snapshots/C2/2026-10-08T03-14-15Z before the cut.md" });
  assert.equal(host.files.get("Novel/_snapshots/C2/2026-10-08T03-14-15Z before the cut.md"), host.files.get(path));
  const shown = await inspect(core, path);
  assert.deepEqual(shown?.snapshots.map((s) => s.title), ["before the cut", "Untitled", "First Draft"]);
  assert.equal(shown?.words, 3, "the copies are not counted as the note's words");
});

test("a note without an id, or outside every project, is refused with the reason", async () => {
  const core = createCore(vault());
  assert.deepEqual(await takeSnapshot(core, "Novel/Draft/03 No id.md", "x", WHEN), { ok: false, reason: "no-id" });
  assert.deepEqual(await takeSnapshot(core, "Loose.md", "x", WHEN), { ok: false, reason: "no-project" });
  assert.deepEqual(await takeSnapshot(core, "Novel/Draft/09 Missing.md", "x", WHEN), { ok: false, reason: "no-note" });
});

test("the Take snapshot command asks for a title, takes it for the active note, and says so", async () => {
  const host = vault();
  const core = createCore(host);
  await snapshotsModule.register(core);
  host.setActive("Novel/Draft/02 The Tin.md");
  host.prompts.push("before the cut");
  await host.commands.get("snapshot-take")!.run();
  const taken = [...host.files.keys()].filter((p) => p.startsWith("Novel/_snapshots/C2/") && p.endsWith(" before the cut.md"));
  assert.equal(taken.length, 1);
  assert.deepEqual(host.notices, ["Snapshot taken: before the cut"]);
  host.setActive("Novel/Draft/03 No id.md");
  host.prompts.push("x");
  await host.commands.get("snapshot-take")!.run();
  assert.match(host.notices[1] ?? "", /^No snapshot taken\. This note has no id/);
});
