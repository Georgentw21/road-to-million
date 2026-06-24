import React from 'react';
import { ImageSlot } from './ImageSlot.jsx';
import { loadJournal, saveJournal, getImageUrl } from './dataStore.js';
import { exportWeeklyWord } from './wordExport.js';
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

class App extends React.Component {
  state = {
    images: {},
    view: 'dashboard',
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
    preItems: [
      { id: 'p1', text: 'เช็กข่าว high-impact ของวันนี้' },
      { id: 'p2', text: 'มาร์ก key levels บน H4 และ Daily' },
      { id: 'p3', text: 'ระบุ bias ของวัน + setup ที่จะรอ' },
      { id: 'p4', text: 'ตั้งความเสี่ยงต่อไม้ ≤ 1% ของพอร์ต' },
      { id: 'p5', text: 'เช็กสภาพจิตใจ — พร้อมและสงบไหม' },
      { id: 'p6', text: 'ไม่มีออเดอร์ค้างที่ขัดกับแผน' },
    ],
    editCheck: null,
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
    // setups
    setups: [
      { id: 's1', name: 'Rally', glyph: 'R', accent: '#5FC08D', desc: 'เทรนด์ขาขึ้นต่อเนื่อง เข้าที่ pullback', pnl: 18420, wr: 67, trades: 42, avgR: 1.4, usage: 'ใช้เมื่อเทรนด์ HTF เป็นขาขึ้นชัดเจน (HH/HL)\n• รอราคา pullback มาที่โซน demand หรือ EMA20\n• เข้าเมื่อมีสัญญาณยืนยัน price action (bullish engulfing / pin bar)\n• SL ใต้ swing low ล่าสุด\n• TP ที่ R ≥ 2 หรือแนวต้านถัดไป' },
      { id: 's2', name: 'Impulse', glyph: 'I', accent: '#7BA7D9', desc: 'โมเมนตัมแรงหลังข่าว/เบรก', pnl: 12100, wr: 61, trades: 31, avgR: 1.1, usage: 'ใช้จับโมเมนตัมแรงหลังเบรก structure สำคัญ\n• volume / range ต้องขยายชัดเจน\n• เข้าไม้เล็กก่อน เพิ่มเมื่อถูกทาง\n• ไม่ไล่ราคา — รอ retest จุดเบรก\n• SL ใต้แท่งเบรก · TP ตาม measured move' },
      { id: 's3', name: 'Wyckoff', glyph: 'W', accent: '#9B8CFF', desc: 'สะสม/กระจาย แล้ว spring', pnl: 8940, wr: 58, trades: 24, avgR: 0.9, usage: 'ใช้กับโครงสร้าง accumulation / distribution\n• ระบุ phase ให้ชัดก่อน\n• รอ spring (กดต่ำกว่าฐาน) หรือ upthrust\n• ยืนยันด้วย sign of strength\n• เป้าหมายตาม count ของ trading range' },
      { id: 's4', name: 'Reversal', glyph: 'V', accent: '#DC6A63', desc: 'กลับตัวที่แนวรับ-ต้านสำคัญ', pnl: -2180, wr: 40, trades: 20, avgR: -0.3, usage: 'ใช้เฉพาะแนวรับ-ต้านสำคัญเท่านั้น\n• ต้องมี divergence หรือสัญญาณ exhaustion\n• ความเสี่ยงครึ่งหนึ่งของไม้ปกติ\n• win rate ต่ำ — เลือกจุดให้ดีที่สุด\n• ออกเร็วถ้าไม่เป็นไปตามแผน' },
    ],
    // portfolios
    portfolios: [{ id: 'pf1', name: 'พอร์ตหลัก', startBalance: 100000 }],
    currentPortfolioId: 'all',
    newPortName: '',
    showPortMenu: false,
    showUserMenu: false,
    // live prices
    livePrices: null,
    // trades
    trades: [],
    // ui
    logFilter: 'all',
    logSearch: '', logSort: 'date-desc',
    calYear: new Date().getFullYear(), calMonth: new Date().getMonth(),
    eqRange: 'ALL',
    // เตือนวางแผนล่วงหน้า (ก่อนขึ้นสัปดาห์/เดือนใหม่)
    planReminders: true,
    dismissedReminders: {},
    showPlan: false, planScope: 'weekly', planKey: '', planLabel: '',
    showDay: false, dayDate: null,
    showTrade: false, draft: null, draftIsNew: false,
    showSetup: false, sDraft: null, setupIsNew: false,
    showReset: false,
    exporting: false,
  };

  // เก็บค่าเริ่มต้น (factory defaults) ไว้ก่อนโหลดข้อมูลคลาวด์ — ใช้ตอน Reset journal
  _pristine = (() => {
    const s = this.state;
    const clone = (x) => JSON.parse(JSON.stringify(x));
    return {
      accountName: s.accountName, affirmation: s.affirmation, affirmDetails: clone(s.affirmDetails),
      weeklyItems: clone(s.weeklyItems), monthlyItems: clone(s.monthlyItems), preItems: clone(s.preItems),
      checks: clone(s.checks), visionItems: clone(s.visionItems), setups: clone(s.setups),
      portfolios: clone(s.portfolios), currentPortfolioId: 'all',
      goal: s.goal, tags: clone(s.tags), trades: [], images: {},
      planReminders: s.planReminders, dismissedReminders: {},
    };
  })();

