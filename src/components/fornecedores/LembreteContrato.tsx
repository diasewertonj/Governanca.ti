import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { Contrato } from '../../types/index.ts';
import { dataDoLembrete, diasAte, formatDate } from '../../utils/formatters.ts';
import { nomeContrato } from '../../utils/contratos.ts';
import { BotaoLembrete } from '../lembretes/BotaoLembrete.tsx';

/** Dias de antecedência do lembrete de vencimento do contrato */
const DIAS_ANTES_DO_FIM = 30;

/** "Criar lembrete" do vencimento do contrato (30 dias antes do fim). Só a T.I. */
export const LembreteContrato: React.FC<{ contrato: Contrato }> = ({ contrato }) => {
  const { currentRole, lembretes, criarLembrete } = useApp();
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const fim = contrato.fim;
  if (!isTI || !fim) return null;

  return (
    <BotaoLembrete
      jaExiste={lembretes.some((l) => l.status === 'aberto' && l.contratoId === contrato.id)}
      criar={() =>
        criarLembrete({
          titulo: `Contrato ${nomeContrato(contrato)} ${diasAte(fim) < 0 ? 'venceu' : 'vence'} em ${formatDate(fim)}`,
          descricao: 'Decidir renovação, renegociação ou encerramento do contrato.',
          venceEm: dataDoLembrete(fim, DIAS_ANTES_DO_FIM),
          contratoId: contrato.id,
        })
      }
    />
  );
};
