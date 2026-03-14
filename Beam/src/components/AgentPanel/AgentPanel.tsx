import React, { useState, useEffect, useRef } from 'react';
import { useBrowserStore, WorkflowHistoryItem } from '../../stores/browserStore';
import { AgentTask, UserModel, HumanFeedbackRequest, HumanFeedbackResponse, AgentPlan } from '../../types';
import { HumanFeedbackDialog } from '../HumanFeedbackDialog/HumanFeedbackDialog';
import { SavedModelsDialog } from './SavedModelsDialog';
// import { PlanReviewDialog } from './PlanReviewDialog';
import { SkillsManagerDialog } from './SkillsManagerDialog';
import { CompanionChat } from './CompanionChat';
import { UserInputDialog } from './UserInputDialog';
import { JsonSkill } from '../../types';
import '../../styles/agent.css';

interface Provider {
  id: string;
  name: string;
  models: string[];
  requiresApiKey: boolean;
  baseURL?: string;
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
  const tabs = useBrowserStore(s => s.tabs);
  const activeTabId = useBrowserStore(s => s.activeTabId);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ connected: null, testing: false });
  const [userModels, setUserModels] = useState<UserModel[]>([]);
  const [activeModel, setActiveModel] = useState<UserModel | null>(null);
  const [showSavedModels, setShowSavedModels] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<AgentPlan | null>(null);
  const [showPlanReview, setShowPlanReview] = useState(false);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const [isAborted, setIsAborted] = useState(false);
  
  // Skills Manager State
  const [userSkills, setUserSkills] = useState<JsonSkill[]>([]);
  const [showSkillsManager, setShowSkillsManager] = useState(false);
  
  // Companion Chat State
  const [showCompanionChat, setShowCompanionChat] = useState(false);
  
  // User Input Dialog State
  const [showUserInput, setShowUserInput] = useState(false);
  const [userInputPrompt, setUserInputPrompt] = useState('');

  useEffect(() => {
    loadAiConfig();
    loadUserSkills();
  }, []);

  // Load active model
  useEffect(() => {
    const loadActiveModel = async () => {
      if (window.electronAPI?.aiGetActiveModel) {
        const model = await window.electronAPI.aiGetActiveModel();
        setActiveModel(model);
      }
    };
    loadActiveModel();
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
    // Also log to external file
    if (window.electronAPI?.activityLog) {
      window.electronAPI.activityLog(message);
    }
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

  const loadUserSkills = async () => {
    if (!window.electronAPI?.agentGetSkills) return;
    try {
      const skills = await window.electronAPI.agentGetSkills();
      setUserSkills(skills || []);
    } catch (err: any) {
      console.error('[Agent] Failed to load skills:', err);
    }
  };

  const handleImportSkills = async (skillsToImport: JsonSkill[]) => {
    if (!window.electronAPI?.agentAddSkill) return;
    
    let successCount = 0;
    let failCount = 0;

    for (const skill of skillsToImport) {
      try {
        const result = await window.electronAPI.agentAddSkill(skill);
        if (result.success) {
          setUserSkills(prev => {
            // Avoid duplicates in UI state
            if (prev.find(s => s.id === skill.id)) return prev;
            return [...prev, skill];
          });
          successCount++;
        } else {
          failCount++;
        }
      } catch (err: any) {
        failCount++;
      }
    }

    if (successCount > 0) {
      addLog(`Imported ${successCount} skills successfully.`);
    }
    if (failCount > 0) {
      addLog(`Failed to import ${failCount} skills (might already exist).`);
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    if (!window.electronAPI?.agentDeleteSkill) return;
    try {
      const result = await window.electronAPI.agentDeleteSkill(skillId);
      if (result.success) {
        setUserSkills(prev => prev.filter(s => s.id !== skillId));
        addLog(`Skill deleted: ${skillId}`);
      }
    } catch (err: any) {
      addLog(`Error deleting skill: ${err.message}`);
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
          
          if (!existingModel && window.electronAPI?.aiSaveModel) {
            const providerInfo = aiProviders.find(p => p.id === selectedProvider);
            const newModel = await window.electronAPI.aiSaveModel({
              name: `${selectedProvider.toUpperCase()} - ${modelName}`,
              provider: selectedProvider,
              model: selectedModel,
              apiKey: apiKey,
              baseURL: providerInfo?.baseURL || undefined,
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

  const saveCurrentModel = async () => {
    if (!selectedModel || !selectedProvider) return;
    
    // Get provider info to determine baseURL
    const providerInfo = aiProviders.find(p => p.id === selectedProvider);
    const modelData = {
      name: `${selectedProvider.toUpperCase()} - ${selectedModel}`,
      provider: selectedProvider,
      model: selectedModel,
      apiKey: apiKey,
      baseURL: providerInfo?.baseURL || undefined,
    };
    
    try {
      const savedModel = await window.electronAPI.aiSaveModel(modelData);
      setUserModels([...userModels, savedModel]);
      
      // Set as active if no active model exists
      if (!activeModel) {
        await window.electronAPI.aiSetActiveModel(savedModel.id);
        setActiveModel(savedModel);
      }
      
      // Refresh active model from backend to ensure sync
      const backendModel = await window.electronAPI.aiGetActiveModel();
      setActiveModel(backendModel);
      
      addLog(`Saved model: ${savedModel.name}`);
    } catch (err: any) {
      addLog(`Error saving model: ${err.message}`);
    }
  };

  const handleSetActiveModel = async (modelId: string) => {
    try {
      await window.electronAPI.aiSetActiveModel(modelId);
      const model = userModels.find(m => m.id === modelId);
      setActiveModel(model || null);
      addLog(`Active model set to: ${model?.name}`);
      // Force refresh from backend to ensure sync
      const backendModel = await window.electronAPI.aiGetActiveModel();
      if (backendModel?.id !== modelId) {
        setActiveModel(backendModel);
      }
    } catch (err: any) {
      addLog(`Error setting active model: ${err.message}`);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      await window.electronAPI.aiDeleteModel(modelId);
      setUserModels(userModels.filter(m => m.id !== modelId));
      
      // Update active model if we deleted the active one
      if (activeModel?.id === modelId) {
        const newActive = await window.electronAPI.aiGetActiveModel();
        setActiveModel(newActive);
      }
      
      addLog('Model deleted');
    } catch (err: any) {
      addLog(`Error deleting model: ${err.message}`);
    }
  };

  const handleUpdateModel = async (modelId: string, updates: any) => {
    try {
      const updated = await window.electronAPI.aiUpdateModel(modelId, updates);
      if (updated) {
        setUserModels(userModels.map(m => m.id === modelId ? updated : m));
        if (activeModel?.id === modelId) {
          setActiveModel(updated);
        }
        addLog(`Model updated: ${updated.name}`);
      }
    } catch (err: any) {
      addLog(`Error updating model: ${err.message}`);
    }
  };

  const handleSubmit = async () => {
    if (!command.trim()) return;

    addLog(`Planning: "${command.substring(0, 50)}${command.length > 50 ? '...' : ''}"`);
    setIsAiLoading(true);
    setIsAborted(false);
    setHumanFeedback(null);
    
    try {
      // Get page content for context (only log URL, not content)
      let pageContent = '';
      if (activeTab?.url && !activeTab?.url.startsWith('about:') && !activeTab?.url.startsWith('chrome://')) {
        try {
          const content = await window.electronAPI.agentExecuteScript(activeTabId || '', `
            (function() {
              const body = document.body;
              const text = body ? body.innerText.substring(0, 8000) : '';
              return text;
            })();
          `);
          if (content) {
            pageContent = content;
            addLog(`Read ${pageContent.length} chars from page`);
          }
        } catch (e) {
          addLog('Could not get page content');
        }
      }

      // Step 1: Get AI to plan the steps
      const context = {
        currentUrl: activeTab?.url || '',
        pageTitle: activeTab?.title || '',
        pageContent: pageContent.substring(0, 2000), // Limit context size
        activeModel: activeModel?.name || 'Default'
      };
      
      const plan = await window.electronAPI.agentPlanSteps(command, context);
      
      if (!plan || !plan.steps || plan.steps.length === 0) {
        addLog('AI failed to generate a plan');
        setIsAiLoading(false);
        return;
      }
      
      setCurrentPlan(plan);
      addLog(`Planned ${plan.steps.length} steps - Goal: ${plan.finalGoal}`);
      plan.steps.forEach((step, i) => {
        addLog(`  Step ${i+1}: ${step.skill} - ${step.description}`);
      });
      setCommand('');
      
      // Step 2: Execute immediately without approval
      await handleExecutePlan(plan);
      
    } catch (err: any) {
      addLog(`Error planning: ${err.message}`);
      setIsAiLoading(false);
    }
  };

  const handleExecutePlan = async (plan: AgentPlan) => {
    addLog('Executing plan...');
    
    try {
      let currentStepIndex = 0;
      let stepResult = null;
      
      while (currentStepIndex < plan.steps.length) {
        if (isAborted) {
          addLog('Execution aborted by user');
          break;
        }

        const step = plan.steps[currentStepIndex];
        addLog(`Executing step ${currentStepIndex + 1}: ${step.description}`);
        
        // Execute the skill
        stepResult = await window.electronAPI.agentExecuteSkill(step.skill, step.input);
        
        // Handle special actions from skill result (e.g., open companion chat)
        if (stepResult.result?.action === 'open_companion_chat') {
          addLog('Opening companion chat...');
          setShowCompanionChat(true);
        } else if (stepResult.result?.action === 'request_user_input') {
          addLog(`AI needs input: ${stepResult.result.prompt}`);
          setUserInputPrompt(stepResult.result.prompt);
          setShowUserInput(true);
          // Pause execution here - for now we just break and log
          addLog('Waiting for user input...');
          break;
        } else if (stepResult.result?.skill === 'navigate' || stepResult.result?.skill === 'browse') {
          // Handle navigation skills - actually navigate the browser
          const url = stepResult.result.params?.url;
          if (url) {
            addLog(`Navigating to: ${url}`);
            await window.electronAPI.navigate(activeTabId, url);
          }
        } else if (stepResult.result?.skill === 'go_back') {
          addLog('Going back...');
          await window.electronAPI.goBack(activeTabId);
        } else if (stepResult.result?.skill === 'go_forward') {
          addLog('Going forward...');
          await window.electronAPI.goForward(activeTabId);
        } else if (stepResult.result?.skill === 'reload') {
          addLog('Reloading page...');
          await window.electronAPI.reload(activeTabId);
        } else if (stepResult.result?.skill === 'open_new_tab') {
          const url = stepResult.result.params?.url || 'about:blank';
          addLog(`Opening new tab: ${url}`);
          await window.electronAPI.createTab('', url);
        } else if (stepResult.result?.skill === 'close_tab') {
          addLog('Closing current tab...');
          await window.electronAPI.closeTab(activeTabId);
        } else if (stepResult.result?.skill === 'switch_to_tab') {
          const tabIndex = stepResult.result.params?.index;
          addLog(`Switching to tab ${tabIndex}...`);
          // This would need more logic to get tab by index
          addLog('Switch to specific tab not fully implemented');
        } else if (stepResult.result?.skill === 'screenshot') {
          addLog('Taking screenshot...');
          const screenshot = await window.electronAPI.agentCaptureScreenshot();
          if (screenshot) {
            addLog(`Screenshot captured (${screenshot.length} chars)`);
          }
        } else if (stepResult.result?.skill === 'extract_text' || stepResult.result?.skill === 'read_webpage') {
          addLog('Extracting page content...');
          const content = await window.electronAPI.agentExecuteScript(activeTabId, `
            document.body.innerText.substring(0, 5000)
          `);
          addLog(`Extracted ${content?.length || 0} characters`);
        } else if (stepResult.result?.skill === 'scroll') {
          const direction = stepResult.result.params?.direction || 'down';
          const amount = stepResult.result.params?.amount || 500;
          addLog(`Scrolling ${direction}...`);
          await window.electronAPI.agentExecuteScript(activeTabId, `
            window.scrollBy(0, ${direction === 'down' ? amount : -amount});
          `);
        } else if (stepResult.result?.skill === 'click' || stepResult.result?.skill === 'type' || stepResult.result?.skill === 'fill_form') {
          // These skills need browser automation - for now just log
          addLog(`Skill ${stepResult.result.skill} requires browser automation (not yet fully implemented)`);
        } else if (stepResult.result?.action === 'display_result') {
          // Display result in agent panel
          const content = stepResult.result.content;
          const type = stepResult.result.type || 'text';
          addLog(`Result: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
        }
        
        if (!stepResult.success) {
           addLog(`Step failed: ${stepResult.error}`);
           addLog('Task failed due to step failure.');
           setCurrentTask({ ...currentTask, status: 'error', error: stepResult.error } as AgentTask);
           setIsAiLoading(false);
           return;
        }
        
        // Log the step result
        addLog(`Result: ${JSON.stringify(stepResult.result).substring(0, 100)}...`);
        
        // Send result back to AI for evaluation
        const evaluation = await window.electronAPI.agentEvaluateStep({
          stepResult,
          step,
          remainingSteps: plan.steps.slice(currentStepIndex + 1),
          finalGoal: plan.finalGoal
        });
        
        if (evaluation.needsReplan) {
          addLog(`AI suggests replanning: ${evaluation.reason}`);
          // Replan from current state
          const newPlan = await window.electronAPI.agentReplan({
            previousPlan: plan,
            currentStep: currentStepIndex,
            stepResult,
            userCommand: plan.finalGoal
          });
          setCurrentPlan(newPlan);
          currentStepIndex = 0;
          continue;
        }
        
        currentStepIndex++;
      }
      
      if (!isAborted) {
        addLog('Plan execution finished.');
        setCurrentTask({ ...currentTask, status: 'done' } as AgentTask);
      }
    } catch (err: any) {
      addLog(`Error executing: ${err.message}`);
      setCurrentTask({ ...currentTask, status: 'error', error: err.message } as AgentTask);
    } finally {
      setIsAiLoading(false);
      setIsAborted(false);
    }
  };

  const handleAbort = () => {
    setIsAborted(true);
    addLog('Abort requested...');
  };

  const handleCancelPlan = () => {
    setShowPlanReview(false);
    setCurrentPlan(null);
    setIsAiLoading(false);
    addLog('Plan cancelled');
  };

  const handleHumanFeedback = async (response: HumanFeedbackResponse) => {
    const responseStr = String(response.selectedOptionId);
    
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
  };

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
            <button className="save-model-btn" onClick={saveCurrentModel} disabled={!aiEnabled || !selectedModel || isAiLoading}>
              Save Model
            </button>
          </div>

          {connectionStatus.connected !== null && (
            <div className={`connection-status ${connectionStatus.connected ? 'success' : 'error'}`}>
              {connectionStatus.connected ? '✓ Connected!' : `✗ ${connectionStatus.error || 'Failed'}`}
            </div>
          )}

          <div className="settings-row">
            <label>Saved Models</label>
            <button className="saved-models-btn" onClick={() => setShowSavedModels(true)} disabled={userModels.length === 0}>
              View All ({userModels.length})
            </button>
          </div>

          <div className="settings-row">
            <label>Skills</label>
            <button className="skills-manager-btn" onClick={() => setShowSkillsManager(true)}>
              Manage Skills ({userSkills.length})
            </button>
          </div>

          {activeModel && (
            <div className="active-model-badge">
              <span>Active: {activeModel.name}</span>
            </div>
          )}
        </div>
      )}

      {humanFeedback && (
        <HumanFeedbackDialog request={humanFeedback} onResponse={handleHumanFeedback} task={currentTask} />
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
        {isAiLoading ? (
          <button 
            className="agent-panel__abort"
            onClick={handleAbort}
          >
            Abort
          </button>
        ) : (
          <button 
            className="agent-panel__submit"
            onClick={handleSubmit}
            disabled={!command.trim()}
          >
            Execute
          </button>
        )}
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

      <SavedModelsDialog
        isOpen={showSavedModels}
        onClose={() => setShowSavedModels(false)}
        userModels={userModels}
        activeModelId={activeModel?.id}
        onSetActiveModel={handleSetActiveModel}
        onDeleteModel={handleDeleteModel}
        onUpdateModel={handleUpdateModel}
      />

      <SkillsManagerDialog
        isOpen={showSkillsManager}
        onClose={() => setShowSkillsManager(false)}
        skills={userSkills}
        onImportSkills={handleImportSkills}
        onDeleteSkill={handleDeleteSkill}
      />

      <CompanionChat
        isOpen={showCompanionChat}
        onClose={() => setShowCompanionChat(false)}
      />

      <UserInputDialog
        isOpen={showUserInput}
        prompt={userInputPrompt}
        onSubmit={(response) => {
          setShowUserInput(false);
          addLog(`User responded: ${response}`);
          // Resume execution with user response
          // For now, we just log it - a more complete implementation would pass this back to the AI
        }}
        onCancel={() => setShowUserInput(false)}
      />
    </div>
  );
}
