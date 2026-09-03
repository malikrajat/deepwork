# DeepWork — Developer Setup Guide

## Windows

### 1. Node.js (v20+)

```powershell
winget install OpenJS.NodeJS.LTS
```

### 2. Git

```powershell
winget install Git.Git
```

### 3. Rust

Download and run [rustup-init.exe](https://win.rustup.rs/x86_64):

```powershell
Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "$env:TEMP\rustup-init.exe"
& "$env:TEMP\rustup-init.exe" -y
```

Restart your terminal after install.

### 4. Visual Studio Build Tools (C++ workload)

Download [vs_BuildTools.exe](https://aka.ms/vs/17/release/vs_BuildTools.exe) and run:

```powershell
vs_BuildTools.exe --wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended
```

This installs the MSVC linker and Windows SDK (~3-5 GB).

### 5. VS Code

```powershell
winget install Microsoft.VisualStudioCode
```

---

## macOS

### 1. Xcode Command Line Tools

```bash
xcode-select --install
```

### 2. Node.js (v20+)

```bash
brew install node@20
```

### 3. Git

Included with Xcode CLT. Or: `brew install git`

### 4. Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 5. VS Code

```bash
brew install --cask visual-studio-code
```

---

## Linux (Ubuntu/Debian)

### 1. System dependencies (for Tauri)

```bash
sudo apt update
sudo apt install -y build-essential curl wget file \
  libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf
```

### 2. Node.js (v20+)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Git

```bash
sudo apt install -y git
```

### 4. Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

### 5. VS Code

```bash
sudo snap install code --classic
```

---

## After installing prerequisites (all platforms)

```bash
# Clone the repo
git clone <your-repo-url>
cd pomodoro

# Install npm dependencies
npm install

# Verify Angular builds
npx ng build

# Run the full Tauri desktop app
npx tauri dev
```

---

## Optional: Spec Kit workflow tools

```bash
# Python 3.10+
# Windows: winget install Python.Python.3.12
# macOS: brew install python@3.12
# Linux: sudo apt install python3 python3-pip

# uv (fast Python package manager)
pip install uv

# Specify CLI
uv tool install specify-cli
```

---

## Verify everything works

| Check | Command | Expected |
|-------|---------|----------|
| Node | `node --version` | v20+ |
| npm | `npm --version` | 10+ |
| Rust | `rustc --version` | 1.77+ |
| Cargo | `cargo --version` | 1.77+ |

---

## Debugging the Tauri Desktop App

### Enable DevTools (F12 / Ctrl+Shift+I)

DevTools are controlled by two things:

**1. Cargo feature** in `src-tauri/Cargo.toml`:
```toml
tauri = { version = "2.11.2", features = ["tray-icon", "devtools"] }
```

**2. Window config** in `src-tauri/tauri.conf.json`:
```json
"windows": [{
  "devtools": true
}]
```

Both must be set for DevTools to work in **release** builds. In **debug** builds (`--debug` flag), DevTools are always available regardless of config.

### Build Commands

| Command | Description |
|---------|-------------|
| `npm run tauri:dev` | Dev mode with hot-reload + DevTools |
| `npm run tauri:build:debug` | Debug release build (DevTools enabled, unoptimized) |
| `npm run build:windows` | Production release (needs `devtools: true` + feature for DevTools) |
| `npm run build:windows -- --debug` | Windows debug build (faster compile, DevTools auto-enabled) |

### Quick Debug Workflow

```bash
# Fastest way to test with DevTools (no Rust optimization, fast compile):
npm run build:windows -- --debug

# The installer will be at:
# src-tauri/target/x86_64-pc-windows-msvc/debug/bundle/nsis/DeepWork_2.0.0_x64-setup.exe
```

### Toggle DevTools for Release Builds

To **enable** DevTools in production:
1. Set `"devtools": true` in `src-tauri/tauri.conf.json` (window config)
2. Ensure `"devtools"` feature is in `src-tauri/Cargo.toml` (already added)
3. Rebuild: `npm run build:windows`

To **disable** for final distribution:
1. Set `"devtools": false` in `src-tauri/tauri.conf.json`
2. Optionally remove `"devtools"` from Cargo.toml features
3. Rebuild

### What You Can Do in DevTools

- **F12** or **Ctrl+Shift+I** — Open DevTools
- **Elements** tab — Inspect DOM, check CSS (borders, layout, colors)
- **Console** tab — View errors, logs, Angular messages
- **Network** tab — Check if fonts/resources are loading
- **Application** tab — Inspect local storage, SQLite data

### Common Debug Scenarios

**CSP blocking resources:**
Look for "Content Security Policy" errors in Console. Fix in `src-tauri/tauri.conf.json` → `app.security.csp` (currently set to `null` = no restrictions).

**SQL permission errors:**
Check `src-tauri/capabilities/default.json` has the needed permissions:
```json
"permissions": ["core:default", "sql:default", "sql:allow-execute", "sql:allow-select", ...]
```

**CSS not loading:**
Ensure `.postcssrc.json` exists in project root (not `postcss.config.js`) and `angular.json` has `"inlineCritical": false` in production optimization.

**Git Bash PATH issue (cargo not found):**
```bash
export PATH="$HOME/.cargo/bin:$PATH"
```
| Git | `git --version` | 2.x |
| Angular | `npx ng version` | 21.x |
| Tauri | `npx tauri --version` | 2.x |
