import { useMemo } from 'react';

import type { ProcessedRegion, SerializedResponse, TestResult } from '../env';
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

function StatusBadge({ status }: { status?: number }) {
  return <span className={`status-badge ${getStatusClass(status)}`}>{status ?? '—'}</span>;
}

function HeadersTable({ headers }: { headers: Record<string, string | string[]> }) {
  const items = Object.entries(headers);
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="headers-section">
      <table className="headers-table">
        <tbody>
          {items.map(([key, value]) => (
            <tr key={key}>
              <td className="header-key">{key}</td>
              <td className="header-value">{Array.isArray(value) ? value.join(', ') : value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Timings({ timings }: { timings?: Record<string, number | undefined> }) {
  const entries = Object.entries(timings ?? {}).filter(([, value]) => typeof value === 'number');
  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="timings-section">
      <div className="section-title">Timings</div>
      <div className="timings-grid">
        {entries.map(([key, value]) => (
          <div className="timing-item" key={key}>
            <span className="timing-label">{key}</span>
            <span className="timing-value">{Math.round(value ?? 0)} ms</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Tests({ testResults }: { testResults: TestResult[] }) {
  if (testResults.length === 0) {
    return null;
  }

  const statusClass = (status: TestResult['status']) => status.toLowerCase();
  const statusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'SUCCESS':
        return '✓';
      case 'SKIPPED':
        return '•';
      default:
        return '✕';
    }
  };

  return (
    <section className="test-results">
      <div className="section-title">Tests</div>
      {testResults.map((test, index) => (
        <div className={`test-result ${statusClass(test.status)}`} key={`${test.message}-${index}`}>
          <span className="test-status-icon">{statusIcon(test.status)}</span>
          <div>
            <strong>{test.status}</strong>
            <span className="test-message">{test.message}</span>
            {test.error?.displayMessage && <span className="test-message">{test.error.displayMessage}</span>}
          </div>
        </div>
      ))}
    </section>
  );
}

function RegionDetails({ region }: { region: ProcessedRegion }) {
  const response = region.response;
  const responseBody = useMemo(() => formatBody(response?.body ?? '', response), [response]);
  const responseSize = useMemo(() => formatBytes(responseBody), [responseBody]);

  return (
    <div className="region-result">
      {region.request && (
        <section className="request-section">
          <div className="section-title">Request</div>
          <div className="request-line">
            <span className="request-method">{region.request.method ?? 'REQUEST'}</span>
            <span className="request-url">{region.request.url ?? 'No URL available'}</span>
          </div>
          {region.request.body ? <pre className="request-body">{region.request.body}</pre> : null}
        </section>
      )}

      {response ? (
        <>
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
          <HeadersTable headers={response.headers} />
          <section className="body-section">
            <div className="section-title">Body</div>
            <pre className="body-content">{responseBody || '(empty body)'}</pre>
          </section>
          <Timings timings={response.timings} />
        </>
      ) : (
        <section className="error-banner">No response was captured for this region.</section>
      )}

      <Tests testResults={region.testResults} />
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
