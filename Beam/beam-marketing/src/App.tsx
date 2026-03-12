import { useState } from 'react'
import { BrowserDemo } from './components/BrowserDemo'
import './App.css'

function App() {
  const [activeDemo, setActiveDemo] = useState<'login' | 'extract' | 'form' | 'mental-wellness' | 'misinformation'>('login')

  return (
    <div className="app">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">
            <span>●</span> AI-Powered Browser
          </div>
          <h1>Browse Smarter with Beam</h1>
          <p>
            The world's first AI-integrated browser that automates your web tasks. 
            From login automation to data extraction, let AI do the work while you watch.
          </p>
          <div className="hero-buttons">
            <a 
              href="https://github.com/tanubhavjuneja/Beam/releases" 
              className="btn btn-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download for Windows
            </a>
            <a 
              href="https://github.com/tanubhavjuneja/Beam" 
              className="btn btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="container">
          <h2 style={{ textAlign: 'center' }}>Powered by Intelligence</h2>
          <p style={{ textAlign: 'center', maxWidth: '600px', margin: '1rem auto 0' }}>
            Beam combines a modern browsing experience with powerful AI capabilities
          </p>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </div>
              <h3>AI Agent</h3>
              <p>
                Give natural language commands and watch as AI navigates, fills forms, 
                and completes tasks autonomously across your tabs.
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <h3>Smart Password Manager</h3>
              <p>
                Automatically captures and stores credentials during manual logins. 
                Autofills saved passwords instantly. Multi-page form support included.
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3>Built-in Ad Blocker</h3>
              <p>
                Blocks ads, trackers, and malicious scripts by default. 
                Enjoy cleaner, faster, and safer browsing without extensions.
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12h20"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <h3>Web Research</h3>
              <p>
                Extract structured data, summarize content, and search the web 
                directly from the browser using AI-powered commands.
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </div>
              <h3>Session Management</h3>
              <p>
                Save and restore browser sessions. Your login states persist 
                across sessions. Perfect for managing multiple accounts.
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              </div>
              <h3>Stealth Mode</h3>
              <p>
                Evade bot detection with anti-fingerprinting features. 
                Browse like a human with randomized profiles.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section className="demo-section">
        <div className="demo-header">
          <h2>See It In Action</h2>
          <p>
            Watch how Beam's AI agent handles complex tasks automatically. 
            Just describe what you want, and let Beam do the rest.
          </p>
        </div>
        
        <div className="demo-tabs">
          <button 
            className={`demo-tab ${activeDemo === 'login' ? 'active' : ''}`}
            onClick={() => setActiveDemo('login')}
          >
            Login Automation
          </button>
          <button 
            className={`demo-tab ${activeDemo === 'extract' ? 'active' : ''}`}
            onClick={() => setActiveDemo('extract')}
          >
            Data Extraction
          </button>
          <button 
            className={`demo-tab ${activeDemo === 'form' ? 'active' : ''}`}
            onClick={() => setActiveDemo('form')}
          >
            Form Filling
          </button>
          <button 
            className={`demo-tab ${activeDemo === 'mental-wellness' ? 'active' : ''}`}
            onClick={() => setActiveDemo('mental-wellness')}
          >
            Mental Wellness
          </button>
          <button 
            className={`demo-tab ${activeDemo === 'misinformation' ? 'active' : ''}`}
            onClick={() => setActiveDemo('misinformation')}
          >
            Fact Checking
          </button>
        </div>
        
        <BrowserDemo type={activeDemo} />
      </section>

      {/* Download Section */}
      <section className="download-section">
        <div className="download-content">
          <h2>Ready to Experience the Future?</h2>
          <p>Download Beam Browser now and start browsing smarter.</p>
          <div className="download-buttons">
            <a 
              href="https://github.com/tanubhavjuneja/Beam/releases" 
              className="btn btn-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download Beam Browser
            </a>
            <a 
              href="https://github.com/tanubhavjuneja/Beam" 
              className="btn btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Star on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="container">
          <div className="footer-content">
            <div className="footer-links">
              <a href="https://github.com/tanubhavjuneja/Beam" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a href="https://github.com/tanubhavjuneja/Beam/releases" target="_blank" rel="noopener noreferrer">Downloads</a>
              <a href="https://github.com/tanubhavjuneja/Beam/issues" target="_blank" rel="noopener noreferrer">Report Issues</a>
            </div>
            
            <div className="footer-team">
              <h4>Development Team</h4>
              <div className="team-list">
                <span className="team-member">Tanubhav Juneja</span>
                <span className="team-member">Suhani Munjal</span>
                <span className="team-member">Manokamna</span>
                <span className="team-member">Aditya Singh</span>
              </div>
            </div>
            
            <p className="footer-copyright">
              © 2026 Beam Browser. Open source under University of Delhi License.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
