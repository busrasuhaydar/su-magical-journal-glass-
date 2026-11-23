-- Su's Magical Journal · Faz 1 çekirdek şema
-- Tek kayıt ilkesi: her bilgi tek satır; takvim bir görünümdür.

create extension if not exists pgcrypto;

-- ── Tipler ──────────────────────────────────────────────
create type priority as enum ('urgent','high','medium','low');
create type task_status as enum ('todo','doing','done','postponed','cancelled');
create type project_status as enum ('idea','planning','active','paused','completed','archived');
create type event_kind as enum ('meeting','exhibition','fair','creative','personal','break','other');
create type journal_block_kind as enum ('note','image','video','audio','pdf','document','link');
create type certainty as enum ('confirmed','uncertain','conflicting');

-- ── Ortak yardımcılar ───────────────────────────────────
create or replace function set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- ── Profil ──────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Istanbul',
  hidden_holiday_countries text[] not null default '{}',  -- boş = tüm ülkeler görünür
  show_observances boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ── Projeler ────────────────────────────────────────────
create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (length(trim(title)) > 0),
  slug text not null,
  status project_status not null default 'active',
  priority priority not null default 'medium',
  start_date date,
  target_date date,
  color text not null default '#E2558C',
  description text,
  objectives jsonb not null default '[]',
  progress_override numeric check (progress_override between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, slug)
);

-- ── Kişiler (Faz 2'de genişler) ─────────────────────────
create table contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  organization text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── Görevler ────────────────────────────────────────────
create table tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid references projects on delete set null,
  contact_id uuid references contacts on delete set null,
  title text not null check (length(trim(title)) > 0),
  description text,
  due_date date,                       -- saatsiz görevler için
  starts_at timestamptz,
  ends_at timestamptz,
  priority priority not null default 'medium',
  category text,
  status task_status not null default 'todo',
  rrule text check (rrule is null or rrule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;INTERVAL=[0-9]+)?$'),
  recurrence_parent uuid references tasks on delete set null,
  postpone_count int not null default 0,
  completed_at timestamptz,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index tasks_owner_start on tasks (owner_id, starts_at);
create index tasks_owner_due on tasks (owner_id, due_date);
create index tasks_project on tasks (project_id);
create index tasks_contact on tasks (contact_id);
create index tasks_parent on tasks (recurrence_parent);

-- ── Etkinlikler ─────────────────────────────────────────
create table events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid references projects on delete set null,
  contact_id uuid references contacts on delete set null,
  kind event_kind not null default 'other',
  title text not null check (length(trim(title)) > 0),
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_at >= starts_at)
);
create index events_owner_start on events (owner_id, starts_at);
create index events_project on events (project_id);
create index events_contact on events (contact_id);

-- ── Hatırlatıcılar (gönderim altyapısı Faz 4) ───────────
create table reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid references tasks on delete cascade,
  event_id uuid references events on delete cascade,
  remind_at timestamptz not null,
  channel text not null default 'in_app' check (channel in ('in_app','push','email')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(task_id, event_id) = 1)
);
create index reminders_due on reminders (remind_at) where sent_at is null;
create index reminders_task on reminders (task_id);
create index reminders_event on reminders (event_id);

-- ── Dosyalar (tek yükleme, çok bağlantı) ────────────────
create table files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  storage_path text not null unique,
  title text not null,
  mime text not null,
  size bigint not null check (size >= 0),
  sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, sha256)
);

create table file_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  file_id uuid not null references files on delete cascade,
  entity_type text not null check (entity_type in ('project','task','event','journal_day','contact')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (file_id, entity_type, entity_id)
);
create index file_links_entity on file_links (entity_type, entity_id);

-- ── Günlük sayfaları ────────────────────────────────────
create table journal_days (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  goal text,
  mood text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, day)
);

