# Hosts

> What Longhand is, what it runs inside, and where the line between them sits. `architecture.md` states the rule; this page scopes it. Edit by hand.

## Two things, one contract

**The studio** is Longhand: the core (spec reader and writer, project registry, history store, module loader) and the modules a writer would name (binder, map, timeline, Nib, and the rest). It knows how a manuscript is laid out, what a scene is, where a character was last seen. It does not know what program it is running in.

**The host** is the program the studio runs inside. It owns the window, the prose editor, the files on disk, search, `[[link]]` resolution, the places panels can go, and sync and mobile if it has them. Today the host is Obsidian.

They meet at one interface, `src/host/host.ts`. The studio only ever calls those functions. The host only ever implements them. Nothing else crosses the line: no module imports `obsidian`, and the Obsidian adapter contains no writing logic.

```
+---------------------------------------------------+
|  studio: core + modules                           |
|  binder · map · timeline · nib · new · snapshots  |
|  src/core, src/modules                            |
+------------------------ Host interface -----------+
|  host adapter: src/host/obsidian  (~400 lines)    |
|  or src/host/memory (tests)                       |
|  or a desktop app's adapter (not built)           |
+---------------------------------------------------+
|  the program: Obsidian · node:test · Tauri        |
+---------------------------------------------------+
```

## What the host must provide

The whole contract, grouped by what it is for. A new host implements exactly this list.

**Files.** `readFile`, `writeFile`, `exists`, `createFolder`, `renameFile` (which must keep links pointing at the renamed file), `listFiles`, `onFileChanged`, and `cachedFrontmatter` for sync checks such as "is the active note a map".

**Links.** `resolveLink` from link text to a path, `linkTo` from a path to the shortest unambiguous `[[link]]`, and `resourceUrl` so an `<img>` can show a file in the vault.

**Places to put things.** `registerView` and `openView` for a panel in a tab or a sidebar; `registerAutoView` so a note of a given type opens in a panel instead of as text, with `openNoteAsMarkdown` as the way back; `registerCompanion` for UI that rides on every Longhand panel; `registerOverlay` for UI over the whole window, which is where Nib sits.

**Ways in.** `registerCommand` for the command palette, `registerRibbon` for an always-visible button, `registerFileMenu` for right-click entries on files and folders.

**Small dialogs.** `pickFile`, `choose`, `prompt`, `confirm`, `notify`.

**Where the writer is.** `activeFile`, `onActiveFileChanged`, and `isMobile`.

Thirty-odd functions. The in-memory host that backs the tests implements all of them in about 150 lines, which is the proof that the contract is small.

## What the studio never asks the host for

An editor. The host's own editor edits the prose; Longhand's panels sit beside it. A database. Settings storage beyond one on/off switch per module. Network. Anything Obsidian-shaped: leaves, workspaces, plugin lifecycles stay inside the adapter.

## The plugin

The Obsidian plugin is the adapter plus an entry point: `src/host/obsidian/host.ts` implements the interface on Obsidian's API, `src/host/obsidian/settings.ts` draws the one settings tab, and `src/main.ts` builds the host, the core, and the module list. It is glue, not product. When Obsidian's API changes, the adapter changes and nothing above it does. When Obsidian's API forces an awkwardness, such as a note flashing as text before it becomes a map, the awkwardness lives in the adapter and nowhere else.

## A second host

A second host is the same studio mounted through a different adapter. The candidate is a Longhand desktop application: one window, one book open at a time, the binder on the left, a Markdown editor in the middle, the map, timeline, and Nib as panels, and a folder on disk as the project. Its adapter would implement the list above on top of a desktop shell such as Tauri and an editor such as CodeMirror, the same components Obsidian is built from.

What the writer would get: Longhand with no Obsidian around it. No vault of many projects, no community-plugin switch, no Properties panel showing pins as JSON, the brand on the window. What they would lose until it is built: mobile, sync, and the plugin directory as a way to find Longhand.

Both hosts read and write the same files under the same spec, so a writer can use the app at the desk and Obsidian on the phone on the same folder, and nothing needs converting.

## The rule, restated

Anything a writer would call a feature goes in a module against the host interface. Anything that only exists because of the program we are running in goes in the adapter. When a change wants to break that line, it is a sign the interface is missing a function; add the function, implement it in every adapter, and keep the line.

## Status

- Obsidian host: complete for every module built so far.
- Memory host: complete; runs the test suite.
- Desktop host: not started. A bounded spike is the way to find out how much of the current friction is Obsidian's, before deciding anything larger.
