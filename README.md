# Polyactl

A desktop HTTP client built on [httpYac](https://httpyac.github.io/), with a GUI for browsing, editing, and sending `.http` request files.

## Features

- Browse directories for `.http` / `.rest` files (respects monorepo structure — only shows folders that contain HTTP files)
- Open multiple files as tabs
- Syntax-highlighted editor (HTTP requests, JavaScript, JSON, dotenv)
- View and edit httpYac config files (`.httpyac.js`, `httpyac.config.js`, `.env`, etc.)
- Select multiple environments simultaneously
- Response viewer with status, headers, pretty-printed body, and timings
- Resizable panels

## Getting Started

```bash
npm install
npm run dev        # start in dev/hot-reload mode
```

## Build

```bash
npm run build:mac    # macOS .dmg
npm run build:win    # Windows .exe (NSIS)
npm run build:linux  # Linux .AppImage
```
