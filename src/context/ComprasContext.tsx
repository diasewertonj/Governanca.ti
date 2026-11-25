/**
 * Fase 11 + seção 13 · Orçamento, pedidos de compra e inventário físico.
 * Fluxo: qualquer colaborador pede → T.I. cota (pedido "T.I.") → gestor de quem pediu
 * aprova (se houver) → Compras ou admin da T.I. aprova → Compras compra (NF) → T.I.
 * recebe (Compras recebe pedido "Outros"). T.I. e Compras leem tudo; os demais, pela
 * função pedidos_visiveis() (sem valores). Gravações esperam o banco e devolvem a
 * mensagem de erro ou null. Modo demonstração: dados de exemplo só em memória.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useApp } from './AppContext.tsx';
import { useRecursos } from './RecursosContext.tsx';
import { isSupabaseConfigured } from '../services/supabase.ts';
import { mensagemDeErro, enviarAnexoPedidoDb } from '../services/supabaseDb.ts';
import {
  abrirInventarioDb,
  cancelarInventarioDb,
  conferirItemDb,
  enviarMensagemPedidoDb,
  excluirOrcamentoDb,
  fecharInventarioDb,
  fetchInventariosDb,
  fetchMensagensPedidoDb,
  fetchOrcamentosDb,
  fetchPedidosDb,
  fetchPedidosVisiveisDb,
  incluirItemInventarioDb,
  souGestorDb,
  mudarStatusPedidoDb,
  receberPedidoDb,
  registrarCompraDb,
  salvarOrcamentosDb,
  salvarPedidoDb,
  solicitarCompraDb,
  lerDadosDoLinkDb,
  aprovarPedidoDb,
  fetchPessoasAprovacaoDb,
  type DadosDoLink,
  type DadosCompra,
  type DadosRecebimento,
} from '../services/comprasDb.ts';
import type { Employee, EventoPedido, FormaAprovacao, InventarioFisico, ItemInventario, MensagemPedido, Orcamento, PedidoCompra, StatusPedido } from '../types/index.ts';
import { distribuirMensal, opcaoEscolhida } from '../utils/compras.ts';
import { DEMO_PEDIDOS_EXTRA } from '../data/demoExtra.ts';

export type AcaoPedido = 'enviar' | 'devolver' | 'aprovar' | 'recusar' | 'cancelar';

interface ComprasContextType {
  orcamentos: Orcamento[];
  pedidos: PedidoCompra[];
  inventarios: InventarioFisico[];
  /** Qualquer colaborador ativo pede compra (seção 13) */
  podePedirCompra: boolean;
  /** Seção 17 (decisão 10): tem equipe (vê os custos da própria área) */
  ehGestor: boolean;
  /** T.I. ou Compras: leem tudo, com valores */
  equipeCompras: boolean;
  mensagens: Record<string, MensagemPedido[]>;
  carregarMensagens: (pedidoId: string) => Promise<void>;
  enviarMensagem: (pedidoId: string, texto: string, interna: boolean, arquivo?: File) => Promise<string | null>;
  salvarOrcamentos: (linhas: Orcamento[]) => Promise<string | null>;
  excluirOrcamento: (id: string) => Promise<string | null>;
  salvarPedido: (p: PedidoCompra, enviar?: boolean) => Promise<{ item?: PedidoCompra; erro?: string }>;
  solicitarCompra: (p: PedidoCompra) => Promise<{ item?: PedidoCompra; erro?: string }>;
  mudarStatusPedido: (id: string, acao: AcaoPedido, motivo?: string) => Promise<string | null>;
  registrarCompra: (id: string, dados: DadosCompra) => Promise<string | null>;
  receberPedido: (id: string, dados: DadosRecebimento) => Promise<string | null>;
  anexarCotacao: (pedidoId: string, arquivo: File) => Promise<{ caminho?: string; erro?: string }>;
  abrirInventario: (titulo: string, local: string, unidadeId?: string) => Promise<{ id?: string; erro?: string }>;
  conferirItem: (inventarioId: string, item: ItemInventario) => Promise<string | null>;
  incluirItemInventario: (inventarioId: string, item: Omit<ItemInventario, 'id'>) => Promise<string | null>;
  fecharInventario: (id: string, atualizarLocais: boolean) => Promise<{ resumo?: InventarioFisico['resumo']; erro?: string }>;
  cancelarInventario: (id: string, motivo: string) => Promise<string | null>;
  recarregarCompras: () => Promise<void>;
  /** Seção 14: dados públicos do produto pelo link (função no servidor) */
  lerDadosDoLink: (url: string) => Promise<{ dados?: DadosDoLink; erro?: string }>;
  registrarAprovacao: (id: string, aprovadorId: string, forma: FormaAprovacao, obs?: string) => Promise<string | null>;
  /** Quem pode constar como "Aprovado por" (T.I. e Compras) */
  pessoasAprovacao: { id: string; nome: string; cargo?: string }[];
}

const ComprasContext = createContext<ComprasContextType | undefined>(undefined);
const novoId = (prefixo: string) => `${prefixo}-${crypto.randomUUID()}`;
const agoraIso = () => new Date().toISOString();
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Gestor de quem pede: ativo e diferente da própria pessoa (o banco faz igual) */
const gestorDe = (pessoas: Employee[], id?: string) => {
  const p = pessoas.find((e) => e.id === id);
  const g = pessoas.find((e) => e.id === p?.gestorId && e.status !== 'desligado');
  return g && g.id !== id ? g.id : undefined;
};

