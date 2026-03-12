import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { getAdBlockService } from './services/AdBlockService';
import { getSettingsService, SEARCH_ENGINES } from './services/SettingsService';
import { getPasswordManagerService } from './services/PasswordManagerService';
import { getSyncService } from './services/SyncService';
import { getAgentService } from './services/AgentService';
import { getGoogleAuthService } from './services/GoogleAuthService';
import { getAIService } from './services/AIService';
import { getCredentialWatcherService, WaitMode } from './services/CredentialWatcherService';
import { getSessionService } from './services/SessionService';
import { getSchedulerService } from './services/SchedulerService';
import { getPassiveSkillRunner } from './services/PassiveSkillRunner';

// ═══════════════════════════════════════════════════════════════════════════
// BEAM BROWSER — Main Process
// ═══════════════════════════════════════════════════════════════════════════

// ─── Fallback File Logger (always available) ───────────────────────────────

const userDataPath = app.getPath('userData');
const logFilePath = path.join(userDataPath, 'beam-startup.log');

function fallbackLog(level: string, ...args: any[]) {
  try {
    const timestamp = new Date().toISOString();
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
    
    const logLine = `[${timestamp}] [${level}] ${message}\n`;
    
    fs.appendFileSync(logFilePath, logLine, 'utf8');
  } catch (e) {
    console.error('Fallback log failed:', e);
  }
}

function fallbackInfo(...args: any[]) {
  fallbackLog('INFO', ...args);
}

function fallbackError(...args: any[]) {
  fallbackLog('ERROR', ...args);
}

// ─── Initialize Logging FIRST ──────────────────────────────────────────────

fallbackInfo('=== Beam Browser Starting ===');
fallbackInfo('User data path:', userDataPath);
fallbackInfo('Log file:', logFilePath);

// Use dynamic import for electron-log to avoid module resolution issues
let log: any = {
  info: fallbackInfo,
  error: fallbackError,
  warn: fallbackInfo,
  debug: fallbackInfo
};

