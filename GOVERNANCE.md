# Governance

> Status: bootstrapping. Longhand has one founding maintainer. This document describes the model the project grows into; the thresholds below become meaningful as maintainers are added. [MAINTAINERS.md](MAINTAINERS.md) is the current reality.

## Roles

- **Contributor**: anyone who submits code, docs, issues, or reviews. The only requirement is the [DCO](DCO) sign-off on commits.
- **Reviewer**: a contributor with a track record who reviews pull requests in an area. Reviews are advisory until a maintainer approves.
- **Maintainer**: holds merge rights and release responsibility, listed in [MAINTAINERS.md](MAINTAINERS.md). Maintainers are added by the existing maintainers on the basis of sustained, careful contribution.

## Decision making

- **Routine changes** merge by lazy consensus: one maintainer approval and no unresolved objection.
- **Changes to the vault spec** are never routine. A spec change needs a written proposal in `docs/`, a migration note, and a format version decision before any code lands. Unknown fields are always preserved; that rule is not up for vote.
- **Substantial or architectural changes** get a design note and a review before the change lands. Decisions are recorded in the design docs, not in chat.
- **Disagreements** are resolved by discussion. If consensus cannot be reached, a simple majority of maintainers decides.

## Changing governance or the maintainer set

Adding or removing a maintainer, or changing this document, requires two-thirds of current maintainers. With a single founding maintainer that threshold is trivially met; it becomes meaningful as the set grows.

## What governance does not cover

Nib, compile presets, and relief maps are paid and developed outside this repository. Their existence does not change anything above: nothing in a paid module may read a field that open modules cannot, and the spec stays open.

## Code of Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
