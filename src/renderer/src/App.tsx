import { useCallback, useEffect, useRef, useState } from 'react';

import { FileSidebar } from './components/FileSidebar';
import { GitStatusBar } from './components/GitStatusBar';
import { RequestEditor } from './components/RequestEditor';
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

  const activeTab = tabs[activeTabIndex] ?? null;

  // Panel widths — editorWidth null means 50/50 until first drag
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [editorWidth, setEditorWidth] = useState<number | null>(null);
  const editorSplitRef = useRef<HTMLDivElement>(null);

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
  }, [activeTab?.path, activeTab?.content, setEnvironments]);

  return (
    <div className="app">
      <aside className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <FileSidebar />
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
            <RequestEditor />
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
