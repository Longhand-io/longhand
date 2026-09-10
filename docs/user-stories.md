# User stories

**Longhand** is the name of the whole project: the importer, the vault spec, and the Obsidian plugin family. Longhand means writing something out in full, by hand, and that is the promise: your whole manuscript, in full, in files you own. The importer binary is `scriv2obsidian` so people searching for exactly that find it.

## The one-line promise

Scrivener's writing workflow on Obsidian's plain files. Your manuscript is a folder of Markdown you own forever, with Scrivener-grade snapshots, binder, inspector, and compile layered on top, and git underneath instead of a proprietary database.

## Who this is for

**Persona A: the Scrivener refugee.** Years of projects in `.scriv` packages. Wants out of a proprietary format, wants to use AI tools and version control on their writing, but will not give up snapshots, the binder, or compile. Has tried "export as Markdown" and lost structure, synopses, and history.

**Persona B: the Obsidian native who writes long-form.** Already lives in a vault. Writes novels, essays, sermons, poetry in Obsidian but has no safe way to try a rewrite, no side-by-side compare, no manuscript-level compile. Uses Longform and a stack of plugins that do not know about each other.

**Persona C: the research writer.** Non-fiction, thesis, or scripture-heavy writing with Zotero, PDFs, and footnotes. Needs the research folder, annotation, and footnotes to survive the move, and wants citations to keep working.

All three share a constraint: they will not accept a tool that owns their data. Anything the plugin adds must be readable with no plugin installed.

## Day one for Persona A

1. Runs one command against a `.scriv` package. Gets a folder per project: manuscript tree with numbering preserved, research files copied, synopses and notes in frontmatter, footnotes as Markdown footnotes, internal links as wikilinks.
2. Opens the folder as an Obsidian vault. It already looks like their book: the binder is the file tree, ordered.
3. Opens git history on chapter four. Every Scrivener snapshot they ever took is there, with the original title and date. Nothing was lost in the move.
4. Installs the plugin. A project panel appears in the left sidebar and an inspector on the right. Obsidian now has a "Take snapshot" command.

## A writing day, after the move

- **Morning.** Opens the project panel. Sees the manuscript in order with word counts and status colours. Clicks the scene they left yesterday.
- **Before a risky edit.** Runs "Take snapshot", names it "before cutting the dream sequence". A git commit is made for that one file with that name. No staging, no terminal.
- **The edit goes badly.** Opens the Snapshots tab in the inspector. Sees the named snapshot list for this scene only. Clicks compare: yesterday's version on the left, live text on the right, changes tinted at word level, granularity toggle for paragraph, sentence, word. Copies back one paragraph. Or clicks restore, which snapshots the current state first, then rolls back.
- **Planning.** Switches the panel to corkboard. Index cards from each scene's synopsis, colour from label. Drags to reorder; the file order updates. Switches to timeline: the same scenes laid out by story date, with a second track for when each was written.
- **Research.** The research pane shows the PDFs, images, and notes attached to this scene. Opens a PDF in Obsidian's viewer, highlights, and the highlight links back into the scene. If they use Zotero, the annotations pull in.
- **Submission.** Runs compile. Picks "Short story, Shunn manuscript". Gets a docx with the right front matter, headers, and scene breaks. The Markdown is untouched.
- **Anywhere else.** On the phone via iCloud, the same files open in Obsidian mobile. Snapshots are desktop-only, but nothing is hidden.
- **With an AI.** Points Claude Code or any agent at the vault folder. It reads plain Markdown, sees the git history, and can be asked "what changed in chapter four since the June draft."

## What Obsidian becomes

Today Obsidian is a graph of notes. With Longhand it is a writing studio:

| Obsidian without Longhand | Obsidian with Longhand |
|---|---|
| File tree | Binder: ordered manuscript, drag to reorder, folder notes as chapters |
| Properties panel | Inspector: synopsis, label, status, notes, keywords, bookmarks, and Snapshots tab |
| No versioning UI (git plugin shows raw commits) | Named per-document snapshots, side-by-side compare, safe restore |
| Longform compile to Markdown | Compile presets to docx, pdf, epub, Markdown with manuscript formats |
| Kanban and Canvas | Corkboard generated from synopses, arrange by label, drag to reorder |
| Timeline plugins that each want their own frontmatter | Timeline of scenes by story date and by writing date, from the same frontmatter |
| Attachments scattered in folders | Research pane: PDFs, images, and notes attached to the scene you are writing, annotations linked back |
| Word count in status bar | Session targets, project targets, writing history |

Everything in the right column is stored as frontmatter, files, and git commits. Uninstall the plugin and the left column still shows all of it in plain form.

## One plugin, one settings page

Longhand ships as a single plugin with modules. Each module has an on/off switch and its own section on the one settings page. A poet turns on snapshots and compile and nothing else. A novelist turns on everything. Nothing a module stores is private to it: corkboard, timeline, and binder all read the same `synopsis`, `label`, `date`, and order fields, so turning a module off never strands data.

## Non-goals

- A new file format or database. Never.
- Replacing Obsidian's editor. Scrivenings-style multi-file editing is out of scope.
- Cloud sync. iCloud, Obsidian Sync, or git remotes already exist.
- Mobile snapshots. Git is unavailable to plugins on iOS and Android.
- Telemetry, accounts, or network calls of any kind from the plugin or importer.
