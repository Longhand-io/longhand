// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore } from "../src/core/modules.js";
import { formatStoryDate, fromDays, labelStoryDate, parseStoryDate, ticks, toDays } from "../src/core/storydate.js";
import { MemoryHost } from "../src/host/memory.js";
import { timelineModule } from "../src/modules/timeline/index.js";
import { TimelineModel } from "../src/modules/timeline/model.js";

test("story dates parse at three precisions, round-trip through days, and label for people", () => {
  const y = parseStoryDate("1897")!;
  const m = parseStoryDate("1897-04")!;
  const d = parseStoryDate("1897-04-12")!;
  assert.deepEqual([y.precision, m.precision, d.precision], ["year", "month", "day"]);
  assert.equal(d.days - y.days, 31 + 28 + 31 + 11);
  assert.deepEqual(fromDays(toDays(1897, 4, 12)), { year: 1897, month: 4, day: 12 });
  assert.deepEqual(fromDays(toDays(-44, 3, 15)), { year: -44, month: 3, day: 15 });
  assert.deepEqual(fromDays(toDays(2000, 2, 29)), { year: 2000, month: 2, day: 29 });
  assert.equal(formatStoryDate(d.days, "day"), "1897-04-12");
  assert.equal(formatStoryDate(d.days, "month"), "1897-04");
  assert.equal(formatStoryDate(d.days, "year"), "1897");
  assert.equal(labelStoryDate(d), "12 Apr 1897");
  assert.equal(labelStoryDate(m), "Apr 1897");
  assert.equal(parseStoryDate(1897)?.precision, "year");
  assert.equal(parseStoryDate("April 1897"), null);
  assert.equal(parseStoryDate("1897-13"), null);
});

test("ticks: years for a long span, months for a season, days for a fortnight", () => {
  const years = ticks(toDays(1890, 6, 1), toDays(1920, 1, 1));
  assert.ok(years.length >= 5 && years.length <= 12);
  assert.ok(years.every((t) => /^\d{4}$/.test(t.label)));
  const months = ticks(toDays(1897, 3, 20), toDays(1897, 9, 5));
  assert.deepEqual(
    months.map((t) => t.label),
    ["Apr 1897", "May 1897", "Jun 1897", "Jul 1897", "Aug 1897", "Sep 1897"],
  );
  const days = ticks(toDays(1897, 4, 1), toDays(1897, 4, 14));
  assert.ok(days.length >= 5);
  assert.equal(days[0]?.label, "1 Apr");
});

function vault(): MemoryHost {
  return new MemoryHost({
    "Novel/_Project.md": '---\nlonghand: 1\ntitle: "Harrowmere"\nlabels: ["Red", "Blue", "Green"]\n---\n',
    "Novel/Manuscript/01 The Letter.md": '---\nid: "C1"\ntype: "text"\ntitle: "The Letter"\ndate: "1897-04-12"\nlabel: "Red"\ncreated: "2021-05-22T19:12:38-07:00"\nsynopsis: "Mara finds the letter."\n---\n',
    "Novel/Manuscript/02 The Tin.md": '---\nid: "C2"\ntype: "text"\ntitle: "The Tin"\ndate: "1897-04"\nlabel: "Red"\ncreated: "2021-06-01T10:00:00-07:00"\n---\n',
    "Novel/Manuscript/03 Winter Fair.md": '---\nid: "C3"\ntype: "text"\ntitle: "Winter Fair"\ndate: "1897-12-20"\ndate_end: "1897-12-22"\nlabel: "Blue"\n---\n',
    "Novel/Manuscript/04 Undated.md": '---\nid: "C4"\ntype: "text"\ntitle: "Undated"\n---\n',
    "Novel/Manuscript/05 Odd.md": '---\nid: "C5"\ntype: "text"\ntitle: "Odd"\ndate: "1898"\nlabel: "Purple"\n---\n',
    "Novel/Research/Flood.md": '---\nid: "E1"\ntype: "event"\ntitle: "The flood"\ndate: "1897-11-03"\n---\n',
    "Novel/Research/Stillwater.md": '---\nid: "S1"\ntype: "setting"\ntitle: "Stillwater"\ndate: "1800"\n---\n',
  });
}

test("the timeline lays scenes in threads by label, events apart, undated in the tray, written from created", async () => {
  const core = createCore(vault());
  const tl = await new TimelineModel(core, "Novel/Manuscript/01 The Letter.md").load();
  assert.equal(tl.projectTitle, "Harrowmere");
  assert.deepEqual(
    tl.lanes.map((l) => [l.name, l.items.map((i) => i.title)]),
    [
      ["Red", ["The Letter", "The Tin"]],
      ["Blue", ["Winter Fair"]],
      ["Purple", ["Odd"]],
      ["Events", ["The flood"]],
    ],
  );
  assert.deepEqual(tl.labels, ["Red", "Blue", "Green", "Purple"]);
  assert.equal(tl.lanes[1]?.items[0]?.end?.days, toDays(1897, 12, 22));
  assert.deepEqual(
    tl.undated.map((d) => d.title),
    ["Undated"],
  );
  assert.deepEqual(
    tl.written.map((w) => w.title),
    ["The Letter", "The Tin"],
  );
  assert.ok(tl.min < toDays(1897, 4, 1) && tl.max > toDays(1898, 1, 1), "the setting's date is not on the story axis");
  assert.deepEqual(
    tl.scenes.map((s) => [s.title, Number(s.position.toFixed(2))]),
    [
      ["The Letter", 0],
      ["The Tin", 0.25],
      ["Winter Fair", 0.5],
      ["Undated", 0.75],
      ["Odd", 1],
    ],
  );
});

test("dragging writes one date field at the note's own precision", async () => {
  const host = vault();
  const core = createCore(host);
  const m = new TimelineModel(core, "Novel/_Project.md");
  const value = await m.setDate("Novel/Manuscript/02 The Tin.md", toDays(1897, 7, 9), "month");
  assert.equal(value, "1897-07");
  const text = host.files.get("Novel/Manuscript/02 The Tin.md")!;
  assert.ok(text.includes('date: "1897-07"\nlabel: "Red"\n'));
  assert.ok(text.includes('created: "2021-06-01T10:00:00-07:00"'));
});

test("module registers a project-level view, a command, a ribbon, and a project-note menu entry", async () => {
  const host = vault();
  const core = createCore(host);
  await timelineModule.register(core);
  assert.ok(host.views.has("longhand-timeline"));
  host.active = "Novel/Manuscript/01 The Letter.md";
  await host.commands.get("timeline-open")!.run();
  assert.deepEqual(host.openedViews[0], { type: "longhand-timeline", state: { path: "Novel/_Project.md" } });
  const menu = host.fileMenu.find((m) => m.label === "Open timeline")!;
  assert.equal(menu.check("Novel/_Project.md"), true);
  assert.equal(menu.check("Novel/Manuscript/01 The Letter.md"), false);
});
