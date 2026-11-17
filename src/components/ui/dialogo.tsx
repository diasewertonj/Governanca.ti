/**
 * Diálogos do sistema (substituem confirm/prompt/alert do navegador).
 * Uso imperativo, de qualquer lugar: `if (!(await confirmar('Excluir X?'))) return;`
 * O <DialogoHost/> (no App) desenha a janela. Sem host (testes), cai no navegador.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Info } from 'lucide-react';

export interface OpcoesConfirmar {
  titulo: string;
  mensagem?: string;
  confirmar?: string;
  cancelar?: string;
  perigo?: boolean;
}

export interface OpcoesTexto extends OpcoesConfirmar {
  rotulo?: string;
  minimo?: number;
  inicial?: string;
}

/**
 * Seção 9.1: toda ação que muda quem tem o quê passa por aqui — "de → para",
 * o que acontece no Nexus, o que falta fazer fora dele, estado do termo,
 * motivo (lista), confirmações ("removi no painel do fornecedor") e, no 2º item
 * do mesmo tipo (9.6), a justificativa. Nada é gravado sem "Confirmar".
 */
export interface OpcoesMovimento {
  titulo: string;
  /** O que está mudando de mãos (ex.: "#PAT-1042 · Notebook Dell") */
  item?: string;
  de?: string;
  para?: string;
  /** O que o Nexus faz ao confirmar */
  efeitos?: string[];
  /** O que falta fazer fora do Nexus (painel do fornecedor, operadora, entregar em mãos...) */
  foraDoNexus?: string[];
  /** Situação do termo depois da ação */
  termo?: string;
  /** Motivos para escolher (obrigatório quando houver); "Outro" pede texto */
  motivos?: string[];
  motivoInicial?: string;
  /** Caixas que precisam ser marcadas (ex.: removi o acesso no painel) */
  confirmacoes?: { texto: string; link?: { url: string; rotulo: string } }[];
  /** 9.6: segundo item do mesmo tipo — explica por quê */
  justificativa?: { aviso: string; rotulo?: string };
  /** Dá para desfazer? (texto curto) */
  desfazer?: string;
  confirmar?: string;
  /** Texto do botão de sair sem fazer nada (padrão "Cancelar"; use "Voltar" quando a ação é cancelar algo) */
  cancelar?: string;
  perigo?: boolean;
}

export interface RespostaMovimento {
  motivo?: string;
  justificativa?: string;
}

type Pedido =
  | { tipo: 'confirmar'; op: OpcoesConfirmar; resolver: (v: boolean) => void }
  | { tipo: 'texto'; op: OpcoesTexto; resolver: (v: string | null) => void }
  | { tipo: 'aviso'; op: OpcoesConfirmar; resolver: () => void }
  | { tipo: 'movimento'; op: OpcoesMovimento; resolver: (v: RespostaMovimento | null) => void };

let mostrar: ((p: Pedido) => void) | null = null;

/** Texto livre vira título (1ª parte) + mensagem (o resto, depois de uma linha em branco) */
function normalizar(x: string | OpcoesConfirmar): OpcoesConfirmar {
  if (typeof x !== 'string') return x;
  const [titulo, ...resto] = x.split('\n\n');
  const perigo = /\b(excluir|remover|apagar|cancelar|estornar|desfazer|liberar|não pode ser desfeita)\b/i.test(x);
  const verbo = titulo.match(/^(Excluir|Remover|Cancelar|Estornar|Desfazer|Liberar|Concluir|Gerar|Reativar|Restaurar|Registrar|Salvar|Usar|Assinar)\b/);
  return { titulo, mensagem: resto.join('\n\n') || undefined, perigo, confirmar: verbo ? verbo[1] : 'Confirmar' };
}

export function confirmar(x: string | OpcoesConfirmar): Promise<boolean> {
  const op = normalizar(x);
  if (!mostrar) return Promise.resolve(window.confirm([op.titulo, op.mensagem].filter(Boolean).join('\n\n')));
  return new Promise((resolver) => mostrar!({ tipo: 'confirmar', op, resolver }));
}

export function pedirTexto(x: string | OpcoesTexto): Promise<string | null> {
  const op = typeof x === 'string' ? { ...normalizar(x), rotulo: 'Motivo', minimo: 5 } : x;
  if (!mostrar) return Promise.resolve(window.prompt([op.titulo, op.mensagem].filter(Boolean).join('\n\n')));
  return new Promise((resolver) => mostrar!({ tipo: 'texto', op, resolver }));
}

