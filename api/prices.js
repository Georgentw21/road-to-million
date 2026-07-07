// Vercel Serverless Function — realtime prices proxy.
// Crypto is pulled from Binance (rock-solid from a server, 24/7 — always moving) and
// listed first; the rest come from Yahoo. Called from the browser: GET /api/prices
// `b` = Binance symbol, `y` = Yahoo symbol.
const SYMBOLS = [
  { label: 'BTCUSD', b: 'BTCUSDT', y: 'BTC-USD' },
  { label: 'ETHUSD', b: 'ETHUSDT', y: 'ETH-USD' },
  { label: 'SOLUSD', b: 'SOLUSDT', y: 'SOL-USD' },
  { label: 'XRPUSD', b: 'XRPUSDT', y: 'XRP-USD' },
  { label: 'BNBUSD', b: 'BNBUSDT', y: 'BNB-USD' },
  { label: 'DOGEUSD', b: 'DOGEUSDT', y: 'DOGE-USD' },
  { label: 'XAUUSD', y: 'GC=F' },
  { label: 'EURUSD', y: 'EURUSD=X' },
  { label: 'GBPJPY', y: 'GBPJPY=X' },
  { label: 'USDJPY', y: 'USDJPY=X' },
  { label: 'US30', y: '^DJI' },
  { label: 'NAS100', y: '^NDX' },
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

// Binance 24hr ticker — very reliable from a server, always live for crypto.
async function fetchBinance(item) {
  // data-api.binance.vision is the geo-neutral public market-data host (no region block); try it first.
  const hosts = ['data-api.binance.vision', 'api.binance.com', 'api.binance.us'];
  for (const host of hosts) {
    try {
      const r = await fetch(`https://${host}/api/v3/ticker/24hr?symbol=${item.b}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      const j = await r.json();
      const price = parseFloat(j.lastPrice);
      const pct = parseFloat(j.priceChangePercent);
      if (!isFinite(price)) continue;
      const up = !(pct < 0);
      return { label: item.label, price: fmtPrice(price), changePct: (up ? '+' : '−') + Math.abs(isFinite(pct) ? pct : 0).toFixed(2) + '%', up, ok: true };
    } catch (e) { /* try next host */ }
  }
  return null;
}

// try several Yahoo hosts (they rate-limit in bursts)
async function fetchYahoo(item) {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const res = await fetchFrom(host, item);
      if (res) return res;
    } catch (e) { /* next host */ }
  }
  return null;
}

async function fetchOne(item) {
  // crypto: Binance first (24/7, reliable), Yahoo as backup
  if (item.b) { const c = await fetchBinance(item); if (c) return c; }
  if (item.y) { const y = await fetchYahoo(item); if (y) return y; }
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
