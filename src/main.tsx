import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import AlphaGatekeeper from './components/auth/AlphaGatekeeper';
import { recordStartup } from './lib/startupDiagnostics';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/share-target-sw.js', { scope: '/', updateViaCache: 'none' }).then((registration) => {
      recordStartup({ worker: registration.active ? 'share-target-active' : 'share-target-installing' });
      void registration.update().catch(() => undefined);
    }).catch(() => {
      // The app remains fully usable when a browser does not permit service
      // workers. The share target simply stays unavailable on that platform.
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AlphaGatekeeper>
        <App />
      </AlphaGatekeeper>
    </AuthProvider>
  </StrictMode>
);
