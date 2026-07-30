-- ============================================================
-- Fase 3 — Pacotes, pré-alerta, consolidação e operação de galpão
-- Aplicar no SQL Editor do Supabase (ou via supabase db push), DEPOIS da
-- migration 20260729000001_auth_foundation.sql.
-- ============================================================

-- 1) Pré-alerta: o cliente avisa que uma compra está a caminho, ANTES de
--    chegar fisicamente ao galpão. Ajuda a equipe a casar o pacote com a
--    conta certa e é uma camada anti-fraude (pacote sem pré-alerta chama
--    atenção).
create table public.expected_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  store text not null,
  tracking_number text not null default '',
  description text not null,
  declared_value_usd numeric(10, 2) not null check (declared_value_usd >= 0),
  status text not null default 'pending' check (status in ('pending', 'matched', 'cancelled')),
  created_at timestamptz not null default now()
);

-- 2) Pacotes fisicamente recebidos no galpão. Só a equipe (ops/admin) cria e
--    atualiza — o cliente nunca escreve aqui diretamente, só lê os seus.
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expected_package_id uuid references public.expected_packages (id) on delete set null,
  store text not null,
  description text not null,
  weight_kg numeric(8, 3) not null check (weight_kg > 0),
  length_cm numeric(8, 2),
  width_cm numeric(8, 2),
  height_cm numeric(8, 2),
  declared_value_usd numeric(10, 2) not null default 0 check (declared_value_usd >= 0),
  status text not null default 'received'
    check (status in ('received', 'in_review', 'ready', 'consolidating', 'shipped', 'discarded')),
  received_at timestamptz not null default now(),
  received_by uuid references public.profiles (id)
);

-- 3) Fotos do pacote (bucket privado — ver seção de Storage abaixo).
create table public.package_photos (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- 4) Tabelas de tarifa — substitui as constantes fixas de
--    src/lib/shippingEstimator.ts. Leitura pública (a calculadora do site
--    institucional é anônima); escrita só por admin.
create table public.rate_tables (
  id uuid primary key default gen_random_uuid(),
  destination_zone text not null,
  carrier text not null,
  eta_days text not null,
  base_fee_usd numeric(8, 2) not null,
  rate_per_kg_usd numeric(8, 2) not null,
  multiplier numeric(4, 2) not null default 1.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (destination_zone, carrier)
);

-- 5) Consolidação — o cliente agrupa pacotes "ready" num envio único. O
--    endereço de destino fica inline por simplicidade nesta fase (a imensa
--    maioria dos clientes usa um único endereço de entrega); extrair para
--    uma tabela própria de endereços fica para quando houver demanda real
--    de múltiplos destinos por cliente.
create table public.consolidations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  recipient_name text not null,
  street text not null,
  city text not null,
  state_province text not null default '',
  postal_code text not null,
  country text not null,
  carrier text,
  tracking_code text,
  chargeable_weight_kg numeric(8, 3),
  cost_usd numeric(10, 2),
  contents_description text not null,
  declared_value_usd numeric(10, 2) not null check (declared_value_usd >= 0),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  shipped_at timestamptz
);

-- 6) Join consolidação <-> pacotes. Um pacote só pode estar numa consolidação.
create table public.consolidation_items (
  id uuid primary key default gen_random_uuid(),
  consolidation_id uuid not null references public.consolidations (id) on delete cascade,
  package_id uuid not null unique references public.packages (id) on delete cascade
);

-- 7) updated_at automático em rate_tables (reaproveita set_updated_at do
--    migration anterior).
create trigger rate_tables_set_updated_at
before update on public.rate_tables
for each row execute function public.set_updated_at();

-- 8) Ao marcar um pacote como 'received' vinculado a um expected_package,
--    atualiza o pré-alerta para 'matched' automaticamente — só quando o
--    pré-alerta pertence ao MESMO cliente do pacote (evita que um erro ou
--    engano da equipe do galpão marque como "matched" o pré-alerta de um
--    cliente diferente).
create or replace function public.match_expected_package()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.expected_package_id is not null then
    update public.expected_packages
    set status = 'matched'
    where id = new.expected_package_id
      and status = 'pending'
      and user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger packages_match_expected
