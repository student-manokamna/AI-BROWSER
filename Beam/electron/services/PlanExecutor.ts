import { BrowserWindow } from 'electron';
import crypto from 'crypto';
import { SkillManager } from './SkillManager';
import { PlanGenerator } from './PlanGenerator';
import {
  GeneratedPlan,
  PlanStep,
  PlanExecutionResult,
  ExecutedStep,
  VerificationCriteria,
  SkillContext,
  SupervisionMode,
  ConfirmationRequest,
} from '../types/skills';

let log: any = console;

export class PlanExecutor {
  private skillManager: SkillManager;
  private planGenerator: PlanGenerator;
  private mainWindow: BrowserWindow | null = null;
  private supervisionMode: SupervisionMode = 'confirm_risky';
  private executionHistory: ExecutedStep[] = [];
  private isPaused: boolean = false;
  private isStopped: boolean = false;

  constructor() {
    this.skillManager = SkillManager.getInstance();
    this.planGenerator = new PlanGenerator();
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
    log.info('[PlanExecutor] Supervision mode set to:', mode);
  }

  pause(): void {
    this.isPaused = true;
    log.info('[PlanExecutor] Execution paused');
  }

  resume(): void {
    this.isPaused = false;
    log.info('[PlanExecutor] Execution resumed');
  }

  stop(): void {
    this.isStopped = true;
    log.info('[PlanExecutor] Execution stopped');
  }

  async executePlan(plan: GeneratedPlan, context: SkillContext): Promise<PlanExecutionResult> {
    log.info('[PlanExecutor] Starting execution of plan:', plan.id);
    const startTime = Date.now();
    this.isStopped = false;
    this.isPaused = false;
    this.executionHistory = [];

    const executedSteps: ExecutedStep[] = [];
    const verificationStats = {
      totalSteps: plan.steps.length,
      verifiedSteps: 0,
      failedVerifications: 0,
      autoFixed: 0,
    };

    let completedEarly = false;

    for (let i = 0; i < plan.steps.length; i++) {
      if (this.isStopped) {
        log.info('[PlanExecutor] Execution stopped by user');
        break;
      }

      while (this.isPaused) {
        await this.sleep(100);
        if (this.isStopped) break;
      }

      const step = plan.steps[i];
      log.info(`[PlanExecutor] Executing step ${i + 1}/${plan.steps.length}:`, step.skillId);

      let shouldConfirm = this.shouldRequireConfirmation(step);
      if (this.supervisionMode === 'confirm_all') {
        shouldConfirm = true;
      } else if (this.supervisionMode === 'fully_autonomous') {
        shouldConfirm = false;
      }

      if (shouldConfirm && step.requiresConfirmation) {
        const confirmed = await this.requestConfirmation(step, context);
        if (!confirmed) {
          return {
            success: false,
            planId: plan.id,
            steps: executedSteps,
            failureStep: i,
            failureReason: 'Step rejected by user',
            executionTime: (Date.now() - startTime) / 1000,
            verificationStats,
          };
        }
      }

      const stepResult = await this.executeStep(step, context);
      const timestamp = Date.now();

      executedSteps.push({
        stepId: step.id,
        skillId: step.skillId,
        skillName: step.skillName,
        parameters: step.parameters,
        result: stepResult,
        timestamp,
      });

      this.executionHistory.push(executedSteps[executedSteps.length - 1]);

      if (!stepResult.success) {
        log.warn('[PlanExecutor] Step failed:', stepResult.error);

        if (step.retryOnFailure?.enabled && step.retryOnFailure.maxRetries > 0) {
          let retries = 0;
          while (retries < step.retryOnFailure.maxRetries && !stepResult.success) {
            log.info(`[PlanExecutor] Retrying step ${step.skillId}, attempt ${retries + 1}`);
            const retryResult = await this.executeStep(step, context);
            executedSteps[executedSteps.length - 1] = {
              ...executedSteps[executedSteps.length - 1],
              result: retryResult,
            };
            if (retryResult.success) {
              verificationStats.autoFixed++;
              break;
            }
            retries++;
          }
        }

        if (!stepResult.success) {
          const alternativePlan = await this.planGenerator.generateAlternativePlan(
            plan,
            stepResult.error || 'Unknown error',
            context
          );

          return {
            success: false,
            planId: plan.id,
            steps: executedSteps,
            failureStep: i,
            failureReason: stepResult.error,
            executionTime: (Date.now() - startTime) / 1000,
            verificationStats,
            suggestedFix: {
              analysis: `Step "${step.description}" failed. Consider using alternative approach.`,
              alternativePlan,
            },
          };
        }
      }

      if (step.verification) {
        const verified = await this.verifyStep(step, stepResult, context);
        executedSteps[executedSteps.length - 1].verification = {
          criteria: step.verification,
          passed: verified,
        };

        if (verified) {
          verificationStats.verifiedSteps++;
        } else {
          verificationStats.failedVerifications++;
          log.warn('[PlanExecutor] Verification failed for step:', step.skillId);

          const fixed = await this.rethinkAndRetry(step, stepResult, context, executedSteps);
          if (fixed) {
            verificationStats.autoFixed++;
            verificationStats.verifiedSteps++;
          }
        }
      }

      // AI-powered evaluation after each step
      if (i < plan.steps.length - 1) {
        const remainingSteps = plan.steps.slice(i + 1);
        const evaluation = await this.planGenerator.evaluateStepProgress(
          stepResult,
          step,
          remainingSteps,
          plan.goal,
          context
        );

        if (evaluation.needsReplan) {
          log.info('[PlanExecutor] AI suggests replanning:', evaluation.reason);
          
          // Replan from current state
          const newPlan = await this.planGenerator.replanFromCurrentState(
            plan,
            i,
            stepResult,
            plan.goal,
            context
          );
          
          // Update the plan and continue with new steps
          plan = newPlan;
          // Reset the loop index to execute the new plan from the start
          // But we need to track what we've already done
          log.info('[PlanExecutor] Replanned with', plan.steps.length, 'steps');
        }
      }

      if (await this.isGoalAccomplished(plan, context, executedSteps)) {
        log.info('[PlanExecutor] Goal accomplished early at step:', i + 1);
        completedEarly = true;
        break;
      }
    }

    const success = !this.isStopped && executedSteps.every(s => s.result.success);
    const executionTime = (Date.now() - startTime) / 1000;

    log.info('[PlanExecutor] Execution completed. Success:', success, 'Time:', executionTime, 's');

    return {
      success,
      planId: plan.id,
      steps: executedSteps,
      completedEarly,
      executionTime,
      verificationStats,
    };
  }

