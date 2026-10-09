// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// One answer from a picker. A picker can be dismissed or chosen from, and a host may report
// the two in either order: Obsidian's suggest modals close first and only then say what was
// chosen. So a close counts as a dismissal only when no choice follows it in the same turn.

export interface Answer<T> {
  /** something was chosen; the first choice wins */
  choose(value: T): void;
  /** the picker closed; resolves null unless a choice arrives before the turn ends */
  dismiss(): void;
}

export function oneAnswer<T>(resolve: (value: T | null) => void): Answer<T> {
  let settled = false;
  const settle = (value: T | null) => {
    if (settled) return;
    settled = true;
    resolve(value);
  };
  return {
    choose: (value) => settle(value),
    dismiss: () => void setTimeout(() => settle(null), 0),
  };
}
