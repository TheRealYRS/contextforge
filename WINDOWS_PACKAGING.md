# Packaging ContextForge as a Windows installer + GitHub release

ContextForge is a static, zero-dependency web app, so "installable on Windows" means
wrapping the exact same app (the one already live on Netlify) in a small Electron shell
that serves it locally and opens it in its own window, with a Start Menu / Desktop
shortcut and an uninstaller — produced as a single `ContextForge-Setup-x.y.z.exe`.

Nothing about the app itself changes. The Electron shell just launches the built
`dist/` folder on `http://127.0.0.1:<random free port>` (reusing the same static-file
logic as `scripts/serve.mjs`) and opens it in a native window — so the folder picker,
drag-and-drop and "Download All to Folder" all keep working exactly as they do today.

## 1. Files to add to your repository

Copy these into your `contextforge` project, preserving the paths:

```
contextforge/
├── electron/
│   ├── main.js          ← Electron entry point (new)
│   └── package.json     ← marks electron/ as CommonJS (new)
├── build/
│   └── icon.ico         ← Windows app icon, multi-resolution (new)
├── .github/
│   └── workflows/
│       └── release.yml  ← builds + publishes the installer automatically (new)
└── package.json          ← REPLACE your existing one (adds Electron scripts/config)
```

Everything else in your project (`src/`, `scripts/`, `tests/`, `index.html`,
`netlify.toml`...) stays exactly as it is. Netlify deployment is unaffected.

## 2. What changed in `package.json`

- `"main": "electron/main.js"` — tells Electron what to launch.
- New scripts:
  - `npm run electron:dev` — builds `dist/` and opens the app in an Electron window, for testing.
  - `npm run dist:win` — builds a Windows installer locally into `release/`.
  - `npm run release:win` — same, but also uploads the installer to a GitHub Release (needs a `GH_TOKEN`; the Actions workflow below does this for you automatically, so you usually won't run this one yourself).
- New `devDependencies`: `electron`, `electron-builder` (build-time only — nothing is added to the shipped app).
- New `"build"` block — electron-builder's configuration: app id, product name, the Windows/NSIS installer settings, and the icon.

## 3. One-time local setup

```bash
npm install                 # pulls in electron + electron-builder
```

Add one line to your root `.gitignore` so build output isn't committed:

```
release/
```

## 4. Test it locally first

```bash
npm run electron:dev
```

This builds `dist/` and opens ContextForge in its own desktop window. Select a project
folder, generate a package, and confirm downloads work — this is the same code path the
installed app will use.

## 5. Build the Windows installer locally (optional)

On a Windows machine with Node 20+ installed:

```bash
npm run dist:win
```

This produces `release/ContextForge-Setup-<version>.exe` — a standard NSIS installer
(lets the user pick the install folder, creates Start Menu + Desktop shortcuts, and adds
a normal Windows uninstaller entry). You can double-click it to test the install.

## 6. Automatic builds + GitHub Releases (recommended)

The included `.github/workflows/release.yml` does the whole thing for you on GitHub's
own Windows runners — no local Windows machine required:

1. Bump the version in `package.json` (e.g. `"version": "1.1.0"`) and commit it.
2. Tag the commit and push the tag:
   ```bash
   git add -A
   git commit -m "Release 1.1.0"
   git tag v1.1.0
   git push origin main
   git push origin v1.1.0
   ```
3. GitHub Actions picks up the `v1.1.0` tag, installs dependencies, runs your test
   suite, builds `dist/`, builds the NSIS installer, **creates a GitHub Release named
   `v1.1.0`**, and uploads `ContextForge-Setup-1.1.0.exe` to it automatically.
4. Watch progress under your repo's **Actions** tab. When it finishes, the release
   appears under **Releases** with the installer attached and ready to download.

No extra secrets are needed — the workflow uses the automatically provided
`GITHUB_TOKEN`, which already has permission to create releases in your own repo.

### If you'd rather trigger it without a tag
Go to **Actions → Release Windows installer → Run workflow** on GitHub — the
`workflow_dispatch` trigger lets you build an installer on demand without pushing a tag
(useful for a quick test build before a real release).

## 7. Manual release (if you don't want CI)

1. Run `npm run dist:win` on a Windows machine.
2. On GitHub: **Releases → Draft a new release**.
3. Choose/create a tag (e.g. `v1.1.0`), add a title and description.
4. Drag `release/ContextForge-Setup-1.1.0.exe` into the "Attach binaries" area.
5. Click **Publish release**.

## Notes

- **Code signing**: the installer is unsigned, so Windows SmartScreen may show an
  "unknown publisher" warning the first time someone runs it — this is expected and
  normal for a free/open-source app without a paid code-signing certificate. Users can
  click "More info → Run anyway". This doesn't affect functionality.
- **Icon**: `build/icon.ico` was generated from a new ContextForge mark (anvil +
  code-bracket motif) at 16/24/32/48/64/128/256px, matching Windows' icon requirements.
  Visual on this slide was generated with Microsoft Copilot.
- **Architecture**: the config builds a 64-bit (`x64`) installer, which covers essentially
  all Windows PCs in use today. Add `"arm64"` to the `win.target[0].arch` array in
  `package.json` if you also want an ARM64 build.
- The app has **zero runtime npm dependencies** (Electron and electron-builder are
  build-time only), so the installer is small and there's nothing extra to audit for
  security.