after insert on public.packages
for each row execute function public.match_expected_package();

-- 9) Ao criar um item de consolidação, o pacote correspondente passa para
--    'consolidating' — evita que o mesmo pacote seja escolhido duas vezes
--    em consolidações concorrentes (reforçado pela unique key acima).
create or replace function public.mark_package_consolidating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.packages set status = 'consolidating' where id = new.package_id;
  return new;
end;
$$;

create trigger consolidation_items_mark_package
after insert on public.consolidation_items
for each row execute function public.mark_package_consolidating();

-- 9b) Caminho inverso: quando um item de consolidação é removido (staff
--     corrigindo um engano, ou a consolidação inteira sendo cancelada — ver
--     9c), o pacote volta a ficar disponível ('ready') em vez de ficar
--     preso para sempre em 'consolidating'.
create or replace function public.unmark_package_consolidating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.packages
  set status = 'ready'
  where id = old.package_id and status = 'consolidating';
  return old;
end;
$$;

create trigger consolidation_items_unmark_package
after delete on public.consolidation_items
for each row execute function public.unmark_package_consolidating();

-- 9c) Cancelar uma consolidação (status -> 'cancelled') libera automaticamente
--     todos os pacotes dela — sem isso, cancelar deixaria os pacotes presos
--     em 'consolidating' para sempre, já que não existe policy de DELETE
--     para o cliente em consolidation_items.
create or replace function public.release_cancelled_consolidation_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    delete from public.consolidation_items where consolidation_id = new.id;
  end if;
  return new;
end;
$$;

create trigger consolidations_release_on_cancel
after update on public.consolidations
for each row execute function public.release_cancelled_consolidation_items();

-- 10) RLS ligado em todas as tabelas novas
alter table public.expected_packages enable row level security;
alter table public.packages enable row level security;
alter table public.package_photos enable row level security;
alter table public.rate_tables enable row level security;
alter table public.consolidations enable row level security;
alter table public.consolidation_items enable row level security;

-- expected_packages: dono lê/cria/cancela o próprio; ops/admin veem e
-- gerenciam tudo.
create policy "expected_packages_select_own_or_staff" on public.expected_packages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_role((select auth.uid()), 'ops')
    or private.has_role((select auth.uid()), 'admin')
  );

-- status = 'pending' obrigatório no INSERT: sem isso, o mesmo problema do
-- UPDATE (cliente se auto-marcar 'matched') reabriria pela porta do INSERT,
-- que a policy de update sozinha não cobre.
create policy "expected_packages_insert_own" on public.expected_packages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

-- Dono só pode manter 'pending' ou cancelar — nunca se auto-marcar como
-- 'matched' (isso derrubaria o propósito anti-fraude da tabela: 'matched'
-- só é setado pelo trigger match_expected_package, quando o pacote chega de
-- verdade). Staff pode transicionar para qualquer status.
create policy "expected_packages_update_own_or_staff" on public.expected_packages
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_role((select auth.uid()), 'ops')
    or private.has_role((select auth.uid()), 'admin')
  )
  with check (
    (user_id = (select auth.uid()) and status in ('pending', 'cancelled'))
    or private.has_role((select auth.uid()), 'ops')
    or private.has_role((select auth.uid()), 'admin')
  );

-- packages: dono só lê; ops/admin leem e escrevem tudo (só a equipe do
-- galpão registra pacote físico).
create policy "packages_select_own_or_staff" on public.packages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_role((select auth.uid()), 'ops')
    or private.has_role((select auth.uid()), 'admin')
  );

create policy "packages_insert_staff" on public.packages
  for insert to authenticated
  with check (private.has_role((select auth.uid()), 'ops') or private.has_role((select auth.uid()), 'admin'));

create policy "packages_update_staff" on public.packages
  for update to authenticated
  using (private.has_role((select auth.uid()), 'ops') or private.has_role((select auth.uid()), 'admin'))
  with check (private.has_role((select auth.uid()), 'ops') or private.has_role((select auth.uid()), 'admin'));

