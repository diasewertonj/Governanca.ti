// =============================================================================
// Edge Function: iniciar-uso-real (Seção 28)
// -----------------------------------------------------------------------------
// Vira a base de teste para uso real:
//   1. confere que quem chama é o administrador da T.I.;
//   2. roda public.iniciar_uso_real COMO QUEM CHAMOU (a função do banco confere o papel
//      e a confirmação pelo nome da empresa; se recusar, nada mais acontece);
//   3. remove os logins das pessoas que saíram (o do admin fica);
//   4. esvazia o bucket "documentos" (anexos, PDFs de termos, fotos de teste).
// A chave service_role só existe aqui no servidor do Supabase.
//
// Corpo: { "confirmacao": "Nome da empresa", "apagar_estrutura"?: boolean }
// =============================================================================
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

const ORIGENS = (Deno.env.get('ORIGENS_PERMITIDAS') ||
  'https://governanca-ti-psi.vercel.app,http://localhost:3000,http://localhost:3010')
  .split(',')
  .map((o) => o.trim());

function cabecalhos(origem: string | null) {
  return {
    'Access-Control-Allow-Origin': origem && ORIGENS.includes(origem) ? origem : ORIGENS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

const BUCKET = 'documentos';

/** Todos os arquivos do bucket (as pastas são percorridas; teto de segurança de 20 mil) */
async function listarTudo(admin: SupabaseClient, pasta = '', acumulado: string[] = []): Promise<string[]> {
  if (acumulado.length > 20000) return acumulado;
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await admin.storage.from(BUCKET).list(pasta, { limit: 1000, offset: pagina * 1000 });
    if (error || !data?.length) break;
    for (const item of data) {
      const caminho = pasta ? `${pasta}/${item.name}` : item.name;
      // Sem id = pasta
      if (item.id === null) await listarTudo(admin, caminho, acumulado);
      else acumulado.push(caminho);
    }
    if (data.length < 1000) break;
  }
  return acumulado;
}

Deno.serve(async (req) => {
  const h = cabecalhos(req.headers.get('Origin'));
  const responder = (status: number, corpo: Record<string, unknown>) => new Response(JSON.stringify(corpo), { status, headers: h });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST') return responder(405, { erro: 'Use POST' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const autorizacao = req.headers.get('Authorization');
  if (!autorizacao) return responder(401, { erro: 'Login necessário' });

  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: autorizacao } } });
  const { data: papel, error: erroPapel } = await comoUsuario.rpc('meu_papel');
  if (erroPapel || String(papel) !== 'ti_admin') return responder(403, { erro: 'Apenas o administrador da T.I. inicia o uso real' });

  let corpo: { confirmacao?: string; apagar_estrutura?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return responder(400, { erro: 'Corpo inválido' });
  }

  // 1) Banco, como quem chamou: se a confirmação ou o papel não baterem, para aqui
  const { data: resultado, error: erroBanco } = await comoUsuario.rpc('iniciar_uso_real', {
    p_confirmacao: corpo.confirmacao || '',
    p_apagar_estrutura: !!corpo.apagar_estrutura,
  });
  if (erroBanco) return responder(400, { erro: erroBanco.message });

  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });

  // 2) Logins das pessoas que saíram
  const logins: string[] = Array.isArray((resultado as { logins?: unknown })?.logins) ? (resultado as { logins: string[] }).logins : [];
  const falhasLogin: string[] = [];
  for (const id of logins) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message)) falhasLogin.push(id);
  }

  // 3) Arquivos de teste
  let arquivos = 0;
  let falhaArquivos = false;
  const caminhos = await listarTudo(admin);
  for (let i = 0; i < caminhos.length; i += 100) {
    const lote = caminhos.slice(i, i + 100);
    const { error } = await admin.storage.from(BUCKET).remove(lote);
    if (error) falhaArquivos = true;
    else arquivos += lote.length;
  }

  return responder(200, {
    ok: true,
    loginsRemovidos: logins.length - falhasLogin.length,
    loginsComFalha: falhasLogin.length,
    arquivosRemovidos: arquivos,
    falhaArquivos,
  });
});
