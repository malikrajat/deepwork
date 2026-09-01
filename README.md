# DeepWork

A secure, lightweight, cross-platform Pomodoro & Task Management desktop app built with **Tauri 2 + Angular 21**.

## Features

- Pomodoro timer with animated circular clock
- Eisenhower Matrix for task prioritization
- Daily planner (Today's View)
- Habit tracking & journaling
- Analytics dashboard
- Glassmorphism dark UI
- SQLite local database (no cloud, no accounts)
- OS-native notifications with repeat until dismissed

---

## Prerequisites

See [SETUP.md](SETUP.md) for full platform-specific install instructions.

**Quick check:**

```bash
node --version   # v20+
cargo --version  # 1.77+
git --version    # 2.x+
```

Windows also requires **VS Build Tools** with C++ workload.

---

## Development

### Frontend only (Angular dev server)

```bash
npm run start
# Opens at http://localhost:4200
```

### Full desktop app (Tauri + Angular)

```bash
npx tauri dev
# Opens native window with hot-reload
```

---

## Building Desktop Apps

### Windows (.exe / .msi installer)

```powershell
npm run build:windows
```

Output: `src-tauri/target/release/bundle/msi/DeepWork_2.0.0_x64_en-US.msi`

Also produces a standalone `.exe` at: `src-tauri/target/release/deepwork.exe`

### macOS (.app / .dmg)

**Intel Mac:**
```bash
npm run build:mac
```

**Apple Silicon (M1/M2/M3/M4):**
```bash
rustup target add aarch64-apple-darwin
npm run build:mac-arm
```

Output:
- `src-tauri/target/release/bundle/macos/DeepWork.app`
- `src-tauri/target/release/bundle/dmg/DeepWork_2.0.0_x64.dmg`

> **Note:** Must be run on a Mac.

### Linux (.deb / .AppImage / .rpm)

```bash
npm run build:linux
```

Output:
- `src-tauri/target/release/bundle/deb/deep-work_2.0.0_amd64.deb`
- `src-tauri/target/release/bundle/appimage/deep-work_2.0.0_amd64.AppImage`

> **Note:** Must be run on Linux with system dependencies installed (see [SETUP.md](SETUP.md)).

---

## Cross-Platform Build Summary

| Platform | Command | Output Format | Run On |
|----------|---------|---------------|--------|
| Windows | `npm run build:windows` | `.msi`, `.exe` | Windows |
| macOS (Intel) | `npm run build:mac` | `.app`, `.dmg` | macOS |
| macOS (ARM) | `npm run build:mac-arm` | `.app`, `.dmg` | macOS (Apple Silicon) |
| Linux | `npm run build:linux` | `.deb`, `.AppImage` | Linux |

> Tauri does **not** support cross-compilation. You must build on the target OS (or use CI like GitHub Actions with matrix runners).

---

## Releasing a New Version

Before building a release, update the version number in **all three** of these files (they must match):

| File | Key |
|------|-----|
| [`package.json`](package.json) | `"version": "x.y.z"` |
| [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) | `"version": "x.y.z"` |
| [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml) | `version = "x.y.z"` |

> `tauri.conf.json` controls what appears in the installer and app About dialog.  
> `Cargo.toml` is used by the Rust build.  
> `package.json` is used by npm/Angular tooling.

---

## CI/CD (GitHub Actions)

To build for all platforms automatically, add a workflow with matrix strategy:

```yaml
# .github/workflows/build.yml
strategy:
  matrix:
    include:
      - os: windows-latest
      - os: macos-latest
      - os: ubuntu-latest
runs-on: ${{ matrix.os }}
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 20 }
  - uses: dtolnay/rust-toolchain@stable
  - run: npm install
  - run: npx tauri build
```

---

## Project Structure

```
src/              → Angular frontend
src-tauri/        → Rust/Tauri backend
specs/            → Feature specifications (Spec Kit)
SETUP.md          → Developer setup guide
```

---

## Guides & Best Practices

- **Documentation index:** [docs/INDEX.md](docs/INDEX.md) — central map of all docs & config files
- Angular best practices: [docs/angular-best-practices.md](docs/angular-best-practices.md)


---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Runtime | Tauri 2.x |
| Frontend | Angular 21 (Standalone Components, Signals) |
| Styling | Tailwind CSS + Glassmorphism custom tokens |
| Database | SQLite via tauri-plugin-sql |
| Notifications | tauri-plugin-notification + Web Audio API |
| State | Angular Signals + RxJS |