// -----------------------------------------------------------------------------
// Demonstração (ano corrente)
// -----------------------------------------------------------------------------
const ANO = new Date().getFullYear();
const DEMO_ORCAMENTOS: Orcamento[] = [
  { id: 'orc-1', ano: ANO, categoria: 'hardware', area: 'Tecnologia da Informação', valorAnual: 36000, meses: distribuirMensal(36000) },
  { id: 'orc-2', ano: ANO, categoria: 'software', area: '', valorAnual: 9000, meses: distribuirMensal(9000) },
  { id: 'orc-3', ano: ANO, categoria: 'telefonia', area: '', valorAnual: 1500, meses: distribuirMensal(1500) },
  { id: 'orc-4', ano: ANO - 1, categoria: 'hardware', area: 'Tecnologia da Informação', valorAnual: 30000, meses: distribuirMensal(30000) },
  { id: 'orc-5', ano: ANO - 1, categoria: 'software', area: '', valorAnual: 8000, meses: distribuirMensal(8000) },
];
const ev = (para: StatusPedido, dias: number, por: string, de?: StatusPedido, motivo?: string): EventoPedido => ({
  de,
  para,
  por,
  motivo,
  em: new Date(Date.now() - dias * 86400000).toISOString(),
});
const DEMO_PEDIDOS: PedidoCompra[] = [
  {
    id: 'ped-1',
    codigo: `PC-${ANO}-0001`,
    titulo: 'Notebook para nova analista de RH',
    justificativa: 'Admissão prevista para o próximo mês; não há notebook disponível no estoque.',
    categoria: 'hardware',
    area: 'Recursos Humanos',
    status: 'em_cotacao',
    tipoPedido: 'ti',
    solicitanteId: 'emp-2',
    necessarioEm: `${ANO}-12-15`,
    criadoEm: new Date(Date.now() - 3 * 86400000).toISOString(),
    itens: [{ id: 'pit-1', tipo: 'equipamento', descricao: 'Notebook 14" i5 16 GB', categoriaAtivo: 'hardware', quantidade: 1, valorUnitario: 5200, ordem: 1 }],
    cotacoes: [
      { id: 'cot-1', itemId: 'pit-1', fornecedorId: 'forn-1', link: 'https://www.dell.com/pt-br/shop/notebooks', marca: 'Dell', modelo: 'Latitude 3450', valor: 5190, prazoDias: 10, vencedora: true },
      { id: 'cot-2', itemId: 'pit-1', fornecedorId: 'forn-2', loja: 'Lenovo', link: 'https://www.lenovo.com/br/pt/', marca: 'Lenovo', modelo: 'ThinkPad E14', valor: 5480, prazoDias: 5, vencedora: false },
    ],
    eventos: [ev('em_cotacao', 4, 'emp-2')],
  },
  {
    id: 'ped-2',
    codigo: `PC-${ANO}-0002`,
    titulo: 'Monitores para o time de Engenharia',
    justificativa: 'Segunda tela para os desenvolvedores novos.',
    categoria: 'hardware',
    area: 'Tecnologia da Informação',
    status: 'aprovado',
    tipoPedido: 'ti',
    solicitanteId: 'emp-7',
    gestorId: 'emp-1',
    aprovadoGestorPor: 'emp-1',
    aprovadoGestorEm: new Date(Date.now() - 2 * 86400000).toISOString(),
    fornecedorId: 'forn-1',
    aprovadoPor: 'emp-7',
    aprovadorId: 'emp-1',
    aprovacaoForma: 'pessoalmente',
    aprovadoEm: new Date(Date.now() - 1 * 86400000).toISOString(),
    criadoEm: new Date(Date.now() - 6 * 86400000).toISOString(),
    itens: [{ id: 'pit-2', tipo: 'equipamento', descricao: 'Monitor 24" Full HD', categoriaAtivo: 'periferico', marca: 'Dell', modelo: 'P2422H', quantidade: 2, valorUnitario: 1100, ordem: 1 }],
    cotacoes: [{ id: 'cot-3', itemId: 'pit-2', fornecedorId: 'forn-1', marca: 'Dell', modelo: 'P2422H', valor: 1075, prazoDias: 7, vencedora: true }],
    eventos: [ev('rascunho', 6, 'emp-7'), ev('aguardando', 5, 'emp-7', 'rascunho'), ev('em_cotacao', 5, 'emp-7', 'rascunho'), ev('aprovado', 1, 'emp-7', 'em_cotacao', 'Aprovado por Carlos Eduardo Mendes (pessoalmente)')],
  },
  {
    id: 'ped-3',
    codigo: `PC-${ANO}-0003`,
    titulo: 'Mouses para o estoque',
    justificativa: 'Estoque abaixo do mínimo.',
    categoria: 'hardware',
    area: 'Tecnologia da Informação',
    status: 'rascunho',
    tipoPedido: 'ti',
    solicitanteId: 'emp-7',
    gestorId: 'emp-1',
    criadoEm: new Date(Date.now() - 1 * 86400000).toISOString(),
    itens: [{ id: 'pit-3', tipo: 'acessorio', descricao: 'Mouse USB Logitech M90', estoqueItemId: 'est-2', quantidade: 10, valorUnitario: 45, ordem: 1 }],
    cotacoes: [],
    eventos: [ev('rascunho', 1, 'emp-7')],
  },
  {
    id: 'ped-4',
    codigo: `PC-${ANO}-0004`,
    titulo: 'Headset para reuniões',
    justificativa: 'O atual parou de funcionar o microfone.',
    categoria: 'hardware',
    area: 'Engenharia de Software & Produto',
    status: 'em_cotacao',
    tipoPedido: 'ti',
    solicitanteId: 'emp-3',
    gestorId: 'emp-4',
    criadoEm: new Date(Date.now() - 2 * 86400000).toISOString(),
    itens: [{ id: 'pit-4', tipo: 'equipamento', descricao: 'Headset USB-C com cancelamento de ruído', categoriaAtivo: 'periferico', quantidade: 1, valorUnitario: 420, ordem: 1 }],
    cotacoes: [{ id: 'cot-4', itemId: 'pit-4', fornecedorId: 'forn-1', marca: 'Jabra', modelo: 'Evolve2 30', valor: 420, prazoDias: 5, vencedora: true }],
    eventos: [ev('em_cotacao', 2, 'emp-3')],
  },
  {
    id: 'ped-5',
    codigo: `PC-${ANO}-0005`,
    titulo: 'Dock USB-C para o notebook',
    justificativa: 'Ligar dois monitores na mesa.',
    categoria: 'hardware',
    area: 'Engenharia de Software & Produto',
    status: 'em_cotacao',
    tipoPedido: 'ti',
    solicitanteId: 'emp-3',
    gestorId: 'emp-4',
    criadoEm: new Date(Date.now() - 1 * 86400000).toISOString(),
    itens: [{ id: 'pit-5', tipo: 'equipamento', descricao: 'Dock USB-C', categoriaAtivo: 'periferico', quantidade: 1, ordem: 1, marca: 'Dell', modelo: 'WD19S', link: 'https://www.kabum.com.br/busca/dock-dell-wd19s', valorReferencia: 1350 }],
    cotacoes: [{ id: 'cot-5', itemId: 'pit-5', fornecedorId: '', loja: 'Amazon', link: 'https://www.amazon.com.br/s?k=dock+usb-c', marca: 'Baseus', modelo: 'Dock 11 em 1', valor: 420, vencedora: false, criadoPor: 'emp-3' }],
    eventos: [ev('em_cotacao', 1, 'emp-3')],
  },
  {
    id: 'ped-6',
    codigo: `PC-${ANO}-0006`,
    titulo: 'Cadeiras para a sala de reunião',
    justificativa: 'Sala nova do 14º andar.',
    categoria: 'outros',
    area: 'Recursos Humanos',
    status: 'em_cotacao',
    tipoPedido: 'outros',
    solicitanteId: 'emp-2',
    criadoEm: new Date(Date.now() - 1 * 86400000).toISOString(),
    itens: [{ id: 'pit-6', tipo: 'servico', descricao: 'Cadeira ergonômica', quantidade: 6, ordem: 1 }],
    cotacoes: [],
    eventos: [ev('em_cotacao', 1, 'emp-2')],
  },
];
const DEMO_MENSAGENS: Record<string, MensagemPedido[]> = {
  'ped-4': [
    { id: 'msg-1', pedidoId: 'ped-4', autorId: 'emp-3', texto: 'Pode ser sem fio?', interna: false, criadoEm: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: 'msg-2', pedidoId: 'ped-4', autorId: 'emp-7', texto: 'Cotamos com fio USB-C: o sem fio custa o dobro.', interna: false, criadoEm: new Date(Date.now() - 1 * 86400000).toISOString() },
    { id: 'msg-3', pedidoId: 'ped-4', autorId: 'emp-7', texto: 'Fornecedor 2 não tem em estoque.', interna: true, criadoEm: new Date(Date.now() - 1 * 86400000).toISOString() },
  ],
};
const DEMO_INVENTARIOS: InventarioFisico[] = [
  {
    id: 'inv-1',
    titulo: 'Conferência do almoxarifado (semestral)',
    local: 'Almoxarifado T.I. - Armário B3 / Prateleira 2',
    status: 'fechado',
    criadoPor: 'emp-7',
    criadoEm: new Date(Date.now() - 40 * 86400000).toISOString(),
    fechadoPor: 'emp-7',
    fechadoEm: new Date(Date.now() - 39 * 86400000).toISOString(),
    resumo: { total: 1, encontrados: 1, nao_encontrados: 0, outro_local: 0, via_qr: 1, locais_atualizados: false },
    itens: [{ id: 'ii-1', ativoId: 'ast-7', localEsperado: 'Almoxarifado T.I. - Armário B3 / Prateleira 2', situacao: 'encontrado', viaQr: true, conferidoPor: 'emp-7', conferidoEm: new Date(Date.now() - 39 * 86400000).toISOString() }],
  },
];

