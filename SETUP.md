# คู่มือทำ Road To Million Journal ให้เป็นเว็บแอป (แบบ Notion)

เป้าหมาย: เปิดเว็บจากเครื่องไหนก็ได้ → ล็อกอินด้วย Google → ข้อมูลเทรด/รูป/เช็กลิสต์ ตามไปทุกเครื่อง

โครงสร้างใช้ **React (Vite)** + **Supabase** (ฐานข้อมูล + ล็อกอิน + เก็บรูป) + เอาขึ้นเว็บด้วย **Vercel** — ฟรีทั้งหมด

> ทำตามทีละขั้น ใช้เวลาประมาณ 30–45 นาทีในครั้งแรก

---

## ภาพรวมขั้นตอน
1. สร้างโปรเจกต์ Supabase + รัน SQL
2. เปิดล็อกอิน Google
3. ใส่ค่า key ลงไฟล์ `.env.local` แล้วรันในเครื่องเพื่อทดสอบ
4. เอาขึ้น Vercel ให้ได้ลิงก์เว็บจริง
5. อัปเดต URL ใน Supabase/Google ให้ตรงกับลิงก์ Vercel

---

## 1) สร้างโปรเจกต์ Supabase
1. ไปที่ https://supabase.com → Sign up (ใช้ GitHub/Google ก็ได้) → **New project**
2. ตั้งชื่อโปรเจกต์, ตั้ง Database Password (เก็บไว้), เลือก Region ใกล้ไทย (เช่น Singapore) → Create
3. รอสักครู่ให้โปรเจกต์พร้อม
4. เมนูซ้าย **SQL Editor** → **New query** → เปิดไฟล์ `supabase/schema.sql` ในโปรเจกต์นี้ คัดลอกทั้งหมดไปวาง → กด **Run**
   - ถ้าขึ้น "Success" แปลว่าสร้างตาราง `journals` + bucket `images` + สิทธิ์ความปลอดภัยเรียบร้อย
5. เมนู **Project Settings → API** จดค่า 2 อย่าง:
   - **Project URL** (เช่น `https://abcd1234.supabase.co`)
   - **anon public** key (ขึ้นต้น `eyJ...`)

---

## 2) เปิดล็อกอินด้วย Google
Google ต้องตั้ง OAuth ใน Google Cloud ก่อน แล้วเอามาเสียบใน Supabase

### 2.1 สร้าง OAuth ใน Google Cloud
1. ไปที่ https://console.cloud.google.com → สร้าง Project ใหม่ (หรือใช้ที่มี)
2. ค้นหา **APIs & Services → OAuth consent screen** → เลือก **External** → กรอกชื่อแอป + อีเมล → Save
   - หน้า "Test users" ใส่อีเมล Google ของคุณไว้ (ตอนยังไม่ publish จะล็อกอินได้เฉพาะ test users)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized redirect URIs** ใส่ค่านี้ (เอามาจาก Supabase → Authentication → Providers → Google จะมี "Callback URL" ให้):
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
   - กด Create → จะได้ **Client ID** และ **Client Secret**

### 2.2 เปิด Google provider ใน Supabase
1. Supabase → **Authentication → Providers → Google** → เปิด (Enable)
2. วาง **Client ID** และ **Client Secret** จากขั้น 2.1 → Save

---

## 3) รันในเครื่องเพื่อทดสอบ (ต้องมี Node.js 18+)
> ดาวน์โหลด Node ได้ที่ https://nodejs.org (เลือก LTS)

ในโฟลเดอร์โปรเจกต์ เปิด Terminal แล้วทำตามนี้:

```bash
# 1. คัดลอกไฟล์ตั้งค่า แล้วแก้ค่า
cp .env.example .env.local
```
เปิดไฟล์ `.env.local` ใส่ค่าจากขั้น 1.5:
```
VITE_SUPABASE_URL=https://abcd1234.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...ของคุณ...
```
จากนั้น:
```bash
npm install      # ติดตั้งครั้งแรกครั้งเดียว
npm run dev      # เปิดเว็บที่ http://localhost:5173
```
เปิดเบราว์เซอร์ → ล็อกอิน Google → ลองเพิ่มเทรด/อัปโหลดรูป แล้วรีเฟรช ข้อมูลต้องยังอยู่ ✅

