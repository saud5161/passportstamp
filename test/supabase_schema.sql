-- جدول الرحلات الواردة عبر الايميل (Altea CM)
create table if not exists incoming_flight_emails (
  id uuid primary key default gen_random_uuid(),
  flight_number text not null,        -- SV804
  flight_date text,                   -- 20260716 (كما ورد بالموضوع)
  origin_code text,                   -- RUH
  received_at timestamptz not null,   -- وقت وصول الايميل الفعلي
  subject text,                       -- نص الموضوع كامل كما وصل
  file_name text not null,            -- altea_report.pdf
  file_path text,                     -- المسار داخل bucket التخزين (اختياري)
  attachment_url text,                -- رابط Google Drive للمرفق (اختياري)
  is_checked boolean not null default false,
  checked_at timestamptz,
  review_status text,                 -- null = قيد المراجعة | 'complete' | 'missing' | 'note'
  review_note text,                   -- نص الملاحظة عند اختيار review_status = 'note'
  created_at timestamptz not null default now()
);

-- ترتيب افتراضي: الأحدث وصولاً أولاً
create index if not exists idx_incoming_flight_emails_received_at
  on incoming_flight_emails (received_at desc);

-- bucket تخزين ملفات PDF المرفقة
insert into storage.buckets (id, name, public)
values ('flight-emails', 'flight-emails', true)
on conflict (id) do nothing;

-- تشغيل فقط إذا الجدول موجود مسبقًا وناقصه هذي الأعمدة:
alter table incoming_flight_emails add column if not exists review_status text;
alter table incoming_flight_emails add column if not exists review_note text;

-- جدول إعدادات عامة للصفحة (مثل الرقم السري)
create table if not exists app_settings (
  key text primary key,
  value text not null
);

insert into app_settings (key, value) values ('access_pin', '123123')
on conflict (key) do update set value = excluded.value;
