// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Nib, the assistant. Off by default. This module is the panel and the answers that need no
// model; it talks to nothing outside the vault. The hosted Nib plugs in behind the same panel.

import type { Core, Module } from "../../core/modules.js";
import { NibSession } from "./session.js";
import { mountNibDock, mountNibView, NIB_VIEW_TYPE } from "./view.js";

export const NIB_VIEW = NIB_VIEW_TYPE;

let registeredHost: Core["host"] | null = null;

export const nibModule: Module = {
  id: "nib",
  name: "Nib",
  description: "The assistant in the margin. Answers where someone was last seen, what is set at a place, who is in a scene, and more, from your files alone. Off by default; no network.",
  defaultEnabled: false,

  register(core: Core) {
    const host = core.host;
    registeredHost = host;
    const session = new NibSession();
    host.registerView(NIB_VIEW, {
      icon: "pen-tool",
      placement: "right",
      title: () => "Nib",
      mount: (el, state) => mountNibView(core, el, session, state.path),
    });
    host.registerCommand({ id: "nib-ask", name: "Ask Nib", run: () => host.openView(NIB_VIEW, { path: "" }) });
    host.registerRibbon("pen-tool", "Ask Nib", () => host.openView(NIB_VIEW, { path: "" }));
    // the character in the corner of the window, following whatever note is active
    host.registerOverlay({ id: "nib", mount: (el) => mountNibDock(core, el, session, host.activeFile() ?? "", true) });
  },

  unregister() {
    // the host keeps the view and command registered; the corner nib goes away
    registeredHost?.unregisterOverlay("nib");
  },
};
