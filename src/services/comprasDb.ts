/**
 * Fase 11 · Orçamento, pedidos de compra e inventário físico no banco.
 * Tabelas novas (fora do database.types gerado): cliente sem tipo, mapeamento aqui.
 * Toda gravação confere o erro e lança DbError; leitura que falha devolve null
 * (antes da migration as tabelas não existem: as telas seguem vazias).
 * Sem Supabase (modo demonstração) as funções não fazem nada.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import { DbError } from './supabaseDb.ts';
import type {
  AssetCategory,
  CategoriaDespesa,
  CotacaoPedido,
  EventoPedido,
  FormaAprovacao,
  FormaPagamento,
  InventarioFisico,
  ItemInventario,
  ItemPedido,
  MensagemPedido,
  Orcamento,
  PedidoCompra,
  SituacaoConferencia,
  StatusPedido,
  TipoItemPedido,
  TipoPedido,
} from '../types/index.ts';

type Linha = Record<string, unknown>;
const bd = () => supabase as unknown as SupabaseClient;
const txt = (v: unknown) => (v == null || v === '' ? undefined : String(v));
const num = (v: unknown) => (v == null || v === '' ? undefined : Number(v));

async function checar<T>(op: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await op;
  if (error) throw new DbError(error.message, error.code);
  return data;
}

/** Atualização que precisa afetar 1 linha (a RLS recusa em silêncio) */
async function atualizar(tabela: string, id: string, campos: Linha) {
  if (!supabase || Object.keys(campos).length === 0) return;
  const data = await checar(bd().from(tabela).update(campos).eq('id', id).select('id'));
  if (!data || (data as unknown[]).length === 0) throw new DbError('Sem permissão para alterar este registro, ou ele não existe mais.', '42501');
}

async function ler<T>(op: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>): Promise<T | null> {
  const { data, error } = await op;
  if (error) {
    console.warn('Fase 11: leitura indisponível', error.message);
    return null;
  }
  return data;
}

// -----------------------------------------------------------------------------
// Orçamento
// -----------------------------------------------------------------------------
const deOrcamento = (r: Linha): Orcamento => ({
  id: String(r.id),
  ano: Number(r.ano),
  categoria: r.categoria as CategoriaDespesa,
  area: String(r.area || ''),
  valorAnual: Number(r.valor_anual) || 0,
  meses: Array.isArray(r.meses) ? (r.meses as unknown[]).map((v) => Number(v) || 0) : [],
  observacoes: txt(r.observacoes),
});

export async function fetchOrcamentosDb(): Promise<Orcamento[] | null> {
  if (!supabase) return null;
  const data = await ler(bd().from('orcamentos').select('*').order('ano', { ascending: false }));
  return data ? (data as Linha[]).map(deOrcamento) : null;
}

/** Grava (cria ou atualiza) as linhas do orçamento numa chamada */
export async function salvarOrcamentosDb(linhas: Orcamento[]) {
  if (!supabase || linhas.length === 0) return;
  await checar(
    bd()
      .from('orcamentos')
      .upsert(
        linhas.map((o) => ({ id: o.id, ano: o.ano, categoria: o.categoria, area: o.area.trim(), meses: o.meses, observacoes: o.observacoes || null })),
        { onConflict: 'id' }
      )
      .select('id')
  );
}

export async function excluirOrcamentoDb(id: string) {
  if (!supabase) return;
  const data = await checar(bd().from('orcamentos').delete().eq('id', id).select('id'));
  if (!data || (data as unknown[]).length === 0) throw new DbError('Só o administrador exclui uma linha do orçamento.', '42501');
}

// -----------------------------------------------------------------------------
// Pedidos de compra
// -----------------------------------------------------------------------------
const deItem = (r: Linha): ItemPedido => ({
  id: String(r.id),
  tipo: r.tipo as TipoItemPedido,
  descricao: String(r.descricao || ''),
  categoriaAtivo: txt(r.categoria_ativo) as AssetCategory | undefined,
  marca: txt(r.marca),
  modelo: txt(r.modelo),
  especificacao: txt(r.especificacao),
  estoqueItemId: txt(r.estoque_item_id),
  licencaId: txt(r.licenca_id),
  quantidade: Number(r.quantidade) || 1,
  valorUnitario: num(r.valor_unitario),
  ordem: Number(r.ordem) || 0,
  link: txt(r.link),
  valorReferencia: num(r.valor_referencia),
  imagemUrl: txt(r.imagem_url),
});

