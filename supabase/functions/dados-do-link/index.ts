// =============================================================================
// Edge Function: dados-do-link (seção 14)
// -----------------------------------------------------------------------------
// Lê os dados públicos de um produto (nome, marca, modelo, preço, imagem) na página
// da loja, para pré-preencher o pedido de compra. O navegador não consegue (CSP do
// Nexus e bloqueio entre sites das lojas), por isso a leitura é feita aqui.
//
// Segurança:
// - exige login (JWT) de um colaborador ativo do Nexus;
// - só links https na porta 443; recusa endereços internos (localhost, rede privada, IPs de nuvem),
//   inclusive depois de resolver o nome e em cada redirecionamento, e confere de novo o DNS depois da resposta (rebinding);
// - tempo máximo de 6 s, no máximo 3 redirecionamentos e 2 MB lidos;
// - não guarda nada e não usa chave secreta (só a pública do projeto).
//
// Corpo: { "url": "https://..." }  →  { "dados": { nome, marca, modelo, preco, moeda, imagem, loja } }
// =============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { enderecoBloqueado, extrairDadosProduto } from './extrair.ts';

const ORIGENS = (Deno.env.get('ORIGENS_PERMITIDAS') ||
  'https://governanca-ti-psi.vercel.app,http://localhost:3000,http://localhost:3010')
  .split(',')
  .map((o) => o.trim());
const LIMITE_BYTES = 2 * 1024 * 1024;

function cabecalhos(origem: string | null) {
  return {
    'Access-Control-Allow-Origin': origem && ORIGENS.includes(origem) ? origem : ORIGENS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

/** Endereços (A/AAAA) do nome; vazio se não resolver ou se algum for interno */
async function enderecosPublicos(host: string): Promise<string[]> {
  if (enderecoBloqueado(host)) return [];
  try {
    const ips = [
      ...(await Deno.resolveDns(host, 'A').catch(() => [] as string[])),
      ...(await Deno.resolveDns(host, 'AAAA').catch(() => [] as string[])),
    ];
    return ips.length > 0 && ips.every((ip) => !enderecoBloqueado(ip)) ? ips : [];
  } catch {
    return [];
  }
}
async function buscar(inicial: string): Promise<{ html: string; url: string }> {
  let url = inicial;
  const fim = AbortSignal.timeout(6000);
  for (let i = 0; i < 4; i++) {
    const u = new URL(url);
    if (u.protocol !== 'https:') throw new Error('Use um link https.');
    // Só a porta padrão (443) e sem usuário/senha no endereço
    if ((u.port && u.port !== '443') || u.username || u.password) throw new Error('Endereço não permitido.');
    const antes = await enderecosPublicos(u.hostname);
    if (!antes.length) throw new Error('Endereço não permitido.');
    const r = await fetch(u, {
      redirect: 'manual',
      signal: fim,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexusCompras/1.0)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9' },
    });
    // Contra DNS rebinding (o Deno não deixa fixar o IP da conexão): resolve de novo depois da resposta
    // e exige que continue só com endereços públicos (lojas em CDN trocam de IP a cada consulta,
    // por isso não se exige o mesmo conjunto)
    const depois = await enderecosPublicos(u.hostname);
    if (!depois.length) {
      await r.body?.cancel().catch(() => undefined);
      throw new Error('Endereço não permitido.');
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      await r.body?.cancel().catch(() => undefined);
      url = new URL(r.headers.get('location')!, u).toString();
      continue;
    }
    if (!r.ok) throw new Error(`A loja respondeu ${r.status}.`);
    if (!(r.headers.get('content-type') || '').includes('html')) throw new Error('O link não é uma página de produto.');
    const leitor = r.body?.getReader();
    if (!leitor) throw new Error('Página vazia.');
    const partes: Uint8Array[] = [];
    let total = 0;
    while (total < LIMITE_BYTES) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(value);
      total += value.length;
    }
    await leitor.cancel().catch(() => undefined);
    const junto = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) {
      junto.set(p.subarray(0, Math.min(p.length, total - pos)), pos);
      pos += p.length;
    }
    return { html: new TextDecoder().decode(junto), url };
  }
  throw new Error('Redirecionamentos demais.');
}

Deno.serve(async (req) => {
  const h = cabecalhos(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return new Response(JSON.stringify({ erro: 'Use POST.' }), { status: 405, headers: h });

  // Só colaborador ativo do Nexus
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const banco = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: papel } = await banco.rpc('meu_papel');
  if (!jwt || !papel) return new Response(JSON.stringify({ erro: 'Entre no Nexus para usar esta função.' }), { status: 401, headers: h });

  let url = '';
  try {
    url = String((await req.json())?.url || '').trim();
    if (!/^https:\/\//i.test(url) || url.length > 2000) throw new Error('Use um link https válido.');
    const { html, url: final } = await buscar(url);
    const dados = extrairDadosProduto(html, final);
    const achou = Object.values(dados).some((v) => v !== undefined && v !== '');
    return new Response(JSON.stringify({ dados, achou }), { headers: h });
  } catch (err) {
    const msg = err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'A loja demorou para responder.';
    return new Response(JSON.stringify({ erro: `Não foi possível ler este link: ${msg} Preencha à mão.` }), { status: 200, headers: h });
  }
});
