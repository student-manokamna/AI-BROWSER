import { BrowserWindow } from 'electron';
import { getPasswordManagerService } from './PasswordManagerService';
import { getCredentialWatcherService } from './CredentialWatcherService';

let log: any = console;

export interface PassiveSkillConfig {
  autoFillEnabled: boolean;
  popupCloserEnabled: boolean;
  credentialWatcherEnabled: boolean;
}

const DEFAULT_CONFIG: PassiveSkillConfig = {
  autoFillEnabled: true,
  popupCloserEnabled: true,
  credentialWatcherEnabled: true
};

export class PassiveSkillRunner {
  private mainWindow: BrowserWindow | null = null;
  private config: PassiveSkillConfig = { ...DEFAULT_CONFIG };
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private popupCheckInterval: NodeJS.Timeout | null = null;
  private lastPopupCheck: number = 0;

  constructor() {
    try {
      const electronLog = require('electron-log');
      log = electronLog;
    } catch (err) {
      console.warn('electron-log not available');
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  setConfig(config: Partial<PassiveSkillConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('[PassiveSkills] Config updated:', this.config);
  }

  getConfig(): PassiveSkillConfig {
    return { ...this.config };
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    log.info('[PassiveSkills] Service started');

    if (this.config.credentialWatcherEnabled) {
      this.startCredentialWatcher();
    }

    if (this.config.popupCloserEnabled) {
      this.startPopupCloser();
    }
  }

  stop(): void {
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.popupCheckInterval) {
      clearInterval(this.popupCheckInterval);
      this.popupCheckInterval = null;
    }

    log.info('[PassiveSkills] Service stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  private startCredentialWatcher(): void {
    const watcher = getCredentialWatcherService();
    watcher.setWaitMode('passive');

    this.checkInterval = setInterval(async () => {
      if (!this.config.autoFillEnabled || !this.isRunning) return;
      await this.checkAndAutoFill();
    }, 5000);
  }

  private startPopupCloser(): void {
    this.popupCheckInterval = setInterval(async () => {
      if (!this.config.popupCloserEnabled || !this.isRunning) return;
      if (Date.now() - this.lastPopupCheck < 3000) return;

      this.lastPopupCheck = Date.now();
      await this.closePopups();
    }, 2000);
  }

  private async checkAndAutoFill(): Promise<void> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    try {
      const domain = this.getCurrentDomain();
      if (!domain) return;

      const passwordService = getPasswordManagerService();
      const credentials = await passwordService.getAllPasswords();
      const domainCreds = credentials.find(c => c.url && domain.includes(this.extractDomain(c.url)));

      if (!domainCreds) return;

      const filled = await this.executeScript(`
        (function() {
          const usernameFields = document.querySelectorAll('input[type="email"], input[name="username"], input[name="login"], input[id="username"], input[id="login"], input[aria-label*="username"], input[aria-label*="login"]');
          const passwordFields = document.querySelectorAll('input[type="password"], input[name="password"], input[id="password"]');

          let filled = false;

          for (const el of usernameFields) {
            if (el.offsetParent !== null && !el.value) {
              el.value = '${(domainCreds.username || '').replace(/'/g, "\\'")}';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              filled = true;
            }
          }

          for (const el of passwordFields) {
            if (el.offsetParent !== null && !el.value) {
              el.value = '${(domainCreds.password || '').replace(/'/g, "\\'")}';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              filled = true;
            }
          }

          return { filled };
        })()
      `);

      if (filled?.filled) {
        log.info('[PassiveSkills] Auto-filled credentials for:', domain);
      }
    } catch (err) {
      // Silently ignore errors
    }
  }

  async closePopups(excludeSelectors: string[] = []): Promise<number> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return 0;

    const excludeStr = excludeSelectors.map(s => `:not(${s})`).join('');

    const result = await this.executeScript(`
      (function() {
        const closed = [];
        const excludeSelectors = [${excludeSelectors.map(s => `"${s}"`).join(',')}];

        const popupSelectors = [
          '[role="dialog"]',
          '.modal',
          '.popup',
          '.overlay',
          '[aria-modal="true"]',
          '.cookie-banner',
          '.cookie-notice',
          '.gdpr',
          '.newsletter-popup',
          '.promo-popup',
          '#cookieConsent',
          '#cookie-notice',
          '.cc-banner',
          '[class*="cookie"]',
          '[class*="popup"]',
          '[class*="modal"]',
          '[id*="cookie"]',
          '[id*="popup"]',
          '[id*="modal"]'
        ];

        let elements = [];
        for (const sel of popupSelectors) {
          try {
            elements = document.querySelectorAll(sel);
            if (elements.length > 0) break;
          } catch(e) {}
        }

        const excludePattern = excludeSelectors.join(',');
        const excludeEls = excludePattern ? document.querySelectorAll(excludePattern) : [];

        let closedCount = 0;

        for (const el of elements) {
          if (!el.offsetParent) continue;
          if (excludeEls && Array.from(excludeEls).includes(el)) continue;
          if (el.tagName === 'DIALOG' && el.open) {
            el.close();
            closed.push('dialog');
            closedCount++;
            continue;
          }

          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            const closeBtn = el.querySelector('[aria-label="Close"], .close, [class*="close"], button:not([class])');
            if (closeBtn) {
              closeBtn.click();
            } else if (el.remove) {
              el.remove();
            }
            closed.push(el.className || el.id || 'popup');
            closedCount++;
          }
        }

        const overlays = document.querySelectorAll('.overlay, .backdrop, [class*="backdrop"]');
        for (const overlay of overlays) {
          if (overlay.offsetParent && overlay.style.background) {
            overlay.remove();
            closedCount++;
          }
        }

        return { closed: closedCount, types: closed.slice(0, 10) };
      })()
    `);

    if (result?.closed > 0) {
      log.info('[PassiveSkills] Closed', result.closed, 'popups:', result.types);
      this.notifyRenderer('popups-closed', { count: result.closed, types: result.types });
    }

    return result?.closed || 0;
  }

