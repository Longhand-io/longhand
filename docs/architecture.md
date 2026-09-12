# Architecture

## Principles

1. **Files are the product.** State lives in Markdown, frontmatter, ordinary files, and git commits. The plugin owns no database, cache of record, or binary format. Removing it loses UI, never data.
2. **The spec is the contract.** A versioned, human-readable convention (`spec.md`) defines the frontmatter fields, folder layout, and commit message format. The importer writes it, the plugin reads and writes it, and any future tool can do the same. Forward compatibility comes from the version field; backward compatibility comes from unknown fields being ignored, never deleted.
3. **Modular by design.** The plugin is a small core plus feature modules that depend only on the core API and the spec. Modules can ship, be disabled, or be licensed independently.
4. **Secure by design.** No third-party runtime dependencies in the importer. No network access anywhere. Git is invoked as an argv array, never through a shell string. Paths derived from user content are sanitised and confined to the output directory. Nothing executes content from the vault.
5. **Boring technology.** Go standard library for the importer. TypeScript with the Obsidian API for the plugin. Git as the version store. Pandoc is optional, only for compile targets that need it.

## Components

```
+---------------------------+       +------------------------------------------+
|  scriv2obsidian (Go CLI)  |       |  Obsidian plugin (TypeScript)            |
|                           |       |                                          |
|  scrivx  parse binder XML |       |  core                                     |
|  rtf     RTF -> Markdown  | spec  |    spec reader/writer (frontmatter)       |
|  convert layout + assets  |-----> |    project registry (find manuscripts)    |
|  gitlog  snapshots -> git |       |    git adapter (desktop, argv only)       |
|                           |       |    event bus, settings, module loader     |
+---------------------------+       |                                          |
                                    |  modules (each optional)                  |
         git repository             |    snapshots   take / list / compare /    |
         (plain commits)   <------> |                restore                    |
                                    |    inspector   synopsis, label, status,   |
                                    |                notes, bookmarks           |
                                    |    binder      ordered tree, reorder      |
                                    |    corkboard   cards from synopses        |
                                    |    compile     presets -> md/docx/pdf     |
                                    |    targets     goals and writing history  |
                                    +------------------------------------------+
```

### Importer (`scriv2obsidian`)

- Input: one or more `.scriv` packages (Scrivener 3, macOS or Windows layout).
- Output: one folder per project in a vault, spec-compliant frontmatter, research assets copied, a manifest mapping every Scrivener UUID to its output path.
- Snapshot backfill: each Scrivener snapshot becomes a git commit at its original date with its original title, in chronological order across the project, before the final import commit. History arrives intact.
- Own RTF reader. Scrivener writes Cocoa RTF; the reader handles paragraphs, line breaks, bold, italic, underline, strike, super and subscript, lists, tabs, hyperlink fields (including Scrivener's `scrivcmt://` comment anchors and `scrivlnk://` internal links), Unicode escapes, cp1252 escapes, and inline images. It does not handle tables or named styles; those are recorded as limitations rather than silently mangled.
- Runs anywhere Go runs. Single static binary. No pandoc required for import.

### Plugin core

Small, stable, and boring. Exposes to modules:

- `spec`: read and write frontmatter fields by name, with schema validation and version handling.
- `projects`: discover manuscript roots (folders with a `_Project.md`), list documents in order, resolve document ids to paths and back.
- `history`: `snapshot(path, title)`, `list(docId)`, `read(snapshotId)`, `restore(snapshotId)`. Backed by a pluggable store: `files` (default, snapshots as plain copies under `_snapshots/`, works everywhere including mobile) or `git` (desktop only, commits with the spec's message shape, repository kept outside cloud-synced folders). `both` writes to each. See `sync-and-history.md`.
- `ui`: sidebar view registration, inspector tab registration, commands.
- `events`: document changed, snapshot taken, project reordered.

Modules register with the core at load. The core never imports a module. Every module contributes one section to a single settings tab and can be switched off without affecting the others; modules share data only through the spec, never through each other's state.

### Modules

| Module | Reads | Writes | Depends on |
|---|---|---|---|
| snapshots | history store for doc id | snapshot files and/or git commits | core.history, core.spec |
| inspector | frontmatter | frontmatter | core.spec |
| binder | folder tree, `order` field | file renames or `order` field | core.projects |
| corkboard | `synopsis`, `label`, `status`, `date`, snapshot dates | `order` (drag along the axis), `label` (drag across threads), `status` (kanban columns), `date` (story-date axis) | core.projects, binder, core.history |
| research | attachments folder, `attachments` field, PDF annotations | `attachments` field | core.projects |
| map | `type: map` notes, `image`, `pins` | `pins` on the map note | core.projects |
| compile | manuscript in order, preset config | files outside the vault | core.projects, optional pandoc |
| targets | word counts, git history | a `targets` frontmatter block on `_Project.md` | core.projects |

### Licensing shape (for later, not v0.1)

The spec, the importer, and the core plus snapshots module are open source. That is the trust layer: nobody adopts a writing tool that can hold their manuscript hostage. Modules that are convenience rather than data safety, such as compile presets, corkboard, and targets, are candidates for a licence key. The module boundary makes that a packaging decision, not a rewrite. Obsidian's developer policies on paid plugins must be checked before any paid tier ships.

## Future directions, not committed

Two ideas are worth recording so the module boundary is drawn with them in mind. Neither is in scope for v0.1.

**Assistant.** An in-vault helper that knows the manuscript: what changed since a snapshot, which threads a chapter carries, where a character was last seen, what a scene's synopsis should say. It would be a module like any other, reading only through the spec and the history store, with three hard rules that keep the security posture intact: off by default, network access only after the writer supplies their own model endpoint or key (or points at a local model), and every action it takes lands as an ordinary edit or snapshot the writer can see and undo. It gets its own icon, the nib, so nobody mistakes it for Longhand itself.

**Worldbuilding.** The map module already treats any image as a map with pins. Obsidian views are Chromium, so WebGL and a 3D scene are available to a plugin on desktop, and a heightmap PNG, a glTF model, or an exported map from a generator could render as a navigable world with the same pins linking to notes. This is the one place a rendering library would be justified, and it would be isolated inside the module so the core stays dependency-free.

## Compatibility

- **Spec versioning.** Every `_Project.md` carries `longhand: 1`. Readers accept lower versions and migrate on write. Unknown fields are preserved verbatim.
- **Git independence.** Snapshot commits are ordinary commits with a message convention. `git log --grep` finds them without the plugin.
- **Importer stability.** Output layout and frontmatter are covered by golden-file tests. Changing them is a spec bump.
- **Obsidian API drift.** The plugin uses public API only. No private-API tricks, which is the failure mode of some existing history plugins.

## Threat model, briefly

- A malicious `.scriv` package: titles with path separators or `..`, oversized images, malformed RTF. The importer sanitises names, confines output, bounds decoding, and never panics on bad input.
- A vault inside iCloud, Dropbox, or OneDrive: the git store initialises with a separate git directory outside the synced folder, never a `.git` directory inside it.
- Commit messages: titles are passed as argv, so shell metacharacters are inert.
- No plugin setting can point at a binary other than `git` on PATH, and no setting accepts a shell command.
