// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The binder view: the project as an ordered tree in the left sidebar. Folders are chapters
// and carry the sum of their scenes' words; the active scene is marked; click opens; drag a
// sibling above or below another to reorder, which renumbers the files or writes `order`.

import type { Core } from "../../core/modules.js";
import type { ViewHandle } from "../../host/host.js";
import { formatCount } from "../../core/text.js";
import { applyMove, buildTree, planMove, type Node } from "./tree.js";

export function mountBinderView(core: Core, el: HTMLElement): ViewHandle {
  const root = document.createElement("div");
  root.className = "lh-root lh-binder";
  el.appendChild(root);
  const head = document.createElement("div");
  head.className = "lh-binder-head";
  // the project switcher: every project in the vault; follows the note you open, or your pick
  const picker = document.createElement("select");
  picker.className = "lh-binder-picker";
  picker.title = "Which project the binder shows";
  picker.setAttribute("aria-label", "Project");
  const total = document.createElement("div");
  total.className = "lh-binder-total";
  head.append(picker, total);
  picker.addEventListener("change", () => {
    projectRoot = picker.value;
    pinned = true;
    void render();
  });
  const list = document.createElement("div");
  list.className = "lh-binder-tree";
  root.append(head, list);

  const collapsed = new Set<string>();
  let projectRoot: string | null = null;
  /** true after the writer picked a project by hand; opening a note in another project still switches */
  let pinned = false;
  let activePath: string | null = core.host.activeFile();
  let writing = false;
  let disposed = false;
  let dragging: { node: Node; parent: Node; index: number } | null = null;

  const render = async () => {
    if (disposed) return;
    const roots = await core.projects.roots();
    const titles = new Map<string, string>();
    for (const r of roots) titles.set(r.root, (await core.spec.read(r.notePath)).title ?? (r.root || "Vault"));
    const anchor = activePath ?? "";
    const project = anchor ? await core.projects.projectOf(anchor) : null;
    if (project && !pinned) projectRoot = project.root;
    if (projectRoot === null || !titles.has(projectRoot)) projectRoot = project?.root ?? roots[0]?.root ?? null;
    picker.replaceChildren();
    for (const r of roots) {
      const o = document.createElement("option");
      o.value = r.root;
      o.textContent = titles.get(r.root) ?? r.root;
      picker.appendChild(o);
    }
    if (projectRoot !== null) picker.value = projectRoot;
    picker.hidden = roots.length === 0;
    if (projectRoot === null) {
      total.textContent = "";
      list.replaceChildren();
      const p = document.createElement("p");
      p.className = "lh-binder-empty";
      p.textContent = "No project in this vault yet. A project is a folder with a _Project.md note; New… on the ribbon can start one.";
      list.appendChild(p);
      return;
    }
    const tree = await buildTree(core, projectRoot);
    total.textContent = `${formatCount(tree.words)} words`;
    list.replaceChildren();
    for (const [i, child] of tree.children.entries()) list.appendChild(row(child, tree, i, 0));
  };

  const row = (node: Node, parent: Node, index: number, depth: number): HTMLElement => {
    const item = document.createElement("div");
    item.className = "lh-binder-item";
    const line = document.createElement("div");
    line.className = "lh-binder-row" + (node.kind === "folder" ? " lh-binder-folder" : "") + (node.path === activePath || node.note?.path === activePath ? " lh-binder-active" : "");
    line.style.paddingLeft = `${0.6 + depth * 1.1}rem`;
    line.tabIndex = 0;
    line.draggable = true;
    const twisty = document.createElement("span");
    twisty.className = "lh-binder-twisty";
    if (node.kind === "folder" && node.children.length) {
      twisty.textContent = collapsed.has(node.path) ? "▸" : "▾";
      twisty.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (collapsed.has(node.path)) collapsed.delete(node.path);
        else collapsed.add(node.path);
        void render();
      });
    }
    const name = document.createElement("span");
    name.className = "lh-binder-name";
    name.textContent = node.name;
    const meta = document.createElement("span");
    meta.className = "lh-binder-meta";
    if (node.status) meta.appendChild(pill(node.status));
    if (node.words) {
      const w = document.createElement("span");
      w.className = "lh-binder-words";
      w.textContent = formatCount(node.words);
      meta.appendChild(w);
    }
    if (node.label) {
      const dot = document.createElement("i");
      dot.className = "lh-binder-lab";
      dot.title = node.label;
      name.prepend(dot);
    }
    line.append(twisty, name, meta);
    const open = () => {
      const target = node.kind === "doc" ? node.path : node.note?.path;
      if (target) void core.host.openNote(target);
      else if (node.kind === "folder") twisty.click();
    };
    line.addEventListener("click", open);
    line.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") open();
      if (ev.key === "ArrowRight" && node.kind === "folder" && collapsed.has(node.path)) twisty.click();
      if (ev.key === "ArrowLeft" && node.kind === "folder" && !collapsed.has(node.path)) twisty.click();
    });
    // drag to reorder among siblings
    line.addEventListener("dragstart", (ev) => {
      dragging = { node, parent, index };
      line.classList.add("lh-binder-dragging");
      ev.dataTransfer?.setData("text/plain", node.path);
    });
    line.addEventListener("dragend", () => {
      dragging = null;
      line.classList.remove("lh-binder-dragging");
    });
    line.addEventListener("dragover", (ev) => {
      if (!dragging || dragging.parent !== parent || dragging.node === node) return;
      ev.preventDefault();
      const r = line.getBoundingClientRect();
      const below = ev.clientY > r.top + r.height / 2;
      line.classList.toggle("lh-binder-drop-below", below);
      line.classList.toggle("lh-binder-drop-above", !below);
    });
    line.addEventListener("dragleave", () => line.classList.remove("lh-binder-drop-below", "lh-binder-drop-above"));
    line.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      line.classList.remove("lh-binder-drop-below", "lh-binder-drop-above");
      if (!dragging || dragging.parent !== parent || dragging.node === node) return;
      const r = line.getBoundingClientRect();
      const below = ev.clientY > r.top + r.height / 2;
      const to = index + (below ? 1 : 0);
      const from = dragging.index;
      dragging = null;
      const move = planMove(parent.children, from, to);
      if (move.renames.length === 0 && move.orders.length === 0) return;
      writing = true;
      try {
        await applyMove(core, move);
      } catch (err) {
        console.error("[longhand] binder move", err);
        core.host.notify("That move did not go through. The console has the detail.");
      } finally {
        writing = false;
      }
      await render();
    });
    item.appendChild(line);
    if (node.kind === "folder" && !collapsed.has(node.path)) {
      for (const [i, child] of node.children.entries()) item.appendChild(row(child, node, i, depth + 1));
    }
    return item;
  };

  const pill = (text: string): HTMLElement => {
    const p = document.createElement("span");
    p.className = "lh-binder-status";
    p.textContent = text;
    return p;
  };

  const unsubFiles = core.host.onFileChanged(() => {
    if (!writing) void render();
  });
  const unsubActive = core.host.onActiveFileChanged((path) => {
    if (path && path.endsWith(".md")) {
      activePath = path;
      pinned = false;
    }
    void render();
  });
  void render();

  return {
    destroy() {
      disposed = true;
      unsubFiles();
      unsubActive();
      root.remove();
    },
  };
}
