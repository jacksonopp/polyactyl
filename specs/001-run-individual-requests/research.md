# Phase 0 Research: Run Individual Requests

All "NEEDS CLARIFICATION" items were resolved during planning (interactive Q&A + codebase
verification). This document records the decisions and their grounding in the existing code and
the httpyac API.

## R1. How to determine request region boundaries (inline Send + outline)

- **Decision**: Add a new authoritative `http:parse` IPC backed by httpyac's `HttpFileStore`,
  returning a list of region descriptors (id, name, method, url, startLine, endLine, disabled,
  isGlobal). The renderer calls it debounced on content change (mirroring the existing 250 ms
  env-parse in `App.tsx:46`) and stores results in Zustand.
- **Rationale**: httpyac is already the single source of truth for "what is a request" — it powers
  `http:send`'s `httpRegionPredicate`. Parsing with the same engine guarantees the inline
  affordance, outline, and cursor-resolution agree exactly with what `send` will execute,
  including edge cases the spec calls out: unnamed requests, duplicate names (disambiguated by
  line), disabled/commented regions (`isGlobal()` / `metaData.disabled`), and the variables-only
  global region. A renderer-side regex would risk diverging from httpyac on exactly these cases.
- **Alternatives considered**:
  - *Renderer regex on `###` separators*: instant and zero-IPC, but re-implements httpyac's
    parser and drifts on disabled regions / duplicate names — rejected for correctness (FR-004).
  - *Hybrid (regex placement + parse reconcile)*: most robust but most code; the debounced parse is
    already fast enough that the pure-IPC path meets the "imperceptible while typing" bar without
    the extra complexity.
- **Grounding**: `httpyac.store.HttpFileStore` is already used in `loadHttpFile()`
  (`ipcHandlers.ts:131`). `HttpRegion.symbol` (`HttpSymbol`) exposes `name`, `startLine`,
  `endLine`; `HttpRegion.request` carries `method`/`url` post-parse; `isGlobal()` flags the
  variables-only region; `metaData` carries `disabled`.

## R2. Inline Send affordance UI in CodeMirror

- **Decision**: A clickable ▶ marker in the CodeMirror **gutter** on each non-global region's
  first line (VS Code REST Client style), implemented with `@codemirror/view` `GutterMarker` +
  `gutter()` (or line-decoration with a widget in the line-number gutter).
- **Rationale**: A gutter marker does not insert text rows or shift document offsets, so it stays
  trivially aligned as the user types and request boundaries move (Edge Case: "boundaries shift as
  the user types"). It coexists with the existing `lineNumbers()` gutter and the custom HTTP
  syntax `ViewPlugin` without competing for inline space.
- **Alternatives considered**: A full-width block widget rendered above each request matches the
  spec's "directly above" wording more literally, but inserts visual rows, complicates offset math
  during edits, and is heavier to keep in sync. Rejected in favor of the lighter gutter marker;
  "directly above"/"above each request" is satisfied by the marker sitting on the request's first
  line.

## R3. Keyboard shortcut for "send request at cursor"

- **Decision**: Bind **Cmd/Ctrl+Enter** via a CodeMirror `keymap` to send the region containing
  the primary cursor; if the cursor is outside any region, fall back to whole-file send (FR-012).
- **Rationale**: Modifier+Enter is the established REST-client convention and does not collide with
  the existing Cmd/Ctrl+S save handler (`RequestEditor.tsx:371`). Resolving the target uses the
  same line→region mapping as `http:send`'s line predicate (`ipcHandlers.ts:486`), so keyboard and
  click target identically.
- **Alternatives considered**: Cmd/Ctrl+Shift+Enter — unnecessary extra modifier; no conflict
  exists to avoid.

## R4. Mid-flight cancellation of a request

- **Decision**: Thread a renderer-generated `runId` into `http:send`. In the main handler, build a
  httpyac `progress` object whose `isCanceled()` returns a per-run flag; add an `http:cancel`
  channel that sets that flag for a given `runId`. On the renderer, a Cancel control sends
  `http:cancel` and resets UI to ready.
- **Rationale**: `HttpFileSendContext` already accepts `progress?: Progress`, and `Progress`
  exposes `isCanceled: () => boolean` (`node_modules/httpyac/dist/models/processorContext.d.ts:12`).
  httpyac polls `isCanceled` between/within processing steps, so this is the engine's first-class,
  supported cancellation hook — no socket-level abort plumbing required. The user-visible contract
  from the spec (UI ready, no successful response recorded) is met by resolving/short-circuiting the
  `send` once canceled and not committing its regions as a success.
- **Alternatives considered**: Aborting the underlying socket directly — httpyac owns the request
  client; reaching past it would violate the "reuse existing execution engine" assumption and risk
  inconsistent state. Rejected.
- **Note**: A `runId` map in main must be cleaned up when a run settles (success, error, or cancel)
  to avoid leaks; see data-model "Run state".

## R5. Response export (copy / save)

- **Decision**: **Copy** uses the renderer's `navigator.clipboard.writeText` on the displayed body
  (already used for "Copy Path" in `RequestEditor.tsx:296`). **Save** adds a `response:save` IPC
  that opens `dialog.showSaveDialog` and writes the body via `fs.writeFile`. Both actions are
  disabled when the active region has no body (FR-017).
- **Rationale**: Copy is non-privileged and already works in the renderer. Saving to an arbitrary
  path is a privileged filesystem write and MUST cross IPC (Principle II), consistent with the
  existing `file:saveFile` pattern (`ipcHandlers.ts:415`). Suggesting a default filename/extension
  from the response content-type is a nicety, not required by the spec.
- **Alternatives considered**: Reusing `file:saveFile` directly — it takes a known path and has no
  dialog; the export flow needs a Save dialog, so a dedicated channel is clearer.

## R6. Single-flight / overlapping runs

- **Decision**: Reuse the existing `isSending` store flag as the single-flight guard for both
  inline and keyboard sends; affordances are disabled while a run is in flight (FR-006). No queue.
- **Rationale**: Matches the spec's "consistent with the app's existing single-send behavior" and
  the current `Toolbar.handleSend` guard (`Toolbar.tsx:17`). A queue is explicitly out of scope.
