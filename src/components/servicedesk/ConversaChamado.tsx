import React from 'react';
import { Lock, Paperclip } from 'lucide-react';
import type { Ticket } from '../../types/index.ts';
import { formatDateTime } from '../../utils/formatters.ts';
import { inicial, mensagensDaConversa, ROTULO_PAPEL } from '../../utils/conversa.ts';

interface ConversaChamadoProps {
  ticket: Ticket;
  /** T.I. vê as notas internas */
  podeVerNotas: boolean;
  meuId?: string;
  onAbrirAnexo: (caminhoOuUrl: string) => void;
  erroArquivo: string | null;
}

/**
 * Conversa única do chamado: a abertura (descrição e anexos) é o 1º item e as
 * mensagens vêm em seguida, sem repetir a descrição. Notas internas em amarelo.
 */
export const ConversaChamado: React.FC<ConversaChamadoProps> = ({ ticket, podeVerNotas, meuId, onAbrirAnexo, erroArquivo }) => {
  const mensagens = mensagensDaConversa(ticket, podeVerNotas);

  return (
    <section aria-labelledby={`conversa-${ticket.id}`} className="space-y-3">
      <h3 id={`conversa-${ticket.id}`} className="text-sm font-semibold text-slate-900">
        Conversa
      </h3>

      <ol className="space-y-3">
        {/* Abertura */}
        <li className="flex gap-3">
          <Inicial nome={ticket.solicitanteNome} />
          <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs">
            <Cabecalho nome={ticket.solicitanteNome} detalhe="abriu o chamado" data={ticket.dataCriacao} />
            <p className="mt-1.5 text-slate-800 leading-relaxed whitespace-pre-wrap break-words">{ticket.descricao}</p>
            {ticket.anexos && ticket.anexos.length > 0 && (
              <div className="mt-2.5 space-y-1.5">
                {erroArquivo && <p className="text-rose-700">{erroArquivo}</p>}
                <div className="flex flex-wrap gap-2">
                  {ticket.anexos.map((att) => (
                    <button
                      type="button"
                      key={att.id}
                      onClick={() => onAbrirAnexo(att.caminho || att.url)}
                      className="flex items-center gap-1.5 text-blue-700 bg-white border border-slate-200 px-2.5 py-1 rounded hover:bg-blue-50"
                    >
                      <Paperclip className="w-3 h-3 text-slate-500" aria-hidden="true" />
                      <span className="break-all">{att.nome}</span>
                      {att.tamanho && <span className="text-slate-500">({att.tamanho})</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </li>

        {mensagens.map((msg) => {
          const minha = msg.autorId === meuId;
          return (
            <li key={msg.id} className="flex gap-3">
              <Inicial nome={msg.autorNome} destaque={msg.ehNotaInterna ? 'nota' : minha ? 'minha' : undefined} />
              <div
                className={`min-w-0 flex-1 rounded-lg border p-3.5 text-xs ${
                  msg.ehNotaInterna
                    ? 'bg-amber-50/70 border-amber-200'
                    : minha
                      ? 'bg-blue-50/50 border-blue-200'
                      : 'bg-white border-slate-200'
                }`}
              >
                <Cabecalho nome={msg.autorNome} detalhe={ROTULO_PAPEL[msg.autorRole] || ''} data={msg.data} />
                {msg.ehNotaInterna && (
                  <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-200/70 text-amber-900 font-medium">
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

      {mensagens.length === 0 && <p className="text-xs text-slate-500 pl-11">Ainda sem respostas.</p>}
    </section>
  );
};

const Inicial: React.FC<{ nome: string; destaque?: 'nota' | 'minha' }> = ({ nome, destaque }) => (
  <span
    aria-hidden="true"
    className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
      destaque === 'nota'
        ? 'bg-amber-100 text-amber-800'
        : destaque === 'minha'
          ? 'bg-blue-100 text-blue-800'
          : 'bg-slate-200 text-slate-700'
    }`}
  >
    {inicial(nome)}
  </span>
);

const Cabecalho: React.FC<{ nome: string; detalhe: string; data: string }> = ({ nome, detalhe, data }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
    <span className="min-w-0">
      <span className="font-semibold text-slate-900">{nome}</span>
      {detalhe && <span className="text-slate-500"> · {detalhe}</span>}
    </span>
    <time dateTime={data} className="text-slate-500 shrink-0">
      {formatDateTime(data)}
    </time>
  </div>
);
