import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { URL } from 'url';

let log: any = console;

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export class OllamaService {
  private dataDir: string = '';
  private configFile: string = '';
  private config: OllamaConfig = {
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2',
    temperature: 0.7,
    maxTokens: 2048,
    enabled: false,
  };
  private initialized: boolean = false;
  private availableModels: OllamaModel[] = [];

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
      this.dataDir = path.join(app.getPath('userData'), 'ollama');
    } catch (err) {
      log.error('Failed to get Electron app paths', err);
      return;
    }

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.configFile = path.join(this.dataDir, 'config.json');
    await this.loadConfig();
    
    this.initialized = true;
    log.info('[Ollama] Initialized');
  }

  private async loadConfig(): Promise<void> {
    if (fs.existsSync(this.configFile)) {
      try {
        const data = fs.readFileSync(this.configFile, 'utf-8');
        this.config = { ...this.config, ...JSON.parse(data) };
        log.info('[Ollama] Loaded config');
      } catch (err) {
        log.error('[Ollama] Failed to load config:', err);
      }
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf-8');
      log.info('[Ollama] Saved config');
    } catch (err) {
      log.error('[Ollama] Failed to save config:', err);
    }
  }

  getConfig(): OllamaConfig {
    return { ...this.config };
  }

  async setConfig(config: Partial<OllamaConfig>): Promise<OllamaConfig> {
    this.config = { ...this.config, ...config };
    await this.saveConfig();
    return this.config;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const response = await this.makeRequest('GET', `${this.config.baseUrl}/api/tags`, '');
      this.availableModels = response.models || [];
      log.info('[Ollama] Connected, available models:', this.availableModels.length);
      return { connected: true };
    } catch (err: any) {
      log.error('[Ollama] Connection failed:', err.message);
      return { connected: false, error: err.message };
    }
  }

  async getModels(): Promise<OllamaModel[]> {
    if (!this.config.enabled) {
      return [];
    }

    try {
      const response = await this.makeRequest('GET', `${this.config.baseUrl}/api/tags`, '');
      this.availableModels = response.models || [];
      return this.availableModels;
    } catch (err) {
      log.error('[Ollama] Failed to get models:', err);
      return [];
    }
  }

  async chat(messages: ChatMessage[]): Promise<ChatCompletionResponse | null> {
    if (!this.config.enabled) {
      log.warn('[Ollama] Ollama is not enabled');
      return null;
    }

    try {
      const request: ChatCompletionRequest = {
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: false,
      };

      const response = await this.makeRequest(
        'POST',
        `${this.config.baseUrl}/api/chat`,
        JSON.stringify(request),
        { 'Content-Type': 'application/json' }
      );

      log.info('[Ollama] Chat response received');
      return response as ChatCompletionResponse;
    } catch (err) {
      log.error('[Ollama] Chat failed:', err);
      return null;
    }
  }

  async generate(prompt: string): Promise<string | null> {
    if (!this.config.enabled) {
      log.warn('[Ollama] Ollama is not enabled');
      return null;
    }

    try {
      const request = {
        model: this.config.model,
        prompt,
        temperature: this.config.temperature,
        stream: false,
      };

      const response = await this.makeRequest(
        'POST',
        `${this.config.baseUrl}/api/generate`,
        JSON.stringify(request),
        { 'Content-Type': 'application/json' }
      );

      return response.response || '';
    } catch (err) {
      log.error('[Ollama] Generate failed:', err);
      return null;
    }
  }

  async analyzePage(url: string, title: string, html: string, elements: any[]): Promise<string | null> {
    const systemPrompt = `You are an AI assistant for a web browser. Analyze the current web page and help the user accomplish tasks.

Current page:
- URL: ${url}
- Title: ${title}

Available elements on the page:
${elements.slice(0, 20).map((el, i) => `${i + 1}. <${el.tag}> ${el.text?.substring(0, 50) || ''} (${el.attributes?.name || el.attributes?.id || 'no id'})`).join('\n')}

Provide helpful suggestions or execute browser commands to help the user.`;

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Analyze this page and tell me what I can do here.' },
    ]);

    return response?.message?.content || null;
  }

  async understandTask(command: string, pageContext?: string): Promise<{
    action: string;
    target?: string;
    value?: string;
    explanation: string;
  } | null> {
    if (!this.config.enabled) {
      return null;
    }

    const context = pageContext ? `\nCurrent page context:\n${pageContext}` : '';
    const prompt = `Analyze this browser command and break it down into executable actions.

Command: "${command}"${context}

Respond with a JSON object containing:
{
  "action": "The main action to perform (click, type, navigate, scroll, extract, search, login, etc.)",
  "target": "The element or area to target (e.g., 'search input', 'login button', 'first link')",
  "value": "Optional value to input (e.g., text to type, URL to navigate to)",
  "explanation": "Brief explanation of what will happen"
}

Respond ONLY with valid JSON, no other text.`;

    try {
      const response = await this.chat([
        { role: 'user', content: prompt },
      ]);

      if (response?.message?.content) {
        try {
          const parsed = JSON.parse(response.message.content);
          return parsed;
        } catch (parseErr) {
          log.warn('[Ollama] Failed to parse AI response:', response.message.content);
          return null;
        }
      }
    } catch (err) {
      log.error('[Ollama] Task understanding failed:', err);
    }

    return null;
  }

  async suggestActions(pageState: { url: string; title: string; elements: any[] }): Promise<string[]> {
    if (!this.config.enabled) {
      return [];
    }

    const prompt = `Based on the current page (${pageState.title} at ${pageState.url}), suggest 3-5 helpful actions the user might want to take.

Available elements:
${pageState.elements.slice(0, 15).map((el, i) => `${i + 1}. ${el.tag}: ${el.text?.substring(0, 40) || ''}`).join('\n')}

Respond with a JSON array of action suggestions, like:
["search for flights", "scroll down", "click on the first article"]

Respond ONLY with valid JSON array, no other text.`;

    try {
      const response = await this.chat([
        { role: 'user', content: prompt },
      ]);

      if (response?.message?.content) {
        try {
          const suggestions = JSON.parse(response.message.content);
          return Array.isArray(suggestions) ? suggestions : [];
        } catch {
          return [];
        }
      }
    } catch (err) {
      log.error('[Ollama] Suggest actions failed:', err);
    }

    return [];
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
        headers: {
          ...headers,
        },
        timeout: 120000,
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
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) {
        req.write(data);
      }
      req.end();
    });
  }
}

let ollamaService: OllamaService | null = null;

export function getOllamaService(): OllamaService {
  if (!ollamaService) {
    ollamaService = new OllamaService();
  }
  return ollamaService;
}
