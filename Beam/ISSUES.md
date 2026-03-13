# Known Issues

## Theme Switch Issue
**Status:** Open
**Description:** Switching themes does not switch the themes on websites. The browser UI changes but the web content inside webviews maintains its original theme.

**Root Cause:** Webviews are isolated from the browser's CSS variables and theme system. They maintain their own styling based on the website's own CSS.

**Potential Solutions:**
1. Use CSS filters or JavaScript injection to force theme changes on web content
2. Implement a force-dark mode for all web content
3. Use Electron's nativeTheme API to control system-level dark mode
4. Implement a proxy that injects theme-specific CSS into all loaded pages

**Related Code:**
- NavigationBar.tsx:207 (toggleTheme function)
- browserStore.ts:80 (toggleTheme action)

## Additional Notes
- Only actions performed by the agent, prompts sent by the user, and conversations between the agent and AI model should be logged
- All other debug logs should be removed from the codebase