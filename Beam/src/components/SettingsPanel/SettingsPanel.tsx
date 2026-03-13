import React, { useEffect, useState } from 'react';
import { useBrowserStore } from '../../stores/browserStore';
import { SearchEngine, UserSettings } from '../../types';
import './SettingsPanel.css';

interface SettingsPanelProps {
  onClose?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const switchTab = useBrowserStore(s => s.switchTab);
  const tabs = useBrowserStore(s => s.tabs);
  
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      const nonSettingsTab = tabs.find(t => !t.isSettings);
      if (nonSettingsTab) {
        switchTab(nonSettingsTab.id);
      }
    }
  };
  
  const [adBlockEnabled, setAdBlockEnabled] = useState(true);
  const [rulesCount, setRulesCount] = useState(0);
  const [searchEngines, setSearchEngines] = useState<SearchEngine[]>([]);
  const [selectedSearchEngine, setSelectedSearchEngine] = useState('duckduckgo');
  const [passwordManagerEnabled, setPasswordManagerEnabled] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncEmail, setSyncEmail] = useState('');
  const [sessionRetentionEnabled, setSessionRetentionEnabled] = useState(true);

  useEffect(() => {
    window.electronAPI.adblockGetStatus().then((stats) => {
      setAdBlockEnabled(stats.enabled);
      setRulesCount(stats.rules);
    });

    window.electronAPI.settingsGetSearchEngines().then((engines) => {
      setSearchEngines(engines);
    });

    window.electronAPI.settingsGetAll().then((settings: UserSettings) => {
      setSelectedSearchEngine(settings.searchEngine || 'duckduckgo');
      setPasswordManagerEnabled(settings.passwordManagerEnabled ?? true);
      setSessionRetentionEnabled(settings.sessionRetentionEnabled ?? true);
    });

    const currentTheme = document.documentElement.getAttribute('data-theme');
    setTheme((currentTheme as 'dark' | 'light') || 'dark');

    window.electronAPI.googleAuthStatus().then((status) => {
      if (status.isAuthenticated && status.user) {
        setGoogleUser(status.user);
      }
    });
  }, []);

  const handleToggleAdBlock = async () => {
    const newState = !adBlockEnabled;
    const stats = await window.electronAPI.adblockSetEnabled(newState);
    setAdBlockEnabled(stats.enabled);
    setRulesCount(stats.rules);
  };

  const handleUpdateFilters = async () => {
    const stats = await window.electronAPI.adblockUpdateFilters();
    setRulesCount(stats.rules);
  };

  const handleSearchEngineChange = async (engineId: string) => {
    setSelectedSearchEngine(engineId);
    await window.electronAPI.settingsSet('searchEngine', engineId);
  };

  const handleTogglePasswordManager = async () => {
    const newState = !passwordManagerEnabled;
    setPasswordManagerEnabled(newState);
    await window.electronAPI.settingsSet('passwordManagerEnabled', newState);
  };

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    window.electronAPI.settingsSet('theme', newTheme);
    useBrowserStore.getState().setTheme(newTheme);
  };

  const handleToggleSync = async () => {
    const newState = !syncEnabled;
    setSyncEnabled(newState);
    await window.electronAPI.settingsSet('syncEnabled', newState);
  };

  const handleToggleSessionRetention = async () => {
    const newState = !sessionRetentionEnabled;
    setSessionRetentionEnabled(newState);
    await window.electronAPI.settingsSet('sessionRetentionEnabled', newState);
    await window.electronAPI.sessionSetTabsEnabled(newState);
  };

  const handleClearCookies = async () => {
    if (confirm('Are you sure you want to clear all cookies? This will log you out of all websites.')) {
      await window.electronAPI.sessionClear();
      alert('All cookies have been cleared.');
    }
  };

  const handleSignIn = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const result = await window.electronAPI.googleAuthStart();
      if (result.success) {
        const status = await window.electronAPI.googleAuthStatus();
        setGoogleUser(status.user);
      } else {
        setAuthError(result.error || 'Failed to sign in');
      }
    } catch (err: any) {
      setAuthError(err.message);
    }
    setIsAuthLoading(false);
  };

  const handleSignOut = async () => {
    await window.electronAPI.googleAuthLogout();
    setGoogleUser(null);
  };

  return (
    <div className="settings-panel">
      <div className="settings-content">
        <div className="settings-section">
          <h3>Shields (Ad & Tracker Blocking)</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-title">Enable Shields</span>
              <span className="setting-desc">Blocks ads, trackers, and malicious scripts</span>
            </div>
            <div className="toggle-switch">
              <input 
                type="checkbox" 
                id="adblock-toggle" 
                checked={adBlockEnabled}
                onChange={handleToggleAdBlock}
              />
              <label htmlFor="adblock-toggle"></label>
            </div>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-title">Filter Rules</span>
              <span className="setting-desc">{rulesCount.toLocaleString()} active rules</span>
            </div>
            <button className="update-btn" onClick={handleUpdateFilters}>
              Update Filters
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3>Search Engine</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-title">Default Search Engine</span>
              <span className="setting-desc">Choose your preferred search engine</span>
            </div>
            <select 
              className="settings-select"
              value={selectedSearchEngine}
              onChange={(e) => handleSearchEngineChange(e.target.value)}
            >
              {searchEngines.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-section">
          <h3>Appearance</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-title">Theme</span>
              <span className="setting-desc">Choose light or dark mode</span>
            </div>
            <div className="theme-buttons">
              <button 
                className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => handleThemeChange('light')}
              >
                ☀️ Light
              </button>
              <button 
                className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => handleThemeChange('dark')}
              >
                🌙 Dark
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>Password Manager</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-title">Enable Password Manager</span>
              <span className="setting-desc">Securely store and autofill passwords</span>
            </div>
            <div className="toggle-switch">
              <input 
                type="checkbox" 
                id="password-toggle" 
                checked={passwordManagerEnabled}
                onChange={handleTogglePasswordManager}
              />
              <label htmlFor="password-toggle"></label>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>Google Account</h3>
          {googleUser ? (
            <div className="setting-item">
              <div className="setting-info">
                <img src={googleUser.picture} alt="Profile" className="user-avatar" />
                <div>
                  <span className="setting-title">{googleUser.name}</span>
                  <span className="setting-desc">{googleUser.email}</span>
                </div>
              </div>
              <button className="signout-btn" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          ) : (
            <div className="setting-item">
              <div className="setting-info">
                <span className="setting-title">Sign in with Google</span>
                <span className="setting-desc">Sync bookmarks, history, and passwords</span>
              </div>
              <button 
                className="signin-btn" 
                onClick={handleSignIn}
                disabled={isAuthLoading}
              >
                {isAuthLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          )}
          {authError && <div className="auth-error">{authError}</div>}
        </div>

        {/* Session Retention Settings */}
        <div className="settings-section">
          <h3>Session</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-title">Restore tabs on startup</span>
              <span className="setting-desc">Automatically reopen your tabs when you start the browser</span>
            </div>
            <div className="toggle-switch">
              <input 
                type="checkbox" 
                id="session-retention-toggle" 
                checked={sessionRetentionEnabled}
                onChange={handleToggleSessionRetention}
              />
              <label htmlFor="session-retention-toggle"></label>
            </div>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-title">Clear cookies</span>
              <span className="setting-desc">Remove all cookies and log out of all websites</span>
            </div>
            <button className="clear-cookies-btn" onClick={handleClearCookies}>
              Clear All Cookies
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
