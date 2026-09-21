// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// One conversation with Nib per session, shared by the corner character and the sidebar: the
// turns so far, the nudges already spoken, whether the joke was told, and the events the
// character animates on. Neither view owns it; the module creates it once.

import type { Core } from "../../core/modules.js";
import type { Answer } from "./answers.js";

export type Turn = { you: string; answer: Answer } | { nib: string };
export type NibEvent = "asking" | "answered" | "joke";

export interface SidebarChat {
  submit(question: string): Promise<void>;
  say(text: string): void;
}

export class NibSession {
  readonly history: Turn[] = [];
  /** nudges already spoken, by key: said once, then never again this session */
  readonly spoken = new Set<string>();
  jokeTold = false;
  /** the open sidebar chat, if any */
  live: SidebarChat | null = null;
  /** a question waiting for the sidebar to mount, with what Nib said in the corner just before */
  pending: { question: string; preface: string | null } | null = null;
  private readonly listeners = new Set<(e: NibEvent) => void>();

  on(cb: (e: NibEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(e: NibEvent): void {
    for (const l of this.listeners) l(e);
  }

  /** Put a question to Nib in the sidebar, opening it if needed. `preface` is what Nib just said in the corner. */
  async askInSidebar(core: Core, viewType: string, question: string, contextPath = "", preface: string | null = null): Promise<void> {
    if (this.live) {
      if (preface) this.live.say(preface);
      await core.host.openView(viewType, { path: contextPath });
      await this.live.submit(question);
      return;
    }
    this.pending = { question, preface };
    await core.host.openView(viewType, { path: contextPath });
  }
}
