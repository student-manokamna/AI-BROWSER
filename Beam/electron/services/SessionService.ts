import { app, session, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

let log: any = console;

export interface SessionData {
  cookies: Electron.Cookie[];
  domain: string;
  timestamp: number;
}

export interface TabSessionData {
  id: string;
  url: string;
  title: string;
  favicon: string;
  isNewTab: boolean;
  isSettings: boolean;
  index: number;
}

export interface BrowserSessionData {
  tabs: TabSessionData[];
  activeTabId: string;
  timestamp: number;
}

export class SessionService {
  private dataDir: string = '';
  private sessionFile: string = '';
  private browserSessionFile: string = '';
  private tabsSessionEnabled: boolean = true;

  constructor() {
    try {
      const electronLog = require('electron-log');
      log = electronLog;
    } catch (err) {
      console.warn('electron-log not available');
    }
  }

  async init(): Promise<void> {
    try {
      this.dataDir = path.join(app.getPath('userData'), 'sessions');
      this.sessionFile = path.join(this.dataDir, 'session.json');
      this.browserSessionFile = path.join(this.dataDir, 'browser-session.json');
      
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      log.info('[Session] Service initialized');
    } catch (err) {
      log.error('[Session] Failed to initialize:', err);
    }
  }

  setTabsSessionEnabled(enabled: boolean): void {
    this.tabsSessionEnabled = enabled;
    log.info('[Session] Tabs session retention:', enabled ? 'enabled' : 'disabled');
  }

  async saveBrowserSession(tabs: TabSessionData[], activeTabId: string): Promise<void> {
    if (!this.tabsSessionEnabled) {
      log.info('[Session] Tabs session disabled, not saving');
      return;
    }

    try {
      const sessionData: BrowserSessionData = {
        tabs,
        activeTabId,
        timestamp: Date.now()
      };

      fs.writeFileSync(this.browserSessionFile, JSON.stringify(sessionData, null, 2), 'utf-8');
      log.info('[Session] Browser session saved with', tabs.length, 'tabs');
    } catch (err) {
      log.error('[Session] Failed to save browser session:', err);
    }
  }

  async restoreBrowserSession(): Promise<BrowserSessionData | null> {
    if (!this.tabsSessionEnabled) {
      log.info('[Session] Tabs session disabled, not restoring');
      return null;
    }

    try {
      if (!fs.existsSync(this.browserSessionFile)) {
        log.info('[Session] No browser session file found');
        return null;
      }

      const data = fs.readFileSync(this.browserSessionFile, 'utf-8');
      const sessionData: BrowserSessionData = JSON.parse(data);

      log.info('[Session] Restored browser session with', sessionData.tabs.length, 'tabs');
      return sessionData;
    } catch (err) {
      log.error('[Session] Failed to restore browser session:', err);
      return null;
    }
  }

  async saveAllSessions(): Promise<void> {
    try {
      const sessions: SessionData[] = [];
      const partitionSession = session.fromPartition('persist:beam');
      
      const cookies = await partitionSession.cookies.get({});
      
      if (cookies.length > 0) {
        sessions.push({
          cookies: cookies,
          domain: 'persist:beam',
          timestamp: Date.now()
        });
      }

      fs.writeFileSync(this.sessionFile, JSON.stringify(sessions, null, 2), 'utf-8');
      log.info('[Session] Saved', sessions.length, 'session(s) with', cookies.length, 'cookies');
    } catch (err) {
      log.error('[Session] Failed to save sessions:', err);
    }
  }

  async restoreSessions(): Promise<void> {
    try {
      if (!fs.existsSync(this.sessionFile)) {
        log.info('[Session] No saved session file found');
        return;
      }

      const data = fs.readFileSync(this.sessionFile, 'utf-8');
      const sessions: SessionData[] = JSON.parse(data);

      const partitionSession = session.fromPartition('persist:beam');

      let restoredCount = 0;
      for (const sessionData of sessions) {
        for (const cookie of sessionData.cookies) {
          try {
            let url = 'https://' + cookie.domain.replace(/^\./, '');
            if (!cookie.domain.startsWith('.') && !cookie.domain.startsWith('www.') && !cookie.domain.includes('://')) {
              url = 'https://www.' + cookie.domain;
            }
            
            await partitionSession.cookies.set({
              url: url,
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path || '/',
              secure: cookie.secure ?? true,
              httpOnly: cookie.httpOnly ?? false,
              expirationDate: cookie.expirationDate,
              sameSite: (cookie as any).sameSite || 'no_restriction'
            });
            restoredCount++;
          } catch (e) {
            // Cookie might be invalid, skip
          }
        }
      }

      log.info('[Session] Restored', restoredCount, 'cookies from', sessions.length, 'session(s)');
    } catch (err) {
      log.error('[Session] Failed to restore sessions:', err);
    }
  }

  async clearAllSessions(): Promise<void> {
    try {
      const partitionSession = session.fromPartition('persist:beam');
      const cookies = await partitionSession.cookies.get({});
      
      for (const cookie of cookies) {
        const url = cookie.domain.startsWith('.') 
          ? `https://${cookie.domain.slice(1)}` 
          : `https://${cookie.domain}`;
        await partitionSession.cookies.remove(url, cookie.name);
      }

      if (fs.existsSync(this.sessionFile)) {
        fs.unlinkSync(this.sessionFile);
      }
      
      if (fs.existsSync(this.browserSessionFile)) {
        fs.unlinkSync(this.browserSessionFile);
      }

      log.info('[Session] Cleared all sessions');
    } catch (err) {
      log.error('[Session] Failed to clear sessions:', err);
    }
  }

  async getCookiesForDomain(domain: string): Promise<Electron.Cookie[]> {
    try {
      const partitionSession = session.fromPartition('persist:beam');
      return await partitionSession.cookies.get({ domain });
    } catch (err) {
      log.error('[Session] Failed to get cookies:', err);
      return [];
    }
  }

  async setCookie(cookie: Electron.Cookie): Promise<void> {
    try {
      const partitionSession = session.fromPartition('persist:beam');
      const url = cookie.domain.startsWith('.') 
        ? `https://${cookie.domain.slice(1)}` 
        : `https://${cookie.domain}`;
      
      await partitionSession.cookies.set({
        url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: cookie.secure ?? true,
        httpOnly: cookie.httpOnly ?? false,
        expirationDate: cookie.expirationDate
      });
    } catch (err) {
      log.error('[Session] Failed to set cookie:', err);
    }
  }
}

let sessionService: SessionService | null = null;

export function getSessionService(): SessionService {
  if (!sessionService) {
    sessionService = new SessionService();
  }
  return sessionService;
}
