import { create } from 'zustand';
import { Tab, createNewTab, AgentTask, AgentStatus, UserModel, HumanFeedbackRequest } from '../types';

// Helper function to persist tabs to session
const persistTabs = (tabs: Tab[], activeTabId: string) => {
  // Only persist tabs that are not new tab or settings
  const tabsToPersist = tabs
    .filter(tab => !tab.isNewTab && !tab.isSettings)
    .map((tab, index) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon,
      isNewTab: tab.isNewTab,
      isSettings: tab.isSettings,
      index
    }));
  
  if (tabsToPersist.length > 0) {
    window.electronAPI?.sessionSaveBrowser(tabsToPersist, activeTabId);
  }
};

export interface WorkflowHistoryItem {
  id: string;
  command: string;
  steps: { description: string; status: string }[];
  status: 'success' | 'failed' | 'user_feedback';
  userRating?: 'good' | 'bad' | null;
  userFeedback?: string;
  createdAt: number;
}

// ─── Store Interface ─────────────────────────────────────────────────────────

interface BrowserState {
  // Tabs
  tabs: Tab[];
  activeTabId: string;

  // Window
  isMaximized: boolean;
  
  // Agent
  showAgentPanel: boolean;
  agentTasks: AgentTask[];
  currentAgentTask: AgentTask | null;
  
  // Workflow History
  workflowHistory: WorkflowHistoryItem[];

  // Settings
  showSettingsPanel: boolean;

  // Theme
  theme: 'dark' | 'light';

  // ─── Tab Actions ────────────────────────────────────────────────────────────
  addTab: (url?: string) => string;
  openSettingsTab: () => string;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;
  setTabs: (tabs: Tab[]) => void;

  // ─── Window Actions ─────────────────────────────────────────────────────────
  setMaximized: (isMaximized: boolean) => void;

  // ─── Agent Actions ──────────────────────────────────────────────────────────
  toggleAgentPanel: () => void;
  setAgentPanel: (show: boolean) => void;
  startAgentTask: (command: string) => void;
  updateAgentStatus: (status: AgentStatus) => void;

  // ─── Settings Actions ───────────────────────────────────────────────────────
  toggleSettingsPanel: () => void;
  setSettingsPanel: (show: boolean) => void;

  // ─── Theme Actions ──────────────────────────────────────────────────────────
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;

  // ─── Workflow History Actions ─────────────────────────────────────────────────
  addWorkflowHistory: (item: WorkflowHistoryItem) => void;
  updateWorkflowHistory: (id: string, updates: Partial<WorkflowHistoryItem>) => void;
}

// ─── Store Implementation ────────────────────────────────────────────────────

const initialTab = createNewTab('tab-1');