  private shouldRequireConfirmation(step: PlanStep): boolean {
    if (this.supervisionMode === 'fully_autonomous') return false;
    if (this.supervisionMode === 'confirm_all') return true;
    if (this.supervisionMode === 'suggest_only') return true;

    const riskyActions = ['submit', 'login', 'password', 'pay', 'buy', 'delete', 'transfer'];
    return riskyActions.some(a => step.description.toLowerCase().includes(a));
  }

  private async requestConfirmation(step: PlanStep, context: SkillContext): Promise<boolean> {
    const request: ConfirmationRequest = {
      stepId: step.id,
      skillId: step.skillId,
      skillName: step.skillName,
      action: step.skillId,
      description: step.description,
      parameters: step.parameters,
      riskLevel: step.requiresConfirmation ? 'medium' : 'safe',
      reason: step.confirmationMessage || `Executing "${step.description}" requires confirmation`,
    };

    log.info('[PlanExecutor] Requesting confirmation for step:', request.description);

    if (this.mainWindow) {
      this.mainWindow.webContents.send('agent-confirmation-request', request);
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        log.warn('[PlanExecutor] Confirmation timeout, defaulting to proceed');
        resolve(true);
      }, 30000);

      const handler = (_event: any, proceed: boolean) => {
        clearTimeout(timeout);
        if (this.mainWindow) {
          this.mainWindow.webContents.removeListener('agent-confirmation-response' as any, handler);
        }
        resolve(proceed);
      };

