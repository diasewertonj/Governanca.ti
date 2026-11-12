import React, { useState } from 'react';
import { BellPlus } from 'lucide-react';

/**
 * Botão "Criar lembrete" de 1 clique (garantia do ativo, vencimento do
 * contrato). Só grava no clique; se já houver lembrete aberto, mostra
 * "✓ Lembrete criado"; se a gravação falhar, mostra o motivo.
 */
export const BotaoLembrete: React.FC<{ jaExiste: boolean; criar: () => Promise<string | null> }> = ({
  jaExiste,
  criar,
}) => {
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState('');

  if (jaExiste) {
    return <span className="text-xs font-medium text-emerald-700">✓ Lembrete criado</span>;
  }

  const clicar = async () => {
    setGravando(true);
    setErro('');
    try {
      const falha = await criar();
      if (falha) setErro(`Lembrete não criado: ${falha}`);
    } finally {
      setGravando(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={clicar}
        disabled={gravando}
        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <BellPlus className="w-3.5 h-3.5" />
        {gravando ? 'Criando...' : 'Criar lembrete'}
      </button>
      {erro && (
        <span className="text-xs text-red-700" role="alert">
          {erro}
        </span>
      )}
    </span>
  );
};
