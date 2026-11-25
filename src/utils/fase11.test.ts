import { describe, expect, it } from 'vitest';
import type { Asset, Orcamento, PedidoCompra } from '../types/index.ts';
import { ativoDoCodigo, depreciacao, grupoDoAtivo, mesesEntre, proximasTags, somarMeses } from './patrimonio.ts';
import {
  alertasOrcamento,
  copiarOrcamentos,
  distribuirMensal,
  impactoNoOrcamento,
  somaMeses,
  type LinhaOrcamento,
  valorDoPedido,
  esperaPorMim,
  vezDoPedido,
  itensSemEscolha,
} from './compras.ts';
import { listarVencimentos, valorPatrimonio } from './financeiro.ts';

const fiscal = (valorCompra: number, dataAquisicao: string) => ({ numeroNF: '', chaveAcesso44: '', valorCompra, fornecedor: '', dataAquisicao, dataGarantia: '' });
const ativo = (p: Partial<Asset>): Asset => ({
  id: 'a1',
  tag: '#PAT-0001',
  nome: 'Notebook',
  categoria: 'hardware',
  marca: 'Dell',
  modelo: 'X',
  serialNumber: 'SN1',
  localizacaoFisica: 'Sala 1',
  status: 'disponivel',
  fiscal: fiscal(6000, '2024-01-10'),
  historicoCustodia: [],
  historicoManutencao: [],
  ...p,
});
const pedido = (p: Partial<PedidoCompra>): PedidoCompra => ({
  id: 'p1',
  codigo: 'PC-2026-0001',
  titulo: 'Notebook',
  categoria: 'hardware',
  area: 'TI',
  status: 'aguardando',
  tipoPedido: 'ti',
  criadoEm: '2026-11-01T10:00:00Z',
  itens: [{ id: 'i1', tipo: 'equipamento', descricao: 'Notebook', quantidade: 2, valorUnitario: 5000, ordem: 1 }],
  cotacoes: [],
  eventos: [],
  ...p,
});

