import React, { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, History, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import type { ItemEstoque, TipoAcessorio, TipoMovimentoEstoque } from '../../types/index.ts';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { formatDate } from '../../utils/formatters.ts';

const ROTULO_TIPO: Record<TipoAcessorio, string> = {
  monitor: 'Monitor',
  mouse: 'Mouse',
  teclado: 'Teclado',
  cabo: 'Cabo',
  headset: 'Headset',
  adaptador: 'Adaptador',
  carregador: 'Carregador',
  webcam: 'Webcam',
  outro: 'Outro',
};

const ROTULO_MOV: Record<TipoMovimentoEstoque, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  devolucao: 'Devolução',
  ajuste: 'Ajuste',
};

const BOTAO = 'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border bg-white';

/**
 * Seção 6 · Acessórios por quantidade (monitor, mouse, teclado, cabo…). O saldo só
 * muda por movimento (entrada, saída para uma pessoa, devolução, ajuste com motivo),
 * e cada movimento fica no histórico. Itens com patrimônio continuam em Equipamentos.
 */
export const EstoqueAcessorios: React.FC = () => {
  const { currentRole, employees, fornecedores } = useApp();
  const { estoque, movimentos, salvarItemEstoque, excluirItemEstoque, movimentarEstoque } = useRecursos();
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editando, setEditando] = useState<ItemEstoque | 'novo' | null>(null);
  const [movendo, setMovendo] = useState<{ item: ItemEstoque; tipo: TipoMovimentoEstoque } | null>(null);
  const [historico, setHistorico] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  if (!isTI) return null;
  const lista = estoque.filter((i) => mostrarInativos || i.ativo);
  const nomePessoa = (id?: string) => employees.find((e) => e.id === id)?.nome || '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
          Mostrar desativados
        </label>
        <button
          type="button"
          onClick={() => setEditando('novo')}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" /> Novo acessório
        </button>
      </div>

      {editando && (
        <FormItem
          item={editando === 'novo' ? undefined : editando}
          fornecedores={fornecedores.filter((f) => f.ativo)}
          onSalvar={async (dados) => {
            const r = await salvarItemEstoque(dados);
            if (r.erro && !r.item) return r.erro;
            if (r.erro) setErro(r.erro);
            setEditando(null);
            return null;
          }}
          onCancelar={() => setEditando(null)}
        />
      )}

      {movendo && (
        <FormMovimento
          item={movendo.item}
          tipo={movendo.tipo}
          pessoas={employees.filter((e) => e.status !== 'desligado')}
          onSalvar={async (m) => {
            const falha = await movimentarEstoque({ itemId: movendo.item.id, tipo: movendo.tipo, ...m });
            if (falha) return falha;
            setMovendo(null);
            return null;
          }}
          onCancelar={() => setMovendo(null)}
        />
      )}

      {erro && (
        <p className="text-xs font-medium text-red-700" role="alert">
          {erro}
        </p>
      )}

      {lista.length === 0 ? (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-4">Nenhum acessório cadastrado.</p>
      ) : (
        <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
          <table className="tabela-cartoes w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-2 px-3">Acessório</th>
                <th className="py-2 px-3">Tipo</th>
                <th className="py-2 px-3">Em estoque</th>
                <th className="hidden xl:table-cell py-2 px-3">Local</th>
                <th className="py-2 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {lista.map((i) => {
                const baixo = i.minimo > 0 && i.quantidade <= i.minimo;
                return (
                  <React.Fragment key={i.id}>
                    <tr className={i.ativo ? '' : 'opacity-60'}>
                      <td data-label="Acessório" className="py-2 px-3 font-semibold text-slate-900">
                        {i.nome}
                        {(i.marca || i.modelo) && <span className="block font-normal text-slate-500">{[i.marca, i.modelo].filter(Boolean).join(' ')}</span>}
                      </td>
                      <td data-label="Tipo" className="py-2 px-3">
                        {ROTULO_TIPO[i.tipo]}
                      </td>
                      <td data-label="Em estoque" className="py-2 px-3">
                        <span className={`font-mono font-semibold ${baixo ? 'text-red-700' : 'text-slate-900'}`}>{i.quantidade}</span>
                        {i.minimo > 0 && <span className="text-slate-500"> (mín. {i.minimo})</span>}
                        {baixo && <span className="block text-red-700">Estoque baixo</span>}
                      </td>
                      <td data-label="Local" className="hidden xl:table-cell py-2 px-3">
                        {i.localizacao || '-'}
                      </td>
                      <td data-label="Ações" className="py-2 px-3 text-right">
                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                          <button type="button" onClick={() => setMovendo({ item: i, tipo: 'entrada' })} className={`${BOTAO} text-emerald-700 border-emerald-200`}>
                            <ArrowDownToLine className="w-3.5 h-3.5" /> Entrada
                          </button>
                          <button type="button" onClick={() => setMovendo({ item: i, tipo: 'saida' })} className={`${BOTAO} text-blue-700 border-blue-200`}>
                            <ArrowUpFromLine className="w-3.5 h-3.5" /> Entregar
                          </button>
                          <button type="button" onClick={() => setMovendo({ item: i, tipo: 'devolucao' })} className={`${BOTAO} text-slate-700 border-slate-200`}>
                            Devolução
                          </button>
                          <button type="button" onClick={() => setMovendo({ item: i, tipo: 'ajuste' })} className={`${BOTAO} text-slate-700 border-slate-200`}>
                            <SlidersHorizontal className="w-3.5 h-3.5" /> Ajuste
                          </button>
                          <button type="button" onClick={() => setHistorico(historico === i.id ? null : i.id)} className={`${BOTAO} text-slate-700 border-slate-200`}>
                            <History className="w-3.5 h-3.5" /> Histórico
                          </button>
                          <button type="button" onClick={() => setEditando(i)} aria-label={`Editar ${i.nome}`} className={`${BOTAO} text-slate-700 border-slate-200`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {currentRole === 'ti_admin' && (
                            <button
                              type="button"
                              aria-label={`Excluir ${i.nome}`}
                              onClick={async () => {
                                if (!window.confirm(`Excluir ${i.nome}? Esta ação não pode ser desfeita.`)) return;
                                setErro((await excluirItemEstoque(i.id)) || '');
                              }}
                              className="p-1.5 text-red-700 hover:bg-red-50 rounded-md"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                    {historico === i.id && (
                      <tr>
                        <td colSpan={5} className="py-2 px-3 bg-slate-50">
                          {movimentos.filter((m) => m.itemId === i.id).length === 0 ? (
                            <p className="text-slate-500">Sem movimentos.</p>
                          ) : (
                            <ul className="space-y-1">
                              {movimentos
                                .filter((m) => m.itemId === i.id)
                                .map((m) => (
                                  <li key={m.id}>
                                    {formatDate(m.criadoEm.slice(0, 10))} · {ROTULO_MOV[m.tipo]}{' '}
                                    <span className="font-mono">{m.tipo === 'saida' ? -m.quantidade : m.quantidade}</span>
                                    {m.colaboradorId && ` · ${nomePessoa(m.colaboradorId)}`}
                                    {m.motivo && ` · ${m.motivo}`}
                                    {m.criadoPor && <span className="text-slate-500"> (por {nomePessoa(m.criadoPor) || 'T.I.'})</span>}
                                  </li>
                                ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const FormItem: React.FC<{
  item?: ItemEstoque;
  fornecedores: { id: string; nome: string }[];
  onSalvar: (d: Omit<ItemEstoque, 'id' | 'quantidade'> & { id?: string; quantidadeInicial?: number }) => Promise<string | null>;
  onCancelar: () => void;
}> = ({ item, fornecedores, onSalvar, onCancelar }) => {
  const [d, setD] = useState({
    nome: item?.nome || '',
    tipo: item?.tipo || ('outro' as TipoAcessorio),
    marca: item?.marca || '',
    modelo: item?.modelo || '',
    minimo: String(item?.minimo ?? 0),
    localizacao: item?.localizacao || '',
    fornecedorId: item?.fornecedorId || '',
    valorUnitario: item?.valorUnitario != null ? String(item.valorUnitario) : '',
    observacoes: item?.observacoes || '',
    ativo: item?.ativo ?? true,
    quantidadeInicial: '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof d, v: string | boolean) => setD((p) => ({ ...p, [k]: v }));

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    const falha = await onSalvar({
      id: item?.id,
      nome: d.nome,
      tipo: d.tipo,
      marca: d.marca || undefined,
      modelo: d.modelo || undefined,
      minimo: Math.max(0, Number(d.minimo) || 0),
      localizacao: d.localizacao || undefined,
      fornecedorId: d.fornecedorId || undefined,
      valorUnitario: d.valorUnitario === '' ? undefined : Number(d.valorUnitario),
      observacoes: d.observacoes || undefined,
      ativo: d.ativo,
      quantidadeInicial: item ? undefined : Number(d.quantidadeInicial) || 0,
    });
    setSalvando(false);
    if (falha) setErro(falha);
  };

  return (
    <form onSubmit={salvar} className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
      <h3 className="text-xs font-bold text-blue-900">{item ? `Editar ${item.nome}` : 'Novo acessório'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <div className="md:col-span-2 xl:col-span-2">
          <label htmlFor="est-nome" className={CLASSE_ROTULO}>Nome *</label>
          <input id="est-nome" required value={d.nome} onChange={(e) => set('nome', e.target.value)} className={CLASSE_CAMPO} placeholder='Ex.: Monitor 24" Dell P2422H' />
        </div>
        <div>
          <label htmlFor="est-tipo" className={CLASSE_ROTULO}>Tipo</label>
          <select id="est-tipo" value={d.tipo} onChange={(e) => set('tipo', e.target.value)} className={CLASSE_CAMPO}>
            {Object.entries(ROTULO_TIPO).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="est-marca" className={CLASSE_ROTULO}>Marca</label>
          <input id="est-marca" value={d.marca} onChange={(e) => set('marca', e.target.value)} className={CLASSE_CAMPO} />
        </div>
        <div>
          <label htmlFor="est-modelo" className={CLASSE_ROTULO}>Modelo</label>
          <input id="est-modelo" value={d.modelo} onChange={(e) => set('modelo', e.target.value)} className={CLASSE_CAMPO} />
        </div>
        <div>
          <label htmlFor="est-local" className={CLASSE_ROTULO}>Local</label>
          <input id="est-local" value={d.localizacao} onChange={(e) => set('localizacao', e.target.value)} className={CLASSE_CAMPO} />
        </div>
        {!item && (
          <div>
            <label htmlFor="est-qtd" className={CLASSE_ROTULO}>Quantidade inicial</label>
            <input id="est-qtd" type="number" min={0} step={1} value={d.quantidadeInicial} onChange={(e) => set('quantidadeInicial', e.target.value)} className={CLASSE_CAMPO} />
          </div>
        )}
        <div>
          <label htmlFor="est-min" className={CLASSE_ROTULO}>Estoque mínimo (alerta)</label>
          <input id="est-min" type="number" min={0} step={1} value={d.minimo} onChange={(e) => set('minimo', e.target.value)} className={CLASSE_CAMPO} />
        </div>
        <div>
          <label htmlFor="est-valor" className={CLASSE_ROTULO}>Valor unitário (R$)</label>
          <input id="est-valor" type="number" min={0} step="0.01" value={d.valorUnitario} onChange={(e) => set('valorUnitario', e.target.value)} className={CLASSE_CAMPO} />
        </div>
        <div>
          <label htmlFor="est-forn" className={CLASSE_ROTULO}>Fornecedor</label>
          <select id="est-forn" value={d.fornecedorId} onChange={(e) => set('fornecedorId', e.target.value)} className={CLASSE_CAMPO}>
            <option value="">—</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-3 xl:col-span-4">
          <label htmlFor="est-obs" className={CLASSE_ROTULO}>Observações</label>
          <textarea id="est-obs" rows={2} value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} className={CLASSE_CAMPO} />
        </div>
        {item && (
          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={d.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Ativo (aparece nas listas de entrega)
          </label>
        )}
      </div>
      {erro && <p className="text-xs font-medium text-red-700" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg">Cancelar</button>
        <button type="submit" disabled={salvando} className="px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
};

const FormMovimento: React.FC<{
  item: ItemEstoque;
  tipo: TipoMovimentoEstoque;
  pessoas: { id: string; nome: string }[];
  onSalvar: (m: { quantidade: number; colaboradorId?: string; motivo?: string }) => Promise<string | null>;
  onCancelar: () => void;
}> = ({ item, tipo, pessoas, onSalvar, onCancelar }) => {
  const [quantidade, setQuantidade] = useState(tipo === 'ajuste' ? '' : '1');
  const [pessoa, setPessoa] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const comPessoa = tipo === 'saida' || tipo === 'devolucao';

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const falha = await onSalvar({ quantidade: Number(quantidade), colaboradorId: pessoa || undefined, motivo: motivo || undefined });
    if (falha) setErro(falha);
  };

  return (
    <form onSubmit={salvar} className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
      <h3 className="text-xs font-bold text-blue-900">
        {ROTULO_MOV[tipo]} · {item.nome} <span className="font-normal text-slate-600">(em estoque: {item.quantidade})</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <div>
          <label htmlFor="mov-qtd" className={CLASSE_ROTULO}>{tipo === 'ajuste' ? 'Diferença (+ ou −) *' : 'Quantidade *'}</label>
          <input id="mov-qtd" type="number" step={1} min={tipo === 'ajuste' ? undefined : 1} required value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className={CLASSE_CAMPO} />
        </div>
        {comPessoa && (
          <div>
            <label htmlFor="mov-pessoa" className={CLASSE_ROTULO}>{tipo === 'saida' ? 'Entregue para' : 'Devolvido por'}</label>
            <select id="mov-pessoa" value={pessoa} onChange={(e) => setPessoa(e.target.value)} className={CLASSE_CAMPO}>
              <option value="">—</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
        )}
        <div className={comPessoa ? '' : 'md:col-span-2 xl:col-span-2'}>
          <label htmlFor="mov-motivo" className={CLASSE_ROTULO}>{tipo === 'ajuste' ? 'Motivo *' : 'Observação'}</label>
          <input id="mov-motivo" value={motivo} required={tipo === 'ajuste'} onChange={(e) => setMotivo(e.target.value)} className={CLASSE_CAMPO} placeholder={tipo === 'ajuste' ? 'Ex.: contagem do inventário' : ''} />
        </div>
      </div>
      {erro && <p className="text-xs font-medium text-red-700" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg">Cancelar</button>
        <button type="submit" className="px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Confirmar</button>
      </div>
    </form>
  );
};
