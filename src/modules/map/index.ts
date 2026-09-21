// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The map module. Registers the map view and three commands: open the active map note as a
// map, create a new map (blank canvas or from an image), and set a map's image.

import type { Core, Module } from "../../core/modules.js";
import { safeName, uniquePath } from "../../core/naming.js";
import { isImagePath, newMapNote } from "./model.js";
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
      mount: (el, state) => {
        if (!state.path) {
          el.textContent = "Open a map note first.";
          return { destroy() {} };
        }
        return mountMapView(core, el, state.path);
      },
    });

    const isMap = (path: string, noteType: string | null = null): boolean => (noteType ?? host.cachedFrontmatter(path)?.["type"]) === "map";

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

    /** Ask for a title and an optional image, write the note, open it as a map. */
    const newMap = async (folder?: string) => {
      const title = await host.prompt("Map title", "");
      if (!title) return;
      const image = await host.pickFile("image", "Use an image, or press Escape for a blank canvas");
      if (image && !isImagePath(image)) {
        host.notify(`${image} is not an image Longhand can draw.`);
        return;
      }
      const dir = folder !== undefined ? (folder === "" || folder === "/" ? "" : `${folder}/`) : await mapFolder(core);
      const path = uniquePath(host.exists.bind(host), `${dir}${safeName(title)}.md`);
      await host.writeFile(path, newMapNote(core, title, image, path));
      await host.openView(MAP_VIEW, { path });
    };

    host.registerCommand({ id: "map-new", name: "New map", run: () => newMap() });
    host.registerRibbon("map", "New map", () => newMap());
    host.registerFileMenu({
      label: "New map here",
      icon: "map",
      on: "folder",
      check: () => true,
      run: (folder) => newMap(folder),
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

/** `<project>/Maps/` for the current project, else `Maps/` at the vault root. */
async function mapFolder(core: Core): Promise<string> {
  const project = await core.projects.current();
  return project && project.root !== "" ? `${project.root}/Maps/` : "Maps/";
}

