\set admin '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@x.test","role":"authenticated"}'

-- Seção 29 · logo por arquivo (cada caso é desfeito no fim)
select harness.rodar('logo', 'L1 aceita imagem embutida (data URL)', 'ok', :'admin', 'authenticated',
  $q$select harness.afeta($s$update public.configuracoes_empresa set logo_url = 'data:image/png;base64,iVBORw0KGgo='$s$, 1)$q$);
select harness.rodar('logo', 'L2 continua aceitando link https', 'ok', :'admin', 'authenticated',
  $q$select harness.afeta($s$update public.configuracoes_empresa set logo_url = 'https://x.test/logo.png'$s$, 1)$q$);
select harness.rodar('logo', 'L3 recusa link sem https',
  'erro: new row for relation "configuracoes_empresa" violates check constraint "chk_config_logo_https"', :'admin', 'authenticated',
  $q$update public.configuracoes_empresa set logo_url = 'http://x.test/logo.png'$q$);
