// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

import assert from "node:assert/strict";
import { test } from "node:test";
import { oneAnswer } from "../src/host/answer.js";

const turn = () => new Promise<void>((r) => setTimeout(r, 0));

test("a picker that closes and then reports its choice, as Obsidian's suggest modals do, answers with the choice", async () => {
  const got: (string | null)[] = [];
  const answer = oneAnswer<string>((v) => got.push(v));
  answer.dismiss();
  answer.choose("scene");
  await turn();
  assert.deepEqual(got, ["scene"]);
});

test("a picker that only closes answers null, once the turn has ended", async () => {
  const got: (string | null)[] = [];
  const answer = oneAnswer<string>((v) => got.push(v));
  answer.dismiss();
  assert.deepEqual(got, [], "not yet: a choice may still follow");
  await turn();
  assert.deepEqual(got, [null]);
});

test("a picker answers once, whatever follows the first choice", async () => {
  const got: (string | null)[] = [];
  const answer = oneAnswer<string>((v) => got.push(v));
  answer.choose("scene");
  answer.choose("folder");
  answer.dismiss();
  await turn();
  assert.deepEqual(got, ["scene"]);
});
