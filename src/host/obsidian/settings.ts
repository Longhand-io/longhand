// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// One settings tab, one section per module, one switch each.

import { PluginSettingTab, Setting } from "obsidian";
import type { App, Plugin } from "obsidian";
import type { ModuleLoader, ModuleSettings } from "../../core/modules.js";

export class LonghandSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly loader: ModuleLoader,
    private readonly settings: ModuleSettings,
    private readonly save: () => Promise<void>,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      text: "Each module can be switched off on its own. Turning one off changes nothing in your files.",
      cls: "setting-item-description",
    });
    for (const m of this.loader.list()) {
      new Setting(containerEl)
        .setName(m.name)
        .setDesc(m.description)
        .addToggle((t) =>
          t.setValue(this.loader.isEnabled(this.settings, m.id)).onChange(async (value) => {
            this.settings.enabled[m.id] = value;
            await this.save();
            await this.loader.apply(this.settings);
          }),
        );
    }
  }
}
