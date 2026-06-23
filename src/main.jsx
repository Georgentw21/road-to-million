import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabaseClient';
import App from './App.jsx';

function Splash({ text }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, background: '#08080B' }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', border: '3px solid rgba(226,197,136,.25)', borderTopColor: '#E2C588', animation: 'spin .7s linear infinite' }} />
      <div style={{ fontFamily: "'Spectral',serif", fontSize: 16, color: '#9A9AA4' }}>{text || 'กำลังโหลด…'}</div>
    </div>
  );
}

function Login() {
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) { alert('ล็อกอินไม่สำเร็จ: ' + error.message); setBusy(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#08080B', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-12%', right: '8%', width: '42%', height: '55%', background: 'radial-gradient(circle,rgba(201,166,95,.13),transparent 66%)', animation: 'drift1 20s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '-16%', left: '2%', width: '40%', height: '58%', background: 'radial-gradient(circle,rgba(123,167,217,.09),transparent 66%)', animation: 'drift2 26s ease-in-out infinite' }} />
      <div style={{ position: 'relative', width: 380, maxWidth: '90vw', padding: '40px 34px', borderRadius: 20, background: 'linear-gradient(180deg,#15151c,#0e0e13)', border: '1px solid rgba(201,166,95,.2)', boxShadow: '0 50px 120px -30px rgba(0,0,0,.95)', textAlign: 'center', animation: 'pop .35s both' }}>
        <div style={{ width: 52, height: 52, margin: '0 auto 18px', borderRadius: 15, background: 'linear-gradient(145deg,rgba(201,166,95,.34),rgba(201,166,95,.06))', boxShadow: '0 0 0 1px rgba(201,166,95,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#E2C588" strokeWidth="1.7"><path d="M3 17l5-5 4 3 6-8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: '#C9A65F', marginBottom: 8 }}>Road to Million</div>
        <div style={{ fontFamily: "'Spectral',serif", fontSize: 26, color: '#ECEAE3', marginBottom: 8 }}>Trading Journal</div>
        <div style={{ fontSize: 13, color: '#9A9AA4', lineHeight: 1.6, marginBottom: 28 }}>เข้าสู่ระบบเพื่อให้ข้อมูลเทรด รูปภาพ และเช็กลิสต์ ตามคุณไปทุกเครื่อง</div>
        <button onClick={signIn} disabled={busy} className="hv-save" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '13px', borderRadius: 12, border: 'none', cursor: busy ? 'progress' : 'pointer', background: 'linear-gradient(150deg,#E2C588,#C9A65F)', color: '#1a1408', fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', transition: '.15s' }}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#1a1408" d="M44.5 20H24v8.5h11.8C34.7 33.9 30 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>
          {busy ? 'กำลังพาไป Google…' : 'เข้าสู่ระบบด้วย Google'}
        </button>
      </div>
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
  return <App onSignOut={() => supabase.auth.signOut()} />;
}

createRoot(document.getElementById('root')).render(<Root />);
