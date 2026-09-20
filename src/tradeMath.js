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
