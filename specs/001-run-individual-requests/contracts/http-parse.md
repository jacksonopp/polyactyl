# IPC Contract: `http:parse`

New channel that returns authoritative request-region metadata for a file, parsed by httpyac.
Powers the P1 inline Send affordance, P2 outline, and P3 cursor→region resolution.

## Direction

Renderer → Main (`ipcRenderer.invoke` / `ipcMain.handle`).

## Preload signature (`src/preload/index.ts` + `env.d.ts`)

```ts
parseRequests(filePath: string, content?: string): Promise<ParsedRegion[]>
```

## Request payload

```ts
{ filePath: string; content?: string }   // content = live editor buffer; falls back to disk read
```

Reuses the existing `OpenHttpFileArgs` shape and `loadHttpFile()` helper.

## Response payload

```ts
type ParsedRegion = {
  id: string;
  name?: string;
  method?: string;
  url?: string;
  startLine: number;   // 0-based, aligns with http:send requestLine predicate
  endLine: number;     // inclusive
  disabled: boolean;
  isGlobal: boolean;
};
```

Regions are returned in document order.

## Behavior & errors

- Loads the file via `httpyac.store.HttpFileStore` (same as `http:send`), maps each
  `httpFile.httpRegions[]` to a `ParsedRegion`.
- On parse failure or non-HTTP content, resolves to `[]` (mirrors `http:getEnvironments`'
  swallow-and-return-empty behavior) rather than throwing.
- Pure read: no filesystem writes, no network. Safe to call on every debounced edit.

## Caller expectations

- Renderer debounces calls on `activeTab.path`/`activeTab.content` change (~250 ms, like the
  existing env parse in `App.tsx`).
- Result stored in `appStore.regions`; consumers never re-parse independently.
