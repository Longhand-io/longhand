// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The binder module. First piece: New, the Scrivener-style "add a file and say what kind".
// Scene, folder, character, setting, event, or map. Each lands where its kind already lives
// in the project, gets the next number when its siblings are numbered, and opens.

import type { Core, Module } from "../../core/modules.js";
import type { NoteType } from "../../core/spec.js";
import { childrenOf, dirOf, newId, nextName, nowIso, safeName, uniquePath } from "../../core/naming.js";
import { newMapNote } from "../map/model.js";
import { mountBinderView } from "./view.js";

export const MAP_VIEW_TYPE = "longhand-map";
export const BINDER_VIEW = "longhand-binder";

export interface NewKind {
  id: NoteType;
  label: string;
  description: string;
}

export const KINDS: NewKind[] = [
  { id: "text", label: "Scene", description: "A document in the manuscript, next to the one you are in" },
  { id: "folder", label: "Folder", description: "A chapter or part, next to the one you are in" },
  { id: "character", label: "Character", description: "Someone the manuscript can link to; the cast panel counts their scenes" },
  { id: "setting", label: "Setting", description: "A place that is not a map; pins and shapes can point at it" },
  { id: "event", label: "Event", description: "Something on the timeline that is not a scene" },
  { id: "map", label: "Map", description: "A picture or a blank canvas with pins and shapes" },
  { id: "folder", label: "Project", description: "A new book: a folder with a project note and a Manuscript folder" },
];

export const binderModule: Module = {
  id: "binder",
  name: "Binder",
  description: "The manuscript as an ordered tree with word counts, drag to reorder, and New for scenes, folders, characters, settings, events, and maps in the right place with the right frontmatter.",
  defaultEnabled: true,

  register(core: Core) {
    const host = core.host;

    host.registerView(BINDER_VIEW, {
      icon: "list-tree",
      placement: "left",
      title: () => "Binder",
      mount: (el) => mountBinderView(core, el),
    });
    host.registerCommand({ id: "binder-open", name: "Open binder", run: () => host.openView(BINDER_VIEW, { path: "" }) });
    host.registerRibbon("list-tree", "Open binder", () => host.openView(BINDER_VIEW, { path: "" }));

    const createProject = async (atFolder?: string) => {
      const title = await host.prompt("Project title", "");
      if (!title) return;
      const base = atFolder ? `${atFolder}/` : "";
      const root = uniquePath(host.exists.bind(host), `${base}${safeName(title)}`);
      await host.createFolder(root);
      await host.createFolder(`${root}/Manuscript`);
      const note = core.spec.newNote(
        { longhand: 1, title, labels: ["Red", "Blue", "Green"], statuses: ["To Do", "First Draft", "Revised", "Done"], keywords: [] },
        `# ${title}\n\nThe project note. Labels are the threads on the timeline; the calendar block, if you add one, says how story dates read.\n`,
      );
      await host.writeFile(`${root}/_Project.md`, note);
      await host.writeFile(`${root}/Manuscript/01 Chapter One.md`, core.spec.newNote({ id: newId(), type: "text", title: "Chapter One", created: nowIso() }, ""));
      await host.openNoteAsMarkdown(`${root}/Manuscript/01 Chapter One.md`);
    };

    const create = async (kind: NoteType, atFolder?: string, label?: string) => {
      if (label === "Project") return createProject(atFolder);
      const title = await host.prompt(`${KINDS.find((k) => k.id === kind)?.label ?? "Note"} title`, "");
      if (!title) return;
      const folder = atFolder !== undefined ? atFolder : await placeFor(core, kind);
      const siblings = childrenOf(host.listFiles(), folder);
      const name = nextName(siblings, title);
      const prefix = folder === "" ? "" : `${folder}/`;

      if (kind === "folder") {
        const path = uniquePath(host.exists.bind(host), `${prefix}${name}`);
        await host.createFolder(path);
        host.notify(`Created ${path}`);
        return;
      }

      const path = uniquePath(host.exists.bind(host), `${prefix}${name}.md`);
      if (kind === "map") {
        const image = await host.pickFile("image", "Use an image, or press Escape for a blank canvas");
        await host.writeFile(path, newMapNote(core, title, image, path));
        await host.openView(MAP_VIEW_TYPE, { path });
        return;
      }
      const fields: { [k: string]: string } = { id: newId(), type: kind, title, created: nowIso() };
      await host.writeFile(path, core.spec.newNote(fields, ""));
      await host.openNoteAsMarkdown(path);
    };

    const pickKind = async (): Promise<NewKind | null> =>
      host.choose(
        "New…",
        KINDS.map((k) => ({ label: k.label, detail: k.description, value: k })),
      );

    host.registerCommand({
      id: "new",
      name: "New…",
      run: async () => {
        const kind = await pickKind();
        if (kind) await create(kind.id, undefined, kind.label);
      },
    });
    for (const k of KINDS) {
      if (k.id === "map") continue; // the map module owns New map
      host.registerCommand({ id: `new-${k.label.toLowerCase()}`, name: `New ${k.label.toLowerCase()}`, run: () => create(k.id, undefined, k.label) });
    }
    host.registerRibbon("file-plus", "New scene, folder, character, setting, event, map, or project", async () => {
      const kind = await pickKind();
      if (kind) await create(kind.id, undefined, kind.label);
    });
    host.registerFileMenu({
      label: "New here…",
      icon: "file-plus",
      on: "folder",
      check: () => true,
      run: async (folder) => {
        const kind = await pickKind();
        if (kind) await create(kind.id, folder === "/" ? "" : folder, kind.label);
      },
    });
  },
};

/**
 * Where a new note of this kind goes. Scenes and folders sit next to the active document
 * when it is in a project, else in the project's manuscript folder. Characters, settings,
 * and events go where the project already keeps that kind, else Research. Maps go to Maps.
 */
export async function placeFor(core: Core, kind: NoteType): Promise<string> {
  const active = core.host.activeFile();
  const project = active ? await core.projects.projectOf(active) : (await core.projects.roots())[0] ?? null;
  const root = project ? project.root : "";
  const under = (name: string) => (root === "" ? name : `${root}/${name}`);

  if (kind === "text" || kind === "folder") {
    if (active && project) {
      const dir = dirOf(active);
      const rel = root === "" ? dir : dir.slice(root.length + 1);
      if (rel !== "" && !rel.startsWith("_") && !rel.startsWith(".")) return dir;
    }
    return under(await manuscriptFolder(core, root));
  }
  if (kind === "map") return under("Maps");

  const docs = await core.projects.documents(root);
  const last = [...docs].reverse().find((d) => d.type === kind);
  if (last) return dirOf(last.path);
  return under("Research");
}

/** The project's manuscript folder: the top-level folder holding the most text documents, else "Manuscript". */
async function manuscriptFolder(core: Core, root: string): Promise<string> {
  const docs = await core.projects.documents(root);
  const counts = new Map<string, number>();
  for (const d of docs) {
    if (d.type !== "text" && d.type !== "folder" && d.type !== null) continue;
    const rel = root === "" ? d.path : d.path.slice(root.length + 1);
    const top = rel.split("/")[0] ?? "";
    if (!rel.includes("/")) continue;
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  let best = "Manuscript";
  let bestN = 0;
  for (const [name, n] of counts) {
    if (n > bestN) {
      best = name;
      bestN = n;
    }
  }
  return best;
}
