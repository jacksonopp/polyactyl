# Implementation Plan: Run Individual Requests

**Branch**: `001-run-individual-requests` | **Date**: 2026-06-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-run-individual-requests/spec.md`

## Summary

Let users run exactly one request from a multi-request `.http`/`.rest` file instead of
the whole file, navigate between requests via an outline, send the request at the cursor
from the keyboard, cancel an in-flight request, and copy/save a response body. The
single-request execution backend already exists (`http:send` accepts `requestName` /
`requestLine` and builds an `httpRegionPredicate`). The work is delivered as four phased,
independently shippable slices (P1→P4) that progressively add a new authoritative
**parse** IPC, gutter Send affordances, a request outline, a keyboard shortcut, mid-flight
cancellation, and response export.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict mode, all three tsconfig targets)

**Primary Dependencies**: Electron 31, React 18, Zustand 5, CodeMirror 6 (`@codemirror/state`,
`@codemirror/view`), httpyac 6.16 (request execution + parsing)

**Storage**: Local files only; user preferences in `userData/prefs.json` (existing). No new storage.

**Testing**: No automated suite (per constitution); manual verification via `npm run dev`.

**Target Platform**: macOS, Windows, Linux desktop (electron-builder, all three on every release)

**Project Type**: Electron desktop app — `src/main` (privileged), `src/preload` (bridge),
`src/renderer` (React UI)

**Performance Goals**: Outline jump in a 25+ request file < 5 s (SC-003); cancel returns UI to
ready < 2 s (SC-005); parse round-trip imperceptible while typing (debounced, like the existing
250 ms env-parse in `App.tsx`).

**Constraints**: All privileged operations (parse, send, cancel, response export) MUST cross an
explicit IPC channel; renderer stays sandboxed (`nodeIntegration` off, `contextIsolation` on).
Whole-file send MUST remain available and unchanged (SC-007).

**Scale/Scope**: Single active file at a time; outline scope is the active file only. Touches
~3 main/preload files and ~5 renderer files; adds one Zustand slice for region metadata + run state.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Type Safety First** | PASS. New IPC payloads, the parsed-region model, and the cancel/run-state store slice are fully typed. No `any`/`!`/`@ts-ignore`. httpyac's `Progress`, `HttpRegion`, and `HttpSymbol` types are already shipped in `node_modules/httpyac/dist/models`. |
| **II. Process Isolation & IPC Security** | PASS. Three new privileged operations — `http:parse` (httpyac parse), `http:cancel` (signal a run), and `response:save` (file dialog + write) — are each registered in `src/main/ipcHandlers.ts` and exposed via the preload bridge. No new renderer filesystem/Node access. Clipboard copy uses the renderer's `navigator.clipboard` (no privilege boundary). PRs touching `ipcHandlers.ts` get extra Principle-II scrutiny. |
| **III. Local-First, Offline-Capable** | PASS. No backend, account, or telemetry introduced. All parsing and execution stay local through httpyac. |
| **IV. Cross-Platform Parity** | PASS. Keyboard send uses `metaKey || ctrlKey` (mirrors existing Cmd/Ctrl+S handler). Response save uses Electron's cross-platform `dialog.showSaveDialog`. Gutter affordance is pure CodeMirror, OS-agnostic. |
| **V. Continuous Release Discipline** | PASS. Work stays on this feature branch; each phase builds cleanly (`npm run build`) and is manually verified before merge. Phases are independently shippable, so a half-built later phase never blocks `main`. |

**Result**: No violations. Complexity Tracking table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-run-individual-requests/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (IPC channel contracts)
│   ├── http-parse.md
│   ├── http-send-cancel.md
│   └── response-save.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── ipcHandlers.ts        # + http:parse, http:cancel, response:save handlers;
│   │                         #   thread `progress.isCanceled` into the http:send context
│   └── index.ts              # (unchanged) BrowserWindow / security config
├── preload/
│   └── index.ts              # + parseRequests(), cancelSend(), saveResponseBody(); runId on send()
└── renderer/
    └── src/
        ├── env.d.ts          # + ParsedRegion, parse/cancel/save signatures on httpyacAPI
        ├── store/
        │   └── appStore.ts   # + region metadata slice, runId/cancel state, single-flight guard
        ├── components/
        │   ├── RequestEditor.tsx     # + CodeMirror gutter Send markers; Cmd/Ctrl+Enter keymap
        │   ├── Toolbar.tsx           # + Cancel control; reuse run-single + whole-file send
        │   ├── RequestOutline.tsx    # NEW: list of regions, jump + run-from-outline (P2)
        │   └── ResponseViewer.tsx    # + Copy/Save body actions (P4)
        └── App.tsx           # debounced parse-on-content-change; mount RequestOutline
```

**Structure Decision**: Existing Electron three-process layout (`src/main`, `src/preload`,
`src/renderer`) is kept as-is per Principle II. New privileged capabilities are added as IPC
handlers in the single `ipcHandlers.ts`, surfaced through the existing preload `api` object, and
consumed by renderer components and one new Zustand slice. No new top-level directories.

## Phased Delivery

Each phase is an independently shippable slice mapped to a user story in the spec.

- **Phase A — P1: Run a single request inline (MVP).** Add `http:parse` IPC returning
  authoritative region metadata (id, name, method, url, start/end line, disabled, isGlobal).
  Add a debounced parse-on-edit in the renderer that stores regions in Zustand. Render a
  CodeMirror gutter ▶ marker on each non-global region's first line; clicking it calls the
  existing `http:send` with that region's `requestLine`, against the current environment and live
  content, honoring the existing single-flight (`isSending`) guard.
- **Phase B — P2: Request outline.** New `RequestOutline` component driven by the same stored
  regions: lists every region in document order with name or `METHOD url` fallback, clicking an
  entry moves the editor to its `startLine`, and a run action sends just that region. Stays in
  sync via the same debounced parse.
- **Phase C — P3: Keyboard send + cancel.** CodeMirror keymap binds Cmd/Ctrl+Enter to send the
  region containing the cursor (fallback: whole-file send when the cursor is outside any region).
  Thread a `runId` through `http:send` and add `http:cancel`; main supplies a `progress` whose
  `isCanceled()` flips when a cancel for that `runId` arrives. Toolbar shows a Cancel control while
  sending and returns to ready on cancel.
- **Phase D — P4: Export/copy response.** Add Copy (renderer clipboard) and Save (`response:save`
  IPC → `dialog.showSaveDialog` + write) actions in `ResponseViewer`, disabled when the active
  region has no body.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
