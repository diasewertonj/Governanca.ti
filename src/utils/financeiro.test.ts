import { describe, expect, it } from 'vitest';
import type { Contrato, SoftwareLicense } from '../types/index.ts';
import {
  assentosOciosos,
  dataLimiteCancelamento,
  despesasRecorrentes,
  fonteCustoLicenca,
  mensalDoContrato,
  nomesParecidos,
  paraCsv,
  pendenciasConciliacao,
} from './financeiro.ts';

const agora = new Date(2026, 10, 16);

const lic = (p: Partial<SoftwareLicense> = {}): SoftwareLicense => ({
  id: 'l1',
  nome: 'Microsoft 365 Business Standard',
  fornecedor: 'Nuvem Revenda',
  fornecedorId: 'f1',
  chaveContrato: '',
  assentosTotais: 40,
  assentosAlocados: 38,
  colaboradoresIds: [],
  dataRenovacao: '2027-01-10',
  valorMensal: 100,
  tipoCobranca: 'mensal',
  ...p,
});

const ctr = (p: Partial<Contrato> = {}): Contrato => ({
  id: 'c1',
  fornecedorId: 'f1',
  tipo: 'licenciamento',
  numero: 'CT-14',
  descricao: 'M365',
  inicio: '2026-03-01',
  fim: '2027-02-28',
  valor: 2890,
  periodicidade: 'mensal',
  itens: [{ licencaId: 'l1' }],
  criadoEm: '2026-03-01',
  ...p,
});

describe('fonte única do custo', () => {
  it('pelo contrato: valor e fim vêm do contrato, não da licença', () => {
    const f = fonteCustoLicenca(lic({ formaCobranca: 'contrato' }), [ctr()], agora);
    expect(f.valor).toBe(2890);
    expect(f.renovacao).toBe('2027-02-28');
    expect(f.origem).toContain('CT-14');
  });

  it('pelo contrato sem contrato vigente: alerta', () => {
    const f = fonteCustoLicenca(lic({ formaCobranca: 'contrato' }), [ctr({ fim: '2026-10-01' })], agora);
    expect(f.semContratoVigente).toBe(true);
  });

  it('contrato encerrado não paga mais', () => {
    const f = fonteCustoLicenca(lic({ formaCobranca: 'contrato' }), [ctr({ status: 'encerrado' })], agora);
    expect(f.semContratoVigente).toBe(true);
  });

  it('cobrança própria anual vira mensal equivalente', () => {
    const f = fonteCustoLicenca(lic({ formaCobranca: 'propria', valorMensal: 1200, tipoCobranca: 'anual' }), [], agora);
    expect(f.mensal).toBe(100);
  });

  it('dado antigo sem forma de cobrança: contrato vigente decide', () => {
    expect(fonteCustoLicenca(lic(), [ctr()], agora).forma).toBe('contrato');
    expect(fonteCustoLicenca(lic(), [], agora).forma).toBe('propria');
  });
});

describe('regras auxiliares', () => {
  it('mensal do contrato: anual ÷ 12, único não recorre', () => {
    expect(mensalDoContrato({ valor: 1200, periodicidade: 'anual' })).toBe(100);
    expect(mensalDoContrato({ valor: 9600, periodicidade: 'unico' })).toBe(0);
  });

  it('data limite para cancelar = fim − aviso', () => {
    expect(dataLimiteCancelamento('2027-02-28', 30)).toBe('2027-01-29');
    expect(dataLimiteCancelamento('2027-02-28', undefined)).toBeUndefined();
  });

  it('nomes parecidos ignoram acento, caixa e o próprio registro', () => {
    const lista = [{ id: '1', nome: 'Microsoft 365' }, { id: '2', nome: 'Figma' }];
    expect(nomesParecidos('microsoft 365 business', lista).map((x) => x.id)).toEqual(['1']);
    expect(nomesParecidos('Microsoft 365', lista, '1')).toEqual([]);
  });

  it('despesas: própria + contrato vigente, sem duplicar a licença paga por contrato', () => {
    const itens = despesasRecorrentes(
      { licencas: [lic({ formaCobranca: 'contrato' }), lic({ id: 'l2', formaCobranca: 'propria', valorMensal: 50 })], contratos: [ctr()], linhas: [] },
      agora
    );
    expect(itens.reduce((s, i) => s + i.mensal, 0)).toBe(2940);
  });

  it('assentos ociosos custam a fração do valor', () => {
    const r = assentosOciosos([lic({ formaCobranca: 'propria', valorMensal: 400, assentosTotais: 4, assentosAlocados: 3 })], []);
    expect(r[0].livres).toBe(1);
    expect(r[0].custoMensal).toBe(100);
  });

  it('conciliação lista só texto sem vínculo', () => {
    const p = pendenciasConciliacao([lic({ fornecedorId: undefined }), lic({ id: 'l2' })], []);
    expect(p.map((x) => x.id)).toEqual(['l1']);
  });

  it('CSV usa ; e vírgula decimal', () => {
    expect(paraCsv(['a', 'b'], [['x;y', 1.5]])).toBe('a;b\n"x;y";1,50');
  });
});
