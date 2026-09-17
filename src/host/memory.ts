// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// In-memory host for tests. Records what a module asked the host to do.

import { parse, get } from "../core/frontmatter.js";
import { linkTarget } from "../core/wikilink.js";
import type { Choice, Command, Companion, FileChange, FileMenuItem, Host, Overlay, PickKind, ViewFactory, ViewState } from "./host.js";

export class MemoryHost implements Host {
  readonly isMobile = false;
  files = new Map<string, string>();
  opened: string[] = [];
  notices: string[] = [];
  views = new Map<string, ViewFactory>();
  openedViews: { type: string; state: ViewState }[] = [];
  commands = new Map<string, Command>();
  autoViews: { type: string; when: (path: string) => boolean }[] = [];
  companions: Companion[] = [];
  overlays: Overlay[] = [];
  private activeListeners = new Set<(p: string | null) => void>();
  fileMenu: FileMenuItem[] = [];
  ribbon: { icon: string; title: string; run: () => void | Promise<void> }[] = [];
  openedAsMarkdown: string[] = [];
  active: string | null = null;
  folders: string[] = [];
  /** queued answers for pickFile, prompt, confirm, choose */
  picks: (string | null)[] = [];
  choices: unknown[] = [];
  prompts: (string | null)[] = [];
  confirms: boolean[] = [];
  private listeners = new Set<(c: FileChange) => void>();

  constructor(files: { [path: string]: string } = {}) {
    for (const [p, t] of Object.entries(files)) this.files.set(p, t);
  }

  async readFile(path: string): Promise<string> {
    const t = this.files.get(path);
    if (t === undefined) throw new Error(`no such file: ${path}`);
    return t;
  }

  async writeFile(path: string, text: string): Promise<void> {
    const kind = this.files.has(path) ? "modify" : "create";
    this.files.set(path, text);
    for (const l of this.listeners) l({ kind, path });
  }

  exists(path: string): boolean {
    return this.files.has(path) || this.folders.includes(path) || [...this.files.keys()].some((p) => p.startsWith(path + "/"));
  }

  async createFolder(path: string): Promise<void> {
    this.folders.push(path);
  }

  listFiles(): string[] {
    return [...this.files.keys()].sort();
  }

  onFileChanged(cb: (change: FileChange) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  cachedFrontmatter(path: string): { [key: string]: unknown } | null {
    const t = this.files.get(path);
    if (t === undefined) return null;
    const f = parse(t);
    const out: { [key: string]: unknown } = {};
    for (const e of f.entries) if (e.key) out[e.key] = get(f, e.key);
    return out;
  }

  resolveLink(target: string, _from: string): string | null {
    const t = target.replace(/\.md$/i, "");
    for (const p of this.files.keys()) {
      if (p === target || p === t + ".md" || p.replace(/\.md$/i, "") === t) return p;
    }
    for (const p of this.files.keys()) {
      if (linkTarget(p, true) === t || p.endsWith("/" + target)) return p;
    }
    return null;
  }

  linkTo(path: string, _from: string): string {
    const short = linkTarget(path, true);
    const matches = [...this.files.keys()].filter((p) => linkTarget(p, true) === short);
    return `[[${matches.length > 1 ? linkTarget(path, false) : short}]]`;
  }

  resourceUrl(path: string): string {
    return `memory://${path}`;
  }

  activeFile(): string | null {
    return this.active;
  }

  /** Test helper: change the active note and tell listeners. */
  setActive(path: string | null): void {
    this.active = path;
    for (const l of this.activeListeners) l(path);
  }

  onActiveFileChanged(cb: (path: string | null) => void): () => void {
    this.activeListeners.add(cb);
    return () => this.activeListeners.delete(cb);
  }

  registerOverlay(overlay: Overlay): void {
    this.overlays.push(overlay);
  }

  unregisterOverlay(id: string): void {
    this.overlays = this.overlays.filter((o) => o.id !== id);
  }

  async openNote(path: string): Promise<void> {
    this.opened.push(path);
  }

  registerView(type: string, factory: ViewFactory): void {
    this.views.set(type, factory);
  }

  async openView(type: string, state: ViewState): Promise<void> {
    this.openedViews.push({ type, state });
  }

  registerAutoView(type: string, when: (path: string) => boolean): void {
    this.autoViews.push({ type, when });
  }

  registerCompanion(companion: Companion): void {
    this.companions.push(companion);
  }

  unregisterCompanion(id: string): void {
    this.companions = this.companions.filter((c) => c.id !== id);
  }

  async openNoteAsMarkdown(path: string): Promise<void> {
    this.openedAsMarkdown.push(path);
  }

  registerFileMenu(item: FileMenuItem): void {
    this.fileMenu.push(item);
  }

  registerRibbon(icon: string, title: string, run: () => void | Promise<void>): void {
    this.ribbon.push({ icon, title, run });
  }

  registerCommand(cmd: Command): void {
    this.commands.set(cmd.id, cmd);
  }

  async pickFile(_kind: PickKind, _placeholder: string): Promise<string | null> {
    return this.picks.shift() ?? null;
  }

  async choose<T>(_title: string, options: Choice<T>[]): Promise<T | null> {
    const want = this.choices.shift();
    if (want === undefined) return options[0]?.value ?? null;
    return options.find((o) => o.value === want)?.value ?? null;
  }

  async prompt(_title: string, initial?: string): Promise<string | null> {
    return this.prompts.length ? (this.prompts.shift() ?? null) : (initial ?? null);
  }

  async confirm(_message: string, _action: string): Promise<boolean> {
    return this.confirms.length ? (this.confirms.shift() ?? false) : true;
  }

  notify(message: string): void {
    this.notices.push(message);
  }
}
