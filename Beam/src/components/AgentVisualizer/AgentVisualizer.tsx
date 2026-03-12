import React, { useState, useEffect, useRef } from 'react';
import { AgentTask, AgentPlanStep } from '../../types';
import '../../styles/agent.css';

interface AgentActivity {
  id: string;
  type: 'navigate' | 'read' | 'click' | 'input' | 'extract' | 'wait' | 'thinking' | 'complete';
  description: string;
  timestamp: number;
  data?: any;
}

interface AgentVisualizerProps {
  task: AgentTask | null;
}

export function AgentVisualizer({ task }: AgentVisualizerProps) {
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (task && task.steps) {
      const runningStep = task.steps.find(s => s.status === 'running');
      if (runningStep) {
        const newActivity: AgentActivity = {
          id: `${runningStep.id}-${Date.now()}`,
          type: 'thinking',
          description: runningStep.description,
          timestamp: Date.now(),
        };
        
        setActivities(prev => {
          const exists = prev.some(a => 
            a.type === newActivity.type && 
            a.description === newActivity.description &&
            Date.now() - a.timestamp < 1000
          );
          if (exists) return prev;
          return [...prev.slice(-50), newActivity];
        });
      }
    }
  }, [task?.status]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities]);

  const remainingSteps = task?.steps?.filter(s => s.status === 'pending') || [];
  const completedSteps = task?.steps?.filter(s => s.status === 'done') || [];
  const currentStep = task?.steps?.find(s => s.status === 'running');
  const currentStepIndex = task?.steps?.findIndex(s => s.status === 'running') ?? -1;

  return (
    <div className="agent-visualizer">
      <div className="agent-visualizer__header">
        <div className="agent-visualizer__status">
          <div className={`agent-visualizer__pulse ${task?.status === 'executing' ? 'active' : ''}`} />
          <span className="agent-visualizer__status-text">
            {task?.status === 'planning' && '🤔 Planning...'}
            {task?.status === 'executing' && '⚡ Executing'}
            {task?.status === 'waiting_human' && '💬 Waiting for you'}
            {task?.status === 'done' && '✅ Complete'}
            {task?.status === 'error' && '❌ Error'}
          </span>
        </div>
        {task && task.steps && (
          <div className="agent-visualizer__progress">
            Step {currentStepIndex + 1} of {task.steps.length}
          </div>
        )}
      </div>

      <div className="agent-visualizer__activity" ref={scrollRef}>
        {activities.length === 0 && (
          <div className="agent-visualizer__empty">
            <div className="agent-visualizer__empty-icon">🚀</div>
            <p>Agent is idle</p>
            <p className="agent-visualizer__empty-hint">Give it a task to get started</p>
          </div>
        )}
        
        {activities.map((activity, index) => (
          <div 
            key={activity.id} 
            className={`agent-visualizer__item ${index === activities.length - 1 ? 'agent-visualizer__item--latest' : ''}`}
            style={{ '--activity-color': getActivityColor(activity.type) } as React.CSSProperties}
          >
            <div className="agent-visualizer__item-time">
              {formatTime(activity.timestamp)}
            </div>
            <div className="agent-visualizer__item-icon">
              {getActivityIcon(activity.type)}
            </div>
            <div className="agent-visualizer__item-content">
              <p className="agent-visualizer__item-desc">{activity.description}</p>
              {activity.data?.url && (
                <span className="agent-visualizer__item-url">{activity.data.url}</span>
              )}
            </div>
            {index === activities.length - 1 && task?.status === 'executing' && (
              <div className="agent-visualizer__item-indicator" />
            )}
          </div>
        ))}
      </div>

      {remainingSteps.length > 0 && (
        <div className="agent-visualizer__remaining">
          <div className="agent-visualizer__remaining-header">
            <span>Up Next ({remainingSteps.length})</span>
          </div>
          <div className="agent-visualizer__remaining-list">
            {remainingSteps.slice(0, 5).map((step, index) => (
              <div key={step.id} className="agent-visualizer__remaining-item">
                <span className="agent-visualizer__remaining-num">{completedSteps.length + index + 1}</span>
                <span className="agent-visualizer__remaining-desc">{step.description}</span>
              </div>
            ))}
            {remainingSteps.length > 5 && (
              <div className="agent-visualizer__remaining-more">
                +{remainingSteps.length - 5} more steps
              </div>
            )}
          </div>
        </div>
      )}

      {task?.status === 'done' && (
        <div className="agent-visualizer__complete">
          <div className="agent-visualizer__complete-icon">🎉</div>
          <p>Task completed!</p>
          {task.result && <p className="agent-visualizer__result">{task.result}</p>}
        </div>
      )}

      {task?.status === 'error' && (
        <div className="agent-visualizer__error">
          <div className="agent-visualizer__error-icon">⚠️</div>
          <p>{task.error}</p>
        </div>
      )}
    </div>
  );
}
