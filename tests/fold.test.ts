// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { formatStoryDate, toDays } from "../src/core/storydate.js";
import { foldPins, type Box, type FoldOptions } from "../src/modules/timeline/fold.js";

const opts: FoldOptions = {
  maxRows: 3,
  gap: 8,
  periods: [(days) => formatStoryDate(days, "month"), (days) => formatStoryDate(days, "year")],
  chipWidth: () => 60,
};

/** A pin 100 pixels wide, `centre` pixels along the track. */
const box = (centre: number, year: number, month: number, day: number): Box => ({ centre, width: 100, days: toDays(year, month, day) });

test("pins with room stay pins: rows fill left to right and nothing folds", () => {
  const units = foldPins([box(100, 1897, 4, 1), box(150, 1897, 4, 9), box(400, 1897, 9, 1)], opts);
  assert.deepEqual(
    units.map((u) => [u.members, u.row, u.period]),
    [
      [[0], 0, null],
      [[1], 1, null],
      [[2], 0, null],
    ],
  );
});

test("a crowd deeper than the track allows folds into its month; a pin with room is left alone", () => {
  const april = [100, 110, 120, 130, 140].map((c, i) => box(c, 1897, 4, i + 1));
  const units = foldPins([...april, box(1000, 1899, 1, 1)], opts);
  assert.deepEqual(
    units.map((u) => [u.members, u.row, u.period]),
    [
      [[0, 1, 2, 3, 4], 0, "1897-04"],
      [[5], 0, null],
    ],
  );
  assert.equal(units[0]?.centre, 120);
  assert.equal(units[0]?.width, 60);
});

test("when months cannot thin a crowd it folds by year, one chip per year in axis order", () => {
  const boxes = [1897, 1898].flatMap((year, y) => Array.from({ length: 12 }, (_, m) => box(100 + (y * 12 + m) * 10, year, m + 1, 1)));
  const units = foldPins(boxes, opts);
  assert.deepEqual(
    units.map((u) => [u.period, u.members.length, u.row]),
    [
      ["1897", 12, 0],
      ["1898", 12, 0],
    ],
  );
  assert.deepEqual(units[1]?.members, [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
});

test("a month already folded joins its year when the crowd is still too deep", () => {
  // six scenes in April, then one a month for the rest of the year, all on top of each other
  const boxes = [...Array.from({ length: 6 }, (_, i) => box(100 + i, 1897, 4, i + 1)), ...Array.from({ length: 8 }, (_, i) => box(110 + i * 5, 1897, 5 + i, 1))];
  const units = foldPins(boxes, opts);
  assert.deepEqual(
    units.map((u) => [u.period, u.members.length]),
    [["1897", 14]],
  );
});

test("with no period to fold by, a crowd keeps its extra rows", () => {
  const boxes = [100, 110, 120, 130, 140].map((c, i) => box(c, 1897, 4, i + 1));
  const atFullZoom = foldPins(boxes, { ...opts, periods: [] });
  assert.deepEqual(
    atFullZoom.map((u) => u.row),
    [0, 1, 2, 3, 4],
  );
  // a counting calendar names every day its own period, so nothing shares a key
  const counted = foldPins(boxes, { ...opts, periods: [(days) => `Day ${days}`] });
  assert.ok(counted.every((u) => u.period === null));
  assert.equal(counted.length, 5);
});
