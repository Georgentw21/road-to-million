// Vercel Serverless — ดึงปฏิทินข่าวเศรษฐกิจสัปดาห์นี้ (ForexFactory feed ผ่าน faireconomy)
// เรียกจาก browser ตรงๆ ติด CORS เลย proxy ฝั่ง server
// GET /api/calendar

const SOURCES = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://cdn-nfs.faireconomy.media/ff_calendar_thisweek.json',
];

export default async function handler(req, res) {
  for (const url of SOURCES) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RTMJournal/1.0)' } });
      if (!r.ok) continue;
      const data = await r.json();
      if (!Array.isArray(data)) continue;
      const events = data.map((e) => ({
        title: e.title || '',
        currency: e.country || e.currency || '',
        date: e.date || '',
        impact: e.impact || '',
        forecast: e.forecast || '',
        previous: e.previous || '',
        actual: e.actual || '',
      }));
      // cache ที่ edge 10 นาที
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
      res.status(200).json({ events, ts: Date.now() });
      return;
    } catch (e) { /* ลอง source ถัดไป */ }
  }
  res.status(200).json({ events: [], error: 'unavailable' });
}
