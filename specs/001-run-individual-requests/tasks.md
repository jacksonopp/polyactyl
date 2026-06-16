---

description: "Task list for Run Individual Requests feature"
---

# Tasks: Run Individual Requests

**Input**: Design documents from `/specs/001-run-individual-requests/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: No automated tests (per constitution). Manual verification via `npm run dev` / `npm run build`.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are included in all descriptions

---

## Phase 1: Setup

**Purpose**: Verify the project builds cleanly before any changes land.

- [X] T001 Verify clean TypeScript build with `npm run build` — establishes a green baseline before any changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types and Zustand store additions that all four user stories depend on.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T002 [P] Add `ParsedRegion` type to `src/renderer/src/env.d.ts` (fields: id, name?, method?, url?, startLine, endLine, disabled, isGlobal — per data-model.md and `http:parse` contract)
- [X] T003 [P] Add `regions: ParsedRegion[]` + `setRegions()` + `activeRunId: string | null` + `setActiveRunId()` slice to `src/renderer/src/store/appStore.ts`
- [X] T004 Add `http:parse` IPC handler to `src/main/ipcHandlers.ts`: load file via `httpyac.store.HttpFileStore`, map each `HttpRegion` to `ParsedRegion`, resolve to `[]` on error (never throw)
- [X] T005 Expose `parseRequests(filePath, content?)` on the preload bridge and add its TypeScript signature to `src/preload/index.ts` and `src/renderer/src/env.d.ts`

**Checkpoint**: Foundation ready — T002–T005 complete; user-story phases can now proceed.

---

## Phase 3: User Story 1 — Run a single request inline (Priority: P1) 🎯 MVP

**Goal**: A clickable ▶ gutter marker appears on each non-global request's first line; clicking it sends only that request using the existing `http:send` channel with `requestLine`.

**Independent Test**: Open a 3-request file, click the ▶ above the second request, confirm only the second request runs (SC-001, SC-002). Repeat with an unnamed request and two duplicate-named requests (FR-004). Confirm whole-file Send still works (SC-007).

- [X] T006 [US1] Add debounced `parseRequests` call on `activeTab.path`/`activeTab.content` change (~250 ms, mirroring the existing env-parse at `App.tsx:46`) that stores results in `appStore.setRegions()` in `src/renderer/src/App.tsx`
- [X] T007 [US1] Implement a CodeMirror `gutter()` extension with a `GutterMarker` ▶ widget on each non-global, non-disabled region's `startLine` in `src/renderer/src/components/RequestEditor.tsx`
- [X] T008 [US1] Wire the gutter marker click handler to `window.api.http.send({ requestLine: region.startLine, ... })`, respecting the existing `isSending` single-flight guard, in `src/renderer/src/components/RequestEditor.tsx`

**Checkpoint**: US1 complete — inline per-request send is fully functional and independently testable.

---

## Phase 4: User Story 2 — Request outline (Priority: P2)

**Goal**: A collapsible left-sidebar panel lists every request in document order. Clicking an entry scrolls the editor to it; a run button sends only that request.

**Independent Test**: Open a file with many named and unnamed requests, open the outline, confirm all entries appear in order with name or `METHOD url` fallback (`Request N` when both absent). Click an entry — editor scrolls. Click run — only that request executes. Edit the file — outline updates (FR-007 through FR-010).

- [X] T009 [P] [US2] Create `src/renderer/src/components/RequestOutline.tsx`: render a scrollable list of regions from `appStore.regions` with label logic (`name ?? \`${method} ${url}\`.trim() ?? \`Request N\``), a jump-to button, and a per-entry ▶ run button
- [X] T010 [US2] Wire the outline "jump" action: call a CodeMirror `EditorView` dispatch to scroll-to and select `region.startLine` — expose a scroll ref/callback from `RequestEditor.tsx` to `App.tsx` for the outline to consume
- [X] T011 [US2] Wire the outline "run" button to `window.api.http.send({ requestLine: region.startLine, ... })` respecting `isSending` guard in `src/renderer/src/components/RequestOutline.tsx`
- [X] T012 [US2] Mount `RequestOutline` as a collapsible left-sidebar panel in `src/renderer/src/App.tsx`, adjacent to `FileSidebar`, fed by the existing `appStore.regions` (no extra parse call needed)

**Checkpoint**: US2 complete — outline panel functional and independently testable alongside US1.

---

## Phase 5: User Story 3 — Keyboard send + cancel in-flight requests (Priority: P3)

**Goal**: Cmd/Ctrl+Enter sends the request at the cursor (falls back to whole-file). A Cancel control in the toolbar stops an in-flight run via `http:cancel` and returns the UI to ready within ~2 s.

**Independent Test**: Place cursor inside a request, press Cmd/Ctrl+Enter — that request sends (SC-004). Place cursor outside any request, press shortcut — whole file runs (FR-012). Start a slow request, click Cancel — stops within 2 s, no success recorded, Cancel control disappears (SC-005).

