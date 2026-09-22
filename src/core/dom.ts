// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Small DOM pieces every panel uses: a button, a chip, a thread's colour dot, and the
// press-or-drag state machine behind every pin. Plain DOM; the classes are Longhand's own,
// styled once in styles.css, so no module borrows another module's class names.

/** A plain button in the panel style; `active` toggles the pressed look. */
export function button(label: string, title: string, onClick?: () => void, extraClass = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `lh-button${extraClass ? " " + extraClass : ""}`;
  b.textContent = label;
  b.title = title;
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

/** A pill-shaped chip: a suggestion, an action, a name to click. */
export function chip(label: string, onClick?: () => void, extraClass = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `lh-chip${extraClass ? " " + extraClass : ""}`;
  b.textContent = label;
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

export function setActive(el: Element, on: boolean): void {
  el.classList.toggle("lh-active", on);
}

/** The small round swatch that marks a thread or label. */
export function labelDot(color: string, title?: string): HTMLElement {
  const dot = document.createElement("i");
  dot.className = "lh-dot";
  dot.style.background = color;
  if (title) dot.title = title;
  return dot;
}

export interface PressDrag {
  /** px of movement before a press becomes a drag */
  threshold?: number;
  /** true to measure horizontal movement only */
  horizontal?: boolean;
  onDragStart?(ev: PointerEvent): void;
  onDrag(ev: PointerEvent): void;
  onDrop(ev: PointerEvent): void | Promise<void>;
  /** a press that never moved past the threshold */
  onTap(ev: PointerEvent): void | Promise<void>;
  /** the pointer was lost mid-drag; put things back */
  onCancel?(): void;
}

/**
 * Press, and either tap or drag. Captures the pointer, applies a threshold so a click is
 * not a drag, and reports drop or tap. Left button and touch only.
 */
export function pressDrag(el: HTMLElement, handlers: PressDrag): void {
  const threshold = handlers.threshold ?? 4;
  let startX = 0;
  let startY = 0;
  let pressed = false;
  let dragging = false;
  el.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    pressed = true;
    dragging = false;
    startX = ev.clientX;
    startY = ev.clientY;
    el.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  el.addEventListener("pointermove", (ev) => {
    if (!pressed) return;
    if (!dragging) {
      const moved = handlers.horizontal ? Math.abs(ev.clientX - startX) : Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (moved < threshold) return;
      dragging = true;
      handlers.onDragStart?.(ev);
    }
    handlers.onDrag(ev);
  });
  el.addEventListener("pointerup", (ev) => {
    if (!pressed) return;
    pressed = false;
    el.releasePointerCapture(ev.pointerId);
    void (dragging ? handlers.onDrop(ev) : handlers.onTap(ev));
    dragging = false;
  });
  el.addEventListener("pointercancel", () => {
    if (!pressed) return;
    pressed = false;
    dragging = false;
    handlers.onCancel?.();
  });
}
