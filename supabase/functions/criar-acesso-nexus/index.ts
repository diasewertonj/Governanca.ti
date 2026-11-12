// =============================================================================
// Edge Function: criar-acesso-nexus (Fase 6c)
// -----------------------------------------------------------------------------
// Cria o login do colaborador no Nexus com SENHA PROVISÓRIA (ou gera uma nova),
// sem depender de envio de e-mail. A senha volta UMA vez para a TI repassar e
// não é guardada em lugar nenhum; no primeiro login a pessoa é obrigada a
// trocá-la (user_metadata.precisa_trocar_senha).
//
// Segurança:
// - exige login (JWT) de quem chama e confere no banco que é ti_admin/ti_suporte;
// - lê o e-mail DO CADASTRO (nunca do pedido): não dá para criar conta para um
//   e-mail qualquer;
// - a chave service_role só existe aqui no servidor do Supabase;
// - o papel de acesso continua sendo o do cadastro (protegido pelo trigger de
//   guarda: só ti_admin define papéis de gestão);
// - registra o evento na trilha de auditoria do processo.
//
// Corpo: { "colaborador_id": "emp-...", "acao": "criar" | "redefinir", "chamado_id"?: "tkt-..." }
// =============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

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

function gerarSenha(tamanho = 14): string {
  // Sem caracteres ambíguos (0/O, 1/l/I); garante letra minúscula, maiúscula e número
  const minus = 'abcdefghijkmnopqrstuvwxyz';
  const maius = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const nums = '23456789';
  const todos = minus + maius + nums;
  const aleatorio = (n: number) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % n;
  };
  const chars = [minus[aleatorio(minus.length)], maius[aleatorio(maius.length)], nums[aleatorio(nums.length)]];
  while (chars.length < tamanho) chars.push(todos[aleatorio(todos.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

Deno.serve(async (req) => {
  const h = cabecalhos(req.headers.get('Origin'));
  const responder = (status: number, corpo: Record<string, unknown>) =>
    new Response(JSON.stringify(corpo), { status, headers: h });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST') return responder(405, { erro: 'Use POST' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const autorizacao = req.headers.get('Authorization');
  if (!autorizacao) return responder(401, { erro: 'Login necessário' });

  // Cliente "como quem chamou": respeita a RLS e o papel da pessoa
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: autorizacao } } });
  const { data: papel, error: erroPapel } = await comoUsuario.rpc('meu_papel');
  if (erroPapel || !['ti_admin', 'ti_suporte'].includes(String(papel))) {
    return responder(403, { erro: 'Apenas a T.I. libera acesso ao sistema' });
  }
  const { data: quemChamou } = await comoUsuario.rpc('meu_colaborador_id');

  let corpo: { colaborador_id?: string; acao?: string; chamado_id?: string };
  try {
    corpo = await req.json();
  } catch {
    return responder(400, { erro: 'Corpo inválido' });
  }
  const acao = corpo.acao === 'redefinir' ? 'redefinir' : 'criar';
  if (!corpo.colaborador_id) return responder(400, { erro: 'Informe o colaborador' });

  const { data: colab, error: erroColab } = await comoUsuario
    .from('colaboradores')
    .select('id, nome, email, status, auth_user_id')
    .eq('id', corpo.colaborador_id)
    .maybeSingle();
  if (erroColab || !colab) return responder(404, { erro: 'Colaborador não encontrado' });
  if (colab.status === 'desligado') return responder(409, { erro: 'Colaborador desligado não recebe acesso' });

  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });
  const senha = gerarSenha();
  const metadados = { full_name: colab.nome, precisa_trocar_senha: true };

  if (acao === 'criar') {
    if (colab.auth_user_id) {
      return responder(409, { erro: 'Este colaborador já tem acesso. Use "Gerar nova senha provisória".' });
    }
    const { error } = await admin.auth.admin.createUser({
      email: colab.email,
      password: senha,
      email_confirm: true,
      user_metadata: metadados,
    });
    if (error) {
      const jaExiste = /already|registered|exists/i.test(error.message);
      return responder(jaExiste ? 409 : 500, {
        erro: jaExiste
          ? 'Já existe um login com este e-mail. Use "Gerar nova senha provisória".'
          : `Não foi possível criar o acesso: ${error.message}`,
      });
    }
  } else {
    if (!colab.auth_user_id) return responder(409, { erro: 'Este colaborador ainda não tem acesso. Use "Criar acesso".' });
    const { error } = await admin.auth.admin.updateUserById(colab.auth_user_id, {
      password: senha,
      user_metadata: metadados,
    });
    if (error) return responder(500, { erro: `Não foi possível gerar nova senha: ${error.message}` });
  }

  if (corpo.chamado_id) {
    await admin.from('processo_eventos').insert({
      chamado_id: corpo.chamado_id,
      acao: acao === 'criar' ? 'acesso_nexus_criado' : 'acesso_nexus_senha_redefinida',
      detalhe: { colaborador_id: colab.id, email: colab.email },
      por: quemChamou ?? null,
    });
  }

  return responder(200, { email: colab.email, senha, acao });
});
