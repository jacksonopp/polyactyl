import { BrowserWindow, app, clipboard, dialog, ipcMain, shell } from 'electron';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';

import * as httpyac from 'httpyac';

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  fileType?: 'http' | 'config' | 'env';
  children?: FileEntry[];
}

interface OpenHttpFileArgs {
  filePath: string;
  content?: string;
}

interface SendArgs extends OpenHttpFileArgs {
  environment?: string[];
  requestName?: string;
  requestLine?: number;
}

function showMessage(
  type: 'info' | 'warning' | 'error',
  message: string,
  buttons: string[] = ['OK']
): Promise<string | undefined> {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  return dialog
    .showMessageBox(focusedWindow ?? undefined, {
      type,
      buttons,
      defaultId: 0,
      cancelId: buttons.length > 1 ? buttons.length - 1 : 0,
      message,
    })
    .then(result => buttons[result.response]);
}

function initProviders(): void {
  httpyac.cli.initFileProvider();

  httpyac.io.userInteractionProvider.isTrusted = () => true;
  httpyac.io.userInteractionProvider.showNote = async (note: string): Promise<boolean> => {
    const answer = await showMessage('info', note, ['OK', 'Cancel']);
    return answer === 'OK';
  };
  httpyac.io.userInteractionProvider.showInputPrompt = async (
    _message: string,
    defaultValue?: string,
    _maskedInput?: boolean
  ): Promise<string | undefined> => defaultValue;
  httpyac.io.userInteractionProvider.showListPrompt = async (
    _message: string,
    values: string[]
  ): Promise<string | undefined> => values[0];
  httpyac.io.userInteractionProvider.getClipboard = async () => clipboard.readText();
  httpyac.io.userInteractionProvider.setClipboard = async (message: string) => {
    clipboard.writeText(message);
  };
  httpyac.io.userInteractionProvider.showInformationMessage = (message: string, ...buttons: string[]) =>
    showMessage('info', message, buttons.length > 0 ? buttons : ['OK']);
  httpyac.io.userInteractionProvider.showWarnMessage = (message: string, ...buttons: string[]) =>
    showMessage('warning', message, buttons.length > 0 ? buttons : ['OK']);
  httpyac.io.userInteractionProvider.showErrorMessage = (message: string, ...buttons: string[]) =>
    showMessage('error', message, buttons.length > 0 ? buttons : ['OK']);
}

async function loadHttpFile(args: OpenHttpFileArgs): Promise<httpyac.HttpFile> {
  const httpFileStore = new httpyac.store.HttpFileStore();
  return httpFileStore.getOrCreate(
    args.filePath,
    async () => args.content ?? fs.readFile(args.filePath, 'utf-8'),
    Date.now(),
    { workingDir: dirname(args.filePath) }
  );
}

function normalizeHeaderValue(value: unknown): string | string[] {
  if (Array.isArray(value)) {
    return value.map(entry => String(entry));
  }
  return String(value ?? '');
}

function serializeHeaders(headers: Record<string, unknown> | undefined): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    result[key] = normalizeHeaderValue(value);
  }
  return result;
}

