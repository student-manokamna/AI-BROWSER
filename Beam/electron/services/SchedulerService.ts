import { BrowserWindow } from 'electron';
import { getAgentService } from './AgentService';

let log: any = console;

export interface ScheduledTask {
  id: string;
  name: string;
  command: string;
  trigger: ScheduleTrigger;
  repeat?: RepeatConfig;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  createdAt: number;
}

export type ScheduleTrigger =
  | { type: 'once'; time: number }
  | { type: 'daily'; time: string; hour: number; minute: number }
  | { type: 'interval'; minutes: number };

export interface RepeatConfig {
  enabled: boolean;
  count?: number;
  until?: number;
}

export class SchedulerService {
  private tasks: Map<string, ScheduledTask> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private isRunning: boolean = false;

  constructor() {
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

  async addTask(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'status'>): Promise<ScheduledTask> {
    const newTask: ScheduledTask = {
      ...task,
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      status: 'pending',
      nextRun: this.calculateNextRun(task.trigger)
    };

    this.tasks.set(newTask.id, newTask);

    if (task.enabled) {
      this.scheduleTask(newTask);
    }

    this.persistTasks();
    this.notifyRenderer('scheduler-task-added', newTask);

    log.info('[Scheduler] Task added:', newTask.name);
    return newTask;
  }

  async removeTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    this.cancelTask(taskId);
    this.tasks.delete(taskId);
    this.persistTasks();
    this.notifyRenderer('scheduler-task-removed', taskId);

    log.info('[Scheduler] Task removed:', task.name);
    return true;
  }

  async updateTask(taskId: string, updates: Partial<ScheduledTask>): Promise<ScheduledTask | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const updatedTask = { ...task, ...updates };
    this.tasks.set(taskId, updatedTask);

    this.cancelTask(taskId);
    if (updatedTask.enabled) {
      this.scheduleTask(updatedTask);
    }

    this.persistTasks();
    this.notifyRenderer('scheduler-task-updated', updatedTask);

    return updatedTask;
  }

  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  getEnabledTasks(): ScheduledTask[] {
    return this.getAllTasks().filter(t => t.enabled);
  }

  private calculateNextRun(trigger: ScheduleTrigger): number {
    const now = Date.now();

    switch (trigger.type) {
      case 'once':
        return trigger.time > now ? trigger.time : now;

      case 'daily': {
        const [hours, minutes] = trigger.time.split(':').map(Number);
        const today = new Date();
        today.setHours(hours, minutes, 0, 0);

        if (today.getTime() <= now) {
          today.setDate(today.getDate() + 1);
        }
        return today.getTime();
      }

      case 'interval':
        return now + (trigger.minutes * 60 * 1000);

      default:
        return now;
    }
  }

  private scheduleTask(task: ScheduledTask): void {
    if (this.timers.has(task.id)) {
      this.cancelTask(task.id);
    }

    const delay = Math.max(0, (task.nextRun || 0) - Date.now());

    const timer = setTimeout(async () => {
      await this.executeTask(task.id);
    }, delay);

    this.timers.set(task.id, timer);
    log.info(`[Scheduler] Task "${task.name}" scheduled in ${Math.round(delay / 1000 / 60)} minutes`);
  }

  private cancelTask(taskId: string): void {
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || !task.enabled) return;

    log.info('[Scheduler] Executing task:', task.name);

    task.status = 'running';
    this.notifyRenderer('scheduler-task-updated', task);

    try {
      const agentService = getAgentService();
      await agentService.executeTask(task.command);

      task.status = 'completed';
      task.lastRun = Date.now();

      if (task.repeat?.enabled) {
        if (task.repeat.count !== undefined) {
          task.repeat.count--;
          if (task.repeat.count <= 0) {
            task.enabled = false;
            task.status = 'paused';
          }
        }

        if (task.repeat.until && Date.now() >= task.repeat.until) {
          task.enabled = false;
          task.status = 'paused';
        }

        if (task.enabled) {
          task.nextRun = this.calculateNextRun(task.trigger);
          this.scheduleTask(task);
        }
      } else {
        task.enabled = false;
        task.status = 'completed';
      }
    } catch (err: any) {
      log.error('[Scheduler] Task execution failed:', err.message);
      task.status = 'failed';
    }

    this.persistTasks();
    this.notifyRenderer('scheduler-task-updated', task);
  }

  pauseTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return Promise.resolve(false);

    task.enabled = false;
    this.cancelTask(taskId);
    task.status = 'paused';

    this.persistTasks();
    this.notifyRenderer('scheduler-task-updated', task);

    return Promise.resolve(true);
  }

  resumeTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return Promise.resolve(false);

    task.enabled = true;
    task.status = 'pending';
    task.nextRun = this.calculateNextRun(task.trigger);
    this.scheduleTask(task);

    this.persistTasks();
    this.notifyRenderer('scheduler-task-updated', task);

    return Promise.resolve(true);
  }

  async runTaskNow(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    await this.executeTask(taskId);
    return true;
  }

  private notifyRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  private persistTasks(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      const dataPath = path.join(app.getPath('userData'), 'scheduler-tasks.json');

      const data = Array.from(this.tasks.values());
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    } catch (err) {
      log.warn('[Scheduler] Failed to persist tasks:', err);
    }
  }

  loadTasks(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      const dataPath = path.join(app.getPath('userData'), 'scheduler-tasks.json');

      if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        this.tasks.clear();

        for (const task of data) {
          this.tasks.set(task.id, task);

          if (task.enabled && task.nextRun && task.nextRun > Date.now()) {
            this.scheduleTask(task);
          }
        }

        log.info('[Scheduler] Loaded', this.tasks.size, 'tasks');
      }
    } catch (err) {
      log.warn('[Scheduler] Failed to load tasks:', err);
    }
  }

  start(): void {
    this.isRunning = true;
    this.loadTasks();

    for (const task of this.getEnabledTasks()) {
      this.scheduleTask(task);
    }

    log.info('[Scheduler] Service started');
  }

  stop(): void {
    this.isRunning = false;

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    log.info('[Scheduler] Service stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

let schedulerService: SchedulerService | null = null;

export function getSchedulerService(): SchedulerService {
  if (!schedulerService) {
    schedulerService = new SchedulerService();
  }
  return schedulerService;
}
