// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The timeline module: the story-date axis for a project.

import type { Core, Module } from "../../core/modules.js";
import { currentProject } from "../../core/picker.js";
import { mountTimelineView } from "./view.js";

export const TIMELINE_VIEW = "longhand-timeline";

export const timelineModule: Module = {
  id: "timeline",
  name: "Timeline",
  description: "Every scene and event with a story date on one axis, in threads by label, with a track for when each scene was written. Drag a pin to change its date.",
  defaultEnabled: true,

  register(core: Core) {
    const host = core.host;
    host.registerView(TIMELINE_VIEW, {
      icon: "calendar-range",
      title: (state) => {
        const fm = host.cachedFrontmatter(state.path);
        const t = fm?.["title"];
        return `Timeline: ${typeof t === "string" && t ? t : state.path.replace(/\/_Project\.md$/, "").replace(/\.md$/, "") || "vault"}`;
      },
      mount: (el, state) => {
        if (!state.path) {
          el.textContent = "Open a note in a project first.";
          return { destroy() {} };
        }
        return mountTimelineView(core, el, state.path);
      },
    });

    const open = async () => {
      const project = await currentProject(core);
      if (!project) {
        host.notify("No project in this vault yet. New… on the ribbon can make one.");
        return;
      }
      await host.openView(TIMELINE_VIEW, { path: project.notePath });
    };
    host.registerCommand({ id: "timeline-open", name: "Open timeline", run: open });
    host.registerRibbon("calendar-range", "Open timeline", open);
    host.registerFileMenu({
      label: "Open timeline",
      icon: "calendar-range",
      check: (path) => path === "_Project.md" || path.endsWith("/_Project.md"),
      run: (path) => host.openView(TIMELINE_VIEW, { path }),
    });
  },
};
