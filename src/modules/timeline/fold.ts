// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Folding a crowded track. Pins pack into rows left to right; a crowd that would stack deeper
// than the track allows folds into one chip per period, month first and then year, so a heavy
// timeline reads as its shape from a distance and opens into scenes as the writer zooms in.
// Arithmetic on boxes only: the view measures, this decides, the view draws.

export interface Box {
  /** the pin's centre along the track, in pixels */
  centre: number;
  width: number;
  /** where the pin sits on the story axis */
  days: number;
}

export interface Unit {
  centre: number;
  width: number;
  row: number;
  /** indices into the boxes given, in axis order: one for a pin, more for a fold */
  members: number[];
  /** the period a fold stands for; null for a single pin */
  period: string | null;
}

export interface FoldOptions {
  /** the deepest a crowd may stack before it folds */
  maxRows: number;
  /** the least space between two tags on one row, in pixels */
  gap: number;
  /** the period a day falls in, from fine to coarse; pins with equal keys fold together */
  periods: ((days: number) => string)[];
  /** how wide a fold's chip is drawn */
  chipWidth: (period: string, count: number) => number;
}

/**
 * Lay boxes, given in axis order, into rows. Where a crowd needs more than `maxRows`, fold it
 * by each period in turn until it fits. A crowd no period can fold keeps its extra rows.
 */
export function foldPins(boxes: Box[], opts: FoldOptions): Unit[] {
  let units: Unit[] = boxes.map((b, i) => ({ centre: b.centre, width: b.width, row: 0, members: [i], period: null }));
  pack(units, opts.gap);
  for (const period of opts.periods) {
    const crowded = crowds(units, opts.gap).filter((c) => depth(c) > opts.maxRows);
    if (crowded.length === 0) break;
    const folded = new Map<Unit, Unit>();
    for (const crowd of crowded) {
      const groups = new Map<string, Unit[]>();
      for (const u of crowd) {
        const key = period(boxes[u.members[0]!]!.days);
        const g = groups.get(key);
        if (g) g.push(u);
        else groups.set(key, [u]);
      }
      for (const [key, group] of groups) {
        if (group.length < 2) continue;
        const members = group.flatMap((u) => u.members);
        const first = boxes[members[0]!]!;
        const last = boxes[members[members.length - 1]!]!;
        const fold: Unit = { centre: (first.centre + last.centre) / 2, width: opts.chipWidth(key, members.length), row: 0, members, period: key };
        for (const u of group) folded.set(u, fold);
      }
    }
    if (folded.size === 0) continue;
    const next: Unit[] = [];
    for (const u of units) {
      const fold = folded.get(u);
      if (!fold) next.push(u);
      else if (!next.includes(fold)) next.push(fold);
    }
    units = next;
    pack(units, opts.gap);
  }
  return units;
}

/** First row with room, left to right; the same rule the track has always used. */
function pack(units: Unit[], gap: number): void {
  const rowEnds: number[] = [];
  for (const u of units) {
    const start = u.centre - u.width / 2;
    let row = rowEnds.findIndex((end) => end + gap <= start);
    if (row < 0) {
      row = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[row] = start + u.width;
    u.row = row;
  }
}

/** Runs of units that touch: each one starts before the run so far has ended. */
function crowds(units: Unit[], gap: number): Unit[][] {
  const out: Unit[][] = [];
  let end = -Infinity;
  for (const u of units) {
    const start = u.centre - u.width / 2;
    if (start >= end + gap || out.length === 0) out.push([]);
    out[out.length - 1]!.push(u);
    end = Math.max(end, start + u.width);
  }
  return out;
}

function depth(crowd: Unit[]): number {
  return Math.max(...crowd.map((u) => u.row)) + 1;
}
