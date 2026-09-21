// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The host interface. Modules and the core are written against this and nothing else;
// src/host/obsidian implements it on the Obsidian API, src/host/memory.ts in memory for
// tests. A standalone Longhand application would implement it too.

export type FileChangeKind = "create" | "modify" | "delete" | "rename";

export interface FileChange {
  kind: FileChangeKind;
  path: string;
  oldPath?: string;
}

export interface ViewState {
  path: string;
}

export interface ViewHandle {
  /** called when the view closes; remove listeners here */
  destroy(): void;
}

export interface ViewFactory {
  icon: string;
  /** "tab" (default) opens in the main area; "right" or "left" in a sidebar */
  placement?: "tab" | "right" | "left";
  title(state: ViewState): string;
  mount(el: HTMLElement, state: ViewState): ViewHandle;
}

/** UI a module lays over the whole window, once, for as long as it is on: Nib in the corner. */
export interface Overlay {
  id: string;
  mount(el: HTMLElement): ViewHandle;
}

export interface Command {
  id: string;
  name: string;
  /** sync availability check; the command is hidden when it returns false */
  check?: () => boolean;
  run: () => void | Promise<void>;
}

export type PickKind = "note" | "image";

/** What "image" means to pickFile and to the map: every format the host can draw. */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "avif"];

export interface Choice<T> {
  label: string;
  detail?: string;
  value: T;
}

export interface FileMenuItem {
  label: string;
  icon: string;
  /** "file" (default) or "folder": which kind of entry the item appears on */
  on?: "file" | "folder";
  /** sync; the item is shown only when this returns true for the path */
  check: (path: string) => boolean;
  run: (path: string) => void | Promise<void>;
}

export interface Host {
  readonly isMobile: boolean;

  // files
  readFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  exists(path: string): boolean;
  createFolder(path: string): Promise<void>;
  /** rename or move a file or folder; the host updates links that point at it */
  renameFile(path: string, newPath: string): Promise<void>;
  listFiles(): string[];
  onFileChanged(cb: (change: FileChange) => void): () => void;
  /** frontmatter as the host has it cached, for sync checks; null when unknown */
  cachedFrontmatter(path: string): { [key: string]: unknown } | null;

  // links
  /** vault path for a link target as written in a note, relative to `from`; null when unresolved */
  resolveLink(target: string, from: string): string | null;
  /** the shortest unambiguous `[[...]]` text for a path, as seen from `from` */
  linkTo(path: string, from: string): string;
  /** a URL an <img> inside the host can load for a vault file */
  resourceUrl(path: string): string;

  // ui
  activeFile(): string | null;
  openNote(path: string): Promise<void>;
  registerView(type: string, factory: ViewFactory): void;
  openView(type: string, state: ViewState): Promise<void>;
  /**
   * When a note that satisfies `when` opens as plain Markdown, replace it with this view.
   * `noteType` is the note's frontmatter type when the host had to read the file itself
   * because its cache had not caught up; null otherwise.
   */
  registerAutoView(type: string, when: (path: string, noteType: string | null) => boolean): void;
  registerOverlay(overlay: Overlay): void;
  unregisterOverlay(id: string): void;
  /** the active note changed; null when none */
  onActiveFileChanged(cb: (path: string | null) => void): () => void;
  /** open a note as plain Markdown in the active pane, bypassing any auto view once */
  openNoteAsMarkdown(path: string): Promise<void>;
  registerFileMenu(item: FileMenuItem): void;
  /** a button in the host's always-visible toolbar (Obsidian's ribbon) */
  registerRibbon(icon: string, title: string, run: () => void | Promise<void>): void;
  registerCommand(cmd: Command): void;
  pickFile(kind: PickKind, placeholder: string): Promise<string | null>;
  /** a short list to choose from; null when dismissed */
  choose<T>(title: string, options: Choice<T>[]): Promise<T | null>;
  prompt(title: string, initial?: string): Promise<string | null>;
  confirm(message: string, action: string): Promise<boolean>;
  notify(message: string): void;
}
