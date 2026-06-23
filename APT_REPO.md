# Ship DRAIS so users `sudo apt install drais`

Two ways to be apt-installable:

| Route | Command users run | Effort | Fit for DRAIS |
|---|---|---|---|
| **Your own signed APT repo** (Chrome / VS Code / Docker model) | add repo once → `sudo apt install drais` | low–medium, you control it | ✅ recommended |
| **Official Ubuntu/Debian archive** (LibreOffice model) | `sudo apt install drais` with nothing added | very high | ❌ needs a Debian maintainer + free-software packaging; not for a private app |

So we host our own repo. `apt upgrade` and `apt remove drais` then work exactly like any package.

## One-time setup (publishing machine)
```
sudo apt install aptly gnupg
gpg --full-generate-key          # create a signing key; remember its email/ID
```

## Each release
```
npm run dist:linux               # builds dist/DRAIS-<version>-x64.deb (version auto-bumps)
GPG_KEY="you@drais.ug" ./scripts/apt-publish.sh
```
This adds the .deb to the repo and (re)publishes a signed tree at `~/.aptly/public`.

## Host the repo (any HTTPS host: your VPS, S3+CloudFront, Cloudflare, GitHub Pages)
```
# example with a VPS at apt.drais.ug
rsync -a ~/.aptly/public/  user@server:/var/www/apt.drais.ug/
gpg --armor --export "you@drais.ug" > /var/www/apt.drais.ug/key.gpg   # if not already there
```

## What each user does once
```
curl -fsSL https://apt.drais.ug/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/drais.gpg
echo "deb [signed-by=/usr/share/keyrings/drais.gpg] https://apt.drais.ug stable main" \
  | sudo tee /etc/apt/sources.list.d/drais.list
sudo apt update && sudo apt install drais
```
- **Update:** you publish a new version → users `sudo apt update && sudo apt upgrade`.
- **Remove:** `sudo apt remove drais` (config left) or `sudo apt purge drais` (everything). electron-builder's .deb ships proper install/remove scripts, so this is clean.

## Where do I host the 200 MB files? (decision)
| Host | `snap install drais` | `apt install drais` | Direct download | Cost |
|---|---|---|---|---|
| **Snap Store (snapcraft.io)** | ✅ best, no server | — | — | free |
| **Cheap VPS** (DigitalOcean/Hetzner) | — | ✅ | ✅ | ~$4–6/mo |
| **Cloudflare R2** (static apt repo) | — | ✅ | ✅ | free tier (10 GB, free egress) |
| **GitHub Releases** | — | ❌ (not a repo) | ✅ up to 2 GB/file | free |
| **GitHub Pages** | — | ⚠️ files >100 MB blocked → no | small files only | free |
| **Google Drive** | ❌ | ❌ | ⚠️ link only | free |

Recommendation:
- **Want the easiest "install by name", free, no server → use SNAP** (below). `sudo snap install drais`, auto-updates, hosted by Canonical.
- **Want `apt install drais` specifically →** host the apt repo (this file) on a **cheap VPS** or **Cloudflare R2**. Not Drive, not GitHub Pages (too big).
- **Just want people to download & install →** **GitHub Releases**: upload the `.deb`/AppImage/`.exe`; users run `sudo apt install ./DRAIS-*.deb` or run the AppImage. Free, instant, no repo.

## Snap Store — `sudo snap install drais` (free, no server)
```
sudo snap install snapcraft --classic
npm run dist:snap                     # builds dist/drais_<version>_amd64.snap
snapcraft login
snapcraft register drais              # claims the name (once; must be free)
snapcraft upload --release=stable dist/drais_*.snap
```
Users: `sudo snap install drais` · update: automatic · remove: `sudo snap remove drais`.
Note: we set `confinement: classic` (full system access — simplest for an app that
reads local files / talks to USB biometric devices). Classic snaps need a one-time
**manual review request** on the Snapcraft forum (free) before public release; until
then test with `sudo snap install dist/drais_*.snap --dangerous --classic`.

## Notes
- `apt upgrade` only sees a new version if the .deb's version increased — our commit hook bumps `package.json`, and electron-builder uses it, so each `dist:linux` is a higher version automatically.
- The repo only distributes the same `app.asar` bundle as the raw .deb — it does **not** expose source any more than handing someone the file (asar is packed, not encrypted; secrets live in `drais.env`, never bundled).
- Want zero-infra distribution instead? Just hand out the **AppImage** (`chmod +x` and run) or the raw **.deb** (`sudo apt install ./DRAIS-*.deb`). The apt repo is only needed for the `apt install drais`-by-name + auto-update experience.
- Snap alternative: `npm run dist:snap` → publish to snapcraft.io for `sudo snap install drais`.
