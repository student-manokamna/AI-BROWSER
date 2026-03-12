import React, { useState, useEffect, useRef } from 'react';
import { HumanFeedbackRequest, HumanFeedbackResponse, HumanFeedbackOption, AgentTask } from '../../types';
import '../../styles/agent.css';

interface HumanFeedbackDialogProps {
  request: HumanFeedbackRequest;
  onResponse: (response: HumanFeedbackResponse) => void;
  task?: AgentTask | null;
}

export function HumanFeedbackDialog({ request, onResponse, task }: HumanFeedbackDialogProps) {
  const [textInput, setTextInput] = useState(request.defaultValue || '');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(request.type === 'text_input' || !request.options);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showResult && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showResult]);

  const handleSubmit = () => {
    let response: string | boolean;
    
    switch (request.type) {
      case 'yes_no':
        response = selectedOption === 'yes';
        break;
      case 'confirmation':
        response = selectedOption === 'confirm';
        break;
      case 'multiple_choice':
        response = selectedOption || '';
        break;
      case 'text_input':
        response = textInput;
        break;
      default:
        response = '';
    }

    onResponse({
      requestId: request.id,
      response,
      timestamp: Date.now()
    });
  };

  const handleContinue = () => {
    if (textInput.trim()) {
      onResponse({
        requestId: request.id,
        response: textInput,
        timestamp: Date.now()
      });
      setTextInput('');
    }
  };

  const renderContent = () => {
    if (!showResult && request.options && request.options.length > 0) {
      return (
        <div className="feedback-options">
          {request.options.map((option: HumanFeedbackOption) => (
            <button 
              key={option.value}
              className={`feedback-option-btn ${selectedOption === option.value ? 'selected' : ''}`}
              onClick={() => {
                setSelectedOption(option.value);
                setShowResult(true);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      );
    }

    switch (request.type) {
      case 'yes_no':
      case 'confirmation':
        return (
          <div className="feedback-options">
            {request.type === 'yes_no' ? (
              <>
                <button 
                  className={`feedback-option-btn ${selectedOption === 'yes' ? 'selected' : ''}`}
                  onClick={() => setSelectedOption('yes')}
                >
                  Yes
                </button>
                <button 
                  className={`feedback-option-btn ${selectedOption === 'no' ? 'selected' : ''}`}
                  onClick={() => setSelectedOption('no')}
                >
                  No
                </button>
              </>
            ) : (
              <>
                <button 
                  className={`feedback-option-btn ${selectedOption === 'confirm' ? 'selected' : ''}`}
                  onClick={() => setSelectedOption('confirm')}
                >
                  Confirm
                </button>
                <button 
                  className={`feedback-option-btn cancel ${selectedOption === 'cancel' ? 'selected' : ''}`}
                  onClick={() => setSelectedOption('cancel')}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        );

      case 'multiple_choice':
        return (
          <div className="feedback-options">
            {request.options?.map((option: HumanFeedbackOption) => (
              <button 
                key={option.value}
                className={`feedback-option-btn ${selectedOption === option.value ? 'selected' : ''}`}
                onClick={() => setSelectedOption(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        );

      case 'text_input':
        return (
          <div className="feedback-text-input">
            <input
              ref={inputRef}
              type={request.requiresPassword ? 'password' : 'text'}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={request.placeholder || 'Enter your response...'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSubmit();
                }
              }}
            />
          </div>
        );

      default:
        return null;
    }
  };

  const canSubmit = () => {
    if (request.type === 'yes_no' || request.type === 'confirmation' || request.type === 'multiple_choice') {
      return selectedOption !== null;
    }
    if (request.type === 'text_input') {
      return textInput.trim().length > 0;
    }
    return false;
  };

  return (
    <div className="human-feedback-overlay">
      <div className="human-feedback-dialog human-feedback-dialog--wide">
        <div className="human-feedback-header">
          <div className="human-feedback-icon">
            {request.type === 'yes_no' || request.type === 'confirmation' ? '⚠️' : '💬'}
          </div>
          <h3>{request.title}</h3>
        </div>
        
        <div className="human-feedback-body">
          <p className="human-feedback-message">{request.message}</p>
          {renderContent()}
        </div>

        <div className="human-feedback-actions">
          <button 
            className="feedback-submit-btn"
            onClick={handleSubmit}
            disabled={!canSubmit()}
          >
            Submit
          </button>
        </div>

        {task && task.status === 'done' && (
          <div className="human-feedback-result">
            <div className="human-feedback-result-header">
              <span>📊 Task Result</span>
            </div>
            <div className="human-feedback-result-content">
              <p>{task.result || 'Task completed successfully'}</p>
            </div>
            <div className="human-feedback-continue">
              <input
                ref={inputRef}
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Ask a follow-up question or enter a new command..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleContinue();
                  }
                }}
              />
              <button 
                className="feedback-continue-btn"
                onClick={handleContinue}
                disabled={!textInput.trim()}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
