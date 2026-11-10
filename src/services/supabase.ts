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
 * Realiza logout no Supabase
 */
export async function signOutSupabase() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
