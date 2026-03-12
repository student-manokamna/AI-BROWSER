import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

let log: any = console;

export interface SyncData {
  passwords: any[];
  bookmarks: any[];
  settings: any;
  history: any[];
  lastSync: number;
}

export interface SyncStatus {
  enabled: boolean;
  email: string | null;
  lastSync: number | null;
  status: 'idle' | 'syncing' | 'error' | 'success';
}

export class SyncService {
  private dataDir: string = '';
  private syncFile: string = '';
  private encryptionKey: Buffer | null = null;
  private syncStatus: SyncStatus = {
    enabled: false,
    email: null,
    lastSync: null,
    status: 'idle',
  };
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
      this.dataDir = path.join(app.getPath('userData'), 'sync');
      this.syncFile = path.join(this.dataDir, 'sync-state.json');
    } catch (err) {
      log.error('Failed to get Electron app paths', err);
      return;
    }

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Generate or load encryption key
    await this.loadOrCreateEncryptionKey();
    
    // Load sync status
    this.loadSyncStatus();
    
    this.initialized = true;
    log.info('[Sync] Initialized');
  }

  private async loadOrCreateEncryptionKey(): Promise<void> {
    const keyFile = path.join(this.dataDir, '.key');
    
    if (fs.existsSync(keyFile)) {
      this.encryptionKey = fs.readFileSync(keyFile);
    } else {
      this.encryptionKey = crypto.randomBytes(32);
      fs.writeFileSync(keyFile, this.encryptionKey);
    }
  }

  private loadSyncStatus(): void {
    if (fs.existsSync(this.syncFile)) {
      try {
        const data = fs.readFileSync(this.syncFile, 'utf-8');
        this.syncStatus = JSON.parse(data);
      } catch (err) {
        log.error('[Sync] Failed to load sync status:', err);
      }
    }
  }

  private saveSyncStatus(): void {
    try {
      fs.writeFileSync(this.syncFile, JSON.stringify(this.syncStatus, null, 2), 'utf-8');
    } catch (err) {
      log.error('[Sync] Failed to save sync status:', err);
    }
  }

  encrypt(data: string): string {
    if (!this.encryptionKey) throw new Error('Encryption key not available');
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  decrypt(encryptedData: string): string {
    if (!this.encryptionKey) throw new Error('Encryption key not available');
    
    const parts = encryptedData.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted data format');
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  async enableSync(email: string): Promise<void> {
    this.syncStatus = {
      enabled: true,
      email,
      lastSync: null,
      status: 'idle',
    };
    this.saveSyncStatus();
    log.info(`[Sync] Enabled for ${email}`);
  }

  async disableSync(): Promise<void> {
    this.syncStatus = {
      enabled: false,
      email: null,
      lastSync: null,
      status: 'idle',
    };
    this.saveSyncStatus();
    log.info('[Sync] Disabled');
  }

  getStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  async sync(): Promise<boolean> {
    if (!this.syncStatus.enabled) {
      log.warn('[Sync] Sync not enabled');
      return false;
    }

    this.syncStatus.status = 'syncing';
    this.saveSyncStatus();

    try {
      // TODO: Implement actual Google Drive/Drive API sync
      // For now, this is a placeholder that demonstrates the architecture
      
      log.info(`[Sync] Syncing with ${this.syncStatus.email}...`);
      
      // Simulate sync operation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.syncStatus.lastSync = Date.now();
      this.syncStatus.status = 'success';
      this.saveSyncStatus();
      
      log.info('[Sync] Sync completed');
      return true;
    } catch (err) {
      log.error('[Sync] Sync failed:', err);
      this.syncStatus.status = 'error';
      this.saveSyncStatus();
      return false;
    }
  }

  async exportData(): Promise<string> {
    const passwordManager = require('./services/PasswordManagerService');
    const settingsService = require('./services/SettingsService');
    
    const data: SyncData = {
      passwords: await passwordManager.getPasswordManagerService().getAllPasswords(),
      bookmarks: [], // TODO: Implement bookmarks
      settings: settingsService.getSettingsService().getAll(),
      history: [], // TODO: Implement history
      lastSync: Date.now(),
    };

    // Encrypt the data before returning
    return this.encrypt(JSON.stringify(data));
  }

  async importData(encryptedData: string): Promise<void> {
    const data = JSON.parse(this.decrypt(encryptedData));
    
    // Import passwords
    if (data.passwords && Array.isArray(data.passwords)) {
      const passwordManager = require('./services/PasswordManagerService');
      for (const pwd of data.passwords) {
        await passwordManager.getPasswordManagerService().addPassword(
          pwd.url,
          pwd.username,
          pwd.password
        );
      }
    }

    // Import settings
    if (data.settings) {
      const settingsService = require('./services/SettingsService');
      settingsService.getSettingsService().setMultiple(data.settings);
    }

    log.info('[Sync] Data imported');
  }
}

let syncService: SyncService | null = null;

export function getSyncService(): SyncService {
  if (!syncService) {
    syncService = new SyncService();
  }
  return syncService;
}
