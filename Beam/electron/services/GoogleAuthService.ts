import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { shell } from "electron";
import { getSessionService } from './SessionService';

let log: any = console;

// Load .env from multiple possible locations (works in both dev and packaged)
function loadEnv() {
  const possiblePaths: string[] = [];
  
  // Development paths
  possiblePaths.push(path.join(__dirname, '..', '.env'));
  possiblePaths.push(path.join(__dirname, '.env'));
  possiblePaths.push(path.join(process.cwd(), 'electron', '.env'));
  possiblePaths.push(path.join(process.cwd(), '.env'));
  
  // Packaged app paths
  if (process.resourcesPath) {
    possiblePaths.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', '.env'));
    possiblePaths.push(path.join(process.resourcesPath, 'app', 'electron', '.env'));
    possiblePaths.push(path.join(process.resourcesPath, 'electron', '.env'));
  }
  
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const envLines = envContent.split('\n');
      for (const line of envLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            process.env[key] = valueParts.join('=').trim();
          }
        }
      }
      console.log('[GoogleAuth] Loaded .env from:', envPath);
      break;
    }
  }
  
  console.log('[GoogleAuth] CLIENT_ID loaded:', process.env.CLIENT_ID ? 'yes' : 'no');
}
loadEnv();

const GOOGLE_CLIENT_ID = process.env.CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = 'http://localhost:8844/oauth/callback';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_DRIVE_URL = 'https://www.googleapis.com/drive/v3/about';

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export interface SyncData {
  passwords: any[];
  bookmarks: any[];
  history: any[];
  settings: any;
  lastModified: number;
}

