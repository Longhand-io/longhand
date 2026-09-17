// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Story calendars. A project says how its time works in the project note's `calendar`
// block; dates in scenes are read and written through that. Three kinds:
//
//   gregorian  real dates: 1897, 1897-04, 1897-04-12, any era (the default)
//   custom     the writer's own months and year length, with an era name
//   count      plain counting: Day 12, Year 3, Turn 40; one unit, no months
//
// Every kind maps a date to a number on one axis so the timeline can lay it out, and back
// again at the precision the note used.

import { formatStoryDate, fromDays, labelStoryDate, parseStoryDate, ticks as gregorianTicks, toDays, type Precision, type StoryDate, type Tick } from "./storydate.js";
import type { Value } from "./frontmatter.js";

export type { Precision, StoryDate, Tick };

export interface Calendar {
  kind: "gregorian" | "custom" | "count";
  /** what to tell the writer a date looks like */
  hint: string;
  parse(value: unknown): StoryDate | null;
  format(days: number, precision: Precision): string;
  label(d: StoryDate): string;
  ticks(min: number, max: number, want?: number): Tick[];
}

export interface CustomCalendarSpec {
  months: string[];
  /** one number for every month, or one per month */
  daysPerMonth: number | number[];
  era?: string;
}

export interface CountCalendarSpec {
  unit: string;
}

/** The calendar a project note declares, or Gregorian. */
export function calendarFor(fields: { [key: string]: Value | undefined } | null | undefined): Calendar {
  const raw = fields?.["calendar"];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return gregorian();
  const kind = raw["kind"];
  if (kind === "count") {
    const unit = typeof raw["unit"] === "string" && raw["unit"].trim() ? raw["unit"].trim() : "Day";
    return count({ unit });
  }
  if (kind === "custom") {
    const months = Array.isArray(raw["months"]) ? raw["months"].filter((m): m is string => typeof m === "string" && m.trim() !== "") : [];
    const dpm = raw["days_per_month"];
    const daysPerMonth = Array.isArray(dpm) ? dpm.map((n) => (typeof n === "number" && n > 0 ? Math.floor(n) : 30)) : typeof dpm === "number" && dpm > 0 ? Math.floor(dpm) : 30;
    const era = typeof raw["era"] === "string" ? raw["era"].trim() : "";
    if (months.length === 0) return count({ unit: "Year" });
    return custom({ months, daysPerMonth, ...(era ? { era } : {}) });
  }
  return gregorian();
}

export function gregorian(): Calendar {
  return {
    kind: "gregorian",
    hint: "a year, a year and month, or a full date: 1897, 1897-04, 1897-04-12",
    parse: parseStoryDate,
    format: formatStoryDate,
    label: labelStoryDate,
    ticks: gregorianTicks,
  };
}