describe('Fase 11 · depreciação linear', () => {
  it('conta só meses completos e soma meses no fim do mês', () => {
    expect(mesesEntre('2024-01-10', '2024-02-09')).toBe(0);
    expect(mesesEntre('2024-01-10', '2024-02-10')).toBe(1);
    expect(mesesEntre('2024-01-10', '2023-01-10')).toBe(0);
    expect(somarMeses('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('computador de 5 anos perde 1/60 por mês e zera em 60 meses', () => {
    const d = depreciacao(ativo({}), undefined, '2025-01-10');
    expect(d.grupo).toBe('computadores');
    expect(d.mesesDecorridos).toBe(12);
    expect(d.acumulada).toBe(1200);
    expect(d.valorAtual).toBe(4800);
    expect(d.zeraEm).toBe('2029-01-10');
    expect(depreciacao(ativo({}), undefined, '2035-01-01').valorAtual).toBe(0);
  });

  it('respeita a vida útil configurada e o valor residual', () => {
    const d = depreciacao(ativo({}), { computadores: 4, residualPct: 10 }, '2026-01-10');
    // (6000 − 600) × 24/48 = 2700
    expect(d.acumulada).toBe(2700);
    expect(d.valorAtual).toBe(3300);
    expect(depreciacao(ativo({}), { computadores: 4, residualPct: 10 }, '2040-01-01').valorAtual).toBe(600);
  });

  it('grupo automático pela categoria e pelo nome; escolhido na ficha prevalece', () => {
    expect(grupoDoAtivo(ativo({ categoria: 'telefonia' }))).toBe('celulares');
    expect(grupoDoAtivo(ativo({ nome: 'Switch 24 portas' }))).toBe('servidores');
    expect(grupoDoAtivo(ativo({ nome: 'Cadeira ergonômica' }))).toBe('moveis');
    expect(grupoDoAtivo(ativo({ categoria: 'software' }))).toBe('nao_deprecia');
    expect(grupoDoAtivo(ativo({ nome: 'Switch', grupoDepreciacao: 'moveis' }))).toBe('moveis');
    expect(depreciacao(ativo({ grupoDepreciacao: 'moveis' }), undefined, '2025-01-10').acumulada).toBe(600);
  });

  it('sem valor ou data de compra fica sem cálculo; "não deprecia" mantém o valor', () => {
    expect(depreciacao(ativo({ fiscal: fiscal(0, '2024-01-01') })).semDados).toBe(true);
    const nd = depreciacao(ativo({ grupoDepreciacao: 'nao_deprecia' }), undefined, '2030-01-01');
    expect(nd.semDados).toBe(false);
    expect(nd.valorAtual).toBe(6000);
  });

  it('valor do patrimônio mostra compra, atual e depreciado', () => {
    const vp = valorPatrimonio([ativo({}), ativo({ id: 'a2', status: 'descartado' })], [], undefined, new Date(2025, 0, 10));
    expect(vp.equipamentos).toBe(6000);
    expect(vp.equipamentosAtual).toBe(4800);
    expect(vp.depreciacaoAcumulada).toBe(1200);
    expect(vp.totalAtual).toBe(4800);
  });
});

describe('Fase 11 · patrimônio sugerido e leitura do QR', () => {
  it('sugere tags seguidas a partir da maior', () => {
    expect(proximasTags([{ tag: '#PAT-0041' }, { tag: '#PAT-0007' }], 3)).toEqual(['#PAT-0042', '#PAT-0043', '#PAT-0044']);
  });
  it('acha o ativo pelo link da etiqueta, pelo patrimônio ou pela série', () => {
    const lista = [ativo({}), ativo({ id: 'ast-9', tag: '#PAT-0009', serialNumber: 'ABC 123' })];
    expect(ativoDoCodigo('https://nexus.app/#asset/ast-9', lista)?.tag).toBe('#PAT-0009');
    expect(ativoDoCodigo(' #pat-0001 ', lista)?.id).toBe('a1');
    expect(ativoDoCodigo('PAT-0009', lista)?.id).toBe('ast-9');
    expect(ativoDoCodigo('abc123', lista)?.id).toBe('ast-9');
    expect(ativoDoCodigo('xyz', lista)).toBeUndefined();
  });
});

describe('Fase 11 · orçamento', () => {
  it('distribui em 12 meses com os centavos em dezembro', () => {
    const m = distribuirMensal(1000);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe(83.33);
    expect(somaMeses(m)).toBe(1000);
  });

  it('copia do ano anterior com reajuste mantendo a proporção', () => {
    const o: Orcamento = { id: 'o', ano: 2025, categoria: 'software', area: 'TI', valorAnual: 1200, meses: [200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1000] };
    const [c] = copiarOrcamentos([o], 2025, 2026, 10);
    expect(c.ano).toBe(2026);
    expect(c.meses[0]).toBe(220);
    expect(c.valorAnual).toBe(1320);
  });

  // Seção 27: as linhas vêm do livro (useOrcamentoAtual, mesma conta do Acompanhamento)
  const linhaOrc = (previsto: number, realizado: number): LinhaOrcamento => ({
    chave: 'hardware|ti',
    categoria: 'hardware',
    area: 'TI',
    previstoMeses: [],
    realizadoMeses: [],
    previsto,
    realizado,
    pct: previsto > 0 ? realizado / previsto : undefined,
  });

  it('alertas em 90% (perto) e 100% (estourado) do previsto', () => {
    const [alerta] = alertasOrcamento([linhaOrc(12000, 11500)], 2026);
    expect(alerta.nivel).toBe('perto');
    expect(alertasOrcamento([linhaOrc(12000, 12100)], 2026)[0].nivel).toBe('estourado');
    expect(alertasOrcamento([linhaOrc(12000, 5000)], 2026)).toHaveLength(0);
  });

  it('copiar do ano anterior mantém a natureza (CAPEX/OPEX)', () => {
    const o: Orcamento = { id: 'o', ano: 2025, categoria: 'software', area: 'TI', natureza: 'capex', valorAnual: 1200, meses: distribuirMensal(1200) };
    expect(copiarOrcamentos([o], 2025, 2026, 0)[0].natureza).toBe('capex');
  });

  it('impacto do pedido soma realizado, outros aprovados e este pedido', () => {
    const linhas = [linhaOrc(20000, 5000)];
    const outro = pedido({ id: 'p2', status: 'aprovado', itens: [{ id: 'x', tipo: 'servico', descricao: 's', quantidade: 1, valorUnitario: 3000, ordem: 1 }] });
    const este = pedido({ cotacoes: [{ id: 'c', fornecedorId: 'f', valor: 9000, vencedora: true }] });
    expect(valorDoPedido(este)).toBe(9000);
    const imp = impactoNoOrcamento(este, linhas, [este, outro], [], 2026);
    expect(imp.comprometido).toBe(3000);
    expect(imp.saldoDepois).toBe(3000);
    expect(imp.semOrcamento).toBe(false);
    expect(impactoNoOrcamento(pedido({ area: 'RH' }), linhas, [], [], 2026).semOrcamento).toBe(true);
  });
});

describe('Seção 14 · opções por item', () => {
  it('valor do pedido usa a opção escolhida de cada item; aprovar exige escolha onde há opções', () => {
    const p = pedido({
      itens: [
        { id: 'i1', tipo: 'equipamento', descricao: 'Notebook', quantidade: 2, valorUnitario: 5000, ordem: 1 },
        { id: 'i2', tipo: 'acessorio', descricao: 'Mouse', quantidade: 3, valorUnitario: 50, ordem: 2 },
      ],
      cotacoes: [
        { id: 'o1', itemId: 'i1', fornecedorId: '', loja: 'A', valor: 4800, vencedora: true },
        { id: 'o2', itemId: 'i1', fornecedorId: '', loja: 'B', valor: 4900, vencedora: false },
        { id: 'o3', itemId: 'i2', fornecedorId: '', loja: 'C', valor: 40, vencedora: false },
      ],
    });
    expect(valorDoPedido(p)).toBe(2 * 4800 + 3 * 50);
    expect(itensSemEscolha(p)).toEqual(['Mouse']);
  });
});

describe('Fase 11 · Precisa de atenção', () => {
  const base = { ativos: [], contratos: [], licencas: [], faturas: [], estoque: [], linhas: [], pessoas: [] };
  it('cada um vê o que espera por ele (seção 13)', () => {
    const pedidos = [
      pedido({}),
      pedido({ id: 'p2', status: 'comprado' }),
      pedido({ id: 'p3', status: 'recebido' }),
      pedido({ id: 'p4', status: 'em_cotacao' }),
      pedido({ id: 'p5', gestorId: 'g1' }),
      pedido({ id: 'p6', status: 'comprado', tipoPedido: 'outros' }),
    ];
    const ids = (papel: string, eu?: string) => pedidos.filter((p) => esperaPorMim(p, papel, eu)).map((p) => p.id);
    // Seção 15: quem cota registra a aprovação; Compras compra; T.I. recebe (Compras, o pedido Outros)
    expect(ids('ti_suporte')).toEqual(['p1', 'p2', 'p4', 'p5', 'p6']);
    expect(ids('compras')).toEqual(['p6']);
    expect(ids('ti_admin')).toEqual(['p1', 'p2', 'p4', 'p5', 'p6']);
    expect(ids('colaborador', 'g1')).toEqual([]);
    expect(vezDoPedido(pedido({ tipoPedido: 'outros', status: 'em_cotacao' }))).toBe('compras_cotacao');
    expect(vezDoPedido(pedido({ status: 'aprovado' }))).toBe('compras_compra');
    const v = listarVencimentos({ ...base, pedidos: pedidos.filter((p) => esperaPorMim(p, 'compras')) }, 30);
    expect(v.filter((x) => x.tipo === 'pedido_compra')).toHaveLength(1);
  });
  it('orçamento estourado entra como pendência', () => {
    const v = listarVencimentos({ ...base, alertasOrcamento: [{ id: 'orc-x', nivel: 'estourado', titulo: 'Hardware · TI', detalhe: '105%' }] }, 30);
    expect(v[0].tipo).toBe('orcamento');
    expect(v[0].detalhe).toContain('Acima do orçamento');
  });
});
