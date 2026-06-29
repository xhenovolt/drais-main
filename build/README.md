# `build/` — electron-builder build resources

This directory is electron-builder's `buildResources` (see `electron-builder.yml`).

## Icons

The desktop build uses a **single source icon**: `build/icon.png` (currently
**512×512** RGBA). electron-builder generates the per-platform icons from it:

| Platform | Generated from `icon.png` | Notes |
|----------|---------------------------|-------|
| Windows  | `.ico` (installer + shortcut) | auto-generated |
| macOS    | `.icns` (app + dmg)           | auto-generated (a `.ico` is **not** valid on macOS) |
| Linux    | `.png` used directly          | needs ≥512×512 |

You do **not** need to commit `icon.ico` / `icon.icns` — they are produced at
build time. If you want pixel-perfect platform icons, you may optionally add
hand-tuned `build/icon.ico` and `build/icon.icns` and point `win.icon` /
`mac.icon` at them in `electron-builder.yml`.

> Runtime taskbar icon: `electron/main.cjs` optionally loads `build/icon.ico`
> from the packaged resources. It is absent today, so the window falls back to
> the default icon — purely cosmetic, does not affect the build.

## Other files

- `license.txt` — shown in the Windows NSIS installer (must be accepted to install).
- `.env.production.example` — template for an optional bundled default config.
  A real `build/.env.production` (gitignored — never commit secrets) is shipped
  into the installer if present on the build machine; otherwise the app reads
  `userData/drais.env` or system env at startup.
