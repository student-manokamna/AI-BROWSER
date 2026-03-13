import React, { useState, useEffect } from 'react';

interface UserInputDialogProps {
  isOpen: boolean;
  prompt: string;
  onSubmit: (response: string) => void;
  onCancel: () => void;
}

export function UserInputDialog({ isOpen, prompt, onSubmit, onCancel }: UserInputDialogProps) {
  const [input, setInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInput('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSubmit(input);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="user-input-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>AI Request</h3>
          <button className="dialog-close" onClick={onCancel}>×</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="dialog-content">
            <p className="input-prompt">{prompt}</p>
            <input
              type="text"
              className="user-input-field"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your answer..."
              autoFocus
            />
          </div>
          
          <div className="dialog-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={!input.trim()}>
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}