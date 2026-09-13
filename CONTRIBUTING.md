# Contributing to Longhand

Thank you. This is a small project with one maintainer, so the rules below exist to keep review fast, not to slow you down.

## Before you start

- Anything that changes what is stored in a vault is a spec change. Open an issue first; see [GOVERNANCE.md](GOVERNANCE.md).
- Everything else: a pull request is welcome without an issue.

## Building and testing

The plugin is TypeScript on the Obsidian API. Until the scaffold lands (phase L2 in `docs/PHASES.md`) there is no build; docs changes are gated by reading them. Once it lands: `npm ci && npm run gate` runs type-check, lint, unit tests, and a spec conformance suite against `docs/spec.md`.

## Developer Certificate of Origin

Every commit must carry a `Signed-off-by:` line matching its author, which certifies the [DCO](DCO):

```
git commit -s
```

That is the whole contributor agreement. There is no CLA, and no real-name requirement: sign off with a name you use consistently and an email that reaches you. Contributions are licensed under Apache-2.0 and the copyright stays with you; the NOTICE file credits the Longhand Authors collectively.

## Commit messages

Conventional Commits with a closed type set: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`. The scope is the package or module changed. The subject is imperative, lower case, at most 72 characters. One change per commit; a subject that needs "and" is two commits.

```
feat(snapshots): list only snap commits for the active document
fix(rtf): keep hyperlink text when the field has no result group
docs(spec): add the relief field to map notes
```

Breaking changes to the spec or the CLI get a `!` after the type and a `BREAKING CHANGE:` footer.

## Pull requests

1. Branch off `main`, make the change with signed-off commits.
2. Run the gate above; it must be green.
3. Open the PR. The title follows the commit grammar; PRs are squash-merged, so the title becomes the commit on `main`.
4. Keep every heading in the PR template. If a section has nothing to report, write "None."
5. Every number in a PR body has a command behind it. "Should pass" is not a verdict; "not run (why)" is.

## What not to include

No real names of collaborators, no paths from your machine, no text from a real manuscript. Test fixtures are synthetic. The maintainer greps for this before merging and will ask you to scrub.

## Reporting security issues

Not in a public issue. See [SECURITY.md](SECURITY.md).
