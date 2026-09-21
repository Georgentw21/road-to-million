// Pure calculation helpers for every surface that displays performance.
// The UI stores gross P&L and a commission/swap cost. Analytics always works
// with a normalized copy whose `pnl` is net, so fees can never be applied twice.

export function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function commissionCost(value) {
  // Broker exports commonly represent a fee as -3.20 while the manual form asks
  // for 3.20. In both cases it is a cost, not trading profit.
  return Math.abs(finiteNumber(value));
}

export function netPnlFromTrade(trade) {
  return finiteNumber(trade && trade.pnl) - commissionCost(trade && trade.commission);
}

export function tradeLegs(trade) {
  const raw = Array.isArray(trade && trade.legs)
    ? trade.legs.filter((leg) => leg && (leg.price || leg.lot || leg.risk || leg.dd || leg.trigger || leg.retest || leg.fibo))
    : [];
  if (raw.length) return raw;
  if (trade && ((trade.entry != null && trade.entry !== '') || (trade.lot != null && trade.lot !== ''))) {
    return [{
      trigger: trade.entryType || '', price: trade.entry || '', lot: trade.lot || '',
      slBasis: '', risk: trade.risk || '', dd: '',
    }];
  }
  return [];
}

export function positionRisk(trade) {
  const legRisk = tradeLegs(trade).reduce((sum, leg) => sum + Math.abs(finiteNumber(leg.risk)), 0);
  return legRisk > 0 ? legRisk : Math.abs(finiteNumber(trade && trade.risk));
}

// Expects a normalized trade whose pnl is already net of costs.
export function realizedRFromNetTrade(trade) {
  if (!trade || trade.status === 'OPEN') return 0;
  const pnl = finiteNumber(trade.pnl);
  const risk = positionRisk(trade);
  if (risk > 0) return pnl / risk;
  // Legacy rows may not have money risk. Keep the historical approximation,
  // but never pretend a losing trade lost more/less than one R without evidence.
  if (pnl < 0) return -1;
  if (pnl > 0) return Math.abs(finiteNumber(trade.rr));
  return 0;
}

export function summarizeNetTrades(trades) {
  const closed = (trades || []).filter((trade) => trade && trade.status !== 'OPEN');
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let net = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let rSum = 0;
  const rValues = [];

  closed.forEach((trade) => {
    const pnl = finiteNumber(trade.pnl);
    const r = realizedRFromNetTrade(trade);
    net += pnl;
    rSum += r;
    rValues.push(r);
    if (pnl > 0) { wins += 1; grossProfit += pnl; }
    else if (pnl < 0) { losses += 1; grossLoss += Math.abs(pnl); }
    else breakevens += 1;
  });

  return {
    closed,
    count: closed.length,
    wins,
    losses,
    breakevens,
    net,
    grossProfit,
    grossLoss,
    winRate: closed.length ? wins / closed.length * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0),
    expectancy: closed.length ? net / closed.length : 0,
    avgR: closed.length ? rSum / closed.length : 0,
    rValues,
  };
}

export function rSeriesStats(values) {
  const rs = (values || []).map(finiteNumber);
  let grossWin = 0;
  let grossLoss = 0;
  let wins = 0;
  let curve = 0;
  let peak = 0;
  let maxDrawdownR = 0;

  rs.forEach((r) => {
    if (r > 0) { grossWin += r; wins += 1; }
    else if (r < 0) grossLoss += Math.abs(r);
    curve += r;
    peak = Math.max(peak, curve);
    maxDrawdownR = Math.max(maxDrawdownR, peak - curve);
  });

  const avgR = rs.length ? rs.reduce((sum, r) => sum + r, 0) / rs.length : 0;
  let sampleStdDev = 0;
  if (rs.length > 1) {
    const variance = rs.reduce((sum, r) => sum + Math.pow(r - avgR, 2), 0) / (rs.length - 1);
    sampleStdDev = Math.sqrt(variance);
  }
  // Unknown population variance => Student's t, not a z-score. The distinction
  // still matters around our 30-trade gate (t=2.045 vs z=1.960).
  const df = rs.length - 1;
  const tTable = [
    12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
    2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
    2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042,
  ];
  const tCritical95 = df <= 0 ? Infinity
    : (df <= 30 ? tTable[df - 1]
      : (df <= 40 ? 2.021 : (df <= 60 ? 2.000 : (df <= 120 ? 1.980 : 1.960))));
  const margin95 = rs.length > 1 ? tCritical95 * sampleStdDev / Math.sqrt(rs.length) : Infinity;

  return {
    n: rs.length,
    avgR,
    grossWin,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0),
    winRate: rs.length ? wins / rs.length * 100 : 0,
    maxDrawdownR,
    sampleStdDev,
    ciLow: Number.isFinite(margin95) ? avgR - margin95 : -Infinity,
    ciHigh: Number.isFinite(margin95) ? avgR + margin95 : Infinity,
  };
}

