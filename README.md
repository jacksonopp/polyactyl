# Polyactyl

<p align="center">
  <img src="assets/poly-full-body.png" alt="Polly the cat" width="220" />
</p>

> Meet **Polly** — the many-toed cat behind Polyactyl, a desktop HTTP client built for developers who live in `.http` files.

Polyactyl wraps the powerful [httpYac](https://httpyac.github.io/) engine in a fast, keyboard-friendly GUI. Browse your project, edit requests with syntax highlighting, fire them off, and inspect the response — all without leaving your editor workflow.

---

## Features

### File Browser
- Automatically finds `.http` and `.rest` files in any directory or project
- Toggle visibility of empty folders (hidden by default)
- Create, rename, duplicate, and delete files right from the sidebar
- Drag files between directories
- Command palette (⌘K) for quick file switching
- Remembers the last directory you had open

### Editor
- Syntax highlighting for HTTP requests, GraphQL, JSON, JavaScript, and dotenv files
- Multi-tab editing with a scrollable tab bar
- Full httpYac feature support: variables, environments, scripts, and more

### Request Runner
- Send individual requests or entire files
- Select one or more environments simultaneously
- Real-time progress updates as responses stream in

### Response Viewer
- Collapsible panels: Status · Request · Response Headers · Body · Timings · Tests
- GraphQL query highlighting in the request body
- Pretty-printed JSON responses
- Timing breakdown per request phase

---

## Getting Started

```bash
npm install
npm run dev        # start in dev / hot-reload mode
```

## Building

```bash
npm run build:mac    # macOS .dmg (arm64, x64, universal)
npm run build:win    # Windows .exe (NSIS)
npm run build:linux  # Linux .AppImage
```

---

<p align="center">
  <img src="assets/poly-shoulders-up.png" alt="Polly, up close" width="140" />
  <br/>
  <em>Polly says: happy requesting 🐾</em>
</p>