export const useBrowserStore = create<BrowserState>((set, get) => ({
  // Initial state
  tabs: [initialTab],
  activeTabId: initialTab.id,
  isMaximized: false,
  showAgentPanel: false,
  agentTasks: [],
  currentAgentTask: null,
  workflowHistory: [],
  showSettingsPanel: false,
  theme: 'dark',

  // ─── Tab Actions ────────────────────────────────────────────────────────────

  addTab: (url?: string) => {
    const newTab = createNewTab(undefined, url);
    set(state => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));

    // Tell main process to create a BrowserView for this tab
    window.electronAPI?.createTab(newTab.id, newTab.url);
    return newTab.id;
  },

  openSettingsTab: () => {
    const { tabs } = get();
    // Check if settings tab already exists
    const existingSettingsTab = tabs.find(t => t.isSettings);
    if (existingSettingsTab) {
      set({ activeTabId: existingSettingsTab.id, showSettingsPanel: false });
      return existingSettingsTab.id;
    }
    
    // Create new settings tab
    const settingsTab: Tab = {
      id: 'settings-' + Date.now(),
      title: 'Settings',
      url: 'about:settings',
      favicon: '',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isNewTab: false,
      isSettings: true,
    };
    
    set(state => ({
      tabs: [...state.tabs, settingsTab],
      activeTabId: settingsTab.id,
      showSettingsPanel: false,
    }));
    
    return settingsTab.id;
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get();

    if (tabs.length === 1) {
      const freshTab = createNewTab('tab-1');
      set({ tabs: [freshTab], activeTabId: freshTab.id });
      window.electronAPI?.closeTab(tabId);
      window.electronAPI?.createTab(freshTab.id, freshTab.url);
      return;
    }

    const idx = tabs.findIndex(t => t.id === tabId);
    const newTabs = tabs.filter(t => t.id !== tabId);

    let newActiveId = activeTabId;
    if (activeTabId === tabId) {
      const newIdx = Math.min(idx, newTabs.length - 1);
      newActiveId = newTabs[newIdx].id;
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
    window.electronAPI?.closeTab(tabId);
    if (newActiveId !== activeTabId) {
      window.electronAPI?.switchTab(newActiveId);
    }
    
    // Persist tabs
    persistTabs(newTabs, newActiveId);
  },

  switchTab: (tabId: string) => {
    set({ activeTabId: tabId });
    window.electronAPI?.switchTab(tabId);
    window.electronAPI?.agentSetActiveTabId(tabId);
    
    // Persist tabs
    const { tabs } = get();
    persistTabs(tabs, tabId);
  },

  updateTab: (tabId: string, updates: Partial<Tab>) => {
    set(state => {
      const newTabs = state.tabs.map(tab =>
        tab.id === tabId ? { ...tab, ...updates } : tab
      );
      // Persist tabs when they change
      persistTabs(newTabs, state.activeTabId);
      return { tabs: newTabs };
    });
  },

  setTabs: (tabs: Tab[]) => {
    set({ tabs });
  },

  // ─── Window Actions ─────────────────────────────────────────────────────────

  setMaximized: (isMaximized: boolean) => {
    set({ isMaximized });
  },

  // ─── Agent Actions ──────────────────────────────────────────────────────────

  toggleAgentPanel: () => {
    set(state => ({ showAgentPanel: !state.showAgentPanel }));
  },

  setAgentPanel: (show: boolean) => {
    set({ showAgentPanel: show });
  },

  startAgentTask: (command: string) => {
    const task: AgentTask = {
      id: Date.now().toString(),
      command,
      status: 'thinking',
      steps: [],
    };
    set(state => ({
      agentTasks: [...state.agentTasks, task],
      currentAgentTask: task,
    }));
  },

  // ─── Settings Actions ───────────────────────────────────────────────────────

  toggleSettingsPanel: () => {
    set(state => ({ showSettingsPanel: !state.showSettingsPanel }));
  },

  setSettingsPanel: (show: boolean) => {
    set({ showSettingsPanel: show });
  },

  updateAgentStatus: (status: AgentStatus) => {
    set(state => ({
      currentAgentTask: state.currentAgentTask
        ? { ...state.currentAgentTask, status }
        : null,
    }));
  },

  // ─── Theme Actions ──────────────────────────────────────────────────────────

  toggleTheme: () => {
    set(state => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      return { theme: newTheme };
    });
  },

  setTheme: (theme: 'dark' | 'light') => {
    set({ theme });
    document.documentElement.setAttribute('data-theme', theme);
  },

  // ─── Workflow History Actions ───────────────────────────────────────────────

  addWorkflowHistory: (item: WorkflowHistoryItem) => {
    set(state => ({
      workflowHistory: [item, ...state.workflowHistory].slice(0, 50)
    }));
  },

  updateWorkflowHistory: (id: string, updates: Partial<WorkflowHistoryItem>) => {
    set(state => ({
      workflowHistory: state.workflowHistory.map(item =>
        item.id === id ? { ...item, ...updates } : item
      )
    }));
  },
}));
