import React, { useRef, useState } from 'react';
import { uploadImage, getImageUrl } from './dataStore';

// React component แทน <image-slot> เดิม — เก็บรูปจริงบน Supabase Storage
export function ImageSlot({ slotId, value, onChange, placeholder, style, rounded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [ver, setVer] = useState(0);

  let url = getImageUrl(value);
  if (url && ver) url += (url.includes('?') ? '&' : '?') + 'v=' + ver;

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) { alert('กรุณาเลือกไฟล์รูปภาพ'); return; }
    setBusy(true);
    try {
      const path = await uploadImage(slotId, file);
      setVer(Date.now());
      onChange(path);
    } catch (e) {
      alert('อัปโหลดรูปไม่สำเร็จ: ' + (e && e.message ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const radius = rounded ? 12 : 0;

  return (
    <div
      className="hv-imgslot"
      onClick={() => !busy && inputRef.current && inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        handleFile(f);
      }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        cursor: busy ? 'progress' : 'pointer',
        background: url ? '#0c0c10' : 'rgba(255,255,255,.03)',
        border: '1px dashed ' + (over ? 'rgba(201,166,95,.7)' : 'rgba(255,255,255,.14)'),
        borderRadius: radius,
        transition: '.16s',
        ...style,
      }}
    >
      {url ? (
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#5E5E68', padding: 12, textAlign: 'center' }}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#5E5E68" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span style={{ fontSize: 12 }}>{placeholder || 'ลากรูปมาวาง / คลิกเพื่อเลือก'}</span>
        </div>
      )}

      {busy && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,8,11,.55)' }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid rgba(226,197,136,.3)', borderTopColor: '#E2C588', animation: 'spin .7s linear infinite' }} />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; handleFile(f); e.target.value = ''; }}
      />
    </div>
  );
}