export function avisar(x: string | OpcoesConfirmar): Promise<void> {
  const op = { ...normalizar(x), perigo: false, confirmar: 'Entendi' };
  if (!mostrar) {
    window.alert([op.titulo, op.mensagem].filter(Boolean).join('\n\n'));
    return Promise.resolve();
  }
  return new Promise((resolver) => mostrar!({ tipo: 'aviso', op, resolver }));
}

export function confirmarMovimento(op: OpcoesMovimento): Promise<RespostaMovimento | null> {
  if (!mostrar) {
    const linhas = [op.titulo, op.de && op.para ? `${op.de} → ${op.para}` : '', ...(op.efeitos || []), ...(op.foraDoNexus || [])];
    return Promise.resolve(window.confirm(linhas.filter(Boolean).join('\n')) ? { motivo: op.motivoInicial } : null);
  }
  return new Promise((resolver) => mostrar!({ tipo: 'movimento', op, resolver }));
}

export const DialogoHost: React.FC = () => {
  const [fila, setFila] = useState<{ id: number; p: Pedido }[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    mostrar = (p) => setFila((f) => [...f, { id: ++seq.current, p }]);
    return () => {
      mostrar = null;
    };
  }, []);

  const atual = fila[0];
  if (!atual) return null;
  const onFim = () => setFila((f) => f.slice(1));
  const p = atual.p;
  // key: cada pedido começa com o campo limpo
  if (p.tipo === 'movimento') return <CaixaMovimento key={atual.id} op={p.op} resolver={p.resolver} onFim={onFim} />;
  return <Caixa key={atual.id} pedido={p} onFim={onFim} />;
};

const OUTRO = 'Outro';

