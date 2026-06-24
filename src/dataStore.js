import { supabase } from './supabaseClient';

// โหลดข้อมูล journal ทั้งก้อนของผู้ใช้ปัจจุบัน (เก็บเป็น JSON ก้อนเดียว)
export async function loadJournal() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('journals')
    .select('data')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) { console.error('[loadJournal]', error); return null; }
  return data ? data.data : null;
}

// บันทึกข้อมูลทั้งก้อน (upsert ทับแถวของผู้ใช้)
export async function saveJournal(blob) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('journals')
    .upsert({ user_id: user.id, data: blob, updated_at: new Date().toISOString() });
  if (error) console.error('[saveJournal]', error);
}

// อัปโหลดรูปขึ้น Storage แล้วคืน path ที่เก็บไว้ใน journal
export async function uploadImage(slotId, file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('ยังไม่ได้ล็อกอิน');
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const safeSlot = String(slotId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `${user.id}/${safeSlot}.${ext}`;
  const { error } = await supabase.storage
    .from('images')
    .upload(path, file, { upsert: true, cacheControl: '3600' });
  if (error) throw error;
  return path;
}

// ลบรูปออกจาก Storage (เวลาลบเทรด/setup/vision)
export async function deleteImages(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return;
  try { await supabase.storage.from('images').remove(list); } catch (e) { console.error('[deleteImages]', e); }
}

// แปลง storage path -> URL สำหรับแสดงผล
export function getImageUrl(path) {
  if (!path) return null;
  const { data } = supabase.storage.from('images').getPublicUrl(path);
  return data.publicUrl;
}
