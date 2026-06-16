# IPC Contract: `response:save`

New channel to save a displayed response body to a user-chosen file. Powers P4 "Save" (Copy is
non-privileged and stays in the renderer via `navigator.clipboard`).

## Direction

Renderer → Main (`invoke`/`handle`).

## Preload signature (`src/preload/index.ts` + `env.d.ts`)

```ts
saveResponseBody(body: string, suggestedName?: string): Promise<string | null>
```

## Request payload

```ts
{ body: string; suggestedName?: string }
```

`suggestedName` may be derived from the response content-type (e.g. `response.json`, `response.txt`);
optional.

## Response payload

- Resolves to the saved file path (`string`) on success.
- Resolves to `null` if the user cancels the save dialog (mirrors `file:openDialog` cancel
  semantics).

## Main behavior

- Opens `dialog.showSaveDialog` (cross-platform, Principle IV) with `defaultPath` from
  `suggestedName`.
- On confirm, writes `body` via `fs.writeFile(path, body, 'utf-8')` (same pattern as
  `file:saveFile`).
- Privileged filesystem write → MUST cross this IPC channel (Principle II). Registered in
  `ipcHandlers.ts`; PRs touching that file get extra Principle-II review.

## Caller expectations (renderer, `ResponseViewer`)

- Copy/Save actions are disabled/hidden when the active region's response body is empty (FR-017).
- Copy: `navigator.clipboard.writeText(displayedBody)` — byte-identical to what is shown (SC-006).
- Save: pass the same displayed body string; large bodies are handled off the main thread by the
  write, keeping the UI responsive (Edge Case: very large body).
