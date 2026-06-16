# IPC Contract: `http:send` (extended) + `http:cancel`

Extends the existing `http:send` channel with a `runId` so an in-flight run can be cancelled, and
adds a new `http:cancel` channel. Powers P3 cancellation.

## `http:send` (extended)

### Direction
Renderer → Main (`invoke`/`handle`). Existing channel.

### Preload signature
```ts
send(args: SendArgs): Promise<ProcessedRegion[]>
```

### Request payload (additions in **bold**)
```ts
type SendArgs = {
  filePath: string;
  content?: string;
  environment?: string[];
  requestName?: string;
  requestLine?: number;   // single-request target (already supported)
  runId?: string;         // NEW — renderer-generated id correlating this run with http:cancel
};
```

`requestLine` / `requestName` selection is **unchanged** (existing `httpRegionPredicate`). Whole-file
send omits both (SC-007 preserved).

### Main behavior (additions)
- If `runId` is present, register it in an in-memory `Map<runId, { canceled: boolean }>` and pass a
  `progress` into the `HttpFileSendContext`:
  ```ts
  progress: {
    isCanceled: () => cancelMap.get(runId)?.canceled === true,
    register: () => () => {},
  }
  ```
- On settle (resolve, throw, or canceled), delete the `runId` entry.
- When `isCanceled()` becomes true, httpyac stops processing; the handler resolves with whatever
  regions completed but the renderer treats the run as cancelled (no success recorded) per spec.

## `http:cancel` (new)

### Direction
Renderer → Main (`invoke`/`handle`).

### Preload signature
```ts
cancelSend(runId: string): Promise<void>
```

### Request payload
```ts
{ runId: string }
```

### Main behavior
- Sets `canceled = true` for the given `runId` in the cancel map. No-op (resolves) if the `runId`
  is unknown/already settled — handles the cancel-after-complete race (Edge Case) without error.

## Caller expectations (renderer)
- Generate `runId` (`crypto.randomUUID()`) before each send; store as `activeRunId`; clear on
  settle.
- Show a Cancel control while `isSending`; clicking it calls `cancelSend(activeRunId)` and returns
  UI to ready (SC-005, < 2 s).
- Single-flight: do not start a new run while `isSending` (FR-006).
