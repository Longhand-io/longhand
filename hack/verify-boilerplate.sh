#!/usr/bin/env bash
# Every TypeScript and build file starts with the SPDX licence line.
set -euo pipefail
cd "$(dirname "$0")/.."
missing=0
while IFS= read -r f; do
  if ! head -1 "$f" | grep -q '^// SPDX-License-Identifier: Apache-2.0$'; then
    echo "missing licence header: $f"; missing=1
  fi
done < <(find src tests -name '*.ts'; ls esbuild.config.mjs)
exit $missing
