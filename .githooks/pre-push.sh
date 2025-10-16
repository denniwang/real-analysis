#!/usr/bin/env bash
set -euo pipefail

echo "[pre-push] Running ESLint..."
pnpm lint

echo "[pre-push] Type-checking with TypeScript..."
pnpm exec tsc -p tsconfig.json --noEmit

echo "[pre-push] Building project..."
pnpm build

echo "[pre-push] All checks passed. Proceeding with push."