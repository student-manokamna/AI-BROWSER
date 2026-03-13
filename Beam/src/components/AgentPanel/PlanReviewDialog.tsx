import React, { useState } from 'react';
import { AgentPlan, AgentPlanStep } from '../../types';

interface PlanReviewDialogProps {
  isOpen: boolean;
  plan: AgentPlan | null;
  onApprove: () => void;
  onCancel: () => void;
}

export function PlanReviewDialog({
  isOpen,
  plan,
  onApprove,
  onCancel
}: PlanReviewDialogProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  if (!isOpen || !plan) return null;

  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const getSkillIcon = (skillId: string) => {
    switch (skillId) {
      case 'navigate': return '🌐';
      case 'click': return '👆';
      case 'type': return '⌨️';
      case 'extract': return '📊';
      case 'scroll': return '📜';
      case 'wait': return '⏳';
      case 'fillForm': return '📝';
      case 'screenshot': return '📷';
      // New skills (lowercase to match registry)
      case 'get_page_info': return '📄';
      case 'read_webpage': return '📖';
      case 'extract_metadata': return '🏷️';
      case 'extract_structured': return '🧩';
      case 'summarize_content': return '📝';
      case 'solve_math_problem': return '🔢';
      case 'web_search': return '🔍';
      case 'get_weather': return '🌤️';
      case 'convert_units': return '🔄';
      case 'calculate': return '🧮';
      default: return '🔧';
    }
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="plan-review-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Review Plan</h3>
          <button className="dialog-close" onClick={onCancel}>×</button>
        </div>

        <div className="dialog-content">
          <div className="plan-summary">
            <p><strong>Goal:</strong> {plan.finalGoal}</p>
            <p><strong>Steps:</strong> {plan.steps.length}</p>
          </div>

          <div className="plan-steps">
            {plan.steps.map((step, index) => (
              <div
                key={step.id}
                className={`plan-step ${expandedSteps.has(step.id) ? 'expanded' : ''}`}
                onClick={() => toggleStep(step.id)}
              >
                <div className="step-header">
                  <span className="step-number">{index + 1}</span>
                  <span className="step-icon">{getSkillIcon(step.skill)}</span>
                  <span className="step-description">{step.description}</span>
                  <span className="step-toggle">
                    {expandedSteps.has(step.id) ? '▲' : '▼'}
                  </span>
                </div>

                {expandedSteps.has(step.id) && (
                  <div className="step-details">
                    <div className="step-detail">
                      <strong>Skill:</strong> {step.skill}
                    </div>
                    <div className="step-detail">
                      <strong>Input:</strong>
                      <pre>{JSON.stringify(step.input, null, 2)}</pre>
                    </div>
                    <div className="step-detail">
                      <strong>Expected Output:</strong> {step.expectedOutput}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="plan-actions">
            <button className="btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn-approve" onClick={onApprove}>
              Approve & Execute
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
