import { contextBridge, ipcRenderer } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════
// BEAM BROWSER — Preload Script
// Exposes a safe API surface to the renderer process via contextBridge.
// ═══════════════════════════════════════════════════════════════════════════

// Bridge console methods to main process for logging
const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
};

// Override console methods to also send to main process
function setupConsoleBridge() {
  const sendLog = (level: string, ...args: any[]) => {
    try {
      const message = args.map(arg => {
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack}`;
        }
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      ipcRenderer.invoke('renderer-log', level, message).catch(() => { });
    } catch (e) {
      // Ignore errors in console bridge
    }
  };

  console.log = (...args: any[]) => {
    originalConsole.log(...args);
    sendLog('info', ...args);
  };

  console.error = (...args: any[]) => {
    originalConsole.error(...args);
    sendLog('error', ...args);
  };

  console.warn = (...args: any[]) => {
    originalConsole.warn(...args);
    sendLog('warn', ...args);
  };

  console.info = (...args: any[]) => {
    originalConsole.info(...args);
    sendLog('info', ...args);
  };

  // Global error handler for uncaught errors in renderer
  window.onerror = (message, source, lineno, colno, error) => {
    const errorObj = {
      message: String(message),
      stack: error?.stack,
      source: `${source}:${lineno}:${colno}`
    };
    ipcRenderer.invoke('renderer-error', errorObj).catch(() => { });
    return false;
  };

  // Unhandled promise rejection handler
  window.onunhandledrejection = (event) => {
    const errorObj = {
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack
    };
    ipcRenderer.invoke('renderer-error', errorObj).catch(() => { });
  };
}

setupConsoleBridge();

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,

  // ─── Window Controls ─────────────────────────────────────────────────────
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // ─── Navigation ──────────────────────────────────────────────────────────
  navigate: (tabId: string, url: string) => ipcRenderer.invoke('navigate', tabId, url),
  goBack: (tabId: string) => ipcRenderer.invoke('go-back', tabId),
  goForward: (tabId: string) => ipcRenderer.invoke('go-forward', tabId),
  reload: (tabId: string) => ipcRenderer.invoke('reload', tabId),
  stopLoading: (tabId: string) => ipcRenderer.invoke('stop-loading', tabId),

  // ─── Tab Management ─────────────────────────────────────────────────────
  createTab: (tabId: string, url: string) => ipcRenderer.invoke('create-tab', tabId, url),
  closeTab: (tabId: string) => ipcRenderer.invoke('close-tab', tabId),
  switchTab: (tabId: string) => ipcRenderer.invoke('switch-tab', tabId),

  // ─── Events from Main → Renderer ────────────────────────────────────────

  onTabTitleUpdated: (callback: (tabId: string, title: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string, title: string) => callback(tabId, title);
    ipcRenderer.on('tab-title-updated', handler);
    return () => ipcRenderer.removeListener('tab-title-updated', handler);
  },

  onTabUrlUpdated: (callback: (tabId: string, url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string, url: string) => callback(tabId, url);
    ipcRenderer.on('tab-url-updated', handler);
    return () => ipcRenderer.removeListener('tab-url-updated', handler);
  },

  onTabFaviconUpdated: (callback: (tabId: string, favicon: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string, favicon: string) => callback(tabId, favicon);
    ipcRenderer.on('tab-favicon-updated', handler);
    return () => ipcRenderer.removeListener('tab-favicon-updated', handler);
  },

  onTabLoadingChanged: (callback: (tabId: string, isLoading: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string, isLoading: boolean) => callback(tabId, isLoading);
    ipcRenderer.on('tab-loading-changed', handler);
    return () => ipcRenderer.removeListener('tab-loading-changed', handler);
  },

  onTabNavigationUpdated: (callback: (tabId: string, canGoBack: boolean, canGoForward: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string, canGoBack: boolean, canGoForward: boolean) => callback(tabId, canGoBack, canGoForward);
    ipcRenderer.on('tab-navigation-updated', handler);
    return () => ipcRenderer.removeListener('tab-navigation-updated', handler);
  },

  onWindowMaximizedChanged: (callback: (isMaximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window-maximized-changed', handler);
    return () => ipcRenderer.removeListener('window-maximized-changed', handler);
  },

  // ─── AdBlock ───────────────────────────────────────────────────────────────
  adblockGetStatus: () => ipcRenderer.invoke('adblock-get-status'),
  adblockSetEnabled: (enabled: boolean) => ipcRenderer.invoke('adblock-set-enabled', enabled),
  adblockUpdateFilters: () => ipcRenderer.invoke('adblock-update-filters'),
  adblockCheckUrl: (url: string) => ipcRenderer.invoke('adblock-check-url', url),

  // ─── Settings ───────────────────────────────────────────────────────────────
  settingsGetAll: () => ipcRenderer.invoke('settings-get-all'),
  settingsGet: (key: string) => ipcRenderer.invoke('settings-get', key),
  settingsSet: (key: string, value: any) => ipcRenderer.invoke('settings-set', key, value),
  settingsGetSearchEngines: () => ipcRenderer.invoke('settings-get-search-engines'),
  settingsGetSearchUrl: (query: string) => ipcRenderer.invoke('settings-get-search-url', query),

  // ─── Password Manager ────────────────────────────────────────────────────────
  passwordAdd: (url: string, username: string, password: string) =>
    ipcRenderer.invoke('password-add', url, username, password),
  passwordGet: (url: string, username?: string) =>
    ipcRenderer.invoke('password-get', url, username),
  passwordGetAll: () => ipcRenderer.invoke('password-get-all'),
  passwordDelete: (id: string) => ipcRenderer.invoke('password-delete', id),
  passwordClear: () => ipcRenderer.invoke('password-clear'),
  passwordStats: () => ipcRenderer.invoke('password-stats'),

  // ─── Sync ─────────────────────────────────────────────────────────────────────
  syncEnable: (email: string) => ipcRenderer.invoke('sync-enable', email),
  syncDisable: () => ipcRenderer.invoke('sync-disable'),
  syncStatus: () => ipcRenderer.invoke('sync-status'),
  syncNow: () => ipcRenderer.invoke('sync-now'),

  // ─── Google Auth ────────────────────────────────────────────────────────────
  googleAuthStart: () => ipcRenderer.invoke('google-auth-start'),
  googleAuthStatus: () => ipcRenderer.invoke('google-auth-status'),
  googleAuthLogout: () => ipcRenderer.invoke('google-auth-logout'),

  // ─── Agent ───────────────────────────────────────────────────────────────────
  agentExecute: (command: string) => ipcRenderer.invoke('agent-execute', command),
  agentExecutePlanned: () => ipcRenderer.invoke('agent-execute-planned'),
  agentGetFunctions: () => ipcRenderer.invoke('agent-get-functions'),
  agentGetState: () => ipcRenderer.invoke('agent-get-state'),
  agentGetPageState: () => ipcRenderer.invoke('agent-get-page-state'),
  agentCaptureScreenshot: () => ipcRenderer.invoke('agent-capture-screenshot'),
  agentPause: () => ipcRenderer.invoke('agent-pause'),
  agentResume: () => ipcRenderer.invoke('agent-resume'),
  agentStop: () => ipcRenderer.invoke('agent-stop'),
  agentConfirmAction: (proceed: boolean) => ipcRenderer.invoke('agent-confirm-action', proceed),
  agentGetPendingConfirmation: () => ipcRenderer.invoke('agent-get-pending-confirmation'),
  agentInjectGoogleLogin: () => ipcRenderer.invoke('agent-inject-google-login'),
  agentGetSuggestions: () => ipcRenderer.invoke('ai-get-suggestions'),
  agentHumanFeedbackResponse: (response: any) => ipcRenderer.invoke('agent-human-feedback-response', response),
  agentExecuteScript: (tabId: string, script: string) => ipcRenderer.invoke('agent-execute-script', tabId, script),
  agentGetActiveTabId: () => ipcRenderer.invoke('agent-get-active-tab-id'),
  agentSetActiveTabId: (tabId: string) => ipcRenderer.invoke('agent-set-active-tab-id', tabId),
  agentWatchCredentials: (tabId: string) => ipcRenderer.invoke('agent-watch-credentials', tabId),

  credentialWatchStart: (tabId: string) => ipcRenderer.invoke('credential-watch-start', tabId),
  credentialWatchStop: () => ipcRenderer.invoke('credential-watch-stop'),
  credentialCheck: (domain: string) => ipcRenderer.invoke('credential-check', domain),
  credentialAutofill: (tabId: string, domain: string) => ipcRenderer.invoke('credential-autofill', tabId, domain),
  credentialAutoSave: (tabId: string) => ipcRenderer.invoke('credential-auto-save', tabId),
  credentialSetWaitMode: (mode: 'active' | 'passive' | 'sleep') => ipcRenderer.invoke('credential-set-wait-mode', mode),
  credentialGetWaitMode: () => ipcRenderer.invoke('credential-get-wait-mode'),
  credentialSleep: () => ipcRenderer.invoke('credential-sleep'),
  credentialWake: () => ipcRenderer.invoke('credential-wake'),

  // Session management
  sessionSave: () => ipcRenderer.invoke('session-save'),
  sessionClear: () => ipcRenderer.invoke('session-clear'),
  sessionGetCookies: (domain: string) => ipcRenderer.invoke('session-get-cookies', domain),
  sessionSaveBrowser: (tabs: any[], activeTabId: string) => ipcRenderer.invoke('session-save-browser', tabs, activeTabId),
  sessionRestoreBrowser: () => ipcRenderer.invoke('session-restore-browser'),
  sessionSetTabsEnabled: (enabled: boolean) => ipcRenderer.invoke('session-set-tabs-enabled', enabled),

  // Agent events
  onAgentTaskUpdate: (callback: (task: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, task: any) => callback(task);
    ipcRenderer.on('agent-task-update', handler);
    return () => ipcRenderer.removeListener('agent-task-update', handler);
  },
  onAgentNavigateWebview: (callback: (data: { url: string; tabId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('agent-navigate-webview', handler);
    return () => ipcRenderer.removeListener('agent-navigate-webview', handler);
  },
  onAgentDisplayResult: (callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('agent-display-result', handler);
    return () => ipcRenderer.removeListener('agent-display-result', handler);
  },
  onAgentWebpageRead: (callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('agent-webpage-read', handler);
    return () => ipcRenderer.removeListener('agent-webpage-read', handler);
  },
  onAgentSuccessEvaluated: (callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('agent-success-evaluated', handler);
    return () => ipcRenderer.removeListener('agent-success-evaluated', handler);
  },
  onHumanFeedback: (callback: (request: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: any) => callback(request);
    ipcRenderer.on('human-feedback', handler);
    return () => ipcRenderer.removeListener('human-feedback', handler);
  },

  // Scheduler API
  schedulerAddTask: (task: any) => ipcRenderer.invoke('scheduler-add-task', task),
  schedulerRemoveTask: (taskId: string) => ipcRenderer.invoke('scheduler-remove-task', taskId),
  schedulerUpdateTask: (taskId: string, updates: any) => ipcRenderer.invoke('scheduler-update-task', taskId, updates),
  schedulerGetTask: (taskId: string) => ipcRenderer.invoke('scheduler-get-task', taskId),
  schedulerGetAllTasks: () => ipcRenderer.invoke('scheduler-get-all-tasks'),
  schedulerPauseTask: (taskId: string) => ipcRenderer.invoke('scheduler-pause-task', taskId),
  schedulerResumeTask: (taskId: string) => ipcRenderer.invoke('scheduler-resume-task', taskId),
  schedulerRunNow: (taskId: string) => ipcRenderer.invoke('scheduler-run-now', taskId),
  onSchedulerTaskUpdate: (callback: (task: any) => void) => {
    ipcRenderer.on('scheduler-task-updated', (_event, task) => callback(task));
  },

  // Passive Skills API
  passiveSkillsGetConfig: () => ipcRenderer.invoke('passive-skills-get-config'),
  passiveSkillsSetConfig: (config: any) => ipcRenderer.invoke('passive-skills-set-config', config),
  passiveSkillsStart: () => ipcRenderer.invoke('passive-skills-start'),
  passiveSkillsStop: () => ipcRenderer.invoke('passive-skills-stop'),
  passiveSkillsClosePopups: () => ipcRenderer.invoke('passive-skills-close-popups'),

  // Send to main process
  sendToMain: (channel: string, data?: any) => ipcRenderer.send(channel, data),
  onFromMain: (channel: string, callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  // ─── AI Service (BYOM) ───────────────────────────────────────────────────────
  aiGetProviders: () => ipcRenderer.invoke('ai-get-providers'),
  aiGetConfig: () => ipcRenderer.invoke('ai-get-config'),
  aiGetUserModels: () => ipcRenderer.invoke('ai-get-user-models'),
  aiSetEnabled: (enabled: boolean) => ipcRenderer.invoke('ai-set-enabled', enabled),
  aiSetProvider: (provider: string, model: string) => ipcRenderer.invoke('ai-set-provider', provider, model),
  aiSetProviderConfig: (provider: string, config: any) => ipcRenderer.invoke('ai-set-provider-config', provider, config),
  aiCheckConnection: (provider?: string) => ipcRenderer.invoke('ai-check-connection', provider),
  aiChat: (messages: any[], provider?: string, model?: string) => ipcRenderer.invoke('ai-chat', messages, provider, model),
  
  // Saved Models Management
  aiSaveModel: (model: any) => ipcRenderer.invoke('ai-save-model', model),
  aiUpdateModel: (id: string, updates: any) => ipcRenderer.invoke('ai-update-model', id, updates),
  aiDeleteModel: (id: string) => ipcRenderer.invoke('ai-delete-model', id),
  aiSetActiveModel: (id: string) => ipcRenderer.invoke('ai-set-active-model', id),
  aiGetActiveModel: () => ipcRenderer.invoke('ai-get-active-model'),
  
  // Agent Skills & Planning
  agentGetSkills: () => ipcRenderer.invoke('agent-get-skills'),
  agentAddSkill: (skill: any) => ipcRenderer.invoke('agent-add-skill', skill),
  agentDeleteSkill: (skillId: string) => ipcRenderer.invoke('agent-delete-skill', skillId),
  agentPlanSteps: (command: string, context: any) => ipcRenderer.invoke('agent-plan-steps', command, context),
  agentExecuteSkill: (skillId: string, input: any) => ipcRenderer.invoke('agent-execute-skill', skillId, input),
  agentEvaluateStep: (data: any) => ipcRenderer.invoke('agent-evaluate-step', data),
  agentReplan: (data: any) => ipcRenderer.invoke('agent-replan', data),
  activityLog: (message: string) => ipcRenderer.invoke('activity-log', message),
});

console.log('[Preload] Beam Browser preload script loaded');
