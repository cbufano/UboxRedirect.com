-- ============================================================
-- Fase 7 / Onda 7.1 — correções da revisão final (achados Menores #1 e #2).
-- Aplicar depois de 20260731000001_warehouse.sql.
--
-- #1: generate_warehouse_locations retornava racks*levels*bins por corredor
--     mesmo quando ON CONFLICT DO NOTHING pulava linhas já existentes —
--     regenerar uma grade existente reportava "N criadas" com 0 criadas.
--     Agora conta com GET DIAGNOSTICS as linhas realmente inseridas.
-- #2: corredor contendo '-' (só possível via RPC direto; a UI normaliza)
--     geraria um code ambíguo no padrão zona-corredor-estante — rejeitado.
-- ============================================================

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
  _inserted int;
begin
  if not (private.has_role((select auth.uid()), 'admin')
          or private.has_role((select auth.uid()), 'super_admin')) then
    raise exception 'Only admins can generate warehouse locations';
  end if;
  if _racks < 1 or _racks > 99 or _levels < 1 or _levels > 9 or _bins < 1 or _bins > 99 then
    raise exception 'Grid out of bounds (racks 1-99, levels 1-9, bins 1-99)';
  end if;
  if _zone like '%-%' then
    raise exception 'Zone must not contain "-"';
  end if;

  foreach _aisle in array _aisles loop
    if _aisle like '%-%' or _aisle = '' then
      raise exception 'Aisle "%" is invalid (must be non-empty, without "-")', _aisle;
    end if;
    insert into public.warehouse_locations (zone, aisle, rack, level, bin)
    select _zone, _aisle,
           lpad(r::text, 2, '0'), l::text, lpad(b::text, 2, '0')
    from generate_series(1, _racks) r,
         generate_series(1, _levels) l,
         generate_series(1, _bins) b
    on conflict (zone, aisle, rack, level, bin) do nothing;
    get diagnostics _inserted = row_count;
    _count := _count + _inserted;
  end loop;
  return _count;
end;
$$;
