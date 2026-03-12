import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { URL } from 'url';

let log: any = console;
let aiLog: any = {
  info: (...args: any[]) => console.log('[AI]', ...args),
  error: (...args: any[]) => console.error('[AI]', ...args),
  warn: (...args: any[]) => console.warn('[AI]', ...args)
};

if (typeof global !== 'undefined' && (global as any).agentLog) {
  aiLog = (global as any).agentLog;
}

log = {
  info: (...args: any[]) => {
    console.log('[AI]', ...args);
    aiLog.info(...args);
  },
  error: (...args: any[]) => {
    console.error('[AI]', ...args);
    aiLog.error(...args);
  },
  warn: (...args: any[]) => {
    console.warn('[AI]', ...args);
    aiLog.warn(...args);
  }
};

function loadEnv() {
  const possiblePaths = [
    path.join(__dirname, '..', '..', '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), 'electron', '.env'),
    path.join(process.cwd(), '.env'),
  ];
  
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
      break;
    }
  }
}
loadEnv();

export type ModelProvider = 
  | 'ollama' 
  | 'openai' 
  | 'anthropic' 
  | 'google' 
  | 'azure-openai'
  | 'lmstudio'
  | 'custom';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  temperature: number;
  maxTokens: number;
}

export interface ProviderInfo {
  id: ModelProvider;
  name: string;
  logo?: string;
  models: string[];
  requiresApiKey: boolean;
  baseURL?: string;
  authType: 'bearer' | 'api-key' | 'none';
}

export interface UserModel {
  id: string;
  name: string;
  provider: ModelProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  createdAt: number;
}

export interface AIServiceConfig {
  enabled: boolean;
  defaultProvider: ModelProvider;
  defaultModel: string;
  providers: Record<ModelProvider, ModelConfig>;
  userModels: UserModel[];
}

const DEFAULT_PROVIDERS: ProviderInfo[] = [
  {
    id: 'ollama',
    name: 'Ollama',
    models: [],
    requiresApiKey: false,
    baseURL: 'http://localhost:11434',
    authType: 'none',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    models: [],
    requiresApiKey: false,
    baseURL: 'http://localhost:1234/v1',
    authType: 'none',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'o1', 'o1-mini', 'o3-mini'],
    requiresApiKey: true,
    baseURL: 'https://api.openai.com/v1',
    authType: 'bearer',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    models: ['claude-sonnet-4-5-20250929', 'claude-sonnet-4-5', 'claude-opus-4-5', 'claude-3-5-sonnet', 'claude-3-5-haiku'],
    requiresApiKey: true,
    baseURL: 'https://api.anthropic.com/v1',
    authType: 'api-key',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    requiresApiKey: true,
    baseURL: 'https://generativelanguage.googleapis.com/v1',
    authType: 'bearer',
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-35-turbo'],
    requiresApiKey: true,
    authType: 'api-key',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI Compatible)',
    models: [],
    requiresApiKey: true,
    authType: 'bearer',
  },
];

