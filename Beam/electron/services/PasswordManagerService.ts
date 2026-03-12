import { app, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

let log: any = console;

export interface SavedPassword {
  id: string;
  url: string;
  username: string;
  password: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProfileInfo {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  cookie?: string;
  domain?: string;
  extraFields: Record<string, string>;
}

export interface SavedProfile {
  id: string;
  url: string;
  info: ProfileInfo;
  createdAt: number;
  updatedAt: number;
}

export interface PasswordStats {
  count: number;
  lastUpdated: number | null;
}

export class PasswordManagerService {
  private dataDir: string = '';
  private passwordFile: string = '';
  private profileFile: string = '';
  private passwords: SavedPassword[] = [];
  private profiles: SavedProfile[] = [];
  private initialized: boolean = false;
  private encryptionKey: Buffer | null = null;

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
      this.dataDir = path.join(app.getPath('userData'), 'passwords');
      this.passwordFile = path.join(this.dataDir, 'vault.enc');
      this.profileFile = path.join(this.dataDir, 'profiles.enc');
    } catch (err) {
      log.error('Failed to get Electron app paths', err);
      return;
    }

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    await this.loadPasswords();
    await this.loadProfiles();
    this.initialized = true;
    log.info('[PasswordManager] Initialized');
  }

  private async loadProfiles(): Promise<void> {
    if (!fs.existsSync(this.profileFile)) {
      this.profiles = [];
      return;
    }

    try {
      const encryptedData = fs.readFileSync(this.profileFile);
      
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(encryptedData);
        this.profiles = JSON.parse(decrypted);
        log.info(`[PasswordManager] Loaded ${this.profiles.length} profiles`);
      } else {
        const data = fs.readFileSync(this.profileFile, 'utf-8');
        this.profiles = JSON.parse(data);
      }
    } catch (err) {
      log.error('[PasswordManager] Failed to load profiles:', err);
      this.profiles = [];
    }
  }

  private async saveProfiles(): Promise<void> {
    try {
      const data = JSON.stringify(this.profiles, null, 2);
      
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(data);
        fs.writeFileSync(this.profileFile, encrypted);
      } else {
        fs.writeFileSync(this.profileFile, data, 'utf-8');
      }
      
      log.info('[PasswordManager] Saved profiles');
    } catch (err) {
      log.error('[PasswordManager] Failed to save profiles:', err);
    }
  }

  private async loadPasswords(): Promise<void> {
    if (!fs.existsSync(this.passwordFile)) {
      this.passwords = [];
      return;
    }

    try {
      const encryptedData = fs.readFileSync(this.passwordFile);
      
      // Check if safeStorage is available
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(encryptedData);
        this.passwords = JSON.parse(decrypted);
        log.info(`[PasswordManager] Loaded ${this.passwords.length} passwords`);
      } else {
        // Fallback: try to read as plain JSON (not recommended for production)
        log.warn('[PasswordManager] SafeStorage not available, using fallback');
        const data = fs.readFileSync(this.passwordFile, 'utf-8');
        this.passwords = JSON.parse(data);
      }
    } catch (err) {
      log.error('[PasswordManager] Failed to load passwords:', err);
      this.passwords = [];
    }
  }

  private async savePasswords(): Promise<void> {
    try {
      const data = JSON.stringify(this.passwords, null, 2);
      
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(data);
        fs.writeFileSync(this.passwordFile, encrypted);
      } else {
        // Fallback (not recommended)
        fs.writeFileSync(this.passwordFile, data, 'utf-8');
      }
      
      log.info('[PasswordManager] Saved passwords');
    } catch (err) {
      log.error('[PasswordManager] Failed to save passwords:', err);
    }
  }

  async addPassword(url: string, username: string, password: string): Promise<SavedPassword> {
    const existingIndex = this.passwords.findIndex(p => 
      p.url.toLowerCase() === url.toLowerCase() && 
      p.username.toLowerCase() === username.toLowerCase()
    );

    const savedPassword: SavedPassword = {
      id: existingIndex >= 0 ? this.passwords[existingIndex].id : crypto.randomUUID(),
      url: url.toLowerCase(),
      username,
      password,
      createdAt: existingIndex >= 0 ? this.passwords[existingIndex].createdAt : Date.now(),
      updatedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      this.passwords[existingIndex] = savedPassword;
    } else {
      this.passwords.push(savedPassword);
    }

    await this.savePasswords();
    log.info(`[PasswordManager] Added/updated password for ${url}`);
    
    return savedPassword;
  }

  async getPassword(url: string, username?: string): Promise<SavedPassword | null> {
    const normalizedUrl = url.toLowerCase();
    
    // Try to find by URL
    let matches = this.passwords.filter(p => 
      normalizedUrl.includes(p.url) || p.url.includes(normalizedUrl)
    );

    if (username) {
      matches = matches.filter(p => p.username.toLowerCase() === username.toLowerCase());
    }

    return matches.length > 0 ? matches[0] : null;
  }

  async getAllPasswords(): Promise<SavedPassword[]> {
    // Return passwords without the actual password field for security
    return this.passwords.map(p => ({
      ...p,
      password: '••••••••',
    }));
  }

  async deletePassword(id: string): Promise<boolean> {
    const index = this.passwords.findIndex(p => p.id === id);
    if (index < 0) return false;

    this.passwords.splice(index, 1);
    await this.savePasswords();
    log.info(`[PasswordManager] Deleted password ${id}`);
    return true;
  }

  async clearAllPasswords(): Promise<void> {
    this.passwords = [];
    await this.savePasswords();
    log.info('[PasswordManager] Cleared all passwords');
  }

  getStats(): PasswordStats {
    return {
      count: this.passwords.length,
      lastUpdated: this.passwords.length > 0 
        ? Math.max(...this.passwords.map(p => p.updatedAt))
        : null,
    };
  }

  async addProfileInfo(url: string, info: ProfileInfo): Promise<SavedProfile> {
    const normalizedUrl = url.toLowerCase();
    const existingIndex = this.profiles.findIndex(p => p.url === normalizedUrl);

    const savedProfile: SavedProfile = {
      id: existingIndex >= 0 ? this.profiles[existingIndex].id : crypto.randomUUID(),
      url: normalizedUrl,
      info: {
        ...info,
        extraFields: { ...info.extraFields }
      },
      createdAt: existingIndex >= 0 ? this.profiles[existingIndex].createdAt : Date.now(),
      updatedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      this.profiles[existingIndex] = savedProfile;
    } else {
      this.profiles.push(savedProfile);
    }

    await this.saveProfiles();
    log.info(`[PasswordManager] Added/updated profile for ${url}`);
    
    return savedProfile;
  }

  async getProfileInfo(url: string): Promise<ProfileInfo | null> {
    const normalizedUrl = url.toLowerCase();
    
    const match = this.profiles.find(p => 
      normalizedUrl.includes(p.url) || p.url.includes(normalizedUrl)
    );

    return match ? match.info : null;
  }

  async getAllProfiles(): Promise<SavedProfile[]> {
    return this.profiles.map(p => ({
      ...p,
      info: {
        ...p.info,
        extraFields: { ...p.info.extraFields }
      }
    }));
  }

  async deleteProfile(id: string): Promise<boolean> {
    const index = this.profiles.findIndex(p => p.id === id);
    if (index < 0) return false;

    this.profiles.splice(index, 1);
    await this.saveProfiles();
    log.info(`[PasswordManager] Deleted profile ${id}`);
    return true;
  }
}

let passwordManagerService: PasswordManagerService | null = null;

export function getPasswordManagerService(): PasswordManagerService {
  if (!passwordManagerService) {
    passwordManagerService = new PasswordManagerService();
  }
  return passwordManagerService;
}
