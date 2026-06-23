#!/usr/bin/env bash
# Publish the built DRAIS .deb into a signed APT repository so users can
#   sudo apt install drais   (and apt upgrade / apt remove) — the Chrome/VS Code model.
#
# Prereqs on the publishing machine (once):
#   sudo apt install aptly gnupg
#   gpg --full-generate-key            # create a signing key; note its email/ID
#
# Usage:
#   npm run dist:linux                 # builds dist/*.deb
#   GPG_KEY="you@drais.ug" ./scripts/apt-publish.sh
#
# Then host the published tree (default ~/.aptly/public) over HTTPS, e.g.:
#   rsync -a ~/.aptly/public/ user@server:/var/www/apt.drais.ug/
# and export your public key for users:
#   gpg --armor --export "$GPG_KEY" > ~/.aptly/public/key.gpg
#
# End users install once:
#   curl -fsSL https://apt.drais.ug/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/drais.gpg
#   echo "deb [signed-by=/usr/share/keyrings/drais.gpg] https://apt.drais.ug stable main" \
#       | sudo tee /etc/apt/sources.list.d/drais.list
#   sudo apt update && sudo apt install drais
# Updates: re-run this script for a new version → users `sudo apt upgrade`.
# Removal: `sudo apt remove drais` (clean, like any package).
set -euo pipefail

REPO="${APT_REPO_NAME:-drais}"
DIST="${APT_DIST:-stable}"
COMPONENT="${APT_COMPONENT:-main}"
GPG_KEY="${GPG_KEY:?Set GPG_KEY to your signing key email/ID (gpg --list-keys)}"

DEB="$(ls -t dist/*.deb 2>/dev/null | head -1 || true)"
[ -n "$DEB" ] || { echo "No .deb in dist/. Run: npm run dist:linux"; exit 1; }
echo "Publishing: $DEB"

# Create the repo on first run.
if ! aptly repo show "$REPO" >/dev/null 2>&1; then
  aptly repo create -distribution="$DIST" -component="$COMPONENT" "$REPO"
fi

# Add the package (idempotent — same version is skipped).
aptly repo add -force-replace "$REPO" "$DEB"

# First publish vs subsequent update of the same distribution.
if aptly publish list -raw 2>/dev/null | grep -q ". $DIST"; then
  aptly publish update -gpg-key="$GPG_KEY" "$DIST"
else
  aptly publish repo -gpg-key="$GPG_KEY" -distribution="$DIST" "$REPO"
fi

# Make sure the public key is downloadable next to the repo.
gpg --armor --export "$GPG_KEY" > "$HOME/.aptly/public/key.gpg" 2>/dev/null || true

echo
echo "✅ Published to ~/.aptly/public  (component: $COMPONENT, dist: $DIST)"
echo "   Serve that folder over HTTPS, then users run the install snippet in this script's header."
