// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 0xSpectra LLC and the Longhand Authors.

// The module loader. The core never imports a module; the plugin entry hands the loader a
// list, and settings decide which of them register. Modules see only the Core.

import type { Host } from "../host/host.js";
import { Projects } from "./projects.js";
import { Spec } from "./spec.js";

export interface Core {
  host: Host;
  spec: Spec;
  projects: Projects;
}

export interface Module {
  id: string;
  name: string;
  description: string;
  /** default on/off before the writer has touched settings */
  defaultEnabled: boolean;
  register(core: Core): void | Promise<void>;
  unregister?(): void | Promise<void>;
}

export interface ModuleSettings {
  enabled: { [id: string]: boolean };
}

export function createCore(host: Host): Core {
  const spec = new Spec(host);
  const projects = new Projects(host, spec);
  return { host, spec, projects };
}

export class ModuleLoader {
  private active = new Set<string>();

  constructor(
    private readonly core: Core,
    private readonly modules: Module[],
  ) {}

  list(): Module[] {
    return this.modules;
  }

  isEnabled(settings: ModuleSettings, id: string): boolean {
    const m = this.modules.find((x) => x.id === id);
    if (!m) return false;
    const v = settings.enabled[id];
    return v === undefined ? m.defaultEnabled : v;
  }

  isActive(id: string): boolean {
    return this.active.has(id);
  }

  async apply(settings: ModuleSettings): Promise<void> {
    for (const m of this.modules) {
      const want = this.isEnabled(settings, m.id);
      const have = this.active.has(m.id);
      if (want && !have) {
        await m.register(this.core);
        this.active.add(m.id);
      } else if (!want && have) {
        await m.unregister?.();
        this.active.delete(m.id);
      }
    }
  }

  async unloadAll(): Promise<void> {
    for (const m of this.modules) {
      if (this.active.has(m.id)) {
        await m.unregister?.();
        this.active.delete(m.id);
      }
    }
  }
}
