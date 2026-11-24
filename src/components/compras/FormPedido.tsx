/**
 * Fase 11 + seções 13/14 · Formulário do pedido de compra. Cada item pode ter link,
 * marca, modelo e valor de referência, e opções (links de lojas) incluídas pelo \"+\".
 * T.I.: itens com valor estimado e até 3 cotações (anexo e vencedora); salva como
 * rascunho ou já envia para aprovação. RH e gestor: só o que precisa e para quê
 * (sem valores, fornecedor nem cotações) — o pedido vai direto para aprovação.
 */
import React, { useMemo, useState } from 'react';
import { ExternalLink, Paperclip, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { AssetCategory, CategoriaDespesa, CotacaoPedido, ItemPedido, PedidoCompra, TipoItemPedido } from '../../types/index.ts';
import { ROTULO_CATEGORIA, brl } from '../../utils/financeiro.ts';
import { ROTULO_TIPO_ITEM, opcoesDoItem } from '../../utils/compras.ts';
import { validarArquivo } from '../../services/supabaseDb.ts';
import { Janela } from '../ui/Janela.tsx';
import { CampoMoeda, CampoSugestoes } from '../ui/Campos.tsx';
import { confirmar } from '../ui/dialogo.tsx';
import { AbrirArquivo } from '../comum/AbrirArquivo.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';

const CATEGORIAS = Object.keys(ROTULO_CATEGORIA) as CategoriaDespesa[];
const ROTULO_CAT_ATIVO: Record<Exclude<AssetCategory, 'software'>, string> = { hardware: 'Computador / hardware', periferico: 'Periférico', telefonia: 'Celular / telefonia' };

const itemVazio = (n: number): ItemPedido => ({ id: `pit-${crypto.randomUUID()}`, tipo: 'equipamento', descricao: '', categoriaAtivo: 'hardware', quantidade: 1, ordem: n });

export function pedidoVazio(base: Partial<PedidoCompra> = {}): PedidoCompra {
  return {
    id: `ped-${crypto.randomUUID()}`,
    codigo: '',
    titulo: '',
    categoria: 'hardware',
    area: '',
    status: 'rascunho',
    tipoPedido: 'ti',
    criadoEm: new Date().toISOString(),
    itens: [itemVazio(1)],
    cotacoes: [],
    eventos: [],
    ...base,
  };
}

export const FormPedido: React.FC<{
  inicial: PedidoCompra;
  /** true = pedido de RH/gestor (sem valores) */
  simples?: boolean;
  /** Seção 16: editar só o que é e para quem (itens e opções ficam no painel de cotação da ficha) */
  somenteDados?: boolean;
  onClose: () => void;
  onSalvo?: (p: PedidoCompra) => void;
}> = ({ inicial, simples, somenteDados, onClose, onSalvo }) => {
  const { employees, departments, fornecedores, licenses, tickets, contratos } = useApp();
  const { estoque } = useRecursos();
  const { salvarPedido, solicitarCompra, anexarCotacao } = useCompras();
  const [p, setP] = useState<PedidoCompra>(inicial);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [enviandoArquivo, setEnviandoArquivo] = useState<string | null>(null);
  const novo = !inicial.codigo;
  const alterado = JSON.stringify(p) !== JSON.stringify(inicial);
  useRegistrarPendencias(`pedido:${p.id}`, alterado ? ['Pedido de compra não salvo'] : []);

  const areas = useMemo(
    () => [...new Set([...departments.map((d) => d.nome), ...contratos.map((c) => c.centroCusto || '')].filter(Boolean))].sort(),
    [departments, contratos]
  );
  const pessoas = employees.filter((e) => e.status !== 'desligado').sort((a, b) => a.nome.localeCompare(b.nome));
  const admissoes = tickets.filter((t) => t.tipo === 'onboarding' && t.status !== 'resolvido' && t.status !== 'cancelado');
  const estimado = p.itens.reduce((s, i) => s + i.quantidade * (i.valorUnitario || 0), 0);

  const mudarItem = (id: string, mud: Partial<ItemPedido>) => setP((x) => ({ ...x, itens: x.itens.map((i) => (i.id === id ? { ...i, ...mud } : i)) }));
  const mudarCot = (id: string, mud: Partial<CotacaoPedido>) => setP((x) => ({ ...x, cotacoes: x.cotacoes.map((c) => (c.id === id ? { ...c, ...mud } : c)) }));

  const fechar = async () => {
    if (alterado && !(await confirmar({ titulo: 'Descartar o pedido?', mensagem: 'O que foi preenchido não será salvo.', confirmar: 'Descartar', cancelar: 'Continuar editando', perigo: true }))) return;
    onClose();
  };

  const anexar = async (cot: CotacaoPedido, arquivo?: File) => {
    if (!arquivo) return;
    const invalido = validarArquivo(arquivo);
    if (invalido) return setErro(invalido);
    setEnviandoArquivo(cot.id);
    const r = await anexarCotacao(p.id, arquivo);
    setEnviandoArquivo(null);
    if (r.erro) return setErro(`Não foi possível enviar o anexo: ${r.erro}`);
    mudarCot(cot.id, { arquivoCaminho: r.caminho });
  };

  const salvar = async (enviar: boolean) => {
    setErro('');
    setSalvando(true);
    const r = simples ? await solicitarCompra(p) : await salvarPedido(p, enviar);
    setSalvando(false);
    if (r.erro && !r.item) return setErro(r.erro);
    if (r.erro) setErro(r.erro);
    else {
      onSalvo?.(r.item!);
      onClose();
    }
  };

  const id = (c: string) => `ped-${p.id}-${c}`;

  return (
    <Janela
      titulo={novo ? (simples ? 'Pedir compra' : 'Novo pedido de compra') : `Editar ${p.codigo}`}
      subtitulo={simples ? 'Pedido de T.I.: a T.I. cota; Compras (ou o seu gestor) registra a aprovação; Compras compra' : 'Cotação → aprovação registrada (Compras, T.I. admin ou o gestor) → compra → recebimento'}
      icone={<ShoppingCart className="ico" />}
      tamanho="g"
      onFechar={fechar}
      rodape={
        <>
          <button type="button" onClick={fechar} className="btn btn-secundario">
            Cancelar
          </button>
          {simples ? (
            <button type="button" disabled={salvando} onClick={() => salvar(true)} className="btn btn-primario">
              {salvando ? 'Enviando…' : 'Enviar pedido'}
            </button>
          ) : (
            <>
              <button type="button" disabled={salvando} onClick={() => salvar(false)} className="btn btn-secundario">
                {p.status === 'rascunho' || !p.codigo ? 'Salvar rascunho' : 'Salvar'}
              </button>
              {(p.status === 'rascunho' || p.status === 'recusado') && (
                <button type="button" disabled={salvando} onClick={() => salvar(true)} className="btn btn-primario">
                  {salvando ? 'Salvando…' : 'Salvar e enviar para cotação'}
                </button>
              )}
              {p.status === 'aguardando' && (
                <button type="button" disabled={salvando} onClick={() => salvar(false)} className="btn btn-primario">
                  {salvando ? 'Salvando…' : 'Salvar'}
                </button>
              )}
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <section className="cartao space-y-3 p-4">
          <h3 className="secao-titulo">O que e para quê</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <fieldset className="md:col-span-2">
              <legend className="rotulo">Tipo de pedido</legend>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                <label className="inline-flex items-center gap-2 text-slate-700">
                  <input type="radio" name={id('tipo')} checked={p.tipoPedido !== 'outros'} onChange={() => setP({ ...p, tipoPedido: 'ti', categoria: p.categoria === 'outros' ? 'hardware' : p.categoria, itens: p.itens.map((i) => (i.tipo === 'servico' ? { ...i, tipo: 'equipamento', categoriaAtivo: 'hardware' } : i)) })} />
                  De T.I. (equipamento, acessório, software) — a T.I. cota
                </label>
                <label className="inline-flex items-center gap-2 text-slate-700">
                  <input type="radio" name={id('tipo')} checked={p.tipoPedido === 'outros'} onChange={() => setP({ ...p, tipoPedido: 'outros', categoria: 'outros', itens: p.itens.map((i) => ({ ...i, tipo: 'servico', estoqueItemId: undefined, licencaId: undefined })) })} />
                  Outros (móveis, material, serviços) — Compras cota
                </label>
              </div>
            </fieldset>
            <div className="md:col-span-2">
              <label htmlFor={id('titulo')} className="rotulo">O que precisa ser comprado</label>
              <input id={id('titulo')} value={p.titulo} onChange={(e) => setP({ ...p, titulo: e.target.value })} placeholder="Ex.: Notebook para nova analista de RH" className="campo" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor={id('just')} className="rotulo">Para que é (justificativa)</label>
              <textarea id={id('just')} rows={2} value={p.justificativa || ''} onChange={(e) => setP({ ...p, justificativa: e.target.value })} className="campo" />
            </div>
            <div>
              <label htmlFor={id('cat')} className="rotulo">Categoria do gasto</label>
              <select id={id('cat')} value={p.categoria} onChange={(e) => setP({ ...p, categoria: e.target.value as CategoriaDespesa })} className="campo">
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {ROTULO_CATEGORIA[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={id('area')} className="rotulo">Área / centro de custo</label>
              <CampoSugestoes id={id('area')} value={p.area} onChange={(v) => setP({ ...p, area: v })} sugestoes={areas} placeholder="Ex.: Recursos Humanos" />
            </div>
            <div>
              <label htmlFor={id('pessoa')} className="rotulo">Para quem (opcional; já vem com você)</label>
              <select id={id('pessoa')} value={p.colaboradorDestinoId || ''} onChange={(e) => setP({ ...p, colaboradorDestinoId: e.target.value || undefined })} className="campo">
                <option value="">Ninguém (vai para o estoque)</option>
                {pessoas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={id('quando')} className="rotulo">Precisa até (opcional)</label>
              <input id={id('quando')} type="date" value={p.necessarioEm || ''} onChange={(e) => setP({ ...p, necessarioEm: e.target.value || undefined })} className="campo" />
            </div>
            {admissoes.length > 0 && (
              <div className="md:col-span-2">
                <label htmlFor={id('adm')} className="rotulo">Ligado a uma admissão (opcional)</label>
                <select id={id('adm')} value={p.chamadoId || ''} onChange={(e) => setP({ ...p, chamadoId: e.target.value || undefined, processoItemId: e.target.value === inicial.chamadoId ? inicial.processoItemId : undefined })} className="campo">
                  <option value="">Nenhuma</option>
                  {admissoes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.codigo} · {t.onboarding?.nomeColaborador || t.titulo}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>

        {!somenteDados && (
        <section className="cartao space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="secao-titulo">Itens ({p.itens.length})</h3>
            {!simples && <span className="texto-aux">Estimado: <span className="num font-semibold text-slate-900">{brl(estimado)}</span></span>}
          </div>
          {p.itens.map((i, n) => (
            <div key={i.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_6rem] lg:grid-cols-[12rem_minmax(0,1fr)_6rem_10rem_auto]">
                <div className={p.tipoPedido === 'outros' ? 'hidden' : ''}>
                  <label htmlFor={id(`tipo-${n}`)} className="texto-aux">Tipo</label>
                  <select id={id(`tipo-${n}`)} value={i.tipo} onChange={(e) => mudarItem(i.id, { tipo: e.target.value as TipoItemPedido, estoqueItemId: undefined, licencaId: undefined })} className="campo campo-sm">
                    {(Object.keys(ROTULO_TIPO_ITEM) as TipoItemPedido[]).filter((t) => !simples || t === 'equipamento' || t === 'servico').map((t) => (
                      <option key={t} value={t}>
                        {simples && t === 'equipamento' ? 'Equipamento ou acessório' : ROTULO_TIPO_ITEM[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={id(`desc-${n}`)} className="texto-aux">Descrição</label>
                  <input id={id(`desc-${n}`)} value={i.descricao} onChange={(e) => mudarItem(i.id, { descricao: e.target.value })} placeholder="Ex.: Notebook 14&quot; i5 16 GB" className="campo campo-sm" />
                </div>
                <div>
                  <label htmlFor={id(`qtd-${n}`)} className="texto-aux">Quantidade</label>
                  <input id={id(`qtd-${n}`)} type="number" min={1} step={1} value={i.quantidade} onChange={(e) => mudarItem(i.id, { quantidade: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} className="campo campo-sm" />
                </div>
                {!simples && (
                  <div>
                    <label htmlFor={id(`valor-${n}`)} className="texto-aux">Valor unitário estimado</label>
                    <CampoMoeda id={id(`valor-${n}`)} className="campo campo-sm" valor={i.valorUnitario} onMudar={(v) => mudarItem(i.id, { valorUnitario: v })} />
                  </div>
                )}
                <div className="flex items-end">
                  <button type="button" disabled={p.itens.length === 1} onClick={() => setP({ ...p, itens: p.itens.filter((x) => x.id !== i.id) })} aria-label={`Remover o item ${n + 1}`} title="Remover item" className="btn-icone btn-icone-perigo">
                    <Trash2 />
                  </button>
                </div>
              </div>
              {i.tipo === 'equipamento' && p.tipoPedido !== 'outros' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label htmlFor={id(`catat-${n}`)} className="texto-aux">Tipo de equipamento</label>
                    <select id={id(`catat-${n}`)} value={i.categoriaAtivo || 'hardware'} onChange={(e) => mudarItem(i.id, { categoriaAtivo: e.target.value as AssetCategory })} className="campo campo-sm">
                      {Object.entries(ROTULO_CAT_ATIVO).map(([k, r]) => (
                        <option key={k} value={k}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-1 lg:col-span-3">
                    <label htmlFor={id(`espec-${n}`)} className="texto-aux">Especificação</label>
                    <input id={id(`espec-${n}`)} value={i.especificacao || ''} onChange={(e) => mudarItem(i.id, { especificacao: e.target.value })} placeholder="Processador, memória, tela…" className="campo campo-sm" />
                  </div>
                </div>
              )}
              {i.tipo === 'acessorio' && (
                <div>
                  <label htmlFor={id(`est-${n}`)} className="texto-aux">Acessório do estoque (a entrada é feita ao receber)</label>
                  <select
                    id={id(`est-${n}`)}
                    value={i.estoqueItemId || ''}
                    onChange={(e) => {
                      const it = estoque.find((x) => x.id === e.target.value);
                      mudarItem(i.id, { estoqueItemId: e.target.value || undefined, descricao: it?.nome || i.descricao, valorUnitario: i.valorUnitario ?? it?.valorUnitario });
                    }}
                    className="campo campo-sm sm:w-96"
                  >
                    <option value="">Escolha…</option>
                    {estoque.filter((x) => x.ativo).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome} · {x.quantidade} em estoque
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {i.tipo === 'licenca' && (
                <div>
                  <label htmlFor={id(`lic-${n}`)} className="texto-aux">Licença (os assentos aumentam ao receber)</label>
                  <select
                    id={id(`lic-${n}`)}
                    value={i.licencaId || ''}
                    onChange={(e) => {
                      const l = licenses.find((x) => x.id === e.target.value);
                      mudarItem(i.id, { licencaId: e.target.value || undefined, descricao: l ? `${l.nome} (assentos)` : i.descricao });
                    }}
                    className="campo campo-sm sm:w-96"
                  >
                    <option value="">Licença nova (cadastre ao receber)</option>
                    {licenses.filter((l) => l.status !== 'inativa').map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome} · {l.assentosTotais} assento(s)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <ProdutoDoItem pedido={p} item={i} n={n} simples={!!simples} id={id} mudarItem={mudarItem} setP={setP} anexar={anexar} enviandoArquivo={enviandoArquivo} />
            </div>
          ))}
          <button type="button" onClick={() => setP({ ...p, itens: [...p.itens, itemVazio(p.itens.length + 1)] })} className="btn btn-sm btn-secundario">
            <Plus /> Adicionar item
          </button>
        </section>
        )}

        {!simples && !somenteDados && p.cotacoes.some((c) => !c.itemId) && (
          <section className="cartao space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="secao-titulo">Cotações do pedido inteiro (formato antigo)</h3>
              <p className="texto-aux">As opções novas ficam em cada item, pelo botão &quot;+ Opção&quot;.</p>
            </div>
            {p.cotacoes.filter((c) => !c.itemId).map((c, n) => (
              <div key={c.id} className={`space-y-2 rounded-lg border p-3 ${c.vencedora ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'}`}>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_9rem_6rem_9rem_auto]">
                  <div>
                    <label htmlFor={id(`cforn-${n}`)} className="texto-aux">Fornecedor</label>
                    <select id={id(`cforn-${n}`)} value={c.fornecedorId} onChange={(e) => mudarCot(c.id, { fornecedorId: e.target.value })} className="campo campo-sm">
                      <option value="">Escolha…</option>
                      {fornecedores.filter((f) => f.ativo || f.id === c.fornecedorId).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={id(`cval-${n}`)} className="texto-aux">Valor total</label>
                    <CampoMoeda id={id(`cval-${n}`)} className="campo campo-sm" valor={c.valor} onMudar={(v) => mudarCot(c.id, { valor: v || 0 })} />
                  </div>
                  <div>
                    <label htmlFor={id(`cprazo-${n}`)} className="texto-aux">Prazo (dias)</label>
                    <input id={id(`cprazo-${n}`)} type="number" min={0} value={c.prazoDias ?? ''} onChange={(e) => mudarCot(c.id, { prazoDias: e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value))) })} className="campo campo-sm" />
                  </div>
                  <div>
                    <label htmlFor={id(`cvalid-${n}`)} className="texto-aux">Válida até</label>
                    <input id={id(`cvalid-${n}`)} type="date" value={c.validade || ''} onChange={(e) => mudarCot(c.id, { validade: e.target.value || undefined })} className="campo campo-sm" />
                  </div>
                  <div className="flex items-end gap-1">
                    <button type="button" onClick={() => setP({ ...p, cotacoes: p.cotacoes.filter((x) => x.id !== c.id) })} aria-label={`Remover a cotação ${n + 1}`} title="Remover cotação" className="btn-icone btn-icone-perigo">
                      <Trash2 />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 font-semibold text-slate-700">
                    <input type="radio" name={id('vencedora')} checked={c.vencedora} onChange={() => setP({ ...p, cotacoes: p.cotacoes.map((x) => (x.itemId ? x : { ...x, vencedora: x.id === c.id })) })} /> Vencedora
                  </label>
                  {c.arquivoCaminho ? (
                    <span className="inline-flex items-center gap-1">
                      <AbrirArquivo caminho={c.arquivoCaminho} />
                      <button type="button" onClick={() => mudarCot(c.id, { arquivoCaminho: undefined })} className="btn btn-sm btn-discreto">
                        Trocar
                      </button>
                    </span>
                  ) : (
                    <label className="btn btn-sm btn-secundario cursor-pointer">
                      <Paperclip /> {enviandoArquivo === c.id ? 'Enviando…' : 'Anexar proposta'}
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" className="sr-only" onChange={(e) => anexar(c, e.target.files?.[0])} />
                    </label>
                  )}
                  <input aria-label={`Observação da cotação ${n + 1}`} value={c.observacoes || ''} onChange={(e) => mudarCot(c.id, { observacoes: e.target.value })} placeholder="Observação (frete, garantia…)" className="campo campo-sm min-w-0 flex-1" />
                </div>
              </div>
            ))}

          </section>
        )}
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
      </div>
    </Janela>
  );
};

export type PropsProduto = {
  pedido: PedidoCompra;
  item: ItemPedido;
  n: number;
  simples: boolean;
  id: (c: string) => string;
  mudarItem: (id: string, mud: Partial<ItemPedido>) => void;
  setP: React.Dispatch<React.SetStateAction<PedidoCompra>>;
  anexar: (c: CotacaoPedido, arquivo?: File) => Promise<void>;
  enviandoArquivo: string | null;
};

/** Seção 14: produto do item (link, marca, modelo, valor de referência) e as opções de compra */
export const ProdutoDoItem: React.FC<PropsProduto> = ({ pedido: p, item: i, n, simples, id, mudarItem, setP, anexar, enviandoArquivo }) => {
  const { fornecedores } = useApp();
  const { lerDadosDoLink } = useCompras();
  const [buscando, setBuscando] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const opcoes = opcoesDoItem(p, i.id);
  const mudarOp = (oid: string, mud: Partial<CotacaoPedido>) => setP((x) => ({ ...x, cotacoes: x.cotacoes.map((c) => (c.id === oid ? { ...c, ...mud } : c)) }));
  const novaOpcao = () =>
    setP((x) => ({
      ...x,
      cotacoes: [...x.cotacoes, { id: `cot-${crypto.randomUUID()}`, itemId: i.id, fornecedorId: '', valor: 0, vencedora: false }],
    }));
  // Busca e preenche só o que está vazio (tudo continua editável)
  const buscar = async (alvo: 'item' | string, url?: string) => {
    if (!url || !/^https:\/\//i.test(url.trim())) return setAviso('Cole um link que começa com https://');
    setBuscando(alvo);
    const r = await lerDadosDoLink(url.trim());
    setBuscando(null);
    if (r.erro || !r.dados) return setAviso(r.erro || 'Nada encontrado no link.');
    const d = r.dados;
    if (alvo === 'item') {
      mudarItem(i.id, {
        descricao: i.descricao || d.nome || '',
        marca: i.marca || d.marca,
        modelo: i.modelo || d.modelo,
        imagemUrl: i.imagemUrl || d.imagem,
        ...(simples ? { valorReferencia: i.valorReferencia ?? d.preco } : { valorUnitario: i.valorUnitario ?? d.preco }),
      });
    } else {
      const o = opcoes.find((x) => x.id === alvo);
      if (o) mudarOp(o.id, { descricao: o.descricao || d.nome, marca: o.marca || d.marca, modelo: o.modelo || d.modelo, loja: o.loja || d.loja, imagemUrl: o.imagemUrl || d.imagem, valor: o.valor || d.preco || 0 });
    }
    setAviso('Dados preenchidos a partir do link. Confira.');
  };

  return (
    <div className="space-y-2 rounded-md bg-slate-50 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_10rem]">
        <div>
          <label htmlFor={id(`link-${n}`)} className="texto-aux">Link do produto (opcional)</label>
          <div className="flex gap-2">
            <input id={id(`link-${n}`)} type="url" inputMode="url" value={i.link || ''} onChange={(e) => mudarItem(i.id, { link: e.target.value })} placeholder="https://loja.com.br/produto" className="campo campo-sm min-w-0" />
            <button type="button" disabled={buscando === 'item' || !i.link} onClick={() => buscar('item', i.link)} title="Buscar nome, marca, modelo e preço na página da loja" className="btn btn-sm btn-secundario shrink-0">
              <Search /> {buscando === 'item' ? 'Buscando…' : 'Buscar'}
            </button>
            {i.link && /^https?:\/\//i.test(i.link) && (
              <a href={i.link} target="_blank" rel="noopener noreferrer" title="Abrir o link" aria-label="Abrir o link do produto" className="btn-icone shrink-0">
                <ExternalLink />
              </a>
            )}
          </div>
        </div>
        <div>
          <label htmlFor={id(`marca-${n}`)} className="texto-aux">Marca</label>
          <input id={id(`marca-${n}`)} value={i.marca || ''} onChange={(e) => mudarItem(i.id, { marca: e.target.value })} className="campo campo-sm" />
        </div>
        <div>
          <label htmlFor={id(`modelo-${n}`)} className="texto-aux">Modelo</label>
          <input id={id(`modelo-${n}`)} value={i.modelo || ''} onChange={(e) => mudarItem(i.id, { modelo: e.target.value })} className="campo campo-sm" />
        </div>
        {simples ? (
          <div>
            <label htmlFor={id(`ref-${n}`)} className="texto-aux">Valor que você viu (opcional)</label>
            <CampoMoeda id={id(`ref-${n}`)} className="campo campo-sm" valor={i.valorReferencia} onMudar={(v) => mudarItem(i.id, { valorReferencia: v })} />
          </div>
        ) : (
          <div className="self-end texto-aux">{i.valorReferencia != null ? `Quem pediu viu: ${brl(i.valorReferencia)}` : ''}</div>
        )}
      </div>
      {i.imagemUrl && <img src={i.imagemUrl} alt={`Imagem de ${i.descricao || 'produto'}`} referrerPolicy="no-referrer" className="h-16 w-16 rounded border border-slate-200 bg-white object-contain" />}

      <div className="space-y-2">
        <p className="font-semibold text-slate-700">
          Opções de compra ({opcoes.length}){!simples && opcoes.length > 0 ? ' · recomendar uma é opcional' : ''}
        </p>
        {opcoes.map((c, k) => (
          <div key={c.id} className={`grid grid-cols-1 gap-2 rounded-md border bg-white p-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_9rem_auto] ${c.vencedora ? 'border-emerald-300' : 'border-slate-200'}`}>
            {simples ? (
              <input aria-label={`Loja da opção ${k + 1}`} value={c.loja || ''} onChange={(e) => mudarOp(c.id, { loja: e.target.value })} placeholder="Loja" className="campo campo-sm" />
            ) : (
              <select aria-label={`Fornecedor da opção ${k + 1}`} value={c.fornecedorId} onChange={(e) => mudarOp(c.id, { fornecedorId: e.target.value })} className="campo campo-sm">
                <option value="">{c.loja ? `Loja: ${c.loja}` : 'Loja / fornecedor…'}</option>
                {fornecedores.filter((f) => f.ativo || f.id === c.fornecedorId).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <input aria-label={`Link da opção ${k + 1}`} type="url" value={c.link || ''} onChange={(e) => mudarOp(c.id, { link: e.target.value })} placeholder="https://…" className="campo campo-sm min-w-0" />
              <button type="button" disabled={buscando === c.id || !c.link} onClick={() => buscar(c.id, c.link)} aria-label={`Buscar dados do link da opção ${k + 1}`} title="Buscar dados do link" className="btn-icone shrink-0">
                <Search />
              </button>
            </div>
            <input aria-label={`Marca da opção ${k + 1}`} value={c.marca || ''} onChange={(e) => mudarOp(c.id, { marca: e.target.value })} placeholder="Marca" className="campo campo-sm" />
            <input aria-label={`Modelo da opção ${k + 1}`} value={c.modelo || ''} onChange={(e) => mudarOp(c.id, { modelo: e.target.value })} placeholder="Modelo" className="campo campo-sm" />
            <CampoMoeda aria-label={`Valor unitário da opção ${k + 1}`} className="campo campo-sm" valor={c.valor || undefined} onMudar={(v) => mudarOp(c.id, { valor: v || 0 })} />
            <div className="flex items-center gap-1">
              {!simples && (
                <label className="inline-flex items-center gap-1 font-semibold text-slate-700" title="Opção recomendada para Compras (opcional)">
                  <input type="radio" name={id(`escolhida-${n}`)} checked={c.vencedora} onChange={() => setP((x) => ({ ...x, cotacoes: x.cotacoes.map((o) => (o.itemId === i.id ? { ...o, vencedora: o.id === c.id } : o)) }))} />
                  Recomendada
                </label>
              )}
              {!simples &&
                (c.arquivoCaminho ? (
                  <AbrirArquivo caminho={c.arquivoCaminho} rotulo="Proposta" />
                ) : (
                  <label className="btn-icone cursor-pointer" title="Anexar proposta" aria-label={`Anexar proposta da opção ${k + 1}`}>
                    {enviandoArquivo === c.id ? '…' : <Paperclip />}
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" className="sr-only" onChange={(e) => anexar(c, e.target.files?.[0])} />
                  </label>
                ))}
              <button type="button" onClick={() => setP((x) => ({ ...x, cotacoes: x.cotacoes.filter((o) => o.id !== c.id) }))} aria-label={`Remover a opção ${k + 1}`} title="Remover opção" className="btn-icone btn-icone-perigo">
                <Trash2 />
              </button>
            </div>
          </div>
        ))}
        {opcoes.length < 10 && (
          <button type="button" onClick={novaOpcao} className="btn btn-sm btn-secundario">
            <Plus /> Opção
          </button>
        )}
        {aviso && <p className="ajuda">{aviso}</p>}
      </div>
    </div>
  );
};