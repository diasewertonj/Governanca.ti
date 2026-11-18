/**
 * Fase 11 · Orçamento, pedidos de compra e inventário físico.
 * Separado do AppContext (como o RecursosContext). A T.I. carrega tudo; RH e gestor
 * só os pedidos, sem valores (função do banco). Gravações esperam o banco e devolvem
 * a mensagem de erro ou null. Modo demonstração: dados de exemplo só em memória.
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
  excluirOrcamentoDb,
  fecharInventarioDb,
  fetchInventariosDb,
  fetchOrcamentosDb,
  fetchPedidosDb,
  fetchPedidosSolicitadosDb,
  incluirItemInventarioDb,
  mudarStatusPedidoDb,
  podePedirCompraDb,
  receberPedidoDb,
  registrarCompraDb,
  salvarOrcamentosDb,
  salvarPedidoDb,
  solicitarCompraDb,
  type DadosCompra,
  type DadosRecebimento,
} from '../services/comprasDb.ts';
import type { EventoPedido, InventarioFisico, ItemInventario, Orcamento, PedidoCompra, StatusPedido } from '../types/index.ts';
import { alertasOrcamento, distribuirMensal, lancamentosRealizados, resumoOrcamento, type AlertaOrcamento, type LinhaOrcamento } from '../utils/compras.ts';

type AcaoPedido = 'enviar' | 'aprovar' | 'recusar' | 'cancelar';

interface ComprasContextType {
  orcamentos: Orcamento[];
  pedidos: PedidoCompra[];
  inventarios: InventarioFisico[];
  /** RH, gestor e T.I. pedem compra */
  podePedirCompra: boolean;
  /** Previsto × realizado do ano corrente (para alertas e impacto) */
  linhasAnoAtual: LinhaOrcamento[];
  alertas: AlertaOrcamento[];
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
}

