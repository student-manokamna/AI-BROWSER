// ─── Tab Types ───────────────────────────────────────────────────────────────

export interface Tab {
  id: string;
  title: string;
  url: string;
  favicon: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isNewTab: boolean;
  isSettings?: boolean;
  isAgent?: boolean;
}

export function createNewTab(id?: string, url?: string): Tab {
  return {
    id: id || Date.now().toString(),
    title: 'New Tab',
    url: url || 'about:blank',
    favicon: '',
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isNewTab: true,
  };
}

// ─── Agent Types ─────────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'thinking' | 'planning' | 'executing' | 'paused' | 'done' | 'error' | 'waiting_confirmation';

export interface AgentTask {
  id: string;
  command: string;
  status: AgentStatus;
  steps: AgentStep[];
  result?: string;
  error?: string;
  requiresConfirmation?: boolean;
}

export interface AgentStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  action?: any;
  confirmed?: boolean;
}

// ─── Enhanced Agent Types ────────────────────────────────────────────────────

export interface PlannedStep {
  id: string;
  skillId: string;
  parameters: Record<string, any>;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
}

export interface WebpageSnapshot {
  stepId: string;
  timestamp: number;
  url: string;
  title: string;
  html?: string;
  extractedContent?: string;
  screenshot?: string;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}

export interface ExecutionContext {
  id: string;
  originalCommand: string;
  plannedSteps: PlannedStep[];
  currentStepIndex: number;
  stepResults: Map<string, StepResult>;
  webpageSnapshots: WebpageSnapshot[];
  isComplete: boolean;
  successCriteria: string;
  startedAt: number;
  lastUpdated: number;
}

// ─── Scheduler Types ─────────────────────────────────────────────────────────

export interface ScheduledTask {
  id: string;
  name: string;
  command: string;
  trigger: ScheduleTrigger;
  repeat?: RepeatConfig;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export type ScheduleTrigger = 
  | { type: 'once'; time: number }
  | { type: 'daily'; time: string }
  | { type: 'interval'; minutes: number };

export interface RepeatConfig {
  enabled: boolean;
  count?: number;
  until?: number;
}

// ─── Passive Skills Types ────────────────────────────────────────────────────

export interface PassiveSkillConfig {
  autoFillEnabled: boolean;
  popupCloserEnabled: boolean;
  credentialWatcherEnabled: boolean;
}

export interface AgentAction {
  id: string;
  type: string;
  description: string;
  selector?: string;
  value?: string;
}

export interface PageState {
  url: string;
  title: string;
  html: string;
  elements: DOMElement[];
}

export interface DOMElement {
  tag: string;
  id?: string;
  classes?: string[];
  text?: string;
  href?: string;
  src?: string;
  attributes: Record<string, string>;
  xpath: string;
}

// ─── Settings Types ───────────────────────────────────────────────────────────

export interface SearchEngine {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

export interface UserSettings {
  searchEngine: string;
  theme: 'dark' | 'light' | 'system';
  adblockEnabled: boolean;
  doNotTrack: boolean;
  javascriptEnabled: boolean;
  cookiesEnabled: boolean;
  blockThirdPartyCookies: boolean;
  clearOnExit: string[];
  homepage: string;
  downloadPath: string;
  passwordManagerEnabled: boolean;
  syncEnabled: boolean;
  syncEmail: string;
  sessionRetentionEnabled: boolean;
}

export interface SavedPassword {
  id: string;
  url: string;
  username: string;
  password: string;
  createdAt: number;
  updatedAt: number;
}

export interface PasswordStats {
  count: number;
  lastUpdated: number | null;
}

export interface SyncStatus {
  enabled: boolean;
  email: string | null;
  lastSync: number | null;
  status: 'idle' | 'syncing' | 'error' | 'success';
}

export interface UserModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  apiKey?: string;
  endpoint?: string;
}

export interface HumanFeedbackRequest {
  id: string;
  message: string;
  options: HumanFeedbackOption[];
}

export interface HumanFeedbackOption {
  id: string;
  label: string;
  value: string;
}

export interface HumanFeedbackResponse {
  id: string;
  selectedOptionId: string;
}

// ─── Window API Types ────────────────────────────────────────────────────────

export interface ElectronAPI {
  // Window controls
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;

