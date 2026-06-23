import React, { useRef, useState } from 'react';
import { uploadImage, getImageUrl } from './dataStore';

// ย่อรูปก่อนอัป (ประหยัดพื้นที่ 3-5 เท่า): scale ด้านยาวสุดไม่เกิน maxDim, แปลงเป็น JPEG
function compressImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) return resolve(file);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.round(width * scale); height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob || blob.size >= file.size) return resolve(file); // ถ้าไม่เล็กลงใช้ไฟล์เดิม
        resolve(new File([blob], 'image.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export function ImageSlot({ slotId, value, onChange, placeholder, style, rounded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [ver, setVer] = useState(0);
  const [zoom, setZoom] = useState(false);

  let url = getImageUrl(value);
  if (url && ver) url += (url.includes('?') ? '&' : '?') + 'v=' + ver;

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) { alert('กรุณาเลือกไฟล์รูปภาพ'); return; }
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      const path = await uploadImage(slotId, compressed);
      setVer(Date.now());
      onChange(path);
    } catch (e) {
      alert('อัปโหลดรูปไม่สำเร็จ: ' + (e && e.message ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (e) => {
    e.stopPropagation();
    if (!window.confirm('ลบรูปนี้?')) return;
    onChange(null);
  };
  const pick = (e) => { if (e) e.stopPropagation(); if (!busy && inputRef.current) inputRef.current.click(); };

  const radius = rounded ? 12 : 0;

  return (
    <>
      <div
        onClick={() => { if (busy) return; if (url) setZoom(true); else pick(); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); }}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          cursor: busy ? 'progress' : (url ? 'zoom-in' : 'pointer'),
          background: url ? '#0c0c10' : 'rgba(255,255,255,.03)',
          border: '1px dashed ' + (over ? 'rgba(201,166,95,.7)' : 'rgba(255,255,255,.14)'),
          borderRadius: radius, transition: '.16s', ...style,
        }}
      >
        {url ? (
          <>
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {/* hover toolbar */}
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
              <button onClick={pick} title="เปลี่ยนรูป" style={tbBtn}>เปลี่ยน</button>
              <button onClick={remove} title="ลบรูป" style={{ ...tbBtn, color: '#DC6A63' }}>ลบ</button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#5E5E68', padding: 12, textAlign: 'center' }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#5E5E68" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span style={{ fontSize: 12 }}>{placeholder || 'ลากรูปมาวาง / คลิกเพื่อเลือก'}</span>
          </div>
        )}

        {busy && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,8,11,.55)' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid rgba(226,197,136,.3)', borderTopColor: '#E2C588', animation: 'spin .7s linear infinite' }} />
          </div>
        )}

        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files && e.target.files[0]; handleFile(f); e.target.value = ''; }} />
      </div>

      {/* lightbox ขยายรูป */}
      {zoom && url && (
        <div onClick={() => setZoom(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(4,4,7,.9)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fade .2s both', cursor: 'zoom-out' }}>
          <img src={url} alt="" style={{ maxWidth: '92vw', maxHeight: '90vh', borderRadius: 10, boxShadow: '0 40px 120px -20px rgba(0,0,0,.9)' }} />
          <div style={{ position: 'absolute', top: 18, right: 22, color: '#ECEAE3', fontSize: 26, cursor: 'pointer', lineHeight: 1 }}>✕</div>
        </div>
      )}
    </>
  );
}

const tbBtn = {
  fontSize: 11, fontWeight: 600, fontFamily: 'inherit', color: '#ECEAE3',
  background: 'rgba(8,8,11,.72)', border: '1px solid rgba(255,255,255,.18)',
  borderRadius: 7, padding: '4px 9px', cursor: 'pointer', backdropFilter: 'blur(4px)',
};