const CaixaMovimento: React.FC<{ op: OpcoesMovimento; resolver: (v: RespostaMovimento | null) => void; onFim: () => void }> = ({ op, resolver, onFim }) => {
  const [motivo, setMotivo] = useState(op.motivoInicial || '');
  const [motivoLivre, setMotivoLivre] = useState('');
  const [marcadas, setMarcadas] = useState<boolean[]>(() => (op.confirmacoes || []).map(() => false));
  const [justificativa, setJustificativa] = useState('');
  const botao = useRef<HTMLButtonElement>(null);
  const primeiro = useRef<HTMLSelectElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    (primeiro.current || botao.current)?.focus();
  }, []);

  const motivoFinal = motivo === OUTRO ? motivoLivre.trim() : motivo;
  const faltas = [
    op.motivos && !motivoFinal ? 'o motivo' : '',
    op.motivos && motivo === OUTRO && motivoLivre.trim().length < 3 ? 'o motivo (descreva)' : '',
    marcadas.some((m) => !m) ? 'as confirmações' : '',
    op.justificativa && justificativa.trim().length < 5 ? 'a justificativa' : '',
  ].filter(Boolean);
  const fechar = (ok: boolean) => {
    resolver(ok ? { motivo: motivoFinal || undefined, justificativa: justificativa.trim() || undefined } : null);
    onFim();
  };

  const lista = (titulo: string, itens?: string[]) =>
    itens && itens.length > 0 ? (
      <div>
        <p className="text-xs font-semibold text-slate-700">{titulo}</p>
        <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
          {itens.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.preventDefault();
          fechar(false);
        }
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="movimento-titulo" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 overflow-y-auto p-5">
          <span className={`mt-0.5 shrink-0 rounded-full p-1.5 ${op.perigo ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
            {op.perigo ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 id="movimento-titulo" className="text-sm font-semibold text-slate-900">
                {op.titulo}
              </h2>
              {op.item && <p className="text-xs text-slate-600">{op.item}</p>}
            </div>
            {(op.de || op.para) && (
              <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="De quem para quem">
                <span className="selo selo-neutro whitespace-normal">{op.de || '—'}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <span className="selo selo-info whitespace-normal">{op.para || '—'}</span>
              </div>
            )}
            {lista('O que acontece no Nexus', op.efeitos)}
            {lista('O que falta fazer fora do Nexus', op.foraDoNexus)}
            {op.termo && (
              <p className="text-xs text-slate-700">
                <span className="font-semibold">Termo: </span>
                {op.termo}
              </p>
            )}
            {op.motivos && (
              <div>
                <label htmlFor="movimento-motivo" className="rotulo">
                  Motivo *
                </label>
                <select
                  id="movimento-motivo"
                  ref={(el) => {
                    if (!primeiro.current) primeiro.current = el;
                  }}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="campo"
                >
                  <option value="">Escolha…</option>
                  {[...op.motivos.filter((m) => m !== OUTRO), OUTRO].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {motivo === OUTRO && (
                  <input value={motivoLivre} onChange={(e) => setMotivoLivre(e.target.value)} placeholder="Descreva o motivo" aria-label="Descreva o motivo" className="campo mt-2" />
                )}
              </div>
            )}
            {op.justificativa && (
              <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <p className="text-xs text-amber-900">{op.justificativa.aviso}</p>
                <label htmlFor="movimento-justificativa" className="rotulo">
                  {op.justificativa.rotulo || 'Por que mais um? *'}
                </label>
                <textarea
                  id="movimento-justificativa"
                  ref={(el) => {
                    if (!primeiro.current) primeiro.current = el;
                  }}
                  rows={2}
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Ex.: segundo monitor para edição de vídeo; notebook reserva para viagem"
                  className="campo"
                />
                <p className="ajuda">Não bloqueia: a justificativa fica no histórico.</p>
              </div>
            )}
            {(op.confirmacoes || []).map((c, i) => (
              <div key={c.texto} className="space-y-0.5">
                <label className="flex cursor-pointer items-start gap-2 text-xs font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={marcadas[i]}
                    onChange={(e) => setMarcadas((m) => m.map((x, j) => (j === i ? e.target.checked : x)))}
                    className="mt-0.5"
                  />
                  <span>{c.texto}</span>
                </label>
                {c.link && (
                  <a href={c.link.url} target="_blank" rel="noopener noreferrer" className="link ml-6 inline-block text-xs">
                    {c.link.rotulo} ↗
                  </a>
                )}
              </div>
            ))}
            {op.desfazer && <p className="ajuda">{op.desfazer}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {faltas.length > 0 && <span className="mr-auto text-xs text-slate-500">Falta: {faltas.join(', ')}.</span>}
          <button type="button" onClick={() => fechar(false)} className="btn btn-secundario">
            {op.cancelar || (/^cancelar/i.test(op.confirmar || '') ? 'Voltar' : 'Cancelar')}
          </button>
          <button ref={botao} type="button" disabled={faltas.length > 0} onClick={() => fechar(true)} className={`btn ${op.perigo ? 'btn-perigo-cheio' : 'btn-primario'}`}>
            {op.confirmar || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Caixa: React.FC<{ pedido: Exclude<Pedido, { tipo: 'movimento' }>; onFim: () => void }> = ({ pedido, onFim }) => {
  const [texto, setTexto] = useState(pedido.tipo === 'texto' ? pedido.op.inicial || '' : '');
  const campo = useRef<HTMLInputElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (pedido.tipo === 'texto' ? campo.current : botao.current)?.focus();
  }, [pedido.tipo]);

  const { op } = pedido;
  const minimo = pedido.tipo === 'texto' ? pedido.op.minimo || 0 : 0;
  const fechar = (ok: boolean) => {
    if (pedido.tipo === 'confirmar') pedido.resolver(ok);
    else if (pedido.tipo === 'texto') pedido.resolver(ok ? texto.trim() : null);
    else pedido.resolver();
    onFim();
  };
  const podeConfirmar = pedido.tipo !== 'texto' || texto.trim().length >= minimo;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.preventDefault();
          fechar(false);
        }
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo" className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 p-5">
          <span className={`mt-0.5 shrink-0 rounded-full p-1.5 ${op.perigo ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
            {op.perigo ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <h2 id="dialogo-titulo" className="text-sm font-semibold text-slate-900">
              {op.titulo}
            </h2>
            {op.mensagem && <p className="text-xs whitespace-pre-line text-slate-600">{op.mensagem}</p>}
            {pedido.tipo === 'texto' && (
              <div>
                <label htmlFor="dialogo-texto" className="rotulo">
                  {pedido.op.rotulo || 'Motivo'}
                  {minimo ? ' *' : ''}
                </label>
                <input
                  id="dialogo-texto"
                  ref={campo}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && podeConfirmar && fechar(true)}
                  className="campo"
                />
                {minimo > 0 && <p className="ajuda">Mínimo de {minimo} caracteres.</p>}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {pedido.tipo !== 'aviso' && (
            <button type="button" onClick={() => fechar(false)} className="btn btn-secundario">
              {op.cancelar || (op.confirmar === 'Cancelar' ? 'Voltar' : 'Cancelar')}
            </button>
          )}
          <button
            ref={botao}
            type="button"
            disabled={!podeConfirmar}
            onClick={() => fechar(true)}
            className={`btn ${op.perigo ? 'btn-perigo-cheio' : 'btn-primario'}`}
          >
            {op.confirmar || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};