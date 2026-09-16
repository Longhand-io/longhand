# Programs

> The product lines Longhand is built from. `ROADMAP.md` tells the story by release and `PHASES.md` tracks delivery; this page says what each line is for, what in it is open and what is paid, and where it stands. Every phase in the ledger carries a `program` key that points here. Edit by hand.

Two rules hold across every program. Anything that reads or writes the vault is open source under Apache-2.0, because a writing tool that can hold a manuscript hostage does not get adopted. Anything paid is convenience, computation, or craft on top of files the open modules can already read, so turning it off changes nothing in your files.

| Program | What it is for | Open | Paid | Ledger | Site | Status |
|---|---|---|---|---|---|---|
| **Spec and importer** | The file format every tool agrees on, and the way in from Scrivener with history intact | All of it | Nothing | importer I0 to I8; plugin L0, L1 | Import | Importer feature complete, release pending |
| **Studio core** | The host interface, spec reader and writer, project registry, history store, module loader, settings | All of it | Nothing | L2 | none | L2.1 to L2.3 done; history store next |
| **Manuscript** | Binder, inspector, snapshots with compare and restore, corkboard and threads, targets | All of it | Nothing | L3, L4, L5 | Binder, Snapshots, Corkboard | New with a type picker done; tree, inspector, snapshots next |
| **Cartography** | Any picture as a map, pins that know their scenes, a drawing layer in the paper-and-ink style, and everything a world needs after that | Flat map, pins, place cards, drawing tools and styles, the `shapes` format | Relief rendering, a procedural base-map generator, print and image export, curated asset packs | L7 | Map | Flat map, place cards, drawing shipped to testing |
| **Research and Cast** | Attachments, PDF highlights that link back, character and setting notes with computed appearances | All of it | Nothing | L6 | Cast, Research | Appearances engine done and used by the map; panels next |
| **Nib** | The assistant in the margin: answers from the files and history, proposes edits the writer accepts, never writes prose | The panel and the retrieval answers that need no model | Hosted models and manuscript intelligence, by subscription; bring-your-own-key at a lower annual price | N0 onward, own ledger later | Nib | Panel with retrieval answers in progress |
| **Compile** | Manuscript to docx, pdf, epub, and Markdown with presets writers already pay for elsewhere | A plain Markdown compile | Submission presets, one-time | later | Compile | Not started |
| **Themes and templates** | Open formats for how Longhand looks and what a project starts with | The formats, the default theme, six starter templates | An optional store with revenue share, never required | L8 | none | Formats documented |

## How a program grows

A program starts as one module and one row in the ledger. It becomes a line worth naming when it has a paid tier in view or a second module behind it. Cartography is the example: the flat map was a spike, the drawing layer made it a line, and relief, the generator, export, and asset packs are the paid tier that line supports. The open part of a program is never a crippled version of the paid part; it is the part that touches the files.

## What is not a program

Sync, accounts, and a database. Longhand never moves files between devices, never requires an account for anything but Nib's hosted tier, and stores nothing outside the vault and its optional git directory. See the roadmap's non-goals.
