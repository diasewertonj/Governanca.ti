import React, { useState } from 'react';
import { Key, Laptop, Lock, Paperclip } from 'lucide-react';
import type { Asset, Ticket } from '../../types/index.ts';
import { formatDateTime } from '../../utils/formatters.ts';
import { inicial, mensagensDaConversa, ROTULO_PAPEL } from '../../utils/conversa.ts';
import { HistoricoChamado } from './AtendimentoChamado.tsx';

interface ProblemaRelatadoProps {
  ticket: Ticket;
  /** Padrão: "Problema relatado" */
  titulo?: string;
  ativo?: Asset;
  onAbrirAnexo: (caminhoOuUrl: string) => void;
  erroArquivo: string | null;
}

/** Fase 10: o problema relatado em destaque, logo abaixo do título */
export const ProblemaRelatado: React.FC<ProblemaRelatadoProps> = ({ ticket, titulo, ativo, onAbrirAnexo, erroArquivo }) => (
  <section aria-labelledby={`problema-${ticket.id}`} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
    <h3 id={`problema-${ticket.id}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {titulo || 'Problema relatado'}
    </h3>
    <p className="mt-2 text-[15px] leading-relaxed text-slate-900 whitespace-pre-wrap break-words">{ticket.descricao}</p>

    {(ativo || ticket.softwareNome) && (
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {ativo && (
          <span className="inline-flex items-center gap-1">
            <Laptop className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span className="font-semibold text-slate-800">{ativo.tag}</span> · {ativo.nome}
          </span>
        )}
        {ticket.softwareNome && (
          <span className="inline-flex items-center gap-1">
            <Key className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
            {ticket.softwareNome}
          </span>
        )}
      </div>
    )}

    {ticket.anexos && ticket.anexos.length > 0 && (
      <div className="mt-3 space-y-1.5 text-xs">
        {erroArquivo && <p className="text-rose-700">{erroArquivo}</p>}
        <div className="flex flex-wrap gap-2">
          {ticket.anexos.map((att) => (
            <button
              type="button"
              key={att.id}
              onClick={() => onAbrirAnexo(att.caminho || att.url)}
              className="flex items-center gap-1.5 text-blue-700 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded hover:bg-blue-50"
            >
              <Paperclip className="w-3 h-3 text-slate-500" aria-hidden="true" />
              <span className="break-all">{att.nome}</span>
              {att.tamanho && <span className="text-slate-500">({att.tamanho})</span>}
            </button>
          ))}
        </div>
      </div>
    )}
  </section>
);

const Aba: React.FC<{ ativa: boolean; onClick: () => void; rotulo: string; n?: number }> = ({ ativa, onClick, rotulo, n }) => (
  <button
    type="button"
    role="tab"
    aria-selected={ativa}
    onClick={onClick}
    className={`px-3 py-1.5 text-xs font-medium rounded-md ${
      ativa ? 'bg-white text-slate-900 shadow-2xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
    }`}
  >
    {rotulo} {n !== undefined && <span className="text-slate-500">({n})</span>}
  </button>
);

interface ConversaChamadoProps {
  ticket: Ticket;
  /** T.I. vê as notas internas (em aba própria) */
  podeVerNotas: boolean;
  meuId?: string;
}

/**
 * Atendimento: a conversa com quem abriu e, para a T.I., as notas internas em
 * aba separada. A descrição não se repete aqui (fica em "Problema relatado").
 */
export const ConversaChamado: React.FC<ConversaChamadoProps> = ({ ticket, podeVerNotas, meuId }) => {
  const [aba, setAba] = useState<'conversa' | 'notas' | 'historico'>('conversa');
  const todas = mensagensDaConversa(ticket, podeVerNotas);
  const conversa = todas.filter((m) => !m.ehNotaInterna);
  const notas = todas.filter((m) => m.ehNotaInterna);
  const lista = aba === 'notas' ? notas : conversa;

  return (
    <section aria-labelledby={`atendimento-${ticket.id}`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`atendimento-${ticket.id}`} className="text-sm font-semibold text-slate-900">
          Atendimento
        </h3>
        <div role="tablist" aria-label="Atendimento" className="flex gap-1 p-0.5 rounded-lg bg-slate-100">
          <Aba ativa={aba === 'conversa'} onClick={() => setAba('conversa')} rotulo="Conversa" n={conversa.length} />
          {podeVerNotas && <Aba ativa={aba === 'notas'} onClick={() => setAba('notas')} rotulo="Notas internas" n={notas.length} />}
          <Aba ativa={aba === 'historico'} onClick={() => setAba('historico')} rotulo="Histórico" />
        </div>
      </div>

      {/* Fase 10: histórico automático de cada mudança */}
      {aba === 'historico' ? (
        <HistoricoChamado ticket={ticket} />
      ) : lista.length === 0 ? (
        <p className="text-xs text-slate-500">
          {aba === 'notas' ? 'Nenhuma nota interna.' : 'Ainda sem respostas.'}
        </p>
      ) : (
        <ol className="space-y-3">
          {lista.map((msg) => {
            const minha = msg.autorId === meuId;
            return (
              <li key={msg.id} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
                    msg.ehNotaInterna
                      ? 'bg-amber-100 text-amber-800'
                      : minha
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {inicial(msg.autorNome)}
                </span>
                <div
                  className={`min-w-0 flex-1 rounded-lg border p-3 text-xs ${
                    msg.ehNotaInterna
                      ? 'bg-amber-50/70 border-amber-200'
                      : minha
                        ? 'bg-blue-50/50 border-blue-200'
                        : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-900">{msg.autorNome}</span>
                      <span className="text-slate-500"> · {ROTULO_PAPEL[msg.autorRole] || ''}</span>
                    </span>
                    <time dateTime={msg.data} className="text-slate-500 shrink-0">
                      {formatDateTime(msg.data)}
                    </time>
                  </div>
                  {msg.ehNotaInterna && (
                    <span className="mt-1 inline-flex items-center gap-1 text-amber-900">
                      <Lock className="w-3 h-3" aria-hidden="true" />
                      Nota interna (só a T.I. vê)
                    </span>
                  )}
                  <p className="mt-1.5 text-slate-800 leading-relaxed whitespace-pre-wrap break-words">{msg.texto}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
