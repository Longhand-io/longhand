# Changelog

User-visible changes, newest first. Each released section is the text published as that version's GitHub release notes.

## Unreleased: v0.1.0

Not yet cut. Scope: plugin core and the Snapshots module; see `ROADMAP.md`.

### Added

- Plugin core: a host interface with an Obsidian adapter, frontmatter reading and writing that preserves unknown fields and comments byte for byte, a project registry in binder order, a module loader, and one settings tab with a switch per module.
- Map module, flat maps first: any PNG, JPEG, or WebP in the vault as a map, or a blank canvas; pins that link to notes, stored on the map note; click to open, drag to move, double-click to add, right-click or Delete to remove, F2 to relabel, arrow keys to nudge. Commands: Open as map, New map, Set map image.
- Place cards: hover or focus a pin for the note's kind and aliases, the images and notes pinned to it as `attachments`, a search box, and every scene set there with the sentence that names it, computed from links or, when the note carries `match_names: true`, from whole-word name matches. Click a scene to open it. On touch, a tap shows the card.
- A map note opens as a map when you click it; the view's Edit note button opens the text instead. Right-click a note in the file explorer for Open as map.

### Spec

- Map notes: `image` is optional; a map without one is a blank canvas with `width` and `height`. Accepted image formats and the relief input formats are named. Unresolved pins are kept, not dropped.
