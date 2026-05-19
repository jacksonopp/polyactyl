import { useEffect, useRef } from 'react';

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

function TabBar() {
  const tabs = useAppStore(state => state.tabs);
  const activeTabIndex = useAppStore(state => state.activeTabIndex);
  const setActiveTabIndex = useAppStore(state => state.setActiveTabIndex);
  const closeTab = useAppStore(state => state.closeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="tab-bar">
      {tabs.map((tab, index) => (
        <div
          key={tab.path}
          className={`tab${index === activeTabIndex ? ' active' : ''}`}
          onClick={() => setActiveTabIndex(index)}
          role="tab"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter') setActiveTabIndex(index); }}
          title={tab.path}
        >
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
  );
}

export function RequestEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const tabs = useAppStore(state => state.tabs);
  const activeTabIndex = useAppStore(state => state.activeTabIndex);
  const setTabContent = useAppStore(state => state.setTabContent);

  const activeTab = tabs[activeTabIndex] ?? null;
  const activeTabPath = activeTab?.path ?? null;
  const activeTabContent = activeTab?.content ?? '';
  const activeTabFileType = activeTab?.fileType;

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