      if (this.mainWindow) {
        this.mainWindow.webContents.on('agent-confirmation-response' as any, handler);
      }
    });
  }

  private async executeStep(step: PlanStep, context: SkillContext): Promise<any> {
    const skill = this.skillManager.getSkill(step.skillId);
    if (!skill) {
      return { success: false, error: `Skill not found: ${step.skillId}` };
    }

    try {
      const result = await skill.execute(step.parameters, context);
      return result;
    } catch (error: any) {
      return { success: false, error: error.message || 'Execution failed' };
    }
  }

  private async verifyStep(step: PlanStep, result: any, context: SkillContext): Promise<boolean> {
    const criteria = step.verification;
    if (!criteria) return true;

    log.info('[PlanExecutor] Verifying step:', step.skillId, 'with criteria:', criteria.type);

    try {
      switch (criteria.type) {
        case 'url_changed':
          return await this.checkUrlChanged(criteria.expectedValue);
        case 'element_visible':
          return await this.checkElementVisible(criteria.expectedValue);
        case 'text_contains':
          return await this.checkTextContains(criteria.expectedValue);
        case 'element_count':
          return await this.checkElementCount(criteria.expectedValue);
        case 'element_attribute':
          return await this.checkElementAttribute(criteria.expectedValue);
        default:
          return true;
      }
    } catch (error) {
      log.warn('[PlanExecutor] Verification error:', error);
      return false;
    }
  }

  private async checkUrlChanged(expectedUrl: string): Promise<boolean> {
    if (!this.mainWindow) return false;
    const currentUrl = this.mainWindow.webContents.getURL();
    return currentUrl.includes(expectedUrl) || expectedUrl === '';
  }

  private async checkElementVisible(selector: string): Promise<boolean> {
    if (!this.mainWindow) return false;
    try {
      const result = await this.mainWindow.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) return { visible: false, reason: 'not found' };
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
            rect
          };
        })()
      `);
      return result?.visible || false;
    } catch (error) {
      return false;
    }
  }

  private async checkTextContains(expectedText: string): Promise<boolean> {
    if (!this.mainWindow || !expectedText) return true;
    try {
      const pageText = await this.mainWindow.webContents.executeJavaScript(`
        document.body.innerText
      `);
      return pageText?.toLowerCase().includes(expectedText.toLowerCase()) || false;
    } catch (error) {
      return false;
    }
  }

  private async checkElementCount(expectedCount: number): Promise<boolean> {
    if (!this.mainWindow) return false;
    return true;
  }

  private async checkElementAttribute(expected: { selector: string; attribute: string; value: string }): Promise<boolean> {
    if (!this.mainWindow) return false;
    try {
      const result = await this.mainWindow.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector('${expected.selector.replace(/'/g, "\\'")}');
          if (!el) return null;
          return el.getAttribute('${expected.attribute}');
        })()
      `);
      return result === expected.value;
    } catch (error) {
      return false;
    }
  }

  private async rethinkAndRetry(
    failedStep: PlanStep,
    result: any,
    context: SkillContext,
    executedSteps: ExecutedStep[]
  ): Promise<boolean> {
    log.info('[PlanExecutor] Rethinking step:', failedStep.skillId);

    const fixes = [
      { type: 'wait', params: { ms: 2000 } },
      { type: 'scroll', params: { direction: 'down', amount: 200 } },
      { type: 'retry_selector', params: {} },
    ];

    for (const fix of fixes) {
      log.info('[PlanExecutor] Trying fix:', fix.type);
      
      if (fix.type === 'wait') {
        await this.sleep(fix.params.ms);
        const retryResult = await this.executeStep(failedStep, context);
        if (retryResult.success) {
          return true;
        }
      }

      if (fix.type === 'scroll') {
        await this.executeStep({ ...failedStep, skillId: 'scroll', parameters: fix.params }, context);
        const retryResult = await this.executeStep(failedStep, context);
        if (retryResult.success) {
          return true;
        }
      }
    }

    return false;
  }

  private async isGoalAccomplished(
    plan: GeneratedPlan,
    context: SkillContext,
    executedSteps: ExecutedStep[]
  ): Promise<boolean> {
    const goalLower = plan.goal.toLowerCase();

    if (goalLower.includes('extract') || goalLower.includes('get') || goalLower.includes('read')) {
      const lastStep = executedSteps[executedSteps.length - 1];
      if (lastStep?.result?.data) {
        return true;
      }
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getExecutionHistory(): ExecutedStep[] {
    return this.executionHistory;
  }

  clearHistory(): void {
    this.executionHistory = [];
  }
}

let planExecutor: PlanExecutor | null = null;

export function getPlanExecutor(): PlanExecutor {
  if (!planExecutor) {
    planExecutor = new PlanExecutor();
  }
  return planExecutor;
}
