#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# release.sh — bump version, build for macOS, and publish a GitHub release
#
# Requirements:
#   - gh CLI  (https://cli.github.com) — authenticated via `gh auth login`
#   - Node.js / npm
#
# Usage:
#   ./scripts/release.sh           # patch bump  (0.1.0 → 0.1.1)
#   ./scripts/release.sh minor     # minor bump  (0.1.0 → 0.2.0)
#   ./scripts/release.sh major     # major bump  (0.1.0 → 1.0.0)
# ---------------------------------------------------------------------------

BUMP="${1:-patch}"

if ! command -v gh &>/dev/null; then
  echo "❌  gh CLI not found. Install it from https://cli.github.com and run 'gh auth login'."
  exit 1
fi

echo "▶  Installing dependencies…"
npm ci

echo "▶  Bumping $BUMP version…"
npm version "$BUMP" --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version" | tr -d '[:space:]')
echo "   New version: v$NEW_VERSION"

echo "▶  Building macOS app…"
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac

echo "▶  Committing version bump…"
git add package.json package-lock.json
git commit -m "chore: bump version to v$NEW_VERSION"
git push

echo "▶  Creating GitHub release v$NEW_VERSION…"
gh release create "v$NEW_VERSION" \
  dist-electron/*.dmg \
  --title "v$NEW_VERSION" \
  --generate-notes \
  --latest

echo "✅  Released v$NEW_VERSION"