function serializeBody(body: unknown): string {
  if (typeof body === 'string') {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString('utf-8');
  }
  if (Array.isArray(body)) {
    // httpyac stores multi-line bodies as (string | Buffer)[] before sending
    return body
      .map(line => {
        if (typeof line === 'string') return line;
        if (Buffer.isBuffer(line)) return line.toString('utf-8');
        return '';
      })
      .join('\n');
  }
  if (body == null) {
    return '';
  }
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

function serializeResponse(response: httpyac.HttpResponse | undefined) {
  if (!response) {
    return null;
  }
  return {
    statusCode: response.statusCode,
    statusMessage: response.statusMessage,
    headers: serializeHeaders(response.headers as Record<string, unknown> | undefined),
    body: serializeBody(response.body),
    timings: response.timings,
    contentType: response.contentType,
    httpVersion: response.httpVersion,
    protocol: response.protocol,
    name: response.name,
    prettyPrintBody: response.prettyPrintBody,
  };
}

function serializeProcessedRegion(region: httpyac.ProcessedHttpRegion) {
  return {
    id: String(region.id),
    regionName: region.symbol?.name,
    duration: region.duration,
    disabled: region.disabled,
    testResults: (region.testResults ?? []).map(test => ({
      message: test.message,
      status: test.status,
      error: test.error
        ? {
            displayMessage: test.error.displayMessage,
            message: test.error.message,
            file: test.error.file,
            line: test.error.line,
          }
        : undefined,
    })),
    response: serializeResponse(region.response),
    request: region.request
      ? {
          url: region.request.url,
          method: region.request.method,
          headers: serializeHeaders(region.request.headers as Record<string, unknown> | undefined),
          body: serializeBody(region.request.body),
        }
      : null,
  };
}

const CONFIG_NAMES = new Set([
  'httpyac.config.js',
  '.httpyac.js',
  '.httpyac.json',
  'http-client.env.json',
  'http-client.private.env.json',
]);

function getFileType(name: string): 'http' | 'config' | 'env' | null {
  if (/\.(http|rest)$/iu.test(name)) return 'http';
  if (CONFIG_NAMES.has(name)) return 'config';
  if (/^\.env(\.|$)/u.test(name) || /\.env$/u.test(name)) return 'env';
  return null;
}

function hasHttpFilesInTree(entries: FileEntry[]): boolean {
  for (const entry of entries) {
    if (!entry.isDirectory && entry.fileType === 'http') return true;
    if (entry.isDirectory && entry.children && hasHttpFilesInTree(entry.children)) return true;
  }
  return false;
}

async function readDirectoryRecursive(dirPath: string, depth = 0, includeEmptyDirs = false): Promise<FileEntry[]> {
  if (depth > 5) {
    return [];
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  const directories = entries
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name));
  const files = entries
    .filter(entry => entry.isFile() && getFileType(entry.name) !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

  const childDirs: FileEntry[] = [];
  for (const entry of directories) {
    const fullPath = join(dirPath, entry.name);
    const children = await readDirectoryRecursive(fullPath, depth + 1, includeEmptyDirs);
    if (includeEmptyDirs || hasHttpFilesInTree(children)) {
      childDirs.push({ name: entry.name, path: fullPath, isDirectory: true, children });
    }
  }

  const httpFilesHere = files.filter(f => getFileType(f.name) === 'http');
  const showAllFiles = includeEmptyDirs || httpFilesHere.length > 0 || childDirs.length > 0;

  const fileEntries: FileEntry[] = showAllFiles
    ? files.map(entry => ({
        name: entry.name,
        path: join(dirPath, entry.name),
        isDirectory: false,
        fileType: getFileType(entry.name) ?? 'http',
      }))
    : [];

  return [...childDirs, ...fileEntries];
}

function handle<TArgs, TResult>(channel: string, listener: (event: Electron.IpcMainInvokeEvent, args: TArgs) => Promise<TResult> | TResult) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, listener);
}

// ── Preferences (persisted to userData/prefs.json) ────────────────────────
const prefsPath = join(app.getPath('userData'), 'prefs.json');