> ตอนทดสอบในเครื่อง อาจต้องเพิ่ม `http://localhost:5173` ใน Supabase → Authentication → URL Configuration → **Redirect URLs** ด้วย

---

## 4) เอาขึ้นเว็บจริงด้วย Vercel
1. สร้าง repo บน GitHub แล้ว push โค้ดนี้ขึ้นไป (ดูหัวข้อ "ขึ้น GitHub" ด้านล่าง)
2. ไปที่ https://vercel.com → Sign up ด้วย GitHub → **Add New… → Project** → เลือก repo นี้
3. Vercel จะรู้เองว่าเป็น Vite (Framework Preset = Vite). ส่วน **Environment Variables** ใส่ 2 ตัว:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
4. กด **Deploy** → รอสักครู่จะได้ลิงก์ เช่น `https://your-app.vercel.app`

### ขึ้น GitHub (ถ้ายังไม่เคยทำ)
```bash
git add -A
git commit -m "Road to Million Journal web app"
# สร้าง repo เปล่าบน github.com ก่อน แล้วใช้ URL ของมัน
git remote add origin https://github.com/<ชื่อคุณ>/<ชื่อ repo>.git
git push -u origin main
```

---

## 5) อัปเดต URL ให้ตรงกับลิงก์จริง (สำคัญ — ไม่งั้นล็อกอินจะ error)
หลังได้ลิงก์ Vercel แล้ว:
1. **Supabase → Authentication → URL Configuration**
   - **Site URL**: `https://your-app.vercel.app`
   - **Redirect URLs**: เพิ่ม `https://your-app.vercel.app` (และ `http://localhost:5173` ไว้ทดสอบ)
2. **Google Cloud → Credentials → OAuth client** ของคุณ
   - **Authorized redirect URIs**: ต้องมี Supabase callback อยู่แล้ว (จากขั้น 2.1) — ไม่ต้องเพิ่ม Vercel ตรงนี้ เพราะ Google เด้งกลับไปที่ Supabase ก่อน

เสร็จแล้ว! เปิดลิงก์ Vercel จากมือถือ/คอมเครื่องไหนก็ได้ ล็อกอิน Google เดิม ข้อมูลจะตามไปครบ 🎉

---

## เกร็ด/แก้ปัญหาที่พบบ่อย
- **ล็อกอินแล้วเด้ง error `redirect_uri_mismatch`** → redirect URI ใน Google ไม่ตรงกับ Supabase callback URL ให้คัดลอกจาก Supabase มาวางให้ตรงเป๊ะ
- **ล็อกอินได้แต่กลับมาหน้า Login** → ยังไม่ได้ใส่โดเมนใน Supabase **Redirect URLs / Site URL** (ขั้น 5)
- **อัปโหลดรูปไม่ขึ้น** → ยังไม่ได้รัน `schema.sql` (ไม่มี bucket `images`) หรือรันไม่ครบ
- **หน้าเว็บขาวเปล่า** → ค่า `.env.local` / Environment Variables ผิด ลองเช็ก URL กับ key อีกครั้ง
- **อยากให้คนอื่นล็อกอินได้ด้วย** → ใน Google OAuth consent screen กด **Publish app** (ออกจากโหมด Testing)

## หมายเหตุด้านความปลอดภัย
- ข้อมูลทุก row ถูกล็อกด้วย Row Level Security → ผู้ใช้เห็นเฉพาะข้อมูลตัวเอง
- bucket รูปตั้งเป็น public (อ่านผ่านลิงก์ได้) แต่ path มี user id เป็น UUID จึงเดายาก ถ้าต้องการเข้มกว่านี้เปลี่ยนเป็น signed URL ได้ภายหลัง
