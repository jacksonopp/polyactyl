import { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { EditorState, Extension, RangeSetBuilder } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { Decoration, EditorView, ViewPlugin, lineNumbers } from '@codemirror/view';

import type { FileType } from '../env';
import { useAppStore } from '../store/appStore';

function buildDecorations(text: string) {
  const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [];
  const pushRange = (from: number, to: number, className: string) => {
    ranges.push({ from, to, decoration: Decoration.mark({ class: className }) });
  };

  const linePatterns = [
    { regexp: /^\s*@[^\s=]+\s*=.*$/gmu, className: 'cm-http-variable' },
    { regexp: /^\s*#\s*@.*$/gmu, className: 'cm-http-meta' },
    { regexp: /^\s*#.*$/gmu, className: 'cm-http-comment' },
  ];

  for (const { regexp, className } of linePatterns) {
    for (const match of text.matchAll(regexp)) {
      const start = match.index ?? 0;
      pushRange(start, start + match[0].length, className);
    }
  }

  for (const match of text.matchAll(/^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)\b/gimu)) {
    const start = (match.index ?? 0) + match[0].search(/\S/u);
    pushRange(start, start + match[1].length, 'cm-http-method');
  }

  for (const match of text.matchAll(/^\s*(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)\s+(\S+)/gimu)) {
    const url = match[1];
    const base = match.index ?? 0;
    const start = base + match[0].lastIndexOf(url);
    pushRange(start, start + url.length, 'cm-http-url');
  }

  for (const match of text.matchAll(/^\s*([A-Za-z-]+)\s*:/gmu)) {
    const header = match[1];
    const base = match.index ?? 0;
    const start = base + match[0].indexOf(header);
    pushRange(start, start + header.length, 'cm-http-header');
  }

  for (const match of text.matchAll(/\{\{[^}]+\}\}/gmu)) {
    const start = match.index ?? 0;
    pushRange(start, start + match[0].length, 'cm-http-interpolation');
  }

  // ── GraphQL body highlighting ──────────────────────────────────────────
  // Detect GQL blocks: a line starting with query/mutation/subscription/fragment
  // followed by lines until the matching closing brace.
  for (const blockMatch of text.matchAll(/^(query|mutation|subscription|fragment)\b.*$/gimu)) {
    const blockStart = blockMatch.index ?? 0;

    // keywords: query, mutation, subscription, fragment
    pushRange(blockStart, blockStart + blockMatch[1].length, 'cm-gql-keyword');

    // operation name (word after the keyword)
    const nameMatch = /^(?:query|mutation|subscription|fragment)\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(blockMatch[0]);
    if (nameMatch) {
      const nameStart = blockStart + blockMatch[0].indexOf(nameMatch[1]);
      pushRange(nameStart, nameStart + nameMatch[1].length, 'cm-gql-name');
    }
  }

  // Field names inside GQL blocks: word followed by optional args or {
  for (const match of text.matchAll(/^\s{2,}([a-z_][A-Za-z0-9_]*)(?:\s*[\({]|\s*$)/gmu)) {
    const base = match.index ?? 0;
    const fieldStart = base + match[0].indexOf(match[1]);
    pushRange(fieldStart, fieldStart + match[1].length, 'cm-gql-field');
  }

  // GQL argument names: word followed by : inside parens (rough heuristic)
  for (const match of text.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*):/gmu)) {
    // Skip HTTP headers (only 0-1 leading spaces at line start) — those are already coloured
    const lineStart = text.lastIndexOf('\n', (match.index ?? 0) - 1) + 1;
    const indent = (match.index ?? 0) - lineStart;
    if (indent < 2) continue;
    const base = match.index ?? 0;
    pushRange(base, base + match[1].length, 'cm-gql-arg');
  }

  ranges.sort((left, right) => (left.from - right.from) || (left.to - right.to));
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) {
    builder.add(range.from, range.to, range.decoration);
  }
  return builder.finish();
}

const httpSyntaxHighlight = ViewPlugin.fromClass(
  class {
    decorations = buildDecorations('');

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state.doc.toString());
    }

    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view.state.doc.toString());
      }
    }
  },
  {
    decorations: value => value.decorations,
  }
);

const editorTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
});

/** Pick language extension based on file type / extension. */
function getLanguageExtension(path: string, fileType: FileType | undefined): Extension[] {
  if (fileType === 'http' || /\.(http|rest)$/iu.test(path)) {
    return [httpSyntaxHighlight];
  }
  if (/\.json$/iu.test(path)) {
    return [json()];
  }
  if (/\.[cm]?[jt]sx?$/iu.test(path)) {
    return [javascript({ jsx: false, typescript: path.endsWith('.ts') || path.endsWith('.tsx') })];
  }
  // .env files — plain text is fine; use a simple token highlighter
  return [dotenvHighlight];
}

/** Minimal dotenv highlighter: keys in one colour, values in another. */
const dotenvHighlight = ViewPlugin.fromClass(
  class {
    decorations = buildDotenvDecorations('');
    constructor(view: EditorView) { this.decorations = buildDotenvDecorations(view.state.doc.toString()); }
    update(u: { docChanged: boolean; view: EditorView }) {
      if (u.docChanged) this.decorations = buildDotenvDecorations(u.view.state.doc.toString());
    }
  },
  { decorations: v => v.decorations }
);

function buildDotenvDecorations(text: string) {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges: Array<{ from: number; to: number; cls: string }> = [];
  for (const match of text.matchAll(/^([^#\n][^=\n]*)=(.*)/gmu)) {
    const base = match.index ?? 0;
    ranges.push({ from: base, to: base + match[1].length, cls: 'cm-http-header' });
    ranges.push({ from: base + match[1].length + 1, to: base + match[0].length, cls: 'cm-http-url' });
  }
  for (const match of text.matchAll(/^#.*/gmu)) {
    ranges.push({ from: match.index ?? 0, to: (match.index ?? 0) + match[0].length, cls: 'cm-http-comment' });
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const r of ranges) builder.add(r.from, r.to, Decoration.mark({ class: r.cls }));
  return builder.finish();
}

function basename(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

// ── Tab context menu ──────────────────────────────────

type TabMenuItem =
  | { separator: true }
  | { label: string; onClick: () => void; disabled?: boolean; danger?: boolean };

function TabContextMenu({
  x, y, items, onClose,
}: { x: number; y: number; items: TabMenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; visible: boolean }>({ top: y, left: x, visible: false });

  useEffect(() => {
    if (!ref.current) return;
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    setPos({
      top: y + h > window.innerHeight ? Math.max(0, y - h) : y,
      left: x + w > window.innerWidth ? Math.max(0, x - w) : x,
      visible: true,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
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
            disabled={item.disabled}
            onClick={() => { item.onClick(); onClose(); }}
          >
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body
  );
}

// ── TabBar ────────────────────────────────────────────

function TabBar() {
  const tabs = useAppStore(state => state.tabs);
  const activeTabIndex = useAppStore(state => state.activeTabIndex);
  const setActiveTabIndex = useAppStore(state => state.setActiveTabIndex);
  const closeTab = useAppStore(state => state.closeTab);
  const closeOtherTabs = useAppStore(state => state.closeOtherTabs);
  const closeTabsToRight = useAppStore(state => state.closeTabsToRight);
  const closeTabsToLeft = useAppStore(state => state.closeTabsToLeft);
  const closeAllTabs = useAppStore(state => state.closeAllTabs);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    updateScrollState();

    // Remap vertical wheel to horizontal scroll.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: 'auto' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      el.removeEventListener('wheel', onWheel);
      ro.disconnect();
    };
  }, []);

  // Scroll active tab into view whenever it changes.
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    setTimeout(updateScrollState, 300);
  }, [activeTabIndex]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -120 : 120, behavior: 'smooth' });
  };

  if (tabs.length === 0) return null;

  const menuItems = (index: number): TabMenuItem[] => [
    { label: 'Close', onClick: () => closeTab(index) },
    { label: 'Close Others', onClick: () => closeOtherTabs(index), disabled: tabs.length <= 1 },
    { label: 'Close to the Left', onClick: () => closeTabsToLeft(index), disabled: index === 0 },
    { label: 'Close to the Right', onClick: () => closeTabsToRight(index), disabled: index === tabs.length - 1 },
    { separator: true },
    { label: 'Close All', onClick: () => closeAllTabs(), danger: true },
    { separator: true },
    { label: 'Copy Path', onClick: () => void navigator.clipboard.writeText(tabs[index].path) },
    { label: 'Show in Finder', onClick: () => void window.httpyacAPI.revealInFinder(tabs[index].path) },
  ];

  return (
    <div className="tab-bar-wrap">
      {canScrollLeft && (
        <button className="tab-scroll-btn" onClick={() => scroll('left')} title="Scroll left">‹</button>
      )}
      <div className="tab-bar" ref={scrollRef}>
        {tabs.map((tab, index) => (
          <div
            key={tab.path}
            ref={index === activeTabIndex ? activeTabRef : undefined}
            className={`tab${index === activeTabIndex ? ' active' : ''}`}
            onClick={() => setActiveTabIndex(index)}
            onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, index }); }}
            role="tab"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter') setActiveTabIndex(index); }}
            title={tab.path}
          >
            {tab.content !== tab.savedContent && <span className="tab-dirty-dot" title="Unsaved changes">●</span>}
            <span className="tab-label">{basename(tab.path)}</span>
            <button
              className="tab-close"
              type="button"
              onClick={e => { e.stopPropagation(); closeTab(index); }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {canScrollRight && (
        <button className="tab-scroll-btn" onClick={() => scroll('right')} title="Scroll right">›</button>
      )}
      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems(contextMenu.index)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export function RequestEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const tabs = useAppStore(state => state.tabs);
  const activeTabIndex = useAppStore(state => state.activeTabIndex);
  const setTabContent = useAppStore(state => state.setTabContent);
  const markTabSaved = useAppStore(state => state.markTabSaved);

  const activeTab = tabs[activeTabIndex] ?? null;
  const activeTabPath = activeTab?.path ?? null;
  const activeTabContent = activeTab?.content ?? '';
  const activeTabFileType = activeTab?.fileType;

  const saveActiveTab = useCallback(async () => {
    const tab = tabs[activeTabIndex];
    if (!tab) return;
    try {
      await window.httpyacAPI.saveFile(tab.path, tab.content);
      markTabSaved(activeTabIndex);
    } catch (err) {
      console.error('Save failed:', err);
    }
  }, [tabs, activeTabIndex, markTabSaved]);

  // Cmd+S / Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void saveActiveTab();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveActiveTab]);

  // File→Save from native menu
  useEffect(() => {
    return window.httpyacAPI.onMenuAction((action: string) => {
      if (action === 'file:save') void saveActiveTab();
    });
  }, [saveActiveTab]);

  // Recreate editor when the active file changes
  useEffect(() => {
    if (!containerRef.current || !activeTabPath) {
      viewRef.current?.destroy();
      viewRef.current = null;
      return;
    }

    const capturedIndex = activeTabIndex;
    const langExtensions = getLanguageExtension(activeTabPath, activeTabFileType);
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: activeTabContent,
        extensions: [
          lineNumbers(),
          EditorView.lineWrapping,
          oneDark,
          editorTheme,
          ...langExtensions,
          EditorView.contentAttributes.of({ spellcheck: 'false' }),
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              setTabContent(capturedIndex, update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabPath, activeTabIndex, activeTabFileType, setTabContent]);

  // Sync external content changes into the editor without recreating it
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentContent = view.state.doc.toString();
    if (currentContent === activeTabContent) return;
    view.dispatch({ changes: { from: 0, to: currentContent.length, insert: activeTabContent } });
  }, [activeTabContent]);

  return (
    <div className="editor-container">
      <TabBar />
      {!activeTabPath ? (
        <div className="editor-empty">
          <p>No file selected</p>
          <p className="text-muted">Open a .http or .rest file to edit and send requests.</p>
        </div>
      ) : (
        <div className="editor-content" ref={containerRef} />
      )}
    </div>
  );
}
