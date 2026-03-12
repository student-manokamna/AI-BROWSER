import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

console.log('[Renderer] Starting Beam Browser...');
console.log('[Renderer] Node integration:', window.nodeIntegration);
console.log('[Renderer] Context isolation:', window.contextIsolation);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
