-- Schmart Coach — схема базы
-- Запусти целиком в Supabase → SQL Editor.

create extension if not exists pgcrypto;

-- Карточки ---------------------------------------------------------------
create table if not exists public.cards (
  id           text primary key,                 -- slug, он же адрес в QR: 'jobs'
  theme        text not null,                    -- FOCUS / ACTORS / SINGERS / LEGENDS / MOVIES
  kind         text not null default 'person'
               check (kind in ('person','character','action')),
  person       text,                             -- кто на карточке (null для action)
  source_work  text,                             -- фильм/книга для персонажей
  quote        text not null,                    -- текст, как на карточке
  color        text,                             -- цвет темы для фронта
  sort_order   int  not null default 0,
  exa_queries  text[] not null default '{}',     -- что искать в Exa
  notes        text,                             -- подсказки для проверки (не факты)
  knowledge    jsonb,                            -- «пакет знаний» после ingest
  status       text not null default 'draft'
               check (status in ('draft','ingesting','ready','error')),
  error        text,
  ingested_at  timestamptz,
  updated_at   timestamptz not null default now()
);

-- Источники, найденные Exa ----------------------------------------------
create table if not exists public.sources (
  id             bigserial primary key,
  card_id        text not null references public.cards(id) on delete cascade,
  url            text not null,
  title          text,
  author         text,
  published_date text,
  text           text,
  query          text,
  created_at     timestamptz not null default now(),
  unique (card_id, url)
);

-- Чаты -------------------------------------------------------------------
create table if not exists public.chats (
  id         uuid primary key default gen_random_uuid(),
  card_id    text not null references public.cards(id) on delete cascade,
  mode       text not null check (mode in ('quote','point','person')),
  point_id   text,
  created_at timestamptz not null default now()
);

alter table public.chats add column if not exists action text;  -- действие на сегодня

-- Список ожидания (продукты и курсы)
create table if not exists public.waitlist (
  id         bigserial primary key,
  email      text not null,
  product    text not null default 'general',
  created_at timestamptz not null default now(),
  unique (email, product)
);
alter table public.waitlist enable row level security;
drop policy if exists "anyone can join waitlist" on public.waitlist;
create policy "anyone can join waitlist" on public.waitlist
  for insert to anon, authenticated with check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
grant insert on public.waitlist to anon, authenticated;
grant usage, select on sequence public.waitlist_id_seq to anon, authenticated;

create table if not exists public.messages (
  id         bigserial primary key,
  chat_id    uuid not null references public.chats(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_chat_idx on public.messages(chat_id, id);

-- Публичное представление для фронта (без служебных полей) --------------
create or replace view public.cards_public
with (security_invoker = true) as
select
  id, theme, kind, person, source_work, quote, color, sort_order,
  knowledge->>'context_short'   as context_short,
  knowledge->'attribution'      as attribution,
  knowledge->'talking_points'   as talking_points,
  knowledge->'facts'            as facts,
  knowledge->'chips'            as chips
from public.cards
where status = 'ready';

-- Безопасность (RLS) -----------------------------------------------------
alter table public.cards    enable row level security;
alter table public.sources  enable row level security;
alter table public.chats    enable row level security;
alter table public.messages enable row level security;

-- Фронт может читать готовые карточки и их источники.
drop policy if exists "read ready cards" on public.cards;
create policy "read ready cards" on public.cards
  for select to anon, authenticated using (status = 'ready');

drop policy if exists "read sources of ready cards" on public.sources;
create policy "read sources of ready cards" on public.sources
  for select to anon, authenticated
  using (exists (select 1 from public.cards c where c.id = card_id and c.status = 'ready'));

-- chats / messages: политик нет → пишет и читает только Edge Function (service role).

grant select on public.cards_public to anon, authenticated;

-- Если таблица cards уже была создана раньше без notes:
alter table public.cards add column if not exists notes text;

-- Защита от накрутки: хэш IP (не сам IP) на чатах + индексы для лимитов
alter table public.chats add column if not exists client_ip text;
create index if not exists chats_ip_time on public.chats (client_ip, created_at);
create index if not exists messages_time on public.messages (created_at) where role = 'user';

-- Безопасный пересбор: карточки в статусе refresh остаются видимыми
create or replace view public.cards_public
with (security_invoker = true) as
select
  id, theme, kind, person, source_work, quote, color, sort_order,
  knowledge->>'context_short'   as context_short,
  knowledge->'attribution'      as attribution,
  knowledge->'talking_points'   as talking_points,
  knowledge->'facts'            as facts,
  knowledge->'chips'            as chips
from public.cards
where status in ('ready', 'refresh');
drop policy if exists "read ready cards" on public.cards;
create policy "read ready cards" on public.cards
  for select to anon, authenticated using (status in ('ready', 'refresh'));
alter table public.cards drop constraint if exists cards_status_check;
alter table public.cards add constraint cards_status_check check (status in ('draft','ingesting','ready','refresh','error'));
-- Пересобрать всё безопасно: update cards set status='refresh'; затем ./ingest-all.sh
