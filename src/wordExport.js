// สร้างไฟล์ Microsoft Word (.doc) จากประวัติการเทรด แบ่งตามสัปดาห์
// ใช้วิธีสร้าง HTML แล้วบันทึกเป็น .doc (Word เปิดได้ปกติ) — ไม่ต้องพึ่ง library ใหญ่

function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// rows: [{date, sym, side, setupName, session, portfolioName, pnlNum, status, rr, notes}]
export function exportWeeklyWord(rows, accountName) {
  const groups = {};
  rows.forEach((r) => {
    const wk = isoWeek(r.date);
    (groups[wk] = groups[wk] || []).push(r);
  });
  const weeks = Object.keys(groups).sort().reverse();

  const money = (n) => (n >= 0 ? '+$' : '-$') + Math.abs(Math.round(n)).toLocaleString('en-US');

  let body = '';
  weeks.forEach((wk) => {
    const list = groups[wk].slice().sort((a, b) => a.date.localeCompare(b.date));
    let net = 0, wins = 0, closed = 0;
    list.forEach((r) => { if (r.status !== 'OPEN') { net += r.pnlNum; closed++; if (r.pnlNum > 0) wins++; } });
    const wr = closed ? Math.round((wins / closed) * 100) : 0;

    body += `<h2 style="font-family:Georgia;color:#7a5c1e;margin:22px 0 6px">สัปดาห์ ${esc(wk)}</h2>`;
    body += `<p style="font-family:Arial;font-size:12px;color:#444;margin:0 0 8px">รวม ${list.length} ออเดอร์ · Net P&amp;L: <b style="color:${net >= 0 ? '#2e7d32' : '#c62828'}">${money(net)}</b> · Win rate: ${wr}%</p>`;
    body += '<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Arial;font-size:12px;width:100%">';
    body += '<tr style="background:#f3ecd9">' +
      ['วันที่', 'Symbol', 'Side', 'Setup', 'Session', 'พอร์ต', 'P&L', 'R', 'สถานะ', 'บันทึก']
        .map((h) => `<th align="left">${h}</th>`).join('') + '</tr>';
    list.forEach((r) => {
      const pnl = r.status === 'OPEN' ? '—' : money(r.pnlNum);
      const rr = r.status === 'OPEN' ? '—' : ((r.rr >= 0 ? '+' : '−') + Math.abs(r.rr).toFixed(1) + 'R');
      body += '<tr>' + [
        r.date, r.sym, r.side, r.setupName, r.session, r.portfolioName || '-',
        `<span style="color:${r.pnlNum >= 0 ? '#2e7d32' : '#c62828'}">${pnl}</span>`,
        rr, r.status, esc(r.notes),
      ].map((c) => `<td valign="top">${c}</td>`).join('') + '</tr>';
    });
    body += '</table>';
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="padding:20px">
    <h1 style="font-family:Georgia;color:#1a1408">Road To Million — ประวัติการเทรด</h1>
    <p style="font-family:Arial;font-size:12px;color:#666">${esc(accountName || '')} · ออกรายงานเมื่อ ${new Date().toLocaleString('th-TH')}</p>
    ${body || '<p style="font-family:Arial">ไม่มีข้อมูลการเทรด</p>'}
  </body></html>`;

  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'trading-history-' + new Date().toISOString().slice(0, 10) + '.doc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
