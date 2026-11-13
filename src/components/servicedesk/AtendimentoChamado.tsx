import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, CheckCircle2, History, RotateCcw, Star, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { CausaChamado, EventoChamado, MotivoCancelamento, Ticket, TipoSolucao } from '../../types/index.ts';
import { formatDateTime } from '../../utils/formatters.ts';
import {
  descreverEvento,
  erroCancelamento,
  erroResolucao,
  formatarTempo,
  podeAvaliar,
  podeReabrirChamado,
  ROTULO_CAUSA,
  ROTULO_MOTIVO_CANCELAMENTO,
  ROTULO_TIPO_SOLUCAO,
} from '../../utils/atendimento.ts';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';

// -----------------------------------------------------------------------------
// Blocos exibidos no chamado
// -----------------------------------------------------------------------------

/** Fase 10: a solução registrada, em destaque logo abaixo do problema */
export const BlocoResolucao: React.FC<{ ticket: Ticket }> = ({ ticket }) => {
  const { employees, currentRole, currentUser, avaliarChamado } = useApp();
  const [reabrindo, setReabrindo] = useState(false);
  const r = ticket.resolucao;
  if (!r) return null;
  const quem = employees.find((e) => e.id === r.resolvidoPor)?.nome;

  return (
    <section aria-label="Resolução" className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
          Resolução
        </h3>
        <p className="text-xs text-emerald-900">
          {ROTULO_CAUSA[r.causa]} · {ROTULO_TIPO_SOLUCAO[r.tipo]}
          {r.tempoMin !== undefined && ` · ${formatarTempo(r.tempoMin)}`}
          {quem && ` · ${quem}`}
          {r.resolvidoEm && `, ${formatDateTime(r.resolvidoEm)}`}
        </p>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-900 whitespace-pre-wrap break-words">{r.solucao}</p>
      {r.proximoPasso && (
        <p className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          <strong>Próximo passo:</strong> {r.proximoPasso}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200 pt-3">
        <Avaliacao ticket={ticket} podeAvaliar={podeAvaliar(ticket, currentUser?.id)} onAvaliar={avaliarChamado} />
        {podeReabrirChamado(ticket, currentRole, currentUser?.id) && (
          <button
            type="button"
            onClick={() => setReabrindo(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            O problema voltou? Reabrir
          </button>
        )}
      </div>
      {reabrindo && <FormReabrir ticket={ticket} onClose={() => setReabrindo(false)} />}
    </section>
  );
};

/** Avaliação de 1 a 5 (opcional, só quem abriu) */
const Avaliacao: React.FC<{
  ticket: Ticket;
  podeAvaliar: boolean;
  onAvaliar: (id: string, nota: number, comentario?: string) => Promise<string | null>;
}> = ({ ticket, podeAvaliar: pode, onAvaliar }) => {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (ticket.avaliacao) {
    return (
      <p className="flex items-center gap-1 text-xs text-slate-700">
        <Estrelas nota={ticket.avaliacao.nota} />
        <span className="ml-1">Avaliação de quem abriu{ticket.avaliacao.comentario && `: "${ticket.avaliacao.comentario}"`}</span>
      </p>
    );
  }
  if (!pode) return <span className="text-xs text-slate-500">Sem avaliação</span>;

  const enviar = async () => {
    setEnviando(true);
    const e = await onAvaliar(ticket.id, nota, comentario);
    setEnviando(false);
    setErro(e);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-700">Como foi o atendimento?</span>
      <span className="flex" role="radiogroup" aria-label="Nota de 1 a 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={nota === n}
            aria-label={`${n} de 5`}
            onClick={() => setNota(n)}
            className="p-0.5"
          >
            <Star className={`w-4 h-4 ${n <= nota ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} aria-hidden="true" />
          </button>
        ))}
      </span>
      {nota > 0 && (
        <>
          <input
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Comentário (opcional)"
            aria-label="Comentário da avaliação"
            className="px-2 py-1 border border-slate-300 rounded-md bg-white text-xs w-48"
          />
          <button
            type="button"
            disabled={enviando}
            onClick={enviar}
            className="px-2.5 py-1 font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50"
          >
            Avaliar
          </button>
        </>
      )}
      {erro && <span className="text-rose-700">{erro}</span>}
    </div>
  );
};

const Estrelas: React.FC<{ nota: number }> = ({ nota }) => (
  <span className="flex" aria-label={`${nota} de 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`w-3.5 h-3.5 ${n <= nota ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`} aria-hidden="true" />
    ))}
  </span>
);

/** Fase 10: chamado cancelado mostra o motivo */
export const BlocoCancelamento: React.FC<{ ticket: Ticket }> = ({ ticket }) => {
  const { employees } = useApp();
  const c = ticket.cancelamento;
  if (!c) return null;
  const quem = employees.find((e) => e.id === c.canceladoPor)?.nome;
  return (
    <section aria-label="Cancelamento" className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-xs text-slate-700">
      <p className="flex items-center gap-1.5 font-semibold text-slate-800">
        <Ban className="w-4 h-4" aria-hidden="true" />
        Cancelado: {ROTULO_MOTIVO_CANCELAMENTO[c.motivo]}
        {quem && <span className="font-normal text-slate-600"> · por {quem}</span>}
      </p>
      {c.detalhe && <p className="mt-1 whitespace-pre-wrap break-words">{c.detalhe}</p>}
    </section>
  );
};

/** Fase 10: histórico automático (cada mudança, com quem e quando) */
export const HistoricoChamado: React.FC<{ ticket: Ticket }> = ({ ticket }) => {
  const { carregarEventosChamado, employees } = useApp();
  const [eventos, setEventos] = useState<EventoChamado[] | null>(null);

  // Recarrega quando o chamado muda (nova ação gera novo evento)
  useEffect(() => {
    let vivo = true;
    void carregarEventosChamado(ticket.id).then((lista) => {
      if (vivo) setEventos(lista);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id, ticket.dataAtualizacao, ticket.status]);

  if (!eventos) return <p className="text-xs text-slate-500">Carregando histórico…</p>;
  if (eventos.length === 0) return <p className="text-xs text-slate-500">Sem registros.</p>;
  return (
    <ol className="relative border-l border-slate-200 ml-2 space-y-3">
      {eventos.map((e) => (
        <li key={e.id} className="ml-4 text-xs">
          <span className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-white border-2 border-slate-300" aria-hidden="true" />
          <p className="text-slate-900 break-words">{descreverEvento(e)}</p>
          <p className="text-slate-500">
            {formatDateTime(e.criadoEm)}
            {e.autorId && ` · ${employees.find((x) => x.id === e.autorId)?.nome || 'usuário'}`}
          </p>
        </li>
      ))}
    </ol>
  );
};

export const IconeHistorico = History;

// -----------------------------------------------------------------------------
// Janelas: registrar solução, cancelar, reabrir
// -----------------------------------------------------------------------------

const Janela: React.FC<{ titulo: string; onClose: () => void; children: React.ReactNode }> = ({ titulo, onClose, children }) =>
  createPortal(
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 overflow-y-auto overscroll-contain modal-tela">
      <div className="relative w-full max-w-lg bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 my-0 sm:my-6">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );

const CAUSAS = Object.keys(ROTULO_CAUSA) as CausaChamado[];
const MOTIVOS = Object.keys(ROTULO_MOTIVO_CANCELAMENTO) as MotivoCancelamento[];

/** Fase 10: "Registrar solução" — encerra o chamado com causa e solução documentadas */
export const FormResolucao: React.FC<{ ticket: Ticket; onClose: () => void }> = ({ ticket, onClose }) => {
  const { resolverChamado } = useApp();
  const id = useId();
  const [causa, setCausa] = useState<CausaChamado | ''>('');
  const [solucao, setSolucao] = useState('');
  const [tipo, setTipo] = useState<TipoSolucao>('definitiva');
  const [proximoPasso, setProximoPasso] = useState('');
  const [tempo, setTempo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const dados = {
      causa: causa || undefined,
      solucao,
      tipo,
      proximoPasso: tipo === 'paliativa' ? proximoPasso : undefined,
      tempoMin: tempo.trim() === '' ? undefined : Number(tempo),
    };
    const problema = erroResolucao(dados);
    if (problema) return setErro(problema);
    setSalvando(true);
    const falha = await resolverChamado(ticket.id, { ...dados, causa: causa as CausaChamado });
    setSalvando(false);
    if (falha) setErro(falha);
    else onClose();
  };

  return (
    <Janela titulo={`Registrar solução · ${ticket.codigo}`} onClose={onClose}>
      <form onSubmit={enviar} className="p-5 space-y-4 text-xs">
        <p className="text-slate-600">
          A solução fica registrada no chamado e encerra o atendimento. Quem abriu pode reabrir se o problema voltar.
        </p>
        <div>
          <label htmlFor={`${id}-causa`} className={CLASSE_ROTULO}>Causa *</label>
          <select id={`${id}-causa`} value={causa} onChange={(e) => setCausa(e.target.value as CausaChamado)} className={CLASSE_CAMPO} required>
            <option value="">Escolha…</option>
            {CAUSAS.map((c) => (
              <option key={c} value={c}>{ROTULO_CAUSA[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-solucao`} className={CLASSE_ROTULO}>Solução aplicada *</label>
          <textarea
            id={`${id}-solucao`}
            rows={5}
            value={solucao}
            onChange={(e) => setSolucao(e.target.value)}
            placeholder="O que foi feito, passo a passo, e como foi testado."
            className={CLASSE_CAMPO}
            required
          />
        </div>
        <fieldset>
          <legend className={CLASSE_ROTULO}>Tipo de solução *</legend>
          <div className="flex flex-wrap gap-4 mt-1">
            {(['definitiva', 'paliativa'] as TipoSolucao[]).map((t) => (
              <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name={`${id}-tipo`} checked={tipo === t} onChange={() => setTipo(t)} />
                {ROTULO_TIPO_SOLUCAO[t]}
              </label>
            ))}
          </div>
        </fieldset>
        {tipo === 'paliativa' && (
          <div>
            <label htmlFor={`${id}-passo`} className={CLASSE_ROTULO}>Próximo passo *</label>
            <input
              id={`${id}-passo`}
              value={proximoPasso}
              onChange={(e) => setProximoPasso(e.target.value)}
              placeholder="Ex.: trocar a peça quando chegar"
              className={CLASSE_CAMPO}
            />
          </div>
        )}
        <div className="w-40">
          <label htmlFor={`${id}-tempo`} className={CLASSE_ROTULO}>Tempo gasto (min)</label>
          <input id={`${id}-tempo`} type="number" min={0} value={tempo} onChange={(e) => setTempo(e.target.value)} className={CLASSE_CAMPO} />
        </div>
        {erro && <p role="alert" className="text-rose-700">{erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Voltar</button>
          <button type="submit" disabled={salvando} className="px-4 py-2 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
            {salvando ? 'Registrando…' : 'Registrar e encerrar'}
          </button>
        </div>
      </form>
    </Janela>
  );
};

/** Fase 10: cancelar exige motivo */
export const FormCancelamento: React.FC<{ ticket: Ticket; onClose: () => void }> = ({ ticket, onClose }) => {
  const { cancelarChamado } = useApp();
  const id = useId();
  const [motivo, setMotivo] = useState<MotivoCancelamento | ''>('');
  const [detalhe, setDetalhe] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const problema = erroCancelamento(motivo, detalhe);
    if (problema) return setErro(problema);
    setSalvando(true);
    const falha = await cancelarChamado(ticket.id, motivo as MotivoCancelamento, detalhe);
    setSalvando(false);
    if (falha) setErro(falha);
    else onClose();
  };

  return (
    <Janela titulo={`Cancelar chamado · ${ticket.codigo}`} onClose={onClose}>
      <form onSubmit={enviar} className="p-5 space-y-4 text-xs">
        <div>
          <label htmlFor={`${id}-motivo`} className={CLASSE_ROTULO}>Motivo *</label>
          <select id={`${id}-motivo`} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoCancelamento)} className={CLASSE_CAMPO} required>
            <option value="">Escolha…</option>
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>{ROTULO_MOTIVO_CANCELAMENTO[m]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-detalhe`} className={CLASSE_ROTULO}>Detalhe {motivo === 'outro' ? '*' : '(opcional)'}</label>
          <textarea id={`${id}-detalhe`} rows={3} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} className={CLASSE_CAMPO} />
        </div>
        {erro && <p role="alert" className="text-rose-700">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Voltar</button>
          <button type="submit" disabled={salvando} className="px-4 py-2 font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
            {salvando ? 'Cancelando…' : 'Cancelar chamado'}
          </button>
        </div>
      </form>
    </Janela>
  );
};

/** Fase 10: reabrir com o motivo (vai para a conversa e para o histórico) */
const FormReabrir: React.FC<{ ticket: Ticket; onClose: () => void }> = ({ ticket, onClose }) => {
  const { reabrirChamado } = useApp();
  const id = useId();
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    const falha = await reabrirChamado(ticket.id, motivo);
    setSalvando(false);
    if (falha) setErro(falha);
    else onClose();
  };

  return (
    <Janela titulo={`Reabrir chamado · ${ticket.codigo}`} onClose={onClose}>
      <form onSubmit={enviar} className="p-5 space-y-4 text-xs">
        <div>
          <label htmlFor={`${id}-motivo`} className={CLASSE_ROTULO}>O que continua acontecendo? *</label>
          <textarea id={`${id}-motivo`} rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CLASSE_CAMPO} required />
        </div>
        {erro && <p role="alert" className="text-rose-700">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Voltar</button>
          <button type="submit" disabled={salvando} className="px-4 py-2 font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
            {salvando ? 'Reabrindo…' : 'Reabrir'}
          </button>
        </div>
      </form>
    </Janela>
  );
};
