import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// NOTE: <StrictMode> is intentionally off — its dev-only effect double-mount
// leaves epub.js renditions permanently hung (display() never resolves, no
// iframe is ever created). Re-enable only if EpubView learns to survive it.
createRoot(document.getElementById('root')!).render(
  <App />
);