export function custom(spec: CustomCalendarSpec): Calendar {
  const months = spec.months;
  const lengths = months.map((_, i) => (Array.isArray(spec.daysPerMonth) ? (spec.daysPerMonth[i] ?? spec.daysPerMonth[spec.daysPerMonth.length - 1] ?? 30) : spec.daysPerMonth));
  const yearLen = lengths.reduce((a, b) => a + b, 0);
  const before: number[] = [];
  let acc = 0;
  for (const l of lengths) {
    before.push(acc);
    acc += l;
  }
  const era = spec.era ? ` ${spec.era}` : "";
  const monthIndex = (s: string): number => {
    const n = Number(s);
    if (Number.isInteger(n) && n >= 1 && n <= months.length) return n - 1;
    const i = months.findIndex((m) => m.toLowerCase() === s.trim().toLowerCase());
    return i;
  };
  const days = (y: number, m: number, d: number) => y * yearLen + (before[m - 1] ?? 0) + (d - 1);
  const split = (total: number) => {
    const y = Math.floor(total / yearLen);
    let rem = total - y * yearLen;
    let m = 0;
    while (m < lengths.length - 1 && rem >= (lengths[m] ?? 30)) {
      rem -= lengths[m] ?? 30;
      m++;
    }
    return { year: y, month: m + 1, day: rem + 1 };
  };
  return {
    kind: "custom",
    hint: `a year, a year and month, or a full date in this calendar: 412, 412-${months[0]}, 412-${months[0]}-15 (months: ${months.join(", ")})`,
    parse(value) {
      if (typeof value === "number" && Number.isInteger(value)) return { year: value, month: 1, day: 1, precision: "year", days: days(value, 1, 1) };
      if (typeof value !== "string") return null;
      const parts = value.trim().split("-");
      if (parts.length < 1 || parts.length > 3) return null;
      const year = Number(parts[0]);
      if (!Number.isInteger(year)) return null;
      let month = 1;
      let day = 1;
      let precision: Precision = "year";
      if (parts.length >= 2) {
        const mi = monthIndex(parts[1] ?? "");
        if (mi < 0) return null;
        month = mi + 1;
        precision = "month";
      }
      if (parts.length === 3) {
        day = Number(parts[2]);
        if (!Number.isInteger(day) || day < 1 || day > (lengths[month - 1] ?? 30)) return null;
        precision = "day";
      }
      return { year, month, day, precision, days: days(year, month, day) };
    },
    format(total, precision) {
      const { year, month, day } = split(Math.round(total));
      if (precision === "year") return String(year);
      const m = months[month - 1] ?? String(month);
      if (precision === "month") return `${year}-${m}`;
      return `${year}-${m}-${day}`;
    },
    label(d) {
      if (d.precision === "year") return `${d.year}${era}`;
      const m = months[d.month - 1] ?? String(d.month);
      if (d.precision === "month") return `${m} ${d.year}${era}`;
      return `${d.day} ${m} ${d.year}${era}`;
    },
    ticks(min, max, want = 8) {
      const span = Math.max(1, max - min);
      const out: Tick[] = [];
      if (span > yearLen * 2) {
        const a = split(min).year;
        const b = split(max).year;
        const step = nice((b - a + 1) / want);
        for (let y = Math.floor(a / step) * step; y <= b + step; y += step) {
          const d = days(y, 1, 1);
          if (d >= min && d <= max) out.push({ days: d, label: `${y}${era}`, major: step === 1 || y % (step * 5) === 0 });
        }
      } else if (span > Math.max(...lengths) * 1.5) {
        let { year, month } = split(min);
        while (days(year, month, 1) <= max) {
          const d = days(year, month, 1);
          if (d >= min) out.push({ days: d, label: `${months[month - 1]} ${year}`, major: month === 1 });
          month++;
          if (month > months.length) {
            month = 1;
            year++;
          }
        }
      } else {
        const step = nice(span / want);
        for (let d = Math.ceil(min / step) * step; d <= max; d += step) {
          const p = split(d);
          out.push({ days: d, label: `${p.day} ${months[p.month - 1]}`, major: p.day === 1 });
        }
      }
      return out;
    },
  };
}

export function count(spec: CountCalendarSpec): Calendar {
  const unit = spec.unit;
  const re = new RegExp(`^(?:${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*)?(-?\\d+)$`, "i");
  return {
    kind: "count",
    hint: `a number, on its own or as ${unit} 12`,
    parse(value) {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number(re.exec(value.trim())?.[1]) : NaN;
      if (!Number.isInteger(n)) return null;
      return { year: n, month: 1, day: 1, precision: "day", days: n };
    },
    format(total) {
      return `${unit} ${Math.round(total)}`;
    },
    label(d) {
      return `${unit} ${d.days}`;
    },
    ticks(min, max, want = 8) {
      const step = nice(Math.max(1, max - min) / want);
      const out: Tick[] = [];
      for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push({ days: v, label: `${unit} ${v}`, major: v % (step * 5) === 0 });
      return out;
    },
  };
}

function nice(raw: number): number {
  if (raw <= 1) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

// re-exported so callers that only need real dates keep one import
export { fromDays, toDays };