  async captureCredentials(): Promise<boolean> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return false;

    try {
      const captured = await this.executeScript(`
        (function() {
          const result = { username: null, password: null, url: window.location.href };

          const usernameInputs = document.querySelectorAll('input[type="email"], input[name="username"], input[name="login"], input[id="username"], input[id="login"]');
          for (const el of usernameInputs) {
            if (el.value && el.offsetParent !== null) {
              result.username = el.value;
              break;
            }
          }

          const passwordInputs = document.querySelectorAll('input[type="password"]');
          for (const el of passwordInputs) {
            if (el.value && el.offsetParent !== null) {
              result.password = el.value;
              break;
            }
          }

          return result;
        })()
      `);

      if (captured && captured.url && (captured.username || captured.password)) {
        const domain = this.extractDomain(captured.url);
        const passwordService = getPasswordManagerService();

        if (captured.username) {
          await passwordService.addPassword(domain, captured.username, captured.password || '');
          log.info('[PassiveSkills] Captured credentials for:', domain);
          this.notifyRenderer('credentials-captured', { domain, username: captured.username });
          return true;
        }
      }
    } catch (err) {
      log.warn('[PassiveSkills] Failed to capture credentials:', err);
    }

    return false;
  }

  private getCurrentDomain(): string | null {
    if (!this.mainWindow) return null;

    try {
      const url = this.mainWindow.webContents.getURL();
      if (!url || url.startsWith('about:') || url.startsWith('chrome:') || url.startsWith('beam:')) {
        return null;
      }
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  private async executeScript(script: string): Promise<any> {
    if (!this.mainWindow) return null;

    try {
      const result = await this.mainWindow.webContents.executeJavaScript(script, true);
      return result;
    } catch (err) {
      return null;
    }
  }

  private notifyRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

let passiveSkillRunner: PassiveSkillRunner | null = null;

export function getPassiveSkillRunner(): PassiveSkillRunner {
  if (!passiveSkillRunner) {
    passiveSkillRunner = new PassiveSkillRunner();
  }
  return passiveSkillRunner;
}
