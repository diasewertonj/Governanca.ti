import React, { useState } from 'react';
import { Key, Laptop, Lock, Paperclip } from 'lucide-react';
import type { Asset, Ticket } from '../../types/index.ts';
import { formatDateTime } from '../../utils/formatters.ts';
import { inicial, mensagensDaConversa, ROTULO_PAPEL } from '../../utils/conversa.ts';
import { HistoricoChamado } from './AtendimentoChamado.tsx';
import { Abas, type ItemAba } from '../ui/Abas.tsx';

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
  <section aria-labelledby={`problema-${ticket.id}`} className="cartao p-4 space-y-3">
    <h3 id={`problema-${ticket.id}`} className="secao-titulo">
      {titulo || 'Problema relatado'}
    </h3>
    <p className="leading-relaxed text-slate-900 whitespace-pre-wrap break-words">{ticket.descricao}</p>

    {(ativo || ticket.softwareNome) && (
      <div className="flex flex-wrap gap-x-4 gap-y-1 texto-aux">
        {ativo && (
          <span className="inline-flex items-center gap-1">
            <Laptop className="ico-sm text-slate-500" aria-hidden="true" />
            <span className="font-semibold text-slate-800">{ativo.tag}</span> · {ativo.nome}
          </span>
        )}
        {ticket.softwareNome && (
          <span className="inline-flex items-center gap-1">
            <Key className="ico-sm text-slate-500" aria-hidden="true" />
            {ticket.softwareNome}
          </span>
        )}
      </div>
    )}

    {ticket.anexos && ticket.anexos.length > 0 && (
      <div className="space-y-2">
        {erroArquivo && <p className="erro">{erroArquivo}</p>}
        <div className="flex flex-wrap gap-2">
          {ticket.anexos.map((att) => (
            <button
              type="button"
              key={att.id}
              onClick={() => onAbrirAnexo(att.caminho || att.url)}
              className="btn btn-sm btn-secundario"
            >
              <Paperclip aria-hidden="true" />
              <span className="break-all">{att.nome}</span>
              {att.tamanho && <span className="text-slate-500">({att.tamanho})</span>}
            </button>
          ))}
        </div>
      </div>
    )}
  </section>
);

type AbaAtendimento = 'conversa' | 'notas' | 'historico';

interface ConversaChamadoProps {
  ticket: Ticket;
  /** T.I. vê as notas internas (em aba própria) */
  podeVerNotas: boolean;
  meuId?: string;
  /** A T.I. abre direto nas anotações do atendimento */
  abaInicial?: 'conversa' | 'notas';
}

/**
 * Atendimento: a conversa com quem abriu e, para a T.I., as notas internas em
 * aba separada. A descrição não se repete aqui (fica em "Problema relatado").
 */
export const ConversaChamado: React.FC<ConversaChamadoProps> = ({ ticket, podeVerNotas, meuId, abaInicial }) => {
  const [aba, setAba] = useState<AbaAtendimento>(podeVerNotas && abaInicial === 'notas' ? 'notas' : 'conversa');
  const todas = mensagensDaConversa(ticket, podeVerNotas);
  const conversa = todas.filter((m) => !m.ehNotaInterna);
  const notas = todas.filter((m) => m.ehNotaInterna);
  const lista = aba === 'notas' ? notas : conversa;
  const itensAbas: ItemAba<AbaAtendimento>[] = [
    { id: 'conversa', rotulo: 'Conversa', contador: conversa.length },
    ...(podeVerNotas ? [{ id: 'notas' as const, rotulo: 'Notas internas', contador: notas.length }] : []),
    { id: 'historico', rotulo: 'Histórico' },
  ];

  return (
    <section aria-labelledby={`atendimento-${ticket.id}`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`atendimento-${ticket.id}`} className="secao-titulo">
          Atendimento
        </h3>
        <Abas<AbaAtendimento> rotulo="Atendimento" ativa={aba} onMudar={setAba} itens={itensAbas} />
      </div>

      {/* Fase 10: histórico automático de cada mudança */}
      {aba === 'historico' ? (
        <HistoricoChamado ticket={ticket} />
      ) : lista.length === 0 ? (
        <p className="texto-aux">
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
                  className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-semibold ${
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
                  className={`min-w-0 flex-1 rounded-lg border p-3 ${
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
                      <Lock className="ico-sm" aria-hidden="true" />
                      Nota interna (só a T.I. vê)
                    </span>
                  )}
                  <p className="mt-2 text-slate-800 leading-relaxed whitespace-pre-wrap break-words">{msg.texto}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
