# Themes and templates

Longhand is meant to be built on. Two things are open formats from day one: themes, which change how every Longhand panel looks, and project templates, which change what a new project starts with. Both are folders of plain files, both are shareable, and both may be sold by whoever makes them.

## How Longhand is styled

Every Longhand panel, the compare view, the binder, the inspector, the corkboard, the cast panel, the maps, and Nib's margin, is drawn from one set of CSS custom properties with the `--lh-` prefix. Nothing is hard-coded. The core ships the default set, which is the paper-and-ink palette on this site, and a theme overrides some or all of it.

Longhand themes sit on top of Obsidian themes, not instead of them. An Obsidian theme still styles the editor, the file explorer, and the app chrome. A Longhand theme styles Longhand's panels and can read Obsidian's own variables so the two agree.

## A theme is a folder

```
my-theme/
  theme.json        name, author, version, and the token values
  theme.css         optional: rules that go beyond tokens
  preview.png       optional: shown in the theme picker
```

`theme.json`:

```json
{
  "name": "Typewriter",
  "author": "someone",
  "version": "1.0.0",
  "longhand": 1,
  "tokens": {
    "paper": "#F6F3EA",
    "ink": "#2A2622",
    "graphite": "#7A746B",
    "rule": "#D9D3C6",
    "removed": "#9C3B2E",
    "removed-wash": "#F1DED8",
    "added": "#3F6B4A",
    "added-wash": "#DFE9DE",
    "label-red": "#B4574E",
    "label-blue": "#4E6A95",
    "label-green": "#5F8A5B",
    "label-yellow": "#C6A14A",
    "font-body": "\"iA Writer Quattro\", Georgia, serif",
    "font-mono": "ui-monospace, Menlo, monospace",
    "card-radius": "2px",
    "card-shadow": "none"
  }
}
```

Every key in `tokens` becomes `--lh-<key>` on the Longhand root element. Unknown keys are set anyway, so a theme can define tokens for a module that does not exist yet. Missing keys fall back to the default theme. `longhand: 1` is the theme format version; readers accept older versions.

`theme.css` is loaded after the tokens and scoped to Longhand's panels by the core, so a theme cannot restyle the rest of Obsidian by accident. Selectors are stable and documented per module; a class name that starts with `lh-` is public API and will not change without a format version bump.

Themes install by dropping the folder into `.longhand/themes/` in the vault, or through the theme picker in settings, which reads a community list. There is no build step.

## A project template is a folder

A template is a starting project: the folders, the `_Project.md` with labels and statuses filled in, a few starter notes, and a compile preset if one belongs with it. Longhand ships with novel, short fiction, poetry, essay, screenplay, and recipe collection, which are the shapes that came across from Scrivener. Anyone can add another by making a folder that follows the spec and adding `template.json`:

```json
{
  "name": "Sermon series",
  "author": "someone",
  "version": "1.0.0",
  "longhand": 1,
  "description": "One project per series, one scene per sermon, scripture references as footnotes."
}
```

Templates install to `.longhand/templates/`. Creating a project from one copies the folder, assigns fresh `id` values, and stamps the date. Nothing in a template is special after that; it is an ordinary project.

## Sharing and selling

Themes and templates are yours. Publish them on GitHub, sell them on your own site, or list them in the community gallery when it exists. Longhand will not take a cut of anything sold outside its own store, and it will never require a theme or template to be approved before it works. If a store with revenue sharing ships later, it will be optional.

## What themes cannot do

- Run code. `theme.css` is CSS; there is no script hook, so a theme cannot read your vault or call the network.
- Reach outside Longhand's panels.
- Change what is stored. Themes are presentation only; the spec is untouched.