  componentDidMount() {
    this._tick();
    this._clock = setInterval(() => this._tick(), 1000);
    this._loadFromCloud();
    this._fetchPrices();
    this._priceTimer = setInterval(() => this._fetchPrices(), 30000);
    this._onKey = (e) => {
      if (e.key === 'Escape') { this.setState({ showTrade: false, showSetup: false, showDay: false, showReset: false, showPlan: false, showPortMenu: false, showUserMenu: false }); return; }
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
      if ((e.key === 'n' || e.key === 'N') && !this.state.showTrade && !this.state.showSetup && !this.state.showDay && !this.state.showReset) { e.preventDefault(); this.openNew(); }
    };
    this._onDocDown = () => { if (this.state.showPortMenu || this.state.showUserMenu) this.setState({ showPortMenu: false, showUserMenu: false }); };
    window.addEventListener('keydown', this._onKey);
    document.addEventListener('mousedown', this._onDocDown);
  }
  async _fetchPrices() {
    try {
      const r = await fetch('/api/prices');
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.data && j.data.length) this.setState({ livePrices: j.data });
    } catch (e) { /* fallback ใช้ราคา default */ }
  }
  async _loadFromCloud() {
    let data = null;
    try { data = await loadJournal(); } catch (e) { console.error(e); }
    if (data && Object.keys(data).length) {
      this.setState({ ...data, images: data.images || {} }, () => { this._loaded = true; this._checkPlanReminder(); });
    } else {
      this.setState({ trades: this._seedTrades() }, () => { this._loaded = true; this._persist(); this._checkPlanReminder(); });
    }
  }
  componentWillUnmount() { clearInterval(this._clock); clearInterval(this._priceTimer); clearTimeout(this._saveTimer); window.removeEventListener('keydown', this._onKey); document.removeEventListener('mousedown', this._onDocDown); }

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
  // สถานะ session ของแต่ละตลาด (คำนวณจากเวลาจริง รองรับ DST ผ่าน timeZone)
  _sessions() {
    const hourIn = (tz) => {
      try { return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date()).find(p => p.type === 'hour').value, 10); }
      catch (e) { return -1; }
    };
    const dayIn = (tz) => {
      try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date()); }
      catch (e) { return ''; }
    };
    const weekday = (tz) => { const d = dayIn(tz); return d !== 'Sat' && d !== 'Sun'; };
    const mk = (label, tz, open, close) => {
      const h = hourIn(tz);
      const active = weekday(tz) && h >= open && h < close;
      return { label, active };
    };
    return [
      mk('London', 'Europe/London', 8, 16),
      mk('New York', 'America/New_York', 8, 17),
      mk('Tokyo', 'Asia/Tokyo', 9, 15),
    ];
  }

  _blob() {
    const s = this.state;
    return {
      accountName: s.accountName, affirmation: s.affirmation, affirmDetails: s.affirmDetails,
      weeklyItems: s.weeklyItems, monthlyItems: s.monthlyItems, preItems: s.preItems,
      checks: s.checks, visionItems: s.visionItems, setups: s.setups, trades: s.trades,
      images: s.images, portfolios: s.portfolios, currentPortfolioId: s.currentPortfolioId,
      goal: s.goal, tags: s.tags,
      planReminders: s.planReminders, dismissedReminders: s.dismissedReminders,
    };
  }
  _persist() {
    if (!this._loaded) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => { saveJournal(this._blob()); }, 500);
  }
  _save() { this._persist(); }
  setImage(slotId, path) {
    const images = { ...this.state.images, [slotId]: path };
    this.setState({ images }); this._save();
  }

  // ===== portfolios =====
  selectPortfolio(id) { this.setState({ currentPortfolioId: id, showPortMenu: false }); }
  openAccount() { this.setState({ showPortMenu: false, showUserMenu: false, view: 'account' }); }
  // ===== reset journal =====
  openReset() { this.setState({ showReset: true, showUserMenu: false }); }
  closeReset() { this.setState({ showReset: false }); }
  resetJournal() {
    const d = JSON.parse(JSON.stringify(this._pristine));
    this.setState({ ...d, showReset: false, showUserMenu: false, view: 'dashboard' }, () => { this._loaded = true; this._persist(); });
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
    const portfolios = this.state.portfolios.map(p => p.id === id ? { ...p, name } : p);
    this.setState({ portfolios }); this._save();
  }
  delPortfolio(id, e) {
    if (e) e.stopPropagation();
    if (this.state.portfolios.length <= 1) { window.alert('ต้องมีอย่างน้อย 1 พอร์ต'); return; }
    if (!window.confirm('ลบพอร์ตนี้? (ออเดอร์ในพอร์ตจะยังอยู่ แต่จะไม่ถูกจัดกลุ่ม)')) return;
    const portfolios = this.state.portfolios.filter(p => p.id !== id);
    const cur = this.state.currentPortfolioId === id ? 'all' : this.state.currentPortfolioId;
    this.setState({ portfolios, currentPortfolioId: cur }); this._save();
  }
  _portfolioName(id) { const p = this.state.portfolios.find(x => x.id === id); return p ? p.name : '—'; }

  // ===== Word export =====
  async exportWord() {
    const cp = this.state.currentPortfolioId;
    const imgs = this.state.images || {};
    const rows = this.state.trades
      .filter(t => cp === 'all' || t.portfolioId === cp || (!t.portfolioId && cp === (this.state.portfolios[0] && this.state.portfolios[0].id)))
      .map(t => {
        const urls = [];
        for (let n = 0; n < (t.imgCount || 2); n++) { const p = imgs['trade-' + t.id + '-img-' + n]; if (p) urls.push(getImageUrl(p)); }
        return {
          date: t.date, sym: t.sym || '—', side: t.side, setupName: this._setupById(t.setupId).name,
          session: t.session, lot: (t.lot != null && t.lot !== '') ? String(t.lot) : '', portfolioName: this._portfolioName(t.portfolioId),
          pnlNum: t.status === 'OPEN' ? 0 : (t.pnl || 0), rr: t.rr || 0, status: t.status, notes: t.notes || '', images: urls,
        };
      });
    this.setState({ exporting: true });
    try { await exportWeeklyWord(rows, this.state.accountName); }
    catch (e) { window.alert('สร้างไฟล์ Word ไม่สำเร็จ: ' + (e && e.message ? e.message : e)); }
    finally { this.setState({ exporting: false }); }
  }
  exportCSV() {
    const cp = this.state.currentPortfolioId;
    const firstPf = this.state.portfolios[0] && this.state.portfolios[0].id;
    const rows = this.state.trades.filter(t => cp === 'all' || t.portfolioId === cp || (!t.portfolioId && cp === firstPf));
    const headers = ['date', 'symbol', 'side', 'setup', 'session', 'lot', 'entry', 'stop', 'target', 'rr', 'pnl', 'status', 'portfolio', 'tags', 'notes'];
    const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [headers.join(',')];
    rows.forEach(t => {
      lines.push([t.date, t.sym, t.side, this._setupById(t.setupId).name, t.session, t.lot, t.entry, t.stop, t.target, t.rr, (t.status === 'OPEN' ? '' : t.pnl), t.status, this._portfolioName(t.portfolioId), (t.tags || []).join('|'), t.notes].map(esc).join(','));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'trades-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  _seedTrades() {
    const T = (id, date, sym, side, setupId, session, entry, stop, target, rr, pnl, et, xt, notes, status) =>
      ({ id, date, sym, side, setupId, session, entry, stop, target, rr, pnl, lot: '1.0', entryTime: et, exitTime: xt, notes, status, imgCount: 2, portfolioId: 'pf1', tags: pnl > 0 ? ['ตามแผน'] : (pnl < 0 ? ['รีบเข้า'] : []) });
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
    if (this.state.view === key) return base + 'color:#E2C588;background:rgba(201,166,95,.14);box-shadow:inset 2px 0 0 #C9A65F;';
    return base + 'color:#5E5E68;';
  }

  startName() { this.setState({ editName: true }); }
  commitName(e) { const v = e && e.target ? e.target.value : this.state.accountName; this.setState({ editName: false, accountName: v }); this._save('rtm_name', v); }
  onNameKey(e) { if (e.key === 'Enter') e.target.blur(); }
  startAffirm() { this.setState({ editAffirm: true }); }
  commitAffirm(e) { const v = e && e.target ? e.target.value : this.state.affirmation; this.setState({ editAffirm: false, affirmation: v }); this._save('rtm_affirm', v); }
  onAffirmKey(e) { if (e.key === 'Enter') e.target.blur(); }

  // affirmation details
  addAffirmDetail() { const d = this.state.affirmDetails.concat([{ id: 'a' + Date.now(), text: 'ข้อความใหม่' }]); this.setState({ affirmDetails: d, editDetailId: d[d.length - 1].id }); this._save('rtm_affirmDetails', d); }
  editDetail(id) { this.setState({ editDetailId: id }); }
  commitDetail(id, e) { const v = e && e.target ? e.target.value : ''; const d = this.state.affirmDetails.map(x => x.id === id ? { ...x, text: v } : x); this.setState({ affirmDetails: d, editDetailId: null }); this._save('rtm_affirmDetails', d); }
  delDetail(id) { const d = this.state.affirmDetails.filter(x => x.id !== id); this.setState({ affirmDetails: d }); this._save('rtm_affirmDetails', d); }

  // generic checklist item ops
  _listMeta(which) {
    if (which === 'weekly') return { items: 'weeklyItems', store: 'rtm_weekly', idp: 'w' };
    if (which === 'monthly') return { items: 'monthlyItems', store: 'rtm_monthly', idp: 'm' };
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
    const v = e && e.target ? e.target.value : '';
    const m = this._listMeta(which);
    const arr = this.state[m.items].map(x => x.id === id ? { ...x, text: v } : x);
    this.setState({ [m.items]: arr, editCheck: null }); this._save(m.store, arr);
  }
  toggleCheck(scope, periodKey, id) {
    const checks = JSON.parse(JSON.stringify(this.state.checks));
    if (!checks[scope]) checks[scope] = {};
    if (!checks[scope][periodKey]) checks[scope][periodKey] = {};
    checks[scope][periodKey][id] = !checks[scope][periodKey][id];
    this.setState({ checks }); this._save('rtm_checks', checks);
  }

  // vision
  addVision() { const v = this.state.visionItems.concat([{ id: 'v' + Date.now(), title: 'เป้าหมายใหม่' }]); this.setState({ visionItems: v }); this._save('rtm_vision', v); }
  delVision(id) { const v = this.state.visionItems.filter(x => x.id !== id); this.setState({ visionItems: v }); this._save('rtm_vision', v); }
  editVision(id) { this.setState({ editVisionId: id }); }
  commitVision(id, e) { const t = e && e.target ? e.target.value : ''; const v = this.state.visionItems.map(x => x.id === id ? { ...x, title: t } : x); this.setState({ visionItems: v, editVisionId: null }); this._save('rtm_vision', v); }
  // ===== tags =====
  toggleDraftTag(tag) { const d = this.state.draft; if (!d) return; const has = (d.tags || []).includes(tag); const tags = has ? d.tags.filter(x => x !== tag) : [...(d.tags || []), tag]; this.setState({ draft: { ...d, tags } }); }
  addTag(name) { name = (name || '').trim(); if (!name) return; let tags = this.state.tags; if (!tags.includes(name)) tags = tags.concat([name]); const d = this.state.draft; const dtags = d ? ((d.tags || []).includes(name) ? d.tags : [...(d.tags || []), name]) : []; this.setState({ tags, draft: d ? { ...d, tags: dtags } : d }); this._save(); }
  delTagGlobal(name, e) { if (e) e.stopPropagation(); if (!window.confirm('ลบแท็ก "' + name + '" ออกจากรายการ?')) return; const tags = this.state.tags.filter(x => x !== name); this.setState({ tags }); this._save(); }
  startGoal() { this.setState({ editGoal: true }); }
  commitGoal(e) { const n = parseFloat(String(e && e.target ? e.target.value : '').replace(/[^0-9.]/g, '')) || 0; this.setState({ editGoal: false, goal: n > 0 ? n : 1000000 }); this._save(); }
  onGoalKey(e) { if (e.key === 'Enter') e.target.blur(); }

  // ===== trades =====
  _setupById(id) { return this.state.setups.find(s => s.id === id) || { name: '—', accent: '#9A9AA4', glyph: '?' }; }
  openTrade(id) { const t = this.state.trades.find(x => x.id === id); if (t) this.setState({ draft: { ...t }, draftIsNew: false, showTrade: true, showDay: false }); }
  openNew(dateISO) {
    const today = '2026-06-22';
    const d = (typeof dateISO === 'string') ? dateISO : today;
    const cp = this.state.currentPortfolioId;
    const pf = (cp && cp !== 'all') ? cp : (this.state.portfolios[0] ? this.state.portfolios[0].id : 'pf1');
    this.setState({
      draft: { id: 't' + Date.now(), date: d, sym: '', side: 'BUY', setupId: this.state.setups[0] ? this.state.setups[0].id : '', session: 'London', entry: '', stop: '', target: '', rr: '', pnl: '', lot: '', entryTime: d + 'T09:00', exitTime: '', notes: '', status: 'CLOSED', imgCount: 2, portfolioId: pf, tags: [] },
      draftIsNew: true, showTrade: true, showDay: false,
    });
  }
  closeTrade() { this.setState({ showTrade: false }); }
  setD(field, v) {
    const d = { ...this.state.draft, [field]: v };
    if (field === 'entry' || field === 'stop' || field === 'target') {
      const e = parseFloat(d.entry), s = parseFloat(d.stop), t = parseFloat(d.target);
      if (!isNaN(e) && !isNaN(s) && !isNaN(t) && Math.abs(e - s) > 0) d.rr = (Math.abs(t - e) / Math.abs(e - s)).toFixed(2);
    }
    this.setState({ draft: d });
  }
  addImg() { const d = this.state.draft; if (d.imgCount < 6) this.setState({ draft: { ...d, imgCount: d.imgCount + 1 } }); }
  saveTrade() {
    const d = this.state.draft;
    const num = parseFloat(String(d.pnl).replace(/[^0-9.\-]/g, '')) || 0;
    const rrn = parseFloat(String(d.rr).replace(/[^0-9.\-]/g, '')) || 0;
    const clean = { ...d, pnl: d.status === 'OPEN' ? 0 : num, rr: rrn };
    let arr;
    if (this.state.draftIsNew) arr = [clean].concat(this.state.trades);
    else arr = this.state.trades.map(t => t.id === d.id ? clean : t);
    arr.sort((a, b) => b.date.localeCompare(a.date));
    this.setState({ trades: arr, showTrade: false }); this._save('rtm_trades', arr);
  }
  deleteTrade() { if (!window.confirm('ลบออเดอร์นี้?')) return; const arr = this.state.trades.filter(t => t.id !== this.state.draft.id); this.setState({ trades: arr, showTrade: false }); this._save('rtm_trades', arr); }
  duplicateTrade() { const d = this.state.draft; if (!d) return; this.setState({ draft: { ...d, id: 't' + Date.now() }, draftIsNew: true }); }

  calStep(delta) { let m = this.state.calMonth + delta, y = this.state.calYear; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } this.setState({ calYear: y, calMonth: m }); }
  openDay(dateISO) { this.setState({ showDay: true, dayDate: dateISO }); }
  closeDay() { this.setState({ showDay: false }); }

  // ===== setups =====
  openSetup(id) { const s = this.state.setups.find(x => x.id === id); if (s) this.setState({ sDraft: { imgCount: 1, ...s }, setupIsNew: false, showSetup: true }); }
  openNewSetup() {
    this.setState({ sDraft: { id: 's' + Date.now(), name: '', glyph: '★', accent: '#E2C588', desc: '', pnl: 0, wr: 0, trades: 0, avgR: 0, usage: '', imgCount: 1 }, setupIsNew: true, showSetup: true });
  }
  closeSetup() { this.setState({ showSetup: false }); }
  setS(field, v) { this.setState({ sDraft: { ...this.state.sDraft, [field]: v } }); }
  addSetupImg() { const s = this.state.sDraft; const c = s.imgCount || 1; if (c < 6) this.setState({ sDraft: { ...s, imgCount: c + 1 } }); }
  saveSetup() {
    const s = this.state.sDraft;
    const clean = { ...s, glyph: (s.name || '?').trim().charAt(0).toUpperCase() || '★' };
    let arr;
    if (this.state.setupIsNew) arr = this.state.setups.concat([clean]);
    else arr = this.state.setups.map(x => x.id === s.id ? clean : x);
    this.setState({ setups: arr, showSetup: false }); this._save('rtm_setups', arr);
  }
  deleteSetup() { if (!window.confirm('ลบ setup นี้?')) return; const arr = this.state.setups.filter(x => x.id !== this.state.sDraft.id); this.setState({ setups: arr, showSetup: false }); this._save('rtm_setups', arr); }
  deleteSetup2(id) { if (!window.confirm('ลบ setup นี้?')) return; const arr = this.state.setups.filter(x => x.id !== id); this.setState({ setups: arr }); this._save('rtm_setups', arr); }

  _fmtMoney(n) { return (n >= 0 ? '+$' : '−$') + Math.abs(Math.round(n)).toLocaleString('en-US'); }
  _fmtDur(et, xt) {
    if (!et || !xt) return '—';
    const a = new Date(et).getTime(), b = new Date(xt).getTime();
    if (isNaN(a) || isNaN(b) || b < a) return '—';
    let mins = Math.round((b - a) / 60000);
    const d = Math.floor(mins / 1440); mins -= d * 1440;
    const h = Math.floor(mins / 60); mins -= h * 60;
    let parts = [];
    if (d) parts.push(d + ' วัน');
    if (h) parts.push(h + ' ชม.');
    if (mins) parts.push(mins + ' นาที');
    return parts.length ? parts.join(' ') : '0 นาที';
  }
  _segStyle(active) { return 'font-size:12.5px;font-weight:600;padding:7px 18px;border-radius:8px;cursor:pointer;transition:.14s;' + (active ? 'background:linear-gradient(180deg,#E2C588,#C9A65F);color:#1a1408' : 'color:#9A9AA4'); }
  _tint(c) {
    const m = { '#5FC08D': 'rgba(95,192,141,.14)', '#7BA7D9': 'rgba(123,167,217,.14)', '#9B8CFF': 'rgba(155,140,255,.14)', '#DC6A63': 'rgba(220,106,99,.14)', '#E2C588': 'rgba(226,197,136,.14)' };
    return m[c] || 'rgba(201,166,95,.14)';
  }
  _ticker() {
    const live = this.state.livePrices;
    const items = (live && live.length)
      ? live.map(p => [p.label, p.price, p.changePct, p.up])
      : [
        ['XAUUSD', '—', '·', true], ['EURUSD', '—', '·', false], ['GBPJPY', '—', '·', true],
        ['US30', '—', '·', true], ['NAS100', '—', '·', false], ['BTCUSD', '—', '·', true], ['USDJPY', '—', '·', true],
      ];
    return (
      <Fragment>
        {items.map((it, i) => (
          <span key={i} style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#9A9AA4' }}>{it[0]}</span>
            <span style={{ color: '#ECEAE3' }}>{it[1]}</span>
            <span style={{ color: it[3] ? '#5FC08D' : '#DC6A63' }}>{it[2]}</span>
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
  _recentWeeks(n) {
    const out = []; const today = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i * 7);
      const mon = new Date(d); const wd = (mon.getDay() + 6) % 7; mon.setDate(mon.getDate() - wd);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const mname = new Intl.DateTimeFormat('th-TH', { month: 'short' }).format(sun);
      const label = (i === 0 ? 'สัปดาห์นี้ · ' : '') + mon.getDate() + '–' + sun.getDate() + ' ' + mname;
      out.push([this._isoWeekKey(d), label]);
    }
    return out;
  }
  _recentMonths(n) {
    const out = []; const today = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      out.push([key, new Intl.DateTimeFormat('th-TH', { month: 'short', year: 'numeric' }).format(d)]);
    }
    return out;
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
      due.push({ scope: 'monthly', key, label: new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(nf) });
    }
    // weekly: เสาร์ (2 วันก่อน) หรือ อาทิตย์ (1 วันก่อนจันทร์)
    if (dow === 6 || dow === 0) {
      const add = dow === 6 ? 2 : 1;
      const mon = new Date(now); mon.setDate(now.getDate() + add);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const mname = new Intl.DateTimeFormat('th-TH', { month: 'short' }).format(sun);
      due.push({ scope: 'weekly', key: this._isoWeekKey(mon), label: mon.getDate() + '–' + sun.getDate() + ' ' + mname });
    }
    return due;
  }
  _checkPlanReminder() {
    if (!this.state.planReminders) return;
    const dis = this.state.dismissedReminders || {};
    const first = this._dueReminders().find(d => !dis[d.scope + ':' + d.key]);
    if (first) this.setState({ showPlan: true, planScope: first.scope, planKey: first.key, planLabel: first.label });
  }
  closePlan() {
    const k = this.state.planScope + ':' + this.state.planKey;
    const dis = { ...(this.state.dismissedReminders || {}), [k]: true };
    this.setState({ dismissedReminders: dis, showPlan: false }, () => { this._save(); this._checkPlanReminder(); });
  }
  togglePlanReminders() { this.setState({ planReminders: !this.state.planReminders, showUserMenu: false }, () => this._save()); }
  // เปิดแผนล่วงหน้าเองจากหน้า Checklist (สัปดาห์/เดือนถัดไปตามแท็บ)
  openPlanManual() {
    const now = new Date();
    if (this.state.checkTab === 'monthly') {
      const nf = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const key = nf.getFullYear() + '-' + String(nf.getMonth() + 1).padStart(2, '0');
      this.setState({ showPlan: true, planScope: 'monthly', planKey: key, planLabel: new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(nf) });
    } else {
      const dow = now.getDay();
      const add = ((8 - dow) % 7) || 7; // จันทร์ถัดไป
      const mon = new Date(now); mon.setDate(now.getDate() + add);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const mname = new Intl.DateTimeFormat('th-TH', { month: 'short' }).format(sun);
      this.setState({ showPlan: true, planScope: 'weekly', planKey: this._isoWeekKey(mon), planLabel: mon.getDate() + '–' + sun.getDate() + ' ' + mname });
    }
  }
  setPortfolioBalance(id, v) {
    const num = parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0;
    const portfolios = this.state.portfolios.map(p => p.id === id ? { ...p, startBalance: num } : p);
    this.setState({ portfolios }); this._save();
  }

  // ===== คำนวณสถิติทั้งหมดจากเทรดจริง (Dashboard + Analytics) =====
  _stats(trades, setups, portfolios, cpId, firstPf, goal, eqRange) {
    const GREEN = '#5FC08D', RED = '#DC6A63', GOLD = '#E2C588', BLUE = '#7BA7D9', PURPLE = '#9B8CFF';
    const pc = (n) => n >= 0 ? GREEN : RED;
    const fm = (n) => this._fmtMoney(n);
    const closed = trades.filter(t => t.status !== 'OPEN');
    const wins = closed.filter(t => (t.pnl || 0) > 0);
    const losses = closed.filter(t => (t.pnl || 0) < 0);
    const net = closed.reduce((s, t) => s + (t.pnl || 0), 0);
    const grossP = wins.reduce((s, t) => s + t.pnl, 0);
    const grossL = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const winRate = closed.length ? (wins.length / closed.length * 100) : 0;
    const pf = grossL ? (grossP / grossL) : (grossP > 0 ? 99 : 0);
    const avgR = closed.length ? closed.reduce((s, t) => s + (t.rr || 0), 0) / closed.length : 0;
    const relevant = (cpId === 'all') ? portfolios : portfolios.filter(p => p.id === cpId);
    const startBal = relevant.reduce((s, p) => s + (Number(p.startBalance) || 0), 0);
    const equity = startBal + net;

    const chrono = closed.slice().sort((a, b) => (a.date.localeCompare(b.date)) || String(a.entryTime || '').localeCompare(String(b.entryTime || '')));
    const curve = [startBal]; let cum = startBal;
    chrono.forEach(t => { cum += t.pnl || 0; curve.push(cum); });
    let peak = curve[0], maxDD = 0;
    curve.forEach(v => { if (v > peak) peak = v; const dd = peak > 0 ? (peak - v) / peak * 100 : 0; if (dd > maxDD) maxDD = dd; });

    // display curve ตามช่วงเวลา (ALL/3M/1M) — เริ่ม cumulative จาก equity ณ ต้นช่วง
    let cutoff = null;
    if (eqRange === '1M') { const dt = new Date(); dt.setMonth(dt.getMonth() - 1); cutoff = dt.toISOString().slice(0, 10); }
    else if (eqRange === '3M') { const dt = new Date(); dt.setMonth(dt.getMonth() - 3); cutoff = dt.toISOString().slice(0, 10); }
    let dispBase = startBal; const dispTrades = [];
    chrono.forEach(t => { if (cutoff && t.date < cutoff) dispBase += (t.pnl || 0); else dispTrades.push(t); });
    const dcurve = [dispBase]; let dc = dispBase; dispTrades.forEach(t => { dc += t.pnl || 0; dcurve.push(dc); });

    const W = 640, H = 230, pad = 16;
    let minV = Math.min(...dcurve), maxV = Math.max(...dcurve);
    if (minV === maxV) { minV -= 1; maxV += 1; }
    const np = dcurve.length;
    const xAt = (i) => np <= 1 ? 0 : (i / (np - 1)) * W;
    const yAt = (v) => pad + (H - 2 * pad) * (1 - (v - minV) / (maxV - minV));
    let line;
    if (np === 1) line = `M0 ${yAt(dcurve[0]).toFixed(1)} L${W} ${yAt(dcurve[0]).toFixed(1)}`;
    else line = dcurve.map((v, i) => (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ' ' + yAt(v).toFixed(1)).join(' ');
    const area = line + ` L${W} ${H} L0 ${H} Z`;

    const bySetup = setups.map(s => {
      const ts = closed.filter(t => t.setupId === s.id);
      const p = ts.reduce((a, t) => a + (t.pnl || 0), 0);
      const w = ts.filter(t => t.pnl > 0).length;
      return { name: s.name, pnl: p, count: ts.length, wr: ts.length ? Math.round(w / ts.length * 100) : 0 };
    });
    const maxAbs = Math.max(1, ...bySetup.map(s => Math.abs(s.pnl)));
    const setupBars = bySetup.slice().sort((a, b) => b.pnl - a.pnl).map(s => ({
      name: s.name, meta: s.count + 't · ' + s.wr + '% wr', pnl: fm(s.pnl), color: pc(s.pnl), w: (Math.abs(s.pnl) / maxAbs * 100) + '%',
    }));

    const dowFull = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
    const dowSum = [0, 0, 0, 0, 0, 0, 0];
    closed.forEach(t => { dowSum[new Date(t.date + 'T00:00').getDay()] += t.pnl || 0; });
    const dowIdx = [1, 2, 3, 4, 5];
    const dowMax = Math.max(1, ...dowIdx.map(i => Math.abs(dowSum[i])));
    const dowBars = dowIdx.map(i => ({ label: dowFull[i], val: (dowSum[i] >= 0 ? '+$' : '−$') + (Math.abs(dowSum[i]) / 1000).toFixed(1) + 'k', color: pc(dowSum[i]), bg: dowSum[i] >= 0 ? 'linear-gradient(180deg,#5FC08D,rgba(95,192,141,.3))' : 'linear-gradient(180deg,#DC6A63,rgba(220,106,99,.3))', h: (Math.abs(dowSum[i]) / dowMax * 100) + '%' }));

    const sesDefs = [['Tokyo', BLUE, '123,167,217'], ['London', GOLD, '226,197,136'], ['New York', PURPLE, '155,140,255']];
    const sesSum = {}; closed.forEach(t => { sesSum[t.session] = (sesSum[t.session] || 0) + (t.pnl || 0); });
    const sesMax = Math.max(1, ...sesDefs.map(d => Math.abs(sesSum[d[0]] || 0)));
    const sessionBars = sesDefs.map(([l, c, rgb]) => { const v = sesSum[l] || 0; return { label: l, val: (v >= 0 ? '+$' : '−$') + (Math.abs(v) / 1000).toFixed(1) + 'k', color: c, labelColor: c, bg: `linear-gradient(180deg,${c},rgba(${rgb},.2))`, glow: `0 6px 22px -8px rgba(${rgb},.6)`, h: (Math.abs(v) / sesMax * 100) + '%' }; });

    const buckets = [['<-2R', v => v < -2], ['-2R', v => v >= -2 && v < -1.5], ['-1R', v => v >= -1.5 && v < -0.5], ['0R', v => v >= -0.5 && v < 0.5], ['+1R', v => v >= 0.5 && v < 1.5], ['+2R', v => v >= 1.5 && v < 2.5], ['+3R', v => v >= 2.5 && v < 3.5], ['>3R', v => v >= 3.5]];
    const rCounts = buckets.map(([l, f]) => ({ l, n: closed.filter(t => f(t.rr || 0)).length }));
    const rMax = Math.max(1, ...rCounts.map(b => b.n));
    const rDist = rCounts.map(b => ({ label: b.l, bg: (b.l.startsWith('-') || b.l.startsWith('<')) ? 'rgba(220,106,99,.55)' : (b.l === '0R' ? 'rgba(255,255,255,.18)' : 'rgba(95,192,141,.6)'), h: (b.n / rMax * 100) + '%' }));

    const pnls = closed.map(t => t.pnl || 0);
    const best = pnls.length ? Math.max(...pnls) : 0;
    const worst = pnls.length ? Math.min(...pnls) : 0;
    const avgWin = wins.length ? grossP / wins.length : 0;
    const avgLoss = losses.length ? -grossL / losses.length : 0;
    let mw = 0, ml = 0, cw = 0, cl = 0;
    chrono.forEach(t => { if (t.pnl > 0) { cw++; cl = 0; if (cw > mw) mw = cw; } else if (t.pnl < 0) { cl++; cw = 0; if (cl > ml) ml = cl; } });
    const anaStats = [
      { label: 'Best trade', val: fm(best), color: GREEN }, { label: 'Worst trade', val: fm(worst), color: RED },
      { label: 'Avg win', val: fm(avgWin), color: GREEN }, { label: 'Avg loss', val: fm(avgLoss), color: RED },
      { label: 'Max win streak', val: String(mw), color: GOLD }, { label: 'Max loss streak', val: String(ml), color: '#ECEAE3' },
    ];

    // expectancy ($/ไม้) + current streak
    const expectancy = closed.length ? net / closed.length : 0;
    const dayNet = {};
    closed.forEach(t => { dayNet[t.date] = (dayNet[t.date] || 0) + (t.pnl || 0); });
    const tradeDaysN = Object.keys(dayNet).length;
    const greenDaysN = Object.values(dayNet).filter(v => v > 0).length;
    const consistencyStr = (tradeDaysN ? Math.round(greenDaysN / tradeDaysN * 100) : 0) + '%';
    let cs = 0, sign = 0;
    for (let i = chrono.length - 1; i >= 0; i--) { const p = chrono[i].pnl; const s = p > 0 ? 1 : (p < 0 ? -1 : 0); if (s === 0) continue; if (sign === 0) { sign = s; cs = 1; } else if (s === sign) cs++; else break; }
    const curStreakStr = sign === 0 ? '—' : (sign > 0 ? ('ชนะ ' + cs + ' ไม้ติด') : ('แพ้ ' + cs + ' ไม้ติด'));
    const curStreakColor = sign > 0 ? GREEN : (sign < 0 ? RED : '#ECEAE3');

    // drawdown (underwater) chart
    let peak2 = curve[0]; const dd = [];
    curve.forEach(v => { if (v > peak2) peak2 = v; dd.push(peak2 > 0 ? (peak2 - v) / peak2 * 100 : 0); });
    const maxDDv = Math.max(0.0001, ...dd);
    const Wd = 640, Hd = 120;
    const xd = (i) => np <= 1 ? 0 : (i / (np - 1)) * Wd;
    const yd = (d) => (d / maxDDv) * (Hd - 10);
    const ddLine = dd.map((d, i) => (i === 0 ? 'M' : 'L') + xd(i).toFixed(1) + ' ' + yd(d).toFixed(1)).join(' ');
    const ddArea = ddLine + ` L${Wd} 0 L0 0 Z`;

    // by symbol
    const symMap = {};
    closed.forEach(t => { const k = t.sym || '—'; const m = symMap[k] || (symMap[k] = { net: 0, n: 0, w: 0 }); m.net += t.pnl || 0; m.n++; if (t.pnl > 0) m.w++; });
    const symArr = Object.keys(symMap).map(k => ({ name: k, net: symMap[k].net, n: symMap[k].n, wr: symMap[k].n ? Math.round(symMap[k].w / symMap[k].n * 100) : 0 }));
    const symMaxAbs = Math.max(1, ...symArr.map(s => Math.abs(s.net)));
    const symbolBars = symArr.sort((a, b) => b.net - a.net).map(s => ({ name: s.name, meta: s.n + 't · ' + s.wr + '% wr', pnl: fm(s.net), color: pc(s.net), w: (Math.abs(s.net) / symMaxAbs * 100) + '%' }));

    // by tag / อารมณ์
    const tagMap = {};
    closed.forEach(t => (t.tags || []).forEach(tag => { const m = tagMap[tag] || (tagMap[tag] = { net: 0, n: 0, w: 0 }); m.net += t.pnl || 0; m.n++; if (t.pnl > 0) m.w++; }));
    const tagArr = Object.keys(tagMap).map(tag => ({ name: tag, net: tagMap[tag].net, n: tagMap[tag].n, wr: tagMap[tag].n ? Math.round(tagMap[tag].w / tagMap[tag].n * 100) : 0 }));
    const tagMaxAbs = Math.max(1, ...tagArr.map(s => Math.abs(s.net)));
    const tagStats = tagArr.sort((a, b) => a.net - b.net).map(s => ({ name: s.name, meta: s.n + ' ไม้ · ' + s.wr + '% wr', pnl: fm(s.net), color: pc(s.net), w: (Math.abs(s.net) / tagMaxAbs * 100) + '%' }));

    const g = Number(goal) > 0 ? Number(goal) : 1000000;
    const progPct = Math.max(0, Math.min(100, equity / g * 100));
    return {
      expectancyStr: fm(expectancy), curStreakStr, curStreakColor,
      consistencyStr, tradeDaysN, greenDaysN,
      ddLine, ddArea, symbolBars, tagStats,
      maxWinStreak: String(mw), maxLossStreak: String(ml),
      kEquity: '$' + Math.round(equity).toLocaleString('en-US'),
      kNet: fm(net), kNetColor: pc(net), kWin: winRate.toFixed(1) + '%',
      kPf: grossL ? pf.toFixed(2) : (grossP > 0 ? '∞' : '0.00'),
      kR: (avgR >= 0 ? '+' : '−') + Math.abs(avgR).toFixed(2) + 'R',
      kDD: maxDD.toFixed(1) + '%',
      donut: `conic-gradient(#5FC08D 0% ${winRate}%, rgba(255,255,255,.07) ${winRate}%)`,
      totalClosed: closed.length, winsN: wins.length, lossesN: losses.length,
      startBalStr: '$' + Math.round(startBal).toLocaleString('en-US'),
      setupBars, equityLine: line, equityArea: area, equityLastY: yAt(dcurve[np - 1]).toFixed(1),
      dowBars, sessionBars, rDist, anaStats,
      milestoneEquity: '$' + Math.round(equity).toLocaleString('en-US'),
      milestonePct: progPct.toFixed(1) + '%', milestoneWidth: progPct.toFixed(1) + '%',
      goalStr: '$' + Math.round(g).toLocaleString('en-US'), goalNum: g,
    };
  }

  renderVals() {
    const GREEN = '#5FC08D', RED = '#DC6A63', BLUE = '#7BA7D9', GOLD = '#E2C588', PURPLE = '#9B8CFF';
    const pc = (n) => n >= 0 ? GREEN : RED;
    const st = this.state;
    const setups = st.setups;
    const cpId = st.currentPortfolioId;
    const firstPf = st.portfolios[0] ? st.portfolios[0].id : null;
    const trades = (cpId === 'all')
      ? st.trades
      : st.trades.filter(t => t.portfolioId === cpId || (!t.portfolioId && cpId === firstPf));

    // ---- per-portfolio stats (Account page) ----
    const portfolioStats = st.portfolios.map(p => {
      const ts = st.trades.filter(t => t.portfolioId === p.id || (!t.portfolioId && p.id === firstPf));
      let net = 0, wins = 0, closed = 0, rrSum = 0, rrN = 0;
      ts.forEach(t => { if (t.status !== 'OPEN') { net += (t.pnl || 0); closed++; if ((t.pnl || 0) > 0) wins++; rrSum += (t.rr || 0); rrN++; } });
      return {
        id: p.id, name: p.name, trades: ts.length,
        netStr: this._fmtMoney(net), netColor: pc(net),
        wr: closed ? Math.round(wins / closed * 100) : 0,
        avgRStr: ((rrN ? rrSum / rrN : 0) >= 0 ? '+' : '−') + Math.abs(rrN ? rrSum / rrN : 0).toFixed(2) + 'R',
        avgRColor: (rrN ? rrSum / rrN : 0) >= 0 ? GREEN : RED,
        startBalance: Number(p.startBalance) || 0,
        equityStr: '$' + Math.round((Number(p.startBalance) || 0) + net).toLocaleString('en-US'),
        setBalance: (e) => this.setPortfolioBalance(p.id, e.target.value),
        isCurrent: cpId === p.id,
        select: () => this.selectPortfolio(p.id),
        del: (e) => this.delPortfolio(p.id, e),
        rename: (e) => this.renamePortfolio(p.id, e.target.value),
      };
    });

    // ---- stats computed from real trades ----
    const S = this._stats(trades, setups, st.portfolios, cpId, firstPf, st.goal, st.eqRange);
    const setupBars = S.setupBars;

    // ---- trade row mapper ----
    const sessColor = (s) => s === 'Tokyo' ? BLUE : (s === 'London' ? GOLD : PURPLE);
    const mapTrade = (t) => {
      const su = this._setupById(t.setupId);
      const dd = new Date(t.date + 'T00:00');
      const dShort = dd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      return {
        id: t.id, sym: t.sym || '—', side: t.side, setupName: su.name, accent: su.accent,
        session: t.session, dateShort: dShort,
        sideColor: t.side === 'BUY' ? GREEN : RED,
        sessionColor: sessColor(t.session),
        pnlStr: t.status === 'OPEN' ? '—' : this._fmtMoney(t.pnl),
        pnlColor: t.status === 'OPEN' ? '#9A9AA4' : pc(t.pnl),
        rStr: t.status === 'OPEN' ? '—' : ((t.rr >= 0 ? '+' : '−') + Math.abs(t.rr).toFixed(1) + 'R'),
        status: t.status, statusColor: t.status === 'OPEN' ? GOLD : '#5E5E68',
        statusBg: t.status === 'OPEN' ? 'rgba(201,166,95,.14)' : 'rgba(255,255,255,.05)',
        holding: this._fmtDur(t.entryTime, t.exitTime),
        lotStr: (t.lot != null && t.lot !== '') ? String(t.lot) : '—',
        notes: t.notes || '', pnlNum: t.pnl || 0, dateRaw: t.date,
        open: () => this.openTrade(t.id),
      };
    };
    const sortedTrades = trades.slice().sort((a, b) => b.date.localeCompare(a.date));
    const allMapped = sortedTrades.map(mapTrade);
    const recent = allMapped.slice(0, 6);

    // log filter
    const lf = st.logFilter;
    const q = (st.logSearch || '').trim().toLowerCase();
    let filteredTrades = allMapped.filter(t => {
      if (lf === 'win') { if (!(t.status !== 'OPEN' && !t.pnlColor.includes('220'))) return false; }
      else if (lf === 'loss') { if (!(t.status !== 'OPEN' && t.pnlColor === RED)) return false; }
      else if (lf === 'open') { if (t.status !== 'OPEN') return false; }
      else if (lf === 'long') { if (t.side !== 'BUY') return false; }
      else if (lf === 'short') { if (t.side !== 'SELL') return false; }
      if (q && !((t.sym + ' ' + t.setupName + ' ' + t.notes).toLowerCase().includes(q))) return false;
      return true;
    });
    const so = st.logSort;
    if (so === 'date-asc') filteredTrades.sort((a, b) => a.dateRaw.localeCompare(b.dateRaw));
    else if (so === 'pnl-desc') filteredTrades.sort((a, b) => b.pnlNum - a.pnlNum);
    else if (so === 'pnl-asc') filteredTrades.sort((a, b) => a.pnlNum - b.pnlNum);
    // date-desc = ค่าเริ่มต้น (เรียงอยู่แล้ว)
    const filterDefs = [['all', 'ทั้งหมด'], ['win', 'Win'], ['loss', 'Loss'], ['open', 'Open'], ['long', 'Long'], ['short', 'Short']];
    const logFilters = filterDefs.map(([k, label]) => ({
      label, click: () => this.setState({ logFilter: k }),
      fg: lf === k ? '#1a1408' : '#9A9AA4',
      bg: lf === k ? 'linear-gradient(180deg,#E2C588,#C9A65F)' : 'rgba(255,255,255,.03)',
      border: lf === k ? 'none' : '1px solid rgba(255,255,255,.1)',
    }));

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
    const firstDow = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const _now = new Date();
    const isCurMonth = _now.getFullYear() === calYear && _now.getMonth() === calMonth;
    const today = isCurMonth ? _now.getDate() : -1;
    const calMonthLabel = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(calYear, calMonth, 1));
    const calMonthShort = new Intl.DateTimeFormat('th-TH', { month: 'long' }).format(new Date(calYear, calMonth, 1));
    const calDays = [];
    for (let i = 0; i < firstDow; i++) calDays.push({ day: '', pnl: '', trades: '', dot: '', bg: 'transparent', border: 'none', dayColor: 'transparent', fg: 'transparent', dotColor: 'transparent', cursor: 'default', click: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const has = !!dayTradesMap[d];
      const isToday = d === today;
      if (!has) {
        calDays.push({ day: String(d), pnl: '', trades: '', dot: '', bg: 'rgba(255,255,255,.02)', border: isToday ? '1.5px solid rgba(201,166,95,.5)' : '1px solid rgba(255,255,255,.05)', dayColor: '#5E5E68', fg: 'transparent', dotColor: 'transparent', cursor: 'default', click: null });
      } else {
        const v = dayPnl[d]; const tn = dayTradesMap[d].length;
        const intensity = Math.min(1, Math.abs(v) / 2200);
        const bg = v >= 0 ? `rgba(95,192,141,${0.08 + intensity * 0.18})` : `rgba(220,106,99,${0.08 + intensity * 0.18})`;
        const hasOpen = dayTradesMap[d].some(x => x.status === 'OPEN');
        calDays.push({
          day: String(d), pnl: v === 0 ? '—' : this._fmtMoney(v), trades: tn + ' ออเดอร์',
          dot: hasOpen ? '●' : '', dotColor: GOLD,
          bg, border: isToday ? '1.5px solid #E2C588' : '1px solid rgba(255,255,255,.07)',
          dayColor: isToday ? '#E2C588' : '#ECEAE3', fg: pc(v),
          cursor: 'pointer',
          click: () => this.openDay(monthPrefix + '-' + String(d).padStart(2, '0')),
        });
      }
    }
    let monthTotal = 0; Object.values(dayPnl).forEach(v => monthTotal += v);

    // weekly summary
    const wkRange = (a, b) => { let s = 0, td = 0; for (let d = a; d <= b; d++) { if (dayTradesMap[d]) { td += dayTradesMap[d].length; s += (dayPnl[d] || 0); } } return { s, td }; };
    const wkDefs = [[1, 7, 'สัปดาห์ 1 · 1–7'], [8, 14, 'สัปดาห์ 2 · 8–14'], [15, 21, 'สัปดาห์ 3 · 15–21'], [22, 31, 'สัปดาห์ 4 · 22–สิ้นเดือน']];
    const weeks = wkDefs.map(([a, b, label]) => { const r = wkRange(a, b); return { label, pnl: r.td ? this._fmtMoney(r.s) : '—', color: r.s >= 0 ? GREEN : RED, meta: r.td ? (r.td + ' ออเดอร์') : 'ไม่มีการเทรด' }; });

    // ---- mini heatmap ----
    const heat = [];
    for (let i = 0; i < firstDow; i++) heat.push({ label: '', bg: 'transparent', fg: 'transparent', border: 'none', title: '' });
    for (let d = 1; d <= daysInMonth; d++) {
      const has = !!dayTradesMap[d]; const isToday = d === today;
      if (!has) { heat.push({ label: String(d), bg: 'rgba(255,255,255,.03)', fg: '#3a3a42', border: isToday ? '1.5px solid rgba(201,166,95,.5)' : 'none', title: '' }); }
      else { const v = dayPnl[d]; const intensity = Math.min(1, Math.abs(v) / 2200); const bg = v >= 0 ? `rgba(95,192,141,${0.25 + intensity * 0.5})` : `rgba(220,106,99,${0.25 + intensity * 0.45})`; heat.push({ label: String(d), bg, fg: '#0c0c10', border: isToday ? '1.5px solid #E2C588' : 'none', title: d + ' ' + calMonthShort + ' · ' + this._fmtMoney(v) }); }
    }

    // ---- analytics (จากเทรดจริง) ----
    const dowBars = S.dowBars, sessionBars = S.sessionBars, rDist = S.rDist, anaStats = S.anaStats;

    // ---- setup cards (จากเทรดจริง) ----
    const setupCards = setups.map(s => {
      const ts = trades.filter(t => t.setupId === s.id && t.status !== 'OPEN');
      const p = ts.reduce((a, t) => a + (t.pnl || 0), 0);
      const w = ts.filter(t => t.pnl > 0).length;
      const wr = ts.length ? Math.round(w / ts.length * 100) : 0;
      const avgR = ts.length ? ts.reduce((a, t) => a + (t.rr || 0), 0) / ts.length : 0;
      return {
        id: s.id, name: s.name || '(ไม่มีชื่อ)', glyph: s.glyph, accent: s.accent, iconBg: this._tint(s.accent), desc: s.desc || '—',
        wrStr: wr + '%', tradesStr: String(ts.length), avgRStr: (avgR >= 0 ? '+' : '−') + Math.abs(avgR).toFixed(1) + 'R', rColor: avgR >= 0 ? GREEN : RED,
        pnlStr: this._fmtMoney(p), pnlColor: pc(p), wrW: wr + '%',
        open: () => this.openSetup(s.id), del: (e) => { e.stopPropagation(); this.deleteSetup2(s.id); },
      };
    });

    // ---- checklist ----
    const tab = st.checkTab;
    const isWeekly = tab === 'weekly';
    const which = isWeekly ? 'weekly' : 'monthly';
    const items = isWeekly ? st.weeklyItems : st.monthlyItems;
    const scope = isWeekly ? 'weekly' : 'monthly';
    const weekDefs = this._recentWeeks(4);
    const monthDefs = this._recentMonths(3);
    const defs = isWeekly ? weekDefs : monthDefs;
    const curKey = defs[0][0];
    const inList = (k) => defs.some(d => d[0] === k);
    const periodKey = isWeekly
      ? (inList(st.weekKey) ? st.weekKey : curKey)
      : (inList(st.monthKey) ? st.monthKey : curKey);
    const periodCheck = (pk) => { const c = (st.checks[scope] && st.checks[scope][pk]) || {}; let done = 0; items.forEach(it => { if (c[it.id]) done++; }); return { done, total: items.length }; };
    const periods = defs.map(([key, label]) => {
      const r = periodCheck(key); const full = r.total > 0 && r.done === r.total; const sel = key === periodKey;
      return {
        label, click: () => this.setState(isWeekly ? { weekKey: key } : { monthKey: key }),
        bg: sel ? 'rgba(201,166,95,.14)' : 'rgba(255,255,255,.03)',
        border: sel ? '1px solid rgba(201,166,95,.45)' : '1px solid rgba(255,255,255,.07)',
        labelColor: sel ? '#E2C588' : '#ECEAE3',
        dot: full ? GREEN : (r.done > 0 ? GOLD : '#5E5E68'),
        status: full ? 'ครบ ✓' : (r.done + '/' + r.total),
      };
    });
    const curChecks = (st.checks[scope] && st.checks[scope][periodKey]) || {};
    const checkItems = items.map((it, i) => {
      const done = !!curChecks[it.id]; const editing = st.editCheck === (which + ':' + it.id);
      return {
        text: it.text, border: i === 0 ? 'none' : '1px solid rgba(255,255,255,.05)',
        boxBorder: done ? '1.5px solid #C9A65F' : '1.5px solid rgba(255,255,255,.18)',
        boxBg: done ? 'linear-gradient(150deg,#E2C588,#C9A65F)' : 'transparent', checkOp: done ? 1 : 0,
        textColor: done ? '#5E5E68' : '#ECEAE3', strike: done ? 'line-through' : 'none',
        toggle: () => this.toggleCheck(scope, periodKey, it.id),
        editing, notEditing: !editing,
        edit: () => this.editItem(which, it.id), commit: (e) => this.commitItem(which, it.id, e), key: (e) => { if (e.key === 'Enter') e.target.blur(); },
        del: () => this.delItem(which, it.id),
      };
    });
    let cdone = 0; items.forEach(it => { if (curChecks[it.id]) cdone++; });
    const readyPct = items.length ? Math.round(cdone / items.length * 100) : 0;
    const checkPeriodLabel = (defs.find(d => d[0] === periodKey) || ['', ''])[1];

    // pre-trade
    const preChecks = (st.checks.pre && st.checks.pre.today) || {};
    const preItems = st.preItems.map((it, i) => {
      const done = !!preChecks[it.id]; const editing = st.editCheck === ('pre:' + it.id);
      return {
        text: it.text, border: i === 0 ? 'none' : '1px solid rgba(255,255,255,.05)',
        boxBorder: done ? '1.5px solid #C9A65F' : '1.5px solid rgba(255,255,255,.18)',
        boxBg: done ? 'linear-gradient(150deg,#E2C588,#C9A65F)' : 'transparent', checkOp: done ? 1 : 0,
        textColor: done ? '#5E5E68' : '#ECEAE3', strike: done ? 'line-through' : 'none',
        toggle: () => this.toggleCheck('pre', 'today', it.id),
        editing, notEditing: !editing,
        edit: () => this.editItem('pre', it.id), commit: (e) => this.commitItem('pre', it.id, e), key: (e) => { if (e.key === 'Enter') e.target.blur(); },
        del: () => this.delItem('pre', it.id),
      };
    });
    let pdone = 0; st.preItems.forEach(it => { if (preChecks[it.id]) pdone++; });
    const prePct = st.preItems.length ? Math.round(pdone / st.preItems.length * 100) : 0;
    const ringStroke = (p) => p === 100 ? GREEN : (p >= 50 ? GOLD : RED);
    const ringMsg = (p) => p === 100 ? 'พร้อมเต็มร้อย — ลุยอย่างมีวินัย' : (p >= 50 ? 'เกือบพร้อมแล้ว ทำให้ครบก่อน' : 'ยังไม่พร้อม — อย่าเพิ่งเริ่ม');

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

    // ---- day modal ----
    let dayObj = {};
    if (st.dayDate) {
      const dnum = parseInt(st.dayDate.slice(8, 10), 10);
      const list = (dayTradesMap[dnum] || []).map(mapTrade);
      const dd = new Date(st.dayDate + 'T00:00');
      const total = dayPnl[dnum] || 0;
      dayObj = {
        dayTitle: dd.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' }),
        dayTrades: list, dayCount: list.length,
        dayPnlStr: this._fmtMoney(total), dayPnlColor: pc(total),
      };
    }

    // ---- trade modal draft ----
    const d = st.draft;
    let tradeVals = {};
    if (d) {
      const imgs = []; for (let i = 0; i < (d.imgCount || 2); i++) imgs.push({ tid: d.id, n: i });
      tradeVals = {
        tradeModalTag: st.draftIsNew ? 'New entry' : 'Edit · แก้ไขออเดอร์',
        tradeModalTitle: st.draftIsNew ? 'บันทึกการเทรด' : ((d.sym || 'ออเดอร์') + ' · ' + d.date),
        dSym: d.sym, dSetup: d.setupId, dSession: d.session, dEntry: d.entry, dStop: d.stop, dTarget: d.target,
        dRR: String(d.rr), dPnl: String(d.pnl), dLot: d.lot != null ? String(d.lot) : '', dStatus: d.status, dEntryTime: d.entryTime, dExitTime: d.exitTime, dNotes: d.notes,
        setSym: (e) => this.setD('sym', e.target.value), setSetup: (e) => this.setD('setupId', e.target.value),
        setSession: (e) => this.setD('session', e.target.value), setEntry: (e) => this.setD('entry', e.target.value),
        setStop: (e) => this.setD('stop', e.target.value), setTarget: (e) => this.setD('target', e.target.value),
        setRR: (e) => this.setD('rr', e.target.value), setPnl: (e) => this.setD('pnl', e.target.value),
        setLot: (e) => this.setD('lot', e.target.value),
        dTags: d.tags || [], tagList: st.tags,
        toggleTag: (tag) => this.toggleDraftTag(tag), delTag: (tag, e) => this.delTagGlobal(tag, e),
        addTagKey: (e) => { if (e.key === 'Enter') { this.addTag(e.target.value); e.target.value = ''; } },
        setStatus: (e) => this.setD('status', e.target.value), setEntryTime: (e) => this.setD('entryTime', e.target.value),
        setExitTime: (e) => this.setD('exitTime', e.target.value), setNotes: (e) => this.setD('notes', e.target.value),
        setBuy: () => this.setD('side', 'BUY'), setSell: () => this.setD('side', 'SELL'),
        buyStyle: 'flex:1;text-align:center;padding:11px;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;transition:.14s;' + (d.side === 'BUY' ? 'background:rgba(95,192,141,.14);border:1px solid rgba(95,192,141,.45);color:#5FC08D' : 'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);color:#9A9AA4'),
        sellStyle: 'flex:1;text-align:center;padding:11px;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;transition:.14s;' + (d.side === 'SELL' ? 'background:rgba(220,106,99,.14);border:1px solid rgba(220,106,99,.45);color:#DC6A63' : 'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);color:#9A9AA4'),
        holdingDur: this._fmtDur(d.entryTime, d.exitTime),
        setupOptions: setups.map(s => ({ id: s.id, name: s.name || '(setup)' })),
        dPortfolio: d.portfolioId || (st.portfolios[0] ? st.portfolios[0].id : ''),
        setPortfolio: (e) => this.setD('portfolioId', e.target.value),
        portfolioOptions: st.portfolios.map(p => ({ id: p.id, name: p.name })),
        tradeImgs: imgs,
        canDelete: !st.draftIsNew,
        pnlBorder: (parseFloat(d.pnl) < 0) ? 'rgba(220,106,99,.4)' : 'rgba(255,255,255,.12)',
        pnlInputColor: (parseFloat(d.pnl) < 0) ? '#DC6A63' : (parseFloat(d.pnl) > 0 ? '#5FC08D' : '#ECEAE3'),
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
        setupModalTag: st.setupIsNew ? 'New setup' : 'Setup detail',
        setupModalTitle: st.setupIsNew ? 'สร้าง Setup ใหม่' : (sd.name || 'Setup'),
        sId: sd.id, sName: sd.name, sDesc: sd.desc, sUsage: sd.usage,
        setSName: (e) => this.setS('name', e.target.value), setSDesc: (e) => this.setS('desc', e.target.value), setSUsage: (e) => this.setS('usage', e.target.value),
        accentChoices: choices.map(c => ({ color: c, pick: () => this.setS('accent', c), border: sd.accent === c ? '2px solid #fff' : '2px solid transparent' })),
        canDeleteSetup: !st.setupIsNew,
        setupStats: (() => {
          const sts = st.trades.filter(t => t.setupId === sd.id && t.status !== 'OPEN');
          const sp = sts.reduce((a, t) => a + (t.pnl || 0), 0);
          const sw = sts.filter(t => t.pnl > 0).length;
          const sr = sts.length ? sts.reduce((a, t) => a + (t.rr || 0), 0) / sts.length : 0;
          return [
            { l: 'Net P&L', v: this._fmtMoney(sp), c: pc(sp) },
            { l: 'Win rate', v: (sts.length ? Math.round(sw / sts.length * 100) : 0) + '%', c: '#ECEAE3' },
            { l: 'Trades', v: String(sts.length), c: '#ECEAE3' },
            { l: 'Avg R', v: (sr >= 0 ? '+' : '−') + Math.abs(sr).toFixed(2) + 'R', c: sr >= 0 ? GREEN : RED },
          ];
        })(),
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
      const planItemsSrc = scope === 'weekly' ? st.weeklyItems : st.monthlyItems;
      const cur = (st.checks[scope] && st.checks[scope][key]) || {};
      let pdone = 0;
      const planItems = planItemsSrc.map((it, i) => {
        const done = !!cur[it.id]; if (done) pdone++;
        return {
          text: it.text, border: i === 0 ? 'none' : '1px solid rgba(255,255,255,.05)',
          boxBorder: done ? '1.5px solid #C9A65F' : '1.5px solid rgba(255,255,255,.18)',
          boxBg: done ? 'linear-gradient(150deg,#E2C588,#C9A65F)' : 'transparent', checkOp: done ? 1 : 0,
          textColor: done ? '#5E5E68' : '#ECEAE3', strike: done ? 'line-through' : 'none',
          toggle: () => this.toggleCheck(scope, key, it.id),
        };
      });
      planVals = {
        planTitle: scope === 'weekly' ? 'วางแผนสัปดาห์หน้า' : 'วางแผนเดือนหน้า',
        planTag: scope === 'weekly' ? 'Weekly planning' : 'Monthly planning',
        planLabel: st.planLabel, planItems, planFrac: pdone + ' / ' + planItemsSrc.length,
        planClose: () => this.closePlan(),
      };
    }

    return {
      navDash: this.navStyle('dashboard'), navCal: this.navStyle('calendar'), navLog: this.navStyle('log'),
      navAna: this.navStyle('analytics'), navSet: this.navStyle('setups'), navCheck: this.navStyle('checklist'),
      navPlay: this.navStyle('playbook'), navVision: this.navStyle('vision'),
      goDash: () => this.setView('dashboard'), goCal: () => this.setView('calendar'), goLog: () => this.setView('log'),
      goAna: () => this.setView('analytics'), goSet: () => this.setView('setups'), goCheck: () => this.setView('checklist'),
      goPlay: () => this.setView('playbook'), goVision: () => this.setView('vision'),
      isDash: st.view === 'dashboard', isCal: st.view === 'calendar', isLog: st.view === 'log',
      isAna: st.view === 'analytics', isSet: st.view === 'setups', isCheck: st.view === 'checklist',
      isPlay: st.view === 'playbook', isVision: st.view === 'vision',
      accountName: st.accountName, editName: st.editName, notEditName: !st.editName,
      startName: () => this.startName(), commitName: (e) => this.commitName(e), onNameKey: (e) => this.onNameKey(e),
      affirmation: st.affirmation, editAffirm: st.editAffirm, notEditAffirm: !st.editAffirm,
      startAffirm: () => this.startAffirm(), commitAffirm: (e) => this.commitAffirm(e), onAffirmKey: (e) => this.onAffirmKey(e),
      affirmDetails, addAffirmDetail: () => this.addAffirmDetail(),
      clock: this._now(), tzAbbr: this._tzAbbr(), sessions: this._sessions(),
      tickerA: this._ticker(), tickerB: this._ticker(),
      portfolios: st.portfolios, currentPortfolioId: cpId,
      currentPortfolioName: cpId === 'all' ? 'ทุกพอร์ต' : this._portfolioName(cpId),
      showPortMenu: st.showPortMenu, togglePortMenu: () => this.setState({ showPortMenu: !st.showPortMenu, showUserMenu: false }),
      selectPortfolio: (id) => this.selectPortfolio(id), delPortfolio: (id, e) => this.delPortfolio(id, e),
      openAccount: () => this.openAccount(), isAccount: st.view === 'account', goAccount: () => this.setView('account'),
      portfolioStats, newPortName: st.newPortName, setNewPortName: (e) => this.setNewPortName(e.target.value),
      acctTotalEquity: '$' + Math.round(st.portfolios.reduce((a, p) => a + (Number(p.startBalance) || 0), 0) + st.trades.reduce((a, t) => a + (t.status !== 'OPEN' ? (t.pnl || 0) : 0), 0)).toLocaleString('en-US'),
      acctTotalNet: this._fmtMoney(st.trades.reduce((a, t) => a + (t.status !== 'OPEN' ? (t.pnl || 0) : 0), 0)),
      acctTotalNetColor: pc(st.trades.reduce((a, t) => a + (t.status !== 'OPEN' ? (t.pnl || 0) : 0), 0)),
      calToday: () => { const n = new Date(); this.setState({ calYear: n.getFullYear(), calMonth: n.getMonth() }); },
      addPortfolioNamed: () => this.addPortfolioNamed(), addPortKey: (e) => { if (e.key === 'Enter') this.addPortfolioNamed(); },
      showUserMenu: st.showUserMenu, toggleUserMenu: () => this.setState({ showUserMenu: !st.showUserMenu, showPortMenu: false }),
      avatarLetter: ((this.props.userEmail || st.accountName || 'G').trim().charAt(0) || 'G').toUpperCase(),
      userEmail: this.props.userEmail || '',
      signOut: () => this.props.onSignOut && this.props.onSignOut(),
      showReset: st.showReset, openReset: () => this.openReset(), closeReset: () => this.closeReset(), doReset: () => this.resetJournal(),
      exportWord: () => this.exportWord(), exporting: st.exporting, exportCSV: () => this.exportCSV(),
      stop: (e) => e.stopPropagation(),
      // KPI
      kEquity: S.kEquity, kNet: S.kNet, kWin: S.kWin, kPf: S.kPf, kR: S.kR, kDD: S.kDD,
      donut: S.donut,
      totalClosed: S.totalClosed, winsN: S.winsN, lossesN: S.lossesN, startBalStr: S.startBalStr,
      eqRange: st.eqRange, setEqRange: (r) => this.setState({ eqRange: r }),
      equityLine: S.equityLine, equityArea: S.equityArea, equityLastY: S.equityLastY,
      milestoneEquity: S.milestoneEquity, milestonePct: S.milestonePct, milestoneWidth: S.milestoneWidth,
      goalStr: S.goalStr, goalNum: S.goalNum, editGoal: st.editGoal,
      startGoal: () => this.startGoal(), commitGoal: (e) => this.commitGoal(e), onGoalKey: (e) => this.onGoalKey(e),
      setupBars, recent, allMapped, filteredTrades, logFilters, tradeCount: trades.length, filteredCount: filteredTrades.length,
      logSearch: st.logSearch, setLogSearch: (e) => this.setState({ logSearch: e.target.value }),
      logSort: st.logSort, setLogSort: (e) => this.setState({ logSort: e.target.value }),
      heat, calDays, weeks, monthPnl: this._fmtMoney(monthTotal), monthColor: pc(monthTotal),
      calMonthLabel, calMonthShort, calPrev: () => this.calStep(-1), calNext: () => this.calStep(1),
      calYearNum: st.calYear, setCalYear: (e) => this.setState({ calYear: parseInt(e.target.value, 10) }),
      calYearOptions: (() => { const ny = new Date().getFullYear(); const arr = []; for (let y = ny - 8; y <= ny + 1; y++) arr.push(y); if (!arr.includes(st.calYear)) arr.push(st.calYear); return arr.sort((a, b) => a - b); })(),
      dowBars, sessionBars, rDist, anaStats, setupCards,
      expectancyStr: S.expectancyStr, curStreakStr: S.curStreakStr, curStreakColor: S.curStreakColor, consistencyStr: S.consistencyStr,
      ddLine: S.ddLine, ddArea: S.ddArea, symbolBars: S.symbolBars, tagStats: S.tagStats,
      maxWinStreak: S.maxWinStreak, maxLossStreak: S.maxLossStreak, anaPf: S.kPf, anaDD: S.kDD, anaR: S.kR,
      openNew: () => this.openNew(), openNewSetup: () => this.openNewSetup(),
      // checklist
      checkTab: tab, tabWeekly: () => this.setState({ checkTab: 'weekly' }), tabMonthly: () => this.setState({ checkTab: 'monthly' }),
      wkTabStyle: this._segStyle(isWeekly), moTabStyle: this._segStyle(!isWeekly),
      periods, checkItems, checkPeriodLabel, checkListHint: 'แตะกล่องเพื่อเช็ก · ดินสอแก้ไข · กากบาทลบ',
      readyPct: readyPct + '%', readyOffset: 327 - 327 * readyPct / 100, readyStroke: ringStroke(readyPct), readyMsg: ringMsg(readyPct), readyFrac: cdone + ' / ' + items.length + ' ข้อ',
      addCheckKey: (e) => { if (e.key === 'Enter') { this.addItem(which, e.target.value); e.target.value = ''; } },
      preItems, prePct: prePct + '%', preOffset: 327 - 327 * prePct / 100, preStroke: ringStroke(prePct), preMsg: ringMsg(prePct), preFrac: pdone + ' / ' + st.preItems.length + ' ข้อ',
      addPreKey: (e) => { if (e.key === 'Enter') { this.addItem('pre', e.target.value); e.target.value = ''; } },
      showPlan: st.showPlan, ...planVals, openPlanManual: () => this.openPlanManual(),
      planReminders: st.planReminders, togglePlanReminders: () => this.togglePlanReminders(),
      // vision
      visionItems, addVision: () => this.addVision(),
      // day modal
      showDay: st.showDay, closeDay: () => this.closeDay(), ...dayObj,
      // trade modal
      showTrade: st.showTrade, closeTrade: () => this.closeTrade(), addImg: () => this.addImg(), ...tradeVals,
      // setup modal
      showSetup: st.showSetup, closeSetup: () => this.closeSetup(), ...setupVals,
    };
  }

  // ===================== VIEWS =====================
  renderAccount(V) {
    const LBL = css('font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5E5E68;margin-bottom:5px');
    const VAL = css('font-family:\'JetBrains Mono\';font-size:17px;font-weight:600');
    return (
      <div style={css('padding:24px 28px 40px;animation:viewIn .45s both')}>
        <div style={css('margin-bottom:20px;animation:rise .5s both')}><div style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#C9A65F;margin-bottom:6px')}>Account</div><div style={css('font-family:\'Spectral\',serif;font-size:28px;color:#ECEAE3')}>บัญชี &amp; พอร์ตของฉัน <span style={css('font-style:italic;color:#E2C588')}>— จัดการพอร์ตและดูสถิติ</span></div></div>

        <div style={css('display:flex;align-items:center;gap:16px;padding:18px 22px;border-radius:16px;background:linear-gradient(120deg,rgba(201,166,95,.12),rgba(255,255,255,.02));border:1px solid rgba(201,166,95,.22);margin-bottom:20px;animation:rise .5s .05s both')}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(201,166,95,.14)', border: '1px solid rgba(201,166,95,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Spectral',serif", fontSize: 20, color: '#E2C588', flex: 'none' }}>{V.avatarLetter}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={css('font-size:15px;color:#ECEAE3;font-weight:600')}>{V.accountName}</div><div style={css('font-size:12.5px;color:#9A9AA4')}>{V.userEmail || '—'}</div></div>
          <div onClick={V.signOut} className="hv-deloutline" style={css('padding:10px 16px;border-radius:10px;border:1px solid rgba(220,106,99,.4);color:#DC6A63;font-size:13px;font-weight:600;cursor:pointer;transition:.14s')}>ออกจากระบบ</div>
        </div>

        <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;animation:rise .5s .06s both')}>
          <div style={css('padding:16px 20px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-top:2px solid #E2C588')}><div style={css('font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5E5E68;margin-bottom:7px')}>Equity รวมทุกพอร์ต</div><div style={css('font-family:\'JetBrains Mono\';font-size:22px;font-weight:600;color:#E2C588')}>{V.acctTotalEquity}</div></div>
          <div style={css('padding:16px 20px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-top:2px solid #5FC08D')}><div style={css('font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5E5E68;margin-bottom:7px')}>Net P&amp;L รวม</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:22px;font-weight:600'), color: V.acctTotalNetColor }}>{V.acctTotalNet}</div></div>
        </div>

        <div style={css('font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#5E5E68;margin-bottom:10px')}>เพิ่มพอร์ตใหม่</div>
        <div style={css('display:flex;gap:10px;margin-bottom:20px;animation:rise .5s .08s both')}>
          <input value={V.newPortName} onChange={V.setNewPortName} onKeyDown={V.addPortKey} placeholder="ชื่อพอร์ต เช่น FTMO Challenge, พอร์ตจริง, พอร์ตทดลอง" className="hv-focus" style={css('flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 14px;color:#ECEAE3;font-size:14px;outline:none')} />
          <div onClick={V.addPortfolioNamed} className="hv-save" style={css('padding:12px 22px;border-radius:10px;background:linear-gradient(150deg,#E2C588,#C9A65F);color:#1a1408;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;transition:.15s')}>+ เพิ่มพอร์ต</div>
        </div>

        <div style={css('font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#5E5E68;margin-bottom:12px')}>พอร์ตทั้งหมด · คลิกเพื่อเลือกดู</div>
        <div style={css('display:grid;grid-template-columns:repeat(2,1fr);gap:14px')}>
          {V.portfolioStats.map((p) => (
            <div key={p.id} onClick={p.select} className="hv-card" style={{ ...css('position:relative;padding:20px 22px;border-radius:16px;background:rgba(255,255,255,.025);cursor:pointer;transition:.18s'), border: '1px solid ' + (p.isCurrent ? 'rgba(201,166,95,.5)' : 'rgba(255,255,255,.07)') }}>
              <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px')}>
                <input defaultValue={p.name} onClick={V.stop} onBlur={p.rename} title="คลิกเพื่อแก้ชื่อ" className="hv-focus" style={css('flex:1;min-width:0;font-family:\'Spectral\',serif;font-size:19px;color:#ECEAE3;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:4px 8px;outline:none')} />
                {p.isCurrent && <span style={css('font-size:10px;color:#1a1408;background:linear-gradient(180deg,#E2C588,#C9A65F);padding:3px 9px;border-radius:6px;font-weight:700;flex:none')}>กำลังดู</span>}
                <span onClick={p.del} title="ลบพอร์ต" className="hv-del" style={css('width:28px;height:28px;border-radius:7px;border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;color:#5E5E68;cursor:pointer;transition:.14s;flex:none')}>✕</span>
              </div>
              <div style={css('display:flex;gap:12px;margin-bottom:14px')}>
                <div style={{ flex: 1 }}><div style={LBL}>ทุนเริ่มต้น ($)</div><input defaultValue={p.startBalance} onClick={V.stop} onBlur={p.setBalance} placeholder="0" className="hv-focus" style={css('width:100%;font-family:\'JetBrains Mono\';font-size:15px;color:#ECEAE3;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;outline:none')} /></div>
                <div style={{ flex: 1 }}><div style={LBL}>Equity ปัจจุบัน</div><div style={{ ...VAL, color: '#E2C588', paddingTop: 6 }}>{p.equityStr}</div></div>
              </div>
              <div style={css('display:grid;grid-template-columns:repeat(2,1fr);gap:14px')}>
                <div><div style={LBL}>Net P&amp;L</div><div style={{ ...VAL, color: p.netColor }}>{p.netStr}</div></div>
                <div><div style={LBL}>Win rate</div><div style={{ ...VAL, color: '#ECEAE3' }}>{p.wr}%</div></div>
                <div><div style={LBL}>Avg R</div><div style={{ ...VAL, color: p.avgRColor }}>{p.avgRStr}</div></div>
                <div><div style={LBL}>ออเดอร์</div><div style={{ ...VAL, color: '#ECEAE3' }}>{p.trades}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  renderDashboard(V) {
    return (
      <div style={css('padding:24px 28px 40px;display:flex;flex-direction:column;gap:16px;animation:fade .4s both')}>
        <div style={css('position:relative;overflow:hidden;display:flex;align-items:center;gap:14px;padding:15px 20px;border-radius:16px;background:linear-gradient(115deg,rgba(201,166,95,.15),rgba(155,140,255,.09) 50%,rgba(95,208,200,.09));border:1px solid rgba(201,166,95,.26);animation:rise .55s both')}>
          <span style={css('font-family:\'Spectral\',serif;font-size:36px;color:#C9A65F;line-height:.4;flex:none')}>“</span>
          <div onClick={V.goPlay} title="แก้ไขได้ในหน้า Playbook" style={css('flex:1;font-family:\'Spectral\',serif;font-style:italic;font-size:18px;line-height:1.4;color:#F3E9D2;cursor:pointer')}>{V.affirmation}</div>
          <div style={css('position:absolute;top:0;bottom:0;width:28%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent);animation:sweep 6s ease-in-out infinite;pointer-events:none')}></div>
        </div>

        <div style={css('display:grid;grid-template-columns:repeat(6,1fr);gap:11px')}>
          <div className="hv-k-gold" style={css('padding:15px 16px;border-radius:13px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-top:2px solid #C9A65F;animation:rise .5s .04s both;transition:.16s')}><div style={css('font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#5E5E68;margin-bottom:7px')}>Equity</div><div style={css('font-family:\'JetBrains Mono\';font-size:19px;font-weight:600;color:#E2C588')}><CountUp value={V.kEquity} /></div></div>
          <div className="hv-k-green" style={css('padding:15px 16px;border-radius:13px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-top:2px solid #5FC08D;animation:rise .5s .08s both;transition:.16s')}><div style={css('font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#5E5E68;margin-bottom:7px')}>Net P&amp;L</div><div style={css('font-family:\'JetBrains Mono\';font-size:19px;font-weight:600;color:#5FC08D')}><CountUp value={V.kNet} /></div></div>
          <div className="hv-k-green" style={css('padding:15px 16px;border-radius:13px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-top:2px solid #5FC08D;animation:rise .5s .12s both;transition:.16s')}><div style={css('font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#5E5E68;margin-bottom:7px')}>Win rate</div><div style={css('font-family:\'JetBrains Mono\';font-size:19px;font-weight:600;color:#ECEAE3')}><CountUp value={V.kWin} /></div></div>
          <div className="hv-k-blue" style={css('padding:15px 16px;border-radius:13px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-top:2px solid #7BA7D9;animation:rise .5s .16s both;transition:.16s')}><div style={css('font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#5E5E68;margin-bottom:7px')}>Profit factor</div><div style={css('font-family:\'JetBrains Mono\';font-size:19px;font-weight:600;color:#7BA7D9')}><CountUp value={V.kPf} /></div></div>
          <div className="hv-k-purple" style={css('padding:15px 16px;border-radius:13px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-top:2px solid #9B8CFF;animation:rise .5s .2s both;transition:.16s')}><div style={css('font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#5E5E68;margin-bottom:7px')}>Avg R</div><div style={css('font-family:\'JetBrains Mono\';font-size:19px;font-weight:600;color:#9B8CFF')}><CountUp value={V.kR} /></div></div>
          <div className="hv-k-red" style={css('padding:15px 16px;border-radius:13px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-top:2px solid #DC6A63;animation:rise .5s .24s both;transition:.16s')}><div style={css('font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#5E5E68;margin-bottom:7px')}>Max DD</div><div style={css('font-family:\'JetBrains Mono\';font-size:19px;font-weight:600;color:#DC6A63')}><CountUp value={V.kDD} /></div></div>
        </div>

        <div style={css('display:grid;grid-template-columns:1.7fr 1fr;gap:16px')}>
          <div className="hv-brd-gold" style={css('padding:20px 22px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);animation:rise .55s .28s both;transition:.18s')}>
            <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:14px')}><div><div style={css('font-family:\'Spectral\',serif;font-size:18px;color:#ECEAE3')}>Equity curve</div><div style={css('font-size:11.5px;color:#5E5E68;margin-top:2px')}>เส้นทางสู่ล้านแรก · since {V.startBalStr}</div></div><div style={css('display:flex;gap:5px')}>
              {['ALL', '3M', '1M'].map((rg) => (
                <span key={rg} onClick={() => V.setEqRange(rg)} style={V.eqRange === rg ? css('font-size:11px;font-family:JetBrains Mono;color:#1a1408;background:linear-gradient(180deg,#E2C588,#C9A65F);padding:5px 11px;border-radius:7px;cursor:pointer') : css('font-size:11px;font-family:JetBrains Mono;color:#9A9AA4;padding:5px 11px;border-radius:7px;border:1px solid rgba(255,255,255,.1);cursor:pointer')}>{rg}</span>
              ))}
            </div></div>
            <svg viewBox="0 0 640 230" preserveAspectRatio="none" style={css('width:100%;height:210px;display:block;overflow:visible')}>
              <defs><linearGradient id="cv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C9A65F" stopOpacity=".32"/><stop offset="100%" stopColor="#C9A65F" stopOpacity="0"/></linearGradient></defs>
              <line x1="0" y1="52" x2="640" y2="52" stroke="rgba(255,255,255,.05)"/><line x1="0" y1="112" x2="640" y2="112" stroke="rgba(255,255,255,.05)"/><line x1="0" y1="172" x2="640" y2="172" stroke="rgba(255,255,255,.05)"/>
              <path d={V.equityArea} fill="url(#cv)"/>
              <path className="eq-line" d={V.equityLine} fill="none" stroke="#E2C588" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="640" cy={V.equityLastY} r="4.5" fill="#E2C588"><animate attributeName="opacity" values="1;.4;1" dur="2s" repeatCount="indefinite"/></circle>
            </svg>
          </div>
          <div style={css('display:flex;flex-direction:column;gap:16px')}>
            <div className="hv-brd-green" style={css('padding:18px 20px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:20px;animation:rise .55s .32s both;transition:.18s')}>
              <div style={{ ...css('position:relative;width:96px;height:96px;border-radius:50%;flex:none'), background: V.donut }}><div style={css('position:absolute;inset:10px;border-radius:50%;background:#0c0c10;display:flex;align-items:center;justify-content:center;flex-direction:column')}><span style={css('font-family:\'JetBrains Mono\';font-size:21px;font-weight:600;color:#5FC08D')}><CountUp value={V.kWin} /></span><span style={css('font-size:9px;color:#5E5E68;letter-spacing:.1em')}>WIN RATE</span></div></div>
              <div><div style={css('font-size:11px;color:#5E5E68;margin-bottom:8px')}>{V.totalClosed} trades total</div><div style={css('font-size:13.5px;color:#5FC08D;font-family:JetBrains Mono;margin-bottom:4px')}>● {V.winsN} wins</div><div style={css('font-size:13.5px;color:#DC6A63;font-family:JetBrains Mono')}>● {V.lossesN} losses</div></div>
            </div>
            <div className="hv-brd-gold" style={css('flex:1;padding:18px 20px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);animation:rise .55s .36s both;transition:.18s')}>
              <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:14px')}><div style={css('font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3')}>By setup</div><span style={css('font-size:11px;color:#5E5E68')}>net P&amp;L</span></div>
              <div style={css('display:flex;flex-direction:column;gap:11px')}>
                {V.setupBars.map((s, i) => (
                  <div key={i}><div style={css('display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px')}><span style={css('color:#ECEAE3')}>{s.name} <span style={css('color:#5E5E68;font-size:10.5px;font-family:JetBrains Mono')}>{s.meta}</span></span><span style={{ ...css('font-family:JetBrains Mono'), color: s.color }}>{s.pnl}</span></div><div style={css('height:6px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden')}><div className="bar-grow-x" style={{ ...css('height:100%;border-radius:99px'), background: s.color, width: s.w }}></div></div></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={css('display:grid;grid-template-columns:1.55fr 1fr;gap:16px')}>
          <div style={css('border-radius:16px;border:1px solid rgba(255,255,255,.07);overflow:hidden;animation:rise .55s .4s both;background:rgba(255,255,255,.02)')}>
            <div style={css('display:flex;justify-content:space-between;align-items:center;padding:15px 20px;border-bottom:1px solid rgba(255,255,255,.06)')}><div style={css('font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3')}>Recent trades</div><span onClick={V.goLog} style={css('font-size:12px;color:#C9A65F;cursor:pointer')}>ดูทั้งหมด →</span></div>
            <div style={css('display:grid;grid-template-columns:1.2fr .7fr .9fr 1fr .7fr;gap:10px;padding:10px 20px;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#5E5E68;font-weight:600')}><span>Symbol</span><span>Side</span><span>Setup</span><span>P&amp;L</span><span>R</span></div>
            {V.recent.map((t) => (
              <div key={t.id} onClick={t.open} className="hv-row" style={css('display:grid;grid-template-columns:1.2fr .7fr .9fr 1fr .7fr;gap:10px;padding:11px 20px;border-top:1px solid rgba(255,255,255,.05);font-size:12.5px;cursor:pointer;transition:.12s;align-items:center')}><span style={css('color:#ECEAE3;font-weight:600')}>{t.sym}</span><span style={{ ...css('font-weight:600'), color: t.sideColor }}>{t.side}</span><span style={css('color:#9A9AA4')}>{t.setupName}</span><span style={{ ...css('font-family:JetBrains Mono'), color: t.pnlColor }}>{t.pnlStr}</span><span style={css('color:#9A9AA4;font-family:JetBrains Mono')}>{t.rStr}</span></div>
            ))}
          </div>
          <div style={css('padding:18px 20px;border-radius:16px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07);animation:rise .55s .44s both')}>
            <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:14px')}><div style={css('font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3')}>{V.calMonthShort} · P&amp;L รายวัน</div><span onClick={V.goCal} style={css('font-size:12px;color:#C9A65F;cursor:pointer')}>ปฏิทิน →</span></div>
            <div style={css('display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:8px')}>
              {['อา','จ','อ','พ','พฤ','ศ','ส'].map((d,i)=>(<div key={i} style={css('text-align:center;font-size:9px;color:#5E5E68')}>{d}</div>))}
            </div>
            <div style={css('display:grid;grid-template-columns:repeat(7,1fr);gap:5px')}>
              {V.heat.map((d, i) => (
                <div key={i} title={d.title} className="hv-scale" style={{ ...css('aspect-ratio:1;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-family:JetBrains Mono;cursor:default;transition:.14s'), background: d.bg, color: d.fg, border: d.border }}>{d.label}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  renderCalendar(V) {
    return (
      <div style={css('padding:24px 28px 40px;animation:fade .4s both')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;animation:rise .5s both')}>
          <div><div style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#C9A65F;margin-bottom:6px')}>Trading calendar</div><div style={css('display:flex;align-items:center;gap:12px')}><div onClick={V.calPrev} className="hv-close" style={css('width:30px;height:30px;border-radius:8px;border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;color:#9A9AA4;cursor:pointer')}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg></div><div style={css('display:flex;align-items:center;gap:10px;min-width:230px;justify-content:center')}><span style={css('font-family:\'Spectral\',serif;font-size:28px;color:#ECEAE3')}>{V.calMonthShort}</span><select value={V.calYearNum} onChange={V.setCalYear} className="hv-focus" style={css('background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:6px 10px;color:#ECEAE3;font-size:16px;font-family:JetBrains Mono;outline:none;cursor:pointer')}>{V.calYearOptions.map((y) => (<option key={y} value={y}>{y}</option>))}</select></div><div onClick={V.calNext} className="hv-close" style={css('width:30px;height:30px;border-radius:8px;border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;color:#9A9AA4;cursor:pointer')}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></div><span onClick={V.calToday} className="hv-lift" style={css('font-size:12px;font-weight:600;padding:7px 13px;border-radius:8px;cursor:pointer;color:#E2C588;background:rgba(201,166,95,.1);border:1px solid rgba(201,166,95,.3)')}>วันนี้</span></div></div>
          <div style={css('display:flex;align-items:center;gap:16px')}>
            <div style={css('text-align:right')}><div style={css('font-size:10.5px;color:#5E5E68;letter-spacing:.1em;text-transform:uppercase')}>Month P&amp;L</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:22px;font-weight:600'), color: V.monthColor }}>{V.monthPnl}</div></div>
          </div>
        </div>
        <div style={css('display:grid;grid-template-columns:1fr 240px;gap:16px;animation:rise .5s .08s both')}>
          <div style={css('border-radius:16px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.02);padding:16px')}>
            <div style={css('display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:10px')}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=>(<div key={i} style={css('text-align:center;font-size:10px;letter-spacing:.1em;color:#5E5E68;text-transform:uppercase')}>{d}</div>))}
            </div>
            <div style={css('display:grid;grid-template-columns:repeat(7,1fr);gap:8px')}>
              {V.calDays.map((d, i) => (
                <div key={i} onClick={d.click || undefined} className={d.cursor === 'pointer' ? 'hv-day' : undefined} style={{ ...css('aspect-ratio:1.05;border-radius:10px;padding:8px 9px;display:flex;flex-direction:column;justify-content:space-between;transition:.14s'), background: d.bg, border: d.border, cursor: d.cursor }}>
                  <div style={css('display:flex;justify-content:space-between;align-items:center')}><span style={{ ...css('font-size:11px;font-family:JetBrains Mono'), color: d.dayColor }}>{d.day}</span><span style={{ ...css('font-size:8px'), color: d.dotColor }}>{d.dot}</span></div>
                  <div><div style={{ ...css('font-size:12.5px;font-family:JetBrains Mono;font-weight:600'), color: d.fg }}>{d.pnl}</div><div style={css('font-size:9px;color:#5E5E68')}>{d.trades}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div style={css('display:flex;flex-direction:column;gap:10px')}>
            <div style={css('font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#5E5E68;margin-bottom:2px')}>Weekly</div>
            {V.weeks.map((w, i) => (
              <div key={i} className="hv-brd-gold" style={css('padding:14px 16px;border-radius:13px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);transition:.16s')}><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:5px')}>{w.label}</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:18px;font-weight:600'), color: w.color }}>{w.pnl}</div><div style={css('font-size:10.5px;color:#5E5E68;margin-top:3px')}>{w.meta}</div></div>
            ))}
          </div>
        </div>
        <div style={css('margin-top:14px;font-size:12px;color:#5E5E68;display:flex;align-items:center;gap:8px')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#C9A65F" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01" strokeLinecap="round"/></svg>คลิกที่วันที่มีการเทรด เพื่อดูออเดอร์ทั้งหมดของวันนั้น</div>
      </div>
    );
  }

  renderTradeLog(V) {
    return (
      <div style={css('padding:24px 28px 40px;animation:fade .4s both')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;animation:rise .5s both')}>
          <div><div style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#C9A65F;margin-bottom:6px')}>Trade log</div><div style={css('font-family:\'Spectral\',serif;font-size:28px;color:#ECEAE3')}>บันทึกการเทรด <span style={css('font-size:15px;color:#5E5E68;font-family:\'Plus Jakarta Sans\'')}>{V.tradeCount} orders</span></div></div>
          <div style={css('display:flex;gap:8px')}>
            {V.logFilters.map((f, i) => (
              <span key={i} onClick={f.click} style={{ ...css('font-size:12px;font-family:JetBrains Mono;padding:7px 14px;border-radius:8px;cursor:pointer;transition:.14s'), color: f.fg, background: f.bg, border: f.border }}>{f.label}</span>
            ))}
            <span onClick={V.exportCSV} className="hv-lift" title="ดาวน์โหลดเป็น CSV (เปิดใน Excel/Sheets)" style={css('font-size:12px;font-weight:600;padding:7px 14px;border-radius:8px;cursor:pointer;color:#9A9AA4;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;gap:5px;transition:.14s')}>⤓ CSV</span>
            <span onClick={V.exporting ? undefined : V.exportWord} className="hv-lift" title="ดาวน์โหลดประวัติเทรดรายสัปดาห์เป็น Word (มีรูปแนบ)" style={css('font-size:12px;font-weight:600;padding:7px 14px;border-radius:8px;cursor:' + (V.exporting ? 'progress' : 'pointer') + ';color:#E2C588;background:rgba(201,166,95,.1);border:1px solid rgba(201,166,95,.3);display:flex;align-items:center;gap:5px;transition:.14s')}>{V.exporting ? 'กำลังสร้าง…' : '⤓ Word'}</span>
            <span onClick={V.openNew} className="hv-lift" style={css('font-size:12px;font-weight:600;padding:7px 15px;border-radius:8px;cursor:pointer;color:#1a1408;background:linear-gradient(180deg,#E2C588,#C9A65F);display:flex;align-items:center;gap:5px;transition:.14s')}>+ เพิ่มออเดอร์</span>
          </div>
        </div>
        <div style={css('display:flex;gap:10px;margin-bottom:14px;animation:rise .5s .04s both')}>
          <input value={V.logSearch} onChange={V.setLogSearch} placeholder="🔍 ค้นหา symbol / setup / โน้ต…" className="hv-focus" style={css('flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:9px 14px;color:#ECEAE3;font-size:13px;outline:none')} />
          <select value={V.logSort} onChange={V.setLogSort} className="hv-focus" style={css('background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:9px 14px;color:#ECEAE3;font-size:13px;outline:none;cursor:pointer')}>
            <option value="date-desc">ใหม่ → เก่า</option>
            <option value="date-asc">เก่า → ใหม่</option>
            <option value="pnl-desc">กำไรมากสุด</option>
            <option value="pnl-asc">ขาดทุนมากสุด</option>
          </select>
        </div>
        <div style={css('border-radius:16px;border:1px solid rgba(255,255,255,.07);overflow:hidden;background:rgba(255,255,255,.02);animation:rise .5s .08s both')}>
          <div style={css('display:grid;grid-template-columns:.7fr 1.1fr .6fr .9fr .8fr .5fr 1fr .6fr .8fr;gap:10px;padding:12px 20px;background:rgba(255,255,255,.03);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#5E5E68;font-weight:600')}><span>Date</span><span>Symbol</span><span>Side</span><span>Setup</span><span>Session</span><span>Lot</span><span>P&amp;L</span><span>R</span><span>Status</span></div>
          {V.filteredTrades.map((t) => (
            <div key={t.id} onClick={t.open} className="hv-row" style={css('display:grid;grid-template-columns:.7fr 1.1fr .6fr .9fr .8fr .5fr 1fr .6fr .8fr;gap:10px;padding:12px 20px;border-top:1px solid rgba(255,255,255,.05);font-size:12.5px;cursor:pointer;transition:.12s;align-items:center')}>
              <span style={css('color:#9A9AA4;font-family:JetBrains Mono;font-size:11.5px')}>{t.dateShort}</span>
              <span style={css('color:#ECEAE3;font-weight:600')}>{t.sym}</span>
              <span style={{ ...css('font-weight:600'), color: t.sideColor }}>{t.side}</span>
              <span style={css('color:#9A9AA4')}>{t.setupName}</span>
              <span style={{ ...css('font-size:11.5px'), color: t.sessionColor }}>{t.session}</span>
              <span style={css('color:#9A9AA4;font-family:JetBrains Mono;font-size:11.5px')}>{t.lotStr}</span>
              <span style={{ ...css('font-family:JetBrains Mono'), color: t.pnlColor }}>{t.pnlStr}</span>
              <span style={css('color:#9A9AA4;font-family:JetBrains Mono')}>{t.rStr}</span>
              <span style={{ ...css('font-size:10px;padding:3px 9px;border-radius:6px;width:fit-content;text-transform:uppercase;letter-spacing:.05em'), color: t.statusColor, background: t.statusBg }}>{t.status}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  renderAnalytics(V) {
    return (
      <div style={css('padding:24px 28px 40px;animation:fade .4s both')}>
        <div style={css('margin-bottom:20px;animation:rise .5s both')}><div style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#C9A65F;margin-bottom:6px')}>Analytics</div><div style={css('font-family:\'Spectral\',serif;font-size:28px;color:#ECEAE3')}>วิเคราะห์เชิงลึก <span style={css('font-style:italic;color:#E2C588')}>— รู้จุดแข็ง รู้จุดรั่ว</span></div></div>
        <div style={css('display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px;animation:rise .5s .03s both')}>
          {[
            { l: 'Expectancy / ไม้', v: V.expectancyStr, c: '#E2C588' },
            { l: 'Profit factor', v: V.anaPf, c: '#7BA7D9' },
            { l: 'Max Drawdown', v: V.anaDD, c: '#DC6A63' },
            { l: 'วันเขียว', v: V.consistencyStr, c: '#5FC08D' },
            { l: 'สตรีคปัจจุบัน', v: V.curStreakStr, c: V.curStreakColor },
          ].map((m, i) => (
            <div key={i} className="hv-k-gold" style={css('padding:15px 16px;border-radius:13px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-top:2px solid ' + m.c + ';transition:.16s')}><div style={css('font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#5E5E68;margin-bottom:7px')}>{m.l}</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:17px;font-weight:600'), color: m.c }}>{m.v}</div></div>
          ))}
        </div>
        <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px')}>
          <div className="hv-brd-gold" style={css('padding:20px 22px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);animation:rise .5s .06s both;transition:.18s')}>
            <div style={css('font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3;margin-bottom:18px')}>P&amp;L ตามวันในสัปดาห์</div>
            <div style={css('display:flex;align-items:flex-end;gap:14px;height:150px')}>
              {V.dowBars.map((b, i) => (
                <div key={i} style={css('flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end')}><span style={{ ...css('font-size:11px;font-family:JetBrains Mono'), color: b.color }}>{b.val}</span><div className="bar-grow" style={{ ...css('width:100%;border-radius:7px 7px 0 0;transition:.3s'), background: b.bg, height: b.h }}></div><span style={css('font-size:11px;color:#9A9AA4')}>{b.label}</span></div>
              ))}
            </div>
          </div>
          <div className="hv-brd-gold" style={css('padding:20px 22px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);animation:rise .5s .1s both;transition:.18s')}>
            <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:18px')}><div style={css('font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3')}>P&amp;L ตาม session</div><span style={css('font-size:11px;color:#5E5E68')}>แยกสีตามตลาด</span></div>
            <div style={css('display:flex;align-items:flex-end;gap:18px;height:150px')}>
              {V.sessionBars.map((b, i) => (
                <div key={i} style={css('flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end')}><span style={{ ...css('font-size:11px;font-family:JetBrains Mono'), color: b.color }}>{b.val}</span><div className="bar-grow" style={{ ...css('width:100%;border-radius:7px 7px 0 0;transition:.3s'), background: b.bg, height: b.h, boxShadow: b.glow }}></div><span style={{ ...css('font-size:11px;font-weight:600'), color: b.labelColor }}>{b.label}</span></div>
              ))}
            </div>
          </div>
        </div>
        <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
          <div className="hv-brd-gold" style={css('padding:20px 22px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);animation:rise .5s .14s both;transition:.18s')}>
            <div style={css('font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3;margin-bottom:18px')}>การกระจายตัวของ R-multiple</div>
            <div style={css('display:flex;align-items:flex-end;gap:8px;height:140px')}>
              {V.rDist.map((b, i) => (
                <div key={i} style={css('flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end')}><div className="bar-grow" style={{ ...css('width:100%;border-radius:5px 5px 0 0'), background: b.bg, height: b.h }}></div><span style={css('font-size:9px;color:#5E5E68;font-family:JetBrains Mono')}>{b.label}</span></div>
              ))}
            </div>
          </div>
          <div className="hv-brd-gold" style={css('padding:20px 22px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);animation:rise .5s .18s both;transition:.18s')}>
            <div style={css('font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3;margin-bottom:16px')}>สถิติสำคัญ</div>
            <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
              {V.anaStats.map((s, i) => (
                <div key={i} style={css('padding:13px 15px;border-radius:11px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06)')}><div style={css('font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5E5E68;margin-bottom:7px')}>{s.label}</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:18px;font-weight:600'), color: s.color }}>{s.val}</div></div>
              ))}
            </div>
          </div>
        </div>

        <div style={css('display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-top:16px')}>
          <div className="hv-brd-gold" style={css('padding:20px 22px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);animation:rise .5s .22s both;transition:.18s')}>
            <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:14px')}><div style={css('font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3')}>Drawdown (ใต้น้ำ)</div><span style={css('font-size:11px;color:#5E5E68')}>ยิ่งลึก = ถอยจากจุดสูงสุดมาก</span></div>
            <svg viewBox="0 0 640 120" preserveAspectRatio="none" style={css('width:100%;height:120px;display:block')}>
              <defs><linearGradient id="ddg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#DC6A63" stopOpacity="0"/><stop offset="100%" stopColor="#DC6A63" stopOpacity=".4"/></linearGradient></defs>
              <line x1="0" y1="1" x2="640" y2="1" stroke="rgba(255,255,255,.1)"/>
              <path d={V.ddArea} fill="url(#ddg)"/>
              <path className="eq-line" d={V.ddLine} fill="none" stroke="#DC6A63" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="hv-brd-gold" style={css('padding:20px 22px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);animation:rise .5s .26s both;transition:.18s')}>
            <div style={css('font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3;margin-bottom:14px')}>P&amp;L ตาม Symbol</div>
            <div style={css('display:flex;flex-direction:column;gap:11px')}>
              {V.symbolBars.length ? V.symbolBars.map((s, i) => (
                <div key={i}><div style={css('display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px')}><span style={css('color:#ECEAE3')}>{s.name} <span style={css('color:#5E5E68;font-size:10.5px;font-family:JetBrains Mono')}>{s.meta}</span></span><span style={{ ...css('font-family:JetBrains Mono'), color: s.color }}>{s.pnl}</span></div><div style={css('height:6px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden')}><div className="bar-grow-x" style={{ ...css('height:100%;border-radius:99px'), background: s.color, width: s.w }}></div></div></div>
              )) : <div style={css('font-size:12.5px;color:#5E5E68')}>ยังไม่มีข้อมูล</div>}
            </div>
          </div>
        </div>

        <div className="hv-brd-gold" style={css('margin-top:16px;padding:20px 22px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);animation:rise .5s .3s both;transition:.18s')}>
          <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:16px')}><div style={css('font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3')}>P&amp;L ตาม Tag / อารมณ์ <span style={css('font-size:12px;color:#5E5E68;font-family:\'Plus Jakarta Sans\'')}>— แท็กไหนทำให้เสีย</span></div></div>
          <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:11px 24px')}>
            {V.tagStats.length ? V.tagStats.map((s, i) => (
              <div key={i}><div style={css('display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px')}><span style={css('color:#ECEAE3')}>{s.name} <span style={css('color:#5E5E68;font-size:10.5px;font-family:JetBrains Mono')}>{s.meta}</span></span><span style={{ ...css('font-family:JetBrains Mono'), color: s.color }}>{s.pnl}</span></div><div style={css('height:6px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden')}><div className="bar-grow-x" style={{ ...css('height:100%;border-radius:99px'), background: s.color, width: s.w }}></div></div></div>
            )) : <div style={css('font-size:12.5px;color:#5E5E68')}>ยังไม่มีแท็กในเทรด — ใส่แท็กตอนบันทึกออเดอร์เพื่อดูว่าอารมณ์ไหนทำให้เสีย</div>}
          </div>
        </div>
      </div>
    );
  }

  renderSetups(V) {
    return (
      <div style={css('padding:24px 28px 40px;animation:fade .4s both')}>
        <div style={css('display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px;animation:rise .5s both')}>
          <div><div style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#C9A65F;margin-bottom:6px')}>Setups</div><div style={css('font-family:\'Spectral\',serif;font-size:28px;color:#ECEAE3')}>รูปแบบการเข้าเทรด <span style={css('font-style:italic;color:#E2C588')}>— เก็บเฉพาะที่ได้เปรียบ</span></div></div>
          <span onClick={V.openNewSetup} className="hv-setbtn" style={css('font-size:12px;font-weight:600;padding:9px 16px;border-radius:9px;cursor:pointer;color:#1a1408;background:linear-gradient(180deg,#E2C588,#C9A65F);display:flex;align-items:center;gap:5px;transition:.14s')}>+ เพิ่ม Setup</span>
        </div>
        <div style={css('display:grid;grid-template-columns:repeat(2,1fr);gap:16px')}>
          {V.setupCards.map((s) => (
            <div key={s.id} onClick={s.open} className="hv-card" style={{ ...css('position:relative;padding:22px 24px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);animation:pop .3s both;cursor:pointer;transition:.18s'), borderLeft: '3px solid ' + s.accent }}>
              <div onClick={s.del} title="ลบ setup" className="hv-del" style={css('position:absolute;top:14px;right:14px;width:26px;height:26px;border-radius:7px;border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;color:#5E5E68;transition:.14s;z-index:2')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-right:34px')}><div style={{ ...css('width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-family:\'Spectral\',serif;font-size:18px;flex:none'), background: s.iconBg, color: s.accent }}>{s.glyph}</div><div style={css('min-width:0')}><div style={css('font-family:\'Spectral\',serif;font-size:20px;color:#ECEAE3')}>{s.name}</div><div style={css('font-size:12px;color:#9A9AA4;margin-top:2px')}>{s.desc}</div></div></div>
              <div style={css('display:flex;gap:24px;margin-bottom:16px')}>
                <div><div style={css('font-size:10px;color:#5E5E68;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px')}>Win rate</div><div style={css('font-family:\'JetBrains Mono\';font-size:16px;color:#ECEAE3')}>{s.wrStr}</div></div>
                <div><div style={css('font-size:10px;color:#5E5E68;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px')}>Trades</div><div style={css('font-family:\'JetBrains Mono\';font-size:16px;color:#ECEAE3')}>{s.tradesStr}</div></div>
                <div><div style={css('font-size:10px;color:#5E5E68;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px')}>Avg R</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:16px'), color: s.rColor }}>{s.avgRStr}</div></div>
                <div><div style={css('font-size:10px;color:#5E5E68;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px')}>Net P&amp;L</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:16px'), color: s.pnlColor }}>{s.pnlStr}</div></div>
              </div>
              <div style={css('height:7px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden;margin-bottom:12px')}><div className="bar-grow-x" style={{ ...css('height:100%;border-radius:99px'), background: s.accent, width: s.wrW }}></div></div>
              <div style={css('font-size:11.5px;color:#C9A65F;display:flex;align-items:center;gap:5px')}>ดูรายละเอียด &amp; กราฟตัวอย่าง <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  _renderCheckRow(c, i) {
    return (
      <div key={i} className="hv-chk" style={{ ...css('display:flex;align-items:center;gap:14px;padding:15px 20px;transition:.14s'), borderTop: c.border }}>
        <div onClick={c.toggle} style={{ ...css('width:22px;height:22px;border-radius:7px;flex:none;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.16s'), border: c.boxBorder, background: c.boxBg }}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#1a1408" strokeWidth="3" style={{ opacity: c.checkOp }}><path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
        {c.editing ? (
          <input defaultValue={c.text} onBlur={c.commit} onKeyDown={c.key} autoFocus style={css('flex:1;font-size:14px;color:#ECEAE3;background:rgba(0,0,0,.25);border:1px solid rgba(201,166,95,.4);border-radius:7px;padding:5px 10px;outline:none')} />
        ) : (
          <Fragment>
            <span onClick={c.toggle} style={{ ...css('flex:1;font-size:14px;cursor:pointer'), color: c.textColor, textDecoration: c.strike }}>{c.text}</span>
            <div onClick={c.edit} className="hv-edittext" style={css('flex:none;color:#5E5E68;cursor:pointer;transition:.14s')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
            <div onClick={c.del} className="hv-deltext" style={css('flex:none;color:#5E5E68;cursor:pointer;transition:.14s')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
          </Fragment>
        )}
      </div>
    );
  }

  _renderReadiness(stroke, offset, pct, msg, frac) {
    return (
      <div style={css('padding:22px 24px;border-radius:16px;background:linear-gradient(180deg,rgba(201,166,95,.1),rgba(255,255,255,.015));border:1px solid rgba(201,166,95,.22);text-align:center')}>
        <div style={css('font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#C9A65F;margin-bottom:14px')}>Readiness</div>
        <div style={css('position:relative;width:130px;height:130px;margin:0 auto')}><svg viewBox="0 0 120 120" style={css('width:130px;height:130px;transform:rotate(-90deg)')}><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="9"/><circle cx="60" cy="60" r="52" fill="none" stroke={stroke} strokeWidth="9" strokeLinecap="round" strokeDasharray="327" strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset .5s' }}/></svg><div style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column')}><span style={{ ...css('font-family:\'JetBrains Mono\';font-size:30px;font-weight:600'), color: stroke }}>{pct}</span></div></div>
        <div style={css('font-size:13px;color:#9A9AA4;margin-top:16px;line-height:1.5')}>{msg}</div>
        <div style={css('font-size:11.5px;color:#5E5E68;margin-top:10px;font-family:JetBrains Mono')}>{frac}</div>
      </div>
    );
  }

  renderChecklist(V) {
    return (
      <div style={css('padding:24px 28px 40px;animation:fade .4s both')}>
        <div style={css('display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:18px;animation:rise .5s both')}>
          <div><div style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#C9A65F;margin-bottom:6px')}>Routine checklist</div><div style={css('font-family:\'Spectral\',serif;font-size:28px;color:#ECEAE3')}>เช็กลิสต์ <span style={css('font-style:italic;color:#E2C588')}>รายสัปดาห์ &amp; รายเดือน</span></div></div>
          <div style={css('display:flex;align-items:center;gap:12px')}>
            <span onClick={V.openPlanManual} className="hv-lift" title="เปิดวางแผนสัปดาห์/เดือนถัดไป" style={css('font-size:12px;font-weight:600;padding:9px 15px;border-radius:9px;cursor:pointer;color:#E2C588;background:rgba(201,166,95,.1);border:1px solid rgba(201,166,95,.3);display:flex;align-items:center;gap:6px')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>วางแผนล่วงหน้า</span>
            <div style={css('display:flex;gap:6px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:4px')}>
              <span onClick={V.tabWeekly} style={css(V.wkTabStyle)}>Weekly</span>
              <span onClick={V.tabMonthly} style={css(V.moTabStyle)}>Monthly</span>
            </div>
          </div>
        </div>

        <div style={css('display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;animation:rise .5s .05s both')}>
          {V.periods.map((pp, i) => (
            <div key={i} onClick={pp.click} className="hv-period" style={{ ...css('padding:10px 15px;border-radius:11px;cursor:pointer;transition:.14s'), background: pp.bg, border: pp.border }}>
              <div style={css('display:flex;align-items:center;gap:8px')}><span style={{ ...css('width:8px;height:8px;border-radius:50%;flex:none'), background: pp.dot }}></span><span style={{ ...css('font-size:12.5px;font-weight:600'), color: pp.labelColor }}>{pp.label}</span></div>
              <div style={css('font-size:10.5px;color:#5E5E68;margin-top:4px;font-family:JetBrains Mono')}>{pp.status}</div>
            </div>
          ))}
        </div>

        <div style={css('display:grid;grid-template-columns:1fr 300px;gap:16px;align-items:start;animation:rise .5s .1s both')}>
          <div style={css('border-radius:16px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.02);overflow:hidden')}>
            <div style={css('padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center')}><div style={css('font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3')}>{V.checkPeriodLabel}</div><span style={css('font-size:11px;color:#5E5E68')}>{V.checkListHint}</span></div>
            {V.checkItems.map((c, i) => this._renderCheckRow(c, i))}
            <div style={css('display:flex;align-items:center;gap:12px;padding:14px 20px;border-top:1px solid rgba(255,255,255,.05)')}>
              <div style={css('width:22px;height:22px;border-radius:7px;flex:none;border:1.5px dashed rgba(201,166,95,.4);display:flex;align-items:center;justify-content:center;color:#C9A65F')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg></div>
              <input placeholder="เพิ่มรายการใหม่ แล้วกด Enter" onKeyDown={V.addCheckKey} style={css('flex:1;font-size:14px;color:#ECEAE3;background:transparent;border:none;outline:none')} />
            </div>
          </div>
          {this._renderReadiness(V.readyStroke, V.readyOffset, V.readyPct, V.readyMsg, V.readyFrac)}
        </div>
      </div>
    );
  }

  renderPlaybook(V) {
    return (
      <div style={css('padding:24px 28px 40px;animation:fade .4s both')}>
        <div style={css('margin-bottom:20px;animation:rise .5s both')}><div style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#C9A65F;margin-bottom:6px')}>Playbook · Mindset</div><div style={css('font-family:\'Spectral\',serif;font-size:28px;color:#ECEAE3')}>หลักคิด &amp; ความพร้อมก่อนเทรด <span style={css('font-style:italic;color:#E2C588')}>— the rules I live by</span></div></div>

        <div style={css('position:relative;overflow:hidden;padding:26px 30px;border-radius:18px;background:linear-gradient(120deg,rgba(201,166,95,.16),rgba(155,140,255,.08));border:1px solid rgba(201,166,95,.26);margin-bottom:16px;animation:rise .5s .05s both')}>
          <div style={css('position:absolute;top:-30%;right:-5%;width:38%;height:90%;background:radial-gradient(circle,rgba(201,166,95,.16),transparent 70%);pointer-events:none')}></div>
          <div style={css('font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#C9A65F;margin-bottom:14px')}>Trader affirmation</div>
          <div style={css('display:flex;align-items:flex-start;gap:14px;margin-bottom:18px')}>
            <span style={css('font-family:\'Spectral\',serif;font-size:40px;color:#C9A65F;line-height:.7;flex:none')}>“</span>
            {V.editAffirm ? (
              <input defaultValue={V.affirmation} onBlur={V.commitAffirm} onKeyDown={V.onAffirmKey} autoFocus style={css('flex:1;font-family:\'Spectral\',serif;font-style:italic;font-size:22px;color:#F3E9D2;background:rgba(0,0,0,.25);border:1px solid rgba(201,166,95,.4);border-radius:8px;padding:6px 12px;outline:none')} />
            ) : (
              <Fragment>
                <div onClick={V.startAffirm} title="คลิกเพื่อแก้ไข" style={css('flex:1;font-family:\'Spectral\',serif;font-style:italic;font-size:22px;line-height:1.4;color:#F3E9D2;cursor:text')}>{V.affirmation}</div>
                <div onClick={V.startAffirm} className="hv-op" style={css('flex:none;color:#C9A65F;cursor:pointer;opacity:.7')}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              </Fragment>
            )}
          </div>
          <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
            {V.affirmDetails.map((a, i) => (
              <div key={i} style={css('display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:11px;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.06)')}>
                <span style={css('color:#C9A65F;flex:none')}>▸</span>
                {a.editing ? (
                  <input defaultValue={a.text} onBlur={a.commit} onKeyDown={a.key} autoFocus style={css('flex:1;font-size:13.5px;color:#ECEAE3;background:rgba(0,0,0,.3);border:1px solid rgba(201,166,95,.4);border-radius:7px;padding:4px 9px;outline:none')} />
                ) : (
                  <Fragment>
                    <span onClick={a.edit} style={css('flex:1;font-size:13.5px;color:#D6D2C6;cursor:text;line-height:1.4')}>{a.text}</span>
                    <div onClick={a.del} className="hv-deltext" style={css('flex:none;color:#5E5E68;cursor:pointer')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
                  </Fragment>
                )}
              </div>
            ))}
            <div onClick={V.addAffirmDetail} className="hv-goldbg" style={css('display:flex;align-items:center;justify-content:center;gap:7px;padding:11px 14px;border-radius:11px;background:rgba(0,0,0,.12);border:1px dashed rgba(201,166,95,.3);color:#C9A65F;font-size:13px;cursor:pointer;transition:.14s')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>เพิ่มข้อความ</div>
          </div>
        </div>

        <div style={css('display:grid;grid-template-columns:1fr 300px;gap:16px;align-items:start;animation:rise .5s .1s both')}>
          <div style={css('border-radius:16px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.02);overflow:hidden')}>
            <div style={css('padding:15px 20px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center')}><div style={css('font-family:\'Spectral\',serif;font-size:17px;color:#ECEAE3')}>เช็กลิสต์ก่อนเทรด <span style={css('font-size:12px;color:#5E5E68;font-family:\'Plus Jakarta Sans\'')}>Pre-trade</span></div><span style={css('font-size:11px;color:#5E5E68')}>รีเซ็ตทุกวัน</span></div>
            {V.preItems.map((c, i) => this._renderCheckRow(c, i))}
            <div style={css('display:flex;align-items:center;gap:12px;padding:14px 20px;border-top:1px solid rgba(255,255,255,.05)')}>
              <div style={css('width:22px;height:22px;border-radius:7px;flex:none;border:1.5px dashed rgba(201,166,95,.4);display:flex;align-items:center;justify-content:center;color:#C9A65F')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg></div>
              <input placeholder="เพิ่มรายการก่อนเทรด แล้วกด Enter" onKeyDown={V.addPreKey} style={css('flex:1;font-size:14px;color:#ECEAE3;background:transparent;border:none;outline:none')} />
            </div>
          </div>
          {this._renderReadiness(V.preStroke, V.preOffset, V.prePct, V.preMsg, V.preFrac)}
        </div>
      </div>
    );
  }

  renderVisionBoard(V) {
    return (
      <div style={css('padding:24px 28px 40px;animation:fade .4s both')}>
        <div style={css('display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px;animation:rise .5s both')}>
          <div><div style={css('font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#C9A65F;margin-bottom:6px')}>Vision board</div><div style={css('font-family:\'Spectral\',serif;font-size:28px;color:#ECEAE3')}>เส้นทางสู่ล้านแรก <span style={css('font-style:italic;color:#E2C588')}>— Road to a million</span></div></div>
          <span onClick={V.addVision} className="hv-setbtn" style={css('font-size:12px;font-weight:600;padding:9px 16px;border-radius:9px;cursor:pointer;color:#1a1408;background:linear-gradient(180deg,#E2C588,#C9A65F);display:flex;align-items:center;gap:5px;transition:.14s')}>+ เพิ่มภาพความฝัน</span>
        </div>

        <div style={css('position:relative;overflow:hidden;padding:30px 34px;border-radius:18px;background:linear-gradient(120deg,rgba(201,166,95,.16),rgba(155,140,255,.08));border:1px solid rgba(201,166,95,.26);margin-bottom:16px;animation:rise .5s .05s both')}>
          <div style={css('position:absolute;top:-30%;right:-5%;width:40%;height:90%;background:radial-gradient(circle,rgba(201,166,95,.18),transparent 70%);pointer-events:none')}></div>
          <div style={css('display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:18px')}>
            <div><div style={css('font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#C9A65F;margin-bottom:8px')}>Milestone progress</div><div style={css('font-family:\'Spectral\',serif;font-size:40px;font-weight:600;line-height:1;background:linear-gradient(180deg,#FBF3DF,#C9A65F);-webkit-background-clip:text;background-clip:text;color:transparent')}>{V.milestoneEquity} {V.editGoal ? (
              <input defaultValue={V.goalNum} onBlur={V.commitGoal} onKeyDown={V.onGoalKey} autoFocus style={{ fontFamily: "'Spectral',serif", fontSize: 20, width: 160, color: '#ECEAE3', WebkitTextFillColor: '#ECEAE3', background: 'rgba(0,0,0,.3)', border: '1px solid rgba(201,166,95,.4)', borderRadius: 8, padding: '2px 8px', outline: 'none' }} />
            ) : (
              <span onClick={V.startGoal} title="คลิกเพื่อแก้เป้าหมาย" style={css('font-size:20px;color:#9A9AA4;-webkit-text-fill-color:#9A9AA4;cursor:pointer')}>/ {V.goalStr} ✎</span>
            )}</div></div>
            <div style={css('font-family:\'JetBrains Mono\';font-size:30px;font-weight:600;color:#E2C588')}>{V.milestonePct}</div>
          </div>
          <div style={css('height:14px;border-radius:99px;background:rgba(0,0,0,.35);overflow:hidden;position:relative')}><div style={{ ...css('height:100%;border-radius:99px;background:linear-gradient(90deg,#C9A65F,#E2C588);position:relative;overflow:hidden;transition:width .8s ease'), width: V.milestoneWidth }}><div style={css('position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);animation:sweep 3s ease-in-out infinite')}></div></div></div>
          <div style={css('display:flex;justify-content:space-between;margin-top:10px;font-size:11px;font-family:JetBrains Mono;color:#5E5E68')}><span>$100k start</span><span>$250k</span><span>$500k</span><span>$1M 🏁</span></div>
        </div>

        <div style={css('font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#5E5E68;margin:22px 0 12px')}>สิ่งที่ฝันถึง · ลากรูปมาวางในกรอบได้เลย</div>
        <div style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:16px;animation:rise .5s .12s both')}>
          {V.visionItems.map((v) => (
            <div key={v.id} className="hv-card" style={css('position:relative;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);overflow:hidden;transition:.18s')}>
              <div onClick={v.del} title="ลบ" className="hv-visdel" style={css('position:absolute;top:10px;right:10px;z-index:3;width:28px;height:28px;border-radius:8px;background:rgba(8,8,11,.7);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;color:#ECEAE3;cursor:pointer;transition:.14s')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
              <ImageSlot slotId={'vision-' + v.id} value={this.state.images['vision-' + v.id]} onChange={(p) => this.setImage('vision-' + v.id, p)} placeholder="ลากรูปความฝันมาวาง" style={{ width: '100%', height: '190px' }} />
              <div style={css('padding:14px 16px')}>
                {v.editing ? (
                  <input defaultValue={v.title} onBlur={v.commit} onKeyDown={v.key} autoFocus style={css('width:100%;font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3;background:rgba(0,0,0,.25);border:1px solid rgba(201,166,95,.4);border-radius:7px;padding:5px 10px;outline:none')} />
                ) : (
                  <div onClick={v.edit} style={css('display:flex;align-items:center;gap:8px;cursor:text')}><span style={css('font-family:\'Spectral\',serif;font-size:16px;color:#ECEAE3')}>{v.title}</span><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#5E5E68" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
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
        <div onClick={V.stop} className="rtm-scroll" style={css('width:520px;max-width:92vw;max-height:86vh;overflow-y:auto;border-radius:20px;background:linear-gradient(180deg,#15151c,#0e0e13);border:1px solid rgba(201,166,95,.2);box-shadow:0 50px 120px -30px rgba(0,0,0,.95);animation:pop .3s both')}>
          <div style={css('display:flex;justify-content:space-between;align-items:center;padding:22px 26px;border-bottom:1px solid rgba(255,255,255,.07)')}><div><div style={css('font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#C9A65F;margin-bottom:4px')}>Orders</div><div style={css('font-family:\'Spectral\',serif;font-size:22px;color:#ECEAE3')}>{V.dayTitle}</div></div><div onClick={V.closeDay} className="hv-close" style={css('width:34px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;color:#9A9AA4;cursor:pointer')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div></div>
          <div style={css('padding:18px 22px;display:flex;flex-direction:column;gap:10px')}>
            <div style={css('display:flex;justify-content:space-between;padding:4px 4px 10px;font-size:12px;color:#9A9AA4')}><span>รวม {V.dayCount} ออเดอร์</span><span style={{ ...css('font-family:JetBrains Mono'), color: V.dayPnlColor }}>{V.dayPnlStr}</span></div>
            {V.dayTrades.map((t) => (
              <div key={t.id} onClick={t.open} className="hv-slide" style={{ ...css('display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-radius:13px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);cursor:pointer;transition:.14s'), borderLeft: '3px solid ' + t.accent }}>
                <div><div style={css('font-size:15px;color:#ECEAE3;font-weight:600;margin-bottom:4px')}>{t.sym} <span style={{ ...css('font-size:11px;font-weight:600'), color: t.sideColor }}>{t.side}</span></div><div style={css('font-size:11.5px;color:#9A9AA4')}>{t.setupName} · {t.session} · {t.lotStr} lot · {t.holding}</div></div>
                <div style={css('text-align:right')}><div style={{ ...css('font-family:JetBrains Mono;font-size:15px;font-weight:600'), color: t.pnlColor }}>{t.pnlStr}</div><div style={css('font-size:11px;color:#9A9AA4;font-family:JetBrains Mono')}>{t.rStr}</div></div>
              </div>
            ))}
            <div onClick={V.openNewForDay} className="hv-goldbg" style={css('display:flex;align-items:center;justify-content:center;gap:7px;padding:13px;border-radius:13px;border:1px dashed rgba(201,166,95,.35);color:#C9A65F;font-size:13px;font-weight:600;cursor:pointer;transition:.14s;margin-top:4px')}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>เพิ่มออเดอร์ในวันนี้</div>
          </div>
        </div>
      </div>
    );
  }

  renderTradeModal(V) {
    const fieldInput = (style) => ({ ...css(style), });
    return (
      <div onClick={V.closeTrade} style={css('position:fixed;inset:0;z-index:30;background:rgba(4,4,7,.74);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;animation:fade .25s both')}>
        <div onClick={V.stop} className="rtm-scroll" style={css('width:680px;max-width:94vw;max-height:90vh;overflow-y:auto;border-radius:20px;background:linear-gradient(180deg,#15151c,#0e0e13);border:1px solid rgba(201,166,95,.2);box-shadow:0 50px 120px -30px rgba(0,0,0,.95);animation:pop .3s both')}>
          <div style={css('display:flex;justify-content:space-between;align-items:center;padding:22px 26px;border-bottom:1px solid rgba(255,255,255,.07);position:sticky;top:0;background:rgba(18,18,24,.92);backdrop-filter:blur(8px);z-index:2')}><div><div style={css('font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#C9A65F;margin-bottom:4px')}>{V.tradeModalTag}</div><div style={css('font-family:\'Spectral\',serif;font-size:22px;color:#ECEAE3')}>{V.tradeModalTitle}</div></div><div onClick={V.closeTrade} className="hv-close" style={css('width:34px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;color:#9A9AA4;cursor:pointer')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div></div>
          <div style={css('padding:24px 26px;display:flex;flex-direction:column;gap:16px')}>
            <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px;letter-spacing:.04em')}>พอร์ต (Portfolio)</div><select value={V.dPortfolio} onChange={V.setPortfolio} className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none;cursor:pointer')}>{V.portfolioOptions.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}</select></div>
            <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px;letter-spacing:.04em')}>Symbol</div><input value={V.dSym} onChange={V.setSym} placeholder="XAUUSD" className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none')} /></div>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px;letter-spacing:.04em')}>Setup</div><select value={V.dSetup} onChange={V.setSetup} className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none;cursor:pointer')}>{V.setupOptions.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}</select></div>
            </div>
            <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px;letter-spacing:.04em')}>Direction</div><div style={css('display:flex;gap:10px')}><div onClick={V.setBuy} style={css(V.buyStyle)}>BUY / Long</div><div onClick={V.setSell} style={css(V.sellStyle)}>SELL / Short</div></div></div>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px;letter-spacing:.04em')}>Session</div><select value={V.dSession} onChange={V.setSession} className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none;cursor:pointer')}><option value="Tokyo">Tokyo</option><option value="London">London</option><option value="New York">New York</option></select></div>
            </div>
            <div style={css('display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px')}>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px')}>Entry price</div><input value={V.dEntry} onChange={V.setEntry} placeholder="2418.5" className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none;font-family:JetBrains Mono')} /></div>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px')}>Stop loss</div><input value={V.dStop} onChange={V.setStop} placeholder="2410.0" className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none;font-family:JetBrains Mono')} /></div>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px')}>Target</div><input value={V.dTarget} onChange={V.setTarget} placeholder="2435.0" className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none;font-family:JetBrains Mono')} /></div>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px')}>Lot / Size</div><input value={V.dLot} onChange={V.setLot} placeholder="1.0" className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none;font-family:JetBrains Mono')} /></div>
            </div>
            <div style={css('display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px')}>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px')}>Risk : Reward</div><input value={V.dRR} onChange={V.setRR} placeholder="2.5" className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none;font-family:JetBrains Mono')} /></div>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px')}>P&amp;L (USD)</div><input value={V.dPnl} onChange={V.setPnl} placeholder="1240 หรือ -680" className="hv-focus" style={{ ...css('width:100%;background:rgba(255,255,255,.04);border-radius:10px;padding:11px 14px;font-size:14px;outline:none;font-family:JetBrains Mono'), border: '1px solid ' + V.pnlBorder, color: V.pnlInputColor }} /></div>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px')}>Status</div><select value={V.dStatus} onChange={V.setStatus} style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none;cursor:pointer')}><option value="CLOSED">Closed</option><option value="OPEN">Open</option></select></div>
            </div>
            <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px')}>Entry — เปิดออเดอร์</div><input type="datetime-local" value={V.dEntryTime} onChange={V.setEntryTime} className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px 14px;color:#ECEAE3;font-size:13px;outline:none;font-family:JetBrains Mono;color-scheme:dark')} /></div>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px')}>Exit — ปิดออเดอร์</div><input type="datetime-local" value={V.dExitTime} onChange={V.setExitTime} className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px 14px;color:#ECEAE3;font-size:13px;outline:none;font-family:JetBrains Mono;color-scheme:dark')} /></div>
            </div>
            <div style={css('display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:12px;background:linear-gradient(100deg,rgba(201,166,95,.12),rgba(255,255,255,.02));border:1px solid rgba(201,166,95,.2)')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#E2C588" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <div style={css('font-size:12px;color:#9A9AA4')}>ระยะเวลาถือไม้</div>
              <div style={css('margin-left:auto;font-family:\'JetBrains Mono\';font-size:16px;font-weight:600;color:#E2C588')}>{V.holdingDur}</div>
            </div>
            <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px')}>บันทึก / เหตุผลที่เข้า</div><textarea value={V.dNotes} onChange={V.setNotes} placeholder="ทำไมถึงเข้าเทรดนี้? ตรงกับแผนไหม? อารมณ์ตอนเทรด?" rows="3" className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none;resize:none;line-height:1.5')}></textarea></div>
            <div>
              <div style={css('font-size:11px;color:#9A9AA4;margin-bottom:9px;letter-spacing:.04em')}>Tags / อารมณ์ <span style={css('color:#5E5E68')}>(แตะเพื่อเลือก · ✕ ลบแท็ก · พิมพ์เพิ่มแล้ว Enter)</span></div>
              <div style={css('display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px')}>
                {V.tagList.map((tag) => {
                  const on = V.dTags.includes(tag);
                  return (
                    <span key={tag} onClick={() => V.toggleTag(tag)} style={{ ...css('display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:8px;font-size:12.5px;cursor:pointer;transition:.14s'), background: on ? 'rgba(201,166,95,.16)' : 'rgba(255,255,255,.03)', border: '1px solid ' + (on ? 'rgba(201,166,95,.5)' : 'rgba(255,255,255,.1)'), color: on ? '#E2C588' : '#9A9AA4' }}>
                      {tag}
                      <span onClick={(e) => V.delTag(tag, e)} className="hv-deltext" style={{ color: '#5E5E68', fontSize: 11 }}>✕</span>
                    </span>
                  );
                })}
              </div>
              <input placeholder="เพิ่มแท็กใหม่ เช่น News, ข้ามแผน แล้วกด Enter" onKeyDown={V.addTagKey} className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px 14px;color:#ECEAE3;font-size:13px;outline:none')} />
            </div>
            <div>
              <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:9px')}><div style={css('font-size:11px;color:#9A9AA4;letter-spacing:.04em')}>รูปภาพ / สกรีนช็อตกราฟ <span style={css('color:#5E5E68')}>(แนบได้หลายรูป)</span></div><span onClick={V.addImg} className="hv-op" style={css('font-size:11.5px;color:#C9A65F;cursor:pointer;display:flex;align-items:center;gap:4px')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>เพิ่มรูป</span></div>
              <div style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:10px')}>
                {V.tradeImgs.map((im) => (
                  <ImageSlot key={im.n} slotId={'trade-' + im.tid + '-img-' + im.n} value={this.state.images['trade-' + im.tid + '-img-' + im.n]} onChange={(p) => this.setImage('trade-' + im.tid + '-img-' + im.n, p)} rounded placeholder="ลากรูปกราฟมาวาง" style={{ width: '100%', height: '120px' }} />
                ))}
              </div>
            </div>
            <div style={css('display:flex;gap:12px;margin-top:4px')}>
              {V.canDelete && (
                <div onClick={V.deleteTrade} className="hv-deloutline" style={css('flex:none;padding:13px 18px;border-radius:11px;border:1px solid rgba(220,106,99,.4);color:#DC6A63;font-size:14px;font-weight:600;cursor:pointer;transition:.14s')}>ลบ</div>
              )}
              {V.canDuplicate && (
                <div onClick={V.duplicateTrade} className="hv-lift" title="คัดลอกเป็นออเดอร์ใหม่" style={css('flex:none;padding:13px 18px;border-radius:11px;border:1px solid rgba(201,166,95,.35);color:#E2C588;font-size:14px;font-weight:600;cursor:pointer;transition:.14s')}>คัดลอก</div>
              )}
              <div onClick={V.closeTrade} className="hv-cancel" style={css('flex:1;text-align:center;padding:13px;border-radius:11px;border:1px solid rgba(255,255,255,.12);color:#9A9AA4;font-size:14px;font-weight:600;cursor:pointer')}>ยกเลิก</div>
              <div onClick={V.saveTrade} className="hv-save" style={css('flex:1.4;text-align:center;padding:13px;border-radius:11px;background:linear-gradient(150deg,#E2C588,#C9A65F);color:#1a1408;font-size:14px;font-weight:700;cursor:pointer;transition:.15s')}>บันทึก</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  renderPlanModal(V) {
    return (
      <div onClick={V.planClose} style={css('position:fixed;inset:0;z-index:40;background:rgba(4,4,7,.74);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;animation:fade .25s both')}>
        <div onClick={V.stop} className="rtm-scroll" style={css('width:540px;max-width:94vw;max-height:88vh;overflow-y:auto;border-radius:20px;background:linear-gradient(180deg,#15151c,#0e0e13);border:1px solid rgba(201,166,95,.25);box-shadow:0 50px 120px -30px rgba(0,0,0,.95);animation:pop .3s both')}>
          <div style={css('position:relative;overflow:hidden;padding:24px 26px;border-bottom:1px solid rgba(255,255,255,.07);background:linear-gradient(120deg,rgba(201,166,95,.16),rgba(155,140,255,.08))')}>
            <div style={css('position:absolute;top:-40%;right:-5%;width:40%;height:160%;background:radial-gradient(circle,rgba(201,166,95,.18),transparent 70%);pointer-events:none')}></div>
            <div style={css('display:flex;justify-content:space-between;align-items:flex-start')}>
              <div>
                <div style={css('display:flex;align-items:center;gap:8px;margin-bottom:6px')}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#E2C588" strokeWidth="1.8"><path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="9"/></svg><span style={css('font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#C9A65F')}>{V.planTag}</span></div>
                <div style={css('font-family:\'Spectral\',serif;font-size:23px;color:#ECEAE3')}>{V.planTitle}</div>
                <div style={css('font-size:12.5px;color:#9A9AA4;margin-top:4px')}>เตรียมแผนล่วงหน้าก่อนรอบใหม่จะเริ่ม · <span style={css('color:#E2C588')}>{V.planLabel}</span></div>
              </div>
              <div onClick={V.planClose} className="hv-close" style={css('width:34px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;color:#9A9AA4;cursor:pointer;flex:none')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
            </div>
          </div>
          <div style={css('padding:10px 8px')}>
            {V.planItems.map((c, i) => (
              <div key={i} className="hv-chk" onClick={c.toggle} style={{ ...css('display:flex;align-items:center;gap:14px;padding:14px 20px;cursor:pointer;transition:.14s'), borderTop: c.border }}>
                <div style={{ ...css('width:22px;height:22px;border-radius:7px;flex:none;display:flex;align-items:center;justify-content:center;transition:.16s'), border: c.boxBorder, background: c.boxBg }}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#1a1408" strokeWidth="3" style={{ opacity: c.checkOp }}><path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                <span style={{ ...css('flex:1;font-size:14px'), color: c.textColor, textDecoration: c.strike }}>{c.text}</span>
              </div>
            ))}
          </div>
          <div style={css('display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 22px;border-top:1px solid rgba(255,255,255,.07)')}>
            <span style={css('font-size:12px;color:#5E5E68;font-family:JetBrains Mono')}>เสร็จ {V.planFrac}</span>
            <div onClick={V.planClose} className="hv-save" style={css('padding:11px 22px;border-radius:11px;background:linear-gradient(150deg,#E2C588,#C9A65F);color:#1a1408;font-size:14px;font-weight:700;cursor:pointer;transition:.15s')}>เสร็จแล้ว</div>
          </div>
        </div>
      </div>
    );
  }

  renderResetModal(V) {
    return (
      <div onClick={V.closeReset} style={css('position:fixed;inset:0;z-index:40;background:rgba(4,4,7,.74);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;animation:fade .25s both')}>
        <div onClick={V.stop} style={css('width:440px;max-width:92vw;border-radius:20px;background:linear-gradient(180deg,#1a1014,#0e0e13);border:1px solid rgba(220,106,99,.3);box-shadow:0 50px 120px -30px rgba(0,0,0,.95);animation:pop .3s both;padding:28px 28px 24px;text-align:center')}>
          <div style={{ width: 54, height: 54, margin: '0 auto 16px', borderRadius: 14, background: 'rgba(220,106,99,.12)', border: '1px solid rgba(220,106,99,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#DC6A63" strokeWidth="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div style={css('font-family:\'Spectral\',serif;font-size:22px;color:#ECEAE3;margin-bottom:10px')}>ล้างข้อมูลทั้งหมด?</div>
          <div style={css('font-size:13.5px;color:#9A9AA4;line-height:1.6;margin-bottom:22px')}>การเทรด พอร์ต เช็กลิสต์ และรูปที่อ้างอิงไว้ จะถูกลบและกลับเป็นค่าเริ่มต้น <b style={css('color:#DC6A63')}>การกระทำนี้ย้อนกลับไม่ได้</b></div>
          <div style={css('display:flex;gap:12px')}>
            <div onClick={V.closeReset} className="hv-cancel" style={css('flex:1;text-align:center;padding:13px;border-radius:11px;border:1px solid rgba(255,255,255,.14);color:#9A9AA4;font-size:14px;font-weight:600;cursor:pointer')}>ยกเลิก</div>
            <div onClick={V.doReset} className="hv-deloutline" style={css('flex:1;text-align:center;padding:13px;border-radius:11px;border:1px solid rgba(220,106,99,.5);background:rgba(220,106,99,.12);color:#DC6A63;font-size:14px;font-weight:700;cursor:pointer;transition:.14s')}>ยืนยันล้างข้อมูล</div>
          </div>
        </div>
      </div>
    );
  }

  renderSetupModal(V) {
    return (
      <div onClick={V.closeSetup} style={css('position:fixed;inset:0;z-index:30;background:rgba(4,4,7,.74);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;animation:fade .25s both')}>
        <div onClick={V.stop} className="rtm-scroll" style={css('width:660px;max-width:94vw;max-height:90vh;overflow-y:auto;border-radius:20px;background:linear-gradient(180deg,#15151c,#0e0e13);border:1px solid rgba(201,166,95,.2);box-shadow:0 50px 120px -30px rgba(0,0,0,.95);animation:pop .3s both')}>
          <div style={css('display:flex;justify-content:space-between;align-items:center;padding:22px 26px;border-bottom:1px solid rgba(255,255,255,.07);position:sticky;top:0;background:rgba(18,18,24,.92);backdrop-filter:blur(8px);z-index:2')}><div><div style={css('font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#C9A65F;margin-bottom:4px')}>{V.setupModalTag}</div><div style={css('font-family:\'Spectral\',serif;font-size:22px;color:#ECEAE3')}>{V.setupModalTitle}</div></div><div onClick={V.closeSetup} className="hv-close" style={css('width:34px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;color:#9A9AA4;cursor:pointer')}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div></div>
          <div style={css('padding:24px 26px;display:flex;flex-direction:column;gap:16px')}>
            <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px;letter-spacing:.04em')}>ชื่อ Setup</div><input value={V.sName} onChange={V.setSName} placeholder="เช่น Rally" className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none')} /></div>
              <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px;letter-spacing:.04em')}>สีประจำ setup</div><div style={css('display:flex;gap:8px;align-items:center;height:42px')}>
                {V.accentChoices.map((ac, i) => (
                  <div key={i} onClick={ac.pick} className="hv-scale" style={{ ...css('width:28px;height:28px;border-radius:8px;cursor:pointer;transition:.14s'), background: ac.color, border: ac.border }}></div>
                ))}
              </div></div>
            </div>
            {V.showSetupStats && (
              <div style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:10px')}>
                {V.setupStats.map((s, i) => (
                  <div key={i} style={css('padding:12px 14px;border-radius:11px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)')}><div style={css('font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#5E5E68;margin-bottom:6px')}>{s.l}</div><div style={{ ...css('font-family:\'JetBrains Mono\';font-size:16px;font-weight:600'), color: s.c }}>{s.v}</div></div>
                ))}
              </div>
            )}
            <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px;letter-spacing:.04em')}>คำอธิบายสั้น</div><input value={V.sDesc} onChange={V.setSDesc} placeholder="เทรนด์ขาขึ้นต่อเนื่อง เข้าที่ pullback" className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none')} /></div>
            <div><div style={css('font-size:11px;color:#9A9AA4;margin-bottom:7px;letter-spacing:.04em')}>วิธีใช้ / เงื่อนไขการเข้า — How to use</div><textarea value={V.sUsage} onChange={V.setSUsage} placeholder="อธิบายว่า setup นี้ใช้ยังไง เข้าเมื่อไหร่ ตั้ง SL/TP ตรงไหน..." rows="5" className="hv-focus" style={css('width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#ECEAE3;font-size:14px;outline:none;resize:none;line-height:1.6')}></textarea></div>
            <div>
              <div style={css('display:flex;justify-content:space-between;align-items:center;margin-bottom:9px')}><div style={css('font-size:11px;color:#9A9AA4;letter-spacing:.04em')}>กราฟตัวอย่างการเข้าออเดอร์ของ setup นี้ <span style={css('color:#5E5E68')}>(หลายรูปได้)</span></div>{V.canAddSetupImg && <span onClick={V.addSetupImg} className="hv-op" style={css('font-size:11.5px;color:#C9A65F;cursor:pointer;display:flex;align-items:center;gap:4px')}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>เพิ่มรูป</span>}</div>
              <div style={css('display:grid;grid-template-columns:repeat(2,1fr);gap:10px')}>
                {V.setupImgs.map((im) => (
                  <ImageSlot key={im.n} slotId={im.slotId} value={this.state.images[im.slotId]} onChange={(p) => this.setImage(im.slotId, p)} rounded placeholder="ลากรูปกราฟตัวอย่างมาวาง" style={{ width: '100%', height: '220px' }} />
                ))}
              </div>
            </div>
            <div style={css('display:flex;gap:12px;margin-top:4px')}>
              {V.canDeleteSetup && (
                <div onClick={V.deleteSetup} className="hv-deloutline" style={css('flex:none;padding:13px 18px;border-radius:11px;border:1px solid rgba(220,106,99,.4);color:#DC6A63;font-size:14px;font-weight:600;cursor:pointer;transition:.14s')}>ลบ</div>
              )}
              <div onClick={V.closeSetup} className="hv-cancel" style={css('flex:1;text-align:center;padding:13px;border-radius:11px;border:1px solid rgba(255,255,255,.12);color:#9A9AA4;font-size:14px;font-weight:600;cursor:pointer')}>ยกเลิก</div>
              <div onClick={V.saveSetup} className="hv-save" style={css('flex:1.4;text-align:center;padding:13px;border-radius:11px;background:linear-gradient(150deg,#E2C588,#C9A65F);color:#1a1408;font-size:14px;font-weight:700;cursor:pointer;transition:.15s')}>บันทึก</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  render() {
    const V = this.renderVals();
    const navIcon = (style, onClick, title, path) => (
      <div onClick={onClick} title={title} className="hv-nav" style={css(style)}>{path}</div>
    );
    return (
      <div style={css('position:fixed;inset:0;display:flex;background:#08080B')}>

        <div style={css('position:absolute;inset:0;pointer-events:none;overflow:hidden')}>
          <div style={css('position:absolute;top:-12%;right:8%;width:42%;height:55%;background:radial-gradient(circle,rgba(201,166,95,.13),transparent 66%);animation:drift1 20s ease-in-out infinite')}></div>
          <div style={css('position:absolute;bottom:-16%;left:2%;width:40%;height:58%;background:radial-gradient(circle,rgba(123,167,217,.09),transparent 66%);animation:drift2 26s ease-in-out infinite')}></div>
          <div style={css('position:absolute;top:34%;left:42%;width:34%;height:46%;background:radial-gradient(circle,rgba(155,140,255,.07),transparent 66%);animation:drift1 30s ease-in-out infinite')}></div>
        </div>

        {/* ICON RAIL */}
        <div style={css('position:relative;z-index:2;width:72px;flex:none;display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px 0;border-right:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.32);backdrop-filter:blur(8px)')}>
          <div style={css('width:38px;height:38px;border-radius:11px;background:linear-gradient(145deg,rgba(201,166,95,.34),rgba(201,166,95,.06));box-shadow:0 0 0 1px rgba(201,166,95,.28),0 6px 18px -8px rgba(201,166,95,.55);display:flex;align-items:center;justify-content:center;margin-bottom:10px')}><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#E2C588" strokeWidth="1.7"><path d="M3 17l5-5 4 3 6-8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
          {navIcon(V.navDash, V.goDash, 'Dashboard', <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>)}
          {navIcon(V.navCal, V.goCal, 'Calendar', <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>)}
          {navIcon(V.navLog, V.goLog, 'Trade Log', <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 6h16M4 12h16M4 18h10"/></svg>)}
          {navIcon(V.navAna, V.goAna, 'Analytics', <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 19V5M4 19h16M8 16v-5M13 16V8M18 16v-8" strokeLinecap="round"/></svg>)}
          {navIcon(V.navSet, V.goSet, 'Setups', <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 2l2.4 5.8L20 9l-4.5 3.9L17 19l-5-3-5 3 1.5-6.1L4 9l5.6-1.2z" strokeLinejoin="round"/></svg>)}
          {navIcon(V.navCheck, V.goCheck, 'Checklist', <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeLinecap="round"/></svg>)}
          {navIcon(V.navPlay, V.goPlay, 'Playbook', <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 4h11a3 3 0 013 3v13a2.5 2.5 0 00-2.5-2.5H4z"/><path d="M4 4a2 2 0 00-2 2v12a2 2 0 002 2"/></svg>)}
          {navIcon(V.navVision, V.goVision, 'Vision Board', <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></svg>)}
          <div onClick={V.openNew} title="Log a trade" className="hv-addbtn" style={css('margin-top:auto;width:44px;height:44px;border-radius:13px;background:linear-gradient(150deg,#E2C588,#C9A65F);display:flex;align-items:center;justify-content:center;color:#1a1408;cursor:pointer;transition:.16s;box-shadow:0 10px 24px -10px rgba(201,166,95,.8)')}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg></div>
        </div>

        {/* MAIN COLUMN */}
        <div style={css('position:relative;z-index:1;flex:1;min-width:0;display:flex;flex-direction:column')}>

          {/* TOPBAR */}
          <div style={css('position:relative;z-index:40;flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 28px;border-bottom:1px solid rgba(255,255,255,.07);background:rgba(10,10,13,.55);backdrop-filter:blur(14px)')}>
            <div style={css('display:flex;align-items:baseline;gap:16px;min-width:0')}>
              {V.editName ? (
                <input defaultValue={V.accountName} onBlur={V.commitName} onKeyDown={V.onNameKey} autoFocus style={css('font-family:\'Spectral\',serif;font-size:21px;font-weight:500;color:#ECEAE3;background:rgba(201,166,95,.08);border:1px solid rgba(201,166,95,.4);border-radius:8px;padding:3px 10px;outline:none;width:220px')} />
              ) : (
                <div onClick={V.startName} title="คลิกเพื่อแก้ชื่อ" className="hv-op" style={css('display:flex;align-items:center;gap:8px;cursor:text')}><span style={css('font-family:\'Spectral\',serif;font-size:21px;font-weight:500;color:#ECEAE3;letter-spacing:-.01em')}>{V.accountName}</span><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#5E5E68" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              )}
              <span style={css('font-family:\'JetBrains Mono\',monospace;font-size:13px;color:#C9A65F')}><span id="rtm-clock">{V.clock}</span> <span style={css('color:#5E5E68')}>{V.tzAbbr}</span></span>
            </div>
            <div style={css('display:flex;align-items:center;gap:10px')}>
              <div style={css('display:flex;gap:6px')}>
                {V.sessions.map((s, i) => (
                  <div key={i} style={{ ...css('display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;font-size:11px'), border: '1px solid ' + (s.active ? 'rgba(95,192,141,.3)' : 'rgba(255,255,255,.08)'), color: s.active ? '#ECEAE3' : '#5E5E68' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: s.active ? '#5FC08D' : '#5E5E68', animation: s.active ? 'pulse 2.2s infinite' : 'none' }}></span>{s.label}</div>
                ))}
              </div>
              <div style={{ position: 'relative' }} onMouseDown={(e) => e.stopPropagation()}>
                <div onClick={V.togglePortMenu} className="hv-port" style={css('display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:7px 13px;font-size:12.5px;font-weight:500;color:#ECEAE3;cursor:pointer;transition:.15s')}>{V.currentPortfolioName}<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#9A9AA4" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg></div>
                {V.showPortMenu && (
                  <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 30, minWidth: 210, background: 'linear-gradient(180deg,#15151c,#0e0e13)', border: '1px solid rgba(201,166,95,.2)', borderRadius: 12, boxShadow: '0 24px 60px -20px rgba(0,0,0,.9)', padding: 6, animation: 'pop .18s both' }}>
                    <div onClick={() => V.selectPortfolio('all')} className="hv-chk" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: V.currentPortfolioId === 'all' ? '#E2C588' : '#ECEAE3' }}>ทุกพอร์ต</div>
                    {V.portfolios.map((p) => (
                      <div key={p.id} onClick={() => V.selectPortfolio(p.id)} className="hv-chk" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: V.currentPortfolioId === p.id ? '#E2C588' : '#ECEAE3' }}>
                        <span>{p.name}</span>
                        <span onClick={(e) => V.delPortfolio(p.id, e)} className="hv-deltext" style={{ color: '#5E5E68', cursor: 'pointer', paddingLeft: 10 }}>✕</span>
                      </div>
                    ))}
                    <div onClick={V.openAccount} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px', marginTop: 4, borderTop: '1px solid rgba(255,255,255,.07)', cursor: 'pointer', fontSize: 13, color: '#C9A65F' }}>+ เพิ่ม / จัดการพอร์ต</div>
                  </div>
                )}
              </div>
              <div style={{ position: 'relative' }} onMouseDown={(e) => e.stopPropagation()}>
                <div onClick={V.toggleUserMenu} title="บัญชีของฉัน" className="hv-lift" style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(201,166,95,.12)', border: '1px solid rgba(201,166,95,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#E2C588', cursor: 'pointer', fontFamily: "'Spectral',serif", transition: '.15s' }}>{V.avatarLetter}</div>
                {V.showUserMenu && (
                  <div style={{ position: 'absolute', top: '120%', right: 0, zIndex: 30, minWidth: 220, background: 'linear-gradient(180deg,#15151c,#0e0e13)', border: '1px solid rgba(201,166,95,.2)', borderRadius: 12, boxShadow: '0 24px 60px -20px rgba(0,0,0,.9)', padding: 6, animation: 'pop .18s both' }}>
                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#9A9AA4', borderBottom: '1px solid rgba(255,255,255,.07)', marginBottom: 4, wordBreak: 'break-all' }}>{V.userEmail || 'บัญชีของฉัน'}</div>
                    <div onClick={V.openAccount} className="hv-chk" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#ECEAE3' }}>บัญชี &amp; พอร์ต</div>
                    <div onClick={() => { this.setState({ showUserMenu: false }); this.setView('playbook'); }} className="hv-chk" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#ECEAE3' }}>Playbook · หลักคิด</div>
                    <div onClick={V.togglePlanReminders} className="hv-chk" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#ECEAE3' }}>เตือนวางแผน<span style={{ fontSize: 11, fontWeight: 700, color: V.planReminders ? '#5FC08D' : '#5E5E68' }}>{V.planReminders ? 'เปิด' : 'ปิด'}</span></div>
                    <div onClick={V.openReset} className="hv-deltext" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#DC6A63', borderTop: '1px solid rgba(255,255,255,.07)', marginTop: 4 }}>ล้างข้อมูลทั้งหมด (Reset)</div>
                    <div onClick={V.signOut} className="hv-deltext" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#DC6A63' }}>ออกจากระบบ</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TICKER */}
          <div style={css('flex:none;height:32px;overflow:hidden;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.25);display:flex;align-items:center')}>
            <div style={css('display:flex;white-space:nowrap;animation:ticker 38s linear infinite')}>
              <span style={css('display:inline-flex;gap:30px;padding-right:30px;font-family:\'JetBrains Mono\';font-size:12px;align-items:center')}>{V.tickerA}</span>
              <span style={css('display:inline-flex;gap:30px;padding-right:30px;font-family:\'JetBrains Mono\';font-size:12px;align-items:center')}>{V.tickerB}</span>
            </div>
          </div>

          {/* VIEWPORT */}
          <div className="rtm-scroll" style={css('flex:1;min-height:0;overflow-y:auto;overflow-x:hidden')}>
            {V.isAccount && this.renderAccount(V)}
            {V.isDash && this.renderDashboard(V)}
            {V.isCal && this.renderCalendar(V)}
            {V.isLog && this.renderTradeLog(V)}
            {V.isAna && this.renderAnalytics(V)}
            {V.isSet && this.renderSetups(V)}
            {V.isCheck && this.renderChecklist(V)}
            {V.isPlay && this.renderPlaybook(V)}
            {V.isVision && this.renderVisionBoard(V)}
          </div>
        </div>

        {V.showDay && this.renderDayModal(V)}
        {V.showTrade && this.renderTradeModal(V)}
        {V.showSetup && this.renderSetupModal(V)}
        {V.showReset && this.renderResetModal(V)}
        {V.showPlan && this.renderPlanModal(V)}
      </div>
    );
  }
}

export default App;
