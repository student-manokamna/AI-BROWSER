import React, { useState, useEffect, useRef } from 'react';
import './AgentSidePanel.css';

export interface SidePanelContent {
  content: string;
  type: 'text' | 'markdown' | 'html' | 'table';
  title: string;
  actions?: { label: string; action: string }[];
}

interface SidePanelResult {
  id: string;
  content: string;
  type: 'text' | 'markdown' | 'html' | 'table';
  title: string;
  timestamp: number;
  actions?: { label: string; action: string }[];
}

export function AgentSidePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SidePanelResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const resultsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.electronAPI?.onAgentDisplayResult) {
      const unsubscribe = window.electronAPI.onAgentDisplayResult((data: SidePanelContent) => {
        const newResult: SidePanelResult = {
          id: `result_${Date.now()}`,
          content: data.content,
          type: (data.type as any) || 'text',
          title: data.title || 'Result',
          timestamp: Date.now(),
          actions: data.actions
        };
        
        setResults(prev => [...prev, newResult]);
        setIsOpen(true);
      });

      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, []);

  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [results]);

  const clearResults = () => {
    setResults([]);
  };

  const handleActionClick = (action: string) => {
    if (window.electronAPI?.executeAgentCommand) {
      window.electronAPI.executeAgentCommand(action);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const renderContent = (result: SidePanelResult) => {
    switch (result.type) {
      case 'markdown':
        return (
          <div className="markdown-content" dangerouslySetInnerHTML={{ __html: parseMarkdown(result.content) }} />
        );
      case 'html':
        return <div className="html-content" dangerouslySetInnerHTML={{ __html: result.content }} />;
      case 'table':
        try {
          const data = JSON.parse(result.content);
          return renderTable(data);
        } catch {
          return <pre className="text-content">{result.content}</pre>;
        }
      default:
        return <pre className="text-content">{result.content}</pre>;
    }
  };

  const renderTable = (data: any[]) => {
    if (!Array.isArray(data) || data.length === 0) {
      return <pre>{JSON.stringify(data, null, 2)}</pre>;
    }
    
    const headers = Object.keys(data[0]);
    
    return (
      <table className="data-table">
        <thead>
          <tr>
            {headers.map(h => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {headers.map(h => <td key={h}>{row[h]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const parseMarkdown = (md: string): string => {
    return md
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/\n/gim, '<br />');
  };

  return (
    <>
      <div className={`agent-side-panel ${results.length > 0 ? 'visible' : ''}`}>
        <div className="side-panel-header">
          <h3>Agent Results</h3>
          <div className="side-panel-controls">
            {results.length > 0 && (
              <button className="clear-btn" onClick={clearResults} title="Clear results">
                Clear
              </button>
            )}
            <button className="toggle-btn" onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? '×' : '◀'}
            </button>
          </div>
        </div>
        
        {isOpen && (
          <div className="side-panel-content">
            {results.length === 0 ? (
              <div className="empty-state">
                <p>No results yet</p>
                <small>Results from agent actions will appear here</small>
              </div>
            ) : (
              <div className="results-list">
                {results.map(result => (
                  <div key={result.id} className={`result-item type-${result.type}`}>
                    <div className="result-header">
                      <span className="result-title">{result.title}</span>
                      <span className="result-time">{formatTimestamp(result.timestamp)}</span>
                    </div>
                    <div className="result-body">
                      {renderContent(result)}
                    </div>
                    {result.actions && result.actions.length > 0 && (
                      <div className="result-actions">
                        {result.actions.map((action, i) => (
                          <button 
                            key={i} 
                            className="action-btn"
                            onClick={() => handleActionClick(action.action)}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={resultsEndRef} />
              </div>
            )}
            
            {isLoading && (
              <div className="loading-indicator">
                <span className="spinner"></span>
                Processing...
              </div>
            )}
          </div>
        )}
      </div>
      
      {results.length > 0 && !isOpen && (
        <button 
          className="side-panel-notification"
          onClick={() => setIsOpen(true)}
        >
          {results.length} result{results.length > 1 ? 's' : ''}
        </button>
      )}
    </>
  );
}
