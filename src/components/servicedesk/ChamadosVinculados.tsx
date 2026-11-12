import React, { useState } from 'react';
import { ExternalLink, MessageSquare } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Ticket, TicketStatus } from '../../types/index.ts';
import { formatDate, rotuloStatus } from '../../utils/formatters.ts';
import { chamadoEmAberto, podeAbrirFicha } from '../../utils/vinculos.ts';

/** Quantos aparecem antes do "Ver todos" */
const VISIVEIS = 5;

const COR_STATUS: Record<TicketStatus, string> = {
  aberto: 'text-blue-700 bg-blue-50 border-blue-200',
  em_andamento: 'text-amber-700 bg-amber-50 border-amber-200',
  aguardando_terceiro: 'text-purple-700 bg-purple-50 border-purple-200',
  resolvido: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  cancelado: 'text-slate-500 bg-slate-100 border-slate-200',
};

interface ChamadosVinculadosProps {
  chamados: Ticket[];
  /** Texto curto ao lado do código (ex.: "Solicitante", "Relacionado") */
  etiqueta?: (t: Ticket) => string | undefined;
  vazio?: string;
}

/**
 * Fase 9: seção "Chamados" das fichas do equipamento, da pessoa e do software.
 * Cada chamado abre por cima da ficha; fechar o chamado volta para ela.
 */
export const ChamadosVinculados: React.FC<ChamadosVinculadosProps> = ({
  chamados,
  etiqueta,
  vazio = 'Nenhum chamado ligado.',
}) => {
  const { currentRole, currentUser, setSelectedTicketIdForDetail } = useApp();
  const [verTodos, setVerTodos] = useState(false);
  const emAberto = chamados.filter(chamadoEmAberto).length;
  const lista = verTodos ? chamados : chamados.slice(0, VISIVEIS);

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-600" aria-hidden="true" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Chamados</h3>
          <span className="text-xs text-slate-500">({chamados.length})</span>
        </div>
        {emAberto > 0 && <span className="text-xs font-medium text-amber-700">{emAberto} em aberto</span>}
      </div>

      {chamados.length === 0 ? (
        <p className="text-xs text-slate-500">{vazio}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {lista.map((t) => {
            const pode = podeAbrirFicha(currentRole, 'chamado', {
              meuId: currentUser?.id,
              solicitanteId: t.solicitanteId,
            });
            const rotulo = etiqueta?.(t);
            const corpo = (
              <>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={`font-mono font-bold ${pode ? 'text-blue-700' : 'text-slate-700'}`}>{t.codigo}</span>
                  <span className={`inline-block px-1.5 py-0.5 rounded border text-xs font-medium ${COR_STATUS[t.status]}`}>
                    {rotuloStatus(t.status)}
                  </span>
                  {rotulo && <span className="text-xs text-slate-500">{rotulo}</span>}
                  {pode && <ExternalLink className="w-3 h-3 text-blue-500 ml-auto shrink-0" aria-hidden="true" />}
                </span>
                <span className="block font-medium text-slate-900 mt-0.5 break-words line-clamp-2">{t.titulo}</span>
                <span className="block text-slate-500 mt-0.5">Aberto em {formatDate(t.dataCriacao)}</span>
              </>
            );
            return (
              <li key={t.id} className="py-2 text-xs">
                {pode ? (
                  <button
                    type="button"
                    onClick={() => setSelectedTicketIdForDetail(t.id)}
                    className="w-full text-left rounded-md -mx-1.5 px-1.5 py-1 hover:bg-slate-50"
                    aria-label={`Abrir o chamado ${t.codigo}`}
                  >
                    {corpo}
                  </button>
                ) : (
                  <div className="py-1">{corpo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {chamados.length > VISIVEIS && (
        <button
          type="button"
          onClick={() => setVerTodos((v) => !v)}
          className="text-xs font-medium text-blue-700 hover:underline"
        >
          {verTodos ? 'Mostrar menos' : `Ver todos (${chamados.length})`}
        </button>
      )}
    </div>
  );
};
