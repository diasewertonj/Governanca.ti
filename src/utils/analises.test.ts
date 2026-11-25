import { describe, expect, it } from 'vitest';
import type { Asset, Contrato, Employee, LinhaTelefonica, SoftwareLicense } from '../types/index.ts';
import { custoPorAreaPeloUso, custoPorFornecedor, custoPorPessoa, desperdicio, manutencaoPorModelo, mediaPorCargo, situacaoEquipamentos } from './analises.ts';
import type { Lancamento } from './gestaoFinanceira.ts';

const pessoa = (id: string, setorId: string, cargo = 'Analista', status: Employee['status'] = 'ativo') =>
  ({ id, nome: id, setorId, cargo, status }) as Employee;
const ativo = (id: string, p: Partial<Asset>) =>
  ({ id, tag: id, nome: 'Notebook', categoria: 'hardware', marca: 'Dell', modelo: 'X', status: 'em_uso', fiscal: { valorCompra: 5000, dataAquisicao: '2024-01-10' }, historicoManutencao: [], ...p }) as unknown as Asset;
const licenca = (id: string, p: Partial<SoftwareLicense>) =>
  ({ id, nome: id, status: 'ativa', formaCobranca: 'propria', valorMensal: 100, assentosTotais: 10, assentosAlocados: 2, colaboradoresIds: [], ...p }) as unknown as SoftwareLicense;
const linha = (id: string, p: Partial<LinhaTelefonica>) => ({ id, numero: id, status: 'ativa', valorMensal: 50, ...p }) as LinhaTelefonica;
const lanc = (p: Partial<Lancamento>): Lancamento => ({ situacao: 'realizado', natureza: 'opex', categoria: 'software', area: 'dep-ti', mes: 0, valor: 100, ...p });
const contratos: Contrato[] = [];

const pessoas = [pessoa('ana', 'dep-a'), pessoa('bia', 'dep-b'), pessoa('caio', 'dep-a', 'Gerente', 'desligado')];
const ativos = [ativo('n1', { custodianteId: 'ana' }), ativo('n2', { custodianteId: 'caio', fiscal: { valorCompra: 3000 } as Asset['fiscal'] }), ativo('n3', { status: 'disponivel', setorId: 'dep-b' }), ativo('n4', { status: 'descartado', custodianteId: 'ana' })];
const licencas = [licenca('figma', { colaboradoresIds: ['ana', 'caio'] }), licenca('velha', { status: 'inativa', colaboradoresIds: ['ana'] })];
const linhas = [linha('l1', { colaboradorId: 'ana' }), linha('l2', {}), linha('l3', { colaboradorId: 'bia', status: 'cancelada' })];

describe('custo por pessoa (equipamento pelo valor de compra)', () => {
  const r = custoPorPessoa(pessoas, { ativos, licencas, linhas, contratos });
  it('soma equipamentos vigentes, assento da licença ativa e linha ativa', () => {
    const ana = r.find((x) => x.pessoa.id === 'ana')!;
    expect(ana.valorEquipamentos).toBe(5000); // o descartado não conta
    expect(ana.mensalLicencas).toBe(10); // 100 / 10 assentos; a inativa não conta
    expect(ana.mensalLinhas).toBe(50);
    expect(ana.mensalTotal).toBe(60);
    expect(r.find((x) => x.pessoa.id === 'bia')!.mensalLinhas).toBe(0); // linha cancelada
  });
  it('média por cargo ignora desligados', () => {
    expect(mediaPorCargo(r)).toEqual([{ cargo: 'Analista', pessoas: 2, equipamentos: 2500, mensal: 30 }]);
  });
});

describe('desperdício', () => {
  const d = desperdicio({ pessoas, ativos, licencas, linhas, contratos });
  it('desligado com recurso, assentos livres, linha sem pessoa e estoque', () => {
    expect(d.desligados.map((x) => x.pessoa.id)).toEqual(['caio']);
    expect(d.mensal.desligados).toBe(10);
    expect(d.assentosLivres[0].livres).toBe(8);
    expect(d.mensal.assentosLivres).toBe(80);
    expect(d.linhasSemPessoa.map((l) => l.id)).toEqual(['l2']);
    expect(d.valorEmEstoque).toBe(5000);
    expect(d.mensalTotal).toBe(140);
  });
});

describe('custo por área com licença rateada pelo uso', () => {
  it('a fatura da licença vai para a área de quem tem o assento; o resto fica na área do lançamento', () => {
    const r = custoPorAreaPeloUso(
      [lanc({ valor: 200, origem: { fatura: 'f1', licenca: 'figma' } }), lanc({ valor: 300 }), lanc({ valor: 999, situacao: 'comprometido' })],
      { pessoas: [pessoa('ana', 'dep-a'), pessoa('bia', 'dep-b')], ativos: [], licencas: [licenca('figma', { colaboradoresIds: ['ana', 'bia'] })], contratos }
    );
    expect(r.find((x) => x.area === 'dep-ti')).toMatchObject({ despesas: 300, peloUso: 0 });
    expect(r.find((x) => x.area === 'dep-a')).toMatchObject({ despesas: 100, peloUso: 100, pessoas: 1, porPessoa: 100 });
  });
  it('contrato que cobre licenças também rateia pelo uso', () => {
    const c = { id: 'ct', itens: [{ licencaId: 'figma' }] } as unknown as Contrato;
    const r = custoPorAreaPeloUso([lanc({ valor: 90, origem: { contrato: 'ct' } })], { pessoas: [pessoa('ana', 'dep-a')], ativos: [], licencas: [licenca('figma', { colaboradoresIds: ['ana'] })], contratos: [c] });
    expect(r).toEqual([expect.objectContaining({ area: 'dep-a', despesas: 90, peloUso: 90 })]);
  });
});

describe('por fornecedor', () => {
  it('soma pago e a pagar por fornecedor e categoria; sem fatura ou comprometido não entra', () => {
    const r = custoPorFornecedor(
      [lanc({ origem: { fatura: 'f1' } }), lanc({ situacao: 'a_pagar', categoria: 'nuvem', origem: { fatura: 'f2' } }), lanc({ situacao: 'comprometido', origem: { fatura: 'f3' } }), lanc({})],
      () => 'forn-1',
      { contratos, licencas: [licenca('x', { fornecedorId: 'forn-1' })] }
    );
    expect(r).toEqual([expect.objectContaining({ fornecedorId: 'forn-1', total: 200, pago: 100, aPagar: 100, porCategoria: { software: 100, nuvem: 100 }, licencas: 1 })]);
  });
});

describe('equipamentos: idade e manutenção', () => {
  it('alerta de manutenção acima de 50% da compra e de vida útil vencida', () => {
    const caro = ativo('m1', { historicoManutencao: [{ custo: 3000, cobertoGarantia: false, status: 'concluida' }, { custo: 9000, cobertoGarantia: true, status: 'concluida' }] as Asset['historicoManutencao'] });
    const velho = ativo('m2', { fiscal: { valorCompra: 5000, dataAquisicao: '2018-01-01' } as Asset['fiscal'] });
    const r = situacaoEquipamentos([caro, velho], undefined, new Date('2026-11-25T12:00:00'));
    expect(r[0]).toMatchObject({ manutencoes: 2, custoManutencao: 3000, alerta: 'manutencao', idadeMeses: 34 });
    expect(r[1].alerta).toBe('vida');
    expect(manutencaoPorModelo(r)).toEqual([{ modelo: 'Dell X', unidades: 2, manutencoes: 2, custo: 3000 }]);
  });
});
