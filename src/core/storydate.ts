// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Story dates. A `date` in frontmatter is a year, a year and month, or a full date, in ISO
// order, and may be far outside what JavaScript's Date handles, so the arithmetic is our
// own: proleptic Gregorian, counted in days. Precision is kept so a date written as a year
// is written back as a year.

export type Precision = "year" | "month" | "day";

export interface StoryDate {
  year: number;
  month: number; // 1..12, 1 when unknown
  day: number; // 1..31, 1 when unknown
  precision: Precision;
  /** days from 0000-03-01, proleptic Gregorian; the axis unit */
  days: number;
}

const RE = /^(-?\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/;

export function parseStoryDate(value: unknown): StoryDate | null {
  if (typeof value === "number" && Number.isInteger(value)) return make(value, 1, 1, "year");
  if (typeof value !== "string") return null;
  const m = RE.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] !== undefined ? Number(m[2]) : 1;
  const day = m[3] !== undefined ? Number(m[3]) : 1;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return make(year, month, day, m[3] !== undefined ? "day" : m[2] !== undefined ? "month" : "year");
}

function make(year: number, month: number, day: number, precision: Precision): StoryDate {
  return { year, month, day, precision, days: toDays(year, month, day) };
}

/** Days since 0000-03-01 in the proleptic Gregorian calendar. Works for any year. */
export function toDays(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const mm = m <= 2 ? m + 9 : m - 3;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * mm + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe;
}

export function fromDays(days: number): { year: number; month: number; day: number } {
  const era = Math.floor(days / 146097);
  const doe = days - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { year: m <= 2 ? y + 1 : y, month: m, day: d };
}

/** Write a date back at a precision: "1897", "1897-04", or "1897-04-12". */
export function formatStoryDate(days: number, precision: Precision): string {
  const { year, month, day } = fromDays(days);
  const y = String(year).padStart(4, "0");
  if (precision === "year") return y;
  const mo = String(month).padStart(2, "0");
  if (precision === "month") return `${y}-${mo}`;
  return `${y}-${mo}-${String(day).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A label for people: "1897", "Apr 1897", "12 Apr 1897". */
export function labelStoryDate(d: StoryDate): string {
  if (d.precision === "year") return String(d.year);
  const mo = MONTHS[d.month - 1] ?? "";
  if (d.precision === "month") return `${mo} ${d.year}`;
  return `${d.day} ${mo} ${d.year}`;
}

export interface Tick {
  days: number;
  label: string;
  major: boolean;
}

/** Evenly spaced ticks for an axis from `min` to `max` days, about `want` of them. */
export function ticks(min: number, max: number, want = 8): Tick[] {
  const span = Math.max(1, max - min);
  const out: Tick[] = [];
  const a = fromDays(min);
  const b = fromDays(max);
  if (span > 365 * 2) {
    const years = b.year - a.year + 1;
    const step = niceStep(years / want);
    const start = Math.floor(a.year / step) * step;
    for (let y = start; y <= b.year + step; y += step) {
      const d = toDays(y, 1, 1);
      if (d >= min && d <= max) out.push({ days: d, label: String(y), major: y % (step * 5) === 0 || step === 1 });
    }
  } else if (span > 45) {
    let y = a.year;
    let m = a.month;
    while (toDays(y, m, 1) <= max) {
      const d = toDays(y, m, 1);
      if (d >= min) out.push({ days: d, label: `${MONTHS[m - 1]} ${y}`, major: m === 1 });
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  } else {
    const step = niceStep(span / want);
    for (let d = Math.ceil(min / step) * step; d <= max; d += step) {
      const p = fromDays(d);
      out.push({ days: d, label: `${p.day} ${MONTHS[p.month - 1]}`, major: p.day === 1 });
    }
  }
  return out;
}

function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}
