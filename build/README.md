# `build/` — electron-builder build resources

This directory is electron-builder's `buildResources` (see `electron-builder.yml`).

## Icons

Source icon: `build/icon.png` (**512×512** RGBA). Windows uses the committed
multi-resolution `build/icon.ico`; macOS/Linux are generated from the PNG.

| Platform | Icon used | Notes |
|----------|-----------|-------|
| Windows  | `build/icon.ico` (committed) | installer + shortcut (`win.icon`) AND runtime window/taskbar (`electron/main.cjs`) |
| macOS    | `.icns` from `icon.png`      | auto-generated (a `.ico` is **not** valid on macOS) |
| Linux    | `build/icon.png`            | used directly, needs ≥512×512 |

**`build/icon.ico` is committed** (16/32/48/128 px). It is what fixed the
"Windows app shows the Electron logo" bug: `electron/main.cjs` loads it for the
window/taskbar, and `win.icon` points at it for the installer/shortcut — so the
whole Windows experience is DRAIS-branded and consistent. Regenerate it after
changing `icon.png`:

```
npx png-to-ico public/icons/icon-16x16.png public/icons/icon-32x32.png \
  public/icons/icon-48x48.png public/icons/icon-128x128.png build/icon.png > build/icon.ico
```

## Other files

- `license.txt` — shown in the Windows NSIS installer (must be accepted to install).
- `.env.production.example` — template for an optional bundled default config.
  A real `build/.env.production` (gitignored — never commit secrets) is shipped
  into the installer if present on the build machine; otherwise the app reads
  `userData/drais.env` or system env at startup.
