# Vault spec, version 1

Everything the importer writes and the plugin reads. Plain Markdown, YAML frontmatter, files, and git commits. A vault that follows this spec is fully usable with no plugin installed.

## Layout

```
<Vault>/
  <Project>/
    _Project.md                 project note: spec version, source, labels, statuses, keywords
    Manuscript/                 Scrivener's Draft folder (title taken from the binder)
      01 Part One/
        01 Part One.md          folder note, present only if the folder had its own text
        01 Chapter One.md
        02 Chapter Two.md
      02 Part Two/
    Research/
      01 Interview notes.md
      02 Map.png
      03 Source.pdf
    Notes/                      any other top-level binder folders keep their titles
    _attachments/               inline images extracted from document text
    _snapshots/                 files history store, see below
    .scriv2obsidian.json        manifest: Scrivener UUID -> path, counts, warnings
```

- Ordering is the two-digit (or wider) numeric prefix. Readers must sort by prefix, then name. `--no-prefix` writes `order:` in frontmatter instead; readers must honour either.
- A folder that also has text becomes a folder note with the folder's own name inside it.
- Trash is not exported unless asked for; if exported it lands in `Trash/`.
- File names are the Scrivener titles with `/ \ : * ? " < > | # ^ [ ]` replaced by `-`, whitespace collapsed, at most 120 characters, and a ` (2)` suffix on collision.

## Document frontmatter

```yaml
---
id: 9B2C1F7A-4E63-4D8B-A1F0-2C5E7D9A3B41   # stable identity; Scrivener's binder UUID on import, a fresh UUID for new documents
title: Chapter One
type: text                                 # text | folder | pdf | image | web | other
created: 2021-05-22T19:12:38-07:00
modified: 2025-08-18T18:25:55-07:00
synopsis: "Mara finds the letter."         # Scrivener index-card text
label: Red                                 # label title, not id
status: First Draft
tags: [winter, vegetarian]                 # Scrivener keywords, slugified
include: true                              # Scrivener "include in compile"
bookmarks: ["[[Sample Recipe]]"]           # Scrivener document bookmarks as wikilinks
date: 1897-04-12                           # story date; any note with a date appears on the timeline (optional)
date_end: 1897-04-13                       # story date range end (optional)
attachments: ["[[Research/03 Source.pdf]]"] # research items attached to this document (optional)
meta:                                      # Scrivener custom metadata, keyed by field title
  Source: Grandma
---
```