const deCotacao = (r: Linha): CotacaoPedido => ({
  id: String(r.id),
  itemId: txt(r.item_id),
  fornecedorId: txt(r.fornecedor_id) || '',
  loja: txt(r.loja),
  link: txt(r.link),
  marca: txt(r.marca),
  modelo: txt(r.modelo),
  descricao: txt(r.descricao),
  imagemUrl: txt(r.imagem_url),
  criadoPor: txt(r.criado_por),
  valor: Number(r.valor) || 0,
  prazoDias: num(r.prazo_dias),
  validade: txt(r.validade),
  observacoes: txt(r.observacoes),
  arquivoCaminho: txt(r.arquivo_caminho),
  vencedora: !!r.vencedora,
});

const deEvento = (r: Linha): EventoPedido => ({
  de: txt(r.de) as StatusPedido | undefined,
  para: r.para as StatusPedido,
  motivo: txt(r.motivo),
  por: txt(r.por),
  porNome: txt(r.por_nome),
  campo: txt(r.campo),
  em: String(r.em),
});

const dePedido = (r: Linha, itens: ItemPedido[], cotacoes: CotacaoPedido[], eventos: EventoPedido[], semValores = false): PedidoCompra => ({
  id: String(r.id),
  codigo: String(r.codigo || ''),
  titulo: String(r.titulo || ''),
  justificativa: txt(r.justificativa),
  categoria: (r.categoria || 'hardware') as CategoriaDespesa,
  area: String(r.area || ''),
  status: r.status as StatusPedido,
  tipoPedido: (r.tipo_pedido || 'ti') as TipoPedido,
  solicitanteId: txt(r.solicitante_id),
  solicitanteNome: txt(r.solicitante_nome),
  gestorId: txt(r.gestor_id),
  gestorNome: txt(r.gestor_nome),
  destinoNome: txt(r.destino_nome),
  aprovadoGestorPor: txt(r.aprovado_gestor_por),
  aprovadoGestorEm: txt(r.aprovado_gestor_em),
  nfChave: txt(r.nf_chave),
  nfArquivo: txt(r.nf_arquivo),
  fornecedorTrocaMotivo: txt(r.fornecedor_troca_motivo),
  lojaCompra: txt(r.loja_compra),
  linkCompra: txt(r.link_compra),
  aprovadorId: txt(r.aprovador_id),
  aprovacaoForma: txt(r.aprovacao_forma) as FormaAprovacao | undefined,
  aprovacaoObs: txt(r.aprovacao_obs),
  colaboradorDestinoId: txt(r.colaborador_destino_id),
  chamadoId: txt(r.chamado_id),
  processoItemId: txt(r.processo_item_id),
  necessarioEm: txt(r.necessario_em),
  fornecedorId: txt(r.fornecedor_id),
  numeroNf: txt(r.numero_nf),
  dataCompra: txt(r.data_compra),
  vencimento: txt(r.vencimento),
  formaPagamento: txt(r.forma_pagamento) as FormaPagamento | undefined,
  valorFinal: num(r.valor_final),
  faturaId: txt(r.fatura_id),
  motivo: txt(r.motivo),
  aprovadoPor: txt(r.aprovado_por),
  aprovadoEm: txt(r.aprovado_em),
  recebidoPor: txt(r.recebido_por),
  recebidoEm: txt(r.recebido_em),
  criadoEm: String(r.criado_em),
  atualizadoEm: txt(r.atualizado_em),
  itens: itens.sort((a, b) => a.ordem - b.ordem),
  cotacoes,
  eventos: eventos.sort((a, b) => a.em.localeCompare(b.em)),
  semValores,
});

