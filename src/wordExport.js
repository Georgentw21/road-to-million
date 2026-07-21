// สร้างไฟล์ Microsoft Word (.doc) จากประวัติการเทรด — เก็บ "ทีละออเดอร์" เป็นการ์ดสวยงาม
// (ข้อความ + รูปภาพ อยู่ในหน้าเดียวกัน ไม่ต้องเลื่อนตารางกว้างๆ) สำหรับสำรองข้อมูล/รีวิวหลังบ้าน
// วิธี: สร้าง HTML แล้วบันทึกเป็น .doc (Word เปิดได้ปกติ) — ไม่ต้องพึ่ง library ใหญ่

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

// rows: [{date, weekday, sym, side, setupName, session, portfolioName, pnlNum, netPnl, commission, rr, status, lot,
//         entry, stop, target, riskUsd, hold, entryTime, exitTime,
//         ltf, mtf, htf, retest, fibo, entryType, slZone, feelEntry, feelSL, feelTP,
//         mae, mfe, heatStr, captureStr, pigUsd, alignN, alignStr, tags:[], notes, images:[url...]}]
const IMG_EMBED_CAP = 300;

// palette (พิมพ์บนกระดาษขาว — โทนครีม/ทอง อ่านง่าย)
const INK = '#1a1408', SUB = '#6b6152', LINE = '#e4dcc8', CREAM = '#faf6ec', GOLD = '#8a6d1e', GREEN = '#2e7d32', RED = '#c0392b', BLUE = '#2c5f8a';

