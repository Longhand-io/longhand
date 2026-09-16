// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The Obsidian host. The only place outside this folder's siblings that imports `obsidian`.

import {
  FuzzySuggestModal,
  ItemView,
  MarkdownView,
  Modal,
  Notice,
  Platform,
  Plugin,
  TFile,
  TFolder,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import type { App } from "obsidian";
import { IMAGE_EXTENSIONS } from "../../modules/map/model.js";
import type { Choice, Command, Companion, FileChange, FileMenuItem, Host, PickKind, ViewFactory, ViewHandle, ViewState } from "../host.js";

export class ObsidianHost implements Host {
  readonly isMobile: boolean = Platform.isMobile;
  private readonly app: App;
  private listeners = new Set<(c: FileChange) => void>();
  private factories = new Map<string, ViewFactory>();
  readonly companions: Companion[] = [];
  private autoViews: { type: string; when: (path: string) => boolean }[] = [];
  /** paths to open as plain Markdown once, skipping the auto view */
  private bypass = new Set<string>();

  constructor(private readonly plugin: Plugin) {
    this.app = plugin.app;
    const emit = (c: FileChange) => {
      for (const l of this.listeners) l(c);
    };
    plugin.registerEvent(this.app.vault.on("modify", (f) => emit({ kind: "modify", path: f.path })));
    plugin.registerEvent(this.app.vault.on("create", (f) => emit({ kind: "create", path: f.path })));
    plugin.registerEvent(this.app.vault.on("delete", (f) => emit({ kind: "delete", path: f.path })));
    plugin.registerEvent(this.app.vault.on("rename", (f, old) => emit({ kind: "rename", path: f.path, oldPath: old })));
    plugin.registerEvent(this.app.workspace.on("file-open", (file) => void this.maybeSwap(file)));
    plugin.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        const v = leaf?.view;
        if (v instanceof MarkdownView && v.file) void this.maybeSwap(v.file);
      }),
    );
    this.app.workspace.onLayoutReady(() => {
      for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
        const v = leaf.view;
        if (v instanceof MarkdownView && v.file) void this.maybeSwap(v.file, leaf);
      }
    });
  }

  /** A note is showing as Markdown; swap in the auto view if one claims it. */
  private async maybeSwap(file: TFile | null, only?: WorkspaceLeaf): Promise<void> {
    if (!file || file.extension !== "md" || this.autoViews.length === 0) return;
    if (this.bypass.has(file.path)) {
      this.bypass.delete(file.path);
      return;
    }
    let auto = this.autoViews.find((a) => a.when(file.path));
    if (!auto && !this.app.metadataCache.getFileCache(file)) {
      // the cache has not indexed this note yet; read the frontmatter ourselves
      const text = await this.app.vault.cachedRead(file);
      const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      const type = m ? /^type:\s*"?([A-Za-z]+)"?\s*$/m.exec(m[1] ?? "")?.[1] : undefined;
      if (type) auto = this.autoViews.find((a) => a.when(file.path) || this.typeClaims(a, type));
    }
    if (!auto) return;
    const leaves = only
      ? [only]
      : this.app.workspace.getLeavesOfType("markdown").filter((l) => (l.view as MarkdownView).file?.path === file.path);
    for (const leaf of leaves) {
      const state = { path: file.path };
      // let Obsidian finish opening the Markdown view before replacing it
      window.setTimeout(() => void leaf.setViewState({ type: auto!.type, state, active: true }), 0);
    }
  }

  private typeClaims(auto: { type: string; when: (path: string) => boolean }, noteType: string): boolean {
    return auto.type === `longhand-${noteType}`;
  }

  private file(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return f instanceof TFile ? f : null;
  }

  async readFile(path: string): Promise<string> {
    const f = this.file(path);
    if (!f) throw new Error(`no such file: ${path}`);
    return this.app.vault.read(f);
  }

  async writeFile(path: string, text: string): Promise<void> {
    const f = this.file(path);
    if (f) {
      await this.app.vault.modify(f, text);
      return;
    }
    const norm = normalizePath(path);
    const slash = norm.lastIndexOf("/");
    if (slash > 0) {
      const dir = norm.slice(0, slash);
      if (!this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
    }
    await this.app.vault.create(norm, text);
  }

  exists(path: string): boolean {
    return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  async createFolder(path: string): Promise<void> {
    const norm = normalizePath(path);
    if (!this.app.vault.getAbstractFileByPath(norm)) await this.app.vault.createFolder(norm);
  }

  listFiles(): string[] {
    return this.app.vault.getFiles().map((f) => f.path);
  }

  onFileChanged(cb: (change: FileChange) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  cachedFrontmatter(path: string): { [key: string]: unknown } | null {
    const f = this.file(path);
    if (!f) return null;
    const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
    return fm ? (fm as { [key: string]: unknown }) : null;
  }

  resolveLink(target: string, from: string): string | null {
    return this.app.metadataCache.getFirstLinkpathDest(target, from)?.path ?? null;
  }

  linkTo(path: string, from: string): string {
    const f = this.file(path);
    if (!f) return `[[${path.replace(/\.md$/i, "")}]]`;
    const short = f.extension === "md" ? f.basename : f.name;
    const resolved = this.app.metadataCache.getFirstLinkpathDest(short, from);
    if (resolved && resolved.path === f.path) return `[[${short}]]`;
    return `[[${f.extension === "md" ? f.path.replace(/\.md$/i, "") : f.path}]]`;
  }

  resourceUrl(path: string): string {
    const f = this.file(path);
    return f ? this.app.vault.getResourcePath(f) : "";
  }

  activeFile(): string | null {
    return this.app.workspace.getActiveFile()?.path ?? null;
  }

  async openNote(path: string): Promise<void> {
    const f = this.file(path);
    if (!f) return;
    await this.app.workspace.getLeaf(false).openFile(f);
  }

  registerView(type: string, factory: ViewFactory): void {
    this.factories.set(type, factory);
    this.plugin.registerView(type, (leaf) => new HostView(leaf, type, factory, this));
  }

  async openView(type: string, state: ViewState): Promise<void> {
    const right = this.factories.get(type)?.placement === "right";
    const leaves = this.app.workspace.getLeavesOfType(type);
    // a sidebar view is one per workspace: reveal it as it is rather than remounting with a new path
    const existing = right ? leaves[0] : leaves.find((l) => (l.view as HostView).currentPath() === state.path);
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = right ? this.app.workspace.getRightLeaf(false) : this.app.workspace.getLeaf("tab");
    if (!leaf) return;
    await leaf.setViewState({ type, state: { path: state.path }, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  registerAutoView(type: string, when: (path: string) => boolean): void {
    this.autoViews.push({ type, when });
  }

  registerCompanion(companion: Companion): void {
    this.companions.push(companion); // open views pick it up on their next mount
  }

  unregisterCompanion(id: string): void {
    const i = this.companions.findIndex((c) => c.id === id);
    if (i >= 0) this.companions.splice(i, 1);
  }

  async openNoteAsMarkdown(path: string): Promise<void> {
    const f = this.file(path);
    if (!f) return;
    this.bypass.add(path);
    await this.app.workspace.getLeaf(false).openFile(f);
  }

  registerFileMenu(item: FileMenuItem): void {
    this.plugin.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        const wantFolder = item.on === "folder";
        if (wantFolder ? !(file instanceof TFolder) : !(file instanceof TFile)) return;
        if (!item.check(file.path)) return;
        menu.addItem((mi) =>
          mi
            .setTitle(item.label)
            .setIcon(item.icon)
            .onClick(() => void item.run(file.path)),
        );
      }),
    );
  }

  registerRibbon(icon: string, title: string, run: () => void | Promise<void>): void {
    this.plugin.addRibbonIcon(icon, title, () => void run());
  }

  registerCommand(cmd: Command): void {
    this.plugin.addCommand({
      id: cmd.id,
      name: cmd.name,
      checkCallback: (checking) => {
        if (cmd.check && !cmd.check()) return false;
        if (!checking) void cmd.run();
        return true;
      },
    });
  }

  pickFile(kind: PickKind, placeholder: string): Promise<string | null> {
    const files = this.app.vault
      .getFiles()
      .filter((f) => (kind === "note" ? f.extension === "md" : IMAGE_EXTENSIONS.includes(f.extension.toLowerCase())))
      .sort((a, b) => a.path.localeCompare(b.path));
    return new Promise((resolve) => {
      new FilePicker(this.app, files, placeholder, resolve).open();
    });
  }

  choose<T>(title: string, options: Choice<T>[]): Promise<T | null> {
    return new Promise((resolve) => new ChoicePicker(this.app, title, options, resolve).open());
  }

  prompt(title: string, initial = ""): Promise<string | null> {
    return new Promise((resolve) => new PromptModal(this.app, title, initial, resolve).open());
  }

  confirm(message: string, action: string): Promise<boolean> {
    return new Promise((resolve) => new ConfirmModal(this.app, message, action, resolve).open());
  }

  notify(message: string): void {
    new Notice(message);
  }
}

class HostView extends ItemView {
  private state: ViewState = { path: "" };
  private handle: ViewHandle | null = null;
  private companionHandles: ViewHandle[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    private readonly type: string,
    private readonly factory: ViewFactory,
    private readonly host: ObsidianHost,
  ) {
    super(leaf);
  }

  currentPath(): string {
    return this.state.path;
  }

  override getViewType(): string {
    return this.type;
  }

  override getDisplayText(): string {
    return this.state.path ? this.factory.title(this.state) : "Longhand";
  }

  override getIcon(): string {
    return this.factory.icon;
  }

  override getState(): Record<string, unknown> {
    return { path: this.state.path };
  }

  override async setState(state: unknown, result: { history: boolean }): Promise<void> {
    const path = typeof state === "object" && state !== null ? (state as { path?: unknown }).path : undefined;
    this.state = { path: typeof path === "string" ? path : "" };
    this.mount();
    await super.setState(state, result);
  }

  override async onOpen(): Promise<void> {
    this.mount();
  }

  override async onClose(): Promise<void> {
    this.unmount();
  }

  private unmount(): void {
    this.handle?.destroy();
    this.handle = null;
    for (const h of this.companionHandles) h.destroy();
    this.companionHandles = [];
  }

  private mount(): void {
    this.unmount();
    const container = this.contentEl;
    container.empty();
    this.handle = this.factory.mount(container, this.state);
    // companions such as Nib's corner button ride along on views that have a file; not on Nib itself
    if (this.state.path && this.factory.placement !== "right") {
      for (const c of this.host.companions) this.companionHandles.push(c.mount(container, this.state));
    }
  }
}

class FilePicker extends FuzzySuggestModal<TFile> {
  private settled = false;

  constructor(
    app: App,
    private readonly files: TFile[],
    placeholder: string,
    private readonly resolve: (path: string | null) => void,
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(item: TFile): string {
    return item.path;
  }

  onChooseItem(item: TFile): void {
    this.settled = true;
    this.resolve(item.path);
  }

  override onClose(): void {
    super.onClose();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
}

class ChoicePicker<T> extends FuzzySuggestModal<Choice<T>> {
  private settled = false;

  constructor(
    app: App,
    title: string,
    private readonly options: Choice<T>[],
    private readonly resolve: (value: T | null) => void,
  ) {
    super(app);
    this.setPlaceholder(title);
  }

  getItems(): Choice<T>[] {
    return this.options;
  }

  getItemText(item: Choice<T>): string {
    return item.detail ? `${item.label}  ${item.detail}` : item.label;
  }

  override renderSuggestion(item: { item: Choice<T> }, el: HTMLElement): void {
    el.createDiv({ text: item.item.label });
    if (item.item.detail) el.createDiv({ text: item.item.detail, cls: "lh-choice-detail" });
  }

  onChooseItem(item: Choice<T>): void {
    this.settled = true;
    this.resolve(item.value);
  }

  override onClose(): void {
    super.onClose();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
}

class PromptModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly title: string,
    private readonly initial: string,
    private readonly resolve: (value: string | null) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText(this.title);
    const input = this.contentEl.createEl("input", { type: "text", value: this.initial });
    input.addClass("lh-prompt-input");
    const done = () => {
      this.settled = true;
      this.resolve(input.value);
      this.close();
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        done();
      }
    });
    const row = this.contentEl.createDiv({ cls: "lh-modal-buttons" });
    const ok = row.createEl("button", { text: "OK", cls: "mod-cta" });
    ok.addEventListener("click", done);
    const cancel = row.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    input.focus();
    input.select();
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
}

class ConfirmModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly message: string,
    private readonly action: string,
    private readonly resolve: (ok: boolean) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.contentEl.createEl("p", { text: this.message });
    const row = this.contentEl.createDiv({ cls: "lh-modal-buttons" });
    const ok = row.createEl("button", { text: this.action, cls: "mod-warning" });
    ok.addEventListener("click", () => {
      this.settled = true;
      this.resolve(true);
      this.close();
    });
    const cancel = row.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    cancel.focus();
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(false);
    }
  }
}
