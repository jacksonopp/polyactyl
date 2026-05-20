import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

import type { FileEntry } from '../env';
import { useAppStore } from '../store/appStore';

// ── Helpers ──────────────────────────────────────────

function fileBaseName(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

function dirName(path: string): string {
  const parts = path.split(/[\\/]/u);
  parts.pop();
  return parts.join('/');
}

function joinPath(dir: string, name: string): string {
  return dir.replace(/[\\/]+$/u, '') + '/' + name;
}

const CONFIG_NAMES = new Set([
  'httpyac.config.js',
  '.httpyac.js',
  '.httpyac.json',
  'http-client.env.json',
  'http-client.private.env.json',
]);

function inferFileType(name: string): FileEntry['fileType'] | undefined {
  if (/\.(http|rest)$/iu.test(name)) return 'http';
  if (CONFIG_NAMES.has(name)) return 'config';
  if (/^\.env(\.|$)/u.test(name) || /\.env$/u.test(name)) return 'env';
  return undefined;
}

const QUICK_EXTENSIONS = ['.http', '.rest', '.env', '.httpyac.json'];

// Client-side filter: remove dirs with no HTTP files anywhere in their subtree.
function hasHttpInTree(entries: FileEntry[]): boolean {
  return entries.some(e =>
    e.isDirectory ? (e.children ? hasHttpInTree(e.children) : false) : e.fileType === 'http'
  );
}

function filterToHttpDirs(entries: FileEntry[]): FileEntry[] {
  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory) {
      result.push(entry);
    } else {
      const filteredChildren = filterToHttpDirs(entry.children ?? []);
      if (hasHttpInTree(filteredChildren)) {
        result.push({ ...entry, children: filteredChildren });
      }
    }
  }
  return result;
}

// Flatten tree to a list of all file (non-directory) entries.
function flattenTree(entries: FileEntry[], out: FileEntry[] = []): FileEntry[] {
  for (const e of entries) {
    if (e.isDirectory) {
      flattenTree(e.children ?? [], out);
    } else {
      out.push(e);
    }
  }
  return out;
}

// Return relative path from rootDir, or the full path if outside.
function relativePath(filePath: string, rootDir: string): string {
  if (filePath.startsWith(rootDir)) {
    return filePath.slice(rootDir.length).replace(/^[\\/]/u, '');
  }
  return filePath;
}

// Sort dirs before files, then alphabetically within each group.
function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Insert a new file entry into the in-memory tree without a filesystem re-read.
function insertFileIntoTree(
  entries: FileEntry[],
  parentPath: string,
  rootPath: string,
  newEntry: FileEntry
): FileEntry[] {
  if (parentPath === rootPath) {
    return sortEntries([...entries, newEntry]);
  }
  return entries.map(entry => {
    if (!entry.isDirectory) return entry;
    if (entry.path === parentPath) {
      return { ...entry, children: sortEntries([...(entry.children ?? []), newEntry]) };
    }
    if (entry.children) {
      return {
        ...entry,
        children: insertFileIntoTree(entry.children, parentPath, rootPath, newEntry),
      };
    }
    return entry;
  });
}

// Remove a file entry from the in-memory tree by path.
function removeFileFromTree(entries: FileEntry[], targetPath: string): FileEntry[] {
  return entries
    .filter(e => e.path !== targetPath)
    .map(e =>
      e.isDirectory && e.children
        ? { ...e, children: removeFileFromTree(e.children, targetPath) }
        : e
    );
}

// Update all child paths when a directory is renamed.
function updateChildPaths(entries: FileEntry[], oldPrefix: string, newPrefix: string): FileEntry[] {
  return entries.map(entry => {
    const newPath = newPrefix + entry.path.slice(oldPrefix.length);
    if (entry.isDirectory) {
      return { ...entry, path: newPath, children: updateChildPaths(entry.children ?? [], oldPrefix, newPrefix) };
    }
    return { ...entry, path: newPath };
  });
}

// Rename an entry in the in-memory tree.
function renameEntryInTree(entries: FileEntry[], oldPath: string, newName: string, newPath: string): FileEntry[] {
  return entries.map(entry => {
    if (entry.path === oldPath) {
      if (entry.isDirectory) {
        return { ...entry, name: newName, path: newPath, children: updateChildPaths(entry.children ?? [], oldPath, newPath) };
      }
      return { ...entry, name: newName, path: newPath };
    }
    if (entry.isDirectory && entry.children) {
      return { ...entry, children: renameEntryInTree(entry.children, oldPath, newName, newPath) };
    }
    return entry;
  });
}

