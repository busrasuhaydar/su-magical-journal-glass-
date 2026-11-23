-- Faz 4: bildirimler, web push, sosyal hesaplar, yayın kuyruğu, zamanlayıcı
-- (Veritabanına 'phase4_integrations' ve 'realtime_reminders' göçleriyle uygulandı.)
create extension if not exists pg_cron;
create table app_secrets (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table app_secrets enable row level security;                      -- politika yok: yalnız service role
insert into app_secrets (key, value) values ('cron_secret', encode(gen_random_bytes(32), 'hex'));
create table app_config (key text primary key, value text not null);    -- ör. vapid_public (dağıtıcı üretir)
alter table app_config enable row level security;
create policy "okuma" on app_config for select to authenticated using (true);
create table notifications (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade,
  kind text not null default 'reminder' check (kind in ('reminder','publish','system','test')), title text not null, body text, url text,
  reminder_id uuid references reminders on delete set null, read_at timestamptz, created_at timestamptz not null default now());
-- RLS: sahip okur / işaretler / siler; ekleme yalnız dağıtıcı (service role)
create table push_subscriptions (id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null, user_agent text, created_at timestamptz not null default now());
create table social_accounts (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade, platform platform not null,
  account_name text, external_id text, status text not null default 'connected' check (status in ('connected','needs_reauth','error')), scopes text,
  meta jsonb not null default '{}', connected_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (owner_id, platform));
create table social_tokens (account_id uuid primary key references social_accounts on delete cascade, access_token text not null, refresh_token text,
  expires_at timestamptz, updated_at timestamptz not null default now());   -- politika yok: istemciye tamamen kapalı
create table oauth_states (state text primary key, owner_id uuid not null references auth.users on delete cascade, platform platform not null,
  code_verifier text, return_to text not null, created_at timestamptz not null default now());
alter table post_targets add column attempts int not null default 0, add column next_attempt_at timestamptz;
alter table profiles add column email_notifications boolean not null default false;
alter publication supabase_realtime add table notifications, social_accounts, reminders;
-- Zamanlayıcı: her dakika dispatcher fonksiyonunu x-cron-secret başlığıyla çağırır
select cron.schedule('journal-dispatch', '* * * * *', $cron$
  select net.http_post(url := 'https://tjouaydmwmokbuomyyub.supabase.co/functions/v1/dispatcher',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from public.app_secrets where key='cron_secret')),
    body := '{"source":"cron"}'::jsonb, timeout_milliseconds := 55000);
$cron$);
