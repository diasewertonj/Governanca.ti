import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { Asset } from '../../types/index.ts';
import { dataDoLembrete, diasAte, formatDate } from '../../utils/formatters.ts';
import { contratosQueCobrem, fimCoberturaEfetiva, nomeContrato } from '../../utils/contratos.ts';
import { BotaoLembrete } from '../lembretes/BotaoLembrete.tsx';

/** Dias de antecedência do lembrete de garantia */
const DIAS_ANTES_DO_FIM = 15;

/**
 * Botão "Criar lembrete" para decidir o que fazer quando a cobertura de um
 * ativo vence (a maior data entre a garantia de fábrica e os contratos de
 * suporte/garantia estendida). Só grava no clique; só aparece para a T.I.
 */
export const LembreteGarantia: React.FC<{ asset: Asset }> = ({ asset }) => {
  const { currentRole, lembretes, contratos, criarLembrete } = useApp();

  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const fim = fimCoberturaEfetiva(asset, contratos);
  if (!isTI || !fim) return null;

  const contrato = contratosQueCobrem(asset.id, contratos)[0];
  const peloContrato = contrato?.fim === fim ? contrato : undefined;

  return (
    <BotaoLembrete
      jaExiste={lembretes.some((l) => l.status === 'aberto' && l.ativoId === asset.id)}
      criar={() =>
        criarLembrete({
          titulo: `${peloContrato ? 'Cobertura' : 'Garantia'} do ${asset.tag} ${diasAte(fim) < 0 ? 'venceu' : 'vence'} em ${formatDate(fim)}`,
          descricao: peloContrato
            ? `Coberto pelo contrato ${nomeContrato(peloContrato)}. Decidir renovação ou substituição de ${asset.nome}.`
            : `Decidir renovação, contrato de suporte ou substituição de ${asset.nome}.`,
          venceEm: dataDoLembrete(fim, DIAS_ANTES_DO_FIM),
          ativoId: asset.id,
        })
      }
    />
  );
};
