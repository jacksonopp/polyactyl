import { useState } from 'react';

import type { FileEntry } from '../env';
import { useAppStore } from '../store/appStore';

function fileName(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

function directoryName(path: string): string {
  const parts = path.split(/[\\/]/u);
  parts.pop();
  return parts.join('/');
}

async function openFile(path: string, fileType?: FileEntry['fileType']): Promise<void> {
  const { openTab } = useAppStore.getState();
  const content = await window.httpyacAPI.readFile(path);
  openTab(path, content, fileType);
}

function FileTreeNode({ entry }: { entry: FileEntry }) {
  const [expanded, setExpanded] = useState(true);
  const activeTab = useAppStore(state => state.tabs[state.activeTabIndex]);

  const handleClick = async () => {
    if (entry.isDirectory) {
      setExpanded(value => !value);
      return;
    }
    await openFile(entry.path, entry.fileType);
  };

  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-item ${!entry.isDirectory && activeTab?.path === entry.path ? 'active' : ''} ${entry.fileType ? `file-type-${entry.fileType}` : ''}`}
        onClick={() => void handleClick()}
        role="button"
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void handleClick();
          }
        }}
      >
        <span className={`file-tree-icon${entry.isDirectory ? ' file-tree-arrow' : ''}`}>
          {entry.isDirectory
            ? expanded ? '▾' : '▸'
            : entry.fileType === 'config' ? '⚙'
            : entry.fileType === 'env' ? '$'
            : '●'}
        </span>
        <span className="file-tree-name">{entry.name}</span>
      </div>
      {entry.isDirectory && expanded && entry.children && (
        <div className="file-tree-children">
          {entry.children.map(child => (
            <FileTreeNode key={child.path} entry={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileSidebar() {
  const rootDirectory = useAppStore(state => state.rootDirectory);
  const fileTree = useAppStore(state => state.fileTree);
  const isLoadingDirectory = useAppStore(state => state.isLoadingDirectory);
  const setRootDirectory = useAppStore(state => state.setRootDirectory);
  const setFileTree = useAppStore(state => state.setFileTree);
  const setLoadingDirectory = useAppStore(state => state.setLoadingDirectory);
  const openTab = useAppStore(state => state.openTab);

  const handleOpenFolder = async () => {
    const selectedPath = await window.httpyacAPI.openDialog();
    if (!selectedPath) return;

    setLoadingDirectory(true);
    setRootDirectory(selectedPath);
    try {
      const tree = await window.httpyacAPI.readDirectory(selectedPath);
      setFileTree(tree);
    } finally {
      setLoadingDirectory(false);
    }
  };

  const handleOpenFile = async () => {
    const selectedPath = await window.httpyacAPI.openFileDialog();
    if (!selectedPath) return;

    const content = await window.httpyacAPI.readFile(selectedPath);
    // Infer file type from the path for individually opened files
    const name = selectedPath.split(/[\\/]/u).pop() ?? '';
    const CONFIG_NAMES = new Set(['httpyac.config.js', '.httpyac.js', '.httpyac.json', 'http-client.env.json', 'http-client.private.env.json']);
    const fileType = /\.(http|rest)$/iu.test(name)
      ? 'http' as const
      : CONFIG_NAMES.has(name)
        ? 'config' as const
        : /^\.env(\.|$)/u.test(name) || /\.env$/u.test(name)
          ? 'env' as const
          : undefined;
    openTab(selectedPath, content, fileType);
    setRootDirectory(directoryName(selectedPath));
  };

  return (
    <div className="file-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title-wrap">
          <span className="sidebar-title">HTTP files</span>
          <span className="sidebar-subtitle">
            {isLoadingDirectory
              ? 'Loading…'
              : rootDirectory
                ? fileName(rootDirectory)
                : 'No folder selected'}
          </span>
        </div>
        <div className="sidebar-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => void handleOpenFolder()}
            title="Open folder"
            disabled={isLoadingDirectory}
          >
            📁
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => void handleOpenFile()}
            title="Open file"
            disabled={isLoadingDirectory}
          >
            📄
          </button>
        </div>
      </div>

      <div className="file-tree">
        {isLoadingDirectory ? (
          <div className="sidebar-loading">
            <div className="spinner" />
            <span>Reading folder…</span>
          </div>
        ) : fileTree.length === 0 ? (
          <div className="sidebar-empty">
            <p>Open a folder to browse .http and .rest files.</p>
            <div>
              <button className="btn-primary" type="button" onClick={() => void handleOpenFolder()}>
                Open folder
              </button>
            </div>
            <button className="btn-secondary" type="button" onClick={() => void handleOpenFile()}>
              Open single file
            </button>
          </div>
        ) : (
          fileTree.map(entry => <FileTreeNode key={entry.path} entry={entry} />)
        )}
      </div>
    </div>
  );
}
