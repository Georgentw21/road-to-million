// Standalone / offline entry — renders the app straight into the page with a
// local IndexedDB store (see dataStore.local.js, wired via vite.standalone.config.js).
// No login, no Supabase, no service worker. Built to a single self-contained HTML
// for private backtesting on one machine.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('[App crash]', err, info); }
  render() {
    if (!this.state.err) return this.props.children;
    const msg = (this.state.err && this.state.err.message) ? this.state.err.message : String(this.state.err);
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#08080B', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 460, width: '100%', padding: '34px 30px', borderRadius: 20, background: 'linear-gradient(180deg,#171017,#0e0e13)', border: '1px solid rgba(220,106,99,.3)' }}>
          <div style={{ fontFamily: "'Spectral',serif", fontSize: 22, color: '#ECEAE3', marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: '#9A9AA4', lineHeight: 1.6, marginBottom: 14 }}>Your backtest data is safe in this browser. Reload to continue.</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: '#DC6A63', background: 'rgba(220,106,99,.08)', border: '1px solid rgba(220,106,99,.2)', borderRadius: 8, padding: '8px 10px', margin: '0 0 20px', wordBreak: 'break-word', maxHeight: 90, overflow: 'auto' }}>{msg}</div>
          <button onClick={() => location.reload()} style={{ padding: '11px 20px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', background: 'linear-gradient(150deg,#E2C588,#C9A65F)', color: '#1a1408' }}>Reload</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App userEmail="Local · Backtest" onSignOut={() => window.alert('This is the offline backtest build — data stays in this browser only. Nothing to sign out of.')} />
  </ErrorBoundary>
);