create table journal_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  day_id uuid not null references journal_days on delete cascade,
  kind journal_block_kind not null,
  title text,
  body text,
  url text,
  file_id uuid references files on delete set null,
  position int not null default 0,
  size text not null default 'm' check (size in ('s','m','l')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index journal_blocks_day on journal_blocks (day_id, position);
create index journal_blocks_file on journal_blocks (file_id);

-- ── Resmî tatiller (ortak başvuru verisi) ───────────────
create table holidays (
  id uuid primary key default gen_random_uuid(),
  country text not null,             -- ISO 3166-1 alpha-2
  day date not null,
  name text not null,                -- İngilizce ad
  local_name text not null,          -- yerel ad
  kind text not null default 'public' check (kind in ('public','half_day','observance')),
  certainty certainty not null default 'confirmed',
  note text,
  source text not null,
  unique (country, day, local_name)
);
create index holidays_day on holidays (day, country);

-- ── Değişiklik günlüğü (yalnız ekleme) ──────────────────
create table change_log (
  id bigserial primary key,
  owner_id uuid not null,
  table_name text not null,
  row_id uuid not null,
  op text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index change_log_owner_at on change_log (owner_id, at desc);
create index change_log_row on change_log (row_id);

create or replace function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into change_log (owner_id, table_name, row_id, op, before, after)
  values (
    coalesce((case when tg_op = 'DELETE' then old.owner_id else new.owner_id end), auth.uid()),
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

-- updated_at ve günlük tetikleyicileri
do $$
declare t text;
begin
  foreach t in array array['profiles','projects','contacts','tasks','events','files','journal_days','journal_blocks'] loop
    execute format('create trigger %I_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
  foreach t in array array['projects','contacts','tasks','events','files','file_links','journal_days','journal_blocks','reminders'] loop
    execute format('create trigger %I_log after insert or update or delete on %I for each row execute function log_change()', t, t);
  end loop;
end $$;

-- ── Satır düzeyi güvenlik ───────────────────────────────
alter table profiles enable row level security;
create policy "profil_sahibi" on profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['projects','contacts','tasks','events','reminders','files','file_links','journal_days','journal_blocks'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "sahip_erisimi" on %I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

alter table holidays enable row level security;
create policy "herkes_okur" on holidays for select to authenticated using (true);

alter table change_log enable row level security;
create policy "sahip_okur" on change_log for select to authenticated using (owner_id = (select auth.uid()));
-- change_log'a yazma yalnız tetikleyiciyle; güncelleme/silme politikası yok.

-- ── İş kuralları (RPC) ──────────────────────────────────
-- Görevi tamamla; tekrarlıysa bir sonraki örneği oluştur (atomik).
create or replace function complete_task(p_id uuid) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  t tasks; nxt uuid; step interval; freq text; n int;
begin
  update tasks set status = 'done', completed_at = now()
   where id = p_id and owner_id = auth.uid() and status <> 'done'
   returning * into t;
  if not found then return null; end if;
  if t.rrule is null then return null; end if;

  freq := substring(t.rrule from 'FREQ=([A-Z]+)');
  n := coalesce(substring(t.rrule from 'INTERVAL=([0-9]+)')::int, 1);
  step := case freq when 'DAILY' then make_interval(days => n)
                    when 'WEEKLY' then make_interval(weeks => n)
                    when 'MONTHLY' then make_interval(months => n)
                    else make_interval(years => n) end;

  insert into tasks (owner_id, project_id, contact_id, title, description, due_date, starts_at, ends_at,
                     priority, category, rrule, recurrence_parent, source)
  values (t.owner_id, t.project_id, t.contact_id, t.title, t.description,
          (t.due_date + step)::date,
          case when t.starts_at is not null then (t.starts_at at time zone 'Europe/Istanbul' + step) at time zone 'Europe/Istanbul' end,
          case when t.ends_at is not null then (t.ends_at at time zone 'Europe/Istanbul' + step) at time zone 'Europe/Istanbul' end,
          t.priority, t.category, t.rrule, coalesce(t.recurrence_parent, t.id), 'recurrence')
  returning id into nxt;
  return nxt;
end $$;

-- Görevi ertele: yeni zamana taşı, sayacı artır (eski hali change_log'da kalır).
create or replace function postpone_task(p_id uuid, p_starts timestamptz, p_ends timestamptz, p_due date)
returns void language sql security invoker set search_path = public as $$
  update tasks set starts_at = p_starts, ends_at = p_ends, due_date = p_due,
         status = 'todo', postpone_count = postpone_count + 1
   where id = p_id and owner_id = auth.uid();
$$;

-- ── Görünümler (RLS'e uyar) ─────────────────────────────
create view v_project_progress with (security_invoker = true) as
select p.id as project_id,
       count(t.id) filter (where t.status <> 'cancelled') as total_tasks,
       count(t.id) filter (where t.status = 'done') as done_tasks,
       coalesce(p.progress_override,
         case when count(t.id) filter (where t.status <> 'cancelled') = 0 then 0
              else round(100.0 * count(t.id) filter (where t.status = 'done')
                         / count(t.id) filter (where t.status <> 'cancelled')) end) as progress,
       p.progress_override is not null as is_manual
from projects p
left join tasks t on t.project_id = p.id and t.deleted_at is null
where p.deleted_at is null
group by p.id;

create view v_calendar_entries with (security_invoker = true) as
select 'task'::text as kind, t.id, t.project_id, t.title,
       coalesce(t.starts_at, (t.due_date::timestamp at time zone 'Europe/Istanbul')) as starts_at,
       coalesce(t.ends_at, t.starts_at, (t.due_date::timestamp at time zone 'Europe/Istanbul')) as ends_at,
       (t.starts_at is null) as all_day,
       t.status::text as status, t.priority::text as subtype
from tasks t
where t.deleted_at is null and (t.starts_at is not null or t.due_date is not null)
union all
select 'event', e.id, e.project_id, e.title, e.starts_at, e.ends_at, e.all_day, null, e.kind::text
from events e where e.deleted_at is null;

-- ── Realtime ────────────────────────────────────────────
alter publication supabase_realtime add table projects, tasks, events, files, file_links, journal_days, journal_blocks, profiles;

-- ── Depolama: özel kova, kullanıcı klasörü ──────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 1073741824)
on conflict (id) do nothing;

create policy "dosya_sahibi_okur" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "dosya_sahibi_yukler" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "dosya_sahibi_gunceller" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "dosya_sahibi_siler" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