export class GoogleAuthService {
  private dataDir: string = '';
  private tokenFile: string = '';
  private userFile: string = '';
  private syncDataFile: string = '';
  private tokens: GoogleTokens | null = null;
  private user: GoogleUser | null = null;
  private initialized: boolean = false;
  private authWindow: BrowserWindow | null = null;
  private codeVerifier: string = '';
  private authCallback: ((tokens: GoogleTokens | null, error?: string) => void) | null = null;
  private callbackServer: http.Server | null = null;

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
      this.dataDir = path.join(app.getPath('userData'), 'google-sync');
    } catch (err) {
      log.error('Failed to get Electron app paths', err);
      return;
    }

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.tokenFile = path.join(this.dataDir, 'tokens.enc');
    this.userFile = path.join(this.dataDir, 'user.json');
    this.syncDataFile = path.join(this.dataDir, 'sync-data.json');

    await this.loadTokens();
    await this.loadUser();
    
    // Restore Google session cookies if we have tokens
    if (this.tokens?.access_token) {
      await this.setGoogleSessionCookies();
    }
    
    this.initialized = true;
    log.info('[GoogleAuth] Initialized');
  }

  private async loadTokens(): Promise<void> {
    if (!fs.existsSync(this.tokenFile)) return;

    try {
      const encryptedData = fs.readFileSync(this.tokenFile);
      const { safeStorage } = require('electron');
      
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(encryptedData);
        this.tokens = JSON.parse(decrypted);
        log.info('[GoogleAuth] Loaded tokens');
        
        if (this.tokens && this.isTokenExpired()) {
          await this.refreshAccessToken();
        }
      }
    } catch (err) {
      log.error('[GoogleAuth] Failed to load tokens:', err);
    }
  }

  private async saveTokens(): Promise<void> {
    if (!this.tokens) return;

    try {
      const { safeStorage } = require('electron');
      const data = JSON.stringify(this.tokens);
      
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(data);
        fs.writeFileSync(this.tokenFile, encrypted);
      } else {
        fs.writeFileSync(this.tokenFile, data, 'utf-8');
      }
      log.info('[GoogleAuth] Saved tokens');
    } catch (err) {
      log.error('[GoogleAuth] Failed to save tokens:', err);
    }
  }

  private async loadUser(): Promise<void> {
    if (!fs.existsSync(this.userFile)) return;

    try {
      const data = fs.readFileSync(this.userFile, 'utf-8');
      this.user = JSON.parse(data);
    } catch (err) {
      log.error('[GoogleAuth] Failed to load user:', err);
    }
  }

  private async saveUser(): Promise<void> {
    if (!this.user) return;

    try {
      fs.writeFileSync(this.userFile, JSON.stringify(this.user, null, 2), 'utf-8');
    } catch (err) {
      log.error('[GoogleAuth] Failed to save user:', err);
    }
  }

  private isTokenExpired(): boolean {
    if (!this.tokens) return true;
    const expiryTime = Date.now() + (this.tokens.expires_in * 1000);
    return Date.now() > (expiryTime - 5 * 60 * 1000);
  }

  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    const hash = crypto.createHash('sha256').update(verifier).digest('base64url');
    return hash;
  }

  getAuthUrl(): string {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new Error('Google OAuth not configured. Please add CLIENT_ID and CLIENT_SECRET to electron/.env');
    }
    
    this.codeVerifier = this.generateCodeVerifier();
    
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      code_challenge: this.generateCodeChallenge(this.codeVerifier),
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  private startCallbackServer(): void {
    this.callbackServer = http.createServer((req, res) => {
      const url = new URL(req.url!, 'http://localhost:8844');

      if (url.pathname === '/oauth/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html><body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f0f0f;color:white">
            <h2>✅ Beam connected successfully!</h2>
            <p>You can close this tab and return to Beam.</p>
          </body></html>
        `);

        this.callbackServer?.close();
        this.callbackServer = null;

        if (error) {
          this.authCallback?.(null, error);
        } else if (code) {
          this.exchangeCodeForTokens(code);
        }
      }
    });

    this.callbackServer.listen(8844, 'localhost', () => {
      log.info('[GoogleAuth] Callback server listening on port 8844');
    });
  }

  async startAuthFlow(mainWindow: BrowserWindow): Promise<{ tokens: GoogleTokens | null; user: GoogleUser | null; error?: string }> {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      log.error('[GoogleAuth] CLIENT_ID or CLIENT_SECRET not configured');
      return { tokens: null, user: null, error: 'Google OAuth credentials not configured. Please add CLIENT_ID and CLIENT_SECRET to electron/.env file.' };
    }

    return new Promise((resolve) => {
      this.authCallback = (tokens, error) => {
        resolve({ tokens, user: this.user, error });
        this.authCallback = null;
      };

      const authUrl = this.getAuthUrl();

      // Start HTTP server to catch the OAuth callback
      this.startCallbackServer();

      try {
        shell.openExternal(authUrl);
        log.info('[GoogleAuth] Opened Google OAuth in external browser');
      } catch (error) {
        log.error('[GoogleAuth] Failed to open Google OAuth URL', error);
        this.callbackServer?.close();
        this.callbackServer = null;
        if (this.authCallback) {
          this.authCallback(null, 'Failed to open browser for Google authentication');
        }
      }
    });
  }

  private async exchangeCodeForTokens(code: string): Promise<void> {
    try {
      const data = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        code_verifier: this.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_REDIRECT_URI,
      });

      const response = await this.makeRequest('POST', GOOGLE_TOKEN_URL, data.toString(), {
        'Content-Type': 'application/x-www-form-urlencoded',
      });

      this.tokens = response as GoogleTokens;
      await this.saveTokens();
      
      await this.fetchUserInfo();
      
      // Set Google session cookies for browser authentication
      await this.setGoogleSessionCookies();
      
      this.authWindow?.close();
      this.authCallback?.(this.tokens);
      
      log.info('[GoogleAuth] Auth flow completed');
    } catch (err: any) {
      log.error('[GoogleAuth] Token exchange failed:', err);
      this.authWindow?.close();
      this.authCallback?.(null, err.message);
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refresh_token) {
      log.warn('[GoogleAuth] No refresh token available');
      return;
    }

    try {
      const data = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: this.tokens.refresh_token,
        grant_type: 'refresh_token',
      });

      const response = await this.makeRequest('POST', GOOGLE_TOKEN_URL, data.toString(), {
        'Content-Type': 'application/x-www-form-urlencoded',
      });

      const newTokens = response as any;
      this.tokens = {
        ...this.tokens,
        ...newTokens,
        refresh_token: this.tokens.refresh_token,
      };
      
      await this.saveTokens();
      log.info('[GoogleAuth] Token refreshed');
    } catch (err) {
      log.error('[GoogleAuth] Token refresh failed:', err);
      this.tokens = null;
      this.user = null;
    }
  }

  private async fetchUserInfo(): Promise<void> {
    if (!this.tokens?.access_token) return;

    try {
      const userInfo = await this.makeRequest('GET', GOOGLE_USERINFO_URL, '', {
        'Authorization': `Bearer ${this.tokens.access_token}`,
      });

      this.user = {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      };

      await this.saveUser();
    } catch (err) {
      log.error('[GoogleAuth] Failed to fetch user info:', err);
    }
  }

  private async setGoogleSessionCookies(): Promise<void> {
    try {
      if (!this.tokens?.access_token) return;

      const partitionSession = session.fromPartition('persist:beam');
      
      // Set Google session cookies for authentication
      // These cookies are required for Google services like Gmail and YouTube
      const cookiesToSet = [
        { name: 'SID', value: this.tokens.access_token, domain: '.google.com' },
        { name: 'HSID', value: this.tokens.access_token, domain: '.google.com' },
        { name: 'SSID', value: this.tokens.access_token, domain: '.google.com' },
        { name: 'APISID', value: this.tokens.access_token, domain: '.google.com' },
        { name: 'SAPISID', value: this.tokens.access_token, domain: '.google.com' },
      ];

      for (const cookieData of cookiesToSet) {
        try {
          await partitionSession.cookies.set({
            url: 'https://google.com',
            name: cookieData.name,
            value: cookieData.value,
            domain: cookieData.domain,
            path: '/',
            secure: true,
            httpOnly: true,
            sameSite: 'no_restriction'
          });
        } catch (e) {
          // Some cookies might fail to set, that's okay
          log.warn(`[GoogleAuth] Failed to set cookie ${cookieData.name}:`, e);
        }
      }

      log.info('[GoogleAuth] Set Google session cookies');
    } catch (err) {
      log.error('[GoogleAuth] Failed to set session cookies:', err);
    }
  }

  private makeRequest(method: string, url: string, data: string, headers: Record<string, string> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers,
      };

      const req = lib.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(json.error?.message || `HTTP ${res.statusCode}`));
            }
          } catch {
            reject(new Error('Invalid response'));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) {
        req.write(data);
      }
      req.end();
    });
  }

  isAuthenticated(): boolean {
    return !!this.tokens && !!this.user;
  }

  getUser(): GoogleUser | null {
    return this.user;
  }

  getAccessToken(): string | null {
    return this.tokens?.access_token || null;
  }

  async logout(): Promise<void> {
    this.tokens = null;
    this.user = null;
    
    if (fs.existsSync(this.tokenFile)) {
      fs.unlinkSync(this.tokenFile);
    }
    if (fs.existsSync(this.userFile)) {
      fs.unlinkSync(this.userFile);
    }

    log.info('[GoogleAuth] Logged out');
  }

  // Sync methods
  async exportSyncData(): Promise<string> {
    const passwordManager = require('./PasswordManagerService');
    const settingsService = require('./SettingsService');

    const data: SyncData = {
      passwords: await passwordManager.getPasswordManagerService().getAllPasswords(),
      bookmarks: [],
      history: [],
      settings: settingsService.getSettingsService().getAll(),
      lastModified: Date.now(),
    };

    return JSON.stringify(data);
  }

  async importSyncData(jsonData: string): Promise<void> {
    const data: SyncData = JSON.parse(jsonData);
    
    const passwordManager = require('./PasswordManagerService');
    const settingsService = require('./services/SettingsService');

    if (data.passwords) {
      for (const pwd of data.passwords) {
        await passwordManager.getPasswordManagerService().addPassword(
          pwd.url,
          pwd.username,
          pwd.password
        );
      }
    }

    if (data.settings) {
      settingsService.getSettingsService().setMultiple(data.settings);
    }

    log.info('[GoogleAuth] Sync data imported');
  }

  async uploadToDrive(data: string): Promise<boolean> {
    if (!this.tokens?.access_token) {
      log.warn('[GoogleAuth] Not authenticated');
      return false;
    }

    try {
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadata = {
        name: 'sovereign-browser-sync.json',
        mimeType: 'application/json',
      };

      const multipartBody = delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/octet-stream\r\n\r\n' +
        data +
        closeDelimiter;

      let fileId: string | null = null;
      
      try {
        const listResponse = await this.makeRequest('GET', 
          `${GOOGLE_DRIVE_URL}?q=name='sovereign-browser-sync.json'`, 
          '', 
          { 'Authorization': `Bearer ${this.tokens.access_token}` }
        );
        
        if (listResponse.files && listResponse.files.length > 0) {
          fileId = listResponse.files[0].id;
        }
      } catch (e) {
        // File doesn't exist, will create new
      }

      const uploadUrl = fileId 
        ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

      const response = await this.makeRequest('POST', uploadUrl, multipartBody, {
        'Authorization': `Bearer ${this.tokens.access_token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      });

      log.info('[GoogleAuth] Uploaded to Drive');
      return true;
    } catch (err) {
      log.error('[GoogleAuth] Upload failed:', err);
      return false;
    }
  }

  async downloadFromDrive(): Promise<string | null> {
    if (!this.tokens?.access_token) {
      log.warn('[GoogleAuth] Not authenticated');
      return null;
    }

    try {
      const listResponse = await this.makeRequest('GET', 
        `${GOOGLE_DRIVE_URL}?q=name='sovereign-browser-sync.json'`, 
        '', 
        { 'Authorization': `Bearer ${this.tokens.access_token}` }
      );

      if (!listResponse.files || listResponse.files.length === 0) {
        log.info('[GoogleAuth] No sync file found on Drive');
        return null;
      }

      const fileId = listResponse.files[0].id;
      
      const downloadResponse = await this.makeRequest('GET', 
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, 
        '', 
        { 'Authorization': `Bearer ${this.tokens.access_token}` }
      );

      log.info('[GoogleAuth] Downloaded from Drive');
      return downloadResponse;
    } catch (err) {
      log.error('[GoogleAuth] Download failed:', err);
      return null;
    }
  }

  async sync(): Promise<boolean> {
    if (!this.isAuthenticated()) {
      log.warn('[GoogleAuth] Not authenticated');
      return false;
    }

    try {
      const localData = await this.exportSyncData();
      await this.uploadToDrive(localData);
      
      const remoteData = await this.downloadFromDrive();
      if (remoteData) {
        await this.importSyncData(remoteData);
      }

      log.info('[GoogleAuth] Sync completed');
      return true;
    } catch (err) {
      log.error('[GoogleAuth] Sync failed:', err);
      return false;
    }
  }
}

