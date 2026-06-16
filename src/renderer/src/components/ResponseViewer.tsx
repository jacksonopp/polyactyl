import { useMemo, useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';

import type { ProcessedRegion, SerializedResponse } from '../env';
import { useAppStore } from '../store/appStore';

// ── GraphQL detection & highlighting ─────────────────

/**
 * Detects GraphQL content in two formats:
 * 1. JSON envelope  { "query": "...", "variables": {...} }  (httpyac wraps GQL before sending)
 * 2. Raw GQL text   query Foo { ... }  (body stored before httpyac transforms it)
 */
function parseGraphQLBody(body: string): { query: string; variables?: unknown } | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  // ── 1. JSON envelope ──
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.query === 'string' && parsed.query.trim().length > 0) {
        return { query: parsed.query.trim(), variables: parsed.variables };
      }
    } catch {
      // not valid JSON, fall through
    }
  }

  // ── 2. Raw GraphQL text ──
  // Matches: query, mutation, subscription, fragment, or anonymous { ... }
  if (/^(query|mutation|subscription|fragment)\b/.test(trimmed)) {
    return { query: trimmed };
  }

  return null;
}

function GraphQLHighlight({ code }: { code: string }) {
  return (
    <Highlight theme={themes.vsDark} code={code} language="graphql">
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={`graphql-highlight ${className}`} style={style}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}

function JsonHighlight({ code }: { code: string }) {
  return (
    <Highlight theme={themes.vsDark} code={code} language="json">
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={`graphql-highlight ${className}`} style={style}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}

/** Renders the request body with syntax highlighting when applicable. */
function RequestBodyContent({ body }: { body: string }) {
  const gql = useMemo(() => parseGraphQLBody(body), [body]);

  if (gql) {
    return (
      <div className="gql-body-wrap">
        <GraphQLHighlight code={gql.query} />
        {gql.variables !== undefined && (
          <details className="gql-variables">
            <summary>Variables</summary>
            <JsonHighlight code={JSON.stringify(gql.variables, null, 2)} />
          </details>
        )}
      </div>
    );
  }

  return <pre className="request-body">{body}</pre>;
}

function formatBytes(content: string): string {
  const size = new TextEncoder().encode(content).length;
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatBody(body: string, response: SerializedResponse | null): string {
  const source = response?.prettyPrintBody || body;
  const mimeType = response?.contentType?.mimeType || response?.contentType?.contentType || '';
  if (mimeType.includes('json') || source.trimStart().startsWith('{') || source.trimStart().startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(source), null, 2);
    } catch {
      return source;
    }
  }
  return source;
}

function getStatusClass(status?: number): string {
  if (!status) {
    return 'status-blue';
  }
  if (status < 300) {
    return 'status-green';
  }
  if (status < 400) {
    return 'status-yellow';
  }
  return 'status-red';
}

// ── CollapsiblePanel ──────────────────────────────────

function CollapsiblePanel({
  title,
  badge,
  actions,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`collapsible-panel${open ? ' open' : ''}`}>
      <div className="collapsible-header-row">
        <button
          type="button"
          className="collapsible-header"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
        >
          <span className="collapsible-arrow">{open ? '▾' : '▸'}</span>
          <span className="collapsible-title">{title}</span>
          {badge && <span className="collapsible-badge">{badge}</span>}
        </button>
        {actions && <div className="collapsible-actions">{actions}</div>}
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  );
}

// Compact inline collapsible used inside a panel body (no card border).
function InlineCollapsible({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`inline-collapsible${open ? ' open' : ''}`}>
      <button
        type="button"
        className="inline-collapsible-header"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span className="collapsible-arrow">{open ? '▾' : '▸'}</span>
        <span className="inline-collapsible-title">{title}</span>
        {badge && <span className="collapsible-badge-muted">{badge}</span>}
      </button>
      {open && <div className="inline-collapsible-body">{children}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status?: number }) {
  return <span className={`status-badge ${getStatusClass(status)}`}>{status ?? '—'}</span>;
}

