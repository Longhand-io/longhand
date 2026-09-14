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
  title(state: ViewState): string;
  mount(el: HTMLElement, state: ViewState): ViewHandle;
}

export interface Command {
  id: string;
  name: string;
  /** sync availability check; the command is hidden when it returns false */
  check?: () => boolean;
  run: () => void | Promise<void>;
}

export type PickKind = "note" | "image";

export interface Host {
  readonly isMobile: boolean;

  // files
  readFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  exists(path: string): boolean;
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
  registerCommand(cmd: Command): void;
  pickFile(kind: PickKind, placeholder: string): Promise<string | null>;
  prompt(title: string, initial?: string): Promise<string | null>;
  confirm(message: string, action: string): Promise<boolean>;
  notify(message: string): void;
}
