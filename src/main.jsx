import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabaseClient';
import App from './App.jsx';

// Catch any render/runtime crash and show a helpful screen (never a blank page).
// Also offers a hard reset that clears caches + the service worker, in case a stale
// cache is the culprit.
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('[App crash]', err, info); }
  async _hardReset() {
    try { if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.unregister())); } } catch (e) {}
    try { if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } } catch (e) {}
    location.reload(true);
  }
  render() {
    if (!this.state.err) return this.props.children;
    const msg = (this.state.err && this.state.err.message) ? this.state.err.message : String(this.state.err);
    const btn = { padding: '11px 20px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' };
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#08080B', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 460, width: '100%', padding: '34px 30px', borderRadius: 20, background: 'linear-gradient(180deg,#171017,#0e0e13)', border: '1px solid rgba(220,106,99,.3)', boxShadow: '0 40px 100px -30px rgba(0,0,0,.9)' }}>
          <div style={{ width: 52, height: 52, margin: '0 auto 16px', borderRadius: 14, background: 'rgba(220,106,99,.12)', border: '1px solid rgba(220,106,99,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#DC6A63" strokeWidth="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div style={{ fontFamily: "'Spectral',serif", fontSize: 22, color: '#ECEAE3', marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: '#9A9AA4', lineHeight: 1.6, marginBottom: 8 }}>Your data is safe in the cloud. Try reloading — if it keeps happening, use “Clear cache &amp; reload”.</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: '#DC6A63', background: 'rgba(220,106,99,.08)', border: '1px solid rgba(220,106,99,.2)', borderRadius: 8, padding: '8px 10px', margin: '0 0 20px', wordBreak: 'break-word', maxHeight: 90, overflow: 'auto' }}>{msg}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => location.reload()} style={{ ...btn, background: 'linear-gradient(150deg,#E2C588,#C9A65F)', color: '#1a1408' }}>Reload</button>
            <button onClick={() => this._hardReset()} style={{ ...btn, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.16)', color: '#ECEAE3' }}>Clear cache &amp; reload</button>
          </div>
        </div>
      </div>
    );
  }
}

function Splash({ text }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, background: '#08080B' }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', border: '3px solid rgba(226,197,136,.25)', borderTopColor: '#E2C588', animation: 'spin .7s linear infinite' }} />
      <div style={{ fontFamily: "'Spectral',serif", fontSize: 16, color: '#9A9AA4' }}>{text || 'กำลังโหลด…'}</div>
    </div>
  );
}

function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setMsg('กรอกอีเมลและรหัสผ่านให้ครบ'); return; }
    if (mode === 'signup' && password.length < 6) { setMsg('รหัสผ่านอย่างน้อย 6 ตัวอักษร'); return; }
    setBusy(true); setMsg('');
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setMsg('สร้างบัญชีแล้ว แต่ระบบขอยืนยันอีเมล — ปิด "Confirm email" ใน Supabase (Authentication → Sign In/Providers → Email) แล้วกดเข้าสู่ระบบได้เลย');
          setMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const m = err && err.message ? err.message : String(err);
      setMsg(m === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : m);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = { width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: '12px 14px', color: '#ECEAE3', fontSize: 14, outline: 'none', fontFamily: 'inherit', marginBottom: 12 };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#08080B', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-12%', right: '8%', width: '42%', height: '55%', background: 'radial-gradient(circle,rgba(201,166,95,.13),transparent 66%)', animation: 'drift1 20s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '-16%', left: '2%', width: '40%', height: '58%', background: 'radial-gradient(circle,rgba(123,167,217,.09),transparent 66%)', animation: 'drift2 26s ease-in-out infinite' }} />
      <form onSubmit={submit} style={{ position: 'relative', width: 380, maxWidth: '90vw', padding: '40px 34px', borderRadius: 20, background: 'linear-gradient(180deg,#15151c,#0e0e13)', border: '1px solid rgba(201,166,95,.2)', boxShadow: '0 50px 120px -30px rgba(0,0,0,.95)', textAlign: 'center', animation: 'pop .35s both' }}>
        <div style={{ width: 52, height: 52, margin: '0 auto 18px', borderRadius: 15, background: 'linear-gradient(145deg,rgba(201,166,95,.34),rgba(201,166,95,.06))', boxShadow: '0 0 0 1px rgba(201,166,95,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#E2C588" strokeWidth="1.7"><path d="M3 17l5-5 4 3 6-8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: '#C9A65F', marginBottom: 8 }}>Road to Million</div>
        <div style={{ fontFamily: "'Spectral',serif", fontSize: 26, color: '#ECEAE3', marginBottom: 8 }}>Trading Journal</div>
        <div style={{ fontSize: 13, color: '#9A9AA4', lineHeight: 1.6, marginBottom: 24 }}>{mode === 'signup' ? 'สร้างบัญชีครั้งแรกเพื่อเริ่มใช้งาน' : 'เข้าสู่ระบบเพื่อให้ข้อมูลตามคุณไปทุกเครื่อง'}</div>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="อีเมล" autoComplete="username" className="hv-focus" style={inputStyle} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="รหัสผ่าน" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="hv-focus" style={inputStyle} />
        {msg && <div style={{ fontSize: 12.5, color: '#DC6A63', marginBottom: 12, lineHeight: 1.5, textAlign: 'left' }}>{msg}</div>}
        <button type="submit" disabled={busy} className="hv-save" style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: busy ? 'progress' : 'pointer', background: 'linear-gradient(150deg,#E2C588,#C9A65F)', color: '#1a1408', fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', transition: '.15s' }}>
          {busy ? 'กำลังดำเนินการ…' : (mode === 'signup' ? 'สร้างบัญชี' : 'เข้าสู่ระบบ')}
        </button>
        <div style={{ marginTop: 18, fontSize: 12.5, color: '#9A9AA4' }}>
          {mode === 'signup' ? 'มีบัญชีแล้ว? ' : 'ยังไม่มีบัญชี? '}
          <span onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMsg(''); }} style={{ color: '#E2C588', cursor: 'pointer', fontWeight: 600 }}>
            {mode === 'signup' ? 'เข้าสู่ระบบ' : 'สร้างบัญชีครั้งแรก'}
          </span>
        </div>
      </form>
    </div>
  );
}

function Root() {
  const [session, setSession] = useState(undefined); // undefined = ยังโหลดอยู่

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Splash />;
  if (!session) return <Login />;
  return <App userEmail={session.user && session.user.email} onSignOut={() => supabase.auth.signOut()} />;
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><Root /></ErrorBoundary>);

// PWA: ติดตั้งได้ + offline บางส่วน
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
