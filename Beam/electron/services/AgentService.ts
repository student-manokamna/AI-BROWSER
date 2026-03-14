import { BrowserWindow, ipcMain } from 'electron';
import crypto from 'crypto';
import { getAIService } from './AIService';
import { getPasswordManagerService } from './PasswordManagerService';
import { getCredentialWatcherService, WaitMode } from './CredentialWatcherService';
import { getSchedulerService, ScheduledTask, ScheduleTrigger } from './SchedulerService';

let log: any = console;
let agentLog: any = {
  info: (...args: any[]) => console.log('[Agent]', ...args),
  error: (...args: any[]) => console.error('[Agent]', ...args),
  warn: (...args: any[]) => console.warn('[Agent]', ...args)
};

// Initialize agent log from global
if (typeof global !== 'undefined' && (global as any).agentLog) {
  agentLog = (global as any).agentLog;
}

// Override log to also write to agent log
log = {
  info: (...args: any[]) => {
    console.log('[Agent]', ...args);
    agentLog.info(...args);
  },
  error: (...args: any[]) => {
    console.error('[Agent]', ...args);
    agentLog.error(...args);
  },
  warn: (...args: any[]) => {
    console.warn('[Agent]', ...args);
    agentLog.warn(...args);
  }
};

// ─── New Skill Types for Enhanced Agent ────────────────────────────────────────
export type AgentActionType =
  | 'browse'
  | 'BROWSE'
  | 'check_credentials'
  | 'CHECK_CREDENTIALS'
  | 'auto_login'
  | 'AUTO_LOGIN'
  | 'wait_for_manual_login'
  | 'WAIT_FOR_MANUAL_LOGIN'
  | 'wait_for_element'
  | 'WAIT_FOR_ELEMENT'
  | 'wait_active'
  | 'WAIT_ACTIVE'
  | 'wait_passive'
  | 'WAIT_PASSIVE'
  | 'wait_sleep'
  | 'WAIT_SLEEP'
  | 'wake'
  | 'WAKE'
  | 'autofill'
  | 'AUTOFILL'
  | 'take_input'
  | 'TAKE_INPUT'
  | 'remember_info'
  | 'REMEMBER_INFO'
  | 'recall_info'
  | 'RECALL_INFO'
  | 'switch_to_tab'
  | 'SWITCH_TO_TAB'
  | 'close_tab'
  | 'CLOSE_TAB'
  | 'open_new_tab'
  | 'OPEN_NEW_TAB'
  | 'get_cookies'
  | 'GET_COOKIES'
  | 'clear_cookies'
  | 'CLEAR_COOKIES'
  | 'select_all'
  | 'SELECT_ALL'
  | 'copy'
  | 'COPY'
  | 'paste'
  | 'PASTE'
  | 'screenshot_element'
  | 'SCREENSHOT_ELEMENT'
  | 'extract_images'
  | 'EXTRACT_IMAGES'
  | 'download_file'
  | 'DOWNLOAD_FILE'
  | 'check_login_status'
  | 'CHECK_LOGIE_STATUS'
  | 'logout'
  | 'LOGOUT'
  | 'fill_form'
  | 'FILL_FORM'
  | 'click'
  | 'CLICK'
  | 'click_by_text'
  | 'CLICK_BY_TEXT'
  | 'read_html'
  | 'READ_HTML'
  | 'reload'
  | 'RELOAD'
  | 'scroll'
  | 'SCROLL'
  | 'wait'
  | 'WAIT'
  | 'screenshot'
  | 'SCREENSHOT'
  | 'extract_links'
  | 'EXTRACT_LINKS'
  | 'extract_text'
  | 'EXTRACT_TEXT'
  | 'submit_form'
  | 'SUBMIT_FORM'
  | 'select_option'
  | 'SELECT_OPTION'
  | 'hover'
  | 'HOVER'
  | 'press_key'
  | 'PRESS_KEY'
  | 'go_back'
  | 'GO_BACK'
  | 'go_forward'
  | 'GO_FORWARD'
  | 'get_page_info'
  | 'GET_PAGE_INFO'
  | 'auto_fill_form'
  | 'AUTO_FILL_FORM'
  | 'extract_structured'
  | 'EXTRACT_STRUCTURED'
  | 'web_search'
  | 'WEB_SEARCH'
  | 'save_session'
  | 'SAVE_SESSION'
  | 'restore_session'
  | 'RESTORE_SESSION'
  | 'extract_tables'
  | 'EXTRACT_TABLES'
  | 'summarize_content'
  | 'SUMMARIZE_CONTENT'
  | 'enable_stealth'
  | 'ENABLE_STEALTH'
  | 'export_pdf'
  | 'EXPORT_PDF'
  | 'download_video'
  | 'DOWNLOAD_VIDEO'
  | 'navigate'
  | 'NAVIGATE'
  // ─── NEW SKILLS ───────────────────────────────────────────────────────────────
  | 'read_webpage'
  | 'READ_WEBPAGE'
  | 'close_popups'
  | 'CLOSE_POPUPS'
  | 'display_result'
  | 'DISPLAY_RESULT'
  | 'evaluate_success'
  | 'EVALUATE_SUCCESS'
  | 'schedule_task'
  | 'SCHEDULE_TASK'
  | 'repeat_until'
  | 'REPEAT_UNTIL'
  | 'get_all_tabs'
  | 'GET_ALL_TABS'
  | 'monitor_network'
  | 'MONITOR_NETWORK'
  | 'block_resources'
  | 'BLOCK_RESOURCES'
  | 'extract_metadata'
  | 'EXTRACT_METADATA'
  | 'detect_login_form'
  | 'DETECT_LOGIN_FORM'
  | 'extract_json_ld'
  | 'EXTRACT_JSON_LD'
  | 'detect_infinite_scroll'
  | 'DETECT_INFINITE_SCROLL'
  | 'record_actions'
  | 'record_actions'
  | 'RECORD_ACTIONS'
  | 'replay_actions'
  | 'REPLAY_ACTIONS'
  | 'capture_console_errors'
  | 'CAPTURE_CONSOLE_ERRORS'
  | 'detect_captcha'
  | 'DETECT_CAPTCHA'
  | 'auto_research_topic'
  | 'AUTO_RESEARCH_TOPIC';


export interface AgentFunction {
  name: AgentActionType;
  description: string;
  parameters: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[];
  example: string;
  riskLevel: 'safe' | 'medium' | 'high' | 'low';
}

