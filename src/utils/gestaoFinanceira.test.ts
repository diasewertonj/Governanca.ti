import { describe, expect, it } from 'vitest';
import { imobilizadoDoAno, naturezaDoAtivo, naturezaDoLancamento, orcamentoDeGestao, projecaoGastos, recorrentesParaProjecao, totaisImobilizado } from './gestaoFinanceira.ts';

const ativo = (id: string, valor: number, data: string, extra: Record<string, unknown> = {}) =>
  ({ id, tag: id, nome: id, status: 'em_uso', categoria: 'notebook', fiscal: { valorCompra: valor, dataAquisicao: data }, ...extra }) as never;

describe('natureza CAPEX/OPEX', () => {
  it('equipamento acima do limite é CAPEX; abaixo, OPEX; manual vence', () => {
    expect(naturezaDoAtivo(ativo('a', 5000, '2025-01-01'))).toBe('capex');
    expect(naturezaDoAtivo(ativo('b', 300, '2025-01-01'))).toBe('opex');
    expect(naturezaDoAtivo({ ...(ativo('c', 5000, '2025-01-01') as object), natureza: 'opex', naturezaManual: true } as never)).toBe('opex');
  });
  it('assinatura é sempre OPEX; perpétua acima do limite é CAPEX', () => {
    expect(naturezaDoLancamento({ categoria: 'software', valorUnitario: 9000 })).toBe('opex');
    expect(naturezaDoLancamento({ categoria: 'software', valorUnitario: 9000, perpetua: true })).toBe('capex');
    expect(naturezaDoLancamento({ categoria: 'hardware', valorUnitario: 1199.99 })).toBe('opex');
  });
});

describe('projeção de gastos', () => {
  const agora = new Date(2025, 10, 15); // nov/2025 → projeta de dez/2025 em diante
  it('contrato sem renovação para no fim; com renovação reajusta em 12 meses', () => {
    const p = projecaoGastos(
      {
        recorrentes: [
          { origem: 'contrato', id: 'x', nome: 'Link', categoria: 'internet', mensal: 100, fim: '2026-02-28', renova: false },
          { origem: 'licenca', id: 'y', nome: 'Office', categoria: 'software', mensal: 1000, renova: true, reajustePct: 10 },
        ],
        ativos: [],
        pedidosAprovados: [{ codigo: 'PC-1', titulo: 'Notebook', valor: 6000 }],
      },
      14,
      {},
      undefined,
      agora
    );
    expect(p.meses[0]).toEqual({ mes: '2025-12', opex: 1100, capex: 6000, total: 7100 });
    expect(p.meses[3].opex).toBe(1000); // mar/2026: link já acabou
    expect(p.meses[12].opex).toBe(1100); // dez/2026: Office reajustado 10%
  });
  it('reposição de equipamento CAPEX no mês em que zera', () => {
    const p = projecaoGastos({ recorrentes: [], ativos: [ativo('nb', 5000, '2022-03-10')], pedidosAprovados: [] }, 36, { reposicao: { notebook: 7000 } }, undefined, agora);
    const capex = p.itens.filter((i) => i.natureza === 'capex');
    expect(capex).toHaveLength(1);
    expect(capex[0].valor).toBe(7000);
  });
});

describe('ponte cadastro → projeção', () => {
  it('contrato com fim e sem renovação para; licença renova salvo se desligada', () => {
    const r = recorrentesParaProjecao(
      [
        { origem: 'contrato', id: 'c1', nome: 'Link', categoria: 'internet', mensal: 100 },
        { origem: 'licenca', id: 'l1', nome: 'Office', categoria: 'software', mensal: 50 },
        { origem: 'licenca', id: 'l2', nome: 'Velha', categoria: 'software', mensal: 10 },
      ],
      { contratos: [{ id: 'c1', fim: '2026-01-31', reajusteMes: 3 }], licencas: [{ id: 'l1' }, { id: 'l2', dataRenovacao: '2026-05-01', renovacaoAutomatica: false }] }
    );
    expect(r.map((x) => x.renova)).toEqual([false, true, false]);
    expect(r[0].reajusteMes).toBe(3);
  });
});

describe('orçamento de gestão', () => {
  it('separa CAPEX/OPEX e soma comprometido, a pagar e realizado no usado', () => {
    const linhas = orcamentoDeGestao(
      [
        { categoria: 'software', area: 'T.I.', valorAnual: 12000 },
        { categoria: 'hardware', area: 'T.I.', valorAnual: 20000 },
      ],
      [
        { situacao: 'realizado', natureza: 'opex', categoria: 'software', area: 'T.I.', mes: 0, valor: 9000 },
        { situacao: 'a_pagar', natureza: 'opex', categoria: 'software', area: 'T.I.', mes: 10, valor: 1000 },
        { situacao: 'comprometido', natureza: 'capex', categoria: 'hardware', area: 'T.I.', mes: 10, valor: 6000 },
      ],
      [{ natureza: 'opex', categoria: 'software', area: 'T.I.', valor: 1000 }]
    );
    const sw = linhas.find((l) => l.categoria === 'software')!;
    expect(sw).toMatchObject({ natureza: 'opex', previsto: 12000, realizado: 9000, aPagar: 1000, disponivel: 2000, projecaoDezembro: 11000 });
    const hw = linhas.find((l) => l.categoria === 'hardware')!;
    expect(hw).toMatchObject({ natureza: 'capex', comprometido: 6000, disponivel: 14000 });
  });
});

describe('imobilizado do ano', () => {
  it('fecha a conta: inicial + aquisições − baixas − depreciação = final', () => {
    const linhas = imobilizadoDoAno(
      [
        ativo('velho', 12000, '2024-01-01'),
        ativo('novo', 6000, '2025-07-01'),
        ativo('vendido', 4800, '2024-01-01', { baixas: [{ dataBaixa: '2025-06-30', valorVenda: 1000 }] }),
        ativo('antigo-baixado', 4800, '2020-01-01', { baixas: [{ dataBaixa: '2024-03-01' }] }),
        ativo('barato', 200, '2025-02-01'),
      ],
      2025
    );
    expect(linhas.map((l) => l.ativoId).sort()).toEqual(['novo', 'velho', 'vendido']);
    const t = totaisImobilizado(linhas);
    expect(t.aquisicoes).toBe(6000);
    expect(t.baixasCusto).toBe(4800);
    const liquidoBaixado = t.baixasCusto - t.baixasDepAcum;
    expect(Math.round((t.liquidoInicial + t.aquisicoes - liquidoBaixado - t.depreciacaoAno) * 100) / 100).toBe(t.liquidoFinal);
  });
});
