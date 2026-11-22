# CheckinApp (Vite + React + Tailwind CSS v4)

ระบบลงเวลาปฏิบัติราชการออนไลน์ (BMA Time Attendance System) เวอร์ชันปรับโครงสร้างใหม่ด้วย **Vite + React + Tailwind CSS v4 + Supabase** รองรับการ Deploy พร้อมกันทั้ง **GitHub Pages (branch `main`)** และ **Cloudflare Pages**

## เทคโนโลยีหลัก
- **Frontend:** React 18, Vite 6, React Router (`HashRouter`), Tailwind CSS v4 (`@tailwindcss/vite`)
- **Backend & Realtime:** Supabase (`@supabase/supabase-js` + Tri-Layer Realtime Sync)
- **Maps & Exports:** Leaflet, SweetAlert2, SheetJS (`xlsx`), ExcelJS, FontAwesome 6

## การพัฒนาในเครื่อง
```bash
npm install
npm run dev
```

## การ Build Production
```bash
npm run build
npm run preview
```

## การ Deploy
- **GitHub Pages:** อัตโนมัติผ่าน `.github/workflows/deploy.yml` เมื่อ push ขึ้น branch `main`
- **Cloudflare Pages:** ตั้งค่า Build command เป็น `npm run build` และ Build output directory เป็น `dist`
- ใช้ `HashRouter` + `base: './'` ทำให้ build ชุดเดียวทำงานได้ทั้ง subpath (`/Checkin-Vite-React/`) และ root (`/`)

## คู่มือการใช้งาน
เปิดดูคู่มือออนไลน์แบบ Standalone ได้ที่ `public/docs/manual/index.html` (แยก User / Admin / SuperAdmin)