/** T.I.: a tabela completa (valores, cotações, histórico) */
export async function fetchPedidosDb(): Promise<PedidoCompra[] | null> {
  if (!supabase) return null;
  const [p, i, c, e] = await Promise.all([
    ler(bd().from('pedidos_compra').select('*').order('criado_em', { ascending: false })),
    ler(bd().from('pedido_itens').select('*')),
    ler(bd().from('pedido_cotacoes').select('*').order('criado_em')),
    ler(bd().from('pedido_eventos').select('*')),
  ]);
  if (!p) return null;
  const itens = ((i || []) as Linha[]).map((r) => ({ pedido: String(r.pedido_id), v: deItem(r) }));
  const cots = ((c || []) as Linha[]).map((r) => ({ pedido: String(r.pedido_id), v: deCotacao(r) }));
  const evs = ((e || []) as Linha[]).map((r) => ({ pedido: String(r.pedido_id), v: deEvento(r) }));
  return (p as Linha[]).map((r) =>
    dePedido(
      r,
      itens.filter((x) => x.pedido === r.id).map((x) => x.v),
      cots.filter((x) => x.pedido === r.id).map((x) => x.v),
      evs.filter((x) => x.pedido === r.id).map((x) => x.v)
    )
  );
}

/** Seção 13: quem não é T.I./Compras (e nomes para todos), pela função do banco, sem valores */
export async function fetchPedidosVisiveisDb(): Promise<PedidoCompra[] | null> {
  if (!supabase) return null;
  const data = await ler(bd().rpc('pedidos_visiveis'));
  if (!data) return null;
  return (data as Linha[]).map((r) => {
    const itens = (r.itens || []) as Linha[];
    // Opções: as de quem pediu (valor só para ele) e a escolhida
    const opcoes = itens.flatMap((x) => ((x.opcoes || []) as Linha[]).map((o) => deCotacao({ ...o, item_id: x.id })));
    return dePedido(r, itens.map((x, n) => deItem({ ...x, ordem: n })), opcoes, ((r.eventos || []) as Linha[]).map(deEvento), true);
  });
}

/** (Fase 11, mantida para compatibilidade) RH e gestor sem valores */
export async function fetchPedidosSolicitadosDb(): Promise<PedidoCompra[] | null> {
  if (!supabase) return null;
  const data = await ler(bd().rpc('pedidos_solicitados'));
  if (!data) return null;
  return (data as Linha[]).map((r) =>
    dePedido(r, ((r.itens || []) as Linha[]).map((x, n) => deItem({ ...x, ordem: n })), [], ((r.eventos || []) as Linha[]).map(deEvento), true)
  );
}

export async function podePedirCompraDb(): Promise<boolean> {
  if (!supabase) return false;
  const data = await ler(bd().rpc('pode_pedir_compra'));
  return data === true;
}

const linhaPedido = (p: PedidoCompra) => ({
  titulo: p.titulo.trim(),
  tipo_pedido: p.tipoPedido || 'ti',
  justificativa: p.justificativa?.trim() || null,
  categoria: p.categoria,
  area: p.area.trim(),
  colaborador_destino_id: p.colaboradorDestinoId || null,
  chamado_id: p.chamadoId || null,
  processo_item_id: p.processoItemId || null,
  necessario_em: p.necessarioEm || null,
});

const linhaItem = (pedidoId: string, i: ItemPedido) => ({
  id: i.id,
  pedido_id: pedidoId,
  tipo: i.tipo,
  descricao: i.descricao.trim(),
  categoria_ativo: i.tipo === 'equipamento' ? i.categoriaAtivo || 'hardware' : null,
  marca: i.marca?.trim() || null,
  modelo: i.modelo?.trim() || null,
  especificacao: i.especificacao?.trim() || null,
  estoque_item_id: i.tipo === 'acessorio' ? i.estoqueItemId || null : null,
  licenca_id: i.tipo === 'licenca' ? i.licencaId || null : null,
  quantidade: i.quantidade,
  valor_unitario: i.valorUnitario ?? null,
  ordem: i.ordem,
  link: i.link?.trim() || null,
  valor_referencia: i.valorReferencia ?? null,
  imagem_url: i.imagemUrl || null,
});

