// ─── ClawHub-Compatible Skill System Types ───────────────────────────────────

export type SkillCategory = 'hardcoded' | 'learned' | 'downloaded';

export type SkillType = 
  | 'navigation' 
  | 'interaction' 
  | 'information_extraction' 
  | 'analysis' 
  | 'comparison'
  | 'form_filling'
  | 'captcha';

export type ClawHubPermission = 
  | 'network' 
  | 'filesystem' 
  | 'browser' 
  | 'shell' 
  | 'notifications' 
  | 'calendar' 
  | 'email' 
  | 'vault' 
  | 'trading' 
  | 'voice';

export interface ClawHubConfigField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  default?: any;
  secret?: boolean;
  min?: number;
  max?: number;
}

export interface ClawHubSkillManifest {
  name: string;
  version: string;
  author: string;
  description: string;
  license?: string;
  permissions: ClawHubPermission[];
  config?: Record<string, ClawHubConfigField>;
  entryPoint: {
    type: 'natural' | 'typescript' | 'shell';
    path?: string;
    prompt?: string;
  };
  triggers?: {
    keywords?: string[];
    schedule?: string;
    webhook?: string;
  };
}

export interface SkillCapabilities {
  canNavigate: boolean;
  canClick: boolean;
  canType: boolean;
  canRead: boolean;
  canDownload: boolean;
  canCompare: boolean;
  canWait: boolean;
  canExtract: boolean;
  canAnalyze: boolean;
  canBypassCaptcha: boolean;
}

export interface SkillConstraints {
  requiresPageLoad: boolean;
  requiresVisibleElement: boolean;
  maxConcurrentUses?: number;
  supportedDomains?: string[];
  requiresPermissions?: ClawHubPermission[];
}

export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  type: SkillType;
  version: string;
  author: string;
  usageCount: number;
  successRate: number;
  tags: string[];
  requiredPermissions: ClawHubPermission[];
  examples: string[];
  manifest?: ClawHubSkillManifest;
}

export interface SkillParameter {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  defaultValue?: any;
  validation?: (value: any) => boolean;
}

export interface SkillResult {
  success: boolean;
  data?: any;
  error?: string;
  screenshot?: string;
  htmlSnapshot?: string;
  metadata?: {
    executionTime: number;
    retries: number;
    verificationPassed: boolean;
  };
}

export interface VerificationCriteria {
  type: 'url_changed' | 'element_visible' | 'text_contains' | 'element_count' | 'element_attribute' | 'custom_function';
  expectedValue: any;
  timeout?: number;
  retries?: number;
}

export interface AISkill {
  metadata: SkillMetadata;
  capabilities: SkillCapabilities;
  constraints: SkillConstraints;
  parameters: SkillParameter[];
  manifest?: ClawHubSkillManifest;
  
  execute: (params: Record<string, any>, context: SkillContext) => Promise<SkillResult>;
  validate?: (params: Record<string, any>, context: SkillContext) => boolean;
  verify?: (result: SkillResult, criteria: VerificationCriteria) => Promise<boolean>;
}

export interface SkillContext {
  tabId: string;
  url: string;
  pageTitle: string;
  pageState: any;
  screenshot?: string;
  skillsAvailable: string[];
  executionHistory: ExecutedStep[];
}

export interface ExecutedStep {
  stepId: string;
  skillId: string;
  skillName: string;
  parameters: Record<string, any>;
  result: SkillResult;
  timestamp: number;
  verification?: {
    criteria: VerificationCriteria;
    passed: boolean;
  };
}

export interface SkillRegistry {
  [skillId: string]: AISkill;
}

// ─── Plan Generation Types ────────────────────────────────────────────────────

export interface GeneratedPlan {
  id: string;
  goal: string;
  goalAnalysis: {
    category: string;
    complexity: 'low' | 'medium' | 'high';
    requiredCapabilities: string[];
  };
  steps: PlanStep[];
  context: {
    startUrl: string;
    targetData?: any;
    skillsAvailable: string[];
  };
  verificationCriteria: VerificationCriteria[];
  suggestedVerification: VerificationCriteria[];
  riskAssessment: {
    riskLevel: 'low' | 'medium' | 'high';
    risks: string[];
    userConfirmationRequired: string[];
    sensitiveActions: string[];
  };
  alternatives: {
    faster?: GeneratedPlan;
    safer?: GeneratedPlan;
    manual?: string[];
  };
  estimatedTime: number; // in seconds
  confidenceScore: number; // 0-1
}

