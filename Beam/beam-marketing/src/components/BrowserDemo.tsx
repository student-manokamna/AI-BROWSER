import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface DemoStep {
  id: number
  text: string
  status: 'pending' | 'running' | 'done'
  delay?: number
}

interface DemoConfig {
  title: string
  prompt: string
  steps: DemoStep[]
  pageContent: {
    title: string
    form?: boolean
    table?: boolean
    search?: boolean
  }
}

const demoConfigs: Record<string, DemoConfig> = {
  login: {
    title: 'Login Automation',
    prompt: 'Login to my Gmail account',
    steps: [
      { id: 1, text: 'Checking for stored credentials...', status: 'pending' },
      { id: 2, text: 'Navigating to accounts.google.com', status: 'pending' },
      { id: 3, text: 'Filling username field', status: 'pending' },
      { id: 4, text: 'Filling password field', status: 'pending' },
      { id: 5, text: 'Login successful!', status: 'pending' },
    ],
    pageContent: {
      title: 'accounts.google.com',
      form: true,
    }
  },
  extract: {
    title: 'Data Extraction',
    prompt: 'Extract all product prices from Amazon',
    steps: [
      { id: 1, text: 'Navigating to Amazon', status: 'pending' },
      { id: 2, text: 'Searching for products', status: 'pending' },
      { id: 3, text: 'Extracting product data...', status: 'pending' },
      { id: 4, text: 'Found 15 products', status: 'pending' },
      { id: 5, text: 'Data extracted successfully!', status: 'pending' },
    ],
    pageContent: {
      title: 'amazon.com',
      search: true,
    }
  },
  form: {
    title: 'Multi-step Form',
    prompt: 'Register for the tech conference',
    steps: [
      { id: 1, text: 'Navigating to registration page', status: 'pending' },
      { id: 2, text: 'Filling personal information', status: 'pending' },
      { id: 3, text: 'Selecting ticket type', status: 'pending' },
      { id: 4, text: 'Completing payment', status: 'pending' },
      { id: 5, text: 'Registration complete!', status: 'pending' },
    ],
    pageContent: {
      title: 'techconf2026.com',
      form: true,
    }
  }
}