-- package_photos: dono do pacote lê; só staff escreve.
create policy "package_photos_select_own_or_staff" on public.package_photos
  for select to authenticated
  using (
    exists (
      select 1 from public.packages pkg
      where pkg.id = package_photos.package_id
        and (
          pkg.user_id = (select auth.uid())
          or private.has_role((select auth.uid()), 'ops')
          or private.has_role((select auth.uid()), 'admin')
        )
    )
  );

create policy "package_photos_insert_staff" on public.package_photos
  for insert to authenticated
  with check (private.has_role((select auth.uid()), 'ops') or private.has_role((select auth.uid()), 'admin'));

-- rate_tables: leitura pública (calculadora anônima no site institucional
-- também consulta esta tabela); escrita só admin.
create policy "rate_tables_select_public" on public.rate_tables
  for select to anon, authenticated
  using (true);

create policy "rate_tables_write_admin" on public.rate_tables
  for all to authenticated
  using (private.has_role((select auth.uid()), 'admin'))
  with check (private.has_role((select auth.uid()), 'admin'));

-- consolidations: dono lê/cria a própria; dono só atualiza enquanto
-- 'pending' (ex.: cancelar antes de pagar); staff lê/atualiza tudo (ex.:
-- inserir tracking depois de despachar).
create policy "consolidations_select_own_or_staff" on public.consolidations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_role((select auth.uid()), 'ops')
    or private.has_role((select auth.uid()), 'admin')
  );

-- status obrigatoriamente 'pending' no INSERT (mesmo raciocínio do UPDATE:
-- sem isso, 'paid'/'shipped'/'delivered' forjados reabririam pela porta do
-- INSERT, já que protect_consolidation_staff_columns só roda em UPDATE —
-- não existe `old` linha para comparar num INSERT).
--
-- carrier/chargeable_weight_kg/cost_usd SÃO permitidos no INSERT — são a
-- cotação que o próprio cliente escolheu no momento de criar a
-- consolidação (vinda de rate_tables via rateService, não inventada por
-- ele), não um dado de billing já confirmado. tracking_code/paid_at/
-- shipped_at nunca fazem sentido vindos do cliente em nenhum momento —
-- são fatos que só a equipe ou o pagamento real (Fase 4, service role)
-- podem estabelecer.
--
-- IMPORTANTE para a Fase 4: a Edge Function de pagamento NUNCA deve confiar
-- em consolidations.cost_usd como preço final — precisa recalcular o valor
-- a cobrar a partir de rate_tables + peso real dos pacotes no servidor
-- antes de cobrar. cost_usd nesta fase é só a cotação exibida ao cliente,
-- não uma fonte de verdade financeira.
create policy "consolidations_insert_own" on public.consolidations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and tracking_code is null
    and paid_at is null
    and shipped_at is null
  );

create policy "consolidations_update_own_pending_or_staff" on public.consolidations
  for update to authenticated
  using (
    (user_id = (select auth.uid()) and status = 'pending')
    or private.has_role((select auth.uid()), 'ops')
    or private.has_role((select auth.uid()), 'admin')
  )
  with check (
    (user_id = (select auth.uid()) and status in ('pending', 'cancelled'))
    or private.has_role((select auth.uid()), 'ops')
    or private.has_role((select auth.uid()), 'admin')
  );

-- A WITH CHECK acima só restringe o valor de `status`, não as demais
-- colunas — sem proteção adicional, o dono poderia, com a linha ainda
-- 'pending', forjar cost_usd/tracking_code/carrier/paid_at/shipped_at num
-- PATCH que omite `status`. Um GRANT de coluna não resolveria aqui: staff
-- (ops/admin) usa o MESMO role de banco `authenticated` que o cliente —
-- só a checagem de papel em tempo de execução (via trigger) consegue
-- diferenciar quem pode escrever essas colunas.
create or replace function public.protect_consolidation_staff_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.has_role(auth.uid(), 'ops') or private.has_role(auth.uid(), 'admin')) then
    new.carrier = old.carrier;
    new.tracking_code = old.tracking_code;
    new.chargeable_weight_kg = old.chargeable_weight_kg;
    new.cost_usd = old.cost_usd;
    new.paid_at = old.paid_at;
    new.shipped_at = old.shipped_at;
  end if;
  return new;