const ComprasContext = createContext<ComprasContextType | undefined>(undefined);
const novoId = (prefixo: string) => `${prefixo}-${crypto.randomUUID()}`;
const agoraIso = () => new Date().toISOString();
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    status: 'aguardando',
    solicitanteId: 'emp-2',
    necessarioEm: `${ANO}-12-15`,
    criadoEm: new Date(Date.now() - 3 * 86400000).toISOString(),
    itens: [{ id: 'pit-1', tipo: 'equipamento', descricao: 'Notebook 14" i5 16 GB', categoriaAtivo: 'hardware', quantidade: 1, valorUnitario: 5200, ordem: 1 }],
    cotacoes: [
      { id: 'cot-1', fornecedorId: 'forn-1', valor: 5190, prazoDias: 10, vencedora: true },
      { id: 'cot-2', fornecedorId: 'forn-2', valor: 5480, prazoDias: 5, vencedora: false },
    ],
    eventos: [ev('aguardando', 3, 'emp-2')],
  },
  {
    id: 'ped-2',
    codigo: `PC-${ANO}-0002`,
    titulo: 'Monitores para o time de Engenharia',
    justificativa: 'Segunda tela para os desenvolvedores novos.',
    categoria: 'hardware',
    area: 'Tecnologia da Informação',
    status: 'aprovado',
    solicitanteId: 'emp-7',
    fornecedorId: 'forn-1',
    aprovadoPor: 'emp-1',
    aprovadoEm: new Date(Date.now() - 1 * 86400000).toISOString(),
    criadoEm: new Date(Date.now() - 6 * 86400000).toISOString(),
    itens: [{ id: 'pit-2', tipo: 'equipamento', descricao: 'Monitor 24" Full HD', categoriaAtivo: 'periferico', marca: 'Dell', modelo: 'P2422H', quantidade: 2, valorUnitario: 1100, ordem: 1 }],
    cotacoes: [{ id: 'cot-3', fornecedorId: 'forn-1', valor: 2150, prazoDias: 7, vencedora: true }],
    eventos: [ev('rascunho', 6, 'emp-7'), ev('aguardando', 5, 'emp-7', 'rascunho'), ev('aprovado', 1, 'emp-1', 'aguardando')],
  },
  {
    id: 'ped-3',
    codigo: `PC-${ANO}-0003`,
    titulo: 'Mouses para o estoque',
    justificativa: 'Estoque abaixo do mínimo.',
    categoria: 'hardware',
    area: 'Tecnologia da Informação',
    status: 'rascunho',
    solicitanteId: 'emp-7',
    criadoEm: new Date(Date.now() - 1 * 86400000).toISOString(),
    itens: [{ id: 'pit-3', tipo: 'acessorio', descricao: 'Mouse USB Logitech M90', estoqueItemId: 'est-2', quantidade: 10, valorUnitario: 45, ordem: 1 }],
    cotacoes: [],
    eventos: [ev('rascunho', 1, 'emp-7')],
  },
];
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
  const { currentRole, currentUser, employees, assets, faturas, contratos, licenses, departments, fornecedores } = app;
  const { estoque, movimentarEstoque, recarregarRecursos } = useRecursos();
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const isAdmin = currentRole === 'ti_admin';
  const demo = !isSupabaseConfigured;

  const [orcamentos, setOrcamentos] = useState<Orcamento[]>(demo ? DEMO_ORCAMENTOS : []);
  const [pedidosTodos, setPedidos] = useState<PedidoCompra[]>(demo ? DEMO_PEDIDOS : []);
  const [inventarios, setInventarios] = useState<InventarioFisico[]>(demo ? DEMO_INVENTARIOS : []);
  const [podeBanco, setPodeBanco] = useState(false);

  const ehGestor = !!currentUser && employees.some((e) => e.gestorId === currentUser.id && e.status !== 'desligado');
  const podePedirCompra = isTI || currentRole === 'rh' || (demo ? ehGestor : podeBanco);

  // Demonstração: RH e gestor veem só o que o banco mostraria (sem valores; gestor, só os seus)
  const pedidos = useMemo(() => {
    if (isTI) return pedidosTodos;
    if (!demo) return pedidosTodos;
    return pedidosTodos
      .filter((p) => currentRole === 'rh' || p.solicitanteId === currentUser?.id)
      .map((p) => ({ ...p, semValores: true, cotacoes: [], fornecedorId: undefined, valorFinal: undefined, itens: p.itens.map((i) => ({ ...i, valorUnitario: undefined })) }));
  }, [pedidosTodos, isTI, demo, currentRole, currentUser?.id]);

  const buscar = useCallback(async () => {
    if (demo || !currentUser) return null;
    if (isTI) {
      const [o, p, i] = await Promise.all([fetchOrcamentosDb(), fetchPedidosDb(), fetchInventariosDb()]);
      return { o, p, i, pode: true };
    }
    const pode = await podePedirCompraDb();
    return { o: null, p: pode ? await fetchPedidosSolicitadosDb() : [], i: null, pode };
  }, [demo, isTI, currentUser]);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof buscar>>) => {
    if (!r) return;
    if (r.o) setOrcamentos(r.o);
    if (r.p) setPedidos(r.p);
    if (r.i) setInventarios(r.i);
    setPodeBanco(r.pode);
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

  // Previsto × realizado do ano corrente (alertas no Precisa de atenção e impacto do pedido)
  const linhasAnoAtual = useMemo(() => {
    if (!isTI) return [];
    const lanc = lancamentosRealizados({ faturas, contratos, licencas: licenses, pedidos: pedidosTodos, ativos: assets, departamentos: departments }, ANO);
    return resumoOrcamento(orcamentos, lanc, ANO);
  }, [isTI, faturas, contratos, licenses, pedidosTodos, assets, departments, orcamentos]);
  const alertas = useMemo(() => alertasOrcamento(linhasAnoAtual, ANO), [linhasAnoAtual]);

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
  const mudarLocal = (id: string, para: StatusPedido, extra: Partial<PedidoCompra> = {}, motivo?: string) =>
    setPedidos((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, ...extra, status: para, atualizadoEm: agoraIso(), eventos: [...p.eventos, { de: p.status, para, motivo, por: currentUser?.id, em: agoraIso() }] } : p
      )
    );

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
    if (p.cotacoes.length > 3) return 'Cada pedido tem no máximo 3 cotações.';
    if (p.cotacoes.some((c) => !c.fornecedorId)) return 'Escolha o fornecedor de cada cotação.';
    if (p.cotacoes.filter((c) => c.vencedora).length > 1) return 'Só uma cotação pode ser a vencedora.';
    return null;
  };

  const salvarPedido: ComprasContextType['salvarPedido'] = async (dados, enviar) => {
    if (!isTI) return { erro: 'Só a T.I. edita o pedido. Use "Pedir compra".' };
    const invalido = validarPedido(dados);
    if (invalido) return { erro: invalido };
    const existente = pedidosTodos.find((p) => p.id === dados.id);
    const novo = !existente;
    let item: PedidoCompra = {
      ...dados,
      itens: dados.itens.map((i, n) => ({ ...i, ordem: n + 1 })),
      status: existente?.status || 'rascunho',
      codigo: existente?.codigo || `PC-${ANO}-${String(pedidosTodos.length + 1).padStart(4, '0')}`,
      solicitanteId: existente?.solicitanteId || currentUser?.id,
      criadoEm: existente?.criadoEm || agoraIso(),
      eventos: existente?.eventos || [{ para: 'rascunho', por: currentUser?.id, em: agoraIso() }],
    };
    let codigo: string | undefined;
    const erro = await noBanco(async () => {
      codigo = await salvarPedidoDb(item, novo);
    });
    if (erro) return { erro };
    if (codigo) item = { ...item, codigo };
    setPedidos((prev) => (novo ? [item, ...prev] : prev.map((p) => (p.id === item.id ? item : p))));
    if (enviar && (item.status === 'rascunho' || item.status === 'recusado')) {
      const e2 = await mudar(item, 'enviar');
      if (e2) return { item, erro: `Pedido salvo, mas não foi enviado: ${e2}` };
    } else if (!demo) {
      void recarregarCompras();
    }
    return { item };
  };

  const solicitarCompra: ComprasContextType['solicitarCompra'] = async (dados) => {
    if (!podePedirCompra) return { erro: 'Você não pode pedir compras. Fale com o RH ou com a T.I.' };
    if ((dados.justificativa || '').trim().length < 5) return { erro: 'Explique para que é a compra.' };
    const invalido = validarPedido({ ...dados, semValores: true });
    if (invalido) return { erro: invalido };
    let id: string | undefined;
    const erro = await noBanco(async () => {
      id = await solicitarCompraDb(dados);
    });
    if (erro) return { erro };
    const item: PedidoCompra = {
      ...dados,
      id: id || dados.id,
      codigo: `PC-${ANO}-${String(pedidosTodos.length + 1).padStart(4, '0')}`,
      status: 'aguardando',
      solicitanteId: currentUser?.id,
      criadoEm: agoraIso(),
      itens: dados.itens.map((i, n) => ({ ...i, ordem: n + 1, valorUnitario: undefined })),
      cotacoes: [],
      eventos: [{ para: 'aguardando', por: currentUser?.id, em: agoraIso() }],
    };
    if (demo) setPedidos((prev) => [item, ...prev]);
    else await recarregarCompras();
    return { item };
  };

  const mudarStatusPedido: ComprasContextType['mudarStatusPedido'] = async (id, acao, motivo) => {
    const p = pedidosTodos.find((x) => x.id === id);
    if (!p) return 'Pedido não encontrado.';
    return mudar(p, acao, motivo);
  };

  async function mudar(p: PedidoCompra, acao: AcaoPedido, motivo?: string): Promise<string | null> {
    const id = p.id;
    if ((acao === 'aprovar' || acao === 'recusar') && !isAdmin) return 'Só o administrador aprova ou recusa pedidos de compra.';
    if ((acao === 'recusar' || acao === 'cancelar') && (motivo || '').trim().length < 5) return 'Explique o motivo.';
    if (acao === 'aprovar' && p.cotacoes.length > 0 && !p.cotacoes.some((c) => c.vencedora)) return 'Escolha a cotação vencedora antes de aprovar.';
    const erro = await noBanco(() => mudarStatusPedidoDb(id, acao, motivo));
    if (erro) return erro;
    if (demo) {
      const para: StatusPedido = acao === 'enviar' ? 'aguardando' : acao === 'aprovar' ? 'aprovado' : acao === 'recusar' ? 'recusado' : 'cancelado';
      mudarLocal(
        id,
        para,
        acao === 'aprovar'
          ? { aprovadoPor: currentUser?.id, aprovadoEm: agoraIso(), fornecedorId: p.cotacoes.find((c) => c.vencedora)?.fornecedorId || p.fornecedorId }
          : acao === 'enviar'
            ? { motivo: undefined }
            : { motivo: motivo?.trim() },
        motivo?.trim()
      );
    } else {
      await recarregarCompras();
    }
    return null;
  }

  const registrarCompra: ComprasContextType['registrarCompra'] = async (id, d) => {
    if (!isTI) return 'Só a T.I. registra a compra.';
    const p = pedidosTodos.find((x) => x.id === id);
    if (!p || p.status !== 'aprovado') return 'Só um pedido aprovado pode ser registrado como comprado.';
    if (!d.fornecedorId) return 'Informe o fornecedor da compra.';
    if (!d.dataCompra || !d.vencimento) return 'Informe a data da compra e o vencimento.';
    const valores = new Map(d.itens.map((i) => [i.id, i.valorUnitario]));
    const itens = p.itens.map((i) => ({ ...i, valorUnitario: valores.get(i.id) ?? i.valorUnitario }));
    const total = Math.round(itens.reduce((s, i) => s + i.quantidade * (i.valorUnitario || 0), 0) * 100) / 100;
    if (!(total > 0)) return 'Informe o valor pago de cada item.';
    let faturaId: string | undefined;
    const erro = await noBanco(async () => {
      faturaId = await registrarCompraDb(id, d);
    });
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
      mudarLocal(id, 'comprado', { itens, valorFinal: total, faturaId: f.id, fornecedorId: d.fornecedorId, numeroNf: d.numeroNf, dataCompra: d.dataCompra, vencimento: d.vencimento, formaPagamento: d.formaPagamento });
    } else {
      void faturaId;
      await Promise.all([recarregarCompras(), app.refreshSupabaseData()]);
    }
    return null;
  };

  const receberPedido: ComprasContextType['receberPedido'] = async (id, d) => {
    if (!isTI) return 'Só a T.I. registra o recebimento.';
    const p = pedidosTodos.find((x) => x.id === id);
    if (!p || p.status !== 'comprado') return 'Só um pedido comprado pode ser recebido.';
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
                marca: i.marca || 'A definir',
                modelo: i.modelo || 'A definir',
                serialNumber: a.serial?.trim() || `A-PREENCHER-${p.codigo}-${i.ordem}-${n + 1}`,
                localizacaoFisica: d.localizacao || 'Almoxarifado T.I.',
                status: 'disponivel',
                fiscal: { numeroNF: p.numeroNf || '', chaveAcesso44: '', valorCompra: i.valorUnitario || 0, fornecedor: forn, dataAquisicao: p.dataCompra || hoje(), dataGarantia: '' },
                fornecedorId: p.fornecedorId,
                pedidoId: p.id,
                observacoes: i.especificacao ? `Especificação do pedido: ${i.especificacao}` : undefined,
                historicoCustodia: [],
                historicoManutencao: [],
              })
            );
        } else if (i.tipo === 'acessorio' && i.estoqueItemId && estoque.some((e) => e.id === i.estoqueItemId)) {
          await movimentarEstoque({ itemId: i.estoqueItemId, tipo: 'entrada', quantidade: i.quantidade, motivo: `Recebido do pedido ${p.codigo}` });
        } else if (i.tipo === 'licenca' && i.licencaId) {
          const l = licenses.find((x) => x.id === i.licencaId);
          if (l) app.updateLicense(l.id, { assentosTotais: l.assentosTotais + i.quantidade });
        }
      }
      mudarLocal(id, 'recebido', { recebidoPor: currentUser?.id, recebidoEm: agoraIso() });
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
      setInventarios((prev) => [{ id: id!, titulo: titulo.trim(), local: l, unidadeId, status: 'aberto', criadoPor: currentUser?.id, criadoEm: agoraIso(), itens }, ...prev]);
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
      item.situacao === 'pendente' ? { ...item, conferidoPor: undefined, conferidoEm: undefined } : { ...item, conferidoPor: currentUser?.id, conferidoEm: agoraIso() };
    trocarItem(inventarioId, carimbado);
    return null;
  };

  const incluirItemInventario: ComprasContextType['incluirItemInventario'] = async (inventarioId, dados) => {
    const inv = inventarios.find((i) => i.id === inventarioId);
    if (!inv || inv.status !== 'aberto') return 'Esta conferência já foi encerrada.';
    if (inv.itens.some((i) => i.ativoId === dados.ativoId)) return 'O equipamento já está nesta conferência.';
    const item: ItemInventario = { ...dados, id: novoId('ii'), conferidoPor: currentUser?.id, conferidoEm: agoraIso() };
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
      const itens = inv.itens.map((i) => (i.situacao === 'pendente' ? { ...i, situacao: 'nao_encontrado' as const, conferidoPor: currentUser?.id, conferidoEm: agoraIso() } : i));
      const venceEm = (() => {
        const d = new Date(Date.now() + 7 * 86400000);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
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
      setInventarios((prev) => prev.map((x) => (x.id === id ? { ...x, itens, status: 'fechado', resumo, fechadoPor: currentUser?.id, fechadoEm: agoraIso() } : x)));
    } else {
      await Promise.all([recarregarCompras(), app.refreshSupabaseData()]);
    }
    return { resumo };
  };

  const cancelarInventario: ComprasContextType['cancelarInventario'] = async (id, motivo) => {
    if (motivo.trim().length < 5) return 'Explique por que a conferência foi cancelada.';
    const erro = await noBanco(() => cancelarInventarioDb(id, motivo.trim()));
    if (erro) return erro;
    setInventarios((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'cancelado', observacoes: motivo.trim(), fechadoPor: currentUser?.id, fechadoEm: agoraIso() } : x)));
    return null;
  };

  return (
    <ComprasContext.Provider
      value={{
        orcamentos,
        pedidos,
        inventarios,
        podePedirCompra,
        linhasAnoAtual,
        alertas,
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