- [X] T013 [US3] Extend the `http:send` handler in `src/main/ipcHandlers.ts` to accept `runId?: string`; if present, register it in an in-memory `Map<runId, { canceled: boolean }>` and pass a `progress` object (`isCanceled: () => cancelMap.get(runId)?.canceled === true`) to the `HttpFileSendContext`; delete the entry on settle
- [X] T014 [US3] Register `http:cancel` IPC handler in `src/main/ipcHandlers.ts`: set `canceled = true` for the given `runId` in the cancel map; no-op if `runId` unknown (handles cancel-after-complete race)
- [X] T015 [P] [US3] Expose `cancelSend(runId: string): Promise<void>` on the preload bridge and add its TypeScript signature to `src/preload/index.ts` and `src/renderer/src/env.d.ts`
- [X] T016 [P] [US3] Add a CodeMirror `keymap` binding for Cmd/Ctrl+Enter in `src/renderer/src/components/RequestEditor.tsx`: resolve the cursor's containing region from `appStore.regions` (`startLine <= cursorLine <= endLine`); send that region with a fresh `runId`; fall back to whole-file send when cursor is outside all regions
- [X] T017 [US3] Update send flow in `src/renderer/src/store/appStore.ts` (or the component triggering send): generate `runId` via `crypto.randomUUID()` before each send, store as `activeRunId`, clear `activeRunId` on run settle (success, error, or cancel)
- [X] T018 [US3] Add a Cancel control to `src/renderer/src/components/Toolbar.tsx`: visible while `isSending && activeRunId != null`; clicking it calls `window.api.http.cancelSend(activeRunId)` and resets UI to ready

**Checkpoint**: US3 complete — keyboard send and cancel both functional and independently testable.

---

## Phase 6: User Story 4 — Export/copy response (Priority: P4)

**Goal**: After a request returns, Copy and Save buttons in the response viewer let the user copy the body to the clipboard or save it to a file. Both are disabled when there is no response body.

**Independent Test**: Run a request with a body; Copy — clipboard matches displayed body byte-for-byte (SC-006); Save — choose a path, saved file matches. Run a request with no body — Copy/Save are disabled/hidden (FR-017).

- [X] T019 [US4] Register `response:save` IPC handler in `src/main/ipcHandlers.ts`: call `dialog.showSaveDialog` with `defaultPath` from `suggestedName`, write `body` via `fs.writeFile(path, body, 'utf-8')` on confirm, return `null` if dialog is cancelled
- [X] T020 [US4] Expose `saveResponseBody(body: string, suggestedName?: string): Promise<string | null>` on the preload bridge and add its signature to `src/preload/index.ts` and `src/renderer/src/env.d.ts`
- [X] T021 [US4] Add Copy (`navigator.clipboard.writeText`) and Save (`window.api.response.saveResponseBody`) action buttons to `src/renderer/src/components/ResponseViewer.tsx`; disable/hide both when the active response body is empty or absent

**Checkpoint**: US4 complete — all four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation gate and any cross-story cleanups.

- [X] T022 [P] Verify `npm run build` is clean (zero TypeScript errors, strict mode) — required by Principle V before merge
- [X] T023 Manual end-to-end verification against every scenario in `specs/001-run-individual-requests/quickstart.md` (Phases A–D + cross-platform Cmd/Ctrl check)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational (T002–T005)
- **US2 (Phase 4)**: Depends on Foundational (T002–T005); shares regions from US1 parse infra
- **US3 (Phase 5)**: Depends on Foundational (T002–T005); reuses regions from US1 for cursor resolution
- **US4 (Phase 6)**: Depends only on Foundational; independent of US1–US3
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: No inter-story dependencies; foundational phase only
- **US2 (P2)**: Shares `appStore.regions` produced by US1's debounced parse (T006); US2 does not re-introduce parsing
- **US3 (P3)**: Reads `appStore.regions` for cursor→region resolution; shares `isSending` guard from existing store
- **US4 (P4)**: Independent of US1–US3; reads existing `ProcessedRegion.response` already in the store

### Within Each User Story

- Foundational types before IPC handlers before preload before renderer
- Store changes before components that consume the store
- IPC handler before preload exposure before renderer call-site

### Parallel Opportunities

- T002 ‖ T003 (different files — env.d.ts vs appStore.ts)
- T004 → T005 (T005 exposes what T004 registers, so sequential)
- T009 ‖ T010 (different concern areas within US2)
- T013 → T014 (T014 uses the cancel-map set up by T013)
- T015 ‖ T016 (different files — preload vs RequestEditor)

---

## Parallel Example: User Story 1

```bash
# These Foundational tasks can run in parallel:
T002: Add ParsedRegion to env.d.ts
T003: Add regions/runId slice to appStore.ts

# Then sequentially:
T004: Add http:parse IPC handler
T005: Expose parseRequests in preload

# Then US1 in order:
T006 → T007 → T008
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T005) — **critical blocker**
3. Complete Phase 3: User Story 1 (T006–T008)
4. **STOP and VALIDATE** per quickstart.md Phase A
5. Ship / demo inline per-request send

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready
2. Phase 3 (US1) → Inline gutter send → validate (MVP!)
3. Phase 4 (US2) → Outline panel → validate
4. Phase 5 (US3) → Keyboard send + cancel → validate
5. Phase 6 (US4) → Copy/Save response → validate
6. Phase 7 → Polish gate → merge

---

## Notes

- No automated tests (per constitution) — validation is manual via `npm run dev` and the quickstart.md scenarios
- [P] tasks = different files with no dependencies — safe to run concurrently
- [Story] label maps every task to a specific user story for traceability
- The `ipcHandlers.ts` file is touched in Phases 2, 5, and 6 — serialize those phases; Principle II review applies to every PR that modifies it
- Whole-file send (SC-007) must remain unchanged throughout — do not modify the existing send path, only extend it
