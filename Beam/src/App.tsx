import React, { useEffect, useState, useRef } from 'react';
import { TitleBar } from './components/TitleBar/TitleBar';
import { TabBar } from './components/TabBar/TabBar';
import { NavigationBar } from './components/NavigationBar/NavigationBar';
import { WebViewContainer } from './components/WebViewContainer/WebViewContainer';
import { AgentPanel } from './components/AgentPanel/AgentPanel';
import { AgentSidePanel } from './components/AgentSidePanel/AgentSidePanel';
import { useBrowserStore } from './stores/browserStore';

// Import all styles
import './styles/globals.css';
import './styles/titlebar.css';
import './styles/tabbar.css';
import './styles/navbar.css';
import './styles/webview.css';
import './styles/agent.css';
import './styles/newtab.css';

/**
 * App — Root component that orchestrates the browser chrome layout.
 * Layout: TitleBar → TabBar → NavigationBar → WebViewContainer
 */
function App() {
  const theme = useBrowserStore(s => s.theme);
  const setMaximized = useBrowserStore(s => s.setMaximized);
  const showAgentPanel = useBrowserStore(s => s.showAgentPanel);
  const setAgentPanel = useBrowserStore(s => s.setAgentPanel);
  const [panelPosition, setPanelPosition] = useState({ x: 20, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Set initial position to center vertically when panel opens
  useEffect(() => {
    if (showAgentPanel && panelPosition.y === 0) {
      const centerY = Math.max(50, (window.innerHeight - 600) / 2);
      setPanelPosition({ x: 20, y: centerY });
    }
  }, [showAgentPanel]);

  // Restore browser session on startup
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const sessionData = await window.electronAPI.sessionRestoreBrowser();
        if (sessionData && sessionData.tabs.length > 0) {
          // Restore tabs
          const { tabs: existingTabs } = useBrowserStore.getState();
          const existingTabIds = existingTabs.map(t => t.id);
          
          // Add restored tabs that don't already exist
          const restoredTabs = sessionData.tabs
            .filter(t => !existingTabIds.includes(t.id))
            .map(t => ({
              id: t.id,
              title: t.title || 'Untitled',
              url: t.url,
              favicon: t.favicon || '',
              isLoading: false,
              canGoBack: false,
              canGoForward: false,
              isNewTab: false,
              isSettings: false,
            }));
          
          if (restoredTabs.length > 0) {
            // Replace the existing tabs with restored tabs
            useBrowserStore.getState().setTabs([...restoredTabs]);
            
            // Switch to the restored active tab if it exists, or first restored tab
            const activeTabFromSession = restoredTabs.find(t => t.id === sessionData.activeTabId);
            if (activeTabFromSession) {
              useBrowserStore.getState().switchTab(activeTabFromSession.id);
            } else if (restoredTabs.length > 0) {
              useBrowserStore.getState().switchTab(restoredTabs[0].id);
            }
          }
        }
      } catch (err) {
        console.error('Failed to restore session:', err);
      }
    };

    restoreSession();
  }, []);

  // Listen for maximize state changes from main process
  useEffect(() => {
    const cleanup = window.electronAPI?.onWindowMaximizedChanged?.((isMaximized: boolean) => {
      setMaximized(isMaximized);
    });
    return () => cleanup?.();
  }, [setMaximized]);

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.agent-panel__content')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - panelPosition.x,
      y: e.clientY - panelPosition.y
    });
  };

  const handleDrag = (e: MouseEvent) => {
    if (!isDragging) return;
    setPanelPosition({
      x: Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 400)),
      y: Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - 600))
    });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDrag);
      document.addEventListener('mouseup', handleDragEnd);
    }
    return () => {
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging, dragOffset]);

  console.log('[Renderer] App rendering with theme:', theme);
  
  return (
    <div className="app-container">
      <TitleBar />
      <TabBar />
      <NavigationBar />
      <WebViewContainer />
      <AgentSidePanel />
      {showAgentPanel && (
        <div 
          className="agent-panel-overlay"
          style={{ 
            top: panelPosition.y, 
            right: undefined, 
            left: panelPosition.x,
            transform: 'none'
          }}
          onMouseDown={handleDragStart}
        >
          <button 
            className="agent-panel-overlay__close"
            onClick={(e) => {
              e.stopPropagation();
              setAgentPanel(false);
            }}
            title="Close Agent Panel"
          >
            ×
          </button>
          <AgentPanel />
        </div>
      )}
    </div>
  );
}

export default App;
