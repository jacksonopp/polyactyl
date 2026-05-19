import { contextBridge, ipcRenderer } from 'electron';

export type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
};

export type SendArgs = {
  filePath: string;
  content?: string;
  environment?: string[];
  requestName?: string;
  requestLine?: number;
};

const api = {
  openDialog: (): Promise<string | null> => ipcRenderer.invoke('file:openDialog'),
  openFileDialog: (): Promise<string | null> => ipcRenderer.invoke('file:openFileDialog'),
  readDirectory: (dirPath: string, includeEmptyDirs = false): Promise<FileEntry[]> =>
    ipcRenderer.invoke('file:readDirectory', { dirPath, includeEmptyDirs }),
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('file:readFile', filePath),
  createFile: (filePath: string, content?: string): Promise<void> =>
    ipcRenderer.invoke('file:createFile', { filePath, content }),
  moveFile: (sourcePath: string, targetDir: string): Promise<string> =>
    ipcRenderer.invoke('file:moveFile', { sourcePath, targetDir }),
  deleteFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('file:deleteFile', filePath),
  renameEntry: (oldPath: string, newPath: string): Promise<string> =>
    ipcRenderer.invoke('file:renameEntry', { oldPath, newPath }),
  duplicateFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('file:duplicateFile', filePath),
  revealInFinder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('shell:revealInFinder', filePath),
  getEnvironments: (filePath: string, content?: string): Promise<string[]> =>
    ipcRenderer.invoke('http:getEnvironments', { filePath, content }),
  send: (args: SendArgs): Promise<unknown[]> => ipcRenderer.invoke('http:send', args),
  onSendProgress: (callback: (data: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('http:send:progress', listener);
    return () => ipcRenderer.removeListener('http:send:progress', listener);
  },
};

contextBridge.exposeInMainWorld('httpyacAPI', api);
