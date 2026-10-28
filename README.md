# Courier

A lightweight, fast API client built with Rust (Tauri 2) and React. It looks and feels like a modern
Postman, but ships as a small native desktop app with the system webview instead of a bundled
Chromium.

## Features

- **Request builder** — all HTTP methods, query params, headers, body modes (JSON, text, form
  URL-encoded, multipart), and auth (Basic, Bearer, API key) with live URL resolution.
- **Response viewer** — status, timing, size, syntax-highlighted body with JSON pretty-print,
  response headers, and raw view.
- **Collections** — nested folders and requests with inline rename, duplicate, delete, and context
  menus.
- **Environments** — named variable sets with `{{baseUrl}}` style substitution, plus a global
  variable registry.
- **History** — every request you send, searchable and ready to reopen.
- **Variables everywhere** — URL, params, headers, body, auth and proxy settings all resolve against
  the selected environment.
- **Import / export** — Postman v2.1 collections, Postman environments, and full Courier workspace
  exports.
- **Code generation** — copy the current request as cURL, JavaScript, Python, or Rust.
- **Command palette** — `Ctrl + K` for every action.
- **Themes and density** — dark / light / system, five accent colors, three UI densities.
- **Local-first** — workspace, environments and history persist to a JSON file on your machine.
- **Polished shell** — resizable panes, keyboard shortcuts, toasts, and graceful error states.

## Stack

| Layer    | Technology                                             |
| -------- | ------------------------------------------------------ |
| Shell    | Tauri 2 (system WebView2 on Windows, WebKit elsewhere)  |
| Backend  | Rust — `reqwest`, `serde`, `tokio`, `tauri-plugin-dialog` |
| Frontend | React 19 + TypeScript, Vite 7                           |
| Styling  | Hand-written CSS with design tokens and `color-mix()`   |

## Development

```bash
npm install
npm run tauri dev
```

The frontend alone can be iterated on with `npm run dev`; Tauri commands are unavailable in a plain
browser, so the app falls back to sample data and surfaces request errors inline.

## Production build

```bash
npm run tauri build
```

Bundles land in `src-tauri/target/release/bundle/`. On Windows that is a per-user NSIS
installer (`Courier_<version>_x64-setup.exe`, ~1.5 MB) and an `.msi` (~2.2 MB); macOS produces
`.dmg` and Linux AppImage/deb equivalents. The standalone binary is ~4 MB.

Because the webview is provided by the OS and the Rust binary is built with LTO, `opt-level = "s"`,
stripped symbols and `panic = "abort"`, the installed footprint is a fraction of an Electron-based
client.

### Release versions

Releases are tagged by semantic-release, so CI resolves the next version *before* compiling and
stamps it into the build. The `version` job runs `scripts/next-version.mjs` (a semantic-release dry
run that publishes nothing) to resolve the version, then `scripts/set-app-version.ps1` writes it into
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock` ahead of
`tauri build`. The installer, the executable's reported version, the git tag and the NuGet package
therefore all carry one version instead of the version committed in the repository.

To reproduce a release build locally:

```powershell
./scripts/set-app-version.ps1 -Version 1.2.3
npm run tauri build
```

Pull request builds skip the stamp, so they keep reporting the committed version.

## NuGet package

Every release also publishes the standalone Windows executable to
[GitHub Packages](https://github.com/nithin554/postman-in-rust/packages) as the NuGet package
`Courier`, so it can be pulled with standard NuGet tooling instead of a browser download.

Authenticate once against the feed, then install:

```bash
dotnet nuget add source \
  --username <your-github-username> \
  --password <personal-access-token-with-read:packages> \
  --store-password-in-clear-text \
  --name github "https://nuget.pkg.github.com/nithin554/index.json"

nuget install Courier -Source github -OutputDirectory tools
```

The package unpacks to:

| Path                            | Contents                          |
| ------------------------------- | --------------------------------- |
| `tools/windows-x64/courier.exe` | Standalone Windows x64 executable |
| `LICENSE`, `README.md`          | License and project readme        |

Publishing is handled by the `publish-nuget` job in
[`.github/workflows/build.yml`](.github/workflows/build.yml), which packs the executable built by
the Windows job with the same version stamped into the binary. To build a package locally:

```powershell
./scripts/publish-nuget.ps1 -ExePath src-tauri/target/release/courier.exe -Version 0.1.0
```

Add `-Source https://nuget.pkg.github.com/nithin554/index.json` to push it; the API key defaults to
`GITHUB_TOKEN`. The script downloads the pinned NuGet CLI into `artifacts/tools` the first time it
runs.

## Keyboard shortcuts

| Action              | Shortcut       |
| ------------------- | -------------- |
| Send request        | `Ctrl + Enter` |
| Save request        | `Ctrl + S`     |
| New request         | `Ctrl + N`     |
| Close tab           | `Ctrl + W`     |
| Command palette     | `Ctrl + K`     |
| Focus URL           | `Ctrl + L`     |
| Next / previous tab | `Ctrl + Tab`   |
| Toggle sidebar      | `Ctrl + B`     |

## License

MIT — see [LICENSE](LICENSE).
