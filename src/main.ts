// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// Plugin entry. Builds the Obsidian host, the core, and the module list; the core never
// sees this file.

import { Plugin } from "obsidian";
import { createCore, ModuleLoader, type ModuleSettings } from "./core/modules.js";
import { ObsidianHost } from "./host/obsidian/host.js";
import { LonghandSettingTab } from "./host/obsidian/settings.js";
import { binderModule } from "./modules/binder/index.js";
import { mapModule } from "./modules/map/index.js";
import { nibModule } from "./modules/nib/index.js";
import { timelineModule } from "./modules/timeline/index.js";

const MODULES = [binderModule, mapModule, timelineModule, nibModule];

export default class LonghandPlugin extends Plugin {
  private moduleSettings: ModuleSettings = { enabled: {} };
  private loader: ModuleLoader | null = null;

  override async onload(): Promise<void> {
    const saved = (await this.loadData()) as Partial<ModuleSettings> | null;
    this.moduleSettings = { enabled: { ...(saved?.enabled ?? {}) } };

    const host = new ObsidianHost(this);
    const core = createCore(host);
    this.loader = new ModuleLoader(core, MODULES);
    this.addSettingTab(
      new LonghandSettingTab(this.app, this, this.loader, this.moduleSettings, () => this.saveData(this.moduleSettings)),
    );
    await this.loader.apply(this.moduleSettings);
  }

  override async onunload(): Promise<void> {
    await this.loader?.unloadAll();
  }
}
