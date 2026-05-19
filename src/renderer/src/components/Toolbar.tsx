import { EnvSelector } from './EnvSelector';
import { useAppStore } from '../store/appStore';

export function Toolbar() {
  const tabs = useAppStore(state => state.tabs);
  const activeTabIndex = useAppStore(state => state.activeTabIndex);
  const activeEnvironment = useAppStore(state => state.activeEnvironment);
  const isSending = useAppStore(state => state.isSending);
  const setSending = useAppStore(state => state.setSending);
  const setProcessedRegions = useAppStore(state => state.setProcessedRegions);
  const setLastError = useAppStore(state => state.setLastError);
  const clearResponses = useAppStore(state => state.clearResponses);

  const activeTab = tabs[activeTabIndex] ?? null;

  const handleSend = async () => {
    if (!activeTab || isSending) return;

    setSending(true);
    setLastError(null);
    clearResponses();

    try {
      const results = await window.httpyacAPI.send({
        filePath: activeTab.path,
        content: activeTab.content,
        environment: activeEnvironment.length > 0 ? activeEnvironment : undefined,
      });
      setProcessedRegions(results);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="toolbar-title">Polyactyl</span>
      </div>
      <div className="toolbar-center" />
      <div className="toolbar-right">
        <EnvSelector />
        <button className="btn-send" type="button" onClick={() => void handleSend()} disabled={!activeTab || isSending}>
          {isSending ? 'Sending…' : '▶ Send'}
        </button>
      </div>
    </div>
  );
}
