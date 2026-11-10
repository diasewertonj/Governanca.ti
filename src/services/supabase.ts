import { createClient } from '@supabase/supabase-js';

// Variáveis de ambiente configuráveis na Vercel ou localmente
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Verifica se as chaves do Supabase foram configuradas
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://seu-projeto.supabase.co' &&
  !supabaseUrl.includes('placeholder')
);

// Cria o cliente Supabase se as credenciais estiverem preenchidas
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
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
 * Realiza logout no Supabase
 */
export async function signOutSupabase() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
