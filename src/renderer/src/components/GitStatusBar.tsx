import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppStore } from '../store/appStore';

interface BranchPickerProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  branches: string[];
  currentBranch: string;
  onSelect: (branch: string) => void;
  onNew: (name: string) => void;
  onClose: () => void;
}

function BranchPicker({ anchorRef, branches, currentBranch, onSelect, onNew, onClose }: BranchPickerProps) {
  const [filter, setFilter] = useState('');
  const [newBranchMode, setNewBranchMode] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = branches.filter(b => b.toLowerCase().includes(filter.toLowerCase()));

  // Position the picker above/below anchor
  const [style, setStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow >= 200) {
      setStyle({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
    } else {
      setStyle({ bottom: window.innerHeight - rect.top + 4, left: rect.left, minWidth: rect.width });
    }
  }, [anchorRef]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorRef, onClose]);

  return (
    <div className="branch-picker" style={style} ref={containerRef}>
      {newBranchMode ? (
        <div className="branch-picker-new">
          <input
            ref={inputRef}
            className="branch-picker-filter"
            placeholder="New branch name…"
            value={newBranchName}
            onChange={e => setNewBranchName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newBranchName.trim()) { onNew(newBranchName.trim()); onClose(); }
              if (e.key === 'Escape') setNewBranchMode(false);
            }}
          />
          <div className="branch-picker-hint">Press Enter to create branch</div>
          <button className="branch-picker-cancel" onClick={() => setNewBranchMode(false)}>Cancel</button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            className="branch-picker-filter"
            placeholder="Filter branches…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filtered.length === 1) { onSelect(filtered[0]); onClose(); }
            }}
          />
          <ul className="branch-picker-list">
            {filtered.map(b => (
              <li
                key={b}
                className={`branch-picker-item${b === currentBranch ? ' active' : ''}`}
                onClick={() => { onSelect(b); onClose(); }}
              >
                <span className="branch-picker-icon">⑂</span>
                {b}
                {b === currentBranch && <span className="branch-picker-check">✓</span>}
              </li>
            ))}
            {filtered.length === 0 && <li className="branch-picker-empty">No branches found</li>}
          </ul>
          <button className="branch-picker-new-btn" onClick={() => { setNewBranchMode(true); setFilter(''); }}>
            + New branch
          </button>
        </>
      )}
    </div>
  );
}

interface GitCommitPanelProps {
  dirPath: string;
  status: { staged: string[]; unstaged: string[]; untracked: string[] };
  onClose: () => void;
  onRefresh: () => void;
}

