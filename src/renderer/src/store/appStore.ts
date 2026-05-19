import { create } from 'zustand';

import type { FileEntry, FileType, ProcessedRegion } from '../env';

export interface Tab {
  path: string;
  content: string;
  fileType?: FileType;
}

interface AppState {
  // File tree
  rootDirectory: string | null;
  fileTree: FileEntry[];
  isLoadingDirectory: boolean;
  showEmptyDirs: boolean;

  // Open file tabs
  tabs: Tab[];
  activeTabIndex: number;

  // Environments
  environments: string[];
  activeEnvironment: string[];

  // Response — global, always reflects the last send (not per-tab)
  isSending: boolean;
  processedRegions: ProcessedRegion[];
  activeRegionIndex: number;
  lastError: string | null;

  // Actions
  setRootDirectory: (path: string | null) => void;
  setFileTree: (tree: FileEntry[]) => void;
  setLoadingDirectory: (loading: boolean) => void;
  setShowEmptyDirs: (show: boolean) => void;

  openTab: (path: string, content: string, fileType?: FileType) => void;
  closeTab: (index: number) => void;
  setActiveTabIndex: (index: number) => void;
  setTabContent: (index: number, content: string) => void;
  updateTabPath: (oldPath: string, newPath: string) => void;
  closeTabByPath: (path: string) => void;
  closeTabsUnderPath: (pathPrefix: string) => void;
  updateTabsUnderPath: (oldPrefix: string, newPrefix: string) => void;

  setEnvironments: (envs: string[]) => void;
  setActiveEnvironment: (envs: string[]) => void;
  setSending: (sending: boolean) => void;
  setProcessedRegions: (regions: ProcessedRegion[]) => void;
  setActiveRegionIndex: (index: number) => void;
  setLastError: (message: string | null) => void;
  clearResponses: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  rootDirectory: null,
  fileTree: [],
  isLoadingDirectory: false,
  showEmptyDirs: false,
  tabs: [],
  activeTabIndex: 0,
  environments: [],
  activeEnvironment: [],
  isSending: false,
  processedRegions: [],
  activeRegionIndex: 0,
  lastError: null,

  setRootDirectory: path => set({ rootDirectory: path }),
  setFileTree: tree => set({ fileTree: tree }),
  setLoadingDirectory: loading => set({ isLoadingDirectory: loading }),
  setShowEmptyDirs: show => set({ showEmptyDirs: show }),

  openTab: (path, content, fileType) => {
    const { tabs } = get();
    const existing = tabs.findIndex(t => t.path === path);
    if (existing !== -1) {
      set({ activeTabIndex: existing });
    } else {
      set({ tabs: [...tabs, { path, content, fileType }], activeTabIndex: tabs.length });
    }
  },

  closeTab: index => {
    const { tabs, activeTabIndex } = get();
    const next = tabs.filter((_, i) => i !== index);
    let nextActive = activeTabIndex;
    if (index < activeTabIndex) {
      nextActive = activeTabIndex - 1;
    } else if (index === activeTabIndex) {
      nextActive = Math.max(0, index - 1);
    }
    set({ tabs: next, activeTabIndex: next.length === 0 ? 0 : nextActive });
  },

  setActiveTabIndex: index => set({ activeTabIndex: index }),

  setTabContent: (index, content) =>
    set(state => ({
      tabs: state.tabs.map((t, i) => (i === index ? { ...t, content } : t)),
    })),

  updateTabPath: (oldPath, newPath) =>
    set(state => ({
      tabs: state.tabs.map(t => (t.path === oldPath ? { ...t, path: newPath } : t)),
    })),

  closeTabByPath: path => {
    const { tabs, activeTabIndex } = get();
    const index = tabs.findIndex(t => t.path === path);
    if (index === -1) return;
    const next = tabs.filter((_, i) => i !== index);
    let nextActive = activeTabIndex;
    if (index < activeTabIndex) nextActive = activeTabIndex - 1;
    else if (index === activeTabIndex) nextActive = Math.max(0, index - 1);
    set({ tabs: next, activeTabIndex: next.length === 0 ? 0 : nextActive });
  },

  closeTabsUnderPath: pathPrefix => {
    const { tabs, activeTabIndex } = get();
    const prefix = pathPrefix.replace(/[\\/]+$/u, '') + '/';
    const isUnder = (p: string) => p === pathPrefix || p.startsWith(prefix);
    const next = tabs.filter(t => !isUnder(t.path));
    const removed = tabs.reduce<number[]>((acc, t, i) => (isUnder(t.path) ? [...acc, i] : acc), []);
    if (removed.length === 0) return;
    const firstRemovedBeforeActive = removed.filter(i => i < activeTabIndex).length;
    const activeWasRemoved = removed.includes(activeTabIndex);
    let nextActive = activeTabIndex - firstRemovedBeforeActive;
    if (activeWasRemoved) nextActive = Math.max(0, nextActive - 1);
    set({ tabs: next, activeTabIndex: next.length === 0 ? 0 : Math.min(nextActive, next.length - 1) });
  },

  updateTabsUnderPath: (oldPrefix, newPrefix) =>
    set(state => ({
      tabs: state.tabs.map(t => {
        if (t.path === oldPrefix || t.path.startsWith(oldPrefix + '/')) {
          const newPath = newPrefix + t.path.slice(oldPrefix.length);
          return { ...t, path: newPath };
        }
        return t;
      }),
    })),

  setEnvironments: envs =>
    set(state => ({
      environments: envs,
      activeEnvironment: state.activeEnvironment.filter(env => envs.includes(env)),
    })),
  setActiveEnvironment: envs => set({ activeEnvironment: envs }),
  setSending: sending => set({ isSending: sending }),
  setProcessedRegions: regions =>
    set(state => ({
      processedRegions: regions,
      activeRegionIndex:
        regions.length === 0 ? 0 : Math.min(state.activeRegionIndex, Math.max(regions.length - 1, 0)),
    })),
  setActiveRegionIndex: index => set({ activeRegionIndex: index }),
  setLastError: message => set({ lastError: message }),
  clearResponses: () => set({ processedRegions: [], activeRegionIndex: 0, lastError: null }),
}));

