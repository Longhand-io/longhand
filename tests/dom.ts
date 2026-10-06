// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The least DOM a view needs to mount in a test: elements that keep their children, classes,
// and listeners, and can be clicked. No layout, no selectors; a test finds what it wants by
// walking the tree.

type Listener = (ev: FakeEvent) => void;

export interface FakeEvent {
  type: string;
  stopped: boolean;
  stopPropagation(): void;
  preventDefault(): void;
}

export class FakeElement {
  className = "";
  textContent = "";
  title = "";
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  style: { [k: string]: string } = {};
  attributes: { [k: string]: string } = {};
  private listeners = new Map<string, Listener[]>();

  constructor(readonly tagName: string) {}

  get classList() {
    const has = (c: string) => this.className.split(" ").includes(c);
    const set = (c: string, on: boolean) => {
      const rest = this.className.split(" ").filter((x) => x !== "" && x !== c);
      this.className = (on ? [...rest, c] : rest).join(" ");
    };
    return {
      contains: has,
      add: (...cs: string[]) => cs.forEach((c) => set(c, true)),
      remove: (...cs: string[]) => cs.forEach((c) => set(c, false)),
      toggle: (c: string, on = !has(c)) => set(c, on),
    };
  }

  append(...nodes: FakeElement[]): void {
    for (const n of nodes) this.appendChild(n);
  }

  appendChild(node: FakeElement): FakeElement {
    node.parent = this;
    this.children.push(node);
    return node;
  }

  prepend(node: FakeElement): void {
    node.parent = this;
    this.children.unshift(node);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children = [];
    this.append(...nodes);
  }

  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  addEventListener(type: string, cb: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }

  /** Fire an event here and let it bubble, the way a click does. */
  dispatch(type: string): void {
    const ev: FakeEvent = { type, stopped: false, stopPropagation: () => void (ev.stopped = true), preventDefault: () => {} };
    for (let at: FakeElement | null = this; at && !ev.stopped; at = at.parent) {
      for (const cb of at.listeners.get(type) ?? []) cb(ev);
    }
  }

  click(): void {
    this.dispatch("click");
  }

  /** Every element under this one, in document order, that the test accepts. */
  all(accept: (el: FakeElement) => boolean): FakeElement[] {
    const out: FakeElement[] = [];
    const walk = (el: FakeElement) => {
      if (accept(el)) out.push(el);
      el.children.forEach(walk);
    };
    this.children.forEach(walk);
    return out;
  }

  /** The text of this element and everything under it. */
  get text(): string {
    return this.textContent + this.children.map((c) => c.text).join("");
  }
}

/** Put a fake `document` in place for the views under test, and hand back a root to mount into. */
export function fakeDom(): FakeElement {
  (globalThis as { document?: unknown }).document = { createElement: (tag: string) => new FakeElement(tag) };
  return new FakeElement("div");
}

/** Let queued renders finish. */
export const settle = () => new Promise<void>((r) => setTimeout(r, 0));
