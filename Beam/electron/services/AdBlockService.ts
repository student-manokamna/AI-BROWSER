import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { session } from 'electron';

let log: any = console;

const PARTITION_NAME = 'persist:beam';

const FILTER_LISTS = {
  easylist: 'https://easylist.to/easylist/easylist.txt',
  easyprivacy: 'https://easylist.to/easylist/easyprivacy.txt',
};

interface AdBlockResult {
  matched: boolean;
  filter?: string;
  action?: string;
}

interface BlockRule {
  pattern: RegExp;
  type: 'url' | 'domain';
}

export class AdBlockService {
  private isEnabled: boolean = true;
  private dataDir: string = '';
  private filterFile: string = '';
  private initialized: boolean = false;
  private rulesCount: number = 0;
  private urlPatterns: BlockRule[] = [];
  private domainBlockList: string[] = [];
  private cosmeticFilters: Map<string, string[]> = new Map();
  private registeredWebContents: Set<number> = new Set();

  constructor() {}

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const { app } = require('electron');
      this.dataDir = path.join(app.getPath('userData'), 'adblock');
      this.filterFile = path.join(this.dataDir, 'filters.txt');
    } catch (err) {
      console.error('Failed to get Electron app paths', err);
      return;
    }

    try {
      const electronLog = require('electron-log');
      log = electronLog;
    } catch (err) {
      console.warn('electron-log not available');
    }

    log.info('[AdBlock] Initializing...');

    this.loadBlockRules();
    this.loadCosmeticFiltersInit();
    
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    await this.downloadFilterLists();
    await this.loadFilters();
    
    this.setupSessionBlocking();
    this.setupPartitionBlocking();
    this.initialized = true;
    log.info(`[AdBlock] Initialized with ${this.rulesCount} rules`);
  }

  private loadBlockRules(): void {
    this.urlPatterns = [
      // Generic ad patterns
      { pattern: /\/(?:ads?|advert(?:s|isement|ing)?)\//i, type: 'url' },
      { pattern: /\/(?:ad-?[sz]|banner|popunder|popup)\//i, type: 'url' },
      { pattern: /[_-]ads?[_-]/i, type: 'url' },
      { pattern: /\/adserver\//i, type: 'url' },
      { pattern: /\/admanager\//i, type: 'url' },
      { pattern: /\/adframe\//i, type: 'url' },
      { pattern: /\/adview\//i, type: 'url' },
      { pattern: /\/clicktrack\//i, type: 'url' },
      { pattern: /\/doubleclick\.net\/pagead\/adview\//i, type: 'url' },
      { pattern: /\/doubleclick\.net\/pagead\/interaction\//i, type: 'url' },
      { pattern: /\/doubleclick\.net\/pagead\/virtualadview\//i, type: 'url' },
      { pattern: /\/googlesyndication\.com\/pagead\//i, type: 'url' },
      { pattern: /\/googleadservices\.com\/click\//i, type: 'url' },
      { pattern: /\/pagead\/adview\//i, type: 'url' },
      { pattern: /\/pagead\/interaction\//i, type: 'url' },
      { pattern: /\/pagead\/virtualadview\//i, type: 'url' },
      { pattern: /\/sponsor/i, type: 'url' },
      { pattern: /\/tracking/i, type: 'url' },
      { pattern: /\/beacon\//i, type: 'url' },
      { pattern: /\/pixel\//i, type: 'url' },
      { pattern: /\/analytics/i, type: 'url' },
      { pattern: /\/metrics/i, type: 'url' },
      { pattern: /\/promo\//i, type: 'url' },
      { pattern: /\/affiliate/i, type: 'url' },
      { pattern: /\.ad\//i, type: 'url' },
      { pattern: /\/ads\//i, type: 'url' },
      { pattern: /\/advert\//i, type: 'url' },
      { pattern: /\/pubads\//i, type: 'url' },
      { pattern: /\/adservice\//i, type: 'url' },
      { pattern: /\/adrotator\//i, type: 'url' },
      { pattern: /\/banner\//i, type: 'url' },
      
      // YouTube specific ad patterns - be careful not to break playback
      { pattern: /youtube\.com\/watch.*_ads_/i, type: 'url' },
      { pattern: /youtube\.com\/get_midroll_/i, type: 'url' },
      { pattern: /youtube\.com\/api\/ads\//i, type: 'url' },
      { pattern: /youtube\.com\/youtubei\/v1\/ads\//i, type: 'url' },
      { pattern: /youtube\.com\/player_ads\//i, type: 'url' },
      { pattern: /youtube\.com\/api\/container\/companions/i, type: 'url' },
      { pattern: /ytimg\.com\/ads\//i, type: 'url' },
      { pattern: /ytimg\.com\/vi\/[^\/]+\/ad/i, type: 'url' },
      { pattern: /s\.youtube\.com\/site\//i, type: 'url' },
      { pattern: /s\.youtube\.com\/dynamic\//i, type: 'url' },
      // Only block very specific ad-related paths, not entire domains
      { pattern: /pagead2\.googlesyndication\.com\/pagead\/adview\//i, type: 'url' },
      { pattern: /pagead2\.googlesyndication\.com\/pagead\/interaction\//i, type: 'url' },
      { pattern: /googleads\.g\.doubleclick\.net\/pagead\//i, type: 'url' },
      
      // Video ad patterns
      { pattern: /\/vast\//i, type: 'url' },
      { pattern: /\/ima3?\//i, type: 'url' },
      { pattern: /\/preroll\//i, type: 'url' },
      { pattern: /\/midroll\//i, type: 'url' },
      { pattern: /\/postroll\//i, type: 'url' },
      
      // Ad network domains (more specific)
      { pattern: /\/doubleclick\.net\/pagead\/adview\//i, type: 'url' },
      { pattern: /\/doubleclick\.net\/pagead\/interaction\//i, type: 'url' },
      { pattern: /\/doubleclick\.net\/pagead\/virtualadview\//i, type: 'url' },
      { pattern: /\/googlesyndication\.com\/pagead\//i, type: 'url' },
      { pattern: /\/googleadservices\.com\/click\//i, type: 'url' },
      { pattern: /\/adnxs\./i, type: 'url' },
      { pattern: /\/criteo\./i, type: 'url' },
      { pattern: /\/taboola\./i, type: 'url' },
      { pattern: /\/outbrain\./i, type: 'url' },
    ];

    this.domainBlockList = [
      // Google ads - be careful not to break YouTube
      'google-analytics.com',
      'googletag.com',
      'googletagmanager.com',
      'adservice.google.com',
      'adsense.google.com',
      'partner.googleadservices.com',
      // Social media ads
      'ads.facebook.com',
      'pixel.facebook.com',
      'ads.twitter.com',
      'ads.linkedin.com',
      // Ad networks
      'advertising.com',
      'adnxs.com',
      'adsrvr.org',
      'adform.net',
      'criteo.com',
      'criteo.net',
      'taboola.com',
      'outbrain.com',
      'mgid.com',
      'revcontent.com',
      'popads.net',
      'popcash.net',
      'exoclick.com',
      'trafficjunky.com',
      'moatads.com',
      'quantserve.com',
      'scorecardresearch.com',
      'smartadserver.com',
      'openx.net',
      '2mdn.net',
      'ads.yahoo.com',
      'adcolony.com',
      'admob.com',
      'bidswitch.net',
      'casalemedia.com',
      'contextweb.com',
      'pubmatic.com',
      'rubiconproject.com',
    ];

    log.info(`[AdBlock] Loaded ${this.urlPatterns.length} URL patterns and ${this.domainBlockList.length} domain rules`);
  }

  private async downloadFilterLists(): Promise<void> {
    const allFilters: string[] = [];

    for (const [name, url] of Object.entries(FILTER_LISTS)) {
      try {
        const content = await this.fetchUrl(url);
        if (content) {
          const lines = content.split('\n').filter((line: string) => {
            const trimmed = line.trim();
            return trimmed && !trimmed.startsWith('!') && !trimmed.startsWith('[');
          });
          allFilters.push(...lines);
          log.info(`[AdBlock] Downloaded ${name}: ${lines.length} rules`);
        }
      } catch (err) {
        log.error(`[AdBlock] Failed to download ${name}:`, err);
      }
    }

    if (allFilters.length > 0) {
      fs.writeFileSync(this.filterFile, allFilters.join('\n'), 'utf-8');
    }
  }

  private fetchUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const req = protocol.get(url, { headers: { 'User-Agent': 'BeamBrowser/1.0' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this.fetchUrl(res.headers.location).then(resolve).catch(reject);
          return;
        }
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    });
  }

  private async loadFilters(): Promise<void> {
    if (!fs.existsSync(this.filterFile)) {
      log.warn('[AdBlock] No filter file found');
      return;
    }

    try {
      const content = fs.readFileSync(this.filterFile, 'utf-8');
      const lines = content.split('\n').filter((line: string) => line.trim());
      
      let networkFilters = 0;
      let cosmeticFilters = 0;

      for (const line of lines) {
        if (line.includes('##') || line.includes('#?#') || line.includes('#@#')) {
          cosmeticFilters++;
          this.parseCosmeticFilter(line);
        } else if (!line.startsWith('!') && !line.startsWith('[')) {
          networkFilters++;
        }
      }

      this.rulesCount = networkFilters + this.urlPatterns.length;
      log.info(`[AdBlock] Loaded ${networkFilters} network filters, ${cosmeticFilters} cosmetic filters`);
    } catch (err) {
      log.error('[AdBlock] Failed to load filters:', err);
    }
  }

  private parseCosmeticFilter(line: string): void {
    try {
      const parts = line.split('##');
      if (parts.length !== 2) return;
      
      const domainPart = parts[0];
      const selector = parts[1].trim();
      if (!selector) return;

      const domains = domainPart ? domainPart.split(',').map(d => d.trim()) : [''];
      for (const domain of domains) {
        const key = domain || '*';
        if (!this.cosmeticFilters.has(key)) {
          this.cosmeticFilters.set(key, []);
        }
        const selectors = this.cosmeticFilters.get(key)!;
        if (!selectors.includes(selector)) {
          selectors.push(selector);
        }
      }
    } catch (e) {}
  }

  private loadCosmeticFiltersInit(): void {
    // Initialize empty - will be populated when filters are loaded
    this.cosmeticFilters = new Map();
  }

  checkUrl(url: string): AdBlockResult {
    log.info(`[AdBlock] Checking URL: ${url}`);
    
    if (!this.isEnabled) {
      return { matched: false };
    }

    try {
      // Check URL patterns first
      for (const rule of this.urlPatterns) {
        if (rule.pattern.test(url)) {
          log.info(`[AdBlock] BLOCKED (pattern): ${url} matched ${rule.pattern.source}`);
          return { matched: true, filter: rule.pattern.source, action: 'block' };
        }
      }

      // Check domain blocklist
      try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        
        for (const blocked of this.domainBlockList) {
          if (hostname === blocked || hostname.endsWith('.' + blocked)) {
            log.info(`[AdBlock] BLOCKED (domain): ${url} matched ${blocked}`);
            return { matched: true, filter: blocked, action: 'block' };
          }
        }
      } catch (e) {}

      log.info(`[AdBlock] ALLOWED: ${url}`);
      return { matched: false };
    } catch (err) {
      log.error('[AdBlock] Error checking URL:', err);
      return { matched: false };
    }
  }

  private setupSessionBlocking(): void {
    const defaultSession = session.defaultSession;

    defaultSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (details: any, callback: any) => {
        log.info(`[AdBlock Session] onBeforeRequest: ${details.url}`);
        
        if (!this.isEnabled) {
          callback({});
          return;
        }

        const url = details.url;
        
        // Skip internal URLs
        if (url.startsWith('chrome-extension://') || 
            url.startsWith('chrome://') ||
            url.startsWith('devtools://') ||
            url.startsWith('sovereign://') ||
            url.startsWith('beam://') ||
            url.startsWith('file://') ||
            url.startsWith('about:')) {
          callback({});
          return;
        }

        const result = this.checkUrl(url);
        if (result.matched) {
          log.info(`[AdBlock Session] BLOCKING: ${url}`);
          callback({ cancel: true });
        } else {
          callback({});
        }
      }
    );

    defaultSession.webRequest.onHeadersReceived(
      { urls: ['http://*/*', 'https://*/*'] },
      (details: any, callback: any) => {
        const url = details.url;
        
        // Skip internal URLs
        if (url.startsWith('chrome-extension://') || 
            url.startsWith('chrome://') ||
            url.startsWith('devtools://') ||
            url.startsWith('sovereign://') ||
            url.startsWith('file://') ||
            url.startsWith('about:')) {
          callback({});
          return;
        }

        // Modify CSP to allow more scripts
        if (details.responseHeaders) {
          const headers = { ...details.responseHeaders };
          if (headers['content-security-policy'] && headers['content-security-policy'].length > 0) {
            let csp = headers['content-security-policy'][0];
            if (!csp.includes("'unsafe-inline'")) {
              csp = csp.replace(/script-src([^;]*)/, "script-src$1 'unsafe-inline'");
              headers['content-security-policy'] = [csp];
            }
          }
          callback({ responseHeaders: headers });
        } else {
          callback({});
        }
      }
    );

    log.info('[AdBlock] Session blocking enabled');
  }

  private setupPartitionBlocking(): void {
    const partitionSession = session.fromPartition(PARTITION_NAME);

    partitionSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (details: any, callback: any) => {
        log.info(`[AdBlock Partition] onBeforeRequest: ${details.url}`);
        
        if (!this.isEnabled) {
          callback({});
          return;
        }

        const url = details.url;
        
        if (url.startsWith('chrome-extension://') || 
            url.startsWith('chrome://') ||
            url.startsWith('devtools://') ||
            url.startsWith('sovereign://') ||
            url.startsWith('beam://') ||
            url.startsWith('file://') ||
            url.startsWith('about:')) {
          callback({});
          return;
        }

        const result = this.checkUrl(url);
        if (result.matched) {
          log.info(`[AdBlock Partition] BLOCKING: ${url}`);
          callback({ cancel: true });
        } else {
          callback({});
        }
      }
    );

    partitionSession.webRequest.onHeadersReceived(
      { urls: ['http://*/*', 'https://*/*'] },
      (details: any, callback: any) => {
        const url = details.url;
        
        if (url.startsWith('chrome-extension://') || 
            url.startsWith('chrome://') ||
            url.startsWith('devtools://') ||
            url.startsWith('sovereign://') ||
            url.startsWith('file://') ||
            url.startsWith('about:')) {
          callback({});
          return;
        }

        if (details.responseHeaders) {
          const headers = { ...details.responseHeaders };
          if (headers['content-security-policy'] && headers['content-security-policy'].length > 0) {
            let csp = headers['content-security-policy'][0];
            if (!csp.includes("'unsafe-inline'")) {
              csp = csp.replace(/script-src([^;]*)/, "script-src$1 'unsafe-inline'");
              headers['content-security-policy'] = [csp];
            }
          }
          callback({ responseHeaders: headers });
        } else {
          callback({});
        }
      }
    );

    log.info('[AdBlock] Partition blocking enabled');
  }

  getCosmeticCss(domain: string): string {
    const selectors: string[] = [];
    
    if (this.cosmeticFilters.has('*')) {
      selectors.push(...this.cosmeticFilters.get('*')!);
    }
    
    for (const [key, sels] of this.cosmeticFilters) {
      if (key === '*') continue;
      if (domain.includes(key) || key.includes(domain)) {
        selectors.push(...sels);
      }
    }

    if (selectors.length === 0) return '';

    const uniqueSelectors = [...new Set(selectors)];
    return `
      ${uniqueSelectors.join(',\n')} {
        display: none !important;
        visibility: hidden !important;
      }
    `;
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    log.info(`[AdBlock] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  isAdBlockingEnabled(): boolean {
    return this.isEnabled;
  }

  getStats(): { rules: number; enabled: boolean } {
    return { rules: this.rulesCount, enabled: this.isEnabled };
  }

  async updateFilters(): Promise<void> {
    await this.downloadFilterLists();
    await this.loadFilters();
  }

  registerWebContents(_webContents: any): void {
    // Not needed for current implementation - blocking is done via webRequest
  }

  unregisterWebContents(_webContents: any): void {
    // Not needed for current implementation
  }

  bypassDomain(_domain: string): void {
    // Not implemented
  }

  unbypassDomain(_domain: string): void {
    // Not implemented
  }
}

let adBlockService: AdBlockService | null = null;

export function getAdBlockService(): AdBlockService {
  if (!adBlockService) {
    adBlockService = new AdBlockService();
  }
  return adBlockService;
}
