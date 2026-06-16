import { EnvSelector } from './EnvSelector';
import { useAppStore } from '../store/appStore';

export function Toolbar() {
  const tabs = useAppStore(state => state.tabs);
  const activeTabIndex = useAppStore(state => state.activeTabIndex);
  const activeEnvironment = useAppStore(state => state.activeEnvironment);
  const isSending = useAppStore(state => state.isSending);
  const activeRunId = useAppStore(state => state.activeRunId);
  const setSending = useAppStore(state => state.setSending);
  const setActiveRunId = useAppStore(state => state.setActiveRunId);
  const setProcessedRegions = useAppStore(state => state.setProcessedRegions);
  const setLastError = useAppStore(state => state.setLastError);
  const clearResponses = useAppStore(state => state.clearResponses);

  const activeTab = tabs[activeTabIndex] ?? null;

  const handleSend = async () => {
    if (!activeTab || isSending) return;

    const runId = crypto.randomUUID();
    setSending(true);
    setActiveRunId(runId);
    setLastError(null);
    clearResponses();

    try {
      const results = await window.httpyacAPI.send({
        filePath: activeTab.path,
        content: activeTab.content,
        environment: activeEnvironment.length > 0 ? activeEnvironment : undefined,
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

  const handleCancel = async () => {
    if (!activeRunId) return;
    await window.httpyacAPI.cancelSend(activeRunId);
    setSending(false);
    setActiveRunId(null);
  };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="toolbar-title">Polyactyl</span>
      </div>
      <div className="toolbar-center" />
      <div className="toolbar-right">
        <EnvSelector />
        {isSending && activeRunId && (
          <button className="btn-cancel" type="button" onClick={() => void handleCancel()}>
            ✕ Cancel
          </button>
        )}
        <button className="btn-send" type="button" onClick={() => void handleSend()} disabled={!activeTab || isSending}>
          {isSending ? 'Sending…' : '▶ Send'}
        </button>
      </div>
    </div>
  );
}
