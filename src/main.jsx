/**
 * Debris Derby — Vite entry (Phase 3).
 *
 * React 18 mounts the shell into #root. The canvas inside the shell is
 * mounted once in a ref and driven by requestAnimationFrame outside
 * React's render cycle (see src/app.jsx).
 */

import { createRoot } from 'react-dom/client';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import App from './app.jsx';
import './ui/tokens.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Debris Derby: #root mount node missing from index.html');
}

createRoot(rootElement).render(<App />);