function GitCommitPanel({ dirPath, status, onClose, onRefresh }: GitCommitPanelProps) {
  const [staged, setStaged] = useState<Set<string>>(() => new Set(status.staged));
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messageRef.current?.focus(); }, []);

  const allChangedFiles = Array.from(new Set([
    ...status.staged,
    ...status.unstaged,
    ...status.untracked,
  ]));

  const toggleStaged = (file: string) => {
    setStaged(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const stageAll = () => setStaged(new Set(allChangedFiles));
  const unstageAll = () => setStaged(new Set());

  const handleCommit = async (andPush: boolean) => {
    if (!message.trim()) { setError('Commit message is required'); return; }
    if (staged.size === 0) { setError('No files staged'); return; }
    setLoading(true);
    setError(null);
    try {
      await window.httpyacAPI.gitStage(dirPath, Array.from(staged));
      await window.httpyacAPI.gitCommit(dirPath, message.trim(), andPush);
      onRefresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="git-commit-overlay">
      <div className="git-commit-panel">
        <div className="git-commit-header">
          <span>Commit Changes</span>
          <button className="git-commit-close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="git-commit-files">
          <div className="git-commit-files-header">
            <span>Changes ({allChangedFiles.length})</span>
            <div className="git-commit-stage-btns">
              <button onClick={stageAll} title="Stage all">Stage all</button>
              <button onClick={unstageAll} title="Unstage all">Unstage all</button>
            </div>
          </div>
          <ul className="git-commit-file-list">
            {allChangedFiles.map(f => {
              const isStaged = staged.has(f);
              const isNew = status.untracked.includes(f);
              const isModified = status.unstaged.includes(f);
              return (
                <li key={f} className={`git-commit-file${isStaged ? ' staged' : ''}`} onClick={() => toggleStaged(f)}>
                  <input type="checkbox" checked={isStaged} onChange={() => toggleStaged(f)} onClick={e => e.stopPropagation()} />
                  <span className={`git-file-status ${isNew ? 'new' : isModified ? 'modified' : 'staged-only'}`}>
                    {isNew ? 'U' : isModified ? 'M' : 'S'}
                  </span>
                  <span className="git-commit-file-name">{f}</span>
                </li>
              );
            })}
            {allChangedFiles.length === 0 && (
              <li className="git-commit-file-empty">No changes to commit</li>
            )}
          </ul>
        </div>

        <textarea
          ref={messageRef}
          className="git-commit-message"
          placeholder="Commit message…"
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={3}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleCommit(false);
          }}
        />

        {error && <div className="git-commit-error">{error}</div>}

        <div className="git-commit-actions">
          <button
            className="git-btn git-btn-secondary"
            onClick={onClose}
            disabled={loading}
          >Cancel</button>
          <button
            className="git-btn git-btn-primary"
            onClick={() => handleCommit(false)}
            disabled={loading || !message.trim() || staged.size === 0}
          >{loading ? 'Committing…' : 'Commit'}</button>
          <button
            className="git-btn git-btn-primary"
            onClick={() => handleCommit(true)}
            disabled={loading || !message.trim() || staged.size === 0}
          >{loading ? '…' : 'Commit & Push'}</button>
        </div>
      </div>
    </div>
  );
}