let googleAuthService: GoogleAuthService | null = null;

export function getGoogleAuthService(): GoogleAuthService {
  if (!googleAuthService) {
    googleAuthService = new GoogleAuthService();
  }
  return googleAuthService;
}




// import { app, BrowserWindow, session } from 'electron';
// import path from 'path';
// import fs from 'fs';
// import crypto from 'crypto';
// import https from 'https';
// import http from 'http';
// import { URL } from 'url';
// import { shell } from "electron";

// let log: any = console;

// // Load .env from multiple possible locations (works in both dev and packaged)
// function loadEnv() {
//   const possiblePaths: string[] = [];
  
//   // Development paths
//   possiblePaths.push(path.join(__dirname, '..', '.env'));
//   possiblePaths.push(path.join(__dirname, '.env'));
//   possiblePaths.push(path.join(process.cwd(), 'electron', '.env'));
//   possiblePaths.push(path.join(process.cwd(), '.env'));
  
//   // Packaged app paths
//   if (process.resourcesPath) {
//     possiblePaths.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', '.env'));
//     possiblePaths.push(path.join(process.resourcesPath, 'app', 'electron', '.env'));
//     possiblePaths.push(path.join(process.resourcesPath, 'electron', '.env'));
//   }
  
//   for (const envPath of possiblePaths) {
//     if (fs.existsSync(envPath)) {
//       const envContent = fs.readFileSync(envPath, 'utf-8');
//       const envLines = envContent.split('\n');
//       for (const line of envLines) {
//         const trimmed = line.trim();
//         if (trimmed && !trimmed.startsWith('#')) {
//           const [key, ...valueParts] = trimmed.split('=');
//           if (key && valueParts.length > 0) {
//             process.env[key] = valueParts.join('=').trim();
//           }
//         }
//       }
//       console.log('[GoogleAuth] Loaded .env from:', envPath);
//       break;
//     }
//   }
  
