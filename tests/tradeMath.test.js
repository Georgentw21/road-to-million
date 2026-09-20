import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commissionCost,
  equityDrawdownPercent,
  netPnlFromTrade,
  positionRisk,
  realizedRFromNetTrade,
  rSeriesStats,
  setupEvidenceFromNetTrades,
  summarizeNetTrades,
} from '../src/tradeMath.js';

test('fees are always treated as costs and applied exactly once', () => {
  assert.equal(commissionCost(-3.2), 3.2);
  assert.equal(netPnlFromTrade({ pnl: 100, commission: 3.2 }), 96.8);
  assert.equal(netPnlFromTrade({ pnl: 100, commission: -3.2 }), 96.8);
});

test('realized R uses net result divided by total position risk', () => {
  const trade = { status: 'CLOSED', pnl: 180, legs: [{ risk: 60 }, { risk: 40 }] };
  assert.equal(positionRisk(trade), 100);
  assert.equal(realizedRFromNetTrade(trade), 1.8);
});

test('summary includes breakevens in the denominator and calculates PF correctly', () => {
  const summary = summarizeNetTrades([
    { status: 'CLOSED', pnl: 200, risk: 100 },
    { status: 'CLOSED', pnl: -100, risk: 100 },
    { status: 'CLOSED', pnl: 0, risk: 100 },
    { status: 'OPEN', pnl: 999, risk: 100 },
  ]);
  assert.equal(summary.count, 3);
  assert.ok(Math.abs(summary.winRate - 100 / 3) < 1e-12);
  assert.equal(summary.profitFactor, 2);
  assert.ok(Math.abs(summary.expectancy - 100 / 3) < 1e-12);
  assert.ok(Math.abs(summary.avgR - 1 / 3) < 1e-12);
});

test('R drawdown is measured from the cumulative R high-water mark', () => {
  const stats = rSeriesStats([1, 1, -1, -2, 3]);
  assert.equal(stats.maxDrawdownR, 3);
  assert.equal(stats.avgR, 0.4);
});

test('95% confidence interval uses Student t for a finite sample', () => {
  const values = Array.from({ length: 30 }, (_, index) => index % 2 ? -1 : 1);
  const stats = rSeriesStats(values);
  const expectedMargin = 2.045 / Math.sqrt(29);
  assert.ok(Math.abs(stats.ciLow + expectedMargin) < 1e-12);
  assert.ok(Math.abs(stats.ciHigh - expectedMargin) < 1e-12);
});

test('cash deposits and withdrawals do not count as trading drawdown', () => {
  const result = equityDrawdownPercent({
    startingBalance: 1000,
    cashFlows: [{ date: '2026-01-02', amount: 1000 }, { date: '2026-01-04', amount: -500 }],
    trades: [
      { status: 'CLOSED', date: '2026-01-01', pnl: 100 },
      { status: 'CLOSED', date: '2026-01-03', pnl: -200 },
    ],
  });
  assert.equal(result.endingEquity, 1400);
  assert.ok(Math.abs(result.maxDrawdownPct - (200 / 2100 * 100)) < 1e-9);
});

test('backtest evidence reserves the final third as chronological holdout', () => {
  const trades = Array.from({ length: 30 }, (_, index) => ({
    status: 'CLOSED',
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    pnl: index < 20 ? 100 : 50,
    risk: 100,
  }));
  const evidence = setupEvidenceFromNetTrades(trades);
  assert.equal(evidence.training.n, 20);
  assert.equal(evidence.holdout.n, 10);
  assert.equal(evidence.holdoutPass, true);
  assert.equal(evidence.holdout.avgR, 0.5);
});

test('evidence calculations remain stable across 1,000 trades', () => {
  const trades = Array.from({ length: 1000 }, (_, index) => ({
    status: 'CLOSED',
    date: new Date(2020, 0, index + 1).toISOString().slice(0, 10),
    pnl: index % 2 ? -100 : 200,
    risk: 100,
  }));
  const evidence = setupEvidenceFromNetTrades(trades);
  assert.equal(evidence.n, 1000);
  assert.equal(evidence.training.n, 666);
  assert.equal(evidence.holdout.n, 334);
  assert.equal(evidence.avgR, 0.5);
  assert.equal(evidence.profitFactor, 2);
});