// Insert a duplicate entry (already has its path resolved) adjacent to the original.
function insertDuplicateInTree(entries: FileEntry[], originalPath: string, newEntry: FileEntry): FileEntry[] {
  const topLevel = entries.some(e => e.path === originalPath);
  if (topLevel) {
    return sortEntries([...entries, newEntry]);
  }
  return entries.map(entry => {
    if (!entry.isDirectory || !entry.children) return entry;
    if (entry.children.some(c => c.path === originalPath)) {
      return { ...entry, children: sortEntries([...entry.children, newEntry]) };
    }
    return { ...entry, children: insertDuplicateInTree(entry.children, originalPath, newEntry) };
  });
}

// ── FileTree context ──────────────────────────────────

interface FileTreeContextValue {
  onCreateFile: (dirPath: string) => void;
  onDeleteFile: (filePath: string, isDirectory?: boolean) => Promise<void>;
  onMoveFile: (sourcePath: string, targetDir: string) => Promise<void>;
  onRenameEntry: (filePath: string, isDirectory: boolean, newName: string) => Promise<void>;
  onDuplicateFile: (filePath: string) => Promise<void>;
  onRevealInFinder: (filePath: string) => Promise<void>;
  draggingPath: string | null;
  setDraggingPath: (path: string | null) => void;
}

const FileTreeContext = createContext<FileTreeContextValue>({
  onCreateFile: () => {},
  onDeleteFile: async () => {},
  onMoveFile: async () => {},
  onRenameEntry: async () => {},
  onDuplicateFile: async () => {},
  onRevealInFinder: async () => {},
  draggingPath: null,
  setDraggingPath: () => {},
});

// ── NewFileModal ──────────────────────────────────────

interface NewFileModalProps {
  dirPath: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  error?: string | null;
}