export function setupEvidenceFromNetTrades(trades) {
  const closed = (trades || [])
    .filter((trade) => trade && trade.status !== 'OPEN')
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.entryTime || '').localeCompare(String(b.entryTime || '')));
  const all = rSeriesStats(closed.map(realizedRFromNetTrade));
  // The final third is never used to discover the setup. With the 30-trade
  // review floor this guarantees a 10-trade chronological holdout.
  const splitIndex = closed.length >= 30 ? Math.max(20, Math.floor(closed.length * 2 / 3)) : closed.length;
  const training = rSeriesStats(closed.slice(0, splitIndex).map(realizedRFromNetTrade));
  const holdout = rSeriesStats(closed.slice(splitIndex).map(realizedRFromNetTrade));
  return {
    ...all,
    training,
    holdout,
    holdoutReady: holdout.n >= 10,
    holdoutPass: holdout.n >= 10 && holdout.avgR > 0,
  };
}

export function equityDrawdownPercent({ trades = [], startingBalance = 0, archivedPnl = 0, cashFlows = [] } = {}) {
  let equity = finiteNumber(startingBalance) + finiteNumber(archivedPnl);
  let peak = equity;
  let maxDrawdownPct = 0;
  const series = [0];
  const events = [];

  cashFlows.forEach((flow, index) => {
    events.push({
      kind: 'cash',
      order: 0,
      key: String(flow && flow.date || '') + '|0|' + String(index).padStart(8, '0'),
      amount: finiteNumber(flow && flow.amount),
    });
  });
  (trades || []).filter((trade) => trade && trade.status !== 'OPEN').forEach((trade, index) => {
    events.push({
      kind: 'trade',
      order: 1,
      key: String(trade.date || '') + '|1|' + String(trade.entryTime || '') + '|' + String(index).padStart(8, '0'),
      amount: finiteNumber(trade.pnl),
    });
  });
  events.sort((a, b) => a.key.localeCompare(b.key) || a.order - b.order);

  events.forEach((event) => {
    if (event.kind === 'cash') {
      // External capital must not create or erase trading drawdown in dollars.
      equity += event.amount;
      peak += event.amount;
      if (equity > peak) peak = equity;
      return;
    } else {
      equity += event.amount;
      if (equity > peak) peak = equity;
    }
    const drawdownPct = peak > 0 ? Math.max(0, (peak - equity) / peak * 100) : 0;
    series.push(drawdownPct);
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
  });

  return { maxDrawdownPct, series, endingEquity: equity, peakEquity: peak };
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function hasOutcome(trade) {
  if (!trade || trade._pnlValid === false || !hasValue(trade.pnl)) return false;
  return Number.isFinite(Number(trade.pnl));
}

function isValidDate(value) {
  if (!hasValue(value)) return false;
  const date = new Date(String(value).slice(0, 10) + 'T00:00:00');
  return Number.isFinite(date.getTime());
}

function validResearchTrades(trades) {
  return (trades || [])
    .filter((trade) => trade && trade.status !== 'OPEN' && hasOutcome(trade) && positionRisk(trade) > 0)
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))
      || String(a.entryTime || '').localeCompare(String(b.entryTime || '')));
}

