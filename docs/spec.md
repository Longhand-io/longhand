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
date: 1897-04-12                           # story date, for the timeline module (optional)
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
