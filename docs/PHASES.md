---
repo: longhand
schema: phases/v1
current_phase: L1
updated: 2026-09-14
updated_by: grassclaw

phases:
  - id: L0
    title: Design, spec, brand, site
    status: done
    completed: 2026-09-12
    depends_on: []
    subphases:
      - id: L0.1
        title: Vault spec v1
        status: done
        deliverables:
          - { id: L0.1-d1, done: true, desc: "docs/spec.md: layout, document frontmatter, project note, snapshot files, snapshot commits, event notes, character and setting notes, map notes with pins and relief" }
        acceptance:
          - { id: L0.1-a1, met: true, check: "spec answers every field the site promises; grep the site for a field name and find it in the spec", method: review }
      - id: L0.2
        title: Architecture, sync and history, theming, user stories
        status: done
        deliverables:
          - { id: L0.2-d1, done: true, desc: "docs/architecture.md, docs/sync-and-history.md, docs/theming.md, docs/user-stories.md" }
        acceptance:
          - { id: L0.2-a1, met: true, check: "every module on the site appears in the architecture module table with reads and writes", method: review }
      - id: L0.3
        title: Brand and site
        status: done
        deliverables:
          - { id: L0.3-d1, done: true, desc: "longhand-site: mark, Nib, palette, type, voice; landing page with a panel per module, live relief map, place cards, cast panel" }
        acceptance:
          - { id: L0.3-a1, met: true, check: "site builds on GitHub Pages; each panel screenshotted in a browser", method: manual }

  - id: L1
    title: Importer v0.1
    status: in_progress
    depends_on: []
    note: "Delivered in the scrivener-to-obsidian repo; see its docs/PHASES.md (phases I0 to I8). Listed here because v0.1 of Longhand is not shippable without it."
    subphases:
      - id: L1.1
        title: scriv2obsidian v0.1 released
        status: in_progress
        deliverables:
          - { id: L1.1-d1, done: false, desc: "scrivener-to-obsidian I0 to I8 done; tagged v0.1.0 with binaries" }
        acceptance:
          - { id: L1.1-a1, met: false, check: "a real Scrivener 3 project imports with document count, word count within 1%, and snapshot count matching the package; manifest lists every UUID", method: e2e }

  - id: L2
    title: Plugin core
    status: in_progress
    depends_on: []
    subphases:
      - id: L2.1
        title: Scaffold, settings tab, module loader
        status: in_progress
        deliverables:
          - { id: L2.1-d1, done: true, desc: "TypeScript plugin on the Obsidian API, esbuild, manifest; one settings tab with a section per module and an on/off switch each; core never imports a module", note: "2026-09-14: src/main.ts composes host, core, and the module list; modules see only the Host interface (src/host/host.ts); the Obsidian API is imported only under src/host/obsidian/" }
          - { id: L2.1-d2, done: true, desc: "npm run gate: type-check, lint, unit tests", note: "2026-09-14: strict tsc, node --test, production build, licence headers; no lint package, the strict compiler options stand in" }
        acceptance:
          - { id: L2.1-a1, met: false, check: "plugin loads in Obsidian desktop and mobile with zero modules on and does nothing", method: manual }
      - id: L2.2
        title: Spec reader and writer
        status: done
        deliverables:
          - { id: L2.2-d1, done: true, desc: "read and write document and project frontmatter by field; preserve unknown fields byte for byte; version check on _Project.md", note: "2026-09-14: src/core/frontmatter.ts keeps every top-level entry's raw lines and rewrites only the field that changed; src/core/spec.ts; newer spec versions warn once" }
        acceptance:
          - { id: L2.2-a1, met: true, check: "round-trip a note with unknown fields and comments in its frontmatter; diff is empty", method: unit, note: "2026-09-14: tests/frontmatter.test.ts, first case" }
      - id: L2.3
        title: Project registry
        status: done
        deliverables:
          - { id: L2.3-d1, done: true, desc: "find project roots (_Project.md), list documents in binder order from numeric prefixes or order fields, resolve id to path and path to id, watch for changes", note: "2026-09-14: src/core/projects.ts; the index drops on any host file change and rebuilds lazily" }
        acceptance:
          - { id: L2.3-a1, met: true, check: "an imported fixture vault lists documents in the same order as the Scrivener binder", method: unit, note: "2026-09-14: tests/projects.test.ts against the importer fixture's layout" }
      - id: L2.4
        title: History store, files backend
        status: planned
        deliverables:
          - { id: L2.4-d1, done: false, desc: "_snapshots/<id>/<timestamp> <title>.md; take, list, read, restore; folder excluded from Obsidian search and graph" }
        acceptance:
          - { id: L2.4-a1, met: false, check: "take, list, restore on desktop and mobile; restore writes an automatic snapshot first", method: manual }
      - id: L2.5
        title: History store, git backend
        status: planned
        deliverables:
          - { id: L2.5-d1, done: false, desc: "git as argv only; snap(path): title subject with Snapshot-* trailers; refuses a .git directory inside iCloud, Dropbox, or OneDrive and uses a separate git dir under the app support folder instead; both mode writes files and commits" }
        acceptance:
          - { id: L2.5-a1, met: false, check: "git log --grep on Snapshot-Doc-Id lists exactly the snapshots the panel lists; vault inside iCloud has a one-line .git file and no objects", method: manual }

  - id: L3
    title: Snapshots module
    status: planned
    depends_on: [L2]
    subphases:
      - id: L3.1
        title: Take and list
        status: planned
        deliverables:
          - { id: L3.1-d1, done: false, desc: "command and sidebar tab; prompt for a title; list only this document's snapshots newest first with date and word delta; folder snapshot" }
        acceptance:
          - { id: L3.1-a1, met: false, check: "auto-commits from Obsidian Git do not appear in the list", method: manual }
      - id: L3.2
        title: Compare
        status: planned
        deliverables:
          - { id: L3.2-d1, done: false, desc: "CodeMirror merge view, snapshot left, live right and editable; paragraph, sentence, word granularity toggle" }
        acceptance:
          - { id: L3.2-a1, met: false, check: "a one-word change tints one word at word granularity and the sentence at sentence granularity", method: manual }
      - id: L3.3
        title: Restore
        status: planned
        deliverables:
          - { id: L3.3-d1, done: false, desc: "restore writes an automatic snapshot titled Before restore, then replaces the file" }
        acceptance:
          - { id: L3.3-a1, met: false, check: "after restore, the list shows the automatic snapshot at the top and restoring it returns the file to its pre-restore state", method: manual }
      - id: L3.4
        title: v0.1 release
        status: planned
        deliverables:
          - { id: L3.4-d1, done: false, desc: "CHANGELOG entry; tagged release; install instructions for BRAT or manual install" }
        acceptance:
          - { id: L3.4-a1, met: false, check: "import a project with the importer, open it, see imported snapshots in the tab, take a new one, compare, restore", method: e2e }

  - id: L4
    title: Binder and Inspector
    status: planned
    depends_on: [L3]
    subphases: []
  - id: L5
    title: Corkboard, threads, story-date axis
    status: planned
    depends_on: [L4]
    subphases: []
  - id: L6
    title: Research and Cast
    status: planned
    depends_on: [L4]
    subphases: []
  - id: L7
    title: Map, flat, with place cards
    status: in_progress
    depends_on: [L2]
    note: "Pulled ahead of L3 to L6 on 2026-09-14 as the first module to build on the core, because it is the most demo-able surface and exercises the same frontmatter writer every other module needs. The flat map needs only L2; place cards (L7.2) still need the cast module."
    subphases:
      - id: L7.1
        title: Flat map with pins
        status: in_progress
        deliverables:
          - { id: L7.1-d1, done: true, desc: "map view for a type: map note: the image or a blank canvas, pins at fractional coordinates, click to open, drag to move, double-click to add, remove, relabel, keyboard nudge; every change writes only pins; commands Open as map, New map, Set map image", note: "2026-09-14: src/modules/map; model tested against the memory host in tests/map.test.ts; DOM view untested" }
        acceptance:
          - { id: L7.1-a1, met: false, check: "in Obsidian, open a map note as a map, drag a pin, add one, remove one; git diff of the note shows only the pins block changing; the image never moves", method: manual }
          - { id: L7.1-a2, met: false, check: "a map note with an Inkarnate PNG export at 2k and the same map at 8k show pins in the same places", method: manual }
      - id: L7.2
        title: Place cards
        status: planned
        depends_on: [L6]
        deliverables: []
        acceptance: []
  - id: L8
    title: Themes and templates
    status: planned
    depends_on: [L4]
    subphases: []
  - id: L9
    title: v1.0, spec frozen, community plugin listing
    status: planned
    depends_on: [L5, L6, L7, L8]
    subphases: []
---

# Phase ledger

The YAML above is the ledger; this page is only its frame. Rules:

- A deliverable is `done` when it is merged on `main`. An acceptance is `met` when the named check was run and passed, by the named method (`unit`, `integration`, `e2e`, `manual`, `review`).
- `current_phase` is the lowest phase with any open deliverable.
- Later phases get their subphases written when the phase before them is `in_progress`, not before. An empty `subphases` list means not yet planned in detail, on purpose.
- Every PR that closes a deliverable flips it here in the same PR, under the PR body's Ledger heading.
