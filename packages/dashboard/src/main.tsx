import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import Landing from './components/Landing';
import './index.css';

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5000 } } });

// No hash (or #home) shows the landing page; tab hashes like #today show the dashboard.
function Root() {
  const isLanding = () => location.hash === '' || location.hash === '#home';
  const [landing, setLanding] = useState(isLanding);
  useEffect(() => {
    const f = () => setLanding(isLanding());
    window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f);
  }, []);
  const open = () => { location.hash = '#today'; window.scrollTo(0, 0); };
  return landing ? <Landing open={open} /> : <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}><Root /></QueryClientProvider>
  </StrictMode>,
);
