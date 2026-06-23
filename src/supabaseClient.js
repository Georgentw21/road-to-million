import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // ช่วยเตือนตอน dev ถ้ายังไม่ได้ตั้งค่า .env.local
  console.error(
    '[Supabase] ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — ' +
    'คัดลอก .env.example เป็น .env.local แล้วใส่ค่าจาก Supabase'
  );
}

export const supabase = createClient(url || 'http://localhost', key || 'public-anon-key');