export const AGENT_FUNCTIONS: AgentFunction[] = [
  {
    name: 'browse',
    description: 'Navigate to a URL - opens in a NEW background tab (user sees tab appear but agent panel stays visible)',
    parameters: [
      { name: 'url', type: 'string', required: true, description: 'The URL to navigate to (e.g., https://www.example.com)' },
      { name: 'waitForLoad', type: 'boolean', required: false, description: 'Wait for page to fully load (default: true)' }
    ],
    example: '{"url": "https://www.google.com", "waitForLoad": true}',
    riskLevel: 'safe'
  },
  {
    name: 'check_credentials',
    description: 'Check if login credentials are already stored for the current website. Returns credentials if found, null if not. The agent automatically checks this before attempting login.',
    parameters: [
      { name: 'domain', type: 'string', required: false, description: 'Domain to check credentials for (e.g., github.com). If not provided, uses current page URL.' }
    ],
    example: '{"domain": "github.com"}',
    riskLevel: 'safe'
  },
  {
    name: 'auto_login',
    description: 'Automatically login using stored credentials. If credentials exist, fills username/password and submits. If not, returns error. ALWAYS USE THIS instead of fill_form for login fields.',
    parameters: [],
    example: '{}',
    riskLevel: 'medium'
  },
  {
    name: 'wait_for_manual_login',
    description: 'Wait for user to manually login. Use this when no credentials are stored. The agent will pause and wait for user to complete login manually. After user logs in, credentials are automatically captured and stored.',
    parameters: [
      { name: 'timeout', type: 'number', required: false, description: 'Maximum time to wait in milliseconds (default: 60000 = 1 minute)' }
    ],
    example: '{"timeout": 120000}',
    riskLevel: 'safe'
  },
  {
    name: 'navigate',
    description: 'Navigate the browser to a specific URL.',
    parameters: [
      { name: 'url', type: 'string', required: true, description: 'The URL to open' }
    ],
    example: '{ "url": "https://example.com" }',
    riskLevel: 'safe'
  },
  {
    name: 'wait_active',
    description: 'Set wait mode to ACTIVE - the agent actively monitors user behavior and can intervene if needed. Use when you need to watch what the user is doing.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'wait_passive',
    description: 'Set wait mode to PASSIVE - the agent monitors for specific conditions (like CAPTCHA) but does not actively watch. Use when you want to check periodically.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'wait_sleep',
    description: 'Set wait mode to SLEEP - the agent goes to sleep until explicitly woken by the user. Use this to pause the agent completely.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'wake',
    description: 'Wake the agent from sleep mode. The agent will resume in passive mode.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'autofill',
    description: 'Automatically fill stored username/password for the current website. Credentials are filled locally without being exposed to the AI.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'wait_for_element',
    description: 'Wait for a specific element to appear on the page. Useful for waiting for dynamic content to load.',
    parameters: [
      { name: 'selector', type: 'string', required: true, description: 'CSS selector for the element to wait for' },
      { name: 'timeout', type: 'number', required: false, description: 'Maximum time to wait in milliseconds (default: 10000)' }
    ],
    example: '{"selector": "#submit-button", "timeout": 5000}',
    riskLevel: 'safe'
  },
  {
    name: 'take_input',
    description: 'Ask the user for input. The agent will pause and wait for user response.',
    parameters: [
      { name: 'prompt', type: 'string', required: true, description: 'Question to ask the user' }
    ],
    example: '{"prompt": "What is your preferred username?"}',
    riskLevel: 'safe'
  },
  {
    name: 'remember_info',
    description: 'Store information for later use. Use this to remember important data during multi-step tasks.',
    parameters: [
      { name: 'key', type: 'string', required: true, description: 'Key to store the information under' },
      { name: 'value', type: 'string', required: true, description: 'Value to remember' }
    ],
    example: '{"key": "orderNumber", "value": "12345"}',
    riskLevel: 'safe'
  },
  {
    name: 'recall_info',
    description: 'Retrieve previously stored information by key.',
    parameters: [
      { name: 'key', type: 'string', required: true, description: 'Key to retrieve information from' }
    ],
    example: '{"key": "orderNumber"}',
    riskLevel: 'safe'
  },
  {
    name: 'switch_to_tab',
    description: 'Switch to a specific tab by its index or title.',
    parameters: [
      { name: 'index', type: 'number', required: false, description: 'Tab index (0-based)' },
      { name: 'title', type: 'string', required: false, description: 'Tab title to search for' }
    ],
    example: '{"index": 2} or {"title": "Google"}',
    riskLevel: 'safe'
  },
  {
    name: 'close_tab',
    description: 'Close a specific tab by index or the current tab.',
    parameters: [
      { name: 'index', type: 'number', required: false, description: 'Tab index to close (default: current tab)' }
    ],
    example: '{"index": 1}',
    riskLevel: 'medium'
  },
  {
    name: 'open_new_tab',
    description: 'Open a new empty tab.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'get_all_tabs',
    description: 'Get a list of all open tabs in the browser. Returns tab IDs, titles, and URLs.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'get_cookies',
    description: 'Get all cookies for the current domain.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'clear_cookies',
    description: 'Clear all cookies for the current domain (logout).',
    parameters: [],
    example: '{}',
    riskLevel: 'medium'
  },
  {
    name: 'select_all',
    description: 'Select all text in the current input or page.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'copy',
    description: 'Copy selected text to clipboard.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'paste',
    description: 'Paste from clipboard into the current input.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'screenshot_element',
    description: 'Take a screenshot of a specific element on the page.',
    parameters: [
      { name: 'selector', type: 'string', required: true, description: 'CSS selector for the element to capture' }
    ],
    example: '{"selector": "#product-image"}',
    riskLevel: 'safe'
  },
  {
    name: 'extract_images',
    description: 'Extract all image URLs from the current page.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'download_file',
    description: 'Download a file from a URL. Useful for saving files programmatically.',
    parameters: [
      { name: 'url', type: 'string', required: true, description: 'URL of the file to download' },
      { name: 'filename', type: 'string', required: false, description: 'Optional filename to save as' }
    ],
    example: '{"url": "https://example.com/file.pdf"}',
    riskLevel: 'medium'
  },
  {
    name: 'check_login_status',
    description: 'Check if the user is currently logged in to the current website by checking for presence of login/profile elements.',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'logout',
    description: 'Logout from the current website by finding and clicking logout button.',
    parameters: [],
    example: '{}',
    riskLevel: 'medium'
  },
  {
    name: 'fill_form',
    description: 'Fill in a text input field (text, email, password, etc.)',
    parameters: [
      { name: 'selector', type: 'string', required: true, description: 'CSS selector to find the input element' },
      { name: 'value', type: 'string', required: true, description: 'The text value to enter' },
      { name: 'clear', type: 'boolean', required: false, description: 'Clear the field before typing (default: true)' }
    ],
    example: '{"selector": "input[name=\"email\"]", "value": "user@example.com", "clear": true}',
    riskLevel: 'safe'
  },
  {
    name: 'click',
    description: 'Click on a button, link, or any clickable element. Can also use text: property to find by button/link text.',
    parameters: [
      { name: 'selector', type: 'string', required: false, description: 'CSS selector to find the element to click' },
      { name: 'text', type: 'string', required: false, description: 'Text content to search for in buttons/links (e.g., "Sign in", "Login")' },
      { name: 'waitForNavigation', type: 'boolean', required: false, description: 'Wait for navigation after click (default: false)' }
    ],
    example: '{"text": "Sign in", "waitForNavigation": true}',
    riskLevel: 'medium'
  },
  {
    name: 'click_by_text',
    description: 'Click on a button or link by its visible text content. Use this to find sign-in, login, register buttons.',
    parameters: [
      { name: 'text', type: 'string', required: true, description: 'Text to search for in buttons/links (case-insensitive). Examples: "Sign in", "Login", "Register", "Create account"' },
      { name: 'waitForNavigation', type: 'boolean', required: false, description: 'Wait for navigation after click (default: false)' }
    ],
    example: '{"text": "Sign in", "waitForNavigation": true}',
    riskLevel: 'medium'
  },
  {
    name: 'read_html',
    description: 'Extract the full HTML content of the current page',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'reload',
    description: 'Reload the current page',
    parameters: [
      { name: 'hard', type: 'boolean', required: false, description: 'Force hard reload bypassing cache (default: false)' }
    ],
    example: '{"hard": false}',
    riskLevel: 'safe'
  },
  {
    name: 'scroll',
    description: 'Scroll the page up or down',
    parameters: [
      { name: 'direction', type: 'string', required: true, description: 'Direction: "up" or "down"' },
      { name: 'amount', type: 'number', required: false, description: 'Pixels to scroll (default: 300)' }
    ],
    example: '{"direction": "down", "amount": 500}',
    riskLevel: 'safe'
  },
  {
    name: 'wait',
    description: 'Wait for a specified number of milliseconds',
    parameters: [
      { name: 'ms', type: 'number', required: true, description: 'Milliseconds to wait (e.g., 2000 for 2 seconds)' }
    ],
    example: '{"ms": 2000}',
    riskLevel: 'safe'
  },
  {
    name: 'screenshot',
    description: 'Capture a screenshot of the current page',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'extract_links',
    description: 'Extract all links from the current page with their URLs and text',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'extract_text',
    description: 'Extract visible text content from the page or specific elements',
    parameters: [
      { name: 'selector', type: 'string', required: false, description: 'Optional CSS selector to extract text from specific elements' }
    ],
    example: '{"selector": "article p"}',
    riskLevel: 'safe'
  },
  {
    name: 'submit_form',
    description: 'Submit a form by clicking its submit button or pressing Enter',
    parameters: [
      { name: 'formSelector', type: 'string', required: false, description: 'CSS selector for the form (optional, will find form containing previous inputs)' }
    ],
    example: '{"formSelector": "form[name=\"login\"]"}',
    riskLevel: 'high'
  },
  {
    name: 'select_option',
    description: 'Select an option from a dropdown (select element)',
    parameters: [
      { name: 'selector', type: 'string', required: true, description: 'CSS selector for the select element' },
      { name: 'value', type: 'string', required: true, description: 'The value to select (option value attribute)' }
    ],
    example: '{"selector": "select[name=\"country\"]", "value": "US"}',
    riskLevel: 'safe'
  },
  {
    name: 'hover',
    description: 'Hover over an element (useful for dropdown menus)',
    parameters: [
      { name: 'selector', type: 'string', required: true, description: 'CSS selector for the element to hover over' }
    ],
    example: '{"selector": ".menu-item"}',
    riskLevel: 'safe'
  },
  {
    name: 'press_key',
    description: 'Press a keyboard key (Enter, Escape, Tab, etc.)',
    parameters: [
      { name: 'key', type: 'string', required: true, description: 'The key to press (Enter, Escape, Tab, ArrowDown, etc.)' },
      { name: 'modifier', type: 'string', required: false, description: 'Optional modifier: ctrl, alt, shift' }
    ],
    example: '{"key": "Enter"}',
    riskLevel: 'safe'
  },
  {
    name: 'go_back',
    description: 'Navigate back in browser history',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'go_forward',
    description: 'Navigate forward in browser history',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  {
    name: 'get_page_info',
    description: 'Get information about the current page (URL, title, meta tags)',
    parameters: [],
    example: '{}',
    riskLevel: 'safe'
  },
  // === PHASE 1: Enhanced Skills ===
  {
    name: 'auto_fill_form',
    description: 'Automatically detect and fill form fields on the page. Analyzes the page to find input fields and fills them with appropriate data (email, name, phone, etc.) based on field labels and types.',
    parameters: [
      { name: 'data', type: 'object', required: true, description: 'Key-value pairs of field names and values to fill (e.g., {"email": "test@test.com", "name": "John"})' }
    ],
    example: '{"data": {"email": "user@example.com", "firstName": "John", "phone": "555-1234"}}',
    riskLevel: 'safe'
  },
  {
    name: 'extract_structured',
    description: 'Extract structured data from the current page using AI. Provide a schema describing what data to extract, and the AI will analyze the page and return structured JSON.',
    parameters: [
      { name: 'schema', type: 'string', required: true, description: 'Description of the data to extract in natural language (e.g., "all product names and prices")' }
    ],
    example: '{"schema": "all job titles, companies, and locations from the job listings"}',
    riskLevel: 'safe'
  },
  {
    name: 'web_search',
    description: 'Search the web for information. Returns search results with titles, URLs, and snippets.',
    parameters: [
      { name: 'query', type: 'string', required: true, description: 'The search query' },
      { name: 'numResults', type: 'number', required: false, description: 'Number of results to return (default: 5)' }
    ],
    example: '{"query": "latest AI news", "numResults": 5}',
    riskLevel: 'safe'
  },
  // === PHASE 2: Session & Data Extraction ===
  {
    name: 'save_session',
    description: 'Save the current browser session (cookies, localStorage) for later restoration. Useful for preserving login state.',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Name to identify this session' }
    ],
    example: '{"name": "github-session"}',
    riskLevel: 'safe'
  },
  {
    name: 'restore_session',
    description: 'Restore a previously saved browser session to regain login state.',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Name of the session to restore' }
    ],
    example: '{"name": "github-session"}',
    riskLevel: 'medium'
  },
  {
    name: 'extract_tables',
    description: 'Extract data from HTML tables on the page. Returns array of objects representing table rows.',
    parameters: [
      { name: 'selector', type: 'string', required: false, description: 'CSS selector for the table (optional, extracts first table if not provided)' }
    ],
    example: '{"selector": "table.pricing"}',
    riskLevel: 'safe'
  },
  {
    name: 'summarize_content',
    description: 'Summarize the main content of the current page using AI. Extracts the main text and provides a concise summary.',
    parameters: [
      { name: 'maxLength', type: 'number', required: false, description: 'Maximum length of summary in words (default: 150)' }
    ],
    example: '{"maxLength": 100}',
    riskLevel: 'safe'
  },
  // === PHASE 3: Advanced Browser ===
  {
    name: 'enable_stealth',
    description: 'Enable stealth mode to avoid bot detection. Randomizes user agent, adds human-like delays, and masks automation signals.',
    parameters: [],
    example: '{}',
    riskLevel: 'medium'
  },
  {
    name: 'export_pdf',
    description: 'Export the current page as a PDF file.',
    parameters: [
      { name: 'filename', type: 'string', required: false, description: 'Filename for the PDF (default: page title)' }
    ],
    example: '{"filename": "page.pdf"}',
    riskLevel: 'safe'
  },
  {
    name: 'download_video',
    description: 'Detect and download video from the current page. Works with common video hosting sites.',
    parameters: [
      { name: 'quality', type: 'string', required: false, description: 'Preferred quality (best, worst, or specific resolution)' }
    ],
    example: '{"quality": "best"}',
    riskLevel: 'medium'
  },
  // === NEW PHASE: Enhanced Skills ===
  {
    name: 'read_webpage',
    description: 'Read and extract content from the current webpage. Use this to summarize pages, answer questions about content, or extract specific information. Returns full page content that can be sent to AI.',
    parameters: [
      { name: 'scope', type: 'string', required: false, description: 'Scope: "full" for entire page, "visible" for visible content only, or CSS selector for specific section' },
      { name: 'selector', type: 'string', required: false, description: 'CSS selector to extract specific element (e.g., ".article-content", "#main-text")' },
      { name: 'includeForms', type: 'boolean', required: false, description: 'Include form fields and their labels (default: true)' },
      { name: 'maxLength', type: 'number', required: false, description: 'Maximum characters to extract (default: 50000)' }
    ],
    example: '{"scope": "visible", "maxLength": 10000}',
    riskLevel: 'safe'
  },
  {
    name: 'close_popups',
    description: 'Close all visible popups, modals, cookie consent banners, and overlays. Essential for automation as it clears blocking elements.',
    parameters: [
      { name: 'excludeSelectors', type: 'string', required: false, description: 'Comma-separated CSS selectors to NOT close (e.g., ".important-modal")' },
      { name: 'maxPopups', type: 'number', required: false, description: 'Maximum popups to close (default: 10)' }
    ],
    example: '{"excludeSelectors": ".user-modal", "maxPopups": 5}',
    riskLevel: 'medium'
  },
  {
    name: 'display_result',
    description: 'Display information in the agent side panel. Use for showing summaries, results, or rich content to the user.',
    parameters: [
      { name: 'content', type: 'string', required: true, description: 'Content to display (supports markdown)' },
      { name: 'type', type: 'string', required: false, description: 'Content type: "text", "html", "markdown", or "table" (default: "text")' },
      { name: 'title', type: 'string', required: false, description: 'Title for the result panel' },
      { name: 'actions', type: 'string', required: false, description: 'JSON array of action buttons [{label: "Button Label", action: "action_id"}]' }
    ],
    example: '{"content": "## Summary\\n\\nThe page contains...", "title": "Page Summary", "type": "markdown"}',
    riskLevel: 'safe'
  },
  {
    name: 'evaluate_success',
    description: 'Evaluate if the task goal has been achieved based on current page state. Use after significant actions to check if success criteria is met.',
    parameters: [
      { name: 'successCriteria', type: 'string', required: true, description: 'Description of what success looks like (e.g., "Flight results are displayed", "User is logged in")' },
      { name: 'checkPageContent', type: 'boolean', required: false, description: 'Evaluate based on page content (default: true)' }
    ],
    example: '{"successCriteria": "Confirmation page shown with order details"}',
    riskLevel: 'safe'
  },
  {
    name: 'schedule_task',
    description: 'Schedule a task to run at a specific time or interval. Useful for reminders or periodic checks.',
    parameters: [
      { name: 'taskName', type: 'string', required: true, description: 'Name for the scheduled task' },
      { name: 'command', type: 'string', required: true, description: 'Agent command to execute' },
      { name: 'trigger', type: 'string', required: true, description: 'Trigger type: "once", "daily", or "interval"' },
      { name: 'time', type: 'string', required: false, description: 'For "once" or "daily": time like "18:00" or ISO timestamp' },
      { name: 'interval', type: 'number', required: false, description: 'For "interval": minutes between runs' },
      { name: 'repeat', type: 'boolean', required: false, description: 'Repeat the task (default: false)' }
    ],
    example: '{"taskName": "Check flights", "command": "Check flight prices NYC to London", "trigger": "daily", "time": "09:00"}',
    riskLevel: 'medium'
  },
  {
    name: 'repeat_until',
    description: 'Repeat a command until a condition is met or timeout. Useful for waiting for async results like flight prices, form submissions, etc.',
    parameters: [
      { name: 'command', type: 'string', required: true, description: 'Command to execute in each iteration' },
      { name: 'condition', type: 'string', required: true, description: 'JavaScript expression that returns true when to stop (e.g., "result.flights.length > 0")' },
      { name: 'intervalMs', type: 'number', required: false, description: 'Milliseconds between iterations (default: 5000)' },
      { name: 'maxIterations', type: 'number', required: false, description: 'Maximum attempts before giving up (default: 10)' }
    ],
    example: '{"command": "Check flight prices", "condition": "results.length > 0", "intervalMs": 10000, "maxIterations": 20}',
    riskLevel: 'medium'
  },
  {
    name: 'monitor_network',
    description: 'Monitor network requests made by the page and return API calls, useful for debugging or extracting backend data.',
    parameters: [
      { name: 'durationMs', type: 'number', required: false, description: 'Time to monitor network activity in milliseconds (default: 5000)' }
    ],
    example: '{"durationMs": 10000}',
    riskLevel: 'low'
  },
  {
    name: 'extract_metadata',
    description: 'Extract metadata from the webpage including title, description, keywords and OpenGraph tags.',
    parameters: [],
    example: '{}',
    riskLevel: 'low'
  },
  {
    name: 'detect_login_form',
    description: 'Detect whether the page contains a login form by checking for username/email and password fields.',
    parameters: [],
    example: '{}',
    riskLevel: 'low'
  },
  {
    name: 'detect_infinite_scroll',
    description: 'Detect if the page loads more content when scrolling to the bottom.',
    parameters: [
      { name: 'waitMs', type: 'number', required: false, description: 'Wait time after scrolling to detect new content (default: 2000)' }
    ],
    example: '{"waitMs": 3000}',
    riskLevel: 'low'
  },
  {
    name: 'extract_json_ld',
    description: 'Extract structured data embedded in the webpage using JSON-LD scripts.',
    parameters: [],
    example: '{}',
    riskLevel: 'low'
  },
  {
    name: 'capture_console_errors',
    description: 'Capture JavaScript console errors from the page for debugging purposes.',
    parameters: [
      { name: 'durationMs', type: 'number', required: false, description: 'Time to listen for errors in milliseconds (default: 5000)' }
    ],
    example: '{"durationMs": 8000}',
    riskLevel: 'low'
  },
  {
    name: 'detect_captcha',
    description: 'Detect whether a CAPTCHA challenge is present on the page.',
    parameters: [],
    example: '{}',
    riskLevel: 'medium'
  },
  {
    name: 'block_resources',
    description: 'Block loading of certain resource types such as images, fonts, or media to speed up browsing.',
    parameters: [
      { name: 'types', type: 'array', required: true, description: 'Resource types to block (e.g., ["image","font","media"])' }
    ],
    example: '{"types": ["image","font"]}',
    riskLevel: 'low'
  },
  {
    name: 'record_actions',
    description: 'Record user interactions such as clicks and typing on the page to replay later.',
    parameters: [
      { name: 'durationMs', type: 'number', required: false, description: 'Recording duration in milliseconds (default: 10000)' }
    ],
    example: '{"durationMs": 15000}',
    riskLevel: 'medium'
  },
  {
    name: 'replay_actions',
    description: 'Replay a previously recorded sequence of user actions.',
    parameters: [
      { name: 'actions', type: 'array', required: true, description: 'List of recorded actions to replay' }
    ],
    example: '{"actions":[{"type":"click","selector":"#submit"}]}',
    riskLevel: 'medium'
  },
  {
    name: 'auto_research_topic',
    description: 'Automatically research a topic by browsing multiple pages and extracting key information.',
    parameters: [
      { name: 'topic', type: 'string', required: true, description: 'Topic to research' },
      { name: 'maxSources', type: 'number', required: false, description: 'Maximum number of sources to read (default: 5)' }
    ],
    example: '{"topic":"AI agents in cybersecurity","maxSources":5}',
    riskLevel: 'low'
  }
];
export function getAgentFunctionsManifest(): string {
  return AGENT_FUNCTIONS.map(f => {
    const params = f.parameters.map(p =>
      `      - ${p.name} (${p.type}${p.required ? ', required' : ', optional'}): ${p.description}`
    ).join('\n');

    return `### ${f.name.toUpperCase()}
Description: ${f.description}
Parameters:
${params || '  (none)'}
Example: ${f.example}
Risk Level: ${f.riskLevel.toUpperCase()}`;
  }).join('\n\n');
}

