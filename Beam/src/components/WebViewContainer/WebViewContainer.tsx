import React, { useRef, useEffect, useCallback, memo } from 'react';
import { useBrowserStore } from '../../stores/browserStore';
import { getFaviconUrl, isNewTabUrl, isAgentUrl } from '../../utils/url';
import { NewTabPage } from '../NewTabPage/NewTabPage';
import { SettingsPanel } from '../SettingsPanel/SettingsPanel';
import '../../styles/webview.css';



interface WebViewProps {
  tabId: string;
  initialUrl: string;
  isActive: boolean;
  onRegister: (tabId: string, webview: any) => void;
}

const WebView = memo(function WebView({ tabId, initialUrl, isActive, onRegister }: WebViewProps) {
  const webviewRef = useRef<any>(null);
  const hasRegisteredRef = useRef<boolean>(false);



  useEffect(() => {
    if (hasRegisteredRef.current) return;

    const webview = webviewRef.current;
    if (!webview) {
      return;
    }
    hasRegisteredRef.current = true;
    onRegister(tabId, webview);
  }, [tabId, onRegister]);

  return (
    <webview
      ref={webviewRef}
      src={initialUrl}
      data-tab-id={tabId}
      className={`webview-container__view ${isActive ? 'webview-container__view--active' : ''}`}
      partition="persist:beam"
      allowpopups={true}
      webpreferences="contextIsolation=yes"
    />
  );
}, (prevProps, nextProps) => {
  return prevProps.tabId === nextProps.tabId &&
    prevProps.initialUrl === nextProps.initialUrl &&
    prevProps.isActive === nextProps.isActive;
});

/**
 * WebViewContainer — Manages multiple webview instances, one per tab.
 * Shows/hides webviews based on active tab, and relays events to the store.
 */