async function readPrefs(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(prefsPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writePrefs(prefs: Record<string, unknown>): Promise<void> {
  await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8');
}

export function registerIpcHandlers(): void {
  initProviders();

  handle<{ key: string }, unknown>('prefs:get', async ({ key }) => {
    const prefs = await readPrefs();
    return prefs[key] ?? null;
  });

  handle<{ key: string; value: unknown }, void>('prefs:set', async ({ key, value }) => {
    const prefs = await readPrefs();
    prefs[key] = value;
    await writePrefs(prefs);
  });

  handle<undefined, string | null>('file:openDialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Open HTTP Files Folder',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  handle<undefined, string | null>('file:openFileDialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Open File',
      filters: [
        { name: 'HTTP Files', extensions: ['http', 'rest'] },
        { name: 'httpYac Config', extensions: ['js', 'json'] },
        { name: 'Env Files', extensions: ['env'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  handle<string, string>('file:readFile', async (_event, filePath) => fs.readFile(filePath, 'utf-8'));

  handle<{ dirPath: string; includeEmptyDirs?: boolean }, FileEntry[]>('file:readDirectory', async (_event, args) =>
    readDirectoryRecursive(args.dirPath, 0, args.includeEmptyDirs ?? false)
  );

  handle<{ filePath: string; content?: string }, void>('file:createFile', async (_event, { filePath, content = '' }) => {
    await fs.writeFile(filePath, content, { flag: 'wx' });
  });

  handle<{ sourcePath: string; targetDir: string }, string>('file:moveFile', async (_event, { sourcePath, targetDir }) => {
    const name = sourcePath.split(/[/\\]/u).pop()!;
    const newPath = join(targetDir, name);
    await fs.rename(sourcePath, newPath);
    return newPath;
  });

  handle<string, void>('file:deleteFile', async (_event, filePath) => {
    await fs.rm(filePath, { recursive: true, force: true });
  });

  handle<{ oldPath: string; newPath: string }, string>('file:renameEntry', async (_event, { oldPath, newPath }) => {
    await fs.rename(oldPath, newPath);
    return newPath;
  });

  handle<string, string>('file:duplicateFile', async (_event, filePath) => {
    const name = filePath.split(/[/\\]/u).pop()!;
    const dir = filePath.slice(0, filePath.length - name.length - 1);
    const dotIndex = name.indexOf('.');
    const base = dotIndex === -1 ? name : name.slice(0, dotIndex);
    const ext = dotIndex === -1 ? '' : name.slice(dotIndex);

    let candidatePath = join(dir, `${base}-copy${ext}`);
    let counter = 2;
    while (true) {
      try {
        await fs.access(candidatePath);
        // File exists, try next
        candidatePath = join(dir, `${base}-copy-${counter}${ext}`);
        counter++;
      } catch {
        break; // Does not exist — use this path
      }
    }

    const content = await fs.readFile(filePath);
    await fs.writeFile(candidatePath, content, { flag: 'wx' });
    return candidatePath;
  });

  handle<string, void>('shell:revealInFinder', async (_event, filePath) => {
    shell.showItemInFolder(filePath);
  });

  handle<OpenHttpFileArgs, string[]>('http:getEnvironments', async (_event, args) => {
    try {
      const httpFile = await loadHttpFile(args);
      return await httpyac.getEnvironments({ httpFile });
    } catch {
      return [];
    }
  });

  handle<SendArgs, ReturnType<typeof serializeProcessedRegion>[]>(
    'http:send',
    async (event, { environment, requestLine, requestName, ...fileArgs }) => {
      const httpFile = await loadHttpFile(fileArgs);
      const processedHttpRegions: httpyac.ProcessedHttpRegion[] = [];

      let httpRegionPredicate: ((region: httpyac.HttpRegion) => boolean) | undefined;
      if (requestName) {
        httpRegionPredicate = region => region.symbol?.name === requestName;
      } else if (typeof requestLine === 'number') {
        httpRegionPredicate = region => {
          const start = region.symbol?.startLine ?? 0;
          const end = region.symbol?.endLine ?? start;
          return requestLine >= start && requestLine <= end;
        };
      }

      const sendContext: httpyac.HttpFileSendContext = {
        httpFile,
        activeEnvironment: environment,
        processedHttpRegions,
        httpRegionPredicate,
        logResponse: async (response, httpRegion) => {
          event.sender.send('http:send:progress', {
            type: 'response',
            regionName: httpRegion?.symbol?.name,
            response: serializeResponse(response),
          });
        },
      };

      await httpyac.send(sendContext);
      return processedHttpRegions.map(serializeProcessedRegion);
    }
  );
}
