import React from 'react';
import { useBrowserStore } from '../../stores/browserStore';
import '../../styles/tabbar.css';

/**
 * TabBar — Chrome-style tab strip with add/close/switch functionality.
 */
export function TabBar() {
  const tabs = useBrowserStore(s => s.tabs);
  const activeTabId = useBrowserStore(s => s.activeTabId);
  const switchTab = useBrowserStore(s => s.switchTab);
  const closeTab = useBrowserStore(s => s.closeTab);
  const addTab = useBrowserStore(s => s.addTab);

  const handleTabClick = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (tabId !== activeTabId) {
      switchTab(tabId);
    }
  };

  return (
    <div className="tabbar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tabbar__tab ${activeTabId === tab.id ? 'tabbar__tab--active' : ''}`}
          onMouseDown={(e) => handleTabClick(e, tab.id)}
          title={tab.title}
        >
          {/* Favicon / Loading indicator */}
          {tab.isLoading ? (
            <div className="tabbar__favicon--loading" />
          ) : tab.favicon ? (
            <img
              className="tabbar__favicon"
              src={tab.favicon}
              alt=""
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="tabbar__favicon--default" />
          )}

          {/* Title */}
          <span className="tabbar__title">{tab.title}</span>

          {/* Close button */}
          <button
            className="tabbar__close"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            title="Close tab"
          >
            ×
          </button>
        </div>
      ))}

      {/* Add tab button */}
      <button className="tabbar__add" onClick={() => addTab()} title="New tab">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