export interface PlanStep {
  id: string;
  skillId: string;
  skillName: string;
  description: string;
  parameters: Record<string, any>;
  expectedResult?: string;
  verification?: VerificationCriteria;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
  timeout: number;
  retryOnFailure: {
    enabled: boolean;
    maxRetries: number;
    alternativeSkills?: string[];
  };
}

export interface PlanExecutionResult {
  success: boolean;
  planId: string;
  steps: ExecutedStep[];
  failureStep?: number;
  failureReason?: string;
  completedEarly?: boolean;
  executionTime: number;
  verificationStats: {
    totalSteps: number;
    verifiedSteps: number;
    failedVerifications: number;
    autoFixed: number;
  };
  suggestedFix?: {
    analysis: string;
    alternativePlan?: GeneratedPlan;
    parameterChanges?: Record<string, any>;
    alternativeSkillId?: string;
  };
}

// ─── User Supervision Types ───────────────────────────────────────────────────

export type SupervisionMode = 
  | 'fully_autonomous' 
  | 'confirm_risky' 
  | 'confirm_all' 
  | 'suggest_only';

export interface SupervisionConfig {
  mode: SupervisionMode;
  allowedActions: string[];
  blockedActions: string[];
  maxAutonomousSteps: number;
  requireConfirmationForSensitive: boolean;
}

export interface PlanReview {
  plan: GeneratedPlan;
  explanation: string;
  riskAssessment: {
    riskLevel: 'low' | 'medium' | 'high';
    risks: string[];
    userConfirmationRequired: string[];
    sensitiveActions: string[];
  };
  alternatives: {
    faster?: GeneratedPlan;
    safer?: GeneratedPlan;
    manual?: string[];
  };
  skillTransparency: {
    skillsUsed: string[];
    skillDescriptions: Record<string, string>;
    canAchieveGoal: boolean;
    confidence: number;
  };
}

export interface ConfirmationRequest {
  stepId: string;
  skillId: string;
  skillName: string;
  action: string;
  description: string;
  parameters: Record<string, any>;
  riskLevel: 'safe' | 'medium' | 'high';
  reason: string;
  alternatives?: string[];
}

export interface SupervisionState {
  mode: SupervisionMode;
  pendingConfirmations: ConfirmationRequest[];
  confirmedSteps: Set<string>;
  rejectedSteps: Set<string>;
  showPlanReview: boolean;
  currentReview: PlanReview | null;
}

// ─── Skill Learning Types ───────────────────────────────────────────────────

export interface SkillLearningRecord {
  id: string;
  name: string;
  description: string;
  demonstratedActions: AgentDemonstration[];
  generalizedPattern: string;
  parameters: SkillParameter[];
  createdAt: number;
  verified: boolean;
  successRate: number;
}

export interface AgentDemonstration {
  stepNumber: number;
  action: string;
  selector?: string;
  value?: string;
  waitAfter?: number;
  screenshot?: string;
}

export interface SkillDownloadInfo {
  id: string;
  name: string;
  author: string;
  description: string;
  version: string;
  downloadUrl: string;
  verificationHash: string;
  usageCount: number;
  successRate: number;
  tags: string[];
  requiredPermissions: ClawHubPermission[];
  examples: string[];
}

// ─── Import/Export Types ─────────────────────────────────────────────────────

export interface SkillPackage {
  manifest: ClawHubSkillManifest;
  skill: AISkill;
  code?: string;
}

export function exportSkillToPackage(skill: AISkill): SkillPackage {
  return {
    manifest: skill.manifest || {
      name: skill.metadata.id,
      version: skill.metadata.version,
      author: skill.metadata.author,
      description: skill.metadata.description,
      permissions: skill.metadata.requiredPermissions,
      entryPoint: {
        type: 'natural',
        prompt: skill.metadata.description,
      },
    },
    skill,
  };
}

export function importSkillFromPackage(pkg: SkillPackage): AISkill {
  return {
    ...pkg.skill,
    metadata: {
      ...pkg.skill.metadata,
      category: 'downloaded',
      manifest: pkg.manifest,
    },
  };
}