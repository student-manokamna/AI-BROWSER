import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let log: any = console;

export interface SearchEngine {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=' },
  { id: 'brave', name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  { id: 'startpage', name: 'Startpage', url: 'https://www.startpage.com/do/search?q=' },
  { id: 'yandex', name: 'Yandex', url: 'https://yandex.com/search/?text=' },
  { id: 'qwant', name: 'Qwant', url: 'https://www.qwant.com/?q=' },
  { id: 'searx', name: 'SearX', url: 'https://searx.be/?q=' },
  { id: 'ecosia', name: 'Ecosia', url: 'https://www.ecosia.org/search?q=' },
  { id: 'ddg_html', name: 'DuckDuckGo (HTML)', url: 'https://html.duckduckgo.com/html/?q=' },
];

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

const DEFAULT_SETTINGS: UserSettings = {
  searchEngine: 'duckduckgo',
  theme: 'dark',
  adblockEnabled: true,
  doNotTrack: true,
  javascriptEnabled: true,
  cookiesEnabled: true,
  blockThirdPartyCookies: true,
  clearOnExit: [],
  homepage: 'about:blank',
  downloadPath: '',
  passwordManagerEnabled: true,
  syncEnabled: false,
  syncEmail: '',
  sessionRetentionEnabled: true,
};

export class SettingsService {
  private settings: UserSettings = { ...DEFAULT_SETTINGS };
  private settingsPath: string = '';
  private initialized: boolean = false;

  constructor() {}

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const electronLog = require('electron-log');
      log = electronLog;
    } catch (err) {
      console.warn('electron-log not available');
    }

    try {
      const { app } = require('electron');
      const userDataPath = app.getPath('userData');
      this.settingsPath = path.join(userDataPath, 'settings.json');
    } catch (err) {
      log.error('Failed to get user data path:', err);
      return;
    }

    await this.loadSettings();
    this.initialized = true;
    log.info('[Settings] Initialized');
  }

  private async loadSettings(): Promise<void> {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        const loaded = JSON.parse(data);
        this.settings = { ...DEFAULT_SETTINGS, ...loaded };
        log.info('[Settings] Loaded from file');
      } else {
        // Set default download path
        this.settings.downloadPath = require('electron').app.getPath('downloads');
        await this.saveSettings();
        log.info('[Settings] Created default settings');
      }
    } catch (err) {
      log.error('[Settings] Failed to load settings:', err);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
      log.info('[Settings] Saved');
    } catch (err) {
      log.error('[Settings] Failed to save:', err);
    }
  }

  get<K extends keyof UserSettings>(key: K): UserSettings[K] {
    return this.settings[key];
  }

  set<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    this.settings[key] = value;
    this.saveSettings();
    log.info(`[Settings] ${key} = ${JSON.stringify(value)}`);
  }

  getAll(): UserSettings {
    return JSON.parse(JSON.stringify({ ...this.settings }));
  }

  setMultiple(updates: Partial<UserSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
    log.info('[Settings] Multiple updates applied');
  }

  getSearchEngineUrl(query: string): string {
    const engine = SEARCH_ENGINES.find(e => e.id === this.settings.searchEngine);
    if (!engine) {
      return `${SEARCH_ENGINES[0].url}${encodeURIComponent(query)}`;
    }
    return `${engine.url}${encodeURIComponent(query)}`;
  }

  reset(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
    log.info('[Settings] Reset to defaults');
  }
}

let settingsService: SettingsService | null = null;

export function getSettingsService(): SettingsService {
  if (!settingsService) {
    settingsService = new SettingsService();
  }
  return settingsService;
}
