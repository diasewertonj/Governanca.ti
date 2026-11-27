import React, { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, History, Pencil, Plus, SlidersHorizontal, Trash2, Undo2, Package, ArrowLeftRight } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { MenuAcoes } from '../ui/MenuAcoes.tsx';
import type { ItemEstoque, TipoAcessorio, TipoMovimentoEstoque } from '../../types/index.ts';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { formatDate } from '../../utils/formatters.ts';
import { confirmar, confirmarMovimento } from '../ui/dialogo.tsx';
import { Janela } from '../ui/Janela.tsx';
import { Vazio } from '../ui/Tela.tsx';
import { CampoMoeda, CampoSugestoes } from '../ui/Campos.tsx';
import { FABRICANTES } from '../../utils/especificacoes.ts';
import { acessoriosDaPessoa, avisoSegundoAcessorio } from '../../utils/inventario.ts';

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

/**
 * Seção 6 · Acessórios por quantidade (monitor, mouse, teclado, cabo…). O saldo só
 * muda por movimento (entrada, saída para uma pessoa, devolução, ajuste com motivo),
 * e cada movimento fica no histórico. Itens com patrimônio continuam em Equipamentos.
 */
export const EstoqueAcessorios: React.FC<{
  /** Quando a tela dona (Hardware) controla o filtro e o botão "Novo acessório", a barra interna some */
  mostrarInativos?: boolean;
  novoAberto?: boolean;
  onFecharNovo?: () => void;
  busca?: string;
}> = ({ mostrarInativos: inativosExterno, novoAberto = false, onFecharNovo, busca = '' }) => {
  const { currentRole, employees, fornecedores } = useApp();
  const { estoque, movimentos, salvarItemEstoque, excluirItemEstoque, movimentarEstoque } = useRecursos();
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const [inativosInterno, setInativosInterno] = useState(false);
  const controlado = inativosExterno !== undefined;
  const mostrarInativos = controlado ? inativosExterno : inativosInterno;
  const [editando, setEditando] = useState<ItemEstoque | 'novo' | null>(null);
  const fecharForm = () => {
    setEditando(null);
    onFecharNovo?.();
  };
  const [movendo, setMovendo] = useState<{ item: ItemEstoque; tipo: TipoMovimentoEstoque } | null>(null);
  const [historico, setHistorico] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  if (!isTI) return null;
  const termo = busca.trim().toLowerCase();
  const lista = estoque
    .filter((i) => mostrarInativos || i.ativo)
    .filter((i) => !termo || `${i.nome} ${i.marca || ''} ${i.modelo || ''} ${ROTULO_TIPO[i.tipo]} ${i.localizacao || ''}`.toLowerCase().includes(termo));
  const nomePessoa = (id?: string) => employees.find((e) => e.id === id)?.nome || '';
  const formAberto = editando !== null || novoAberto;
  const itemEmEdicao = editando && editando !== 'novo' ? editando : undefined;

  return (
    <div className="space-y-4">
      {!controlado && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={mostrarInativos} onChange={(e) => setInativosInterno(e.target.checked)} />
            Mostrar desativados
          </label>
          <button type="button" onClick={() => setEditando('novo')} className="btn btn-primario">
            <Plus /> Novo acessório
          </button>
        </div>
      )}

      {formAberto && (
        <FormItem
          item={itemEmEdicao}
          fornecedores={fornecedores.filter((f) => f.ativo)}
          onSalvar={async (dados) => {
            const r = await salvarItemEstoque(dados);
            if (r.erro && !r.item) return r.erro;
            if (r.erro) setErro(r.erro);
            fecharForm();
            return null;
          }}
          onCancelar={fecharForm}
        />
      )}

      {movendo && (
        <FormMovimento
          item={movendo.item}
          tipo={movendo.tipo}
          pessoas={employees.filter((e) => e.status !== 'desligado' && e.tipoVinculo !== 'externo')}
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
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {lista.length === 0 ? (
        <Vazio
          titulo="Nenhum acessório cadastrado"
          acao={
            <button type="button" onClick={() => setEditando('novo')} className="btn btn-sm btn-primario">
              Novo acessório
            </button>
          }
        />
      ) : (
        <div className="cartao-tabela">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Acessório</th>
                <th>Tipo</th>
                <th>Em estoque</th>
                <th className="hidden xl:table-cell">Local</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => {
                const baixo = i.minimo > 0 && i.quantidade <= i.minimo;
                return (
                  <React.Fragment key={i.id}>
                    <tr className={i.ativo ? '' : 'opacity-60'}>
                      <td data-label="Acessório" className="font-semibold text-slate-900">
                        {i.nome}
                        {(i.marca || i.modelo) && <span className="block font-normal text-slate-500">{[i.marca, i.modelo].filter(Boolean).join(' ')}</span>}
                      </td>
                      <td data-label="Tipo">
                        {ROTULO_TIPO[i.tipo]}
                      </td>
                      <td data-label="Em estoque">
                        <span className={`font-mono font-semibold ${baixo ? 'text-red-700' : 'text-slate-900'}`}>{i.quantidade}</span>
                        {i.minimo > 0 && <span className="text-slate-500"> (mín. {i.minimo})</span>}
                        {baixo && <span className="selo selo-problema ml-2">Estoque baixo</span>}
                      </td>
                      <td data-label="Local" className="hidden xl:table-cell">
                        {i.localizacao || '-'}
                      </td>
                      <td data-label="Ações" className="col-acoes">
                        <span className="acoes-linha">
                          <button type="button" onClick={() => setMovendo({ item: i, tipo: 'saida' })} className="btn btn-sm btn-secundario">
                            <ArrowUpFromLine /> Entregar
                          </button>
                          <button type="button" onClick={() => setMovendo({ item: i, tipo: 'entrada' })} title="Entrada no estoque" aria-label={`Entrada de ${i.nome}`} className="btn-icone">
                            <ArrowDownToLine />
                          </button>
                          <button type="button" onClick={() => setEditando(i)} title="Editar" aria-label={`Editar ${i.nome}`} className="btn-icone">
                            <Pencil />
                          </button>
                          <MenuAcoes
                            rotulo={`Mais ações de ${i.nome}`}
                            acoes={[
                              { rotulo: 'Devolução', icone: <Undo2 />, onClick: () => setMovendo({ item: i, tipo: 'devolucao' }) },
                              { rotulo: 'Ajuste de saldo', icone: <SlidersHorizontal />, onClick: () => setMovendo({ item: i, tipo: 'ajuste' }) },
                              { rotulo: historico === i.id ? 'Ocultar histórico' : 'Histórico', icone: <History />, onClick: () => setHistorico(historico === i.id ? null : i.id) },
                              {
                                rotulo: 'Excluir',
                                icone: <Trash2 />,
                                perigo: true,
                                oculto: currentRole !== 'ti_admin',
                                onClick: async () => {
                                  // Com movimentos o banco não deixa excluir: avisa antes de pedir confirmação
                                  if (movimentos.some((m) => m.itemId === i.id)) {
                                    setErro(`${i.nome} tem movimentos no histórico: em vez de excluir, edite e desmarque "Ativo".`);
                                    return;
                                  }
                                  if (!(await confirmar(`Excluir ${i.nome}?\n\nO cadastro sai das listas. Não dá para desfazer.`))) return;
                                  setErro((await excluirItemEstoque(i.id)) || '');
                                },
                              },
                            ]}
                          />
                        </span>
                      </td>
                    </tr>
                    {historico === i.id && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50">
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
    valorUnitario: item?.valorUnitario ?? undefined,
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
      valorUnitario: d.valorUnitario,
      observacoes: d.observacoes || undefined,
      ativo: d.ativo,
      quantidadeInicial: item ? undefined : Number(d.quantidadeInicial) || 0,
    });
    setSalvando(false);
    if (falha) setErro(falha);
  };

  return (
    <Janela
      tamanho="p"
      titulo={item ? `Editar ${item.nome}` : 'Novo acessório'}
      subtitulo="Item de estoque controlado por quantidade"
      icone={<Package className="ico" />}
      onFechar={onCancelar}
      idTitulo="janela-acessorio"
      rodape={
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancelar} className="btn btn-secundario">Cancelar</button>
          <button type="submit" form="form-acessorio" disabled={salvando} className="btn btn-primario">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      }
    >
    <form id="form-acessorio" onSubmit={salvar} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
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
          <CampoSugestoes id="est-marca" value={d.marca} onChange={(v) => set('marca', v)} sugestoes={FABRICANTES.acessorio} className={CLASSE_CAMPO} />
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
          <CampoMoeda id="est-valor" valor={d.valorUnitario} onMudar={(v) => setD((p) => ({ ...p, valorUnitario: v }))} className={CLASSE_CAMPO} />
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
        <div className="sm:col-span-2">
          <label htmlFor="est-obs" className={CLASSE_ROTULO}>Observações</label>
          <textarea id="est-obs" rows={2} value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} className={CLASSE_CAMPO} />
        </div>
        {item && (
          <label className="inline-flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={d.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Ativo (aparece nas listas de entrega)
          </label>
        )}
      </div>
      {erro && <p className="erro" role="alert">{erro}</p>}
    </form>
    </Janela>
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
  const { movimentos, estoque } = useRecursos();
  const comPessoa = tipo === 'saida' || tipo === 'devolucao';

  /** 9.1: entregar (para uma pessoa) e devolver passam pela confirmação "de → para". null = não grava */
  const confirmarMovimentoPessoa = async (q: number): Promise<{ justificativa?: string } | null> => {
    const nome = pessoas.find((p) => p.id === pessoa)?.nome || 'Pessoa';
    const saldo = item.quantidade;
    const termo =
      item.tipo === 'monitor'
        ? 'Monitor de estoque (sem patrimônio) não gera pendência de termo; para constar no termo, cadastre-o em Equipamentos.'
        : 'Acessório não exige termo (só computador, celular e monitor).';
    if (tipo === 'saida') {
      const aviso = avisoSegundoAcessorio(item, pessoa, movimentos, estoque, q);
      return confirmarMovimento({
        titulo: 'Entregar acessório',
        item: `${q} × ${item.nome}`,
        de: `Estoque (${saldo} un.)`,
        para: nome,
        efeitos: [
          `O saldo em estoque vai de ${saldo} para ${saldo - q}`,
          `Aparece na ficha de ${nome} em Equipamentos e acessórios`,
          'O movimento fica no histórico do acessório',
        ],
        foraDoNexus: ['Entregar em mãos e pedir para conferir'],
        termo,
        justificativa: aviso ? { aviso } : undefined,
        desfazer: 'Para desfazer, registre uma devolução; o histórico guarda os dois movimentos.',
        confirmar: 'Entregar',
      });
    }
    const comEla = pessoa ? acessoriosDaPessoa(pessoa, movimentos).get(item.id) || 0 : 0;
    return confirmarMovimento({
      titulo: 'Devolver acessório',
      item: `${q} × ${item.nome}`,
      de: pessoa ? nome : 'Sem pessoa informada',
      para: `Estoque (${saldo + q} un.)`,
      efeitos: [
        `O saldo em estoque vai de ${saldo} para ${saldo + q}`,
        ...(pessoa ? [`Sai da ficha de ${nome} em Equipamentos e acessórios`] : []),
        ...(pessoa && comEla < q ? [`Atenção: pelo histórico, ${nome} tem ${comEla} deste item. Confira a quantidade.`] : []),
        'O movimento fica no histórico do acessório',
      ],
      foraDoNexus: ['Conferir o estado do item ao receber e guardar no local do estoque'],
      termo,
      desfazer: 'Para desfazer, registre uma nova entrega; o histórico guarda os dois movimentos.',
      confirmar: 'Devolver',
    });
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = Number(quantidade);
    let obs = motivo.trim();
    if (tipo === 'devolucao' || (tipo === 'saida' && pessoa)) {
      // Confere antes de perguntar (o mesmo que o estoque confere ao gravar)
      if (!Number.isInteger(q) || q <= 0) return setErro('Informe uma quantidade inteira maior que zero.');
      if (tipo === 'saida' && q > item.quantidade) return setErro(`Estoque insuficiente: há ${item.quantidade} de ${item.nome}.`);
      setErro('');
      const r = await confirmarMovimentoPessoa(q);
      if (!r) return;
      if (r.justificativa) obs = [obs, `justificativa: ${r.justificativa}`].filter(Boolean).join(' — ');
    }
    const falha = await onSalvar({ quantidade: q, colaboradorId: pessoa || undefined, motivo: obs || undefined });
    if (falha) setErro(falha);
  };

  return (
    <Janela
      tamanho="p"
      titulo={`${ROTULO_MOV[tipo]} · ${item.nome}`}
      subtitulo={`Em estoque: ${item.quantidade}`}
      icone={<ArrowLeftRight className="ico" />}
      onFechar={onCancelar}
      idTitulo="janela-movimento"
      rodape={
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancelar} className="btn btn-secundario">Cancelar</button>
          <button type="submit" form="form-movimento" className="btn btn-primario">Confirmar</button>
        </div>
      }
    >
    <form id="form-movimento" onSubmit={salvar} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div className={comPessoa ? 'sm:col-span-2' : 'sm:col-span-2'}>
          <label htmlFor="mov-motivo" className={CLASSE_ROTULO}>{tipo === 'ajuste' ? 'Motivo *' : 'Observação'}</label>
          <input id="mov-motivo" value={motivo} required={tipo === 'ajuste'} onChange={(e) => setMotivo(e.target.value)} className={CLASSE_CAMPO} placeholder={tipo === 'ajuste' ? 'Ex.: contagem do inventário' : ''} />
        </div>
      </div>
      {erro && <p className="erro" role="alert">{erro}</p>}
    </form>
    </Janela>
  );
};
