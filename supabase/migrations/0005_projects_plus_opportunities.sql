-- Gelişmiş projeler (kapak, galeri, alt sayfalar, alt görevler, kilometre taşları, bağlantılar)
-- ve Faz 3: Sergiler ve Fırsatlar

-- Projeler: kapak ve simge
alter table projects add column cover_file_id uuid references files on delete set null, add column icon text;
create index projects_cover on projects (cover_file_id);

-- Alt görevler
alter table tasks add column parent_task_id uuid references tasks on delete cascade, add column opportunity_id uuid;
create index tasks_parent_task on tasks (parent_task_id);

-- Galeri: dosya ↔ varlık bağlantısına açıklama, not ve sıra
alter table file_links add column caption text, add column note text, add column position int not null default 0;

-- Aşamalar kilometre taşı olabilir
alter table project_stages add column kind text not null default 'stage' check (kind in ('stage','milestone')), add column description text;

-- Notlar bir göreve bağlanabilir, fikirler bir projeye
alter table notes add column task_id uuid references tasks on delete set null;
alter table ideas add column project_id uuid references projects on delete set null;
create index notes_task on notes (task_id);
create index ideas_project_link on ideas (project_id);

-- Alt sayfalar ve bloklar
create table pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references projects on delete cascade,
  parent_id uuid references pages on delete cascade,
  title text not null default 'Adsız sayfa',
  icon text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index pages_project on pages (project_id, position);
create index pages_parent on pages (parent_id);

create table page_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  page_id uuid not null references pages on delete cascade,
  type text not null check (type in ('text','h1','h2','h3','bullet','numbered','todo','quote','callout','divider','image','file','link','task','page')),
  content jsonb not null default '{}',
  file_id uuid references files on delete set null,
  task_id uuid references tasks on delete set null,
  ref_page_id uuid references pages on delete set null,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index page_blocks_page on page_blocks (page_id, position);
create index page_blocks_file on page_blocks (file_id);
create index page_blocks_task on page_blocks (task_id);
create index page_blocks_ref on page_blocks (ref_page_id);

-- Bağlantılı içerik: herhangi bir kayıt başka bir projeye / sayfaya bağlanır (kopya yok)
create table entity_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  from_type text not null check (from_type in ('task','note','file','page','idea','social_post','event','opportunity')),
  from_id uuid not null,
  to_type text not null check (to_type in ('project','page','task','opportunity')),
  to_id uuid not null,
  created_at timestamptz not null default now(),
  unique (from_type, from_id, to_type, to_id)
);
create index entity_links_to on entity_links (to_type, to_id);
create index entity_links_from on entity_links (from_type, from_id);

-- ── Faz 3: Fırsatlar ───────────────────────────────────
create type opp_status as enum ('to_review','potential','preparing','submitted','awaiting','accepted','rejected','exhibiting','completed','withdrawn');
create type opp_kind as enum ('exhibition','fair','open_call','competition','residency','gallery','program','event','grant');
create type opp_date_kind as enum ('app_open','deadline','announcement','delivery','install','opening','closing');

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (length(trim(title)) > 0),
  kind opp_kind not null default 'open_call',
  organization text, gallery text, city text, country text,
  fee_amount numeric, fee_currency text check (fee_currency in ('TRY','USD','EUR','GBP')),
  fee_note text,
  requirements text, artwork_requirements text,
  required_docs jsonb not null default '[]',   -- [{label, done, file_id}]
  application_url text, contact jsonb not null default '{}',
  notes text,
  status opp_status not null default 'to_review',
  source_text text, source_url text, source_file_id uuid references files on delete set null,
  extraction jsonb,                              -- AI çıktısı: alan, güven, kanıt, uyarılar
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index opportunities_source_file on opportunities (source_file_id);
alter table tasks add constraint tasks_opportunity_fk foreign key (opportunity_id) references opportunities on delete set null;
create index tasks_opportunity on tasks (opportunity_id);

create table opportunity_dates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  opportunity_id uuid not null references opportunities on delete cascade,
  kind opp_date_kind not null,
  day date not null,
  time_text text,
  certainty certainty not null default 'confirmed',
  evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, kind)
);
create index opportunity_dates_day on opportunity_dates (owner_id, day);

create table project_opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references projects on delete cascade,
  opportunity_id uuid not null references opportunities on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, opportunity_id)
);
create index project_opportunities_opp on project_opportunities (opportunity_id);

-- Hatırlatıcılar fırsat tarihlerini de kapsar
alter table reminders add column opportunity_date_id uuid references opportunity_dates on delete cascade, add column label text;
do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid = 'public.reminders'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%num_nonnulls%';
  if c is not null then execute format('alter table reminders drop constraint %I', c); end if;
end $$;
alter table reminders add constraint reminders_target check (num_nonnulls(task_id, event_id, opportunity_date_id) = 1);
create index reminders_opp_date on reminders (opportunity_date_id);