// A transparent completeness score for the fields that make a trade useful as
// research evidence. Risk and outcome carry the most weight because without
// them expectancy in R cannot be calculated honestly.
export function dataQualityReport(trades) {
  const closed = (trades || []).filter((trade) => trade && trade.status !== 'OPEN');
  const fields = [
    { key: 'setupId', label: 'Setup', weight: 15, ok: (t) => hasValue(t.setupId) },
    { key: 'sym', label: 'Symbol', weight: 10, ok: (t) => hasValue(t.sym) },
    { key: 'date', label: 'Trade date', weight: 10, ok: (t) => isValidDate(t.date) },
    { key: 'risk', label: 'Risk (1R)', weight: 20, ok: (t) => positionRisk(t) > 0 },
    { key: 'pnl', label: 'Closed outcome', weight: 20, ok: (t) => hasOutcome(t) },
    { key: 'marketRegime', label: 'Market regime', weight: 10, ok: (t) => hasValue(t.marketRegime) },
    { key: 'ruleAdherence', label: 'Rule adherence', weight: 10, ok: (t) => hasValue(t.ruleAdherence) },
    { key: 'exitReason', label: 'Exit reason', weight: 5, ok: (t) => hasValue(t.exitReason) },
  ];
  const scoreRows = closed.map((trade) => {
    const score = fields.reduce((sum, field) => sum + (field.ok(trade) ? field.weight : 0), 0);
    return { trade, score };
  });
  const missing = fields.map((field) => ({
    key: field.key,
    label: field.label,
    count: closed.reduce((sum, trade) => sum + (field.ok(trade) ? 0 : 1), 0),
  })).filter((field) => field.count > 0).sort((a, b) => b.count - a.count);
  const bySetupMap = new Map();
  scoreRows.forEach(({ trade, score }) => {
    const key = hasValue(trade.setupId) ? String(trade.setupId) : '__missing__';
    const row = bySetupMap.get(key) || { setupId: key, count: 0, total: 0 };
    row.count += 1;
    row.total += score;
    bySetupMap.set(key, row);
  });
  const bySetup = Array.from(bySetupMap.values()).map((row) => ({
    setupId: row.setupId,
    count: row.count,
    score: row.count ? Math.round(row.total / row.count) : 0,
  })).sort((a, b) => a.score - b.score || b.count - a.count);
  const score = scoreRows.length
    ? Math.round(scoreRows.reduce((sum, row) => sum + row.score, 0) / scoreRows.length)
    : 0;
  return {
    score,
    count: closed.length,
    researchReady: closed.filter((trade) => hasOutcome(trade) && positionRisk(trade) > 0).length,
    missing,
    bySetup,
  };
}

// Consecutive rolling windows show whether expectancy survives different parts
// of the sample instead of being carried by one unusually good cluster.
export function walkForwardReport(trades, { windowSize = 30, step = 15, maxWindows = 6 } = {}) {
  const rows = validResearchTrades(trades);
  const size = Math.max(10, Math.floor(windowSize));
  const stride = Math.max(1, Math.floor(step));
  if (rows.length < size) {
    return { ready: false, n: rows.length, windowSize: size, nextNeeded: size - rows.length, windows: [], positiveRate: 0 };
  }
  const starts = [];
  for (let start = 0; start + size <= rows.length; start += stride) starts.push(start);
  const finalStart = rows.length - size;
  if (starts[starts.length - 1] !== finalStart) starts.push(finalStart);
  const windows = starts.slice(-Math.max(1, maxWindows)).map((start, index, picked) => {
    const sample = rows.slice(start, start + size);
    const stats = rSeriesStats(sample.map(realizedRFromNetTrade));
    return {
      index: starts.length - picked.length + index + 1,
      start: sample[0].date || '',
      end: sample[sample.length - 1].date || '',
      ...stats,
      pass: stats.avgR > 0 && stats.profitFactor >= 1.1,
    };
  });
  const positive = windows.filter((window) => window.avgR > 0).length;
  return {
    ready: true,
    n: rows.length,
    windowSize: size,
    nextNeeded: 0,
    windows,
    positiveRate: windows.length ? positive / windows.length * 100 : 0,
  };
}

