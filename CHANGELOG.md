# Changelog

User-visible changes, newest first. Each released section is the text published as that version's GitHub release notes.

## Unreleased: v0.1.0

Not yet cut. Scope: plugin core and the Snapshots module; see `ROADMAP.md`.

### Added

- Plugin core: a host interface with an Obsidian adapter, frontmatter reading and writing that preserves unknown fields and comments byte for byte, a project registry in binder order, a module loader, and one settings tab with a switch per module.
- Map module, flat maps first: any PNG, JPEG, or WebP in the vault as a map, or a blank canvas; pins that link to notes, stored on the map note; click to open, drag to move, double-click to add, right-click or Delete to remove, F2 to relabel, arrow keys to nudge. Commands: Open as map, New map, Set map image.
- Place cards: hover or focus a pin for the note's kind and aliases, the images and notes pinned to it as `attachments`, a search box, and every scene set there with the sentence that names it, computed from links or, when the note carries `match_names: true`, from whole-word name matches. Click a scene to open it. On touch, a tap shows the card.
- Drawing on maps in the paper-and-ink style: circle, rectangle, freehand region, freehand line, and label tools; wood, water, hills, road, river, and route styles; select, move, resize, relabel, restyle, delete, undo. Any shape can link to a note and gets the same hover card as a pin. An icon toolbar with keyboard shortcuts (V, R, O, P, L, G, T, or 1 to 7): Pen draws a free line, Line a straight one, Region a closed area. Finishing a shape hands you back Select with the shape selected, a hand-drawn pen mode (H) that draws a wavering double line instead of a clean one, and eight named inks in the paper-and-ink palette. Shapes are stored on the map note as a `shapes` list with fractional coordinates.
- Binder, first piece: New… with a type picker, the Scrivener way. Scene, folder, character, setting, event, or map. Scenes and folders land next to the note you are in with the next number; characters, settings, and events go where the project already keeps that kind, else Research. From the command palette, the ribbon, or a folder's right-click menu as New here….
- New map from the ribbon button on the left bar, or from a folder's right-click menu with New map here.
- Fixed: a map note opened as text the first time and only became a map after switching tabs. Notes already open when the plugin loads are swapped too.
- A map note opens as a map when you click it; the view's Edit note button opens the text instead. Right-click a note in the file explorer for Open as map.

### Spec

- Map notes: `image` is optional; a map without one is a blank canvas with `width` and `height`. Accepted image formats and the relief input formats are named. Unresolved pins are kept, not dropped.
