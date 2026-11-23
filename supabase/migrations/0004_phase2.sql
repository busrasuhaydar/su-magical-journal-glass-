-- Faz 2: projeler, sosyal medya, kişiler, fikirler, proje hafızası

create type contact_category as enum ('collector','gallery','curator','artist','collaborator','organization','press','other');
create type interaction_kind as enum ('meeting','email','call','message','note');
create type post_status as enum ('idea','draft','preparing','awaiting_approval','scheduled','publishing','published','failed');
create type platform as enum ('instagram','x','youtube','website');
create type idea_category as enum ('art','nft','sculpture','digital','content','personal','goal');
create type memory_kind as enum ('idea','goal','decision','feature_added','feature_removed','technical','problem','solution','reference','stage','state','next_step');

-- Kişiler genişliyor
alter table contacts
  add column category contact_category not null default 'other',
  add column phone text,
  add column website text,
  add column socials jsonb not null default '{}',
  add column notes text,
  add column last_contact_at timestamptz,
  add column follow_up_date date,
  add column expected_response text;

create table project_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references projects on delete cascade,
  contact_id uuid not null references contacts on delete cascade,
  role text,
  created_at timestamptz not null default now(),
  unique (project_id, contact_id)
);
create index project_contacts_contact on project_contacts (contact_id);

create table interactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  contact_id uuid not null references contacts on delete cascade,
  project_id uuid references projects on delete set null,
  event_id uuid references events on delete set null,
  kind interaction_kind not null default 'meeting',
  occurred_at timestamptz not null default now(),
  summary text not null check (length(trim(summary)) > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index interactions_contact on interactions (contact_id, occurred_at desc);
create index interactions_project on interactions (project_id);
create index interactions_event on interactions (event_id);

-- Görüşme eklenince kişinin son iletişim tarihi güncellenir
create or replace function touch_contact() returns trigger language plpgsql set search_path = public as $$
begin
  update contacts set last_contact_at = greatest(coalesce(last_contact_at, new.occurred_at), new.occurred_at) where id = new.contact_id;
  return new;
end $$;
create trigger interactions_touch after insert or update of occurred_at on interactions for each row execute function touch_contact();

-- Proje aşamaları
create table project_stages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references projects on delete cascade,
  title text not null check (length(trim(title)) > 0),
  status task_status not null default 'todo',
  due_date date,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index project_stages_project on project_stages (project_id, position);

-- Sosyal medya: tek içerik kaydı, platform başına hedef
create table social_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid references projects on delete set null,
  content_type text not null default 'post' check (content_type in ('post','carousel','reel','story','video','short','thread','article','promo')),
  title text not null check (length(trim(title)) > 0),
  caption_tr text,
  caption_en text,
  hashtags text[] not null default '{}',
  links text[] not null default '{}',
  status post_status not null default 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status not in ('scheduled','publishing') or scheduled_at is not null)
);
create index social_posts_owner_sched on social_posts (owner_id, scheduled_at);
create index social_posts_project on social_posts (project_id);

create table post_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  post_id uuid not null references social_posts on delete cascade,
  platform platform not null,
  status post_status not null default 'draft',
  published_url text,
  external_id text,
  error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, platform)
);

-- Fikirler ve notlar
create table ideas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (length(trim(title)) > 0),
  body text,
  category idea_category not null default 'art',
  status text not null default 'new' check (status in ('new','developing','converted','archived')),
  converted_project_id uuid references projects on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index ideas_project on ideas (converted_project_id);

create table notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid references projects on delete cascade,
  kind text not null default 'note' check (kind in ('note','reference')),
  title text not null check (length(trim(title)) > 0),
  body text,
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index notes_project on notes (project_id);

-- Proje hafızası: yalnız ekleme; düzeltme yeni kayıtla (supersedes) yapılır
create table memory_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references projects on delete cascade,
  kind memory_kind not null,
  body text not null check (length(trim(body)) > 0),
  decided_on date not null default (now() at time zone 'Europe/Istanbul')::date,
  supersedes uuid references memory_entries on delete set null,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create index memory_entries_project on memory_entries (project_id, created_at desc);
create index memory_entries_supersedes on memory_entries (supersedes);

