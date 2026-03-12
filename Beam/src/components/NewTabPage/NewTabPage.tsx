import React, { useState, useCallback } from 'react';
import { useBrowserStore } from '../../stores/browserStore';
import { parseUrlInput } from '../../utils/url';
import '../../styles/newtab.css';

/**
 * NewTabPage — Beautiful landing page with search and quick shortcuts.
 */

const SHORTCUTS = [
  { label: 'DuckDuckGo', url: 'https://duckduckgo.com', letter: 'D', color: 'hsl(30, 90%, 55%)' },
  { label: 'Wikipedia', url: 'https://wikipedia.org', letter: 'W', color: 'hsl(0, 0%, 45%)' },
  { label: 'GitHub', url: 'https://github.com', letter: 'G', color: 'hsl(260, 50%, 50%)' },
  { label: 'Reddit', url: 'https://reddit.com', letter: 'R', color: 'hsl(16, 100%, 50%)' },
];

export function NewTabPage() {
  const [searchValue, setSearchValue] = useState('');
  const activeTabId = useBrowserStore(s => s.activeTabId);
  const updateTab = useBrowserStore(s => s.updateTab);
  const webviewRefsRef = React.useRef<any>(null);

  React.useEffect(() => {
    webviewRefsRef.current = (window as any).__webviewRefs;
  }, []);

  const handleSearch = useCallback(async (input: string) => {
    const url = await parseUrlInput(input);
    if (!url) return;

    // Navigate via webview directly
    const webviewRefs = webviewRefsRef.current;
    const webview = webviewRefs?.current?.get(activeTabId);
    if (webview) {
      webview.loadURL(url);
    }
    
    updateTab(activeTabId, { url, isNewTab: false, isLoading: true, title: input });
  }, [activeTabId, updateTab]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      handleSearch(searchValue);
    }
  };

  const handleShortcutClick = (url: string) => {
    handleSearch(url);
  };

  return (
    <div className="newtab">
      {/* Logo */}
      <div className="newtab__logo">
        <div className="newtab__logo-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
        </div>
        <h1 className="newtab__title">Beam</h1>
        <p className="newtab__subtitle">Private. Intelligent. Yours.</p>
      </div>

      {/* Search */}
      <form className="newtab__search" onSubmit={handleSubmit}>
        <div className="newtab__search-bar">
          <div className="newtab__search-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <input
            type="text"
            className="newtab__search-input"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search or enter URL..."
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </form>

      {/* Quick Shortcuts */}
      <div className="newtab__shortcuts">
        {SHORTCUTS.map(sc => (
          <div
            key={sc.url}
            className="newtab__shortcut"
            onClick={() => handleShortcutClick(sc.url)}
          >
            <div className="newtab__shortcut-icon" style={{ background: `${sc.color}22`, color: sc.color }}>
              {sc.letter}
            </div>
            <span className="newtab__shortcut-label">{sc.label}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="newtab__footer">
        <span>Beam Browser</span>
        <div className="newtab__footer-dot" />
        <span>Privacy First</span>
        <div className="newtab__footer-dot" />
        <span>Powered by AI</span>
      </div>
    </div>
  );
}
