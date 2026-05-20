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
  getPreference: (key: string): Promise<unknown> => ipcRenderer.invoke('prefs:get', { key }),
  setPreference: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('prefs:set', { key, value }),
  onGitBranchChanged: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('git:branchChanged', listener);
    return () => ipcRenderer.removeListener('git:branchChanged', listener);
  },
  gitStatus: (dirPath: string) => ipcRenderer.invoke('git:status', dirPath),
  gitBranches: (dirPath: string): Promise<string[]> => ipcRenderer.invoke('git:branches', dirPath),
  gitCheckout: (dirPath: string, branch: string): Promise<void> => ipcRenderer.invoke('git:checkout', { dirPath, branch }),
  gitCheckoutNew: (dirPath: string, branch: string): Promise<void> => ipcRenderer.invoke('git:checkoutNew', { dirPath, branch }),
  gitFetch: (dirPath: string): Promise<void> => ipcRenderer.invoke('git:fetch', dirPath),
  gitPull: (dirPath: string): Promise<void> => ipcRenderer.invoke('git:pull', dirPath),
  gitPush: (dirPath: string): Promise<void> => ipcRenderer.invoke('git:push', dirPath),
  gitPushSetUpstream: (dirPath: string): Promise<void> => ipcRenderer.invoke('git:pushSetUpstream', dirPath),
  gitStage: (dirPath: string, files: string[]): Promise<void> => ipcRenderer.invoke('git:stage', { dirPath, files }),
  gitStageAll: (dirPath: string): Promise<void> => ipcRenderer.invoke('git:stageAll', { dirPath }),
  gitCommit: (dirPath: string, message: string, push: boolean): Promise<void> => ipcRenderer.invoke('git:commit', { dirPath, message, push }),
};

contextBridge.exposeInMainWorld('httpyacAPI', api);
