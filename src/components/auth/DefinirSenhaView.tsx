import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { KeyRound, Loader2 } from 'lucide-react';

// Fase 3: tela aberta pelo link de convite ou de recuperação de senha do Supabase
export const DefinirSenhaView: React.FC = () => {
  const { definirNovaSenha, tipoLinkSenha, settings, logout } = useApp();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const regras = [
    { ok: senha.length >= 10, texto: 'Pelo menos 10 caracteres' },
    { ok: /[a-zA-Z]/.test(senha) && /\d/.test(senha), texto: 'Letras e números' },
    { ok: senha.length > 0 && senha === confirmacao, texto: 'As duas senhas iguais' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (regras.some((r) => !r.ok)) {
      setErro('A senha ainda não atende a todos os requisitos.');
      return;
    }
    setSalvando(true);
    const res = await definirNovaSenha(senha);
    setSalvando(false);
    if (!res.success) setErro(res.error || 'Não foi possível salvar a senha.');
  };

  const titulo =
    tipoLinkSenha === 'invite'
      ? 'Bem-vindo(a)! Crie sua senha de acesso'
      : tipoLinkSenha === 'primeiro_acesso'
        ? 'Primeiro acesso: troque a senha provisória'
        : 'Defina sua nova senha';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex w-12 h-12 rounded-xl bg-blue-600 text-white items-center justify-center shadow-md mb-3">
          <KeyRound className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{titulo}</h1>
        <p className="mt-1 text-xs text-slate-500">{settings.razaoSocial} · Nexus IT & HR</p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <form onSubmit={handleSubmit} className="bg-white py-8 px-6 shadow-sm border border-slate-200/90 rounded-2xl sm:px-10 space-y-4">
          <div>
            <label htmlFor="nova-senha" className="block text-xs font-semibold text-slate-700 mb-1">Nova senha</label>
            <input
              id="nova-senha"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label htmlFor="confirma-senha" className="block text-xs font-semibold text-slate-700 mb-1">Confirme a senha</label>
            <input
              id="confirma-senha"
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <ul className="space-y-1">
            {regras.map((r) => (
              <li key={r.texto} className={`text-[11px] ${r.ok ? 'text-emerald-700' : 'text-slate-500'}`}>
                {r.ok ? '✓' : '○'} {r.texto}
              </li>
            ))}
          </ul>

          {erro && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">{erro}</div>
          )}

          <button
            type="submit"
            disabled={salvando}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar senha e entrar'}
          </button>
          <button type="button" onClick={logout} className="w-full text-[11px] text-slate-500 hover:text-slate-700">
            Cancelar e voltar ao login
          </button>
        </form>
      </div>
    </div>
  );
};
