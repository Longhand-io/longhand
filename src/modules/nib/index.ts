// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Nib, the assistant. Off by default. This module is the panel and the answers that need no
// model; it talks to nothing outside the vault. The hosted Nib plugs in behind the same panel.

import type { Core, Module } from "../../core/modules.js";
import { mountNibView } from "./view.js";

export const NIB_VIEW = "longhand-nib";

export const nibModule: Module = {
  id: "nib",
  name: "Nib",
  description: "The assistant in the margin. Answers where someone was last seen, what is set at a place, who is in a scene, and more, from your files alone. Off by default; no network.",
  defaultEnabled: false,

  register(core: Core) {
    const host = core.host;
    host.registerView(NIB_VIEW, {
      icon: "pen-tool",
      placement: "right",
      title: () => "Nib",
      mount: (el) => mountNibView(core, el),
    });
    host.registerCommand({ id: "nib-ask", name: "Ask Nib", run: () => host.openView(NIB_VIEW, { path: "" }) });
    host.registerRibbon("pen-tool", "Ask Nib", () => host.openView(NIB_VIEW, { path: "" }));
  },
};