// Compare the backtest distribution with the most recent forward observations.
// This is an early-warning monitor, not a licence to rewrite rules mid-sample.
export function edgeDriftReport(backtestTrades, forwardTrades, { windowSize = 30, minForward = 15 } = {}) {
  const backtest = validResearchTrades(backtestTrades);
  const forward = validResearchTrades(forwardTrades);
  const baseline = rSeriesStats(backtest.map(realizedRFromNetTrade));
  const recentRows = forward.slice(-Math.max(minForward, windowSize));
  const recent = rSeriesStats(recentRows.map(realizedRFromNetTrade));
  if (baseline.n < 30 || recent.n < minForward) {
    return {
      ready: false,
      status: 'collecting',
      baseline,
      recent,
      neededBacktest: Math.max(0, 30 - baseline.n),
      neededForward: Math.max(0, minForward - recent.n),
      deltaR: recent.avgR - baseline.avgR,
    };
  }
  const floor = Number.isFinite(baseline.ciLow) ? Math.max(0, baseline.ciLow) : 0;
  const status = recent.avgR < 0 ? 'at-risk' : (recent.avgR < floor ? 'watch' : 'stable');
  return {
    ready: true,
    status,
    baseline,
    recent,
    floor,
    neededBacktest: 0,
    neededForward: 0,
    deltaR: recent.avgR - baseline.avgR,
  };
}

function percentile(sorted, probability) {
  if (!sorted.length) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(probability * sorted.length) - 1));
  return sorted[index];
}

// Deterministic empirical bootstrap. "Ruin" is deliberately defined as equity
// falling to 50% of its starting value; the UI names that threshold explicitly.
export function monteCarloRisk(rValues, {
  riskPct = 1,
  simulations = 1200,
  horizon = 100,
  ruinEquity = 0.5,
  seed = 0x6d2b79f5,
} = {}) {
  const values = (rValues || []).map(finiteNumber).filter(Number.isFinite);
  const riskFraction = Math.max(0.0001, Math.min(0.1, finiteNumber(riskPct) / 100));
  const paths = Math.max(100, Math.floor(simulations));
  const trades = Math.max(10, Math.floor(horizon));
  if (values.length < 20) {
    return { ready: false, n: values.length, nextNeeded: 20 - values.length, riskPct: riskFraction * 100, simulations: paths, horizon: trades };
  }
  let state = seed >>> 0;
  values.forEach((value) => { state = (Math.imul(state ^ Math.round(value * 10000), 2654435761) + 1013904223) >>> 0; });
  const random = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const drawdowns = [];
  const endings = [];
  let ruined = 0;
  for (let path = 0; path < paths; path += 1) {
    let equity = 1;
    let peak = 1;
    let maxDrawdown = 0;
    let hitRuin = false;
    for (let index = 0; index < trades; index += 1) {
      const r = values[Math.floor(random() * values.length)];
      equity = Math.max(0, equity * (1 + r * riskFraction));
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 1);
      if (equity <= ruinEquity) hitRuin = true;
    }
    if (hitRuin) ruined += 1;
    drawdowns.push(maxDrawdown * 100);
    endings.push((equity - 1) * 100);
  }
  drawdowns.sort((a, b) => a - b);
  endings.sort((a, b) => a - b);
  return {
    ready: true,
    n: values.length,
    nextNeeded: 0,
    riskPct: riskFraction * 100,
    simulations: paths,
    horizon: trades,
    ruinThresholdPct: (1 - ruinEquity) * 100,
    riskOfRuinPct: ruined / paths * 100,
    medianMaxDrawdownPct: percentile(drawdowns, 0.5),
    p95MaxDrawdownPct: percentile(drawdowns, 0.95),
    medianEndingPct: percentile(endings, 0.5),
    p05EndingPct: percentile(endings, 0.05),
  };
}