  // Navigation (tab-aware)
  navigate: (tabId: string, url: string) => Promise<void>;
  goBack: (tabId: string) => Promise<void>;
  goForward: (tabId: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;
  stopLoading: (tabId: string) => Promise<void>;

  // Tab management
  createTab: (tabId: string, url: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  switchTab: (tabId: string) => Promise<void>;

  // AdBlock
  adblockGetStatus: () => Promise<{ rules: number; enabled: boolean }>;
  adblockSetEnabled: (enabled: boolean) => Promise<{ rules: number; enabled: boolean }>;
  adblockUpdateFilters: () => Promise<{ rules: number; enabled: boolean }>;
  adblockCheckUrl: (url: string) => Promise<boolean>;

  // Settings
  settingsGetAll: () => Promise<UserSettings>;
  settingsGet: (key: string) => Promise<any>;
  settingsSet: (key: string, value: any) => Promise<UserSettings>;
  settingsGetSearchEngines: () => Promise<SearchEngine[]>;
  settingsGetSearchUrl: (query: string) => Promise<string>;

  // Password Manager
  passwordAdd: (url: string, username: string, password: string) => Promise<SavedPassword>;
  passwordGet: (url: string, username?: string) => Promise<SavedPassword | null>;
  passwordGetAll: () => Promise<SavedPassword[]>;
  passwordDelete: (id: string) => Promise<boolean>;
  passwordClear: () => Promise<{ success: boolean }>;
  passwordStats: () => Promise<PasswordStats>;

  // Sync
  syncEnable: (email: string) => Promise<SyncStatus>;
  syncDisable: () => Promise<SyncStatus>;
  syncStatus: () => Promise<SyncStatus>;
  syncNow: () => Promise<boolean>;

  // Agent
  agentExecute: (command: string) => Promise<AgentTask>;
  agentExecutePlanned: () => Promise<AgentTask>;
  agentGetFunctions: () => Promise<string>;
  agentGetState: () => Promise<AgentTask | null>;
  agentGetPageState: () => Promise<PageState | null>;
  agentCaptureScreenshot: () => Promise<string | null>;
  agentPause: () => Promise<{ success: boolean }>;
  agentResume: () => Promise<{ success: boolean }>;
  agentStop: () => Promise<{ success: boolean }>;
  agentConfirmAction: (proceed: boolean) => Promise<{ success: boolean }>;
  agentGetPendingConfirmation: () => Promise<{ action: any; stepDescription: string } | null>;
  agentInjectGoogleLogin: () => Promise<{ success: boolean }>;
  agentExecuteScript: (tabId: string, script: string) => Promise<any>;
  agentGetActiveTabId: () => Promise<string | null>;
  agentSetActiveTabId: (tabId: string) => Promise<{ success: boolean }>;
  agentWatchCredentials: (tabId: string) => Promise<{ success: boolean }>;
  credentialWatchStart: (tabId: string) => Promise<{ success: boolean }>;
  credentialWatchStop: () => Promise<{ success: boolean }>;
  credentialCheck: (domain: string) => Promise<{ hasCredentials: boolean }>;
  credentialAutofill: (tabId: string, domain: string) => Promise<{ success: boolean; filled: string[] }>;
  credentialAutoSave: (tabId: string) => Promise<{ success: boolean }>;
  credentialSetWaitMode: (mode: 'active' | 'passive' | 'sleep') => Promise<{ mode: string }>;
  credentialGetWaitMode: () => Promise<string>;
  credentialSleep: () => Promise<{ success: boolean }>;
  credentialWake: () => Promise<{ success: boolean }>;

  // Session management
  sessionSave: () => Promise<{ success: boolean }>;
  sessionClear: () => Promise<{ success: boolean }>;
  sessionGetCookies: (domain: string) => Promise<{ cookies: any[] }>;
  sessionSaveBrowser: (tabs: any[], activeTabId: string) => Promise<{ success: boolean }>;
  sessionRestoreBrowser: () => Promise<{ tabs: any[]; activeTabId: string; timestamp: number } | null>;
  sessionSetTabsEnabled: (enabled: boolean) => Promise<{ success: boolean }>;

  // AI Service
  aiGetProviders: () => Promise<any[]>;
  aiGetConfig: () => Promise<any>;
  aiGetUserModels: () => Promise<UserModel[]>;
  aiSetEnabled: (enabled: boolean) => Promise<any>;
  aiSetProvider: (provider: string, model: string) => Promise<any>;
  aiSetProviderConfig: (provider: string, config: any) => Promise<any>;
  aiCheckConnection: (provider?: string) => Promise<any>;
  aiChat: (messages: any[], provider?: string, model?: string) => Promise<any>;

  // Agent events
  onAgentTaskUpdate: (callback: (task: AgentTask) => void) => void;
  onAgentNavigateWebview: (callback: (data: { url: string; tabId: string }) => void) => void;
  onAgentDisplayResult: (callback: (data: any) => void) => void;
  onAgentWebpageRead: (callback: (data: any) => void) => void;
  onAgentSuccessEvaluated: (callback: (data: any) => void) => void;
  onHumanFeedback: (callback: (request: HumanFeedbackRequest) => void) => void;

  // Scheduler
  schedulerAddTask: (task: any) => Promise<any>;
  schedulerRemoveTask: (taskId: string) => Promise<boolean>;
  schedulerUpdateTask: (taskId: string, updates: any) => Promise<any>;
  schedulerGetTask: (taskId: string) => Promise<any>;
  schedulerGetAllTasks: () => Promise<any[]>;
  schedulerPauseTask: (taskId: string) => Promise<boolean>;
  schedulerResumeTask: (taskId: string) => Promise<boolean>;
  schedulerRunNow: (taskId: string) => Promise<boolean>;
  onSchedulerTaskUpdate: (callback: (task: any) => void) => void;

  // Passive Skills
  passiveSkillsGetConfig: () => Promise<any>;
  passiveSkillsSetConfig: (config: any) => Promise<boolean>;
  passiveSkillsStart: () => Promise<boolean>;
  passiveSkillsStop: () => Promise<boolean>;
  passiveSkillsClosePopups: () => Promise<number>;

  // Communication with main process
  sendToMain: (channel: string, data?: any) => void;
  onFromMain: (channel: string, callback: (data: any) => void) => () => void;

  // Google Auth
  googleAuthStart: () => Promise<{ success?: boolean; user?: any; error?: string }>;
  googleAuthStatus: () => Promise<{ isAuthenticated: boolean; user: any }>;
  googleAuthLogout: () => Promise<{ success: boolean }>;

  // Events from main process
  onTabTitleUpdated: (callback: (tabId: string, title: string) => void) => () => void;
  onTabUrlUpdated: (callback: (tabId: string, url: string) => void) => () => void;
  onTabFaviconUpdated: (callback: (tabId: string, favicon: string) => void) => () => void;
  onTabLoadingChanged: (callback: (tabId: string, isLoading: boolean) => void) => () => void;
  onTabNavigationUpdated: (callback: (tabId: string, canGoBack: boolean, canGoForward: boolean) => void) => () => void;
  onWindowMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
