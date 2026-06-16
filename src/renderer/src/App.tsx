import { useCallback, useEffect, useRef, useState } from 'react';

import { FileSidebar } from './components/FileSidebar';
import { GitStatusBar } from './components/GitStatusBar';
import { RequestEditor } from './components/RequestEditor';
import { RequestOutline } from './components/RequestOutline';
import { ResizeHandle } from './components/ResizeHandle';
import { ResponseViewer } from './components/ResponseViewer';
import { Toolbar } from './components/Toolbar';
import { useAppStore } from './store/appStore';

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 600;
const PANE_MIN = 200;

export default function App() {
  const tabs = useAppStore(state => state.tabs);
  const activeTabIndex = useAppStore(state => state.activeTabIndex);
  const setEnvironments = useAppStore(state => state.setEnvironments);
  const setRegions = useAppStore(state => state.setRegions);

  const activeTab = tabs[activeTabIndex] ?? null;

  // Panel widths — editorWidth null means 50/50 until first drag
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [outlineOpen, setOutlineOpen] = useState(true);
  // outlineOpen lives here so the RequestEditor scrollToLineRef can be wired through App
  const [editorWidth, setEditorWidth] = useState<number | null>(null);
  const editorSplitRef = useRef<HTMLDivElement>(null);
  const scrollToLineRef = useRef<((line: number) => void) | null>(null);

  const handleSidebarDrag = useCallback((delta: number) => {
    setSidebarWidth(w => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w + delta)));
  }, []);

  const handleEditorDrag = useCallback((delta: number) => {
    const totalWidth = editorSplitRef.current?.offsetWidth ?? 800;
    setEditorWidth(w => {
      const current = w ?? totalWidth / 2;
      return Math.max(PANE_MIN, Math.min(totalWidth - PANE_MIN, current + delta));
    });
  }, []);

  useEffect(() => {
    if (!activeTab) {
      setEnvironments([]);
      setRegions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const environments = await window.httpyacAPI.getEnvironments(activeTab.path, activeTab.content);
        if (!cancelled) setEnvironments(environments);
      } catch {
        if (!cancelled) setEnvironments([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTab?.path, activeTab?.content, setEnvironments, setRegions]);

  useEffect(() => {
    if (!activeTab) {
      setRegions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const regions = await window.httpyacAPI.parseRequests(activeTab.path, activeTab.content);
        if (!cancelled) setRegions(regions);
      } catch {
        if (!cancelled) setRegions([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTab?.path, activeTab?.content, setRegions]);

  return (
    <div className="app">
      <aside className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <FileSidebar />
        <div className="sidebar-requests-section">
          <button
            type="button"
            className="sidebar-section-toggle"
            onClick={() => setOutlineOpen(v => !v)}
            aria-expanded={outlineOpen}
          >
            <span className="collapsible-arrow">{outlineOpen ? '▾' : '▸'}</span>
            <span>Requests</span>
          </button>
          {outlineOpen && (
            <RequestOutline onJump={line => scrollToLineRef.current?.(line)} />
          )}
        </div>
        <GitStatusBar />
      </aside>

      <ResizeHandle onDrag={handleSidebarDrag} />

      <main className="main-area">
        <Toolbar />
        <div className="editor-response-split" ref={editorSplitRef}>
          <section
            className="editor-pane"
            style={editorWidth !== null ? { flex: 'none', width: editorWidth } : undefined}
          >
            <RequestEditor scrollToLineRef={scrollToLineRef} />
          </section>

          <ResizeHandle onDrag={handleEditorDrag} />

          <section className="response-pane">
            <ResponseViewer />
          </section>
        </div>
      </main>
    </div>
  );
}
