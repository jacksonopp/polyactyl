export type FileType = 'http' | 'config' | 'env';

export type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  fileType?: FileType;
  children?: FileEntry[];
};

export type SerializedResponse = {
  statusCode?: number;
  statusMessage?: string;
  headers: Record<string, string | string[]>;
  body: string;
  timings?: Record<string, number | undefined>;
  contentType?: {
    mimeType?: string;
    contentType?: string;
    charset?: string;
    boundary?: string;
  };
  httpVersion?: string;
  protocol?: string;
  name?: string;
  prettyPrintBody?: string;
};

export type SerializedRequest = {
  url?: string;
  method?: string;
  headers: Record<string, string | string[]>;
  body?: string;
};

export type TestResult = {
  message: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'ERROR';
  error?: {
    displayMessage?: string;
    message?: string;
    file?: string;
    line?: string;
  };
};

export type ProcessedRegion = {
  id: string;
  regionName?: string;
  duration?: number;
  disabled?: boolean;
  testResults: TestResult[];
  response: SerializedResponse | null;
  request: SerializedRequest | null;
};

export type SendArgs = {
  filePath: string;
  content?: string;
  environment?: string[];
  requestName?: string;
  requestLine?: number;
};

export type SendProgressEvent = {
  type: 'response';
  regionName?: string;
  response: SerializedResponse | null;
};

declare global {
  interface Window {
    httpyacAPI: {
      openDialog(): Promise<string | null>;
      openFileDialog(): Promise<string | null>;
      readDirectory(dirPath: string, includeEmptyDirs?: boolean): Promise<FileEntry[]>;
      readFile(filePath: string): Promise<string>;
      createFile(filePath: string, content?: string): Promise<void>;
      moveFile(sourcePath: string, targetDir: string): Promise<string>;
      deleteFile(filePath: string): Promise<void>;
      renameEntry(oldPath: string, newPath: string): Promise<string>;
      duplicateFile(filePath: string): Promise<string>;
      revealInFinder(filePath: string): Promise<void>;
      getEnvironments(filePath: string, content?: string): Promise<string[]>;
      send(args: SendArgs): Promise<ProcessedRegion[]>;
      onSendProgress(callback: (data: SendProgressEvent) => void): () => void;
      getPreference(key: string): Promise<unknown>;
      setPreference(key: string, value: unknown): Promise<void>;
      onGitBranchChanged(callback: () => void): () => void;
    };
  }
}

export {};