export interface AgentAction {
  id: string;
  type: AgentActionType;
  description: string;
  selector?: string;
  text?: string;
  value?: string;
  url?: string;
  domain?: string;
  timeout?: number;
  waitForLoad?: boolean;
  waitForNavigation?: boolean;
  clear?: boolean;
  direction?: 'up' | 'down';
  amount?: number;
  ms?: number;
  hard?: boolean;
  formSelector?: string;
  key?: string;
  modifier?: 'ctrl' | 'alt' | 'shift';
  // New skill properties
  data?: Record<string, string>;
  schema?: string;
  query?: string;
  numResults?: number;
  name?: string;
  maxLength?: number;
  filename?: string;
  quality?: string;
  // Enhanced skill properties
  scope?: string;
  includeForms?: boolean;
  excludeSelectors?: string;
  maxPopups?: number;
  content?: string;
  title?: string;
  actions?: string;
  successCriteria?: string;
  checkPageContent?: boolean;
  taskName?: string;
  command?: string;
  trigger?: string;
  time?: string;
  interval?: number;
  repeat?: boolean;
  condition?: string;
  intervalMs?: number;
  maxIterations?: number;
  index?: number;
}

export interface AgentTask {
  id: string;
  command: string;
  status: 'pending' | 'thinking' | 'planning' | 'executing' | 'paused' | 'done' | 'error' | 'waiting_confirmation';
  steps: AgentStep[];
  result?: string;
  error?: string;
  requiresConfirmation?: boolean;
}

export interface AgentStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  action?: AgentAction;
  confirmed?: boolean;
}

export interface PageState {
  url: string;
  title: string;
  html: string;
  elements: DOMElement[];
  links: { text: string; href: string }[];
}

export interface DOMElement {
  tag: string;
  id?: string;
  classes?: string[];
  text?: string;
  href?: string;
  src?: string;
  attributes: Record<string, string>;
  xpath: string;
  selector?: string;
}

const RISKY_KEYWORDS = [
  'login', 'signin', 'password', 'submit', 'buy', 'purchase', 'pay',
  'delete', 'remove', 'transfer', 'send money', 'confirm', 'delete account',
  'change password', 'update email', 'payment', 'credit card'
];

export class AgentService {
  private mainWindow: BrowserWindow | null = null;
  private currentTask: AgentTask | null = null;
  private actionQueue: AgentAction[] = [];
  private isPaused: boolean = false;
  private pausedForConfirmation: boolean = false;
  private confirmationCallback: ((proceed: boolean) => void) | null = null;
  private pendingRiskyAction: AgentAction | null = null;
  private activeTabId: string | null = null;