-- Dosya bağlantıları yeni varlıkları da kapsar
alter table file_links drop constraint file_links_entity_type_check;
alter table file_links add constraint file_links_entity_type_check
  check (entity_type in ('project','task','event','journal_day','contact','social_post','interaction','idea','note'));

-- Tetikleyiciler
do $$
declare t text;
begin
  foreach t in array array['interactions','project_stages','social_posts','post_targets','ideas','notes'] loop
    execute format('create trigger %I_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
  foreach t in array array['project_contacts','interactions','project_stages','social_posts','post_targets','ideas','notes','memory_entries'] loop
    execute format('create trigger %I_log after insert or update or delete on %I for each row execute function log_change()', t, t);
  end loop;
  foreach t in array array['project_contacts','interactions','project_stages','social_posts','post_targets','ideas','notes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "sahip_erisimi" on %I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

alter table memory_entries enable row level security;
create policy "sahip_okur" on memory_entries for select to authenticated using (owner_id = (select auth.uid()));
create policy "sahip_ekler" on memory_entries for insert to authenticated with check (owner_id = (select auth.uid()));
-- güncelleme ve silme politikası yok: hafıza değiştirilemez

revoke execute on function public.touch_contact() from public, anon, authenticated;

-- Fikri projeye dönüştür (atomik): proje + hafıza kaydı + fikir durumu
create or replace function convert_idea(p_idea uuid, p_slug text) returns uuid
language plpgsql security invoker set search_path = public as $$
declare i ideas; pid uuid;
begin
  select * into i from ideas where id = p_idea and owner_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'Fikir bulunamadı'; end if;
  if i.converted_project_id is not null then return i.converted_project_id; end if;
  insert into projects (title, slug, status, description) values (i.title, p_slug, 'planning', i.body) returning id into pid;
  insert into memory_entries (project_id, kind, body, decided_on, source)
    values (pid, 'idea', coalesce(nullif(trim(i.title || E'\n\n' || coalesce(i.body, '')), ''), i.title), (i.created_at at time zone 'Europe/Istanbul')::date, 'idea:' || i.id);
  update ideas set status = 'converted', converted_project_id = pid where id = i.id;
  return pid;
end $$;

-- İçerik durumunu hedeflerden türet (elle yayın veya Faz 4 kuyruğu)
create or replace function mark_target_published(p_target uuid, p_url text) returns void
language plpgsql security invoker set search_path = public as $$
declare pid uuid;
begin
  update post_targets set status = 'published', published_url = nullif(trim(p_url), ''), published_at = now(), error = null
   where id = p_target and owner_id = auth.uid() returning post_id into pid;
  if pid is null then raise exception 'Hedef bulunamadı'; end if;
  update social_posts set status = 'published', published_at = coalesce(published_at, now())
   where id = pid and not exists (select 1 from post_targets where post_id = pid and status <> 'published');
end $$;

-- Takvim görünümü: sosyal yayınlar ve takip tarihleri de eklendi
create or replace view v_calendar_entries with (security_invoker = true) as
select 'task'::text as kind, t.id, t.project_id, t.title,
       coalesce(t.starts_at, (t.due_date::timestamp at time zone 'Europe/Istanbul')) as starts_at,
       coalesce(t.ends_at, t.starts_at, (t.due_date::timestamp at time zone 'Europe/Istanbul')) as ends_at,
       (t.starts_at is null) as all_day,
       t.status::text as status, t.priority::text as subtype
from tasks t
where t.deleted_at is null and (t.starts_at is not null or t.due_date is not null)
union all
select 'event', e.id, e.project_id, e.title, e.starts_at, e.ends_at, e.all_day, null, e.kind::text
from events e where e.deleted_at is null
union all
select 'post', p.id, p.project_id, p.title, p.scheduled_at, p.scheduled_at, false, p.status::text, p.content_type
from social_posts p where p.deleted_at is null and p.scheduled_at is not null
union all
select 'followup', c.id, null, c.name, (c.follow_up_date::timestamp at time zone 'Europe/Istanbul'), (c.follow_up_date::timestamp at time zone 'Europe/Istanbul'), true, null, c.category::text
from contacts c where c.deleted_at is null and c.follow_up_date is not null;

alter publication supabase_realtime add table contacts, project_contacts, interactions, project_stages, social_posts, post_targets, ideas, notes, memory_entries;
