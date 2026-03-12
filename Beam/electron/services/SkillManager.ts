import { AISkill, SkillResult, SkillContext, SkillRegistry, SkillMetadata, SkillCapabilities, SkillConstraints, SkillParameter, SkillType, VerificationCriteria, ClawHubPermission, ClawHubSkillManifest } from '../types/skills';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import log from 'electron-log';

/**
 * SkillManager - Central registry and manager for all AI agent skills
 * Handles skill lifecycle: registration, discovery, execution, and verification
 */
export class SkillManager {
  private static instance: SkillManager;
  private skills: SkillRegistry = {};
  private learnedSkillsPath: string;
  private downloadedSkillsPath: string;

  private constructor() {
    const userDataPath = path.join(app.getPath('userData'), 'skills');
    this.learnedSkillsPath = path.join(userDataPath, 'learned');
    this.downloadedSkillsPath = path.join(userDataPath, 'downloaded');
    
    // Create directories if they don't exist
    fs.mkdirSync(this.learnedSkillsPath, { recursive: true });
    fs.mkdirSync(this.downloadedSkillsPath, { recursive: true });
  }

  public static getInstance(): SkillManager {
    if (!SkillManager.instance) {
      SkillManager.instance = new SkillManager();
    }
    return SkillManager.instance;
  }