export function WebViewContainer() {
  const tabs = useBrowserStore(s => s.tabs);
  const activeTabId = useBrowserStore(s => s.activeTabId);
  const updateTab = useBrowserStore(s => s.updateTab);
  const addTab = useBrowserStore(s => s.addTab);
  const switchTab = useBrowserStore(s => s.switchTab);
  const updateTabRef = useRef(updateTab);
  updateTabRef.current = updateTab;
  const webviewRefs = useRef<Map<string, any>>(new Map());
  const registeredTabs = useRef<Set<string>>(new Set());
  const initialSrcSet = useRef<Set<string>>(new Set());

  const unsubNavigateRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (window.electronAPI?.onAgentNavigateWebview) {
      // Remove existing listeners first to prevent duplicates on HMR
      if (unsubNavigateRef.current) unsubNavigateRef.current();
      unsubNavigateRef.current = window.electronAPI.onAgentNavigateWebview((data: { url: string; tabId: string }) => {
        const newTabId = addTab(data.url);
        setTimeout(() => {
          switchTab(newTabId);
          window.electronAPI?.agentSetActiveTabId(newTabId);
        }, 1000);
      }) as unknown as () => void;
    }

    // Listen for agent tab operations
    const handleAgentGetTabs = () => {
      const allTabs = useBrowserStore.getState().tabs;
      const tabData = allTabs.map(t => ({ id: t.id, title: t.title, url: t.url }));
      window.electronAPI?.sendToMain('agent-get-tabs-response', tabData);
    };

    const handleAgentSwitchTab = (tabId: string) => {
      switchTab(tabId);
      window.electronAPI?.agentSetActiveTabId(tabId);
    };

    const handleAgentCloseTab = (tabId: string) => {
      useBrowserStore.getState().closeTab(tabId);
    };

    const handleAgentCreateTab = (url: string) => {
      const newTabId = addTab(url || 'about:blank');
      setTimeout(() => {
        switchTab(newTabId);
        window.electronAPI?.agentSetActiveTabId(newTabId);
      }, 500);
    };

    // Get page state from active webview
    const handleAgentGetPageState = () => {
      const currentActiveTabId = useBrowserStore.getState().activeTabId;
      const webview = webviewRefs.current.get(currentActiveTabId);

      if (webview) {
        webview.executeJavaScript(`
          (function() {
            return {
              url: window.location.href,
              title: document.title,
              html: document.documentElement.outerHTML.substring(0, 50000)
            };
          })()
        `).then((result: any) => {
          // Use the response channel the main process expects
          window.electronAPI?.sendToMain('agent-page-state-result', result);
        }).catch((err: any) => {
          window.electronAPI?.sendToMain('agent-page-state-result', { error: err.message });
        });
      } else {
        window.electronAPI?.sendToMain('agent-page-state-result', { error: 'No webview found' });
      }
    };

    // Add IPC listeners
    if (window.electronAPI?.onFromMain) {
      window.electronAPI.onFromMain('agent-get-tabs-request', handleAgentGetTabs);
      window.electronAPI.onFromMain('agent-switch-tab-request', handleAgentSwitchTab);
      window.electronAPI.onFromMain('agent-close-tab-request', handleAgentCloseTab);
      window.electronAPI.onFromMain('agent-create-tab-request', handleAgentCreateTab);
      window.electronAPI.onFromMain('agent-get-page-state-request', handleAgentGetPageState);
    }

    return () => {
      // Cleanup IPC listeners to prevent duplicates
      if (unsubNavigateRef.current) unsubNavigateRef.current();
    };
  }, [addTab, switchTab]);

  const registerWebview = useCallback((tabId: string, webview: any) => {
    if (registeredTabs.current.has(tabId)) return;
    registeredTabs.current.add(tabId);
    webviewRefs.current.set(tabId, webview);

    const handleStartLoading = () => updateTabRef.current(tabId, { isLoading: true });
    const handleStopLoading = () => updateTabRef.current(tabId, { isLoading: false });
    const handleTitleUpdated = (e: any) => updateTabRef.current(tabId, { title: e.title || 'Untitled' });
    const handleNavigate = (e: any) => {
      const favicon = getFaviconUrl(e.url);
      updateTabRef.current(tabId, { url: e.url, favicon, canGoBack: webview.canGoBack(), canGoForward: webview.canGoForward(), isLoading: false });
    };
    const handleNavigateInPage = (e: any) => {
      if (!e.isMainFrame) return;

      const oldUrl = webview?.getURL();

      if (oldUrl === e.url) {
        return;
      }

      updateTabRef.current(tabId, { url: e.url, canGoBack: webview.canGoBack(), canGoForward: webview.canGoForward(), isLoading: false });
    };
    const handleFaviconUpdated = (e: any) => {
      if (e.favicons && e.favicons.length > 0) updateTabRef.current(tabId, { favicon: e.favicons[0] });
    };
    const handleFailLoad = (e: any) => {
      if (e.errorCode !== -3 && e.errorCode !== -6) {
        updateTabRef.current(tabId, { isLoading: false });
      }
    };


    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-stop-loading', handleStopLoading);
    webview.addEventListener('page-title-updated', handleTitleUpdated);
    webview.addEventListener('did-navigate', handleNavigate);
    webview.addEventListener('did-navigate-in-page', handleNavigateInPage);
    webview.addEventListener('page-favicon-updated', handleFaviconUpdated);
    webview.addEventListener('did-fail-load', handleFailLoad);
  }, []);

  useEffect(() => {
    const tabIds = new Set(tabs.map(t => t.id));
    for (const [id] of webviewRefs.current) {
      if (!tabIds.has(id)) {
        webviewRefs.current.delete(id);
        registeredTabs.current.delete(id);
      }
    }
  }, [tabs]);

  // Defer exposing globals to avoid blocking render
  useEffect(() => {
    // Use requestAnimationFrame to defer execution
    requestAnimationFrame(() => {
      (window as any).__webviewRefs = webviewRefs;
      setTimeout(() => {
        (window as any).__beamActiveTabId = activeTabId;
        (window as any).__beamStore = useBrowserStore;
      }, 100);
    });
  }, [activeTabId]);

  return (
    <main className="webview-container">
      {tabs.map(tab => {
        const isActive = activeTabId === tab.id;
        const url = typeof tab.url === 'string' ? tab.url : 'about:blank';
        const isNew = isNewTabUrl(url);



        if (tab.isSettings) {
          return (
            <div
              key={tab.id}
              className={`webview-container__view ${isActive ? 'webview-container__view--active' : ''}`}
            >
              {isActive && <SettingsPanel />}
            </div>
          );
        }

        if (isNew) {
          return (
            <div
              key={tab.id}
              className={`webview-container__view ${isActive ? 'webview-container__view--active' : ''}`}
            >
              {isActive && <NewTabPage />}
            </div>
          );
        }

        return (
          <WebView
            key={tab.id}
            tabId={tab.id}
            initialUrl={url}
            isActive={isActive}
            onRegister={registerWebview}
          />
        );
      })}
    </main>
  );
}
