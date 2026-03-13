import { app } from 'electron';
import path from 'path';
import fs from 'fs';

interface AgentSkillInput {
  [key: string]: any;
}

interface AgentSkillOutput {
  success: boolean;
  result?: any;
  error?: string;
}

export interface JsonSkill {
  id: string;
  name: string;
  description: string;
  inputSchema: any;
  outputSchema: any;
  executionLogic?: string;
}

export class SkillRegistry {
  private skills: Map<string, JsonSkill> = new Map();
  private dataDir: string = '';
  private skillsFile: string = '';
  private defaultSkillsFile: string = '';

  constructor() {
    this.initStorage();
    this.loadSkills();
    console.log('[SkillRegistry] Loaded skills:', Array.from(this.skills.keys()));
  }

  private initStorage(): void {
    try {
      const userDataPath = app.getPath('userData');
      this.dataDir = path.join(userDataPath, 'skills');
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      this.skillsFile = path.join(this.dataDir, 'skills.json');
      this.defaultSkillsFile = path.join(__dirname, 'default-skills.json');
    } catch (err) {
      console.error('[SkillRegistry] Init failed:', err);
    }
  }

  private loadSkills(): void {
    // Load default skills first
    if (fs.existsSync(this.defaultSkillsFile)) {
      try {
        const defaultSkills: JsonSkill[] = JSON.parse(fs.readFileSync(this.defaultSkillsFile, 'utf-8'));
        defaultSkills.forEach(skill => this.skills.set(skill.id, skill));
        console.log(`[SkillRegistry] Loaded ${defaultSkills.length} default skills`);
      } catch (e) {
        console.error('[SkillRegistry] Failed to load defaults:', e);
      }
    }

    // Load user skills from disk
    if (fs.existsSync(this.skillsFile)) {
      try {
        const userSkills: JsonSkill[] = JSON.parse(fs.readFileSync(this.skillsFile, 'utf-8'));
        userSkills.forEach(skill => this.skills.set(skill.id, skill));
        console.log(`[SkillRegistry] Loaded ${userSkills.length} user skills`);
      } catch (e) {
        console.error('[SkillRegistry] Failed to load user skills:', e);
      }
    }
  }

  private saveSkillsToDisk(): void {
    if (!this.skillsFile) return;
    try {
      const skillsArray = Array.from(this.skills.values());
      fs.writeFileSync(this.skillsFile, JSON.stringify(skillsArray, null, 2), 'utf-8');
      console.log(`[SkillRegistry] Saved ${skillsArray.length} skills to disk`);
    } catch (err) {
      console.error('[SkillRegistry] Save failed:', err);
    }
  }

  getSkills(): JsonSkill[] {
    return Array.from(this.skills.values());
  }

  getSkill(skillId: string): JsonSkill | undefined {
    return this.skills.get(skillId.toLowerCase());
  }

  addSkill(skill: JsonSkill): boolean {
    if (this.skills.has(skill.id)) {
      console.warn(`[SkillRegistry] Skill ${skill.id} already exists`);
      return false;
    }
    this.skills.set(skill.id, skill);
    this.saveSkillsToDisk();
    return true;
  }

  deleteSkill(skillId: string): boolean {
    if (!this.skills.has(skillId)) return false;
    this.skills.delete(skillId);
    this.saveSkillsToDisk();
    return true;
  }

  getSkillsDescription(): string {
    let description = '';
    this.skills.forEach(skill => {
      const params = skill.inputSchema?.properties ? Object.entries(skill.inputSchema.properties).map(([key, prop]: [string, any]) => {
        const required = skill.inputSchema.required?.includes(key) ? ', required' : ', optional';
        return `      - ${key} (${prop.type}${required}): ${prop.description || ''}`;
      }).join('\n') : '(none)';

      description += `### ${skill.id}
Description: ${skill.description}
Parameters:
${params}
Example: {}
Risk Level: SAFE

`;
    });
    return description;
  }

  async execute(skillId: string, input: AgentSkillInput, context?: any): Promise<AgentSkillOutput> {
    const normalizedId = skillId.toLowerCase();
    const skill = this.skills.get(normalizedId);
    
    console.log(`[SkillRegistry] execute: ${skillId} -> ${normalizedId}, found: ${!!skill}`);

    if (!skill) {
      return { success: false, error: `Unknown skill: ${skillId}` };
    }

    // Validate input
    if (skill.inputSchema?.required) {
      for (const required of skill.inputSchema.required) {
        if (!(required in input)) {
          return { success: false, error: `Missing required: ${required}` };
        }
      }
    }

    // Handle custom execution logic
    if (skill.executionLogic) {
      try {
        const func = new Function('input', 'context', skill.executionLogic);
        const result = await func(input, context);
        return { success: true, result };
      } catch (err: any) {
        return { success: false, error: `Execution failed: ${err.message}` };
      }
    }

    // Default skill handling
    try {
      return this.executeDefaultSkill(normalizedId, input, context);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private async executeDefaultSkill(skillId: string, input: any, context?: any): Promise<AgentSkillOutput> {
    switch (skillId) {
      case 'take_input':
        return { success: true, result: { action: 'request_user_input', prompt: input.prompt } };
      case 'companion_chat':
        return { success: true, result: { action: 'open_companion_chat' } };
      case 'get_page_info':
        return { success: true, result: { url: context?.url || 'Unknown', title: context?.title || 'Unknown' } };
      case 'read_webpage':
        return { success: true, result: { content: context?.content || 'No content' } };
      case 'display_result':
        return { success: true, result: { action: 'display_result', content: input.content, type: input.type } };
      default:
        // For browser skills, return success and let the renderer handle it
        return { success: true, result: { skill: skillId, params: input } };
    }
  }
}

let skillRegistry: SkillRegistry | null = null;

export function getSkillRegistry(): SkillRegistry {
  if (!skillRegistry) {
    skillRegistry = new SkillRegistry();
  }
  return skillRegistry;
}