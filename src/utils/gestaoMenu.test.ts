import { describe, expect, it } from 'vitest';
import { custoPorArea, type Lancamento } from './gestaoFinanceira.ts';
import { itemDoMenu, menuDoPapel, vistasDoPapel } from './navegacao.ts';

const lanc = (p: Partial<Lancamento>): Lancamento => ({ situacao: 'realizado', natureza: 'opex', categoria: 'software', area: 'T.I.', mes: 0, valor: 100, ...p });
const nome = (id: string) => ({ 'dep-a': 'Comercial', 'dep-b': 'Financeiro' })[id] || id;

describe('custoPorArea (decisão 3: rateio é relatório)', () => {
  it('sem rateio, o realizado fica na área do lançamento; comprometido não entra', () => {
    expect(custoPorArea([lanc({}), lanc({ situacao: 'comprometido', valor: 999 })], [], nome)).toEqual([{ area: 'T.I.', valor: 100 }]);
  });
  it('rateio do contrato divide; a parte não coberta fica na área original', () => {
    const r = custoPorArea(
      [lanc({ origem: { fatura: 'f1', contrato: 'c1' } })],
      [
        { origemTipo: 'contrato', origemId: 'c1', departamentoId: 'dep-a', percentual: 60 },
        { origemTipo: 'contrato', origemId: 'c1', departamentoId: 'dep-b', percentual: 30 },
      ],
      nome
    );
    expect(r).toEqual([
      { area: 'Comercial', valor: 60 },
      { area: 'Financeiro', valor: 30 },
      { area: 'T.I.', valor: 10 },
    ]);
  });
  it('rateio da fatura vence o do contrato', () => {
    const r = custoPorArea(
      [lanc({ origem: { fatura: 'f1', contrato: 'c1' } })],
      [
        { origemTipo: 'contrato', origemId: 'c1', departamentoId: 'dep-a', percentual: 100 },
        { origemTipo: 'fatura', origemId: 'f1', departamentoId: 'dep-b', percentual: 100 },
      ],
      nome
    );
    expect(r).toEqual([{ area: 'Financeiro', valor: 100 }]);
  });
});

describe('menu da seção 17 (Financeiro × Gestão de T.I.)', () => {
  const vistas = (papel: Parameters<typeof menuDoPapel>[0], gestor = false) => vistasDoPapel(papel, { gestor });
  it('admin vê painel executivo e relatórios; suporte não', () => {
    expect(vistas('ti_admin')).toEqual(expect.arrayContaining(['financeiro', 'recebimentos', 'despesas', 'painel_executivo', 'orcamento', 'projecao', 'patrimonio', 'relatorios']));
    expect(vistas('ti_suporte')).toEqual(expect.arrayContaining(['financeiro', 'recebimentos', 'despesas', 'orcamento', 'projecao', 'patrimonio']));
    expect(vistas('ti_suporte')).not.toContain('painel_executivo');
    expect(vistas('ti_suporte')).not.toContain('relatorios');
  });
  it('Compras: contas, recebimentos, orçamento, projeção e relatórios; sem custos recorrentes nem patrimônio', () => {
    const v = vistas('compras');
    expect(v).toEqual(expect.arrayContaining(['financeiro', 'recebimentos', 'orcamento', 'projecao', 'relatorios']));
    expect(v).not.toContain('despesas');
    expect(v).not.toContain('patrimonio');
  });
  it('seção 23: Orçamento e Projeção são um item só no menu; a projeção continua abrindo (aba)', () => {
    for (const papel of ['ti_admin', 'ti_suporte', 'compras'] as const) {
      const itens = menuDoPapel(papel).flatMap((g) => g.itens.map((i) => i.vista));
      expect(itens).toContain('orcamento');
      expect(itens).not.toContain('projecao');
      expect(vistas(papel)).toContain('projecao');
    }
    expect(itemDoMenu('projecao')).toBe('orcamento');
    expect(itemDoMenu('patrimonio')).toBe('patrimonio');
  });
  it('gestor vê só os custos da área; RH e colaborador sem telas financeiras', () => {
    expect(vistas('colaborador', true)).toContain('custos_area');
    expect(vistas('colaborador')).not.toContain('custos_area');
    for (const papel of ['rh', 'colaborador'] as const) {
      expect(vistas(papel)).not.toContain('financeiro');
      expect(vistas(papel)).not.toContain('orcamento');
    }
  });
});
