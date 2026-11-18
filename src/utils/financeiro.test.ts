import { describe, expect, it } from 'vitest';
import type { Asset, Contrato, SoftwareLicense } from '../types/index.ts';
import {
  assentosOciosos,
  comprasDeEquipamentos,
  dataLimiteCancelamento,
  despesasRecorrentes,
  fonteCustoLicenca,
  mensalDoContrato,
  nomesParecidos,
  paraCsv,
  pendenciasConciliacao,
  valorDaFatura,
  valorEfetivo,
  valorPatrimonio,
} from './financeiro.ts';
import { contratoEmVigorNoPeriodo, contratoQuePagaLicenca } from './contratos.ts';

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

describe('seção 9.4 · compras e valor do patrimônio', () => {
  const ativo = (p: Omit<Partial<Asset>, 'fiscal'> & { fiscal?: Partial<Asset['fiscal']> }): Asset =>
    ({ id: 'a1', tag: '#PAT-1', nome: 'Notebook', categoria: 'hardware', status: 'em_uso', ...p, fiscal: { ...p.fiscal } }) as Asset;

  it('patrimônio: equipamentos sem baixa + acessórios em estoque × valor unitário', () => {
    const vp = valorPatrimonio(
      [
        ativo({ fiscal: { valorCompra: 5000 } }),
        ativo({ id: 'a2', fiscal: {} }),
        ativo({ id: 'a3', status: 'descartado', fiscal: { valorCompra: 9000 } }),
      ],
      [
        { ativo: true, quantidade: 3, valorUnitario: 100 },
        { ativo: false, quantidade: 10, valorUnitario: 50 },
        { ativo: true, quantidade: 0, valorUnitario: 80 },
      ]
    );
    expect(vp.equipamentos).toBe(5000);
    expect(vp.qtdEquipamentos).toBe(2);
    expect(vp.semValor).toBe(1);
    expect(vp.acessorios).toBe(300);
    expect(vp.qtdAcessorios).toBe(3);
    expect(vp.total).toBe(5300);
  });

  it('compras: só quem tem valor ou data, mais recentes primeiro, baixado marcado', () => {
    const c = comprasDeEquipamentos([
      ativo({ id: 'a1', fiscal: { valorCompra: 5000, dataAquisicao: '2026-03-10', numeroNF: '123' } }),
      ativo({ id: 'a2', fiscal: {} }),
      ativo({ id: 'a3', status: 'descartado', fiscal: { dataAquisicao: '2026-08-01', fornecedor: 'Loja antiga' } }),
    ]);
    expect(c.map((x) => x.ativoId)).toEqual(['a3', 'a1']);
    expect(c[0]).toMatchObject({ baixado: true, valor: 0, fornecedorTexto: 'Loja antiga' });
    expect(c[1]).toMatchObject({ baixado: false, valor: 5000, numeroNF: '123' });
  });
});

describe('números do Financeiro (seção 10.3)', () => {
  it('contrato que cobre 3 softwares: cada um fica com 1/3 do mensal', () => {
    const c = ctr({ valor: 3000, itens: [{ licencaId: 'l1' }, { licencaId: 'l2' }, { licencaId: 'l3' }] });
    const f = fonteCustoLicenca(lic({ formaCobranca: 'contrato' }), [c], agora);
    expect(f.mensal).toBe(3000);
    expect(f.mensalDaLicenca).toBe(1000);
    expect(f.licencasNoContrato).toBe(3);
  });

  it('custo ocioso usa a parte do software no contrato', () => {
    const c = ctr({ valor: 3000, itens: [{ licencaId: 'l1' }, { licencaId: 'l2' }, { licencaId: 'l3' }] });
    const [o] = assentosOciosos([lic({ formaCobranca: 'contrato', assentosTotais: 10, assentosAlocados: 5 })], [c]);
    expect(o.custoMensal).toBe(500);
  });

  it('contrato encerrado conta até a data do encerramento', () => {
    const c = ctr({ status: 'encerrado', encerradoEm: '2026-11-10T12:00:00Z' });
    expect(contratoEmVigorNoPeriodo(c, '2026-10-01', '2026-10-31')).toBe(true);
    expect(contratoEmVigorNoPeriodo(c, '2026-11-01', '2026-11-30')).toBe(true);
    expect(contratoEmVigorNoPeriodo(c, '2026-12-01', '2026-12-31')).toBe(false);
    expect(contratoEmVigorNoPeriodo(c, '2026-01-01', '2026-01-31')).toBe(false); // antes do início
  });

  it('contrato encerrado não paga licença em competência depois do encerramento', () => {
    const c = ctr({ status: 'encerrado', encerradoEm: '2026-11-10T12:00:00Z' });
    expect(contratoQuePagaLicenca('l1', [c], '2026-10-01')?.id).toBe('c1');
    expect(contratoQuePagaLicenca('l1', [c], '2026-12-01')).toBeUndefined();
  });

  it('valor efetivo: o pago quando difere; o da fatura nos demais casos', () => {
    expect(valorEfetivo({ status: 'paga', valor: 100, valorPago: 112 })).toBe(112);
    expect(valorEfetivo({ status: 'paga', valor: 100 })).toBe(100);
    expect(valorEfetivo({ status: 'a_pagar', valor: 100, valorPago: 112 })).toBe(100);
  });

  it('valor da fatura no padrão brasileiro e com a moeda estrangeira', () => {
    const nb = (s: string) => s.replace(/\s/g, ' ');
    expect(nb(valorDaFatura({ status: 'a_pagar', valor: 1110.5 }))).toBe('R$ 1.110,50');
    expect(nb(valorDaFatura({ status: 'a_pagar', valor: 110.5, moeda: 'USD', valorMoeda: 20 }))).toBe('US$ 20,00 (R$ 110,50)');
  });
});