// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The timeline's data: every note in a project with a story date, laid on one axis and
// grouped into threads by label; events dashed; a second track for when each scene was
// written, from `created`. Nothing is stored; a drag writes one `date` field.

import * as fm from "../../core/frontmatter.js";
import type { Core } from "../../core/modules.js";
import type { Document } from "../../core/spec.js";
import { formatStoryDate, labelStoryDate, parseStoryDate, type Precision, type StoryDate } from "../../core/storydate.js";
import { baseName } from "../../core/wikilink.js";

export interface Item {
  doc: Document;
  title: string;
  kind: "scene" | "event";
  start: StoryDate;
  end: StoryDate | null;
  label: string | null;
  synopsis: string | null;
}

export interface Lane {
  name: string;
  /** a colour index into the label palette, or null for events and the unlabelled */
  color: number | null;
  items: Item[];
}

export interface Written {
  doc: Document;
  title: string;
  days: number;
}

/** A scene in binder order, dated or not, for the manuscript-order axis. */
export interface SceneRef {
  doc: Document;
  title: string;
  label: string | null;
  synopsis: string | null;
  /** 0 to 1 along the manuscript */
  position: number;
}

export interface Timeline {
  root: string;
  projectTitle: string;
  /** every scene in binder order, for the manuscript-order axis */
  scenes: SceneRef[];
  lanes: Lane[];
  written: Written[];
  undated: Document[];
  min: number;
  max: number;
  labels: string[];
}

export class TimelineModel {
  constructor(
    private readonly core: Core,
    readonly anchorPath: string,
  ) {}

  async load(): Promise<Timeline> {
    const project = await this.core.projects.projectOf(this.anchorPath);
    const root = project ? project.root : "";
    const projectNote = project ? await this.core.spec.read(project.notePath) : null;
    const labelsRaw = projectNote ? fm.get(projectNote.fields, "labels") : undefined;
    const labels = Array.isArray(labelsRaw) ? labelsRaw.filter((l): l is string => typeof l === "string") : [];
    const docs = await this.core.projects.documents(root);
    const items: Item[] = [];
    const undated: Document[] = [];
    const written: Written[] = [];
    const scenes: SceneRef[] = [];
    for (const doc of docs) {
      const isScene = doc.type === "text" || doc.type === null;
      const isEvent = doc.type === "event";
      if (!isScene && !isEvent) continue;
      const title = doc.title ?? baseName(doc.path).replace(/^\d+\s+/, "");
      if (isScene) {
        const label = fm.get(doc.fields, "label");
        const synopsis = fm.get(doc.fields, "synopsis");
        scenes.push({
          doc,
          title,
          label: typeof label === "string" && label !== "" ? label : null,
          synopsis: typeof synopsis === "string" && synopsis !== "" ? synopsis : null,
          position: 0,
        });
      }
      const start = parseStoryDate(fm.get(doc.fields, "date"));
      if (!start) {
        if (isScene) undated.push(doc);
        continue;
      }
      const end = parseStoryDate(fm.get(doc.fields, "date_end"));
      const label = fm.get(doc.fields, "label");
      const synopsis = fm.get(doc.fields, "synopsis");
      items.push({
        doc,
        title,
        kind: isEvent ? "event" : "scene",
        start,
        end: end && end.days > start.days ? end : null,
        label: typeof label === "string" && label !== "" ? label : null,
        synopsis: typeof synopsis === "string" && synopsis !== "" ? synopsis : null,
      });
      if (isScene) {
        const created = fm.get(doc.fields, "created");
        const c = typeof created === "string" ? parseStoryDate(created.slice(0, 10)) : null;
        if (c) written.push({ doc, title, days: c.days });
      }
    }
    scenes.forEach((s, i) => {
      s.position = scenes.length > 1 ? i / (scenes.length - 1) : 0.5;
    });
    // threads: one lane per label in the project's order, then any label the project note
    // does not list, then the unlabelled, then events
    const order = [...labels];
    for (const it of items) if (it.label && !order.includes(it.label)) order.push(it.label);
    for (const s of scenes) if (s.label && !order.includes(s.label)) order.push(s.label);
    const lanes: Lane[] = [];
    for (const [i, name] of order.entries()) {
      const laneItems = items.filter((it) => it.kind === "scene" && it.label === name);
      if (laneItems.length) lanes.push({ name, color: i, items: laneItems });
    }
    const unlabelled = items.filter((it) => it.kind === "scene" && !it.label);
    if (unlabelled.length) lanes.push({ name: lanes.length ? "Unlabelled" : "Story", color: null, items: unlabelled });
    const events = items.filter((it) => it.kind === "event");
    if (events.length) lanes.push({ name: "Events", color: null, items: events });
    const all = items.map((it) => it.end ? it.end.days : it.start.days).concat(items.map((it) => it.start.days));
    let min = all.length ? Math.min(...all) : 0;
    let max = all.length ? Math.max(...all) : 365;
    if (max - min < 30) {
      min -= 15;
      max += 15;
    }
    const pad = (max - min) * 0.04;
    return {
      root,
      projectTitle: (projectNote?.title ?? (root || "Vault")).toString(),
      scenes,
      lanes,
      written,
      undated,
      min: min - pad,
      max: max + pad,
      labels: order,
    };
  }

  /** Write one date at the precision the note already uses; a new date gets day precision. */
  async setDate(path: string, days: number, precision: Precision = "day"): Promise<string> {
    const value = formatStoryDate(Math.round(days), precision);
    await this.core.spec.setField(path, "date", value);
    return value;
  }

  labelFor(d: StoryDate): string {
    return labelStoryDate(d);
  }
}
