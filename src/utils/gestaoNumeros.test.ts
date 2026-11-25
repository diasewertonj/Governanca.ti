/** Seção 21 · números que batem entre as telas do Financeiro e da Gestão de T.I. */
import { describe, expect, it } from 'vitest';
import { brlOuTraco, previstoRealizadoAteHoje } from './financeiro.ts';
import { chaveGestao, lancamentosDaLinha, orcamentoDeGestao, projecaoGastos, projecaoPorAno, recorrenteRestante, type ItemRecorrente, type Lancamento } from './gestaoFinanceira.ts';

describe('Custos do período: previsto × realizado no mesmo recorte', () => {
  const agora = new Date(2026, 10, 24); // nov/2026
  const porMes = [
    { comp: '2026-09-01', previsto: 100, realizado: 100 },
    { comp: '2026-10-01', previsto: 100, realizado: 90 },
    { comp: '2026-11-01', previsto: 100, realizado: 0 },
    { comp: '2026-12-01', previsto: 100, realizado: 0 },
  ];
  it('o previsto dos meses futuros não entra na comparação: vira "a vencer"', () => {
    const r = previstoRealizadoAteHoje(porMes, agora);
    expect(r.previsto).toBe(300);
    expect(r.realizado).toBe(190);
    expect(r.aVencer).toBe(100);
    expect(r.diferenca).toBe(-110);
  });
  it('período todo no passado: nada a vencer', () => {
    expect(previstoRealizadoAteHoje(porMes.slice(0, 2), agora).aVencer).toBe(0);
  });
  it('zero vira traço nas tabelas', () => {
    expect(brlOuTraco(0)).toBe('—');
    expect(brlOuTraco(0.001)).toBe('—');
    expect(brlOuTraco(10)).not.toBe('—');
  });
});

describe('Projeção por ano', () => {
  it('agrupa os meses por ano, na coluna do mês, com o total do ano', () => {
    const p = projecaoGastos({ recorrentes: [{ origem: 'contrato', id: 'c', nome: 'Link', categoria: 'internet', mensal: 10, renova: true }], ativos: [], pedidosAprovados: [] }, 14, {}, undefined, new Date(2026, 10, 15));
    const anos = projecaoPorAno(p.meses);
    expect(anos.map((a) => a.ano)).toEqual([2026, 2027, 2028]);
    expect(anos[0].meses[11]?.total).toBe(10); // dez/2026
    expect(anos[0].meses[0]).toBeUndefined();
    expect(anos[0].total).toBe(10);
    expect(anos[1].meses.filter(Boolean)).toHaveLength(12);
    expect(anos[2].meses[0]?.mes).toBe('2028-01');
    expect(anos.reduce((s, a) => s + a.total, 0)).toBeCloseTo(p.meses.reduce((s, m) => s + m.total, 0), 2);
  });
  it('reposição e pedido carregam o id da origem (link na composição do mês)', () => {
    const p = projecaoGastos(
      { recorrentes: [], ativos: [], pedidosAprovados: [{ id: 'p1', codigo: 'PC-1', titulo: 'x', valor: 500 }] },
      3,
      {},
      undefined,
      new Date(2026, 10, 15)
    );
    expect(p.itens[0].origemId).toBe('p1');
  });
});

describe('Projeção até dezembro: recorrente que falta', () => {
  const agora = new Date(2026, 10, 15); // nov/2026
  const rec: ItemRecorrente = { origem: 'contrato', id: 'c1', nome: 'Link', categoria: 'internet', mensal: 100, renova: true };
  const projecao = projecaoGastos({ recorrentes: [rec], ativos: [], pedidosAprovados: [] }, 36, {}, undefined, agora);
  it('ano corrente: mês corrente (sem fatura) + meses seguintes até dezembro', () => {
    const r = recorrenteRestante({ projecao, recorrentes: [rec], faturas: [] }, 2026, agora);
    expect(r.map((x) => x.mes).sort()).toEqual(['2026-11', '2026-12']);
  });
  it('competência já faturada não conta de novo', () => {
    const r = recorrenteRestante({ projecao, recorrentes: [rec], faturas: [{ status: 'a_pagar', competencia: '2026-11-01', contratoId: 'c1' }] }, 2026, agora);
    expect(r.map((x) => x.mes)).toEqual(['2026-12']);
  });
  it('ano passado: nada; ano seguinte: os 12 meses da projeção', () => {
    expect(recorrenteRestante({ projecao, recorrentes: [rec], faturas: [] }, 2025, agora)).toEqual([]);
    expect(recorrenteRestante({ projecao, recorrentes: [rec], faturas: [] }, 2027, agora)).toHaveLength(12);
  });
});

describe('Orçamento: a linha abre os lançamentos do recorte', () => {
  it('lancamentosDaLinha usa a mesma chave da linha do orçamento', () => {
    const lancs: Lancamento[] = [
      { situacao: 'realizado', natureza: 'opex', categoria: 'internet', area: 'T.I.', mes: 0, valor: 10, origem: { fatura: 'f1' } },
      { situacao: 'a_pagar', natureza: 'opex', categoria: 'internet', area: 't.i. ', mes: 1, valor: 5, origem: { fatura: 'f2' } },
      { situacao: 'realizado', natureza: 'opex', categoria: 'software', area: 'T.I.', mes: 0, valor: 7 },
    ];
    const [linha] = orcamentoDeGestao([], lancs).filter((l) => l.categoria === 'internet');
    expect(linha.chave).toBe(chaveGestao('opex', 'internet', 'T.I.'));
    expect(lancamentosDaLinha(lancs, linha.chave).map((l) => l.origem?.fatura)).toEqual(['f1', 'f2']);
  });
});
