import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { PoliticaPrivacidadeModal } from '../lgpd/PoliticaPrivacidadeModal.tsx';
import { Lock, Mail, ArrowRight, Loader2 } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, loginWithGoogle, settings, authError, isSupabaseConnected, erroLinkAuth, solicitarRecuperacaoSenha } = useApp();
  const [modoRecuperar, setModoRecuperar] = useState(false);
  const [msgRecuperacao, setMsgRecuperacao] = useState<string | null>(null);
  const [enviandoRecuperacao, setEnviandoRecuperacao] = useState(false);
  const [mostrarPolitica, setMostrarPolitica] = useState(false);

  const handleRecuperar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setEnviandoRecuperacao(true);
    const res = await solicitarRecuperacaoSenha(email);
    setEnviandoRecuperacao(false);
    // Mesma mensagem exista ou não o e-mail (não revela quem tem conta)
    setMsgRecuperacao(
      res.success
        ? 'Se este e-mail tiver acesso ao sistema, você receberá em instantes um link para definir uma nova senha.'
        : res.error || 'Não foi possível enviar agora. Tente novamente em alguns minutos.'
    );
  };
  // Credenciais de exemplo só no modo demonstração local (dev sem Supabase);
  // fora do `npm run dev` elas não entram no bundle.
  const demo = import.meta.env.DEV && !isSupabaseConnected;
  const [email, setEmail] = useState(demo ? 'admin.ti@nexuscorp.com.br' : '');
  const [password, setPassword] = useState(demo ? 'nexus@2026' : '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    const res = await login(email, password);
    setSubmitting(false);
    if (!res.success && res.error) {
      setErrorMessage(res.error);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setGoogleLoading(true);
    const res = await loginWithGoogle();
    setGoogleLoading(false);
    if (!res.success && res.error) {
      setErrorMessage(res.error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Identidade Corporativa */}
        <div className="text-center">
          <div className="inline-flex w-12 h-12 rounded-xl bg-blue-600 text-white items-center justify-center font-bold text-xl shadow-md mb-3">
            N
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Nexus IT & HR
          </h1>
          <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
            {settings.razaoSocial} · Portal Interno de Governança de TI, Ativos e RH
          </p>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200/90 rounded-2xl sm:px-10 space-y-6">
          {/* BOTÃO DE LOGIN REAL COM GOOGLE (SUPABASE AUTH) */}
          <div>
            <button
              type="button"
              disabled={googleLoading}
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>{googleLoading ? 'Autenticando...' : 'Entrar com Conta Google (Supabase)'}</span>
            </button>
            <p className="text-xs text-slate-500 text-center mt-1.5">
              Autenticação corporativa integrada com Supabase PostgreSQL
            </p>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 text-xs uppercase font-bold text-slate-500 tracking-wider absolute">
              ou credenciais corporativas
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail Corporativo
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@nexuscorp.com.br"
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white transition-colors"
                />
                <Mail className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Senha de Acesso Interno
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white transition-colors"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            {(errorMessage || authError || erroLinkAuth) && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {errorMessage ||
                  authError ||
                  `O link do e-mail não é mais válido (${erroLinkAuth}). Peça um novo em "Esqueci minha senha".`}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Acessar com E-mail</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Fase 3: recuperação de senha */}
          {isSupabaseConnected && (
            <div className="border-t border-slate-100 pt-4">
              {!modoRecuperar ? (
                <button
                  type="button"
                  onClick={() => {
                    setModoRecuperar(true);
                    setMsgRecuperacao(null);
                  }}
                  className="text-xs text-blue-700 hover:underline"
                >
                  Esqueci minha senha
                </button>
              ) : (
                <form onSubmit={handleRecuperar} className="space-y-2">
                  <p className="text-xs text-slate-600">
                    Informe seu e-mail corporativo no campo acima e enviaremos um link para definir uma nova senha.
                  </p>
                  {msgRecuperacao && (
                    <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">{msgRecuperacao}</div>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={enviandoRecuperacao || !email.trim()}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-50"
                    >
                      {enviandoRecuperacao ? 'Enviando...' : 'Enviar link de redefinição'}
                    </button>
                    <button type="button" onClick={() => setModoRecuperar(false)} className="text-xs text-slate-500 hover:text-slate-700">
                      Voltar
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Autenticação corporativa segura via Supabase PostgreSQL · Governança 360° ·{' '}
          <button type="button" onClick={() => setMostrarPolitica(true)} className="underline hover:text-slate-600">
            Aviso de privacidade
          </button>
        </p>
      </div>
      {mostrarPolitica && <PoliticaPrivacidadeModal settings={settings} onClose={() => setMostrarPolitica(false)} />}
    </div>
  );
};
