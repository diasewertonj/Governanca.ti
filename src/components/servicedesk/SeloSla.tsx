import React from 'react';
import { Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Ticket } from '../../types/index.ts';
import { formatDateTime } from '../../utils/formatters.ts';
import { COR_ESTADO_SLA, ROTULO_ESTADO_SLA, seloSla, situacaoSla } from '../../utils/sla.ts';

/** Fase 10 C1: selo do prazo (vence em…, atrasado, no prazo) — só chamados de suporte */
export const SeloSla: React.FC<{ tkt: Ticket }> = ({ tkt }) => {
  const { eventosSla, prazosSla } = useApp();
  const s = situacaoSla(tkt, eventosSla[tkt.id] || [], prazosSla);
  if (!s) return null;
  return (
    <span
      title={`Solução até ${formatDateTime(s.solucao.vence.toISOString())} (horário comercial)`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${COR_ESTADO_SLA[s.solucao.estado]}`}
    >
      <Clock className="w-3 h-3" aria-hidden="true" />
      {seloSla(s)}
    </span>
  );
};

/** Fase 10 C1: prazos no chamado (1ª resposta e solução) */
export const PrazosChamado: React.FC<{ tkt: Ticket }> = ({ tkt }) => {
  const { eventosSla, prazosSla } = useApp();
  const s = situacaoSla(tkt, eventosSla[tkt.id] || [], prazosSla);
  if (!s) return null;
  const { resposta, solucao } = s;
  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2 text-xs">
      <span className="text-xs uppercase font-bold text-slate-500 block tracking-wide">Prazos</span>
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-600">1ª resposta</span>
        <span className={resposta.atrasada ? 'font-semibold text-rose-700' : 'font-medium text-slate-800'}>
          {resposta.respondidaEm
            ? `${resposta.atrasada ? 'Fora do prazo' : 'No prazo'} (${formatDateTime(resposta.respondidaEm.toISOString())})`
            : `${resposta.atrasada ? 'Atrasada' : 'Até'} ${formatDateTime(resposta.vence.toISOString())}`}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-600">Solução</span>
        <span className={`px-2 py-0.5 rounded border font-medium ${COR_ESTADO_SLA[solucao.estado]}`}>
          {solucao.estado === 'cumprido' || solucao.estado === 'fora_do_prazo' || solucao.estado === 'pausado'
            ? ROTULO_ESTADO_SLA[solucao.estado]
            : seloSla(s)}
        </span>
      </div>
      {solucao.estado !== 'cumprido' && solucao.estado !== 'fora_do_prazo' && (
        <p className="text-slate-500">Até {formatDateTime(solucao.vence.toISOString())} · horário comercial; "aguardando" pausa o prazo.</p>
      )}
    </div>
  );
};
