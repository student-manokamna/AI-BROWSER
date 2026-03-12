import { BrowserWindow } from 'electron';
import { getPasswordManagerService, SavedPassword } from './PasswordManagerService';

let log: any = console;

export interface CapturedCredentials {
  url: string;
  domain: string;
  formType?: 'login' | 'registration' | 'unknown';
  username?: string;
  password?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  extraFields: Record<string, string>;
  timestamp: number;
}

export interface FormField {
  name: string;
  value: string;
  type: string;
  selector: string;
}

export type WaitMode = 'active' | 'passive' | 'sleep';

export class CredentialWatcherService {
  private mainWindow: BrowserWindow | null = null;
  private activeTabId: string | null = null;
  private capturedFields: Map<string, FormField[]> = new Map();
  private isWatching: boolean = false;
  private currentWaitMode: WaitMode = 'passive';
  private sleepCallback: (() => void) | null = null;

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

  setActiveTabId(tabId: string): void {
    this.activeTabId = tabId;
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  setWaitMode(mode: WaitMode): void {
    this.currentWaitMode = mode;
    log.info('[CredentialWatcher] Wait mode set to:', mode);
  }

  getWaitMode(): WaitMode {
    return this.currentWaitMode;
  }

  sleep(): void {
    this.currentWaitMode = 'sleep';
    log.info('[CredentialWatcher] Entering sleep mode');
  }

  wake(): void {
    this.currentWaitMode = 'passive';
    log.info('[CredentialWatcher] Waking from sleep mode');
    if (this.sleepCallback) {
      this.sleepCallback();
      this.sleepCallback = null;
    }
  }

  onWake(callback: () => void): void {
    this.sleepCallback = callback;
  }

  async startWatching(tabId: string): Promise<void> {
    if (this.isWatching) return;
    
    this.activeTabId = tabId;
    this.isWatching = true;
    
    const script = this.buildWatchingScript();
    await this.executeScriptInTab(tabId, script);
    log.info('[CredentialWatcher] Started watching tab:', tabId);
  }

  async stopWatching(): Promise<void> {
    this.isWatching = false;
    log.info('[CredentialWatcher] Stopped watching');
  }

  private buildWatchingScript(): string {
    return `
      (function() {
        if (window.__beamCredentialWatcherLoaded) return { success: false, reason: 'already loaded' };
        window.__beamCredentialWatcherLoaded = true;
        window.__beamCapturedFields = [];
        window.__beamCurrentFormUrl = window.location.href;
        
        const INPUT_SELECTORS = [
          'input[type="text"]',
          'input[type="email"]',
          'input[type="tel"]',
          'input[type="password"]',
          'input[type="number"]',
          'input[type="search"]',
          'input:not([type])',
          'select',
          'textarea'
        ];
        
        const FIELD_MAPPINGS = {
          'email': 'email',
          'e-mail': 'email',
          'mail': 'email',
          'username': 'username',
          'user': 'username',
          'login': 'username',
          'password': 'password',
          'pass': 'password',
          'confirm-password': 'password',
          'confirm_password': 'password',
          'passwd': 'password',
          'firstname': 'firstName',
          'first_name': 'firstName',
          'fname': 'firstName',
          'first name': 'firstName',
          'lastname': 'lastName',
          'last_name': 'lastName',
          'lname': 'lastName',
          'last name': 'lastName',
          'name': 'firstName',
          'fullname': 'firstName',
          'full_name': 'firstName',
          'phone': 'phone',
          'telephone': 'phone',
          'tel': 'phone',
          'mobile': 'phone',
          'cell': 'phone',
          'address': 'address',
          'street': 'address',
          'street1': 'address',
          'address1': 'address',
          'address2': 'address',
          'city': 'city',
          'town': 'city',
          'region': 'state',
          'state': 'state',
          'province': 'state',
          'zip': 'zipCode',
          'zipcode': 'zipCode',
          'zip-code': 'zipCode',
          'postal': 'zipCode',
          'postalcode': 'zipCode',
          'postal_code': 'zipCode',
          'country': 'country',
          'nation': 'country'
        };
        
        function getFieldType(input) {
          const name = (input.name || '').toLowerCase();
          const id = (input.id || '').toLowerCase();
          const placeholder = (input.placeholder || '').toLowerCase();
          const label = (input.getAttribute('aria-label') || '').toLowerCase();
          const combined = name + ' ' + id + ' ' + placeholder + ' ' + label;
          
          for (const [keyword, type] of Object.entries(FIELD_MAPPINGS)) {
            if (combined.includes(keyword)) {
              return type;
            }
          }
          
          return 'other';
        }
        
        function isLoginForm(form) {
          const hasPassword = form.querySelector('input[type="password"]');
          const text = (form.textContent || '').toLowerCase();
          const isLoginPage = text.includes('login') || text.includes('sign in') || text.includes('log in');
          return !!hasPassword || isLoginPage;
        }
        
        function isRegistrationForm(form) {
          const text = (form.textContent || '').toLowerCase();
          return text.includes('register') || text.includes('sign up') || text.includes('create account') || text.includes('join');
        }
        
        function getFormType(form) {
          if (isLoginForm(form)) return 'login';
          if (isRegistrationForm(form)) return 'registration';
          return 'unknown';
        }
        
        function captureFormFields(form) {
          const fields = [];
          const inputs = form.querySelectorAll(INPUT_SELECTORS.join(', '));
          
          inputs.forEach(input => {
            if (input.offsetParent === null) return;
            
            const fieldType = getFieldType(input);
            const value = input.value ? input.value.trim() : '';
            
            if (value || input.type === 'password' || fieldType === 'password') {
              fields.push({
                name: input.name || input.id || '',
                value: value,
                type: input.type,
                fieldType: fieldType,
                selector: getSelector(input)
              });
            }
          });
          
          return fields;
        }
        
        function getSelector(input) {
          if (input.id) return '#' + input.id;
          if (input.name) return '[name="' + input.name + '"]';
          if (input.className) return '.' + input.className.split(' ')[0];
          return input.tagName.toLowerCase();
        }
        
        function detectFormSubmission(e) {
          const form = e.target;
          if (!form.tagName || form.tagName.toLowerCase() !== 'form') return;
          
          const formType = getFormType(form);
          const fields = captureFormFields(form);
          
          if (fields.length === 0) return;
          
          const hasPassword = fields.some(f => f.fieldType === 'password');
          const hasUsername = fields.some(f => f.fieldType === 'username');
          const hasEmail = fields.some(f => f.fieldType === 'email');
          
          if (hasPassword || formType === 'login' || formType === 'registration') {
            const url = window.location.href;
            const domain = window.location.hostname;
            
            const data = {
              url: url,
              domain: domain,
              formType: formType,
              fields: fields,
              timestamp: Date.now()
            };
            
            window.__beamCapturedFields.push(data);
            
            window.postMessage({
              type: 'BEAM_FORM_SUBMITTED',
              data: data
            }, '*');
            
            console.log('[Beam] Form captured:', formType, 'with', fields.length, 'fields');
          }
        }
        
        function detectInputChange(e) {
          const input = e.target;
          if (!input.tagName || input.tagName.toLowerCase() !== 'input') return;
          
          const form = input.closest('form');
          if (!form) return;
          
          const formType = getFormType(form);
          if (formType !== 'unknown') {
            const fields = captureFormFields(form);
            const hasSensitive = fields.some(f => 
              f.fieldType === 'password' || f.fieldType === 'username' || f.fieldType === 'email'
            );
            
            if (hasSensitive) {
              window.postMessage({
                type: 'BEAM_FORM_CHANGED',
                data: {
                  url: window.location.href,
                  domain: window.location.hostname,
                  formType: formType,
                  fields: fields,
                  timestamp: Date.now()
                }
              }, '*');
            }
          }
        }
        
        document.addEventListener('submit', detectFormSubmission, true);
        
        document.addEventListener('input', detectInputChange, true);
        
        window.addEventListener('message', function(e) {
          if (e.data && e.data.type === 'BEAM_GET_CAPTURED_DATA') {
            e.source.postMessage({
              type: 'BEAM_CAPTURED_DATA',
              data: window.__beamCapturedFields
            }, '*');
          }
        });
        
        console.log('[Beam] Credential watcher loaded');
        return { success: true };
      })()
    `;
  }

  async executeScriptInTab(tabId: string, script: string): Promise<any> {
    if (!this.mainWindow) {
      return { success: false, error: 'No main window' };
    }

    try {
      const result = await this.mainWindow.webContents.executeJavaScript(`
        (function() {
          const webview = document.querySelector('webview[data-tab-id="${tabId}"]');
          if (!webview) {
            return { success: false, error: 'Webview not found' };
          }
          try {
            const result = webview.executeJavaScript(\`${script.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`, true);
            return result;
          } catch(e) {
            return { success: false, error: e.message };
          }
        })()
      `, true);
      return result;
    } catch (err: any) {
      log.warn('[CredentialWatcher] Script execution failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  async checkForCapturedData(tabId: string): Promise<CapturedCredentials[]> {
    const script = `
      (function() {
        return window.__beamCapturedFields || [];
      })()
    `;

    try {
      const result = await this.executeScriptInTab(tabId, script);
      if (result && Array.isArray(result)) {
        return this.processCapturedData(result);
      }
    } catch (err) {
      log.warn('[CredentialWatcher] Failed to check captured data:', err);
    }
    return [];
  }

  private processCapturedData(rawData: any[]): CapturedCredentials[] {
    const processed: CapturedCredentials[] = [];
    
    for (const entry of rawData) {
      const cred: CapturedCredentials = {
        url: entry.url || '',
        domain: entry.domain || '',
        extraFields: {},
        timestamp: entry.timestamp || Date.now()
      };

      for (const field of entry.fields || []) {
        switch (field.fieldType) {
          case 'username':
            cred.username = field.value;
            break;
          case 'password':
            cred.password = field.value;
            break;
          case 'email':
            cred.email = field.value;
            break;
          case 'phone':
            cred.phone = field.value;
            break;
          case 'firstName':
            cred.firstName = field.value;
            break;
          case 'lastName':
            cred.lastName = field.value;
            break;
          case 'address':
            cred.address = field.value;
            break;
          case 'city':
            cred.city = field.value;
            break;
          case 'state':
            cred.state = field.value;
            break;
          case 'zipCode':
            cred.zipCode = cred.zipCode ? cred.zipCode + ' ' + field.value : field.value;
            break;
          case 'country':
            cred.country = field.value;
            break;
          default:
            if (field.name && field.value) {
              cred.extraFields[field.name] = field.value;
            }
        }
      }

      processed.push(cred);
    }

    return processed;
  }

  async saveCredentials(credentials: CapturedCredentials): Promise<void> {
    const passwordService = getPasswordManagerService();
    
    if (credentials.password) {
      await passwordService.addPassword(
        credentials.domain,
        credentials.username || credentials.email || '',
        credentials.password
      );
      log.info('[CredentialWatcher] Saved password for domain:', credentials.domain);
    }

    if (credentials.email || credentials.phone || Object.keys(credentials.extraFields).length > 0) {
      await passwordService.addProfileInfo(credentials.domain, {
        email: credentials.email,
        phone: credentials.phone,
        firstName: credentials.firstName,
        lastName: credentials.lastName,
        address: credentials.address,
        city: credentials.city,
        state: credentials.state,
        zipCode: credentials.zipCode,
        country: credentials.country,
        extraFields: credentials.extraFields
      });
      log.info('[CredentialWatcher] Saved profile info for domain:', credentials.domain);
    }
  }

  async autoSave(tabId: string): Promise<void> {
    const captured = await this.checkForCapturedData(tabId);
    
    for (const cred of captured) {
      if (cred.formType === 'login' || cred.formType === 'registration') {
        await this.saveCredentials(cred);
      }
    }
  }

  async autofill(tabId: string, domain: string): Promise<{ success: boolean; filled: string[] }> {
    const passwordService = getPasswordManagerService();
    const profile = await passwordService.getProfileInfo(domain);
    const password = await passwordService.getPassword(domain);
    
    const filled: string[] = [];
    
    const script = `
      (function() {
        const results = [];
        
        ${password?.username ? `
        const usernameFields = document.querySelectorAll('input[type="text"], input[name="username"], input[name="login"], input[name="email"], input[id="username"], input[id="login"]');
        usernameFields.forEach(f => {
          if (f.offsetParent !== null && !f.value) {
            f.value = '${password.username.replace(/'/g, "\\'")}';
            f.dispatchEvent(new Event('input', { bubbles: true }));
            f.dispatchEvent(new Event('change', { bubbles: true }));
            results.push('username');
          }
        });
        ` : ''}
        
        ${profile?.email && !password?.username ? `
        const emailFields = document.querySelectorAll('input[type="email"], input[name="email"], input[id="email"]');
        emailFields.forEach(f => {
          if (f.offsetParent !== null && !f.value) {
            f.value = '${profile.email?.replace(/'/g, "\\'")}';
            f.dispatchEvent(new Event('input', { bubbles: true }));
            f.dispatchEvent(new Event('change', { bubbles: true }));
            results.push('email');
          }
        });
        ` : ''}
        
        return results;
      })()
    `;

    try {
      const result = await this.executeScriptInTab(tabId, script);
      if (result && Array.isArray(result)) {
        filled.push(...result);
      }
    } catch (err) {
      log.warn('[CredentialWatcher] Autofill failed:', err);
    }

    return { success: filled.length > 0, filled };
  }

  async hasStoredCredentials(domain: string): Promise<boolean> {
    const passwordService = getPasswordManagerService();
    const password = await passwordService.getPassword(domain);
    return !!password;
  }
}

let credentialWatcherService: CredentialWatcherService | null = null;

export function getCredentialWatcherService(): CredentialWatcherService {
  if (!credentialWatcherService) {
    credentialWatcherService = new CredentialWatcherService();
  }
  return credentialWatcherService;
}
