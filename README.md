# Shifter Punkz TRPG site (alpha)

เว็บไซต์ของจักรวาล Shifter Punkz: แอนิเมชัน, TRPG, เกมดิจิทัล และบอร์ดเกม
Published by Rollaholic Games · Game Designer: Jittrapa K. (Prim)

## โครงสร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้า Home + Media Hub |
| `trpg.html` | หน้า TRPG (Lore, วิธีเล่น, กฎย่อ, ร้านหนังสือ) |
| `beta/auth.html`, `beta/account.html` | ระบบสมาชิกช่วงทดสอบ (เปิดเฉพาะผู้ได้รับเชิญ) |
| `assets/sp.js`, `assets/beta-*.js` | เชื่อม Supabase (Auth, profiles, storage) |
| `assets/dc.js` | ตัวเรนเดอร์เทมเพลตขนาดเล็ก (ภาษา TH/EN, เมนู, แท็บ, อนิเมชัน) |
| `tools/build.py` | สคริปต์แปลง artboard จาก design canvas เป็นหน้าเว็บ |
| `.github/workflows/static.yml` | deploy ขึ้น GitHub Pages อัตโนมัติเมื่อ push เข้า `main` |

## อัปเดตหน้าเว็บ

1. แก้ดีไซน์บน design canvas
2. ดาวน์โหลด `Main.dc.html` / `TRPG.dc.html` ไว้ในโฟลเดอร์เดียวกัน
3. `python3 tools/build.py <โฟลเดอร์นั้น>`
4. commit และ push เข้า `main` เว็บจะอัปเดตเองภายใน 1–2 นาที

## Beta (เฟส 2)

หน้า `beta/` ใช้ Supabase project `Shifter Punkz site` ยังไม่มีลิงก์จากหน้าสาธารณะ
(ปุ่มเข้าสู่ระบบบนหน้า Home/TRPG ยังเป็น SOON) — ทดสอบผ่านลิงก์ตรงเท่านั้น

ยังไม่เปิด: Character Sheet, My Characters, Session ของฉัน, GM Monitor

> repo นี้เป็น public — ห้ามใส่เนื้อหาสำหรับ GM (spoiler) หรือข้อมูลลับลงใน repo

## GM permission

The GM role is for book owners. Every printed book carries a one-time code (`BK-XXXX-XXXX`); entering it under Settings → My books unlocks GM on that account.

Make codes in the Supabase SQL editor (books: `core`, `dossier-cpd`, `gadget-blueprint`, `one-shot`):

```sql
select code from private.make_book_codes('core', 50);
```

Who used which code: `select * from public.book_codes where redeemed_by is not null;`. A dev can still tick or untick `profiles.gm_allowed` by hand in the Table Editor; unticking drops the account back to player.
