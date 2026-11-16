import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { SoftwareLicense } from '../../types/index.ts';
import { dataDoLembrete, diasAte, formatDate } from '../../utils/formatters.ts';
import { dataLimiteCancelamento, fonteCustoLicenca } from '../../utils/financeiro.ts';
import { BotaoLembrete } from '../lembretes/BotaoLembrete.tsx';

/**
 * Seção 6 · "Criar lembrete" da renovação do software (cobrança própria): no prazo
 * para cancelar, se houver aviso prévio; senão 30 dias antes. Pelo contrato, o
 * lembrete é o do contrato. Só a T.I.
 */
export const LembreteLicenca: React.FC<{ licenca: SoftwareLicense }> = ({ licenca }) => {
  const { lembretes, criarLembrete, contratos } = useApp();
  const fonte = fonteCustoLicenca(licenca, contratos);
  if (fonte.forma !== 'propria' || !fonte.renovacao) return null;
  const fim = fonte.renovacao;
  const limite = dataLimiteCancelamento(fim, licenca.pagamento?.avisoCancelamentoDias);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs">
      <span className="text-slate-700">
        {diasAte(fim) < 0 ? 'Renovou/venceu em ' : 'Renova em '}
        <span className="font-semibold text-slate-900">{formatDate(fim)}</span>
        {limite && ` · cancelar até ${formatDate(limite)}`}
      </span>
      <BotaoLembrete
        jaExiste={lembretes.some((l) => l.status === 'aberto' && l.licencaId === licenca.id)}
        criar={() =>
          criarLembrete({
            titulo: `Renovação de ${licenca.nome} em ${formatDate(fim)}`,
            descricao: limite
              ? `Último dia para cancelar sem renovar: ${formatDate(limite)}.`
              : 'Decidir se renova, muda o plano ou cancela.',
            venceEm: limite || dataDoLembrete(fim, 30),
            licencaId: licenca.id,
          })
        }
      />
    </div>
  );
};
