import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { PoliticaPrivacidadeModal } from '../lgpd/PoliticaPrivacidadeModal.tsx';
import { Lock, Mail, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { LogoNexus } from '../../landing/Landing.tsx';

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
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      {/* Seção 30: mesmo padrão da landing — painel escuro com textura, logo do Nexus e o ambiente da empresa */}
      <div className="relative overflow-hidden bg-slate-950 px-6 py-10 text-white sm:px-10 lg:flex lg:flex-col lg:justify-between lg:py-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden="true"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgb(148 163 184 / 0.09) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.09) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 80% 70% at 30% 40%, black 30%, transparent 100%)',
          }}
        />
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-blue-600 opacity-30 blur-[80px]" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 right-0 h-72 w-72 rounded-full bg-teal-500 opacity-20 blur-[80px]" aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-4">
          <a href="/" aria-label="Nexus — voltar para o site">
            <LogoNexus className="h-9 w-auto" textoBranco />
          </a>
          <a href="/" className="text-sm text-slate-300 hover:text-white">
            ← Voltar para o site
          </a>
        </div>
        <div className="relative mt-10 hidden max-w-md sm:block lg:mt-0">
          {(settings.nomeFantasia || settings.razaoSocial) && (
            <p className="text-sm font-semibold uppercase tracking-wider text-teal-400">Ambiente de {settings.nomeFantasia || settings.razaoSocial}</p>
          )}
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Tudo o que a T.I. entrega, paga e controla,{' '}
            <span className="bg-gradient-to-r from-blue-400 to-teal-300 bg-clip-text text-transparent">num só lugar.</span>
          </h1>
          <ul className="mt-6 space-y-2.5 text-slate-300">
            {['Com quem está cada equipamento, licença e linha', 'Chamados com prazo e histórico', 'Admissões e desligamentos guiados'].map((x) => (
              <li key={x} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-400" /> {x}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-10 hidden text-xs text-slate-500 lg:block">Nexus · Governança de T.I. e RH</p>
      </div>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-md mx-auto">
        <div className="mb-6 flex items-center gap-3">
          {settings.logoUrl && <img src={settings.logoUrl} alt="" className="h-10 w-auto max-w-[9rem] object-contain" referrerPolicy="no-referrer" />}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Entrar</h2>
            <p className="texto-aux">Use seu e-mail e a senha que a T.I. enviou.</p>
          </div>
        </div>
        <div className="bg-white py-8 px-6 shadow-xl shadow-blue-900/5 border border-slate-200/90 rounded-2xl sm:px-10 space-y-6">
          {/* BOTÃO DE LOGIN REAL COM GOOGLE (SUPABASE AUTH) */}
          <div>
            <button
              type="button"
              disabled={googleLoading}
              onClick={handleGoogleLogin}
              className="btn btn-secundario w-full"
            >
              {googleLoading ? (
                <Loader2 className="animate-spin" />
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
              <span>{googleLoading ? 'Autenticando...' : 'Entrar com Google'}</span>
            </button>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 secao-titulo absolute">
              ou credenciais corporativas
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="rotulo">E-mail corporativo</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@empresa.com.br"
                  className="campo"
                />
                <Mail className="ico text-slate-500 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label htmlFor="login-senha" className="rotulo">Senha de acesso interno</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="campo"
                />
                <Lock className="ico text-slate-500 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            {(errorMessage || authError || erroLinkAuth) && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
                {errorMessage ||
                  authError ||
                  `O link do e-mail não é mais válido (${erroLinkAuth}). Peça um novo em "Esqueci minha senha".`}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primario w-full"
            >
              {submitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <span>Acessar com E-mail</span>
                  <ArrowRight />
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
                  className="link"
                >
                  Esqueci minha senha
                </button>
              ) : (
                <form onSubmit={handleRecuperar} className="space-y-2">
                  <p className="texto-aux">
                    Informe seu e-mail corporativo no campo acima e enviaremos um link para definir uma nova senha.
                  </p>
                  {msgRecuperacao && (
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">{msgRecuperacao}</div>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={enviandoRecuperacao || !email.trim()}
                      className="btn btn-secundario btn-sm"
                    >
                      {enviandoRecuperacao ? 'Enviando...' : 'Enviar link de redefinição'}
                    </button>
                    <button type="button" onClick={() => setModoRecuperar(false)} className="btn btn-secundario btn-sm">
                      Voltar
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        <p className="mt-4 text-center texto-aux">
          <button type="button" onClick={() => setMostrarPolitica(true)} className="link">
            Aviso de privacidade
          </button>
        </p>
      </div>
      </div>
      {mostrarPolitica && <PoliticaPrivacidadeModal settings={settings} onClose={() => setMostrarPolitica(false)} />}
    </div>
  );
};