  constructor() {
    try {
      const electronLog = require('electron-log');
      log = electronLog;
    } catch (err) {
      console.warn('electron-log not available');
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  setActiveTabId(tabId: string): void {
    this.activeTabId = tabId;
    log.info('[Agent] Active tab set to:', tabId);
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  async executeScriptInTab(tabId: string, script: string): Promise<any> {
    if (!this.mainWindow) {
      throw new Error('No main window available');
    }

    try {
      const result = await this.mainWindow.webContents.executeJavaScript(`
        (function() {
          const webview = document.querySelector('webview[data-tab-id="${tabId}"]');
          if (!webview) {
            return { success: false, error: 'Webview not found for tab: ${tabId}' };
          }
          try {
            const result = webview.executeJavaScript(\`${script.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`, true);
            return result;
          } catch(e) {
            return { success: false, error: e.message };
          }
        })()
      `, true);
      return result;
    } catch (err: any) {
      log.warn('[Agent] Script execution failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  async watchCredentialsInTab(tabId: string): Promise<{ success: boolean }> {
    if (!this.mainWindow) {
      return { success: false };
    }

    const script = `
      (function() {
        if (window.__credentialsWatcherInstalled) return { success: false, reason: 'already installed' };
        window.__credentialsWatcherInstalled = true;
        
        let capturedUsername = '';
        let capturedPassword = '';
        
        const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[name="username"], input[name="login"], input[id="username"], input[id="login"]');
        inputs.forEach(input => {
          input.addEventListener('input', function() {
            capturedUsername = this.value;
          });
        });
        
        const pwdInputs = document.querySelectorAll('input[type="password"]');
        pwdInputs.forEach(input => {
          input.addEventListener('input', function() {
            capturedPassword = this.value;
          });
        });
        
        document.addEventListener('submit', function(e) {
          const form = e.target;
          const hasPassword = form.querySelector('input[type="password"]');
          if (hasPassword && (capturedUsername || capturedPassword)) {
            window.postMessage({ type: 'BEAM_CREDENTIALS_CAPTURED', username: capturedUsername, password: capturedPassword }, '*');
          }
        });
        
        window.addEventListener('message', function(e) {
          if (e.data && e.data.type === 'BEAM_CREDENTIALS_CAPTURED') {
            console.log('[Beam] Credentials captured:', e.data.username);
          }
        });
        
        return { success: true };
      })()
    `;

    try {
      await this.executeScriptInTab(tabId, script);
      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  private emitTaskUpdate(task: AgentTask): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('agent-task-update', task);
    }
  }

  getFunctionsManifest(): string {
    return getAgentFunctionsManifest();
  }

  private classifyActionRisk(action: AgentAction): 'safe' | 'medium' | 'high' | 'low' {
    const functionDef = AGENT_FUNCTIONS.find(f =>
      f.name === action.type || f.name.toUpperCase() === action.type?.toUpperCase()
    );
    if (functionDef) {
      return functionDef.riskLevel;
    }

    if (action.selector) {
      const selector = action.selector.toLowerCase();
      for (const keyword of RISKY_KEYWORDS) {
        if (selector.includes(keyword)) {
          return 'high';
        }
      }
    }

    return 'medium';
  }

  async executeTask(command: string): Promise<AgentTask> {
    const task: AgentTask = {
      id: crypto.randomUUID(),
      command,
      status: 'thinking',
      steps: [],
      result: undefined,
      error: undefined,
    };

    this.currentTask = task;
    this.emitTaskUpdate(task);

    try {
      const aiService = getAIService();
      const useAI = aiService.isEnabled();

      if (useAI) {
        log.info('[Agent] Using AI for task understanding');
        this.emitTaskUpdate({ ...task, status: 'planning' });

        let pageContext = 'No page loaded';
        try {
          const pageState = await Promise.race([
            this.getPageState(),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ]);
          if (pageState) {
            pageContext = this.buildPageContext(pageState);
          }
        } catch (err) {
          log.warn('[Agent] Could not get page state:', err);
        }

        // ─── Pre-processor: Direct navigation for known sites ──────────────
        // If the user explicitly mentions a website, navigate directly to it
        // without asking the AI (which often defaults to Google search).
        const directNav = this.tryDirectNavigation(command);
        if (directNav) {
          log.info('[Agent] Direct navigation detected, skipping AI planner:', directNav);
          const preBuiltActions: AgentAction[] = [
            { id: crypto.randomUUID(), type: 'browse', description: `Open ${directNav}`, url: directNav },
          ];

          // If it also mentions searching for something, add a search step after arriving
          const searchMatch = command.match(/(?:search|find|look for)\s+(?:for\s+)?(.+?)(?:\s+on\s|\s+at\s|$)/i)
            || command.match(/(?:cheapest|best)\s+(.+?)(?:\s+on\s|\s+at\s|$)/i);
          if (searchMatch && searchMatch[1]) {
            const query = searchMatch[1].trim();
            preBuiltActions.push({
              id: crypto.randomUUID(),
              type: 'fill_form' as AgentActionType,
              description: `Fill the search bar with "${query}"`,
              selector: 'input[name="field-keywords"], input[name="q"], input[type="search"], #twotabsearchtextbox',
              value: query,
              clear: true
            });
            preBuiltActions.push({
              id: crypto.randomUUID(),
              type: 'press_key' as AgentActionType,
              description: 'Press Enter to search',
              key: 'Enter'
            });
          }

          task.steps = preBuiltActions.map(action => ({
            id: crypto.randomUUID(),
            description: action.description,
            status: 'pending' as const,
            action,
            confirmed: true
          }));
          task.requiresConfirmation = false;
        } else {
          // ─── AI Planner ──────────────────────────────────────────────────
          const plannedActions = await this.planActionsWithAI(command, pageContext);

          if (plannedActions && plannedActions.length > 0) {
            task.steps = plannedActions.map(action => {
              const risk = this.classifyActionRisk(action);
              return {
                id: crypto.randomUUID(),
                description: action.description,
                status: 'pending' as const,
                action,
                confirmed: risk === 'safe'
              };
            });

            const hasRiskyActions = task.steps.some(step =>
              step.action && this.classifyActionRisk(step.action) !== 'safe'
            );
            task.requiresConfirmation = hasRiskyActions;
          } else {
            throw new Error('AI failed to plan actions for this task');
          }
        }
      } else {
        const plannedActions = this.planActionsBasic(command);
        task.steps = plannedActions.map(action => ({
          id: action.id,
          description: action.description,
          status: 'pending' as const,
          action,
          confirmed: this.classifyActionRisk(action) === 'safe'
        }));
      }

      task.status = task.requiresConfirmation ? 'waiting_confirmation' : 'executing';
      this.emitTaskUpdate(task);

      return task;
    } catch (err: any) {
      task.status = 'error';
      task.error = err.message;
      this.emitTaskUpdate(task);
      return task;
    }
  }

  async executePlannedTask(): Promise<AgentTask> {
    if (!this.currentTask) {
      throw new Error('No active task');
    }

    const task = this.currentTask;
    task.status = 'executing';
    this.emitTaskUpdate(task);

    for (const step of task.steps) {
      if (this.isPaused) {
        task.status = 'paused';
        this.emitTaskUpdate(task);
        await this.waitForResume();
      }

      if (this.pausedForConfirmation && step.action) {
        const risk = this.classifyActionRisk(step.action);
        if (risk !== 'safe') {
          task.status = 'waiting_confirmation';
          this.emitTaskUpdate(task);
          const proceed = await this.pauseForConfirmation(step);
          if (!proceed) {
            task.status = 'error';
            task.error = 'Action cancelled by user';
            this.emitTaskUpdate(task);
            return task;
          }
          step.confirmed = true;
        }
      }

      step.status = 'running';
      this.emitTaskUpdate(task);

      try {
        await this.executeAction(step.action!);
        step.status = 'done';
        this.emitTaskUpdate(task);
      } catch (err: any) {
        step.status = 'failed';
        task.error = err.message;
        task.status = 'error';
        this.emitTaskUpdate(task);
        break;
      }
    }

    if (task.status !== 'error' && task.status !== 'paused') {
      task.status = 'done';
      task.result = 'Task completed successfully';
      this.emitTaskUpdate(task);
    }

    return task;
  }

  private buildPageContext(pageState: PageState): string {
    const lines = [
      `Current Page URL: ${pageState.url}`,
      `Page Title: ${pageState.title}`,
      '',
      'Interactive Elements:'
    ];

    if (pageState.elements && pageState.elements.length > 0) {
      pageState.elements.slice(0, 15).forEach((el, i) => {
        const attrs = [];
        if (el.id) attrs.push(`id="${el.id}"`);
        if (el.classes?.length) attrs.push(`.${el.classes.join('.')}`);
        if (el.attributes?.name) attrs.push(`name="${el.attributes.name}"`);
        if (el.attributes?.type) attrs.push(`type="${el.attributes.type}"`);
        if (el.attributes?.placeholder) attrs.push(`placeholder="${el.attributes.placeholder}"`);

        const selector = el.selector || el.xpath;
        lines.push(`  ${i + 1}. <${el.tag}> ${el.text?.substring(0, 40) || ''} [${attrs.join(' ')}] (${selector})`);
      });
    } else {
      lines.push('  (No interactive elements detected)');
    }

    if (pageState.links && pageState.links.length > 0) {
      lines.push('', 'Links:');
      pageState.links.slice(0, 10).forEach(link => {
        lines.push(`  - ${link.text?.substring(0, 30) || ''}: ${link.href}`);
      });
    }

    return lines.join('\n');
  }

  private async planActionsWithAI(command: string, pageContext: string): Promise<AgentAction[] | null> {
    const aiService = getAIService();

    // Check if this is a question about the current page
    const questionKeywords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'explain', 'tell me', 'show me', 'find', 'get me', 'is there', 'are there', 'does', 'can you'];
    const isQuestion = questionKeywords.some(kw => command.toLowerCase().startsWith(kw)) || command.includes('?');
    const needsPageContent = isQuestion && !command.toLowerCase().includes('search') && !command.toLowerCase().includes('google');

    const systemPrompt = `You are an expert browser automation agent. Your role is to break down user commands into a sequence of browser actions.

## AVAILABLE FUNCTIONS
You have access to these functions. ONLY use functions from this list:

${getAgentFunctionsManifest()}

## IMPORTANT: ANSWERING QUESTIONS
If the user is ASKING A QUESTION about the current webpage (e.g., "What is this page about?", "What products are listed?", "Summarize this article"), you MUST:
1. Use "read_webpage" to extract the page content
2. Use "display_result" to show the answer to the user
3. Do NOT just return an empty plan - the user expects an answer!

## SUCCESS CRITERIA - CRITICAL
You MUST define clear success criteria for EVERY task. After each action, evaluate if success is achieved.
For different task types, success criteria should be:
- Flight booking: "Search results displayed with available flights and prices"
- Form submission: "Confirmation page shown or success message displayed"  
- Login: "User is logged in (profile visible, welcome message, or redirected to dashboard)"
- Search: "Search results are displayed with relevant items"
- Purchase: "Checkout complete or order confirmation shown"
- Questions: "Page content read and answer displayed to user"

When success is met, include a final step with type "evaluate_success" that checks for success conditions.

## IMPORTANT LOGIN WORKFLOW
When user asks to login to a Website or perform actions requiring authentication:

1. First use check_credentials to see if login credentials are already stored
2. If credentials exist (found: true), use auto_login to automatically fill and submit
3. If NOT found (found: false), use wait_for_manual_login and wait for user to login manually
4. The browser will automatically capture and store credentials after manual login

IMPORTANT: For login tasks, ALWAYS include both check_credentials AND either auto_login OR wait_for_manual_login in your plan!

NEVER send credentials to the AI model - they are processed locally by the browser!

## GUIDELINES
1. Analyze the user's command to understand their goal
2. Define SUCCESS CRITERIA for the task
3. Look at the current page context to understand what's available
4. Plan a sequence of actions using ONLY the functions above
5. Include close_popups at the START of your plan to handle any popups/banners
6. Include read_webpage when you need to understand page content or summarize
7. Include display_result to show summaries and results to the user
8. Each action should be specific and actionable
9. Consider the order of operations (e.g., fill form before submit)
10. For forms: use fill_form for each input, then submit_form or click the submit button
11. For navigation: use browse to go to URLs
12. For reading content: use extract_text, extract_links, or read_webpage

## COMMON USE CASES

### Login to a website:
1. browse to the login page URL
2. check_credentials - if found, use auto_login
3. After navigating to login page, look for and click sign-in buttons:
   - First try: "Sign in", "Sign in to Gmail", "Login", "Log in" buttons
   - If not found, try: "Register", "Create account", "Sign up" then look for sign in
4. wait_for_manual_login - if credentials not found

### AFTER LOGIN PAGE LOADS:
If login page redirects to a landing page (not login form), ALWAYS click a sign-in option:
- Look for buttons with text: "Sign in", "Login", "Log in" (check header, footer, top of page)
- If only "Register" or "Create account" exists, click it then look for sign-in link
- After clicking, wait for login form to appear

### CORRECT LOGIN URLs - ALWAYS USE THESE:
- Gmail: "https://mail.google.com/mail/u/0/#inbox"
- Google: https://accounts.google.com
- GitHub: https://github.com/login
- Twitter/X: https://twitter.com/i/flow/login
- LinkedIn: https://www.linkedin.com/login

### Direct Navigation vs Search:
- If the user mentions a specific website (e.g., "Go to Amazon", "Open YouTube") or URL, ALWAYS use the \`browse\` action directly to that site (e.g. \`{"type": "browse", "url": "https://www.amazon.com"}\`). Do NOT search Google for it.
- If the user asks a general query without a specific site, use the \`web_search\` action.

### Search and extract:
1. web_search to find information
2. browse to a specific URL from results if needed
3. extract_text or extract_links to get details

### Fill forms:
1. Use fill_form for each input field
2. Use click to submit or press_key "Enter"
3. Use wait for page to load after submission

### Complex tasks requiring page understanding:
1. Use read_webpage to extract page content
2. Use display_result to show summaries to user
3. Use evaluate_success to check completion

## OUTPUT FORMAT
Respond with a JSON array ONLY. No text before or after. Include your success criteria in the response.
Example with success criteria:
[{"type": "close_popups", "description": "Close any popups", "successCriteria": "No blocking popups visible"}, ...]

Respond ONLY with valid JSON array, no other text or explanation.`;

    const userPrompt = `## USER COMMAND
"${command}"

## SUCCESS CRITERIA
What does success look like for this task? (e.g., "Flight results displayed", "Logged into account", "Form submitted", "Question about page answered")

## CURRENT PAGE CONTEXT
${pageContext}

${needsPageContent ? `
## IMPORTANT: This appears to be a QUESTION about the current webpage!
The user wants to know something about the page they are viewing.
You MUST:
1. First use "read_webpage" to extract the page content
2. Then use "display_result" to show the answer to the user
Do NOT just return empty steps - the user expects an answer!
` : ''}

Based on the available page elements and the user's command, create a plan of actions. ${needsPageContent ? 'For questions, start with read_webpage to get page content, then display_result to show the answer.' : 'Start with close_popups, then proceed with the task.'} Include evaluate_success at the end to verify completion.`;

    log.info('[Agent] Planning task:', command, '| Is question:', isQuestion, '| Needs page content:', needsPageContent);
    log.info('[Agent] User prompt:', userPrompt);

    const result = await aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    log.info('[Agent] AI response:', result.content);

    if (result.content) {
      try {
        // Extract JSON from response (in case AI adds text before/after)
        let jsonStr = result.content.trim();
        const jsonStart = jsonStr.indexOf('[');
        const jsonEnd = jsonStr.lastIndexOf(']');

        if (jsonStart !== -1 && jsonEnd !== -1) {
          jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
        }

        const actions = JSON.parse(jsonStr);
        if (Array.isArray(actions)) {
          return actions.map((a: any, i: number) => {
            const actionType = (a.type || a.function || a.name || '').toLowerCase();
            return {
              id: crypto.randomUUID(),
              type: actionType as AgentActionType,
              description: a.description,
              selector: a.selector,
              text: a.text,
              value: a.value,
              url: a.url,
              domain: a.domain,
              timeout: a.timeout,
              waitForLoad: a.waitForLoad ?? true,
              waitForNavigation: a.waitForNavigation,
              clear: a.clear ?? true,
              direction: a.direction,
              amount: a.amount,
              ms: a.ms,
              hard: a.hard,
              formSelector: a.formSelector,
              key: a.key,
              modifier: a.modifier
            };
          });
        }
      } catch (parseErr) {
        log.warn('[Agent] Failed to parse AI response:', result.content);
      }
    }

    return null;
  }

  private planActionsBasic(command: string): AgentAction[] {
    const lowerCommand = command.toLowerCase();

    if (lowerCommand.includes('search') || lowerCommand.includes('find')) {
      const query = this.extractSearchQuery(command);
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      return [
        { id: crypto.randomUUID(), type: 'browse', description: `Search for "${query}"`, url: searchUrl }
      ];
    }

    if (lowerCommand.includes('login') || lowerCommand.includes('sign in')) {
      return [
        { id: '1', type: 'fill_form', description: 'Enter username/email', selector: 'input[type="text"], input[name="email"], input[name="username"], input[type="email"]', value: '', clear: true },
        { id: '2', type: 'fill_form', description: 'Enter password', selector: 'input[type="password"]', value: '', clear: true },
        { id: '3', type: 'click', description: 'Click submit button', selector: 'button[type="submit"], input[type="submit"]' }
      ];
    }

    if (lowerCommand.includes('scroll down')) {
      return [
        { id: '1', type: 'scroll', description: 'Scroll down the page', direction: 'down', amount: 500 }
      ];
    }

    if (lowerCommand.includes('scroll up')) {
      return [
        { id: '1', type: 'scroll', description: 'Scroll up the page', direction: 'up', amount: 500 }
      ];
    }

    if (lowerCommand.includes('reload') || lowerCommand.includes('refresh')) {
      return [
        { id: '1', type: 'reload', description: 'Reload the page', hard: false }
      ];
    }

    if (lowerCommand.includes('back')) {
      return [
        { id: '1', type: 'go_back', description: 'Go back to previous page' }
      ];
    }

    if (lowerCommand.includes('forward')) {
      return [
        { id: '1', type: 'go_forward', description: 'Go forward to next page' }
      ];
    }    // Default to search for anything else by browsing directly to Google
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(command)}`;
    return [
      { id: crypto.randomUUID(), type: 'browse', description: `Search for "${command}"`, url: searchUrl }
    ];
  }

  /**
   * Checks if a command is explicitly asking to navigate to a known website.
   * Returns the direct URL if found, null otherwise.
   */
  private tryDirectNavigation(command: string): string | null {
    const lower = command.toLowerCase();

    // Navigation intent keywords
    const navKeywords = ['go to', 'open', 'navigate to', 'visit', 'browse to', 'show me', 'take me to'];
    const hasNavIntent = navKeywords.some(kw => lower.includes(kw));

    // Site name to URL mapping
    const siteMap: Record<string, string> = {
      'amazon': 'https://www.amazon.com',
      'amazon.com': 'https://www.amazon.com',
      'amazon.in': 'https://www.amazon.in',
      'youtube': 'https://www.youtube.com',
      'youtube.com': 'https://www.youtube.com',
      'github': 'https://www.github.com',
      'github.com': 'https://www.github.com',
      'reddit': 'https://www.reddit.com',
      'reddit.com': 'https://www.reddit.com',
      'wikipedia': 'https://www.wikipedia.org',
      'wikipedia.org': 'https://www.wikipedia.org',
      'twitter': 'https://www.twitter.com',
      'twitter.com': 'https://www.twitter.com',
      'x.com': 'https://www.x.com',
      'instagram': 'https://www.instagram.com',
      'facebook': 'https://www.facebook.com',
      'linkedin': 'https://www.linkedin.com',
      'netflix': 'https://www.netflix.com',
      'flipkart': 'https://www.flipkart.com',
      'flipkart.com': 'https://www.flipkart.com',
      'google': 'https://www.google.com',
      'gmail': 'https://mail.google.com',
      'maps': 'https://maps.google.com',
      'stackoverflow': 'https://stackoverflow.com',
      'stack overflow': 'https://stackoverflow.com',
    };

    // Check if any known site name appears in the command
    for (const [site, url] of Object.entries(siteMap)) {
      if (lower.includes(site)) {
        // Extra confirmation: if we detected a nav keyword OR the site is mentioned explicitly with 'pe' or 'on'
        if (hasNavIntent || lower.includes(`${site} pe`) || lower.includes(`on ${site}`) || lower.includes(`at ${site}`)) {
          return url;
        }
        // Also match "go to amazon and find..." type patterns
        if (lower.includes(site)) {
          return url;
        }
      }
    }

    // Also handle direct URL patterns (e.g., "go to amazon.com")
    const urlPattern = /(?:go to|open|navigate to|visit)\s+(https?:\/\/[^\s]+)/i;
    const urlMatch = command.match(urlPattern);
    if (urlMatch) return urlMatch[1];

    return null;
  }

  private extractSearchQuery(command: string): string {
    const patterns = [
      /(?:search|find|look for)\s+(?:for\s+)?(.+)/i,
      /^(.+?)(?:\s+to|\s+on|\s+for)/,
    ];

    for (const pattern of patterns) {
      const match = command.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return command;
  }

  private async executeAction(action: AgentAction): Promise<void> {
    if (!this.mainWindow) {
      throw new Error('No main window available');
    }

    const webContents = this.mainWindow.webContents;
    let result: any;

    switch (action.type) {
      case 'browse':
      case 'BROWSE':
        const navigateUrl = action.url || action.value;
        if (navigateUrl) {
          // Send navigation command to renderer via IPC - will be executed in a webview tab
          this.mainWindow.webContents.send('agent-navigate-webview', { url: navigateUrl, tabId: '' });
          // Wait for navigation - the renderer will handle loading
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        break;

      case 'switch_to_tab':
      case 'SWITCH_TO_TAB':
        {
          const tabIndex = action.index;
          const tabTitle = action.text;

          log.info('[Agent] switch_to_tab: requesting tab list');

          // Request tab list - send request and wait for response via one-time listener
          const tabs = await this.sendAndWaitForResponse('agent-get-tabs-request', 2000);

          log.info('[Agent] switch_to_tab: received tabs:', tabs);

          if (!tabs || tabs.length === 0) {
            throw new Error('Could not get tab list');
          }

          let targetTabId: string | undefined;

          if (tabIndex !== undefined && tabIndex >= 0 && tabIndex < tabs.length) {
            targetTabId = tabs[tabIndex].id;
            log.info('[Agent] switch_to_tab: targeting by index', tabIndex, '->', targetTabId);
          } else if (tabTitle) {
            const found = tabs.find((t: any) => t.title?.toLowerCase().includes(tabTitle.toLowerCase()));
            if (found) {
              targetTabId = found.id;
              log.info('[Agent] switch_to_tab: targeting by title', tabTitle, '->', targetTabId);
            }
          }

          if (!targetTabId) {
            throw new Error(`Tab not found: ${tabTitle || 'index ' + tabIndex}`);
          }

          // Switch to the tab via IPC
          log.info('[Agent] switch_to_tab: calling switchTab for', targetTabId);
          await this.sendAndWaitForResponse('agent-switch-tab-request', 1000, targetTabId);

          // Update active tab ID
          this.activeTabId = targetTabId;

          // Wait for UI to update
          await new Promise(resolve => setTimeout(resolve, 500));

          result = { success: true, switchedTo: targetTabId };
          log.info('[Agent] switch_to_tab: completed', targetTabId);
        }
        break;

      case 'close_tab':
      case 'CLOSE_TAB':
        {
          const closeIndex = action.index;

          const tabs = await this.sendAndWaitForResponse('agent-get-tabs', 2000);

          let targetTabId: string | undefined;

          if (closeIndex !== undefined && closeIndex >= 0 && closeIndex < tabs.length) {
            targetTabId = tabs[closeIndex].id;
          } else {
            targetTabId = this.activeTabId || undefined;
          }

          if (!targetTabId) {
            throw new Error('No tab to close');
          }

          // Close the tab via IPC
          await this.sendAndWaitForResponse('agent-close-tab', 1000, targetTabId);

          result = { success: true, closed: targetTabId };
          log.info('[Agent] Closed tab:', targetTabId);
        }
        break;

      case 'open_new_tab':
      case 'OPEN_NEW_TAB':
        {
          const newUrl = action.url;

          // Create new tab via IPC
          await this.sendAndWaitForResponse('agent-create-tab', 1000, newUrl || 'about:blank');

          result = { success: true };
          log.info('[Agent] Opened new tab');
        }
        break;

      case 'get_all_tabs':
      case 'GET_ALL_TABS':
        {
          const tabs = await this.sendAndWaitForResponse('agent-get-tabs', 2000);

          result = { tabs: tabs || [], count: (tabs || []).length };
          log.info('[Agent] Got all tabs:', (tabs || []).length);
        }
        break;

      case 'check_credentials':
      case 'CHECK_CREDENTIALS':
        let currentUrl = '';
        try {
          currentUrl = this.mainWindow.webContents.getURL();
          if (currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.startsWith('beam:')) {
            currentUrl = '';
          }
        } catch (e) {
          log.warn('[Agent] Could not get current URL');
        }

        const domain = action.domain || (currentUrl ? new URL(currentUrl).hostname : 'unknown');
        const watcher = getCredentialWatcherService();
        const hasCredentials = await watcher.hasStoredCredentials(domain);

        result = { found: hasCredentials };
        log.info('[Agent] Credentials check for', domain, ':', hasCredentials ? 'FOUND' : 'NOT FOUND');
        break;

      case 'auto_login':
      case 'AUTO_LOGIN':
        // Try to auto-login using stored credentials
        const currentDomain = new URL(this.mainWindow.webContents.getURL()).hostname;
        const passwords = await getPasswordManagerService().getAllPasswords();
        const creds = passwords.find(p => p.url && p.url.includes(currentDomain));

        if (!creds || !creds.username || !creds.password) {
          throw new Error('No stored credentials found for this website. Use wait_for_manual_login instead.');
        }

        // Fill username
        result = await this.executeJavaScriptOnWebView(`
          (function() {
            const usernameFields = document.querySelectorAll('input[type="email"], input[name="username"], input[name="login"], input[id="username"], input[id="login"], input[aria-label*="username"], input[aria-label*="login"]');
            for (const el of usernameFields) {
              if (el.offsetParent !== null) {
                el.value = '${creds.username.replace(/'/g, "\\'")}';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                return { success: true, field: 'username' };
              }
            }
            return { success: false, error: 'Username field not found' };
          })()
        `);

        if (!result?.success) {
          throw new Error('Could not fill username: ' + result?.error);
        }

        // Fill password
        result = await this.executeJavaScriptOnWebView(`
          (function() {
            const passwordFields = document.querySelectorAll('input[type="password"], input[name="password"], input[id="password"]');
            for (const el of passwordFields) {
              if (el.offsetParent !== null) {
                el.value = '${creds.password.replace(/'/g, "\\'")}';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                return { success: true, field: 'password' };
              }
            }
            return { success: false, error: 'Password field not found' };
          })()
        `);

        if (!result?.success) {
          throw new Error('Could not fill password: ' + result?.error);
        }

        // Submit form
        result = await this.executeJavaScriptOnWebView(`
          (function() {
            const forms = document.querySelectorAll('form');
            for (const form of forms) {
              if (form.offsetParent !== null) {
                form.submit();
                return { success: true };
              }
            }
            // Try clicking submit button
            const buttons = document.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])');
            for (const btn of buttons) {
              if (btn.offsetParent !== null && btn.type !== 'button') {
                btn.click();
                return { success: true };
              }
            }
            return { success: false, error: 'Could not submit form' };
          })()
        `);

        if (result?.success) {
          await this.waitForLoad();
          log.info('[Agent] Auto-login successful');
        } else {
          throw new Error('Login submission failed: ' + result?.error);
        }
        break;

      case 'wait_for_manual_login':
      case 'WAIT_FOR_MANUAL_LOGIN':
        const loginTimeout = action.timeout || 60000;
        log.info('[Agent] Waiting for manual login (timeout:', loginTimeout, 'ms)');

        const startTime = Date.now();
        let loggedIn = false;

        while (!loggedIn && (Date.now() - startTime) < loginTimeout) {
          const checkResult = await this.executeJavaScriptOnWebView(`
            (function() {
              const pwd = document.querySelector('input[type="password"]');
              const loginBtn = document.querySelector('button[type="submit"], input[type="submit"]');
              const loginForm = document.querySelector('form');
              
              if (!pwd && !loginBtn && !loginForm) {
                return { loggedIn: true };
              }
              
              const body = document.body.innerText.toLowerCase();
              if (body.includes('welcome') || body.includes('sign out') || body.includes('logout') || body.includes('profile')) {
                return { loggedIn: true };
              }
              
              return { loggedIn: false };
            })()
          `);

          if (checkResult?.loggedIn) {
            loggedIn = true;
            log.info('[Agent] Manual login detected, capturing credentials...');
            await this.captureCredentialsOnLogin();
            break;
          }

          await this.sleep(2000);
        }

        if (!loggedIn) {
          log.warn('[Agent] Manual login timeout - no login detected');
        }
        break;

      case 'fill_form':
      case 'FILL_FORM':
        if (action.selector && action.value !== undefined) {
          result = await this.executeJavaScriptOnWebView(`
            (function() {
              const el = document.querySelector('${action.selector}');
              if (!el) return { success: false, error: 'Element not found' };
              ${action.clear !== false ? "el.value = '';" : ''}
              el.value = '${action.value.replace(/'/g, "\\'")}';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return { success: true };
            })()
          `);
          if (!result?.success) {
            throw new Error(result?.error || 'Failed to fill form');
          }
        }
        break;

      case 'click':
      case 'CLICK':
        if (action.selector) {
          result = await this.executeJavaScriptOnWebView(`
            (function() {
              const el = document.querySelector('${action.selector}');
              if (!el) return { success: false, error: 'Element not found' };
              el.click();
              return { success: true };
            })()
          `);
          if (!result?.success) {
            throw new Error(result?.error || 'Failed to click element');
          }
          if (action.waitForNavigation) {
            await this.waitForLoad();
          }
        }
        break;

      case 'click_by_text':
      case 'CLICK_BY_TEXT':
        if (action.text) {
          const searchText = action.text.toLowerCase();
          const searchTextEscaped = searchText.replace(/'/g, "\\'");
          result = await this.executeJavaScriptOnWebView(`
            (function() {
              const searchText = '${searchTextEscaped}';
              // Search for buttons and links containing the text
              const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
              const links = Array.from(document.querySelectorAll('a'));
              const allElements = [...buttons, ...links];
              
              for (const el of allElements) {
                const elText = (el.textContent || '').toLowerCase();
                const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                const value = (el.value || '').toLowerCase();
                
                if (elText.includes(searchText) || ariaLabel.includes(searchText) || value.includes(searchText)) {
                  el.click();
                  return { success: true, text: el.textContent?.trim() || el.value };
                }
              }
              return { success: false, error: 'Button/link with text not found: ' + searchText };
            })()
          `);
          if (!result?.success) {
            throw new Error(result?.error || 'Failed to click by text');
          }
          log.info('[Agent] Clicked by text:', action.text);
          if (action.waitForNavigation) {
            await this.waitForLoad();
          }
        }
        break;

      case 'read_html':
      case 'READ_HTML':
        result = await this.executeJavaScriptOnWebView(`
          document.documentElement.outerHTML
        `);
        log.info('[Agent] HTML extracted, length:', result?.length);
        break;

      case 'reload':
      case 'RELOAD':
        webContents.reload();
        await this.waitForLoad();
        break;

      case 'scroll':
      case 'SCROLL':
        const scrollAmount = action.amount || 300;
        const scrollDir = action.direction === 'up' ? -scrollAmount : scrollAmount;
        await this.executeJavaScriptOnWebView(`
          window.scrollBy(0, ${scrollDir});
          'scrolled'
        `);
        break;

      case 'wait':
      case 'WAIT':
        await this.sleep(action.ms || 1000);
        break;

      case 'screenshot':
      case 'SCREENSHOT':
        log.info('[Agent] Screenshot requested');
        break;

      case 'extract_links':
      case 'EXTRACT_LINKS':
        result = await this.executeJavaScriptOnWebView(`
          (function() {
            const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({
              text: a.textContent?.trim().substring(0, 100),
              href: a.href
            })).filter(l => l.href && l.href.startsWith('http'));
            return links.slice(0, 50);
          })()
        `);
        log.info('[Agent] Extracted links:', result?.length);
        break;

      case 'extract_text':
      case 'EXTRACT_TEXT':
        if (action.selector) {
          result = await this.executeJavaScriptOnWebView(`
            (function() {
              const els = document.querySelectorAll('${action.selector}');
              return Array.from(els).map(el => el.textContent?.trim()).join('\\n');
            })()
          `);
        } else {
          result = await this.executeJavaScriptOnWebView(`
            document.body.innerText
          `);
        }
        log.info('[Agent] Text extracted, length:', result?.length);
        break;

      case 'submit_form':
      case 'SUBMIT_FORM':
        result = await this.executeJavaScriptOnWebView(`
          (function() {
            const form = document.querySelector('${action.formSelector || 'form'}');
            if (!form) return { success: false, error: 'Form not found' };
            form.submit();
            return { success: true };
          })()
        `);
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to submit form');
        }
        await this.waitForLoad();
        break;

      case 'select_option':
      case 'SELECT_OPTION':
        if (action.selector && action.value) {
          result = await this.executeJavaScriptOnWebView(`
            (function() {
              const el = document.querySelector('${action.selector}');
              if (!el) return { success: false, error: 'Select not found' };
              el.value = '${action.value}';
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return { success: true };
            })()
          `);
          if (!result?.success) {
            throw new Error(result?.error || 'Failed to select option');
          }
        }
        break;

      case 'hover':
      case 'HOVER':
        if (action.selector) {
          result = await this.executeJavaScriptOnWebView(`
            (function() {
              const el = document.querySelector('${action.selector}');
              if (!el) return { success: false, error: 'Element not found' };
              el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
              return { success: true };
            })()
          `);
        }
        break;

      case 'press_key':
      case 'PRESS_KEY':
        if (action.key) {
          const key = action.key;
          const modifiers: string[] = [];
          if (action.modifier === 'ctrl') modifiers.push('Control');
          if (action.modifier === 'alt') modifiers.push('Alt');
          if (action.modifier === 'shift') modifiers.push('Shift');

          await this.executeJavaScriptOnWebView(`
            (function() {
              const event = new KeyboardEvent('keydown', {
                key: '${key}',
                code: 'Key${key}',
                ${modifiers.map(m => `${m}: true`).join(', ')},
                bubbles: true
              });
              document.activeElement?.dispatchEvent(event);
              return 'key pressed';
            })()
          `);
        }
        break;

      case 'go_back':
      case 'GO_BACK':
        webContents.goBack();
        await this.waitForLoad();
        break;

      case 'go_forward':
      case 'GO_FORWARD':
        webContents.goForward();
        await this.waitForLoad();
        break;

      case 'get_page_info':
      case 'GET_PAGE_INFO':
        result = await this.executeJavaScriptOnWebView(`
          (function() {
            return {
              url: window.location.href,
              title: document.title,
              description: document.querySelector('meta[name="description"]')?.content
            };
          })()
        `);
        log.info('[Agent] Page info:', result);
        break;

      case 'wait_active':
      case 'WAIT_ACTIVE':
        {
          const watcher = getCredentialWatcherService();
          watcher.setWaitMode('active');
          await watcher.startWatching(this.activeTabId || '');
          log.info('[Agent] Set to active wait mode');
        }
        break;

      case 'wait_passive':
      case 'WAIT_PASSIVE':
        {
          const watcher = getCredentialWatcherService();
          watcher.setWaitMode('passive');
          await watcher.stopWatching();
          log.info('[Agent] Set to passive wait mode');
        }
        break;

      case 'wait_sleep':
      case 'WAIT_SLEEP':
        {
          const watcher = getCredentialWatcherService();
          watcher.sleep();
          log.info('[Agent] Agent going to sleep');
        }
        break;

      case 'wake':
      case 'WAKE':
        {
          const watcher = getCredentialWatcherService();
          watcher.wake();
          log.info('[Agent] Agent waking up');
        }
        break;

      case 'autofill':
      case 'AUTOFILL':
        {
          const domain = new URL(this.mainWindow.webContents.getURL()).hostname;
          const watcher = getCredentialWatcherService();
          const fillResult = await watcher.autofill(this.activeTabId || '', domain);
          log.info('[Agent] Autofill result:', fillResult);
          result = fillResult;
        }
        break;

      // === PHASE 1: Enhanced Skills ===
      case 'auto_fill_form':
      case 'AUTO_FILL_FORM':
        {
          const data = action.data || {};
          const fillScript = `
            (function() {
              const data = ${JSON.stringify(data)};
              const results = [];
              
              // Find all input fields
              const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea');
              const fieldMap = {};
              
              // Build field map from labels
              const labels = document.querySelectorAll('label');
              labels.forEach(label => {
                const forAttr = label.getAttribute('for');
                const inputId = label.getAttribute('for');
                const text = label.textContent?.toLowerCase() || '';
                fieldMap[text.trim()] = forAttr;
              });
              
              // Try to match data keys to input fields
              for (const [key, value] of Object.entries(data)) {
                const keyLower = key.toLowerCase();
                
                // Try to find by name, id, placeholder, or label
                let filled = false;
                
                // By name
                let el = document.querySelector(\`input[name*="\${keyLower}"], textarea[name*="\${keyLower}"]\`);
                if (el) { el.value = value; el.dispatchEvent(new Event('input', {bubbles: true})); results.push(key); filled = true; }
                
                // By id
                if (!filled) {
                  el = document.querySelector(\`input[id*="\${keyLower}"], textarea[id*="\${keyLower}"]\`);
                  if (el) { el.value = value; el.dispatchEvent(new Event('input', {bubbles: true})); results.push(key); filled = true; }
                }
                
                // By type
                if (!filled) {
                  if (keyLower.includes('email')) {
                    el = document.querySelector('input[type="email"]');
                    if (el) { el.value = value; el.dispatchEvent(new Event('input', {bubbles: true})); results.push(key); filled = true; }
                  } else if (keyLower.includes('phone') || keyLower.includes('tel')) {
                    el = document.querySelector('input[type="tel"]');
                    if (el) { el.value = value; el.dispatchEvent(new Event('input', {bubbles: true})); results.push(key); filled = true; }
                  }
                }
              }
              
              return { success: true, filled: results };
            })()
          `;
          result = await this.executeJavaScriptOnWebView(fillScript);
          log.info('[Agent] Auto fill form result:', result);
        }
        break;

      case 'extract_structured':
      case 'EXTRACT_STRUCTURED':
        {
          const schema = action.schema || '';
          const pageText = await this.executeJavaScriptOnWebView(`
            (function() {
              // Remove scripts and styles
              const clone = document.body.cloneNode(true);
              clone.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove());
              return clone.innerText.substring(0, 10000);
            })()
          `);

          // Use AI to extract structured data
          const aiService = getAIService();
          const messages = [
            { role: 'system' as const, content: 'You are a data extraction assistant. Extract structured data from the following page content based on the user schema. Return valid JSON only.' },
            { role: 'user' as const, content: 'Schema: ' + schema + '\n\nPage content:\n' + pageText }
          ];

          try {
            const aiResponse: any = await aiService.chat(messages);
            let extracted = aiResponse?.message?.content || '';
            // Try to parse JSON from response
            const jsonMatch = extracted.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              result = JSON.parse(jsonMatch[0]);
            } else {
              result = { raw: extracted };
            }
          } catch (err) {
            result = { error: 'Failed to extract structured data: ' + err.message };
          }
          log.info('[Agent] Extract structured result:', result);
        }
        break;

      case 'web_search':
      case 'WEB_SEARCH':
        {
          const query = action.query || '';
          const numResults = action.numResults || 5;

          // Use DuckDuckGo HTML search (no API key needed)
          const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
          const searchResults = await this.executeJavaScriptOnWebView(`
            (function() {
              return new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', '${searchUrl}', true);
                xhr.onload = () => {
                  if (xhr.status === 200) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(xhr.responseText, 'text/html');
                    const results = [];
                    const links = doc.querySelectorAll('.result__a');
                    const snippets = doc.querySelectorAll('.result__snippet');
                    const num = Math.min(links.length, ${numResults});
                    for (let i = 0; i < num; i++) {
                      results.push({
                        title: links[i]?.textContent || '',
                        url: links[i]?.href || '',
                        snippet: snippets[i]?.textContent || ''
                      });
                    }
                    resolve(results);
                  } else {
                    resolve([]);
                  }
                };
                xhr.onerror = () => resolve([]);
                xhr.send();
              });
            })()
          `);
          result = { query, results: searchResults || [] };
          log.info('[Agent] Web search result:', result);
        }
        break;

      // === PHASE 2: Session & Data Extraction ===
      case 'save_session':
      case 'SAVE_SESSION':
        {
          const sessionName = action.name || 'default';
          const cookies = await this.executeJavaScriptOnWebView(`
            (function() {
              return document.cookie;
            })()
          `);

          const passwordService = getPasswordManagerService();
          const domain = new URL(this.mainWindow.webContents.getURL()).hostname;
          await passwordService.addProfileInfo('session:' + sessionName, {
            domain,
            cookie: cookies,
            extraFields: {}
          });
          result = { success: true, sessionName };
          log.info('[Agent] Session saved:', sessionName);
        }
        break;

      case 'restore_session':
      case 'RESTORE_SESSION':
        {
          const sessionName = action.name || 'default';
          const passwordService = getPasswordManagerService();
          const session = await passwordService.getProfileInfo('session:' + sessionName);

          if (session?.cookie) {
            await this.executeJavaScriptOnWebView(`
              (function() {
                document.cookie = "${session.cookie}";
                location.reload();
              })()
            `);
            result = { success: true, sessionName };
            log.info('[Agent] Session restored:', sessionName);
          } else {
            result = { success: false, error: 'Session not found: ' + sessionName };
          }
        }
        break;

      case 'extract_tables':
      case 'EXTRACT_TABLES':
        {
          const selector = action.selector || '';
          const tableHtml = await this.executeJavaScriptOnWebView(`
            (function() {
              const table = document.querySelector('${selector || 'table'}');
              if (!table) return { error: 'No table found' };
              
              const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim() || '');
              const rows = Array.from(table.querySelectorAll('tr'));
              const data = rows.slice(1).map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                if (headers.length === 0) {
                  return cells.map(c => c.textContent?.trim());
                }
                const obj = {};
                cells.forEach((cell, i) => {
                  obj[headers[i] || 'col' + i] = cell.textContent?.trim();
                });
                return obj;
              });
              
              return { headers, data };
            })()
          `);

          result = tableHtml || { error: 'No table found' };
          log.info('[Agent] Extract tables result:', result);
        }
        break;

      case 'summarize_content':
      case 'SUMMARIZE_CONTENT':
        {
          const maxLength = action.maxLength || 150;
          const pageContent = await this.executeJavaScriptOnWebView(`
            (function() {
              const clone = document.body.cloneNode(true);
              clone.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript').forEach(el => el.remove());
              return clone.innerText.substring(0, 15000);
            })()
          `);

          const aiService = getAIService();
          const messages = [
            { role: 'system' as const, content: 'You are a content summarizer. Provide a concise summary of the following content. Focus on the main points.' },
            { role: 'user' as const, content: 'Summarize this (max ' + maxLength + ' words):\n\n' + pageContent }
          ];

          try {
            const aiResponse: any = await aiService.chat(messages);
            result = { summary: aiResponse?.message?.content || 'No summary available' };
          } catch (err) {
            result = { error: 'Failed to summarize: ' + err.message };
          }
          log.info('[Agent] Summarize content result:', result);
        }
        break;

      // === PHASE 3: Advanced Browser ===
      case 'enable_stealth':
      case 'ENABLE_STEALTH':
        {
          // Inject stealth mode scripts
          await this.executeJavaScriptOnWebView(`
            (function() {
              // Override navigator properties
              Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
              Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
              Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
              
              // Add chrome runtime
              window.chrome = { runtime: {} };
              
              // Randomize viewport
              Object.defineProperty(window, 'innerWidth', { get: () => 1920 });
              Object.defineProperty(window, 'innerHeight', { get: () => 1080 });
              
              return { success: true };
            })()
          `);
          result = { success: true, message: 'Stealth mode enabled' };
          log.info('[Agent] Stealth mode enabled');
        }
        break;

      case 'export_pdf':
      case 'EXPORT_PDF':
        {
          const filename = action.filename || 'page.pdf';
          // Use webContents.printToPDF
          const pdfData = await this.mainWindow.webContents.printToPDF({
            printBackground: true,
            landscape: false
          });

          const fs = require('fs');
          const path = require('path');
          const { app } = require('electron');
          const downloadsPath = app.getPath('downloads');
          const filePath = path.join(downloadsPath, filename);

          fs.writeFileSync(filePath, pdfData);
          result = { success: true, path: filePath };
          log.info('[Agent] PDF exported:', filePath);
        }
        break;

      case 'download_video':
      case 'DOWNLOAD_VIDEO':
        {
          const quality = action.quality || 'best';
          const videoScript = `
            (function() {
              const video = document.querySelector('video');
              if (!video) return { error: 'No video found' };
              
              let src = video.src || video.currentSrc;
              
              if (!src) {
                const links = document.querySelectorAll('a[href*=".mp4"], a[href*=".webm"], a[download]');
                if (links.length > 0) {
                  src = links[0].href;
                }
              }
              
              if (!src) {
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                  const match = script.textContent?.match(/(https?:\/\/[^\s"']+\.(?:m3u8|mpd))/);
                  if (match) {
                    return { error: 'HLS stream detected - use yt-dlp for download', hlsUrl: match[1] };
                  }
                }
              }
              
              return { src, duration: video.duration, width: video.videoWidth, height: video.videoHeight };
            })()
          `;

          const videoInfo = await this.executeJavaScriptOnWebView(videoScript);

          if (videoInfo?.src) {
            result = {
              success: true,
              url: videoInfo.src,
              info: videoInfo
            };
          } else {
            result = videoInfo || { error: 'No downloadable video found' };
          }
          log.info('[Agent] Download video result:', result);
        }
        break;

      // === NEW PHASE: Enhanced Skills Handlers ===
      case 'read_webpage':
      case 'READ_WEBPAGE':
        {
          const scope = action.scope || 'visible';
          const selector = action.selector || '';
          const includeForms = action.includeForms !== false;
          const maxLength = action.maxLength || 50000;

          let contentScript = '';

          if (selector) {
            contentScript = `
              (function() {
                const el = document.querySelector('${selector}');
                if (!el) return { error: 'Element not found' };
                return el.innerText || el.textContent || '';
              })()
            `;
          } else if (scope === 'full') {
            contentScript = `
              (function() {
                const clone = document.body.cloneNode(true);
                clone.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript, .ad, .advertisement').forEach(el => el.remove());
                return clone.innerText.substring(0, ${maxLength});
              })()
            `;
          } else {
            contentScript = `
              (function() {
                const clone = document.body.cloneNode(true);
                clone.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript').forEach(el => el.remove());
                return clone.innerText.substring(0, ${maxLength});
              })()
            `;
          }

          let pageContent = await this.executeJavaScriptOnWebView(contentScript);

          if (includeForms && !selector) {
            const formsContent = await this.executeJavaScriptOnWebView(`
              (function() {
                const forms = document.querySelectorAll('form');
                return Array.from(forms).map(form => {
                  const fields = [];
                  const inputs = form.querySelectorAll('input, textarea, select');
                  inputs.forEach(input => {
                    const label = form.querySelector('label[for="' + input.id + '"]')?.textContent ||
                                  input.closest('label')?.textContent ||
                                  input.getAttribute('name') ||
                                  input.getAttribute('placeholder') ||
                                  input.type;
                    fields.push({ label: label?.trim(), type: input.type, name: input.name });
                  });
                  return fields;
                });
              })()
            `);
            result = { content: pageContent, forms: formsContent };
          } else {
            result = { content: pageContent };
          }

          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('agent-webpage-read', result);
          }

          log.info('[Agent] Webpage read, content length:', pageContent?.length);
        }
        break;

      case 'close_popups':
      case 'CLOSE_POPUPS':
        {
          const excludeSelectors = (action.excludeSelectors || '').split(',').map(s => s.trim()).filter(Boolean);
          const maxPopups = action.maxPopups || 10;

          const closeScript = `
            (function() {
              const closed = [];
              const maxPopups = ${maxPopups};
              const excludeSelectors = [${excludeSelectors.map(s => `"${s}"`).join(',')}];

              const popupSelectors = [
                '[role="dialog"]',
                '.modal',
                '.popup',
                '.overlay',
                '[aria-modal="true"]',
                '.cookie-banner',
                '.cookie-notice',
                '.gdpr',
                '.newsletter-popup',
                '.promo-popup',
                '#cookieConsent',
                '#cookie-notice',
                '.cc-banner',
                '[class*="cookie"]',
                '[class*="popup"]',
                '[class*="modal"]'
              ];

              let elements = [];
              for (const sel of popupSelectors) {
                try {
                  elements = document.querySelectorAll(sel);
                  if (elements.length > 0) break;
                } catch(e) {}
              }

              let closedCount = 0;

              for (const el of elements) {
                if (closedCount >= maxPopups) break;
                if (!el.offsetParent) continue;

                const style = window.getComputedStyle(el);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                  const closeBtn = el.querySelector('[aria-label="Close"], .close, [class*="close"], button:not([type])');
                  if (closeBtn) {
                    closeBtn.click();
                  } else if (el.remove) {
                    el.remove();
                  }
                  closed.push(el.className || el.id || 'popup');
                  closedCount++;
                }
              }

              const overlays = document.querySelectorAll('.overlay, .backdrop, [class*="backdrop"]');
              for (const overlay of overlays) {
                if (overlay.offsetParent && overlay.style.background) {
                  overlay.remove();
                  closedCount++;
                }
              }

              return { closed: closedCount, types: closed };
            })()
          `;

          result = await this.executeJavaScriptOnWebView(closeScript);
          log.info('[Agent] Closed popups:', result);
        }
        break;

      case 'display_result':
      case 'DISPLAY_RESULT':
        {
          const content = action.content || '';
          const type = action.type || 'text';
          const title = action.title || 'Result';
          const actions = action.actions ? JSON.parse(action.actions) : [];

          const payload = { content, type, title, actions };

          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('agent-display-result', payload);
          }

          result = { success: true, displayed: true };
          log.info('[Agent] Displayed result in side panel:', title);
        }
        break;

      case 'evaluate_success':
      case 'EVALUATE_SUCCESS':
        {
          const successCriteria = action.successCriteria || '';
          const checkPageContent = action.checkPageContent !== false;

          let pageStateObj: { url?: string; title?: string; content?: string } = {};
          if (checkPageContent) {
            const pageStateRaw = await this.executeJavaScriptOnWebView(`
              (function() {
                const clone = document.body.cloneNode(true);
                clone.querySelectorAll('script, style, nav, footer').forEach(el => el.remove());
                return {
                  url: window.location.href,
                  title: document.title,
                  content: clone.innerText.substring(0, 5000)
                };
              })()
            `);
            if (pageStateRaw && typeof pageStateRaw === 'object') {
              pageStateObj = pageStateRaw as { url?: string; title?: string; content?: string };
            }
          }

          const aiService = getAIService();
          const evalPrompt = `
Evaluate if the task has been completed successfully.

SUCCESS CRITERIA: ${successCriteria}

CURRENT PAGE STATE:
- URL: ${pageStateObj?.url || 'unknown'}
- Title: ${pageStateObj?.title || 'unknown'}
- Content: ${pageStateObj?.content || 'none'}

Respond with JSON only:
{"success": true/false, "reason": "explanation", "nextAction": "continue/stop"}
`;

          try {
            const aiResponse = await aiService.chat([
              { role: 'system', content: 'You are a task evaluation assistant. Evaluate if success criteria is met. Return valid JSON only.' },
              { role: 'user', content: evalPrompt }
            ]);

            const aiMessage = aiResponse as { message?: { content?: string } };
            const responseText = aiMessage?.message?.content || '';
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              result = JSON.parse(jsonMatch[0]);
            } else {
              result = { success: false, reason: 'Could not evaluate', nextAction: 'continue' };
            }
          } catch (err: any) {
            result = { success: false, reason: 'Evaluation failed: ' + err.message, nextAction: 'continue' };
          }

          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('agent-success-evaluated', result);
          }

          log.info('[Agent] Success evaluation:', result);
        }
        break;

      case 'schedule_task':
      case 'SCHEDULE_TASK':
        {
          const taskName = action.name || action.taskName || 'Scheduled Task';
          const command = action.command || '';
          const triggerType = action.trigger || 'once';
          const time = action.time;
          const interval = action.interval;
          const repeat = action.repeat || false;

          const { getSchedulerService } = await import('./SchedulerService');
          const scheduler = getSchedulerService();

          const trigger = triggerType === 'daily'
            ? { type: 'daily' as const, time: time || '09:00', hour: parseInt((time || '09:00').split(':')[0]), minute: parseInt((time || '09:00').split(':')[1]) }
            : triggerType === 'interval'
              ? { type: 'interval' as const, minutes: interval || 60 }
              : { type: 'once' as const, time: time ? new Date(time).getTime() : Date.now() + 60000 };

          const scheduled = await scheduler.addTask({
            name: taskName,
            command,
            trigger,
            repeat: repeat ? { enabled: true } : undefined,
            enabled: true
          });

          result = { success: true, taskId: scheduled.id, nextRun: scheduled.nextRun };
          log.info('[Agent] Task scheduled:', taskName, 'ID:', scheduled.id);
        }
        break;

      case 'repeat_until':
      case 'REPEAT_UNTIL':
        {
          const command = action.command || '';
          const condition = action.condition || 'true';
          const intervalMs = action.intervalMs || 5000;
          const maxIterations = action.maxIterations || 10;

          let iterations = 0;
          let lastResult: any = null;

          while (iterations < maxIterations) {
            iterations++;
            log.info('[Agent] Repeat iteration:', iterations, 'of', maxIterations);

            try {
              const task = await this.executeTask(command);
              lastResult = task.result;

              const evalResult = await this.executeJavaScriptOnWebView(`
                (function() {
                  const result = ${JSON.stringify(lastResult)};
                  const condition = ${condition};
                  try {
                    return { met: eval(condition), error: null };
                  } catch(e) {
                    return { met: false, error: e.message };
                  }
                })()
              `);

              if (evalResult?.met) {
                result = { success: true, iterations, stopped: true, result: lastResult };
                log.info('[Agent] Repeat condition met after', iterations, 'iterations');
                break;
              }
            } catch (err: any) {
              log.warn('[Agent] Repeat iteration failed:', err.message);
            }

            if (iterations < maxIterations) {
              await this.sleep(intervalMs);
            }
          }

          if (!result) {
            result = { success: false, iterations, stopped: false, error: 'Max iterations reached' };
          }

          log.info('[Agent] Repeat complete:', result);
        }
        break;
    }
  }

  private async executeJavaScriptOnWebView(script: string): Promise<any> {
    if (!this.mainWindow) {
      throw new Error('No main window available');
    }

    const tabId = this.activeTabId;
    if (tabId) {
      try {
        const result = await Promise.race([
          this.executeScriptInTab(tabId, script),
          new Promise((_, reject) => setTimeout(() => reject(new Error('JavaScript execution timeout')), 10000))
        ]);
        return result;
      } catch (err: any) {
        log.warn('[Agent] JS execution in webview failed:', err.message);
        return null;
      }
    }

    try {
      const result = await Promise.race([
        this.mainWindow!.webContents.executeJavaScript(script, true),
        new Promise((_, reject) => setTimeout(() => reject(new Error('JavaScript execution timeout')), 10000))
      ]);
      return result;
    } catch (err: any) {
      log.warn('[Agent] JS execution failed:', err.message);
      return null;
    }
  }

  private async waitForLoad(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.mainWindow) {
        resolve();
        return;
      }

      const webContents = this.mainWindow.webContents;

      if (webContents.isLoading()) {
        webContents.once('did-stop-loading', () => {
          setTimeout(resolve, 500);
        });
      } else {
        setTimeout(resolve, 500);
      }
    });
  }

  private async captureCredentialsOnLogin(): Promise<void> {
    try {
      const captured = await this.executeJavaScriptOnWebView(`
        (function() {
          const result = { username: null, password: null, url: window.location.href };
          
          const usernameInputs = document.querySelectorAll('input[type="email"], input[name="username"], input[name="login"], input[id="username"], input[id="login"]');
          for (const el of usernameInputs) {
            if (el.value) {
              result.username = el.value;
              break;
            }
          }
          
          const passwordInputs = document.querySelectorAll('input[type="password"]');
          for (const el of passwordInputs) {
            if (el.value) {
              result.password = el.value;
              break;
            }
          }
          
          return result;
        })()
      `);

      if (captured && captured.url) {
        const url = new URL(captured.url);
        const domain = url.hostname;

        log.info('[Agent] Captured credentials from login page:', { domain, username: captured.username, hasPassword: !!captured.password });

        const passwordService = getPasswordManagerService();

        if (captured.username) {
          await passwordService.addPassword(domain, captured.username, captured.password || '');
          log.info('[Agent] Credentials stored for domain:', domain);
        }
      }
    } catch (err) {
      log.warn('[Agent] Failed to capture credentials:', err);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async sendAndWaitForResponse(channel: string, timeoutMs: number, data?: any): Promise<any> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, timeoutMs);

      const responseChannel = channel.replace('-request', '-response');

      const handler = (_event: any, response: any) => {
        clearTimeout(timeout);
        this.mainWindow?.webContents.removeListener(responseChannel as any, handler);
        resolve(response);
      };

      this.mainWindow?.webContents.on(responseChannel as any, handler);
      this.mainWindow?.webContents.send(channel, data);
    });
  }

  async getPageState(): Promise<PageState | null> {
    if (!this.mainWindow) return null;

    log.info('[Agent] getPageState: activeTabId:', this.activeTabId);

    try {
      // Send request to renderer via IPC (handled in main.ts and WebViewContainer.tsx)
      this.mainWindow.webContents.send('agent-get-page-state-request');

      // Wait for response from renderer via IPC
      const result = await new Promise<any>((resolve) => {
        const timeout = setTimeout(() => {
          ipcMain.removeListener('agent-page-state-result' as any, handler as any);
          resolve({ error: 'Timeout waiting for page state' });
        }, 5000);

        const handler = (_event: any, data: any) => {
          clearTimeout(timeout);
          ipcMain.removeListener('agent-page-state-result' as any, handler as any);
          resolve(data);
        };

        ipcMain.on('agent-page-state-result' as any, handler);
      });

      log.info('[Agent] getPageState: result:', result);

      if (!result || result.error) {
        return null;
      }

      if (!result.url || result.url.startsWith('about:') || result.url.startsWith('chrome:')) {
        return null;
      }

      return {
        url: result.url,
        title: result.title || 'Untitled',
        html: result.html || '',
        elements: [],
        links: []
      };
    } catch (err: any) {
      log.error('[Agent] getPageState failed:', err.message);
      return null;
    }
  }

  private async extractElements(): Promise<DOMElement[]> {
    try {
      const result = await this.executeJavaScriptOnWebView(`
        (function() {
          const elements = [];
          const selectors = [
            'a', 'button', 'input', 'select', 'textarea', 
            'form', '[role="button"]', '[tabindex]'
          ];
          
          const seen = new Set();
          
          selectors.forEach(sel => {
            try {
              document.querySelectorAll(sel).forEach((el, idx) => {
                if (elements.length >= 50) return;
                
                const text = el.textContent?.trim().substring(0, 50);
                const key = el.tagName + '-' + (el.id || el.className || text || idx);
                
                if (!seen.has(key)) {
                  seen.add(key);
                  
                  let selector = el.tagName.toLowerCase();
                  if (el.id) selector += '#' + el.id;
                  else if (el.className) selector += '.' + el.className.split(' ')[0];
                  else if (el.name) selector += '[name="' + el.name + '"]';
                  
                  const attrs: Record<string, string> = {};
                  for (const attr of ['name', 'type', 'placeholder', 'aria-label', 'role', 'value', 'href']) {
                    if (el[attr]) attrs[attr] = String(el[attr]).substring(0, 50);
                  }
                  
                  elements.push({
                    tag: el.tagName.toLowerCase(),
                    id: el.id || undefined,
                    classes: el.className ? Array.from(el.classList).slice(0, 3) : undefined,
                    text: text,
                    href: el.href || undefined,
                    src: el.src || undefined,
                    attributes: attrs,
                    xpath: '//' + el.tagName.toLowerCase() + '[' + (idx + 1) + ']',
                    selector: selector
                  });
                }
              });
            } catch(e) {}
          });
          
          return elements;
        })()
      `);

      return result || [];
    } catch (err) {
      log.error('[Agent] Failed to extract elements:', err);
      return [];
    }
  }

  private async extractLinks(): Promise<{ text: string; href: string }[]> {
    try {
      const result = await this.executeJavaScriptOnWebView(`
        (function() {
          return Array.from(document.querySelectorAll('a[href]'))
            .filter(a => a.href.startsWith('http'))
            .slice(0, 30)
            .map(a => ({
              text: a.textContent?.trim().substring(0, 50),
              href: a.href
            }));
        })()
      `);
      return result || [];
    } catch (err) {
      return [];
    }
  }

  async captureScreenshot(): Promise<string | null> {
    if (!this.mainWindow) return null;

    try {
      const image = await this.mainWindow.webContents.capturePage();
      return image.toDataURL();
    } catch (err) {
      log.error('[Agent] Failed to capture screenshot:', err);
      return null;
    }
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  async waitForResume(): Promise<void> {
    while (this.isPaused) {
      await this.sleep(100);
    }
  }

  pauseForConfirmation(step: AgentStep): Promise<boolean> {
    return new Promise((resolve) => {
      this.pausedForConfirmation = true;
      this.pendingRiskyAction = step.action || null;
      this.confirmationCallback = resolve;
    });
  }

  confirmAction(proceed: boolean): void {
    this.pausedForConfirmation = false;
    this.pendingRiskyAction = null;
    if (this.confirmationCallback) {
      this.confirmationCallback(proceed);
      this.confirmationCallback = null;
    }
  }

  getCurrentTask(): AgentTask | null {
    return this.currentTask;
  }

  getPendingConfirmation(): { action: AgentAction; stepDescription: string } | null {
    if (this.pausedForConfirmation && this.pendingRiskyAction) {
      const task = this.currentTask;
      const step = task?.steps.find(s => s.action === this.pendingRiskyAction);
      return {
        action: this.pendingRiskyAction,
        stepDescription: step?.description || this.pendingRiskyAction.description
      };
    }
    return null;
  }

  async getAISuggestions(): Promise<string[]> {
    const aiService = getAIService();
    if (!aiService.isEnabled()) {
      return [];
    }

    try {
      const pageState = await this.getPageState();
      if (!pageState) return [];

      return await aiService.suggestActions({
        url: pageState.url,
        title: pageState.title,
        elements: pageState.elements,
      });
    } catch (err) {
      log.error('[Agent] Failed to get AI suggestions:', err);
      return [];
    }
  }

  stop(): void {
    if (this.currentTask) {
      this.currentTask.status = 'error';
      this.currentTask.error = 'Task stopped by user';
    }
    this.isPaused = false;
    this.pausedForConfirmation = false;
    this.pendingRiskyAction = null;
  }

  async injectGoogleLoginButton(): Promise<boolean> {
    if (!this.mainWindow) return false;

    try {
      const result = await this.executeJavaScriptOnWebView(`
        (function() {
          const isLoginPage = (
            document.querySelector('input[type="password"]') !== null ||
            document.querySelector('input[name="password"]') !== null ||
            document.querySelector('input[id="password"]') !== null ||
            document.body.innerText.toLowerCase().includes('sign in') ||
            document.body.innerText.toLowerCase().includes('login') ||
            document.body.innerText.toLowerCase().includes('password')
          );

          if (!isLoginPage) return { success: false, reason: 'not login page' };

          if (document.getElementById('sovereign-google-login-btn')) {
            return { success: false, reason: 'button already exists' };
          }

          const passwordInput = document.querySelector('input[type="password"], input[name="password"], input[id="password"]');
          if (!passwordInput) return { success: false, reason: 'no password input found' };

          let container = passwordInput.closest('form') || passwordInput.parentElement;
          while (container && !container.querySelector('button, input[type="submit"]')) {
            container = container.parentElement;
          }

          if (!container) return { success: false, reason: 'no container found' };

          const googleBtn = document.createElement('button');
          googleBtn.id = 'sovereign-google-login-btn';
          googleBtn.type = 'button';
          googleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" style="margin-right: 8px;"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Continue with Google';
          googleBtn.style.cssText = 'display: flex; align-items: center; justify-content: center; width: 100%; padding: 12px 16px; margin-top: 16px; background: white; border: 1px solid #dadce0; border-radius: 4px; font-family: Roboto, sans-serif; font-size: 14px; font-weight: 500; color: #3c4043; cursor: pointer; transition: background 0.2s, box-shadow 0.2s;';
          
          googleBtn.onmouseenter = function() {
            googleBtn.style.background = '#f8f9fa';
            googleBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          };
          googleBtn.onmouseleave = function() {
            googleBtn.style.background = 'white';
            googleBtn.style.boxShadow = 'none';
          };

          container.appendChild(googleBtn);

          googleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.postMessage({ type: 'SOVEREIGN_GOOGLE_LOGIN_CLICK' }, '*');
          });

          return { success: true };
        })()
      `);

      return result?.success || false;
    } catch (err) {
      log.error('[Agent] Failed to inject Google login button:', err);
      return false;
    }
  }
}

let agentService: AgentService | null = null;

export function getAgentService(): AgentService {
  if (!agentService) {
    agentService = new AgentService();
  }
  return agentService;
}
