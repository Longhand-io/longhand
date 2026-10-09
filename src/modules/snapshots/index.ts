// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Snapshots, the first piece: take one. A command and a file-menu entry that copy the note
// as it is on disk into the project's snapshot store under a title. The inspector lists them.

import type { Core, Module } from "../../core/modules.js";
import { takeSnapshot } from "../../core/snapshots.js";

export const snapshotsModule: Module = {
  id: "snapshots",
  name: "Snapshots",
  description: "Named copies of a note, taken when you say so, kept in the project's _snapshots folder and listed in the inspector. Nothing is taken on its own.",
  defaultEnabled: true,

  register(core: Core) {
    const host = core.host;
    const isNote = (p: string | null): p is string => !!p && p.toLowerCase().endsWith(".md");

    const take = async (path: string) => {
      const title = await host.prompt("Snapshot title", "");
      if (title === null) return;
      const result = await takeSnapshot(core, path, title || "Untitled");
      if (result.ok) {
        host.notify(`Snapshot taken: ${title || "Untitled"}`);
        return;
      }
      const why = {
        "no-note": "That is not a note the vault has.",
        "no-id": "This note has no id in its frontmatter, so a snapshot could not follow it. New… gives notes one.",
        "no-project": "This note is outside every project, and snapshots live in a project's _snapshots folder.",
      }[result.reason];
      host.notify(`No snapshot taken. ${why}`);
    };

    host.registerCommand({
      id: "snapshot-take",
      name: "Take snapshot",
      check: () => isNote(host.activeFile()),
      run: async () => {
        const path = host.activeFile();
        if (isNote(path)) await take(path);
      },
    });
    host.registerFileMenu({
      label: "Take snapshot",
      icon: "camera",
      check: (path) => isNote(path),
      run: (path) => take(path),
    });
  },
};