export class AIService {
  private dataDir: string = '';
  private configFile: string = '';
  private config: AIServiceConfig = {
    enabled: false,
    defaultProvider: 'ollama',
    defaultModel: '',
    providers: {
      ollama: { provider: 'ollama', model: '', baseURL: 'http://localhost:11434', temperature: 0.7, maxTokens: 2048 },
      openai: { provider: 'openai', model: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY || '', temperature: 0.7, maxTokens: 2048 },
      anthropic: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', apiKey: process.env.ANTHROPIC_API_KEY || '', temperature: 0.7, maxTokens: 2048 },
      google: { provider: 'google', model: 'gemini-2.0-flash', apiKey: process.env.GOOGLE_GEMINI_API_KEY || '', temperature: 0.7, maxTokens: 2048 },
      'azure-openai': { provider: 'azure-openai', model: 'gpt-4o', apiKey: process.env.AZURE_OPENAI_API_KEY || '', temperature: 0.7, maxTokens: 2048 },
      lmstudio: { provider: 'lmstudio', model: '', baseURL: 'http://localhost:1234/v1', temperature: 0.7, maxTokens: 2048 },
      custom: { provider: 'custom', model: 'gpt-4o', apiKey: process.env.CUSTOM_API_KEY || '', baseURL: process.env.CUSTOM_BASE_URL || '', temperature: 0.7, maxTokens: 2048 },
    },
    userModels: [],
  };
  private initialized: boolean = false;
  private cachedOllamaModels: string[] | null = null;
  private fetchingOllamaModels: Promise<string[]> | null = null;

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
      this.dataDir = path.join(app.getPath('userData'), 'ai-service');
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
    log.info('[AI] Service initialized');
  }

  private async loadConfig(): Promise<void> {
    if (fs.existsSync(this.configFile)) {
      try {
        const data = fs.readFileSync(this.configFile, 'utf-8');
        const loadedConfig = JSON.parse(data);
        this.config = { ...this.config, ...loadedConfig };
        log.info('[AI] Loaded config. Default provider:', this.config.defaultProvider, 'Default model:', this.config.defaultModel);
        log.info('[AI] User models:', this.config.userModels?.length || 0);
      } catch (err) {
        log.error('[AI] Failed to load config:', err);
      }
    } else {
      log.info('[AI] No config file found, using defaults');
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf-8');
      log.info('[AI] Saved config. Default provider:', this.config.defaultProvider, 'Default model:', this.config.defaultModel);
    } catch (err) {
      log.error('[AI] Failed to save config:', err);
    }
  }

  getProviders(): ProviderInfo[] {
    const providers = [...DEFAULT_PROVIDERS];
    const ollamaProvider = providers.find(p => p.id === 'ollama');
    if (ollamaProvider) {
      // Use cached models if available
      if (this.cachedOllamaModels && this.cachedOllamaModels.length > 0) {
        ollamaProvider.models = this.cachedOllamaModels;
      } else {
        // Start fetching in background if not already fetching
        if (!this.fetchingOllamaModels) {
          this.fetchingOllamaModels = this.fetchOllamaModels();
          this.fetchingOllamaModels.then(models => {
            this.cachedOllamaModels = models;
            this.fetchingOllamaModels = null;
            log.info('[AI] Fetched Ollama models:', models);
          }).catch(err => {
            log.warn('[AI] Could not fetch Ollama models:', err.message);
            this.fetchingOllamaModels = null;
          });
        }
        // Don't show hardcoded models - show empty until fetched
        ollamaProvider.models = [];
      }
    }
    return providers;
  }

  // Fetch models from Ollama - supports both local and cloud
  async fetchOllamaModels(): Promise<string[]> {
    const config = this.config.providers.ollama;
    if (!config?.baseURL) return [];
    
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    
    try {
      const response = await this.makeRequest('GET', `${config.baseURL}/api/tags`, '', headers);
      return response.models?.map((m: any) => m.name) || [];
    } catch (err) {
      log.warn('[AI] Failed to fetch Ollama models:', err);
      return [];
    }
  }

  getProviderInfo(providerId: ModelProvider): ProviderInfo | undefined {
    return this.getProviders().find(p => p.id === providerId);
  }

  async refreshOllamaModels(): Promise<string[]> {
    log.info('[AI] Refreshing Ollama models');
    this.cachedOllamaModels = null;
    this.fetchingOllamaModels = null;
    const models = await this.fetchOllamaModels();
    this.cachedOllamaModels = models;
    log.info('[AI] Refreshed Ollama models:', models);
    return models;
  }

  getConfig(): AIServiceConfig {
    log.info('[AIService] getConfig called, returning:', {
      enabled: this.config.enabled,
      defaultProvider: this.config.defaultProvider,
      defaultModel: this.config.defaultModel,
      userModelsCount: this.config.userModels?.length || 0
    });
    return { ...this.config };
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.config.enabled = enabled;
    await this.saveConfig();
  }

  async setDefaultProvider(provider: ModelProvider, model: string): Promise<void> {
    log.info('[AIService] Setting default provider:', { provider, model });
    this.config.defaultProvider = provider;
    this.config.defaultModel = model;
    
    // Also update the provider's model config
    if (this.config.providers[provider]) {
      this.config.providers[provider].model = model;
    }
    
    await this.saveConfig();
    log.info('[AIService] Default provider set. Current config:', { 
      defaultProvider: this.config.defaultProvider, 
      defaultModel: this.config.defaultModel,
      providerModel: this.config.providers[provider]?.model
    });
  }

  async setProviderConfig(provider: ModelProvider, config: Partial<ModelConfig>): Promise<void> {
    log.info('[AIService] Setting provider config:', { provider, config });
    this.config.providers[provider] = { ...this.config.providers[provider], ...config };
    await this.saveConfig();
  }

  getUserModels(): UserModel[] {
    return this.config.userModels || [];
  }

  async addUserModel(model: Omit<UserModel, 'id' | 'createdAt'>): Promise<UserModel> {
    const newModel: UserModel = {
      ...model,
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    };
    this.config.userModels = [...(this.config.userModels || []), newModel];
    await this.saveConfig();
    log.info('[AI] Added user model:', newModel.name);
    return newModel;
  }

  async updateUserModel(id: string, updates: Partial<UserModel>): Promise<UserModel | null> {
    const index = this.config.userModels.findIndex(m => m.id === id);
    if (index === -1) return null;
    
    this.config.userModels[index] = { ...this.config.userModels[index], ...updates };
    await this.saveConfig();
    log.info('[AI] Updated user model:', id);
    return this.config.userModels[index];
  }

  async deleteUserModel(id: string): Promise<boolean> {
    const index = this.config.userModels.findIndex(m => m.id === id);
    if (index === -1) return false;
    
    this.config.userModels.splice(index, 1);
    await this.saveConfig();
    log.info('[AI] Deleted user model:', id);
    return true;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getDefaultProvider(): ModelProvider {
    return this.config.defaultProvider;
  }

  getDefaultModel(): string {
    return this.config.defaultModel;
  }

  async checkConnection(provider?: ModelProvider, apiKey?: string): Promise<{ connected: boolean; error?: string; models?: string[] }> {
    const prov = provider || this.config.defaultProvider;
    let config = this.config.providers[prov];
    
    if (apiKey) {
      config = { ...config, apiKey };
    }

    try {
      if (prov === 'ollama') {
        const response = await this.makeRequest('GET', `${config.baseURL}/api/tags`, '');
        return { connected: true, models: response.models?.map((m: any) => m.name) || [] };
      } 
      else if (prov === 'lmstudio') {
        const response = await this.makeRequest('GET', `${config.baseURL}/models`, '');
        return { connected: true, models: response.data?.map((m: any) => m.id) || [] };
      }
      else if (prov === 'openai' || prov === 'custom') {
        if (!config.apiKey) {
          return { connected: false, error: 'API key is required' };
        }
        const response = await this.makeRequest('GET', `${config.baseURL}/models`, '', {
          'Authorization': `Bearer ${config.apiKey}`,
        });
        return { connected: true, models: response.data?.map((m: any) => m.id) || [] };
      }
      else if (prov === 'anthropic') {
        if (!config.apiKey) {
          return { connected: false, error: 'API key is required' };
        }
        const testResponse = await this.makeRequest('POST', `${config.baseURL}/messages`, JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }), {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        });
        if (testResponse.error) {
          return { connected: false, error: testResponse.error.message || 'Invalid API key' };
        }
        return { connected: true, models: DEFAULT_PROVIDERS.find(p => p.id === 'anthropic')?.models || [] };
      }
      else if (prov === 'google') {
        if (!config.apiKey) {
          return { connected: false, error: 'API key is required' };
        }
        const url = `${config.baseURL}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
        console.log('[AIService] Testing Google connection with URL:', url.replace(config.apiKey, '***'));
        const testResponse = await this.makeRequest('POST', url, JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }), {
          'Content-Type': 'application/json',
        });
        console.log('[AIService] Google test response:', testResponse);
        if (testResponse.error) {
          return { connected: false, error: testResponse.error.message || testResponse.error || 'Invalid API key' };
        }
        return { connected: true, models: DEFAULT_PROVIDERS.find(p => p.id === 'google')?.models || [] };
      }
      else if (prov === 'azure-openai') {
        if (!config.apiKey) {
          return { connected: false, error: 'API key is required' };
        }
        return { connected: true, models: DEFAULT_PROVIDERS.find(p => p.id === 'azure-openai')?.models || [] };
      }
      
      return { connected: false, error: 'Unknown provider' };
    } catch (err: any) {
      const errorMsg = err.message || 'Connection failed';
      if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('authentication')) {
        return { connected: false, error: 'Invalid API key' };
      }
      if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('ECONNREFUSED')) {
        return { connected: false, error: 'Cannot connect to server. Make sure the server is running.' };
      }
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        return { connected: false, error: 'API quota exceeded. Please check your plan and billing details.' };
      }
      if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
        return { connected: false, error: 'Model not found. Please check the model name.' };
      }
      return { connected: false, error: errorMsg };
    }
  }

  async chat(messages: ChatMessage[], provider?: ModelProvider, model?: string): Promise<{ content: string; error?: string }> {
    if (!this.config.enabled) {
      return { content: '', error: 'AI service is disabled' };
    }

    const prov = provider || this.config.defaultProvider;
    const config = this.config.providers[prov];
    const modelId = model || this.config.defaultModel || config.model;
    
    log.info('[AIService] Chat request details:', {
      prov,
      providerArg: provider,
      modelArg: model,
      configModel: config?.model,
      defaultModel: this.config.defaultModel,
      modelId,
      defaultProvider: this.config.defaultProvider
    });

    // Log conversation to agent log
    const messagesLog = messages.map((m: any) => m.role === 'system' ? { role: m.role, content: m.content?.substring(0, 200) + '...' } : m);
    log.info('[AI-CHAT] User/Assistant messages:', JSON.stringify(messagesLog, null, 2));

    console.log('[AIService] Chat request:', { provider: prov, model: modelId, baseURL: config.baseURL });

    try {
      let response: any;

      console.log('[AIService] Making chat request to provider:', prov);

      if (prov === 'ollama') {
        const url = `${config.baseURL}/api/chat`;
        console.log('[AIService] Making request to:', url);
        response = await this.makeRequest('POST', url, JSON.stringify({
          model: modelId,
          messages,
          temperature: config.temperature,
          stream: false,
        }), { 'Content-Type': 'application/json' });
        console.log('[AIService] Ollama response:', response);
        
        const content = response.message?.content || '';
        console.log('[AIService] Ollama content:', content.substring(0, 500));
        return { content };
      }
      else if (prov === 'lmstudio' || prov === 'custom') {
        response = await this.makeRequest('POST', `${config.baseURL}/chat/completions`, JSON.stringify({
          model: modelId,
          messages,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
        }), {
          'Authorization': `Bearer ${config.apiKey || ''}`,
          'Content-Type': 'application/json',
        });
        return { content: response.choices?.[0]?.message?.content || '' };
      }
      else if (prov === 'openai') {
        response = await this.makeRequest('POST', `${config.baseURL}/chat/completions`, JSON.stringify({
          model: modelId,
          messages,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
        }), {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        });
        const content = response.choices?.[0]?.message?.content || '';
        log.info('[AI-CHAT] AI Response:', content.substring(0, 500) + (content.length > 500 ? '...' : ''));
        return { content };
      }
      else if (prov === 'anthropic') {
        const anthropicMessages = messages.filter(m => m.role !== 'system');
        const systemMessage = messages.find(m => m.role === 'system');
        
        response = await this.makeRequest('POST', `${config.baseURL}/messages`, JSON.stringify({
          model: modelId,
          messages: anthropicMessages,
          system: systemMessage?.content,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
        }), {
          'x-api-key': config.apiKey || '',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        });
        const content = response.content?.[0]?.text || '';
        log.info('[AI-CHAT] AI Response:', content.substring(0, 500) + (content.length > 500 ? '...' : ''));
        return { content };
      }
      else if (prov === 'google') {
        const contents = messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
        
        response = await this.makeRequest('POST', `${config.baseURL}/models/${modelId}:generateContent?key=${encodeURIComponent(config.apiKey)}`, JSON.stringify({
          contents,
          generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens,
          },
        }), {
          'Content-Type': 'application/json',
        });
        const content = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        log.info('[AI-CHAT] AI Response:', content.substring(0, 500) + (content.length > 500 ? '...' : ''));
        return { content };
      }
      else if (prov === 'azure-openai') {
        const azureUrl = config.baseURL || '';
        response = await this.makeRequest('POST', `${azureUrl}/openai/deployments/${modelId}/chat/completions?api-version=2024-02-15-preview`, JSON.stringify({
          messages,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
        }), {
          'api-key': config.apiKey || '',
          'Content-Type': 'application/json',
        });
        const content = response.choices?.[0]?.message?.content || '';
        log.info('[AI-CHAT] AI Response:', content.substring(0, 500) + (content.length > 500 ? '...' : ''));
        return { content };
      }

      return { content: '', error: 'Unknown provider' };
    } catch (err: any) {
      log.error('[AI] Chat error:', err);
      const errorMsg = err.message || 'Unknown error';
      
      if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
        return { content: '', error: `Model not found (404): ${modelId}. Make sure the model is installed in Ollama. Run 'ollama list' to see available models.` };
      }
      if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
        return { content: '', error: 'Cannot connect to Ollama. Make sure Ollama is running on port 11434.' };
      }
      if (errorMsg.includes('timeout')) {
        return { content: '', error: 'Request timed out. The model may be loading slowly.' };
      }
      
      return { content: '', error: errorMsg };
    }
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

    const result = await this.chat([{ role: 'user', content: prompt }]);

    if (result.content) {
      try {
        const parsed = JSON.parse(result.content);
        return parsed;
      } catch (parseErr) {
        log.warn('[AI] Failed to parse AI response:', result.content);
      }
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

    const result = await this.chat([{ role: 'user', content: prompt }]);

    if (result.content) {
      try {
        const suggestions = JSON.parse(result.content);
        return Array.isArray(suggestions) ? suggestions : [];
      } catch {
        return [];
      }
    }

    return [];
  }

  private makeRequest(method: string, url: string, data: string, headers: Record<string, string> = {}): Promise<any> {
    console.log('[AIService] makeRequest:', method, url);
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers: { ...headers },
        timeout: 300000,
      };

      console.log('[AIService] Request options:', options);

      const req = lib.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          console.log('[AIService] Response status:', res.statusCode, 'body:', body.substring(0, 200));
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

      req.on('error', (err) => {
        console.log('[AIService] Request error:', err.message);
        reject(err);
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

      if (data) req.write(data);
      req.end();
    });
  }
}

let aiService: AIService | null = null;

export function getAIService(): AIService {
  if (!aiService) {
    aiService = new AIService();
  }
  return aiService;
}