Rules:
- `id` is required and never changes. Renames and moves are free.
- Every other field is optional. Absent means unset. Readers must not add empty fields.
- Unknown fields are preserved by every writer. That is how future versions and other plugins coexist.
- Document notes (Scrivener's Notes pane) go in the body under a trailing callout:

```markdown
> [!note] Notes
> Text of the note.
```

- Scrivener footnotes become Markdown footnotes `[^1]` with definitions at the end of the body.
- Scrivener comments become Obsidian comments immediately after the anchored text: `anchored text%% comment body %%`.
- Internal links (`scrivlnk://`) become `[[Title]]` wikilinks to the target's file name. Unresolvable ones are left as plain text.
- Inline images are written to `_attachments/<id>-<n>.<ext>` and embedded as `![[...]]`.

## Event notes

Anything that should sit on the timeline without being manuscript, such as a historical event or a character's birth, is a note with `type: event` and a `date`. It is rendered as a pin with a dashed outline so it reads as context, not as a scene.

## Character and setting notes

A character is a note with `type: character`. A place that is not a map is `type: setting`. Both may carry `aliases`, a list of other names the manuscript uses for them.

```yaml
---
id: 7A1F3C9D-2B84-4E5A-9C61-0D3F8B2E4A17
type: character
title: Mara
aliases: ["the Harrow girl"]
label: Red                                  # the thread this character carries on the corkboard
---
```

Appearances are never stored. A character appears in a scene when the scene links to the character's note, or, if the note carries `match_names: true`, when the scene's text contains the title or an alias as a whole word, case-insensitively. Readers compute appearances from the manuscript in order; the cast panel is a view, not a record, so it can never be out of date.

The same rule gives a place its scenes. A map pin whose `to` is a setting note can show every chapter and scene set there, the sentence that names it, and the setting's `attachments` (images and notes pinned for inspiration), all computed at view time. Nothing on the map duplicates anything in the manuscript.

## Map notes

A map is a note with `type: map` and `pins`. It draws either an `image`, a wikilink to a picture in the vault, or, when there is no image, a blank canvas whose shape comes from `width` and `height`. Pin coordinates are fractions of the drawn width and height, so the same pins fit a 2k export and a 16k export of the same map, and a blank canvas can be given an image later without moving anything.

- `image` may be any picture the host can draw. PNG, JPEG, and WebP are the formats every map tool exports and the ones readers must support; SVG is allowed and must carry a `viewBox`.
- `width` and `height` are required when `image` is absent and ignored when it is present. They are unitless; only the ratio matters.
- An optional `relief` field points at height data for a reader that can render the map in three dimensions: a 16-bit greyscale PNG heightmap that shares the image's frame, or a glTF or GLB model. A reader that cannot render relief shows the flat map with the same pins.

```yaml
---
id: 3C7D0E2B-9A15-4F6E-8B21-5D4A7C9E1F30
type: map
title: Whitby, 1897
image: "[[Research/02 Map.png]]"
pins:
  - to: "[[02 The Tin]]"
    x: 0.22
    y: 0.44
    label: The house
  - to: "[[03 Winter Fair]]"
    x: 0.66
    y: 0.36
---
```

A pin's `to` is a wikilink to any note; `label` is optional and defaults to the note's name. `x` and `y` are clamped to the range 0 to 1 by readers. Nothing is stored on the target, so deleting a map deletes only its pins, and a pin whose note has gone is kept and shown as unresolved rather than dropped.

### Shapes

A map may also carry `shapes`, drawn on top of the picture in the same fractional coordinates. A shape is a region, a line, or a label, with an optional `style` that says how a reader draws it, and the same `label`, `to`, and `tags` a pin can carry, so a region around a wood can be the wood's note and get the same place card. Readers keep shapes they do not understand and never rewrite a shape they did not change.

```yaml
shapes:
  - id: s-k2m9qa                 # stable within the note
    type: polygon                # circle | rect | polygon | line | text
    points: "0.2,0.5 0.3,0.45 0.35,0.6 0.22,0.62"   # polygon, line: SVG points syntax
    style: wood                  # outline | wood | water | hills | road | river | route
    color: moss                  # optional named ink: ink | graphite | red | blue | green | yellow | sea | moss
    hand: true                   # optional: drawn by hand, a wavering line rather than a clean one
    label: Harrow Wood
    to: "[[Harrow Wood]]"
  - id: s-7fh3xd
    type: circle
    x: 0.6                       # circle, rect, text: the centre
    y: 0.7
    r: 0.02                      # circle: radius as a fraction of the width
  - id: s-p0q1zz
    type: rect
    x: 0.4
    y: 0.3
    w: 0.1                       # rect: size as fractions
    h: 0.06
  - id: s-lbl001
    type: text
    x: 0.5
    y: 0.12
    label: The Grey Reach
```

Styles are advice, not data: a reader without a style draws every shape as an outline. `points` uses SVG's syntax so the field stays one readable line.

A blank canvas:

```yaml
---
id: 7A1F3C9D-2B84-4E5A-9C61-0D3F8B2E4A17
type: map
title: The lower town
width: 1600
height: 1000
pins: []
---
```

## Project note

```yaml
---
longhand: 1                                   # spec version
title: Novel
source: scrivener
source_creator: SCRMAC-3.5.2-17486
imported: 2026-09-09T17:20:00-07:00
labels: [Red, Orange, Yellow]
statuses: [To Do, First Draft, Revised Draft, Final Draft, Done]
keywords: [winter, spring]
---
```

Any folder that contains a `_Project.md` is a project root. Nested projects are not supported.

## Snapshot files

The default history store. One full copy of the document per snapshot:

```
<Project>/_snapshots/<doc-id>/<timestamp> <title>.md
```

- `<timestamp>` is UTC, `YYYY-MM-DDTHH-MM-SSZ`, so names sort chronologically on every filesystem.
- `<title>` is the snapshot title with the same character rules as file names, or `Untitled` if none was given.
- The file is the document exactly as it was, frontmatter included, so restore is a copy.
- Readers list the directory for the document's `id`; nothing else is needed. The folder is excluded from Obsidian search and graph by the plugin, and travels with the vault under any sync method, mobile included.

## Snapshot commits

The optional git history store. Desktop only, needs `git`.


A snapshot is a git commit that touches exactly the files being snapshotted and has this message shape:

```
snap(Manuscript/01 Part One/02 Chapter Two.md): before cutting the dream sequence

Snapshot-Title: before cutting the dream sequence
Snapshot-Doc-Id: 9B2C1F7A-4E63-4D8B-A1F0-2C5E7D9A3B41
Snapshot-Source: scrivener
Word-Count: 2417
```

- Subject: `snap(<path relative to repo root>): <title>`. For a folder snapshot the path is the folder.
- Trailers follow git's trailer format so `git interpret-trailers` and `git log --format=%(trailers:key=Snapshot-Doc-Id)` work.
- `Snapshot-Doc-Id` is what readers filter on. It survives renames; `--follow` heuristics are never required.
- `Snapshot-Source` is `scrivener` for imported history and `longhand` for snapshots taken in Obsidian.
- Imported snapshots use the original Scrivener date as both author and committer date.
- The import itself ends with a commit whose subject is `feat(<project>): import from Scrivener` and whose trailers record the source package and document count.

Auto-commits made by other tools (for example the Obsidian Git plugin) are not snapshots and are ignored by readers because they lack the `snap(` prefix.

## Compatibility promises

- Version 1 readers ignore fields they do not know and never delete them.
- A future version bumps `longhand:` on `_Project.md` and documents the migration.
- No file in the vault is ever required to be binary, and no state is stored outside the vault and its git repository.
