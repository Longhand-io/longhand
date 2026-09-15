// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The map module. Registers the map view and three commands: open the active map note as a
// map, create a new map (blank canvas or from an image), and set a map's image.

import type { Core, Module } from "../../core/modules.js";
import { PROJECT_NOTE } from "../../core/projects.js";
import { isImagePath, newMapNote, safeName } from "./model.js";
import { mountMapView } from "./view.js";

export const MAP_VIEW = "longhand-map";

export const mapModule: Module = {
  id: "map",
  name: "Map",
  description: "Any image as a map, or a blank canvas, with pins that link to notes. Pins are stored on the map note.",
  defaultEnabled: true,

  register(core: Core) {
    const host = core.host;

    host.registerView(MAP_VIEW, {
      icon: "map",
      title: (state) => {
        const fm = host.cachedFrontmatter(state.path);
        const t = fm?.["title"];
        return typeof t === "string" && t !== "" ? t : state.path.replace(/\.md$/i, "");
      },
      mount: (el, state) => mountMapView(core, el, state.path),
    });

    const isMap = (path: string): boolean => host.cachedFrontmatter(path)?.["type"] === "map";

    const activeIsMap = (): string | null => {
      const path = host.activeFile();
      return path && isMap(path) ? path : null;
    };

    // a map note opens as a map; the view's "Edit note" button is the way back to the text
    host.registerAutoView(MAP_VIEW, isMap);

    host.registerFileMenu({
      label: "Open as map",
      icon: "map",
      check: isMap,
      run: (path) => host.openView(MAP_VIEW, { path }),
    });

    host.registerCommand({
      id: "map-open",
      name: "Open as map",
      check: () => activeIsMap() !== null,
      run: async () => {
        const path = activeIsMap();
        if (path) await host.openView(MAP_VIEW, { path });
      },
    });

    host.registerCommand({
      id: "map-new",
      name: "New map",
      run: async () => {
        const title = await host.prompt("Map title", "");
        if (!title) return;
        const image = await host.pickFile("image", "Use an image, or press Escape for a blank canvas");
        if (image && !isImagePath(image)) {
          host.notify(`${image} is not an image Longhand can draw.`);
          return;
        }
        const folder = await mapFolder(core);
        const path = uniquePath(host.exists.bind(host), `${folder}${safeName(title)}.md`);
        await host.writeFile(path, newMapNote(core, title, image, path));
        await host.openView(MAP_VIEW, { path });
      },
    });

    host.registerCommand({
      id: "map-set-image",
      name: "Set map image",
      check: () => activeIsMap() !== null,
      run: async () => {
        const path = activeIsMap();
        if (!path) return;
        const image = await host.pickFile("image", "Image for this map");
        if (!image) return;
        if (!isImagePath(image)) {
          host.notify(`${image} is not an image Longhand can draw.`);
          return;
        }
        await core.spec.setField(path, "image", host.linkTo(image, path));
      },
    });
  },
};

/** `<project>/Maps/` for the active file's project, else `Maps/` at the vault root. */
async function mapFolder(core: Core): Promise<string> {
  const active = core.host.activeFile();
  const project = active ? await core.projects.projectOf(active) : null;
  if (project && project.root !== "") return `${project.root}/Maps/`;
  if (project && project.notePath === PROJECT_NOTE) return "Maps/";
  return "Maps/";
}

function uniquePath(exists: (p: string) => boolean, path: string): string {
  if (!exists(path)) return path;
  const dot = path.lastIndexOf(".");
  const stem = path.slice(0, dot);
  const ext = path.slice(dot);
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!exists(candidate)) return candidate;
  }
  return path;
}