//   console.log('[GoogleAuth] CLIENT_ID loaded:', process.env.CLIENT_ID ? 'yes' : 'no');
// }
// loadEnv();

// const GOOGLE_CLIENT_ID = process.env.CLIENT_ID || '';
// const GOOGLE_CLIENT_SECRET = process.env.CLIENT_SECRET || '';
// const GOOGLE_REDIRECT_URI = 'http://localhost:8844/oauth/callback';

// const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
// const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
// const GOOGLE_DRIVE_URL = 'https://www.googleapis.com/drive/v3/about';

// const SCOPES = [
//   'https://www.googleapis.com/auth/userinfo.email',
//   'https://www.googleapis.com/auth/userinfo.profile',
//   'https://www.googleapis.com/auth/drive.file',
// ].join(' ');

// export interface GoogleTokens {
//   access_token: string;
//   refresh_token: string;
//   expires_in: number;
//   scope: string;
//   token_type: string;
// }

// export interface GoogleUser {
//   id: string;
//   email: string;
//   name: string;
//   picture: string;
// }

// export interface SyncData {
//   passwords: any[];
//   bookmarks: any[];
//   history: any[];
//   settings: any;
//   lastModified: number;
// }

// export class GoogleAuthService {
//   private dataDir: string = '';
//   private tokenFile: string = '';
//   private userFile: string = '';
//   private syncDataFile: string = '';
//   private tokens: GoogleTokens | null = null;
//   private user: GoogleUser | null = null;
//   private initialized: boolean = false;
//   private authWindow: BrowserWindow | null = null;
//   private codeVerifier: string = '';
//   private authCallback: ((tokens: GoogleTokens | null, error?: string) => void) | null = null;