async function initLogger() {
  try {
    const electronLog = require('electron-log');
    electronLog.transports.file.level = 'info';
    electronLog.transports.console.level = 'debug';
    electronLog.transports.file.maxSize = 10 * 1024 * 1024;
    electronLog.transports.file.resolvePathFn = () => path.join(userDataPath, 'beam.log');
    
    // Bridge fallback logger to electron-log
    const originalInfo = electronLog.info.bind(electronLog);
    electronLog.info = (...args: any[]) => {
      fallbackInfo(...args);
      originalInfo(...args);
    };
    
    const originalError = electronLog.error.bind(electronLog);
    electronLog.error = (...args: any[]) => {
      fallbackError(...args);
      originalError(...args);
    };
    
    log = electronLog;
    fallbackInfo('electron-log initialized successfully');

    // Create separate agent log file using fs directly
    const agentLogPath = path.join(userDataPath, 'beam-agent.log');
    let agentLogStream: any = null;
    
    try {
      agentLogStream = fs.createWriteStream(agentLogPath, { flags: 'a' });
    } catch (e) {
      console.warn('Could not create agent log stream:', e);
    }
    
    // Store agent logger reference for use in services
    (global as any).agentLog = {
      info: (...args: any[]) => {
        const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] [INFO] [AGENT] ${msg}\n`;
        if (agentLogStream) {
          agentLogStream.write(line);
        }
        console.log('[Agent]', ...args);
      },
      error: (...args: any[]) => {
        const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] [ERROR] [AGENT] ${msg}\n`;
        if (agentLogStream) {
          agentLogStream.write(line);
        }
        console.error('[Agent]', ...args);
      },
      warn: (...args: any[]) => {
        const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] [WARN] [AGENT] ${msg}\n`;
        if (agentLogStream) {
          agentLogStream.write(line);
        }
        console.warn('[Agent]', ...args);
      }
    };
    
    fallbackInfo('Agent log file created at:', agentLogPath);
  } catch (err) {
    fallbackInfo('electron-log not available, using fallback logger');
    // Fallback - just use console
    (global as any).agentLog = {
      info: (...args: any[]) => console.log('[Agent]', ...args),
      error: (...args: any[]) => console.error('[Agent]', ...args),
      warn: (...args: any[]) => console.warn('[Agent]', ...args)
    };
  }
}

// Initialize logger immediately
initLogger();

// ─── Global Error Handling ───────────────────────────────────────────────────

process.on('uncaughtException', (error) => {
  fallbackError('Uncaught exception:', error);
  if (log.error) {
    log.error('Uncaught exception:', error);
  } else {
    console.error('Uncaught exception:', error);
  }
});

process.on('unhandledRejection', (reason) => {
  fallbackError('Unhandled rejection:', reason);
  if (log.error) {
    log.error('Unhandled rejection:', reason);
  } else {
    console.error('Unhandled rejection:', reason);
  }
});

// ─── Window Management ──────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let rendererCrashed = false;
let isWindowClosingIntentionally = false;
let crashRecoveryTimeout: NodeJS.Timeout | null = null;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  fallbackInfo('Creating main window...');
  log.info('Creating main window...');

  try {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      title: 'Beam Browser',
      frame: false,
      titleBarStyle: 'hidden',
      backgroundColor: '#0f1219',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webviewTag: true,
        spellcheck: true,
        devTools: true,
        partition: 'persist:beam',
      },
    });

    fallbackInfo('BrowserWindow created');
    log.info('BrowserWindow created');

    // Set main window for agent service
    getAgentService().setMainWindow(mainWindow);

    // Set main window for scheduler and passive skills services
    getSchedulerService().setMainWindow(mainWindow);
    getPassiveSkillRunner().setMainWindow(mainWindow);

    // Start passive skills (runs in background)
    getPassiveSkillRunner().start();

    // ─── Console Bridging: Capture renderer console output ─────────────────────
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const levelNames = ['verbose', 'info', 'warn', 'error'];
      const levelName = levelNames[level] || 'unknown';
      
      if (level >= 2) { // warn or error
        fallbackError(`[Renderer Console ${levelName}] ${message} (${sourceId}:${line})`);
        log.warn(`[Renderer Console ${levelName}] ${message} (${sourceId}:${line})`);
      } else {
        fallbackInfo(`[Renderer Console ${levelName}] ${message} (${sourceId}:${line})`);
        log.info(`[Renderer Console ${levelName}] ${message} (${sourceId}:${line})`);
      }
    });

    // ─── WebContents Error Handlers ───────────────────────────────────────────

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      fallbackError('Failed to load:', errorCode, errorDescription);
      log.error('Failed to load:', errorCode, errorDescription);
    });

    // Render process gone - detailed logging with crash recovery
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      fallbackError('═══════════════════════════════════════════════════');
      fallbackError('RENDER PROCESS GONE - Details:');
      fallbackError('  Reason:', details.reason);
      fallbackError('  Exit Code:', details.exitCode);
      fallbackError('═══════════════════════════════════════════════════');
      
      log.error('  Reason:', details.reason);
      log.error('  Exit Code:', details.exitCode);
      log.error('═══════════════════════════════════════════════════');
      log.error('RENDERER PROCESS CRASHED!');
      log.error('═══════════════════════════════════════════════════');

      // Set crash flag and attempt recovery
      rendererCrashed = true;
      fallbackError('Attempting to recover from crash...');
      log.error('Attempting to recover from crash...');
      
      if (crashRecoveryTimeout) {
        clearTimeout(crashRecoveryTimeout);
      }
      
      crashRecoveryTimeout = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          fallbackInfo('Reloading after crash...');
          log.info('Reloading after crash...');
          mainWindow.loadURL(VITE_DEV_SERVER_URL || path.join(__dirname, '../dist/index.html'));
          rendererCrashed = false;
        }
      }, 1000);
    });

    // Preload script errors
    mainWindow.webContents.on('preload-error', (_event, path, error) => {
      fallbackError('Preload script error:', path, error);
      log.error('Preload script error:', path, error);
    });

    // Did finish loading
    mainWindow.webContents.on('did-finish-load', () => {
      fallbackInfo('Window finished loading');
      log.info('Window finished loading');
    });

    mainWindow.webContents.on('did-start-loading', () => {
      fallbackInfo('Window started loading');
      log.info('Window started loading');
    });

    // ─── Window Close Tracking ─────────────────────────────────────────────────
    mainWindow.on('close', (event) => {
      if (!isWindowClosingIntentionally && rendererCrashed) {
        // Prevent close if renderer crashed - we'll reload instead
        event.preventDefault();
        fallbackInfo('Preventing close - attempting recovery instead');
        log.info('Preventing close - attempting recovery instead');
        
        if (crashRecoveryTimeout) {
          clearTimeout(crashRecoveryTimeout);
        }
        
        crashRecoveryTimeout = setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(VITE_DEV_SERVER_URL || path.join(__dirname, '../dist/index.html'));
            rendererCrashed = false;
          }
        }, 500);
      } else if (!isWindowClosingIntentionally) {
        fallbackInfo('Window close requested (not intentional)');
        log.info('Window close requested (not intentional)');
      }
    });

    mainWindow.once('ready-to-show', () => {
      fallbackInfo('Window ready to show');
      log.info('Window ready to show');
      mainWindow?.show();
    });

    mainWindow.on('show', () => {
      fallbackInfo('Window shown');
      log.info('Window shown');
    });

    mainWindow.on('hide', () => {
      fallbackInfo('Window hidden');
      log.info('Window hidden');
    });

    setTimeout(() => {
      if (mainWindow && !mainWindow.isVisible()) {
        fallbackInfo('Fallback: showing window after timeout');
        log.info('Fallback: showing window after timeout');
        mainWindow.show();
      }
    }, 3000);

    mainWindow.on('closed', () => {
      fallbackInfo('Main window closed');
      log.info('Main window closed');
      mainWindow = null;
    });

    // Track maximize state for UI
    mainWindow.on('maximize', () => {
      mainWindow?.webContents.send('window-maximized-changed', true);
    });

    mainWindow.on('unmaximize', () => {
      mainWindow?.webContents.send('window-maximized-changed', false);
    });

    // Load the app
    if (VITE_DEV_SERVER_URL) {
      fallbackInfo('Loading dev server:', VITE_DEV_SERVER_URL);
      log.info('Loading dev server:', VITE_DEV_SERVER_URL);
      mainWindow.loadURL(VITE_DEV_SERVER_URL);
    } else {
      const indexPath = path.join(__dirname, '../dist/index.html');
      fallbackInfo('Loading production file:', indexPath);
      log.info('Loading production file:', indexPath);
      
      // Verify the file exists
      if (!fs.existsSync(indexPath)) {
        fallbackError('index.html not found at:', indexPath);
        log.error('index.html not found at:', indexPath);
      }
      
      mainWindow.loadFile(indexPath);
    }

    fallbackInfo('Window created successfully');
    log.info('Window created successfully');
  } catch (error) {
    fallbackError('Error creating window:', error);
    log.error('Error creating window:', error);
  }
}

// ─── Certificate Handling ────────────────────────────────────────────────────

app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
  if (!app.isPackaged) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    fallbackInfo('app.whenReady() started');
    log.info('═══════════════════════════════════════════════════');
    log.info('  Beam Browser — Starting');
    log.info('═══════════════════════════════════════════════════');
    log.info('Electron:', process.versions.electron);
    log.info('Chrome:', process.versions.chrome);
    log.info('Node:', process.versions.node);
    fallbackInfo('App ready, Electron:', process.versions.electron);

    // Enable webviewTag at app level (required for webview to work)
    app.on('web-contents-created', (_event, webContents) => {
      webContents.on('render-process-gone', (_event, details) => {
        fallbackError('Render process gone:', details.reason);
        log.error('Render process gone:', details.reason);
      });
    });

    // Initialize Settings Service
    try {
      fallbackInfo('Initializing Settings service...');
      const settingsService = getSettingsService();
      await settingsService.init();
      fallbackInfo('[Main] Settings service initialized');
      log.info('[Main] Settings service initialized');
    } catch (err) {
      fallbackError('[Main] Failed to initialize Settings service:', err);
      log.error('[Main] Failed to initialize Settings service:', err);
    }

    // Initialize AdBlock Service
    try {
      fallbackInfo('Initializing AdBlock service...');
      const adBlockService = getAdBlockService();
      await adBlockService.init();
      fallbackInfo('[Main] AdBlock service initialized');
      log.info('[Main] AdBlock service initialized');
    } catch (err) {
      fallbackError('[Main] Failed to initialize AdBlock service:', err);
      log.error('[Main] Failed to initialize AdBlock service:', err);
    }

    // Register adblocker for all webContents
    app.on('web-contents-created', (_event, webContents) => {
      const adBlockService = getAdBlockService();
      adBlockService.registerWebContents(webContents);
    });

    // Initialize Password Manager Service
    try {
      fallbackInfo('Initializing Password Manager service...');
      const passwordManager = getPasswordManagerService();
      await passwordManager.init();
      fallbackInfo('[Main] Password Manager service initialized');
      log.info('[Main] Password Manager service initialized');
    } catch (err) {
      fallbackError('[Main] Failed to initialize Password Manager service:', err);
      log.error('[Main] Failed to initialize Password Manager service:', err);
    }

    // Initialize Credential Watcher Service
    try {
      const credentialWatcher = getCredentialWatcherService();
      credentialWatcher.setMainWindow(mainWindow);
      credentialWatcher.setWaitMode('passive');
      log.info('[Main] Credential Watcher service initialized');
    } catch (err) {
      log.error('[Main] Failed to initialize Credential Watcher service:', err);
    }

    // Initialize Session Service and restore sessions
    try {
      const sessionService = getSessionService();
      await sessionService.init();
      
      // Set session retention based on settings
      const settingsService = getSettingsService();
      const sessionRetentionEnabled = settingsService.get('sessionRetentionEnabled');
      sessionService.setTabsSessionEnabled(sessionRetentionEnabled);
      
      await sessionService.restoreSessions();
      log.info('[Main] Session Service initialized and sessions restored');
    } catch (err) {
      log.error('[Main] Failed to initialize Session Service:', err);
    }

    // Initialize Sync Service
    try {
      fallbackInfo('Initializing Sync service...');
      const syncService = getSyncService();
      await syncService.init();
      fallbackInfo('[Main] Sync service initialized');
      log.info('[Main] Sync service initialized');
    } catch (err) {
      fallbackError('[Main] Failed to initialize Sync service:', err);
      log.error('[Main] Failed to initialize Sync service:', err);
    }

    // Initialize Google Auth Service
    try {
      fallbackInfo('Initializing Google Auth service...');
      const googleAuth = getGoogleAuthService();
      await googleAuth.init();
      fallbackInfo('[Main] Google Auth service initialized');
      log.info('[Main] Google Auth service initialized');
    } catch (err) {
      fallbackError('[Main] Failed to initialize Google Auth service:', err);
      log.error('[Main] Failed to initialize Google Auth service:', err);
    }

    // Initialize Ollama Service
    try {
      fallbackInfo('Initializing AI service...');
      const aiService = getAIService();
      await aiService.init();
      fallbackInfo('[Main] AI service initialized');
      log.info('[Main] AI service initialized');
    } catch (err) {
      fallbackError('[Main] Failed to initialize AI service:', err);
      log.error('[Main] Failed to initialize AI service:', err);
    }

    // Configure session defaults
    const defaultSession = session.defaultSession;
    defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowedPermissions = [
        'clipboard-read', 
        'clipboard-write', 
        'notifications',
        'media',
        'fullscreen',
        'mediaKeySystem',
        'autoplay',
      ];
      callback(allowedPermissions.includes(permission));
    });

    // Allow autoplay for media
    defaultSession.setPermissionCheckHandler(() => true);

    // Fix for media/codec issues
    session.defaultSession.setUserAgent(
      session.defaultSession.getUserAgent().replace(/Electron\/\S+/, '') + ' Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Configure persist:beam partition for YouTube/streaming compatibility
    const partitionSession = session.fromPartition('persist:beam');
    partitionSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowedPermissions = [
        'clipboard-read', 
        'clipboard-write', 
        'notifications',
        'media',
        'fullscreen',
        'mediaKeySystem',
        'autoplay',
      ];
      callback(allowedPermissions.includes(permission));
    });
    partitionSession.setPermissionCheckHandler(() => true);
    partitionSession.setUserAgent(
      partitionSession.getUserAgent().replace(/Electron\/\S+/, '') + ' Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    fallbackInfo('Creating main window...');
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        fallbackInfo('App activated, creating new window');
        createWindow();
      }
    });
    
    fallbackInfo('app.whenReady() completed');
  } catch (error) {
    fallbackError('FATAL: Error in app.whenReady():', error);
    log.error('FATAL: Error in app.whenReady():', error);
  }
});

app.on('window-all-closed', () => {
  fallbackInfo('All windows closed');
  log.info('All windows closed');
  
  // Only quit if not recovering from a crash
  if (!rendererCrashed && process.platform !== 'darwin') {
    fallbackInfo('Quitting application (all windows closed)');
    log.info('Quitting application (all windows closed)');
    app.quit();
  } else if (rendererCrashed) {
    fallbackInfo('Not quitting - attempting to recover from renderer crash');
    log.info('Not quitting - attempting to recover from renderer crash');
    
    // Attempt to recreate the window
    setTimeout(() => {
      if (rendererCrashed && !mainWindow) {
        fallbackInfo('Recreating window after crash...');
        log.info('Recreating window after crash...');
        createWindow();
      }
    }, 2000);
  }
});

app.on('before-quit', async () => {
  fallbackInfo('Application quitting...');
  log.info('Application quitting...');
  
  // Save session data before quitting
  try {
    const sessionService = getSessionService();
    await sessionService.saveAllSessions();
    log.info('[Main] Session data saved');
  } catch (err) {
    log.error('[Main] Failed to save session:', err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// IPC HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Window Controls ─────────────────────────────────────────────────────────

ipcMain.handle('window-minimize', async () => {
  mainWindow?.minimize();
});

ipcMain.handle('window-maximize', async () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window-close', async () => {
  isWindowClosingIntentionally = true;
  fallbackInfo('Window close requested (intentional)');
  log.info('Window close requested (intentional)');
  mainWindow?.close();
});

ipcMain.handle('window-is-maximized', async () => {
  return mainWindow?.isMaximized() ?? false;
});

// ─── Renderer Error Handling ────────────────────────────────────────────────

ipcMain.handle('renderer-error', async (_event, error: { message: string; stack?: string; source?: string }) => {
  fallbackError('═══ RENDERER ERROR ═══');
  fallbackError('Message:', error.message);
  if (error.stack) {
    fallbackError('Stack:', error.stack);
  }
  if (error.source) {
    fallbackError('Source:', error.source);
  }
  fallbackError('═════════════════════');
  
  log.error('═══ RENDERER ERROR ═══');
  log.error('Message:', error.message);
  if (error.stack) {
    log.error('Stack:', error.stack);
  }
  if (error.source) {
    log.error('Source:', error.source);
  }
  log.error('═════════════════════');
  
  return { received: true };
});

ipcMain.handle('renderer-log', async (_event, level: string, message: string) => {
  if (level === 'error' || level === 'warn') {
    fallbackError(`[Renderer ${level.toUpperCase()}]`, message);
    log.error(`[Renderer ${level.toUpperCase()}]`, message);
  } else {
    fallbackInfo(`[Renderer ${level.toUpperCase()}]`, message);
    log.info(`[Renderer ${level.toUpperCase()}]`, message);
  }
  return { received: true };
});

// ─── Navigation ─────────────────────────────────────────────────────────────

ipcMain.handle('navigate', async (_event, _tabId: string, _url: string) => {
  // Navigation handled via webview in renderer
});

ipcMain.handle('go-back', async () => {
  // Handled via webview in renderer
});

ipcMain.handle('go-forward', async () => {
  // Handled via webview in renderer
});

ipcMain.handle('reload', async () => {
  // Handled via webview in renderer
});

ipcMain.handle('stop-loading', async () => {
  // Handled via webview in renderer
});

// ─── Tab Management ──────────────────────────────────────────────────────────

ipcMain.handle('create-tab', async (_event, _tabId: string, _url: string) => {
  // Tab management via webviews in renderer
});

ipcMain.handle('close-tab', async (_event, _tabId: string) => {
  // Tab management via webviews in renderer
});

ipcMain.handle('switch-tab', async (_event, tabId: string) => {
  // Tab management via webviews in renderer
  // Also start credential watching on the new tab
  try {
    const watcher = getCredentialWatcherService();
    watcher.setActiveTabId(tabId);
    await watcher.startWatching(tabId);
  } catch (err) {
    log.warn('[Main] Failed to start credential watching on tab switch:', err);
  }
});

ipcMain.handle('get-all-tabs', async () => {
  // Return all tabs from the browser store via renderer
  // This is handled in renderer, so we return empty and let renderer handle it
  return [];
});

// ─── AdBlock IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('adblock-get-status', async () => {
  const adBlockService = getAdBlockService();
  return adBlockService.getStats();
});

ipcMain.handle('adblock-set-enabled', async (_event, enabled: boolean) => {
  const adBlockService = getAdBlockService();
  adBlockService.setEnabled(enabled);
  return adBlockService.getStats();
});

ipcMain.handle('adblock-update-filters', async () => {
  const adBlockService = getAdBlockService();
  await adBlockService.updateFilters();
  return adBlockService.getStats();
});

// ─── Settings IPC ────────────────────────────────────────────────────────────

ipcMain.handle('settings-get-all', async () => {
  const settingsService = getSettingsService();
  return settingsService.getAll();
});

ipcMain.handle('settings-get', async (_event, key: string) => {
  const settingsService = getSettingsService();
  return settingsService.get(key as any);
});

ipcMain.handle('settings-set', async (_event, key: string, value: any) => {
  const settingsService = getSettingsService();
  settingsService.set(key as any, value);
  return settingsService.getAll();
});

ipcMain.handle('settings-get-search-engines', async () => {
  return SEARCH_ENGINES;
});

ipcMain.handle('settings-get-search-url', async (_event, query: string) => {
  const settingsService = getSettingsService();
  return settingsService.getSearchEngineUrl(query);
});

// ─── Password Manager IPC ───────────────────────────────────────────────────

ipcMain.handle('password-add', async (_event, url: string, username: string, password: string) => {
  const passwordManager = getPasswordManagerService();
  return passwordManager.addPassword(url, username, password);
});

ipcMain.handle('password-get', async (_event, url: string, username?: string) => {
  const passwordManager = getPasswordManagerService();
  return passwordManager.getPassword(url, username);
});

ipcMain.handle('password-get-all', async () => {
  const passwordManager = getPasswordManagerService();
  return passwordManager.getAllPasswords();
});

ipcMain.handle('password-delete', async (_event, id: string) => {
  const passwordManager = getPasswordManagerService();
  return passwordManager.deletePassword(id);
});

ipcMain.handle('password-clear', async () => {
  const passwordManager = getPasswordManagerService();
  await passwordManager.clearAllPasswords();
  return { success: true };
});

ipcMain.handle('password-stats', async () => {
  const passwordManager = getPasswordManagerService();
  return passwordManager.getStats();
});

// ─── Sync IPC ─────────────────────────────────────────────────────────────────

ipcMain.handle('sync-enable', async (_event, email: string) => {
  const googleAuth = getGoogleAuthService();
  const mainWindow = BrowserWindow.getAllWindows()[0];
  
  if (!mainWindow) {
    return { error: 'No main window' };
  }
  
  const result = await googleAuth.startAuthFlow(mainWindow);
  
  if (result.error) {
    return { error: result.error };
  }
  
  // Update settings with sync enabled
  const settingsService = getSettingsService();
  settingsService.set('syncEnabled', true);
  settingsService.set('syncEmail', result.user?.email || email);
  
  return {
    enabled: true,
    email: result.user?.email,
    status: 'success'
  };
});

ipcMain.handle('sync-disable', async () => {
  const googleAuth = getGoogleAuthService();
  await googleAuth.logout();
  
  const settingsService = getSettingsService();
  settingsService.set('syncEnabled', false);
  settingsService.set('syncEmail', '');
  
  return { enabled: false, email: null, status: 'success' };
});

ipcMain.handle('sync-status', async () => {
  const googleAuth = getGoogleAuthService();
  const user = googleAuth.getUser();
  const isAuthenticated = googleAuth.isAuthenticated();
  
  return {
    enabled: isAuthenticated,
    email: user?.email || null,
    status: isAuthenticated ? 'success' : 'idle'
  };
});

ipcMain.handle('sync-now', async () => {
  const googleAuth = getGoogleAuthService();
  const result = await googleAuth.sync();
  return result;
});

// ─── Google Auth IPC ─────────────────────────────────────────────────────────

ipcMain.handle('google-auth-start', async () => {
  const googleAuth = getGoogleAuthService();
  const mainWindow = BrowserWindow.getAllWindows()[0];
  
  if (!mainWindow) {
    return { error: 'No main window' };
  }
  
  const result = await googleAuth.startAuthFlow(mainWindow);
  
  if (result.error) {
    return { error: result.error };
  }
  
  return {
    success: true,
    user: result.user
  };
});

ipcMain.handle('google-auth-status', async () => {
  const googleAuth = getGoogleAuthService();
  const user = googleAuth.getUser();
  
  return {
    isAuthenticated: googleAuth.isAuthenticated(),
    user
  };
});

ipcMain.handle('google-auth-logout', async () => {
  const googleAuth = getGoogleAuthService();
  await googleAuth.logout();
  return { success: true };
});

// ─── Agent IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('agent-execute', async (_event, command: string) => {
  const agentService = getAgentService();
  return await agentService.executeTask(command);
});

ipcMain.handle('agent-execute-planned', async () => {
  const agentService = getAgentService();
  return await agentService.executePlannedTask();
});

ipcMain.handle('agent-get-functions', async () => {
  const agentService = getAgentService();
  return agentService.getFunctionsManifest();
});

ipcMain.handle('agent-get-state', async () => {
  const agentService = getAgentService();
  return agentService.getCurrentTask();
});


ipcMain.handle('agent-capture-screenshot', async () => {
  const agentService = getAgentService();
  return await agentService.captureScreenshot();
});

ipcMain.handle('agent-pause', async () => {
  const agentService = getAgentService();
  agentService.pause();
  return { success: true };
});

ipcMain.handle('agent-resume', async () => {
  const agentService = getAgentService();
  agentService.resume();
  return { success: true };
});

ipcMain.handle('agent-stop', async () => {
  const agentService = getAgentService();
  agentService.stop();
  return { success: true };
});

ipcMain.handle('agent-confirm-action', async (_event, proceed: boolean) => {
  const agentService = getAgentService();
  agentService.confirmAction(proceed);
  return { success: true };
});

ipcMain.handle('agent-get-pending-confirmation', async () => {
  const agentService = getAgentService();
  return agentService.getPendingConfirmation();
});

ipcMain.handle('agent-execute-script', async (_event, tabId: string, script: string) => {
  const agentService = getAgentService();
  return await agentService.executeScriptInTab(tabId, script);
});

ipcMain.handle('agent-get-active-tab-id', async () => {
  const agentService = getAgentService();
  return agentService.getActiveTabId();
});

ipcMain.handle('agent-set-active-tab-id', async (_event, tabId: string) => {
  const agentService = getAgentService();
  agentService.setActiveTabId(tabId);
  return { success: true };
});

ipcMain.handle('agent-watch-credentials', async (_event, tabId: string) => {
  const agentService = getAgentService();
  return await agentService.watchCredentialsInTab(tabId);
});

ipcMain.handle('credential-watch-start', async (_event, tabId: string) => {
  const watcher = getCredentialWatcherService();
  await watcher.startWatching(tabId);
  return { success: true };
});

ipcMain.handle('credential-watch-stop', async () => {
  const watcher = getCredentialWatcherService();
  await watcher.stopWatching();
  return { success: true };
});

ipcMain.handle('credential-check', async (_event, domain: string) => {
  const watcher = getCredentialWatcherService();
  const hasCredentials = await watcher.hasStoredCredentials(domain);
  return { hasCredentials };
});

ipcMain.handle('credential-autofill', async (_event, tabId: string, domain: string) => {
  const watcher = getCredentialWatcherService();
  return await watcher.autofill(tabId, domain);
});

ipcMain.handle('credential-auto-save', async (_event, tabId: string) => {
  const watcher = getCredentialWatcherService();
  await watcher.autoSave(tabId);
  return { success: true };
});

ipcMain.handle('credential-set-wait-mode', async (_event, mode: WaitMode) => {
  const watcher = getCredentialWatcherService();
  watcher.setWaitMode(mode);
  return { mode };
});

ipcMain.handle('credential-get-wait-mode', async () => {
  const watcher = getCredentialWatcherService();
  return watcher.getWaitMode();
});

ipcMain.handle('credential-sleep', async () => {
  const watcher = getCredentialWatcherService();
  watcher.sleep();
  return { success: true };
});

ipcMain.handle('credential-wake', async () => {
  const watcher = getCredentialWatcherService();
  watcher.wake();
  return { success: true };
});

// ─── Session Management IPC ─────────────────────────────────────────────────────

ipcMain.handle('session-save', async () => {
  const sessionService = getSessionService();
  await sessionService.saveAllSessions();
  return { success: true };
});

ipcMain.handle('session-clear', async () => {
  const sessionService = getSessionService();
  await sessionService.clearAllSessions();
  return { success: true };
});

ipcMain.handle('session-get-cookies', async (_event, domain: string) => {
  const sessionService = getSessionService();
  const cookies = await sessionService.getCookiesForDomain(domain);
  return { cookies };
});

ipcMain.handle('session-save-browser', async (_event, tabs: any[], activeTabId: string) => {
  const sessionService = getSessionService();
  await sessionService.saveBrowserSession(tabs, activeTabId);
  return { success: true };
});

ipcMain.handle('session-restore-browser', async () => {
  const sessionService = getSessionService();
  const sessionData = await sessionService.restoreBrowserSession();
  return sessionData;
});

ipcMain.handle('session-set-tabs-enabled', async (_event, enabled: boolean) => {
  const sessionService = getSessionService();
  sessionService.setTabsSessionEnabled(enabled);
  return { success: true };
});

// ─── AI Service IPC ─────────────────────────────────────────────────────────

ipcMain.handle('ai-get-providers', async () => {
  const aiService = getAIService();
  return aiService.getProviders();
});

ipcMain.handle('ai-get-config', async () => {
  const aiService = getAIService();
  return aiService.getConfig();
});

ipcMain.handle('ai-get-user-models', async () => {
  const aiService = getAIService();
  return aiService.getUserModels();
});

ipcMain.handle('ai-set-enabled', async (_event, enabled: boolean) => {
  const aiService = getAIService();
  await aiService.setEnabled(enabled);
  return { enabled };
});

ipcMain.handle('ai-set-provider', async (_event, provider: string, model: string) => {
  const aiService = getAIService();
  await aiService.setDefaultProvider(provider as any, model);
  return { provider, model };
});

ipcMain.handle('ai-set-provider-config', async (_event, provider: string, config: any) => {
  const aiService = getAIService();
  await aiService.setProviderConfig(provider as any, config);
  return { success: true };
});

ipcMain.handle('ai-check-connection', async (_event, provider?: string) => {
  const aiService = getAIService();
  return await aiService.checkConnection(provider as any);
});

ipcMain.handle('ai-chat', async (_event, messages: any[], provider?: string, model?: string) => {
  const aiService = getAIService();
  return await aiService.chat(messages, provider as any, model);
});

ipcMain.handle('ai-get-suggestions', async () => {
  const agentService = getAgentService();
  return await agentService.getAISuggestions();
});

// Scheduler IPC handlers
ipcMain.handle('scheduler-add-task', async (_event, task: any) => {
  const scheduler = getSchedulerService();
  return await scheduler.addTask(task);
});

ipcMain.handle('scheduler-remove-task', async (_event, taskId: string) => {
  const scheduler = getSchedulerService();
  return await scheduler.removeTask(taskId);
});

ipcMain.handle('scheduler-update-task', async (_event, taskId: string, updates: any) => {
  const scheduler = getSchedulerService();
  return await scheduler.updateTask(taskId, updates);
});

ipcMain.handle('scheduler-get-task', async (_event, taskId: string) => {
  const scheduler = getSchedulerService();
  return scheduler.getTask(taskId);
});

ipcMain.handle('scheduler-get-all-tasks', async () => {
  const scheduler = getSchedulerService();
  return scheduler.getAllTasks();
});

ipcMain.handle('scheduler-pause-task', async (_event, taskId: string) => {
  const scheduler = getSchedulerService();
  return await scheduler.pauseTask(taskId);
});

ipcMain.handle('scheduler-resume-task', async (_event, taskId: string) => {
  const scheduler = getSchedulerService();
  return await scheduler.resumeTask(taskId);
});

ipcMain.handle('scheduler-run-now', async (_event, taskId: string) => {
  const scheduler = getSchedulerService();
  return await scheduler.runTaskNow(taskId);
});

// Passive Skills IPC handlers
ipcMain.handle('passive-skills-get-config', async () => {
  const passiveSkills = getPassiveSkillRunner();
  return passiveSkills.getConfig();
});

ipcMain.handle('passive-skills-set-config', async (_event, config: any) => {
  const passiveSkills = getPassiveSkillRunner();
  passiveSkills.setConfig(config);
  return true;
});

ipcMain.handle('passive-skills-start', async () => {
  const passiveSkills = getPassiveSkillRunner();
  passiveSkills.start();
  return true;
});

ipcMain.handle('passive-skills-stop', async () => {
  const passiveSkills = getPassiveSkillRunner();
  passiveSkills.stop();
  return true;
});

ipcMain.handle('passive-skills-close-popups', async () => {
  const passiveSkills = getPassiveSkillRunner();
  return await passiveSkills.closePopups();
});

// Get page state from active webview
ipcMain.handle('agent-get-page-state', async (event) => {
  // Send request to renderer
  event.sender.send('agent-get-page-state-request');
  
  // Wait for response from renderer
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ error: 'Timeout waiting for page state' });
    }, 5000);
    
    const handler = (_event: Electron.IpcRendererEvent, data: any) => {
      clearTimeout(timeout);
      event.sender.removeListener('agent-page-state-result' as any, handler as any);
      resolve(data);
    };
    
    event.sender.on('agent-page-state-result' as any, handler);
  });
});

console.log('[Main] IPC handlers registered');
