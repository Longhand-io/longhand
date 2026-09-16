// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Small geometry helpers for the drawing layer. Points are [x, y] pairs in whatever
// space the caller uses; nothing here knows about fractions or pixels.

export type Point = [number, number];

/** Ramer–Douglas–Peucker: drop points that stay within `tolerance` of the simplified line. */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.slice();
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i]!, first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist <= tolerance) return [first, last];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx;
  const y = a[1] + t * dy;
  return Math.hypot(p[0] - x, p[1] - y);
}

export function centroid(points: Point[]): Point {
  if (points.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
  }
  return [sx / points.length, sy / points.length];
}

export function bounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Points at roughly even spacing along a polyline, for placing glyphs such as hill peaks. */
export function alongLine(points: Point[], spacing: number): Point[] {
  const out: Point[] = [];
  if (points.length === 0) return out;
  let carry = spacing / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = carry;
    while (d <= seg) {
      const t = seg === 0 ? 0 : d / seg;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += spacing;
    }
    carry = d - seg;
  }
  if (out.length === 0) out.push(points[0]!);
  return out;
}

export function midpoint(points: Point[]): Point {
  if (points.length === 0) return [0, 0];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
  }
  let target = total / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (target <= seg) {
      const t = seg === 0 ? 0 : target / seg;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    target -= seg;
  }
  return points[points.length - 1]!;
}
