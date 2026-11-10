#!/usr/bin/env bash
# Builds the macOS app (arm64 and x64) on this Mac and adds it to the release of a tag, like the macOS job of the release
# workflow would with MAC_BUILD=github. For when GitHub has no macOS runner free: set the repository variable MAC_BUILD to
# "local" (or leave it unset), so the workflow leaves its macOS job out. Usage: scripts/release-mac.sh v0.2.1   (run from a clean checkout of that tag)
set -euo pipefail

die() { echo "release-mac: $*" >&2; exit 1; }

tag="${1:-}"
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "usage: scripts/release-mac.sh v<major>.<minor>.<patch>"
[ "$(uname)" = Darwin ] || die "this builds the macOS app, so it has to run on a Mac"
command -v gh > /dev/null || die "the GitHub CLI (gh) is needed"
cd "$(dirname "$0")/.."

repo="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
git diff --quiet && git diff --cached --quiet || die "uncommitted changes: build from a clean checkout"
[ "$(git rev-parse HEAD)" = "$(git rev-parse "$tag^{commit}" 2> /dev/null || echo none)" ] || die "check out the tag first: git checkout $tag"
[ "v$(node -p "require('./package.json').version")" = "$tag" ] || die "the version in package.json is not $tag"
gh release view "$tag" --repo "$repo" > /dev/null 2>&1 || die "no release for $tag in $repo yet (the workflow creates the draft)"

npm ci
npm run typecheck
npm test

rm -rf release
# The store and the update check of the app are built from this variable, as in the workflow
GITHUB_REPOSITORY="$repo" CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist

shopt -s nullglob
files=(release/*-mac-arm64.dmg release/*-mac-x64.dmg release/*.dmg.blockmap release/latest-mac.yml)
[ -f release/latest-mac.yml ] && [ "${#files[@]}" -ge 5 ] || die "expected two dmg files, their blockmaps and latest-mac.yml in release/"

# SHA256SUMS.txt: keep the lines of the other systems, replace the ones for macOS
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
gh release download "$tag" --repo "$repo" --pattern SHA256SUMS.txt --dir "$work" 2> /dev/null || : > "$work/SHA256SUMS.txt"
grep -v -e '-mac-' -e 'latest-mac\.yml' "$work/SHA256SUMS.txt" > "$work/old.txt" || true
(cd release && shasum -a 256 "${files[@]#release/}") > "$work/mac.txt"
cat "$work/old.txt" "$work/mac.txt" | LC_ALL=C sort -k2 > "$work/SHA256SUMS.txt"

gh release upload "$tag" "${files[@]}" "$work/SHA256SUMS.txt" --repo "$repo" --clobber
echo "Added to $tag:"; printf '  %s\n' "${files[@]#release/}"
