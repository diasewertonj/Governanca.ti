/**
 * Seção 30 · Login por cima da landing: o fundo escurece e desfoca e o cartão aparece.
 * O código do login (Supabase) só carrega ao abrir; ao entrar, vai para /app/ já logado.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, X } from 'lucide-react';
import { LogoNexus } from './Landing.tsx';

type Servico = typeof import('../services/supabase.ts');

export const LoginRapido: React.FC<{ onFechar: () => void }> = ({ onFechar }) => {
  const [servico, setServico] = useState<Servico | null>(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const campoEmail = useRef<HTMLInputElement>(null);

  useEffect(() => {
    import('../services/supabase.ts').then(setServico);
    campoEmail.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!servico) return;
    setErro('');
    setAviso('');
    setEnviando(true);
    const r = await servico.signInWithPasswordSupabase(email.trim(), senha);
    if (r.error) {
      setEnviando(false);
      return setErro(/invalid/i.test(r.error) ? 'E-mail ou senha incorretos.' : r.error);
    }
    window.location.href = '/app/';
  };
  const google = async () => {
    if (!servico) return;
    const r = await servico.signInWithGoogleSupabase();
    if (r?.error) setErro(r.error);
  };
  const esqueci = async () => {
    if (!servico || !email.trim()) return setErro('Informe seu e-mail acima para receber o link.');
    setErro('');
    await servico.solicitarRecuperacaoSenhaSupabase(email.trim());
    setAviso('Se este e-mail tiver acesso, você receberá em instantes um link para definir uma nova senha.');
  };

  const campo =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Entrar no Nexus">
      <button type="button" aria-label="Fechar" onClick={onFechar} className="fundo-login absolute inset-0 bg-slate-950/55 backdrop-blur-md" />
      <div className="surgir relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl shadow-blue-900/20 dark:border-slate-700 dark:bg-slate-900">
        <button type="button" onClick={onFechar} aria-label="Fechar" className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-5 w-5" />
        </button>
        <LogoNexus className="h-8 w-auto" />
        <h2 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">Entrar</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Use seu e-mail e a senha que a T.I. enviou.</p>
        <form onSubmit={entrar} className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            E-mail
            <input ref={campoEmail} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={campo} />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Senha
            <input type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" className={campo} />
          </label>
          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
          {aviso && <p className="text-sm text-blue-700 dark:text-blue-300">{aviso}</p>}
          <button
            type="submit"
            disabled={enviando || !servico}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-teal-500 px-5 py-3 font-semibold text-white shadow-lg shadow-blue-600/25 hover:brightness-110 disabled:opacity-60"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Entrar <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
        <button
          type="button"
          onClick={google}
          disabled={!servico}
          className="mt-3 w-full rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Entrar com Google
        </button>
        <button type="button" onClick={esqueci} className="mt-3 text-sm text-blue-700 hover:underline dark:text-blue-400">
          Esqueci minha senha
        </button>
      </div>
    </div>
  );
};
