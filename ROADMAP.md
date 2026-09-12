# Longhand roadmap

> Hand-written public roadmap. The engineering ledger, `docs/PHASES.md`, is the source of truth for delivery state; this page is the narrative. Edit by hand.

Longhand is a writing studio for Obsidian: binder, snapshots with side-by-side compare, inspector, corkboard and threads, research, cast, maps, compile, and Nib, the assistant. Everything is stored as Markdown, frontmatter, files, and git commits under an open [vault spec](docs/spec.md). The importer that brings Scrivener projects across, history included, lives in [scrivener-to-obsidian](https://github.com/grassclaw/scrivener-to-obsidian) and has its own roadmap.

This is a three-horizon roadmap. Where a thing is designed but not built, this page says so.

## Shipped

- **The vault spec, version 1.** Layout, frontmatter, snapshot files, snapshot commits, character and setting notes, map notes with pins and an optional relief source. Open, versioned, unknown fields preserved.
- **The design.** User stories, architecture with a core and switchable modules, the sync and history model (files store by default, git optional, never inside a cloud-synced folder), the theme and template formats, the open-versus-paid split.
- **The importer's RTF reader.** Scrivener's Cocoa RTF to Markdown without pandoc, keeping hyperlink fields that pandoc drops, which is where Scrivener stores comments and internal links. In the importer repo.
- **The brand and the site.** Name, mark, Nib, and a landing page that shows each module as it will look, including a live relief map.

## Next: v0.1, the importer and Snapshots

The first thing a writer can install. Two deliverables, in order:

1. **scriv2obsidian v0.1** (importer repo). Binder parsing, layout and frontmatter, comments and links and images, snapshots replayed into the files store and optionally git, a manifest, an `inspect` command, a synthetic fixture with tests, validation against real projects, signed binaries for macOS, Linux, and Windows.
2. **Longhand plugin v0.1: core plus Snapshots.** The core reads and writes the spec, finds projects, runs the history store with `files` and `git` backends, and loads modules. The Snapshots module is the whole user-facing surface: take a named snapshot, list only this document's snapshots, compare side by side with paragraph, sentence, and word granularity, restore with an automatic snapshot first. Desktop and mobile for the files store; git on desktop.

v0.1 ships when a Scrivener refugee can import a project, open it in Obsidian, see their old snapshots in the Snapshots tab, and take a new one.

## Future: the studio, one module per release

- **v0.2 Binder and Inspector.** Ordered manuscript tree with word counts and drag to reorder; the inspector with synopsis, label, status, notes, keywords, bookmarks, and the Snapshots and Research tabs.
- **v0.3 Corkboard.** Grid, kanban columns by status, and label threads in manuscript order, with the story-date axis.
- **v0.4 Research and Cast.** Attachments pane, PDF highlights linking back, character and setting notes with computed appearances.
- **v0.5 Map.** Any image as a map, pins to notes, place cards with computed scenes and pinned images.
- **v0.6 Themes and templates.** The `--lh-` token system exposed, the theme folder format, the template folder format, six starter templates.
- **v1.0.** Spec frozen at version 1 with a compatibility promise, the plugin in the Obsidian community list, the importer at 1.0.
- **Paid, outside this repository, after v1.0:** Nib, the assistant, as the only subscription; compile presets; relief maps. Each is a module against the same core API and stores nothing the open modules cannot read.

### Non-goals, deliberate

- **No Scrivenings.** Editing several files as one buffer is out of scope. Larger scenes plus the compile preview cover it.
- **No sync.** iCloud, Dropbox, Obsidian Sync, Syncthing, and git remotes already exist. Longhand never moves files between devices.
- **No database.** State is files, frontmatter, and commits. Nothing lives outside the vault except an optional git directory the plugin keeps out of cloud-synced folders.
- **No private Obsidian APIs.** Public API only, so an Obsidian update cannot silently break history.
- **No telemetry, no accounts, no network** from the plugin. Nib is the one module that talks to a model, only to the endpoint the writer chose, only when on.