end;
$$;

create trigger consolidations_protect_staff_columns
before update on public.consolidations
for each row execute function public.protect_consolidation_staff_columns();

-- consolidation_items: acessível através da consolidação; dono só insere um
-- item se a consolidação for dele e o pacote também for dele e estiver
-- 'ready' (evita consolidar pacote de outro usuário ou ainda não liberado).
create policy "consolidation_items_select_via_consolidation" on public.consolidation_items
  for select to authenticated
  using (
    exists (
      select 1 from public.consolidations c
      where c.id = consolidation_items.consolidation_id
        and (
          c.user_id = (select auth.uid())
          or private.has_role((select auth.uid()), 'ops')
          or private.has_role((select auth.uid()), 'admin')
        )
    )
  );

create policy "consolidation_items_insert_own" on public.consolidation_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.consolidations c
      where c.id = consolidation_items.consolidation_id
        and c.user_id = (select auth.uid())
        and c.status = 'pending'
    )
    and exists (
      select 1 from public.packages pkg
      where pkg.id = consolidation_items.package_id
        and pkg.user_id = (select auth.uid())
        and pkg.status = 'ready'
    )
  );

-- Staff pode remover um item indevido (ex.: engano ao consolidar); o
-- trigger consolidation_items_unmark_package (seção 9b) já devolve o
-- pacote para 'ready' automaticamente quando isso acontece.
create policy "consolidation_items_delete_staff" on public.consolidation_items
  for delete to authenticated
  using (private.has_role((select auth.uid()), 'ops') or private.has_role((select auth.uid()), 'admin'));

-- 11) Storage: bucket privado para fotos de pacotes. URLs assinadas com
--     expiração são geradas pela aplicação — nunca público.
insert into storage.buckets (id, name, public)
values ('package-photos', 'package-photos', false)
on conflict (id) do nothing;

-- Caminho do arquivo é sempre "<user_id>/<package_id>/<arquivo>" — a
-- policy usa o primeiro segmento do path para checar dono, igual ao padrão
-- recomendado pelo Supabase para buckets privados por usuário.
create policy "package_photos_storage_select_own_or_staff" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'package-photos'
    and (
      (select auth.uid())::text = (storage.foldername(name))[1]
      or private.has_role((select auth.uid()), 'ops')
      or private.has_role((select auth.uid()), 'admin')
    )
  );

-- O INSERT exige, além do papel de staff, que os dois primeiros segmentos
-- do caminho realmente correspondam a um pacote existente cujo dono é
-- exatamente esse user_id — sem isso, nada impede a equipe (por bug ou
-- engano de copiar/colar) de subir uma foto para a pasta de outro cliente,
-- o que a policy de SELECT acima trataria como legítima.
create policy "package_photos_storage_insert_staff" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'package-photos'
    and (private.has_role((select auth.uid()), 'ops') or private.has_role((select auth.uid()), 'admin'))
    and exists (
      select 1 from public.packages pkg
      where pkg.id::text = (storage.foldername(name))[2]
        and pkg.user_id::text = (storage.foldername(name))[1]
    )
  );

-- 12) Tarifas iniciais — migra as constantes hardcoded do
--     shippingEstimator.ts atual para a tabela real (mesmos valores, para
--     não mudar preço em produção; a partir daqui viram editáveis pelo
--     admin, não mais por código).
insert into public.rate_tables (destination_zone, carrier, eta_days, base_fee_usd, rate_per_kg_usd, multiplier)
values
  ('BR', 'Economy', '8-14', 8, 14, 1.0),
  ('BR', 'Express', '3-5', 8, 14, 1.6),
  ('US', 'Economy', '8-14', 8, 6, 1.0),
  ('US', 'Express', '3-5', 8, 6, 1.6),
  ('DEFAULT', 'Economy', '8-14', 8, 18, 1.0),
  ('DEFAULT', 'Express', '3-5', 8, 18, 1.6)
on conflict (destination_zone, carrier) do nothing;