export const ComprasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const app = useApp();
  const { currentRole, currentUser, employees, assets, licenses, fornecedores } = app;
  const { estoque, movimentarEstoque, recarregarRecursos, salvarItemEstoque } = useRecursos();
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const isAdmin = currentRole === 'ti_admin';
  const isCompras = currentRole === 'compras';
  const equipe = isTI || isCompras;
  const demo = !isSupabaseConfigured;
  const eu = currentUser?.id;

  const [orcamentos, setOrcamentos] = useState<Orcamento[]>(demo ? DEMO_ORCAMENTOS : []);
  const [pedidosTodos, setPedidos] = useState<PedidoCompra[]>(demo ? [...DEMO_PEDIDOS, ...DEMO_PEDIDOS_EXTRA] : []);
  const [inventarios, setInventarios] = useState<InventarioFisico[]>(demo ? DEMO_INVENTARIOS : []);
  const [mensagens, setMensagens] = useState<Record<string, MensagemPedido[]>>(demo ? DEMO_MENSAGENS : {});
  const podePedirCompra = !!currentUser;
  // Produção: a função do banco (a RLS só mostra ao colaborador a própria linha); demonstração: a lista local
  const [gestorBanco, setGestorBanco] = useState<boolean | null>(null);
  useEffect(() => {
    if (demo || !eu) return;
    let vivo = true;
    souGestorDb().then((v) => {
      if (vivo) setGestorBanco(v);
    });
    return () => {
      vivo = false;
    };
  }, [demo, eu]);
  const ehGestor = useMemo(
    () => !!eu && (gestorBanco === true || employees.some((e) => e.gestorId === eu && e.id !== eu && e.status !== 'desligado') || pedidosTodos.some((p) => p.gestorId === eu)),
    [eu, employees, pedidosTodos, gestorBanco]
  );
  const [pessoasBanco, setPessoasBanco] = useState<{ id: string; nome: string; cargo?: string }[]>([]);
  // Demonstração e T.I.: o cadastro; Compras (produção): pela função do banco
  const pessoasAprovacao = useMemo(
    () => (pessoasBanco.length ? pessoasBanco : employees.filter((e) => e.status !== 'desligado').map((e) => ({ id: e.id, nome: e.nome, cargo: e.cargo }))),
    [pessoasBanco, employees]
  );
  useEffect(() => {
    if (demo || !equipe) return;
    let vivo = true;
    fetchPessoasAprovacaoDb().then((l) => {
      if (vivo && l) setPessoasBanco(l);
    });
    return () => {
      vivo = false;
    };
  }, [demo, equipe]);

  const nomeDe = useCallback((id?: string) => employees.find((e) => e.id === id)?.nome, [employees]);

  // Equipe vê tudo; os demais, o que o banco mostraria (sem valores)
  const pedidos = useMemo(() => {
    const comNomes = pedidosTodos.map((p) => ({
      ...p,
      solicitanteNome: p.solicitanteNome || nomeDe(p.solicitanteId),
      gestorNome: p.gestorNome || nomeDe(p.gestorId),
      destinoNome: p.destinoNome || nomeDe(p.colaboradorDestinoId),
    }));
    if (equipe || !demo) return comNomes;
    return comNomes
      .filter((p) => p.solicitanteId === eu || (!!eu && p.gestorId === eu) || (currentRole === 'rh' && p.status !== 'rascunho'))
      .map((p) => ({
        ...p,
        semValores: true,
        // Opções de quem pediu (valor só para ele) e a escolhida
        cotacoes: p.cotacoes
          .filter((c) => c.itemId && (c.criadoPor === p.solicitanteId || c.vencedora))
          .map((c) => ({ ...c, valor: c.criadoPor === eu ? c.valor : 0, fornecedorId: '' })),
        fornecedorId: undefined,
        valorFinal: undefined,
        itens: p.itens.map((i) => ({ ...i, valorUnitario: undefined, valorReferencia: p.solicitanteId === eu ? i.valorReferencia : undefined })),
      }));
  }, [pedidosTodos, equipe, demo, currentRole, eu, nomeDe]);

  const buscar = useCallback(async () => {
    if (demo || !currentUser) return null;
    if (equipe) {
      const [o, p, i, nomes] = await Promise.all([fetchOrcamentosDb(), fetchPedidosDb(), isTI ? fetchInventariosDb() : Promise.resolve(null), fetchPedidosVisiveisDb()]);
      // Nomes de quem pediu e do gestor vêm da função (Compras não lê o cadastro de pessoas)
      const comNomes = p?.map((x) => {
        const n = nomes?.find((y) => y.id === x.id);
        return n ? { ...x, solicitanteNome: n.solicitanteNome, gestorNome: n.gestorNome, destinoNome: n.destinoNome, eventos: n.eventos.length ? n.eventos : x.eventos } : x;
      });
      return { o, p: comNomes || null, i };
    }
    return { o: null, p: await fetchPedidosVisiveisDb(), i: null };
  }, [demo, equipe, isTI, currentUser]);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof buscar>>) => {
    if (!r) return;
    if (r.o) setOrcamentos(r.o);
    if (r.p) setPedidos(r.p);
    if (r.i) setInventarios(r.i);
  }, []);

  const recarregarCompras = async () => aplicar(await buscar());

  useEffect(() => {
    let vivo = true;
    buscar().then((r) => {
      if (vivo) aplicar(r);
    });
    return () => {
      vivo = false;
    };
  }, [buscar, aplicar]);

  // Seção 27: orçamento do ano (alertas e impacto do pedido) saiu daqui — vem de useOrcamentoAtual (gestao/useGestao.ts),
  // a mesma conta do Acompanhamento e do Painel executivo

  const noBanco = async (op: () => Promise<unknown>): Promise<string | null> => {
    try {
      await op();
      return null;
    } catch (err) {
      console.error(err);
      return mensagemDeErro(err);
    }
  };

  // Demonstração: muda a situação e registra o histórico
  const mudarLocal = (id: string, para: StatusPedido, extra: Partial<PedidoCompra> = {}, motivo?: string, de?: StatusPedido) =>
    setPedidos((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, ...extra, status: para, atualizadoEm: agoraIso(), eventos: [...p.eventos, { de: de ?? p.status, para, motivo, por: eu, em: agoraIso() }] } : p
      )
    );

  // ---------------------------------------------------------------------------
  // Conversa
  // ---------------------------------------------------------------------------
  const carregarMensagens: ComprasContextType['carregarMensagens'] = async (pedidoId) => {
    if (demo) return;
    const lista = await fetchMensagensPedidoDb(pedidoId);
    if (lista) setMensagens((prev) => ({ ...prev, [pedidoId]: lista }));
  };

  const enviarMensagem: ComprasContextType['enviarMensagem'] = async (pedidoId, texto, interna, arquivo) => {
    if (!texto.trim()) return 'Escreva a mensagem.';
    if (interna && !equipe) return 'Só T.I. e Compras escrevem nota interna.';
    let anexoCaminho: string | undefined;
    if (arquivo) {
      if (!equipe) return 'Só T.I. e Compras anexam arquivos na conversa.';
      try {
        anexoCaminho = await enviarAnexoPedidoDb(pedidoId, arquivo);
      } catch (err) {
        return mensagemDeErro(err);
      }
    }
    const m: MensagemPedido = { id: novoId('pmsg'), pedidoId, autorId: eu, texto: texto.trim(), interna, anexoCaminho, criadoEm: agoraIso() };
    const erro = await noBanco(() => enviarMensagemPedidoDb(m));
    if (erro) return erro;
    setMensagens((prev) => ({ ...prev, [pedidoId]: [...(prev[pedidoId] || []), m] }));
    return null;
  };

  // ---------------------------------------------------------------------------
  // Orçamento
  // ---------------------------------------------------------------------------
  const salvarOrcamentos: ComprasContextType['salvarOrcamentos'] = async (linhas) => {
    if (!isAdmin) return 'Só o administrador edita o orçamento.';
    const chaves = new Set<string>();
    for (const l of linhas) {
      const chave = `${l.ano}|${l.categoria}|${l.area.trim().toLowerCase()}`;
      if (chaves.has(chave)) return 'Há duas linhas com a mesma categoria e área no mesmo ano.';
      chaves.add(chave);
      if (l.meses.some((v) => !(v >= 0))) return 'Os valores mensais não podem ser negativos.';
    }
    const erro = await noBanco(() => salvarOrcamentosDb(linhas));
    if (erro) return erro;
    setOrcamentos((prev) => {
      const ids = new Set(linhas.map((l) => l.id));
      return [...prev.filter((o) => !ids.has(o.id)), ...linhas.map((l) => ({ ...l, area: l.area.trim(), valorAnual: l.meses.reduce((s, v) => s + v, 0) }))];
    });
    return null;
  };

  const excluirOrcamento: ComprasContextType['excluirOrcamento'] = async (id) => {
    if (!isAdmin) return 'Só o administrador edita o orçamento.';
    const erro = await noBanco(() => excluirOrcamentoDb(id));
    if (erro) return erro;
    setOrcamentos((prev) => prev.filter((o) => o.id !== id));
    return null;
  };

  // ---------------------------------------------------------------------------
  // Pedidos
  // ---------------------------------------------------------------------------
  const validarPedido = (p: PedidoCompra): string | null => {
    if (p.titulo.trim().length < 3) return 'Diga o que precisa ser comprado.';
    if (p.itens.length === 0) return 'Inclua pelo menos um item.';
    for (const i of p.itens) {
      if (!i.descricao.trim()) return 'Descreva cada item.';
      if (!Number.isInteger(i.quantidade) || i.quantidade < 1) return `Quantidade inválida em "${i.descricao}".`;
      if (i.tipo === 'acessorio' && !i.estoqueItemId && !p.semValores) return `Escolha o acessório do estoque em "${i.descricao}".`;
    }
    // Seção 14: opções por item (até 10, nenhuma obrigatória); cada uma com loja, fornecedor ou link (regra do banco)
    for (const i of p.itens) {
      const ops = p.cotacoes.filter((c) => c.itemId === i.id);
      if (ops.length > 10) return `"${i.descricao}" tem mais de 10 opções.`;
      if (ops.filter((c) => c.vencedora).length > 1) return `Só uma opção pode ser a escolhida em "${i.descricao}".`;
    }
    if (p.cotacoes.some((c) => !c.fornecedorId && !(c.loja || '').trim() && !(c.link || '').trim()))
      return 'Em cada opção, informe a loja, o fornecedor ou o link.';
    if (p.cotacoes.some((c) => c.link && !/^https?:\/\//i.test(c.link.trim()))) return 'O link da opção precisa começar com https://';
    if (p.itens.some((i) => i.link && !/^https?:\/\//i.test(i.link.trim()))) return 'O link do produto precisa começar com https://';
    const gerais = p.cotacoes.filter((c) => !c.itemId);
    if (gerais.length > 3) return 'Cada pedido tem no máximo 3 cotações do pedido inteiro.';
    if (gerais.filter((c) => c.vencedora).length > 1) return 'Só uma cotação pode ser a vencedora.';
    return null;
  };

  const salvarPedido: ComprasContextType['salvarPedido'] = async (dados, enviar) => {
    if (!equipe) return { erro: 'Só a T.I. ou Compras editam o pedido. Use "Pedir compra".' };
    const invalido = validarPedido(dados);
    if (invalido) return { erro: invalido };
    const existente = pedidosTodos.find((p) => p.id === dados.id);
    const novo = !existente;
    let item: PedidoCompra = {
      ...dados,
      itens: dados.itens.map((i, n) => ({ ...i, ordem: n + 1 })),
      status: existente?.status || 'rascunho',
      codigo: existente?.codigo || `PC-${ANO}-${String(pedidosTodos.length + 1).padStart(4, '0')}`,
      solicitanteId: existente?.solicitanteId || eu,
      gestorId: existente ? existente.gestorId : gestorDe(employees, eu),
      criadoEm: existente?.criadoEm || agoraIso(),
      eventos: existente?.eventos || [{ para: 'rascunho', por: eu, em: agoraIso() }],
    };
    let codigo: string | undefined;
    const erro = await noBanco(async () => {
      codigo = await salvarPedidoDb(item, novo);
    });
    if (erro) return { erro };
    if (codigo) item = { ...item, codigo };
    setPedidos((prev) => (novo ? [item, ...prev] : prev.map((p) => (p.id === item.id ? item : p))));
    if (enviar && ['rascunho', 'recusado'].includes(item.status)) {
      const e2 = await mudar(item, 'enviar');
      if (e2) return { item, erro: `Pedido salvo, mas não foi enviado: ${e2}` };
    } else if (!demo) {
      void recarregarCompras();
    }
    return { item };
  };

  const solicitarCompra: ComprasContextType['solicitarCompra'] = async (dados) => {
    if (!podePedirCompra) return { erro: 'Entre com o seu login para pedir compras.' };
    if ((dados.justificativa || '').trim().length < 5) return { erro: 'Explique para que é a compra.' };
    const invalido = validarPedido({ ...dados, semValores: true });
    if (invalido) return { erro: invalido };
    let id: string | undefined;
    const erro = await noBanco(async () => {
      id = await solicitarCompraDb(dados);
    });
    if (erro) return { erro };
    // Seção 15: todo pedido novo vai para a cotação (o banco faz igual)
    const status: StatusPedido = 'em_cotacao';
    const item: PedidoCompra = {
      ...dados,
      id: id || dados.id,
      codigo: `PC-${ANO}-${String(pedidosTodos.length + 1).padStart(4, '0')}`,
      status,
      solicitanteId: eu,
      gestorId: gestorDe(employees, eu),
      criadoEm: agoraIso(),
      itens: dados.itens.map((i, n) => ({ ...i, ordem: n + 1, valorUnitario: undefined, tipo: dados.tipoPedido === 'outros' ? 'servico' : i.tipo })),
      // Seção 16: o link que a pessoa indicou vira a 1ª opção do item
      cotacoes: [
        ...dados.itens
          .filter((i) => i.link)
          .map((i) => ({ id: novoId('cot'), itemId: i.id, fornecedorId: '', link: i.link, loja: (/^https?:\/\/(?:www\.)?([^/:]+)/.exec(i.link || '') || [])[1], marca: i.marca, modelo: i.modelo, valor: i.valorReferencia || 0, observacoes: 'Sugestão de quem pediu', vencedora: false, criadoPor: eu })),
        ...dados.cotacoes.filter((c) => c.itemId).map((c) => ({ ...c, fornecedorId: '', vencedora: false, criadoPor: eu })),
      ],
      eventos: [{ para: status, por: eu, em: agoraIso() }],
    };
    if (demo) {
      setPedidos((prev) => [item, ...prev]);
      return { item };
    }
    // Produção: vale o que o banco devolveu (código, situação, gestor)
    const r = await buscar();
    aplicar(r);
    return { item: r?.p?.find((x) => x.id === id) || item };
  };

  const mudarStatusPedido: ComprasContextType['mudarStatusPedido'] = async (id, acao, motivo) => {
    const p = pedidosTodos.find((x) => x.id === id);
    if (!p) return 'Pedido não encontrado.';
    return mudar(p, acao, motivo);
  };

  // Mesmas regras da função mudar_status_pedido do banco (aqui só para avisar antes)
  async function mudar(p: PedidoCompra, acao: AcaoPedido, motivo?: string): Promise<string | null> {
    const precisaMotivo = acao === 'cancelar' || acao === 'devolver' || acao === 'recusar';
    if (precisaMotivo && (motivo || '').trim().length < 5) return 'Explique o motivo.';
    if (acao === 'aprovar' || acao === 'recusar') return 'Use "Registrar aprovação" (com quem aprovou) ou "Devolver".';
    if (acao === 'devolver' && !(equipe && ['em_cotacao', 'aguardando', 'aprovado'].includes(p.status))) return 'Só a T.I. ou Compras devolvem um pedido em cotação ou aprovado.';
    if (acao === 'devolver' && p.status === 'aprovado' && !(isCompras || isAdmin)) return 'Só Compras ou o administrador da T.I. devolvem um pedido aprovado.';
    if (acao === 'enviar' && !['rascunho', 'recusado'].includes(p.status)) return 'Só um rascunho ou um pedido devolvido vai para cotação.';
    const erro = await noBanco(() => mudarStatusPedidoDb(p.id, acao, motivo));
    if (erro) return erro;
    if (!demo) {
      await recarregarCompras();
      return null;
    }
    const limpaAprov = { aprovadoPor: undefined, aprovadoEm: undefined, aprovadorId: undefined, aprovacaoForma: undefined, aprovacaoObs: undefined, aprovadoGestorPor: undefined, aprovadoGestorEm: undefined };
    if (acao === 'enviar') mudarLocal(p.id, 'em_cotacao', { motivo: undefined, ...limpaAprov });
    else if (acao === 'devolver') mudarLocal(p.id, p.status === 'aprovado' ? 'em_cotacao' : 'recusado', { motivo: motivo?.trim(), ...(p.status === 'aprovado' ? limpaAprov : {}) }, motivo?.trim());
    else mudarLocal(p.id, 'cancelado', { motivo: motivo?.trim() }, motivo?.trim());
    return null;
  }

  // Seção 15: aprovação registrada — T.I./Compras registram quem aprovou; o gestor de quem pediu aprova ele mesmo
  const registrarAprovacao: ComprasContextType['registrarAprovacao'] = async (id, aprovadorId, forma, obs) => {
    const p = pedidosTodos.find((x) => x.id === id);
    if (!p) return 'Pedido não encontrado.';
    if (!(isCompras || isAdmin) && !(eu && p.gestorId === eu && aprovadorId === eu)) return 'Só Compras, o administrador da T.I. ou o gestor de quem pediu registram a aprovação.';
    if (eu && eu === p.solicitanteId) return 'Quem pediu não pode registrar a aprovação do próprio pedido.';
    if (!['em_cotacao', 'aguardando'].includes(p.status)) return 'Este pedido não está aguardando aprovação.';
    if (!aprovadorId) return 'Escolha quem aprovou.';
    if (aprovadorId === p.solicitanteId) return 'Quem pediu não pode aprovar o próprio pedido.';
    // Seção 16: recomendar uma opção é opcional (sem recomendação, Compras escolhe na compra)
    const erro = await noBanco(() => aprovarPedidoDb(id, aprovadorId, forma, obs));
    if (erro) return erro;
    if (!demo) {
      await recarregarCompras();
      return null;
    }
    // A opção escolhida de cada item define o produto (como no banco)
    const itens = p.itens.map((i) => {
      const o = opcaoEscolhida(p, i.id);
      return o ? { ...i, marca: o.marca || i.marca, modelo: o.modelo || i.modelo, link: o.link || i.link, imagemUrl: o.imagemUrl || i.imagemUrl, valorUnitario: o.valor > 0 ? o.valor : i.valorUnitario } : i;
    });
    const forn = p.cotacoes.find((c) => c.vencedora && !c.itemId)?.fornecedorId || p.cotacoes.find((c) => c.vencedora && c.fornecedorId)?.fornecedorId;
    const nome = employees.find((e) => e.id === aprovadorId)?.nome || 'liderança';
    mudarLocal(
      id,
      'aprovado',
      { itens, aprovadoPor: eu, aprovadoEm: agoraIso(), aprovadorId, aprovacaoForma: forma, aprovacaoObs: obs?.trim() || undefined, motivo: undefined, fornecedorId: forn || p.fornecedorId },
      `Aprovado por ${nome} (${forma})${obs?.trim() ? ` — ${obs.trim()}` : ''}`
    );
    return null;
  };
  const registrarCompra: ComprasContextType['registrarCompra'] = async (id, d) => {
    if (!(isCompras || isAdmin)) return 'Só Compras (ou o administrador da T.I.) registra a compra.';
    const p = pedidosTodos.find((x) => x.id === id);
    if (!p || p.status !== 'aprovado') return 'Só um pedido aprovado pode ser registrado como comprado.';
    if (!d.fornecedorId && !(d.loja || '').trim()) return 'Informe o fornecedor ou a loja da compra.';
    if (!d.dataCompra || !d.vencimento) return 'Informe a data da compra e o vencimento.';
    if (d.dataCompra > hoje()) return 'A data da compra não pode ser futura.';
    if (d.vencimento < d.dataCompra) return 'O vencimento não pode ser antes da data da compra.';
    const sugeridos = p.cotacoes.filter((c) => c.vencedora && c.fornecedorId).map((c) => c.fornecedorId);
    const trocou = sugeridos.length > 0 && !sugeridos.includes(d.fornecedorId);
    if (trocou && (d.motivoTroca || '').trim().length < 5) return 'Explique por que a compra foi feita em outro fornecedor.';
    if (d.nfChave && !/^\d{44}$/.test(d.nfChave)) return 'A chave da NF-e tem 44 dígitos.';
    const valores = new Map(d.itens.map((i) => [i.id, i.valorUnitario]));
    const itens = p.itens.map((i) => ({ ...i, valorUnitario: valores.get(i.id) ?? i.valorUnitario }));
    const total = Math.round(itens.reduce((s, i) => s + i.quantidade * (i.valorUnitario || 0), 0) * 100) / 100;
    if (itens.some((i) => !((i.valorUnitario || 0) > 0))) return 'Informe o valor pago de cada item (maior que zero).';
    if (!(total > 0)) return 'Informe o valor pago de cada item.';
    const erro = await noBanco(() => registrarCompraDb(id, d));
    if (erro) return erro;
    if (demo) {
      const f = app.lancarFatura({
        pedidoId: id,
        competencia: `${d.dataCompra.slice(0, 7)}-01`,
        valor: total,
        vencimento: d.vencimento,
        status: 'a_pagar',
        numeroDocumento: d.numeroNf,
        formaPagamento: d.formaPagamento,
        observacoes: `Pedido de compra ${p.codigo}`,
      });
      if (d.nfArquivo) app.alterarFatura(f.id, { arquivoCaminho: d.nfArquivo });
      mudarLocal(id, 'comprado', {
        itens,
        valorFinal: total,
        faturaId: f.id,
        fornecedorId: d.fornecedorId || undefined,
        lojaCompra: d.loja?.trim() || undefined,
        linkCompra: d.link?.trim() || undefined,
        numeroNf: d.numeroNf,
        nfChave: d.nfChave,
        nfArquivo: d.nfArquivo,
        fornecedorTrocaMotivo: trocou ? d.motivoTroca : undefined,
        dataCompra: d.dataCompra,
        vencimento: d.vencimento,
        formaPagamento: d.formaPagamento,
      });
    } else {
      await Promise.all([recarregarCompras(), app.refreshSupabaseData()]);
    }
    return null;
  };

  const receberPedido: ComprasContextType['receberPedido'] = async (id, d) => {
    const p = pedidosTodos.find((x) => x.id === id);
    if (!p || p.status !== 'comprado') return 'Só um pedido comprado pode ser recebido.';
    if (!(isTI || (isCompras && p.tipoPedido === 'outros'))) return 'Só a T.I. registra o recebimento.';
    for (const i of p.itens.filter((x) => x.tipo === 'equipamento')) {
      const doItem = d.ativos.filter((a) => a.itemId === i.id);
      if (doItem.length !== i.quantidade || doItem.some((a) => !a.tag.trim()))
        return `Informe o patrimônio de cada unidade de "${i.descricao}" (${i.quantidade} unidade(s)).`;
    }
    const tags = d.ativos.map((a) => a.tag.trim().toLowerCase());
    if (new Set(tags).size !== tags.length) return 'Há patrimônios repetidos no recebimento.';
    const repetida = assets.find((a) => tags.includes(a.tag.trim().toLowerCase()));
    if (repetida) return `O patrimônio ${repetida.tag} já está em uso.`;
    const erro = await noBanco(() => receberPedidoDb(id, d));
    if (erro) return erro;
    if (demo) {
      const forn = fornecedores.find((f) => f.id === p.fornecedorId)?.nome || '';
      for (const i of p.itens) {
        if (i.tipo === 'equipamento') {
          d.ativos
            .filter((a) => a.itemId === i.id)
            .forEach((a, n) =>
              app.addAsset({
                tag: a.tag.trim(),
                nome: i.descricao,
                categoria: i.categoriaAtivo || 'hardware',
                marca: a.marca?.trim() || i.marca || 'A definir',
                modelo: a.modelo?.trim() || i.modelo || 'A definir',
                serialNumber: a.serial?.trim() || `A-PREENCHER-${p.codigo}-${i.ordem}-${n + 1}`,
                localizacaoFisica: d.localizacao || 'Almoxarifado T.I.',
                status: 'disponivel',
                fiscal: { numeroNF: p.numeroNf || '', chaveAcesso44: p.nfChave || '', valorCompra: i.valorUnitario || 0, fornecedor: forn, dataAquisicao: p.dataCompra || hoje(), dataGarantia: '' },
                fornecedorId: p.fornecedorId,
                pedidoId: p.id,
                observacoes: [i.especificacao && `Especificação do pedido: ${i.especificacao}`, i.link && `Produto: ${i.link}`].filter(Boolean).join('\n') || undefined,
                historicoCustodia: [],
                historicoManutencao: [],
              })
            );
        } else if (i.tipo === 'acessorio' && !i.estoqueItemId && d.criarEstoque?.includes(i.id)) {
          // Seção 14: cria o acessório no estoque com a quantidade recebida
          await salvarItemEstoque({ nome: i.descricao, tipo: 'outro', marca: i.marca, modelo: i.modelo, minimo: 0, localizacao: d.localizacao, valorUnitario: i.valorUnitario, fornecedorId: p.fornecedorId, ativo: true, quantidadeInicial: i.quantidade })
        } else if (i.tipo === 'acessorio' && i.estoqueItemId && estoque.some((e) => e.id === i.estoqueItemId)) {
          await movimentarEstoque({ itemId: i.estoqueItemId, tipo: 'entrada', quantidade: i.quantidade, motivo: `Recebido do pedido ${p.codigo}` });
        } else if (i.tipo === 'licenca' && i.licencaId) {
          const l = licenses.find((x) => x.id === i.licencaId);
          if (l) app.updateLicense(l.id, { assentosTotais: l.assentosTotais + i.quantidade });
        }
      }
      mudarLocal(id, 'recebido', { recebidoPor: eu, recebidoEm: agoraIso() });
    } else {
      await Promise.all([recarregarCompras(), app.refreshSupabaseData(), recarregarRecursos()]);
    }
    return null;
  };

  const anexarCotacao: ComprasContextType['anexarCotacao'] = async (pedidoId, arquivo) => {
    try {
      return { caminho: await enviarAnexoPedidoDb(pedidoId, arquivo) };
    } catch (err) {
      return { erro: mensagemDeErro(err) };
    }
  };

  // ---------------------------------------------------------------------------
  // Inventário físico
  // ---------------------------------------------------------------------------
  const abrirInventario: ComprasContextType['abrirInventario'] = async (titulo, local, unidadeId) => {
    if (!isTI) return { erro: 'Só a T.I. abre uma conferência.' };
    if (titulo.trim().length < 3) return { erro: 'Dê um nome à conferência.' };
    const l = local.trim();
    if (inventarios.some((i) => i.status === 'aberto' && i.local.toLowerCase() === l.toLowerCase())) return { erro: 'Já existe uma conferência aberta para este local.' };
    let id: string | undefined;
    const erro = await noBanco(async () => {
      id = await abrirInventarioDb(titulo.trim(), l, unidadeId);
    });
    if (erro) return { erro };
    if (demo) {
      id = novoId('inv');
      const itens: ItemInventario[] = assets
        .filter((a) => a.status !== 'descartado' && (!l || a.localizacaoFisica.trim().toLowerCase() === l.toLowerCase()))
        .map((a) => ({ id: novoId('ii'), ativoId: a.id, localEsperado: a.localizacaoFisica, situacao: 'pendente', viaQr: false }));
      setInventarios((prev) => [{ id: id!, titulo: titulo.trim(), local: l, unidadeId, status: 'aberto', criadoPor: eu, criadoEm: agoraIso(), itens }, ...prev]);
    } else {
      await recarregarCompras();
    }
    return { id };
  };

  const trocarItem = (inventarioId: string, item: ItemInventario, novo = false) =>
    setInventarios((prev) =>
      prev.map((inv) =>
        inv.id === inventarioId ? { ...inv, itens: novo ? [...inv.itens, item] : inv.itens.map((i) => (i.id === item.id ? item : i)) } : inv
      )
    );

  const conferirItem: ComprasContextType['conferirItem'] = async (inventarioId, item) => {
    if (item.situacao === 'outro_local' && !(item.localEncontrado || '').trim()) return 'Informe onde o equipamento foi encontrado.';
    const erro = await noBanco(() => conferirItemDb(item));
    if (erro) return erro;
    const carimbado: ItemInventario =
      item.situacao === 'pendente' ? { ...item, conferidoPor: undefined, conferidoEm: undefined } : { ...item, conferidoPor: eu, conferidoEm: agoraIso() };
    trocarItem(inventarioId, carimbado);
    return null;
  };

  const incluirItemInventario: ComprasContextType['incluirItemInventario'] = async (inventarioId, dados) => {
    const inv = inventarios.find((i) => i.id === inventarioId);
    if (!inv || inv.status !== 'aberto') return 'Esta conferência já foi encerrada.';
    if (inv.itens.some((i) => i.ativoId === dados.ativoId)) return 'O equipamento já está nesta conferência.';
    if (assets.find((a) => a.id === dados.ativoId)?.status === 'descartado') return 'Equipamento descartado não entra na conferência.';
    const item: ItemInventario = { ...dados, id: novoId('ii'), conferidoPor: eu, conferidoEm: agoraIso() };
    const erro = await noBanco(() => incluirItemInventarioDb(inventarioId, item));
    if (erro) return erro;
    trocarItem(inventarioId, item, true);
    return null;
  };

  const fecharInventario: ComprasContextType['fecharInventario'] = async (id, atualizarLocais) => {
    const inv = inventarios.find((i) => i.id === id);
    if (!inv || inv.status !== 'aberto') return { erro: 'Esta conferência já foi encerrada.' };
    let resumo: InventarioFisico['resumo'];
    const erro = await noBanco(async () => {
      resumo = await fecharInventarioDb(id, atualizarLocais);
    });
    if (erro) return { erro };
    if (demo) {
      const itens = inv.itens.map((i) => (i.situacao === 'pendente' ? { ...i, situacao: 'nao_encontrado' as const, conferidoPor: eu, conferidoEm: agoraIso() } : i));
      const d7 = new Date(Date.now() + 7 * 86400000);
      const venceEm = `${d7.getFullYear()}-${String(d7.getMonth() + 1).padStart(2, '0')}-${String(d7.getDate()).padStart(2, '0')}`;
      for (const i of itens) {
        const a = assets.find((x) => x.id === i.ativoId);
        if (!a) continue;
        if (i.situacao === 'nao_encontrado') {
          await app.criarLembrete({
            titulo: `Inventário: ${a.tag} não encontrado`,
            descricao: `Não encontrado na conferência "${inv.titulo}". Investigar e, se for o caso, registrar a baixa (perda/roubo).`,
            venceEm,
            ativoId: a.id,
          });
        } else if (i.situacao === 'outro_local') {
          if (atualizarLocais) app.updateAsset(a.id, { localizacaoFisica: (i.localEncontrado || '').trim() });
          else
            await app.criarLembrete({
              titulo: `Inventário: atualizar o local de ${a.tag}`,
              descricao: `Encontrado em "${(i.localEncontrado || '').trim()}" na conferência "${inv.titulo}".`,
              venceEm,
              ativoId: a.id,
            });
        }
      }
      resumo = {
        total: itens.length,
        encontrados: itens.filter((i) => i.situacao === 'encontrado').length,
        nao_encontrados: itens.filter((i) => i.situacao === 'nao_encontrado').length,
        outro_local: itens.filter((i) => i.situacao === 'outro_local').length,
        via_qr: itens.filter((i) => i.viaQr).length,
        locais_atualizados: atualizarLocais,
      };
      setInventarios((prev) => prev.map((x) => (x.id === id ? { ...x, itens, status: 'fechado', resumo, fechadoPor: eu, fechadoEm: agoraIso() } : x)));
    } else {
      await Promise.all([recarregarCompras(), app.refreshSupabaseData()]);
    }
    return { resumo };
  };

  const cancelarInventario: ComprasContextType['cancelarInventario'] = async (id, motivo) => {
    if (motivo.trim().length < 5) return 'Explique por que a conferência foi cancelada.';
    const erro = await noBanco(() => cancelarInventarioDb(id, motivo.trim()));
    if (erro) return erro;
    setInventarios((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'cancelado', observacoes: motivo.trim(), fechadoPor: eu, fechadoEm: agoraIso() } : x)));
    return null;
  };

  return (
    <ComprasContext.Provider
      value={{
        orcamentos,
        pedidos,
        inventarios,
        podePedirCompra,
        ehGestor,
        equipeCompras: equipe,
        mensagens,
        carregarMensagens,
        enviarMensagem,
        salvarOrcamentos,
        excluirOrcamento,
        salvarPedido,
        solicitarCompra,
        mudarStatusPedido,
        registrarCompra,
        receberPedido,
        anexarCotacao,
        abrirInventario,
        conferirItem,
        incluirItemInventario,
        fecharInventario,
        cancelarInventario,
        recarregarCompras,
        lerDadosDoLink: lerDadosDoLinkDb,
        registrarAprovacao,
        pessoasAprovacao,
      }}
    >
      {children}
    </ComprasContext.Provider>
  );
};

export const useCompras = () => {
  const ctx = useContext(ComprasContext);
  if (!ctx) throw new Error('useCompras precisa estar dentro de ComprasProvider');
  return ctx;
};
