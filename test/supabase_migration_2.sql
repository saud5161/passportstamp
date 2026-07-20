-- تعديل بسيط: دعم رابط مرفق خارجي (Zapier) بدل رفع الملف لتخزين Supabase
alter table incoming_flight_emails
  add column if not exists attachment_url text;

-- الآن file_path يبقى اختياري (نادراً ما نحتاجه بهذا المسار المبسّط)
alter table incoming_flight_emails
  alter column file_path drop not null;
