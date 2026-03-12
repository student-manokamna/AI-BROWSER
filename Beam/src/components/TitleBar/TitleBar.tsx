import React from 'react';
import { useBrowserStore } from '../../stores/browserStore';
import '../../styles/titlebar.css';

/**
 * TitleBar — Custom frameless window title bar with drag region and window controls.
 * This replaces the native OS title bar for a seamless browser chrome look.
 */
export function TitleBar() {
  const isMaximized = useBrowserStore(s => s.isMaximized);
  const isMac = (window as any).electronAPI?.platform === 'darwin';

  const handleMinimize = () => window.electronAPI?.windowMinimize();
  const handleMaximize = () => window.electronAPI?.windowMaximize();
  const handleClose = () => window.electronAPI?.windowClose();

  const controls = (
    <div className={`titlebar__controls ${isMac ? 'titlebar__controls--mac' : ''}`}>
      <button className="titlebar__btn titlebar__btn--close" onClick={handleClose} title="Close">
        {isMac ? null : (
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        )}
      </button>
      <button className="titlebar__btn titlebar__btn--minimize" onClick={handleMinimize} title="Minimize">
        {isMac ? null : (
          <svg viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        )}
      </button>
      <button className="titlebar__btn titlebar__btn--maximize" onClick={handleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
        {isMac ? null : isMaximized ? (
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="1.5" y="3" width="6" height="6" />
            <polyline points="3,3 3,1 9,1 9,7 7.5,7" />
          </svg>
        ) : (
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="1" y="1" width="8" height="8" />
          </svg>
        )}
      </button>
    </div>
  );

  const brand = (
    <div className="titlebar__brand">
      <div className="titlebar__logo">
        <div className="titlebar__logo-icon" />
      </div>
      <span className="titlebar__name">Beam</span>
    </div>
  );

  return (
    <div className={`titlebar ${isMac ? 'titlebar--mac' : ''}`}>
      {isMac ? controls : brand}
      {isMac ? brand : controls}
    </div>
  );
}