function NewFileModal({ dirPath, onConfirm, onCancel, error }: NewFileModalProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  const applyExtension = (ext: string) => {
    setName(prev => {
      const base = prev.replace(/\.[^.]*$/u, '') || 'new-file';
      return base + ext;
    });
    inputRef.current?.focus();
  };

  return ReactDOM.createPortal(
    <div
      className="new-file-modal-overlay"
      onKeyDown={e => e.key === 'Escape' && onCancel()}
    >
      <div className="new-file-modal">
        <div className="new-file-modal-header">
          New file
          <span className="new-file-modal-dir">{dirPath}</span>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="new-file-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="filename.http"
          />
          <div className="new-file-ext-row" style={{ marginTop: 10 }}>
            {QUICK_EXTENSIONS.map(ext => (
              <button key={ext} type="button" className="new-file-ext-btn" onClick={() => applyExtension(ext)}>
                {ext}
              </button>
            ))}
          </div>
          {error && <div className="new-file-error" style={{ marginTop: 10 }}>{error}</div>}
          <div className="new-file-actions" style={{ marginTop: 14 }}>
            <button type="submit" className="btn-primary" disabled={!name.trim()}>
              Create
            </button>
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── ContextMenu ───────────────────────────────────────

type ContextMenuItem =
  | { separator: true }
  | { separator?: false; label: string; icon: string; danger?: boolean; onClick: () => void };

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; visible: boolean }>({
    top: y,
    left: x,
    visible: false,
  });

  // After first render, measure the menu and flip if it would overflow the viewport.
  useEffect(() => {
    if (!ref.current) return;
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      top: y + h > vh ? Math.max(0, y - h) : y,
      left: x + w > vw ? Math.max(0, x - w) : x,
      visible: true,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      ref={ref}
      className="context-menu"
      style={{ top: pos.top, left: pos.left, visibility: pos.visible ? 'visible' : 'hidden' }}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="context-menu-separator" />
        ) : (
          <button
            key={item.label}
            className={`context-menu-item${item.danger ? ' context-menu-item-danger' : ''}`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            <span className="context-menu-icon">{item.icon}</span>
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body
  );
}

// ── FileTreeNode ──────────────────────────────────────

function FileTreeNode({ entry }: { entry: FileEntry }) {
  const [expanded, setExpanded] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const activeTab = useAppStore(state => state.tabs[state.activeTabIndex]);
  const { onCreateFile, onDeleteFile, onMoveFile, onRenameEntry, onDuplicateFile, onRevealInFinder, draggingPath, setDraggingPath } = useContext(FileTreeContext);

  const isActive = !entry.isDirectory && activeTab?.path === entry.path;
  const itemRef = useRef<HTMLDivElement>(null);
  const wasActiveRef = useRef(false);

  // Scroll into view when this file transitions from inactive → active.
  useEffect(() => {
    if (isActive && !wasActiveRef.current && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  // Focus rename input when rename mode begins.
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const handleClick = async () => {
    if (entry.isDirectory) {
      setExpanded(v => !v);
      return;
    }
    const { openTab } = useAppStore.getState();
    const content = await window.httpyacAPI.readFile(entry.path);
    openTab(entry.path, content, entry.fileType);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const startRename = () => {
    setRenameValue(entry.name);
    setIsRenaming(true);
  };

  const contextMenuItems: ContextMenuItem[] = entry.isDirectory
    ? [
        { label: 'New file here', icon: '✦', onClick: () => onCreateFile(entry.path) },
        { label: 'Rename', icon: '✎', onClick: startRename },
        { separator: true },
        { label: 'Copy Path', icon: '⎘', onClick: () => void navigator.clipboard.writeText(entry.path) },
        { label: 'Show in Finder', icon: '◎', onClick: () => void onRevealInFinder(entry.path) },
        { separator: true },
        { label: 'Delete folder', icon: '✕', danger: true, onClick: () => void onDeleteFile(entry.path, true) },
      ]
    : [
        { label: 'Rename', icon: '✎', onClick: startRename },
        { label: 'Duplicate', icon: '⧉', onClick: () => void onDuplicateFile(entry.path) },
        { separator: true },
        { label: 'Copy Path', icon: '⎘', onClick: () => void navigator.clipboard.writeText(entry.path) },
        { label: 'Show in Finder', icon: '◎', onClick: () => void onRevealInFinder(entry.path) },
        { separator: true },
        { label: 'Delete file', icon: '✕', danger: true, onClick: () => void onDeleteFile(entry.path, false) },
      ];

  const handleDragStart = (e: React.DragEvent) => {
    if (entry.isDirectory) return;
    e.dataTransfer.setData('text/plain', entry.path);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingPath(entry.path);
  };

  const handleDragEnd = () => {
    setDraggingPath(null);
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!entry.isDirectory || !draggingPath) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!entry.isDirectory) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const sourcePath = e.dataTransfer.getData('text/plain');
    setDraggingPath(null);
    if (!sourcePath) return;
    const currentParent = dirName(sourcePath);
    if (currentParent === entry.path) return;
    await onMoveFile(sourcePath, entry.path);
  };

  const isBeingDragged = draggingPath === entry.path;

  return (
    <div className="file-tree-node">
      <div
        ref={itemRef}
        className={[
          'file-tree-item',
          isActive ? 'active' : '',
          entry.fileType ? `file-type-${entry.fileType}` : '',
          isDragOver ? 'drag-over' : '',
          isBeingDragged ? 'dragging' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => { if (!isRenaming) void handleClick(); }}
        onContextMenu={handleContextMenu}
        role="button"
        tabIndex={0}
        draggable={!entry.isDirectory}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={e => void handleDrop(e)}
        onKeyDown={e => {
          if (isRenaming) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void handleClick();
          }
          if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            void onDeleteFile(entry.path, entry.isDirectory);
          }
          if (e.key === 'F2') {
            e.preventDefault();
            startRename();
          }
        }}
      >
        <span className={`file-tree-icon${entry.isDirectory ? ' file-tree-arrow' : ''}`}>
          {entry.isDirectory
            ? expanded
              ? '▾'
              : '▸'
            : entry.fileType === 'config'
              ? '⚙'
              : entry.fileType === 'env'
                ? '$'
                : '●'}
        </span>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="rename-input"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onClick={e => e.stopPropagation()}
            onBlur={() => {
              // Small delay so Enter keydown fires before blur
              setTimeout(() => setIsRenaming(false), 50);
            }}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                const trimmed = renameValue.trim();
                setIsRenaming(false);
                if (trimmed && trimmed !== entry.name) {
                  void onRenameEntry(entry.path, entry.isDirectory, trimmed);
                }
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setIsRenaming(false);
              }
            }}
          />
        ) : (
          <span className="file-tree-name">{entry.name}</span>
        )}
      </div>
      {entry.isDirectory && expanded && entry.children && (
        <div className="file-tree-children">
          {entry.children.map(child => (
            <FileTreeNode key={child.path} entry={child} />
          ))}
        </div>
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ── CommandPalette ────────────────────────────────────

type FileItem = { kind: 'file'; entry: FileEntry };
type ActionItem = { kind: 'action'; id: string; label: string; description?: string; icon?: string; run: () => void };
type PaletteItem = FileItem | ActionItem;

interface CommandPaletteProps {
  files: FileEntry[];
  rootDir: string | null;
  onOpen: (entry: FileEntry) => void;
  onClose: () => void;
  gitActions?: ActionItem[];
  initialQuery?: string;
}

function CommandPalette({ files, rootDir, onOpen, onClose, gitActions = [], initialQuery = '' }: CommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo((): PaletteItem[] => {
    const q = query.toLowerCase();
    // Git actions first if query starts with '>'
    const showGitOnly = q.startsWith('>');
    const gitQ = showGitOnly ? q.slice(1).trim() : q;

    const matchedActions: ActionItem[] = gitActions
      .filter(a =>
        !gitQ ||
        a.label.toLowerCase().includes(gitQ) ||
        (a.description?.toLowerCase().includes(gitQ) ?? false)
      )
      .map(a => ({ kind: 'action', ...a } as ActionItem));

    if (showGitOnly) {
      return matchedActions.slice(0, 50);
    }

    const nameHits = files.filter(f => f.name.toLowerCase().includes(q));
    const pathOnly = files.filter(f => !f.name.toLowerCase().includes(q) && f.path.toLowerCase().includes(q));
    const fileItems: FileItem[] = [...nameHits, ...pathOnly].slice(0, 50).map(e => ({ kind: 'file', entry: e }));

    return [...matchedActions, ...fileItems].slice(0, 50);
  }, [files, query, gitActions]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleActivate = (item: PaletteItem) => {
    if (item.kind === 'file') { onOpen(item.entry); }
    else { item.run(); onClose(); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const item = filtered[selectedIndex];
      if (item) handleActivate(item);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return ReactDOM.createPortal(
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="cmd-palette-search">
          <span className="cmd-palette-search-icon">⌕</span>
          <input
            ref={inputRef}
            className="cmd-palette-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search files… (⌘⇧P for commands)"
          />
          <kbd className="cmd-palette-esc">Esc</kbd>
        </div>
        <div className="cmd-palette-results">
          {filtered.length === 0 ? (
            <div className="cmd-palette-empty">No results for "{query}"</div>
          ) : (
            filtered.map((item, i) => {
              if (item.kind === 'action') {
                return (
                  <div
                    key={item.id}
                    ref={i === selectedIndex ? selectedRef : undefined}
                    className={`cmd-palette-item cmd-palette-action${i === selectedIndex ? ' selected' : ''}`}
                    onClick={() => handleActivate(item)}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <span className="cmd-palette-icon cmd-palette-action-icon">{item.icon ?? '⚡'}</span>
                    <span className="cmd-palette-text">
                      <span className="cmd-palette-name">{item.label}</span>
                      {item.description && <span className="cmd-palette-path">{item.description}</span>}
                    </span>
                  </div>
                );
              }
              const file = item.entry;
              return (
                <div
                  key={file.path}
                  ref={i === selectedIndex ? selectedRef : undefined}
                  className={`cmd-palette-item${i === selectedIndex ? ' selected' : ''}`}
                  onClick={() => handleActivate(item)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className={`cmd-palette-icon file-type-${file.fileType ?? 'http'}`}>
                    {file.fileType === 'config' ? '⚙' : file.fileType === 'env' ? '$' : '●'}
                  </span>
                  <span className="cmd-palette-text">
                    <span className="cmd-palette-name">{file.name}</span>
                    <span className="cmd-palette-path">
                      {rootDir ? relativePath(file.path, rootDir) : file.path}
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>
        <div className="cmd-palette-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open / run</span>
          <span><kbd>&gt;</kbd> commands</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── BranchSwitchPalette ───────────────────────────────

function BranchSwitchPalette({ dirPath, onClose }: { dirPath: string; onClose: () => void }) {
  const [branches, setBranches] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const gitStatus = useAppStore(s => s.gitStatus);
  const setGitStatus = useAppStore(s => s.setGitStatus);
  const setIsGitRepo = useAppStore(s => s.setIsGitRepo);
  const setGitLoading = useAppStore(s => s.setGitLoading);

  useEffect(() => {
    window.httpyacAPI.gitBranches(dirPath)
      .then(list => { setBranches(list); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dirPath]);

  useEffect(() => { inputRef.current?.focus(); }, [loading]);

  const filtered = useMemo(() =>
    branches.filter(b => b.toLowerCase().includes(filter.toLowerCase())),
    [branches, filter]
  );

  useEffect(() => { setSelectedIndex(0); }, [filter]);
  useEffect(() => { selectedRef.current?.scrollIntoView({ block: 'nearest' }); }, [selectedIndex]);

  const handleCheckout = async (branch: string) => {
    if (branch === gitStatus?.branch) { onClose(); return; }
    setGitLoading(true);
    try {
      await window.httpyacAPI.gitCheckout(dirPath, branch);
      const status = await window.httpyacAPI.gitStatus(dirPath);
      setGitStatus(status);
      setIsGitRepo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGitLoading(false);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && filtered[selectedIndex]) void handleCheckout(filtered[selectedIndex]);
    else if (e.key === 'Escape') onClose();
  };

  return ReactDOM.createPortal(
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="cmd-palette-search">
          <span className="cmd-palette-search-icon">⑂</span>
          <input
            ref={inputRef}
            className="cmd-palette-input"
            placeholder="Switch to branch…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <kbd className="cmd-palette-esc">Esc</kbd>
        </div>
        <div className="cmd-palette-results">
          {loading && <div className="cmd-palette-empty">Loading branches…</div>}
          {error && <div className="cmd-palette-empty">Error: {error}</div>}
          {!loading && filtered.map((b, i) => (
            <div
              key={b}
              ref={i === selectedIndex ? selectedRef : undefined}
              className={`cmd-palette-item${i === selectedIndex ? ' selected' : ''}`}
              onClick={() => void handleCheckout(b)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="cmd-palette-icon cmd-palette-action-icon">⑂</span>
              <span className="cmd-palette-text">
                <span className="cmd-palette-name">{b}</span>
                {b === gitStatus?.branch && <span className="cmd-palette-path">current</span>}
              </span>
            </div>
          ))}
          {!loading && filtered.length === 0 && <div className="cmd-palette-empty">No branches match</div>}
        </div>
        <div className="cmd-palette-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> switch</span>
          <span><kbd>Esc</kbd> cancel</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── FileSidebar ───────────────────────────────────────

export function FileSidebar() {
  const rootDirectory = useAppStore(state => state.rootDirectory);
  const fileTree = useAppStore(state => state.fileTree);
  const isLoadingDirectory = useAppStore(state => state.isLoadingDirectory);
  const showEmptyDirs = useAppStore(state => state.showEmptyDirs);
  const setRootDirectory = useAppStore(state => state.setRootDirectory);
  const setFileTree = useAppStore(state => state.setFileTree);
  const setLoadingDirectory = useAppStore(state => state.setLoadingDirectory);
  const setShowEmptyDirs = useAppStore(state => state.setShowEmptyDirs);
  const openTab = useAppStore(state => state.openTab);
  const updateTabPath = useAppStore(state => state.updateTabPath);

  const tabs = useAppStore(state => state.tabs);
  const closeTabByPath = useAppStore(state => state.closeTabByPath);
  const closeTabsUnderPath = useAppStore(state => state.closeTabsUnderPath);

  const gitStatus = useAppStore(state => state.gitStatus);
  const isGitRepo = useAppStore(state => state.isGitRepo);
  const setGitStatus = useAppStore(state => state.setGitStatus);
  const setIsGitRepo = useAppStore(state => state.setIsGitRepo);
  const setGitLoading = useAppStore(state => state.setGitLoading);

  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [newFileModalDir, setNewFileModalDir] = useState<string | null>(null);
  const [newFileError, setNewFileError] = useState<string | null>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] = useState('');

  const refreshGitStatus = useCallback(async (dir: string) => {
    setGitLoading(true);
    try {
      const status = await window.httpyacAPI.gitStatus(dir);
      setGitStatus(status);
      setIsGitRepo(true);
    } catch {
      setGitStatus(null);
      setIsGitRepo(false);
    } finally {
      setGitLoading(false);
    }
  }, [setGitStatus, setIsGitRepo, setGitLoading]);

  // Always load the FULL tree (includeEmptyDirs: true).
  // Client-side filtering via useMemo makes the show/hide toggle instant.
  const doRefreshTree = useCallback(
    async (dir: string) => {
      setLoadingDirectory(true);
      try {
        const tree = await window.httpyacAPI.readDirectory(dir, true);
        setFileTree(tree);
      } finally {
        setLoadingDirectory(false);
      }
    },
    [setFileTree, setLoadingDirectory]
  );

  // Restore last opened directory on mount.
  useEffect(() => {
    if (rootDirectory) return; // already set (e.g. hot-reload)
    window.httpyacAPI.getPreference('lastDirectory').then(saved => {
      if (typeof saved === 'string' && saved) {
        setRootDirectory(saved);
        doRefreshTree(saved);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter the raw tree client-side based on the toggle — no filesystem re-read.
  const displayTree = useMemo(
    () => (showEmptyDirs ? fileTree : filterToHttpDirs(fileTree)),
    [fileTree, showEmptyDirs]
  );

  // Flat list of all files for the command palette (uses raw tree to include all files).
  const allFiles = useMemo(() => flattenTree(fileTree), [fileTree]);

  // Global Cmd+P / Ctrl+P → command palette (files)
  // Cmd+Shift+P / Ctrl+Shift+P → command palette in actions mode (prefilled with >)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const modKey = e.metaKey || e.ctrlKey;
      if (modKey && e.key === 'p' && e.shiftKey) {
        e.preventDefault();
        setCommandPaletteInitialQuery('>');
        setShowCommandPalette(true);
      } else if (modKey && e.key === 'p' && !e.shiftKey) {
        e.preventDefault();
        setCommandPaletteInitialQuery('');
        setShowCommandPalette(true);
      } else if (modKey && e.key === 'k') {
        // Keep Cmd+K as alias for files palette
        e.preventDefault();
        setCommandPaletteInitialQuery('');
        setShowCommandPalette(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Refresh tree when git branch changes (e.g. checkout).
  // Also close any open tabs whose files no longer exist on the new branch.
  useEffect(() => {
    const unsub = window.httpyacAPI.onGitBranchChanged(async () => {
      if (!rootDirectory) return;
      setLoadingDirectory(true);
      try {
        const tree = await window.httpyacAPI.readDirectory(rootDirectory, true);
        setFileTree(tree);
        // Build set of all file paths in the new tree
        const existingPaths = new Set<string>();
        const collect = (entries: typeof tree) => {
          for (const e of entries) {
            if (!e.isDirectory) existingPaths.add(e.path);
            if (e.children) collect(e.children);
          }
        };
        collect(tree);
        // Close tabs that no longer exist
        for (const tab of tabs) {
          if (!existingPaths.has(tab.path)) {
            closeTabByPath(tab.path);
          }
        }
      } finally {
        setLoadingDirectory(false);
      }
    });
    return unsub;
  }, [rootDirectory, tabs, closeTabByPath, setFileTree, setLoadingDirectory]);

  const handleOpenFolder = async () => {
    const selectedPath = await window.httpyacAPI.openDialog();
    if (!selectedPath) return;
    setRootDirectory(selectedPath);
    window.httpyacAPI.setPreference('lastDirectory', selectedPath);
    await doRefreshTree(selectedPath);
  };

  const handleOpenFile = async () => {
    const selectedPath = await window.httpyacAPI.openFileDialog();
    if (!selectedPath) return;
    const content = await window.httpyacAPI.readFile(selectedPath);
    const name = fileBaseName(selectedPath);
    openTab(selectedPath, content, inferFileType(name));
    const dir = dirName(selectedPath);
    setRootDirectory(dir);
    window.httpyacAPI.setPreference('lastDirectory', dir);
  };

  const handleNewFile = useCallback((dirPath: string) => {
    setNewFileError(null);
    setNewFileModalDir(dirPath);
  }, []);

  const handleDeleteFile = useCallback(
    async (filePath: string, isDirectory = false) => {
      const label = fileBaseName(filePath);
      const message = isDirectory
        ? `Delete folder "${label}" and all its contents?\n\nThis cannot be undone.`
        : `Delete "${label}"?\n\nThis cannot be undone.`;
      if (!window.confirm(message)) return;
      try {
        await window.httpyacAPI.deleteFile(filePath);
        const current = useAppStore.getState().fileTree;
        setFileTree(removeFileFromTree(current, filePath));
        if (isDirectory) {
          closeTabsUnderPath(filePath);
        } else {
          closeTabByPath(filePath);
        }
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    },
    [setFileTree, closeTabByPath, closeTabsUnderPath]
  );

  const handleNewFileConfirm = async (name: string) => {
    if (!newFileModalDir) return;
    const filePath = joinPath(newFileModalDir, name);
    try {
      await window.httpyacAPI.createFile(filePath);
      setNewFileModalDir(null);
      setNewFileError(null);

      // Insert the new entry directly into the in-memory tree — no filesystem re-read.
      const fileType = inferFileType(name);
      const newEntry: FileEntry = { name, path: filePath, isDirectory: false, fileType };
      if (rootDirectory) {
        const current = useAppStore.getState().fileTree;
        setFileTree(insertFileIntoTree(current, newFileModalDir, rootDirectory, newEntry));
      }

      const content = await window.httpyacAPI.readFile(filePath);
      openTab(filePath, content, fileType);
    } catch (err) {
      setNewFileError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCommandPaletteOpen = async (entry: FileEntry) => {
    setShowCommandPalette(false);
    const content = await window.httpyacAPI.readFile(entry.path);
    openTab(entry.path, content, entry.fileType);
  };

  const handleMoveFile = useCallback(
    async (sourcePath: string, targetDir: string) => {
      try {
        const newPath = await window.httpyacAPI.moveFile(sourcePath, targetDir);
        updateTabPath(sourcePath, newPath);
        if (rootDirectory) await doRefreshTree(rootDirectory);
      } catch (err) {
        console.error('Failed to move file:', err);
      }
    },
    [rootDirectory, doRefreshTree, updateTabPath]
  );

  const updateTabsUnderPath = useAppStore(state => state.updateTabsUnderPath);

  const handleRenameEntry = useCallback(
    async (filePath: string, isDirectory: boolean, newName: string) => {
      const parentDir = dirName(filePath);
      const newPath = joinPath(parentDir, newName);
      try {
        await window.httpyacAPI.renameEntry(filePath, newPath);
        const current = useAppStore.getState().fileTree;
        setFileTree(renameEntryInTree(current, filePath, newName, newPath));
        if (isDirectory) {
          updateTabsUnderPath(filePath, newPath);
        } else {
          updateTabPath(filePath, newPath);
        }
      } catch (err) {
        console.error('Failed to rename:', err);
      }
    },
    [setFileTree, updateTabPath, updateTabsUnderPath]
  );

  const handleDuplicateFile = useCallback(
    async (filePath: string) => {
      try {
        const newPath = await window.httpyacAPI.duplicateFile(filePath);
        const newName = fileBaseName(newPath);
        const fileType = inferFileType(newName);
        const newEntry: FileEntry = { name: newName, path: newPath, isDirectory: false, fileType };
        const current = useAppStore.getState().fileTree;
        setFileTree(insertDuplicateInTree(current, filePath, newEntry));
      } catch (err) {
        console.error('Failed to duplicate:', err);
      }
    },
    [setFileTree]
  );

  const handleRevealInFinder = useCallback(async (filePath: string) => {
    await window.httpyacAPI.revealInFinder(filePath);
  }, []);

  const treeContextValue = useMemo<FileTreeContextValue>(
    () => ({
      onCreateFile: handleNewFile,
      onDeleteFile: handleDeleteFile,
      onMoveFile: handleMoveFile,
      onRenameEntry: handleRenameEntry,
      onDuplicateFile: handleDuplicateFile,
      onRevealInFinder: handleRevealInFinder,
      draggingPath,
      setDraggingPath,
    }),
    [handleNewFile, handleDeleteFile, handleMoveFile, handleRenameEntry, handleDuplicateFile, handleRevealInFinder, draggingPath]
  );

  const [sidebarMenu, setSidebarMenu] = useState<{ x: number; y: number } | null>(null);
  const [paletteBranchAction, setPaletteBranchAction] = useState(false);

  const sidebarMenuItems: ContextMenuItem[] = [
    { label: 'Open folder…', icon: '📁', onClick: () => void handleOpenFolder() },
    { label: 'Open file…', icon: '📄', onClick: () => void handleOpenFile() },
    { separator: true },
    {
      label: showEmptyDirs ? 'Hide empty folders' : 'Show empty folders',
      icon: showEmptyDirs ? '◉' : '◎',
      onClick: () => setShowEmptyDirs(!showEmptyDirs),
    },
  ];

  const gitPaletteActions = useMemo<ActionItem[]>(() => {
    if (!isGitRepo || !rootDirectory) return [];
    const dir = rootDirectory;
    const actions: ActionItem[] = [
      {
        kind: 'action',
        id: 'git-switch-branch',
        label: 'Git: Switch Branch',
        description: gitStatus ? `Current: ${gitStatus.branch}` : undefined,
        icon: '⑂',
        run: () => {
          setShowCommandPalette(false);
          setPaletteBranchAction(true);
        },
      },
      {
        kind: 'action',
        id: 'git-fetch',
        label: 'Git: Fetch',
        description: 'Fetch latest from remote',
        icon: '⟳',
        run: async () => {
          try { await window.httpyacAPI.gitFetch(dir); await refreshGitStatus(dir); }
          catch (e) { console.error('git fetch failed', e); }
        },
      },
      {
        kind: 'action',
        id: 'git-pull',
        label: 'Git: Pull',
        description: 'Pull latest changes from remote',
        icon: '↓',
        run: async () => {
          try { await window.httpyacAPI.gitPull(dir); await refreshGitStatus(dir); }
          catch (e) { console.error('git pull failed', e); }
        },
      },
      {
        kind: 'action',
        id: 'git-push',
        label: 'Git: Push',
        description: 'Push local commits to remote',
        icon: '↑',
        run: async () => {
          try {
            try { await window.httpyacAPI.gitPush(dir); }
            catch { await window.httpyacAPI.gitPushSetUpstream(dir); }
            await refreshGitStatus(dir);
          } catch (e) { console.error('git push failed', e); }
        },
      },
      {
        kind: 'action',
        id: 'git-commit',
        label: 'Git: Commit',
        description: 'Stage & commit changes',
        icon: '✓',
        run: () => {
          document.dispatchEvent(new CustomEvent('git:open-commit-panel'));
        },
      },
    ];
    return actions;
  }, [isGitRepo, rootDirectory, gitStatus, refreshGitStatus]);

  return (
    <FileTreeContext.Provider value={treeContextValue}>
      <div className="file-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-actions">
            <button
              className="icon-button"
              type="button"
              title="More actions"
              onClick={e => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setSidebarMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
            >
              ⋮
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => rootDirectory && handleNewFile(rootDirectory)}
              title="New file"
              disabled={isLoadingDirectory || !rootDirectory}
            >
              +
            </button>
          </div>
          <span className="sidebar-folder-name" title={rootDirectory ?? undefined}>
            {isLoadingDirectory ? 'Loading…' : rootDirectory ? fileBaseName(rootDirectory) : 'No folder open'}
          </span>
          <div className="sidebar-actions-right">
            <button
              className="icon-button"
              type="button"
              onClick={() => setShowCommandPalette(true)}
              title="Search files (⌘K)"
              disabled={allFiles.length === 0}
            >
              ⌕
            </button>
          </div>
        </div>

        <div className="file-tree">
          {isLoadingDirectory ? (
            <div className="sidebar-loading">
              <div className="spinner" />
              <span>Reading folder…</span>
            </div>
          ) : displayTree.length === 0 ? (
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
            displayTree.map(entry => <FileTreeNode key={entry.path} entry={entry} />)
          )}
        </div>

        {newFileModalDir && (
          <NewFileModal
            dirPath={newFileModalDir}
            onConfirm={name => void handleNewFileConfirm(name)}
            onCancel={() => {
              setNewFileModalDir(null);
              setNewFileError(null);
            }}
            error={newFileError}
          />
        )}

        {showCommandPalette && (
          <CommandPalette
            files={allFiles}
            rootDir={rootDirectory}
            onOpen={entry => void handleCommandPaletteOpen(entry)}
            onClose={() => setShowCommandPalette(false)}
            gitActions={gitPaletteActions}
            initialQuery={commandPaletteInitialQuery}
          />
        )}

        {paletteBranchAction && rootDirectory && (
          <BranchSwitchPalette
            dirPath={rootDirectory}
            onClose={() => setPaletteBranchAction(false)}
          />
        )}

        {sidebarMenu && (
          <ContextMenu
            x={sidebarMenu.x}
            y={sidebarMenu.y}
            items={sidebarMenuItems}
            onClose={() => setSidebarMenu(null)}
          />
        )}
      </div>
    </FileTreeContext.Provider>
  );
}
