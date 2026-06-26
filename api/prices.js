// Vercel Serverless Function — ดึงราคาเรียลไทม์จาก Yahoo Finance
// (เรียกจาก browser ตรงๆ ติด CORS เลยต้อง proxy ผ่านฝั่ง server)
// เรียกใช้: GET /api/prices

const SYMBOLS = [
  { label: 'XAUUSD', y: 'GC=F' },
  { label: 'EURUSD', y: 'EURUSD=X' },
  { label: 'GBPJPY', y: 'GBPJPY=X' },
  { label: 'US30', y: '^DJI' },
  { label: 'NAS100', y: '^NDX' },
  { label: 'BTCUSD', y: 'BTC-USD' },
  { label: 'USDJPY', y: 'USDJPY=X' },
  { label: 'NVDA', y: 'NVDA' },
  { label: 'GOOG', y: 'GOOG' },
  { label: 'AAPL', y: 'AAPL' },
  { label: 'TSLA', y: 'TSLA' },
  { label: 'MSFT', y: 'MSFT' },
];

function fmtPrice(p) {
  if (p == null || isNaN(p)) return '—';
  if (Math.abs(p) < 10) return p.toFixed(4);
  if (Math.abs(p) < 1000) return p.toFixed(2);
  return Math.round(p).toLocaleString('en-US');
}

// placeholder เวลาดึงไม่สำเร็จ — คืนทุก symbol เสมอเพื่อไม่ให้แถบมีช่องว่าง
function blank(item) {
  return { label: item.label, price: '—', changePct: '·', up: true, ok: false };
}

async function fetchFrom(host, item) {
  const url = `https://${host}/v8/finance/chart/${encodeURIComponent(item.y)}?interval=1d&range=2d`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) return null;
  const j = await r.json();
  const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!m) return null;
  const price = m.regularMarketPrice;
  const prev = m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose;
  if (price == null) return null;
  const pct = prev ? ((price - prev) / prev) * 100 : 0;
  const up = pct >= 0;
  return {
    label: item.label,
    price: fmtPrice(price),
    changePct: (up ? '+' : '−') + Math.abs(pct).toFixed(2) + '%',
    up,
    ok: true,
  };
}

// ลองหลาย host ของ Yahoo (บางตัว rate-limit เป็นช่วงๆ) — กันสินทรัพย์หลุดหาย
async function fetchOne(item) {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const res = await fetchFrom(host, item);
      if (res) return res;
    } catch (e) { /* ลอง host ถัดไป */ }
  }
  return blank(item);
}

export default async function handler(req, res) {
  try {
    // คืนครบทุก symbol เสมอ (ตัวที่ดึงไม่ได้จะเป็น placeholder) เพื่อให้แถบราคาต่อเนื่องไม่มีช่องว่าง
    const data = await Promise.all(SYMBOLS.map(fetchOne));
    // cache ที่ edge 20 วิ ลดจำนวนการยิงไป Yahoo
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');
    res.status(200).json({ data, ts: Date.now() });
  } catch (e) {
    res.status(200).json({ data: SYMBOLS.map(blank), error: String(e) });
  }
}
