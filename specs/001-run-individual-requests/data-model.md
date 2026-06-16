# Phase 1 Data Model: Run Individual Requests

Entities below are TypeScript-level models that flow across IPC and live in the Zustand store.
They extend the existing types in `src/renderer/src/env.d.ts`. No persistent storage is added.

## ParsedRegion

The authoritative descriptor of one request region in the active file, produced by the new
`http:parse` IPC from httpyac's `HttpRegion`/`HttpSymbol`. Drives the gutter Send affordance
(P1), the outline (P2), and cursor→region resolution for keyboard send (P3).

| Field       | Type      | Source (httpyac)                         | Notes |
|-------------|-----------|------------------------------------------|-------|
| `id`        | `string`  | `region.id`                              | Stable per parse; React key. |
| `name`      | `string \| undefined` | `region.symbol?.name`        | Optional; absent for unnamed requests. |
| `method`    | `string \| undefined` | `region.request?.method`     | e.g. `GET`. May be undefined for global/variable regions. |
| `url`       | `string \| undefined` | `region.request?.url`        | Used in the outline fallback label. |
| `startLine` | `number`  | `region.symbol.startLine`                | 0-based, matches `http:send` line predicate. |
| `endLine`   | `number`  | `region.symbol.endLine`                  | Inclusive; used for cursor-in-region test. |
| `disabled`  | `boolean` | `!!region.metaData?.disabled`            | Disabled/commented region — no inline Send, or reported disabled if run. |
| `isGlobal`  | `boolean` | `region.isGlobal()`                      | Variables-only/global region — no inline Send affordance (Edge Case). |

**Validation / rules**
- Regions are returned in document order (httpyac yields them in order).
- The inline Send affordance is shown only when `!isGlobal` (and per FR/edge cases, suppressed or
  reported-disabled when `disabled`).
- **Outline label** (FR-007): `name` if present; otherwise `` `${method ?? ''} ${url ?? ''}`.trim() ``
  falling back to `Request N` when both are empty.
- **Cursor→region** (FR-011): the region whose `startLine <= cursorLine <= endLine`; if none,
  whole-file send (FR-012).
- **Target by line** (FR-002/FR-004): inline/outline/keyboard run passes the region's `startLine`
  as `http:send.requestLine`, disambiguating duplicate names by position rather than name match.

## RunHandle / Run state

Tracks the in-flight send so it can be cancelled (P3) and so single-flight is enforced (FR-006).

| Field        | Type                  | Notes |
|--------------|-----------------------|-------|
| `runId`      | `string`              | Renderer-generated (e.g. `crypto.randomUUID()`); passed to `http:send`, used by `http:cancel`. |
| `isSending`  | `boolean` (existing)  | Existing store flag; the single-flight guard. |
| `canCancel`  | `boolean` (derived)   | True while a run is in flight and not yet settled. |

**Lifecycle**
1. A run starts → generate `runId`, set `isSending = true`, store `runId`.
2. Main registers `runId` in a cancel-flag map and passes a `progress.isCanceled` reading it.
3. Run settles via success, error, or cancel → clear `runId`, set `isSending = false`; main
   deletes the `runId` map entry (no leak, per research R4).
- Cancel after completion (race) is a no-op: the `runId` is already gone; UI stays consistent
  (Edge Case).

## Store slice additions (`appStore.ts`)

```
regions: ParsedRegion[]              // current parsed regions for the active file
setRegions(regions): void
activeRunId: string | null           // in-flight run id (null when idle)
setActiveRunId(id: string | null): void
```

`isSending`, `processedRegions`, `activeRegionIndex`, and `lastError` already exist and are
reused. `regions` is recomputed by the debounced parse whenever the active tab's path/content
changes; cleared to `[]` when no tab is active or the file is non-HTTP.

## Response export model (P4)

No new entity. Copy/Save operate on the **already-serialized** body of the active
`ProcessedRegion.response` (`SerializedResponse.body` / `prettyPrintBody`) as displayed in
`ResponseViewer`. Actions are disabled when that body is empty (FR-017). Save passes the body
string and a suggested filename to the `response:save` IPC.
