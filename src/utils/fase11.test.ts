import { describe, expect, it } from 'vitest';
import type { Asset, Fatura, Orcamento, PedidoCompra } from '../types/index.ts';
import { ativoDoCodigo, depreciacao, grupoDoAtivo, mesesEntre, proximasTags, somarMeses } from './patrimonio.ts';
import {
  alertasOrcamento,
  copiarOrcamentos,
  distribuirMensal,
  impactoNoOrcamento,
  lancamentosRealizados,
  resumoOrcamento,
  somaMeses,
  valorDoPedido,
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

  it('realizado = faturas pagas (valor efetivo) + equipamentos fora de pedido; alertas em 90% e 100%', () => {
    const faturas: Fatura[] = [
      { id: 'f1', pedidoId: 'p1', competencia: '2026-03-01', valor: 10000, valorPago: 9500, vencimento: '2026-03-10', status: 'paga', pagoEm: '2026-03-09', criadoEm: '' },
      { id: 'f2', pedidoId: 'p1', competencia: '2026-04-01', valor: 999, vencimento: '2026-04-10', status: 'a_pagar', criadoEm: '' },
    ];
    const ativos = [
      ativo({ fiscal: fiscal(2000, '2026-05-02'), setorId: 'd1' }),
      ativo({ id: 'a2', pedidoId: 'p1', fiscal: fiscal(5000, '2026-03-02') }),
    ];
    const lanc = lancamentosRealizados(
      { faturas, contratos: [], licencas: [], pedidos: [pedido({ status: 'recebido' })], ativos, departamentos: [{ id: 'd1', nome: 'TI', codigo: 'TI', ativo: true }] },
      2026
    );
    expect(lanc.reduce((s, l) => s + l.valor, 0)).toBe(11500);
    const orc: Orcamento[] = [{ id: 'o1', ano: 2026, categoria: 'hardware', area: 'ti', valorAnual: 12000, meses: distribuirMensal(12000) }];
    const linhas = resumoOrcamento(orc, lanc, 2026, new Date(2026, 5, 15));
    expect(linhas).toHaveLength(1);
    expect(linhas[0].realizado).toBe(11500);
    expect(linhas[0].realizadoMeses[2]).toBe(9500);
    expect(linhas[0].tendencia).toBe(23000);
    const [alerta] = alertasOrcamento(linhas, 2026);
    expect(alerta.nivel).toBe('perto');
    expect(alertasOrcamento(resumoOrcamento(orc, [...lanc, { categoria: 'hardware', area: 'TI', mes: 6, valor: 600, origem: 'fatura' }], 2026), 2026)[0].nivel).toBe('estourado');
  });

  it('impacto do pedido soma realizado, outros aprovados e este pedido', () => {
    const orc: Orcamento[] = [{ id: 'o1', ano: 2026, categoria: 'hardware', area: 'TI', valorAnual: 20000, meses: distribuirMensal(20000) }];
    const linhas = resumoOrcamento(orc, [{ categoria: 'hardware', area: 'TI', mes: 0, valor: 5000, origem: 'fatura' }], 2026);
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

describe('Fase 11 · Precisa de atenção', () => {
  const base = { ativos: [], contratos: [], licencas: [], faturas: [], estoque: [], linhas: [], pessoas: [] };
  it('admin vê o pedido aguardando aprovação; suporte vê compra e recebimento', () => {
    const pedidos = [pedido({}), pedido({ id: 'p2', status: 'comprado' }), pedido({ id: 'p3', status: 'recebido' })];
    const admin = listarVencimentos({ ...base, pedidos, papel: 'ti_admin' }, 30);
    expect(admin.filter((v) => v.tipo === 'pedido_compra').map((v) => v.alvo.id)).toEqual(['p1', 'p2']);
    const suporte = listarVencimentos({ ...base, pedidos, papel: 'ti_suporte' }, 30);
    expect(suporte.filter((v) => v.tipo === 'pedido_compra').map((v) => v.alvo.id)).toEqual(['p2']);
  });
  it('orçamento estourado entra como pendência', () => {
    const v = listarVencimentos({ ...base, alertasOrcamento: [{ id: 'orc-x', nivel: 'estourado', titulo: 'Hardware · TI', detalhe: '105%' }] }, 30);
    expect(v[0].tipo).toBe('orcamento');
    expect(v[0].detalhe).toContain('Acima do orçamento');
  });
});