  /**
   * Initialize the skill registry with hardcoded, learned, and downloaded skills
   */
  public async initialize(): Promise<void> {
    log.info('[SkillManager] Initializing skill registry...');
    
    try {
      // 1. Load hardcoded skills
      await this.loadHardcodedSkills();
      log.info(`[SkillManager] Loaded ${Object.keys(this.skills).length} hardcoded skills`);
      
      // 2. Load learned skills from disk
      await this.loadLearnedSkills();
      log.info(`[SkillManager] Total skills after loading learned: ${Object.keys(this.skills).length}`);
      
      // 3. Load downloaded skills
      await this.loadDownloadedSkills();
      log.info(`[SkillManager] Total skills after loading downloaded: ${Object.keys(this.skills).length}`);
      
      // 4. Download skills from repository (optional)
      await this.syncRemoteSkills();
      
      log.info(`[SkillManager] Initialized with ${Object.keys(this.skills).length} total skills`);
    } catch (error) {
      log.error('[SkillManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Load all hardcoded skills
   */
  private async loadHardcodedSkills(): Promise<void> {
    const hardcodedSkills = [
      this.createNavigateToUrlSkill(),
      this.createClickElementSkill(),
      this.createTypeTextSkill(),
      this.createSelectDropdownSkill(),
      this.createScrollPageSkill(),
      this.createWaitForElementSkill(),
      this.createExtractTextSkill(),
      this.createExtractLinksSkill(),
      this.createComparePricesSkill(),
      this.createCheckAvailabilitySkill(),
      this.createFillFormSkill(),
      this.createDownloadFileSkill(),
      this.createUploadFileSkill(),
      this.createCaptchaBypassSkill(),
      this.createReadPageSkill(),
      this.createAnalyzePageStructureSkill(),
      this.createSearchOnPageSkill(),
      this.createHoverElementSkill(),
      this.createRightClickElementSkill(),
      this.createDragDropSkill(),
      this.createScreenshotSkill(),
      this.createSwitchTabSkill(),
      this.createExtractImagesSkill(),
      this.createExtractTablesSkill(),
      this.createVerifyElementSkill(),
    ];

    for (const skill of hardcodedSkills) {
      this.registerSkill(skill);
    }
  }

  /**
   * Load learned skills from disk
   */
  private async loadLearnedSkills(): Promise<void> {
    try {
      const files = fs.readdirSync(this.learnedSkillsPath);
      const skillFiles = files.filter(f => f.endsWith('.json'));
      
      for (const filename of skillFiles) {
        const filepath = path.join(this.learnedSkillsPath, filename);
        const skillData = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        
        const skill = this.recreateLearnedSkill(skillData);
        this.registerSkill(skill);
      }
    } catch (error) {
      log.error('[SkillManager] Failed to load learned skills:', error);
    }
  }

  /**
   * Load downloaded skills from disk
   */
  private async loadDownloadedSkills(): Promise<void> {
    try {
      const files = fs.readdirSync(this.downloadedSkillsPath);
      const skillFiles = files.filter(f => f.endsWith('.json'));
      
      for (const filename of skillFiles) {
        const filepath = path.join(this.downloadedSkillsPath, filename);
        const skillData = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        
        const skill = this.recreateDownloadedSkill(skillData);
        this.registerSkill(skill);
      }
    } catch (error) {
      log.error('[SkillManager] Failed to load downloaded skills:', error);
    }
  }

  private recreateLearnedSkill(skillData: any): AISkill {
    return {
      metadata: skillData.metadata,
      capabilities: skillData.capabilities,
      constraints: skillData.constraints,
      parameters: skillData.parameters,
      execute: async (params: Record<string, any>, context: SkillContext): Promise<SkillResult> => {
        return { success: true, data: { action: 'replayed', params } };
      },
    };
  }

  private recreateDownloadedSkill(skillData: any): AISkill {
    return {
      metadata: skillData.metadata || skillData.skill?.metadata,
      capabilities: skillData.capabilities || skillData.skill?.capabilities,
      constraints: skillData.constraints || skillData.skill?.constraints,
      parameters: skillData.parameters || skillData.skill?.parameters,
      execute: async (params: Record<string, any>, context: SkillContext): Promise<SkillResult> => {
        return { success: true, data: { action: 'downloaded_skill', params } };
      },
    };
  }

  /**
   * Sync skills from remote repository (OpenClawHub or similar)
   */
  private async syncRemoteSkills(): Promise<void> {
    try {
      // This would connect to a skill repository
      // For now, we'll skip this but leave the infrastructure
      log.info('[SkillManager] Remote skill sync skipped (no repository configured)');
    } catch (error) {
      log.warn('[SkillManager] Failed to sync remote skills:', error);
    }
  }

  /**
   * Register a skill in the registry
   */
  public registerSkill(skill: AISkill): void {
    this.skills[skill.metadata.id] = skill;
    log.debug(`[SkillManager] Registered skill: ${skill.metadata.name} (${skill.metadata.id})`);
  }

  /**
   * Get a skill by ID
   */
  public getSkill(skillId: string): AISkill | undefined {
    return this.skills[skillId];
  }

  /**
   * Get all skills as array
   */
  public getAllSkills(): AISkill[] {
    return Object.values(this.skills);
  }

  /**
   * Find skills that match a specific capability
   */
  public findSkillsByCapability(capability: keyof SkillCapabilities, context?: SkillContext): AISkill[] {
    return Object.values(this.skills).filter(skill => {
      const hasCapability = skill.capabilities[capability];
      if (!hasCapability) return false;
      
      // If context provided, check constraints
      if (context) {
        if (skill.constraints.supportedDomains && skill.constraints.supportedDomains.length > 0) {
          const domain = new URL(context.url).hostname;
          if (!skill.constraints.supportedDomains.some(d => domain.includes(d))) {
            return false;
          }
        }
      }
      
      return true;
    });
  }

  /**
   * Find skills by type
   */
  public findSkillsByType(type: SkillType): AISkill[] {
    return Object.values(this.skills).filter(skill => skill.metadata.type === type);
  }

  /**
   * Find skills that can achieve a specific goal
   * Uses AI to reason about which skills are relevant
   */
  public async findSkillsForGoal(goal: string, context: SkillContext, aiModel?: any): Promise<AISkill[]> {
    log.debug(`[SkillManager] Finding skills for goal: ${goal}`);
    
    // First, get all skills that might be relevant based on capabilities
    const relevantSkills = this.getAllSkills().filter(skill => {
      // Simple keyword matching for now
      const goalLower = goal.toLowerCase();
      const descLower = skill.metadata.description.toLowerCase();
      const nameLower = skill.metadata.name.toLowerCase();
      
      return descLower.includes(goalLower) || 
             nameLower.includes(goalLower) ||
             skill.metadata.tags.some(tag => goalLower.includes(tag.toLowerCase()));
    });
    
    // If AI model is available, use it for more sophisticated matching
    if (aiModel) {
      try {
        const skillDescriptions = this.getAllSkills().map(s => 
          `${s.metadata.id}: ${s.metadata.description} (capabilities: ${Object.keys(s.capabilities).filter(k => s.capabilities[k as keyof SkillCapabilities]).join(', ')})`
        ).join('\n');
        
        const prompt = `Given this goal: "${goal}"
        And current page: ${context.url}
        Which of these skills would be most relevant?
        ${skillDescriptions}
        
        Return ONLY the skill IDs (one per line) that are most relevant.`;
        
        // Use AI to select best skills
        // This is a placeholder - actual implementation would call the AI model
        log.debug('[SkillManager] AI-enhanced skill selection would happen here');
      } catch (error) {
        log.error('[SkillManager] AI skill selection failed:', error);
      }
    }
    
    return relevantSkills;
  }

  /**
   * Execute a skill with given parameters
   */
  public async executeSkill(skillId: string, params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    const skill = this.getSkill(skillId);
    if (!skill) {
      return {
        success: false,
        error: `Skill not found: ${skillId}`
      };
    }
    
    // Validate parameters
    if (skill.validate && !skill.validate(params, context)) {
      return {
        success: false,
        error: 'Parameter validation failed'
      };
    }
    
    // Check constraints
    if (skill.constraints.requiresPageLoad && !context.pageState?.isLoaded) {
      return {
        success: false,
        error: 'Page not loaded, skill requires loaded page'
      };
    }
    
    // Execute skill
    const startTime = Date.now();
    try {
      const result = await skill.execute(params, context);
      const executionTime = Date.now() - startTime;
      
      // Update skill metadata
      skill.metadata.usageCount++;
      if (result.success) {
        // Update success rate (simple moving average)
        const oldRate = skill.metadata.successRate || 0;
        skill.metadata.successRate = (oldRate * (skill.metadata.usageCount - 1) + 1) / skill.metadata.usageCount;
      }
      
      return {
        ...result,
        metadata: {
          ...result.metadata,
          executionTime
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Skill execution failed'
      };
    }
  }

  /**
   * Verify a skill execution result
   */
  public async verifySkillExecution(skillId: string, result: SkillResult, criteria: VerificationCriteria): Promise<boolean> {
    const skill = this.getSkill(skillId);
    if (!skill) return false;
    
    if (skill.verify) {
      return await skill.verify(result, criteria);
    }
    
    // Default verification based on criteria type
    switch (criteria.type) {
      case 'url_changed':
        return result.data?.url === criteria.expectedValue;
      case 'element_visible':
        return result.data?.visible === true;
      case 'text_contains':
        return result.data?.text?.includes(criteria.expectedValue);
      default:
        return true; // No verification method available
    }
  }

  /**
   * Create a learned skill from user demonstration
   */
  public createLearnedSkillFromDemonstration(demonstration: any): AISkill {
    // Generate unique ID
    const skillId = `learned-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const skill: AISkill = {
      metadata: {
        id: skillId,
        name: `Learned: ${demonstration.name || 'Unnamed'}`,
        description: demonstration.description || 'A skill learned from user demonstration',
        category: 'learned',
        type: demonstration.type || 'interaction',
        version: '1.0.0',
        author: 'user',
        usageCount: 0,
        successRate: 0,
        tags: ['learned', 'user-created'],
        requiredPermissions: demonstration.requiredPermissions || [],
        examples: demonstration.examples || []
      },
      capabilities: demonstration.capabilities || {
        canNavigate: false,
        canClick: true,
        canType: true,
        canRead: true,
        canDownload: false,
        canCompare: false,
        canWait: true,
        canExtract: true,
        canAnalyze: false,
        canBypassCaptcha: false
      },
      constraints: demonstration.constraints || {
        requiresPageLoad: true,
        requiresVisibleElement: true,
        supportedDomains: [],
        requiresPermissions: []
      },
      parameters: demonstration.parameters || [],
      execute: async (params, context) => {
        // Execute the learned sequence of actions
        // This would replay the demonstrated actions
        // For now, placeholder implementation
        return {
          success: true,
          data: { message: 'Learned skill executed (placeholder)' }
        };
      }
    };
    
    return skill;
  }

  /**
   * Save a learned skill to disk
   */
  public async saveLearnedSkill(skill: AISkill): Promise<void> {
    if (skill.metadata.category !== 'learned') {
      throw new Error('Only learned skills can be saved to user directory');
    }
    
    const filepath = path.join(this.learnedSkillsPath, `${skill.metadata.id}.json`);
    fs.writeFileSync(filepath, JSON.stringify(skill, null, 2));
    log.info(`[SkillManager] Saved learned skill: ${skill.metadata.name}`);
  }

  /**
   * Get skill statistics
   */
  public getSkillStats(): any {
    const stats = {
      total: Object.keys(this.skills).length,
      byCategory: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      topSkills: [] as any[]
    };
    
    Object.values(this.skills).forEach(skill => {
      // Count by category
      stats.byCategory[skill.metadata.category] = (stats.byCategory[skill.metadata.category] || 0) + 1;
      
      // Count by type
      stats.byType[skill.metadata.type] = (stats.byType[skill.metadata.type] || 0) + 1;
    });
    
    // Top skills by usage
    stats.topSkills = Object.values(this.skills)
      .sort((a, b) => b.metadata.usageCount - a.metadata.usageCount)
      .slice(0, 10)
      .map(s => ({
        name: s.metadata.name,
        id: s.metadata.id,
        usageCount: s.metadata.usageCount,
        successRate: s.metadata.successRate
      }));
    
    return stats;
  }

  private createNavigateToUrlSkill(): AISkill {
    return this.createSkillWithDefaults('navigate', 'Navigate to URL', 'navigation', { canNavigate: true }, ['url']);
  }

  private createClickElementSkill(): AISkill {
    return this.createSkillWithDefaults('click', 'Click Element', 'interaction', { canClick: true }, ['selector']);
  }

  private createTypeTextSkill(): AISkill {
    return this.createSkillWithDefaults('type', 'Type Text', 'form_filling', { canType: true }, ['selector', 'value']);
  }

  private createSelectDropdownSkill(): AISkill {
    return this.createSkillWithDefaults('select_option', 'Select Dropdown', 'form_filling', { canType: true }, ['selector', 'value']);
  }

  private createScrollPageSkill(): AISkill {
    return this.createSkillWithDefaults('scroll', 'Scroll Page', 'navigation', { canNavigate: true }, ['direction']);
  }

  private createWaitForElementSkill(): AISkill {
    return this.createSkillWithDefaults('wait', 'Wait', 'navigation', { canWait: true }, ['ms']);
  }

  private createExtractTextSkill(): AISkill {
    return this.createSkillWithDefaults('extract_text', 'Extract Text', 'information_extraction', { canExtract: true, canRead: true }, []);
  }

  private createExtractLinksSkill(): AISkill {
    return this.createSkillWithDefaults('extract_links', 'Extract Links', 'information_extraction', { canExtract: true, canRead: true }, []);
  }

  private createComparePricesSkill(): AISkill {
    return this.createSkillWithDefaults('compare_prices', 'Compare Prices', 'comparison', { canCompare: true, canNavigate: true, canExtract: true }, ['product']);
  }

  private createCheckAvailabilitySkill(): AISkill {
    return this.createSkillWithDefaults('check_availability', 'Check Availability', 'comparison', { canRead: true, canExtract: true }, ['item']);
  }

  private createFillFormSkill(): AISkill {
    return this.createSkillWithDefaults('fill_form', 'Fill Form', 'form_filling', { canType: true }, ['selector', 'value']);
  }

  private createDownloadFileSkill(): AISkill {
    return this.createSkillWithDefaults('download_file', 'Download File', 'information_extraction', { canDownload: true }, ['url']);
  }

  private createUploadFileSkill(): AISkill {
    return this.createSkillWithDefaults('upload_file', 'Upload File', 'form_filling', { canType: true }, ['selector', 'filepath']);
  }

  private createCaptchaBypassSkill(): AISkill {
    return this.createSkillWithDefaults('bypass_captcha', 'Bypass Captcha', 'captcha', { canBypassCaptcha: true }, []);
  }

  private createReadPageSkill(): AISkill {
    return this.createSkillWithDefaults('read_page', 'Read Page', 'information_extraction', { canRead: true }, []);
  }

  private createAnalyzePageStructureSkill(): AISkill {
    return this.createSkillWithDefaults('analyze_structure', 'Analyze Page Structure', 'analysis', { canAnalyze: true }, []);
  }

  private createSearchOnPageSkill(): AISkill {
    return this.createSkillWithDefaults('search_page', 'Search on Page', 'navigation', { canRead: true }, ['query']);
  }

  private createHoverElementSkill(): AISkill {
    return this.createSkillWithDefaults('hover', 'Hover Element', 'interaction', { canClick: true }, ['selector']);
  }

  private createRightClickElementSkill(): AISkill {
    return this.createSkillWithDefaults('right_click', 'Right Click Element', 'interaction', { canClick: true }, ['selector']);
  }

  private createDragDropSkill(): AISkill {
    return this.createSkillWithDefaults('drag_drop', 'Drag and Drop', 'interaction', { canClick: true }, ['sourceSelector', 'targetSelector']);
  }

  private createScreenshotSkill(): AISkill {
    return this.createSkillWithDefaults('screenshot', 'Take Screenshot', 'information_extraction', { canRead: true }, []);
  }

  private createSwitchTabSkill(): AISkill {
    return this.createSkillWithDefaults('switch_tab', 'Switch Tab', 'navigation', { canNavigate: true }, ['tabIndex']);
  }

  private createExtractImagesSkill(): AISkill {
    return this.createSkillWithDefaults('extract_images', 'Extract Images', 'information_extraction', { canExtract: true }, []);
  }

  private createExtractTablesSkill(): AISkill {
    return this.createSkillWithDefaults('extract_tables', 'Extract Tables', 'information_extraction', { canExtract: true }, []);
  }

  private createVerifyElementSkill(): AISkill {
    return this.createSkillWithDefaults('verify_element', 'Verify Element', 'analysis', { canAnalyze: true }, ['selector']);
  }

  private createSkillWithDefaults(
    id: string,
    name: string,
    type: SkillType,
    capabilities: Partial<SkillCapabilities>,
    requiredParams: string[]
  ): AISkill {
    const metadata: SkillMetadata = {
      id,
      name,
      description: `${name} skill`,
      category: 'hardcoded',
      type,
      version: '1.0.0',
      author: 'beam',
      usageCount: 0,
      successRate: 0,
      tags: [id, name.toLowerCase()],
      requiredPermissions: ['browser', 'network'],
      examples: [],
    };

    const defaultCapabilities: SkillCapabilities = {
      canNavigate: false,
      canClick: false,
      canType: false,
      canRead: false,
      canDownload: false,
      canCompare: false,
      canWait: false,
      canExtract: false,
      canAnalyze: false,
      canBypassCaptcha: false,
    };

    const params: SkillParameter[] = requiredParams.map(p => ({
      name: p,
      description: `${p} parameter`,
      type: 'string' as const,
      required: true,
    }));

    return {
      metadata,
      capabilities: { ...defaultCapabilities, ...capabilities },
      constraints: { requiresPageLoad: true, requiresVisibleElement: false, supportedDomains: [] },
      parameters: params,
      execute: async (_params: Record<string, any>, _context: SkillContext): Promise<SkillResult> => {
        return { success: true, data: { action: id, params: _params } };
      },
    };
  }

  public getSkillManifest(): string {
    const skills = this.getAllSkills();
    return skills.map(s => {
      return `### ${s.metadata.name.toUpperCase()} (${s.metadata.id})
Description: ${s.metadata.description}
Category: ${s.metadata.category}
Capabilities: ${Object.keys(s.capabilities).filter(k => s.capabilities[k as keyof SkillCapabilities]).join(', ')}
Parameters: ${s.parameters.map(p => `${p.name} (${p.type}${p.required ? ', required' : ''})`).join(', ') || 'none'}
Examples: ${s.metadata.examples.join(', ') || 'none'}`;
    }).join('\n\n');
  }

  public getSkillsList(): Array<{ id: string; name: string; description: string; category: string; version: string }> {
    return this.getAllSkills().map(s => ({
      id: s.metadata.id,
      name: s.metadata.name,
      description: s.metadata.description,
      category: s.metadata.category,
      version: s.metadata.version,
    }));
  }
}