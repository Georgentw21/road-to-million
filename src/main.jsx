import React, { useEffect, useRef, useState } from 'react';
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
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 460, width: '100%', padding: '34px 30px', borderRadius: 20, background: 'rgba(19,19,22,.88)', border: '1px solid rgba(220,106,99,.3)', boxShadow: '0 40px 100px -30px rgba(0,0,0,.9)' }}>
          <div style={{ width: 52, height: 52, margin: '0 auto 16px', borderRadius: 14, background: 'rgba(220,106,99,.12)', border: '1px solid rgba(220,106,99,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#DC6A63" strokeWidth="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: '#ECEAE3', marginBottom: 8 }}>Something went wrong</div>
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
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, background: '#000' }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', border: '3px solid rgba(226,197,136,.25)', borderTopColor: '#E2C588', animation: 'spin .7s linear infinite' }} />
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 16, color: '#9A9AA4' }}>{text || 'Loading your desk…'}</div>
    </div>
  );
}

// Hero background video — plays muted, loops with a smooth crossfade to black.
const HERO_VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_074625_a81f018a-956b-43fb-9aee-4d1508e30e6a.mp4';

// Landing / login — full-viewport hero in the liquid-glass style. The chase-the-dream
// pitch up top, the real Supabase sign-in in the middle, the manifesto below the fold.
function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const scrollerRef = useRef(null);
  const manifestoRef = useRef(null);
  const videoRef = useRef(null);
  const rafRef = useRef(0);
  const fadeOutRef = useRef(false);

  // Opacity animated by rAF (no CSS transitions): canplay → play + fade 0→1 in 500ms;
  // when ≤0.55s remain → fade to 0; on ended → snap to 0, wait 100ms, rewind, play,
  // fade back in. Reads as one seamless loop with a soft dip to black.
  const fadeTo = (target, dur = 500) => {
    const el = videoRef.current; if (!el) return;
    cancelAnimationFrame(rafRef.current);
    const from = parseFloat(el.style.opacity || '0');
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.style.opacity = String(from + (target - from) * k);
      if (k < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };
  const onCanPlay = () => { const el = videoRef.current; if (!el) return; el.play().catch(() => {}); if (!fadeOutRef.current) fadeTo(1); };
  const onTimeUpdate = () => {
    const el = videoRef.current; if (!el || !el.duration) return;
    if (el.duration - el.currentTime <= 0.55 && !fadeOutRef.current) { fadeOutRef.current = true; fadeTo(0); }
  };
  const onEnded = () => {
    const el = videoRef.current; if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => { el.currentTime = 0; el.play().catch(() => {}); fadeOutRef.current = false; fadeTo(1); }, 100);
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // scroll-reveal for the manifesto section
  useEffect(() => {
    const root = scrollerRef.current; if (!root || typeof IntersectionObserver === 'undefined') return;
    const els = root.querySelectorAll('.rv');
    const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('on'); io.unobserve(en.target); } }), { root, rootMargin: '-100px' });
    els.forEach((el, i) => { el.style.transitionDelay = (i * 0.12) + 's'; io.observe(el); });
    return () => io.disconnect();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setMsg('Please fill in both email and password.'); return; }
    if (mode === 'signup' && password.length < 6) { setMsg('Password must be at least 6 characters.'); return; }
    setBusy(true); setMsg('');
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setMsg('Account created, but email confirmation is on — disable "Confirm email" in Supabase (Authentication → Sign In/Providers → Email), then sign in.');
          setMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const m = err && err.message ? err.message : String(err);
      setMsg(m === 'Invalid login credentials' ? 'Incorrect email or password.' : m);
    } finally {
      setBusy(false);
    }
  };

  const goManifesto = () => { if (manifestoRef.current) manifestoRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const pill = { display: 'flex', alignItems: 'center', gap: 10, borderRadius: 999, padding: '6px 8px 6px 22px' };
  const pillInput = { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontFamily: 'inherit', padding: '10px 0', minWidth: 0, position: 'relative', zIndex: 1 };

  return (
    <div ref={scrollerRef} className="rtm-scroll" style={{ position: 'fixed', inset: 0, background: '#000', overflowY: 'auto', overflowX: 'hidden' }}>

      {/* ===== HERO ===== */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <video ref={videoRef} src={HERO_VIDEO} muted autoPlay playsInline preload="auto"
          onCanPlay={onCanPlay} onTimeUpdate={onTimeUpdate} onEnded={onEnded}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'bottom', opacity: 0 }} />
        {/* soft scrim so the type + form stay readable over any frame */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.42) 0%,rgba(0,0,0,.18) 40%,rgba(0,0,0,.55) 100%)', pointerEvents: 'none' }} />

        {/* navbar */}
        <div style={{ position: 'relative', zIndex: 20, padding: 24 }}>
          <div className="liquid-glass" style={{ borderRadius: 999, maxWidth: 1000, margin: '0 auto', padding: '11px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#E2C588" strokeWidth="1.7"><path d="M3 17l5-5 4 3 6-8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 16.5, whiteSpace: 'nowrap' }}>Road to Million</span>
              <div className="hide-m" style={{ display: 'flex', gap: 26, marginLeft: 26 }}>
                {['The Journal', 'Discipline', 'Manifesto'].map((t) => (
                  <span key={t} onClick={goManifesto} className="hv-op" style={{ color: 'rgba(255,255,255,.8)', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>{t}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1 }}>
              <span onClick={() => { setMode('signup'); setMsg(''); }} className="hv-op" style={{ color: '#fff', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>Sign up</span>
              <span onClick={() => { setMode('signin'); setMsg(''); }} className="liquid-glass hv-op" style={{ borderRadius: 999, padding: '8px 22px', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Login</span>
            </div>
          </div>
        </div>

        {/* hero content */}
        <div style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 40px', textAlign: 'center', transform: 'translateY(-3%)' }}>
          <h1 style={{ fontFamily: "'Instrument Serif',serif", fontWeight: 400, fontSize: 'clamp(52px, 8.5vw, 118px)', letterSpacing: '-.02em', color: '#fff', whiteSpace: 'nowrap', lineHeight: 1.05, marginBottom: 16, textShadow: '0 4px 40px rgba(0,0,0,.5)' }}>
            Chase the <em style={{ fontStyle: 'italic' }}>dream</em>.
          </h1>
          <p style={{ color: 'rgba(255,255,255,.85)', fontSize: 14, lineHeight: 1.75, maxWidth: 540, marginBottom: 30, padding: '0 12px' }}>
            Every trade logged. Every habit kept. A private journal for the road to your first million — discipline today, freedom tomorrow.
          </p>

          <form onSubmit={submit} style={{ width: '100%', maxWidth: 430, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="liquid-glass" style={pill}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" autoComplete="username" style={pillInput} />
            </div>
            <div className="liquid-glass" style={pill}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Create a password' : 'Password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} style={pillInput} />
              <button type="submit" disabled={busy} title={mode === 'signup' ? 'Create account' : 'Sign in'} style={{ position: 'relative', zIndex: 1, background: '#fff', color: '#000', border: 'none', borderRadius: '50%', width: 42, height: 42, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: busy ? 'progress' : 'pointer' }}>
                {busy
                  ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2.5px solid rgba(0,0,0,.2)', borderTopColor: '#000', animation: 'spin .7s linear infinite' }} />
                  : <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
            </div>
            {msg && <div style={{ fontSize: 12.5, color: '#FF9D94', lineHeight: 1.55, textAlign: 'left', padding: '0 22px' }}>{msg}</div>}
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>
              {mode === 'signup' ? 'Already on the road? ' : 'First time here? '}
              <span onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMsg(''); }} style={{ color: '#fff', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {mode === 'signup' ? 'Sign in' : 'Create an account'}
              </span>
            </div>
          </form>

          <span onClick={goManifesto} className="liquid-glass hv-op" style={{ borderRadius: 999, padding: '12px 32px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 30 }}>Manifesto</span>
        </div>

        {/* social row */}
        <div style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'center', gap: 14, paddingBottom: 42 }}>
          {[
            <svg key="ig" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".8" fill="currentColor" /></svg>,
            <svg key="x" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 4l16 16M20 4L4 20" strokeLinecap="round" /></svg>,
            <svg key="gl" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.9 5.7 3.9 9S14.6 18.4 12 21c-2.6-2.6-3.9-5.7-3.9-9S9.4 5.6 12 3z" /></svg>,
          ].map((icon, i) => (
            <span key={i} className="liquid-glass hv-op" style={{ borderRadius: '50%', padding: 15, color: 'rgba(255,255,255,.8)', cursor: 'pointer', display: 'flex' }}>{icon}</span>
          ))}
        </div>
      </section>

      {/* ===== MANIFESTO ===== */}
      <section ref={manifestoRef} style={{ position: 'relative', background: '#000', padding: '140px 24px 120px', textAlign: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(255,255,255,.03) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div className="rv" style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, letterSpacing: '.3em', textTransform: 'uppercase', marginBottom: 28 }}>The Manifesto</div>
        <h2 className="rv" style={{ fontFamily: "'Instrument Serif',serif", fontWeight: 400, fontSize: 'clamp(34px, 5.5vw, 68px)', color: '#fff', lineHeight: 1.14, letterSpacing: '-.01em', maxWidth: 920, margin: '0 auto' }}>
          Pioneering <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,.6)' }}>discipline</em> for<br className="hide-m" /> minds that <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,.6)' }}>dream, trade, and build.</em>
        </h2>
        <p className="rv" style={{ color: 'rgba(255,255,255,.55)', fontSize: 15, lineHeight: 1.85, maxWidth: 620, margin: '34px auto 0' }}>
          A million is not found — it is built, one honest journal entry at a time. Log the trade. Keep the habit. Review the week. The dream is chased daily, or not at all.
        </p>
        <span onClick={() => scrollerRef.current && scrollerRef.current.scrollTo({ top: 0, behavior: 'smooth' })} className="rv liquid-glass hv-op" style={{ display: 'inline-block', borderRadius: 999, padding: '12px 32px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 44 }}>Start the chase ↑</span>
      </section>
    </div>
  );
}

function Root() {
  const [session, setSession] = useState(undefined); // undefined = still loading

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

// PWA: installable + partial offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
