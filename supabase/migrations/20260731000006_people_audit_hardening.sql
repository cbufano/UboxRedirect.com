-- ============================================================
-- Fase 7 / Onda 7.3 — endurecimentos da revisão final (defesa em
-- profundidade; nenhum era explorável hoje).
-- Aplicar depois de 20260731000005_people_audit.sql.
--
-- 1) private.write_audit ganhava EXECUTE implícito de PUBLIC (funções
--    nascem assim) e authenticated tem USAGE no schema private — sem
--    rota de ataque hoje (PostgREST só expõe public), mas o padrão do
--    projeto é revogar explicitamente (has_role/is_staff fazem isso).
-- 2) protect_refund_columns não congelava o próprio id — reescrevê-lo
--    órfãnaria os entity_id do audit_log sem tocar no log.
-- 3) set_user_role: lock nas linhas do alvo fecha a corrida
--    check-then-delete (admin comum "desfazendo" promoção concorrente
--    de um super_admin), e o detail do audit passa a registrar também
--    os papéis anteriores.
-- ============================================================

revoke execute on function private.write_audit(text, text, uuid, jsonb) from public, authenticated;

create or replace function public.protect_refund_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id
     or new.amount_usd is distinct from old.amount_usd
     or new.reason is distinct from old.reason
     or new.payment_id is distinct from old.payment_id
     or new.requested_by is distinct from old.requested_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Refund core fields are immutable after creation';
  end if;
  return new;
end; $$;

create or replace function public.set_user_role(_target uuid, _new_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _caller uuid := (select auth.uid());
  _caller_is_super boolean := private.has_role((select auth.uid()), 'super_admin');
  _target_has_admin boolean;
  _old_roles text[];
begin
  if not (private.has_role(_caller, 'admin') or _caller_is_super) then
    raise exception 'Only admins can manage roles';
  end if;
  if _target = _caller then
    raise exception 'You cannot change your own role';
  end if;

  -- Lock nas linhas do alvo: o check e o delete abaixo passam a enxergar
  -- o mesmo estado mesmo com uma promoção concorrente em andamento.
  select coalesce(array_agg(role::text order by role), '{}')
  into _old_roles
  from public.user_roles
  where user_id = _target
  for update;

  _target_has_admin := _old_roles && array['admin', 'super_admin'];
  if (_target_has_admin or _new_role in ('admin', 'super_admin')) and not _caller_is_super then
    raise exception 'Only a super admin can grant or revoke admin roles';
  end if;

  insert into public.user_roles (user_id, role) values (_target, 'customer')
  on conflict (user_id, role) do nothing;
  delete from public.user_roles where user_id = _target and role <> 'customer';
  if _new_role <> 'customer' then
    insert into public.user_roles (user_id, role) values (_target, _new_role)
    on conflict (user_id, role) do nothing;
  end if;

  perform private.write_audit('role.changed', 'user', _target,
    jsonb_build_object('new_role', _new_role, 'old_roles', _old_roles));
end;
$$;
