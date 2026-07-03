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

// โหลดรูปจาก URL -> base64 (ฝังในไฟล์ Word เพื่อให้รูปติดไปด้วยเสมอ)
async function toDataURL(url) {
  try {
    const r = await fetch(url);
    const b = await r.blob();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  } catch (e) { return null; }
}

// rows: [{date, sym, side, setupName, session, portfolioName, pnlNum, lot, status, rr, notes, images:[url...]}]
// จำกัดจำนวนรูปที่ฝัง กันไฟล์ใหญ่/ค้างเวลามีออเดอร์เป็นพันๆ (โหลดทีละ batch)
const IMG_EMBED_CAP = 300;

export async function exportWeeklyWord(rows, accountName) {
  // เก็บ URL รูปแบบไม่ซ้ำ (ใช้ Set เร็วกว่า includes เมื่อ rows เยอะ)
  const seen = new Set(); const allUrls = [];
  rows.forEach((r) => (r.images || []).forEach((u) => { if (u && !seen.has(u)) { seen.add(u); allUrls.push(u); } }));
  const imgCapped = allUrls.length > IMG_EMBED_CAP;
  const embedUrls = allUrls.slice(0, IMG_EMBED_CAP);
  const dataMap = {};
  // โหลดทีละ 12 รูป กันเปิด network พร้อมกันเยอะเกินจนค้าง
  for (let i = 0; i < embedUrls.length; i += 12) {
    const batch = embedUrls.slice(i, i + 12);
    await Promise.all(batch.map(async (u) => { dataMap[u] = await toDataURL(u); }));
  }
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
      ['วันที่', 'Symbol', 'Side', 'Setup', 'Session', 'Lot', 'พอร์ต', 'P&L', 'R', 'สถานะ', 'บันทึก']
        .map((h) => `<th align="left">${h}</th>`).join('') + '</tr>';
    list.forEach((r) => {
      const pnl = r.status === 'OPEN' ? '—' : money(r.pnlNum);
      const rr = r.status === 'OPEN' ? '—' : ((r.rr >= 0 ? '+' : '−') + Math.abs(r.rr).toFixed(1) + 'R');
      body += '<tr>' + [
        r.date, r.sym, r.side, r.setupName, r.session, (r.lot || '—'), r.portfolioName || '-',
        `<span style="color:${r.pnlNum >= 0 ? '#2e7d32' : '#c62828'}">${pnl}</span>`,
        rr, r.status, esc(r.notes),
      ].map((c) => `<td valign="top">${c}</td>`).join('') + '</tr>';
    });
    body += '</table>';

    // รูปประกอบของออเดอร์ในสัปดาห์นี้
    const withImgs = list.filter((r) => (r.images || []).some((u) => dataMap[u]));
    if (withImgs.length) {
      body += '<p style="font-family:Arial;font-size:12px;color:#7a5c1e;margin:14px 0 6px"><b>ภาพประกอบ</b></p>';
      withImgs.forEach((r) => {
        body += `<p style="font-family:Arial;font-size:12px;color:#222;margin:8px 0 4px"><b>${esc(r.sym)}</b> · ${esc(r.date)}</p>`;
        (r.images || []).forEach((u) => { if (dataMap[u]) body += `<img src="${dataMap[u]}" style="max-width:360px;max-height:240px;margin:0 8px 8px 0;border:1px solid #ccc"/>`; });
      });
    }
  });

  const capNote = imgCapped ? `<p style="font-family:Arial;font-size:11px;color:#b06a00">* ข้อมูลเยอะ — ฝังรูปเฉพาะ ${IMG_EMBED_CAP} รูปแรก (ตารางข้อมูลครบทุกออเดอร์) เลือกช่วง “สัปดาห์นี้/เดือนนี้” เพื่อได้รูปครบ</p>` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="padding:20px">
    <h1 style="font-family:Georgia;color:#1a1408">Road To Million — ประวัติการเทรด</h1>
    <p style="font-family:Arial;font-size:12px;color:#666">${esc(accountName || '')} · ออกรายงานเมื่อ ${new Date().toLocaleString('th-TH')} · ${rows.length} ออเดอร์</p>
    ${capNote}
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