const linhaCotacao = (pedidoId: string, c: CotacaoPedido) => ({
  id: c.id,
  pedido_id: pedidoId,
  item_id: c.itemId || null,
  fornecedor_id: c.fornecedorId || null,
  loja: c.loja?.trim() || null,
  link: c.link?.trim() || null,
  marca: c.marca?.trim() || null,
  modelo: c.modelo?.trim() || null,
  descricao: c.descricao?.trim() || null,
  imagem_url: c.imagemUrl || null,
  valor: c.valor,
  prazo_dias: c.prazoDias ?? null,
  validade: c.validade || null,
  observacoes: c.observacoes?.trim() || null,
  arquivo_caminho: c.arquivoCaminho || null,
  vencedora: c.vencedora,
});

/**
 * T.I. grava o pedido (rascunho ou em aprovação): cabeçalho, itens e cotações.
 * Itens/cotações que saíram são excluídos. A vencedora é gravada por último
 * (o banco só aceita uma por pedido). Devolve o código gerado pelo banco.
 */
export async function salvarPedidoDb(p: PedidoCompra, novo: boolean): Promise<string | undefined> {
  if (!supabase) return undefined;
  let codigo: string | undefined;
  if (novo) {
    const data = await checar(bd().from('pedidos_compra').insert({ id: p.id, ...linhaPedido(p) }).select('codigo'));
    codigo = (data as Linha[])?.[0]?.codigo as string | undefined;
  } else {
    await atualizar('pedidos_compra', p.id, linhaPedido(p));
  }
  const idsItens = p.itens.map((i) => i.id);
  const idsCot = p.cotacoes.map((c) => c.id);
  await checar(bd().from('pedido_itens').delete().eq('pedido_id', p.id).not('id', 'in', `(${idsItens.map((x) => `"${x}"`).join(',') || '""'})`));
  await checar(bd().from('pedido_cotacoes').delete().eq('pedido_id', p.id).not('id', 'in', `(${idsCot.map((x) => `"${x}"`).join(',') || '""'})`));
  if (p.itens.length) await checar(bd().from('pedido_itens').upsert(p.itens.map((i) => linhaItem(p.id, i)), { onConflict: 'id' }));
  if (p.cotacoes.length) {
    // Primeiro todas sem vencedora; depois marca a escolhida (índice único por pedido)
    await checar(bd().from('pedido_cotacoes').upsert(p.cotacoes.map((c) => ({ ...linhaCotacao(p.id, c), vencedora: false })), { onConflict: 'id' }));
    // Uma escolhida por item (e a do pedido inteiro, nas cotações antigas)
    for (const v of p.cotacoes.filter((c) => c.vencedora)) await atualizar('pedido_cotacoes', v.id, { vencedora: true });
  }
  return codigo;
}

export async function solicitarCompraDb(p: PedidoCompra): Promise<string | undefined> {
  if (!supabase) return undefined;
  const data = await checar(
    bd().rpc('solicitar_compra', {
      p_pedido: {
        titulo: p.titulo,
        justificativa: p.justificativa,
        categoria: p.categoria,
        area: p.area,
        colaborador_destino_id: p.colaboradorDestinoId,
        chamado_id: p.chamadoId,
        processo_item_id: p.processoItemId,
        necessario_em: p.necessarioEm,
        tipo_pedido: p.tipoPedido || 'ti',
      },
      p_itens: p.itens.map((i) => ({
        tipo: i.tipo,
        descricao: i.descricao,
        categoria_ativo: i.categoriaAtivo,
        especificacao: i.especificacao,
        quantidade: i.quantidade,
        marca: i.marca,
        modelo: i.modelo,
        link: i.link,
        valor_referencia: i.valorReferencia,
        imagem_url: i.imagemUrl,
        opcoes: p.cotacoes
          .filter((c) => c.itemId === i.id)
          .map((c) => ({ link: c.link, loja: c.loja, marca: c.marca, modelo: c.modelo, descricao: c.descricao, valor: c.valor, observacoes: c.observacoes, imagem_url: c.imagemUrl })),
      })),
    })
  );
  return data as string;
}

/** Seção 15: registra quem aprovou e como (a opção escolhida vira o produto do item) */
export async function aprovarPedidoDb(id: string, aprovadorId: string, forma: FormaAprovacao, obs?: string) {
  if (!supabase) return;
  await checar(bd().rpc('aprovar_pedido', { p_pedido: id, p_aprovador: aprovadorId, p_forma: forma, p_obs: obs || null }));
}