//   constructor() {}

//   async init(): Promise<void> {
//     if (this.initialized) return;

//     try {
//       const electronLog = require('electron-log');
//       log = electronLog;
//     } catch (err) {
//       console.warn('electron-log not available');
//     }

//     try {
//       const { app } = require('electron');
//       this.dataDir = path.join(app.getPath('userData'), 'google-sync');
//     } catch (err) {
//       log.error('Failed to get Electron app paths', err);
//       return;
//     }

//     if (!fs.existsSync(this.dataDir)) {
//       fs.mkdirSync(this.dataDir, { recursive: true });
//     }

//     this.tokenFile = path.join(this.dataDir, 'tokens.enc');
//     this.userFile = path.join(this.dataDir, 'user.json');
//     this.syncDataFile = path.join(this.dataDir, 'sync-data.json');

//     await this.loadTokens();
//     await this.loadUser();
    
//     this.initialized = true;
//     log.info('[GoogleAuth] Initialized');
//   }

//   private async loadTokens(): Promise<void> {
//     if (!fs.existsSync(this.tokenFile)) return;

//     try {
//       const encryptedData = fs.readFileSync(this.tokenFile);
//       const { safeStorage } = require('electron');
      
//       if (safeStorage.isEncryptionAvailable()) {
//         const decrypted = safeStorage.decryptString(encryptedData);
//         this.tokens = JSON.parse(decrypted);
//         log.info('[GoogleAuth] Loaded tokens');
        
//         // Check if token needs refresh
//         if (this.tokens && this.isTokenExpired()) {
//           await this.refreshAccessToken();
//         }
//       }
//     } catch (err) {
//       log.error('[GoogleAuth] Failed to load tokens:', err);
//     }
//   }

//   private async saveTokens(): Promise<void> {
//     if (!this.tokens) return;

//     try {
//       const { safeStorage } = require('electron');
//       const data = JSON.stringify(this.tokens);
      
//       if (safeStorage.isEncryptionAvailable()) {
//         const encrypted = safeStorage.encryptString(data);
//         fs.writeFileSync(this.tokenFile, encrypted);
//       } else {
//         fs.writeFileSync(this.tokenFile, data, 'utf-8');
//       }
//       log.info('[GoogleAuth] Saved tokens');
//     } catch (err) {
//       log.error('[GoogleAuth] Failed to save tokens:', err);
//     }
//   }

//   private async loadUser(): Promise<void> {
//     if (!fs.existsSync(this.userFile)) return;

//     try {
//       const data = fs.readFileSync(this.userFile, 'utf-8');
//       this.user = JSON.parse(data);
//     } catch (err) {
//       log.error('[GoogleAuth] Failed to load user:', err);
//     }
//   }

