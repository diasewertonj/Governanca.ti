import { createClient } from '@supabase/supabase-js';

// Variáveis de ambiente configuráveis na Vercel ou localmente
const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim().replace(/^["']|["']$/g, '');

// Garantir URL limpa (remover barra no final se houver)
const supabaseUrl = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
const supabaseAnonKey = rawKey;

// Verifica se as chaves do Supabase foram configuradas
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseUrl.includes('seu-projeto')
);

// Fase 3: links de e-mail do Supabase Auth (convite e recuperação de senha) chegam
// com o tipo na URL. Lido ANTES de criar o cliente, que limpa a URL ao processá-la.
function lerLinkAuth() {
  if (typeof window === 'undefined') return { tipo: null as string | null, erro: null as string | null };
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const tipo = params.get('type') || query.get('type');
  const erro = params.get('error_description') || query.get('error_description');
  return {
    tipo: tipo === 'recovery' || tipo === 'invite' ? tipo : null,
    erro: erro ? erro.replace(/\+/g, ' ') : null,
  };
}

const linkAuth = lerLinkAuth();
/** 'recovery' | 'invite' quando a página abriu a partir de um e-mail do Supabase */
export const tipoLinkAuth = linkAuth.tipo;
/** Mensagem de erro do link (ex.: link expirado), se houver */
export const erroLinkAuth = linkAuth.erro;

// Cria o cliente Supabase se as credenciais estiverem preenchidas
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Interface padronizada de usuário autenticado via Supabase
 */
export interface SupabaseAuthUser {
  id: string;
  email: string;
  nome?: string;
  avatarUrl?: string;
}

/**
 * Realiza login via Google OAuth no Supabase
 */
export async function signInWithGoogleSupabase() {
  if (!supabase) {
    return {
      error: 'Supabase não está configurado. Adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no painel de ambiente.',
    };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });

  return { data, error: error?.message };
}

/**
 * Realiza login via e-mail corporativo e senha no Supabase
 */
export async function signInWithPasswordSupabase(email: string, password: string) {
  if (!supabase) {
    return {
      error: 'Supabase não configurado. Utilizando autenticação corporativa local.',
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return { data, error: error?.message };
}

/**
 * Cadastra um novo usuário com e-mail e senha no Supabase Auth
 */
export async function signUpWithPasswordSupabase(email: string, password: string, nome?: string) {
  if (!supabase) {
    return {
      error: 'Supabase não configurado.',
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: nome,
      },
    },
  });

  return { data, error: error?.message };
}

/**
 * Envia o e-mail de redefinição de senha. A resposta é sempre a mesma para não
 * revelar se o e-mail existe (o Supabase também não revela).
 */
export async function solicitarRecuperacaoSenhaSupabase(email: string) {
  if (!supabase) return { error: 'Recuperação de senha disponível apenas com o Supabase configurado.' };
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: window.location.origin,
  });
  // Só repassa erro de limite de tentativas; o resto vira a mensagem genérica
  if (error && /rate|limit|seconds/i.test(error.message)) {
    return { error: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.' };
  }
  return { error: undefined };
}

/** Define a senha da sessão atual (link de convite ou de recuperação) */
export async function definirSenhaSupabase(senha: string) {
  if (!supabase) return { error: 'Supabase não configurado.' };
  const { error } = await supabase.auth.updateUser({ password: senha });
  return { error: error?.message };
}

/**
 * Realiza logout no Supabase
 */
export async function signOutSupabase() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