/** Nomes para escolher "Aprovado por" (T.I. e Compras) */
export async function fetchPessoasAprovacaoDb(): Promise<{ id: string; nome: string; cargo?: string }[] | null> {
  if (!supabase) return null;
  const data = await ler(bd().rpc('pessoas_para_aprovacao'));
  return data ? (data as Linha[]).map((r) => ({ id: String(r.id), nome: String(r.nome), cargo: txt(r.cargo) })) : null;
}

export async function mudarStatusPedidoDb(id: string, acao: 'enviar' | 'devolver' | 'aprovar' | 'recusar' | 'cancelar', motivo?: string) {
  if (!supabase) return;
  await checar(bd().rpc('mudar_status_pedido', { p_pedido: id, p_acao: acao, p_motivo: motivo || null }));
}

export interface DadosCompra {
  fornecedorId: string;
  numeroNf?: string;
  dataCompra: string;
  vencimento: string;
  formaPagamento?: FormaPagamento;
  /** Seção 13: chave (44 dígitos) e arquivo da NF; motivo quando o fornecedor não é o sugerido pela T.I. */
  nfChave?: string;
  nfArquivo?: string;
  motivoTroca?: string;
  /** Seção 16: compra fora do cadastro */
  loja?: string;
  link?: string;
  itens: { id: string; valorUnitario: number }[];
}

export async function registrarCompraDb(id: string, d: DadosCompra): Promise<string | undefined> {
  if (!supabase) return undefined;
  const data = await checar(
    bd().rpc('registrar_compra_pedido', {
      p_pedido: id,
      p_dados: {
        fornecedor_id: d.fornecedorId || '',
        numero_nf: d.numeroNf || '',
        data_compra: d.dataCompra,
        vencimento: d.vencimento,
        forma_pagamento: d.formaPagamento || '',
        nf_chave: d.nfChave || '',
        nf_arquivo: d.nfArquivo || '',
        motivo_troca: d.motivoTroca || '',
        loja: d.loja || '',
        link: d.link || '',
        itens: d.itens.map((i) => ({ id: i.id, valor_unitario: i.valorUnitario })),
      },
    })
  );
  return data as string;
}

export interface DadosRecebimento {
  localizacao: string;
  ativos: { itemId: string; tag: string; serial?: string; marca?: string; modelo?: string }[];
  /** Seção 14: acessórios sem item de estoque que viram item novo */
  criarEstoque?: string[];
}

export async function receberPedidoDb(id: string, d: DadosRecebimento) {
  if (!supabase) return;
  await checar(
    bd().rpc('receber_pedido', {
      p_pedido: id,
      p_dados: {
        localizacao: d.localizacao,
        criar_estoque: d.criarEstoque || [],
        ativos: d.ativos.map((a) => ({ item_id: a.itemId, tag: a.tag, serial_number: a.serial || '', marca: a.marca || '', modelo: a.modelo || '' })),
      },
    })
  );
}

// -----------------------------------------------------------------------------
// Inventário físico
// -----------------------------------------------------------------------------
const deItemInventario = (r: Linha): ItemInventario => ({
  id: String(r.id),
  ativoId: String(r.ativo_id),
  localEsperado: txt(r.local_esperado),
  situacao: r.situacao as SituacaoConferencia,
  localEncontrado: txt(r.local_encontrado),
  viaQr: !!r.via_qr,
  observacao: txt(r.observacao),
  conferidoPor: txt(r.conferido_por),
  conferidoEm: txt(r.conferido_em),
});

export async function fetchInventariosDb(): Promise<InventarioFisico[] | null> {
  if (!supabase) return null;
  const [inv, itens] = await Promise.all([
    ler(bd().from('inventarios_fisicos').select('*').order('criado_em', { ascending: false })),
    ler(bd().from('inventario_itens').select('*')),
  ]);
  if (!inv) return null;
  const todos = ((itens || []) as Linha[]).map((r) => ({ inv: String(r.inventario_id), v: deItemInventario(r) }));
  return (inv as Linha[]).map((r) => ({
    id: String(r.id),
    titulo: String(r.titulo),
    local: String(r.local || ''),
    unidadeId: txt(r.unidade_id),
    status: r.status as InventarioFisico['status'],
    observacoes: txt(r.observacoes),
    resumo: (r.resumo || undefined) as InventarioFisico['resumo'],
    criadoPor: txt(r.criado_por),
    criadoEm: String(r.criado_em),
    fechadoPor: txt(r.fechado_por),
    fechadoEm: txt(r.fechado_em),
    itens: todos.filter((x) => x.inv === r.id).map((x) => x.v),
  }));
}

