// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Writes the Harrowmere demo project: a synthetic novel with enough metadata to exercise every
// module. Three parts, twelve scenes with dates, labels, statuses, synopses, and links; three
// characters and four places with aliases and attachments; two events; a map with pins and
// drawn shapes. No text from any real manuscript.
//
//   node hack/demo-vault.mjs "<vault>/Harrowmere"
//
// Existing files at the same paths are overwritten; an existing map image is kept.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.argv[2];
if (!root) {
  console.error('usage: node hack/demo-vault.mjs "<vault>/Harrowmere"');
  process.exit(2);
}

const q = (s) => JSON.stringify(s);
function note(rel, fields, body = "") {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) lines.push(`${k}: []`);
      else if (typeof v[0] === "object") {
        lines.push(`${k}:`);
        for (const o of v) {
          const entries = Object.entries(o).filter(([, x]) => x !== undefined);
          entries.forEach(([kk, vv], i) => lines.push(`${i === 0 ? "  - " : "    "}${kk}: ${typeof vv === "number" || typeof vv === "boolean" ? vv : q(vv)}`));
        }
      } else {
        lines.push(`${k}:`);
        for (const x of v) lines.push(`  - ${q(x)}`);
      }
    } else if (typeof v === "number" || typeof v === "boolean") lines.push(`${k}: ${v}`);
    else lines.push(`${k}: ${q(v)}`);
  }
  lines.push("---");
  const path = join(root, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, lines.join("\n") + "\n" + body);
}

const created = (d) => `${d}T09:00:00-07:00`;

// the project note is the project's settings; written by hand so the choices show as comments
mkdirSync(root, { recursive: true });
writeFileSync(join(root, "_Project.md"), `---
longhand: 1
title: "Harrowmere"
labels: ["Mara", "Tom", "The town"]      # the threads on the corkboard and the timeline, in this order
statuses: ["To Do", "First Draft", "Revised", "Done"]
keywords: ["winter", "letters", "flood"]
calendar:                                 # how story dates in this project read
  kind: gregorian                         # gregorian: 1897, 1897-04, 1897-04-12
  # kind: custom                          # the writer's own calendar, e.g. 412-Sowing-15
  # months: [Thaw, Sowing, Harvest, Frost]
  # days_per_month: 40
  # era: "AE"
  # kind: count                           # plain counting, e.g. Day 12
  # unit: Day
---
# Harrowmere

A synthetic project for trying Longhand. Every scene, character, place, and event here was written for the demo; none of it is from a real manuscript.
`);

// ---- manuscript: three parts, twelve scenes ----
const scenes = [
  ["01 Part One/01 The House", "The House", "Mara", "Revised", "1897-04-12", null, "Mara finds the letter in the kitchen.", "2021-05-22",
    "The house stands at the edge of [[Harrow Wood]]. Mara found the letter in the kitchen, the only room her mother had ever kept warm. She read it twice and did not open the tin."],
  ["01 Part One/02 Chapel Steps", "Chapel Steps", "The town", "Revised", "1897-04-20", null, "Reverend Ashe waits on the steps with a second letter.", "2021-05-24",
    "The steps were wet. [[Reverend Ashe]] waited on the [[Chapel steps]] with the letter in his coat, and from there you could see the roof of the house above the wood."],
  ["01 Part One/03 The Tin", "The Tin", "Mara", "Revised", "1897-05-02", null, "She decides not to open it. Then she opens it.", "2021-06-01",
    "She decided not to open it. Then she opened it. Buttons, a ribbon, a ferry ticket for [[Stillwater]] dated before she was born."],
  ["01 Part One/04 Winter Fair", "Winter Fair", "Tom", "First Draft", "1897-12-20", "1897-12-22", "Tom sees the tin on the stall and says nothing.", "2021-06-14",
    "Stalls on the frozen mere. [[Tom]] saw the tin on the stall at the fair and said nothing. Mara paid for the crossing with the last of the buttons and walked back past the house in the dark."],
  ["02 Part Two/01 Stillwater Crossing", "Stillwater Crossing", "Mara", "First Draft", "1898-03", null, "The ferryman will not take the letter.", "2021-07-03",
    "The river was low. The ferryman at [[Stillwater]] would not take the letter and would not say why. The Harrow girl waited until dark."],
  ["02 Part Two/02 Buttons", "Buttons", "Tom", "First Draft", "1898-03-15", null, "Tom sells the buttons one at a time.", "2021-07-10",
    "Tom sold the buttons one at a time so the fair would not notice. Each one bought a day."],
  ["02 Part Two/03 The Reading", "The Reading", "The town", "To Do", "1898-04-05", null, "Every name is read from the chapel steps. Hers is not among them.", "2021-08-01",
    "Every name was read from the [[Chapel steps]], and hers was not among them. The town went home."],
  ["02 Part Two/04 The Inventory", "The Inventory", "Mara", "To Do", "1898-04-09", null, "They count everything in the house twice.", "2021-08-08",
    "They counted everything in the house twice, and the tin was not there. Mara said nothing about the crossing."],
  ["03 Part Three/01 Ashes", "Ashes", "The town", "To Do", "1898-11-04", null, "What is left of the house fits into a cart.", "2021-09-02",
    "What was left of the house fitted into the cart. The wood took the rest."],
  ["03 Part Three/02 Last Stall", "Last Stall", "Tom", "To Do", "1898-12-19", "1898-12-21", "Tom keeps the stall one more winter.", "2021-09-15",
    "The fairground was mud and rope by the time she came back for it. Tom had kept the stall at the Winter Fair for one reason."],
  ["03 Part Three/03 The Crossing", "The Crossing", "Mara", "To Do", "1899-01-08", null, "She pays for the crossing with the last button.", "2021-10-01",
    "She paid for the crossing with the last of the buttons. The ferryman at Stillwater took it this time."],
  ["03 Part Three/04 Return", "Return", "Mara", "To Do", null, null, "The house is smaller than she remembers.", "2021-10-20",
    "The house is smaller than she remembers. Undated on purpose: give it a date from the timeline's tray."],
];
for (const [i, [rel, title, label, status, date, dateEnd, synopsis, made, text]] of scenes.entries()) {
  note(`Manuscript/${rel}.md`, {
    id: `HM-${String(i + 1).padStart(3, "0")}`,
    type: "text",
    title,
    created: created(made),
    synopsis,
    label,
    status,
    date: date ?? undefined,
    date_end: dateEnd ?? undefined,
    include: true,
  }, text + "\n");
}
for (const [rel, title] of [["01 Part One", "Part One"], ["02 Part Two", "Part Two"], ["03 Part Three", "Part Three"]]) {
  note(`Manuscript/${rel}/${rel}.md`, { id: `HM-${title.replace(/\s/g, "")}`, type: "folder", title }, `${title} begins here.\n`);
}

