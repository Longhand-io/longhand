# Security policy

## Reporting a vulnerability

Do not report security problems through public issues.

Use this repository's **Security** tab and choose **Report a vulnerability**. That opens a private advisory where the report can be discussed, fixed, and, if warranted, assigned a CVE before anything is public. There is no email channel; the advisory flow is the only one.

## What counts

Longhand runs inside Obsidian with access to the vault. Anything that lets a note, a theme, a template, an imported `.scriv` package, or a map file read or write outside the vault, execute code, or reach the network without the writer's action is in scope. So is anything that makes a snapshot or restore lose data.

## Response

Reports are acknowledged within seven days. Fixes ship as a patch release with the advisory published alongside.
