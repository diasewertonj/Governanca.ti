import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, CheckCircle2, History, RotateCcw, Star } from 'lucide-react';
import { Janela } from '../ui/Janela.tsx';
import { useApp } from '../../context/AppContext.tsx';
import type { CausaChamado, EventoChamado, MotivoCancelamento, Ticket, TipoSolucao } from '../../types/index.ts';
import { formatDateTime } from '../../utils/formatters.ts';
import {
  descreverEvento,
  erroCancelamento,
  passosAReverter,
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
    <section aria-label="Resolução" className="cartao p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="secao-titulo flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Resolução
        </h3>
        <p className="text-xs text-slate-600">
          {ROTULO_CAUSA[r.causa]} · {ROTULO_TIPO_SOLUCAO[r.tipo]}
          {r.tempoMin !== undefined && ` · ${formatarTempo(r.tempoMin)}`}
          {quem && ` · ${quem}`}
          {r.resolvidoEm && `, ${formatDateTime(r.resolvidoEm)}`}
        </p>
      </div>
      <p className="text-sm leading-relaxed text-slate-900 whitespace-pre-wrap break-words">{r.solucao}</p>
      {r.proximoPasso && (
        <p className="text-xs text-slate-700">
          <span className="selo selo-atencao mr-1.5">Próximo passo</span>
          {r.proximoPasso}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <Avaliacao ticket={ticket} podeAvaliar={podeAvaliar(ticket, currentUser?.id)} onAvaliar={avaliarChamado} />
        {podeReabrirChamado(ticket, currentRole, currentUser?.id) && (
          <button
            type="button"
            onClick={() => setReabrindo(true)}
            className="btn btn-sm btn-secundario"
          >
            <RotateCcw aria-hidden="true" />
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
            className="campo campo-sm w-48"
          />
          <button
            type="button"
            disabled={enviando}
            onClick={enviar}
            className="btn btn-sm btn-primario"
          >
            Avaliar
          </button>
        </>
      )}
      {erro && <span className="erro">{erro}</span>}
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
    <section aria-label="Cancelamento" className="cartao p-4 space-y-3 text-xs text-slate-700">
      <h3 className="secao-titulo flex items-center gap-1.5">
        <Ban className="h-4 w-4" aria-hidden="true" />
        Cancelamento
      </h3>
      <p className="font-medium text-slate-900">
        {ROTULO_MOTIVO_CANCELAMENTO[c.motivo]}
        {quem && <span className="font-normal text-slate-600"> · por {quem}</span>}
      </p>
      {c.detalhe && <p className="whitespace-pre-wrap break-words">{c.detalhe}</p>}
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

/** Janela pequena padrão por cima do chamado; o rodapé fica fora do <form> e usa o atributo form */
const JanelaAcao: React.FC<{ titulo: string; onClose: () => void; idForm: string; rodape: React.ReactNode; children: React.ReactNode }> = ({
  titulo,
  onClose,
  idForm,
  rodape,
  children,
}) =>
  createPortal(
    <Janela tamanho="p" titulo={titulo} onFechar={onClose} rodape={rodape} idTitulo={`${idForm}-titulo`}>
      {children}
    </Janela>,
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
    <JanelaAcao
      titulo={`Registrar solução · ${ticket.codigo}`}
      onClose={onClose}
      idForm={`${id}-form`}
      rodape={
        <>
          <span />
          <span className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-secundario">Cancelar</button>
            <button type="submit" form={`${id}-form`} disabled={salvando} className="btn btn-primario">
              {salvando ? 'Registrando…' : 'Registrar e encerrar'}
            </button>
          </span>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={enviar} className="space-y-4 text-xs">
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
        {erro && <p role="alert" className="erro">{erro}</p>}
      </form>
    </JanelaAcao>
  );
};

/** Fase 10: cancelar exige motivo */
export const FormCancelamento: React.FC<{ ticket: Ticket; onClose: () => void }> = ({ ticket, onClose }) => {
  const { cancelarChamado, processoItens } = useApp();
  const id = useId();
  const [motivo, setMotivo] = useState<MotivoCancelamento | ''>('');
  const [detalhe, setDetalhe] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Lote 1: passos já feitos de um processo (cadastro, conta, equipamento...) precisam ser revertidos
  const aReverter = ticket.tipo === 'suporte' ? [] : passosAReverter(processoItens.filter((i) => i.chamadoId === ticket.id));
  const [ciente, setCiente] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const problema = erroCancelamento(motivo, detalhe, ticket.tipo);
    if (problema) return setErro(problema);
    if (aReverter.length && !ciente) return setErro('Confirme que vai reverter os passos já feitos.');
    setSalvando(true);
    const falha = await cancelarChamado(ticket.id, motivo as MotivoCancelamento, detalhe, ciente);
    setSalvando(false);
    if (falha) setErro(falha);
    else onClose();
  };
  const processo = ticket.tipo !== 'suporte';
  const detalheObrigatorio = processo || motivo === 'outro';

  return (
    <JanelaAcao
      titulo={`Cancelar ${ticket.tipo === 'onboarding' ? 'admissão' : ticket.tipo === 'offboarding' ? 'desligamento' : 'chamado'} · ${ticket.codigo}`}
      onClose={onClose}
      idForm={`${id}-form`}
      rodape={
        <>
          <span />
          <span className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-secundario">Voltar</button>
            <button type="submit" form={`${id}-form`} disabled={salvando} className="btn btn-perigo-cheio">
              {salvando ? 'Cancelando…' : processo ? 'Cancelar processo' : 'Cancelar chamado'}
            </button>
          </span>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={enviar} className="space-y-4 text-xs">
        {processo && <p className="ajuda">O processo fica registrado como cancelado, com o motivo, e não é reaberto.</p>}
        {aReverter.length > 0 && (
          <div className="space-y-2 text-slate-700">
            <p className="font-semibold text-slate-900">Estes passos já foram feitos e não se desfazem sozinhos:</p>
            <ul className="list-disc pl-5">
              {aReverter.map((i) => (
                <li key={i.id}>{i.titulo}</li>
              ))}
            </ul>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} className="mt-0.5" />
              <span>
                Vou reverter esses itens (devolver equipamento, suspender conta, liberar licença, inativar cadastro/login).
                Fica um lembrete com a lista.
              </span>
            </label>
          </div>
        )}
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
          <label htmlFor={`${id}-detalhe`} className={CLASSE_ROTULO}>{processo ? 'Descreva o motivo *' : `Detalhe ${detalheObrigatorio ? '*' : '(opcional)'}`}</label>
          <textarea id={`${id}-detalhe`} rows={3} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} className={CLASSE_CAMPO} />
        </div>
        {erro && <p role="alert" className="erro">{erro}</p>}
      </form>
    </JanelaAcao>
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
    <JanelaAcao
      titulo={`Reabrir chamado · ${ticket.codigo}`}
      onClose={onClose}
      idForm={`${id}-form`}
      rodape={
        <>
          <span />
          <span className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-secundario">Cancelar</button>
            <button type="submit" form={`${id}-form`} disabled={salvando} className="btn btn-primario">
              {salvando ? 'Reabrindo…' : 'Reabrir'}
            </button>
          </span>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={enviar} className="space-y-4 text-xs">
        <div>
          <label htmlFor={`${id}-motivo`} className={CLASSE_ROTULO}>O que continua acontecendo? *</label>
          <textarea id={`${id}-motivo`} rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CLASSE_CAMPO} required />
        </div>
        {erro && <p role="alert" className="erro">{erro}</p>}
      </form>
    </JanelaAcao>
  );
};
