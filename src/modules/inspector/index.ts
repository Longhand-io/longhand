// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The inspector. One note's synopsis, status, label, and notes beside its text. This module
// is the reading half: it shows what the note already holds and writes nothing.

import type { Core, Module } from "../../core/modules.js";
import { INSPECTOR_VIEW_TYPE, mountInspectorView } from "./view.js";

export const INSPECTOR_VIEW = INSPECTOR_VIEW_TYPE;

export const inspectorModule: Module = {
  id: "inspector",
  name: "Inspector",
  description: "The synopsis, status, label, and notes of the note you are in, beside the text. It reads only; the note is changed in the editor.",
  defaultEnabled: true,

  register(core: Core) {
    const host = core.host;
    host.registerView(INSPECTOR_VIEW, {
      icon: "info",
      placement: "right",
      title: () => "Inspector",
      mount: (el) => mountInspectorView(core, el),
    });
    host.registerCommand({ id: "inspector-open", name: "Open inspector", run: () => host.openView(INSPECTOR_VIEW, { path: "" }) });
    host.registerRibbon("info", "Open inspector", () => host.openView(INSPECTOR_VIEW, { path: "" }));
  },
};
