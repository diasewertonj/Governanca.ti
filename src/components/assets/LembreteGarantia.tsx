import React, { useState } from 'react';
import { BellPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Asset } from '../../types/index.ts';
import { dataLocal, formatDate } from '../../utils/formatters.ts';

const ISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Botão "Criar lembrete" para decidir o que fazer quando a garantia de um ativo
 * vence. Só grava no clique; só aparece para a T.I.
 */
export const LembreteGarantia: React.FC<{ asset: Asset }> = ({ asset }) => {
  const { currentRole, lembretes, criarLembrete } = useApp();
  const [gravando, setGravando] = useState(false);

  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const fim = asset.fiscal?.dataGarantia;
  if (!isTI || !fim) return null;

  const jaExiste = lembretes.some((l) => l.status === 'aberto' && l.ativoId === asset.id);
  if (jaExiste) {
    return <span className="text-xs font-medium text-emerald-700">✓ Lembrete criado</span>;
  }

  const criar = async () => {
    const hoje = new Date();
    const hojeLocal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const fimLocal = dataLocal(fim);
    const antes = new Date(fimLocal.getFullYear(), fimLocal.getMonth(), fimLocal.getDate() - 15);
    const venceEm = antes.getTime() < hojeLocal.getTime() ? hojeLocal : antes;
    const verbo = fimLocal.getTime() < hojeLocal.getTime() ? 'venceu' : 'vence';
    setGravando(true);
    try {
      await criarLembrete({
        titulo: `Garantia do ${asset.tag} ${verbo} em ${formatDate(fim)}`,
        descricao: `Decidir renovação, contrato de suporte ou substituição de ${asset.nome}.`,
        venceEm: ISO(venceEm),
        ativoId: asset.id,
      });
    } finally {
      setGravando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={criar}
      disabled={gravando}
      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <BellPlus className="w-3.5 h-3.5" />
      {gravando ? 'Criando...' : 'Criar lembrete'}
    </button>
  );
};