function RegionDetails({ region }: { region: ProcessedRegion }) {
  const response = region.response;
  const responseBody = useMemo(() => formatBody(response?.body ?? '', response), [response]);
  const responseSize = useMemo(() => formatBytes(responseBody), [responseBody]);

  return (
    <div className="region-result">
      {/* ── Status summary (always visible, not collapsible) ── */}
      {response && (
        <section className="response-summary-card">
          <div className="response-summary">
            <StatusBadge status={response.statusCode} />
            <strong>{response.statusMessage || 'Response received'}</strong>
            <div className="response-meta">
              <span className="meta-pill">{response.protocol || response.httpVersion || 'HTTP'}</span>
              <span className="meta-pill">{response.timings?.total ? `${Math.round(response.timings.total)} ms` : `${Math.round(region.duration ?? 0)} ms`}</span>
              <span className="meta-pill">{responseSize}</span>
              <span className="meta-pill">{Object.keys(response.headers).length} headers</span>
            </div>
          </div>
        </section>
      )}

      {/* ── Request ── */}
      {region.request && (
        <CollapsiblePanel title="Request" badge={<span className="request-method">{region.request.method ?? 'REQUEST'}</span>}>
          <div className="request-line">
            <span className="request-method">{region.request.method ?? 'REQUEST'}</span>
            <span className="request-url">{region.request.url ?? 'No URL available'}</span>
          </div>
          {Object.keys(region.request.headers ?? {}).length > 0 && (
            <InlineCollapsible
              title="Headers"
              badge={Object.keys(region.request.headers).length}
              defaultOpen={false}
            >
              <table className="headers-table">
                <tbody>
                  {Object.entries(region.request.headers).map(([key, value]) => (
                    <tr key={key}>
                      <td className="header-key">{key}</td>
                      <td className="header-value">{Array.isArray(value) ? value.join(', ') : value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </InlineCollapsible>
          )}
          {region.request.body && (
            <InlineCollapsible title="Body" defaultOpen={true}>
              <RequestBodyContent body={region.request.body} />
            </InlineCollapsible>
          )}
        </CollapsiblePanel>
      )}

      {response ? (
        <>
          {/* Response headers — collapsed by default */}
          <CollapsiblePanel
            title="Response Headers"
            badge={<span className="collapsible-badge-muted">{Object.keys(response.headers).length}</span>}
            defaultOpen={false}
          >
            {Object.keys(response.headers).length === 0 ? (
              <span className="text-muted">No headers</span>
            ) : (
              <table className="headers-table">
                <tbody>
                  {Object.entries(response.headers).map(([key, value]) => (
                    <tr key={key}>
                      <td className="header-key">{key}</td>
                      <td className="header-value">{Array.isArray(value) ? value.join(', ') : value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CollapsiblePanel>

          {/* ── Body ── */}
          <CollapsiblePanel
            title="Body"
            badge={<span className="collapsible-badge-muted">{responseSize}</span>}
            actions={responseBody ? (
              <>
                <button
                  type="button"
                  className="body-action-btn"
                  title="Copy body to clipboard"
                  onClick={() => void navigator.clipboard.writeText(responseBody)}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="body-action-btn"
                  title="Save body to file"
                  onClick={() => void window.httpyacAPI.saveResponseBody(responseBody)}
                >
                  Save
                </button>
              </>
            ) : undefined}
          >
            <pre className="body-content">{responseBody || '(empty body)'}</pre>
          </CollapsiblePanel>

          {/* Timings collapsed by default */}
          {response.timings && Object.values(response.timings).some(v => typeof v === 'number') && (
            <CollapsiblePanel
              title="Timings"
              badge={response.timings.total ? <span className="collapsible-badge-muted">{Math.round(response.timings.total)} ms</span> : undefined}
              defaultOpen={false}
            >
              <div className="timings-grid">
                {Object.entries(response.timings)
                  .filter(([, v]) => typeof v === 'number')
                  .map(([key, value]) => (
                    <div className="timing-item" key={key}>
                      <span className="timing-label">{key}</span>
                      <span className="timing-value">{Math.round(value ?? 0)} ms</span>
                    </div>
                  ))}
              </div>
            </CollapsiblePanel>
          )}
        </>
      ) : (
        <section className="error-banner">No response was captured for this region.</section>
      )}

      {/* ── Tests ── */}
      {region.testResults.length > 0 && (
        <CollapsiblePanel
          title="Tests"
          badge={
            <span className={`collapsible-badge-muted ${region.testResults.every(t => t.status === 'SUCCESS') ? 'badge-green' : 'badge-red'}`}>
              {region.testResults.filter(t => t.status === 'SUCCESS').length}/{region.testResults.length} passed
            </span>
          }
        >
          {region.testResults.map((test, index) => {
            const icon = test.status === 'SUCCESS' ? '✓' : test.status === 'SKIPPED' ? '•' : '✕';
            return (
              <div className={`test-result ${test.status.toLowerCase()}`} key={`${test.message}-${index}`}>
                <span className="test-status-icon">{icon}</span>
                <div>
                  <strong>{test.status}</strong>
                  <span className="test-message">{test.message}</span>
                  {test.error?.displayMessage && <span className="test-message">{test.error.displayMessage}</span>}
                </div>
              </div>
            );
          })}
        </CollapsiblePanel>
      )}
    </div>
  );
}

export function ResponseViewer() {
  const processedRegions = useAppStore(state => state.processedRegions);
  const activeRegionIndex = useAppStore(state => state.activeRegionIndex);
  const setActiveRegionIndex = useAppStore(state => state.setActiveRegionIndex);
  const isSending = useAppStore(state => state.isSending);
  const lastError = useAppStore(state => state.lastError);

  if (isSending) {
    return (
      <div className="response-loading">
        <div className="spinner" />
        <p>Sending request…</p>
      </div>
    );
  }

  if (lastError) {
    return (
      <div className="error-state">
        <p>Request failed</p>
        <p className="text-muted">{lastError}</p>
      </div>
    );
  }

  if (processedRegions.length === 0) {
    return (
      <div className="response-empty">
        <p>No response yet</p>
        <p className="text-muted">Send the active request to inspect headers, body, and timings.</p>
      </div>
    );
  }

  const selectedRegion = processedRegions[activeRegionIndex] ?? processedRegions[0];

  return (
    <div className="response-viewer">
      <div className="response-header">
        <span className="response-title">Response</span>
        <span className="editor-status">{processedRegions.length} region(s)</span>
      </div>
      {processedRegions.length > 1 && (
        <div className="response-tabs">
          {processedRegions.map((region, index) => (
            <button
              key={region.id}
              type="button"
              className={`response-tab ${index === activeRegionIndex ? 'active' : ''}`}
              onClick={() => setActiveRegionIndex(index)}
            >
              {region.regionName || `Region ${index + 1}`}
            </button>
          ))}
        </div>
      )}
      <div className="response-content">
        <RegionDetails region={selectedRegion} />
      </div>
    </div>
  );
}
