#!/usr/bin/env bash
set -eo pipefail

# ---------------------------------------------------------------------------
# release.sh -- bump version, build for macOS, and publish a GitHub release
#
# Requirements:
#   - gh CLI  (https://cli.github.com) -- authenticated via `gh auth login`
#   - Node.js / npm
#
# Usage:
#   ./scripts/release.sh           # patch bump  (0.1.0 -> 0.1.1)
#   ./scripts/release.sh minor     # minor bump  (0.1.0 -> 0.2.0)
#   ./scripts/release.sh major     # major bump  (0.1.0 -> 1.0.0)
# ---------------------------------------------------------------------------

BUMP="${1:-patch}"

if ! command -v gh &>/dev/null; then
  echo "ERROR: gh CLI not found. Install it from https://cli.github.com and run 'gh auth login'."
  exit 1
fi

echo ">> Installing dependencies..."
npm ci

echo ">> Bumping $BUMP version..."
npm version "$BUMP" --no-git-tag-version

echo ">> Building macOS app..."
rm -rf dist-electron
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac

# Read version fresh after the build so no variable lifetime issues
VERSION=$(node -e "process.stdout.write(require('./package.json').version)")
echo ">> Version: $VERSION"

echo ">> Committing version bump..."
git add package.json package-lock.json
git commit -m "chore: bump version to v$VERSION"
git push

echo ">> Creating GitHub release v$VERSION..."
gh release create "v$VERSION" dist-electron/*.dmg \
  --title "v$VERSION" \
  --generate-notes \
  --latest

echo "Done: released v$VERSION"
