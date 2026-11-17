import React, { useState } from 'react';
import { ExternalLink, MessageSquare } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Ticket } from '../../types/index.ts';
import { formatDate, rotuloStatus } from '../../utils/formatters.ts';
import { chamadoEmAberto, podeAbrirFicha } from '../../utils/vinculos.ts';
import { SELO_STATUS_CHAMADO } from './SeloSla.tsx';

/** Quantos aparecem antes do "Ver todos" */
const VISIVEIS = 5;

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
    <section aria-label="Chamados" className="cartao p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="secao-titulo flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Chamados ({chamados.length})
        </h3>
        {emAberto > 0 && <span className="selo selo-atencao">{emAberto} em aberto</span>}
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
                  <span className={`font-mono font-semibold ${pode ? 'text-blue-700' : 'text-slate-700'}`}>{t.codigo}</span>
                  <span className={SELO_STATUS_CHAMADO[t.status]}>{rotuloStatus(t.status)}</span>
                  {rotulo && <span className="text-xs text-slate-500">{rotulo}</span>}
                  {pode && <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />}
                </span>
                <span className="mt-0.5 line-clamp-2 block font-medium break-words text-slate-900">{t.titulo}</span>
                <span className="mt-0.5 block text-slate-500">Aberto em {formatDate(t.dataCriacao)}</span>
              </>
            );
            return (
              <li key={t.id} className="py-2 text-xs">
                {pode ? (
                  <button
                    type="button"
                    onClick={() => setSelectedTicketIdForDetail(t.id)}
                    className="-mx-1.5 w-full rounded-md px-1.5 py-1 text-left hover:bg-slate-50"
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
        <button type="button" onClick={() => setVerTodos((v) => !v)} className="link text-xs">
          {verTodos ? 'Mostrar menos' : `Ver todos (${chamados.length})`}
        </button>
      )}
    </section>
  );
};
