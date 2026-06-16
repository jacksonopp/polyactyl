import type { ParsedRegion } from '../env';
import { useAppStore } from '../store/appStore';

function regionLabel(region: ParsedRegion, index: number): string {
  if (region.name) return region.name;
  const methodUrl = `${region.method ?? ''} ${region.url ?? ''}`.trim();
  return methodUrl || `Request ${index + 1}`;
}

export function RequestOutline({
  onJump,
}: {
  onJump?: (line: number) => void;
}) {
  const regions = useAppStore(state => state.regions);
  const isSending = useAppStore(state => state.isSending);
  const activeEnvironment = useAppStore(state => state.activeEnvironment);
  const tabs = useAppStore(state => state.tabs);
  const activeTabIndex = useAppStore(state => state.activeTabIndex);
  const setSending = useAppStore(state => state.setSending);
  const setProcessedRegions = useAppStore(state => state.setProcessedRegions);
  const setLastError = useAppStore(state => state.setLastError);
  const clearResponses = useAppStore(state => state.clearResponses);
  const setActiveRunId = useAppStore(state => state.setActiveRunId);

  const activeTab = tabs[activeTabIndex] ?? null;

  const handleRun = async (region: ParsedRegion) => {
    if (!activeTab || isSending) return;
    const runId = crypto.randomUUID();
    setSending(true);
    setLastError(null);
    clearResponses();
    setActiveRunId(runId);
    try {
      const results = await window.httpyacAPI.send({
        filePath: activeTab.path,
        content: activeTab.content,
        environment: activeEnvironment.length > 0 ? activeEnvironment : undefined,
        requestLine: region.startLine,
        runId,
      });
      setProcessedRegions(results);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
      setActiveRunId(null);
    }
  };

  const requestRegions = regions.filter(r => !r.isGlobal);

  if (requestRegions.length === 0) {
    return (
      <div className="request-outline-empty">
        <span className="text-muted">No requests</span>
      </div>
    );
  }

  return (
    <div className="request-outline">
      {requestRegions.map((region, index) => (
        <div
          key={region.id}
          className={`outline-item${region.disabled ? ' outline-item-disabled' : ''}`}
        >
          <button
            type="button"
            className="outline-jump-btn"
            onClick={() => onJump?.(region.startLine)}
            title={`Jump to line ${region.startLine + 1}`}
          >
            <span className="outline-method">{region.method ?? ''}</span>
            <span className="outline-label">{regionLabel(region, index)}</span>
          </button>
          <button
            type="button"
            className="outline-run-btn"
            disabled={isSending || region.disabled}
            onClick={() => void handleRun(region)}
            title="Run this request"
          >
            ▶
          </button>
        </div>
      ))}
    </div>
  );
}