//   private async saveUser(): Promise<void> {
//     if (!this.user) return;

//     try {
//       fs.writeFileSync(this.userFile, JSON.stringify(this.user, null, 2), 'utf-8');
//     } catch (err) {
//       log.error('[GoogleAuth] Failed to save user:', err);
//     }
//   }

//   private isTokenExpired(): boolean {
//     if (!this.tokens) return true;
//     // Consider expired if less than 5 minutes remaining
//     const expiryTime = Date.now() + (this.tokens.expires_in * 1000);
//     return Date.now() > (expiryTime - 5 * 60 * 1000);
//   }

//   private generateCodeVerifier(): string {
//     return crypto.randomBytes(32).toString('base64url');
//   }

//   private generateCodeChallenge(verifier: string): string {
//     const hash = crypto.createHash('sha256').update(verifier).digest('base64url');
//     return hash;
//   }

//   getAuthUrl(): string {
//     if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
//       throw new Error('Google OAuth not configured. Please add CLIENT_ID and CLIENT_SECRET to electron/.env');
//     }
    
//     this.codeVerifier = this.generateCodeVerifier();
    
//     const params = new URLSearchParams({
//       client_id: GOOGLE_CLIENT_ID,
//       redirect_uri: GOOGLE_REDIRECT_URI,
//       response_type: 'code',
//       scope: SCOPES,
//       code_challenge: this.generateCodeChallenge(this.codeVerifier),
//       code_challenge_method: 'S256',
//       access_type: 'offline',
//       prompt: 'consent',
//     });

//     return `${GOOGLE_AUTH_URL}?${params.toString()}`;
//   }
  
//   async startAuthFlow(mainWindow: BrowserWindow): Promise<{ tokens: GoogleTokens | null; user: GoogleUser | null; error?: string }> {
//     // Check if credentials are configured
//     if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
//       log.error('[GoogleAuth] CLIENT_ID or CLIENT_SECRET not configured');
//       return { tokens: null, user: null, error: 'Google OAuth credentials not configured. Please add CLIENT_ID and CLIENT_SECRET to electron/.env file.' };
//     }

//     return new Promise((resolve) => {
//       this.authCallback = (tokens, error) => {
//         resolve({ tokens, user: this.user, error });
//         this.authCallback = null;
//       };
      
      
//       // Open Google OAuth in user's default browser (Google blocks embedded Electron browsers)
//       const authUrl = this.getAuthUrl();

// try {
//   shell.openExternal(authUrl);
//   log.info("Opened Google OAuth in external browser");
// } catch (error) {
//   log.error("Failed to open Google OAuth URL", error);

//   if (this.authCallback) {
//     this.authCallback(null, "Failed to open browser for Google authentication");
//   }
// }


    

//       // Handle OAuth callback
//       session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://localhost:8844/*'] }, (details, callback) => {
//         const url = new URL(details.url);
        
//         if (url.pathname === '/oauth/callback') {
//           const code = url.searchParams.get('code');
//           const error = url.searchParams.get('error');

//           if (error) {
//             callback({ cancel: true });
//             this.authWindow?.close();
//             this.authCallback?.(null, error);
//             return;
//           }

//           if (code) {
//             callback({ cancel: true });
//             this.exchangeCodeForTokens(code);
//             return;
//           }
//         }

//         callback({});
//       });
//     });
//   }

//   private async exchangeCodeForTokens(code: string): Promise<void> {
//     try {
//       const data = new URLSearchParams({
//         client_id: GOOGLE_CLIENT_ID,
//         client_secret: GOOGLE_CLIENT_SECRET,
//         code,
//         code_verifier: this.codeVerifier,
//         grant_type: 'authorization_code',
//         redirect_uri: GOOGLE_REDIRECT_URI,
//       });

//       const response = await this.makeRequest('POST', GOOGLE_TOKEN_URL, data.toString(), {
//         'Content-Type': 'application/x-www-form-urlencoded',
//       });

//       this.tokens = response as GoogleTokens;
//       await this.saveTokens();
      
//       // Get user info
//       await this.fetchUserInfo();
      
//       this.authWindow?.close();
//       this.authCallback?.(this.tokens);
      
//       log.info('[GoogleAuth] Auth flow completed');
//     } catch (err: any) {
//       log.error('[GoogleAuth] Token exchange failed:', err);
//       this.authWindow?.close();
//       this.authCallback?.(null, err.message);
//     }
//   }

