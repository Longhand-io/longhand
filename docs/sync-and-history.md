# Sync and history

Two different problems that are easy to conflate.

- **Sync** moves your vault between devices. Longhand does not do this. Whatever you use today keeps working.
- **History** remembers earlier versions of a document so you can compare and restore. Longhand does this, through a pluggable store.

## History stores

| Store | Where snapshots live | Needs | Works on | Best for |
|---|---|---|---|---|
| `files` (default) | `<Project>/_snapshots/<doc-id>/<timestamp> <title>.md`, one full copy per snapshot | nothing | every device and every sync method | everyone |
| `git` | commits in a git repository, message shape in the spec | `git` on PATH, desktop | macOS, Windows, Linux | writers who want real version control, branching, remotes, and AI tooling over history |

The Snapshots module offers the same take, list, compare, and restore over either store. Settings let you choose `files`, `git`, or `both`. With `both`, a snapshot writes a file and makes a commit.

The importer always writes the `files` store. With `-git` it also replays snapshots as commits.

Why files by default: Scrivener's own snapshots are files inside the project, and that is why they survived years of Dropbox and iCloud. A plain copy per snapshot is the most portable, most inspectable, least surprising thing we can do. The `_snapshots` folder is added to Obsidian's excluded files by the plugin so it stays out of search, graph, and link suggestions.

## Sync methods

| Sync | Vault files | `files` history | `git` history | Notes |
|---|---|---|---|---|
| iCloud Drive | yes | yes | desktop only, repo kept outside iCloud | The plugin initialises git with a separate git directory under `~/Library/Application Support/Longhand/repos/`, so iCloud never sees `.git`. A one-line `.git` file in the vault points at it. |
| Dropbox | yes | yes | desktop only, repo kept outside Dropbox | Same separate-git-dir arrangement. |
| Obsidian Sync | yes | yes | desktop only, independent repo per desktop | Obsidian Sync does not sync hidden folders, so `.git` never crosses devices. Each desktop keeps its own history unless you add a remote. |
| Syncthing | yes | yes | desktop only, exclude `.git` | The plugin writes a `.stignore` line if it finds one. |
| Git remote (Obsidian Git plugin, Working Copy) | yes | yes | yes, full | Git is the sync. Every device needs a git implementation: the Obsidian Git plugin ships one for mobile, or use a git app. Fine for technical writers, not the default for everyone. |

Rules that fall out of the table:

1. A `.git` directory must never sit inside a cloud-synced folder. Cloud sync tools corrupt git object stores under concurrent writes. The plugin refuses to initialise a repository inside a folder it recognises as iCloud, Dropbox, or OneDrive unless the separate-git-dir option is used, which it uses by default.
2. Git history is per desktop unless a remote is configured. Two desktops that both take snapshots have two histories. Adding a remote and letting the plugin push after each snapshot merges them; snapshots touch one file each and rarely conflict.
3. Mobile reads the `files` store only. Taking a snapshot on mobile writes a file; a desktop running the `both` store can later commit files it has not seen, which the plugin does on startup when a new snapshot file appears without a matching commit.

## Why not just use git as sync

It works, and technical writers already do it with the Obsidian Git plugin. But it puts git on the critical path of every device, including phones, where the only options are a pure-JavaScript git that is slow on large vaults or a separate git app. A tool that wants to be the default for writers cannot require that. So git is the optional, powerful history store, and sync stays whatever the writer already trusts.