// ---- people ----
note("People/Mara.md", { id: "HM-P1", type: "character", title: "Mara", aliases: ["the Harrow girl"], match_names: true, label: "Mara" }, "The one who finds the letter.\n");
note("People/Tom.md", { id: "HM-P2", type: "character", title: "Tom", match_names: true, label: "Tom" }, "Keeps the stall at the fair.\n");
note("People/Reverend Ashe.md", { id: "HM-P3", type: "character", title: "Reverend Ashe", aliases: ["Ashe"], match_names: false }, "Reads the names.\n");

// ---- places ----
note("Places/Stillwater.md", { id: "HM-S1", type: "setting", title: "Stillwater", aliases: ["the crossing"], match_names: true, attachments: ["[[01 Harrowmere.png]]"] }, "A ford below the mountains. The ferry ran until the flood.\n");
note("Places/Harrow Wood.md", { id: "HM-S2", type: "setting", title: "Harrow Wood", aliases: ["the wood"], match_names: false }, "The wood behind the house.\n");
note("Places/The house.md", { id: "HM-S3", type: "setting", title: "The house", match_names: false }, "Where the story opens and ends.\n");
note("Places/Chapel steps.md", { id: "HM-S4", type: "setting", title: "Chapel steps", aliases: ["St Hilda's"], match_names: true }, "The steps the flood reached.\n");

// ---- events ----
note("Research/The flood.md", { id: "HM-E1", type: "event", title: "The flood", date: "1897-11-03" }, "The water reached the chapel steps by nightfall.\n");
note("Research/Father leaves.md", { id: "HM-E2", type: "event", title: "Father leaves", date: "1896-02" }, "Before the story starts.\n");

// ---- map ----
const image = existsSync(join(root, "Research", "01 Harrowmere.png")) ? { image: "[[01 Harrowmere.png]]" } : { width: 1600, height: 1000 };
note("Maps/Harrowmere.md", {
  id: "3C7D0E2B-9A15-4F6E-8B21-5D4A7C9E1F30",
  type: "map",
  title: "Harrowmere",
  ...image,
  pins: [
    { to: "[[The house]]", x: 0.3, y: 0.66, label: "The house" },
    { to: "[[Chapel steps]]", x: 0.46, y: 0.8 },
    { to: "[[04 Winter Fair]]", x: 0.58, y: 0.44, label: "Winter Fair" },
    { to: "[[Stillwater]]", x: 0.74, y: 0.52, label: "Stillwater crossing" },
  ],
  shapes: [
    { id: "s-wood01", type: "polygon", points: "0.25,0.56 0.31,0.53 0.35,0.58 0.34,0.67 0.28,0.69 0.24,0.64", style: "wood", hand: true, label: "Harrow Wood", to: "[[Harrow Wood]]" },
    { id: "s-hills1", type: "line", points: "0.42,0.31 0.5,0.28 0.58,0.3 0.66,0.28", style: "hills", label: "The Saltbacks" },
    { id: "s-river1", type: "line", points: "0.494,0.34 0.5,0.45 0.485,0.6 0.5,0.72 0.48,0.78", style: "river" },
    { id: "s-road01", type: "line", points: "0.3,0.7 0.46,0.78 0.6,0.72 0.74,0.55", style: "road" },
    { id: "s-mere01", type: "circle", x: 0.72, y: 0.6, r: 0.03, style: "water", label: "The mere" },
    { id: "s-sea01", type: "text", x: 0.12, y: 0.14, color: "sea", label: "The Grey Reach" },
    { id: "s-walk01", type: "line", points: "0.3,0.64 0.38,0.58 0.5,0.5 0.58,0.46", style: "route", color: "red", hand: true, label: "Mara's walk" },
  ],
}, "The town and the mere. Double-click to add a pin; pick a tool to draw.\n");

console.log(`Harrowmere written to ${root}`);
