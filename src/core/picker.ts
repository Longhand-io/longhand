// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The project switcher every project-level panel shares. It renders the registry's current
// project and hands a pick back to the registry; the rule for which project is current lives
// in core/projects.ts. Plain DOM, nothing Obsidian-specific.

import type { Core } from "./modules.js";
import type { Project } from "./projects.js";

export interface PickerHandle {
  el: HTMLSelectElement;
  /** re-list the projects and select `root` */
  refresh(root: string | null): Promise<void>;
}

/** A <select> of every project, styled as a panel title. Picking one tells the registry. */
export function projectPicker(core: Core, onPick?: (project: Project) => void): PickerHandle {
  const el = document.createElement("select");
  el.className = "lh-project-picker";
  el.title = "Which project this panel shows";
  el.setAttribute("aria-label", "Project");
  let projects: Project[] = [];
  el.addEventListener("change", () => {
    const p = projects.find((x) => x.root === el.value);
    if (!p) return;
    core.projects.choose(p.root);
    onPick?.(p);
  });
  return {
    el,
    async refresh(root) {
      projects = await core.projects.roots();
      el.replaceChildren();
      for (const p of projects) {
        const o = document.createElement("option");
        o.value = p.root;
        o.textContent = p.title;
        el.appendChild(o);
      }
      el.hidden = projects.length === 0;
      if (root !== null && projects.some((p) => p.root === root)) el.value = root;
    },
  };
}
