#!/usr/bin/env node
// Testes de banco (RLS, triggers, RPCs) num Postgres descartável via Docker.
//
// Monta um banco igual ao de produção ANTES das migrations (schema original +
// policies antigas "Leitura/Gravacao X" para public), aplica as migrations de
// supabase/migrations em ordem — duas vezes, para provar que são reexecutáveis —
// e roda os cenários de supabase/tests/casos simulando cada papel (anon,
// colaborador, rh, ti_suporte, ti_admin, desligado, login sem perfil).
//
// Uso: npm run test:db   (precisa do Docker em execução)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');
const container = `nexus-test-db-${process.pid}`;
const imagem = process.env.TEST_DB_IMAGE || 'postgres:16-alpine';

function docker(args, opcoes = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opcoes });
}

function psql(sql, rotulo) {
  try {
    return docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-tA'], { input: sql });
  } catch (err) {
    const saida = `${err.stdout || ''}${err.stderr || ''}`;
    throw new Error(`Falha em ${rotulo}:\n${saida.split('\n').filter((l) => /ERROR|error/.test(l)).join('\n') || saida}`, {
      cause: err,
    });
  }
}

function esperarPronto() {
  for (let i = 0; i < 60; i++) {
    try {
      docker(['exec', container, 'pg_isready', '-U', 'postgres']);
      // pg_isready responde antes do init terminar; uma consulta real confirma
      docker(['exec', container, 'psql', '-U', 'postgres', '-c', 'select 1']);
      return;
    } catch {
      execFileSync(process.platform === 'win32' ? 'powershell' : 'sleep', process.platform === 'win32' ? ['-c', 'Start-Sleep -Milliseconds 500'] : ['0.5']);
    }
  }
  throw new Error('Postgres não ficou pronto a tempo');
}

const migrations = fs
  .readdirSync(path.join(raiz, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();
// Fase 0 já estava em produção quando os dados existiam; o resto vem depois deles
const antesDosDados = migrations.filter((m) => m < '20261112');
const depoisDosDados = migrations.filter((m) => m >= '20261112');
const casos = fs.readdirSync(path.join(raiz, 'supabase/tests/casos')).filter((f) => f.endsWith('.sql')).sort();

let codigoSaida = 0;
try {
  console.log(`> Subindo ${imagem}...`);
  docker(['run', '-d', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=somente_teste_local', imagem]);
  esperarPronto();

  psql(ler('supabase/tests/apoio/00_auth_stub.sql'), 'stub do auth');
  psql(ler('supabase-schema.sql'), 'schema original');
  psql(ler('supabase/tests/apoio/01_estado_producao.sql'), 'estado de produção');
  psql(ler('supabase/tests/apoio/02_storage_stub.sql'), 'stub do storage');
  for (const m of antesDosDados) psql(ler(`supabase/migrations/${m}`), m);
  psql(ler('supabase/tests/apoio/03_dados_teste.sql'), 'dados de teste');
  for (const m of depoisDosDados) psql(ler(`supabase/migrations/${m}`), m);
  for (const m of migrations) psql(ler(`supabase/migrations/${m}`), `${m} (2ª execução)`);
  console.log(`> ${migrations.length} migrations aplicadas e reaplicadas sem erro`);

  for (const c of casos) psql(ler(`supabase/tests/casos/${c}`), c);

  const resumo = psql(
    "select fase || ': ' || count(*) filter (where obtido = esperado) || '/' || count(*) from harness.resultado group by fase order by min(ordem);",
    'resumo'
  );
  const falhas = psql("select teste || '  ->  esperado: ' || esperado || ' | obtido: ' || obtido from harness.resultado where obtido <> esperado order by ordem;", 'falhas').trim();
  const total = psql("select count(*) filter (where obtido = esperado) || '/' || count(*) from harness.resultado;", 'total').trim();

  console.log(resumo.trim().split('\n').map((l) => `  ${l}`).join('\n'));
  if (falhas) {
    console.error(`\n✗ Cenários com falha:\n${falhas.split('\n').map((l) => `  ${l}`).join('\n')}`);
    codigoSaida = 1;
  }
  console.log(`\n${codigoSaida ? '✗' : '✓'} ${total} cenários de banco`);
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  codigoSaida = 1;
} finally {
  try {
    docker(['rm', '-f', container]);
  } catch {
    // container já removido
  }
}
process.exit(codigoSaida);