//   private async refreshAccessToken(): Promise<void> {
//     if (!this.tokens?.refresh_token) {
//       log.warn('[GoogleAuth] No refresh token available');
//       return;
//     }

//     try {
//       const data = new URLSearchParams({
//         client_id: GOOGLE_CLIENT_ID,
//         client_secret: GOOGLE_CLIENT_SECRET,
//         refresh_token: this.tokens.refresh_token,
//         grant_type: 'refresh_token',
//       });

//       const response = await this.makeRequest('POST', GOOGLE_TOKEN_URL, data.toString(), {
//         'Content-Type': 'application/x-www-form-urlencoded',
//       });

//       const newTokens = response as any;
//       this.tokens = {
//         ...this.tokens,
//         ...newTokens,
//         refresh_token: this.tokens.refresh_token,
//       };
      
//       await this.saveTokens();
//       log.info('[GoogleAuth] Token refreshed');
//     } catch (err) {
//       log.error('[GoogleAuth] Token refresh failed:', err);
//       this.tokens = null;
//       this.user = null;
//     }
//   }

//   private async fetchUserInfo(): Promise<void> {
//     if (!this.tokens?.access_token) return;

//     try {
//       const userInfo = await this.makeRequest('GET', GOOGLE_USERINFO_URL, '', {
//         'Authorization': `Bearer ${this.tokens.access_token}`,
//       });

//       this.user = {
//         id: userInfo.id,
//         email: userInfo.email,
//         name: userInfo.name,
//         picture: userInfo.picture,
//       };

//       await this.saveUser();
//     } catch (err) {
//       log.error('[GoogleAuth] Failed to fetch user info:', err);
//     }
//   }

//   private makeRequest(method: string, url: string, data: string, headers: Record<string, string> = {}): Promise<any> {
//     return new Promise((resolve, reject) => {
//       const parsedUrl = new URL(url);
//       const isHttps = parsedUrl.protocol === 'https:';
//       const lib = isHttps ? https : http;

//       const options = {
//         hostname: parsedUrl.hostname,
//         port: parsedUrl.port || (isHttps ? 443 : 80),
//         path: parsedUrl.pathname + parsedUrl.search,
//         method,
//         headers,
//       };

//       const req = lib.request(options, (res) => {
//         let body = '';
//         res.on('data', (chunk) => body += chunk);
//         res.on('end', () => {
//           try {
//             const json = JSON.parse(body);
//             if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
//               resolve(json);
//             } else {
//               reject(new Error(json.error?.message || `HTTP ${res.statusCode}`));
//             }
//           } catch {
//             reject(new Error('Invalid response'));
//           }
//         });
//       });

//       req.on('error', reject);
//       req.setTimeout(30000, () => {
//         req.destroy();
//         reject(new Error('Request timeout'));
//       });

//       if (data) {
//         req.write(data);
//       }
//       req.end();
//     });
//   }

//   isAuthenticated(): boolean {
//     return !!this.tokens && !!this.user;
//   }

//   getUser(): GoogleUser | null {
//     return this.user;
//   }

//   getAccessToken(): string | null {
//     return this.tokens?.access_token || null;
//   }

//   async logout(): Promise<void> {
//     this.tokens = null;
//     this.user = null;
    
//     if (fs.existsSync(this.tokenFile)) {
//       fs.unlinkSync(this.tokenFile);
//     }
//     if (fs.existsSync(this.userFile)) {
//       fs.unlinkSync(this.userFile);
//     }

//     log.info('[GoogleAuth] Logged out');
//   }

//   // Sync methods
//   async exportSyncData(): Promise<string> {
//     const passwordManager = require('./PasswordManagerService');
//     const settingsService = require('./SettingsService');

//     const data: SyncData = {
//       passwords: await passwordManager.getPasswordManagerService().getAllPasswords(),
//       bookmarks: [], // TODO: Implement bookmarks
//       history: [], // TODO: Implement history
//       settings: settingsService.getSettingsService().getAll(),
//       lastModified: Date.now(),
//     };

//     return JSON.stringify(data);
//   }

//   async importSyncData(jsonData: string): Promise<void> {
//     const data: SyncData = JSON.parse(jsonData);
    
