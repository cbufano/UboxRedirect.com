-- ============================================================
-- Fase 7 / Onda 7.1 — Warehouse físico: localizações endereçadas
-- (zona-corredor-estante-nível-posição), vínculo pacote→posição,
-- histórico de movimentação e funções de grade/sugestão.
-- Aplicar depois de 20260730000005_profiles_staff_update_policy.sql.
-- ============================================================

-- 1) Localizações físicas. Código legível gerado: 'G-A-01-1-01'.
create table public.warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  zone text not null default 'G',
  aisle text not null,
  rack text not null,
  level text not null,
  bin text not null,
  code text generated always as (zone || '-' || aisle || '-' || rack || '-' || level || '-' || bin) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (zone, aisle, rack, level, bin)
);

create unique index warehouse_locations_code_idx on public.warehouse_locations (code);

alter table public.warehouse_locations enable row level security;

-- Warehouse é 100% interno: cliente não tem NENHUMA policy aqui.
-- (packages.location_id fica visível como uuid opaco para o dono do
-- pacote via o SELECT já existente de packages — inofensivo, ele não
-- consegue resolver o uuid para um código sem policy nesta tabela.)
create policy "warehouse_locations_select_staff" on public.warehouse_locations
  for select to authenticated
  using (private.is_staff((select auth.uid())));

create policy "warehouse_locations_update_staff" on public.warehouse_locations
  for update to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

-- INSERT direto não é liberado nem para staff: criação de posições passa
-- SEMPRE pela função generate_warehouse_locations (admin-only, abaixo),
-- garantindo grade consistente.

-- 2) Vínculo do pacote com a posição.
alter table public.packages
  add column location_id uuid references public.warehouse_locations (id);

-- 3) Trilha de movimentação (auditoria leve; moved_by com RESTRICT,
--    padrão de retenção estabelecido em payments/data_requests).
create table public.package_location_history (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  from_location_id uuid references public.warehouse_locations (id),
  to_location_id uuid references public.warehouse_locations (id),
  moved_by uuid not null references public.profiles (id) on delete restrict,
  moved_at timestamptz not null default now()
);

alter table public.package_location_history enable row level security;

create policy "package_location_history_select_staff" on public.package_location_history
  for select to authenticated
  using (private.is_staff((select auth.uid())));

-- INSERT só via trigger (abaixo) — sem policy de INSERT para authenticated.

-- 4) Trigger: toda mudança de packages.location_id grava histórico
--    automaticamente (staff não precisa lembrar; impossível esquecer).
create or replace function public.log_package_location_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.location_id is distinct from old.location_id then
    insert into public.package_location_history
      (package_id, from_location_id, to_location_id, moved_by)
    values
      (new.id, old.location_id, new.location_id, coalesce(auth.uid(), new.received_by));
  end if;
  return new;
end;
$$;

create trigger packages_log_location_change
after update on public.packages
for each row execute function public.log_package_location_change();

-- 5) Geração de grade em massa. Admin-only (decisão estrutural, não
--    operação do dia a dia). Fica em public para ser chamável via RPC,
--    com a checagem de papel DENTRO (lição da Fase 2: private schema
--    não é exposto como RPC).
create or replace function public.generate_warehouse_locations(
  _zone text,
  _aisles text[],
  _racks int,
  _levels int,
  _bins int
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  _aisle text;
  _count int := 0;
begin
  if not (private.has_role((select auth.uid()), 'admin')
          or private.has_role((select auth.uid()), 'super_admin')) then
    raise exception 'Only admins can generate warehouse locations';
  end if;
  if _racks < 1 or _racks > 99 or _levels < 1 or _levels > 9 or _bins < 1 or _bins > 99 then
    raise exception 'Grid out of bounds (racks 1-99, levels 1-9, bins 1-99)';
  end if;

  foreach _aisle in array _aisles loop
    insert into public.warehouse_locations (zone, aisle, rack, level, bin)
    select _zone, _aisle,
           lpad(r::text, 2, '0'), l::text, lpad(b::text, 2, '0')
    from generate_series(1, _racks) r,
         generate_series(1, _levels) l,
         generate_series(1, _bins) b
    on conflict (zone, aisle, rack, level, bin) do nothing;
    _count := _count + (_racks * _levels * _bins);
  end loop;
  return _count;
end;
$$;

revoke execute on function public.generate_warehouse_locations from public;
grant execute on function public.generate_warehouse_locations to authenticated;

-- 6) Próxima posição livre: menor code ativo sem pacote "vivo" nela.
--    Staff-only (roda no recebimento).
create or replace function public.next_free_location()
returns table (id uuid, code text)
language sql
security definer
set search_path = ''
stable
as $$
  select wl.id, wl.code
  from public.warehouse_locations wl
  where wl.active
    and private.is_staff((select auth.uid()))
    and not exists (
      select 1 from public.packages p
      where p.location_id = wl.id
        and p.status in ('received', 'in_review', 'ready', 'consolidating')
    )
  order by wl.code
  limit 1;
$$;

revoke execute on function public.next_free_location from public;
grant execute on function public.next_free_location to authenticated;

-- 7) Mapa de ocupação: uma linha por posição com o pacote vivo (se houver).
--    View com security_invoker para respeitar a RLS do caller (staff).
create or replace view public.warehouse_occupancy
with (security_invoker = true) as
select wl.id, wl.code, wl.zone, wl.aisle, wl.rack, wl.level, wl.bin, wl.active,
       p.id as package_id, p.status as package_status, s.suite_number
from public.warehouse_locations wl
left join public.packages p
  on p.location_id = wl.id
 and p.status in ('received', 'in_review', 'ready', 'consolidating')
left join public.suites s on s.user_id = p.user_id;
