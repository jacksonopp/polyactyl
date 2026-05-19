import { useMemo, useState } from 'react';

import type { ProcessedRegion, SerializedResponse } from '../env';
import { useAppStore } from '../store/appStore';

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
    <section className={`collapsible-panel${open ? ' open' : ''}`}>
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
      {open && <div className="collapsible-body">{children}</div>}
    </section>
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
          {region.request.body && <pre className="request-body">{region.request.body}</pre>}
        </CollapsiblePanel>
      )}

      {response ? (
        <>
          {/* Headers collapsed by default */}
          <CollapsiblePanel
            title="Headers"
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
          <CollapsiblePanel title="Body" badge={<span className="collapsible-badge-muted">{responseSize}</span>}>
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