function fmtDT(s) {
  if (!s) return '—';
  const d = new Date(s); if (isNaN(d)) return esc(s);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

// แถวรายละเอียด label/value เป็น cell ในตารางเดียว (Word เรนเดอร์เนียน ไม่ล้นหน้า)
function field(label, value, color) {
  const v = (value == null || value === '') ? '—' : value;
  return `<td valign="top" style="padding:5px 10px 5px 0;width:33%">`
    + `<div style="font-family:Arial;font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:${SUB}">${esc(label)}</div>`
    + `<div style="font-family:Arial;font-size:12px;color:${color || INK};font-weight:${color ? 'bold' : 'normal'}">${color ? v : esc(v)}</div></td>`;
}

function fieldRow(cells) {
  // เติมให้ครบ 3 คอลัมน์ต่อแถว เพื่อจัดกริดสม่ำเสมอ
  let out = '';
  for (let i = 0; i < cells.length; i += 3) {
    const group = cells.slice(i, i + 3);
    while (group.length < 3) group.push('<td style="width:33%"></td>');
    out += '<tr>' + group.join('') + '</tr>';
  }
  return out;
}

export async function exportWeeklyWord(rows, accountName) {
  const seen = new Set(); const allUrls = [];
  rows.forEach((r) => (r.images || []).forEach((u) => { if (u && !seen.has(u)) { seen.add(u); allUrls.push(u); } }));
  const imgCapped = allUrls.length > IMG_EMBED_CAP;
  const embedUrls = allUrls.slice(0, IMG_EMBED_CAP);
  const dataMap = {};
  for (let i = 0; i < embedUrls.length; i += 12) {
    const batch = embedUrls.slice(i, i + 12);
    await Promise.all(batch.map(async (u) => { dataMap[u] = await toDataURL(u); }));
  }

  const groups = {};
  rows.forEach((r) => { const wk = isoWeek(r.date); (groups[wk] = groups[wk] || []).push(r); });
  const weeks = Object.keys(groups).sort().reverse();

  const money = (n) => (n >= 0 ? '+$' : '−$') + Math.abs(Math.round(n)).toLocaleString('en-US');

  // ---- การ์ดต่อ 1 ออเดอร์ ----
  function tradeCard(r) {
    const closed = r.status !== 'OPEN';
    const net = closed ? money(r.netPnl) : 'OPEN';
    const netColor = !closed ? BLUE : (r.netPnl >= 0 ? GREEN : RED);
    const sideColor = r.side === 'BUY' ? GREEN : RED;
    const rrStr = closed ? ((r.rr >= 0 ? '+' : '−') + Math.abs(r.rr).toFixed(1) + 'R') : '—';

    // หัวการ์ด: Symbol · Side · วันที่ | Net P&L
    let h = `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:16px;border:1px solid ${LINE};background:${CREAM}">`;
    h += `<tr><td style="padding:11px 14px;border-bottom:1px solid ${LINE}">`
      + `<table cellspacing="0" cellpadding="0" style="width:100%"><tr>`
      + `<td valign="middle"><span style="font-family:Georgia;font-size:16px;font-weight:bold;color:${INK}">${esc(r.sym)}</span>`
      + `&nbsp;&nbsp;<span style="font-family:Arial;font-size:11px;font-weight:bold;color:${sideColor}">${esc(r.side || '')}</span>`
      + `&nbsp;·&nbsp;<span style="font-family:Arial;font-size:11px;color:${SUB}">${esc(r.weekday || '')} ${esc(r.date)}</span></td>`
      + `<td align="right" valign="middle"><span style="font-family:Georgia;font-size:16px;font-weight:bold;color:${netColor}">${net}</span>`
      + `&nbsp;&nbsp;<span style="font-family:Arial;font-size:11px;color:${SUB}">${rrStr}</span></td>`
      + `</tr></table></td></tr>`;

    // body: กริดรายละเอียด
    h += `<tr><td style="padding:10px 14px 4px">`;
    h += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">`;
    h += fieldRow([
      field('Setup', r.setupName), field('Session', r.session), field('Portfolio', r.portfolioName),
      field('Holding time', r.hold), field('Entry → Exit', fmtDT(r.entryTime) + '  →  ' + fmtDT(r.exitTime)), field('Lot', r.lot),
      field('Entry', r.entry), field('Stop', r.stop), field('Target', r.target),
      field('Risk (1R)', r.riskUsd ? '$' + Math.round(r.riskUsd) : '', r.riskUsd ? INK : null),
      field('Gross P&L', closed ? money(r.pnlNum) : '', closed ? (r.pnlNum >= 0 ? GREEN : RED) : null),
      field('Commission / swap', r.commission ? '−$' + Math.abs(r.commission).toFixed(2) : '$0'),
    ]);
    h += `</table>`;

    // Entry legs (multi-leg "เบิ้ล") — only when the trade was scaled in
    if (r.legMulti && r.legs && r.legs.length) {
      h += `<div style="font-family:Arial;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:${GOLD};margin:8px 0 2px;font-weight:bold">ไม้ที่เบิ้ล · Entry legs</div>`;
      h += `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-family:Arial;font-size:11px;border-color:${LINE}">`;
      h += `<tr style="background:#fff">` + ['#', 'Trigger', 'ราคาเข้า', 'Lot', 'สะสม', 'SL basis', 'DD (pip)']
        .map((c, i) => `<th align="${i >= 3 && i !== 5 ? 'right' : 'left'}" style="color:${SUB};font-weight:normal;font-size:9px;text-transform:uppercase">${c}</th>`).join('') + `</tr>`;
      r.legs.forEach((l, i) => {
        const under = /under|ใต้แท่ง/i.test(l.slBasis || '');
        h += `<tr>` + [
          String(i + 1), esc(l.trigger || '—'), esc(l.price || '—'), esc(l.lot || '—'), l.cum,
          `<span style="color:${under ? RED : INK}">${esc(l.slBasis || '—')}</span>`, esc(l.dd || '—'),
        ].map((c, j) => `<td valign="top" align="${j >= 3 && j !== 5 ? 'right' : 'left'}">${c}</td>`).join('') + `</tr>`;
      });
      h += `</table>`;
      h += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:4px">`;
      h += fieldRow([
        field('Max lot', r.legMaxLot, r.legMaxLot ? INK : null),
        field('Avg entry', r.legAvgEntry, r.legAvgEntry ? INK : null),
        field('Max DD (legs)', r.legMaxDD ? r.legMaxDD + 'p' : ''),
      ]);
      h += `</table>`;
    }

    // Round context
    if (r.sotType || r.entryKind || r.hhllCount) {
      h += `<div style="font-family:Arial;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:${GOLD};margin:8px 0 2px;font-weight:bold">รอบเทรด · Round context</div>`;
      h += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">`;
      h += fieldRow([field('ประเภทเทรนด์ (SOT)', r.sotType), field('ประเภทจุดเข้า', r.entryKind), field('เข้าที่ HH/LL ครั้งที่', r.hhllCount)]);
      h += `</table>`;
    }

    // 3-Timeframe factors (per-TF: timeframe + condition + factors)
    const tfm = r.tfMeta || {};
    const anyTF = r.ltf || r.mtf || r.htf || r.alignN || (tfm.htf && (tfm.htf.factors || tfm.htf.timeframe)) || (tfm.mtf && (tfm.mtf.factors || tfm.mtf.timeframe)) || (tfm.ltf && (tfm.ltf.factors || tfm.ltf.timeframe));
    if (anyTF) {
      h += `<div style="font-family:Arial;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:${GOLD};margin:8px 0 2px;font-weight:bold">ปัจจัย 3 Timeframe · ${(r.alignN || 0)}/3 aligned${r.alignStr ? ' (' + esc(r.alignStr) + ')' : ''}</div>`;
      h += `<table border="1" cellspacing="0" cellpadding="5" style="border-collapse:collapse;width:100%;font-family:Arial;font-size:11px;border-color:${LINE}">`;
      h += `<tr style="background:#fff">` + ['TF', 'Timeframe', 'Condition', 'Factors'].map((c) => `<th align="left" style="color:${SUB};font-weight:normal;font-size:9px;text-transform:uppercase">${c}</th>`).join('') + `</tr>`;
      [['HTF', 'htf', r.htf], ['MTF', 'mtf', r.mtf], ['LTF', 'ltf', r.ltf]].forEach(([role, key, cond]) => {
        const m = tfm[key] || {};
        if (!(cond || m.timeframe || m.factors)) return;
        h += `<tr>` + [`<b style="color:${GOLD}">${role}</b>`, esc(m.timeframe || '—'), esc(cond || '—'), esc(m.factors || '—')]
          .map((c, i) => `<td valign="top"${i === 3 ? ' style="width:44%"' : ''}>${c}</td>`).join('') + `</tr>`;
      });
      h += `</table>`;
    }

    // Execution detail
    if (r.retest || r.fibo || r.entryType || r.slZone) {
      h += `<div style="font-family:Arial;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:${GOLD};margin:8px 0 2px;font-weight:bold">Execution</div>`;
      h += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">`;
      h += fieldRow([field('Retest', r.retest), field('Fibo M15', r.fibo), field('Entry model', r.entryType), field('SL zone', r.slZone)]);
      h += `</table>`;
    }

    // Heat & capture + psychology
    const anyHC = r.mae || r.mfe || r.feelEntry || r.feelSL || r.feelTP;
    if (anyHC) {
      h += `<div style="font-family:Arial;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:${GOLD};margin:8px 0 2px;font-weight:bold">Heat, capture &amp; psychology</div>`;
      h += `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">`;
      h += fieldRow([
        field('Max DD (heat)', r.heatStr, r.heatStr ? RED : null),
        field('Captured of best', r.captureStr, r.captureStr ? GREEN : null),
        field('Pig left', r.pigUsd ? '$' + Math.round(r.pigUsd) : '', r.pigUsd ? GOLD : null),
        field('Feeling · entry', r.feelEntry), field('Feeling · SL', r.feelSL), field('Feeling · TP', r.feelTP),
      ]);
      h += `</table>`;
    }

    // Tags
    if (r.tags && r.tags.length) {
      h += `<div style="margin:8px 0 2px">` + r.tags.map((t) =>
        `<span style="font-family:Arial;font-size:10px;color:${GOLD};border:1px solid ${LINE};background:#fff;padding:2px 8px;margin:0 4px 4px 0;display:inline-block;border-radius:10px">${esc(t)}</span>`
      ).join('') + `</div>`;
    }

    // Notes
    if (r.notes) {
      h += `<div style="font-family:Arial;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:${SUB};margin:8px 0 2px">Notes</div>`
        + `<div style="font-family:Arial;font-size:12px;color:${INK};line-height:1.5;white-space:pre-wrap">${esc(r.notes)}</div>`;
    }

    // Images — เรียงต่อกัน กว้างพอดีหน้า ไม่ล้น
    const imgs = (r.images || []).filter((u) => dataMap[u]);
    if (imgs.length) {
      h += `<div style="margin:10px 0 4px">` + imgs.map((u) =>
        `<img src="${dataMap[u]}" style="max-width:460px;width:100%;margin:0 0 8px 0;border:1px solid ${LINE}"/>`
      ).join('') + `</div>`;
    }

    h += `</td></tr></table>`;
    return h;
  }

  let body = '';
  weeks.forEach((wk) => {
    const list = groups[wk].slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.entryTime || '').localeCompare(String(a.entryTime || '')));
    let net = 0, wins = 0, closed = 0;
    list.forEach((r) => { if (r.status !== 'OPEN') { net += r.netPnl; closed++; if (r.netPnl > 0) wins++; } });
    const wr = closed ? Math.round((wins / closed) * 100) : 0;

    body += `<div style="page-break-inside:avoid;margin-top:26px;border-bottom:2px solid ${GOLD};padding-bottom:4px">`
      + `<span style="font-family:Georgia;font-size:18px;color:${GOLD};font-weight:bold">สัปดาห์ ${esc(wk)}</span>`
      + `<span style="font-family:Arial;font-size:11px;color:${SUB}">&nbsp;&nbsp;${list.length} ออเดอร์ · Net <b style="color:${net >= 0 ? GREEN : RED}">${money(net)}</b> · Win rate ${wr}%</span></div>`;
    list.forEach((r) => { body += tradeCard(r); });
  });

  const capNote = imgCapped ? `<p style="font-family:Arial;font-size:11px;color:#b06a00">* ข้อมูลเยอะ — ฝังรูปเฉพาะ ${IMG_EMBED_CAP} รูปแรก (รายละเอียดครบทุกออเดอร์) เลือกช่วง “สัปดาห์นี้/เดือนนี้” เพื่อได้รูปครบ</p>` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="padding:26px;background:#fff">
    <h1 style="font-family:Georgia;color:${INK};margin:0 0 2px">The Desk — สมุดบันทึกการเทรด</h1>
    <p style="font-family:Arial;font-size:12px;color:${SUB};margin:0 0 6px">${esc(accountName || '')} · ออกรายงานเมื่อ ${new Date().toLocaleString('th-TH')} · ${rows.length} ออเดอร์</p>
    ${capNote}
    ${body || '<p style="font-family:Arial">ไม่มีข้อมูลการเทรด</p>'}
  </body></html>`;

  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'the-desk-journal-' + new Date().toISOString().slice(0, 10) + '.doc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
