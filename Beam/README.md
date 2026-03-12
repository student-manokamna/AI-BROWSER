# Beam Browser

An AI-powered browser with an integrated agent that can automate web tasks, manage passwords, and assist with browsing.

## Features

### 🤖 AI Agent
- Natural language commands to automate web tasks
- Multi-step task planning and execution
- Three wait modes: Active, Passive, and Sleep
- Credentials managed locally - never exposed to AI

### 🔐 Password Manager
- Automatic credential capture on login/registration
- Multi-page form tracking
- Profile information storage (email, phone, address, etc.)
- Autofill for stored credentials

### 🛡️ AD Blocking
- Built-in ad blocking using filter lists
- Simple blocklist fallback for reliable blocking

### 🌐 Browser Features
- Tab management
- Multiple search engine support
- Dark/Light theme
- Google account sync

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+
- Windows 10/11 (for building)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/beam.git
cd beam
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm run dev
```

This will start:
- Vite dev server for the renderer
- TypeScript compilation for Electron
- Electron app with hot reload

### Building

To create a production build:

```bash
npm run electron:build
```

This will:
- Compile TypeScript
- Build the Vite renderer
- Package with Electron Builder

The installer will be created at `release/Beam Browser Setup 1.0.0.exe`

## Project Structure

```
beam/
├── electron/                 # Electron main process
│   ├── main.ts              # Main entry point
│   ├── preload.ts           # Preload scripts
│   └── services/            # Main process services
│       ├── AgentService.ts          # AI agent logic
│       ├── AIService.ts             # AI model integration
│       ├── AdBlockService.ts        # Ad blocking
│       ├── CredentialWatcherService.ts  # Password watching
│       ├── PasswordManagerService.ts    # Password storage
│       └── ...
├── src/                     # React renderer
│   ├── components/          # React components
│   ├── stores/              # State management
│   ├── styles/              # CSS styles
│   ├── types/                # TypeScript types
│   └── utils/               # Utilities
├── dist/                    # Vite build output
├── release/                 # Electron build output
└── package.json
```

## Agent Commands

The AI agent understands these actions:

### Navigation
- `browse` - Navigate to a URL in a new tab
- `open_new_tab` - Open a new empty tab
- `switch_to_tab` - Switch to a specific tab
- `close_tab` - Close a tab
- `go_back` / `go_forward` - Navigate history
- `reload` - Reload page

### Login & Credentials
- `check_credentials` - Check if credentials exist
- `auto_login` - Login with stored credentials
- `autofill` - Fill stored credentials
- `wait_for_manual_login` - Wait for user to login manually
- `logout` - Logout from current site
- `check_login_status` - Check if logged in

### Interaction
- `click` / `click_by_text` - Click elements
- `fill_form` - Fill form fields
- `submit_form` - Submit forms
- `select_option` - Select dropdown options
- `press_key` - Keyboard shortcuts

### Wait Modes
- `wait_active` - Monitor user actively
- `wait_passive` - Check periodically
- `wait_sleep` - Pause until woken
- `wake` - Resume from sleep

### Information
- `get_page_info` - Get URL, title
- `extract_text` / `extract_links` - Extract content
- `screenshot` - Take screenshot
- `read_html` - Get page HTML

### Memory
- `remember_info` - Store info for later
- `recall_info` - Retrieve stored info

## Configuration

### AI Models

The browser supports multiple AI providers:
- **Ollama** - Local models (default)
- **Anthropic** - Claude models
- **OpenAI** - GPT models
- **Google** - Gemini models

Configure in Settings → AI Model

### Password Manager

Passwords are:
- Encrypted using OS-level encryption (Windows DPAPI)
- Stored locally in `AppData/Roaming/beam-browser/passwords/`
- Never sent to any server

## Architecture

### Main Process (Electron)
- Window management
- IPC communication
- Native integrations
- Background services

### Renderer Process (React)
- UI components
- State management (Zustand)
- WebView management

### WebViews
- Each tab runs in an isolated webview
- Uses `persist:beam` partition for session persistence

## Troubleshooting

### AD Blocking Not Working
- Check Settings → AdBlock is enabled
- Try updating filter lists

### Password Manager Issues
- Ensure no conflicting password managers
- Check browser logs for errors

### AI Not Responding
- Verify AI provider is configured
- Check API keys are valid
- For Ollama, ensure it's running locally

## License

MIT License
