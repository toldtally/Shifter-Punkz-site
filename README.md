# Shifter Punkz TRPG site (alpha)

เว็บไซต์ของจักรวาล Shifter Punkz: แอนิเมชัน, TRPG, เกมดิจิทัล และบอร์ดเกม
Published by Rollaholic Games · Game Designer: Jittrapa K. (Prim)

## โครงสร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้า Home + Media Hub |
| `trpg.html` | หน้า TRPG (Lore, วิธีเล่น, กฎย่อ, ร้านหนังสือ) |
| `assets/dc.js` | ตัวเรนเดอร์เทมเพลตขนาดเล็ก (ภาษา TH/EN, เมนู, แท็บ, อนิเมชัน) |
| `tools/build.py` | สคริปต์แปลง artboard จาก design canvas เป็นหน้าเว็บ |
| `.github/workflows/static.yml` | deploy ขึ้น GitHub Pages อัตโนมัติเมื่อ push เข้า `main` |

## อัปเดตหน้าเว็บ

1. แก้ดีไซน์บน design canvas
2. ดาวน์โหลด `Main.dc.html` / `TRPG.dc.html` ไว้ในโฟลเดอร์เดียวกัน
3. `python3 tools/build.py <โฟลเดอร์นั้น>`
4. commit และ push เข้า `main` เว็บจะอัปเดตเองภายใน 1–2 นาที

## ยังไม่เปิด (เฟส 2)

เข้าสู่ระบบ, Character Sheet, My Characters, Session ของฉัน และ GM Monitor
จะเปิดหลังเชื่อม Supabase (Google / Email / Discord) ตอนนี้ลิงก์เหล่านี้ขึ้นป้าย SOON

> repo นี้เป็น public — ห้ามใส่เนื้อหาสำหรับ GM (spoiler) หรือข้อมูลลับลงใน repo
