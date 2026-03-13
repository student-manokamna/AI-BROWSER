import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBrowserStore } from '../../stores/browserStore';
import { parseUrlInput, isNewTabUrl } from '../../utils/url';
import '../../styles/navbar.css';

/**
 * NavigationBar — Address bar with navigation buttons, security indicator, and action buttons.
 */
export function NavigationBar() {
  const tabs = useBrowserStore(s => s.tabs);
  const activeTabId = useBrowserStore(s => s.activeTabId);
  const updateTab = useBrowserStore(s => s.updateTab);
  const showSettingsPanel = useBrowserStore(s => s.showSettingsPanel);
  const toggleSettingsPanel = useBrowserStore(s => s.toggleSettingsPanel);
  const openSettingsTab = useBrowserStore(s => s.openSettingsTab);
  const toggleAgentPanel = useBrowserStore(s => s.toggleAgentPanel);
  const toggleTheme = useBrowserStore(s => s.toggleTheme);
  const theme = useBrowserStore(s => s.theme);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Use ref to store webview refs
  const webviewRefsRef = useRef<Map<string, any>>(new Map());

  // Initialize webview refs from window after mount
  useEffect(() => {
    const interval = setInterval(() => {
      const refs = (window as any).__webviewRefs?.current;
      if (refs) {
        webviewRefsRef.current = refs;
      }
    }, 500);

    // Clear after first successful read
    setTimeout(() => clearInterval(interval), 5000);

    return () => clearInterval(interval);
  }, []);

  const getWebview = useCallback(() => {
    return webviewRefsRef.current?.get(activeTabId);
  }, [activeTabId]);

  const handleClearCookies = useCallback(async () => {
    if (confirm('Clear all cookies? This will log you out of all websites.')) {
      try {
        await window.electronAPI?.sessionClear();
      } catch (err) {
        console.error('Failed to clear cookies:', err);
      }
    }
  }, []);

  // Sync URL bar with active tab
  useEffect(() => {
    if (activeTab && !isFocused) {
      const url = typeof activeTab.url === 'string' ? activeTab.url : '';
      setInputValue(isNewTabUrl(url) ? '' : url);
    }
  }, [activeTabId, activeTab?.url, isFocused]);

  const handleNavigate = useCallback(async (url: string) => {
    const finalUrl = await parseUrlInput(url);
    if (!finalUrl || isNewTabUrl(finalUrl)) return;

    // Navigate via webview directly
    const webview = getWebview();
    if (webview) {
      webview.loadURL(finalUrl);
    }

    updateTab(activeTabId, { url: finalUrl, isNewTab: false, isLoading: true });
    setInputValue(finalUrl);
  }, [activeTabId, updateTab, getWebview]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleNavigate(inputValue);
    // Blur the input after navigating
    (document.activeElement as HTMLElement)?.blur();
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleBack = () => {
    const webview = getWebview();
    if (webview?.canGoBack()) {
      webview.goBack();
    }
  };

  const handleForward = () => {
    const webview = getWebview();
    if (webview?.canGoForward()) {
      webview.goForward();
    }
  };

  const handleReload = () => {
    const webview = getWebview();
    if (activeTab?.isLoading) {
      webview?.stop();
    } else {
      webview?.reload();
    }
  };

  const handleHome = () => {
    const webview = getWebview();
    webview?.loadURL('about:blank');
    updateTab(activeTabId, { url: 'about:blank', title: 'New Tab', isNewTab: true, isLoading: false, favicon: '' });
    setInputValue('');
  };

  const isSecure = typeof activeTab?.url === 'string' && activeTab.url.startsWith('https://');

  return (
    <nav className="navbar">
      {/* Nav buttons island */}
      <div className="navbar__nav-group">
        <button className="navbar__btn" onClick={handleBack} disabled={!activeTab?.canGoBack} title="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        <button className="navbar__btn" onClick={handleForward} disabled={!activeTab?.canGoForward} title="Forward">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>

        <button className="navbar__btn" onClick={handleReload} title={activeTab?.isLoading ? 'Stop' : 'Reload'}>
          {activeTab?.isLoading ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          )}
        </button>

        <button className="navbar__btn" onClick={handleHome} title="Home">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
      </div>

      {/* Address bar */}
      <form onSubmit={handleSubmit} className="navbar__address">
        {/* Security lock */}
        {activeTab && !isNewTabUrl(activeTab.url) && (
          <div className={`navbar__lock ${isSecure ? '' : 'navbar__lock--insecure'}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isSecure ? (
                <>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </>
              ) : (
                <>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </>
              )}
            </svg>
          </div>
        )}

        <input
          type="text"
          className="navbar__input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Search or enter URL..."
          spellCheck={false}
          autoComplete="off"
        />

        {/* Loading progress */}
        {activeTab?.isLoading && (
          <div className="navbar__progress">
            <div className="navbar__progress-bar" />
          </div>
        )}
      </form>

      {/* Right-side actions */}
      <div className="navbar__actions">
        {/* Theme toggle */}
        <button className="navbar__action" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        {/* Settings button */}
        <button
          className={`navbar__action ${showSettingsPanel ? 'navbar__action--active' : ''}`}
          onClick={openSettingsTab}
          title="Settings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>

        {/* Clear cookies button */}
        <button
          className="navbar__action navbar__action--danger"
          onClick={handleClearCookies}
          title="Clear cookies"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>

        {/* Agent button */}
        <button
          className={`navbar__action navbar__action--agent`}
          onClick={toggleAgentPanel}
          title="AI Agent"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V6a7 7 0 0 1 7 7h.27c.34-.6.99-1 1.73-1a2 2 0 1 1 0 4c-.74 0-1.39-.4-1.73-1H20a7 7 0 0 1-7 7v.27c.6.34 1 .99 1 1.73a2 2 0 1 1-4 0c0-.74.4-1.39 1-1.73V22a7 7 0 0 1-7-7h-.27c-.34.6-.99 1-1.73 1a2 2 0 1 1 0-4c.74 0 1.39.4 1.73 1H4a7 7 0 0 1 7-7V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
            <circle cx="12" cy="13" r="2" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
