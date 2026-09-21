import React from 'react';
import ReactDOM from 'react-dom';
import { ImageSlot } from './ImageSlot.jsx';
import { loadJournal, saveJournal, getImageUrl, deleteImages, wipeImages, imageUsage } from './dataStore.js';
import {
  commissionCost,
  dataQualityReport,
  edgeDriftReport,
  equityDrawdownPercent,
  finiteNumber,
  monteCarloRisk,
  netPnlFromTrade,
  positionRisk,
  realizedRFromNetTrade,
  setupEvidenceFromNetTrades,
  summarizeNetTrades,
  tradeLegs,
  walkForwardReport,
} from './tradeMath.js';
const { Fragment } = React;

/* CSS string -> React style object (lets us copy the prototype's inline styles verbatim) */
function css(str){
  if(!str) return {};
  const o = {};
  String(str).split(';').forEach(d=>{
    const i = d.indexOf(':');
    if(i < 0) return;
    const p = d.slice(0,i).trim();
    const v = d.slice(i+1).trim();
    if(!p || !v) return;
    const k = p.startsWith('--') ? p : p.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
    o[k] = v;
  });
  return o;
}

// ตัวเลขนับขึ้น (count-up) สำหรับตัวเลขสรุป
function CountUp({ value, dur = 900 }) {
  const [disp, setDisp] = React.useState(value);
  React.useEffect(() => {
    const s = String(value);
    const m = s.match(/-?[\d,]*\.?\d+/);
    if (!m) { setDisp(s); return; }
    const numStr = m[0].replace(/,/g, '');
    const target = parseFloat(numStr);
    if (isNaN(target)) { setDisp(s); return; }
    const decimals = (numStr.split('.')[1] || '').length;
    const grouped = m[0].includes(',') || Math.abs(target) >= 1000;
    const prefix = s.slice(0, m.index);
    const suffix = s.slice(m.index + m[0].length);
    let raf, start = null;
    const step = (ts) => {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = target * eased;
      let body = decimals ? cur.toFixed(decimals) : String(Math.round(cur));
      if (grouped) body = Number(body).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      setDisp(prefix + body + suffix);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  return <Fragment>{disp}</Fragment>;
}

/* ===== Sel — the app's dropdown ==========================================
   A native select hands its menu to the OS: it can't be styled, can't animate and
   gives no feedback beyond the click — which is why every "choose a value" moment in
   the app felt flat. This is a drop-in replacement (same value / onChange / <option>
   children API) that renders a panel we control: the trigger takes weight as you press
   it, the panel springs open, options cascade in and the highlight glides.
   The panel is fixed-positioned in a portal so the legs table and the modal's own
   scroll containers can never clip it. */
function Sel({ value, onChange, children, style, className, title, disabled }) {
  const opts = [];
  React.Children.forEach(children, (c) => {
    if (!c || !c.props) return;
    opts.push({ v: c.props.value != null ? c.props.value : '', label: c.props.children });
  });
  const [open, setOpen] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const [hi, setHi] = React.useState(-1);
  const [pos, setPos] = React.useState(null);
  const btnRef = React.useRef(null);
  const panelRef = React.useRef(null);

  const cur = opts.find(o => String(o.v) === String(value == null ? '' : value));
  const shown = cur ? cur.label : (value || (opts[0] ? opts[0].label : ''));

  const place = () => {
    const el = btnRef.current; if (!el || !el.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
    const need = Math.min(288, opts.length * 38 + 12);
    const up = r.bottom + need + 10 > vh && r.top > need + 10;   // flip up when there's no room below
    setPos({ left: r.left, width: r.width, top: up ? null : r.bottom + 6, bottom: up ? (vh - r.top + 6) : null, up });
  };
  const openedAt = React.useRef(0);
  const doOpen = () => {
    if (disabled) return;
    place();
    setHi(Math.max(0, opts.findIndex(o => String(o.v) === String(value == null ? '' : value))));
    openedAt.current = Date.now();
    setOpen(true);
  };
  const close = () => { setOpen(false); setPress(false); };
  const pick = (v) => { close(); if (onChange) onChange({ target: { value: v } }); };

  // Pointer/scroll live on the document; keys are handled on the focused trigger below, so
  // the two never race over the same keystroke.
  React.useEffect(() => {
    if (!open || typeof document === 'undefined' || !document.addEventListener) return;
    const onDown = (e) => {
      const b = btnRef.current, p = panelRef.current;
      if (b && b.contains && b.contains(e.target)) return;
      if (p && p.contains && p.contains(e.target)) return;
      close();
    };
    // A fixed panel would drift away from its trigger if the page scrolls underneath it.
    // The opening click can itself cause a scroll (the browser bringing the control into
    // view), so ignore scrolls that land in the same instant we opened.
    const onScroll = () => { if (Date.now() - openedAt.current < 300) return; close(); };
    document.addEventListener('mousedown', onDown, true);
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll);
    }
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onScroll);
      }
    };
  }, [open]);

  const onKeyDown = (e) => {
    if (!open) {
      // a focused control shouldn't fire the app's global shortcuts (the old <select> was exempt
      // by tag name; this div isn't) — but Escape still belongs to the modal above us.
      if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); doOpen(); }
      return;
    }
    // while open the dropdown owns the keyboard — Escape must dismiss it without also
    // closing the trade modal underneath.
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = opts.length; if (!n) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setHi(h => (h + d + n) % n);
      return;
    }
    if (e.key === 'Home') { e.preventDefault(); setHi(0); return; }
    if (e.key === 'End') { e.preventDefault(); setHi(opts.length - 1); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const o = opts[hi]; if (o) pick(o.v); }
  };

  const cls = ('rtm-sel ' + String(className || '').replace(/rtm-select/g, '')).trim();
  const trigger = (
    <div ref={btnRef} className={cls} title={title} role="combobox" aria-expanded={open} tabIndex={disabled ? -1 : 0}
      data-open={open ? '1' : '0'} data-press={press ? '1' : '0'}
      onMouseDown={() => setPress(true)} onMouseUp={() => setPress(false)} onMouseLeave={() => setPress(false)}
      onClick={() => (open ? close() : doOpen())}
      onKeyDown={onKeyDown}
      style={{ ...style, display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer', userSelect: 'none', position: 'relative', opacity: disabled ? .5 : 1 }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shown}</span>
      <svg className="rtm-selchev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#6747D8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><path d="M6 9l6 6 6-6" /></svg>
    </div>
  );
  if (!open || !pos) return trigger;
  const panel = (
    <div ref={panelRef} className="rtm-selpanel rtm-xscroll" data-up={pos.up ? '1' : '0'} role="listbox"
      style={{ position: 'fixed', left: pos.left, width: pos.width, ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }), maxHeight: 288, overflowY: 'auto', zIndex: 9000, borderRadius: 12, padding: '6px', background: 'rgba(18,18,22,.97)', border: '1px solid rgba(118,88,232,.28)', boxShadow: '0 26px 60px -18px rgba(0,0,0,.95), 0 0 0 1px rgba(49,35,73,.04)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
      {opts.map((o, i) => {
        const sel = String(o.v) === String(value == null ? '' : value);
        return (
          <div key={i} className="rtm-selopt" role="option" aria-selected={sel} data-hi={i === hi ? '1' : '0'}
            onMouseEnter={() => setHi(i)} onClick={() => pick(o.v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, color: sel ? '#7658E8' : '#3B3542', fontWeight: sel ? 600 : 400, animationDelay: Math.min(i, 10) * 18 + 'ms' }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
            {sel && <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#7658E8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><path d="M20 6L9 17l-5-5" /></svg>}
          </div>
        );
      })}
    </div>
  );
  return (<Fragment>{trigger}{ReactDOM.createPortal(panel, document.body)}</Fragment>);
}

/* ===== DateField — calendar we draw ourselves =============================
   A native date input hands its calendar to the browser/OS for the same reason a
   native <select> does, so it can't take weight or animate either. Same contract
   as before (value "YYYY-MM-DD", onChange({target:{value}})), our own panel. */
function DateField({ value, onChange, style, title, className }) {
  const [open, setOpen] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const [pos, setPos] = React.useState(null);
  const [view, setView] = React.useState(null);   // month being browsed
  const btnRef = React.useRef(null);
  const panelRef = React.useRef(null);

  const parse = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
  const cur = parse(value);
  const iso = (y, m, d) => y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const today = new Date();
  const vw = view || (cur ? { y: cur.y, m: cur.m } : { y: today.getFullYear(), m: today.getMonth() });

  const place = () => {
    const el = btnRef.current; if (!el || !el.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
    const need = 320;
    const up = r.bottom + need + 10 > vh && r.top > need + 10;
    setPos({ left: r.left, top: up ? null : r.bottom + 6, bottom: up ? (vh - r.top + 6) : null, up });
  };
  const openedAt = React.useRef(0);
  const doOpen = () => { place(); setView(cur ? { y: cur.y, m: cur.m } : { y: today.getFullYear(), m: today.getMonth() }); openedAt.current = Date.now(); setOpen(true); };
  const close = () => { setOpen(false); setPress(false); };
  const pick = (d) => { close(); if (onChange) onChange({ target: { value: iso(vw.y, vw.m, d) } }); };
  const shift = (n) => { const m = vw.m + n; setView({ y: vw.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }); };

  React.useEffect(() => {
    if (!open || typeof document === 'undefined' || !document.addEventListener) return;
    const onDown = (e) => {
      const b = btnRef.current, p = panelRef.current;
      if (b && b.contains && b.contains(e.target)) return;
      if (p && p.contains && p.contains(e.target)) return;
      close();
    };
    // ignore the scroll the opening click can itself trigger (see Sel)
    const onScroll = () => { if (Date.now() - openedAt.current < 300) return; close(); };
    document.addEventListener('mousedown', onDown, true);
    if (typeof window !== 'undefined' && window.addEventListener) { window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', onScroll); }
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      if (typeof window !== 'undefined' && window.removeEventListener) { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); }
    };
  }, [open]);

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); doOpen(); }
      return;
    }
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); close(); }
  };

  const label = cur ? (String(cur.d).padStart(2, '0') + ' ' + MON[cur.m].slice(0, 3) + ' ' + cur.y) : 'เลือกวันที่';
  const trigger = (
    <div ref={btnRef} className={('rtm-sel ' + (className || '')).trim()} title={title} role="button" tabIndex={0}
      data-open={open ? '1' : '0'} data-press={press ? '1' : '0'}
      onMouseDown={() => setPress(true)} onMouseUp={() => setPress(false)} onMouseLeave={() => setPress(false)}
      onClick={() => (open ? close() : doOpen())} onKeyDown={onKeyDown}
      style={{ ...style, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', color: cur ? (style && style.color) || '#24202B' : '#9A93A1' }}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#6747D8" strokeWidth="1.9" style={{ flex: 'none' }}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" strokeLinecap="round" /></svg>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
  if (!open || !pos) return trigger;

  const first = new Date(vw.y, vw.m, 1);
  const lead = (first.getDay() + 6) % 7;                       // Monday-first
  const days = new Date(vw.y, vw.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const isToday = (d) => today.getFullYear() === vw.y && today.getMonth() === vw.m && today.getDate() === d;
  const isSel = (d) => cur && cur.y === vw.y && cur.m === vw.m && cur.d === d;

  const panel = (
    <div ref={panelRef} className="rtm-selpanel" data-up={pos.up ? '1' : '0'}
      style={{ position: 'fixed', left: pos.left, ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }), width: 286, zIndex: 9000, borderRadius: 14, padding: 12, background: 'rgba(18,18,22,.97)', border: '1px solid rgba(118,88,232,.28)', boxShadow: '0 26px 60px -18px rgba(0,0,0,.95), 0 0 0 1px rgba(49,35,73,.04)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
      <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:10px')}>
        <span onClick={() => shift(-1)} className="rtm-press" style={css('width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid rgba(49,35,73,.12);color:#B9B9C0')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 18l-6-6 6-6" /></svg></span>
        <span style={css('font-family:\'Instrument Serif\',serif;font-size:15px;color:#24202B')}>{MON[vw.m]} {vw.y}</span>
        <span onClick={() => shift(1)} className="rtm-press" style={css('width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid rgba(49,35,73,.12);color:#B9B9C0')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 18l6-6-6-6" /></svg></span>
      </div>
      <div style={css('display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px')}>
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(w => (<div key={w} style={css('text-align:center;font-size:10px;color:#928B9B;padding:4px 0')}>{w}</div>))}
      </div>
      <div style={css('display:grid;grid-template-columns:repeat(7,1fr);gap:2px')}>
        {cells.map((d, i) => d == null
          ? <div key={'e' + i}></div>
          : (<div key={d} className="rtm-day" onClick={() => pick(d)}
              style={{ ...css('text-align:center;padding:7px 0;border-radius:8px;cursor:pointer;font-size:12.5px;font-family:JetBrains Mono'), ...(isSel(d) ? { background: 'linear-gradient(180deg,#7658E8,#6747D8)', color: '#FFFFFF', fontWeight: 700 } : { color: '#3B3542' }), ...(isToday(d) && !isSel(d) ? { boxShadow: 'inset 0 0 0 1px rgba(118,88,232,.55)' } : {}) }}>{d}</div>)
        )}
      </div>
      <div onClick={() => { const t = new Date(); close(); if (onChange) onChange({ target: { value: iso(t.getFullYear(), t.getMonth(), t.getDate()) } }); }}
        className="rtm-press" style={css('margin-top:10px;text-align:center;padding:8px;border-radius:9px;cursor:pointer;font-size:12px;color:#7658E8;border:1px solid rgba(118,88,232,.3);background:rgba(118,88,232,.08)')}>วันนี้ · Today</div>
    </div>
  );
  return (<Fragment>{trigger}{ReactDOM.createPortal(panel, document.body)}</Fragment>);
}

// กราฟ equity แบบ interactive — เอาเมาส์ชี้เพื่อดูค่าแต่ละจุด
function EquityCurve({ line, area, points, lastY, zeroY }) {
  const VB_W = 640, VB_H = 230;
  const wrapRef = React.useRef(null);
  const [hover, setHover] = React.useState(null); // index ของจุดที่ใกล้เมาส์
  const pts = Array.isArray(points) ? points : [];

  const onMove = (e) => {
    if (!wrapRef.current || !pts.length) return;
    const r = wrapRef.current.getBoundingClientRect();
    if (!r.width) return;
    const vx = ((e.clientX - r.left) / r.width) * VB_W; // พิกัดในระบบ viewBox
    let best = 0, bestD = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = Math.abs(pts[i].x - vx); if (d < bestD) { bestD = d; best = i; } }
    setHover(best);
  };
  const leave = () => setHover(null);

  const hp = hover != null ? pts[hover] : null;
  // ตำแหน่ง tooltip เป็น % เทียบกับกล่อง (preserveAspectRatio=none -> map ตรงตามสัดส่วน)
  const tipLeft = hp ? (hp.x / VB_W) * 100 : 0;
  const tipTop = hp ? (hp.y / VB_H) * 100 : 0;
  const flip = tipLeft > 62; // ถ้าใกล้ขอบขวาให้ tooltip เปิดไปทางซ้าย

  return (
    <div ref={wrapRef} onMouseMove={onMove} onMouseLeave={leave}
      style={css('position:relative;width:100%;height:210px')}>
      <svg viewBox="0 0 640 230" preserveAspectRatio="none" style={css('width:100%;height:210px;display:block;overflow:visible')}>
        <defs><linearGradient id="cv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7658E8" stopOpacity=".42"/><stop offset="55%" stopColor="#6747D8" stopOpacity=".12"/><stop offset="100%" stopColor="#6747D8" stopOpacity="0"/></linearGradient></defs>
        <line x1="0" y1="52" x2="640" y2="52" stroke="rgba(51,38,76,.07)"/><line x1="0" y1="112" x2="640" y2="112" stroke="rgba(51,38,76,.07)"/><line x1="0" y1="172" x2="640" y2="172" stroke="rgba(51,38,76,.07)"/>
        {zeroY != null && <Fragment><line x1="0" y1={zeroY} x2="640" y2={zeroY} stroke="rgba(51,38,76,.22)" strokeWidth="1" strokeDasharray="5 5"/><text x="6" y={zeroY - 5} fill="#746E7D" fontSize="10" fontFamily="'JetBrains Mono',monospace">breakeven</text></Fragment>}
        <path d={area} fill="url(#cv)"/>
        <path className="eq-line" d={line} fill="none" stroke="#7658E8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        {hp ? (
          <Fragment>
            <line x1={hp.x} y1="0" x2={hp.x} y2="230" stroke="rgba(118,88,232,.35)" strokeWidth="1" strokeDasharray="4 4"/>
            <circle className="rtm-hoverdot" cx={hp.x} cy={hp.y} r="6" fill="#FFFFFF" stroke="#7658E8" strokeWidth="2.5"/>
          </Fragment>
        ) : (
          <circle cx="640" cy={lastY} r="4.5" fill="#7658E8"><animate attributeName="opacity" values="1;.4;1" dur="2s" repeatCount="indefinite"/></circle>
        )}
      </svg>
      {hp && (
        <div style={{ ...css('position:absolute;pointer-events:none;z-index:5;background:rgba(255,255,255,.98);border:1px solid rgba(118,88,232,.25);border-radius:9px;padding:7px 11px;box-shadow:0 16px 40px -20px rgba(50,31,90,.38);white-space:nowrap'), left: tipLeft + '%', top: tipTop + '%', transform: 'translate(' + (flip ? '-108%' : '8%') + ',-118%)' }}>
          <div style={css('font-family:\'JetBrains Mono\',monospace;font-size:15px;font-weight:600;color:#7658E8')}>{hp.valueStr}</div>
          {hp.label ? <div style={css('font-size:10.5px;color:#746E7D;margin-top:2px')}>{hp.label}</div> : null}
        </div>
      )}
    </div>
  );
}

class App extends React.Component {
  state = {
    images: {},
    view: 'dashboard',
    // Legacy trades are treated as forward tests. Backtest results share the journal,
    // but never change real portfolio equity or the financial goal.
    journalMode: 'backtest',
    accountName: 'The Desk',
    affirmation: 'ฉันเทรดตามแผน ไม่เทรดตามอารมณ์ — I trade my plan, not my emotions.',
    affirmDetails: [
      { id: 'a1', text: 'รอ setup ที่ใช่ ความอดทนคือ edge' },
      { id: 'a2', text: 'ขาดทุนเล็ก กำไรใหญ่ — cut losses fast' },
      { id: 'a3', text: 'ความเสี่ยงต่อไม้ ≤ 1% เสมอ' },
      { id: 'a4', text: 'จดทุกไม้ ไม่โกหกตัวเอง' },
    ],
    editName: false,
    editAffirm: false,
    editDetailId: null,
    // checklist
    checkTab: 'weekly',
    weekKey: '2026-W26',
    monthKey: '2026-06',
    yearKey: '2026',
    weeklyItems: [
      { id: 'w1', text: 'รีวิวผลการเทรดสัปดาห์ที่แล้ว + จุดผิดพลาด' },
      { id: 'w2', text: 'อัปเดต watchlist และ bias รายสัปดาห์' },
      { id: 'w3', text: 'มาร์ก key levels บน Weekly / Daily' },
      { id: 'w4', text: 'เช็กข่าวเศรษฐกิจสำคัญของสัปดาห์' },
      { id: 'w5', text: 'ตั้งเป้าหมาย R และจำนวนไม้สูงสุด' },
    ],
    monthlyItems: [
      { id: 'm1', text: 'สรุปสถิติเดือน: win rate, PF, expectancy' },
      { id: 'm2', text: 'รีวิว setup ไหนทำกำไร/ขาดทุน' },
      { id: 'm3', text: 'ถอนกำไรตามแผน / ทบพอร์ต' },
      { id: 'm4', text: 'ปรับ position sizing ตาม equity ใหม่' },
      { id: 'm5', text: 'ตั้งเป้าหมายเดือนถัดไป' },
    ],
    yearlyItems: [
      { id: 'y1', text: 'สรุปผลงานทั้งปี: กำไร/ขาดทุนสุทธิ + growth %' },
      { id: 'y2', text: 'รีวิวระบบเทรด — setup ไหนเวิร์ค/ควรเลิก' },
      { id: 'y3', text: 'ทบทวนวินัย & จุดอ่อนทางจิตวิทยาตลอดปี' },
      { id: 'y4', text: 'วางแผนภาษี / ถอนกำไรประจำปี' },
      { id: 'y5', text: 'ตั้งเป้าหมายและแผนเติบโตของปีหน้า' },
    ],
    preItems: [
      { id: 'p1', text: 'เช็กข่าว high-impact ของวันนี้' },
      { id: 'p2', text: 'มาร์ก key levels บน H4 และ Daily' },
      { id: 'p3', text: 'ระบุ bias ของวัน + setup ที่จะรอ' },
      { id: 'p4', text: 'ตั้งความเสี่ยงต่อไม้ ≤ 1% ของพอร์ต' },
      { id: 'p5', text: 'เช็กสภาพจิตใจ — พร้อมและสงบไหม' },
      { id: 'p6', text: 'ไม่มีออเดอร์ค้างที่ขัดกับแผน' },
    ],
    editCheck: null,
    editPlan: null,
    dragId: null, // รายการเช็กลิสต์ที่กำลังลาก
    // รายการเช็กลิสต์แยกตามรอบ (สัปดาห์/เดือนนั้นๆ) — ถ้ารอบไหนยังไม่เคยปรับ จะใช้ template ด้านบนเป็นค่าเริ่มต้น
    periodItems: { weekly: {}, monthly: {}, yearly: {} },
    checks: {
      weekly: {
        '2026-W26': { w1: true, w2: true, w3: false, w4: false, w5: false },
        '2026-W25': { w1: true, w2: true, w3: true, w4: true, w5: true },
        '2026-W24': { w1: true, w2: true, w3: true, w4: false, w5: true },
        '2026-W23': { w1: true, w2: false, w3: true, w4: true, w5: true },
      },
      monthly: {
        '2026-06': { m1: true, m2: true, m3: false, m4: false, m5: false },
        '2026-05': { m1: true, m2: true, m3: true, m4: true, m5: true },
        '2026-04': { m1: true, m2: true, m3: true, m4: true, m5: false },
      },
      yearly: {
        '2026': { y1: false, y2: true, y3: false, y4: false, y5: true },
      },
      pre: { today: { p1: true, p2: true, p3: false, p4: false, p5: false, p6: false } },
    },
    // vision
    visionItems: [
      { id: 'v1', title: 'บ้านริมทะเล' },
      { id: 'v2', title: 'รถในฝัน' },
      { id: 'v3', title: 'อิสรภาพทางการเงิน' },
    ],
    editVisionId: null,
    goal: 1000000,
    editGoal: false,
    // tags / อารมณ์
    tags: ['ตามแผน', 'อดทนดี', 'FOMO', 'Revenge', 'รีบเข้า', 'ฝืนเทรนด์'],
    // Trade-analysis dropdown options — editable: type a new value in the modal and it's remembered here.
    tradeFieldOpts: {
      ltf: ['Bullish Trend', 'Bearish Trend', 'Bullish Shift with Correction', 'Bearish Shift with Correction', 'Bullish Shift just Broke Range', 'Bearish Shift just Broke Range', 'Bullish Shift without Correction', 'Bearish Shift without Correction', 'Ranging'],
      mtf: ['Bullish Trend', 'Bearish Trend', 'Bullish Shift with Correction', 'Bearish Shift with Correction', 'Bullish Shift just Broke Range', 'Bearish Shift just Broke Range', 'Bullish Shift without Correction', 'Bearish Shift without Correction', 'Ranging'],
      htf: ['Bullish Trend', 'Bearish Trend', 'Bullish Shift', 'Bearish Shift', 'Ranging'],
      fibo: ['Premium (0.5–0.79)', 'Discount (0.5–0.79)', 'OTE (0.62–0.79)', 'Equilibrium (0.5)', 'Below 0.79'],
      entryType: ['M5 Completed Stick', 'M15 Completed Stick', 'M5 Doji', 'M15 Doji'],
      slZone: [], // SL zone — add your own choices in "Edit options"
      // Feelings are picked from a list, not typed free-hand — otherwise every entry is its own
      // one-trade "group" and P&L-by-feeling can never say anything.
      feelEntry: ['ตามแผน · นิ่ง', 'มั่นใจ', 'ลังเล / ไม่แน่ใจ', 'รีบเข้า · FOMO', 'กดแบบไร้ใจ', 'แก้แค้น (revenge)'],
      feelSL: ['สบายๆ ตามแผน', 'แน่นเกินไป', 'กว้างเกินไป', 'เสียดาย · ลังเล', 'ขยับ SL (ผิดแผน)'],
      feelTP: ['ถือถึงเป้า', 'ออกเร็วเพราะกลัว', 'ปล่อยให้วิ่ง', 'ขายหมู', 'โลภ · คืนกำไร'],
      // Research context: separate the setup's statistical edge from execution mistakes
      // without making the quick-entry form longer.
      marketRegime: ['Trending · high volatility', 'Trending · low volatility', 'Range · high volatility', 'Range · low volatility', 'News / event-driven'],
      exitReason: ['Take profit', 'Stop loss', 'Breakeven', 'Trailing stop', 'Manual · plan invalidated', 'Manual · emotion / mistake'],
      ruleAdherence: ['On plan', 'Partial deviation', 'Rule break'],
      // ----- multi-leg "เบิ้ล" editable options -----
      // legTrigger = "จุดเข้า" ของแต่ละไม้ (ย้ายมาจาก Entry — M5/M15 เดิม) แก้ตัวเลือกเองได้
      legTrigger: ['M15 Completed Stick', 'M5 Completed Stick', 'M15 Doji', 'M5 Doji', 'Break confirm', 'Retest zone'],
      legSL: ['Dow / structure', 'รวมแท่ง (group candle)', 'ใต้แท่ง (under candle)', 'Fixed pips', 'Breakeven'],
    },
    // trade-log analysis filters + breakdown lens
    logF: { day: 'all', align: 'all', setup: 'all', session: 'all', marketRegime: 'all', exitReason: 'all', ruleAdherence: 'all', ltf: 'all', mtf: 'all', htf: 'all', retest: 'all', fibo: 'all', entryType: 'all', feelEntry: 'all', feelSL: 'all', feelTP: 'all' },
    logDim: 'day', // breakdown dimension: day | ltf | mtf | htf | retest | fibo | entryType | setup | session
    fieldCfg: null, // open the "manage analysis options" editor when truthy
    // setups
    setups: [
      { id: 's1', version: 1, name: 'Rally', glyph: 'R', accent: '#1C9B68', desc: 'เทรนด์ขาขึ้นต่อเนื่อง เข้าที่ pullback', pnl: 18420, wr: 67, trades: 42, avgR: 1.4, usage: 'ใช้เมื่อเทรนด์ HTF เป็นขาขึ้นชัดเจน (HH/HL)\n• รอราคา pullback มาที่โซน demand หรือ EMA20\n• เข้าเมื่อมีสัญญาณยืนยัน price action (bullish engulfing / pin bar)\n• SL ใต้ swing low ล่าสุด\n• TP ที่ R ≥ 2 หรือแนวต้านถัดไป' },
      { id: 's2', version: 1, name: 'Impulse', glyph: 'I', accent: '#4D7FE8', desc: 'โมเมนตัมแรงหลังข่าว/เบรก', pnl: 12100, wr: 61, trades: 31, avgR: 1.1, usage: 'ใช้จับโมเมนตัมแรงหลังเบรก structure สำคัญ\n• volume / range ต้องขยายชัดเจน\n• เข้าไม้เล็กก่อน เพิ่มเมื่อถูกทาง\n• ไม่ไล่ราคา — รอ retest จุดเบรก\n• SL ใต้แท่งเบรก · TP ตาม measured move' },
      { id: 's3', version: 1, name: 'Wyckoff', glyph: 'W', accent: '#8B6CF0', desc: 'สะสม/กระจาย แล้ว spring', pnl: 8940, wr: 58, trades: 24, avgR: 0.9, usage: 'ใช้กับโครงสร้าง accumulation / distribution\n• ระบุ phase ให้ชัดก่อน\n• รอ spring (กดต่ำกว่าฐาน) หรือ upthrust\n• ยืนยันด้วย sign of strength\n• เป้าหมายตาม count ของ trading range' },
      { id: 's4', version: 1, name: 'Reversal', glyph: 'V', accent: '#E25462', desc: 'กลับตัวที่แนวรับ-ต้านสำคัญ', pnl: -2180, wr: 40, trades: 20, avgR: -0.3, usage: 'ใช้เฉพาะแนวรับ-ต้านสำคัญเท่านั้น\n• ต้องมี divergence หรือสัญญาณ exhaustion\n• ความเสี่ยงครึ่งหนึ่งของไม้ปกติ\n• win rate ต่ำ — เลือกจุดให้ดีที่สุด\n• ออกเร็วถ้าไม่เป็นไปตามแผน' },
    ],
    // portfolios
    portfolios: [{ id: 'pf1', name: 'พอร์ตหลัก', startBalance: 100000 }],
    currentPortfolioId: 'all',
    newPortName: '',
    showPortMenu: false,
    showUserMenu: false,
    storage: null, storageLoading: false, // มาตรวัดพื้นที่รูปภาพ (โหลดตอนเปิดเมนู G)
    // live prices
    // trades
    trades: [],
    // ui
    logFilter: 'all',
    logSearch: '', logSort: 'date-desc',
    edgeMetric: 'r',   // 'r' = expectancy (avg R) · 'wr' = win rate — see _edgeRules()
    simulationRiskPct: 1,
    logPage: 0, // pagination จริง: จำกัด DOM ไว้ที่ 50 แถว แม้มีข้อมูลหลายพันไม้
    logToolsOpen: false, // ซ่อนเครื่องมือวิเคราะห์ขั้นสูงไว้ก่อน เพื่อลดความแน่นของหน้า Journal
    tradeAdvancedOpen: false, // quick entry first; context/review fields are one tap away
    calYear: new Date().getFullYear(), calMonth: new Date().getMonth(),
    eqRange: 'ALL',
    // เลื่อนดู period ย้อนหลัง/อนาคตใน checklist
    periodOffsetW: 0, periodOffsetM: 0, periodOffsetY: 0,
    // เตือนวางแผนล่วงหน้า (ก่อนขึ้นสัปดาห์/เดือนใหม่)
    planReminders: true,
    dismissedReminders: {},
    showPlan: false, planAuto: false, planScope: 'weekly', planKey: '', planLabel: '',
    showDay: false, dayDate: null,
    showTrade: false, draft: null, draftIsNew: false,
    showSetup: false, sDraft: null, setupIsNew: false,
    showReset: false,
    exporting: false,
    exportRange: 'all', // ช่วงข้อมูลที่จะส่งออก: all | week | month
    txnPort: null, // พอร์ตที่กำลังเปิดดูประวัติฝาก/ถอนเต็ม
    lastBackup: null, // เวลาที่สำรองข้อมูลครั้งล่าสุด
    lastBackupCount: 0, // จำนวนไม้ ณ ตอนสำรอง — ใช้บอกว่ามีของใหม่ที่ยังไม่ได้สำรองกี่ไม้
    backupSnooze: 0,    // เลื่อนเตือนถึงเวลานี้
  };

  // เก็บค่าเริ่มต้น (factory defaults) ไว้ก่อนโหลดข้อมูลคลาวด์ — ใช้ตอน Reset journal
  _pristine = (() => {
    const s = this.state;
    const clone = (x) => JSON.parse(JSON.stringify(x));
    return {
      accountName: s.accountName, affirmation: s.affirmation, affirmDetails: clone(s.affirmDetails),
      weeklyItems: clone(s.weeklyItems), monthlyItems: clone(s.monthlyItems), yearlyItems: clone(s.yearlyItems), preItems: clone(s.preItems),
      periodItems: { weekly: {}, monthly: {}, yearly: {} },
      checks: clone(s.checks), visionItems: clone(s.visionItems), setups: clone(s.setups),
      portfolios: clone(s.portfolios), currentPortfolioId: 'all',
      goal: s.goal, tags: clone(s.tags), tradeFieldOpts: clone(s.tradeFieldOpts), trades: [], images: {},
      journalMode: 'backtest',
      simulationRiskPct: s.simulationRiskPct,
      planReminders: s.planReminders, dismissedReminders: {},
      draft: null, draftIsNew: false, sDraft: null, setupIsNew: false, // ล้าง draft ที่ค้างด้วย
    };
  })();

  componentDidMount() {
    this._tick();
    this._clock = setInterval(() => this._tick(), 1000);
    this._loadFromCloud();
    this._onKey = (e) => {
      if (e.key === 'Escape') { this.setState({ showTrade: false, showSetup: false, showDay: false, showReset: false, showPlan: false, showPortMenu: false, showUserMenu: false, txnPort: null }); return; }
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
      if ((e.key === 'n' || e.key === 'N') && !this.state.showTrade && !this.state.showSetup && !this.state.showDay && !this.state.showReset) { e.preventDefault(); this.openNew(); }
    };
    this._onDocDown = () => { if (this.state.showPortMenu || this.state.showUserMenu) this.setState({ showPortMenu: false, showUserMenu: false }); };
    window.addEventListener('keydown', this._onKey);
    document.addEventListener('mousedown', this._onDocDown);
    this._scanReveal();
  }
  // คำนวณพื้นที่รูปที่ใช้ไป (เรียกตอนเปิดเมนูโลโก้ G)
  async _loadStorageUsage() {
    if (this.state.storageLoading) return;
    this.setState({ storageLoading: true });
    try { const u = await imageUsage(); this.setState({ storage: u, storageLoading: false }); }
    catch (e) { this.setState({ storageLoading: false }); }
  }
  // ค่ามาตรวัดพื้นที่สำหรับเมนูโลโก้ G (รูป = Storage 1 GB, ข้อมูล = Database 500 MB)
  _storageVals(st) {
    const IMG_LIMIT = 1024 * 1024 * 1024;   // 1 GB
    const DATA_LIMIT = 500 * 1024 * 1024;   // 500 MB
    const fmt = (b) => b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + ' MB' : (b >= 1024 ? (b / 1024).toFixed(0) + ' KB' : Math.round(b) + ' B');
    let dataBytes = 0;
    // คำนวณขนาดข้อมูลเฉพาะตอนเมนูเปิด (เลี่ยง stringify ทั้งก้อนทุกครั้งที่ render เมื่อ data ใหญ่)
    if (st.showUserMenu) {
      try { const s = JSON.stringify(this._blob()); dataBytes = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(s).length : s.length; } catch (e) { /* ignore */ }
    }
    const imgReady = !!st.storage;
    const imgBytes = imgReady ? st.storage.bytes : 0;
    const imgCount = imgReady ? st.storage.count : 0;
    const imgPct = Math.min(100, imgBytes / IMG_LIMIT * 100);
    const dataPct = Math.min(100, dataBytes / DATA_LIMIT * 100);
    const usedPct = Math.max(imgPct, dataPct);
    return {
      storageLoadingFlag: st.storageLoading, storageReady: imgReady,
      storageImgText: imgReady ? (fmt(imgBytes) + ' / 1 GB') : (st.storageLoading ? 'Calculating…' : 'Loading…'),
      storageImgWidth: imgPct.toFixed(2) + '%',
      storageImgColor: imgPct >= 90 ? '#E25462' : (imgPct >= 70 ? '#7658E8' : '#1C9B68'),
      storageDataText: fmt(dataBytes) + ' / 500 MB',
      storageDataWidth: dataPct.toFixed(2) + '%',
      storageNearFull: imgReady && usedPct >= 80, // ≥80% = ใกล้เต็ม เตือนสำรอง
      storagePctNum: Math.round(usedPct),
    };
  }
  async _loadFromCloud() {
    let data = null;
    try { data = await loadJournal(); } catch (e) { console.error(e); }
    if (data && Object.keys(data).length) {
      this._imgOk = true;   // we really read the journal, so state.images is the truth from here on
      this.setState({ ...data, images: data.images || {} }, () => { this._loaded = true; if (this._demoCleaned) this._persist(); this._checkPlanReminder(); });
    } else {
      this.setState({ trades: this._seedTrades() }, () => { this._loaded = true; this._persist(); this._checkPlanReminder(); });
    }
  }
  componentWillUnmount() { clearInterval(this._clock); clearTimeout(this._saveTimer); window.removeEventListener('keydown', this._onKey); document.removeEventListener('mousedown', this._onDocDown); clearTimeout(this._rvSafety); if (this._io) this._io.disconnect(); }
  // ----- scroll reveal -----
  // Cards animate in as they come into view, so a page has motion while you read it and not
  // only for half a second when it mounts. Each card is revealed once, then left alone.
  componentDidUpdate() { this._scanReveal(); }
  _scanReveal() {
    const root = this._scrollRoot;
    if (!root || typeof IntersectionObserver === 'undefined' || !root.querySelectorAll) return;
    if (!this._io) {
      this._io = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          en.target.classList.remove('rv-pre');
          en.target.classList.add('rv-in');
          this._io.unobserve(en.target);
        });
        // start the reveal a little before a card reaches the fold, so one peeking at the
        // bottom edge is already fading in rather than sitting there blank
      }, { root, rootMargin: '0px 0px 18% 0px', threshold: 0 });
    }
    const fresh = root.querySelectorAll('.liquid-glass:not([data-rv])');
    if (!fresh.length) return;
    // Only cards below the fold get hidden and revealed on scroll. Anything already on
    // screen is left alone — hiding it would flash, and if the observer ever failed to
    // fire the user would be staring at a blank card.
    const edge = root.getBoundingClientRect ? root.getBoundingClientRect().bottom : 0;
    fresh.forEach(el => {
      el.setAttribute('data-rv', '1');
      const top = el.getBoundingClientRect ? el.getBoundingClientRect().top : 0;
      if (top <= edge) return;                    // visible now: keep its own entrance animation
      el.classList.add('rv-pre');
      this._io.observe(el);
    });
  }

  _now() {
    try { return new Date().toLocaleTimeString('en-GB', { hour12: false }); }
    catch (e) { return new Date().toTimeString().slice(0, 8); }
  }
  _tzAbbr() {
    try {
      const s = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).format(new Date());
      const m = s.match(/[A-Z]{2,5}[+-]?\d*$/);
      let z = m ? m[0] : '';
      if (!z || /^\d/.test(z)) { const off = -new Date().getTimezoneOffset() / 60; z = 'UTC' + (off >= 0 ? '+' : '') + off; }
      return z;
    } catch (e) { return ''; }
  }
  _tick() { const el = document.querySelector('#rtm-clock'); if (el) el.textContent = this._now(); }
  // วันที่วันนี้แบบไทยย่อ เช่น "ศ. 26 มิ.ย."
  _todayLabel() {
    try {
      const d = new Date();
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return days[d.getDay()] + ' ' + d.getDate() + ' ' + mons[d.getMonth()];
    } catch (e) { return ''; }
  }
  // สถานะ session ของแต่ละตลาด (คำนวณจากเวลาจริง รองรับ DST ผ่าน timeZone)
  _blob() {
    const s = this.state;
    return {
      accountName: s.accountName, affirmation: s.affirmation, affirmDetails: s.affirmDetails,
      weeklyItems: s.weeklyItems, monthlyItems: s.monthlyItems, yearlyItems: s.yearlyItems, preItems: s.preItems,
      periodItems: s.periodItems,
      checks: s.checks, visionItems: s.visionItems, setups: s.setups, trades: s.trades,
      images: s.images, portfolios: s.portfolios, currentPortfolioId: s.currentPortfolioId,
      goal: s.goal, tags: s.tags, tradeFieldOpts: s.tradeFieldOpts,
      planReminders: s.planReminders, dismissedReminders: s.dismissedReminders,
      lastBackup: s.lastBackup, lastBackupCount: s.lastBackupCount, backupSnooze: s.backupSnooze,
      // how you like to READ the analysis is a preference, not a transient filter — remember it.
      // (Search, quick filters and sort stay transient on purpose: a stale filter on reload
      // would silently hide trades.)
      edgeMetric: s.edgeMetric, logDim: s.logDim, feelMoment: s.feelMoment, journalMode: s.journalMode,
      simulationRiskPct: s.simulationRiskPct,
      // draft ที่ยังพิมค้าง (ออโต้เซฟ กันข้อมูลหายเวลาเผลอปิด/รีเฟรช)
      draft: s.draft, draftIsNew: s.draftIsNew, sDraft: s.sDraft, setupIsNew: s.setupIsNew,
    };
  }
  _persist() {
    if (!this._loaded) return;
    clearTimeout(this._saveTimer);
    // imagesKnown says whether state.images is the truth or just an empty default: without a
    // journal actually read back, an empty map means "not loaded", never "delete my charts".
    this._saveTimer = setTimeout(() => { saveJournal(this._blob(), { imagesKnown: !!this._imgOk }); }, 500);
  }
  _save() { this._persist(); }
  setImage(slotId, path) {
    const images = { ...this.state.images, [slotId]: path };
    this.setState({ images }); this._save();
  }
  // ลบ reference รูปที่ key ตรงเงื่อนไข + คืน {images, paths} สำหรับลบใน Storage
  _purgedImages(predicate) {
    const imgs = this.state.images || {};
    const keys = Object.keys(imgs).filter(predicate);
    const paths = keys.map(k => imgs[k]).filter(Boolean);
    const next = { ...imgs };
    keys.forEach(k => delete next[k]);
    return { images: next, paths };
  }
  // เก็บเฉพาะรูปที่ยังมีเจ้าของอยู่จริง (ใช้ตอน restore ไฟล์สำรองแบบไม่มีรูป)
  // Keys look like trade-<id>-…, setup-<id>-…, vision-<id>; anything else is left alone.
  _pruneImages(imgs, data) {
    const alive = {
      trade: new Set((data.trades || []).map(t => String(t.id))),
      setup: new Set((data.setups || []).map(s => String(s.id))),
      vision: new Set((data.visionItems || []).map(v => String(v.id))),
    };
    const out = {};
    Object.keys(imgs || {}).forEach(k => {
      const m = k.match(/^(trade|setup|vision)-([^-]+)/);
      if (m && !alive[m[1]].has(m[2])) return;      // owner is gone with the restore
      out[k] = imgs[k];
    });
    return out;
  }

  // ===== portfolios =====
  selectPortfolio(id) { this.setState({ currentPortfolioId: id, showPortMenu: false }); }
  openAccount() { this.setState({ showPortMenu: false, showUserMenu: false, view: 'account' }); }
  // ===== reset journal =====
  openReset() { this.setState({ showReset: true, showUserMenu: false }); }
  closeReset() { this.setState({ showReset: false }); }
  resetJournal() {
    const paths = Object.values(this.state.images || {}).filter(Boolean);
    const d = JSON.parse(JSON.stringify(this._pristine));
    this._imgOk = true;
    this.setState({ ...d, showReset: false, showUserMenu: false, view: 'dashboard' }, () => { this._loaded = true; this._persist(); });
    // the reset dialog promises the images go too — say so explicitly, because an empty
    // journal is exactly the shape the storage layer refuses to treat as "delete everything"
    deleteImages(paths); wipeImages();
  }
  // ===== สำรอง / กู้คืน / เก็บถาวร =====
  // ดาวน์โหลดข้อมูลทั้งหมดเป็นไฟล์ .json (กู้คืนได้ทีหลัง) — กันข้อมูลหายก่อนล้างพื้นที่
  // withImages=false writes the numbers only. That file is a few hundred KB instead of tens of
  // megabytes, which is what makes a weekly habit realistic; take the full one occasionally.
  backupJournal(withImages = true) {
    try {
      const data = this._blob();
      if (!withImages) data.images = {};
      const payload = { app: 'road-to-million', v: 1, ts: new Date().toISOString(), images: !!withImages, data };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'rtm-backup-' + new Date().toISOString().slice(0, 10) + (withImages ? '' : '-data') + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      // remember the trade count too, so the reminder can tell "new work" from "just time passing"
      this.setState({ lastBackup: Date.now(), lastBackupCount: (this.state.trades || []).length, backupSnooze: 0 }, () => this._save());
    } catch (e) { window.alert('Backup failed: ' + (e && e.message ? e.message : e)); }
  }
  // A journal is only as safe as its last copy — and in the offline build this browser holds the
  // only one. Nag only when there is something to lose: unbacked-up trades, not merely elapsed time.
  _backupWarn() {
    const st = this.state;
    const trades = st.trades || [];
    if (!trades.length) return null;
    if (st.backupSnooze && Date.now() < st.backupSnooze) return null;
    const since = trades.length - (st.lastBackupCount || 0);
    if (!st.lastBackup) {
      return trades.length >= 10
        ? { level: 'high', n: trades.length, msg: 'ยังไม่เคยสำรองข้อมูลเลย — ' + trades.length + ' ไม้นี้มีอยู่ที่เดียวในเบราว์เซอร์นี้ ถ้าล้างข้อมูลเว็บคือหายถาวร' }
        : null;
    }
    if (since <= 0) return null;
    const days = Math.floor((Date.now() - st.lastBackup) / 86400000);
    if (since >= 20 || days >= 7) {
      return { level: since >= 40 || days >= 21 ? 'high' : 'warn', n: since,
        msg: 'มี ' + since + ' ไม้ที่ยังไม่ได้สำรอง' + (days >= 1 ? ' · สำรองครั้งล่าสุด ' + days + ' วันที่แล้ว' : '') };
    }
    return null;
  }
  async restoreJournal(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = (parsed && parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
      if (!data || typeof data !== 'object' || !Array.isArray(data.trades)) throw new Error('Invalid backup file');
      if (!window.confirm('Restore from this file? All current data will be replaced.')) return;
      // A numbers-only backup deliberately carries no screenshots. Keep the ones this browser
      // already holds — they belong to the same trade ids — instead of blanking them, which
      // would leave them orphaned in storage and destroy them on the next image you save.
      const fromFile = (data.images && typeof data.images === 'object') ? data.images : {};
      const images = (parsed && parsed.images === true) || Object.keys(fromFile).length
        ? fromFile
        : this._pruneImages(this.state.images, data);
      this._imgOk = true;   // an explicit replacement of everything — images included
      this.setState({ ...data, images, showUserMenu: false }, () => { this._loaded = true; this._persist(); });
      window.alert('Restore complete');
    } catch (e) { window.alert('Restore failed: ' + (e && e.message ? e.message : e)); }
  }
  // เก็บถาวรออเดอร์ที่ปิดแล้วและเก่ากว่า N เดือน: รวม P&L เข้า baseline ของพอร์ต (milestone/Growth เดินต่อ) + ลบรายละเอียด+รูป เพื่อคืนพื้นที่
  archiveOldTrades(months) {
    const now = new Date(); const dt = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
    const cutoff = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    const firstPf = this.state.portfolios[0] ? this.state.portfolios[0].id : 'pf1';
    const keep = [], arch = [];
    this.state.trades.forEach(t => { if (this._testMode(t) === 'forward' && t.status !== 'OPEN' && String(t.date) < cutoff) arch.push(t); else keep.push(t); });
    if (!arch.length) { window.alert('No closed trades older than ' + months + ' months'); return; }
    if (!window.confirm('Archive ' + arch.length + ' trades (before ' + cutoff + ')?\n• Their P&L is folded into the baseline so the milestone and Growth curve stay continuous\n• Trade details and images are removed to free space (cannot be undone)\n\nTip: press “Backup” first.')) return;
    const portfolios = this.state.portfolios.map(p => {
      const mine = arch.filter(t => this._testMode(t) === 'forward' && (t.portfolioId === p.id || (!t.portfolioId && p.id === firstPf)));
      if (!mine.length) return p;
      const addPnl = mine.reduce((a, t) => a + this._netPnl(t), 0);
      return { ...p, archivedPnl: (Number(p.archivedPnl) || 0) + addPnl, archivedCount: (Number(p.archivedCount) || 0) + mine.length, archivedUntil: cutoff };
    });
    const images = { ...this.state.images }; const paths = [];
    arch.forEach(t => Object.keys(images).filter(k => k.startsWith('trade-' + t.id + '-')).forEach(k => { if (images[k]) paths.push(images[k]); delete images[k]; }));
    this.setState({ trades: keep, portfolios, images }); this._save(); deleteImages(paths);
    window.alert('Archived ' + arch.length + ' trades — freed ' + paths.length + ' image files (milestone/Growth stay continuous)');
  }
  setNewPortName(v) { this.setState({ newPortName: v }); }
  addPortfolioNamed() {
    const name = (this.state.newPortName || '').trim();
    if (!name) return;
    const pf = { id: 'pf' + Date.now(), name };
    const portfolios = this.state.portfolios.concat([pf]);
    this.setState({ portfolios, newPortName: '', currentPortfolioId: pf.id }); this._save();
  }
  renamePortfolio(id, name) {
    const clean = String(name || '').trim();
    const portfolios = this.state.portfolios.map(p => p.id === id ? { ...p, name: clean || p.name } : p); // ว่าง = คงชื่อเดิม
    this.setState({ portfolios }); this._save();
  }
  delPortfolio(id, e) {
    if (e) e.stopPropagation();
    if (this.state.portfolios.length <= 1) { window.alert('You need at least 1 portfolio'); return; }
    if (!window.confirm('Delete this portfolio? (Its trades stay but will no longer be grouped.)')) return;
    const portfolios = this.state.portfolios.filter(p => p.id !== id);
    const cur = this.state.currentPortfolioId === id ? 'all' : this.state.currentPortfolioId;
    this.setState({ portfolios, currentPortfolioId: cur }); this._save();
  }
  _portfolioName(id) { const p = this.state.portfolios.find(x => x.id === id); return p ? p.name : '—'; }

  // ===== Word export =====
  // predicate กรองเทรดตามช่วงที่เลือกส่งออก (ทั้งหมด / สัปดาห์นี้ / เดือนนี้) อิงวันที่จริง
  _exportRangePredicate(range) {
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    if (range === 'week') {
      const now = new Date();
      const dow = (now.getDay() + 6) % 7; // จันทร์ = 0
      const mon = new Date(now); mon.setDate(now.getDate() - dow);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const s = iso(mon), e = iso(sun);
      return (date) => date >= s && date <= e;
    }
    if (range === 'month') {
      const now = new Date();
      const ym = now.getFullYear() + '-' + pad(now.getMonth() + 1);
      return (date) => String(date || '').slice(0, 7) === ym;
    }
    return () => true;
  }
  async exportWord() {
    const cp = this.state.currentPortfolioId;
    const imgs = this.state.images || {};
    const inRange = this._exportRangePredicate(this.state.exportRange);
    const rows = this.state.trades
      .filter(t => this._testMode(t) === (this.state.journalMode === 'backtest' ? 'backtest' : 'forward'))
      .filter(t => cp === 'all' || t.portfolioId === cp || (!t.portfolioId && cp === (this.state.portfolios[0] && this.state.portfolios[0].id)))
      .filter(t => inRange(t.date))
      .map(t0 => {
        // net the pnl once so R / capture / pig all read the true realized figure (gross stays for the Gross P&L cell)
        // net once, and always — so a non-finite or non-numeric pnl can't reach the document
        const t = { ...t0, pnl: this._netPnl(t0) };
        const urls = [];
        for (let n = 0; n < (t.imgCount || 2); n++) { const p = imgs['trade-' + t.id + '-img-' + n]; if (p) urls.push(getImageUrl(p)); }
        // per-timeframe card images (new capture) — so every attached chart makes it into Word
        const tfImages = {};
        ['htf', 'mtf', 'ltf'].forEach(tf => { const p = imgs['trade-' + t.id + '-tf-' + tf]; if (p) tfImages[tf] = getImageUrl(p); });
        const closed = t.status !== 'OPEN';
        const heatR = this._maeR(t), cap = this._captureP(t);
        return {
          date: t.date, weekday: this._dowFull(t.date), sym: t.sym || '—', side: t.side, setupName: this._setupById(t.setupId).name,
          session: t.session, lot: (t.lot != null && t.lot !== '') ? String(t.lot) : '', portfolioName: this._portfolioName(t.portfolioId),
          pnlNum: closed ? this._n(t0.pnl) : 0, commission: this._n(t0.commission), netPnl: closed ? this._n(t.pnl) : 0,
          rr: this._rMult(t), status: t.status, notes: t.notes || '', images: urls,
          entry: t.entry, stop: t.stop, target: t.target, riskUsd: this._n(t.risk),
          hold: this._fmtDur(t.entryTime, t.exitTime), entryTime: t.entryTime, exitTime: t.exitTime,
          ltf: t.ltf, mtf: t.mtf, htf: t.htf, retest: this._legRetest(t), fibo: this._legFibo(t), entryType: this._entryModel(t), slZone: t.slZone,
          entryKind: t.entryKind, tfMeta: t.tfMeta || {}, tfImages,
          feelEntry: t.feelEntry, feelSL: t.feelSL, feelTP: t.feelTP,
          mae: this._maeUsd(t), mfe: this._mfeUsd(t),
          heatStr: heatR != null ? heatR.toFixed(1) + 'R' : (this._maeUsd(t) > 0 ? '$' + Math.round(this._maeUsd(t)) : ''),
          captureStr: cap != null && (t.pnl || 0) > 0 ? cap + '%' : '',
          pigUsd: this._pigUsd(t), alignN: this._alignN(t),
          alignStr: [t.alignHTF && 'HTF', t.alignMTF && 'MTF', t.alignLTF && 'LTF'].filter(Boolean).join(' · '),
          tags: Array.isArray(t.tags) ? t.tags : [],
          legs: this._legs(t).map((l, idx) => { const cum = this._legs(t).slice(0, idx + 1).reduce((s, x) => s + (Math.abs(Number(x.lot) || 0)), 0); return { trigger: l.trigger || '', price: l.price || '', lot: l.lot || '', cum: cum.toFixed(2), slBasis: l.slBasis || '', risk: l.risk || '', retest: l.retest || '', fibo: l.fibo || '', dd: l.dd || '' }; }),
          ...(() => { const ls = this._legStats(t); return { legMaxLot: ls.maxLot ? ls.maxLot.toFixed(2) : '', legAvgEntry: ls.avgEntry != null ? this._fmtPrice(ls.avgEntry) : '', legMaxDD: ls.maxDD || 0, legMulti: ls.isMulti }; })(),
        };
      });
    if (!rows.length) { window.alert('No trades in the selected range'); return; }
    this.setState({ exporting: true });
    try {
      // Word generation is a large dependency; load it only when requested so the journal
      // stays fast for the everyday backtest / review flow.
      const { exportWeeklyWord } = await import('./wordExport.js');
      await exportWeeklyWord(rows, this.state.accountName);
    }
    catch (e) { window.alert('Word export failed: ' + (e && e.message ? e.message : e)); }
    finally { this.setState({ exporting: false }); }
  }
  exportCSV() {
    const cp = this.state.currentPortfolioId;
    const firstPf = this.state.portfolios[0] && this.state.portfolios[0].id;
    const inRange = this._exportRangePredicate(this.state.exportRange);
    const rows = this.state.trades
      .filter(t => this._testMode(t) === (this.state.journalMode === 'backtest' ? 'backtest' : 'forward'))
      .filter(t => cp === 'all' || t.portfolioId === cp || (!t.portfolioId && cp === firstPf))
      .filter(t => inRange(t.date));
    if (!rows.length) { window.alert('No trades in the selected range'); return; }
    const headers = ['test_mode', 'date', 'day', 'symbol', 'side', 'setup', 'setup_version', 'session', 'market_regime', 'exit_reason', 'rule_adherence', 'lot', 'entry', 'stop', 'target', 'rr', 'risk_usd', 'realized_r', 'gross_pnl', 'commission', 'net_pnl', 'ltf', 'mtf', 'htf', 'retest', 'fibo_m15', 'entry_model', 'sl_zone', 'portfolio', 'tags', 'notes'];
    const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [headers.join(',')];
    rows.forEach(t => {
      const closed = t.status !== 'OPEN';
      // numeric columns go out sanitized, so a spreadsheet never opens on "NaN"/"not-a-number"
      lines.push([this._testMode(t), t.date, this._dowFull(t.date), t.sym, t.side, this._setupById(t.setupId).name, this._tradeSetupVersion(t), t.session, t.marketRegime, t.exitReason, t.ruleAdherence, this._n(t.lot), t.entry, t.stop, t.target, this._n(t.rr), (t.risk != null ? this._n(t.risk) : ''), (closed ? this._rMult({ ...t, pnl: this._netPnl(t) }).toFixed(2) : ''), (closed ? this._n(t.pnl) : ''), (t.commission != null ? commissionCost(t.commission) : ''), (closed ? this._netPnl(t) : ''), t.ltf, t.mtf, t.htf, (this._legRetest(t) === 'yes' ? 'Yes' : (this._legRetest(t) === 'no' ? 'No' : '')), this._legFibo(t), this._entryModel(t), t.slZone, this._portfolioName(t.portfolioId), (t.tags || []).join('|'), t.notes].map(esc).join(','));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (this.state.journalMode === 'backtest' ? 'backtest' : 'forward-test') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // CSV import for large backtest datasets. The parser handles quoted commas/newlines and
  // maps common broker / spreadsheet header names. Imports always enter the phase currently
  // open in the UI, preventing a CSV column from silently contaminating real portfolio data.
  _parseCSV(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    const src = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i <= src.length; i++) {
      const ch = i < src.length ? src[i] : '\n';
      if (quoted) {
        if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n') { row.push(cell.trim()); if (row.some(v => v !== '')) rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    return rows;
  }
  async importCSV(file) {
    if (!file) return;
    try {
      const rows = this._parseCSV(await file.text());
      if (rows.length < 2) throw new Error('CSV ไม่มีแถวข้อมูล');
      const key = (v) => String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const headers = rows[0].map(key);
      const get = (o, ...names) => { for (const n of names) { const v = o[key(n)]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return ''; };
      const num = (v) => { const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };
      const isoDate = (v) => {
        const s = String(v || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const d = new Date(s); if (Number.isNaN(d.getTime())) return '';
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      };
      const mode = this.state.journalMode === 'backtest' ? 'backtest' : 'forward';
      const accents = ['#1C9B68', '#4D7FE8', '#8B6CF0', '#E0A15A', '#E25462', '#5FD0C8'];
      let setups = this.state.setups.slice();
      const setupFor = (name, rawId) => {
        if (rawId && setups.some(s => s.id === rawId)) return rawId;
        const clean = String(name || '').trim();
        if (!clean) return setups[0] ? setups[0].id : '';
        let found = setups.find(s => String(s.name || '').toLowerCase() === clean.toLowerCase());
        if (!found) {
          found = { id: 's' + Date.now() + '-' + setups.length, name: clean, glyph: clean.charAt(0).toUpperCase() || '★', accent: accents[setups.length % accents.length], desc: 'Imported from CSV', usage: '', imgCount: 1 };
          setups.push(found);
        }
        return found.id;
      };
      const existing = new Set(this.state.trades.map(t => [this._testMode(t), t.date, String(t.sym || '').toUpperCase(), t.entryTime || '', t.setupId || '', this._n(t.pnl)].join('|')));
      const imported = []; let skipped = 0;
      rows.slice(1).forEach((cells, i) => {
        const o = {}; headers.forEach((h, j) => { o[h] = cells[j] == null ? '' : cells[j]; });
        const date = isoDate(get(o, 'date', 'trade_date', 'entry_date'));
        const sym = get(o, 'symbol', 'sym', 'ticker', 'instrument').toUpperCase();
        if (!date || !sym) { skipped++; return; }
        const setupId = setupFor(get(o, 'setup', 'setup_name', 'strategy'), get(o, 'setup_id'));
        const risk = num(get(o, 'risk_usd', 'risk', 'initial_risk'));
        const realizedR = num(get(o, 'realized_r', 'r_multiple', 'r'));
        const netCell = get(o, 'net_pnl', 'net_profit');
        const grossCell = get(o, 'gross_pnl', 'pnl', 'profit', 'profit_loss');
        const commission = commissionCost(num(get(o, 'commission', 'fees', 'fee', 'swap')) || 0);
        const netValue = num(netCell);
        const grossValue = num(grossCell);
        // Store gross once and let the shared calculation engine subtract fees once.
        let pnl = grossValue != null ? grossValue : (netValue != null ? netValue + commission : null);
        if (pnl == null && realizedR != null && risk != null) pnl = realizedR * risk + commission;
        if (pnl == null) pnl = 0;
        const rawSide = get(o, 'side', 'direction', 'type').toUpperCase();
        const side = /SELL|SHORT/.test(rawSide) ? 'SELL' : 'BUY';
        const rawStatus = get(o, 'status').toUpperCase();
        const status = rawStatus === 'OPEN' ? 'OPEN' : 'CLOSED';
        const entryRaw = get(o, 'entry_time', 'opened_at', 'open_time');
        const exitRaw = get(o, 'exit_time', 'closed_at', 'close_time');
        const entryTime = entryRaw ? (entryRaw.includes('T') || entryRaw.includes(' ') ? entryRaw.replace(' ', 'T').slice(0, 16) : date + 'T' + entryRaw.slice(0, 5)) : date + 'T09:00';
        const exitTime = exitRaw ? (exitRaw.includes('T') || exitRaw.includes(' ') ? exitRaw.replace(' ', 'T').slice(0, 16) : date + 'T' + exitRaw.slice(0, 5)) : '';
        const t = {
          id: 't' + Date.now() + '-' + i, testMode: mode, date, sym, side, setupId, setupVersion: this._setupVersion(setups.find(s => s.id === setupId)),
          session: get(o, 'session') || 'London', entry: get(o, 'entry', 'entry_price'), stop: get(o, 'stop', 'stop_loss', 'sl'), target: get(o, 'target', 'take_profit', 'tp'),
          rr: realizedR != null ? realizedR : (num(get(o, 'rr', 'planned_rr')) || 0), pnl: status === 'OPEN' ? 0 : pnl, commission, risk: risk == null ? '' : risk,
          lot: get(o, 'lot', 'lots', 'size', 'quantity'), entryTime, exitTime, status, notes: get(o, 'notes', 'note', 'comment'),
          tags: get(o, 'tags').split('|').map(x => x.trim()).filter(Boolean), imgCount: 2,
          portfolioId: mode === 'forward' ? (get(o, 'portfolio_id') || (this.state.currentPortfolioId !== 'all' ? this.state.currentPortfolioId : (this.state.portfolios[0] && this.state.portfolios[0].id))) : '',
          ltf: get(o, 'ltf'), mtf: get(o, 'mtf'), htf: get(o, 'htf'), retest: get(o, 'retest').toLowerCase(), fibo: get(o, 'fibo_m15', 'fibo'), entryType: get(o, 'entry_model', 'entry_type'), slZone: get(o, 'sl_zone'),
          marketRegime: get(o, 'market_regime', 'regime'), exitReason: get(o, 'exit_reason'), ruleAdherence: get(o, 'rule_adherence', 'on_plan'),
          feelEntry: get(o, 'feel_entry', 'emotion'), feelSL: get(o, 'feel_sl'), feelTP: get(o, 'feel_tp'),
          mae: get(o, 'mae'), mfe: get(o, 'mfe'), legs: [], tfMeta: {}, alignHTF: false, alignMTF: false, alignLTF: false,
        };
        const fp = [mode, t.date, t.sym, t.entryTime, t.setupId, this._n(t.pnl)].join('|');
        if (existing.has(fp)) { skipped++; return; }
        existing.add(fp); imported.push(t);
      });
      if (!imported.length) { window.alert('ไม่พบรายการใหม่สำหรับนำเข้า' + (skipped ? ' · ข้าม ' + skipped + ' แถว' : '')); return; }
      const trades = imported.concat(this.state.trades).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      this.setState({ trades, setups, logPage: 0 }, () => this._save());
      window.alert('นำเข้า ' + imported.length.toLocaleString() + ' ไม้เข้า ' + (mode === 'backtest' ? 'Backtest' : 'Forward Test') + ' สำเร็จ' + (skipped ? ' · ข้าม ' + skipped.toLocaleString() + ' แถวที่ข้อมูลไม่ครบ/ซ้ำ' : ''));
    } catch (e) { window.alert('Import CSV ไม่สำเร็จ: ' + (e && e.message ? e.message : e)); }
  }

  _seedTrades() {
    const T = (id, date, sym, side, setupId, session, entry, stop, target, rr, pnl, et, xt, notes, status) =>
      ({ id, date, sym, side, setupId, session, entry, stop, target, rr, pnl, lot: '1.0', entryTime: et, exitTime: xt, notes, status, imgCount: 2, portfolioId: 'pf1', feelEntry: pnl > 0 ? 'มั่นใจ · ตามแผน' : (pnl < 0 ? 'รีบเข้า / FOMO' : '') });
    return [
      T('t1', '2026-06-22', 'XAUUSD', 'BUY', 's1', 'London', '2418.5', '2410.0', '2440.0', 2.1, 1240, '2026-06-22T13:30', '2026-06-22T16:45', 'เทรนด์ขาขึ้นชัด เข้าที่ pullback EMA20 ตรงแผน', 'CLOSED'),
      T('t2', '2026-06-22', 'XAUUSD', 'BUY', 's1', 'New York', '2435.0', '2428.0', '2455.0', 2.5, 0, '2026-06-22T19:10', '', 'ไม้ที่สองของวัน รอ target', 'OPEN'),
      T('t3', '2026-06-19', 'GBPJPY', 'SELL', 's2', 'Tokyo', '198.80', '199.40', '197.20', 3.0, 2100, '2026-06-19T07:20', '2026-06-19T10:05', 'โมเมนตัมลงแรงหลังเบรก ทำตามแผนเป๊ะ', 'CLOSED'),
      T('t4', '2026-06-19', 'US30', 'BUY', 's4', 'New York', '42180', '42040', '42460', 2.0, -680, '2026-06-19T20:30', '2026-06-19T21:15', 'รีบเข้าเกินไป ไม่รอ confirmation', 'CLOSED'),
      T('t5', '2026-06-18', 'XAUUSD', 'BUY', 's3', 'London', '2402.0', '2395.0', '2420.0', 1.8, 880, '2026-06-18T14:00', '2026-06-18T18:30', 'Wyckoff spring สวย เข้าได้จังหวะ', 'CLOSED'),
      T('t6', '2026-06-17', 'EURUSD', 'BUY', 's1', 'London', '1.0820', '1.0800', '1.0870', 1.4, 540, '2026-06-17T13:00', '2026-06-17T15:40', 'pullback มาตรงโซน เข้าตามเทรนด์', 'CLOSED'),
      T('t7', '2026-06-16', 'XAUUSD', 'BUY', 's1', 'London', '2388.0', '2380.0', '2412.0', 2.9, 1480, '2026-06-16T13:15', '2026-06-16T17:50', 'ไม้ใหญ่ของสัปดาห์ ถือได้จนถึง target', 'CLOSED'),
      T('t8', '2026-06-12', 'GBPUSD', 'BUY', 's2', 'London', '1.2740', '1.2720', '1.2790', 2.4, 1120, '2026-06-12T13:40', '2026-06-12T16:20', 'เบรก range แล้ว retest เข้าได้สวย', 'CLOSED'),
      T('t9', '2026-06-11', 'USDJPY', 'BUY', 's3', 'Tokyo', '157.20', '156.80', '158.00', 1.6, -640, '2026-06-11T08:00', '2026-06-11T11:30', 'อ่าน phase ผิด โดน upthrust', 'CLOSED'),
      T('t10', '2026-06-10', 'XAUUSD', 'SELL', 's4', 'New York', '2375.0', '2382.0', '2358.0', 1.9, 760, '2026-06-10T19:30', '2026-06-10T22:10', 'reversal ที่แนวต้าน มี divergence ชัด', 'CLOSED'),
      T('t11', '2026-06-09', 'NAS100', 'SELL', 's2', 'New York', '19840', '19920', '19680', 1.0, -420, '2026-06-09T20:00', '2026-06-09T20:55', 'โมเมนตัมไม่จริง false break', 'CLOSED'),
      T('t12', '2026-06-05', 'EURUSD', 'SELL', 's2', 'New York', '1.0880', '1.0905', '1.0820', 1.9, 920, '2026-06-05T18:30', '2026-06-05T21:00', 'impulse ลงสวยหลังข่าว', 'CLOSED'),
    ];
  }

  setView(v) { this.setState({ view: v }); }
  navStyle(key) {
    const base = 'width:44px;height:44px;border-radius:11px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.16s;position:relative;';
    if (this.state.view === key) return base + 'color:#7658E8;background:rgba(118,88,232,.14);box-shadow:inset 2px 0 0 #6747D8;';
    return base + 'color:#928B9B;';
  }

  startName() { this.setState({ editName: true }); }
  commitName(e) { const raw = e && e.target ? e.target.value : this.state.accountName; const v = String(raw).trim() || this.state.accountName; this.setState({ editName: false, accountName: v }); this._save('rtm_name', v); } // ว่าง = คงชื่อเดิม
  onNameKey(e) { if (e.key === 'Enter') e.target.blur(); }
  startAffirm() { this.setState({ editAffirm: true }); }
  commitAffirm(e) { const raw = e && e.target ? e.target.value : this.state.affirmation; const v = String(raw).trim() || this.state.affirmation; this.setState({ editAffirm: false, affirmation: v }); this._save('rtm_affirm', v); }
  onAffirmKey(e) { if (e.key === 'Enter') e.target.blur(); }

  // affirmation details
  addAffirmDetail() { const d = this.state.affirmDetails.concat([{ id: 'a' + Date.now(), text: 'New line' }]); this.setState({ affirmDetails: d, editDetailId: d[d.length - 1].id }); this._save('rtm_affirmDetails', d); }
  editDetail(id) { this.setState({ editDetailId: id }); }
  commitDetail(id, e) { const v = String(e && e.target ? e.target.value : '').trim(); const d = this.state.affirmDetails.map(x => x.id === id ? { ...x, text: v || x.text } : x); this.setState({ affirmDetails: d, editDetailId: null }); this._save('rtm_affirmDetails', d); }
  delDetail(id) { const d = this.state.affirmDetails.filter(x => x.id !== id); this.setState({ affirmDetails: d }); this._save('rtm_affirmDetails', d); }

  // generic checklist item ops
  _listMeta(which) {
    if (which === 'weekly') return { items: 'weeklyItems', store: 'rtm_weekly', idp: 'w' };
    if (which === 'monthly') return { items: 'monthlyItems', store: 'rtm_monthly', idp: 'm' };
    if (which === 'yearly') return { items: 'yearlyItems', store: 'rtm_yearly', idp: 'y' };
    return { items: 'preItems', store: 'rtm_pre', idp: 'p' };
  }
  addItem(which, text) {
    if (!text || !text.trim()) return;
    const m = this._listMeta(which);
    const arr = this.state[m.items].concat([{ id: m.idp + Date.now(), text: text.trim() }]);
    this.setState({ [m.items]: arr }); this._save(m.store, arr);
  }
  delItem(which, id) {
    const m = this._listMeta(which);
    const arr = this.state[m.items].filter(x => x.id !== id);
    this.setState({ [m.items]: arr }); this._save(m.store, arr);
  }
  editItem(which, id) { this.setState({ editCheck: which + ':' + id }); }
  commitItem(which, id, e) {
    const v = String(e && e.target ? e.target.value : '').trim();
    const m = this._listMeta(which);
    const arr = this.state[m.items].map(x => x.id === id ? { ...x, text: v || x.text } : x); // ว่าง = คงข้อความเดิม
    this.setState({ [m.items]: arr, editCheck: null }); this._save(m.store, arr);
  }
  // แก้ไขข้อความในหน้า planning — ใช้ state แยก (editPlan) ไม่ให้ชนกับเช็กลิสต์ที่อยู่ด้านหลัง modal
  editPlanItem(which, id) { this.setState({ editPlan: which + ':' + id }); }

  // ===== per-period checklist items (แยกตามสัปดาห์/เดือนนั้นๆ) =====
  // รายการของรอบนั้นๆ — ถ้ายังไม่เคยปรับ ใช้ template เป็นค่าเริ่มต้น
  _template(scope) { return this.state[this._listMeta(scope).items] || []; }
  _periodItems(scope, periodKey) {
    const byScope = (this.state.periodItems && this.state.periodItems[scope]) || {};
    if (byScope[periodKey]) return byScope[periodKey];
    return this._template(scope);
  }
  // materialize: ทำสำเนาของรอบนั้นจาก template ครั้งแรกที่มีการแก้ เพื่อให้แก้รอบเดียวไม่กระทบรอบอื่น
  _materializePeriod(scope, periodKey) {
    const clone = JSON.parse(JSON.stringify(this.state.periodItems || {}));
    if (!clone.weekly) clone.weekly = {};
    if (!clone.monthly) clone.monthly = {};
    if (!clone.yearly) clone.yearly = {};
    if (!clone[scope]) clone[scope] = {};
    if (!clone[scope][periodKey]) {
      clone[scope][periodKey] = JSON.parse(JSON.stringify(this._template(scope)));
    }
    return clone;
  }
  addPeriodItem(scope, periodKey, text) {
    if (!text || !text.trim()) return;
    const clone = this._materializePeriod(scope, periodKey);
    clone[scope][periodKey] = clone[scope][periodKey].concat([{ id: (scope === 'weekly' ? 'w' : 'm') + Date.now(), text: text.trim() }]);
    this.setState({ periodItems: clone }); this._save();
  }
  delPeriodItem(scope, periodKey, id) {
    const clone = this._materializePeriod(scope, periodKey);
    clone[scope][periodKey] = clone[scope][periodKey].filter(x => x.id !== id);
    this.setState({ periodItems: clone }); this._save();
  }
  commitPeriodItem(scope, periodKey, id, e) {
    const v = String(e && e.target ? e.target.value : '').trim();
    const clone = this._materializePeriod(scope, periodKey);
    clone[scope][periodKey] = clone[scope][periodKey].map(x => x.id === id ? { ...x, text: v || x.text } : x); // ว่าง = คงข้อความเดิม
    this.setState({ periodItems: clone, editCheck: null, editPlan: null }); this._save();
  }
  // ===== ลาก/สลับลำดับรายการเช็กลิสต์ =====
  reorderPeriodItem(scope, periodKey, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const clone = this._materializePeriod(scope, periodKey);
    const arr = clone[scope][periodKey];
    const from = arr.findIndex(x => x.id === fromId), to = arr.findIndex(x => x.id === toId);
    if (from < 0 || to < 0) return;
    const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    this.setState({ periodItems: clone }); this._save();
  }
  reorderListItem(which, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const meta = this._listMeta(which);
    const arr = this.state[meta.items].slice();
    const from = arr.findIndex(x => x.id === fromId), to = arr.findIndex(x => x.id === toId);
    if (from < 0 || to < 0) return;
    const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    this.setState({ [meta.items]: arr }); this._save();
  }
  toggleCheck(scope, periodKey, id) {
    const checks = JSON.parse(JSON.stringify(this.state.checks));
    if (!checks[scope]) checks[scope] = {};
    if (!checks[scope][periodKey]) checks[scope][periodKey] = {};
    checks[scope][periodKey][id] = !checks[scope][periodKey][id];
    this.setState({ checks }); this._save('rtm_checks', checks);
  }

  // vision
  addVision() { const v = this.state.visionItems.concat([{ id: 'v' + Date.now(), title: 'New goal' }]); this.setState({ visionItems: v }); this._save('rtm_vision', v); }
  delVision(id) { const v = this.state.visionItems.filter(x => x.id !== id); const { images, paths } = this._purgedImages(k => k === 'vision-' + id); this.setState({ visionItems: v, images }); this._save(); deleteImages(paths); }
  editVision(id) { this.setState({ editVisionId: id }); }
  commitVision(id, e) { const t = String(e && e.target ? e.target.value : '').trim(); const v = this.state.visionItems.map(x => x.id === id ? { ...x, title: t || x.title } : x); this.setState({ visionItems: v, editVisionId: null }); this._save('rtm_vision', v); }
  // ===== tags =====
  toggleDraftTag(tag) { const d = this.state.draft; if (!d) return; const has = (d.tags || []).includes(tag); const tags = has ? d.tags.filter(x => x !== tag) : [...(d.tags || []), tag]; this._patchDraft({ ...d, tags }); }
  addTag(name) { name = (name || '').trim(); if (!name) return; let tags = this.state.tags; if (!tags.includes(name)) tags = tags.concat([name]); const d = this.state.draft; const dtags = d ? ((d.tags || []).includes(name) ? d.tags : [...(d.tags || []), name]) : []; this.setState({ tags }); if (d) this._patchDraft({ ...d, tags: dtags }); else this._save(); }
  delTagGlobal(name, e) { if (e) e.stopPropagation(); if (!window.confirm('Remove tag "' + name + '" from the list?')) return; const tags = this.state.tags.filter(x => x !== name); this.setState({ tags }); this._save(); }
  startGoal() { this.setState({ editGoal: true }); }
  commitGoal(e) { const n = parseFloat(String(e && e.target ? e.target.value : '').replace(/[^0-9.]/g, '')) || 0; this.setState({ editGoal: false, goal: n > 0 ? n : 1000000 }); this._save(); }
  onGoalKey(e) { if (e.key === 'Enter') e.target.blur(); }

  // ===== trades =====
  // Realized R. Best: actual result ÷ money risked (1R in $) — so a trade that comes
  // back to breakeven is ~0R, a partial win is a fraction of the target, a full stop is −1R,
  // and slippage past the stop can be worse than −1R. Falls back to the old approximation
  // (win = +planned R:R, loss = −1R) only when no dollar risk was recorded.
  // NOTE: callers pass trades whose pnl is already net of commission, so use t.pnl directly.
  // Coerce whatever the journal holds (typed text, pasted junk, legacy rows) into a finite
  // number. `Number(x) || 0` already handles "abc", but Infinity is truthy and sails straight
  // through — poisoning every total, average and axis it touches.
  _n(v) { return finiteNumber(v); }
  /* ===== how much evidence before we call something an edge =====================
     Splitting a journal by many factors is a multiple-comparisons trap: with ~40 groups,
     pure noise will hand you a couple of "65% win rate" pockets every time. Two guards:
       1. SAMPLE — a group needs real weight before its rate means anything. Detecting a
          20-point win-rate difference needs roughly 100 trades per side; 30 is the floor
          at which a large gap stops being coin-flipping. Below that we show the row but
          refuse to call it an edge.
       2. MARGIN — the gap must be big, not 2-3 points of drift.
     Expectancy (avg R) is the default lens: a scale-in, let-it-run system can profit at a
     low win rate, so ranking by win rate alone would bury its best conditions. */
  _edgeRules() { return { minSample: 30, strongSample: 100, minLiftWr: 15, minLiftR: 0.3 }; }
  // how much a group's numbers can be trusted, from its closed-trade count
  _edgeConf(n) {
    const R = this._edgeRules();
    if (n >= R.strongSample) return { level: 'strong', label: 'น่าเชื่อถือ', color: '#1C9B68' };
    if (n >= R.minSample) return { level: 'ok', label: 'พอประเมินได้', color: '#7658E8' };
    return { level: 'low', label: 'ยังไม่พอ', color: '#928B9B' };
  }
  _rMult(t) {
    return realizedRFromNetTrade(t);
  }
  // the position's 1R in $ — sum of each leg's risk when scaled in, else the single risk field
  _posRisk(t) { return positionRisk(t); }
  // entry model — now lives on the first real leg's "trigger"; falls back to the old per-trade entryType
  _entryModel(t) {
    const legs = this._legs(t);
    // ignore the old synthetic placeholder that older journals may still carry
    const first = legs.find(l => (l.trigger || '').trim() && l.trigger !== 'First entry');
    return (first && first.trigger) || t.entryType || '';
  }
  // retest / fibo now live per-leg too — derive a trade-level read (first leg that has it, else the old field)
  _legRetest(t) { const l = this._legs(t).find(x => x.retest === 'yes' || x.retest === 'no'); return (l && l.retest) || t.retest || ''; }
  _legFibo(t) { const l = this._legs(t).find(x => (x.fibo || '').trim()); return (l && l.fibo) || t.fibo || ''; }
  // net P&L after costs: entered P&L minus commission/swap (positive commission = a cost)
  _netPnl(t) { return netPnlFromTrade(t); }
  // a copy of the trades with pnl already net of commission — everything downstream
  // (equity, calendar, analytics, win-rate) then works off the true net figure
  // Always hand downstream a finite net pnl. (It used to rewrite the row only when a
  // commission was present, which let a non-finite or non-numeric pnl through untouched.)
  _withNet(list) {
    return (list || []).map(t => ({
      ...t,
      _grossPnl: this._n(t.pnl),
      _pnlValid: t.pnl !== '' && t.pnl != null && Number.isFinite(Number(t.pnl)),
      _pnlNet: true,
      commission: commissionCost(t.commission),
      pnl: this._netPnl(t),
    }));
  }
  // ----- excursion (MAE/MFE) & timeframe alignment -----
  // MAE = worst heat this position took ($), MFE = best unrealised profit ($). Both magnitudes.
  _maeUsd(t) { return Math.abs(this._n(t.mae)); }
  // MFE $ — prefer the value auto-derived from prices (how far the peak ran vs your avg entry,
  // calibrated by the realized move → $/point); fall back to a manually-typed $ for older trades.
  _mfeUsd(t) { const a = this._autoMfe(t); return a != null ? a : Math.abs(this._n(t.mfe)); }
  // Derive full MFE $ from the peak price with no need for the instrument's contract size:
  //   $/point = |pnl| / |exitPrice − avgEntry|   (the move you actually realized calibrates it)
  //   MFE $   = $/point × |peakPrice − avgEntry|  (entry → the furthest the trend ran)
  // Needs a TP/exit price, a peak price, a leg avg entry and a non-zero realized pnl.
  _autoMfe(t) {
    const peak = Number(t.peakPrice), exit = Number(t.exitPrice), avg = this._legStats(t).avgEntry;
    const pnl = this._n(t && t._pnlNet ? t._grossPnl : t.pnl);
    if (!isFinite(peak) || !peak || !isFinite(exit) || !exit || avg == null || !isFinite(avg) || !avg || !pnl) return null;
    const capturedPts = Math.abs(exit - avg); if (capturedPts <= 0) return null;
    return this._n(Math.abs(pnl) / capturedPts * Math.abs(peak - avg));
  }
  // heat in R (how deep the position's drawdown ran vs the $ risked) — the "Max DD of this position"
  _maeR(t) { const r = this._posRisk(t); return r > 0 ? this._maeUsd(t) / r : null; }
  _mfeR(t) { const r = this._posRisk(t); return r > 0 ? this._mfeUsd(t) / r : null; }
  // how much of the best move you actually kept (0–100%). The rest is the "pig" left on the table.
  // NOTE: like _rMult, these expect t.pnl to already be the realized NET figure (callers pass netted
  // trades, or wrap a raw trade as {...t, pnl:_netPnl(t)}) — so we never re-subtract commission here.
  _captureP(t) { const mfe = this._mfeUsd(t); if (mfe <= 0) return null; return Math.max(-100, Math.min(100, Math.round(this._n(t.pnl) / mfe * 100))); }
  // "ran after TP" only means something on a trade closed in profit — a loss had no TP to run
  // past, so reporting a pig there would be misleading.
  _pigUsd(t) { const mfe = this._mfeUsd(t); const p = this._n(t.pnl); if (mfe <= 0 || p <= 0) return 0; return Math.max(0, mfe - p); }
  // how many of the 3 timeframes were aligned with the trade
  _alignN(t) { return (t.alignHTF ? 1 : 0) + (t.alignMTF ? 1 : 0) + (t.alignLTF ? 1 : 0); }
  // ----- multi-leg "เบิ้ล" (scaling-in): a position built from several entries -----
  _legs(t) {
    return tradeLegs(t);
  }
  _legStats(t) {
    const legs = this._legs(t);
    let cum = 0, maxLot = 0, maxDD = 0, wSum = 0, wLot = 0, anyUnder = false, totalRisk = 0;
    legs.forEach(l => {
      const lot = Math.abs(this._n(l.lot)), price = this._n(l.price), dd = Math.abs(this._n(l.dd));
      cum += lot; if (cum > maxLot) maxLot = cum; if (dd > maxDD) maxDD = dd;
      totalRisk += Math.abs(this._n(l.risk));
      if (lot > 0 && price > 0) { wSum += price * lot; wLot += lot; }
      if (/under/i.test(l.slBasis || '')) anyUnder = true;
    });
    return { count: legs.length, totalLot: cum, maxLot, maxDD, anyUnder, totalRisk, avgEntry: wLot > 0 ? wSum / wLot : null, isMulti: legs.length > 1 };
  }
  // price formatter — trims decimals to the instrument's magnitude
  _fmtPrice(n) {
    const v = Number(n); if (!isFinite(v)) return '—';
    const abs = Math.abs(v); const dec = abs >= 100 ? 2 : abs >= 1 ? 3 : 5;
    return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dec });
  }
  _portDeposits(p) { return (p.deposits || []).reduce((s, d) => s + (Number(d.amount) || 0), 0); }
  _testMode(t) { return t && t.testMode === 'backtest' ? 'backtest' : 'forward'; }
  _setupById(id) { return this.state.setups.find(s => s.id === id) || { name: '—', accent: '#746E7D', glyph: '?' }; }
  _setupVersion(s) { return Math.max(1, Math.floor(this._n(s && s.version)) || 1); }
  _tradeSetupVersion(t) { return Math.max(1, Math.floor(this._n(t && t.setupVersion)) || 1); }
  _isCurrentSetupVersion(t, setup) { return this._tradeSetupVersion(t) === this._setupVersion(setup); }
  openTrade(id) { const t = this.state.trades.find(x => x.id === id); if (t) this.setState({ draft: { ...t }, draftIsNew: false, showTrade: true, showDay: false, tradeAdvancedOpen: false }); }
  _hasDraftContent(d) {
    if (!d) return false;
    const has = (x) => x != null && String(x).trim() !== '';
    return has(d.sym) || has(d.notes) || has(d.entry) || has(d.stop) || has(d.target) || has(d.pnl) || has(d.lot) || (d.tags && d.tags.length > 0);
  }
  openNew(dateISO) {
    // ถ้ามี draft ใหม่ที่ยังพิมค้างไว้ (ยังไม่บันทึก) ให้กลับไปเขียนต่อ ไม่เริ่มใหม่ทับของเดิม
    if (this.state.draft && this.state.draftIsNew && this._hasDraftContent(this.state.draft)) {
      this.setState({ draft: { ...this.state.draft, testMode: this.state.journalMode === 'backtest' ? 'backtest' : 'forward' }, showTrade: true, showDay: false }); return;
    }
    const n = new Date();
    const today = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    const d = (typeof dateISO === 'string') ? dateISO : today;
    const hh = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
    const cp = this.state.currentPortfolioId;
    const pf = (cp && cp !== 'all') ? cp : (this.state.portfolios[0] ? this.state.portfolios[0].id : 'pf1');
    this.setState({
      draft: { id: 't' + Date.now(), testMode: this.state.journalMode === 'backtest' ? 'backtest' : 'forward', date: d, sym: '', side: 'BUY', setupId: this.state.setups[0] ? this.state.setups[0].id : '', setupVersion: this.state.setups[0] ? this._setupVersion(this.state.setups[0]) : 1, session: 'London', marketRegime: '', exitReason: '', ruleAdherence: '', entry: '', stop: '', target: '', rr: '', pnl: '', lot: '', entryTime: d + 'T' + (d === today ? hh : '09:00'), exitTime: '', notes: '', status: 'CLOSED', imgCount: 2, portfolioId: pf, tags: [], commission: '', risk: '', mae: '', mfe: '', alignHTF: false, alignMTF: false, alignLTF: false, feelEntry: '', feelSL: '', feelTP: '', ltf: '', mtf: '', htf: '', retest: '', fibo: '', entryType: '', slZone: '', legs: [{ trigger: '', price: '', lot: '', slBasis: '', risk: '', dd: '' }], ddBaseline: '', tfMeta: {}, entryKind: '', bias: '', exitPrice: '', peakPrice: '' },
      draftIsNew: true, showTrade: true, showDay: false, tradeAdvancedOpen: false,
    }, () => this._save());
  }
  closeTrade() { this.setState({ showTrade: false }); this._save(); } // ปิดแต่เก็บ draft ไว้ (ปิดพลาดก็ไม่หาย)
  cancelTrade() { // ยกเลิก: ถ้าเป็นรายการใหม่ให้ทิ้ง draft, ถ้าแก้ของเดิมก็แค่ปิด (แก้ไว้ถูกเซฟอัตโนมัติแล้ว)
    if (this.state.draftIsNew) this.setState({ showTrade: false, draft: null, draftIsNew: false }, () => this._save());
    else this.setState({ showTrade: false }, () => this._save());
  }
  _liveTrade(d) { return { ...d, pnl: d.status === 'OPEN' ? 0 : (parseFloat(String(d.pnl).replace(/[^0-9.\-]/g, '')) || 0), rr: parseFloat(String(d.rr).replace(/[^0-9.\-]/g, '')) || 0 }; }
  // อัปเดต draft + ออโต้เซฟ: ถ้าแก้ของเดิมจะ commit เข้า list ทันที (ไม่ต้องกดบันทึก)
  _patchDraft(d) {
    const patch = { draft: d };
    if (!this.state.draftIsNew && d && d.id) patch.trades = this.state.trades.map(t => t.id === d.id ? this._liveTrade(d) : t);
    this.setState(patch); this._save();
  }
  setD(field, v) {
    const d = { ...this.state.draft, [field]: v };
    if (field === 'setupId') d.setupVersion = this._setupVersion(this.state.setups.find(s => s.id === v));
    if (field === 'entry' || field === 'stop' || field === 'target') {
      const e = parseFloat(d.entry), s = parseFloat(d.stop), t = parseFloat(d.target);
      if (!isNaN(e) && !isNaN(s) && !isNaN(t) && Math.abs(e - s) > 0) d.rr = (Math.abs(t - e) / Math.abs(e - s)).toFixed(2);
    }
    // ให้วันที่ของออเดอร์ (ใช้จัดกลุ่มในปฏิทิน/สถิติ) ตามวันเปิดออเดอร์เสมอ
    if (field === 'entryTime' && typeof v === 'string' && v.length >= 10) d.date = v.slice(0, 10);
    this._patchDraft(d);
  }
  // ----- 24-hour time entry (server time 00:00–23:59) -----
  // The stored shape stays "YYYY-MM-DDTHH:MM"; we just split it into a date field and a
  // free-typed 24h time field so the browser locale can never render 12h AM/PM.
  _dtDate(v) { const s = String(v || ''); return s.length >= 10 ? s.slice(0, 10) : ''; }
  _dtHM(v) { const s = String(v || ''); return s.length >= 16 ? s.slice(11, 16) : ''; }
  // Progressive formatting while typing: "930" -> "9:30", "1430" -> "14:30".
  // The hour is deliberately NOT zero-padded here: padding "143" to "01:43" would both
  // misread a half-typed "1430" and push the text to maxLength, swallowing the last digit.
  // Padding happens on blur, in _clampHM.
  _fmtHMInput(raw) {
    const d = String(raw == null ? '' : raw).replace(/\D/g, '').slice(0, 4);
    if (!d) return '';
    if (d.length <= 2) return d;
    return d.slice(0, d.length - 2) + ':' + d.slice(-2);
  }
  // final normalise to a real 24h value ('' when nothing usable was typed)
  _clampHM(raw) {
    const d = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (!d) return '';
    let hh, mm;
    if (d.length <= 2) { hh = parseInt(d, 10); mm = 0; }
    else { hh = parseInt(d.slice(0, d.length - 2), 10); mm = parseInt(d.slice(-2), 10); }
    if (!isFinite(hh)) return '';
    hh = Math.min(23, Math.max(0, hh)); mm = Math.min(59, Math.max(0, isFinite(mm) ? mm : 0));
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  // write one half (date | time) back into the combined field
  _setDTPart(field, kind, v) {
    const d = this.state.draft; if (!d) return;
    const cur = String(d[field] || '');
    const date = kind === 'date' ? v : (this._dtDate(cur) || d.date || '');
    const hm = kind === 'time' ? v : this._dtHM(cur);
    if (!date) { this.setD(field, ''); return; }          // clearing the date clears the stamp
    this.setD(field, date + 'T' + (hm || '00:00'));
  }
  setDTDate(field, e) { this._setDTPart(field, 'date', e.target.value); }
  // keep the raw keystrokes in a transient map so partial input ("09:3") isn't written to the trade
  setDTTime(field, e) {
    const raw = e.target.value;
    this.setState({ hmDraft: { ...(this.state.hmDraft || {}), [field]: this._fmtHMInput(raw) } });
    if (String(raw).replace(/\D/g, '').length >= 3) this._setDTPart(field, 'time', this._clampHM(raw));
  }
  commitDTTime(field) {
    const cur = (this.state.hmDraft || {})[field];
    if (cur == null) return;
    const hm = this._clampHM(cur);
    if (hm) this._setDTPart(field, 'time', hm);
    const next = { ...(this.state.hmDraft || {}) }; delete next[field]; this.setState({ hmDraft: next });
  }
  _hmValue(field) { const t = (this.state.hmDraft || {})[field]; return t != null ? t : this._dtHM(this.state.draft && this.state.draft[field]); }
  addImg() { const d = this.state.draft; if (d.imgCount < 6) this._patchDraft({ ...d, imgCount: d.imgCount + 1 }); }
  // ----- multi-leg "เบิ้ล" editor -----
  addLeg() {
    const d = this.state.draft; const legs = Array.isArray(d.legs) ? d.legs.slice() : [];
    const first = legs.length === 0 && (d.entry || d.lot)
      ? { trigger: d.entryType || '', price: d.entry || '', lot: d.lot || '', slBasis: '', risk: d.risk || '', dd: '' }
      : { trigger: '', price: '', lot: '', slBasis: '', risk: '', dd: '' };
    legs.push(first); this._patchDraft({ ...d, legs });
  }
  removeLeg(i) { const d = this.state.draft; const legs = (d.legs || []).slice(); legs.splice(i, 1); this._patchDraft({ ...d, legs }); }
  setLeg(i, field, v) {
    const d = this.state.draft; const legs = (d.legs || []).slice(); if (!legs[i]) return;
    legs[i] = { ...legs[i], [field]: v };
    if (field === 'trigger' && v && !this._fieldOpts('legTrigger').includes(v)) this._recordOpt('legTrigger', v);
    if (field === 'slBasis' && v && !this._fieldOpts('legSL').includes(v)) this._recordOpt('legSL', v);
    this._patchDraft({ ...d, legs });
  }
  _recordOpt(field, v) {
    const cur = this._fieldOpts(field); if (cur.includes(v)) return;
    this.setState({ tradeFieldOpts: { ...(this.state.tradeFieldOpts || {}), [field]: cur.concat([v]) } });
  }
  // per-timeframe meta (timeframe name + factors free-text), keyed htf/mtf/ltf
  setTfMeta(tf, field, v) {
    const d = this.state.draft; const tfMeta = { ...(d.tfMeta || {}) };
    tfMeta[tf] = { ...(tfMeta[tf] || {}), [field]: v };
    this._patchDraft({ ...d, tfMeta });
  }
  saveTrade() {
    const d = this.state.draft;
    if (!d.sym || !d.sym.trim()) { window.alert('Please enter a Symbol before saving'); return; }
    const num = parseFloat(String(d.pnl).replace(/[^0-9.\-]/g, '')) || 0;
    const rrn = parseFloat(String(d.rr).replace(/[^0-9.\-]/g, '')) || 0;
    const clean = { ...d, sym: d.sym.trim().toUpperCase(), pnl: d.status === 'OPEN' ? 0 : num, rr: rrn };
    let arr;
    if (this.state.draftIsNew) arr = [clean].concat(this.state.trades);
    else arr = this.state.trades.map(t => t.id === d.id ? clean : t);
    arr.sort((a, b) => b.date.localeCompare(a.date));
    this.setState({ trades: arr, showTrade: false, draft: null, draftIsNew: false }); this._save('rtm_trades', arr);
  }
  deleteTrade() {
    if (!window.confirm('Delete this trade?')) return;
    const id = this.state.draft.id;
    const { images, paths } = this._purgedImages(k => k.startsWith('trade-' + id + '-'));
    const arr = this.state.trades.filter(t => t.id !== id);
    this.setState({ trades: arr, images, showTrade: false }); this._save(); deleteImages(paths);
  }
  duplicateTrade() { const d = this.state.draft; if (!d) return; this.setState({ draft: { ...d, id: 't' + Date.now() }, draftIsNew: true }); }

  // ===== trade-analysis fields (LTF/MTF/HTF/retest/fibo/entry) =====
  // options for an editable-choice field. Filter out blank / dash values so a stray "—"
  // can never linger as an un-removable option in the dropdowns or Edit-choices.
  _fieldOpts(field) { const o = this.state.tradeFieldOpts || {}; const a = Array.isArray(o[field]) ? o[field] : []; return a.filter(v => { const s = String(v == null ? '' : v).trim(); return s && s !== '—' && s !== '-' && s !== '–'; }); }
  // options for a dropdown, guaranteeing the current draft value is present even if not in the list
  _fieldOptsWith(field, cur) { const o = this._fieldOpts(field); const c = String(cur == null ? '' : cur).trim(); const clean = (c && c !== '—' && c !== '-' && c !== '–') ? c : ''; return (clean && !o.includes(clean)) ? [clean].concat(o) : o; }
  // set an analysis field on the draft; if it's a brand-new value, remember it as a reusable option
  setDField(field, value) {
    const v = (value || '').trim();
    const cur = this._fieldOpts(field);
    if (v && !cur.includes(v)) {
      const opts = { ...(this.state.tradeFieldOpts || {}), [field]: cur.concat([v]) };
      this.setState({ tradeFieldOpts: opts });
    }
    this.setD(field, value);
  }
  setLogF(field, value) { this.setState({ logF: { ...this.state.logF, [field]: value }, logPage: 0 }); }
  setLogDim(v) { this.setState({ logDim: v }, () => this._save()); }   // remembered like the other analysis preferences
  // ----- manage analysis-field options (LTF/MTF/HTF/Fibo/Entry lists) -----
  openFieldCfg() { this.setState({ fieldCfg: true }); }
  closeFieldCfg() { this.setState({ fieldCfg: null }); this._save(); }
  addFieldOpt(field, value) {
    const v = (value || '').trim(); if (!v) return;
    const cur = this._fieldOpts(field); if (cur.includes(v)) return;
    this.setState({ tradeFieldOpts: { ...(this.state.tradeFieldOpts || {}), [field]: cur.concat([v]) } }); this._save();
  }
  removeFieldOpt(field, value) {
    const cur = this._fieldOpts(field).filter(x => x !== value);
    this.setState({ tradeFieldOpts: { ...(this.state.tradeFieldOpts || {}), [field]: cur } }); this._save();
  }
  moveFieldOpt(field, value, dir) {
    const cur = this._fieldOpts(field).slice(); const i = cur.indexOf(value); const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length) return;
    cur.splice(i, 1); cur.splice(j, 0, value);
    this.setState({ tradeFieldOpts: { ...(this.state.tradeFieldOpts || {}), [field]: cur } }); this._save();
  }
  // rename a choice inline — also fixes every past trade + any active filter that used it,
  // so a typo correction flows everywhere and stats stay consistent
  renameFieldOpt(field, oldVal, newVal) {
    newVal = (newVal || '').trim();
    if (!newVal || newVal === oldVal) return;
    let cur = this._fieldOpts(field);
    // if the new name already exists, this becomes a merge — just drop the old entry
    cur = cur.includes(newVal) ? cur.filter(x => x !== oldVal) : cur.map(x => x === oldVal ? newVal : x);
    const trades = this.state.trades.map(t => t[field] === oldVal ? { ...t, [field]: newVal } : t);
    const logF = { ...this.state.logF }; if (logF[field] === oldVal) logF[field] = newVal;
    this.setState({ tradeFieldOpts: { ...(this.state.tradeFieldOpts || {}), [field]: cur }, trades, logF }); this._save();
  }
  // day-of-week helpers (Monday-first labelling everywhere)
  _DOW_SHORT() { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; }
  _DOW_FULL() { return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; }
  // A stored date can be malformed (hand-edited file, bad import). Parse once and let every
  // label fall back to a dash rather than rendering "NaN undefined NaN".
  _asDate(dateStr) { if (!dateStr) return null; const d = new Date(dateStr + 'T00:00'); return isNaN(d.getTime()) ? null : d; }
  _dowShort(dateStr) { const d = this._asDate(dateStr); return d ? this._DOW_SHORT()[d.getDay()] : ''; }
  _dowFull(dateStr) { const d = this._asDate(dateStr); return d ? this._DOW_FULL()[d.getDay()] : ''; }
  // a distinct colour per weekday (Sun..Sat) — Monday = gold, then blue/green/purple/amber, weekends muted
  _DOW_COLORS() { return ['#C77B7B', '#7658E8', '#4D7FE8', '#1C9B68', '#B79CE8', '#E39A6A', '#6E7686']; }
  _dowColor(dateStr) { const d = this._asDate(dateStr); return d ? this._DOW_COLORS()[d.getDay()] : '#746E7D'; }
  // "8 Jul 2026 · Wed"
  _fullDateLabel(dateStr) {
    const d = this._asDate(dateStr); if (!d) return '—';
    const M = this._EN_MONS_SHORT();
    return d.getDate() + ' ' + M[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + this._DOW_SHORT()[dateStr ? d.getDay() : 0];
  }
  // aggregate win-rate / net / avg-R over an array of trades (closed only for win-rate)
  _aggStats(arr) {
    let net = 0, closed = 0, wins = 0, rSum = 0;
    arr.forEach(t => { if (t.status !== 'OPEN') { const p = this._n(t.pnl); net += p; closed++; if (p > 0) wins++; rSum += this._rMult(t); } });
    const wr = closed ? Math.round(wins / closed * 100) : 0;
    const avgR = closed ? rSum / closed : 0;
    return { n: arr.length, closed, wins, losses: closed - wins, wr, net, avgR };
  }

  calStep(delta) { let m = this.state.calMonth + delta, y = this.state.calYear; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } this.setState({ calYear: y, calMonth: m }); }
  openDay(dateISO) { this.setState({ showDay: true, dayDate: dateISO }); }
  closeDay() { this.setState({ showDay: false }); }

  // ===== setups =====
  openSetup(id) { const s = this.state.setups.find(x => x.id === id); if (s) this.setState({ sDraft: { imgCount: 1, ...s }, setupIsNew: false, showSetup: true }); }
  openNewSetup() {
    const s = this.state.sDraft;
    // มี setup ใหม่ที่พิมค้างไว้ -> เขียนต่อ
    if (s && this.state.setupIsNew && ((s.name && s.name.trim()) || (s.desc && s.desc.trim()) || (s.usage && s.usage.trim()))) {
      this.setState({ showSetup: true }); return;
    }
    this.setState({ sDraft: { id: 's' + Date.now(), name: '', glyph: '★', accent: '#7658E8', desc: '', pnl: 0, wr: 0, trades: 0, avgR: 0, usage: '', imgCount: 1, version: 1, versionHistory: [] }, setupIsNew: true, showSetup: true }, () => this._save());
  }
  closeSetup() { this.setState({ showSetup: false }); this._save(); } // ปิดแต่เก็บ draft ไว้
  cancelSetup() {
    if (this.state.setupIsNew) this.setState({ showSetup: false, sDraft: null, setupIsNew: false }, () => this._save());
    else this.setState({ showSetup: false }, () => this._save());
  }
  _liveSetup(s) { return { ...s, glyph: (s.name || '?').trim().charAt(0).toUpperCase() || '★' }; }
  _patchSDraft(s) {
    const patch = { sDraft: s };
    if (!this.state.setupIsNew && s && s.id) patch.setups = this.state.setups.map(x => x.id === s.id ? this._liveSetup(s) : x);
    this.setState(patch); this._save();
  }
  setS(field, v) {
    let s = { ...this.state.sDraft };
    // Once evidence exists, changing an entry rule starts a new experiment
    // automatically. Cosmetic name/colour edits do not fork the data.
    if (!this.state.setupIsNew && (field === 'desc' || field === 'usage') && s[field] !== v) {
      const version = this._setupVersion(s);
      const hasEvidence = this.state.trades.some(t => t.setupId === s.id && this._tradeSetupVersion(t) === version && t.status !== 'OPEN');
      if (hasEvidence) {
        const snapshot = { version, desc: s.desc || '', usage: s.usage || '', savedAt: new Date().toISOString() };
        s = { ...s, version: version + 1, versionHistory: [...(s.versionHistory || []), snapshot] };
      }
    }
    this._patchSDraft({ ...s, [field]: v });
  }
  bumpSetupVersion() {
    const s = this.state.sDraft;
    if (!s || this.state.setupIsNew) return;
    const version = this._setupVersion(s);
    if (!window.confirm('Create setup v' + (version + 1) + '? Existing trades stay on v' + version + ' and new trades will use the new rules.')) return;
    const snapshot = { version, desc: s.desc || '', usage: s.usage || '', savedAt: new Date().toISOString() };
    this._patchSDraft({ ...s, version: version + 1, versionHistory: [...(s.versionHistory || []), snapshot] });
  }
  addSetupImg() { const s = this.state.sDraft; const c = s.imgCount || 1; if (c < 6) this._patchSDraft({ ...s, imgCount: c + 1 }); }
  saveSetup() {
    const s = this.state.sDraft;
    const clean = { ...s, glyph: (s.name || '?').trim().charAt(0).toUpperCase() || '★' };
    let arr;
    if (this.state.setupIsNew) arr = this.state.setups.concat([clean]);
    else arr = this.state.setups.map(x => x.id === s.id ? clean : x);
    this.setState({ setups: arr, showSetup: false, sDraft: null, setupIsNew: false }); this._save('rtm_setups', arr);
  }
  deleteSetup() { if (!window.confirm('Delete this setup?')) return; const id = this.state.sDraft.id; const arr = this.state.setups.filter(x => x.id !== id); const { images, paths } = this._purgedImages(k => k.startsWith('setup-' + id + '-chart')); this.setState({ setups: arr, images, showSetup: false }); this._save(); deleteImages(paths); }
  deleteSetup2(id) { if (!window.confirm('Delete this setup?')) return; const arr = this.state.setups.filter(x => x.id !== id); const { images, paths } = this._purgedImages(k => k.startsWith('setup-' + id + '-chart')); this.setState({ setups: arr, images }); this._save(); deleteImages(paths); }

  _fmtMoney(n) { return (n >= 0 ? '+$' : '−$') + Math.abs(Math.round(n)).toLocaleString('en-US'); }
  _fmtDur(et, xt) {
    if (!et || !xt) return '—';
    const a = new Date(et).getTime(), b = new Date(xt).getTime();
    if (isNaN(a) || isNaN(b) || b < a) return '—';
    let mins = Math.round((b - a) / 60000);
    const d = Math.floor(mins / 1440); mins -= d * 1440;
    const h = Math.floor(mins / 60); mins -= h * 60;
    let parts = [];
    if (d) parts.push(d + 'd');
    if (h) parts.push(h + 'h');
    if (mins) parts.push(mins + 'm');
    return parts.length ? parts.join(' ') : '0m';
  }
  // ระยะเวลาถือแบบสั้น สำหรับคอลัมน์ในตาราง เช่น "3ชม 15น", "2ว 4ชม", "45น"
  _fmtDurShort(et, xt) {
    if (!et || !xt) return '—';
    const a = new Date(et).getTime(), b = new Date(xt).getTime();
    if (isNaN(a) || isNaN(b) || b < a) return '—';
    let mins = Math.round((b - a) / 60000);
    const d = Math.floor(mins / 1440); mins -= d * 1440;
    const h = Math.floor(mins / 60); mins -= h * 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + mins + 'm';
    return mins + 'm';
  }
  _segStyle(active) { return 'font-size:12.5px;font-weight:600;padding:7px 18px;border-radius:8px;cursor:pointer;transition:.14s;' + (active ? 'background:linear-gradient(180deg,#7658E8,#6747D8);color:#FFFFFF' : 'color:#746E7D'); }
  _tint(c) {
    const m = { '#1C9B68': 'rgba(28,155,104,.14)', '#4D7FE8': 'rgba(77,127,232,.14)', '#8B6CF0': 'rgba(139,108,240,.14)', '#E25462': 'rgba(226,84,98,.14)', '#7658E8': 'rgba(139,108,240,.14)' };
    return m[c] || 'rgba(118,88,232,.14)';
  }
  _ticker() {
    const live = this.state.livePrices;
    const items = (live && live.length)
      ? live.map(p => [p.label, p.price, p.changePct, p.up])
      : [
        ['XAUUSD', '—', '·', true], ['EURUSD', '—', '·', false], ['GBPJPY', '—', '·', true],
        ['US30', '—', '·', true], ['NAS100', '—', '·', false], ['BTCUSD', '—', '·', true], ['USDJPY', '—', '·', true],
        ['NVDA', '—', '·', true], ['GOOG', '—', '·', true], ['AAPL', '—', '·', true], ['TSLA', '—', '·', true], ['MSFT', '—', '·', true],
      ];
    return (
      <Fragment>
        {items.map((it, i) => (
          <span key={i} style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#746E7D' }}>{it[0]}</span>
            <span style={{ color: '#24202B' }}>{it[1]}</span>
            <span style={{ color: it[3] ? '#1C9B68' : '#E25462' }}>{it[2]}</span>
          </span>
        ))}
      </Fragment>
    );
  }

  // ===== dynamic checklist periods (อิงวันจริง → สัปดาห์/เดือนใหม่โผล่อัตโนมัติ) =====
  _isoWeekKey(d) {
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - day + 3);
    const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((dt - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return dt.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }
  _recentWeeks(n, offset = 0) {
    const out = []; const today = new Date();
    for (let i = 0; i < n; i++) {
      const k = i + offset;
      const d = new Date(today); d.setDate(d.getDate() - k * 7);
      const mon = new Date(d); const wd = (mon.getDay() + 6) % 7; mon.setDate(mon.getDate() - wd);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const mname = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(sun);
      const label = (k === 0 ? 'This week · ' : (k < 0 ? 'Future · ' : '')) + mon.getDate() + '–' + sun.getDate() + ' ' + mname;
      out.push([this._isoWeekKey(d), label]);
    }
    return out;
  }
  _recentMonths(n, offset = 0) {
    const out = []; const today = new Date();
    for (let i = 0; i < n; i++) {
      const k = i + offset;
      const d = new Date(today.getFullYear(), today.getMonth() - k, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      out.push([key, new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(d)]);
    }
    return out;
  }
  _recentYears(n, offset = 0) {
    const out = []; const ny = new Date().getFullYear();
    for (let i = 0; i < n; i++) {
      const k = i + offset;
      const y = ny - k;
      const label = (k === 0 ? 'This year · ' : (k < 0 ? 'Future · ' : '')) + y;
      out.push([String(y), label]);
    }
    return out;
  }

  // คีย์รอบปัจจุบันของแต่ละ scope (ใช้ตัดรอบอนาคตออกจากการคิดวินัย)
  _curPeriodKey(scope) {
    const d = new Date();
    if (scope === 'weekly') return this._isoWeekKey(d);
    if (scope === 'yearly') return String(d.getFullYear());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  // ===== สรุปวินัย (Discipline tracker) =====
  // รวมทุกรอบที่มีข้อมูลจริง (มีรายการ/มีการเช็ก) นับถึงรอบปัจจุบัน แล้วสรุปว่าทำตามวินัยได้กี่ %
  // และข้อไหนพลาดบ่อยที่สุด — คิดจากทุกรอบ ไม่จำกัดหน้าที่กำลังดู เพื่อให้ภาพรวมนิ่งแม้ data เยอะ
  _disciplineStats(scope) {
    const st = this.state;
    const checksMap = (st.checks && st.checks[scope]) || {};
    const itemsMap = (st.periodItems && st.periodItems[scope]) || {};
    const curKey = this._curPeriodKey(scope);
    const keySet = {};
    Object.keys(checksMap).forEach(k => { keySet[k] = 1; });
    Object.keys(itemsMap).forEach(k => { keySet[k] = 1; });
    // เฉพาะรอบที่มาถึงแล้ว (≤ ปัจจุบัน) เรียงเก่า→ใหม่
    const list = Object.keys(keySet).filter(k => k <= curKey).sort();
    const perItem = {}; // ข้อความรายการ -> { present, done }
    let sumRatio = 0, counted = 0, fullCount = 0;
    const spark = []; // สัดส่วนรายรอบ (ล่าสุด n รอบ) ไว้วาดแท่งเล็กๆ
    list.forEach((k) => {
      const its = this._periodItems(scope, k);
      if (!its.length) return;
      const c = checksMap[k] || {};
      let done = 0;
      its.forEach((it) => {
        const t = (it.text || '').trim() || '(untitled)';
        if (!perItem[t]) perItem[t] = { present: 0, done: 0 };
        perItem[t].present++;
        if (c[it.id]) { done++; perItem[t].done++; }
      });
      const ratio = done / its.length;
      sumRatio += ratio; counted++;
      if (done === its.length) fullCount++;
      spark.push({ ratio, done, total: its.length });
    });
    const avgPct = counted ? Math.round((sumRatio / counted) * 100) : 0;
    const missed = Object.keys(perItem).map((t) => {
      const o = perItem[t];
      return { text: t, adher: o.present ? o.done / o.present : 0, miss: o.present - o.done, present: o.present };
    }).filter((m) => m.miss > 0).sort((a, b) => (b.miss - a.miss) || (a.adher - b.adher)).slice(0, 3);
    return { avgPct, counted, fullCount, missed, spark: spark.slice(-14) };
  }

  // ===== เตือนวางแผนล่วงหน้า =====
  // คืน reminder ที่ครบกำหนด (ก่อนขึ้นสัปดาห์/เดือนใหม่ ≤2 วัน)
  _dueReminders() {
    const now = new Date();
    const dow = now.getDay(); // 0=Sun..6=Sat
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const due = [];
    // monthly: 2 วันสุดท้ายของเดือน
    if (dim - now.getDate() <= 1) {
      const nf = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const key = nf.getFullYear() + '-' + String(nf.getMonth() + 1).padStart(2, '0');
      due.push({ scope: 'monthly', key, label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(nf) });
    }
    // weekly: เสาร์ (2 วันก่อน) หรือ อาทิตย์ (1 วันก่อนจันทร์)
    if (dow === 6 || dow === 0) {
      const add = dow === 6 ? 2 : 1;
      const mon = new Date(now); mon.setDate(now.getDate() + add);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const mname = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(sun);
      due.push({ scope: 'weekly', key: this._isoWeekKey(mon), label: mon.getDate() + '–' + sun.getDate() + ' ' + mname });
    }
    // yearly: 2 วันสุดท้ายของปี (ธ.ค. 30–31)
    if (now.getMonth() === 11 && dim - now.getDate() <= 1) {
      const ny = now.getFullYear() + 1;
      due.push({ scope: 'yearly', key: String(ny), label: String(ny) });
    }
    return due;
  }
  _checkPlanReminder() {
    if (!this.state.planReminders) return;
    const dis = this.state.dismissedReminders || {};
    const first = this._dueReminders().find(d => !dis[d.scope + ':' + d.key]);
    if (first) this.setState({ showPlan: true, planAuto: true, planScope: first.scope, planKey: first.key, planLabel: first.label });
  }
  closePlan() {
    if (!this.state.planAuto) { this.setState({ showPlan: false, editPlan: null }); return; } // เปิดเอง = ไม่ปิดการเตือน
    const k = this.state.planScope + ':' + this.state.planKey;
    const dis = { ...(this.state.dismissedReminders || {}), [k]: true };
    this.setState({ dismissedReminders: dis, showPlan: false, editPlan: null }, () => { this._save(); this._checkPlanReminder(); });
  }
  togglePlanReminders() { this.setState({ planReminders: !this.state.planReminders, showUserMenu: false }, () => this._save()); }
  // เปิดแผนล่วงหน้าเองจากหน้า Checklist (สัปดาห์/เดือนถัดไปตามแท็บ)
  openPlanManual() {
    const now = new Date();
    if (this.state.checkTab === 'yearly') {
      const ny = now.getFullYear() + 1;
      this.setState({ showPlan: true, planAuto: false, planScope: 'yearly', planKey: String(ny), planLabel: String(ny) });
    } else if (this.state.checkTab === 'monthly') {
      const nf = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const key = nf.getFullYear() + '-' + String(nf.getMonth() + 1).padStart(2, '0');
      this.setState({ showPlan: true, planAuto: false, planScope: 'monthly', planKey: key, planLabel: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(nf) });
    } else {
      const dow = now.getDay();
      const add = ((8 - dow) % 7) || 7; // จันทร์ถัดไป
      const mon = new Date(now); mon.setDate(now.getDate() + add);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const mname = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(sun);
      this.setState({ showPlan: true, planAuto: false, planScope: 'weekly', planKey: this._isoWeekKey(mon), planLabel: mon.getDate() + '–' + sun.getDate() + ' ' + mname });
    }
  }
  // เลื่อนหน้าต่าง period ใน checklist (dir: +1 ย้อนหลัง, -1 ใหม่/อนาคต)
  pagePeriod(dir) {
    if (this.state.checkTab === 'yearly') this.setState({ periodOffsetY: this.state.periodOffsetY + dir * 3 });
    else if (this.state.checkTab === 'monthly') this.setState({ periodOffsetM: this.state.periodOffsetM + dir * 3 });
    else this.setState({ periodOffsetW: this.state.periodOffsetW + dir * 4 });
  }
  pageReset() {
    if (this.state.checkTab === 'yearly') this.setState({ periodOffsetY: 0 });
    else if (this.state.checkTab === 'monthly') this.setState({ periodOffsetM: 0 });
    else this.setState({ periodOffsetW: 0 });
  }
  setPortfolioBalance(id, v) {
    const num = parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0;
    const portfolios = this.state.portfolios.map(p => p.id === id ? { ...p, startBalance: num } : p);
    this.setState({ portfolios }); this._save();
  }
  // ฝาก/ถอนเงินเข้าพอร์ต — แยกปุ่มชัดเจน, เก็บเป็นรายการมีวันที่ (ฝาก = บวก, ถอน = ลบ)
  addFunds(id, isWithdraw) {
    const raw = window.prompt(isWithdraw ? 'Withdraw from portfolio — enter amount (e.g. 50)' : 'Deposit to portfolio — enter amount (e.g. 100)');
    if (raw == null) return;
    const mag = Math.abs(parseFloat(String(raw).replace(/[^0-9.\-]/g, '')));
    if (!mag || isNaN(mag)) return;
    const amt = isWithdraw ? -mag : mag;
    const n = new Date();
    const date = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    const portfolios = this.state.portfolios.map(p => p.id === id ? { ...p, deposits: [...(p.deposits || []), { id: 'mv' + Date.now(), amount: amt, date }] } : p);
    this.setState({ portfolios }); this._save();
  }
  // ลบรายการฝาก/ถอน (ไว้แก้ที่กรอกผิด)
  delMovement(portId, movId) {
    const portfolios = this.state.portfolios.map(p => p.id === portId ? { ...p, deposits: (p.deposits || []).filter(d => d.id !== movId) } : p);
    this.setState({ portfolios }); this._save();
  }
  openTxns(id) { this.setState({ txnPort: id }); }
  closeTxns() { this.setState({ txnPort: null }); }

  // ===== คำนวณสถิติทั้งหมดจากเทรดจริง (Dashboard + Analytics) =====
  _stats(trades, setups, portfolios, cpId, firstPf, goal, eqRange, metric) {
    const GREEN = '#1C9B68', RED = '#E25462', GOLD = '#7658E8', BLUE = '#4D7FE8', PURPLE = '#8B6CF0';
    const pc = (n) => n >= 0 ? GREEN : RED;
    const fm = (n) => this._fmtMoney(n);
    // เลขบนแท่งกราฟ: โชว์ค่าจริง (มี comma) ย่อเป็น k เฉพาะเมื่อ ≥ 100,000 เพื่อไม่ให้ล้น
    const barMoney = (n) => { const a = Math.abs(n), sign = n >= 0 ? '+$' : '−$'; return a >= 100000 ? (sign + (a / 1000).toFixed(0) + 'k') : (sign + Math.round(a).toLocaleString('en-US')); };
    // กันข้อมูลที่ pnl/rr เป็น string -> บังคับเป็นตัวเลขเสมอ
    trades = (trades || []).map(t => ({ ...t, pnl: this._n(t.pnl), rr: this._n(t.rr) }));
    const summary = summarizeNetTrades(trades);
    const closed = summary.closed;
    const wins = closed.filter(t => (t.pnl || 0) > 0);
    const losses = closed.filter(t => (t.pnl || 0) < 0);
    const closedNet = summary.net;
    const grossP = summary.grossProfit;
    const grossL = summary.grossLoss;
    const winRate = summary.winRate;
    const pf = summary.profitFactor;
    const avgR = summary.avgR;
    const relevant = (cpId === 'all') ? portfolios : portfolios.filter(p => p.id === cpId);
    const startBal = relevant.reduce((s, p) => s + (Number(p.startBalance) || 0), 0);
    // baseline จากออเดอร์ที่เก็บถาวรแล้ว — รวมกำไรไว้เพื่อให้ net/milestone/Growth เดินต่อเนื่องหลังคืนพื้นที่
    const archPnl = relevant.reduce((s, p) => s + (Number(p.archivedPnl) || 0), 0);
    const archCount = relevant.reduce((s, p) => s + (Number(p.archivedCount) || 0), 0);
    const net = closedNet + archPnl; // กำไรสุทธิรวม (ออเดอร์ปัจจุบัน + ที่เก็บถาวร)
    // แยกเงินเติม (บวก) กับถอน/cash out (ลบ) ออกจากกัน เพื่อโชว์ต้นทุน/กำไรให้ชัด
    let depIn = 0, cashOut = 0;
    relevant.forEach(p => (p.deposits || []).forEach(d => { const a = Number(d.amount) || 0; if (a >= 0) depIn += a; else cashOut += -a; }));
    const capitalIn = startBal + depIn;        // ต้นทุนรวมที่ใส่เข้าไป
    const equity = capitalIn - cashOut + net;  // มูลค่าพอร์ตจริง (เงินสดในบัญชี)

    const chrono = closed.slice().sort((a, b) => (a.date.localeCompare(b.date)) || String(a.entryTime || '').localeCompare(String(b.entryTime || '')));
    // Trading drawdown follows the real equity high-water mark. Deposits/withdrawals shift
    // both equity and its peak, so external cash never masquerades as performance.
    const equityDD = equityDrawdownPercent({
      trades: chrono,
      startingBalance: startBal,
      archivedPnl: archPnl,
      cashFlows: relevant.flatMap(p => (p.deposits || []).map(d => ({ date: d.date, amount: d.amount }))),
    });
    const maxDD = equityDD.maxDrawdownPct;

    // GROWTH curve = กำไรสะสม เริ่มจาก baseline ที่เก็บถาวร (archPnl) เพื่อให้เดินต่อเนื่องแม้ล้างออเดอร์เก่า
    const curve = [archPnl]; let cum = archPnl;
    chrono.forEach(t => { cum += t.pnl || 0; curve.push(cum); });
    let peak = archPnl; curve.forEach(v => { if (v > peak) peak = v; });

    // display curve ตามช่วงเวลา (ALL/3M/1M) — cumulative กำไรสะสม (0 = เท่าทุน)
    let cutoff = null;
    if (eqRange === '1M') { const dt = new Date(); dt.setMonth(dt.getMonth() - 1); cutoff = dt.toISOString().slice(0, 10); }
    else if (eqRange === '3M') { const dt = new Date(); dt.setMonth(dt.getMonth() - 3); cutoff = dt.toISOString().slice(0, 10); }
    let dispBase = archPnl; const dispEvents = [];
    chrono.forEach(t => { const e = { date: t.date, amt: t.pnl || 0, kind: 'trade', sym: t.sym }; if (cutoff && t.date && t.date < cutoff) dispBase += e.amt; else dispEvents.push(e); });
    const dcurve = [dispBase]; let dc = dispBase; dispEvents.forEach(e => { dc += e.amt; dcurve.push(dc); });

    const W = 640, H = 230, pad = 16;
    // หา min/max ด้วยลูป (ห้ามใช้ spread — ประวัติหลายหมื่นจุดจะ stack overflow)
    let minV = Infinity, maxV = -Infinity;
    dcurve.forEach(v => { if (v < minV) minV = v; if (v > maxV) maxV = v; });
    if (minV === maxV) { minV -= 1; maxV += 1; }
    // downsample ให้เหลือ ~640 จุด (1 จุด/พิกเซล) — กราฟลื่นแม้มีเป็นหมื่นไม้ โดยคง จุดแรก/จุดสุดท้าย
    let plot = dcurve.map((v, i) => ({ v, ev: i === 0 ? null : dispEvents[i - 1] }));
    if (plot.length > 640) {
      const step = (plot.length - 1) / 639;
      const sampled = []; for (let k = 0; k < 640; k++) sampled.push(plot[Math.round(k * step)]);
      plot = sampled;
    }
    const np = plot.length;
    const xAt = (i) => np <= 1 ? 0 : (i / (np - 1)) * W;
    const yAt = (v) => pad + (H - 2 * pad) * (1 - (v - minV) / (maxV - minV));
    // เส้นอ้างอิง "เท่าทุน" (กำไรสะสม = 0) ถ้าอยู่ในกรอบ
    const zeroY = (minV <= 0 && maxV >= 0) ? +yAt(0).toFixed(1) : null;
    let line;
    if (np === 1) line = `M0 ${yAt(plot[0].v).toFixed(1)} L${W} ${yAt(plot[0].v).toFixed(1)}`;
    else line = plot.map((p, i) => (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ' ' + yAt(p.v).toFixed(1)).join(' ');
    const area = line + ` L${W} ${H} L0 ${H} Z`;
    // จุดข้อมูลสำหรับ hover tooltip — โชว์กำไร/ขาดทุนสะสม (ติดเครื่องหมาย)
    const vstr = (v) => (v >= 0 ? '+$' : '−$') + Math.abs(Math.round(v)).toLocaleString('en-US');
    let equityPoints;
    if (np === 1) {
      const y0 = +yAt(plot[0].v).toFixed(1);
      equityPoints = [{ x: 0, y: y0, valueStr: vstr(plot[0].v), label: 'Start' }, { x: W, y: y0, valueStr: vstr(plot[0].v), label: 'Now' }];
    } else {
      equityPoints = plot.map((p, i) => {
        let label = 'Start';
        if (i > 0) { const e = p.ev; label = e ? ((e.date || '') + (e.sym ? ' · ' + e.sym : '')) : ''; }
        return { x: +xAt(i).toFixed(1), y: +yAt(p.v).toFixed(1), valueStr: vstr(p.v), label };
      });
    }

    const bySetup = setups.map(s => {
      // A changed ruleset is a new experiment. Never blend legacy trades into the
      // current setup's dashboard bar or the apparent edge can be mathematically false.
      const ts = closed.filter(t => t.setupId === s.id && this._isCurrentSetupVersion(t, s));
      const p = ts.reduce((a, t) => a + (t.pnl || 0), 0);
      const w = ts.filter(t => t.pnl > 0).length;
      return { name: s.name + ' v' + this._setupVersion(s), pnl: p, count: ts.length, wr: ts.length ? Math.round(w / ts.length * 100) : 0 };
    });
    const maxAbs = Math.max(1, ...bySetup.map(s => Math.abs(s.pnl)));
    const setupBars = bySetup.slice().sort((a, b) => b.pnl - a.pnl).map(s => ({
      name: s.name, meta: s.count + 't · ' + s.wr + '% wr', pnl: fm(s.pnl), color: pc(s.pnl), w: (Math.abs(s.pnl) / maxAbs * 100) + '%',
    }));

    const dowFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dowSum = [0, 0, 0, 0, 0, 0, 0];
    closed.forEach(t => { dowSum[new Date(t.date + 'T00:00').getDay()] += t.pnl || 0; });
    const dowIdx = [1, 2, 3, 4, 5];
    const dowMax = Math.max(1, ...dowIdx.map(i => Math.abs(dowSum[i])));
    const dowBars = dowIdx.map(i => ({ label: dowFull[i], val: barMoney(dowSum[i]), color: pc(dowSum[i]), bg: dowSum[i] >= 0 ? 'linear-gradient(180deg,#1C9B68,rgba(28,155,104,.3))' : 'linear-gradient(180deg,#E25462,rgba(226,84,98,.3))', h: (Math.abs(dowSum[i]) / dowMax * 100) + '%' }));

    const sesDefs = [['Tokyo', BLUE, '123,167,217'], ['London', GOLD, '226,197,136'], ['New York', PURPLE, '155,140,255']];
    const sesSum = {}; closed.forEach(t => { sesSum[t.session] = (sesSum[t.session] || 0) + (t.pnl || 0); });
    const sesMax = Math.max(1, ...sesDefs.map(d => Math.abs(sesSum[d[0]] || 0)));
    const sessionBars = sesDefs.map(([l, c, rgb]) => { const v = sesSum[l] || 0; return { label: l, val: barMoney(v), color: c, labelColor: c, bg: `linear-gradient(180deg,${c},rgba(${rgb},.2))`, glow: `0 6px 22px -8px rgba(${rgb},.6)`, h: (Math.abs(v) / sesMax * 100) + '%' }; });

    const buckets = [['<-2R', v => v < -2], ['-2R', v => v >= -2 && v < -1.5], ['-1R', v => v >= -1.5 && v < -0.5], ['0R', v => v >= -0.5 && v < 0.5], ['+1R', v => v >= 0.5 && v < 1.5], ['+2R', v => v >= 1.5 && v < 2.5], ['+3R', v => v >= 2.5 && v < 3.5], ['>3R', v => v >= 3.5]];
    const rCounts = buckets.map(([l, f]) => ({ l, n: closed.filter(t => f(this._rMult(t))).length }));
    const rMax = Math.max(1, ...rCounts.map(b => b.n));
    const rDist = rCounts.map(b => ({ label: b.l, bg: (b.l.startsWith('-') || b.l.startsWith('<')) ? 'rgba(226,84,98,.55)' : (b.l === '0R' ? 'rgba(49,35,73,.18)' : 'rgba(28,155,104,.6)'), h: (b.n / rMax * 100) + '%' }));

    // best/worst ด้วยลูป (ห้าม spread — trades เยอะมากจะ stack overflow)
    let best = 0, worst = 0;
    closed.forEach(t => { const p = t.pnl || 0; if (p > best) best = p; if (p < worst) worst = p; });
    const avgWin = wins.length ? grossP / wins.length : 0;
    const avgLoss = losses.length ? -grossL / losses.length : 0;
    let mw = 0, ml = 0, cw = 0, cl = 0;
    chrono.forEach(t => { if (t.pnl > 0) { cw++; cl = 0; if (cw > mw) mw = cw; } else if (t.pnl < 0) { cl++; cw = 0; if (cl > ml) ml = cl; } });
    const anaStats = [
      { label: 'Best trade', val: fm(best), color: GREEN }, { label: 'Worst trade', val: fm(worst), color: RED },
      { label: 'Avg win', val: fm(avgWin), color: GREEN }, { label: 'Avg loss', val: fm(avgLoss), color: RED },
      { label: 'Max win streak', val: String(mw), color: GOLD }, { label: 'Max loss streak', val: String(ml), color: '#24202B' },
    ];

    // expectancy ($/ไม้) + current streak
    const expectancy = closed.length ? closedNet / closed.length : 0;
    const dayNet = {};
    closed.forEach(t => { dayNet[t.date] = (dayNet[t.date] || 0) + (t.pnl || 0); });
    const tradeDaysN = Object.keys(dayNet).length;
    const greenDaysN = Object.values(dayNet).filter(v => v > 0).length;
    const consistencyStr = (tradeDaysN ? Math.round(greenDaysN / tradeDaysN * 100) : 0) + '%';
    let cs = 0, sign = 0;
    for (let i = chrono.length - 1; i >= 0; i--) { const p = chrono[i].pnl; const s = p > 0 ? 1 : (p < 0 ? -1 : 0); if (s === 0) continue; if (sign === 0) { sign = s; cs = 1; } else if (s === sign) cs++; else break; }
    const curStreakStr = sign === 0 ? '—' : (sign > 0 ? ('Won ' + cs + ' in a row') : ('Lost ' + cs + ' in a row'));
    const curStreakColor = sign > 0 ? GREEN : (sign < 0 ? RED : '#24202B');

    // drawdown (underwater) chart — วัดจากมูลค่าพอร์ต (ทุนเริ่มต้น + กำไรสะสม) ไม่ใช่กำไรสะสมเปล่าๆ
    let dd = equityDD.series.slice();
    let maxDDv = 0.0001; dd.forEach(v => { if (v > maxDDv) maxDDv = v; }); // ลูปแทน spread
    // downsample เช่นเดียวกับ equity curve
    if (dd.length > 640) {
      const dstep = (dd.length - 1) / 639;
      const ds = []; for (let k = 0; k < 640; k++) ds.push(dd[Math.round(k * dstep)]);
      dd = ds;
    }
    const Wd = 640, Hd = 120;
    const ddN = dd.length; // ใช้จำนวนจุดของ dd เอง (เดิมใช้ np ของ equity curve ทำให้เส้นเพี้ยนตอนเลือกช่วง 1M/3M)
    const xd = (i) => ddN <= 1 ? 0 : (i / (ddN - 1)) * Wd;
    const yd = (d) => (d / maxDDv) * (Hd - 10);
    const ddLine = dd.map((d, i) => (i === 0 ? 'M' : 'L') + xd(i).toFixed(1) + ' ' + yd(d).toFixed(1)).join(' ');
    const ddArea = ddLine + ` L${Wd} 0 L0 0 Z`;

    // by symbol
    const symMap = {};
    closed.forEach(t => { const k = t.sym || '—'; const m = symMap[k] || (symMap[k] = { net: 0, n: 0, w: 0 }); m.net += t.pnl || 0; m.n++; if (t.pnl > 0) m.w++; });
    const symArr = Object.keys(symMap).map(k => ({ name: k, net: symMap[k].net, n: symMap[k].n, wr: symMap[k].n ? Math.round(symMap[k].w / symMap[k].n * 100) : 0 }));
    let symMaxAbs = 1; symArr.forEach(s => { const a = Math.abs(s.net); if (a > symMaxAbs) symMaxAbs = a; }); // ลูปแทน spread
    const symSorted = symArr.sort((a, b) => b.net - a.net);
    const LIST_CAP = 15; // โชว์สูงสุด 15 แถว กัน list ยาวเกินเมื่อสัญลักษณ์เยอะ
    const symbolBars = symSorted.slice(0, LIST_CAP).map(s => ({ name: s.name, meta: s.n + 't · ' + s.wr + '% wr', pnl: fm(s.net), color: pc(s.net), w: (Math.abs(s.net) / symMaxAbs * 100) + '%' }));
    const symbolMore = Math.max(0, symSorted.length - LIST_CAP);

    // ---- P&L by feeling, for all three moments of the trade ----
    // Feelings are picked from a list, so these actually group; expectancy is carried alongside
    // the money because "which mood costs me" is really "which mood lowers my avg R".
    const feelBreak = (field) => {
      const map = {};
      closed.forEach(t => {
        const f = (t[field] || '').trim(); if (!f) return;
        const m = map[f] || (map[f] = { net: 0, n: 0, w: 0, rSum: 0 });
        m.net += t.pnl || 0; m.n++; if (t.pnl > 0) m.w++; m.rSum += this._rMult(t);
      });
      const arr = Object.keys(map).map(k => ({ name: k, net: map[k].net, n: map[k].n,
        wr: map[k].n ? Math.round(map[k].w / map[k].n * 100) : 0,
        avgR: map[k].n ? map[k].rSum / map[k].n : 0 }));
      let mx = 1; arr.forEach(x => { const a = Math.abs(x.net); if (a > mx) mx = a; });
      arr.sort((a, b) => a.avgR - b.avgR);   // worst mood first — that is what you act on
      return {
        rows: arr.slice(0, LIST_CAP).map(x => ({
          name: x.name, n: x.n,
          meta: x.n + ' ไม้ · ' + x.wr + '% wr',
          avgR: (x.avgR >= 0 ? '+' : '−') + Math.abs(x.avgR).toFixed(2) + 'R',
          avgRColor: x.avgR > 0 ? GREEN : (x.avgR < 0 ? RED : '#746E7D'),
          pnl: fm(x.net), color: pc(x.net), w: (Math.abs(x.net) / mx * 100) + '%',
          conf: this._edgeConf(x.n).label, confColor: this._edgeConf(x.n).color,
        })),
        more: Math.max(0, arr.length - LIST_CAP),
        total: arr.length,
      };
    };
    const feelStats = { entry: feelBreak('feelEntry'), sl: feelBreak('feelSL'), tp: feelBreak('feelTP') };
    const tagStats = feelStats.entry.rows;      // kept for anything still reading the old name
    const tagMore = feelStats.entry.more;

    // ---- Edge finder — which conditions actually improve your result ----
    // For each factor, take its strongest value and measure the LIFT over your own baseline.
    // Two lenses (see _edgeRules): expectancy in R — the honest one for a scale-in system that
    // can profit at a low win rate — or plain win rate. A value only counts as an edge when it
    // clears the sample floor AND beats the baseline by a real margin.
    const EF = this._edgeRules();
    const efMetric = metric === 'wr' ? 'wr' : 'r';
    const baseAvgR = closed.length ? closed.reduce((a, t) => a + this._rMult(t), 0) / closed.length : 0;
    const efFactors = [
      { label: 'TF alignment', get: t => this._alignN(t) + '/3 aligned' },
      { label: 'Retest', get: t => { const r = this._legRetest(t); return r === 'yes' ? 'Retest ✓' : (r === 'no' ? 'No retest' : ''); } },
      { label: 'Fibo M15', get: t => this._legFibo(t) },
      { label: 'Entry model', get: t => this._entryModel(t) },
      { label: 'Session', get: t => (t.session || '').trim() },
      { label: 'Day of week', get: t => this._dowFull(t.date) },
      { label: 'Setup', get: t => this._setupById(t.setupId).name },
      { label: 'Feeling · เข้า', get: t => (t.feelEntry || '').trim() },
      { label: 'Feeling · SL', get: t => (t.feelSL || '').trim() },
      { label: 'Feeling · TP', get: t => (t.feelTP || '').trim() },
    ];
    const efRows = [];
    let efBestSample = 0;   // biggest group we saw, so we can say how far off the floor you are
    efFactors.forEach(f => {
      const grp = {};
      closed.forEach(t => { const v = f.get(t); if (!v) return; const m = grp[v] || (grp[v] = { n: 0, w: 0, net: 0, rSum: 0 }); m.n++; if (t.pnl > 0) m.w++; m.net += t.pnl || 0; m.rSum += this._rMult(t); });
      let best = null;
      Object.keys(grp).forEach(v => {
        const m = grp[v];
        if (m.n > efBestSample) efBestSample = m.n;
        if (m.n < EF.minSample) return;                       // too thin to mean anything
        const wr = m.w / m.n * 100, avgR = m.rSum / m.n;
        const score = efMetric === 'wr' ? wr : avgR;
        if (!best || score > best.score || (score === best.score && m.n > best.n)) best = { value: v, wr, avgR, score, n: m.n, w: m.w, net: m.net };
      });
      if (!best) return;
      const lift = efMetric === 'wr' ? (best.wr - winRate) : (best.avgR - baseAvgR);
      const conf = this._edgeConf(best.n);
      efRows.push({
        factor: f.label, value: best.value, n: best.n,
        wr: Math.round(best.wr), avgR: best.avgR,
        metric: efMetric,
        valueStr: efMetric === 'wr' ? (Math.round(best.wr) + '%') : ((best.avgR >= 0 ? '+' : '−') + Math.abs(best.avgR).toFixed(2) + 'R'),
        lift: efMetric === 'wr' ? Math.round(lift) : lift,
        liftStr: efMetric === 'wr' ? ((lift > 0 ? '+' : '') + Math.round(lift) + ' pts') : ((lift > 0 ? '+' : '−') + Math.abs(lift).toFixed(2) + 'R'),
        record: best.w + 'W · ' + (best.n - best.w) + 'L',
        net: fm(best.net), netColor: pc(best.net),
        conf: conf.level, confLabel: conf.label, confColor: conf.color,
        w: (efMetric === 'wr' ? Math.min(100, best.wr) : Math.min(100, Math.max(4, (best.avgR + 1) / 3 * 100))) + '%',
      });
    });
    efRows.sort((a, b) => b.lift - a.lift || b.n - a.n);
    // An edge must beat the baseline by a real margin — and, on the win-rate lens, actually win.
    const minLift = efMetric === 'wr' ? EF.minLiftWr : EF.minLiftR;
    const efEdges = efRows.filter(r => r.lift >= minLift && (efMetric === 'wr' ? r.wr > 0 : true));
    const edgeFinder = {
      metric: efMetric,
      baselineWr: Math.round(winRate),
      baselineR: baseAvgR,
      baselineStr: efMetric === 'wr' ? (Math.round(winRate) + '%') : ((baseAvgR >= 0 ? '+' : '−') + Math.abs(baseAvgR).toFixed(2) + 'R'),
      minSample: EF.minSample, strongSample: EF.strongSample,
      minLiftStr: efMetric === 'wr' ? (EF.minLiftWr + ' จุด') : ('+' + EF.minLiftR.toFixed(2) + 'R'),
      closedN: closed.length, bestSample: efBestSample,
      // is any group even big enough to judge? (drives which empty-state message to show)
      sampleReady: efBestSample >= EF.minSample,
      hasData: efEdges.length > 0,
      rows: efEdges.slice(0, 8),
    };

    return {
      edgeFinder,
      expectancyStr: fm(expectancy), curStreakStr, curStreakColor,
      consistencyStr, tradeDaysN, greenDaysN, feelStats,
      ddLine, ddArea, symbolBars, tagStats, symbolMore, tagMore,
      maxWinStreak: String(mw), maxLossStreak: String(ml),
      kEquity: '$' + Math.round(equity).toLocaleString('en-US'),
      kNet: fm(net), kNetColor: pc(net), kWin: winRate.toFixed(1) + '%',
      kPf: grossL ? pf.toFixed(2) : (grossP > 0 ? '∞' : '0.00'),
      kR: (avgR >= 0 ? '+' : '−') + Math.abs(avgR).toFixed(2) + 'R',
      kDD: maxDD.toFixed(1) + '%',
      donut: `conic-gradient(#1C9B68 0% ${winRate}%, rgba(49,35,73,.07) ${winRate}%)`,
      totalClosed: closed.length, winsN: wins.length, lossesN: losses.length,
      archCount, archNote: archCount > 0 ? ('Includes ' + archCount + ' archived trades in P&L / curve') : '',
      startBalStr: '$' + Math.round(startBal).toLocaleString('en-US'),
      setupBars, equityLine: line, equityArea: area, equityLastY: yAt(plot[np - 1].v).toFixed(1), equityPoints, equityZeroY: zeroY,
      equityPeakStr: (peak >= 0 ? '+$' : '−$') + Math.abs(Math.round(peak)).toLocaleString('en-US'),
      equityGrowthStr: (capitalIn > 0 ? ((net >= 0 ? '+' : '−') + Math.abs(net / capitalIn * 100).toFixed(1) + '%') : '—'),
      equityGrowthColor: pc(net),
      // สรุปกระแสเงิน (broker-statement): ทุนสุทธิ (ฝาก−ถอน) + กำไร = พอร์ตจริง
      capitalInStr: '$' + Math.round(capitalIn - cashOut).toLocaleString('en-US'), // ทุนสุทธิที่ยังอยู่ในพอร์ต
      depositedStr: '$' + Math.round(capitalIn).toLocaleString('en-US'),           // ฝากเข้ารวม (รวมทุนเริ่มต้น)
      cashOutStr: cashOut > 0 ? ('−$' + Math.round(cashOut).toLocaleString('en-US')) : '$0',
      cashOut, hasCashFlow: (depIn > 0 || cashOut > 0),
      balanceStr: '$' + Math.round(equity).toLocaleString('en-US'),
      netProfitStr: fm(net), netProfitColor: pc(net),
      dowBars, sessionBars, rDist, anaStats,
    };
  }

  renderVals() {
    const GREEN = '#1C9B68', RED = '#E25462', BLUE = '#4D7FE8', GOLD = '#7658E8', PURPLE = '#8B6CF0';
    const pc = (n) => n >= 0 ? GREEN : RED;
    const st = this.state;
    const setups = st.setups;
    const cpId = st.currentPortfolioId;
    const firstPf = st.portfolios[0] ? st.portfolios[0].id : null;
    // fold commission/swap into P&L once, up front — every calculation below is net
    const netAll = this._withNet(st.trades);
    const forwardAll = netAll.filter(t => this._testMode(t) === 'forward');
    const backtestAll = netAll.filter(t => this._testMode(t) === 'backtest');
    const activeMode = st.journalMode === 'backtest' ? 'backtest' : 'forward';
    const modeAll = activeMode === 'backtest' ? backtestAll : forwardAll;
    const trades = (activeMode === 'backtest' || cpId === 'all')
      ? modeAll
      : modeAll.filter(t => t.portfolioId === cpId || (!t.portfolioId && cpId === firstPf));
    // Keep every rule-break in the dataset; compare it with on-plan execution instead of
    // deleting bad trades. This exposes execution leakage without hindsight bias.
    const executionEligible = trades.filter(t => t.status !== 'OPEN' && this._posRisk(t) > 0);
    const executionTracked = executionEligible.filter(t => String(t.ruleAdherence || '').trim());
    const executionOnPlan = executionTracked.filter(t => t.ruleAdherence === 'On plan');
    const executionDeviated = executionTracked.filter(t => t.ruleAdherence !== 'On plan');
    const executionOnStats = this._aggStats(executionOnPlan);
    const executionOffStats = this._aggStats(executionDeviated);
    const fmtAuditR = (v, n) => n ? ((v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + 'R') : '—';
    const executionAudit = {
      eligible: executionEligible.length,
      tracked: executionTracked.length,
      coverage: executionEligible.length ? Math.round(executionTracked.length / executionEligible.length * 100) + '%' : '0%',
      onN: executionOnStats.closed, onR: fmtAuditR(executionOnStats.avgR, executionOnStats.closed), onWr: executionOnStats.closed ? executionOnStats.wr + '%' : '—',
      offN: executionOffStats.closed, offR: fmtAuditR(executionOffStats.avgR, executionOffStats.closed), offWr: executionOffStats.closed ? executionOffStats.wr + '%' : '—',
      leak: executionOnStats.closed && executionOffStats.closed ? fmtAuditR(executionOnStats.avgR - executionOffStats.avgR, 1) : '—',
      ready: executionTracked.length >= 10 && executionOnStats.closed > 0 && executionOffStats.closed > 0,
    };

    // ---- per-portfolio stats (Account page) ----
    const portfolioStats = st.portfolios.map(p => {
      const ts = forwardAll.filter(t => t.portfolioId === p.id || (!t.portfolioId && p.id === firstPf));
      let net = 0, wins = 0, closed = 0, rrSum = 0, rrN = 0;
      ts.forEach(t => { if (t.status !== 'OPEN') { net += (t.pnl || 0); closed++; if ((t.pnl || 0) > 0) wins++; rrSum += this._rMult(t); rrN++; } });
      net += (Number(p.archivedPnl) || 0); // รวมกำไรที่เก็บถาวรแล้ว
      const start = Number(p.startBalance) || 0;
      let depIn = 0, wOut = 0;
      (p.deposits || []).forEach(d => { const a = Number(d.amount) || 0; if (a >= 0) depIn += a; else wOut += -a; });
      const grossDep = start + depIn;          // ฝากเข้ารวม (รวมทุนเริ่มต้น)
      const netCap = grossDep - wOut;          // ทุนสุทธิ
      const bal = netCap + net;                // พอร์ตจริง
      const money = (v) => '$' + Math.round(v).toLocaleString('en-US');
      // ledger: เรียงเก่า→ใหม่ เพื่อคิดยอดสะสม แล้วค่อยกลับด้านให้ล่าสุดอยู่บน
      const raw = (p.deposits || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
      let run = start; const withRun = raw.map(d => { const a = Number(d.amount) || 0; run += a; return { d, a, run }; });
      const movements = withRun.reverse().map(({ d, a, run }) => ({
        id: d.id, date: d.date, isW: a < 0,
        amtStr: '$' + Math.abs(Math.round(a)).toLocaleString('en-US'), // สี+ป้าย ฝาก/ถอน บอกทิศทางแล้ว ไม่ต้องมี +/−
        runStr: money(run), // ยอดทุน (ฝาก−ถอน) สะสมหลังรายการนี้
        del: (e) => { if (e) e.stopPropagation(); this.delMovement(p.id, d.id); },
      }));
      return {
        id: p.id, name: p.name, trades: ts.length,
        netStr: this._fmtMoney(net), netColor: pc(net),
        wr: closed ? Math.round(wins / closed * 100) : 0,
        avgRStr: ((rrN ? rrSum / rrN : 0) >= 0 ? '+' : '−') + Math.abs(rrN ? rrSum / rrN : 0).toFixed(2) + 'R',
        avgRColor: (rrN ? rrSum / rrN : 0) >= 0 ? GREEN : RED,
        startBalance: start,
        netCapStr: money(netCap), depositedStr: money(grossDep), withdrawnStr: wOut > 0 ? ('−' + money(wOut)) : '$0', hasCashFlow: (depIn > 0 || wOut > 0),
        equity: bal, equityStr: money(bal),
        setBalance: (e) => this.setPortfolioBalance(p.id, e.target.value),
        deposit: () => this.addFunds(p.id, false), withdraw: () => this.addFunds(p.id, true),
        movements, txnCount: movements.length, openTxns: (e) => { if (e) e.stopPropagation(); this.openTxns(p.id); },
        isCurrent: cpId === p.id,
        select: () => this.selectPortfolio(p.id),
        del: (e) => this.delPortfolio(p.id, e),
        rename: (e) => this.renamePortfolio(p.id, e.target.value),
      };
    });
    // ---- transaction history modal (ฝาก/ถอนเต็ม) ----
    const txnModal = st.txnPort ? portfolioStats.find(p => p.id === st.txnPort) : null;

    // ---- stats for the selected research phase ----
    // Backtest uses a zero-capital synthetic account, so archived/real cash flow can never
    // leak into a simulated result. Forward keeps the real portfolio balance sheet.
    const statPortfolios = activeMode === 'backtest'
      ? st.portfolios.map(p => ({ ...p, startBalance: 0, archivedPnl: 0, archivedCount: 0, deposits: [] }))
      : st.portfolios;
    const S = this._stats(trades, setups, statPortfolios, activeMode === 'backtest' ? 'all' : cpId, firstPf, st.goal, st.eqRange, st.edgeMetric);

    // ---- setup validation gates: discover in Backtest, verify out-of-sample in Forward ----
    // R is the comparison unit so trades with different position sizes remain comparable.
    const gateStats = (list) => {
      const closedRows = list.filter(t => t.status !== 'OPEN');
      // Gate decisions only use observations with a real outcome and a real 1R.
      // Missing risk cannot silently fall back to planned R:R and manufacture an edge.
      const xs = closedRows.filter(t => t._pnlValid && this._posRisk(t) > 0);
      const evidence = setupEvidenceFromNetTrades(xs);
      const quality = dataQualityReport(closedRows).score;
      return {
        ...evidence,
        pf: evidence.profitFactor,
        maxDD: evidence.maxDrawdownR,
        quality,
        excluded: closedRows.length - xs.length,
        wr: Math.round(evidence.winRate),
      };
    };
    const setupGates = setups.map(s => {
      const currentVersion = this._setupVersion(s);
      const bt = gateStats(backtestAll.filter(t => t.setupId === s.id && this._isCurrentSetupVersion(t, s)));
      const fw = gateStats(forwardAll.filter(t => t.setupId === s.id && this._isCurrentSetupVersion(t, s)));
      const btPass = bt.n >= 30 && bt.avgR > 0 && bt.pf >= 1.2 && bt.maxDD <= 10 && bt.holdoutPass;
      // Forward is the real out-of-sample confirmation. A positive 95% lower confidence
      // bound prevents a lucky but highly volatile 30-trade run being labelled confirmed.
      const fwPass = fw.n >= 30 && fw.avgR > 0 && fw.pf >= 1.1 && fw.ciLow > 0;
      let stage = 'collect', stageLabel = 'Collecting samples', stageNote = Math.max(0, 30 - bt.n) + ' backtest trades to first review', color = '#4D7FE8';
      if (bt.n >= 30 && !btPass) { stage = 'revise'; stageLabel = 'Revise setup'; stageNote = !bt.holdoutPass ? 'Chronological holdout did not retain the edge' : 'Backtest gate not passed'; color = '#E25462'; }
      if (btPass && fw.n < 30) { stage = 'forward'; stageLabel = 'Ready for Forward'; stageNote = Math.max(0, 30 - fw.n) + ' forward trades to validate'; color = '#7658E8'; }
      if (btPass && fw.n >= 30 && !fwPass) { stage = 'failed'; stageLabel = 'Not confirmed'; stageNote = 'Forward expectancy is not statistically stable yet'; color = '#E0A15A'; }
      if (btPass && fwPass) { stage = 'confirmed'; stageLabel = 'Edge confirmed'; stageNote = 'Positive out-of-sample expectancy with 95% confidence'; color = '#1C9B68'; }
      return {
        id: s.id, name: s.name || '(untitled)', version: currentVersion, versionLabel: 'v' + currentVersion, glyph: s.glyph, accent: s.accent, color, stage, stageLabel, stageNote,
        bt, fw, btPass, fwPass,
        btN: bt.n, fwN: fw.n, btProgress: Math.min(100, bt.n / 30 * 100) + '%', fwProgress: Math.min(100, fw.n / 30 * 100) + '%',
        btR: (bt.avgR >= 0 ? '+' : '−') + Math.abs(bt.avgR).toFixed(2) + 'R', fwR: (fw.avgR >= 0 ? '+' : '−') + Math.abs(fw.avgR).toFixed(2) + 'R',
        btPf: Number.isFinite(bt.pf) ? bt.pf.toFixed(2) : '∞', fwPf: Number.isFinite(fw.pf) ? fw.pf.toFixed(2) : '∞',
        btDd: '−' + bt.maxDD.toFixed(1) + 'R', quality: bt.quality + '%', fwQuality: fw.quality + '%',
        btExcluded: bt.excluded, fwExcluded: fw.excluded,
        holdoutR: (bt.holdout.avgR >= 0 ? '+' : '−') + Math.abs(bt.holdout.avgR).toFixed(2) + 'R', holdoutN: bt.holdout.n,
        fwCi: fw.n > 1 && Number.isFinite(fw.ciLow) ? ((fw.ciLow >= 0 ? '+' : '−') + Math.abs(fw.ciLow).toFixed(2) + 'R to ' + (fw.ciHigh >= 0 ? '+' : '−') + Math.abs(fw.ciHigh).toFixed(2) + 'R') : '—',
        open: () => this.openSetup(s.id),
      };
    });
    const qualityReport = dataQualityReport(trades);
    const qualityColor = qualityReport.score >= 85 ? '#53D69A' : (qualityReport.score >= 70 ? '#F0B75E' : '#FF6B7A');
    const dataQuality = {
      ...qualityReport,
      color: qualityColor,
      grade: qualityReport.score >= 85 ? 'Research ready' : (qualityReport.score >= 70 ? 'Needs cleanup' : 'Not reliable yet'),
      missing: qualityReport.missing.slice(0, 4).map((field) => ({ ...field, pct: qualityReport.count ? Math.round(field.count / qualityReport.count * 100) : 0 })),
      bySetup: qualityReport.bySetup.slice(0, 4).map((row) => ({
        ...row,
        name: row.setupId === '__missing__' ? 'No setup' : ((setups.find((setup) => setup.id === row.setupId) || {}).name || 'Unknown setup'),
        color: row.score >= 85 ? '#53D69A' : (row.score >= 70 ? '#F0B75E' : '#FF6B7A'),
      })),
    };
    const walkForwardRaw = walkForwardReport(trades, { windowSize: 30, step: 15, maxWindows: 6 });
    const walkForward = {
      ...walkForwardRaw,
      positiveRateLabel: Math.round(walkForwardRaw.positiveRate) + '%',
      windows: walkForwardRaw.windows.map((window) => ({
        ...window,
        avgRLabel: (window.avgR >= 0 ? '+' : '−') + Math.abs(window.avgR).toFixed(2) + 'R',
        pfLabel: Number.isFinite(window.profitFactor) ? window.profitFactor.toFixed(2) : '∞',
        ddLabel: '−' + window.maxDrawdownR.toFixed(1) + 'R',
        color: window.pass ? '#53D69A' : '#FF6B7A',
        rangeLabel: String(window.start || '').slice(5) + ' → ' + String(window.end || '').slice(5),
      })),
    };
    const driftRows = setups.map((setup) => {
      const btRows = backtestAll.filter(t => t.setupId === setup.id && this._isCurrentSetupVersion(t, setup));
      const fwRows = forwardAll.filter(t => t.setupId === setup.id && this._isCurrentSetupVersion(t, setup));
      const report = edgeDriftReport(btRows, fwRows, { windowSize: 30, minForward: 15 });
      const color = report.status === 'stable' ? '#53D69A' : (report.status === 'watch' ? '#F0B75E' : (report.status === 'at-risk' ? '#FF6B7A' : '#8D8798'));
      const statusLabel = report.status === 'stable' ? 'Stable' : (report.status === 'watch' ? 'Watch' : (report.status === 'at-risk' ? 'At risk' : 'Collecting'));
      return {
        id: setup.id,
        name: setup.name || '(untitled)',
        color,
        status: report.status,
        statusLabel,
        ready: report.ready,
        btN: report.baseline.n,
        fwN: report.recent.n,
        baselineR: (report.baseline.avgR >= 0 ? '+' : '−') + Math.abs(report.baseline.avgR).toFixed(2) + 'R',
        recentR: (report.recent.avgR >= 0 ? '+' : '−') + Math.abs(report.recent.avgR).toFixed(2) + 'R',
        deltaR: (report.deltaR >= 0 ? '+' : '−') + Math.abs(report.deltaR).toFixed(2) + 'R',
        note: report.ready
          ? (report.status === 'stable' ? 'Recent forward expectancy remains above the backtest evidence floor.' : (report.status === 'watch' ? 'Forward expectancy is positive but below the backtest evidence floor.' : 'Recent forward expectancy is negative. Freeze size and inspect execution/regime.'))
          : (Math.max(report.neededBacktest, report.neededForward) + ' more valid samples needed'),
      };
    }).sort((a, b) => {
      const order = { 'at-risk': 0, watch: 1, stable: 2, collecting: 3 };
      return order[a.status] - order[b.status];
    });
    const simulationR = trades
      .filter(t => t.status !== 'OPEN' && t._pnlValid && this._posRisk(t) > 0)
      .map(realizedRFromNetTrade);
    // Bootstrap is intentionally cached: typing in a note or opening a menu must not
    // rerun 120,000 path steps when the underlying trade sample did not change.
    const simulationRiskPct = st.simulationRiskPct || 1;
    const monteKey = { trades: st.trades, mode: activeMode, portfolio: cpId, risk: simulationRiskPct };
    const monteHit = this._monteCache
      && this._monteCache.key.trades === monteKey.trades
      && this._monteCache.key.mode === monteKey.mode
      && this._monteCache.key.portfolio === monteKey.portfolio
      && this._monteCache.key.risk === monteKey.risk;
    const monteCarloRaw = monteHit
      ? this._monteCache.value
      : monteCarloRisk(simulationR, { riskPct: simulationRiskPct, simulations: 1200, horizon: 100 });
    if (!monteHit) this._monteCache = { key: monteKey, value: monteCarloRaw };
    const pct1 = (value) => (Number(value) || 0).toFixed(1) + '%';
    const monteCarlo = {
      ...monteCarloRaw,
      ruinLabel: monteCarloRaw.ready ? pct1(monteCarloRaw.riskOfRuinPct) : '—',
      medianDdLabel: monteCarloRaw.ready ? pct1(monteCarloRaw.medianMaxDrawdownPct) : '—',
      p95DdLabel: monteCarloRaw.ready ? pct1(monteCarloRaw.p95MaxDrawdownPct) : '—',
      medianEndLabel: monteCarloRaw.ready ? ((monteCarloRaw.medianEndingPct >= 0 ? '+' : '−') + Math.abs(monteCarloRaw.medianEndingPct).toFixed(1) + '%') : '—',
    };
    const readySetups = setupGates.filter(s => s.btPass).length;
    const confirmedSetups = setupGates.filter(s => s.stage === 'confirmed').length;
    const backtestClosed = backtestAll.filter(t => t.status !== 'OPEN').length;
    const forwardClosed = forwardAll.filter(t => t.status !== 'OPEN').length;
    // One clear next step beats another passive metric. Prioritise invalidated rules,
    // then forward-test readiness, then sample collection, and finally monitoring.
    const focusGate = setupGates.find(g => g.stage === 'revise')
      || setupGates.find(g => g.stage === 'failed')
      || setupGates.find(g => g.stage === 'forward')
      || setupGates.find(g => g.stage === 'collect')
      || setupGates.find(g => g.stage === 'confirmed')
      || null;
    const focusAction = (() => {
      if (!focusGate) return { eyebrow: 'Next action', title: 'Create your first setup', body: 'Write one repeatable rule, then collect clean backtest samples.', cta: 'Create setup', color: '#8B6CF0', click: () => this.openNewSetup() };
      const label = focusGate.name + ' ' + focusGate.versionLabel;
      if (focusGate.stage === 'revise') return { eyebrow: 'Holdout warning', title: 'Refine ' + label, body: 'The newest third of the backtest did not preserve the edge. Change one rule, then create a new version.', cta: 'Review rules', color: '#E25462', click: focusGate.open };
      if (focusGate.stage === 'failed') return { eyebrow: 'Forward warning', title: 'Do not scale ' + label, body: 'The 95% confidence interval still includes zero. Keep the rules frozen and collect more evidence.', cta: 'Inspect evidence', color: '#E0A15A', click: () => this.setState({ view: 'analytics', journalMode: 'forward' }) };
      if (focusGate.stage === 'forward') return { eyebrow: 'Ready to validate', title: 'Forward test ' + label, body: 'Backtest and holdout passed. Run the same rules live without changing them mid-sample.', cta: 'Open Forward', color: '#8B6CF0', click: () => this.setState({ view: 'log', journalMode: 'forward', logPage: 0 }) };
      if (focusGate.stage === 'collect') return { eyebrow: 'Build the sample', title: 'Test ' + label, body: focusGate.stageNote + '. Keep risk and context fields complete so every R result is comparable.', cta: 'Add backtest', color: '#4D7FE8', click: () => this.setState({ view: 'log', journalMode: 'backtest', logPage: 0 }) };
      return { eyebrow: 'Edge monitor', title: label + ' is confirmed', body: 'Keep the rules frozen and watch for expectancy drift as the forward sample grows.', cta: 'Monitor edge', color: '#1C9B68', click: () => this.setState({ view: 'analytics', journalMode: 'forward' }) };
    })();
    const activeGate = gateStats(trades);
    const selectedQuality = activeGate.quality;
    const rDrawdownChart = (() => {
      const xs = trades.filter(t => t.status !== 'OPEN').slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.entryTime || '').localeCompare(String(b.entryTime || '')));
      let curve = 0, peak = 0;
      let vals = [0];
      xs.forEach(t => { curve += this._rMult(t); peak = Math.max(peak, curve); vals.push(peak - curve); });
      if (vals.length > 640) { const step = (vals.length - 1) / 639; vals = Array.from({ length: 640 }, (_, i) => vals[Math.round(i * step)]); }
      const max = Math.max(.0001, ...vals);
      const line = vals.map((v, i) => (i ? 'L' : 'M') + (vals.length <= 1 ? 0 : i / (vals.length - 1) * 640).toFixed(1) + ' ' + (v / max * 110).toFixed(1)).join(' ');
      return { line, area: line + ' L640 0 L0 0 Z' };
    })();

    // ---- milestone: the one number that never follows the portfolio switch ----
    // The road to a million is the whole account. Everything else on the page respects the
    // switcher; this deliberately does not, so the goal cannot appear to shrink just because
    // you looked at one broker. Cumulative net P&L (+ archived), never deposits.
    const gNum = this._n(st.goal) > 0 ? this._n(st.goal) : 1000000;
    const closedNetOf = (list) => list.reduce((s, t) => s + (t.status !== 'OPEN' ? this._n(t.pnl) : 0), 0);
    const milestoneNet = closedNetOf(forwardAll) + st.portfolios.reduce((s, p) => s + this._n(p.archivedPnl), 0);
    const milePct = Math.max(0, Math.min(100, gNum > 0 ? milestoneNet / gNum * 100 : 0));
    const usd = (v) => '$' + Math.round(v).toLocaleString('en-US');

    // Deleting a portfolio keeps its trades — "they stay but are no longer grouped" — so the
    // accounts on their own no longer add up to the whole. Total the way the dashboard does
    // (every closed trade), and show the leftovers instead of quietly dropping them.
    const liveIds = new Set(st.portfolios.map(p => p.id));
    const orphans = forwardAll.filter(t => t.portfolioId && !liveIds.has(t.portfolioId));
    const allCapital = st.portfolios.reduce((s, p) => s + this._n(p.startBalance)
      + (p.deposits || []).reduce((a, d) => a + this._n(d.amount), 0), 0);
    const allBal = allCapital + milestoneNet;
    const setupBars = S.setupBars;

    // ---- trade row mapper ----
    const sessColor = (s) => s === 'Tokyo' ? BLUE : (s === 'London' ? GOLD : PURPLE);
    // one stable colour per portfolio, so a mixed "All portfolio" log is readable at a glance
    const PORT_TINT = ['#7658E8', '#4D7FE8', '#1C9B68', '#C9A6E8', '#E0A15A', '#8FBFA6', '#DC9A9A'];
    const portTint = {};
    st.portfolios.forEach((p, i) => { portTint[p.id] = PORT_TINT[i % PORT_TINT.length]; });
    const mapTrade = (t0) => {
      const t = { ...t0, pnl: this._n(t0.pnl), rr: this._n(t0.rr) };
      const su = this._setupById(t.setupId);
      // cache รูปแบบวันที่ (toLocaleDateString แพง — วันที่ซ้ำกันเยอะ)
      if (!this._dShortCache) this._dShortCache = {};
      let dShort = this._dShortCache[t.date];
      if (!dShort) { const _d = this._asDate(t.date); dShort = this._dShortCache[t.date] = _d ? _d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'; }
      const chips = [];
      if (t.ltf) chips.push({ label: 'LTF · ' + t.ltf, color: '#9CC2E8' });
      if (t.mtf) chips.push({ label: 'MTF · ' + t.mtf, color: '#7658E8' });
      if (t.htf) chips.push({ label: 'HTF · ' + t.htf, color: '#B79CE8' });
      if (t.retest) chips.push({ label: 'Retest · ' + (t.retest === 'yes' ? 'Yes' : 'No'), color: t.retest === 'yes' ? '#1C9B68' : '#E25462' });
      if (t.fibo) chips.push({ label: 'Fibo · ' + t.fibo, color: '#7658E8' });
      if (t.entryType) chips.push({ label: 'Entry · ' + t.entryType, color: '#9CD3C0' });
      return {
        id: t.id, sym: t.sym || '—', side: t.side, setupName: su.name + ' v' + this._tradeSetupVersion(t), accent: su.accent,
        session: t.session, dateShort: dShort, chips,
        dowShort: this._dowShort(t.date), fullDate: this._fullDateLabel(t.date), dowColor: this._dowColor(t.date),
        dateLong: (() => { const dt = this._asDate(t.date); return dt ? (dt.getDate() + ' ' + this._EN_MONS_SHORT()[dt.getMonth()] + ' ' + dt.getFullYear()) : '—'; })(),
        ltf: t.ltf || '', mtf: t.mtf || '', htf: t.htf || '', retest: t.retest || '', fibo: t.fibo || '', entryType: t.entryType || '', slZone: t.slZone || '',
        sideColor: t.side === 'BUY' ? GREEN : RED,
        sessionColor: sessColor(t.session),
        pnlStr: t.status === 'OPEN' ? '—' : this._fmtMoney(t.pnl),
        pnlColor: t.status === 'OPEN' ? '#746E7D' : pc(t.pnl),
        rStr: t.status === 'OPEN' ? '—' : ((this._rMult(t) >= 0 ? '+' : '−') + Math.abs(this._rMult(t)).toFixed(1) + 'R'),
        rColor: t.status === 'OPEN' ? '#746E7D' : (this._rMult(t) > 0 ? GREEN : (this._rMult(t) < 0 ? RED : '#746E7D')),
        status: t.status, statusColor: t.status === 'OPEN' ? GOLD : '#928B9B',
        statusBg: t.status === 'OPEN' ? 'rgba(118,88,232,.14)' : 'rgba(49,35,73,.05)',
        holding: this._fmtDur(t.entryTime, t.exitTime), holdShort: this._fmtDurShort(t.entryTime, t.exitTime),
        entryHM: (t.entryTime && String(t.entryTime).length >= 16) ? String(t.entryTime).slice(11, 16) : '', exitHM: (t.exitTime && String(t.exitTime).length >= 16) ? String(t.exitTime).slice(11, 16) : '',
        lotStr: (t.lot != null && t.lot !== '') ? String(t.lot) : '—',
        commStr: (t.commission != null && String(t.commission).trim() !== '' && !isNaN(parseFloat(t.commission))) ? ('−$' + commissionCost(t.commission).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })) : '—',
        // max lot (from legs, fallback single lot) + MFE ($) for the log
        maxLotStr: (() => { const ml = this._legStats(t).maxLot; if (ml > 0) return ml.toFixed(2); return (t.lot != null && t.lot !== '') ? String(t.lot) : '—'; })(),
        mfeStr: (() => { const m = this._mfeUsd(t); return m > 0 ? '+$' + Math.round(m) : '—'; })(),
        // Max DD — the single drawdown read: legs DD (pip) if scaled, else old heat in R
        heatStr: (() => { const dd = this._legStats(t).maxDD; if (dd > 0) return dd + 'p'; const r = this._maeR(t); if (r != null && this._maeUsd(t) > 0) return r.toFixed(1) + 'R'; return '—'; })(),
        heatColor: (() => { const dd = this._legStats(t).maxDD; const base = Math.abs(Number(t.ddBaseline) || 0); if (dd > 0) return (base && dd > base) ? '#E25462' : '#5F5967'; const r = this._maeR(t); return (r == null || this._maeUsd(t) <= 0) ? '#746E7D' : (r >= 1 ? '#E25462' : (r >= 0.6 ? '#E0B15A' : '#9CD3C0')); })(),
        captureStr: (() => { const c = this._captureP(t); return c == null ? '—' : c + '%'; })(),
        captureColor: (() => { const c = this._captureP(t); return c == null ? '#746E7D' : (c >= 80 ? '#1C9B68' : (c >= 55 ? '#7658E8' : '#E25462')); })(),
        alignN: this._alignN(t), alignStr: this._alignN(t) + '/3',
        alignColor: this._alignN(t) >= 3 ? '#1C9B68' : (this._alignN(t) === 2 ? '#7658E8' : '#746E7D'),
        feelEntry: t.feelEntry || '', feelSL: t.feelSL || '', feelTP: t.feelTP || '',
        // edge factors surfaced straight in the log, so a scan of the table shows the conditions
        entryModel: this._entryModel(t),
        retestStr: (() => { const r = this._legRetest(t); return r === 'yes' ? '✓' : (r === 'no' ? '✗' : '—'); })(),
        retestColor: (() => { const r = this._legRetest(t); return r === 'yes' ? GREEN : (r === 'no' ? RED : '#5a5a62'); })(),
        // "OTE (0.62–0.79)" -> "OTE" — the zone name is what you compare, not the numbers
        fiboShort: (() => { const f = (this._legFibo(t) || '').trim(); if (!f) return '—'; const m = /^([^(]+)/.exec(f); return (m ? m[1] : f).trim(); })(),
        ...(() => { const ls = this._legStats(t); return { legN: ls.count, isMulti: ls.isMulti, legMaxLot: ls.maxLot ? ls.maxLot.toFixed(2) : '', legAvgEntry: ls.avgEntry != null ? this._fmtPrice(ls.avgEntry) : '', legMaxDD: ls.maxDD || 0 }; })(),
        notes: t.notes || '', pnlNum: t.pnl || 0, dateRaw: t.date, tags: t.tags || [],
        // which account this order belongs to — only surfaced when viewing every portfolio at once
        portName: this._portfolioName(t.portfolioId || firstPf),
        portColor: portTint[t.portfolioId || firstPf] || '#746E7D',
        open: () => this.openTrade(t.id),
      };
    };
    const sortedTrades = trades.slice().sort((a, b) => b.date.localeCompare(a.date));
    const recent = sortedTrades.slice(0, 6).map(mapTrade);
    // ---- edge snapshot (dashboard) — avg heat & capture across the system, not per-trade rows ----
    let _mfeSum = 0, _mfeN = 0, _capSum = 0, _capN = 0, _alignSum = 0, _alignN = 0;
    trades.forEach(t => {
      if (t.status === 'OPEN') return;
      const mfe = this._mfeUsd(t); if (mfe > 0) { _mfeSum += mfe; _mfeN++; }
      // "captured of the best move" only makes sense for winners — it's the "sold the pig" (TP-too-early) lens
      if (this._n(t.pnl) > 0) { const cp = this._captureP(t); if (cp != null) { _capSum += cp; _capN++; } }
      _alignSum += this._alignN(t); _alignN++;
    });
    const edge = {
      avgMfe: _mfeN ? '$' + Math.round(_mfeSum / _mfeN).toLocaleString('en-US') : '—',
      avgMfeColor: _mfeN ? GREEN : '#746E7D',
      avgCapture: _capN ? Math.round(_capSum / _capN) + '%' : '—',
      avgCaptureColor: _capN ? (Math.round(_capSum / _capN) >= 70 ? GREEN : (Math.round(_capSum / _capN) >= 50 ? GOLD : RED)) : '#746E7D',
      avgAlign: _alignN ? (_alignSum / _alignN).toFixed(1) + '/3' : '—',
      heatReady: _mfeN > 0, capReady: _capN > 0,
    };

    // log filter — กรอง/เรียงบนข้อมูลดิบก่อน แล้วค่อย map เฉพาะแถวที่โชว์จริง (เร็วแม้มีหลายหมื่นไม้)
    const lf = st.logFilter;
    const q = (st.logSearch || '').trim().toLowerCase();
    const LF = st.logF || {};
    const fieldMatch = (t, key) => { const want = LF[key]; if (!want || want === 'all') return true; if (want === '__none') return !((t[key] || '').trim()); return (t[key] || '') === want; };
    let filteredRaw = sortedTrades.filter(t => {
      const p = Number(t.pnl) || 0;
      if (lf === 'win') { if (!(t.status !== 'OPEN' && p > 0)) return false; }
      else if (lf === 'loss') { if (!(t.status !== 'OPEN' && p < 0)) return false; }
      else if (lf === 'open') { if (t.status !== 'OPEN') return false; }
      else if (lf === 'long') { if (t.side !== 'BUY') return false; }
      else if (lf === 'short') { if (t.side !== 'SELL') return false; }
      if (LF.day && LF.day !== 'all' && this._dowFull(t.date) !== LF.day) return false;
      if (LF.align && LF.align !== 'all' && String(this._alignN(t)) !== LF.align) return false;
      if (LF.session && LF.session !== 'all' && (t.session || '') !== LF.session) return false;
      if (LF.setup && LF.setup !== 'all' && (this._setupById(t.setupId).name + ' v' + this._tradeSetupVersion(t)) !== LF.setup) return false;
      if (LF.entryType && LF.entryType !== 'all' && this._entryModel(t) !== LF.entryType) return false;
      if (LF.retest && LF.retest !== 'all' && this._legRetest(t) !== LF.retest) return false;
      if (LF.fibo && LF.fibo !== 'all' && this._legFibo(t) !== LF.fibo) return false;
      if (!fieldMatch(t, 'ltf') || !fieldMatch(t, 'mtf') || !fieldMatch(t, 'htf') || !fieldMatch(t, 'slZone')) return false;
      if (!fieldMatch(t, 'marketRegime') || !fieldMatch(t, 'exitReason') || !fieldMatch(t, 'ruleAdherence')) return false;
      if (!fieldMatch(t, 'feelEntry') || !fieldMatch(t, 'feelSL') || !fieldMatch(t, 'feelTP')) return false;
      if (q && !(((t.sym || '') + ' ' + this._setupById(t.setupId).name + ' ' + (t.notes || '')).toLowerCase().includes(q))) return false;
      return true;
    });
    const so = st.logSort;
    if (so === 'date-asc') filteredRaw.sort((a, b) => a.date.localeCompare(b.date));
    else if (so === 'pnl-desc') filteredRaw.sort((a, b) => this._n(b.pnl) - this._n(a.pnl));
    else if (so === 'pnl-asc') filteredRaw.sort((a, b) => this._n(a.pnl) - this._n(b.pnl));
    // date-desc = ค่าเริ่มต้น (เรียงอยู่แล้ว)
    // Pagination จริง — ต่อให้มีหลายพันไม้ DOM จะมีแค่ 50 แถวเสมอ
    // Analytics ด้านบนยังคำนวณจาก filteredRaw ทั้งหมด ไม่ได้คำนวณเฉพาะหน้าที่เห็น
    const logTotal = filteredRaw.length;
    const logPageSize = 50;
    const logPageCount = Math.max(1, Math.ceil(logTotal / logPageSize));
    const logPage = Math.max(0, Math.min(st.logPage || 0, logPageCount - 1));
    const logStart = logPage * logPageSize;
    const logEnd = Math.min(logTotal, logStart + logPageSize);
    const filteredTrades = filteredRaw.slice(logStart, logEnd).map(mapTrade);
    // no "All" button — it's just the un-selected state; clicking an active one toggles back to all
    const filterDefs = [['win', 'Win'], ['loss', 'Loss'], ['long', 'Long'], ['short', 'Short']];
    const logFilters = filterDefs.map(([k, label]) => ({
      label, click: () => this.setState({ logFilter: lf === k ? 'all' : k, logPage: 0 }),
      fg: lf === k ? '#FFFFFF' : '#746E7D',
      bg: lf === k ? 'linear-gradient(180deg,#7658E8,#6747D8)' : 'rgba(49,35,73,.03)',
      border: lf === k ? 'none' : '1px solid rgba(49,35,73,.1)',
    }));
    // ---- analysis field filters + live stats + breakdown table ----
    const dayFull = this._DOW_FULL();
    const ANA_FIELDS = [['marketRegime', 'Market regime'], ['exitReason', 'Exit reason'], ['ruleAdherence', 'Rule adherence'], ['ltf', 'LTF'], ['mtf', 'MTF'], ['htf', 'HTF'], ['retest', 'Retest'], ['fibo', 'Fibo M15'], ['entryType', 'Entry'], ['feelEntry', 'Feeling · เข้า'], ['feelSL', 'Feeling · SL'], ['feelTP', 'Feeling · TP']];
    const distinctFor = (key) => { const set = new Set(this._fieldOpts(key)); trades.forEach(t => { const v = (t[key] || '').trim(); if (v) set.add(v); }); return Array.from(set); };
    // entry model / fibo now live on the legs; build their option lists from the leg-derived values
    const distinctEntry = (() => { const set = new Set(this._fieldOpts('legTrigger')); trades.forEach(t => { const v = (this._entryModel(t) || '').trim(); if (v) set.add(v); }); return Array.from(set); })();
    const distinctFibo = (() => { const set = new Set(this._fieldOpts('fibo')); trades.forEach(t => { const v = (this._legFibo(t) || '').trim(); if (v) set.add(v); }); return Array.from(set); })();
    const distinctSess = Array.from(new Set(trades.map(t => (t.session || '').trim()).filter(Boolean)));
    const distinctSetup = Array.from(new Set(trades.map(t => this._setupById(t.setupId).name + ' v' + this._tradeSetupVersion(t)).filter(Boolean)));
    const logFieldFilters = [{ key: 'day', label: 'Day', value: LF.day || 'all', options: [1, 2, 3, 4, 5, 6, 0].map(i => ({ v: dayFull[i], label: dayFull[i] })) }]
      // TF-alignment count — the key "combine 2/3 aligned + fibo …" edge lens
      .concat([{ key: 'align', label: 'TF aligned', value: LF.align || 'all', options: ['3', '2', '1', '0'].map(v => ({ v, label: v + '/3' })) }])
      .concat([{ key: 'setup', label: 'Setup', value: LF.setup || 'all', options: distinctSetup.map(v => ({ v, label: v })) }])
      .concat([{ key: 'session', label: 'Session', value: LF.session || 'all', options: distinctSess.map(v => ({ v, label: v })) }])
      .concat(ANA_FIELDS.map(([key, label]) => ({
        key, label, value: LF[key] || 'all',
        options: key === 'retest' ? [{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }] : (key === 'entryType' ? distinctEntry : (key === 'fibo' ? distinctFibo : distinctFor(key))).map(v => ({ v, label: v })),
      })));
    const anyLogF = Object.keys(LF).some(k => LF[k] && LF[k] !== 'all');
    const logAggRaw = this._aggStats(filteredRaw);
    const logAgg = {
      n: logAggRaw.n, closed: logAggRaw.closed,
      wrStr: logAggRaw.closed ? logAggRaw.wr + '%' : '—', wrColor: logAggRaw.closed ? (logAggRaw.wr >= 50 ? GREEN : RED) : '#746E7D',
      record: logAggRaw.wins + 'W · ' + logAggRaw.losses + 'L',
      netStr: this._fmtMoney(logAggRaw.net), netColor: pc(logAggRaw.net),
      avgRStr: (logAggRaw.avgR >= 0 ? '+' : '−') + Math.abs(logAggRaw.avgR).toFixed(2) + 'R', avgRColor: logAggRaw.avgR >= 0 ? GREEN : RED,
      anyFilter: anyLogF,
    };
    const dimDefs = {
      day: { label: 'Day of week', get: t => this._dowFull(t.date), order: [1, 2, 3, 4, 5, 6, 0].map(i => dayFull[i]) },
      ltf: { label: 'LTF condition', get: t => (t.ltf || '').trim() || '—' },
      mtf: { label: 'MTF condition', get: t => (t.mtf || '').trim() || '—' },
      htf: { label: 'HTF condition', get: t => (t.htf || '').trim() || '—' },
      retest: { label: 'Retest', get: t => { const r = this._legRetest(t); return r === 'yes' ? 'Yes' : (r === 'no' ? 'No' : '—'); }, order: ['Yes', 'No', '—'] },
      fibo: { label: 'Fibo M15 side', get: t => (this._legFibo(t) || '').trim() || '—' },
      entryType: { label: 'Entry model', get: t => (this._entryModel(t) || '').trim() || '—' },
      setup: { label: 'Setup version', get: t => this._setupById(t.setupId).name + ' v' + this._tradeSetupVersion(t) },
      session: { label: 'Session', get: t => t.session || '—' },
      marketRegime: { label: 'Market regime', get: t => (t.marketRegime || '').trim() || '—' },
      exitReason: { label: 'Exit reason', get: t => (t.exitReason || '').trim() || '—' },
      ruleAdherence: { label: 'Rule adherence', get: t => (t.ruleAdherence || '').trim() || '—' },
      align: { label: 'TF aligned', get: t => this._alignN(t) + '/3', order: ['3/3', '2/3', '1/3', '0/3'] },
      feelEntry: { label: 'Feeling · ตอนเข้า', get: t => (t.feelEntry || '').trim() || '—' },
      feelSL: { label: 'Feeling · ตอนวาง SL', get: t => (t.feelSL || '').trim() || '—' },
      feelTP: { label: 'Feeling · ตอนออก / TP', get: t => (t.feelTP || '').trim() || '—' },
    };
    // Only offer factors that actually VARY inside the current filter (≥2 distinct
    // values) — so the comparison is always meaningful and never a single-row echo
    // of the headline win rate. Keeps the panel consistent whatever you filter.
    const dimVaries = (def) => { const s = new Set(); for (const t of filteredRaw) { s.add(def.get(t) || '—'); if (s.size >= 2) return true; } return false; };
    const dimAvail = Object.keys(dimDefs).filter(k => dimVaries(dimDefs[k]));
    const hasCompare = dimAvail.length > 0;
    const dimKey = hasCompare ? (dimAvail.includes(st.logDim) ? st.logDim : dimAvail[0]) : (dimDefs[st.logDim] ? st.logDim : 'day');
    const dimDef = dimDefs[dimKey];
    const groups = {};
    filteredRaw.forEach(t => { const g = dimDef.get(t) || '—'; (groups[g] = groups[g] || []).push(t); });
    const groupKeys = Object.keys(groups);
    const groupAgg = {}; groupKeys.forEach(k => { groupAgg[k] = this._aggStats(groups[k]); });
    if (dimDef.order) groupKeys.sort((a, b) => { const ia = dimDef.order.indexOf(a), ib = dimDef.order.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    else groupKeys.sort((a, b) => groupAgg[b].net - groupAgg[a].net);
    // never let a rogue value make every bar width NaN
    const bmax = Math.max(1, ...groupKeys.map(k => Math.abs(this._n(groupAgg[k].net))));
    // An edge must (a) have enough trades behind it, and (b) beat YOUR OWN baseline by a real
    // margin — see _edgeRules() for why. Ranking alone would crown a 0%-win-rate day whenever
    // every group is losing; a 3-trade sample would crown noise. Both are now refused.
    const EB = this._edgeRules();
    const bMetric = st.edgeMetric === 'wr' ? 'wr' : 'r';
    const baseWr = logAggRaw.closed ? logAggRaw.wr : 0;
    const baseR = logAggRaw.closed ? logAggRaw.avgR : 0;
    const score = (a) => bMetric === 'wr' ? a.wr : a.avgR;
    const baseScore = bMetric === 'wr' ? baseWr : baseR;
    const minLift = bMetric === 'wr' ? EB.minLiftWr : EB.minLiftR;
    let bestKey = null, bestScore = -Infinity, biggest = 0;
    groupKeys.forEach(k => {
      const a = groupAgg[k];
      if (a.closed > biggest) biggest = a.closed;
      if (a.closed >= EB.minSample && score(a) > bestScore) { bestScore = score(a); bestKey = k; }
    });
    const edgeRows = groupKeys.filter(k => groupAgg[k].closed >= EB.minSample);
    const bestLift = bestKey != null ? (bestScore - baseScore) : 0;
    // on the win-rate lens a group that never wins can never be an edge, whatever the margin
    const winsSometimes = bestKey == null ? false : (bMetric === 'wr' ? groupAgg[bestKey].wr > 0 : true);
    const hasRealEdge = bestKey != null && winsSometimes && bestLift >= minLift;
    const fmtScore = (v) => bMetric === 'wr' ? (Math.round(v) + '%') : ((v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + 'R');
    const fmtLift = (v) => bMetric === 'wr' ? ((v > 0 ? '+' : '') + Math.round(v) + ' จุด') : ((v > 0 ? '+' : '−') + Math.abs(v).toFixed(2) + 'R');
    const logBreakdown = {
      dim: dimKey, dimLabel: dimDef.label, hasCompare, filteredCount: logTotal,
      dims: dimAvail.map(k => ({ v: k, label: dimDefs[k].label })),
      metric: bMetric,
      metricLabel: bMetric === 'wr' ? 'Win rate' : 'Expectancy (R)',
      metrics: [{ v: 'r', label: 'Expectancy (avg R)' }, { v: 'wr', label: 'Win rate' }],
      minSample: EB.minSample, strongSample: EB.strongSample,
      baselineStr: fmtScore(baseScore),
      // headline callout: enough sample, ≥2 comparable groups, and a genuine margin over baseline
      bestEdge: (hasRealEdge && edgeRows.length >= 2) ? {
        name: bestKey, dim: dimDef.label,
        wr: fmtScore(bestScore), n: groupAgg[bestKey].closed,
        baseWr: fmtScore(baseScore), lift: fmtLift(bestLift),
        conf: this._edgeConf(groupAgg[bestKey].closed),
      } : null,
      // when nothing qualifies, say exactly why instead of implying a winner
      noEdgeNote: (edgeRows.length < 2)
        ? (biggest >= EB.minSample
            ? null
            : 'ยังสรุปไม่ได้ — ต้องมีอย่างน้อย ' + EB.minSample + ' ไม้ต่อกลุ่ม (ตอนนี้กลุ่มใหญ่สุดมี ' + biggest + ' ไม้) ไม่งั้นตัวเลขคือ noise')
        : (!hasRealEdge
            ? (bMetric === 'wr' && bestKey != null && groupAgg[bestKey].wr <= 0
                ? 'ยังไม่มีปัจจัยไหนชนะเลยในชุดนี้ — ทุกกลุ่มยังขาดทุน'
                : 'ยังไม่มีกลุ่มไหนดีกว่าค่าเฉลี่ยรวม (' + fmtScore(baseScore) + ') ถึงเกณฑ์ ' + fmtLift(minLift) + ' — ยังไม่ถือว่าเป็น edge')
            : null),
      rows: groupKeys.map(k => {
        const a = groupAgg[k];
        const dowI = dayFull.indexOf(k);
        const conf = this._edgeConf(a.closed);
        return {
          name: k, nStr: a.n + (a.n === 1 ? ' trade' : ' trades'), n: a.closed,
          dot: dimKey === 'day' && dowI >= 0 ? this._DOW_COLORS()[dowI] : '#6747D8',
          wr: a.closed ? a.wr + '%' : '—', wrColor: a.closed ? (a.wr >= 50 ? GREEN : RED) : '#746E7D',
          record: a.wins + 'W · ' + a.losses + 'L', net: this._fmtMoney(a.net), netColor: pc(a.net),
          avgR: (a.avgR >= 0 ? '+' : '−') + Math.abs(a.avgR).toFixed(2) + 'R',
          avgRColor: a.avgR > 0 ? GREEN : (a.avgR < 0 ? RED : '#746E7D'),
          w: (Math.abs(a.net) / bmax * 100) + '%', barColor: a.net >= 0 ? GREEN : RED,
          best: hasRealEdge && k === bestKey,
          conf: conf.level, confLabel: conf.label, confColor: conf.color,
          thin: a.closed < EB.minSample,      // rendered dimmed: not enough evidence yet
        };
      }),
    };

    // ---- calendar (เลือกเดือนได้) ----
    const calYear = st.calYear, calMonth = st.calMonth; // calMonth 0-indexed
    const monthPrefix = calYear + '-' + String(calMonth + 1).padStart(2, '0');
    const dayPnl = {}; const dayTradesMap = {};
    trades.forEach(t => {
      if (String(t.date).slice(0, 7) !== monthPrefix) return;
      const dnum = parseInt(t.date.slice(8, 10), 10);
      if (!dayTradesMap[dnum]) { dayTradesMap[dnum] = []; dayPnl[dnum] = 0; }
      dayTradesMap[dnum].push(t);
      if (t.status !== 'OPEN') dayPnl[dnum] += t.pnl;
    });
    const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Monday-based leading offset (0=Mon)
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const _now = new Date();
    const isCurMonth = _now.getFullYear() === calYear && _now.getMonth() === calMonth;
    const today = isCurMonth ? _now.getDate() : -1;
    const calMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(calYear, calMonth, 1));
    const calMonthShort = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(calYear, calMonth, 1));
    const calDays = [];
    for (let i = 0; i < firstDow; i++) calDays.push({ day: '', pnl: '', trades: '', dot: '', bg: 'transparent', border: 'none', dayColor: 'transparent', fg: 'transparent', dotColor: 'transparent', cursor: 'default', click: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const has = !!dayTradesMap[d];
      const isToday = d === today;
      if (!has) {
        calDays.push({ day: String(d), pnl: '', trades: '', dot: '', bg: 'rgba(49,35,73,.02)', border: isToday ? '1.5px solid rgba(118,88,232,.5)' : '1px solid rgba(49,35,73,.05)', dayColor: '#928B9B', fg: 'transparent', dotColor: 'transparent', cursor: 'default', click: null });
      } else {
        const v = dayPnl[d]; const tn = dayTradesMap[d].length;
        const intensity = Math.min(1, Math.abs(v) / 2200);
        const bg = v >= 0 ? `rgba(28,155,104,${0.08 + intensity * 0.18})` : `rgba(226,84,98,${0.08 + intensity * 0.18})`;
        const hasOpen = dayTradesMap[d].some(x => x.status === 'OPEN');
        calDays.push({
          day: String(d), pnl: v === 0 ? '—' : this._fmtMoney(v), trades: tn + ' trades',
          dot: hasOpen ? '●' : '', dotColor: GOLD,
          bg, border: isToday ? '1.5px solid #7658E8' : '1px solid rgba(49,35,73,.07)',
          dayColor: isToday ? '#7658E8' : '#24202B', fg: pc(v),
          cursor: 'pointer',
          click: () => this.openDay(monthPrefix + '-' + String(d).padStart(2, '0')),
        });
      }
    }
    let monthTotal = 0; Object.values(dayPnl).forEach(v => monthTotal += v);

    // weekly summary — continuous Monday→Sunday ISO weeks (same week definition as the habit tracker)
    const _byWeek = {};
    trades.forEach(t => { const wk = this._isoWeekKey(new Date(t.date + 'T00:00:00')); if (!_byWeek[wk]) _byWeek[wk] = { s: 0, td: 0 }; _byWeek[wk].td++; if (t.status !== 'OPEN') _byWeek[wk].s += (Number(t.pnl) || 0); });
    const _Ms = this._EN_MONS_SHORT();
    const weeks = []; {
      const mStart = new Date(calYear, calMonth, 1), mEnd = new Date(calYear, calMonth + 1, 0);
      const cur = new Date(mStart); cur.setDate(mStart.getDate() - ((mStart.getDay() + 6) % 7)); // Monday on/before the 1st
      let wn = 1, guard = 0;
      while (cur <= mEnd && guard++ < 8) {
        const wEnd = new Date(cur); wEnd.setDate(cur.getDate() + 6);
        const g = _byWeek[this._isoWeekKey(cur)] || { s: 0, td: 0 };
        const label = 'Week ' + wn + ' · ' + _Ms[cur.getMonth()] + ' ' + cur.getDate() + '–' + (wEnd.getMonth() === cur.getMonth() ? wEnd.getDate() : _Ms[wEnd.getMonth()] + ' ' + wEnd.getDate());
        weeks.push({ label, pnl: g.td ? this._fmtMoney(g.s) : '—', color: g.s >= 0 ? GREEN : RED, meta: g.td ? (g.td + ' trades') : 'no trades' });
        cur.setDate(cur.getDate() + 7); wn++;
      }
    }

    // ---- mini heatmap (Dashboard = เดือนปัจจุบันเสมอ แยกจากปฏิทินที่เลื่อนได้) ----
    const heat = [];
    let dashMonthShort = '';
    {
      const hn = new Date();
      const hPrefix = hn.getFullYear() + '-' + String(hn.getMonth() + 1).padStart(2, '0');
      dashMonthShort = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(hn);
      const hFirstDow = (new Date(hn.getFullYear(), hn.getMonth(), 1).getDay() + 6) % 7; // Monday-based
      const hDays = new Date(hn.getFullYear(), hn.getMonth() + 1, 0).getDate();
      const hToday = hn.getDate();
      const hPnl = {}; const hHas = {};
      trades.forEach(t => {
        if (String(t.date).slice(0, 7) !== hPrefix) return;
        const dn = parseInt(t.date.slice(8, 10), 10);
        if (!hHas[dn]) { hHas[dn] = true; hPnl[dn] = 0; }
        if (t.status !== 'OPEN') hPnl[dn] += t.pnl || 0;
      });
      for (let i = 0; i < hFirstDow; i++) heat.push({ label: '', bg: 'transparent', fg: 'transparent', border: 'none', title: '' });
      for (let d = 1; d <= hDays; d++) {
        const has = !!hHas[d]; const isToday = d === hToday;
        if (!has) { heat.push({ label: String(d), bg: 'rgba(49,35,73,.03)', fg: '#3a3a42', border: isToday ? '1.5px solid rgba(118,88,232,.5)' : 'none', title: '' }); }
        else { const v = hPnl[d]; const intensity = Math.min(1, Math.abs(v) / 2200); const bg = v >= 0 ? `rgba(28,155,104,${0.25 + intensity * 0.5})` : `rgba(226,84,98,${0.25 + intensity * 0.45})`; heat.push({ label: String(d), bg, fg: '#0c0c10', border: isToday ? '1.5px solid #7658E8' : 'none', title: d + ' ' + dashMonthShort + ' · ' + this._fmtMoney(v) }); }
      }
    }

    // ---- analytics (จากเทรดจริง) ----
    const dowBars = S.dowBars, sessionBars = S.sessionBars, rDist = S.rDist, anaStats = S.anaStats;

    // ---- setup cards (จากเทรดจริง) ----
    const setupCards = setups.map(s => {
      const ts = trades.filter(t => t.setupId === s.id && this._isCurrentSetupVersion(t, s) && t.status !== 'OPEN');
      const p = ts.reduce((a, t) => a + (t.pnl || 0), 0);
      const w = ts.filter(t => t.pnl > 0).length;
      const wr = ts.length ? Math.round(w / ts.length * 100) : 0;
      const avgR = ts.length ? ts.reduce((a, t) => a + this._rMult(t), 0) / ts.length : 0;
      return {
        id: s.id, name: s.name || '(untitled)', versionLabel: 'v' + this._setupVersion(s), glyph: s.glyph, accent: s.accent, iconBg: this._tint(s.accent), desc: s.desc || '—',
        wrStr: wr + '%', tradesStr: String(ts.length), avgRStr: (avgR >= 0 ? '+' : '−') + Math.abs(avgR).toFixed(1) + 'R', rColor: avgR >= 0 ? GREEN : RED,
        pnlStr: this._fmtMoney(p), pnlColor: pc(p), wrW: wr + '%',
        open: () => this.openSetup(s.id), del: (e) => { e.stopPropagation(); this.deleteSetup2(s.id); },
      };
    });

    // ---- checklist ----
    const tab = st.checkTab; // 'weekly' | 'monthly' | 'yearly'
    const isWeekly = tab === 'weekly';
    const isYearly = tab === 'yearly';
    const which = tab;
    const scope = tab;
    const weekDefs = this._recentWeeks(4, st.periodOffsetW);
    const monthDefs = this._recentMonths(3, st.periodOffsetM);
    const yearDefs = this._recentYears(3, st.periodOffsetY);
    const periodOffset = isYearly ? st.periodOffsetY : (isWeekly ? st.periodOffsetW : st.periodOffsetM);
    const defs = isYearly ? yearDefs : (isWeekly ? weekDefs : monthDefs);
    const curKey = defs[0][0];
    const inList = (k) => defs.some(d => d[0] === k);
    const selKey = isYearly ? st.yearKey : (isWeekly ? st.weekKey : st.monthKey);
    const periodKey = inList(selKey) ? selKey : curKey;
    const items = this._periodItems(scope, periodKey); // รายการของรอบที่เลือกอยู่ (แยกตามสัปดาห์/เดือน/ปี)
    // นับความคืบหน้าของแต่ละรอบ โดยใช้รายการเฉพาะของรอบนั้นๆ
    const periodCheck = (pk) => { const its = this._periodItems(scope, pk); const c = (st.checks[scope] && st.checks[scope][pk]) || {}; let done = 0; its.forEach(it => { if (c[it.id]) done++; }); return { done, total: its.length }; };
    // เรียงการ์ดรอบจากซ้าย→ขวา เก่า→ใหม่ (รอบปัจจุบันอยู่ขวาสุด) — slice().reverse() ไม่กระทบ curKey/periodKey
    const periods = defs.slice().reverse().map(([key, label]) => {
      const r = periodCheck(key); const full = r.total > 0 && r.done === r.total; const sel = key === periodKey;
      return {
        label, click: () => this.setState(isYearly ? { yearKey: key } : (isWeekly ? { weekKey: key } : { monthKey: key })),
        bg: sel ? 'rgba(118,88,232,.14)' : 'rgba(49,35,73,.03)',
        border: sel ? '1px solid rgba(118,88,232,.45)' : '1px solid rgba(49,35,73,.07)',
        labelColor: sel ? '#7658E8' : '#24202B',
        dot: full ? GREEN : (r.done > 0 ? GOLD : '#928B9B'),
        status: full ? 'Done ✓' : (r.done + '/' + r.total),
      };
    });
    const curChecks = (st.checks[scope] && st.checks[scope][periodKey]) || {};
    const checkItems = items.map((it, i) => {
      const done = !!curChecks[it.id]; const editing = st.editCheck === (which + ':' + it.id);
      return {
        id: which + '-' + it.id, text: it.text, border: i === 0 ? 'none' : '1px solid rgba(49,35,73,.05)',
        boxBorder: done ? '1.5px solid #6747D8' : '1.5px solid rgba(49,35,73,.18)',
        boxBg: done ? 'linear-gradient(150deg,#7658E8,#6747D8)' : 'transparent', checkOp: done ? 1 : 0,
        textColor: done ? '#928B9B' : '#24202B', strike: done ? 'line-through' : 'none',
        toggle: () => this.toggleCheck(scope, periodKey, it.id),
        editing, notEditing: !editing,
        edit: () => this.editItem(which, it.id), commit: (e) => this.commitPeriodItem(scope, periodKey, it.id, e), key: (e) => { if (e.key === 'Enter') e.target.blur(); },
        del: () => this.delPeriodItem(scope, periodKey, it.id),
        draggable: true, dragging: st.dragId === ('c:' + it.id),
        onDragStart: (e) => { this.setState({ dragId: 'c:' + it.id }); if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', it.id); } catch (_) {} } },
        onDragEnter: () => { const dz = this.state.dragId; if (dz && dz.startsWith('c:') && dz !== ('c:' + it.id)) this.reorderPeriodItem(scope, periodKey, dz.slice(2), it.id); },
        onDragEnd: () => this.setState({ dragId: null }),
      };
    });
    let cdone = 0; items.forEach(it => { if (curChecks[it.id]) cdone++; });
    const readyPct = items.length ? Math.round(cdone / items.length * 100) : 0;
    const checkPeriodLabel = (defs.find(d => d[0] === periodKey) || ['', ''])[1];

    // ---- สรุปวินัย (Discipline) — ภาพรวมทุกรอบของ scope ที่กำลังดู ----
    const ds = this._disciplineStats(scope);
    const dColor = ds.avgPct >= 80 ? GREEN : (ds.avgPct >= 50 ? GOLD : RED);
    const scopeWord = isYearly ? 'yr' : (isWeekly ? 'wk' : 'mo');
    const disc = {
      pct: ds.avgPct + '%', pctNum: ds.avgPct, color: dColor,
      hasData: ds.counted > 0,
      caption: ds.counted > 0
        ? ('over ' + ds.counted + ' ' + scopeWord + ' · fully complete ' + ds.fullCount + ' ' + scopeWord)
        : ('no past ' + scopeWord + ' data yet'),
      grade: ds.avgPct >= 80 ? 'Excellent' : (ds.avgPct >= 50 ? 'Fair — keep going' : 'Rebuild discipline'),
      offset: 327 - 327 * ds.avgPct / 100,
      spark: ds.spark.map(s => ({
        h: Math.max(6, Math.round(s.ratio * 100)),
        bg: s.total > 0 && s.done === s.total ? GREEN : (s.done > 0 ? 'rgba(118,88,232,.7)' : 'rgba(49,35,73,.14)'),
        title: s.done + '/' + s.total,
      })),
      missed: ds.missed.map(m => ({
        text: m.text, pct: Math.round(m.adher * 100) + '%',
        w: Math.round(m.adher * 100),
        sub: 'missed ' + m.miss + '/' + m.present,
        barBg: m.adher >= 0.5 ? 'rgba(118,88,232,.6)' : 'rgba(224,90,90,.6)',
      })),
      allClear: ds.counted > 0 && ds.missed.length === 0,
    };

    // pre-trade — คีย์ตามวันที่จริง → รีเซ็ตเองทุกวัน
    const _pd = new Date();
    const preKey = _pd.getFullYear() + '-' + String(_pd.getMonth() + 1).padStart(2, '0') + '-' + String(_pd.getDate()).padStart(2, '0');
    const preChecks = (st.checks.pre && st.checks.pre[preKey]) || {};
    const preItems = st.preItems.map((it, i) => {
      const done = !!preChecks[it.id]; const editing = st.editCheck === ('pre:' + it.id);
      return {
        id: 'pre-' + it.id, text: it.text, border: i === 0 ? 'none' : '1px solid rgba(49,35,73,.05)',
        boxBorder: done ? '1.5px solid #6747D8' : '1.5px solid rgba(49,35,73,.18)',
        boxBg: done ? 'linear-gradient(150deg,#7658E8,#6747D8)' : 'transparent', checkOp: done ? 1 : 0,
        textColor: done ? '#928B9B' : '#24202B', strike: done ? 'line-through' : 'none',
        toggle: () => this.toggleCheck('pre', preKey, it.id),
        editing, notEditing: !editing,
        edit: () => this.editItem('pre', it.id), commit: (e) => this.commitItem('pre', it.id, e), key: (e) => { if (e.key === 'Enter') e.target.blur(); },
        del: () => this.delItem('pre', it.id),
        draggable: true, dragging: st.dragId === ('p:' + it.id),
        onDragStart: (e) => { this.setState({ dragId: 'p:' + it.id }); if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', it.id); } catch (_) {} } },
        onDragEnter: () => { const dz = this.state.dragId; if (dz && dz.startsWith('p:') && dz !== ('p:' + it.id)) this.reorderListItem('pre', dz.slice(2), it.id); },
        onDragEnd: () => this.setState({ dragId: null }),
      };
    });
    let pdone = 0; st.preItems.forEach(it => { if (preChecks[it.id]) pdone++; });
    const prePct = st.preItems.length ? Math.round(pdone / st.preItems.length * 100) : 0;
    const ringStroke = (p) => p === 100 ? GREEN : (p >= 50 ? GOLD : RED);
    const ringMsg = (p) => p === 100 ? 'Fully ready — trade with discipline' : (p >= 50 ? 'Almost ready — finish the list' : 'Not ready — don’t start yet');

    // affirmation details
    const affirmDetails = st.affirmDetails.map(a => {
      const editing = st.editDetailId === a.id;
      return { text: a.text, editing, notEditing: !editing, edit: () => this.editDetail(a.id), commit: (e) => this.commitDetail(a.id, e), key: (e) => { if (e.key === 'Enter') e.target.blur(); }, del: () => this.delDetail(a.id) };
    });

    // vision
    const visionItems = st.visionItems.map(v => {
      const editing = st.editVisionId === v.id;
      return { id: v.id, title: v.title, editing, notEditing: !editing, edit: () => this.editVision(v.id), commit: (e) => this.commitVision(v.id, e), key: (e) => { if (e.key === 'Enter') e.target.blur(); }, del: () => this.delVision(v.id) };
    });

    // ---- day modal (กรองด้วยวันที่จริง ไม่ผูกกับเดือนที่เปิดในปฏิทิน) ----
    let dayObj = {};
    if (st.dayDate) {
      const dayRaw = trades.filter(t => t.date === st.dayDate);
      const list = dayRaw.map(mapTrade);
      const dd = new Date(st.dayDate + 'T00:00');
      const total = dayRaw.reduce((a, t) => a + (t.status !== 'OPEN' ? (t.pnl || 0) : 0), 0);
      dayObj = {
        dayTitle: dd.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }),
        dayTrades: list, dayCount: list.length,
        dayPnlStr: this._fmtMoney(total), dayPnlColor: pc(total),
      };
    }

    // ---- trade modal draft ----
    const d = st.draft;
    let tradeVals = {};
    if (d) {
      const imgs = []; for (let i = 0; i < (d.imgCount || 2); i++) imgs.push({ tid: d.id, n: i });
      const draftMode = this._testMode(d);
      tradeVals = {
        tradeModalTag: (draftMode === 'backtest' ? 'Backtest sample' : 'Forward test') + ' · setup v' + this._tradeSetupVersion(d) + (st.draftIsNew ? ' · new entry' : ' · editing') + ' · autosaved',
        tradeModalTitle: st.draftIsNew ? 'Log a trade' : ((d.sym || 'Trade') + ' · ' + d.date),
        tradeAdvancedOpen: !!st.tradeAdvancedOpen,
        toggleTradeAdvanced: () => this.setState({ tradeAdvancedOpen: !st.tradeAdvancedOpen }),
        tradeAdvancedFilled: [d.marketRegime, d.exitReason, d.ruleAdherence, d.ltf, d.mtf, d.htf, d.feelEntry, d.feelSL, d.feelTP, d.mfe, d.peakPrice, d.exitPrice].filter(v => String(v || '').trim()).length + ((d.legs || []).filter(l => l && (l.price || l.risk || l.trigger)).length),
        dTestMode: draftMode,
        setBacktestMode: () => this.setD('testMode', 'backtest'),
        setForwardMode: () => this.setD('testMode', 'forward'),
        dSetupGate: setupGates.find(g => g.id === d.setupId) || null,
        dSym: d.sym, dSetup: d.setupId, dSession: d.session, dEntry: d.entry, dStop: d.stop, dTarget: d.target,
        dRR: String(d.rr), dPnl: String(d.pnl), dLot: d.lot != null ? String(d.lot) : '', dStatus: d.status, dEntryTime: d.entryTime, dExitTime: d.exitTime, dNotes: d.notes,
        setSym: (e) => this.setD('sym', e.target.value), setSetup: (e) => this.setD('setupId', e.target.value),
        setSession: (e) => this.setD('session', e.target.value), setEntry: (e) => this.setD('entry', e.target.value),
        setStop: (e) => this.setD('stop', e.target.value), setTarget: (e) => this.setD('target', e.target.value),
        setRR: (e) => this.setD('rr', e.target.value), setPnl: (e) => this.setD('pnl', e.target.value),
        setLot: (e) => this.setD('lot', e.target.value),
        dCommission: d.commission != null ? String(d.commission) : '', setCommission: (e) => this.setD('commission', e.target.value),
        dRisk: d.risk != null ? String(d.risk) : '', setRisk: (e) => this.setD('risk', e.target.value),
        // suggested 1R (price distance × lot) — click to fill; exact for $1/point instruments
        dRiskHint: (() => { const e = parseFloat(d.entry), s = parseFloat(d.stop), l = parseFloat(d.lot); if (isNaN(e) || isNaN(s) || Math.abs(e - s) <= 0) return null; const v = Math.abs(e - s) * (isNaN(l) || l <= 0 ? 1 : l); return { val: Math.round(v * 100) / 100, fill: () => this.setD('risk', String(Math.round(v * 100) / 100)) }; })(),
        // realized R preview from the entered risk
        dR: (() => { const risk = Math.abs(parseFloat(d.risk) || 0); const g = parseFloat(d.pnl); const c = commissionCost(d.commission); if (!risk || isNaN(g)) return null; const r = (g - c) / risk; return { str: (r >= 0 ? '+' : '−') + Math.abs(r).toFixed(2) + 'R', color: r > 0 ? '#1C9B68' : (r < 0 ? '#E25462' : '#746E7D') }; })(),
        dDayLabel: this._fullDateLabel(d.date),
        // ----- MFE / capture: enter TP + peak price → the system works out how far the trend ran -----
        dMfe: d.mfe != null ? String(d.mfe) : '', setMfe: (e) => this.setD('mfe', e.target.value),
        dExitPrice: d.exitPrice != null ? String(d.exitPrice) : '', setExitPrice: (e) => this.setD('exitPrice', e.target.value),
        dPeakPrice: d.peakPrice != null ? String(d.peakPrice) : '', setPeakPrice: (e) => this.setD('peakPrice', e.target.value),
        dAvgEntry: (() => { const a = this._legStats(d).avgEntry; return a != null ? this._fmtPrice(a) : ''; })(),
        // did the price fields produce an auto MFE? (drives the "auto ✓" hint + hides the manual $ input)
        // _autoMfe calibrates $/point from the realized P&L, and everywhere else in the app that
        // value is already NET. The draft still holds the gross figure, so net it first — otherwise
        // the modal and the log disagree about capture % for the very same trade.
        dMfeAuto: this._autoMfe({ ...d, pnl: this._netPnl(d) }) != null,
        dExc: (() => {
          // Work from one netted copy and the shared helpers — the log, analytics and the exports
          // all read these same functions, so the modal cannot report a different number.
          const netTrade = { ...d, pnl: this._netPnl(d) };
          const mfe = this._mfeUsd(netTrade);                                       // auto from prices, else the manual $
          const net = this._netPnl(d);
          if (!mfe) return null;
          const cap = this._captureP(netTrade);                                     // % of the peak run you kept
          const pig = this._pigUsd(netTrade);                                       // $ that ran AFTER your TP (winners only)
          // bar geometry: entry at 0 (left) → peak (MFE) at right; exit marker where you closed
          let exit = Math.max(0, Math.min(100, net / mfe * 100));
          let cls = 'good', msg = '';
          if (net <= 0) { cls = 'bad'; msg = 'ขาดทุนไม้นี้ — แต่ราคาเคยวิ่งให้ +$' + Math.round(mfe) + ' รีวิวว่าออกช้าไปหรือแผนพัง'; }
          else if (cap >= 80) { cls = 'good'; msg = 'เก็บ ' + cap + '% ของ move ที่ดีที่สุด — ออกสวย เกือบไม่เหลือหมู'; }
          else if (cap >= 55) { cls = 'warn'; msg = 'เก็บ ' + cap + '% · หลัง TP ราคายังวิ่งต่ออีก $' + Math.round(pig) + ' — ลอง trailing แทน TP นิ่ง'; }
          else { cls = 'bad'; msg = 'ขายหมู! เก็บแค่ ' + cap + '% · หลัง TP วิ่งต่ออีก $' + Math.round(pig) + ' — TP เร็วไปสำหรับรอบนี้'; }
          return { cap, capStr: cap + '%', pig: Math.round(pig), ranAfter: '+$' + Math.round(pig), exit, mfeStr: '+$' + Math.round(mfe), cls, msg, mfeReady: mfe > 0 };
        })(),
        // ----- timeframe alignment (HTF/MTF/LTF each aligned with the trade?) -----
        dAlignHTF: !!d.alignHTF, dAlignMTF: !!d.alignMTF, dAlignLTF: !!d.alignLTF, dAlignN: (d.alignHTF ? 1 : 0) + (d.alignMTF ? 1 : 0) + (d.alignLTF ? 1 : 0),
        toggleAlign: (k) => this.setD(k, !d[k]),
        // ----- multi-leg "เบิ้ล" (scaling-in) editor — the single place entries are captured -----
        dLegs: (() => {
          const legs = Array.isArray(d.legs) ? d.legs : [];
          let cum = 0;
          const rows = legs.map((l, i) => {
            const lot = Math.abs(parseFloat(l.lot) || 0); cum += lot;
            return { i, trigger: l.trigger || '', price: l.price || '', lot: l.lot || '', slBasis: l.slBasis || '', risk: l.risk || '', dd: l.dd || '', retest: l.retest || '', fibo: l.fibo || '',
              cum, cumStr: cum ? cum.toFixed(2) : '—',
              optsTrigger: this._fieldOptsWith('legTrigger', l.trigger), optsSL: this._fieldOptsWith('legSL', l.slBasis), optsFibo: this._fieldOptsWith('fibo', l.fibo),
              danger: /under/i.test(l.slBasis || '') };
          });
          const stats = this._legStats({ legs });
          const baseline = Math.abs(parseFloat(d.ddBaseline) || 0);
          const ddShown = Math.max(stats.maxDD, baseline);
          const ddPct = baseline > 0 ? Math.min(100, ddShown / baseline * 100) : (ddShown ? 100 : 0);
          return { rows, count: rows.length,
            maxLot: stats.maxLot ? stats.maxLot.toFixed(2) : '—',
            avgEntry: stats.avgEntry != null ? this._fmtPrice(stats.avgEntry) : '—',
            totalRisk: stats.totalRisk, totalRiskStr: stats.totalRisk ? '$' + this._fmtPrice(stats.totalRisk) : '—',
            maxDD: stats.maxDD || 0, ddShown, ddPct, over: baseline > 0 && ddShown > baseline, baseline,
            anyUnder: stats.anyUnder, ddBaseline: d.ddBaseline || '' };
        })(),
        addLeg: () => this.addLeg(), removeLeg: (i) => this.removeLeg(i),
        setLegTrigger: (i, e) => this.setLeg(i, 'trigger', e.target.value),
        setLegPrice: (i, e) => this.setLeg(i, 'price', e.target.value),
        setLegLot: (i, e) => this.setLeg(i, 'lot', e.target.value),
        setLegSL: (i, e) => this.setLeg(i, 'slBasis', e.target.value),
        setLegRisk: (i, e) => this.setLeg(i, 'risk', e.target.value),
        setLegDD: (i, e) => this.setLeg(i, 'dd', e.target.value),
        setLegRetest: (i, v) => this.setLeg(i, 'retest', v),
        setLegFibo: (i, e) => { const v = e.target.value; this.setLeg(i, 'fibo', v); if (v && !this._fieldOpts('fibo').includes(v)) this._recordOpt('fibo', v); },
        setDdBaseline: (e) => this.setD('ddBaseline', e.target.value),
        // ----- round summary (final rollup): commission/swap + gross P&L -> net, total risk, total R -----
        dSummary: (() => {
          // _posRisk covers both shapes: summed leg risk when scaled in, else the trade's own
          // risk field (older single-entry rows) — matching what the log and exports use.
          const totalRisk = this._posRisk(d);
          const gross = parseFloat(d.pnl) || 0, comm = commissionCost(d.commission);
          const net = gross - comm;
          const open = d.status === 'OPEN';
          const r = (!open && totalRisk > 0) ? net / totalRisk : null;
          return {
            grossStr: open ? '—' : (gross >= 0 ? '+$' : '−$') + Math.abs(gross).toLocaleString('en-US', { maximumFractionDigits: 2 }),
            commStr: comm ? '−$' + Math.abs(comm).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '$0',
            netStr: open ? '—' : (net >= 0 ? '+$' : '−$') + Math.abs(net).toLocaleString('en-US', { maximumFractionDigits: 2 }),
            netColor: open ? '#746E7D' : (net >= 0 ? '#1C9B68' : '#E25462'),
            totalRiskStr: totalRisk ? '$' + this._fmtPrice(totalRisk) : '—',
            rStr: r != null ? (r >= 0 ? '+' : '') + r.toFixed(2) + 'R' : '—',
            rColor: r == null ? '#746E7D' : (r >= 0 ? '#1C9B68' : '#E25462'),
            riskMissing: !open && totalRisk <= 0,
          };
        })(),
        // ----- per-timeframe cards (Ble Yup style): name + factors + image + aligned -----
        tfCards: ['htf', 'mtf', 'ltf'].map(tf => {
          const meta = (d.tfMeta || {})[tf] || {};
          const alignKey = tf === 'htf' ? 'alignHTF' : (tf === 'mtf' ? 'alignMTF' : 'alignLTF');
          const condKey = tf; // ltf/mtf/htf condition selects already exist
          return {
            tf, role: tf.toUpperCase(),
            sub: tf === 'htf' ? 'บริบท · Zone ใหญ่' : (tf === 'mtf' ? 'setup · โครงสร้าง' : 'execution · เข็ม'),
            timeframe: meta.timeframe || '', factors: meta.factors || '',
            cond: d[condKey] || '', condOpts: this._fieldOptsWith(condKey, d[condKey]),
            aligned: !!d[alignKey], alignKey,
            slotId: 'trade-' + d.id + '-tf-' + tf, imgVal: (st.images || {})[('trade-' + d.id + '-tf-' + tf)],
            setTimeframe: (e) => this.setTfMeta(tf, 'timeframe', e.target.value),
            setFactors: (e) => this.setTfMeta(tf, 'factors', e.target.value),
            setCond: (e) => this.setDField(condKey, e.target.value),
          };
        }),
        // ----- round metadata (Ble Yup section 01) -----
        dBias: d.bias || d.side || '', setBias: (v) => this.setD('bias', v),
        // ----- feeling on entry / SL / TP (free text) -----
        dFeelEntry: d.feelEntry || '', dFeelSL: d.feelSL || '', dFeelTP: d.feelTP || '',
        setFeelEntry: (e) => this.setD('feelEntry', e.target.value), setFeelSL: (e) => this.setD('feelSL', e.target.value), setFeelTP: (e) => this.setD('feelTP', e.target.value),
        optsFeelEntry: this._fieldOptsWith('feelEntry', d.feelEntry), optsFeelSL: this._fieldOptsWith('feelSL', d.feelSL), optsFeelTP: this._fieldOptsWith('feelTP', d.feelTP),
        dMarketRegime: d.marketRegime || '', dExitReason: d.exitReason || '', dRuleAdherence: d.ruleAdherence || '',
        optsMarketRegime: this._fieldOptsWith('marketRegime', d.marketRegime), optsExitReason: this._fieldOptsWith('exitReason', d.exitReason), optsRuleAdherence: this._fieldOptsWith('ruleAdherence', d.ruleAdherence),
        setMarketRegime: (e) => this.setDField('marketRegime', e.target.value), setExitReason: (e) => this.setDField('exitReason', e.target.value), setRuleAdherence: (e) => this.setDField('ruleAdherence', e.target.value),
        dLtf: d.ltf || '', dMtf: d.mtf || '', dHtf: d.htf || '', dRetest: d.retest || '', dFibo: d.fibo || '', dEntryType: d.entryType || '', dSlZone: d.slZone || '',
        optsLtf: this._fieldOptsWith('ltf', d.ltf), optsMtf: this._fieldOptsWith('mtf', d.mtf), optsHtf: this._fieldOptsWith('htf', d.htf), optsFibo: this._fieldOptsWith('fibo', d.fibo), optsEntryType: this._fieldOptsWith('entryType', d.entryType), optsSlZone: this._fieldOptsWith('slZone', d.slZone),
        setLtf: (e) => this.setDField('ltf', e.target.value), setMtf: (e) => this.setDField('mtf', e.target.value), setHtf: (e) => this.setDField('htf', e.target.value),
        setFibo: (e) => this.setDField('fibo', e.target.value), setEntryType: (e) => this.setDField('entryType', e.target.value), setSlZone: (e) => this.setDField('slZone', e.target.value),
        setRetest: (v) => this.setD('retest', d.retest === v ? '' : v),
        dTags: d.tags || [], tagList: st.tags,
        toggleTag: (tag) => this.toggleDraftTag(tag), delTag: (tag, e) => this.delTagGlobal(tag, e),
        addTagKey: (e) => { if (e.key === 'Enter') { this.addTag(e.target.value); e.target.value = ''; } },
        setStatus: (e) => this.setD('status', e.target.value), setEntryTime: (e) => this.setD('entryTime', e.target.value),
        setExitTime: (e) => this.setD('exitTime', e.target.value), setNotes: (e) => this.setD('notes', e.target.value),
        // 24h server-time entry: date half + free-typed HH:MM half (never locale AM/PM)
        dEntryDate: this._dtDate(d.entryTime), dExitDate: this._dtDate(d.exitTime),
        dEntryHM: this._hmValue('entryTime'), dExitHM: this._hmValue('exitTime'),
        setEntryDate: (e) => this.setDTDate('entryTime', e), setExitDate: (e) => this.setDTDate('exitTime', e),
        setEntryHM: (e) => this.setDTTime('entryTime', e), setExitHM: (e) => this.setDTTime('exitTime', e),
        blurEntryHM: () => this.commitDTTime('entryTime'), blurExitHM: () => this.commitDTTime('exitTime'),
        setBuy: () => this.setD('side', 'BUY'), setSell: () => this.setD('side', 'SELL'),
        buyStyle: 'flex:1;text-align:center;padding:11px;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;transition:.14s;' + (d.side === 'BUY' ? 'background:rgba(28,155,104,.14);border:1px solid rgba(28,155,104,.45);color:#1C9B68' : 'background:rgba(49,35,73,.03);border:1px solid rgba(49,35,73,.1);color:#746E7D'),
        sellStyle: 'flex:1;text-align:center;padding:11px;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;transition:.14s;' + (d.side === 'SELL' ? 'background:rgba(226,84,98,.14);border:1px solid rgba(226,84,98,.45);color:#E25462' : 'background:rgba(49,35,73,.03);border:1px solid rgba(49,35,73,.1);color:#746E7D'),
        holdingDur: this._fmtDur(d.entryTime, d.exitTime),
        setupOptions: setups.map(s => {
          const gate = setupGates.find(g => g.id === s.id);
          return { id: s.id, name: (s.name || '(setup)') + ' · v' + this._setupVersion(s) + (draftMode === 'forward' ? (gate && gate.btPass ? ' · Ready ✓' : ' · Not validated') : '') };
        }),
        dPortfolio: d.portfolioId || (st.portfolios[0] ? st.portfolios[0].id : ''),
        setPortfolio: (e) => this.setD('portfolioId', e.target.value),
        portfolioOptions: st.portfolios.map(p => ({ id: p.id, name: p.name })),
        tradeImgs: imgs,
        canDelete: !st.draftIsNew, dStatusOpen: d.status === 'OPEN', canAddImg: (d.imgCount || 2) < 6,
        pnlBorder: (parseFloat(d.pnl) < 0) ? 'rgba(226,84,98,.4)' : 'rgba(49,35,73,.12)',
        pnlInputColor: (parseFloat(d.pnl) < 0) ? '#E25462' : (parseFloat(d.pnl) > 0 ? '#1C9B68' : '#24202B'),
        saveTrade: () => this.saveTrade(), deleteTrade: () => this.deleteTrade(),
        duplicateTrade: () => this.duplicateTrade(), canDuplicate: !st.draftIsNew,
        openNewForDay: () => this.openNew(st.dayDate),
      };
    }

    // ---- setup modal draft ----
    const sd = st.sDraft;
    let setupVals = {};
    if (sd) {
      const choices = [GREEN, GOLD, BLUE, PURPLE, RED];
      setupVals = {
        setupModalTag: st.setupIsNew ? 'New setup · autosaved' : 'Setup v' + this._setupVersion(sd) + ' · autosaved',
        setupModalTitle: st.setupIsNew ? 'New setup' : (sd.name || 'Setup'),
        sId: sd.id, sName: sd.name, sDesc: sd.desc, sUsage: sd.usage,
        setSName: (e) => this.setS('name', e.target.value), setSDesc: (e) => this.setS('desc', e.target.value), setSUsage: (e) => this.setS('usage', e.target.value),
        accentChoices: choices.map(c => ({ color: c, pick: () => this.setS('accent', c), border: sd.accent === c ? '2px solid #fff' : '2px solid transparent' })),
        canDeleteSetup: !st.setupIsNew,
        setupStats: (() => {
          const sts = netAll.filter(t => t.setupId === sd.id && this._isCurrentSetupVersion(t, sd) && t.status !== 'OPEN');
          const sp = sts.reduce((a, t) => a + (t.pnl || 0), 0);
          const sw = sts.filter(t => t.pnl > 0).length;
          const sr = sts.length ? sts.reduce((a, t) => a + this._rMult(t), 0) / sts.length : 0;
          return [
            { l: 'Net P&L', v: this._fmtMoney(sp), c: pc(sp) },
            { l: 'Win rate', v: (sts.length ? Math.round(sw / sts.length * 100) : 0) + '%', c: '#24202B' },
            { l: 'Trades', v: String(sts.length), c: '#24202B' },
            { l: 'Avg R', v: (sr >= 0 ? '+' : '−') + Math.abs(sr).toFixed(2) + 'R', c: sr >= 0 ? GREEN : RED },
          ];
        })(),
        setupVersion: this._setupVersion(sd), versionHistoryN: (sd.versionHistory || []).length,
        canBumpSetup: !st.setupIsNew, bumpSetupVersion: () => this.bumpSetupVersion(),
        showSetupStats: !st.setupIsNew,
        setupImgs: (() => { const c = sd.imgCount || 1; const a = []; for (let n = 0; n < c; n++) a.push({ n, slotId: n === 0 ? ('setup-' + sd.id + '-chart') : ('setup-' + sd.id + '-chart-' + n) }); return a; })(),
        canAddSetupImg: (sd.imgCount || 1) < 6, addSetupImg: () => this.addSetupImg(),
        saveSetup: () => this.saveSetup(), deleteSetup: () => this.deleteSetup(),
      };
    }

    // ---- plan reminder modal ----
    let planVals = {};
    if (st.showPlan) {
      const scope = st.planScope, key = st.planKey;
      const planItemsSrc = this._periodItems(scope, key); // รายการเฉพาะของรอบที่กำลังวางแผน
      const cur = (st.checks[scope] && st.checks[scope][key]) || {};
      let pdone = 0;
      const planItems = planItemsSrc.map((it, i) => {
        const done = !!cur[it.id]; if (done) pdone++;
        const editing = st.editPlan === (scope + ':' + it.id);
        return {
          text: it.text, border: i === 0 ? 'none' : '1px solid rgba(49,35,73,.05)',
          boxBorder: done ? '1.5px solid #6747D8' : '1.5px solid rgba(49,35,73,.18)',
          boxBg: done ? 'linear-gradient(150deg,#7658E8,#6747D8)' : 'transparent', checkOp: done ? 1 : 0,
          textColor: done ? '#928B9B' : '#24202B', strike: done ? 'line-through' : 'none',
          toggle: () => this.toggleCheck(scope, key, it.id),
          editing, notEditing: !editing,
          edit: () => this.editPlanItem(scope, it.id), commit: (e) => this.commitPeriodItem(scope, key, it.id, e), key: (e) => { if (e.key === 'Enter') e.target.blur(); },
          del: () => this.delPeriodItem(scope, key, it.id),
        };
      });
      planVals = {
        planTitle: scope === 'weekly' ? 'Plan next week' : (scope === 'yearly' ? 'Plan next year' : 'Plan next month'),
        planTag: scope === 'weekly' ? 'Weekly planning' : (scope === 'yearly' ? 'Yearly planning' : 'Monthly planning'),
        planLabel: st.planLabel, planItems, planFrac: pdone + ' / ' + planItemsSrc.length,
        planClose: () => this.closePlan(),
        planAddKey: (e) => { if (e.key === 'Enter') { this.addPeriodItem(scope, key, e.target.value); e.target.value = ''; } },
      };
    }

    return {
      navDash: this.navStyle('dashboard'), navCal: this.navStyle('calendar'), navLog: this.navStyle('log'),
      navAna: this.navStyle('analytics'), navSet: this.navStyle('setups'), navCheck: this.navStyle('checklist'),
      navPlay: this.navStyle('playbook'),
      goDash: () => this.setView('dashboard'), goCal: () => this.setView('calendar'), goLog: () => this.setView('log'),
      goAna: () => this.setView('analytics'), goSet: () => this.setView('setups'), goCheck: () => this.setView('checklist'),
      goPlay: () => this.setView('playbook'),
      goBacktest: () => this.setState({ view: 'log', journalMode: 'backtest', logPage: 0 }, () => this._save()),
      goForward: () => this.setState({ view: 'log', journalMode: 'forward', logPage: 0 }, () => this._save()),
      showBacktestAnalytics: () => this.setState({ view: 'analytics', journalMode: 'backtest' }, () => this._save()),
      showForwardAnalytics: () => this.setState({ view: 'analytics', journalMode: 'forward' }, () => this._save()),
      selectBacktest: () => this.setState({ journalMode: 'backtest', logPage: 0 }, () => this._save()),
      selectForward: () => this.setState({ journalMode: 'forward', logPage: 0 }, () => this._save()),
      journalMode: activeMode, isBacktestMode: activeMode === 'backtest',
      modeLabel: activeMode === 'backtest' ? 'Backtest' : 'Forward Test',
      journalEyebrow: activeMode === 'backtest' ? 'Discovery lab' : 'Live validation',
      journalTitle: activeMode === 'backtest' ? 'Backtest Journal' : 'Forward Test Journal',
      journalSubtitle: activeMode === 'backtest' ? 'สร้าง sample ที่สะอาดเพื่อค้นหา setup ที่ทำซ้ำได้' : 'ทดสอบ edge เดิมกับตลาดจริง โดยไม่เปลี่ยนกติกากลางทาง',
      isDash: st.view === 'dashboard', isCal: st.view === 'calendar', isLog: st.view === 'log',
      isAna: st.view === 'analytics', isSet: st.view === 'setups', isCheck: st.view === 'checklist',
      isPlay: st.view === 'playbook',
      accountName: st.accountName, editName: st.editName, notEditName: !st.editName,
      startName: () => this.startName(), commitName: (e) => this.commitName(e), onNameKey: (e) => this.onNameKey(e),
      affirmation: st.affirmation, editAffirm: st.editAffirm, notEditAffirm: !st.editAffirm,
      startAffirm: () => this.startAffirm(), commitAffirm: (e) => this.commitAffirm(e), onAffirmKey: (e) => this.onAffirmKey(e),
      affirmDetails, addAffirmDetail: () => this.addAffirmDetail(),
      clock: this._now(), tzAbbr: this._tzAbbr(), todayLabel: this._todayLabel(),
      portfolios: st.portfolios, currentPortfolioId: cpId,
      currentPortfolioName: cpId === 'all' ? 'All portfolio' : this._portfolioName(cpId),
      // the switcher doubles as a balance sheet: every account's current equity, and the sum
      portMenu: portfolioStats.map(p => ({ id: p.id, name: p.name, balStr: p.equityStr, tint: portTint[p.id] || '#746E7D' })),
      allBalStr: usd(allBal),
      orphanRow: orphans.length ? { n: orphans.length, netStr: this._fmtMoney(closedNetOf(orphans)) } : null,
      // a portfolio column only earns its width when several accounts are mixed in one view
      showPort: cpId === 'all' && st.portfolios.length > 1,
      showPortMenu: st.showPortMenu, togglePortMenu: () => this.setState({ showPortMenu: !st.showPortMenu, showUserMenu: false }),
      selectPortfolio: (id) => this.selectPortfolio(id), delPortfolio: (id, e) => this.delPortfolio(id, e),
      openAccount: () => this.openAccount(), isAccount: st.view === 'account', goAccount: () => this.setView('account'),
      portfolioStats, newPortName: st.newPortName, setNewPortName: (e) => this.setNewPortName(e.target.value),
      acctTotalEquity: usd(allBal),
      acctTotalNet: this._fmtMoney(milestoneNet),
      acctTotalNetColor: pc(milestoneNet),
      calToday: () => { const n = new Date(); this.setState({ calYear: n.getFullYear(), calMonth: n.getMonth() }); },
      addPortfolioNamed: () => this.addPortfolioNamed(), addPortKey: (e) => { if (e.key === 'Enter') this.addPortfolioNamed(); },
      showUserMenu: st.showUserMenu, toggleUserMenu: () => { const open = !st.showUserMenu; this.setState({ showUserMenu: open, showPortMenu: false }); if (open) this._loadStorageUsage(); },
      ...this._storageVals(st),
      avatarLetter: ((this.props.userEmail || st.accountName || 'G').trim().charAt(0) || 'G').toUpperCase(),
      userEmail: this.props.userEmail || '',
      signOut: () => this.props.onSignOut && this.props.onSignOut(),
      showReset: st.showReset, openReset: () => this.openReset(), closeReset: () => this.closeReset(), doReset: () => this.resetJournal(),
      backupJournal: () => this.backupJournal(), restoreJournal: (f) => this.restoreJournal(f), archiveOldTrades: (m) => this.archiveOldTrades(m),
      lastBackupStr: st.lastBackup ? new Date(st.lastBackup).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never',
      backupWarn: this._backupWarn(),
      doBackup: () => this.backupJournal(true),
      doBackupLight: () => this.backupJournal(false),
      snoozeBackup: () => this.setState({ backupSnooze: Date.now() + 3 * 86400000 }, () => this._save()),
      exportWord: () => this.exportWord(), exporting: st.exporting, exportCSV: () => this.exportCSV(),
      importCSV: (f) => this.importCSV(f),
      exportRange: st.exportRange, setExportRange: (e) => this.setState({ exportRange: e.target.value }),
      stop: (e) => e.stopPropagation(),
      // KPI
      kEquity: activeMode === 'backtest' ? S.kNet : S.kEquity,
      kEquityLabel: activeMode === 'backtest' ? 'Backtest net' : 'Equity',
      kNet: S.kNet, kNetColor: S.kNetColor, kWin: S.kWin,
      kPf: activeMode === 'backtest' ? (Number.isFinite(activeGate.pf) ? activeGate.pf.toFixed(2) : (activeGate.n ? '∞' : '0.00')) : S.kPf,
      kR: S.kR,
      kDD: activeMode === 'backtest' ? ('−' + activeGate.maxDD.toFixed(1) + 'R') : S.kDD,
      donut: S.donut,
      totalClosed: S.totalClosed, winsN: S.winsN, lossesN: S.lossesN, startBalStr: S.startBalStr, archNote: S.archNote,
      eqRange: st.eqRange, setEqRange: (r) => this.setState({ eqRange: r }),
      equityLine: S.equityLine, equityArea: S.equityArea, equityLastY: S.equityLastY, equityPoints: S.equityPoints, equityZeroY: S.equityZeroY,
      equityPeakStr: S.equityPeakStr, equityGrowthStr: S.equityGrowthStr, equityGrowthColor: S.equityGrowthColor,
      capitalInStr: S.capitalInStr, depositedStr: S.depositedStr, cashOutStr: S.cashOutStr, hasCashFlow: S.hasCashFlow, balanceStr: S.balanceStr, netProfitStr: S.netProfitStr, netProfitColor: S.netProfitColor,
      milestoneEquity: this._fmtMoney(milestoneNet),
      milestonePct: milePct.toFixed(1) + '%', milestoneWidth: milePct.toFixed(1) + '%',
      goalStr: usd(gNum), goalNum: gNum, editGoal: st.editGoal,
      milestoneMarks: ['$0', usd(gNum / 3), usd(2 * gNum / 3), usd(gNum) + ' 🏁'],
      // say so, so the number never looks like a bug when a single portfolio is selected
      milestoneScope: st.portfolios.length > 1 ? 'ทุกพอร์ตรวมกัน · all portfolios' : 'cumulative P&L',
      startGoal: () => this.startGoal(), commitGoal: (e) => this.commitGoal(e), onGoalKey: (e) => this.onGoalKey(e),
      setupBars, recent, edge, filteredTrades, logFilters, tradeCount: trades.length, filteredCount: logTotal,
      logPage, logPageCount,
      logRangeLabel: logTotal ? ((logStart + 1) + '–' + logEnd + ' of ' + logTotal) : '0 trades',
      logPageLabel: 'Page ' + (logPage + 1) + ' / ' + logPageCount,
      logCanPrev: logPage > 0, logCanNext: logPage < logPageCount - 1,
      logFirst: () => { this.setState({ logPage: 0 }); if (this._scrollRoot) this._scrollRoot.scrollTo({ top: 0, behavior: 'smooth' }); },
      logPrev: () => { this.setState({ logPage: Math.max(0, logPage - 1) }); if (this._scrollRoot) this._scrollRoot.scrollTo({ top: 0, behavior: 'smooth' }); },
      logNext: () => { this.setState({ logPage: Math.min(logPageCount - 1, logPage + 1) }); if (this._scrollRoot) this._scrollRoot.scrollTo({ top: 0, behavior: 'smooth' }); },
      logLast: () => { this.setState({ logPage: logPageCount - 1 }); if (this._scrollRoot) this._scrollRoot.scrollTo({ top: 0, behavior: 'smooth' }); },
      logToolsOpen: st.logToolsOpen, toggleLogTools: () => this.setState({ logToolsOpen: !st.logToolsOpen }),
      logSearch: st.logSearch, setLogSearch: (e) => this.setState({ logSearch: e.target.value, logPage: 0 }),
      logSort: st.logSort, setLogSort: (e) => this.setState({ logSort: e.target.value, logPage: 0 }),
      logFieldFilters, logAgg, logBreakdown,
      setLogField: (key, val) => this.setLogF(key, val),
      setLogDim: (e) => this.setLogDim(e.target.value),
      // these are persisted preferences, so they must trigger a save — without it the choice
      // only survives if some unrelated autosave happens to flush afterwards
      setEdgeMetric: (e) => this.setState({ edgeMetric: e.target.value === 'wr' ? 'wr' : 'r' }, () => this._save()),
      clearLogFilters: () => this.setState({ logF: { day: 'all', align: 'all', setup: 'all', session: 'all', marketRegime: 'all', exitReason: 'all', ruleAdherence: 'all', ltf: 'all', mtf: 'all', htf: 'all', retest: 'all', fibo: 'all', entryType: 'all', feelEntry: 'all', feelSL: 'all', feelTP: 'all' }, logPage: 0 }),
      fieldCfgOpen: !!st.fieldCfg, openFieldCfg: () => this.openFieldCfg(), closeFieldCfg: () => this.closeFieldCfg(),
      fieldCfgVM: [
        { key: 'legTrigger', label: 'จุดเข้า (แต่ละไม้) · M5 / M15', opts: this._fieldOpts('legTrigger') },
        { key: 'legSL', label: 'SL basis (แต่ละไม้)', opts: this._fieldOpts('legSL') },
        { key: 'fibo', label: 'Retest fibo M15 side', opts: this._fieldOpts('fibo') },
        { key: 'ltf', label: 'LTF condition', opts: this._fieldOpts('ltf') },
        { key: 'mtf', label: 'MTF condition', opts: this._fieldOpts('mtf') },
        { key: 'htf', label: 'HTF condition', opts: this._fieldOpts('htf') },
        { key: 'feelEntry', label: 'Feeling · ตอนเข้า', opts: this._fieldOpts('feelEntry') },
        { key: 'feelSL', label: 'Feeling · ตอนวาง SL', opts: this._fieldOpts('feelSL') },
        { key: 'feelTP', label: 'Feeling · ตอนออก / TP', opts: this._fieldOpts('feelTP') },
        { key: 'marketRegime', label: 'Market regime', opts: this._fieldOpts('marketRegime') },
        { key: 'exitReason', label: 'Exit reason', opts: this._fieldOpts('exitReason') },
        { key: 'ruleAdherence', label: 'Rule adherence', opts: this._fieldOpts('ruleAdherence') },
      ],
      addFieldOpt: (k, v) => this.addFieldOpt(k, v), removeFieldOpt: (k, v) => this.removeFieldOpt(k, v), moveFieldOpt: (k, v, d) => this.moveFieldOpt(k, v, d), renameFieldOpt: (k, o, n) => this.renameFieldOpt(k, o, n),
      heat, calDays, weeks, monthPnl: this._fmtMoney(monthTotal), monthColor: pc(monthTotal),
      calMonthLabel, calMonthShort, dashMonthShort, calPrev: () => this.calStep(-1), calNext: () => this.calStep(1),
      calYearNum: st.calYear, setCalYear: (e) => this.setState({ calYear: parseInt(e.target.value, 10) }),
      calYearOptions: (() => { const ny = new Date().getFullYear(); const arr = []; for (let y = ny - 8; y <= ny + 1; y++) arr.push(y); if (!arr.includes(st.calYear)) arr.push(st.calYear); return arr.sort((a, b) => a - b); })(),
      dowBars, sessionBars, rDist, anaStats,
      setupCards: setupCards.map(s => ({ ...s, gate: setupGates.find(g => g.id === s.id) })),
      setupGates, readySetups, confirmedSetups, backtestClosed, forwardClosed, focusAction,
      selectedQuality: selectedQuality + '%',
      expectancyStr: S.expectancyStr, curStreakStr: S.curStreakStr, curStreakColor: S.curStreakColor, consistencyStr: S.consistencyStr,
      ddLine: activeMode === 'backtest' ? rDrawdownChart.line : S.ddLine,
      ddArea: activeMode === 'backtest' ? rDrawdownChart.area : S.ddArea,
      ddUnitLabel: activeMode === 'backtest' ? 'R below cumulative peak' : 'percent below equity peak',
      symbolBars: S.symbolBars, tagStats: S.tagStats, symbolMore: S.symbolMore, tagMore: S.tagMore,
      feelStats: S.feelStats, feelMoment: st.feelMoment || 'entry',
      setFeelMoment: (e) => this.setState({ feelMoment: e.target.value }, () => this._save()),
      feelMoments: [{ v: 'entry', label: 'ตอนเข้า' }, { v: 'sl', label: 'ตอนวาง SL' }, { v: 'tp', label: 'ตอนออก / TP' }],
      feelRows: (S.feelStats[st.feelMoment || 'entry'] || S.feelStats.entry).rows,
      feelMore: (S.feelStats[st.feelMoment || 'entry'] || S.feelStats.entry).more,
      maxWinStreak: S.maxWinStreak, maxLossStreak: S.maxLossStreak,
      anaPf: activeMode === 'backtest' ? (Number.isFinite(activeGate.pf) ? activeGate.pf.toFixed(2) : (activeGate.n ? '∞' : '0.00')) : S.kPf,
      anaDD: activeMode === 'backtest' ? ('−' + activeGate.maxDD.toFixed(1) + 'R') : S.kDD, anaR: S.kR,
      edgeFinder: S.edgeFinder, executionAudit,
      dataQuality, walkForward, driftRows, monteCarlo,
      simulationRiskPct,
      setSimulationRiskPct: (e) => this.setState({ simulationRiskPct: Math.max(.25, Math.min(5, Number(e.target.value) || 1)) }, () => this._save()),
      openNew: () => this.openNew(), openNewSetup: () => this.openNewSetup(),
      // checklist
      checkTab: tab, tabWeekly: () => this.setState({ checkTab: 'weekly' }), tabMonthly: () => this.setState({ checkTab: 'monthly' }), tabYearly: () => this.setState({ checkTab: 'yearly' }),
      wkTabStyle: this._segStyle(isWeekly), moTabStyle: this._segStyle(tab === 'monthly'), yrTabStyle: this._segStyle(isYearly),
      periods, checkItems, checkPeriodLabel, disc, checkListHint: 'Tap to check · pencil to edit · × to delete',
      periodOffset, pageOlder: () => this.pagePeriod(1), pageNewer: () => this.pagePeriod(-1), pageReset: () => this.pageReset(), atPresent: periodOffset === 0,
      readyPct: readyPct + '%', readyOffset: 327 - 327 * readyPct / 100, readyStroke: ringStroke(readyPct), readyMsg: ringMsg(readyPct), readyFrac: cdone + ' / ' + items.length + ' ข้อ',
      addCheckKey: (e) => { if (e.key === 'Enter') { this.addPeriodItem(scope, periodKey, e.target.value); e.target.value = ''; } },
      preItems, prePct: prePct + '%', preOffset: 327 - 327 * prePct / 100, preStroke: ringStroke(prePct), preMsg: ringMsg(prePct), preFrac: pdone + ' / ' + st.preItems.length + ' ข้อ',
      addPreKey: (e) => { if (e.key === 'Enter') { this.addItem('pre', e.target.value); e.target.value = ''; } },
      showPlan: st.showPlan, ...planVals, openPlanManual: () => this.openPlanManual(),
      planReminders: st.planReminders, togglePlanReminders: () => this.togglePlanReminders(),
      // vision
      visionItems, addVision: () => this.addVision(),
      // day modal
      showDay: st.showDay, closeDay: () => this.closeDay(), ...dayObj,
      // trade modal
      showTrade: st.showTrade, draftIsNew: st.draftIsNew, closeTrade: () => this.closeTrade(), cancelTrade: () => this.cancelTrade(), addImg: () => this.addImg(), ...tradeVals,
      // setup modal
      showSetup: st.showSetup, setupIsNew: st.setupIsNew, closeSetup: () => this.closeSetup(), cancelSetup: () => this.cancelSetup(), ...setupVals,
      // transaction history modal
      txnModal, closeTxns: () => this.closeTxns(),
    };
  }

  // ===================== VIEWS =====================
  renderAccount(V) {
    const LBL = css('font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#928B9B;margin-bottom:5px');
    const VAL = css('font-family:\'JetBrains Mono\';font-size:17px;font-weight:600');
    return (
      <div style={css('padding:24px 28px 40px;animation:viewIn .45s both')}>
        <div style={css('margin-bottom:20px;animation:rise .5s both')}><div className="rtm-head" style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6747D8;margin-bottom:6px')}>Account</div><div style={css('font-family:\'Instrument Serif\',serif;font-size:28px;color:#24202B')}>My account &amp; portfolios <span style={css('font-style:italic;color:#7658E8')}>— manage portfolios &amp; stats</span></div></div>

        <div style={css('display:flex;align-items:center;gap:16px;padding:18px 22px;border-radius:16px;background:linear-gradient(120deg,rgba(118,88,232,.12),rgba(49,35,73,.02));border:1px solid rgba(118,88,232,.22);margin-bottom:20px;animation:rise .5s .05s both')}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(118,88,232,.14)', border: '1px solid rgba(118,88,232,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 20, color: '#7658E8', flex: 'none' }}>{V.avatarLetter}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={css('font-size:15px;color:#24202B;font-weight:600')}>{V.accountName}</div><div style={css('font-size:12.5px;color:#746E7D')}>{V.userEmail || '—'}</div></div>
          <div onClick={V.signOut} className="hv-deloutline" style={css('padding:10px 16px;border-radius:10px;border:1px solid rgba(226,84,98,.4);color:#E25462;font-size:13px;font-weight:600;cursor:pointer;transition:.14s')}>Sign out</div>
        </div>

        <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;animation:rise .5s .06s both')}>
          <div className="liquid-glass" style={css('padding:16px 20px;border-radius:14px;background:rgba(49,35,73,.03);border:1px solid rgba(49,35,73,.07);border-top:2px solid #7658E8')}><div style={css('font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#928B9B;margin-bottom:7px')}>Total equity (all portfolios)</div><div style={css('font-family:\'JetBrains Mono\';font-size:22px;font-weight:600;color:#7658E8')}>{V.acctTotalEquity}</div></div>
          <div className="liquid-glass" style={css('padding:16px 20px;border-radius:14px;background:rgba(49,35,73,.03);border:1px solid rgba(49,35,73,.07);border-top:2px solid #1C9B68')}><div style={css('font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#928B9B;margin-bottom:7px')}>Total Net P&amp;L</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:22px;font-weight:600'), color: V.acctTotalNetColor }}>{V.acctTotalNet}</div></div>
        </div>

        <div style={css('font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#928B9B;margin-bottom:10px')}>Add portfolio</div>
        <div style={css('display:flex;gap:10px;margin-bottom:20px;animation:rise .5s .08s both')}>
          <input value={V.newPortName} onChange={V.setNewPortName} onKeyDown={V.addPortKey} placeholder="Portfolio name, e.g. FTMO Challenge, Live, Demo" className="hv-focus" style={css('flex:1;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:12px 14px;color:#24202B;font-size:14px;outline:none')} />
          <div onClick={V.addPortfolioNamed} className="hv-save rtm-press" style={css('padding:12px 22px;border-radius:10px;background:linear-gradient(150deg,#7658E8,#6747D8);color:#FFFFFF;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;transition:.15s')}>+ Add</div>
        </div>

        <div style={css('font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#928B9B;margin-bottom:12px')}>All portfolios · click to view</div>
        <div style={css('display:grid;grid-template-columns:repeat(2,1fr);gap:14px')}>
          {V.portfolioStats.map((p) => (
            <div key={p.id} onClick={p.select} className="hv-card liquid-glass" style={{ ...css('position:relative;padding:20px 22px;border-radius:16px;background:rgba(49,35,73,.025);cursor:pointer;transition:.18s'), border: '1px solid ' + (p.isCurrent ? 'rgba(118,88,232,.5)' : 'rgba(49,35,73,.07)') }}>
              <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px')}>
                <input defaultValue={p.name} onClick={V.stop} onBlur={p.rename} title="Click to rename" className="hv-focus" style={css('flex:1;min-width:0;font-family:\'Instrument Serif\',serif;font-size:19px;color:#24202B;background:rgba(49,35,73,.03);border:1px solid rgba(49,35,73,.08);border-radius:7px;padding:4px 8px;outline:none')} />
                {p.isCurrent && <span style={css('font-size:10px;color:#FFFFFF;background:linear-gradient(180deg,#7658E8,#6747D8);padding:3px 9px;border-radius:6px;font-weight:700;flex:none')}>Viewing</span>}
                <span onClick={p.del} title="Delete portfolio" className="hv-del" style={css('width:28px;height:28px;border-radius:7px;border:1px solid rgba(49,35,73,.08);display:flex;align-items:center;justify-content:center;color:#928B9B;cursor:pointer;transition:.14s;flex:none')}>✕</span>
              </div>
              {/* ===== การจัดการเงิน (ฝาก/ถอน) ===== */}
              <div className="liquid-glass" style={css('border-radius:12px;background:rgba(0,0,0,.22);border:1px solid rgba(49,35,73,.06);padding:14px 15px;margin-bottom:14px')}>
                <div style={css('display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px')}>
                  <div><div style={LBL}>Starting capital ($)</div><input defaultValue={p.startBalance} onClick={V.stop} onBlur={p.setBalance} placeholder="0" className="hv-focus" style={css('width:110px;font-family:\'JetBrains Mono\';font-size:15px;color:#24202B;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:8px;padding:6px 10px;outline:none')} /></div>
                  <div style={css('text-align:right')}><div style={LBL}>Current equity</div><div style={{ ...VAL, color: '#7658E8' }}>{p.equityStr}</div></div>
                </div>
                {/* breakdown */}
                <div style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:11px')}>
                  <div><div style={css('font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#928B9B;margin-bottom:3px')}>Total in</div><div style={css('font-family:JetBrains Mono;font-size:13px;color:#746E7D')}>{p.depositedStr}</div></div>
                  <div><div style={css('font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#928B9B;margin-bottom:3px')}>Withdrawn</div><div style={{ ...css('font-family:JetBrains Mono;font-size:13px'), color: p.hasCashFlow && p.withdrawnStr !== '$0' ? '#E25462' : '#746E7D' }}>{p.withdrawnStr}</div></div>
                  <div><div style={css('font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#928B9B;margin-bottom:3px')}>Net capital</div><div style={css('font-family:JetBrains Mono;font-size:13px;color:#24202B')}>{p.netCapStr}</div></div>
                </div>
                <div style={css('display:flex;gap:8px')}>
                  <span onClick={(e) => { e.stopPropagation(); p.deposit(); }} className="hv-lift" style={css('flex:1;text-align:center;font-size:12px;font-weight:600;color:#1C9B68;background:rgba(28,155,104,.1);border:1px solid rgba(28,155,104,.3);border-radius:8px;padding:8px;cursor:pointer;transition:.14s')}>Deposit</span>
                  <span onClick={(e) => { e.stopPropagation(); p.withdraw(); }} className="hv-lift" style={css('flex:1;text-align:center;font-size:12px;font-weight:600;color:#E25462;background:rgba(226,84,98,.1);border:1px solid rgba(226,84,98,.3);border-radius:8px;padding:8px;cursor:pointer;transition:.14s')}>Withdraw</span>
                </div>
                {p.movements.length > 0 && (
                  <div style={css('margin-top:11px;border-top:1px solid rgba(49,35,73,.06);padding-top:9px;display:flex;flex-direction:column;gap:5px')}>
                    {p.movements.slice(0, 3).map((m) => (
                      <div key={m.id} style={css('display:flex;align-items:center;justify-content:space-between;font-size:11.5px')}>
                        <span style={css('color:#928B9B;font-family:JetBrains Mono')}>{m.isW ? 'Withdraw' : 'Deposit'} · {m.date}</span>
                        <span style={css('display:flex;align-items:center;gap:8px')}><span style={{ ...css('font-family:JetBrains Mono;font-weight:600'), color: m.isW ? '#E25462' : '#1C9B68' }}>{m.amtStr}</span><span onClick={m.del} title="Delete this entry" className="hv-deltext" style={css('color:#928B9B;cursor:pointer')}>✕</span></span>
                      </div>
                    ))}
                    <span onClick={p.openTxns} className="hv-op" style={css('margin-top:3px;font-size:11.5px;color:#6747D8;cursor:pointer;text-align:center')}>{p.txnCount > 3 ? ('View all ' + p.txnCount + ' →') : 'View full history →'}</span>
                  </div>
                )}
              </div>
              <div style={css('display:grid;grid-template-columns:repeat(2,1fr);gap:14px')}>
                <div><div style={LBL}>Net P&amp;L</div><div style={{ ...VAL, color: p.netColor }}>{p.netStr}</div></div>
                <div><div style={LBL}>Win rate</div><div style={{ ...VAL, color: '#24202B' }}>{p.wr}%</div></div>
                <div><div style={LBL}>Avg R</div><div style={{ ...VAL, color: p.avgRColor }}>{p.avgRStr}</div></div>
                <div><div style={LBL}>Trades</div><div style={{ ...VAL, color: '#24202B' }}>{p.trades}</div></div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== สำรองข้อมูล & จัดการพื้นที่ ===== */}
        <div className="liquid-glass" style={css('margin-top:22px;padding:20px 22px;border-radius:16px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);animation:rise .5s .12s both')}>
          <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:6px')}>
            <div style={css('font-family:\'Instrument Serif\',serif;font-size:18px;color:#24202B')}>Backup &amp; storage</div>
            <span style={css('font-size:11px;color:#928B9B;font-family:JetBrains Mono')}>Last backup: {V.lastBackupStr}</span>
          </div>
          <div style={css('font-size:12.5px;color:#746E7D;line-height:1.6;margin-bottom:16px')}>Download all your data to keep safe (restorable) · when storage runs low, “archive old trades” to free image space — their P&amp;L is folded in so <b style={css('color:#7658E8')}>the milestone and Growth curve stay continuous, never reset</b></div>
          <div style={css('display:flex;flex-wrap:wrap;gap:10px;align-items:center')}>
            <span onClick={V.backupJournal} className="hv-lift" style={css('font-size:13px;font-weight:600;padding:10px 18px;border-radius:10px;cursor:pointer;color:#FFFFFF;background:linear-gradient(180deg,#7658E8,#6747D8);transition:.14s')}>⤓ Back up (.json)</span>
            <label className="hv-lift" style={css('font-size:13px;font-weight:600;padding:10px 18px;border-radius:10px;cursor:pointer;color:#24202B;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.14);transition:.14s')}>⤒ Restore from file<input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files && e.target.files[0]; V.restoreJournal(f); e.target.value = ''; }} /></label>
            <div style={css('flex:1')}></div>
            <span style={css('font-size:12px;color:#746E7D')}>Archive trades older than</span>
            {[6, 12, 24].map((mo) => (
              <span key={mo} onClick={() => { if (window.confirm('Back up before archiving — done already? (OK = continue)')) V.archiveOldTrades(mo); }} className="hv-lift" style={css('font-size:12.5px;font-weight:600;padding:9px 14px;border-radius:9px;cursor:pointer;color:#E25462;background:rgba(226,84,98,.08);border:1px solid rgba(226,84,98,.28);transition:.14s')}>{mo === 24 ? '2 yr' : mo + ' mo'}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  renderPremiumDashboard(V) {
    const stages = [
      { n: '01', title: 'Backtest', value: V.backtestClosed + ' samples', note: 'ค้นหา pattern และกติกา', color: '#4D7FE8', click: V.goBacktest, live: V.backtestClosed > 0 },
      { n: '02', title: 'Prove the edge', value: V.readySetups + ' setup ready', note: 'Training + holdout sample', color: '#7658E8', click: V.showBacktestAnalytics, live: V.readySetups > 0 },
      { n: '03', title: 'Forward test', value: V.forwardClosed + ' samples', note: 'ยืนยันผล out-of-sample', color: '#B64987', click: V.goForward, live: V.readySetups > 0 },
      { n: '04', title: 'Scale with proof', value: V.confirmedSetups + ' confirmed', note: 'เพิ่มขนาดเมื่อหลักฐานพร้อม', color: '#1C9B68', click: V.showForwardAnalytics, live: V.confirmedSetups > 0 },
    ];
    const kpis = [
      { label: V.isBacktestMode ? 'Closed samples' : 'Closed trades', value: String(V.totalClosed), note: 'sample size', color: '#7658E8' },
      { label: 'Average R', value: V.kR, note: 'expectancy per trade', color: '#7658E8' },
      { label: 'Profit factor', value: V.kPf, note: 'gross win ÷ gross loss', color: '#4D7FE8' },
      { label: 'Max drawdown', value: V.kDD, note: V.isBacktestMode ? 'from R curve' : 'from equity peak', color: '#E25462' },
    ];
    return (
      <div className="rtm-page rtm-premium-dashboard">
        <section className="rtm-premium-hero">
          <div className="rtm-hero-copy">
            <div className="rtm-hero-kicker"><span></span> EVIDENCE-FIRST TRADING</div>
            <h1>Build an edge<br/>you can <em>trust.</em></h1>
            <p>Backtest เพื่อค้นหากติกาที่ทำซ้ำได้ จากนั้น freeze setup แล้วพิสูจน์ด้วย Forward test ก่อนนำไปเพิ่มขนาดจริง</p>
            <div className="rtm-hero-actions">
              <button onClick={V.openNew} className="rtm-btn rtm-btn-white">+ Log a sample</button>
              <button onClick={V.goAna} className="rtm-btn rtm-btn-ghost">Open Edge Lab <span>→</span></button>
            </div>
            <div className="rtm-hero-foot"><span>✓ No broker lock-in</span><span>✓ Free stack</span><span>✓ Your data stays portable</span></div>
          </div>
          <div onClick={V.focusAction.click} className="rtm-next-card rtm-press">
            <div className="rtm-next-top"><span className="rtm-next-pulse" style={{ background: V.focusAction.color }}></span><span>{V.focusAction.eyebrow}</span></div>
            <h2>{V.focusAction.title}</h2>
            <p>{V.focusAction.body}</p>
            <div className="rtm-next-action"><span>{V.focusAction.cta}</span><b>↗</b></div>
            <div className="rtm-next-orb"></div>
          </div>
        </section>

        <section className="rtm-flow-surface">
          <div className="rtm-section-head"><div><span>YOUR RESEARCH LOOP</span><h2>One system. Four clear stages.</h2></div><p>แต่ละ phase แยกข้อมูลออกจากกันเพื่อไม่ให้ Backtest ปนกับผลเงินจริง</p></div>
          <div className="rtm-flow-grid">
            {stages.map((s, i) => (
              <div key={s.n} onClick={s.click} className={'rtm-flow-step rtm-press' + (s.live ? ' live' : '')}>
                <div className="rtm-flow-meta"><span style={{ color: s.color }}>{s.n}</span><i style={{ background: s.live ? s.color : '#D9D4E0' }}></i></div>
                <h3>{s.title}</h3><b style={{ color: s.color }}>{s.value}</b><p>{s.note}</p>
                {i < stages.length - 1 && <div className="rtm-flow-arrow">→</div>}
              </div>
            ))}
          </div>
        </section>

        <div className="rtm-view-strip">
          <div><span className="rtm-eyebrow">CURRENT LENS</span><b>{V.modeLabel}</b><small>แสดงสถิติจาก phase นี้เท่านั้น</small></div>
          <div className="rtm-mode-toggle"><button onClick={V.selectBacktest} className={V.isBacktestMode ? 'active' : ''}>Backtest</button><button onClick={V.selectForward} className={!V.isBacktestMode ? 'active' : ''}>Forward test</button></div>
        </div>

        <section className="rtm-premium-kpis">
          {kpis.map((m) => <div key={m.label} className="rtm-premium-kpi"><div className="rtm-kpi-label">{m.label}</div><div className="rtm-kpi-value" style={{ color: m.color }}><CountUp value={m.value}/></div><div className="rtm-kpi-note">{m.note}</div></div>)}
        </section>

        <section className="rtm-main-insights">
          <div className="rtm-white-surface rtm-growth-panel">
            <div className="rtm-panel-head"><div><span>PERFORMANCE</span><h2>Growth curve</h2><p>Cumulative P&amp;L · breakeven = 0</p></div><div className="rtm-range-pills">{['ALL','3M','1M'].map(r => <button key={r} onClick={() => V.setEqRange(r)} className={V.eqRange === r ? 'active' : ''}>{r}</button>)}</div></div>
            <EquityCurve line={V.equityLine} area={V.equityArea} points={V.equityPoints} lastY={V.equityLastY} zeroY={V.equityZeroY}/>
            <div className="rtm-chart-foot"><span><i style={{ background:'#7658E8' }}></i>{V.totalClosed} closed</span><span>Net <b style={{ color: V.netProfitColor }}>{V.netProfitStr}</b></span><span>Data quality <b>{V.selectedQuality}</b></span></div>
          </div>
          <div className="rtm-white-surface rtm-proof-panel">
            <div className="rtm-panel-head"><div><span>SYSTEM EVIDENCE</span><h2>What the data says</h2></div><button onClick={V.goAna}>Full analysis →</button></div>
            <div className="rtm-proof-score"><div className="rtm-proof-ring" style={{ background: V.donut }}><span>{V.kWin}</span></div><div><small>Win rate</small><strong>{V.winsN}W · {V.lossesN}L</strong><p>{V.totalClosed} closed samples</p></div></div>
            <div className="rtm-proof-list">
              <div><span>Expectancy / trade</span><b>{V.expectancyStr}</b></div>
              <div><span>Setups ready for forward</span><b>{V.readySetups}</b></div>
              <div><span>Confirmed edge</span><b>{V.confirmedSetups}</b></div>
              <div><span>Avg captured move</span><b>{V.edge.avgCapture}</b></div>
            </div>
          </div>
        </section>

        <section className="rtm-goal-surface">
          <div><span>FORWARD GOAL · REAL P&amp;L ONLY</span><h2>{V.milestoneEquity} <small>of {V.goalStr}</small></h2></div>
          <div className="rtm-goal-track"><div style={{ width: V.milestoneWidth }}></div><span>Backtest never changes this goal</span></div>
          <div className="rtm-goal-value"><b>{V.milestonePct}</b>{V.editGoal ? <input defaultValue={V.goalNum} onBlur={V.commitGoal} onKeyDown={V.onGoalKey} autoFocus/> : <button onClick={V.startGoal}>Edit target</button>}</div>
        </section>
      </div>
    );
  }

  renderCalendar(V) {
    return (
      <div style={css('padding:24px 28px 40px;animation:viewIn .45s cubic-bezier(.2,.7,.3,1) both')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;animation:rise .5s both')}>
          <div><div className="rtm-head" style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6747D8;margin-bottom:6px')}>Trading calendar</div><div style={css('display:flex;align-items:center;gap:12px')}><div onClick={V.calPrev} className="hv-close" style={css('width:30px;height:30px;border-radius:8px;border:1px solid rgba(49,35,73,.12);display:flex;align-items:center;justify-content:center;color:#746E7D;cursor:pointer')}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg></div><div style={css('display:flex;align-items:center;gap:10px;min-width:230px;justify-content:center')}><span style={css('font-family:\'Instrument Serif\',serif;font-size:28px;color:#24202B')}>{V.calMonthShort}</span><Sel value={V.calYearNum} onChange={V.setCalYear} className="hv-focus" style={css('background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.14);border-radius:8px;padding:6px 10px;color:#24202B;font-size:16px;font-family:JetBrains Mono;outline:none;cursor:pointer')}>{V.calYearOptions.map((y) => (<option key={y} value={y}>{y}</option>))}</Sel></div><div onClick={V.calNext} className="hv-close" style={css('width:30px;height:30px;border-radius:8px;border:1px solid rgba(49,35,73,.12);display:flex;align-items:center;justify-content:center;color:#746E7D;cursor:pointer')}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></div><span onClick={V.calToday} className="hv-lift" style={css('font-size:12px;font-weight:600;padding:7px 13px;border-radius:8px;cursor:pointer;color:#7658E8;background:rgba(118,88,232,.1);border:1px solid rgba(118,88,232,.3)')}>Today</span></div></div>
          <div style={css('display:flex;align-items:center;gap:16px')}>
            <div style={css('text-align:right')}><div style={css('font-size:10.5px;color:#928B9B;letter-spacing:.1em;text-transform:uppercase')}>Month P&amp;L</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:22px;font-weight:600'), color: V.monthColor }}>{V.monthPnl}</div></div>
          </div>
        </div>
        <div style={css('display:grid;grid-template-columns:1fr 240px;gap:16px;animation:rise .5s .08s both')}>
          <div className="liquid-glass" style={css('border-radius:16px;border:1px solid rgba(49,35,73,.07);background:rgba(49,35,73,.02);padding:16px')}>
            <div style={css('display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:10px')}>
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i)=>(<div key={i} style={{ ...css('text-align:center;font-size:10px;letter-spacing:.1em;text-transform:uppercase'), color: i >= 5 ? '#6a5f48' : '#928B9B' }}>{d}</div>))}
            </div>
            <div style={css('display:grid;grid-template-columns:repeat(7,1fr);gap:8px')}>
              {V.calDays.map((d, i) => (
                <div key={i} onClick={d.click || undefined} className={d.cursor === 'pointer' ? 'hv-day' : undefined} style={{ ...css('aspect-ratio:1.05;border-radius:10px;padding:8px 9px;display:flex;flex-direction:column;justify-content:space-between;transition:.14s'), background: d.bg, border: d.border, cursor: d.cursor }}>
                  <div style={css('display:flex;justify-content:space-between;align-items:center')}><span style={{ ...css('font-size:11px;font-family:JetBrains Mono'), color: d.dayColor }}>{d.day}</span><span style={{ ...css('font-size:8px'), color: d.dotColor }}>{d.dot}</span></div>
                  <div><div style={{ ...css('font-size:12.5px;font-family:JetBrains Mono;font-weight:600'), color: d.fg }}>{d.pnl}</div><div style={css('font-size:10px;color:#928B9B')}>{d.trades}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div style={css('display:flex;flex-direction:column;gap:10px')}>
            <div style={css('font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#928B9B;margin-bottom:2px')}>Weekly</div>
            {V.weeks.map((w, i) => (
              <div key={i} className="hv-brd-gold liquid-glass" style={css('padding:14px 16px;border-radius:13px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);transition:.16s')}><div style={css('font-size:11px;color:#746E7D;margin-bottom:5px')}>{w.label}</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:18px;font-weight:600'), color: w.color }}>{w.pnl}</div><div style={css('font-size:10.5px;color:#928B9B;margin-top:3px')}>{w.meta}</div></div>
            ))}
          </div>
        </div>
        <div style={css('margin-top:14px;font-size:12px;color:#928B9B;display:flex;align-items:center;gap:8px')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#6747D8" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01" strokeLinecap="round"/></svg>Click a day with trades to see all its orders</div>
      </div>
    );
  }

  renderTradeLog(V) {
    // Default to a compact decision view. Detailed execution columns are revealed together
    // with analysis tools, keeping 1,000+ trade journals readable instead of permanently wide.
    const expanded = V.logToolsOpen;
    const PORT_COL = 'minmax(120px,1.05fr)';
    const compactCols = ['118px', 'minmax(120px,1.15fr)', '60px']
      .concat(V.showPort ? [PORT_COL] : [])
      .concat(['minmax(110px,1fr)', '92px', '72px', '94px']);
    const detailCols = ['128px', '92px', '70px', 'minmax(92px,1fr)', '46px']
      .concat(V.showPort ? [PORT_COL] : [])
      .concat(['minmax(84px,1fr)', '70px', 'minmax(100px,1.1fr)', '50px', 'minmax(108px,1.2fr)', '50px', '60px', '68px', '56px', '86px']);
    const gcols = (expanded ? detailCols : compactCols).join(' ');
    const gminw = expanded ? (V.showPort ? 1632 : 1500) : (V.showPort ? 930 : 790);
    const anaCell = (val, color) => (
      <span title={val || ''} style={{ ...css('font-size:11px;font-family:JetBrains Mono;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'), color: val ? color : '#5a5a63' }}>{val || '—'}</span>
    );
    return (
      <div style={css('padding:24px 28px 40px;animation:viewIn .45s cubic-bezier(.2,.7,.3,1) both')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:18px;animation:rise .5s both')}>
          <div><div className="rtm-head" style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6747D8;margin-bottom:6px')}>{V.journalEyebrow}</div><div style={css('font-family:\'Instrument Serif\',serif;font-size:28px;color:#24202B')}>{V.journalTitle} <span style={css('font-size:15px;color:#928B9B;font-family:\'Plus Jakarta Sans\'')}>{V.tradeCount} samples</span></div><div style={css('font-size:11.5px;color:#918B99;margin-top:4px')}>{V.journalSubtitle}</div></div>
          <div style={css('display:flex;gap:8px;align-items:center;flex-wrap:wrap')}>
            <div className="liquid-glass" style={css('display:flex;gap:3px;padding:3px;border-radius:9px')}><span onClick={V.goBacktest} className="rtm-press" style={{ ...css('font-size:11px;font-weight:700;padding:7px 10px;border-radius:7px;cursor:pointer'), color: V.isBacktestMode ? '#071018' : '#928B9B', background: V.isBacktestMode ? '#4D7FE8' : 'transparent' }}>Backtest</span><span onClick={V.goForward} className="rtm-press" style={{ ...css('font-size:11px;font-weight:700;padding:7px 10px;border-radius:7px;cursor:pointer'), color: !V.isBacktestMode ? '#07140e' : '#928B9B', background: !V.isBacktestMode ? '#1C9B68' : 'transparent' }}>Forward</span></div>
            <label className="hv-lift" title={'Import rows into ' + V.modeLabel} style={css('font-size:12px;font-weight:600;padding:7px 12px;border-radius:8px;cursor:pointer;color:#5E86D6;background:rgba(77,127,232,.08);border:1px solid rgba(77,127,232,.28);display:flex;align-items:center;gap:5px;transition:.14s;white-space:nowrap')}>⇧ Import CSV<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files && e.target.files[0]; V.importCSV(f); e.target.value = ''; }} /></label>
            <Sel value={V.exportRange} onChange={V.setExportRange} className="hv-focus rtm-select" title="Choose export range (Word/CSV)" style={css('font-size:12px;font-weight:600;padding:7px 12px;border-radius:8px;cursor:pointer;color:#746E7D;background:rgba(49,35,73,.03);border:1px solid rgba(49,35,73,.12);outline:none;transition:.14s')}>
              <option value="all">Export: All</option>
              <option value="week">Export: This week</option>
              <option value="month">Export: This month</option>
            </Sel>
            <span onClick={V.exportCSV} className="hv-lift" title="Download as CSV (Excel/Sheets)" style={css('font-size:12px;font-weight:600;padding:7px 14px;border-radius:8px;cursor:pointer;color:#746E7D;background:rgba(49,35,73,.03);border:1px solid rgba(49,35,73,.12);display:flex;align-items:center;gap:5px;transition:.14s')}>⤓ CSV</span>
            <span onClick={V.exporting ? undefined : V.exportWord} className="hv-lift" title="Download weekly trade history as Word (with images)" style={css('font-size:12px;font-weight:600;padding:7px 14px;border-radius:8px;cursor:' + (V.exporting ? 'progress' : 'pointer') + ';color:#7658E8;background:rgba(118,88,232,.1);border:1px solid rgba(118,88,232,.3);display:flex;align-items:center;gap:5px;transition:.14s')}>{V.exporting ? 'กำลังสร้าง…' : '⤓ Word'}</span>
            <span onClick={V.openNew} className="hv-lift" style={css('font-size:12px;font-weight:600;padding:7px 15px;border-radius:8px;cursor:pointer;color:#FFFFFF;background:linear-gradient(180deg,#7658E8,#6747D8);display:flex;align-items:center;gap:5px;transition:.14s')}>+ New sample</span>
          </div>
        </div>
        <div style={css('display:flex;gap:10px;margin-bottom:14px;animation:rise .5s .04s both')}>
          <input value={V.logSearch} onChange={V.setLogSearch} placeholder="🔍 Search symbol / setup / notes…" className="hv-focus" style={css('flex:1;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:9px;padding:9px 14px;color:#24202B;font-size:13px;outline:none')} />
          <Sel value={V.logSort} onChange={V.setLogSort} className="hv-focus rtm-select" style={css('background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:9px;padding:9px 14px;color:#24202B;font-size:13px;outline:none;cursor:pointer')}>
            <option value="date-desc">Newest → oldest</option>
            <option value="date-asc">Oldest → newest</option>
            <option value="pnl-desc">Highest P&amp;L</option>
            <option value="pnl-asc">Lowest P&amp;L</option>
          </Sel>
          <span onClick={V.toggleLogTools} className="hv-lift rtm-press" style={{ ...css('display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;padding:9px 14px;border-radius:9px;cursor:pointer;white-space:nowrap;transition:.14s'), color: V.logToolsOpen || V.logAgg.anyFilter ? '#7658E8' : '#746E7D', background: V.logToolsOpen || V.logAgg.anyFilter ? 'rgba(118,88,232,.1)' : 'rgba(49,35,73,.035)', border: '1px solid ' + (V.logToolsOpen || V.logAgg.anyFilter ? 'rgba(118,88,232,.32)' : 'rgba(49,35,73,.12)') }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round"/></svg>
            {V.logAgg.anyFilter ? 'Filters active' : (V.logToolsOpen ? 'Hide details' : 'Details & analysis')} <span style={css('font-size:10px;opacity:.65')}>{V.logToolsOpen ? '▲' : '▼'}</span>
          </span>
        </div>
        {V.logToolsOpen && <div style={css('display:flex;flex-direction:column;gap:12px;margin-bottom:14px;animation:rise .28s both')}>
          <div className="liquid-glass" style={css('padding:15px 17px;border-radius:14px;border:1px solid rgba(49,35,73,.07);background:rgba(49,35,73,.02)')}>
            <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:12px')}>
              <div style={css('font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#928B9B;font-weight:600')}>Filter &amp; analyse</div>
              <div style={css('display:flex;align-items:center;gap:8px')}>
                {V.logAgg.anyFilter && <span onClick={V.clearLogFilters} className="hv-lift" style={css('font-size:11.5px;font-weight:600;padding:5px 12px;border-radius:7px;cursor:pointer;color:#7658E8;background:rgba(118,88,232,.1);border:1px solid rgba(118,88,232,.3)')}>✕ Clear filters</span>}
                <span onClick={V.openFieldCfg} className="hv-lift" title="Add / edit the choices for each field" style={css('font-size:11.5px;font-weight:600;padding:5px 12px;border-radius:7px;cursor:pointer;color:#746E7D;background:rgba(49,35,73,.03);border:1px solid rgba(49,35,73,.12);display:flex;align-items:center;gap:5px')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>Edit options</span>
              </div>
            </div>
            <div style={css('display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px')}>
              {V.logFilters.map((f, i) => (
                <span key={i} onClick={f.click} style={{ ...css('font-size:12px;font-weight:600;font-family:JetBrains Mono;padding:7px 15px;border-radius:8px;cursor:pointer;transition:.14s'), color: f.fg, background: f.bg, border: f.border }}>{f.label}</span>
              ))}
            </div>
            <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px')}>
              {V.logFieldFilters.map((f) => (
                <div key={f.key} style={css('display:flex;flex-direction:column;gap:5px;min-width:0')}>
                  <span style={css('font-size:10px;color:#928B9B;letter-spacing:.04em')}>{f.label}</span>
                  <Sel value={f.value} onChange={(e) => V.setLogField(f.key, e.target.value)} className="hv-focus rtm-select" style={{ ...css('width:100%;background:rgba(49,35,73,.04);border-radius:9px;padding:9px 12px;color:#24202B;font-size:12.5px;outline:none;cursor:pointer'), border: '1px solid ' + (f.value !== 'all' ? 'rgba(118,88,232,.5)' : 'rgba(49,35,73,.12)') }}>
                    <option value="all">All</option>
                    {f.options.map((o) => (<option key={o.v} value={o.v}>{o.label}</option>))}
                  </Sel>
                </div>
              ))}
            </div>
            <div style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px')}>
              {[
                { l: 'Trades', v: V.logAgg.n, c: '#7658E8', sub: (V.logAgg.n === 1 ? 'order' : 'orders') + ' in view' },
                { l: 'Win rate', v: V.logAgg.wrStr, c: V.logAgg.wrColor, sub: V.logAgg.record },
                { l: 'Net P&L', v: V.logAgg.netStr, c: V.logAgg.netColor, sub: 'after commission' },
                { l: 'Avg R', v: V.logAgg.avgRStr, c: V.logAgg.avgRColor, sub: 'per trade' },
              ].map((s, i) => (
                <div key={i} className="liquid-glass" style={css('padding:13px 16px;border-radius:13px;background:linear-gradient(180deg,' + s.c + '14,rgba(49,35,73,.012));border:1px solid rgba(49,35,73,.07);border-top:2px solid ' + s.c)}>
                  <div style={css('font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#928B9B;margin-bottom:8px')}>{s.l}</div>
                  <div style={{ ...css('font-family:JetBrains Mono;font-size:20px;font-weight:600;line-height:1'), color: s.c }}>{s.v}</div>
                  {s.sub && <div style={css('font-size:10.5px;color:#928B9B;margin-top:7px')}>{s.sub}</div>}
                </div>
              ))}
            </div>
          </div>
          <div className="liquid-glass" style={css('padding:15px 17px;border-radius:14px;border:1px solid rgba(49,35,73,.07);background:rgba(49,35,73,.02)')}>
            <div style={css('display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap')}>
              <div style={css('font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#928B9B;font-weight:600')}>Compare</div>
              {V.logBreakdown.hasCompare && (
                <Sel value={V.logBreakdown.dim} onChange={V.setLogDim} className="hv-focus rtm-select" style={css('background:rgba(49,35,73,.04);border:1px solid rgba(118,88,232,.4);border-radius:9px;padding:7px 12px;color:#7658E8;font-size:12.5px;font-weight:600;outline:none;cursor:pointer')}>
                  {V.logBreakdown.dims.map((d) => (<option key={d.v} value={d.v}>{d.label}</option>))}
                </Sel>
              )}
              <span style={css('font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#928B9B;font-weight:600')}>by</span>
              <Sel value={V.logBreakdown.metric} onChange={V.setEdgeMetric} title="วัดด้วยอะไร — Expectancy เหมาะกับระบบที่ปล่อยให้กำไรวิ่ง" className="hv-focus rtm-select" style={css('background:rgba(49,35,73,.04);border:1px solid rgba(77,127,232,.4);border-radius:9px;padding:7px 12px;color:#9CC2E8;font-size:12.5px;font-weight:600;outline:none;cursor:pointer')}>
                {V.logBreakdown.metrics.map((m) => (<option key={m.v} value={m.v}>{m.label}</option>))}
              </Sel>
            </div>
            <div style={css('font-size:11px;color:#928B9B;margin-bottom:14px;line-height:1.5')}>แบ่ง {V.filteredCount} ไม้ที่กรองอยู่ตามปัจจัยเดียว แล้วเทียบกับค่าเฉลี่ยรวมของคุณ (<b style={css('color:#746E7D')}>{V.logBreakdown.baselineStr}</b>) — กลุ่มที่มีน้อยกว่า <b style={css('color:#746E7D')}>{V.logBreakdown.minSample}</b> ไม้จะถูกหรี่ไว้ เพราะยังเป็น noise</div>
            {V.logBreakdown.bestEdge && (
              <div style={css('display:flex;align-items:center;gap:9px;margin-bottom:13px;padding:9px 13px;border-radius:10px;background:linear-gradient(100deg,rgba(28,155,104,.12),rgba(118,88,232,.06));border:1px solid rgba(28,155,104,.28);font-size:12px;color:#B7E6CE')}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#1C9B68" strokeWidth="1.8"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21 8 13.8 2 9.4h7.6z" strokeLinejoin="round"/></svg>
                <span>Best edge here: <b style={css('color:#EAF7F0')}>{V.logBreakdown.dimLabel} = {V.logBreakdown.bestEdge.name}</b> → <b style={css('color:#1C9B68')}>{V.logBreakdown.bestEdge.wr}</b> ({V.logBreakdown.metricLabel}) <span style={css('color:#928B9B')}>· {V.logBreakdown.bestEdge.n} ไม้ · เหนือค่าเฉลี่ย {V.logBreakdown.bestEdge.baseWr} อยู่ {V.logBreakdown.bestEdge.lift}</span> <span style={{ ...css('font-size:10px;font-weight:700;padding:1px 7px;border-radius:5px;margin-left:4px'), color: V.logBreakdown.bestEdge.conf.color, border: '1px solid ' + V.logBreakdown.bestEdge.conf.color + '55' }}>{V.logBreakdown.bestEdge.conf.label}</span></span>
              </div>
            )}
            {V.logBreakdown.noEdgeNote && (
              <div style={css('display:flex;align-items:center;gap:9px;margin-bottom:13px;padding:9px 13px;border-radius:10px;background:rgba(49,35,73,.03);border:1px solid rgba(49,35,73,.09);font-size:12px;color:#746E7D')}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#928B9B" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01" strokeLinecap="round"/></svg>
                <span>{V.logBreakdown.noEdgeNote}</span>
              </div>
            )}
            {V.logBreakdown.hasCompare ? (
              <div className="rtm-scroll" style={css('display:flex;flex-direction:column;gap:15px;max-height:340px;overflow-y:auto;padding-right:4px')}>
                <div style={css('display:grid;grid-template-columns:minmax(180px,1fr) 84px 128px 74px;gap:20px;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#9A93A1;padding-right:2px')}><span></span><span style={css('text-align:right')}>Win rate</span><span style={css('text-align:right')}>Net · record</span><span style={css('text-align:right')}>Avg R</span></div>
                {V.logBreakdown.rows.map((r, i) => (
                  <div key={i} style={{ ...css('display:grid;grid-template-columns:minmax(180px,1fr) 84px 128px 74px;gap:20px;align-items:center'), opacity: r.thin ? 0.45 : 1 }}>
                    <div>
                      <div style={css('display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:7px')}><span style={css('display:flex;align-items:center;gap:8px;color:#24202B')}><span style={{ ...css('width:8px;height:8px;border-radius:50%;flex:none'), background: r.dot, boxShadow: '0 0 7px ' + r.dot + '99' }}></span>{r.name}{r.best && <span title={'ดีกว่าค่าเฉลี่ยรวมอย่างมีนัย และมีอย่างน้อย ' + V.logBreakdown.minSample + ' ไม้'} style={css('font-size:9px;font-weight:700;letter-spacing:.04em;color:#1C9B68;border:1px solid rgba(28,155,104,.4);background:rgba(28,155,104,.12);padding:1px 6px;border-radius:5px')}>BEST</span>}{r.thin && <span title={'ต้องมีอย่างน้อย ' + V.logBreakdown.minSample + ' ไม้ถึงจะเชื่อตัวเลขนี้ได้'} style={css('font-size:9px;font-weight:600;color:#928B9B;border:1px solid rgba(49,35,73,.16);padding:1px 6px;border-radius:5px')}>ยังไม่พอ</span>}</span><span style={css('color:#928B9B;font-size:10.5px;font-family:JetBrains Mono')}>{r.nStr}</span></div>
                      <div style={css('height:7px;border-radius:99px;background:rgba(49,35,73,.06);overflow:hidden')}><div className="bar-grow-x" style={{ ...css('height:100%;border-radius:99px'), background: r.barColor, width: r.w, animationDelay: (i * 0.05) + 's' }}></div></div>
                    </div>
                    <div style={{ ...css('text-align:right;font-family:JetBrains Mono;font-size:16px;font-weight:600'), color: r.wrColor, opacity: V.logBreakdown.metric === 'wr' ? 1 : 0.55 }}>{r.wr}</div>
                    <div style={css('text-align:right')}><span style={{ ...css('font-family:JetBrains Mono;font-size:13.5px'), color: r.netColor }}>{r.net}</span><div style={css('font-size:9.5px;color:#928B9B;margin-top:2px')}>{r.record}</div></div>
                    <div style={{ ...css('text-align:right;font-family:JetBrains Mono;font-size:14px;font-weight:600'), color: V.logBreakdown.metric === 'r' ? r.avgRColor : '#746E7D', opacity: V.logBreakdown.metric === 'r' ? 1 : 0.6 }}>{r.avgR}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={css('font-size:12.5px;color:#928B9B;padding:10px 12px;border-radius:10px;background:rgba(49,35,73,.02);border:1px dashed rgba(49,35,73,.1)')}>{V.filteredCount <= 1 ? 'Only one trade in this selection — nothing to compare yet.' : 'These trades share the same value on every factor — widen the filter to compare (e.g. clear a factor).'}</div>
            )}
          </div>
        </div>}
        <div className="liquid-glass" style={css('border-radius:16px;border:1px solid rgba(49,35,73,.07);overflow:hidden;background:rgba(49,35,73,.02);animation:rise .5s .08s both')}>
          {V.filteredCount > 0 && (
            <div style={css('display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-bottom:1px solid rgba(49,35,73,.06);background:rgba(49,35,73,.018)')}>
              <span style={css('font-size:11.5px;color:#928B9B;font-family:JetBrains Mono')}>{V.logRangeLabel}</span>
              <div style={css('display:flex;align-items:center;gap:8px')}>
                <span onClick={V.logCanPrev ? V.logPrev : undefined} className="rtm-press" style={{ ...css('font-size:11.5px;padding:6px 10px;border-radius:7px;border:1px solid rgba(49,35,73,.1);color:#746E7D'), cursor: V.logCanPrev ? 'pointer' : 'default', opacity: V.logCanPrev ? 1 : .3 }}>←</span>
                <span style={css('font-size:11px;color:#7658E8;font-family:JetBrains Mono')}>{V.logPageLabel}</span>
                <span onClick={V.logCanNext ? V.logNext : undefined} className="rtm-press" style={{ ...css('font-size:11.5px;padding:6px 10px;border-radius:7px;border:1px solid rgba(49,35,73,.1);color:#746E7D'), cursor: V.logCanNext ? 'pointer' : 'default', opacity: V.logCanNext ? 1 : .3 }}>→</span>
              </div>
            </div>
          )}
          <div className="rtm-scroll" style={css('overflow:auto;max-height:60vh')}>
            <div style={{ minWidth: gminw }}>
              <div className="rtm-log-head" style={{ ...css('display:grid;gap:12px;padding:13px 20px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#928B9B;font-weight:600;position:sticky;top:0;z-index:3;background:#fff;box-shadow:0 1px 0 rgba(49,35,73,.08)'), gridTemplateColumns: gcols }}>
                <span>Date</span>{expanded && <><span title="เวลาเข้า → ออก (เวลา server)">Time</span><span title="ถือนานแค่ไหน">Hold</span></>}<span>Symbol</span><span>Side</span>{V.showPort && (<span title="ออเดอร์นี้อยู่พอร์ตไหน">Port</span>)}<span>Setup</span><span title="Session ที่เทรด">Session</span>{expanded && <><span title="จุดเข้าของไม้แรก">Entry</span><span title="Timeframes aligned">TF</span><span title="Retest แล้ว fibo โซนไหน">Retest · Fibo</span><span title="Max cumulative lot across legs">Lot</span><span title="ราคาวิ่งไปไกลสุด ($)">MFE</span><span title="Drawdown ของไม้ (pip) หรือ heat R">Max DD</span></>}<span>R</span><span>P&amp;L</span>
              </div>
              {V.filteredTrades.map((t, i) => (
                <div key={t.id} onClick={t.open} className="hv-row rtm-cascade" style={{ ...css('display:grid;gap:12px;padding:12px 20px;border-top:1px solid rgba(49,35,73,.05);font-size:12.5px;cursor:pointer;transition:.12s;align-items:center'), gridTemplateColumns: gcols, animationDelay: (Math.min(i, 14) * 0.035) + 's' }}>
                  <span style={css('display:inline-flex;align-items:center;gap:7px;width:fit-content;padding:3px 8px 3px 9px;border-radius:8px;border:1px solid rgba(118,88,232,.3);background:rgba(118,88,232,.06)')}><span style={{ ...css('font-size:13px;font-weight:700;letter-spacing:.02em'), color: t.dowColor }}>{t.dowShort}</span><span style={css('font-family:JetBrains Mono;font-size:11px;color:#7563A6')}>{t.dateShort}</span></span>
                  {expanded && <><span title="เวลาเข้า → ออก" style={css('font-family:JetBrains Mono;font-size:11.5px;white-space:nowrap')}><span style={{ color: t.entryHM ? '#5F5967' : '#5a5a62' }}>{t.entryHM || '—'}</span><span style={css('color:#5a5a62')}> → </span><span style={{ color: t.exitHM ? '#8FBFA6' : '#5a5a62' }}>{t.exitHM || '—'}</span></span>
                  <span title={'Held ' + t.holding} style={css('width:fit-content;font-family:JetBrains Mono;font-size:10.5px;color:#7658E8;padding:3px 7px;border-radius:7px;border:1px solid rgba(118,88,232,.20);background:rgba(118,88,232,.06);white-space:nowrap')}>{t.holdShort}</span></>}
                  <span style={css('display:inline-flex;align-items:center;gap:7px;min-width:0')}><span style={css('color:#24202B;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{t.sym}</span>{t.isMulti && (<span title={t.legN + ' legs · max lot ' + t.legMaxLot + (t.legAvgEntry ? ' · avg ' + t.legAvgEntry : '')} style={css('flex:none;display:inline-flex;align-items:center;gap:3px;font-family:JetBrains Mono;font-size:10px;font-weight:600;color:#7658E8;padding:2px 6px;border-radius:6px;border:1px solid rgba(118,88,232,.32);background:rgba(118,88,232,.08)')}><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 18V7M10 18v-8M16 18v-5M22 18v-3" strokeLinecap="round"/></svg>×{t.legN}</span>)}</span>
                  <span style={{ ...css('font-weight:600'), color: t.sideColor }}>{t.side}</span>
                  {V.showPort && (<span title={'พอร์ต: ' + t.portName} style={{ ...css('font-size:11px;font-weight:600;width:fit-content;max-width:100%;padding:3px 8px;border-radius:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'), color: t.portColor, border: '1px solid ' + t.portColor + '44', background: t.portColor + '14' }}>{t.portName}</span>)}
                  <span style={css('color:#746E7D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')} title={t.setupName}>{t.setupName}</span>
                  <span title={'เทรดช่วง ' + (t.session || '—')} style={{ ...css('font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'), color: t.sessionColor }}>{t.session || '—'}</span>
                  {expanded && <><span title={'จุดเข้า: ' + (t.entryModel || '—')} style={css('font-size:11.5px;color:#5F5967;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{t.entryModel || '—'}</span>
                  <span title={t.alignN + ' of 3 timeframes aligned'} style={{ ...css('font-family:JetBrains Mono;font-size:12.5px;font-weight:600'), color: t.alignColor }}>{t.alignStr}</span>
                  <span title={'Retest ' + (t.retestStr || '—') + ' · ' + (t.fiboShort || '—')} style={css('display:flex;align-items:center;gap:6px;min-width:0')}>
                    <span style={{ ...css('font-size:11px;font-weight:700;flex:none'), color: t.retestColor }}>{t.retestStr}</span>
                    <span style={css('font-size:11px;color:#746E7D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{t.fiboShort}</span>
                  </span>
                  <span title="Max cumulative lot across legs" style={css('font-family:JetBrains Mono;font-size:12px;color:#5F5967')}>{t.maxLotStr}</span>
                  <span title="ราคาวิ่งไปไกลสุด ($) — กรอกราคา TP + peak ในหน้าบันทึกเพื่อให้คำนวณอัตโนมัติ" style={css('font-family:JetBrains Mono;font-size:12px;color:#8FBFA6')}>{t.mfeStr}</span>
                  <span title="Max drawdown of the position" style={{ ...css('font-family:JetBrains Mono;font-size:12px'), color: t.heatColor }}>{t.heatStr}</span></>}
                  <span style={{ ...css('font-family:JetBrains Mono;font-weight:600'), color: t.rColor }}>{t.rStr}</span>
                  <span style={{ ...css('font-family:JetBrains Mono;font-weight:600'), color: t.pnlColor }}>{t.pnlStr}</span>
                </div>
              ))}
            </div>
          </div>
          {V.filteredTrades.length === 0 && (
            <div style={css('padding:48px 20px;text-align:center;border-top:1px solid rgba(49,35,73,.05)')}>
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#928B9B" strokeWidth="1.4" style={{ marginBottom: 12 }}><path d="M4 6h16M4 12h16M4 18h10"/></svg>
              <div style={css('font-size:14px;color:#746E7D;margin-bottom:6px')}>{V.tradeCount === 0 ? 'No trades yet' : 'No trades match the filter'}</div>
              <div style={css('font-size:12.5px;color:#928B9B')}>{V.tradeCount === 0 ? 'Press “+ New trade” or N to start logging' : 'Try clearing the search / changing the filter'}</div>
            </div>
          )}
          {V.filteredCount > 0 && (
            <div style={css('display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 18px;border-top:1px solid rgba(49,35,73,.06);background:rgba(0,0,0,.14)')}>
              <span style={css('font-size:11.5px;color:#928B9B;font-family:JetBrains Mono')}>{V.logRangeLabel}</span>
              <div style={css('display:flex;align-items:center;gap:7px')}>
                <span onClick={V.logCanPrev ? V.logFirst : undefined} className="rtm-press" title="First page" style={{ ...css('width:30px;height:30px;border-radius:8px;border:1px solid rgba(49,35,73,.1);display:flex;align-items:center;justify-content:center;color:#746E7D'), cursor: V.logCanPrev ? 'pointer' : 'default', opacity: V.logCanPrev ? 1 : .3 }}>«</span>
                <span onClick={V.logCanPrev ? V.logPrev : undefined} className="rtm-press" title="Previous page" style={{ ...css('height:30px;padding:0 11px;border-radius:8px;border:1px solid rgba(49,35,73,.1);display:flex;align-items:center;justify-content:center;color:#746E7D;font-size:12px'), cursor: V.logCanPrev ? 'pointer' : 'default', opacity: V.logCanPrev ? 1 : .3 }}>← Prev</span>
                <span style={css('min-width:88px;text-align:center;font-size:11.5px;color:#7658E8;font-family:JetBrains Mono')}>{V.logPageLabel}</span>
                <span onClick={V.logCanNext ? V.logNext : undefined} className="rtm-press" title="Next page" style={{ ...css('height:30px;padding:0 11px;border-radius:8px;border:1px solid rgba(49,35,73,.1);display:flex;align-items:center;justify-content:center;color:#746E7D;font-size:12px'), cursor: V.logCanNext ? 'pointer' : 'default', opacity: V.logCanNext ? 1 : .3 }}>Next →</span>
                <span onClick={V.logCanNext ? V.logLast : undefined} className="rtm-press" title="Last page" style={{ ...css('width:30px;height:30px;border-radius:8px;border:1px solid rgba(49,35,73,.1);display:flex;align-items:center;justify-content:center;color:#746E7D'), cursor: V.logCanNext ? 'pointer' : 'default', opacity: V.logCanNext ? 1 : .3 }}>»</span>
              </div>
              <span style={css('font-size:11px;color:#666670')}>50 trades / page</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  renderAnalytics(V) {
    return (
      <div style={css('padding:24px 28px 40px;animation:viewIn .45s cubic-bezier(.2,.7,.3,1) both')}>
        <div style={css('display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px;animation:rise .5s both')}><div><div className="rtm-head" style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6747D8;margin-bottom:6px')}>Edge lab · {V.modeLabel}</div><div style={css('font-family:\'Instrument Serif\',serif;font-size:28px;color:#24202B')}>{V.isBacktestMode ? 'Discover the edge' : 'Validate the edge'} <span style={css('font-style:italic;color:#7658E8')}>— evidence before conviction</span></div></div><div className="liquid-glass" style={css('display:flex;gap:3px;padding:4px;border-radius:999px')}><span onClick={V.showBacktestAnalytics} className="rtm-press" style={{ ...css('font-size:11.5px;font-weight:700;padding:7px 14px;border-radius:999px;cursor:pointer'), color: V.isBacktestMode ? '#071018' : '#928B9B', background: V.isBacktestMode ? '#4D7FE8' : 'transparent' }}>Backtest</span><span onClick={V.showForwardAnalytics} className="rtm-press" style={{ ...css('font-size:11.5px;font-weight:700;padding:7px 14px;border-radius:999px;cursor:pointer'), color: !V.isBacktestMode ? '#07140e' : '#928B9B', background: !V.isBacktestMode ? '#1C9B68' : 'transparent' }}>Forward</span></div></div>
        <div className="liquid-glass" style={css('padding:18px 20px;border-radius:16px;background:linear-gradient(120deg,rgba(118,88,232,.07),rgba(49,35,73,.018));border:1px solid rgba(118,88,232,.2);margin-bottom:16px;animation:rise .5s .02s both')}>
          <div style={css('display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px')}><div><div style={css('font-family:\'Instrument Serif\',serif;font-size:18px;color:#24202B')}>Setup validation gates</div><div style={css('font-size:11px;color:#928B9B;margin-top:4px;line-height:1.55')}>Backtest: ≥30 ไม้, Avg R &gt; 0, PF ≥1.20, DD ≤10R และช่วง holdout ล่าสุดต้องเป็นบวก · Forward: ≥30 ไม้, PF ≥1.10 และขอบล่าง 95% CI ของ Avg R ต้องมากกว่า 0 <span style={css('color:#A69BC0')}>· นับเฉพาะไม้ที่มีผลลัพธ์และ Risk (1R) ครบ</span></div></div><span style={css('flex:none;font-size:10.5px;color:#1C9B68;padding:5px 10px;border-radius:999px;background:rgba(28,155,104,.08);border:1px solid rgba(28,155,104,.24)')}>{V.confirmedSetups} confirmed</span></div>
          <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:10px')}>
            {V.setupGates.map((g, i) => (
              <div key={g.id} onClick={g.open} className="rtm-gate-card rtm-press" style={{ ...css('padding:14px 15px;border-radius:13px;background:rgba(5,5,8,.46);cursor:pointer;transition:.17s;animation:rise .45s both'), border: '1px solid ' + g.color + '44', animationDelay: (i * .055) + 's' }}>
                <div style={css('display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px')}><div style={css('font-size:13.5px;font-weight:700;color:#24202B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.name} <span style={css('font-family:JetBrains Mono;font-size:9.5px;color:#8B6CF0')}>{g.versionLabel}</span></div><span style={{ ...css('font-size:9.5px;font-weight:700;padding:4px 8px;border-radius:999px;white-space:nowrap'), color: g.color, background: g.color + '14', border: '1px solid ' + g.color + '44' }}>{g.stageLabel}</span></div>
                <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px')}>
                  <div style={css('padding:9px 10px;border-radius:9px;background:rgba(77,127,232,.06)')}><div style={css('font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#4D7FE8;margin-bottom:5px')}>Backtest</div><div style={css('font-family:JetBrains Mono;font-size:12px;color:#24202B')}>{g.btN} · {g.btR}</div><div style={css('font-size:9.5px;color:#77717F;margin-top:4px')}>PF {g.btPf} · DD {g.btDd}</div><div style={css('font-size:9.5px;color:#77717F;margin-top:3px')}>Holdout {g.holdoutN} · {g.holdoutR}</div></div>
                  <div style={css('padding:9px 10px;border-radius:9px;background:rgba(28,155,104,.05)')}><div style={css('font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#1C9B68;margin-bottom:5px')}>Forward</div><div style={css('font-family:JetBrains Mono;font-size:12px;color:#24202B')}>{g.fwN} · {g.fwR}</div><div style={css('font-size:9.5px;color:#77717F;margin-top:4px')}>PF {g.fwPf} · quality {g.fwQuality}</div><div title="95% confidence interval of average R" style={css('font-size:9.5px;color:#77717F;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>95% CI {g.fwCi}</div></div>
                </div>
                <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px')}><div style={css('height:4px;border-radius:99px;background:rgba(49,35,73,.06);overflow:hidden')}><div className="bar-grow-x" style={{ width: g.btProgress, height: '100%', borderRadius: 99, background: '#4D7FE8' }}></div></div><div style={css('height:4px;border-radius:99px;background:rgba(49,35,73,.06);overflow:hidden')}><div className="bar-grow-x" style={{ width: g.fwProgress, height: '100%', borderRadius: 99, background: '#1C9B68' }}></div></div></div>
                <div style={{ ...css('font-size:10.5px;line-height:1.4'), color: g.color }}>{g.stageNote}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rtm-execution-audit liquid-glass" style={css('display:grid;grid-template-columns:minmax(220px,1.2fr) repeat(3,minmax(135px,.7fr));gap:12px;padding:18px 20px;border-radius:16px;margin-bottom:16px')}>
          <div style={css('padding:4px 10px 4px 2px')}><div style={css('font-size:9.5px;font-weight:800;letter-spacing:.16em;color:#7658E8;margin-bottom:7px')}>EXECUTION AUDIT</div><div style={css('font-family:Instrument Serif;font-size:21px;color:#24202B;margin-bottom:6px')}>System edge vs. execution leak</div><div style={css('font-size:10.5px;color:#746E7D;line-height:1.55')}>เทียบไม้ที่ทำตามแผนกับไม้ที่หลุดกฎ โดยเก็บทุกไม้ไว้เพื่อป้องกันการเลือกข้อมูลย้อนหลัง · coverage {V.executionAudit.coverage}</div></div>
          <div style={css('padding:13px 15px;border-radius:12px;background:rgba(28,155,104,.07);border:1px solid rgba(28,155,104,.15)')}><div style={css('font-size:9.5px;color:#746E7D;margin-bottom:8px')}>ON PLAN · {V.executionAudit.onN} trades</div><div style={css('font-family:JetBrains Mono;font-size:19px;font-weight:700;color:#1C9B68')}>{V.executionAudit.onR}</div><div style={css('font-size:10px;color:#746E7D;margin-top:6px')}>Win rate {V.executionAudit.onWr}</div></div>
          <div style={css('padding:13px 15px;border-radius:12px;background:rgba(226,84,98,.06);border:1px solid rgba(226,84,98,.14)')}><div style={css('font-size:9.5px;color:#746E7D;margin-bottom:8px')}>DEVIATED · {V.executionAudit.offN} trades</div><div style={css('font-family:JetBrains Mono;font-size:19px;font-weight:700;color:#E25462')}>{V.executionAudit.offR}</div><div style={css('font-size:10px;color:#746E7D;margin-top:6px')}>Win rate {V.executionAudit.offWr}</div></div>
          <div style={css('padding:13px 15px;border-radius:12px;background:rgba(118,88,232,.07);border:1px solid rgba(118,88,232,.15)')}><div style={css('font-size:9.5px;color:#746E7D;margin-bottom:8px')}>EDGE LOST TO EXECUTION</div><div style={css('font-family:JetBrains Mono;font-size:19px;font-weight:700;color:#7658E8')}>{V.executionAudit.leak}</div><div style={css('font-size:10px;color:#746E7D;margin-top:6px')}>{V.executionAudit.ready ? 'comparison active' : 'เก็บอย่างน้อย 10 ไม้ที่ติดป้าย'}</div></div>
        </div>
        <div className="rtm-research-suite">
          <section className="rtm-research-card liquid-glass rtm-quality-card">
            <div className="rtm-suite-head"><div><span>DATA QUALITY</span><h3>Can this sample be trusted?</h3></div><b style={{ color: V.dataQuality.color }}>{V.dataQuality.score}%</b></div>
            <div className="rtm-quality-summary">
              <div className="rtm-quality-ring" style={{ background: `conic-gradient(${V.dataQuality.color} 0% ${V.dataQuality.score}%, rgba(255,255,255,.07) ${V.dataQuality.score}% 100%)` }}><div><strong>{V.dataQuality.score}</strong><small>/ 100</small></div></div>
              <div><strong style={{ color: V.dataQuality.color }}>{V.dataQuality.grade}</strong><p>{V.dataQuality.researchReady} of {V.dataQuality.count} closed trades have both outcome and real 1R.</p></div>
            </div>
            <div className="rtm-missing-list">
              {V.dataQuality.missing.length ? V.dataQuality.missing.map((field) => <div key={field.key}><span>{field.label}</span><b>{field.count} missing · {field.pct}%</b></div>) : <div className="is-complete">All research fields are complete.</div>}
            </div>
            {!!V.dataQuality.bySetup.length && <div className="rtm-quality-setups">{V.dataQuality.bySetup.map((setup) => <span key={setup.setupId}><i style={{ background: setup.color }}></i>{setup.name}<b>{setup.score}%</b></span>)}</div>}
          </section>

          <section className="rtm-research-card liquid-glass">
            <div className="rtm-suite-head"><div><span>WALK-FORWARD</span><h3>Does the edge survive over time?</h3></div>{V.walkForward.ready && <b>{V.walkForward.positiveRateLabel}</b>}</div>
            {V.walkForward.ready ? <div className="rtm-window-list">
              {V.walkForward.windows.map((window) => <div key={window.index} className="rtm-window-row"><i style={{ background: window.color }}></i><span><small>Window {window.index} · {window.rangeLabel}</small><strong>{window.avgRLabel}</strong></span><b style={{ color: window.color }}>PF {window.pfLabel}</b><em>{window.ddLabel}</em></div>)}
            </div> : <div className="rtm-suite-empty"><strong>{V.walkForward.nextNeeded} trades to go</strong><p>Walk-forward starts at 30 valid R observations and advances in 15-trade steps.</p></div>}
          </section>

          <section className="rtm-research-card liquid-glass">
            <div className="rtm-suite-head"><div><span>EDGE DRIFT</span><h3>Backtest vs. recent forward</h3></div><small>Latest 30</small></div>
            <div className="rtm-drift-list">
              {V.driftRows.length ? V.driftRows.slice(0, 5).map((row) => <div key={row.id} className="rtm-drift-row" title={row.note}><i style={{ background: row.color, boxShadow: `0 0 14px ${row.color}55` }}></i><span><strong>{row.name}</strong><small>BT {row.btN} · FW {row.fwN}</small></span><b>{row.baselineR} → {row.recentR}</b><em style={{ color: row.color }}>{row.statusLabel}</em></div>) : <div className="rtm-suite-empty"><p>Create a setup to start drift monitoring.</p></div>}
            </div>
            <p className="rtm-suite-note">A warning freezes size for review; it does not rewrite the setup mid-sample.</p>
          </section>

          <section className="rtm-research-card liquid-glass">
            <div className="rtm-suite-head"><div><span>MONTE CARLO</span><h3>What can the same edge feel like?</h3></div><Sel value={String(V.simulationRiskPct)} onChange={V.setSimulationRiskPct} className="rtm-risk-select"><option value="0.25">0.25% risk</option><option value="0.5">0.50% risk</option><option value="1">1.00% risk</option><option value="2">2.00% risk</option><option value="3">3.00% risk</option></Sel></div>
            {V.monteCarlo.ready ? <Fragment><div className="rtm-sim-grid"><div><small>Risk of 50% loss</small><strong className="is-danger">{V.monteCarlo.ruinLabel}</strong></div><div><small>Median max DD</small><strong>{V.monteCarlo.medianDdLabel}</strong></div><div><small>Stress max DD · P95</small><strong>{V.monteCarlo.p95DdLabel}</strong></div><div><small>Median after 100 trades</small><strong className="is-positive">{V.monteCarlo.medianEndLabel}</strong></div></div><p className="rtm-suite-note">1,200 deterministic bootstrap paths · empirical R sampled with replacement. This models sequence risk, not future certainty or regime change.</p></Fragment> : <div className="rtm-suite-empty"><strong>{V.monteCarlo.nextNeeded} valid R trades to go</strong><p>Simulation unlocks at 20 closed trades with real risk and outcome.</p></div>}
          </section>
        </div>
        <div className="rtm-stagger" style={css('display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px;animation:rise .5s .03s both')}>
          {[
            { l: 'Expectancy / trade', v: V.expectancyStr, c: '#7658E8' },
            { l: 'Profit factor', v: V.anaPf, c: '#4D7FE8' },
            { l: 'Max Drawdown', v: V.anaDD, c: '#E25462' },
            { l: 'Green days', v: V.consistencyStr, c: '#1C9B68' },
            { l: 'Current streak', v: V.curStreakStr, c: V.curStreakColor, count: false },  // prose, not a figure
          ].map((m, i) => (
            <div key={i} className="hv-k-gold liquid-glass" style={{ ...css('padding:15px 16px;border-radius:13px;background:linear-gradient(180deg,' + m.c + '17,rgba(49,35,73,.015));border:1px solid rgba(49,35,73,.07);border-top:2px solid ' + m.c + ';transition:.16s;animation:rise .5s both'), animationDelay: (0.04 + i * 0.06) + 's' }}><div style={css('font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#928B9B;margin-bottom:10px')}>{m.l}</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:23px;font-weight:600'), color: m.c }}>{m.count === false ? m.v : <CountUp value={m.v} />}</div></div>
          ))}
        </div>
        <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px')}>
          <div className="hv-brd-gold liquid-glass" style={css('padding:20px 22px;border-radius:16px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);animation:rise .5s .06s both;transition:.18s')}>
            <div style={css('font-family:\'Instrument Serif\',serif;font-size:16px;color:#24202B;margin-bottom:18px')}>P&amp;L by day of week</div>
            <div style={css('display:flex;align-items:flex-end;gap:14px;height:150px')}>
              {V.dowBars.map((b, i) => (
                <div key={i} style={css('flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end')}><span style={{ ...css('font-size:11px;font-family:JetBrains Mono'), color: b.color }}>{b.val}</span><div className="bar-grow" style={{ ...css('width:100%;border-radius:7px 7px 0 0;transition:.3s'), background: b.bg, height: b.h, animationDelay: (i * 0.07) + 's' }}></div><span style={css('font-size:11px;color:#746E7D')}>{b.label}</span></div>
              ))}
            </div>
          </div>
          <div className="hv-brd-gold liquid-glass" style={css('padding:20px 22px;border-radius:16px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);animation:rise .5s .1s both;transition:.18s')}>
            <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:18px')}><div style={css('font-family:\'Instrument Serif\',serif;font-size:16px;color:#24202B')}>P&amp;L by session</div><span style={css('font-size:11px;color:#928B9B')}>coloured by market</span></div>
            <div style={css('display:flex;align-items:flex-end;gap:18px;height:150px')}>
              {V.sessionBars.map((b, i) => (
                <div key={i} style={css('flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end')}><span style={{ ...css('font-size:11px;font-family:JetBrains Mono'), color: b.color }}>{b.val}</span><div className="bar-grow" style={{ ...css('width:100%;border-radius:7px 7px 0 0;transition:.3s'), background: b.bg, height: b.h, boxShadow: b.glow, animationDelay: (i * 0.09) + 's' }}></div><span style={{ ...css('font-size:11px;font-weight:600'), color: b.labelColor }}>{b.label}</span></div>
              ))}
            </div>
          </div>
        </div>
        {/* Edge finder — which confluence factors actually lift the win-rate (the "know your edge" panel) */}
        <div className="hv-brd-gold liquid-glass" style={css('padding:20px 22px;border-radius:16px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);margin-bottom:16px;animation:rise .5s .12s both;transition:.18s')}>
          <div style={css('display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;flex-wrap:wrap;gap:8px')}>
            <div style={css('font-family:\'Instrument Serif\',serif;font-size:16px;color:#24202B')}>Edge finder <span style={css('font-style:italic;color:#7658E8')}>— เงื่อนไขไหนทำให้ผลดีขึ้นจริง</span></div>
            <div style={css('display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
              <Sel value={V.edgeFinder.metric} onChange={V.setEdgeMetric} title="วัดด้วยอะไร" className="hv-focus rtm-select" style={css('background:rgba(49,35,73,.04);border:1px solid rgba(77,127,232,.4);border-radius:9px;padding:6px 11px;color:#9CC2E8;font-size:12px;font-weight:600;outline:none;cursor:pointer')}>
                <option value="r">Expectancy (avg R)</option>
                <option value="wr">Win rate</option>
              </Sel>
              <div style={css('font-size:11.5px;color:#928B9B')}>ค่าเฉลี่ยคุณ <b style={css('color:#5F5967;font-family:JetBrains Mono')}>{V.edgeFinder.baselineStr}</b> · ต้องดีกว่านี้อย่างน้อย <b style={css('color:#5F5967;font-family:JetBrains Mono')}>{V.edgeFinder.minLiftStr}</b> และมี ≥<b style={css('color:#5F5967')}>{V.edgeFinder.minSample}</b> ไม้</div>
            </div>
          </div>
          {V.edgeFinder.hasData ? (
            <div style={css('margin-top:14px;display:flex;flex-direction:column;gap:7px')}>
              {V.edgeFinder.rows.map((r, i) => (
                <div key={i} className="hv-row rtm-cascade" style={{ ...css('display:grid;grid-template-columns:132px 1fr 74px 84px 92px;gap:14px;align-items:center;padding:10px 12px;border-radius:11px;transition:.14s'), background: i === 0 ? 'linear-gradient(100deg,rgba(28,155,104,.1),rgba(49,35,73,.015))' : 'rgba(49,35,73,.02)', border: '1px solid ' + (i === 0 ? 'rgba(28,155,104,.32)' : 'rgba(49,35,73,.055)'), animationDelay: (i * 0.06) + 's' }}>
                  <div style={css('min-width:0')}><div style={css('font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#928B9B;margin-bottom:2px')}>{r.factor}</div><div style={css('font-size:13px;font-weight:600;color:#24202B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')} title={r.value}>{r.value}</div></div>
                  <div style={css('display:flex;align-items:center;gap:10px')}><div style={css('flex:1;height:7px;border-radius:5px;background:rgba(49,35,73,.06);overflow:hidden')}><div className="bar-grow-x" style={{ ...css('height:100%;border-radius:5px'), width: r.w, background: i === 0 ? 'linear-gradient(90deg,#1C9B68,#1C9B68)' : 'linear-gradient(90deg,#6747D8,#7658E8)', animationDelay: (0.1 + i * 0.06) + 's' }}></div></div><span style={css('font-size:10.5px;color:#928B9B;font-family:JetBrains Mono;white-space:nowrap')}>{r.n} ไม้ · {r.record}</span></div>
                  <div style={{ ...css('font-family:JetBrains Mono;font-size:15px;font-weight:600;text-align:right'), color: r.lift > 0 ? '#1C9B68' : '#E0B15A' }}>{r.valueStr}</div>
                  <div style={css('text-align:right')}><span style={{ ...css('font-family:JetBrains Mono;font-size:12px;font-weight:600;padding:3px 8px;border-radius:7px'), color: '#1C9B68', background: 'rgba(28,155,104,.12)' }}>{r.liftStr}</span></div>
                  <div style={css('text-align:right')}><div style={{ ...css('font-family:JetBrains Mono;font-size:13px;font-weight:600'), color: r.netColor }}>{r.net}</div><div style={{ ...css('font-size:9px;font-weight:600;margin-top:2px'), color: r.confColor }}>{r.confLabel}</div></div>
                </div>
              ))}
              <div style={css('font-size:11px;color:#9A93A1;margin-top:4px;line-height:1.55')}>อ่านว่า: ตัวเลขสีเขียวคือ<b style={css('color:#9CD3C0')}>ส่วนที่ดีกว่าค่าเฉลี่ยของคุณเอง</b> — เข้าไม้เฉพาะตอนเงื่อนไขเหล่านี้ครบ จะดันผลรวมขึ้น · ป้าย <b style={css('color:#7658E8')}>พอประเมินได้</b> = {V.edgeFinder.minSample}+ ไม้, <b style={css('color:#1C9B68')}>น่าเชื่อถือ</b> = {V.edgeFinder.strongSample}+ ไม้ · เจอแล้วอย่าเพิ่งเชื่อ เก็บอีก 30 ไม้ยืนยันก่อน</div>
            </div>
          ) : (
            <div style={css('margin-top:14px;text-align:center;padding:26px 16px;border-radius:12px;border:1px dashed rgba(118,88,232,.24);background:rgba(118,88,232,.03);font-size:12.5px;color:#746E7D;line-height:1.6')}>
              {!V.edgeFinder.sampleReady
                ? (<span>ยังสรุปไม่ได้ — ต้องมีอย่างน้อย <b style={css('color:#7658E8')}>{V.edgeFinder.minSample} ไม้ต่อกลุ่ม</b> ถึงจะแยก edge ออกจาก noise ได้<br/>ตอนนี้ปิดไปแล้ว <b style={css('color:#7658E8')}>{V.edgeFinder.closedN}</b> ไม้ · กลุ่มใหญ่สุดมี <b style={css('color:#7658E8')}>{V.edgeFinder.bestSample}</b> ไม้</span>)
                : (<span>มีข้อมูลพอแล้ว แต่<b style={css('color:#7658E8')}>ยังไม่มีเงื่อนไขไหนดีกว่าค่าเฉลี่ยของคุณ ({V.edgeFinder.baselineStr}) ถึง {V.edgeFinder.minLiftStr}</b><br/>แปลว่ายังไม่เจอ edge ที่ชัดพอจะเอาไปกรองไม้ — เก็บต่อ หรือลองสลับไปดูอีกมุมหนึ่ง</span>)}
            </div>
          )}
        </div>
        <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
          <div className="hv-brd-gold liquid-glass" style={css('padding:20px 22px;border-radius:16px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);animation:rise .5s .14s both;transition:.18s')}>
            <div style={css('font-family:\'Instrument Serif\',serif;font-size:16px;color:#24202B;margin-bottom:18px')}>R-multiple distribution</div>
            <div style={css('display:flex;align-items:flex-end;gap:8px;height:140px')}>
              {V.rDist.map((b, i) => (
                <div key={i} style={css('flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end')}><div className="bar-grow" style={{ ...css('width:100%;border-radius:5px 5px 0 0'), background: b.bg, height: b.h, animationDelay: (i * 0.05) + 's' }}></div><span style={css('font-size:10px;color:#928B9B;font-family:JetBrains Mono')}>{b.label}</span></div>
              ))}
            </div>
          </div>
          <div className="hv-brd-gold liquid-glass" style={css('padding:20px 22px;border-radius:16px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);animation:rise .5s .18s both;transition:.18s')}>
            <div style={css('font-family:\'Instrument Serif\',serif;font-size:16px;color:#24202B;margin-bottom:16px')}>Key stats</div>
            <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
              {V.anaStats.map((s, i) => (
                <div key={i} style={css('padding:15px 17px;border-radius:12px;background:linear-gradient(180deg,rgba(49,35,73,.03),rgba(49,35,73,.01));border:1px solid rgba(49,35,73,.06)')}><div style={css('font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#928B9B;margin-bottom:10px')}>{s.label}</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:22px;font-weight:600'), color: s.color }}>{s.val}</div></div>
              ))}
            </div>
          </div>
        </div>

        <div style={css('display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-top:16px')}>
          <div className="hv-brd-gold liquid-glass" style={css('padding:20px 22px;border-radius:16px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);animation:rise .5s .22s both;transition:.18s')}>
            <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:14px')}><div style={css('font-family:\'Instrument Serif\',serif;font-size:16px;color:#24202B')}>Drawdown</div><span style={css('font-size:11px;color:#928B9B')}>{V.ddUnitLabel}</span></div>
            <svg viewBox="0 0 640 120" preserveAspectRatio="none" style={css('width:100%;height:120px;display:block')}>
              <defs><linearGradient id="ddg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E25462" stopOpacity="0"/><stop offset="100%" stopColor="#E25462" stopOpacity=".4"/></linearGradient></defs>
              <line x1="0" y1="1" x2="640" y2="1" stroke="rgba(49,35,73,.1)"/>
              <path d={V.ddArea} fill="url(#ddg)"/>
              <path className="eq-line" d={V.ddLine} fill="none" stroke="#E25462" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="hv-brd-gold liquid-glass" style={css('padding:20px 22px;border-radius:16px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);animation:rise .5s .26s both;transition:.18s')}>
            <div style={css('font-family:\'Instrument Serif\',serif;font-size:16px;color:#24202B;margin-bottom:14px')}>P&amp;L by symbol</div>
            <div style={css('display:flex;flex-direction:column;gap:11px')}>
              {V.symbolBars.length ? V.symbolBars.map((s, i) => (
                <div key={i}><div style={css('display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px')}><span style={css('color:#24202B')}>{s.name} <span style={css('color:#928B9B;font-size:10.5px;font-family:JetBrains Mono')}>{s.meta}</span></span><span style={{ ...css('font-family:JetBrains Mono'), color: s.color }}>{s.pnl}</span></div><div style={css('height:6px;border-radius:99px;background:rgba(49,35,73,.06);overflow:hidden')}><div className="bar-grow-x" style={{ ...css('height:100%;border-radius:99px'), background: s.color, width: s.w, animationDelay: (i * 0.08) + 's' }}></div></div></div>
              )) : <div style={css('font-size:12.5px;color:#928B9B')}>No data yet</div>}
              {V.symbolMore > 0 && <div style={css('font-size:11.5px;color:#928B9B;text-align:center;margin-top:2px')}>+ {V.symbolMore} more symbols (top 15 by P&amp;L)</div>}
            </div>
          </div>
        </div>

        <div className="hv-brd-gold liquid-glass" style={css('margin-top:16px;padding:20px 22px;border-radius:16px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);animation:rise .5s .3s both;transition:.18s')}>
          <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:10px')}>
            <div style={css('font-family:\'Instrument Serif\',serif;font-size:16px;color:#24202B')}>P&amp;L by feeling <span style={css('font-size:12px;color:#928B9B;font-family:\'Plus Jakarta Sans\'')}>— อารมณ์ไหนทำให้ผลออกมาแบบนั้น</span></div>
            <Sel value={V.feelMoment} onChange={V.setFeelMoment} className="hv-focus rtm-select" style={css('background:rgba(49,35,73,.04);border:1px solid rgba(139,108,240,.4);border-radius:9px;padding:6px 11px;color:#B79CE8;font-size:12px;font-weight:600;outline:none;cursor:pointer')}>
              {V.feelMoments.map(m => (<option key={m.v} value={m.v}>{m.label}</option>))}
            </Sel>
          </div>
          <div style={css('font-size:11px;color:#928B9B;margin-bottom:14px;line-height:1.5')}>เรียงจาก <b style={css('color:#746E7D')}>แย่สุดขึ้นก่อน</b> ตาม Expectancy — อารมณ์ที่ทำให้ avg R ติดลบคือสิ่งที่ต้องแก้ก่อน</div>
          <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:13px 24px')}>
            {V.feelRows.length ? V.feelRows.map((s, i) => (
              <div key={i} className="rtm-cascade" style={{ animationDelay: (i * 0.05) + 's' }}>
                <div style={css('display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;margin-bottom:6px;gap:8px')}>
                  <span style={css('color:#24202B;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{s.name} <span style={css('color:#928B9B;font-size:10.5px;font-family:JetBrains Mono')}>{s.meta}</span></span>
                  <span style={css('display:flex;align-items:baseline;gap:9px;flex:none')}><span style={{ ...css('font-family:JetBrains Mono;font-size:13px;font-weight:600'), color: s.avgRColor }}>{s.avgR}</span><span style={{ ...css('font-family:JetBrains Mono;font-size:12px'), color: s.color }}>{s.pnl}</span></span>
                </div>
                <div style={css('height:6px;border-radius:99px;background:rgba(49,35,73,.06);overflow:hidden')}><div className="bar-grow-x" style={{ ...css('height:100%;border-radius:99px'), background: s.color, width: s.w, animationDelay: (i * 0.08) + 's' }}></div></div>
              </div>
            )) : <div style={css('grid-column:1/-1;font-size:12.5px;color:#928B9B')}>ยังไม่มีข้อมูล Feeling ในช่วงนี้ — เลือกอารมณ์ตอนบันทึกเทรด แล้วระบบจะบอกว่าอารมณ์ไหนกินกำไรคุณ</div>}
            {V.feelMore > 0 && <div style={css('grid-column:1/-1;font-size:11.5px;color:#928B9B;text-align:center')}>+ อีก {V.feelMore} อารมณ์</div>}
          </div>
        </div>
      </div>
    );
  }

  renderSetups(V) {
    return (
      <div style={css('padding:24px 28px 40px;animation:viewIn .45s cubic-bezier(.2,.7,.3,1) both')}>
        <div style={css('display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px;animation:rise .5s both')}>
          <div><div className="rtm-head" style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6747D8;margin-bottom:6px')}>System library</div><div style={css('font-family:\'Instrument Serif\',serif;font-size:28px;color:#24202B')}>Trade setups <span style={css('font-style:italic;color:#7658E8')}>— promote only proven rules</span></div></div>
          <span onClick={V.openNewSetup} className="hv-setbtn rtm-press" style={css('font-size:12px;font-weight:600;padding:9px 16px;border-radius:9px;cursor:pointer;color:#FFFFFF;background:linear-gradient(180deg,#7658E8,#6747D8);display:flex;align-items:center;gap:5px;transition:.14s')}>+ New setup</span>
        </div>
        <div style={css('display:grid;grid-template-columns:repeat(2,1fr);gap:16px')}>
          {V.setupCards.map((s) => (
            <div key={s.id} onClick={s.open} className="hv-card liquid-glass" style={{ ...css('position:relative;padding:22px 24px;border-radius:16px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);animation:pop .3s both;cursor:pointer;transition:.18s'), borderLeft: '3px solid ' + s.accent }}>
              <div onClick={s.del} title="Delete setup" className="hv-del" style={css('position:absolute;top:14px;right:14px;width:26px;height:26px;border-radius:7px;border:1px solid rgba(49,35,73,.08);display:flex;align-items:center;justify-content:center;color:#928B9B;transition:.14s;z-index:2')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-right:34px')}><div style={{ ...css('width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-family:\'Instrument Serif\',serif;font-size:18px;flex:none'), background: s.iconBg, color: s.accent }}>{s.glyph}</div><div style={css('min-width:0;flex:1')}><div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}><div style={css('font-family:\'Instrument Serif\',serif;font-size:20px;color:#24202B')}>{s.name}</div>{s.gate && <span style={{ ...css('font-size:9.5px;font-weight:700;padding:3px 8px;border-radius:999px'), color: s.gate.color, background: s.gate.color + '14', border: '1px solid ' + s.gate.color + '44' }}>{s.gate.stageLabel}</span>}</div><div style={css('font-size:12px;color:#746E7D;margin-top:2px')}>{s.desc}</div></div></div>
              <div style={css('display:flex;gap:24px;margin-bottom:16px')}>
                <div><div style={css('font-size:10px;color:#928B9B;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px')}>Win rate</div><div style={css('font-family:\'JetBrains Mono\';font-size:16px;color:#24202B')}>{s.wrStr}</div></div>
                <div><div style={css('font-size:10px;color:#928B9B;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px')}>Trades</div><div style={css('font-family:\'JetBrains Mono\';font-size:16px;color:#24202B')}>{s.tradesStr}</div></div>
                <div><div style={css('font-size:10px;color:#928B9B;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px')}>Avg R</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:16px'), color: s.rColor }}>{s.avgRStr}</div></div>
                <div><div style={css('font-size:10px;color:#928B9B;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px')}>Net P&amp;L</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:16px'), color: s.pnlColor }}>{s.pnlStr}</div></div>
              </div>
              <div style={css('height:7px;border-radius:99px;background:rgba(49,35,73,.06);overflow:hidden;margin-bottom:12px')}><div className="bar-grow-x" style={{ ...css('height:100%;border-radius:99px'), background: s.accent, width: s.wrW }}></div></div>
              {s.gate && <div style={{ ...css('font-size:10.5px;margin-bottom:10px;display:flex;justify-content:space-between;gap:10px'), color: s.gate.color }}><span>{s.gate.stageNote}</span><span style={css('font-family:JetBrains Mono;white-space:nowrap;color:#928B9B')}>BT {s.gate.btN} · FW {s.gate.fwN}</span></div>}
              <div style={css('font-size:11.5px;color:#6747D8;display:flex;align-items:center;gap:5px')}>View details &amp; example chart <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  _renderCheckRow(c, i) {
    const canDrag = c.draggable && !c.editing;
    return (
      <div key={c.id || i} className="hv-chk rtm-cascade"
        draggable={canDrag}
        onDragStart={canDrag ? c.onDragStart : undefined}
        onDragEnter={canDrag ? c.onDragEnter : undefined}
        onDragOver={canDrag ? (e) => e.preventDefault() : undefined}
        onDragEnd={canDrag ? c.onDragEnd : undefined}
        style={{ ...css('display:flex;align-items:center;gap:12px;padding:15px 20px;transition:.14s'), borderTop: c.border, opacity: c.dragging ? 0.4 : 1, animationDelay: (i * 0.045) + 's' }}>
        {c.draggable && !c.editing && (
          <div title="Drag to reorder" style={css('flex:none;display:flex;flex-direction:column;gap:2.5px;cursor:grab;color:#4A4A52;padding:2px')}>
            <span style={css('display:flex;gap:2.5px')}><span style={css('width:2.5px;height:2.5px;border-radius:50%;background:currentColor')}></span><span style={css('width:2.5px;height:2.5px;border-radius:50%;background:currentColor')}></span></span>
            <span style={css('display:flex;gap:2.5px')}><span style={css('width:2.5px;height:2.5px;border-radius:50%;background:currentColor')}></span><span style={css('width:2.5px;height:2.5px;border-radius:50%;background:currentColor')}></span></span>
            <span style={css('display:flex;gap:2.5px')}><span style={css('width:2.5px;height:2.5px;border-radius:50%;background:currentColor')}></span><span style={css('width:2.5px;height:2.5px;border-radius:50%;background:currentColor')}></span></span>
          </div>
        )}
        <div onClick={c.toggle} style={{ ...css('width:22px;height:22px;border-radius:7px;flex:none;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.16s'), border: c.boxBorder, background: c.boxBg }}><svg key={'tick' + c.checkOp} className={c.checkOp ? 'rtm-tick' : undefined} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FFFFFF" strokeWidth="3" style={{ opacity: c.checkOp }}><path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
        {c.editing ? (
          <input defaultValue={c.text} onBlur={c.commit} onKeyDown={c.key} autoFocus style={css('flex:1;font-size:14px;color:#24202B;background:rgba(0,0,0,.25);border:1px solid rgba(118,88,232,.4);border-radius:7px;padding:5px 10px;outline:none')} />
        ) : (
          <Fragment>
            <span onClick={c.toggle} style={{ ...css('flex:1;font-size:14px;cursor:pointer'), color: c.textColor, textDecoration: c.strike }}>{c.text}</span>
            <div onClick={c.edit} className="hv-edittext" style={css('flex:none;color:#928B9B;cursor:pointer;transition:.14s')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
            <div onClick={c.del} className="hv-deltext" style={css('flex:none;color:#928B9B;cursor:pointer;transition:.14s')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
          </Fragment>
        )}
      </div>
    );
  }

  _renderReadiness(stroke, offset, pct, msg, frac) {
    return (
      <div className="rtm-float" style={css('position:sticky;top:0;padding:22px 24px;border-radius:16px;background:linear-gradient(180deg,rgba(118,88,232,.1),rgba(49,35,73,.015));border:1px solid rgba(118,88,232,.22);text-align:center')}>
        <div style={css('font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#6747D8;margin-bottom:14px')}>Readiness</div>
        <div style={css('position:relative;width:130px;height:130px;margin:0 auto')}><svg viewBox="0 0 120 120" style={css('width:130px;height:130px;transform:rotate(-90deg)')}><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(49,35,73,.07)" strokeWidth="9"/><circle cx="60" cy="60" r="52" fill="none" stroke={stroke} strokeWidth="9" strokeLinecap="round" strokeDasharray="327" strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset .5s' }}/></svg><div style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column')}><span style={{ ...css('font-family:\'JetBrains Mono\';font-size:30px;font-weight:600'), color: stroke }}>{pct}</span></div></div>
        {msg ? <div style={css('font-size:13px;color:#746E7D;margin-top:16px;line-height:1.5')}>{msg}</div> : null}
        <div style={{ ...css('font-size:11.5px;color:#928B9B;font-family:JetBrains Mono'), marginTop: msg ? 10 : 16 }}>{frac}</div>
      </div>
    );
  }

  // การ์ดสรุปวินัย — % ทำตามวินัยรวมทุกรอบ + สปาร์กไลน์ + ข้อที่พลาดบ่อย (คอมแพกต์ ไม่ยาว)
  _renderDiscipline(V) {
    const d = V.disc;
    return (
      <div className="rtm-float" style={css('padding:18px 20px;border-radius:16px;background:linear-gradient(180deg,rgba(139,108,240,.08),rgba(49,35,73,.015));border:1px solid rgba(49,35,73,.09)')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:12px')}>
          <span style={css('font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#6747D8')}>Discipline</span>
          <span style={{ ...css('font-size:10px;font-weight:600;padding:3px 8px;border-radius:20px'), color: d.color, background: 'rgba(49,35,73,.05)' }}>{d.grade}</span>
        </div>
        {d.hasData ? (
          <Fragment>
            <div style={css('display:flex;align-items:baseline;gap:8px')}>
              <span style={{ ...css('font-family:\'JetBrains Mono\';font-size:38px;font-weight:600;line-height:1'), color: d.color }}>{d.pct}</span>
              <span style={css('font-size:11.5px;color:#746E7D')}>on-target</span>
            </div>
            <div style={css('height:6px;border-radius:4px;background:rgba(49,35,73,.07);margin:12px 0 6px;overflow:hidden')}><div style={{ ...css('height:100%;border-radius:4px;transition:width .5s'), width: d.pctNum + '%', background: d.color }}></div></div>
            <div style={css('font-size:11px;color:#928B9B;margin-bottom:14px')}>{d.caption}</div>
            {d.spark.length > 1 && (
              <div style={css('display:flex;align-items:flex-end;gap:3px;height:34px;margin-bottom:14px')}>
                {d.spark.map((s, i) => (
                  <div key={i} title={s.title} style={{ ...css('flex:1;border-radius:2px 2px 0 0;min-width:3px'), height: s.h + '%', background: s.bg }}></div>
                ))}
              </div>
            )}
            <div style={css('font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#746E7D;margin-bottom:9px')}>{d.allClear ? 'Nothing missed ✓' : 'Most missed'}</div>
            {d.allClear ? (
              <div style={css('font-size:12px;color:#5FD0C8;line-height:1.5')}>Completed every item every round — keep it up</div>
            ) : d.missed.map((m, i) => (
              <div key={i} style={css('margin-bottom:10px')}>
                <div style={css('display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px')}>
                  <span style={css('font-size:12px;color:#D6D2C6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{m.text}</span>
                  <span style={css('font-size:10.5px;color:#746E7D;flex:none;font-family:JetBrains Mono')}>{m.pct}</span>
                </div>
                <div style={css('height:4px;border-radius:3px;background:rgba(49,35,73,.06);overflow:hidden')}><div style={{ ...css('height:100%;border-radius:3px'), width: m.w + '%', background: m.barBg }}></div></div>
                <div style={css('font-size:10px;color:#928B9B;margin-top:3px')}>{m.sub}</div>
              </div>
            ))}
          </Fragment>
        ) : (
          <div style={css('font-size:12.5px;color:#928B9B;line-height:1.6;padding:8px 0')}>{d.caption}<br/>Start checking items each round and stats build automatically</div>
        )}
      </div>
    );
  }

  // วงแหวนเล็กสำหรับสถิติรายนิสัย
  _hbRing(pct, color, size) {
    const s = size || 52; const sw = 6; const r = (s - sw - 1) / 2; const c = 2 * Math.PI * r; const off = c * (1 - Math.min(100, pct) / 100);
    return (
      <svg width={s} height={s} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke="rgba(49,35,73,.1)" strokeWidth={sw} />
        <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.7,.3,1)', filter: 'drop-shadow(0 0 3px ' + color + '66)' }} />
      </svg>
    );
  }
  // ช่องกริดหนึ่งช่อง (วันหนึ่งของนิสัยหนึ่ง)
  renderPlaybook(V) {
    return (
      <div style={css('padding:24px 28px 40px;animation:viewIn .45s cubic-bezier(.2,.7,.3,1) both')}>
        <div style={css('margin-bottom:20px;animation:rise .5s both')}><div className="rtm-head" style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6747D8;margin-bottom:6px')}>Playbook · Mindset</div><div style={css('font-family:\'Instrument Serif\',serif;font-size:28px;color:#24202B')}>Mindset &amp; readiness before trading <span style={css('font-style:italic;color:#7658E8')}>— the rules I live by</span></div></div>

        <div style={css('position:relative;overflow:hidden;padding:26px 30px;border-radius:18px;background:linear-gradient(120deg,rgba(118,88,232,.16),rgba(139,108,240,.08));border:1px solid rgba(118,88,232,.26);margin-bottom:16px;animation:rise .5s .05s both')}>
          <div style={css('position:absolute;top:-30%;right:-5%;width:38%;height:90%;background:radial-gradient(circle,rgba(118,88,232,.16),transparent 70%);pointer-events:none')}></div>
          <div style={css('font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#6747D8;margin-bottom:14px')}>Trader affirmation</div>
          <div style={css('display:flex;align-items:flex-start;gap:14px;margin-bottom:18px')}>
            {V.editAffirm ? (
              <input defaultValue={V.affirmation} onBlur={V.commitAffirm} onKeyDown={V.onAffirmKey} autoFocus style={css('flex:1;font-family:\'Instrument Serif\',serif;font-style:italic;font-size:22px;color:#F3E9D2;background:rgba(0,0,0,.25);border:1px solid rgba(118,88,232,.4);border-radius:8px;padding:6px 12px;outline:none')} />
            ) : (
              <Fragment>
                <div onClick={V.startAffirm} title="Click to edit" style={css('flex:1;font-family:\'Instrument Serif\',serif;font-style:italic;font-size:22px;line-height:1.4;color:#F3E9D2;cursor:text')}>{V.affirmation}</div>
                <div onClick={V.startAffirm} className="hv-op" style={css('flex:none;color:#6747D8;cursor:pointer;opacity:.7')}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              </Fragment>
            )}
          </div>
          <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
            {V.affirmDetails.map((a, i) => (
              <div key={i} style={css('display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:11px;background:rgba(0,0,0,.22);border:1px solid rgba(49,35,73,.06)')}>
                <span style={css('color:#6747D8;flex:none')}>▸</span>
                {a.editing ? (
                  <input defaultValue={a.text} onBlur={a.commit} onKeyDown={a.key} autoFocus style={css('flex:1;font-size:13.5px;color:#24202B;background:rgba(0,0,0,.3);border:1px solid rgba(118,88,232,.4);border-radius:7px;padding:4px 9px;outline:none')} />
                ) : (
                  <Fragment>
                    <span onClick={a.edit} style={css('flex:1;font-size:13.5px;color:#D6D2C6;cursor:text;line-height:1.4')}>{a.text}</span>
                    <div onClick={a.del} className="hv-deltext" style={css('flex:none;color:#928B9B;cursor:pointer')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
                  </Fragment>
                )}
              </div>
            ))}
            <div onClick={V.addAffirmDetail} className="hv-goldbg" style={css('display:flex;align-items:center;justify-content:center;gap:7px;padding:11px 14px;border-radius:11px;background:rgba(0,0,0,.12);border:1px dashed rgba(118,88,232,.3);color:#6747D8;font-size:13px;cursor:pointer;transition:.14s')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>Add a line</div>
          </div>
        </div>

        <div style={css('display:grid;grid-template-columns:1fr 300px;gap:16px;align-items:start;animation:rise .5s .1s both')}>
          <div className="liquid-glass" style={css('border-radius:16px;border:1px solid rgba(49,35,73,.07);background:rgba(49,35,73,.02);overflow:hidden')}>
            <div style={css('padding:15px 20px;border-bottom:1px solid rgba(49,35,73,.06);display:flex;justify-content:space-between;align-items:center')}><div style={css('font-family:\'Instrument Serif\',serif;font-size:17px;color:#24202B')}>Pre-trade checklist <span style={css('font-size:12px;color:#928B9B;font-family:\'Plus Jakarta Sans\'')}>Daily</span></div><span style={css('font-size:11px;color:#928B9B')}>Resets daily</span></div>
            {V.preItems.map((c, i) => this._renderCheckRow(c, i))}
            <div style={css('display:flex;align-items:center;gap:12px;padding:14px 20px;border-top:1px solid rgba(49,35,73,.05)')}>
              <div style={css('width:22px;height:22px;border-radius:7px;flex:none;border:1.5px dashed rgba(118,88,232,.4);display:flex;align-items:center;justify-content:center;color:#6747D8')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg></div>
              <input placeholder="Add a pre-trade item, then Enter" onKeyDown={V.addPreKey} style={css('flex:1;font-size:14px;color:#24202B;background:transparent;border:none;outline:none')} />
            </div>
          </div>
          {this._renderReadiness(V.preStroke, V.preOffset, V.prePct, V.preMsg, V.preFrac)}
        </div>
      </div>
    );
  }

  renderVisionBoard(V) {
    return (
      <div style={css('padding:24px 28px 40px;animation:viewIn .45s cubic-bezier(.2,.7,.3,1) both')}>
        <div style={css('display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px;animation:rise .5s both')}>
          <div><div className="rtm-head" style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6747D8;margin-bottom:6px')}>Vision board</div><div style={css('font-family:\'Instrument Serif\',serif;font-size:28px;color:#24202B')}>Road to a million <span style={css('font-style:italic;color:#7658E8')}>— your why</span></div></div>
          <span onClick={V.addVision} className="hv-setbtn rtm-press" style={css('font-size:12px;font-weight:600;padding:9px 16px;border-radius:9px;cursor:pointer;color:#FFFFFF;background:linear-gradient(180deg,#7658E8,#6747D8);display:flex;align-items:center;gap:5px;transition:.14s')}>+ Add a dream</span>
        </div>

        <div style={css('position:relative;overflow:hidden;padding:30px 34px;border-radius:18px;background:linear-gradient(120deg,rgba(118,88,232,.16),rgba(139,108,240,.08));border:1px solid rgba(118,88,232,.26);margin-bottom:16px;animation:rise .5s .05s both')}>
          <div style={css('position:absolute;top:-30%;right:-5%;width:40%;height:90%;background:radial-gradient(circle,rgba(118,88,232,.18),transparent 70%);pointer-events:none')}></div>
          <div style={css('display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:18px')}>
            <div><div style={css('font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6747D8;margin-bottom:8px')}>Milestone progress <span title="เป้าหมายนับรวมทุกพอร์ตเสมอ ไม่เปลี่ยนตามพอร์ตที่เลือก" style={css('text-transform:none;letter-spacing:0;color:#928B9B')}>· {V.milestoneScope}</span></div><div className="rtm-goldshine" style={css('font-family:\'Instrument Serif\',serif;font-size:40px;font-weight:600;line-height:1;background:linear-gradient(180deg,#FBF3DF,#6747D8);-webkit-background-clip:text;background-clip:text;color:transparent')}>{V.milestoneEquity} {V.editGoal ? (
              <input defaultValue={V.goalNum} onBlur={V.commitGoal} onKeyDown={V.onGoalKey} autoFocus style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, width: 160, color: '#24202B', WebkitTextFillColor: '#24202B', background: 'rgba(0,0,0,.3)', border: '1px solid rgba(118,88,232,.4)', borderRadius: 8, padding: '2px 8px', outline: 'none' }} />
            ) : (
              <span onClick={V.startGoal} title="Click to edit goal" style={css('font-size:20px;color:#746E7D;-webkit-text-fill-color:#746E7D;cursor:pointer')}>/ {V.goalStr} ✎</span>
            )}</div></div>
            <div style={css('font-family:\'JetBrains Mono\';font-size:30px;font-weight:600;color:#7658E8')}>{V.milestonePct}</div>
          </div>
          <div style={css('height:14px;border-radius:99px;background:rgba(0,0,0,.35);overflow:hidden;position:relative')}><div style={{ ...css('height:100%;border-radius:99px;background:linear-gradient(90deg,#6747D8,#7658E8);position:relative;overflow:hidden;transition:width .8s ease'), width: V.milestoneWidth }}><div style={css('position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(49,35,73,.4),transparent);animation:sweep 3s ease-in-out infinite')}></div></div></div>
          <div style={css('display:flex;justify-content:space-between;margin-top:10px;font-size:11px;font-family:JetBrains Mono;color:#928B9B')}>{V.milestoneMarks.map((m, i) => (<span key={i}>{m}</span>))}</div>
        </div>

        <div style={css('font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#928B9B;margin:22px 0 12px')}>Your dreams · drop images into the frames</div>
        <div style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:16px;animation:rise .5s .12s both')}>
          {V.visionItems.map((v) => (
            <div key={v.id} className="hv-card liquid-glass" style={css('position:relative;border-radius:16px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);overflow:hidden;transition:.18s')}>
              <div onClick={v.del} title="Delete" className="hv-visdel" style={css('position:absolute;top:10px;right:10px;z-index:3;width:28px;height:28px;border-radius:8px;background:rgba(8,8,11,.7);backdrop-filter:blur(4px);border:1px solid rgba(49,35,73,.12);display:flex;align-items:center;justify-content:center;color:#24202B;cursor:pointer;transition:.14s')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
              <ImageSlot slotId={'vision-' + v.id} value={this.state.images['vision-' + v.id]} onChange={(p) => this.setImage('vision-' + v.id, p)} placeholder="Drop a dream image" style={{ width: '100%', height: '190px' }} />
              <div style={css('padding:14px 16px')}>
                {v.editing ? (
                  <input defaultValue={v.title} onBlur={v.commit} onKeyDown={v.key} autoFocus style={css('width:100%;font-family:\'Instrument Serif\',serif;font-size:16px;color:#24202B;background:rgba(0,0,0,.25);border:1px solid rgba(118,88,232,.4);border-radius:7px;padding:5px 10px;outline:none')} />
                ) : (
                  <div onClick={v.edit} style={css('display:flex;align-items:center;gap:8px;cursor:text')}><span style={css('font-family:\'Instrument Serif\',serif;font-size:16px;color:#24202B')}>{v.title}</span><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#928B9B" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ===================== MODALS =====================
  renderDayModal(V) {
    return (
      <div onClick={V.closeDay} style={css('position:fixed;inset:0;z-index:28;background:rgba(4,4,7,.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;animation:fade .25s both')}>
        <div onClick={V.stop} className="rtm-scroll liquid-glass" style={css('width:520px;max-width:92vw;max-height:86vh;overflow-y:auto;border-radius:20px;background:rgba(19,19,22,.88);border:1px solid rgba(118,88,232,.2);box-shadow:0 50px 120px -30px rgba(0,0,0,.95);animation:modalIn .32s cubic-bezier(.25,.9,.3,1) both')}>
          <div style={css('display:flex;justify-content:space-between;align-items:center;padding:22px 26px;border-bottom:1px solid rgba(49,35,73,.07)')}><div><div style={css('font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#6747D8;margin-bottom:4px')}>Orders</div><div style={css('font-family:\'Instrument Serif\',serif;font-size:22px;color:#24202B')}>{V.dayTitle}</div></div><div onClick={V.closeDay} className="hv-close" style={css('width:34px;height:34px;border-radius:9px;border:1px solid rgba(49,35,73,.1);display:flex;align-items:center;justify-content:center;color:#746E7D;cursor:pointer')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div></div>
          <div style={css('padding:18px 22px;display:flex;flex-direction:column;gap:10px')}>
            <div style={css('display:flex;justify-content:space-between;padding:4px 4px 10px;font-size:12px;color:#746E7D')}><span>{V.dayCount} trades</span><span style={{ ...css('font-family:JetBrains Mono'), color: V.dayPnlColor }}>{V.dayPnlStr}</span></div>
            {V.dayTrades.map((t) => (
              <div key={t.id} onClick={t.open} className="hv-slide" style={{ ...css('display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-radius:13px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07);cursor:pointer;transition:.14s'), borderLeft: '3px solid ' + t.accent }}>
                <div><div style={css('font-size:15px;color:#24202B;font-weight:600;margin-bottom:4px')}>{t.sym} <span style={{ ...css('font-size:11px;font-weight:600'), color: t.sideColor }}>{t.side}</span></div><div style={css('font-size:11.5px;color:#746E7D')}>{t.setupName} · {t.session} · {t.lotStr} lot · {t.holding}</div>{t.tags.length > 0 && <div style={css('display:flex;flex-wrap:wrap;gap:5px;margin-top:6px')}>{t.tags.map((tg, i) => (<span key={i} style={css('font-size:10px;color:#6747D8;background:rgba(118,88,232,.12);border:1px solid rgba(118,88,232,.25);border-radius:6px;padding:2px 7px')}>{tg}</span>))}</div>}</div>
                <div style={css('text-align:right')}><div style={{ ...css('font-family:JetBrains Mono;font-size:15px;font-weight:600'), color: t.pnlColor }}>{t.pnlStr}</div><div style={{ ...css('font-size:11px;font-family:JetBrains Mono'), color: t.rColor }}>{t.rStr}</div></div>
              </div>
            ))}
            <div onClick={V.openNewForDay} className="hv-goldbg" style={css('display:flex;align-items:center;justify-content:center;gap:7px;padding:13px;border-radius:13px;border:1px dashed rgba(118,88,232,.35);color:#6747D8;font-size:13px;font-weight:600;cursor:pointer;transition:.14s;margin-top:4px')}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>Add a trade for this day</div>
          </div>
        </div>
      </div>
    );
  }

  renderTradeModal(V) {
    const fieldInput = (style) => ({ ...css(style), });
    return (
      <div onClick={V.closeTrade} style={css('position:fixed;inset:0;z-index:30;background:rgba(4,4,7,.74);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;animation:fade .25s both')}>
        <div onClick={V.stop} className="rtm-scroll liquid-glass" style={css('width:1040px;max-width:96vw;max-height:92vh;overflow-y:auto;border-radius:20px;background:rgba(19,19,22,.88);border:1px solid rgba(118,88,232,.2);box-shadow:0 50px 120px -30px rgba(0,0,0,.95);animation:modalIn .32s cubic-bezier(.25,.9,.3,1) both')}>
          <div style={css('display:flex;justify-content:space-between;align-items:center;padding:22px 26px;border-bottom:1px solid rgba(49,35,73,.07);position:sticky;top:0;background:rgba(18,18,24,.92);backdrop-filter:blur(8px);z-index:2')}><div><div style={css('font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#6747D8;margin-bottom:4px')}>{V.tradeModalTag}</div><div style={css('font-family:\'Instrument Serif\',serif;font-size:22px;color:#24202B')}>{V.tradeModalTitle}</div></div><div onClick={V.closeTrade} className="hv-close" style={css('width:34px;height:34px;border-radius:9px;border:1px solid rgba(49,35,73,.1);display:flex;align-items:center;justify-content:center;color:#746E7D;cursor:pointer')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div></div>
          <div style={css('padding:26px 34px 30px;display:flex;flex-direction:column;gap:17px')}>
            <div className="liquid-glass" style={css('display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:6px;border-radius:14px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.08)')}>
              <div onClick={V.setBacktestMode} className="rtm-press" style={{ ...css('padding:12px 14px;border-radius:10px;cursor:pointer;transition:.16s'), background: V.dTestMode === 'backtest' ? 'linear-gradient(120deg,rgba(77,127,232,.2),rgba(77,127,232,.08))' : 'transparent', border: '1px solid ' + (V.dTestMode === 'backtest' ? 'rgba(77,127,232,.46)' : 'transparent') }}>
                <div style={{ ...css('font-size:13px;font-weight:700;margin-bottom:3px'), color: V.dTestMode === 'backtest' ? '#5E86D6' : '#746E7D' }}>Backtest sample</div>
                <div style={css('font-size:10.5px;color:#9A93A1;line-height:1.45')}>ข้อมูลจำลองเพื่อค้นหา setup · ไม่รวมในยอดเงินจริง</div>
              </div>
              <div onClick={V.setForwardMode} className="rtm-press" style={{ ...css('padding:12px 14px;border-radius:10px;cursor:pointer;transition:.16s'), background: V.dTestMode === 'forward' ? 'linear-gradient(120deg,rgba(28,155,104,.18),rgba(118,88,232,.06))' : 'transparent', border: '1px solid ' + (V.dTestMode === 'forward' ? 'rgba(28,155,104,.42)' : 'transparent') }}>
                <div style={{ ...css('font-size:13px;font-weight:700;margin-bottom:3px'), color: V.dTestMode === 'forward' ? '#1C9B68' : '#746E7D' }}>Forward test</div>
                <div style={css('font-size:10.5px;color:#9A93A1;line-height:1.45')}>ผล out-of-sample · นับในพอร์ตและเป้าหมายจริง</div>
              </div>
            </div>
            <div style={{ ...css('display:grid;gap:14px'), gridTemplateColumns: V.dTestMode === 'backtest' ? '1fr 1fr' : '1fr 1fr 1fr' }}>
              {V.dTestMode === 'forward' && <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px;letter-spacing:.04em')}>Portfolio</div><Sel value={V.dPortfolio} onChange={V.setPortfolio} className="hv-focus rtm-select" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:11px 14px;color:#24202B;font-size:14px;outline:none;cursor:pointer')}>{V.portfolioOptions.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}</Sel></div>}
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px;letter-spacing:.04em')}>Symbol</div><input value={V.dSym} onChange={V.setSym} placeholder="XAUUSD" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:11px 14px;color:#24202B;font-size:14px;outline:none')} /></div>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px;letter-spacing:.04em')}>Setup</div><Sel value={V.dSetup} onChange={V.setSetup} className="hv-focus rtm-select" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:11px 14px;color:#24202B;font-size:14px;outline:none;cursor:pointer')}>{V.setupOptions.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}</Sel></div>
            </div>
            {V.dTestMode === 'forward' && V.dSetupGate && !V.dSetupGate.btPass && <div style={css('display:flex;align-items:center;gap:9px;padding:10px 13px;border-radius:10px;background:rgba(224,161,90,.09);border:1px solid rgba(224,161,90,.3);font-size:11.5px;color:#E8B875')}><span style={css('font-size:15px')}>!</span><span>Setup นี้ยังไม่ผ่าน Backtest Gate — บันทึกได้ แต่ระบบจะยังไม่ถือว่าเป็น Forward validation ที่พร้อมเพิ่มขนาด</span></div>}
            <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px;letter-spacing:.04em')}>Direction</div><div style={css('display:flex;gap:10px')}><div onClick={V.setBuy} className="rtm-press" style={css(V.buyStyle)}>BUY / Long</div><div onClick={V.setSell} className="rtm-press" style={css(V.sellStyle)}>SELL / Short</div></div></div>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px;letter-spacing:.04em')}>Session</div><Sel value={V.dSession} onChange={V.setSession} className="hv-focus rtm-select" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:11px 14px;color:#24202B;font-size:14px;outline:none;cursor:pointer')}><option value="Tokyo">Tokyo</option><option value="London">London</option><option value="New York">New York</option></Sel></div>
            </div>
            <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>Entry — opened <span style={css('color:#928B9B')}>· เวลา server 24 ชม.</span></div><div style={css('display:grid;grid-template-columns:1fr 104px;gap:8px')}><DateField value={V.dEntryDate} onChange={V.setEntryDate} className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:10px 14px;color:#24202B;font-size:13px;outline:none;font-family:JetBrains Mono;color-scheme:dark')} /><input value={V.dEntryHM} onChange={V.setEntryHM} onBlur={V.blurEntryHM} inputMode="numeric" maxLength={5} placeholder="00:00" title="เวลา 24 ชม. (00:00–23:59)" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:10px 12px;color:#24202B;font-size:13px;outline:none;font-family:JetBrains Mono;text-align:center;letter-spacing:.06em')} /></div></div>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>Exit — closed <span style={css('color:#928B9B')}>· เวลา server 24 ชม.</span></div><div style={css('display:grid;grid-template-columns:1fr 104px;gap:8px')}><DateField value={V.dExitDate} onChange={V.setExitDate} className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:10px 14px;color:#24202B;font-size:13px;outline:none;font-family:JetBrains Mono;color-scheme:dark')} /><input value={V.dExitHM} onChange={V.setExitHM} onBlur={V.blurExitHM} inputMode="numeric" maxLength={5} placeholder="00:00" title="เวลา 24 ชม. (00:00–23:59)" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:10px 12px;color:#24202B;font-size:13px;outline:none;font-family:JetBrains Mono;text-align:center;letter-spacing:.06em')} /></div></div>
            </div>
            <div style={css('display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:12px;background:linear-gradient(100deg,rgba(118,88,232,.12),rgba(49,35,73,.02));border:1px solid rgba(118,88,232,.2)')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#7658E8" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <div style={css('font-size:12px;color:#746E7D')}>Holding time</div>
              <div style={css('margin-left:auto;font-family:\'JetBrains Mono\';font-size:16px;font-weight:600;color:#7658E8')}>{V.holdingDur}</div>
            </div>
            <div onClick={V.toggleTradeAdvanced} className="rtm-advanced-toggle rtm-press" style={css('display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 15px;border-radius:12px;background:rgba(139,108,240,.055);border:1px solid rgba(139,108,240,.2);cursor:pointer;transition:.18s')}>
              <div><div style={css('font-size:12px;font-weight:700;color:#C9BEFF;margin-bottom:3px')}>Advanced analysis</div><div style={css('font-size:10.5px;color:#77717F')}>Timeframes · scaled entries · emotions · MFE</div></div>
              <div style={css('display:flex;align-items:center;gap:10px')}><span style={css('font-family:JetBrains Mono;font-size:9.5px;color:#8E8897')}>{V.tradeAdvancedFilled ? V.tradeAdvancedFilled + ' saved' : 'optional'}</span><span style={{ ...css('font-size:17px;color:#8B6CF0;transition:transform .2s'), transform: V.tradeAdvancedOpen ? 'rotate(45deg)' : 'none' }}>+</span></div>
            </div>
            {V.tradeAdvancedOpen && (<>
            <div style={css('height:1px;background:rgba(49,35,73,.07);margin:2px 0')}></div>
            <div style={css('display:flex;align-items:center;justify-content:space-between')}>
              <div style={css('font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6747D8;display:flex;align-items:center;gap:8px')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#6747D8" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round"/></svg>Trade analysis</div>
              <div style={css('display:flex;align-items:center;gap:12px')}><span onClick={V.openFieldCfg} className="hv-op" style={css('font-size:11px;color:#746E7D;cursor:pointer;display:flex;align-items:center;gap:4px')}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>edit choices</span><span style={css('font-size:11.5px;color:#1C9B68;font-family:JetBrains Mono')}>Entered: {V.dDayLabel}</span></div>
            </div>
            <div className="rtm-research-context" style={css('display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:15px;border-radius:14px;background:rgba(139,108,240,.055);border:1px solid rgba(139,108,240,.18)')}>
              <div><div style={css('font-size:11px;color:#746E7D;margin-bottom:7px')}>Market regime</div><Sel value={V.dMarketRegime} onChange={V.setMarketRegime} className="hv-focus" style={{ ...css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:9px;padding:10px 12px;font-size:12.5px;outline:none'), color: V.dMarketRegime ? '#24202B' : '#9A93A1' }}><option value="">เลือกบริบทตลาด…</option>{V.optsMarketRegime.map(o => (<option key={o} value={o}>{o}</option>))}</Sel></div>
              <div><div style={css('font-size:11px;color:#746E7D;margin-bottom:7px')}>Exit reason</div><Sel value={V.dExitReason} onChange={V.setExitReason} className="hv-focus" style={{ ...css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:9px;padding:10px 12px;font-size:12.5px;outline:none'), color: V.dExitReason ? '#24202B' : '#9A93A1' }}><option value="">เลือกเหตุผลที่ออก…</option>{V.optsExitReason.map(o => (<option key={o} value={o}>{o}</option>))}</Sel></div>
              <div><div style={css('font-size:11px;color:#746E7D;margin-bottom:7px')}>Rule adherence</div><Sel value={V.dRuleAdherence} onChange={V.setRuleAdherence} className="hv-focus" style={{ ...css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:9px;padding:10px 12px;font-size:12.5px;outline:none'), color: V.dRuleAdherence ? '#24202B' : '#9A93A1' }}><option value="">ทำตามแผนหรือไม่…</option>{V.optsRuleAdherence.map(o => (<option key={o} value={o}>{o}</option>))}</Sel></div>
              <div style={css('grid-column:1/-1;font-size:10.5px;color:#77717F;line-height:1.55')}>สามช่องนี้ช่วยแยก “ระบบไม่มี edge” ออกจาก “ระบบมี edge แต่ execution หลุด” — ข้อมูลทุกไม้ยังถูกเก็บไว้ ไม่ตัดไม้ผิดแผนทิ้งเพื่อป้องกัน hindsight bias</div>
            </div>
            {/* ① ปัจจัย 3 Timeframe — per-TF card: name + condition + factors + image + aligned */}
            {/* "รอบเทรด · Round context" (SOT + HH/LL ครั้งที่) ถูกตัดออก: ตอบยากเมื่อดูหลาย timeframe
               พร้อมกัน ค่าที่ได้จึงไม่น่าเชื่อถือพอจะเอาไปหา edge */}
            <div style={css('font-size:12px;color:#746E7D;margin:8px 0 2px;display:flex;justify-content:space-between;align-items:center')}><span><b style={css('color:#6747D8')}>①</b> ปัจจัย 3 Timeframe · เปิด Aligned เมื่อ TF ไปทางเดียวกับ bias</span><span style={css('font-family:JetBrains Mono;color:#7658E8')}>{V.dAlignN}/3 aligned</span></div>
            <div style={css('display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px')}>
              {V.tfCards.map((c) => (
                <div key={c.tf} className="liquid-glass" style={{ ...css('border-radius:13px;padding:12px'), background: c.aligned ? 'rgba(28,155,104,.06)' : 'rgba(49,35,73,.02)', border: '1px solid ' + (c.aligned ? 'rgba(28,155,104,.4)' : 'rgba(49,35,73,.1)') }}>
                  <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:9px')}>
                    <div><span style={css('font-family:JetBrains Mono;font-size:13px;font-weight:700;color:#7658E8')}>{c.role}</span><span style={css('font-size:10px;color:#928B9B;margin-left:6px')}>{c.sub}</span></div>
                    <span onClick={() => V.toggleAlign(c.alignKey)} className="rtm-press" title="Aligned กับ bias?" style={css('display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;padding:4px 9px;border-radius:999px;cursor:pointer;transition:.14s;' + (c.aligned ? 'background:rgba(28,155,104,.16);border:1px solid rgba(28,155,104,.5);color:#1C9B68' : 'background:rgba(49,35,73,.03);border:1px solid rgba(49,35,73,.14);color:#746E7D'))}><span style={css('width:5px;height:5px;border-radius:50%;background:currentColor')}></span>Aligned</span>
                  </div>
                  <input value={c.timeframe} onChange={c.setTimeframe} placeholder={c.tf === 'htf' ? 'Day' : (c.tf === 'mtf' ? 'H4' : 'H1')} title="Timeframe" className="hv-focus" style={css('width:100%;background:rgba(0,0,0,.22);border:1px solid rgba(49,35,73,.09);border-radius:8px;padding:8px 10px;color:#24202B;font-size:12.5px;outline:none;font-family:JetBrains Mono;margin-bottom:7px;box-sizing:border-box')} />
                  <Sel value={c.cond} onChange={c.setCond} className="hv-focus rtm-select" style={{ ...css('width:100%;background:rgba(0,0,0,.22);border:1px solid rgba(49,35,73,.09);border-radius:8px;padding:8px 10px;font-size:12px;outline:none;cursor:pointer;margin-bottom:7px;box-sizing:border-box'), color: c.cond ? '#24202B' : '#9A93A1' }}><option value="">เลือก condition…</option>{c.condOpts.map(o => (<option key={o} value={o}>{o}</option>))}</Sel>
                  <textarea value={c.factors} onChange={c.setFactors} placeholder="Factors: Saucer, คืน Zone ครึ่ง, S/R…" className="hv-focus" style={css('width:100%;min-height:50px;resize:vertical;background:rgba(0,0,0,.22);border:1px solid rgba(49,35,73,.09);border-radius:8px;padding:8px 10px;color:#24202B;font-size:12px;outline:none;line-height:1.45;margin-bottom:8px;font-family:inherit;box-sizing:border-box')} />
                  <ImageSlot slotId={c.slotId} value={this.state.images[c.slotId]} onChange={(p) => this.setImage(c.slotId, p)} rounded placeholder={'+ ภาพ ' + c.role} style={{ width: '100%', height: 96 }} />
                </div>
              ))}
            </div>
            {/* ② ไม้ที่เบิ้ล · Entry legs (multi-leg scaling-in) */}
            <div style={css('display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:4px')}>
              <div style={css('font-size:11px;color:#746E7D')}><b style={css('color:#6747D8')}>②</b> ไม้ที่เบิ้ล · Entry legs</div>
              <span onClick={V.addLeg} className="rtm-press hv-addbtn" style={css('display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:7px 14px;border-radius:999px;cursor:pointer;background:linear-gradient(180deg,#7658E8,#6747D8);color:#FFFFFF')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>เพิ่มไม้ (เบิ้ล)</span>
            </div>
            {V.dLegs.anyUnder && (
              <div style={css('display:flex;align-items:center;gap:9px;padding:9px 13px;border-radius:10px;background:rgba(226,84,98,.1);border:1px solid rgba(226,84,98,.32);font-size:12px;color:#E79088')}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#E25462" strokeWidth="1.9"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                มีไม้ที่วาง SL <b>ใต้แท่ง</b> — เสี่ยง Swing เกี่ยว order ควรใช้ Dow / รวมแท่ง
              </div>
            )}
            {V.dLegs.count > 0 ? (
              <div className="liquid-glass" style={css('border-radius:12px;padding:10px 12px;background:rgba(49,35,73,.02)')}>
                <div className="rtm-xscroll" style={css('overflow-x:auto;padding-bottom:2px')}>
                <div style={css('min-width:990px')}>
                <div style={css('display:grid;grid-template-columns:18px 1.02fr .66fr .46fr .42fr .88fr .55fr .5fr .9fr .46fr 20px;gap:8px;padding:0 2px 8px;font-size:10px;letter-spacing:.03em;text-transform:uppercase;color:#928B9B')}>
                  <span title="ไม้ที่ (1=ไม้แรก, 2+=เบิ้ล)">#</span><span>จุดเข้า</span><span>ราคาเข้า</span><span>Lot</span><span style={css('text-align:right')}>สะสม</span><span>SL basis</span><span>Risk $</span><span>Retest</span><span>Fibo M15</span><span>DD</span><span></span>
                </div>
                {V.dLegs.rows.map((r) => (
                  <div key={r.i} style={css('display:grid;grid-template-columns:18px 1.02fr .66fr .46fr .42fr .88fr .55fr .5fr .9fr .46fr 20px;gap:8px;align-items:center;padding:4px 2px')}>
                    <span title={r.i === 0 ? 'ไม้แรก' : 'ไม้เบิ้ลที่ ' + (r.i + 1)} style={css('font-family:JetBrains Mono;font-size:12px;font-weight:600;color:#7563A6;text-align:center')}>{r.i + 1}</span>
                    <Sel value={r.trigger} onChange={(e) => V.setLegTrigger(r.i, e)} title="จุดเข้าของไม้นี้ (เช่น M15 Completed Stick) — แก้ตัวเลือกที่ edit choices" className="hv-focus rtm-select" style={{ ...css('width:100%;background:rgba(49,35,73,.05);border:1px solid rgba(49,35,73,.12);border-radius:8px;padding:9px 10px;font-size:12.5px;outline:none;cursor:pointer'), color: r.trigger ? '#24202B' : '#9A93A1' }}><option value="">เลือก…</option>{r.optsTrigger.map(o => (<option key={o} value={o}>{o}</option>))}</Sel>
                    <input value={r.price} onChange={(e) => V.setLegPrice(r.i, e)} placeholder="0.00" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.05);border:1px solid rgba(49,35,73,.12);border-radius:8px;padding:9px 10px;color:#24202B;font-size:13px;outline:none;font-family:JetBrains Mono')} />
                    <input value={r.lot} onChange={(e) => V.setLegLot(r.i, e)} placeholder="0" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.05);border:1px solid rgba(49,35,73,.12);border-radius:8px;padding:9px 10px;color:#24202B;font-size:13px;outline:none;font-family:JetBrains Mono')} />
                    <span style={{ ...css('font-family:JetBrains Mono;font-size:11.5px;text-align:right;padding-right:2px'), color: r.cum ? '#7658E8' : '#928B9B' }}>{r.cumStr}</span>
                    <Sel value={r.slBasis} onChange={(e) => V.setLegSL(r.i, e)} className="hv-focus rtm-select" style={{ ...css('width:100%;border-radius:8px;padding:9px 10px;font-size:12.5px;outline:none;cursor:pointer'), color: r.slBasis ? '#24202B' : '#9A93A1', background: r.danger ? 'rgba(226,84,98,.12)' : 'rgba(49,35,73,.05)', border: '1px solid ' + (r.danger ? 'rgba(226,84,98,.4)' : 'rgba(49,35,73,.12)') }}><option value="">เลือก…</option>{r.optsSL.map(o => (<option key={o} value={o}>{o}</option>))}</Sel>
                    <input value={r.risk} onChange={(e) => V.setLegRisk(r.i, e)} placeholder="0" title="Risk ($) ของไม้นี้ — รวมกันเป็น 1R ของรอบ" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.05);border:1px solid rgba(49,35,73,.12);border-radius:8px;padding:9px 10px;color:#24202B;font-size:13px;outline:none;font-family:JetBrains Mono')} />
                    <Sel value={r.retest} onChange={(e) => V.setLegRetest(r.i, e.target.value)} title="ไม้นี้ retest มั้ย" className="hv-focus rtm-select" style={{ ...css('width:100%;background:rgba(49,35,73,.05);border:1px solid rgba(49,35,73,.12);border-radius:8px;padding:9px 6px;font-size:12.5px;outline:none;cursor:pointer'), color: r.retest ? (r.retest === 'yes' ? '#1C9B68' : '#E25462') : '#9A93A1' }}><option value="">–</option><option value="yes">Yes</option><option value="no">No</option></Sel>
                    <Sel value={r.fibo} onChange={(e) => V.setLegFibo(r.i, e)} title="Retest fibo M15 ของไม้นี้" className="hv-focus rtm-select" style={{ ...css('width:100%;background:rgba(49,35,73,.05);border:1px solid rgba(49,35,73,.12);border-radius:8px;padding:9px 10px;font-size:12.5px;outline:none;cursor:pointer'), color: r.fibo ? '#24202B' : '#9A93A1' }}><option value="">เลือก…</option>{r.optsFibo.map(o => (<option key={o} value={o}>{o}</option>))}</Sel>
                    <input value={r.dd} onChange={(e) => V.setLegDD(r.i, e)} placeholder="0" title="Drawdown ของไม้นี้ (pip)" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.05);border:1px solid rgba(49,35,73,.12);border-radius:8px;padding:9px 10px;color:#24202B;font-size:13px;outline:none;font-family:JetBrains Mono')} />
                    <span onClick={() => V.removeLeg(r.i)} className="hv-op" title="ลบไม้" style={css('cursor:pointer;color:#928B9B;text-align:center;font-size:16px;line-height:1')}>×</span>
                  </div>
                ))}
                </div>
                </div>
                <div style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:11px;padding-top:11px;border-top:1px solid rgba(49,35,73,.08)')}>
                  <div><div style={css('font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#928B9B;margin-bottom:3px')}>Max lot</div><div style={css('font-family:JetBrains Mono;font-size:15px;font-weight:600;color:#7658E8')}>{V.dLegs.maxLot}</div></div>
                  <div><div style={css('font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#928B9B;margin-bottom:3px')}>Avg entry</div><div style={css('font-family:JetBrains Mono;font-size:15px;font-weight:600;color:#24202B')}>{V.dLegs.avgEntry}</div></div>
                  <div><div style={css('font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#928B9B;margin-bottom:3px')}>Total risk <span style={css('color:#6f6a5c')}>(1R)</span></div><div style={css('font-family:JetBrains Mono;font-size:15px;font-weight:600;color:#24202B')}>{V.dLegs.totalRiskStr}</div></div>
                  <div>
                    <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:4px')}>
                      <span style={css('font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#928B9B')}>Max DD</span>
                      <input value={V.dLegs.ddBaseline} onChange={V.setDdBaseline} placeholder="base" title="DD baseline (pip)" className="hv-focus" style={css('width:52px;background:rgba(49,35,73,.05);border:1px solid rgba(49,35,73,.12);border-radius:6px;padding:2px 6px;color:#24202B;font-size:10px;outline:none;font-family:JetBrains Mono;text-align:right')} />
                    </div>
                    <div style={{ ...css('font-family:JetBrains Mono;font-size:15px;font-weight:600'), color: V.dLegs.over ? '#E25462' : '#7658E8' }}>{V.dLegs.ddShown || 0}<span style={css('font-size:10px;color:#928B9B')}>{V.dLegs.baseline ? '/' + V.dLegs.baseline + 'p' : 'p'}</span></div>
                    <div style={css('height:4px;border-radius:3px;background:rgba(49,35,73,.08);overflow:hidden;margin-top:4px')}><div style={{ ...css('height:100%;border-radius:3px'), width: V.dLegs.ddPct + '%', background: V.dLegs.over ? '#E25462' : 'linear-gradient(90deg,#7658E8,#6747D8)' }}></div></div>
                  </div>
                </div>
              </div>
            ) : (
              <div onClick={V.addLeg} className="hv-op" style={css('cursor:pointer;text-align:center;padding:13px;border-radius:11px;border:1px dashed rgba(118,88,232,.28);background:rgba(118,88,232,.04);font-size:12px;color:#746E7D')}>
                + เพิ่มไม้แรก แล้วเบิ้ลต่อได้ — ระบบรวม lot, หา <b style={css('color:#7658E8')}>avg entry</b> และ <b style={css('color:#7658E8')}>Max DD</b> ให้อัตโนมัติ
              </div>
            )}

            {/* Feeling on Entry / SL / TP */}
            <div style={css('display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px')}>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>Feeling · Entry</div><Sel value={V.dFeelEntry} onChange={V.setFeelEntry} className="hv-focus rtm-select" style={{ ...css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:12px 15px;font-size:14px;outline:none;cursor:pointer'), color: V.dFeelEntry ? '#24202B' : '#9A93A1' }}><option value="">เลือก…</option>{V.optsFeelEntry.map(o => (<option key={o} value={o}>{o}</option>))}</Sel></div>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>Feeling · SL</div><Sel value={V.dFeelSL} onChange={V.setFeelSL} className="hv-focus rtm-select" style={{ ...css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:12px 15px;font-size:14px;outline:none;cursor:pointer'), color: V.dFeelSL ? '#24202B' : '#9A93A1' }}><option value="">เลือก…</option>{V.optsFeelSL.map(o => (<option key={o} value={o}>{o}</option>))}</Sel></div>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>Feeling · TP</div><Sel value={V.dFeelTP} onChange={V.setFeelTP} className="hv-focus rtm-select" style={{ ...css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:12px 15px;font-size:14px;outline:none;cursor:pointer'), color: V.dFeelTP ? '#24202B' : '#9A93A1' }}><option value="">เลือก…</option>{V.optsFeelTP.map(o => (<option key={o} value={o}>{o}</option>))}</Sel></div>
            </div>

            {/* MFE / capture — how far price ran, and how much you kept after TP. (Drawdown lives in the legs DD) */}
            <div style={css('height:1px;background:rgba(49,35,73,.07);margin:2px 0')}></div>
            <div style={css('font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6747D8;display:flex;align-items:center;gap:8px')}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#6747D8" strokeWidth="1.8"><path d="M4 14l5-5 4 3 7-8" strokeLinecap="round" strokeLinejoin="round"/><path d="M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round"/></svg>MFE · เก็บกำไร <span style={css('text-transform:none;letter-spacing:0;color:#928B9B;font-size:11px')}>· ใส่ราคา TP + ราคาสุดเทรนด์ แล้วระบบคำนวณ MFE ให้เอง</span></div>
            {/* price-driven MFE: exit(TP) price + peak price → system derives how far the trend ran, no contract size needed */}
            <div style={css('display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px')}>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>ราคา TP / จุดออก</div><input value={V.dExitPrice} onChange={V.setExitPrice} placeholder="e.g. 25900" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:12px 15px;color:#24202B;font-size:14.5px;outline:none;font-family:JetBrains Mono')} /></div>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>ราคาสุดเทรนด์ <span style={css('color:#928B9B')}>peak</span></div><input value={V.dPeakPrice} onChange={V.setPeakPrice} placeholder="e.g. 26000" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:12px 15px;color:#24202B;font-size:14.5px;outline:none;font-family:JetBrains Mono')} /></div>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>Avg entry <span style={css('color:#928B9B')}>· จากไม้</span></div><div style={{ ...css('width:100%;border-radius:10px;padding:12px 15px;font-size:14.5px;font-family:JetBrains Mono;background:rgba(0,0,0,.22);border:1px solid rgba(49,35,73,.09)'), color: V.dAvgEntry ? '#7658E8' : '#9A93A1' }}>{V.dAvgEntry || 'ใส่ราคาเข้าในไม้ก่อน'}</div></div>
            </div>
            {V.dMfeAuto
              ? (<div style={css('font-size:11.5px;color:#1C9B68;display:flex;align-items:center;gap:6px')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#1C9B68" strokeWidth="2.2"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>คำนวณ MFE อัตโนมัติจากราคาแล้ว — เต็มเทรนด์ {V.dExc ? V.dExc.mfeStr : ''} · เก็บได้ {V.dExc ? V.dExc.capStr : ''} · หลัง TP เหลือ {V.dExc ? V.dExc.ranAfter : ''}</div>)
              : (<div style={css('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
                  <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>หรือใส่ MFE เป็น $ เอง <span style={css('color:#928B9B')}>(ถ้าไม่มีราคา)</span></div><input value={V.dMfe} onChange={V.setMfe} placeholder="e.g. 520" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:12px 15px;color:#24202B;font-size:14.5px;outline:none;font-family:JetBrains Mono')} /></div>
                  <div style={css('display:flex;align-items:flex-end')}><div style={css('font-size:11.5px;color:#6f6a5c;line-height:1.5;padding-bottom:4px')}>Max DD ของรอบดูได้ที่ <b style={css('color:#746E7D')}>DD ของแต่ละไม้</b> ด้านบน — ไม่ต้องกรอกซ้ำ</div></div>
                </div>)}
            {V.dExc && (
              <div>
                <div style={css('position:relative;height:30px;border-radius:9px;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.09);overflow:hidden')}>
                  <div style={css('position:absolute;top:0;bottom:0;left:0;right:0;background:linear-gradient(90deg,rgba(28,155,104,.42),rgba(139,108,240,.16))')}></div>
                  <div style={{ ...css('position:absolute;top:0;bottom:0;background:repeating-linear-gradient(45deg,rgba(139,108,240,.28),rgba(139,108,240,.28) 6px,transparent 6px,transparent 12px);border-left:1px dashed #7658E8'), left: V.dExc.exit + '%', right: 0 }}></div>
                  <div title="จุดที่คุณออก (TP)" style={{ ...css('position:absolute;top:-4px;bottom:-4px;width:3px;background:#fff;z-index:3;box-shadow:0 0 0 1px #000'), left: V.dExc.exit + '%' }}></div>
                </div>
                <div style={css('display:flex;justify-content:space-between;margin-top:6px;font-family:JetBrains Mono;font-size:11px')}><span style={css('color:#928B9B')}>entry</span><span style={css('color:#7658E8')}>หลัง TP วิ่งต่อ {V.dExc.ranAfter}</span><span style={css('color:#1C9B68')}>peak {V.dExc.mfeStr}</span></div>
                <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px')}>
                  <div className="liquid-glass" style={css('padding:11px 13px;border-radius:11px;background:rgba(49,35,73,.03)')}><div style={css('font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#928B9B;margin-bottom:5px')}>เก็บได้ของ peak</div><div style={{ ...css('font-family:JetBrains Mono;font-size:19px;font-weight:600'), color: V.dExc.cap >= 80 ? '#1C9B68' : (V.dExc.cap >= 55 ? '#7658E8' : '#E25462') }}>{V.dExc.capStr}</div></div>
                  <div className="liquid-glass" style={css('padding:11px 13px;border-radius:11px;background:rgba(49,35,73,.03)')}><div style={css('font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#928B9B;margin-bottom:5px')}>หลัง TP วิ่งต่อ (หมู)</div><div style={css('font-family:JetBrains Mono;font-size:19px;font-weight:600;color:#7658E8')}>${V.dExc.pig}</div></div>
                </div>
                <div style={{ ...css('margin-top:12px;border-radius:10px;padding:11px 14px;font-size:13px;line-height:1.55'), background: V.dExc.cls === 'good' ? 'rgba(28,155,104,.1)' : (V.dExc.cls === 'warn' ? 'rgba(224,177,90,.12)' : 'rgba(226,84,98,.1)'), border: '1px solid ' + (V.dExc.cls === 'good' ? 'rgba(28,155,104,.35)' : (V.dExc.cls === 'warn' ? 'rgba(224,177,90,.4)' : 'rgba(226,84,98,.35)')), color: V.dExc.cls === 'good' ? '#9FF0D3' : (V.dExc.cls === 'warn' ? '#F0C98A' : '#FFC2C9') }}>{V.dExc.msg}</div>
              </div>
            )}
            </>)}
            {/* Core result — the only numeric inputs required for comparable expectancy. */}
            <div style={css('height:1px;background:rgba(49,35,73,.07);margin:2px 0')}></div>
            <div style={css('font-size:12px;color:#746E7D;margin-bottom:2px')}><b style={css('color:#6747D8')}>Result</b> · three numbers for accurate Net P&amp;L and R</div>
            <div className="rtm-trade-summary-grid" style={css('display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px')}>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>Risk (1R) <span style={css('color:#928B9B')}>(USD)</span></div><input value={V.dRisk} onChange={V.setRisk} placeholder="e.g. 100" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:11px 14px;color:#24202B;font-size:14px;outline:none;font-family:JetBrains Mono')} />{V.dRiskHint && !V.dRisk && <span onClick={V.dRiskHint.fill} className="hv-op" style={css('display:inline-block;margin-top:5px;font-size:9.5px;color:#4D7FE8;cursor:pointer')}>Use estimated ${V.dRiskHint.val}</span>}</div>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>Commission / Swap <span style={css('color:#928B9B')}>(รวมทุกไม้)</span></div><input value={V.dCommission} onChange={V.setCommission} placeholder="e.g. 3.20" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:11px 14px;color:#24202B;font-size:14px;outline:none;font-family:JetBrains Mono')} /></div>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>P&amp;L (USD) <span style={css('color:#928B9B')}>ก่อนหักค่าธรรมเนียม</span></div><input value={V.dPnl} onChange={V.setPnl} placeholder="1240 or -680" className="hv-focus" style={{ ...css('width:100%;background:rgba(49,35,73,.04);border-radius:10px;padding:11px 14px;font-size:14px;outline:none;font-family:JetBrains Mono'), border: '1px solid ' + V.pnlBorder, color: V.pnlInputColor }} /></div>
            </div>
            <div className="liquid-glass" style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:10px;border-radius:12px;padding:12px 14px;background:linear-gradient(100deg,rgba(118,88,232,.08),rgba(49,35,73,.02));border:1px solid rgba(118,88,232,.2)')}>
              <div><div style={css('font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#928B9B;margin-bottom:3px')}>Total risk (1R)</div><div style={css('font-family:JetBrains Mono;font-size:16px;font-weight:600;color:#24202B')}>{V.dSummary.totalRiskStr}</div></div>
              <div><div style={css('font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#928B9B;margin-bottom:3px')}>Commission</div><div style={css('font-family:JetBrains Mono;font-size:16px;font-weight:600;color:#746E7D')}>{V.dSummary.commStr}</div></div>
              <div><div style={css('font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#928B9B;margin-bottom:3px')}>Net P&amp;L</div><div style={{ ...css('font-family:JetBrains Mono;font-size:16px;font-weight:700'), color: V.dSummary.netColor }}>{V.dSummary.netStr}</div></div>
              <div><div style={css('font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#928B9B;margin-bottom:3px')}>ได้กี่ R</div><div style={{ ...css('font-family:JetBrains Mono;font-size:16px;font-weight:700'), color: V.dSummary.rColor }}>{V.dSummary.rStr}</div></div>
            </div>
            {V.dSummary.riskMissing && (<div style={css('font-size:11px;color:#6747D8;margin-top:-4px')}>ⓘ ใส่ Risk (1R) เพื่อให้ Avg R และ Edge Gate คำนวณจากความเสี่ยงจริงของไม้</div>)}
            <div style={css('height:1px;background:rgba(49,35,73,.07);margin:2px 0')}></div>
            <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px')}>Notes / why you entered</div><textarea value={V.dNotes} onChange={V.setNotes} placeholder="Why this trade? On plan? How did you feel?" rows="7" className="hv-focus" style={css('width:100%;min-height:160px;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:13px 16px;color:#24202B;font-size:14.5px;outline:none;resize:vertical;line-height:1.65')}></textarea></div>
            <div>
              <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:9px')}><div style={css('font-size:11px;color:#746E7D;letter-spacing:.04em')}>Images / chart screenshots <span style={css('color:#928B9B')}>(multiple)</span></div>{V.canAddImg && <span onClick={V.addImg} className="hv-op" style={css('font-size:11.5px;color:#6747D8;cursor:pointer;display:flex;align-items:center;gap:4px')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>Add image</span>}</div>
              <div style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:10px')}>
                {V.tradeImgs.map((im) => (
                  <ImageSlot key={im.n} slotId={'trade-' + im.tid + '-img-' + im.n} value={this.state.images['trade-' + im.tid + '-img-' + im.n]} onChange={(p) => this.setImage('trade-' + im.tid + '-img-' + im.n, p)} rounded placeholder="Drop a chart image" style={{ width: '100%', height: '120px' }} />
                ))}
              </div>
            </div>
            <div style={css('display:flex;gap:12px;margin-top:4px')}>
              {V.canDelete && (
                <div onClick={V.deleteTrade} className="hv-deloutline" style={css('flex:none;padding:13px 18px;border-radius:11px;border:1px solid rgba(226,84,98,.4);color:#E25462;font-size:14px;font-weight:600;cursor:pointer;transition:.14s')}>Delete</div>
              )}
              {V.canDuplicate && (
                <div onClick={V.duplicateTrade} className="hv-lift" title="Duplicate as new trade" style={css('flex:none;padding:13px 18px;border-radius:11px;border:1px solid rgba(118,88,232,.35);color:#7658E8;font-size:14px;font-weight:600;cursor:pointer;transition:.14s')}>Duplicate</div>
              )}
              <div onClick={V.cancelTrade} className="hv-cancel" style={css('flex:1;text-align:center;padding:13px;border-radius:11px;border:1px solid rgba(49,35,73,.12);color:#746E7D;font-size:14px;font-weight:600;cursor:pointer')}>{V.draftIsNew ? 'Cancel' : 'Close'}</div>
              <div onClick={V.saveTrade} className="hv-save rtm-press" style={css('flex:1.4;text-align:center;padding:13px;border-radius:11px;background:linear-gradient(150deg,#7658E8,#6747D8);color:#FFFFFF;font-size:14px;font-weight:700;cursor:pointer;transition:.15s')}>{V.draftIsNew ? 'Save' : 'Save & close'}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  renderFieldCfgModal(V) {
    const inp = 'flex:1;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:8px;padding:7px 12px;color:#24202B;font-size:12px;outline:none';
    return (
      <div onClick={V.closeFieldCfg} style={css('position:fixed;inset:0;z-index:34;background:rgba(4,4,7,.74);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;animation:fade .25s both')}>
        <div onClick={V.stop} className="rtm-scroll liquid-glass" style={css('width:560px;max-width:94vw;max-height:88vh;overflow-y:auto;border-radius:20px;background:rgba(19,19,22,.88);border:1px solid rgba(118,88,232,.22);box-shadow:0 50px 120px -30px rgba(0,0,0,.95);animation:modalIn .32s cubic-bezier(.25,.9,.3,1) both')}>
          <div style={css('display:flex;justify-content:space-between;align-items:center;padding:22px 26px;border-bottom:1px solid rgba(49,35,73,.07);position:sticky;top:0;background:rgba(18,18,24,.94);backdrop-filter:blur(8px);z-index:2')}>
            <div><div style={css('font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#6747D8;margin-bottom:4px')}>Trade analysis</div><div style={css('font-family:\'Instrument Serif\',serif;font-size:21px;color:#24202B')}>Edit filter options</div></div>
            <div onClick={V.closeFieldCfg} className="hv-close" style={css('width:34px;height:34px;border-radius:9px;border:1px solid rgba(49,35,73,.1);display:flex;align-items:center;justify-content:center;color:#746E7D;cursor:pointer')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
          </div>
          <div style={css('padding:8px 26px 24px')}>
            <div style={css('font-size:12px;color:#928B9B;line-height:1.55;margin:12px 0 16px')}>Define the choices for each field once here — they become the options you can pick when logging a trade and the filters on the log. Drag order with the arrows; ✕ removes a choice (past trades keep their value).</div>
            {V.fieldCfgVM.map((f) => (
              <div key={f.key} style={css('margin-bottom:16px')}>
                <div style={css('font-size:11px;font-weight:600;color:#7658E8;margin-bottom:7px;letter-spacing:.03em')}>{f.label} <span style={css('color:#928B9B;font-weight:400')}>· {f.opts.length}</span></div>
                <div style={css('display:flex;flex-direction:column;gap:5px;margin-bottom:7px')}>
                  {f.opts.length ? f.opts.map((o, oi) => (
                    <div key={o} className="hv-chk" style={css('display:flex;align-items:center;gap:8px;padding:3px 7px 3px 9px;border-radius:8px;background:rgba(49,35,73,.025);border:1px solid rgba(49,35,73,.07)')}>
                      <input defaultValue={o} title="Click to edit — fixes this choice on every past trade too" onBlur={(e) => V.renameFieldOpt(f.key, o, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur(); } }} className="hv-focus" style={css('flex:1;font-size:12px;color:#24202B;background:transparent;border:1px solid transparent;border-radius:6px;padding:5px 7px;outline:none')} />
                      <span onClick={() => V.moveFieldOpt(f.key, o, -1)} className="hv-op" style={{ ...css('cursor:pointer;color:#928B9B;font-size:12px;padding:0 3px'), opacity: oi === 0 ? 0.25 : 1 }}>▲</span>
                      <span onClick={() => V.moveFieldOpt(f.key, o, 1)} className="hv-op" style={{ ...css('cursor:pointer;color:#928B9B;font-size:12px;padding:0 3px'), opacity: oi === f.opts.length - 1 ? 0.25 : 1 }}>▼</span>
                      <span onClick={() => V.removeFieldOpt(f.key, o)} className="hv-deltext" style={css('cursor:pointer;color:#928B9B;font-size:11.5px;padding:0 5px')}>✕</span>
                    </div>
                  )) : <div style={css('font-size:11.5px;color:#928B9B;padding:3px 2px')}>No choices yet — add one below.</div>}
                </div>
                <div style={css('display:flex;gap:8px')}>
                  <input placeholder={'Add a choice for ' + f.label + ', then Enter'} onKeyDown={(e) => { if (e.key === 'Enter') { V.addFieldOpt(f.key, e.target.value); e.target.value = ''; } }} className="hv-focus" style={css(inp)} />
                </div>
              </div>
            ))}
          </div>
          <div style={css('display:flex;justify-content:flex-end;gap:12px;padding:16px 26px;border-top:1px solid rgba(49,35,73,.07);position:sticky;bottom:0;background:rgba(18,18,24,.94);backdrop-filter:blur(8px)')}>
            <div onClick={V.closeFieldCfg} className="hv-save rtm-press" style={css('padding:11px 26px;border-radius:11px;background:linear-gradient(150deg,#7658E8,#6747D8);color:#FFFFFF;font-size:14px;font-weight:700;cursor:pointer;transition:.15s')}>Done</div>
          </div>
        </div>
      </div>
    );
  }

  renderPlanModal(V) {
    return (
      <div onClick={V.planClose} style={css('position:fixed;inset:0;z-index:40;background:rgba(4,4,7,.74);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;animation:fade .25s both')}>
        <div onClick={V.stop} className="rtm-scroll liquid-glass" style={css('width:540px;max-width:94vw;max-height:88vh;overflow-y:auto;border-radius:20px;background:rgba(19,19,22,.88);border:1px solid rgba(118,88,232,.25);box-shadow:0 50px 120px -30px rgba(0,0,0,.95);animation:modalIn .32s cubic-bezier(.25,.9,.3,1) both')}>
          <div style={css('position:relative;overflow:hidden;padding:24px 26px;border-bottom:1px solid rgba(49,35,73,.07);background:linear-gradient(120deg,rgba(118,88,232,.16),rgba(139,108,240,.08))')}>
            <div style={css('position:absolute;top:-40%;right:-5%;width:40%;height:160%;background:radial-gradient(circle,rgba(118,88,232,.18),transparent 70%);pointer-events:none')}></div>
            <div style={css('display:flex;justify-content:space-between;align-items:flex-start')}>
              <div>
                <div style={css('display:flex;align-items:center;gap:8px;margin-bottom:6px')}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#7658E8" strokeWidth="1.8"><path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="9"/></svg><span style={css('font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#6747D8')}>{V.planTag}</span></div>
                <div style={css('font-family:\'Instrument Serif\',serif;font-size:23px;color:#24202B')}>{V.planTitle}</div>
                <div style={css('font-size:12.5px;color:#746E7D;margin-top:4px')}>Prepare before the new period starts · <span style={css('color:#7658E8')}>{V.planLabel}</span></div>
              </div>
              <div onClick={V.planClose} className="hv-close" style={css('width:34px;height:34px;border-radius:9px;border:1px solid rgba(49,35,73,.1);display:flex;align-items:center;justify-content:center;color:#746E7D;cursor:pointer;flex:none')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
            </div>
          </div>
          <div style={css('padding:10px 8px')}>
            {V.planItems.map((c, i) => (
              <div key={i} className="hv-chk" style={{ ...css('display:flex;align-items:center;gap:14px;padding:14px 20px;transition:.14s'), borderTop: c.border }}>
                <div onClick={c.toggle} style={{ ...css('width:22px;height:22px;border-radius:7px;flex:none;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.16s'), border: c.boxBorder, background: c.boxBg }}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FFFFFF" strokeWidth="3" style={{ opacity: c.checkOp }}><path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                {c.editing ? (
                  <input defaultValue={c.text} onBlur={c.commit} onKeyDown={c.key} autoFocus style={css('flex:1;font-size:14px;color:#24202B;background:rgba(0,0,0,.25);border:1px solid rgba(118,88,232,.4);border-radius:7px;padding:5px 10px;outline:none')} />
                ) : (
                  <Fragment>
                    <span onClick={c.toggle} style={{ ...css('flex:1;font-size:14px;cursor:pointer'), color: c.textColor, textDecoration: c.strike }}>{c.text}</span>
                    <div onClick={c.edit} className="hv-edittext" style={css('flex:none;color:#928B9B;cursor:pointer;transition:.14s')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                    <div onClick={c.del} className="hv-deltext" style={css('flex:none;color:#928B9B;cursor:pointer;transition:.14s')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
                  </Fragment>
                )}
              </div>
            ))}
            <div style={css('display:flex;align-items:center;gap:12px;padding:12px 20px;border-top:1px solid rgba(49,35,73,.05)')}>
              <div style={css('width:22px;height:22px;border-radius:7px;flex:none;border:1.5px dashed rgba(118,88,232,.4);display:flex;align-items:center;justify-content:center;color:#6747D8')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg></div>
              <input placeholder="Add an item, then Enter" onKeyDown={V.planAddKey} style={css('flex:1;font-size:14px;color:#24202B;background:transparent;border:none;outline:none')} />
            </div>
          </div>
          <div style={css('display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 22px;border-top:1px solid rgba(49,35,73,.07)')}>
            <span style={css('font-size:12px;color:#928B9B;font-family:JetBrains Mono')}>Done {V.planFrac}</span>
            <div onClick={V.planClose} className="hv-save rtm-press" style={css('padding:11px 22px;border-radius:11px;background:linear-gradient(150deg,#7658E8,#6747D8);color:#FFFFFF;font-size:14px;font-weight:700;cursor:pointer;transition:.15s')}>Done</div>
          </div>
        </div>
      </div>
    );
  }

  renderTxnModal(V) {
    const p = V.txnModal;
    return (
      <div onClick={V.closeTxns} style={css('position:fixed;inset:0;z-index:40;background:rgba(4,4,7,.74);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;animation:fade .25s both')}>
        <div onClick={V.stop} className="rtm-scroll liquid-glass" style={css('width:520px;max-width:94vw;max-height:88vh;overflow-y:auto;border-radius:20px;background:rgba(19,19,22,.88);border:1px solid rgba(118,88,232,.22);box-shadow:0 50px 120px -30px rgba(0,0,0,.95);animation:modalIn .32s cubic-bezier(.25,.9,.3,1) both')}>
          <div style={css('position:sticky;top:0;z-index:2;padding:22px 26px;border-bottom:1px solid rgba(49,35,73,.07);background:rgba(18,18,24,.92);backdrop-filter:blur(8px)')}>
            <div style={css('display:flex;justify-content:space-between;align-items:flex-start')}>
              <div><div style={css('font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#6747D8;margin-bottom:4px')}>Deposit / withdrawal history</div><div style={css('font-family:\'Instrument Serif\',serif;font-size:22px;color:#24202B')}>{p.name}</div></div>
              <div onClick={V.closeTxns} className="hv-close" style={css('width:34px;height:34px;border-radius:9px;border:1px solid rgba(49,35,73,.1);display:flex;align-items:center;justify-content:center;color:#746E7D;cursor:pointer;flex:none')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
            </div>
            <div style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px')}>
              <div><div style={css('font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#928B9B;margin-bottom:3px')}>Total in</div><div style={css('font-family:JetBrains Mono;font-size:13px;color:#1C9B68')}>{p.depositedStr}</div></div>
              <div><div style={css('font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#928B9B;margin-bottom:3px')}>Withdrawn</div><div style={{ ...css('font-family:JetBrains Mono;font-size:13px'), color: p.withdrawnStr !== '$0' ? '#E25462' : '#746E7D' }}>{p.withdrawnStr}</div></div>
              <div><div style={css('font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#928B9B;margin-bottom:3px')}>Net capital</div><div style={css('font-family:JetBrains Mono;font-size:13px;color:#24202B')}>{p.netCapStr}</div></div>
              <div><div style={css('font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#928B9B;margin-bottom:3px')}>Equity</div><div style={css('font-family:JetBrains Mono;font-size:13px;color:#7658E8')}>{p.equityStr}</div></div>
            </div>
            <div style={css('display:flex;gap:8px;margin-top:14px')}>
              <span onClick={p.deposit} className="hv-lift" style={css('flex:1;text-align:center;font-size:12px;font-weight:600;color:#1C9B68;background:rgba(28,155,104,.1);border:1px solid rgba(28,155,104,.3);border-radius:8px;padding:9px;cursor:pointer;transition:.14s')}>Deposit</span>
              <span onClick={p.withdraw} className="hv-lift" style={css('flex:1;text-align:center;font-size:12px;font-weight:600;color:#E25462;background:rgba(226,84,98,.1);border:1px solid rgba(226,84,98,.3);border-radius:8px;padding:9px;cursor:pointer;transition:.14s')}>Withdraw</span>
            </div>
          </div>
          <div style={css('padding:8px 12px 16px')}>
            {p.movements.length === 0 && <div style={css('padding:36px 20px;text-align:center;font-size:13px;color:#928B9B')}>No deposits or withdrawals yet</div>}
            {p.movements.map((m) => (
              <div key={m.id} className="hv-chk" style={css('display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:10px;transition:.14s')}>
                <div style={css('display:flex;align-items:center;gap:12px')}>
                  <span style={{ ...css('width:9px;height:9px;border-radius:50%;flex:none'), background: m.isW ? '#E25462' : '#1C9B68' }}></span>
                  <div><div style={{ ...css('font-size:13px;font-weight:600'), color: m.isW ? '#E25462' : '#1C9B68' }}>{m.isW ? 'Withdraw' : 'Deposit'}</div><div style={css('font-size:11px;color:#928B9B;font-family:JetBrains Mono')}>{m.date} · balance {m.runStr}</div></div>
                </div>
                <div style={css('display:flex;align-items:center;gap:12px')}>
                  <span style={{ ...css('font-family:JetBrains Mono;font-size:14px;font-weight:600'), color: m.isW ? '#E25462' : '#1C9B68' }}>{m.amtStr}</span>
                  <span onClick={m.del} title="Delete this entry" className="hv-visdel" style={css('width:26px;height:26px;border-radius:7px;border:1px solid rgba(49,35,73,.1);display:flex;align-items:center;justify-content:center;color:#928B9B;cursor:pointer;transition:.14s;flex:none')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  renderResetModal(V) {
    return (
      <div onClick={V.closeReset} style={css('position:fixed;inset:0;z-index:40;background:rgba(4,4,7,.74);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;animation:fade .25s both')}>
        <div onClick={V.stop} style={css('width:440px;max-width:92vw;border-radius:20px;background:linear-gradient(180deg,#1a1014,#0e0e13);border:1px solid rgba(226,84,98,.3);box-shadow:0 50px 120px -30px rgba(0,0,0,.95);animation:modalIn .32s cubic-bezier(.25,.9,.3,1) both;padding:28px 28px 24px;text-align:center')}>
          <div style={{ width: 54, height: 54, margin: '0 auto 16px', borderRadius: 14, background: 'rgba(226,84,98,.12)', border: '1px solid rgba(226,84,98,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#E25462" strokeWidth="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div style={css('font-family:\'Instrument Serif\',serif;font-size:22px;color:#24202B;margin-bottom:10px')}>Reset all data?</div>
          <div style={css('font-size:13.5px;color:#746E7D;line-height:1.6;margin-bottom:22px')}>Trades, portfolios, playbooks and referenced images will be deleted and reset to defaults. <b style={css('color:#E25462')}>This cannot be undone.</b></div>
          <div style={css('display:flex;gap:12px')}>
            <div onClick={V.closeReset} className="hv-cancel" style={css('flex:1;text-align:center;padding:13px;border-radius:11px;border:1px solid rgba(49,35,73,.14);color:#746E7D;font-size:14px;font-weight:600;cursor:pointer')}>Cancel</div>
            <div onClick={V.doReset} className="hv-deloutline" style={css('flex:1;text-align:center;padding:13px;border-radius:11px;border:1px solid rgba(226,84,98,.5);background:rgba(226,84,98,.12);color:#E25462;font-size:14px;font-weight:700;cursor:pointer;transition:.14s')}>Confirm reset</div>
          </div>
        </div>
      </div>
    );
  }

  renderSetupModal(V) {
    return (
      <div onClick={V.closeSetup} style={css('position:fixed;inset:0;z-index:30;background:rgba(4,4,7,.74);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;animation:fade .25s both')}>
        <div onClick={V.stop} className="rtm-scroll liquid-glass" style={css('width:660px;max-width:94vw;max-height:90vh;overflow-y:auto;border-radius:20px;background:rgba(19,19,22,.88);border:1px solid rgba(118,88,232,.2);box-shadow:0 50px 120px -30px rgba(0,0,0,.95);animation:modalIn .32s cubic-bezier(.25,.9,.3,1) both')}>
          <div style={css('display:flex;justify-content:space-between;align-items:center;padding:22px 26px;border-bottom:1px solid rgba(49,35,73,.07);position:sticky;top:0;background:rgba(18,18,24,.92);backdrop-filter:blur(8px);z-index:2')}><div><div style={css('font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#6747D8;margin-bottom:4px')}>{V.setupModalTag}</div><div style={css('font-family:\'Instrument Serif\',serif;font-size:22px;color:#24202B')}>{V.setupModalTitle}</div></div><div onClick={V.closeSetup} className="hv-close" style={css('width:34px;height:34px;border-radius:9px;border:1px solid rgba(49,35,73,.1);display:flex;align-items:center;justify-content:center;color:#746E7D;cursor:pointer')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div></div>
          <div style={css('padding:24px 26px;display:flex;flex-direction:column;gap:16px')}>
            <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px;letter-spacing:.04em')}>Setup name</div><input value={V.sName} onChange={V.setSName} placeholder="e.g. Rally" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:11px 14px;color:#24202B;font-size:14px;outline:none')} /></div>
              <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px;letter-spacing:.04em')}>Setup colour</div><div style={css('display:flex;gap:8px;align-items:center;height:42px')}>
                {V.accentChoices.map((ac, i) => (
                  <div key={i} onClick={ac.pick} className="hv-scale" style={{ ...css('width:28px;height:28px;border-radius:8px;cursor:pointer;transition:.14s'), background: ac.color, border: ac.border }}></div>
                ))}
              </div></div>
            </div>
            {V.showSetupStats && (
              <div style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:10px')}>
                {V.setupStats.map((s, i) => (
                  <div key={i} style={css('padding:12px 14px;border-radius:11px;background:rgba(49,35,73,.03);border:1px solid rgba(49,35,73,.06)')}><div style={css('font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#928B9B;margin-bottom:6px')}>{s.l}</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:16px;font-weight:600'), color: s.c }}>{s.v}</div></div>
                ))}
              </div>
            )}
            {V.canBumpSetup && (
              <div className="rtm-version-panel" style={css('display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 15px;border-radius:12px;background:linear-gradient(110deg,rgba(139,108,240,.09),rgba(49,35,73,.02));border:1px solid rgba(139,108,240,.24)')}>
                <div><div style={css('font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:#8B6CF0;margin-bottom:5px')}>Current ruleset · v{V.setupVersion}</div><div style={css('font-size:11.5px;color:#8D8995;line-height:1.5')}>สถิติใช้เฉพาะ trades ของเวอร์ชันนี้ · เมื่อแก้ description/entry conditions หลังมีข้อมูล ระบบจะเปิดเวอร์ชันใหม่ให้อัตโนมัติ {V.versionHistoryN > 0 ? '· history ' + V.versionHistoryN : ''}</div></div>
                <span onClick={V.bumpSetupVersion} className="rtm-press" style={css('flex:none;font-size:11.5px;font-weight:700;color:#0B0713;padding:9px 12px;border-radius:9px;cursor:pointer;background:linear-gradient(135deg,#8B6CF0,#E48AC8)')}>Create v{V.setupVersion + 1}</span>
              </div>
            )}
            <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px;letter-spacing:.04em')}>Short description</div><input value={V.sDesc} onChange={V.setSDesc} placeholder="e.g. Uptrend continuation, enter on pullback" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:11px 14px;color:#24202B;font-size:14px;outline:none')} /></div>
            <div><div style={css('font-size:12px;color:#746E7D;margin-bottom:8px;letter-spacing:.04em')}>How to use / entry conditions</div><textarea value={V.sUsage} onChange={V.setSUsage} placeholder="Describe how to use this setup, when to enter, where to set SL/TP..." rows="5" className="hv-focus" style={css('width:100%;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:10px;padding:11px 14px;color:#24202B;font-size:14px;outline:none;resize:none;line-height:1.6')}></textarea></div>
            <div>
              <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:9px')}><div style={css('font-size:11px;color:#746E7D;letter-spacing:.04em')}>Example entry charts for this setup <span style={css('color:#928B9B')}>(multiple)</span></div>{V.canAddSetupImg && <span onClick={V.addSetupImg} className="hv-op" style={css('font-size:11.5px;color:#6747D8;cursor:pointer;display:flex;align-items:center;gap:4px')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>Add image</span>}</div>
              <div style={css('display:grid;grid-template-columns:repeat(2,1fr);gap:10px')}>
                {V.setupImgs.map((im) => (
                  <ImageSlot key={im.n} slotId={im.slotId} value={this.state.images[im.slotId]} onChange={(p) => this.setImage(im.slotId, p)} rounded placeholder="Drop an example chart" style={{ width: '100%', height: '220px' }} />
                ))}
              </div>
            </div>
            <div style={css('display:flex;gap:12px;margin-top:4px')}>
              {V.canDeleteSetup && (
                <div onClick={V.deleteSetup} className="hv-deloutline" style={css('flex:none;padding:13px 18px;border-radius:11px;border:1px solid rgba(226,84,98,.4);color:#E25462;font-size:14px;font-weight:600;cursor:pointer;transition:.14s')}>Delete</div>
              )}
              <div onClick={V.cancelSetup} className="hv-cancel" style={css('flex:1;text-align:center;padding:13px;border-radius:11px;border:1px solid rgba(49,35,73,.12);color:#746E7D;font-size:14px;font-weight:600;cursor:pointer')}>{V.setupIsNew ? 'Cancel' : 'Close'}</div>
              <div onClick={V.saveSetup} className="hv-save rtm-press" style={css('flex:1.4;text-align:center;padding:13px;border-radius:11px;background:linear-gradient(150deg,#7658E8,#6747D8);color:#FFFFFF;font-size:14px;font-weight:700;cursor:pointer;transition:.15s')}>{V.setupIsNew ? 'Save' : 'Save & close'}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  render() {
    const V = this.renderVals();
    // top-bar nav: labelled links, hero-navbar style (active = lit glass pill)
    const NAV_LINKS = [
      ['dashboard', 'Dashboard', V.goDash], ['backtest', 'Backtest', V.goBacktest],
      ['forward', 'Forward', V.goForward], ['analytics', 'Edge Lab', V.goAna],
      ['setups', 'Setups', V.goSet], ['playbook', 'Playbook', V.goPlay],
    ];
    const curView = this.state.view;
    const navActive = (k) => k === 'backtest' || k === 'forward'
      ? curView === 'log' && V.journalMode === k
      : curView === k;
    return (
      <div className="rtm-app-shell" style={css('position:fixed;inset:0;display:flex;background:#F7F5FB')}>

        <div className="rtm-shell-ambient" style={css('position:absolute;inset:0;pointer-events:none;overflow:hidden')}>
          <div style={css('position:absolute;top:-12%;right:8%;width:42%;height:55%;background:radial-gradient(circle,rgba(155,111,255,.075),transparent 66%);animation:drift1 20s ease-in-out infinite')}></div>
          <div style={css('position:absolute;bottom:-16%;left:2%;width:40%;height:58%;background:radial-gradient(circle,rgba(77,127,232,.032),transparent 66%);animation:drift2 26s ease-in-out infinite')}></div>
          <div style={css('position:absolute;top:34%;left:42%;width:34%;height:46%;background:radial-gradient(circle,rgba(49,35,73,.026),transparent 66%);animation:drift1 30s ease-in-out infinite')}></div>
          {/* fine light seam along the very top — the "polished edge" of the surface */}
          <div style={css('position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(139,108,240,.34) 22%,rgba(139,108,240,.5) 50%,rgba(139,108,240,.34) 78%,transparent)')}></div>
        </div>

        {/* MAIN COLUMN */}
        <div style={css('position:relative;z-index:1;flex:1;min-width:0;display:flex;flex-direction:column')}>

          {/* TOPBAR — hero-style navbar: logo · name · page links · clock · actions */}
          <div className="rtm-topbar" style={css('position:relative;z-index:40;flex:none;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px 16px;padding:11px 24px;border-bottom:1px solid rgba(49,35,73,.07);background:rgba(49,35,73,.012);backdrop-filter:blur(14px)')}>
            <div style={css('display:flex;align-items:center;gap:14px;min-width:0')}>
              <div className="rtm-logo" style={css('width:32px;height:32px;border-radius:10px;flex:none;background:linear-gradient(145deg,rgba(118,88,232,.34),rgba(118,88,232,.06));box-shadow:0 0 0 1px rgba(118,88,232,.28),0 6px 18px -8px rgba(118,88,232,.55);display:flex;align-items:center;justify-content:center')}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#7658E8" strokeWidth="1.7"><path d="M3 17l5-5 4 3 6-8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              {V.editName ? (
                <input defaultValue={V.accountName} onBlur={V.commitName} onKeyDown={V.onNameKey} autoFocus style={css('font-family:\'Instrument Serif\',serif;font-size:19px;color:#24202B;background:rgba(118,88,232,.08);border:1px solid rgba(118,88,232,.4);border-radius:8px;padding:3px 10px;outline:none;width:190px')} />
              ) : (
                <div onClick={V.startName} title="Click to rename" className="hv-op" style={css('display:flex;align-items:center;gap:7px;cursor:text')}><span style={css('font-family:\'Instrument Serif\',serif;font-size:19px;color:#24202B;letter-spacing:-.01em;white-space:nowrap')}>{V.accountName}</span><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#928B9B" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              )}
            </div>
            <div className="rtm-main-nav" style={css('display:flex;align-items:center;gap:2px;padding:4px;border-radius:999px;flex-wrap:wrap;justify-content:center')}>
              {NAV_LINKS.map(([k, label, go]) => (
                <span key={k} onClick={go} className={'hv-navlink rtm-press' + (navActive(k) ? ' active' : '')} style={{ ...css('position:relative;z-index:1;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:999px;cursor:pointer;white-space:nowrap;transition:.15s'), color: navActive(k) ? '#fff' : '#746E7D', background: navActive(k) ? '#24202B' : 'transparent' }}>{label}</span>
              ))}
            </div>
            <div style={css('display:flex;align-items:center;gap:10px')}>
              <div title={V.todayLabel + ' · ' + V.tzAbbr} style={css('display:flex;align-items:center;gap:8px;background:rgba(118,88,232,.07);border:1px solid rgba(118,88,232,.18);border-radius:999px;padding:6px 13px')}>
                <span style={{ ...css('width:6px;height:6px;border-radius:50%;background:#1C9B68;flex:none'), animation: 'pulse 2.4s infinite' }}></span>
                <span id="rtm-clock" style={css('font-family:\'JetBrains Mono\',monospace;font-size:13.5px;font-weight:600;letter-spacing:.02em;color:#7658E8;line-height:1')}>{V.clock}</span>
              </div>
              <div onClick={V.openNew} title="Log a trade (N)" className="hv-addbtn rtm-press" style={css('width:32px;height:32px;border-radius:50%;flex:none;background:linear-gradient(150deg,#7658E8,#6747D8);display:flex;align-items:center;justify-content:center;color:#FFFFFF;cursor:pointer;transition:.16s;box-shadow:0 8px 20px -8px rgba(118,88,232,.8)')}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg></div>
              {!V.isBacktestMode && <div style={{ position: 'relative' }} onMouseDown={(e) => e.stopPropagation()}>
                <div onClick={V.togglePortMenu} className="hv-port liquid-glass" style={css('display:flex;align-items:center;gap:8px;background:rgba(49,35,73,.04);border:1px solid rgba(49,35,73,.12);border-radius:9px;padding:7px 13px;font-size:12.5px;font-weight:500;color:#24202B;cursor:pointer;transition:.15s')}>{V.currentPortfolioName}<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#746E7D" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg></div>
                {V.showPortMenu && (
                  <div className="rtm-scroll rtm-popover" style={{ position: 'absolute', top: '110%', right: 0, zIndex: 30, minWidth: 288, maxHeight: '60vh', overflowY: 'auto', background: 'rgba(16,16,19,.97)', backdropFilter: 'blur(16px)', border: '1px solid rgba(118,88,232,.2)', borderRadius: 12, boxShadow: '0 24px 60px -20px rgba(0,0,0,.9)', padding: 6, animation: 'pop .18s both' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 11px 6px', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#9A93A1' }}><span>Portfolio</span><span>คงเหลือ</span></div>
                    <div onClick={() => V.selectPortfolio('all')} className="hv-chk" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: V.currentPortfolioId === 'all' ? '#7658E8' : '#24202B' }}>
                      <span>All portfolio</span>
                      <span title="รวมทุกพอร์ต" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600, color: '#7658E8', whiteSpace: 'nowrap' }}>{V.allBalStr}</span>
                    </div>
                    {V.portMenu.map((p) => (
                      <div key={p.id} onClick={() => V.selectPortfolio(p.id)} className="hv-chk" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: V.currentPortfolioId === p.id ? '#7658E8' : '#24202B' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', flex: 'none', background: p.tint }}></span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                          <span title="ยอดคงเหลือปัจจุบัน" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#7563A6', whiteSpace: 'nowrap' }}>{p.balStr}</span>
                          <span onClick={(e) => V.delPortfolio(p.id, e)} className="hv-deltext" style={{ color: '#928B9B', cursor: 'pointer' }}>✕</span>
                        </span>
                      </div>
                    ))}
                    {V.orphanRow && (
                      <div title="ออเดอร์ของพอร์ตที่ถูกลบไปแล้ว — ยังนับใน P&L รวม แต่ไม่มีพอร์ตเป็นเจ้าของ" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 11px', borderRadius: 8, fontSize: 12, color: '#928B9B' }}>
                        <span>ไม่ได้จัดกลุ่ม · {V.orphanRow.n} ไม้</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5 }}>{V.orphanRow.netStr}</span>
                      </div>
                    )}
                    <div onClick={V.openAccount} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px', marginTop: 4, borderTop: '1px solid rgba(49,35,73,.07)', cursor: 'pointer', fontSize: 13, color: '#6747D8' }}>+ Add / manage portfolios</div>
                  </div>
                )}
              </div>}
              <div style={{ position: 'relative' }} onMouseDown={(e) => e.stopPropagation()}>
                <div onClick={V.toggleUserMenu} title="My account" className="hv-lift" style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(118,88,232,.12)', border: '1px solid rgba(118,88,232,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#7658E8', cursor: 'pointer', fontFamily: "'Instrument Serif',serif", transition: '.15s' }}>{V.avatarLetter}</div>
                {V.showUserMenu && (
                  <div className="rtm-popover" style={{ position: 'absolute', top: '120%', right: 0, zIndex: 30, minWidth: 220, background: 'rgba(16,16,19,.97)', backdropFilter: 'blur(16px)', border: '1px solid rgba(118,88,232,.2)', borderRadius: 12, boxShadow: '0 24px 60px -20px rgba(0,0,0,.9)', padding: 6, animation: 'pop .18s both' }}>
                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#746E7D', borderBottom: '1px solid rgba(49,35,73,.07)', marginBottom: 4, wordBreak: 'break-all' }}>{V.userEmail || 'My account'}</div>
                    {/* มาตรวัดพื้นที่ใช้งาน */}
                    <div style={{ padding: '8px 12px 12px', borderBottom: '1px solid rgba(49,35,73,.07)', marginBottom: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#746E7D', marginBottom: 5 }}><span>Images</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: V.storageImgColor }}>{V.storageImgText}</span></div>
                      <div style={{ height: 6, borderRadius: 99, background: 'rgba(49,35,73,.08)', overflow: 'hidden', marginBottom: 11 }}><div style={{ height: '100%', borderRadius: 99, width: V.storageReady ? V.storageImgWidth : '0%', background: V.storageImgColor, transition: 'width .5s' }}></div></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#746E7D', marginBottom: 5 }}><span>Data</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: '#4D7FE8' }}>{V.storageDataText}</span></div>
                      <div style={{ height: 6, borderRadius: 99, background: 'rgba(49,35,73,.08)', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 99, width: V.storageDataWidth, background: '#4D7FE8', transition: 'width .5s' }}></div></div>
                      {V.storageNearFull && (
                        <div onClick={() => { this.setState({ showUserMenu: false }); this.backupJournal(); }} style={{ marginTop: 11, padding: '9px 11px', borderRadius: 9, background: 'rgba(226,84,98,.12)', border: '1px solid rgba(226,84,98,.4)', cursor: 'pointer' }}>
                          <div style={{ fontSize: 11.5, color: '#E25462', fontWeight: 600, marginBottom: 2 }}>⚠ Storage almost full ({V.storagePctNum}%)</div>
                          <div style={{ fontSize: 10.5, color: '#746E7D' }}>Tap to back up, then archive old trades in Account</div>
                        </div>
                      )}
                    </div>
                    <div onClick={() => { this.setState({ showUserMenu: false }); this.backupJournal(false); }} className="hv-chk" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#24202B' }}>สำรองข้อมูล · เฉพาะตัวเลข<span style={{ fontSize: 10.5, color: '#928B9B' }}>เล็ก · ทำบ่อยได้</span></div>
                    <div onClick={() => { this.setState({ showUserMenu: false }); this.backupJournal(true); }} className="hv-chk" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#24202B' }}>สำรองข้อมูล · รวมรูปทั้งหมด<span style={{ fontSize: 10.5, color: '#928B9B' }}>{V.lastBackupStr}</span></div>
                    <div onClick={V.openAccount} className="hv-chk" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#24202B' }}>Account &amp; portfolios</div>
                    <div onClick={V.openReset} className="hv-deltext" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#E25462', borderTop: '1px solid rgba(49,35,73,.07)', marginTop: 4 }}>Reset all data</div>
                    <div onClick={V.signOut} className="hv-deltext" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#E25462' }}>Sign out</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* VIEWPORT */}
          <div className="rtm-scroll" ref={(el) => { this._scrollRoot = el; }} style={css('flex:1;min-height:0;overflow-y:auto;overflow-x:hidden')}>
            {V.backupWarn && (
              <div style={{ ...css('display:flex;align-items:center;gap:12px;margin:14px 28px 0;padding:11px 15px;border-radius:12px;font-size:12.5px;animation:rise .5s both'),
                background: V.backupWarn.level === 'high' ? 'linear-gradient(100deg,rgba(226,84,98,.16),rgba(49,35,73,.02))' : 'linear-gradient(100deg,rgba(224,177,90,.14),rgba(49,35,73,.02))',
                border: '1px solid ' + (V.backupWarn.level === 'high' ? 'rgba(226,84,98,.42)' : 'rgba(224,177,90,.4)'),
                color: V.backupWarn.level === 'high' ? '#FFC2C9' : '#F0C98A' }}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={V.backupWarn.level === 'high' ? '#E25462' : '#E0B15A'} strokeWidth="1.8" style={{ flex: 'none' }}><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={css('flex:1;min-width:0;line-height:1.5')}>{V.backupWarn.msg}</span>
                <span onClick={V.doBackupLight} className="rtm-press" style={css('flex:none;font-size:12px;font-weight:700;padding:7px 14px;border-radius:9px;cursor:pointer;color:#FFFFFF;background:linear-gradient(180deg,#7658E8,#6747D8)')}>สำรองเลย</span>
                <span onClick={V.doBackup} className="hv-op" style={css('flex:none;font-size:11.5px;cursor:pointer;color:#746E7D;white-space:nowrap')}>รวมรูป</span>
                <span onClick={V.snoozeBackup} className="hv-op" style={css('flex:none;font-size:11.5px;cursor:pointer;color:#928B9B;white-space:nowrap')}>ไว้ก่อน</span>
              </div>
            )}
            {V.isAccount && this.renderAccount(V)}
            {V.isDash && this.renderPremiumDashboard(V)}
            {V.isCal && this.renderCalendar(V)}
            {V.isLog && this.renderTradeLog(V)}
            {V.isAna && this.renderAnalytics(V)}
            {V.isSet && this.renderSetups(V)}
            {V.isPlay && this.renderPlaybook(V)}
          </div>
        </div>

        {V.showDay && this.renderDayModal(V)}
        {V.showTrade && this.renderTradeModal(V)}
        {V.fieldCfgOpen && this.renderFieldCfgModal(V)}
        {V.showSetup && this.renderSetupModal(V)}
        {V.showReset && this.renderResetModal(V)}
        {V.showPlan && this.renderPlanModal(V)}
        {V.txnModal && this.renderTxnModal(V)}
      </div>
    );
  }
}

export default App;