export function BrowserDemo({ type }: { type: 'login' | 'extract' | 'form' }) {
  const config = demoConfigs[type]
  const [steps, setSteps] = useState<DemoStep[]>(config.steps)
  const [currentStep, setCurrentStep] = useState(0)
  const [showAgent, setShowAgent] = useState(false)
  const [agentText, setAgentText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const stepRef = useRef<number>(0)

  useEffect(() => {
    // Reset when demo changes
    setSteps(config.steps)
    setCurrentStep(0)
    setShowAgent(false)
    setAgentText('')
    stepRef.current = 0

    // Start demo after a short delay
    const startTimer = setTimeout(() => {
      setShowAgent(true)
      typeAgentText(config.prompt)
    }, 800)

    return () => clearTimeout(startTimer)
  }, [type, config])

  const typeAgentText = (text: string) => {
    setIsTyping(true)
    let i = 0
    const interval = setInterval(() => {
      setAgentText(text.substring(0, i + 1))
      i++
      if (i >= text.length) {
        clearInterval(interval)
        setIsTyping(false)
        // Start executing steps
        setTimeout(() => executeNextStep(), 500)
      }
    }, 50)
  }

  const executeNextStep = () => {
    if (stepRef.current >= steps.length) return

    const stepIndex = stepRef.current
    setCurrentStep(stepIndex)

    setSteps(prev => prev.map((step, i) => ({
      ...step,
      status: i < stepIndex ? 'done' : i === stepIndex ? 'running' : 'pending'
    })))

    stepRef.current++

    // Schedule next step
    const delay = stepIndex === 0 ? 1200 : 1500
    if (stepRef.current < steps.length) {
      setTimeout(executeNextStep, delay)
    }
  }

  return (
    <div className="browser-window">
      {/* Title Bar */}
      <div className="browser-titlebar">
        <div className="window-controls">
          <div className="window-control close"></div>
          <div className="window-control minimize"></div>
          <div className="window-control maximize"></div>
        </div>
        <div className="window-title">
          <span style={{ marginRight: 8 }}>🔒</span>
          {config.pageContent.title}
        </div>
      </div>

      {/* Toolbar */}
      <div className="browser-toolbar">
        <button className="browser-btn">←</button>
        <button className="browser-btn">→</button>
        <button className="browser-btn">⟳</button>
        <div className="browser-url">
          🔗 {config.pageContent.title}
        </div>
      </div>

      {/* Content */}
      <div className="browser-content">
        {/* Fake Webpage */}
        <div className="browser-webview">
          <FakeWebpage type={type} currentStep={currentStep} />
        </div>

        {/* Agent Panel Overlay */}
        <AnimatePresence>
          {showAgent && (
            <motion.div 
              className="agent-panel-overlay"
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="agent-panel-header">
                <div className="agent-panel-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                </div>
                <span className="agent-panel-label">AI Agent</span>
              </div>
              
              <div className="agent-panel-content">
                <textarea 
                  className="agent-input"
                  value={agentText}
                  placeholder="What would you like me to do?"
                  readOnly
                  rows={3}
                  style={{ 
                    cursor: 'default',
                    minHeight: 72
                  }}
                />
                <button 
                  className="agent-send-btn"
                  disabled={isTyping || currentStep < steps.length - 1}
                >
                  {isTyping ? (
                    <span className="animate-pulse">Sending...</span>
                  ) : currentStep >= steps.length - 1 ? (
                    '✓ Complete'
                  ) : (
                    'Executing...'
                  )}
                </button>

                {/* Steps */}
                <div className="agent-steps">
                  {steps.map((step, i) => (
                    <motion.div 
                      key={step.id}
                      className="agent-step"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ 
                        opacity: i <= currentStep ? 1 : 0.4,
                        y: 0 
                      }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <div className={`agent-step-icon ${step.status}`}>
                        {step.status === 'done' ? '✓' : step.status === 'running' ? '◐' : '○'}
                      </div>
                      <span className="agent-step-text">{step.text}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// Fake webpage component
function FakeWebpage({ type, currentStep }: { type: string, currentStep: number }) {
  const isComplete = currentStep >= 4
  
  return (
    <div className="fake-page">
      {/* Fake Header */}
      <div className="fake-page-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <input 
          className="fake-search" 
          type="text" 
          placeholder="Search the web..."
          readOnly
        />
      </div>

      {/* Fake Content */}
      <div className="fake-page-content">
        {type === 'login' && (
          <div className="fake-form">
            <h2>Welcome back</h2>
            <p style={{ marginBottom: 24, color: '#a1a1aa' }}>Sign in to continue to your account</p>
            
            {/* Email field - fills at step 2 */}
            <motion.input 
              className="fake-input"
              type="text" 
              placeholder="Email or phone"
              initial={false}
              animate={{ 
                backgroundColor: currentStep >= 2 ? '#3d3d5d' : '#3d3d4d',
              }}
              style={{
                color: currentStep >= 2 ? '#fff' : '#777'
              }}
              value={currentStep >= 2 ? 'user@example.com' : ''}
              readOnly
            />
            
            {/* Password field - fills at step 3 */}
            <motion.input 
              className="fake-input" 
              type="password" 
              placeholder="Enter your password"
              initial={false}
              animate={{ 
                backgroundColor: currentStep >= 3 ? '#3d3d5d' : '#3d3d4d',
              }}
              style={{
                color: currentStep >= 3 ? '#fff' : '#777'
              }}
              value={currentStep >= 3 ? '••••••••' : ''}
              readOnly
            />
            <button className="fake-btn">
              {isComplete ? '✓ Signed in' : 'Sign in'}
            </button>
          </div>
        )}

        {type === 'extract' && (
          <div>
            <h2>Search Results</h2>
            <p style={{ marginBottom: 24, color: '#a1a1aa' }}>
              {currentStep >= 3 ? 'Showing 15 results' : currentStep >= 2 ? 'Searching...' : 'Ready to search'}
            </p>
            
            {currentStep >= 3 && (
              <div style={{ background: '#2d2d3d', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#3d3d4d', borderBottom: '1px solid #4d4d5d' }}>
                      <th style={{ padding: 12, textAlign: 'left', fontSize: 14 }}>Product</th>
                      <th style={{ padding: 12, textAlign: 'right', fontSize: 14 }}>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'MacBook Pro M3', price: '$1,999' },
                      { name: 'iPhone 15 Pro', price: '$999' },
                      { name: 'iPad Air', price: '$599' },
                      { name: 'AirPods Pro', price: '$249' },
                      { name: 'Apple Watch', price: '$399' },
                    ].map((item, i) => (
                      <motion.tr 
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        style={{ borderBottom: '1px solid #3d3d4d' }}
                      >
                        <td style={{ padding: 12, fontSize: 14 }}>{item.name}</td>
                        <td style={{ padding: 12, textAlign: 'right', color: '#22c55e', fontSize: 14 }}>{item.price}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {type === 'form' && (
          <div className="fake-form">
            <h2>Tech Conference 2026</h2>
            <p style={{ marginBottom: 24, color: '#a1a1aa' }}>Complete your registration</p>
            
            {/* Name - fills at step 1 */}
            <motion.input 
              className="fake-input" 
              placeholder="Full Name"
              animate={{ backgroundColor: currentStep >= 1 ? '#3d3d5d' : '#3d3d4d' }}
              style={{ color: currentStep >= 1 ? '#fff' : '#777' }}
              value={currentStep >= 1 ? 'John Doe' : ''}
              readOnly
            />
            
            {/* Email - fills at step 2 */}
            <motion.input 
              className="fake-input" 
              placeholder="Email"
              animate={{ backgroundColor: currentStep >= 2 ? '#3d3d5d' : '#3d3d4d' }}
              style={{ color: currentStep >= 2 ? '#fff' : '#777' }}
              value={currentStep >= 2 ? 'john@example.com' : ''}
              readOnly
            />
            
            {/* Company - fills at step 3 */}
            <motion.input 
              className="fake-input" 
              placeholder="Company"
              animate={{ backgroundColor: currentStep >= 3 ? '#3d3d5d' : '#3d3d4d' }}
              style={{ color: currentStep >= 3 ? '#fff' : '#777' }}
              value={currentStep >= 3 ? 'Tech Corp' : ''}
              readOnly
            />
            
            <motion.select 
              className="fake-input" 
              style={{ appearance: 'auto', cursor: 'pointer' }}
              animate={{ backgroundColor: currentStep >= 4 ? '#3d3d5d' : '#3d3d4d' }}
              value={currentStep >= 4 ? 'pro' : ''}
              disabled={currentStep < 4}
            >
              <option value="">Select Ticket</option>
              <option value="basic">Basic - Free</option>
              <option value="pro">Pro - $299</option>
              <option value="vip">VIP - $599</option>
            </motion.select>
            
            <button className="fake-btn">
              {isComplete ? '✓ Registered!' : 'Complete Registration'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
