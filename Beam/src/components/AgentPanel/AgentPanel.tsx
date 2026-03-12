import React, { useState, useEffect, useRef } from 'react';
import { useBrowserStore, WorkflowHistoryItem } from '../../stores/browserStore';
import { AgentTask, UserModel, HumanFeedbackRequest, HumanFeedbackResponse } from '../../types';
import { HumanFeedbackDialog } from '../HumanFeedbackDialog/HumanFeedbackDialog';
import '../../styles/agent.css';

interface Provider {
  id: string;
  name: string;
  models: string[];
  requiresApiKey: boolean;
}

interface ConnectionStatus {
  connected: boolean | null;
  error?: string;
  testing: boolean;
}

export function AgentPanel() {
  const [command, setCommand] = useState('');
  const [currentTask, setCurrentTask] = useState<AgentTask | null>(null);
  const [humanFeedback, setHumanFeedback] = useState<HumanFeedbackRequest | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [aiProviders, setAiProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('ollama');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [providerModels, setProviderModels] = useState<string[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const setAgentPanel = useBrowserStore(s => s.setAgentPanel);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ connected: null, testing: false });
  const [userModels, setUserModels] = useState<UserModel[]>([]);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadAiConfig();
  }, []);

  useEffect(() => {
    if (window.electronAPI?.onAgentTaskUpdate) {
      window.electronAPI.onAgentTaskUpdate((task: AgentTask) => {
        setCurrentTask(task);
        
        if (task.status === 'done' || task.status === 'error') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          addLog(task.status === 'done' ? 'Task completed!' : `Error: ${task.error}`);
        } else if (task.status === 'executing') {
          const stepIdx = task.steps?.findIndex((s: any) => s.status === 'running') ?? -1;
          const currentStep = stepIdx >= 0 ? task.steps?.[stepIdx] : null;
          if (currentStep) {
            addLog(`Executing: ${currentStep.description}`);
          }
        } else if (task.status === 'planning') {
          addLog('Planning with AI...');
        } else if (task.status === 'waiting_human') {
          addLog('Waiting for human input...');
        } else if (task.status === 'waiting_confirmation') {
          addLog('Waiting for confirmation...');
        }
      });
    }

    if (window.electronAPI?.onHumanFeedback) {
      window.electronAPI.onHumanFeedback((request: HumanFeedbackRequest) => {
        setHumanFeedback(request);
      });
    }
  }, []);

  const addWorkflowHistory = useBrowserStore(s => s.addWorkflowHistory);
  const updateWorkflowHistory = useBrowserStore(s => s.updateWorkflowHistory);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setActivityLog(prev => [...prev.slice(-4), `[${timestamp}] ${message}`]);
  };

  const loadAiConfig = async (retryCount = 0) => {
    const maxRetries = 5;
    
    if (!window.electronAPI?.aiGetProviders) {
      if (retryCount < maxRetries) {
        setTimeout(() => loadAiConfig(retryCount + 1), 500);
        return;
      }
      return;
    }
    
    try {
      const providers = await window.electronAPI.aiGetProviders();
      setAiProviders(providers || []);
      
      const config = await window.electronAPI.aiGetConfig();
      setAiEnabled(config?.enabled || false);
      setSelectedProvider(config?.defaultProvider || 'ollama');
      setSelectedModel(config?.defaultModel || '');
      
      const provider = (providers || []).find((p: Provider) => p.id === config?.defaultProvider);
      if (provider) {
        setProviderModels(provider.models || []);
      }
      
      const models = await window.electronAPI.aiGetUserModels();
      setUserModels(models || []);
    } catch (err: any) {
      console.error('[Agent] Failed to load AI config:', err);
    }
  };

  const handleProviderChange = async (providerId: string) => {
    setSelectedProvider(providerId);
    setProviderModels([]);
    setSelectedModel('');
    setConnectionStatus({ connected: null, testing: false });
    
    if (providerId === 'ollama') {
      setConnectionStatus({ connected: null, testing: true, error: undefined });
      try {
        const result = await window.electronAPI.aiCheckConnection(providerId, apiKey);
        if (result.connected && result.models && result.models.length > 0) {
          setProviderModels(result.models);
          setSelectedModel(result.models[0]);
          setConnectionStatus({ connected: true, testing: false });
          if (window.electronAPI?.aiSetProvider) {
            await window.electronAPI.aiSetProvider(providerId, result.models[0]);
          }
          return;
        }
      } catch (err) {
        console.warn('[AgentPanel] Could not fetch Ollama models:', err);
      }
      setConnectionStatus({ connected: null, testing: false, error: undefined });
    }
    
    const provider = aiProviders.find(p => p.id === providerId);
    if (provider && provider.models.length > 0) {
      setProviderModels(provider.models);
      setSelectedModel(provider.models[0]);
      if (window.electronAPI?.aiSetProvider) {
        await window.electronAPI.aiSetProvider(providerId, provider.models[0]);
      }
    }
  };

  const handleModelChange = async (model: string) => {
    setSelectedModel(model);
    if (window.electronAPI?.aiSetProvider) {
      await window.electronAPI.aiSetProvider(selectedProvider, model);
    }
  };

  const handleApiKeyChange = async (key: string) => {
    setApiKey(key);
    if (window.electronAPI?.aiSetProviderConfig) {
      await window.electronAPI.aiSetProviderConfig(selectedProvider, { apiKey: key });
    }
  };

  const handleAiToggle = async () => {
    const newState = !aiEnabled;
    setAiEnabled(newState);
    if (window.electronAPI?.aiSetEnabled) {
      await window.electronAPI.aiSetEnabled(newState);
    }
  };

  const checkAiConnection = async () => {
    setConnectionStatus({ connected: null, testing: true, error: undefined });
    setIsAiLoading(true);
    try {
      if (window.electronAPI?.aiCheckConnection) {
        const result = await window.electronAPI.aiCheckConnection(selectedProvider, apiKey);
        
        if (result.connected) {
          setConnectionStatus({ connected: true, testing: false });
          
          const modelName = selectedModel || selectedProvider;
          const existingModel = userModels.find(m => m.provider === selectedProvider && m.model === selectedModel);
          
          if (!existingModel && window.electronAPI?.aiAddUserModel) {
            const newModel = await window.electronAPI.aiAddUserModel({
              name: `${selectedProvider.toUpperCase()} - ${modelName}`,
              provider: selectedProvider,
              model: selectedModel,
              apiKey: apiKey,
            });
            setUserModels([...userModels, newModel]);
          }
        } else {
          setConnectionStatus({ connected: false, error: result.error || 'Connection failed', testing: false });
        }
        
        if (result.models && result.models.length > 0) {
          setProviderModels(result.models);
        }
      }
    } catch (err: any) {
      setConnectionStatus({ connected: false, error: err.message || 'Connection failed', testing: false });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!command.trim() || !window.electronAPI?.agentExecute) return;

    addLog(`Executing: "${command.substring(0, 50)}${command.length > 50 ? '...' : ''}"`);
    setIsAiLoading(true);
    setHumanFeedback(null);
    
    try {
      const task = await window.electronAPI.agentExecute(command);
      setCurrentTask(task);
      setCommand('');
      
      // If task has steps and doesn't need confirmation, execute them
      if (task.steps && task.steps.length > 0 && task.status !== 'waiting_confirmation') {
        addLog('Executing task...');
        const executedTask = await window.electronAPI.agentExecutePlanned();
        setCurrentTask(executedTask);
        if (executedTask.status === 'done') {
          addLog('Task completed!');
        } else if (executedTask.status === 'error') {
          addLog(`Error: ${executedTask.error}`);
        }
      } else if (task.status === 'waiting_confirmation') {
        addLog('Waiting for confirmation...');
      }
      
      if (task.status === 'error') {
        addLog(`Error: ${task.error}`);
      }
    } catch (err: any) {
      addLog(`Error: ${err.message || 'Failed to execute'}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleHumanFeedback = async (response: HumanFeedbackResponse) => {
    const responseStr = String(response.response);
    
    if (currentTask?.status === 'done' && responseStr.trim().length > 0) {
      setCommand(responseStr);
      setHumanFeedback(null);
      setIsAiLoading(true);
      
      try {
        const task = await window.electronAPI.agentExecute(responseStr);
        setCurrentTask(task);
        
        if (task.status === 'error') {
          addLog(`Error: ${task.error}`);
        }
      } catch (err: any) {
        addLog(`Error: ${err.message || 'Failed to execute'}`);
      } finally {
        setIsAiLoading(false);
      }
    } else {
      if (window.electronAPI?.agentHumanFeedbackResponse) {
        await window.electronAPI.agentHumanFeedbackResponse(response);
      }
      setHumanFeedback(null);
    }
  };;

  const handleStop = async () => {
    if (window.electronAPI?.agentStop) {
      await window.electronAPI.agentStop();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getStatusText = () => {
    if (!currentTask) return 'Ready to help';
    switch (currentTask.status) {
      case 'planning': return '🤔 Planning with AI...';
      case 'executing': return '⚡ Executing task...';
      case 'waiting_human': return '💬 Waiting for your input...';
      case 'done': return '✅ Task completed!';
      case 'error': return `❌ ${currentTask.error}`;
      default: return 'Ready';
    }
  };

  const renderStepStatus = (index: number) => {
    if (!currentTask) return null;
    const currentStepIdx = currentTask.steps?.findIndex(s => s.status === 'running') ?? -1;
    const doneCount = currentTask.steps?.filter(s => s.status === 'done').length ?? 0;
    if (index < doneCount) return <span className="step-done">✓</span>;
    if (index === currentStepIdx) return <span className="step-running">◐</span>;
    return <span className="step-pending">○</span>;
  };

  return (
    <div className="agent-panel">
      <div className="agent-panel__header">
        <div className="agent-panel__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <span className="agent-panel__label">AI Agent</span>
        <button className="agent-panel__functions-btn" onClick={() => setShowSettings(!showSettings)}>⚙️</button>
      </div>

      {showSettings && (
        <div className="agent-panel__settings">
          <h4>AI Model Settings</h4>
          
          <div className="settings-row">
            <label>Enable AI</label>
            <input type="checkbox" checked={aiEnabled} onChange={handleAiToggle} />
          </div>

          <div className="settings-row">
            <label>Provider</label>
            <select value={selectedProvider} onChange={(e) => handleProviderChange(e.target.value)} disabled={!aiEnabled}>
              {aiProviders.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>

          {aiProviders.find(p => p.id === selectedProvider)?.requiresApiKey && (
            <div className="settings-row">
              <label>API Key</label>
              <input type="password" value={apiKey} onChange={(e) => handleApiKeyChange(e.target.value)} placeholder="Enter API key..." disabled={!aiEnabled} />
            </div>
          )}

          <div className="settings-row">
            <label>Model</label>
            <select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)} disabled={!aiEnabled || providerModels.length === 0}>
              {providerModels.length > 0 ? providerModels.map(m => (<option key={m} value={m}>{m}</option>)) : (<option value={selectedModel}>{selectedModel || 'No models'}</option>)}
            </select>
          </div>

          <div className="settings-row">
            <button className="test-connection-btn" onClick={checkAiConnection} disabled={isAiLoading || !aiEnabled}>
              {isAiLoading ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {connectionStatus.connected !== null && (
            <div className={`connection-status ${connectionStatus.connected ? 'success' : 'error'}`}>
              {connectionStatus.connected ? '✓ Connected!' : `✗ ${connectionStatus.error || 'Failed'}`}
            </div>
          )}
        </div>
      )}

      {humanFeedback && (
        <HumanFeedbackDialog request={humanFeedback} onResponse={handleHumanFeedback} task={currentTask} />
      )}

      {selectedModel && (
        <div className="agent-panel__model-badge">
          <span className="model-badge-label">Active:</span>
          <span className="model-badge-name">{selectedModel}</span>
        </div>
      )}

      <div className="agent-panel__input-row">
        <input
          type="text"
          className="agent-panel__input"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='What would you like to do?'
          autoFocus
        />
        <button 
          className={`agent-panel__submit ${isAiLoading ? 'agent-panel__submit--loading' : ''}`}
          onClick={handleSubmit}
          disabled={!command.trim() || isAiLoading}
        >
          {isAiLoading ? (<><div className="spinner spinner--small" />Processing</>) : (<>Execute</>)}
        </button>
      </div>

      {activityLog.length > 0 && (
        <div className="agent-panel__activity-log">
          {activityLog.map((log, i) => (<div key={i} className="activity-log-entry">{log}</div>))}
        </div>
      )}

      {currentTask && (
        <div className="agent-panel__status">
          <div className="agent-panel__status-indicator">
            {currentTask.status === 'executing' && <div className="spinner" />}
            {currentTask.status === 'planning' && <div className="spinner" />}
            {currentTask.status === 'waiting_human' && <span>💬</span>}
          </div>
          <span>{getStatusText()}</span>
        </div>
      )}

      {currentTask && currentTask.status !== 'done' && currentTask.status !== 'error' && (
        <div className="agent-panel__actions">
          {currentTask.status === 'waiting_confirmation' && (
            <button className="agent-panel__action-btn" onClick={async () => {
              await window.electronAPI.agentConfirmAction(true);
              addLog('Confirmed, executing...');
              const executedTask = await window.electronAPI.agentExecutePlanned();
              setCurrentTask(executedTask);
            }}>✓ Allow</button>
          )}
          <button className="agent-panel__action-btn agent-panel__action-btn--danger" onClick={handleStop}>⏹ Stop</button>
        </div>
      )}

      {currentTask && currentTask.steps && currentTask.steps.length > 0 && (
        <div className="agent-panel__steps">
          <h4>Plan ({currentTask.steps.filter(s => s.status === 'done').length}/{currentTask.steps.length})</h4>
          <div className="agent-panel__steps-list">
            {currentTask.steps.map((step, i) => (
              <div key={step.id} className={`agent-panel__step ${step.status === 'done' ? 'agent-panel__step--done' : step.status === 'running' ? 'agent-panel__step--running' : ''}`}>
                {renderStepStatus(i)}
                <span className="step-description">{step.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="agent-panel__examples">
        <h4>Try saying:</h4>
        <ul>
          <li onClick={() => setCommand('Find cheapest hotel in Paris')}>"Find cheapest hotel in Paris"</li>
          <li onClick={() => setCommand('Login to gmail with my saved credentials')}>"Login to gmail with my saved credentials"</li>
          <li onClick={() => setCommand('Search for flights to Mumbai')}>"Search for flights to Mumbai"</li>
        </ul>
      </div>
    </div>
  );
}