export function GitStatusBar() {
  const rootDirectory = useAppStore(s => s.rootDirectory);
  const gitStatus = useAppStore(s => s.gitStatus);
  const isGitRepo = useAppStore(s => s.isGitRepo);
  const gitLoading = useAppStore(s => s.gitLoading);
  const setGitStatus = useAppStore(s => s.setGitStatus);
  const setIsGitRepo = useAppStore(s => s.setIsGitRepo);
  const setGitLoading = useAppStore(s => s.setGitLoading);

  const [branches, setBranches] = useState<string[]>([]);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [commitPanelOpen, setCommitPanelOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const branchBtnRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    if (!rootDirectory) return;
    setGitLoading(true);
    try {
      const status = await window.httpyacAPI.gitStatus(rootDirectory);
      setGitStatus(status);
      setIsGitRepo(true);
    } catch {
      setGitStatus(null);
      setIsGitRepo(false);
    } finally {
      setGitLoading(false);
    }
  }, [rootDirectory, setGitLoading, setGitStatus, setIsGitRepo]);

  useEffect(() => { refresh(); }, [refresh]);

  // Refresh git status every 30s while folder is open
  useEffect(() => {
    if (!rootDirectory) return;
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [rootDirectory, refresh]);

  // Open commit panel via custom event (from command palette)
  useEffect(() => {
    const handler = () => setCommitPanelOpen(true);
    document.addEventListener('git:open-commit-panel', handler);
    return () => document.removeEventListener('git:open-commit-panel', handler);
  }, []);

  const handleFetch = useCallback(async () => {
    if (!rootDirectory) return;
    setActionLoading('fetch');
    setActionError(null);
    try {
      await window.httpyacAPI.gitFetch(rootDirectory);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  }, [rootDirectory, refresh]);

  const handlePull = useCallback(async () => {
    if (!rootDirectory) return;
    setActionLoading('pull');
    setActionError(null);
    try {
      await window.httpyacAPI.gitPull(rootDirectory);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  }, [rootDirectory, refresh]);

  const handlePush = useCallback(async () => {
    if (!rootDirectory) return;
    setActionLoading('push');
    setActionError(null);
    try {
      try {
        await window.httpyacAPI.gitPush(rootDirectory);
      } catch {
        await window.httpyacAPI.gitPushSetUpstream(rootDirectory);
      }
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  }, [rootDirectory, refresh]);

  // Handle git actions from native menu bar
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      if (action === 'fetch') void handleFetch();
      else if (action === 'pull') void handlePull();
      else if (action === 'push') void handlePush();
    };
    document.addEventListener('git:action', handler);
    return () => document.removeEventListener('git:action', handler);
  }, [handleFetch, handlePull, handlePush]);

  if (!rootDirectory || (!isGitRepo && !gitLoading)) return null;

  const dirty = gitStatus
    ? gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length > 0
    : false;

  const handleBranchClick = async () => {
    if (!rootDirectory) return;
    try {
      const list = await window.httpyacAPI.gitBranches(rootDirectory);
      setBranches(list);
      setBranchPickerOpen(true);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCheckout = async (branch: string) => {
    if (!rootDirectory || !gitStatus || branch === gitStatus.branch) return;
    setActionLoading('checkout');
    setActionError(null);
    try {
      await window.httpyacAPI.gitCheckout(rootDirectory, branch);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleNewBranch = async (name: string) => {
    if (!rootDirectory) return;
    setActionLoading('branch');
    setActionError(null);
    try {
      await window.httpyacAPI.gitCheckoutNew(rootDirectory, name);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <>
      <div className="git-status-bar">
        {gitLoading && <span className="git-loading-dot" title="Refreshing…" />}

        <button
          ref={branchBtnRef}
          className="git-branch-btn"
          onClick={handleBranchClick}
          title={gitStatus ? `Branch: ${gitStatus.branch}` : 'Git branch'}
          disabled={actionLoading === 'checkout'}
        >
          <span className="git-branch-icon">⑂</span>
          <span className="git-branch-name">{gitStatus?.branch ?? '…'}</span>
          {dirty && <span className="git-dirty-dot" title="Uncommitted changes">●</span>}
        </button>

        {gitStatus && (
          <>
            {gitStatus.ahead > 0 && (
              <span className="git-ahead-behind" title={`${gitStatus.ahead} commit(s) ahead`}>
                ↑{gitStatus.ahead}
              </span>
            )}
            {gitStatus.behind > 0 && (
              <span className="git-ahead-behind" title={`${gitStatus.behind} commit(s) behind`}>
                ↓{gitStatus.behind}
              </span>
            )}
          </>
        )}

        <div className="git-status-actions">
          <button
            className="git-action-btn"
            onClick={handleFetch}
            disabled={!!actionLoading}
            title="Fetch"
          >{actionLoading === 'fetch' ? '…' : '⟳'}</button>

          <button
            className="git-action-btn"
            onClick={handlePull}
            disabled={!!actionLoading}
            title="Pull"
          >{actionLoading === 'pull' ? '…' : '↓'}</button>

          <button
            className="git-action-btn"
            onClick={handlePush}
            disabled={!!actionLoading}
            title="Push"
          >{actionLoading === 'push' ? '…' : '↑'}</button>

          {dirty && (
            <button
              className="git-action-btn git-action-commit"
              onClick={() => setCommitPanelOpen(true)}
              title="Commit changes"
            >Commit</button>
          )}
        </div>

        {actionError && (
          <span className="git-error-badge" title={actionError} onClick={() => setActionError(null)}>⚠ {actionError.slice(0, 40)}</span>
        )}
      </div>

      {branchPickerOpen && gitStatus && (
        <BranchPicker
          anchorRef={branchBtnRef as React.RefObject<HTMLElement | null>}
          branches={branches}
          currentBranch={gitStatus.branch}
          onSelect={handleCheckout}
          onNew={handleNewBranch}
          onClose={() => setBranchPickerOpen(false)}
        />
      )}

      {commitPanelOpen && gitStatus && rootDirectory && (
        <GitCommitPanel
          dirPath={rootDirectory}
          status={gitStatus}
          onClose={() => setCommitPanelOpen(false)}
          onRefresh={refresh}
        />
      )}
    </>
  );
}