export async function abrirInventarioDb(titulo: string, local: string, unidadeId?: string): Promise<string | undefined> {
  if (!supabase) return undefined;
  const data = await checar(bd().rpc('abrir_inventario', { p_titulo: titulo, p_local: local, p_unidade: unidadeId || null }));
  return data as string;
}

export async function conferirItemDb(item: ItemInventario) {
  await atualizar('inventario_itens', item.id, {
    situacao: item.situacao,
    local_encontrado: item.situacao === 'outro_local' ? item.localEncontrado?.trim() || null : null,
    via_qr: item.viaQr,
    observacao: item.observacao?.trim() || null,
  });
}

/** Equipamento achado na conferência que não estava na lista (lido pelo QR, por exemplo) */
export async function incluirItemInventarioDb(inventarioId: string, item: ItemInventario) {
  if (!supabase) return;
  await checar(
    bd()
      .from('inventario_itens')
      .insert({
        id: item.id,
        inventario_id: inventarioId,
        ativo_id: item.ativoId,
        local_esperado: item.localEsperado || null,
        situacao: item.situacao,
        local_encontrado: item.localEncontrado || null,
        via_qr: item.viaQr,
      })
      .select('id')
  );
}

export async function fecharInventarioDb(id: string, atualizarLocais: boolean): Promise<InventarioFisico['resumo']> {
  if (!supabase) return undefined;
  const data = await checar(bd().rpc('fechar_inventario', { p_id: id, p_atualizar_locais: atualizarLocais }));
  return data as InventarioFisico['resumo'];
}

export async function cancelarInventarioDb(id: string, motivo: string) {
  await atualizar('inventarios_fisicos', id, { status: 'cancelado', observacoes: motivo });
}

// -----------------------------------------------------------------------------
// Seção 13 · Conversa do pedido
// -----------------------------------------------------------------------------
export async function fetchMensagensPedidoDb(pedidoId: string): Promise<MensagemPedido[] | null> {
  if (!supabase) return null;
  const data = await ler(bd().from('pedido_mensagens').select('*').eq('pedido_id', pedidoId).order('criado_em'));
  if (!data) return null;
  return (data as Linha[]).map((r) => ({
    id: String(r.id),
    pedidoId: String(r.pedido_id),
    autorId: txt(r.autor_id),
    texto: String(r.texto || ''),
    interna: !!r.interna,
    anexoCaminho: txt(r.anexo_caminho),
    criadoEm: String(r.criado_em),
  }));
}

export async function enviarMensagemPedidoDb(m: MensagemPedido) {
  if (!supabase) return;
  await checar(
    bd()
      .from('pedido_mensagens')
      .insert({ id: m.id, pedido_id: m.pedidoId, texto: m.texto.trim(), interna: m.interna, anexo_caminho: m.anexoCaminho || null })
      .select('id')
  );
}
// -----------------------------------------------------------------------------
// Seção 14 · Dados do produto pelo link (função no servidor; a página não lê a loja)
// -----------------------------------------------------------------------------
export interface DadosDoLink {
  nome?: string;
  marca?: string;
  modelo?: string;
  preco?: number;
  imagem?: string;
  loja?: string;
}

export async function lerDadosDoLinkDb(url: string): Promise<{ dados?: DadosDoLink; erro?: string }> {
  if (!supabase) return { erro: 'No modo demonstração a busca pelo link não está disponível: preencha à mão.' };
  const { data, error } = await supabase.functions.invoke('dados-do-link', { body: { url } });
  if (error) return { erro: 'Não foi possível ler este link agora. Preencha à mão.' };
  const r = data as { dados?: DadosDoLink; achou?: boolean; erro?: string };
  if (r?.erro) return { erro: r.erro };
  if (!r?.achou) return { erro: 'A loja não publica os dados do produto nesta página. Preencha à mão.' };
  return { dados: r.dados };
}