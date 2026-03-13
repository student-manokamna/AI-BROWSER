import { BrowserWindow } from 'electron';
import crypto from 'crypto';
import { AIService, getAIService } from './AIService';
import { SkillManager } from './SkillManager';
import {
  GeneratedPlan,
  PlanStep,
  VerificationCriteria,
  SkillContext,
  SkillCapabilities,
  SupervisionMode,
  PlanReview,
  ConfirmationRequest
} from '../types/skills';

let log: any = console;

export class PlanGenerator {
  private aiService: AIService;
  private skillManager: SkillManager;
  private mainWindow: BrowserWindow | null = null;
  private supervisionMode: SupervisionMode = 'confirm_risky';

  constructor() {
    this.aiService = getAIService();
    this.skillManager = SkillManager.getInstance();
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

  setSupervisionMode(mode: SupervisionMode): void {
    this.supervisionMode = mode;
    log.info('[PlanGenerator] Supervision mode set to:', mode);
  }

  async generatePlan(
    goal: string,
    context: SkillContext,
    useAI: boolean = true
  ): Promise<GeneratedPlan> {
    log.info('[PlanGenerator] Generating plan for goal:', goal);

    const planId = crypto.randomUUID();
    const availableSkills = this.skillManager.getAllSkills();

    let steps: PlanStep[];
    let goalAnalysis: GeneratedPlan['goalAnalysis'];
    let riskAssessment: GeneratedPlan['riskAssessment'];

    if (useAI && this.aiService.isEnabled()) {
      const aiPlan = await this.generatePlanWithAI(goal, context, availableSkills);
      steps = aiPlan.steps;
      goalAnalysis = aiPlan.goalAnalysis;
      riskAssessment = aiPlan.riskAssessment;
    } else {
      const basicPlan = this.generateBasicPlan(goal, context, availableSkills);
      steps = basicPlan.steps;
      goalAnalysis = basicPlan.goalAnalysis;
      riskAssessment = basicPlan.riskAssessment;
    }

    const suggestedVerification = this.generateVerificationCriteria(steps);
    const estimatedTime = this.estimateExecutionTime(steps);
    const confidenceScore = this.calculateConfidenceScore(steps, riskAssessment);

    return {
      id: planId,
      goal,
      goalAnalysis,
      steps,
      context: {
        startUrl: context.url,
        skillsAvailable: availableSkills.map(s => s.metadata.id),
      },
      verificationCriteria: suggestedVerification,
      suggestedVerification,
      riskAssessment,
      alternatives: this.generateAlternatives(goal, context, availableSkills),
      estimatedTime,
      confidenceScore,
    };
  }

  private async generatePlanWithAI(
    goal: string,
    context: SkillContext,
    availableSkills: any[]
  ): Promise<{ steps: PlanStep[]; goalAnalysis: GeneratedPlan['goalAnalysis']; riskAssessment: GeneratedPlan['riskAssessment'] }> {
    const skillManifest = this.skillManager.getSkillManifest();

    const systemPrompt = `You are an expert AI agent planner. Your role is to break down user goals into a sequence of skill executions.

## AVAILABLE SKILLS
${skillManifest}

## CURRENT PAGE STATE
URL: ${context.url}
Title: ${context.pageTitle || 'Unknown'}
Elements: ${context.pageState?.elements?.slice(0, 10).map((e: any) => `${e.tag}: ${e.text?.substring(0, 30)}`).join('\n') || 'None'}

## TASK
Analyze the user's goal and create a detailed plan using the available skills.

## OUTPUT FORMAT
Respond with a JSON object containing:
{
  "goalAnalysis": {
    "category": "navigation|interaction|information|comparison|form|analysis",
    "complexity": "low|medium|high",
    "requiredCapabilities": ["canNavigate", "canClick", etc.]
  },
  "steps": [
    {
      "skillId": "skill identifier",
      "skillName": "Human readable name",
      "description": "What this step does",
      "parameters": { "param1": "value1" },
      "requiresConfirmation": true|false,
      "confirmationMessage": "Why this needs confirmation",
      "timeout": 30000,
      "retryOnFailure": { "enabled": true, "maxRetries": 2 }
    }
  ],
  "riskAssessment": {
    "riskLevel": "low|medium|high",
    "risks": ["risk1", "risk2"],
    "userConfirmationRequired": ["step1", "step2"],
    "sensitiveActions": ["login", "payment", etc.]
  }
}

Respond ONLY with valid JSON.`;

    const result = await this.aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `User goal: ${goal}` }
    ]);

    if (result.content) {
      try {
        const parsed = JSON.parse(result.content);
        const steps = parsed.steps?.map((s: any, i: number) => ({
          id: `step-${i + 1}`,
          skillId: s.skillId,
          skillName: s.skillName,
          description: s.description,
          parameters: s.parameters || {},
          requiresConfirmation: s.requiresConfirmation || this.shouldRequireConfirmation(s.skillId),
          confirmationMessage: s.confirmationMessage,
          timeout: s.timeout || 30000,
          retryOnFailure: s.retryOnFailure || { enabled: true, maxRetries: 2 },
        })) || [];

        return {
          steps,
          goalAnalysis: parsed.goalAnalysis || { category: 'unknown', complexity: 'medium', requiredCapabilities: [] },
          riskAssessment: parsed.riskAssessment || this.assessRisk(steps),
        };
      } catch (parseErr) {
        log.warn('[PlanGenerator] Failed to parse AI response:', parseErr);
      }
    }

    return {
      steps: this.generateBasicPlan(goal, context, availableSkills).steps,
      goalAnalysis: { category: 'unknown', complexity: 'medium', requiredCapabilities: [] },
      riskAssessment: { riskLevel: 'medium', risks: ['AI planning failed, using basic plan'], userConfirmationRequired: [], sensitiveActions: [] },
    };
  }

  private generateBasicPlan(
    goal: string,
    context: SkillContext,
    availableSkills: any[]
  ): { steps: PlanStep[]; goalAnalysis: GeneratedPlan['goalAnalysis']; riskAssessment: GeneratedPlan['riskAssessment'] } {
    const goalLower = goal.toLowerCase();
    const steps: PlanStep[] = [];
    let stepIndex = 0;

    if (goalLower.includes('search') || goalLower.includes('find')) {
      const searchQuery = this.extractSearchQuery(goal);
      steps.push({
        id: `step-${++stepIndex}`,
        skillId: 'type',
        skillName: 'Type Text',
        description: `Enter search query: "${searchQuery}"`,
        parameters: { selector: 'input[name="q"], input[type="text"], input[aria-label*="search"]', value: searchQuery, clear: true },
        requiresConfirmation: false,
        timeout: 10000,
        retryOnFailure: { enabled: true, maxRetries: 2 },
      });
      steps.push({
        id: `step-${++stepIndex}`,
        skillId: 'press_key',
        skillName: 'Press Key',
        description: 'Press Enter to search',
        parameters: { key: 'Enter' },
        requiresConfirmation: false,
        timeout: 5000,
        retryOnFailure: { enabled: true, maxRetries: 2 },
      });
    }

    if (goalLower.includes('navigate') || goalLower.includes('go to') || goalLower.includes('visit')) {
      const url = this.extractUrl(goal);
      if (url) {
        steps.push({
          id: `step-${++stepIndex}`,
          skillId: 'navigate',
          skillName: 'Navigate to URL',
          description: `Navigate to ${url}`,
          parameters: { url, waitForLoad: true },
          requiresConfirmation: false,
          timeout: 30000,
          retryOnFailure: { enabled: true, maxRetries: 2 },
        });
      }
    }

    if (goalLower.includes('login') || goalLower.includes('sign in')) {
      steps.push({
        id: `step-${++stepIndex}`,
        skillId: 'type',
        skillName: 'Type Text',
        description: 'Enter username/email',
        parameters: { selector: 'input[name="email"], input[type="email"], input[name="username"]', value: '', clear: true },
        requiresConfirmation: true,
        confirmationMessage: 'Entering credentials',
        timeout: 10000,
        retryOnFailure: { enabled: true, maxRetries: 2 },
      });
      steps.push({
        id: `step-${++stepIndex}`,
        skillId: 'type',
        skillName: 'Type Text',
        description: 'Enter password',
        parameters: { selector: 'input[type="password"]', value: '', clear: true },
        requiresConfirmation: true,
        confirmationMessage: 'Entering password',
        timeout: 10000,
        retryOnFailure: { enabled: true, maxRetries: 2 },
      });
      steps.push({
        id: `step-${++stepIndex}`,
        skillId: 'click',
        skillName: 'Click Element',
        description: 'Click submit/login button',
        parameters: { selector: 'button[type="submit"], input[type="submit"], button:contains("Login"), button:contains("Sign in")' },
        requiresConfirmation: true,
        confirmationMessage: 'Submitting login form',
        timeout: 10000,
        retryOnFailure: { enabled: true, maxRetries: 2 },
      });
    }

    if (goalLower.includes('scroll')) {
      const direction = goalLower.includes('up') ? 'up' : 'down';
      const amount = goalLower.includes('bottom') || goalLower.includes('end') ? 2000 : 500;
      steps.push({
        id: `step-${++stepIndex}`,
        skillId: 'scroll',
        skillName: 'Scroll Page',
        description: `Scroll ${direction} the page`,
        parameters: { direction, amount },
        requiresConfirmation: false,
        timeout: 5000,
        retryOnFailure: { enabled: false, maxRetries: 0 },
      });
    }

    if (goalLower.includes('extract') || goalLower.includes('get') || goalLower.includes('read')) {
      steps.push({
        id: `step-${++stepIndex}`,
        skillId: 'extract_text',
        skillName: 'Extract Text',
        description: 'Extract text from page',
        parameters: {},
        requiresConfirmation: false,
        timeout: 10000,
        retryOnFailure: { enabled: true, maxRetries: 2 },
      });
    }

    if (steps.length === 0) {
      steps.push({
        id: 'step-1',
        skillId: 'extract_text',
        skillName: 'Extract Text',
        description: 'Get current page information',
        parameters: {},
        requiresConfirmation: false,
        timeout: 10000,
        retryOnFailure: { enabled: true, maxRetries: 2 },
      });
    }

    return {
      steps,
      goalAnalysis: {
        category: this.categorizeGoal(goal),
        complexity: steps.length > 5 ? 'high' : steps.length > 2 ? 'medium' : 'low',
        requiredCapabilities: this.determineRequiredCapabilities(steps),
      },
      riskAssessment: this.assessRisk(steps),
    };
  }

  private shouldRequireConfirmation(skillId: string): boolean {
    const riskySkills = ['submit_form', 'login', 'type', 'click', 'download_file'];
    return riskySkills.includes(skillId);
  }

  private assessRisk(steps: PlanStep[]): GeneratedPlan['riskAssessment'] {
    const riskyKeywords = ['login', 'password', 'submit', 'buy', 'pay', 'delete', 'transfer', 'credit card'];
    const sensitiveActions: string[] = [];
    const userConfirmationRequired: string[] = [];
    const risks: string[] = [];

    for (const step of steps) {
      const descLower = step.description.toLowerCase();
      for (const keyword of riskyKeywords) {
        if (descLower.includes(keyword)) {
          sensitiveActions.push(step.skillId);
          userConfirmationRequired.push(step.id);
          risks.push(`Step "${step.description}" involves ${keyword}`);
        }
      }

      if (step.requiresConfirmation) {
        userConfirmationRequired.push(step.id);
      }
    }

    const riskLevel = sensitiveActions.length > 2 ? 'high' : sensitiveActions.length > 0 ? 'medium' : 'low';

    return {
      riskLevel,
      risks,
      userConfirmationRequired,
      sensitiveActions,
    };
  }

  private generateVerificationCriteria(steps: PlanStep[]): VerificationCriteria[] {
    const criteria: VerificationCriteria[] = [];

    for (const step of steps) {
      if (step.skillId === 'navigate') {
        criteria.push({
          type: 'url_changed',
          expectedValue: step.parameters.url,
          timeout: step.timeout,
          retries: 2,
        });
      }
      if (step.skillId === 'click' || step.skillId === 'type') {
        criteria.push({
          type: 'element_visible',
          expectedValue: step.parameters.selector,
          timeout: 5000,
          retries: 1,
        });
      }
      if (step.skillId === 'extract_text') {
        criteria.push({
          type: 'text_contains',
          expectedValue: '',
          timeout: 10000,
          retries: 2,
        });
      }
    }

    return criteria;
  }

  private estimateExecutionTime(steps: PlanStep[]): number {
    let totalTime = 0;
    for (const step of steps) {
      totalTime += step.timeout || 10000;
      if (step.retryOnFailure?.enabled) {
        totalTime += (step.timeout || 10000) * step.retryOnFailure.maxRetries;
      }
    }
    return Math.ceil(totalTime / 1000);
  }

  private calculateConfidenceScore(steps: PlanStep[], riskAssessment: GeneratedPlan['riskAssessment']): number {
    const baseScore = 0.9;
    const complexityPenalty = steps.length > 5 ? 0.2 : steps.length > 3 ? 0.1 : 0;
    const riskPenalty = riskAssessment.riskLevel === 'high' ? 0.3 : riskAssessment.riskLevel === 'medium' ? 0.15 : 0;
    return Math.max(0.1, Math.min(1.0, baseScore - complexityPenalty - riskPenalty));
  }

  private generateAlternatives(goal: string, context: SkillContext, availableSkills: any[]): GeneratedPlan['alternatives'] {
    const alternatives: GeneratedPlan['alternatives'] = {
      manual: [],
    };

    const goalLower = goal.toLowerCase();
    if (goalLower.includes('login')) {
      alternatives.manual = ['Enter your credentials manually', 'Use browser password manager'];
    }
    if (goalLower.includes('buy') || goalLower.includes('purchase')) {
      alternatives.manual = ['Complete the purchase manually for security'];
    }

    return alternatives;
  }

  private categorizeGoal(goal: string): string {
    const goalLower = goal.toLowerCase();
    if (goalLower.includes('navigate') || goalLower.includes('go to')) return 'navigation';
    if (goalLower.includes('click') || goalLower.includes('press')) return 'interaction';
    if (goalLower.includes('extract') || goalLower.includes('get') || goalLower.includes('find')) return 'information';
    if (goalLower.includes('compare') || goalLower.includes('check')) return 'comparison';
    if (goalLower.includes('fill') || goalLower.includes('form') || goalLower.includes('login')) return 'form';
    if (goalLower.includes('analyze') || goalLower.includes('check')) return 'analysis';
    return 'unknown';
  }

  private determineRequiredCapabilities(steps: PlanStep[]): string[] {
    const capabilities = new Set<string>();
    for (const step of steps) {
      const skill = this.skillManager.getSkill(step.skillId);
      if (skill) {
        for (const [cap, enabled] of Object.entries(skill.capabilities)) {
          if (enabled) capabilities.add(cap);
        }
      }
    }
    return Array.from(capabilities);
  }

  private extractSearchQuery(command: string): string {
    const patterns = [
      /(?:search|find|look for)\s+(?:for\s+)?(.+)/i,
      /^(.+?)(?:\s+to|\s+on|\s+for)/,
    ];
    for (const pattern of patterns) {
      const match = command.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
    return command;
  }

  private extractUrl(command: string): string | null {
    const urlPattern = /https?:\/\/[^\s]+/i;
    const match = command.match(urlPattern);
    return match ? match[0] : null;
  }

  async generateReview(plan: GeneratedPlan): Promise<PlanReview> {
    const explanation = this.generateExplanation(plan);
    const skillTransparency = this.generateSkillTransparency(plan);

    return {
      plan,
      explanation,
      riskAssessment: plan.riskAssessment,
      alternatives: plan.alternatives,
      skillTransparency,
    };
  }

  private generateExplanation(plan: GeneratedPlan): string {
    const stepCount = plan.steps.length;
    const firstStep = plan.steps[0]?.description || 'unknown action';
    const riskLevel = plan.riskAssessment.riskLevel;

    let explanation = `To ${plan.goal}, I will perform ${stepCount} action${stepCount > 1 ? 's' : ''}. `;
    explanation += `Starting with: ${firstStep}. `;

    if (riskLevel === 'high') {
      explanation += ' This plan involves sensitive actions that require your confirmation. ';
    } else if (riskLevel === 'medium') {
      explanation += ' Some actions may require confirmation. ';
    }

    explanation += `I estimate this will take approximately ${plan.estimatedTime} seconds with a ${Math.round(plan.confidenceScore * 100)}% confidence score.`;

    return explanation;
  }

  private generateSkillTransparency(plan: GeneratedPlan): PlanReview['skillTransparency'] {
    const skillsUsed: string[] = [];
    const skillDescriptions: Record<string, string> = {};

    for (const step of plan.steps) {
      if (!skillsUsed.includes(step.skillId)) {
        skillsUsed.push(step.skillId);
        const skill = this.skillManager.getSkill(step.skillId);
        skillDescriptions[step.skillId] = skill?.metadata.description || step.skillName;
      }
    }

    return {
      skillsUsed,
      skillDescriptions,
      canAchieveGoal: plan.confidenceScore > 0.5,
      confidence: plan.confidenceScore,
    };
  }

  async generateAlternativePlan(
    failedPlan: GeneratedPlan,
    failureReason: string,
    context: SkillContext
  ): Promise<GeneratedPlan> {
    log.info('[PlanGenerator] Generating alternative plan after failure:', failureReason);

    const prompt = `The previous plan failed with reason: "${failureReason}"
Original goal: ${failedPlan.goal}
Original steps: ${failedPlan.steps.map(s => s.description).join(', ')}

Generate an alternative plan that addresses the failure. Consider:
1. Different selectors or approaches
2. Adding wait times for page loads
3. Breaking down complex steps
4. Using different skills

Respond with a JSON object in the same format as before.`;

    const result = await this.aiService.chat([
      { role: 'system', content: 'You are an AI that generates alternative plans when the original fails.' },
      { role: 'user', content: prompt }
    ]);

    if (result.content) {
      try {
        const parsed = JSON.parse(result.content);
        return await this.generatePlan(failedPlan.goal, context, false);
      } catch (err) {
        log.warn('[PlanGenerator] Failed to parse alternative plan from AI');
      }
    }

    return await this.generatePlan(failedPlan.goal, context, false);
  }

  /**
   * Evaluate step progress and determine if replanning is needed
   * This is called after each step to assess if the agent is on track
   */
  async evaluateStepProgress(
    stepResult: any,
    step: any,
    remainingSteps: any[],
    finalGoal: string,
    context: SkillContext
  ): Promise<{ needsReplan: boolean; reason?: string }> {
    log.info('[PlanGenerator] Evaluating step progress for:', step.skillId);

    const prompt = `Evaluate if the agent is on track after executing a step.

Step executed: ${step.description}
Step result: ${JSON.stringify(stepResult, null, 2)}
Remaining steps: ${remainingSteps.length}
Final goal: "${finalGoal}"

Current page context: ${context.url || 'Unknown'}

Should the agent replan? The agent should replan if:
1. The step failed completely
2. The step succeeded but the page changed unexpectedly
3. The remaining steps are no longer valid
4. A better approach became apparent

Respond with JSON:
{
  "needsReplan": boolean,
  "reason": string (if needsReplan is true)
}

Respond ONLY with valid JSON, no other text.`;

    const result = await this.aiService.chat([
      { role: 'system', content: 'You are an AI that evaluates agent progress after each step.' },
      { role: 'user', content: prompt }
    ]);

    if (result.content) {
      try {
        return JSON.parse(result.content);
      } catch (err) {
        log.warn('[PlanGenerator] Failed to parse evaluation response');
        return { needsReplan: false };
      }
    }

    return { needsReplan: false };
  }

  /**
   * Replan from current state based on step result
   */
  async replanFromCurrentState(
    previousPlan: GeneratedPlan,
    currentStepIndex: number,
    stepResult: any,
    userCommand: string,
    context: SkillContext
  ): Promise<GeneratedPlan> {
    log.info('[PlanGenerator] Replanning from current state, step:', currentStepIndex);

    const prompt = `Replan based on current state.

Previous plan: ${JSON.stringify(previousPlan.steps.map(s => s.description), null, 2)}
Current step index: ${currentStepIndex}
Step result: ${JSON.stringify(stepResult, null, 2)}
User command: "${userCommand}"

Create a new plan starting from the current state. Consider what has been completed and what still needs to be done.

Respond with a JSON plan object, no other text.`;

    const result = await this.aiService.chat([
      { role: 'system', content: 'You are an AI that generates plans from current state.' },
      { role: 'user', content: prompt }
    ]);

    if (result.content) {
      try {
        const parsed = JSON.parse(result.content);
        // Convert the parsed plan to GeneratedPlan format
        return await this.generatePlan(userCommand, context, false);
      } catch (err) {
        log.warn('[PlanGenerator] Failed to parse replan response');
      }
    }

    return await this.generatePlan(userCommand, context, false);
  }
}

let planGenerator: PlanGenerator | null = null;

export function getPlanGenerator(): PlanGenerator {
  if (!planGenerator) {
    planGenerator = new PlanGenerator();
  }
  return planGenerator;
}