//     const passwordManager = require('./PasswordManagerService');
//     const settingsService = require('./services/SettingsService');

//     if (data.passwords) {
//       for (const pwd of data.passwords) {
//         await passwordManager.getPasswordManagerService().addPassword(
//           pwd.url,
//           pwd.username,
//           pwd.password
//         );
//       }
//     }

//     if (data.settings) {
//       settingsService.getSettingsService().setMultiple(data.settings);
//     }

//     log.info('[GoogleAuth] Sync data imported');
//   }

//   async uploadToDrive(data: string): Promise<boolean> {
//     if (!this.tokens?.access_token) {
//       log.warn('[GoogleAuth] Not authenticated');
//       return false;
//     }

//     try {
//       const boundary = '-------314159265358979323846';
//       const delimiter = `\r\n--${boundary}\r\n`;
//       const closeDelimiter = `\r\n--${boundary}--`;

//       const metadata = {
//         name: 'sovereign-browser-sync.json',
//         mimeType: 'application/json',
//       };

//       const multipartBody = delimiter +
//         'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
//         JSON.stringify(metadata) +
//         delimiter +
//         'Content-Type: application/octet-stream\r\n\r\n' +
//         data +
//         closeDelimiter;

//       // Check if file exists and get its ID
//       let fileId: string | null = null;
      
//       try {
//         const listResponse = await this.makeRequest('GET', 
//           `${GOOGLE_DRIVE_URL}?q=name='sovereign-browser-sync.json'`, 
//           '', 
//           { 'Authorization': `Bearer ${this.tokens.access_token}` }
//         );
        
//         if (listResponse.files && listResponse.files.length > 0) {
//           fileId = listResponse.files[0].id;
//         }
//       } catch (e) {
//         // File doesn't exist, will create new
//       }

//       const uploadUrl = fileId 
//         ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
//         : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

//       const response = await this.makeRequest('POST', uploadUrl, multipartBody, {
//         'Authorization': `Bearer ${this.tokens.access_token}`,
//         'Content-Type': `multipart/related; boundary="${boundary}"`,
//       });

//       log.info('[GoogleAuth] Uploaded to Drive');
//       return true;
//     } catch (err) {
//       log.error('[GoogleAuth] Upload failed:', err);
//       return false;
//     }
//   }

//   async downloadFromDrive(): Promise<string | null> {
//     if (!this.tokens?.access_token) {
//       log.warn('[GoogleAuth] Not authenticated');
//       return null;
//     }

//     try {
//       const listResponse = await this.makeRequest('GET', 
//         `${GOOGLE_DRIVE_URL}?q=name='sovereign-browser-sync.json'`, 
//         '', 
//         { 'Authorization': `Bearer ${this.tokens.access_token}` }
//       );

//       if (!listResponse.files || listResponse.files.length === 0) {
//         log.info('[GoogleAuth] No sync file found on Drive');
//         return null;
//       }

//       const fileId = listResponse.files[0].id;
      
//       const downloadResponse = await this.makeRequest('GET', 
//         `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, 
//         '', 
//         { 'Authorization': `Bearer ${this.tokens.access_token}` }
//       );

//       log.info('[GoogleAuth] Downloaded from Drive');
//       return downloadResponse;
//     } catch (err) {
//       log.error('[GoogleAuth] Download failed:', err);
//       return null;
//     }
//   }

//   async sync(): Promise<boolean> {
//     if (!this.isAuthenticated()) {
//       log.warn('[GoogleAuth] Not authenticated');
//       return false;
//     }

//     try {
//       // Export local data
//       const localData = await this.exportSyncData();
      
//       // Upload to Drive
//       await this.uploadToDrive(localData);
      
//       // Download from Drive and merge
//       const remoteData = await this.downloadFromDrive();
//       if (remoteData) {
//         await this.importSyncData(remoteData);
//       }

//       log.info('[GoogleAuth] Sync completed');
//       return true;
//     } catch (err) {
//       log.error('[GoogleAuth] Sync failed:', err);
//       return false;
//     }
//   }
// }

// let googleAuthService: GoogleAuthService | null = null;

// export function getGoogleAuthService(): GoogleAuthService {
//   if (!googleAuthService) {
//     googleAuthService = new GoogleAuthService();
//   }
//   return googleAuthService;
// }
