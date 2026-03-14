import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  const isDragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const panelStartPos = useRef({ x: 0, y: 0 });

  // Set initial position to center vertically when panel opens
  useEffect(() => {
    if (showAgentPanel && panelPosition.y === 0) {
      const centerY = Math.max(50, (window.innerHeight - 600) / 2);
      setPanelPosition({ x: 20, y: centerY });
    }
  }, [showAgentPanel]);

  // Inject theme CSS into all webviews when theme changes
  useEffect(() => {
    const injectThemeCSS = () => {
      const webviews = document.querySelectorAll('webview');
      
      // Use CSS that respects websites' own dark mode support via prefers-color-scheme
      // and also force a dark background for websites without dark mode
      const darkThemeCSS = `
        @media (prefers-color-scheme: light) {
          html {
            background: #1a1a1a !important;
          }
        }
        html {
          background: #1a1a1a !important;
        }
      `;
      
      const lightThemeCSS = `
        @media (prefers-color-scheme: dark) {
          html {
            background: #ffffff !important;
          }
        }
        html {
          background: #ffffff !important;
        }
      `;
      
      const css = theme === 'dark' ? darkThemeCSS : lightThemeCSS;
      
      webviews.forEach((webview: any) => {
        try {
          webview.insertCSS(css);
        } catch (e) {
          // Ignore errors
        }
      });
    };
    
    injectThemeCSS();
  }, [theme]);

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

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.agent-panel__content')) return;
    isDragging.current = true;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartPos.current = { x: panelPosition.x, y: panelPosition.y };
    e.preventDefault();
  }, [panelPosition]);

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    setPanelPosition({
      x: panelStartPos.current.x + deltaX,
      y: panelStartPos.current.y + deltaY
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
    return () => {
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [handleDrag, handleDragEnd]);

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
        >
          <div className="agent-panel-overlay__drag-handle" onMouseDown={handleDragStart}>
            <span className="drag-handle-dots">⋮⋮</span>
          </div>
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
