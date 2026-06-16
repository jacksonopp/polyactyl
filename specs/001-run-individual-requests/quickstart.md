# Quickstart: Run Individual Requests

Developer-facing guide to building and verifying this feature. No automated tests exist
(per constitution) — verification is manual via the running app.

## Prerequisites

```bash
npm install
npm run dev          # launches Electron with the renderer
```

Open a folder containing a multi-request `.http` file, e.g. `examples/` (created during codebase
exploration), or any file with several `###`-separated requests.

## Build gate (must pass before merge — Principle V)

```bash
npm run build        # electron-vite build; must be clean, no TS errors (strict mode)
```

## Manual verification by phase

### Phase A — P1: Run a single request inline
1. Open a file with three requests.
2. Confirm a ▶ marker appears in the gutter on each request's first line, and **not** on a
   variables-only / global region.
3. Click the ▶ above the **second** request → only that request runs; its response shows in the
   viewer (SC-001, SC-002).
4. Repeat with an **unnamed** request and two requests sharing a **name** → the one you clicked
   runs, selected by position (FR-004).
5. With unsaved edits in the buffer, run a request → it uses the live content (FR-005).
6. Whole-file Send button still runs everything (SC-007).

### Phase B — P2: Request outline
1. Open a file with many named and unnamed requests.
2. Open the outline → every request listed in order, named or `METHOD url` fallback (FR-007).
3. Click an entry → editor moves to that request (FR-008).
4. Run from the outline → only that request runs (FR-009).
5. Add/remove/rename a request in the editor → outline updates (debounced) (FR-010).

### Phase C — P3: Keyboard send + cancel
1. Put the cursor inside a request, press **Cmd/Ctrl+Enter** → that request sends (SC-004).
2. Put the cursor in file-level variables (outside any request), press the shortcut → whole file
   runs (FR-012).
3. Start a slow request, click **Cancel** → it stops, no success response recorded, UI returns to
   ready within ~2 s (SC-005). Confirm the Cancel control disappears after a normal completion.

### Phase D — P4: Export/copy response
1. Run a request that returns a body.
2. **Copy** → clipboard matches the displayed body byte-for-byte (SC-006).
3. **Save** → choose a location; saved file contents match the body.
4. Run a request with no body → Copy/Save are disabled/hidden (FR-017).

## Cross-platform check (Principle IV)

Before merge, sanity-check the keyboard shortcut (Cmd on macOS, Ctrl on Win/Linux) and the Save
dialog on at least the development OS; flag any platform-specific limitation in the PR description.
