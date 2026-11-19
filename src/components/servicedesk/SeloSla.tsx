import React from 'react';
import { Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Ticket, TicketPriority, TicketStatus } from '../../types/index.ts';
import { formatDateTime } from '../../utils/formatters.ts';
import { ROTULO_ESTADO_SLA, seloSla, situacaoSla, type EstadoSla } from '../../utils/sla.ts';

/** Situação do chamado → selo padrão (aberto: info; em atendimento/aguardando: atenção; resolvido: ok; cancelado: neutro) */
export const SELO_STATUS_CHAMADO: Record<TicketStatus, string> = {
  aberto: 'selo selo-info',
  em_andamento: 'selo selo-atencao',
  aguardando_terceiro: 'selo selo-atencao',
  resolvido: 'selo selo-ok',
  cancelado: 'selo selo-neutro',
};

/** Prioridade → selo padrão (urgente: problema; alta: atenção) */
export const SELO_PRIORIDADE_CHAMADO: Record<TicketPriority, string> = {
  baixa: 'selo selo-neutro',
  media: 'selo selo-info',
  alta: 'selo selo-atencao',
  critica: 'selo selo-problema',
};

/** Estado do prazo (SLA) → selo padrão */
const SELO_ESTADO_SLA: Record<EstadoSla, string> = {
  no_prazo: 'selo selo-neutro',
  vence_logo: 'selo selo-atencao',
  atrasado: 'selo selo-problema',
  pausado: 'selo selo-neutro',
  cumprido: 'selo selo-ok',
  fora_do_prazo: 'selo selo-problema',
};

/** Fase 10 C1: selo do prazo (vence em…, atrasado, no prazo) — só chamados de suporte */
export const SeloSla: React.FC<{ tkt: Ticket }> = ({ tkt }) => {
  const { eventosSla, prazosSla } = useApp();
  const s = situacaoSla(tkt, eventosSla[tkt.id] || [], prazosSla);
  if (!s) return null;
  return (
    <span
      title={`Solução até ${formatDateTime(s.solucao.vence.toISOString())} (horário comercial)`}
      className={SELO_ESTADO_SLA[s.solucao.estado]}
    >
      <Clock aria-hidden="true" />
      {seloSla(s)}
    </span>
  );
};

/** Fase 10 C1: prazos no chamado (1ª resposta e solução) */
/** embutido: versão compacta para a faixa do topo do chamado (sem cartão) */
export const PrazosChamado: React.FC<{ tkt: Ticket; embutido?: boolean }> = ({ tkt, embutido }) => {
  const { eventosSla, prazosSla } = useApp();
  const s = situacaoSla(tkt, eventosSla[tkt.id] || [], prazosSla);
  if (!s) return null;
  const { resposta, solucao } = s;
  return (
    <section aria-label="Prazos" className={embutido ? 'w-full space-y-2 lg:w-72 lg:shrink-0' : 'cartao p-4 space-y-3'}>
      <h3 className="secao-titulo">Prazos</h3>
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-600">1ª resposta</span>
        <span className={resposta.atrasada ? 'font-semibold text-red-700' : 'font-semibold text-slate-900'}>
          {resposta.respondidaEm
            ? `${resposta.atrasada ? 'Fora do prazo' : 'No prazo'} (${formatDateTime(resposta.respondidaEm.toISOString())})`
            : `${resposta.atrasada ? 'Atrasada' : 'Até'} ${formatDateTime(resposta.vence.toISOString())}`}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-600">Solução</span>
        <span className={SELO_ESTADO_SLA[solucao.estado]}>
          {solucao.estado === 'cumprido' || solucao.estado === 'fora_do_prazo' || solucao.estado === 'pausado'
            ? ROTULO_ESTADO_SLA[solucao.estado]
            : seloSla(s)}
        </span>
      </div>
      {solucao.estado !== 'cumprido' && solucao.estado !== 'fora_do_prazo' && (
        <p className="text-slate-500">Até {formatDateTime(solucao.vence.toISOString())} · horário comercial; "aguardando" pausa o prazo.</p>
      )}
    </section>
  );
};
