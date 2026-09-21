// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The project switcher every project-level panel shares, and the rule for which project a
// panel shows: the project of the note you open, else the one you last picked, else the first.
// Nothing here is Obsidian-specific; it is plain DOM on the host's file list.

import type { Core } from "./modules.js";

export interface ProjectChoice {
  root: string;
  notePath: string;
  title: string;
}

/** The last project a writer chose in any panel this session. */
let lastPicked: string | null = null;

export function rememberProject(root: string): void {
  lastPicked = root;
}

export async function listProjects(core: Core): Promise<ProjectChoice[]> {
  const out: ProjectChoice[] = [];
  for (const p of await core.projects.roots()) {
    const note = await core.spec.read(p.notePath);
    out.push({ root: p.root, notePath: p.notePath, title: note.title ?? (p.root || "Vault") });
  }
  return out;
}

/**
 * Which project a panel should show now. The active note's project wins; otherwise the last
 * pick, or the first project. Null when the vault has no project.
 */
export async function currentProject(core: Core, activePath: string | null = core.host.activeFile()): Promise<ProjectChoice | null> {
  const all = await listProjects(core);
  if (all.length === 0) return null;
  if (activePath) {
    const p = await core.projects.projectOf(activePath);
    if (p) return all.find((x) => x.root === p.root) ?? null;
  }
  return all.find((x) => x.root === lastPicked) ?? all[0] ?? null;
}

export interface PickerHandle {
  el: HTMLSelectElement;
  /** re-list the projects and select `root` */
  refresh(root: string | null): Promise<void>;
}

/** A <select> of every project, styled as a panel title. */
export function projectPicker(core: Core, onPick: (choice: ProjectChoice) => void): PickerHandle {
  const el = document.createElement("select");
  el.className = "lh-project-picker";
  el.title = "Which project this panel shows";
  el.setAttribute("aria-label", "Project");
  let choices: ProjectChoice[] = [];
  el.addEventListener("change", () => {
    const c = choices.find((x) => x.root === el.value);
    if (!c) return;
    rememberProject(c.root);
    onPick(c);
  });
  return {
    el,
    async refresh(root) {
      choices = await listProjects(core);
      el.replaceChildren();
      for (const c of choices) {
        const o = document.createElement("option");
        o.value = c.root;
        o.textContent = c.title;
        el.appendChild(o);
      }
      el.hidden = choices.length === 0;
      if (root !== null && choices.some((c) => c.root === root)) el.value = root;
    },
  };
}
