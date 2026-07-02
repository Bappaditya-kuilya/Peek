import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import App from './App.jsx';
import './styles.css';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<div className="app-shell"><div className="app-frame"><div className="panel" style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}><h2 className="section-title">Something went wrong</h2><p className="helper-copy" style={{ marginBottom: 16 }}>An unexpected error occurred.</p><button type="button" className="button-primary" onClick={() => window.location.reload()}>Reload</button></div></div></div>}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