create table reminder_settings (
  owner_id uuid primary key default auth.uid() references auth.users on delete cascade,
  deadline_offsets int[] not null default '{30,14,7,3,0}',
  other_offsets int[] not null default '{1,0}',
  updated_at timestamptz not null default now()
);

-- Tarih değişince hatırlatıcıları yeniden üret (gönderilmemişler)
create or replace function regen_opp_reminders() returns trigger
language plpgsql security invoker set search_path = public as $$
declare offs int[]; o int; t text;
begin
  delete from reminders where opportunity_date_id = new.id and sent_at is null;
  select case when new.kind = 'deadline' then deadline_offsets else other_offsets end into offs
    from reminder_settings where owner_id = new.owner_id;
  offs := coalesce(offs, case when new.kind = 'deadline' then '{30,14,7,3,0}'::int[] else '{1,0}'::int[] end);
  select title into t from opportunities where id = new.opportunity_id;
  foreach o in array offs loop
    if (new.day - o) >= (now() at time zone 'Europe/Istanbul')::date then
      insert into reminders (owner_id, opportunity_date_id, remind_at, label)
      values (new.owner_id, new.id, ((new.day - o)::timestamp + time '09:00') at time zone 'Europe/Istanbul',
              t || ' · ' || case when o = 0 then 'bugün' else o || ' gün kaldı' end);
    end if;
  end loop;
  return new;
end $$;
create trigger opportunity_dates_reminders after insert or update of day on opportunity_dates
  for each row execute function regen_opp_reminders();

-- Tetikleyiciler, RLS
do $$
declare t text;
begin
  foreach t in array array['pages','page_blocks','opportunities','opportunity_dates'] loop
    execute format('create trigger %I_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
  foreach t in array array['pages','page_blocks','entity_links','opportunities','opportunity_dates','project_opportunities'] loop
    execute format('create trigger %I_log after insert or update or delete on %I for each row execute function log_change()', t, t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy "sahip_erisimi" on %I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;
alter table reminder_settings enable row level security;
create policy "sahip_erisimi" on reminder_settings for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- İlerleme: alt görevler dahil, aşamalar ayrıca gösterilir
create or replace view v_project_progress with (security_invoker = true) as
select p.id as project_id,
       count(t.id) filter (where t.status <> 'cancelled') as total_tasks,
       count(t.id) filter (where t.status = 'done') as done_tasks,
       coalesce(p.progress_override,
         case when count(t.id) filter (where t.status <> 'cancelled') = 0 then 0
              else round(100.0 * count(t.id) filter (where t.status = 'done')
                         / count(t.id) filter (where t.status <> 'cancelled')) end) as progress,
       p.progress_override is not null as is_manual,
       count(t.id) filter (where t.status not in ('done','cancelled') and coalesce(t.ends_at, (t.due_date + 1)::timestamp at time zone 'Europe/Istanbul') < now()) as overdue_tasks
from projects p
left join tasks t on t.project_id = p.id and t.deleted_at is null
where p.deleted_at is null
group by p.id;

-- Takvim: fırsat tarihleri ve kilometre taşları da görünür
create or replace view v_calendar_entries with (security_invoker = true) as
select 'task'::text as kind, t.id, t.project_id, t.title,
       coalesce(t.starts_at, (t.due_date::timestamp at time zone 'Europe/Istanbul')) as starts_at,
       coalesce(t.ends_at, t.starts_at, (t.due_date::timestamp at time zone 'Europe/Istanbul')) as ends_at,
       (t.starts_at is null) as all_day, t.status::text as status, t.priority::text as subtype
from tasks t where t.deleted_at is null and (t.starts_at is not null or t.due_date is not null)
union all
select 'event', e.id, e.project_id, e.title, e.starts_at, e.ends_at, e.all_day, null, e.kind::text
from events e where e.deleted_at is null
union all
select 'post', p.id, p.project_id, p.title, p.scheduled_at, p.scheduled_at, false, p.status::text, p.content_type
from social_posts p where p.deleted_at is null and p.scheduled_at is not null
union all
select 'followup', c.id, null, c.name, (c.follow_up_date::timestamp at time zone 'Europe/Istanbul'), (c.follow_up_date::timestamp at time zone 'Europe/Istanbul'), true, null, c.category::text
from contacts c where c.deleted_at is null and c.follow_up_date is not null
union all
select 'opportunity', d.id, null, o.title, (d.day::timestamp at time zone 'Europe/Istanbul'), (d.day::timestamp at time zone 'Europe/Istanbul'), true, o.status::text, d.kind::text
from opportunity_dates d join opportunities o on o.id = d.opportunity_id where o.deleted_at is null
union all
select 'milestone', s.id, s.project_id, s.title, (s.due_date::timestamp at time zone 'Europe/Istanbul'), (s.due_date::timestamp at time zone 'Europe/Istanbul'), true, s.status::text, s.kind
from project_stages s where s.deleted_at is null and s.due_date is not null;

alter publication supabase_realtime add table pages, page_blocks, entity_links, opportunities, opportunity_dates, project_opportunities;
