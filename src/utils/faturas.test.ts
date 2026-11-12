import { describe, expect, it } from 'vitest';
import type { Fatura } from '../types/index.ts';
import {
  faturasDoAlvo,
  opcoesCompetencia,
  proximaCompetencia,
  resumoFaturasAPagar,
  rotuloCompetencia,
  somarMeses,
  statusExibido,
  totalPagoNoAno,
  validarFatura,
  vencimentoSugerido,
} from './faturas.ts';

const agora = new Date(2026, 10, 12, 22, 0, 0); // 12/11/2026, 22h local

const fatura = (dados: Partial<Fatura>): Fatura => ({
  id: 'fat-1',
  licencaId: 'lic-1',
  competencia: '2026-10-01',
  valor: 2140,
  vencimento: '2026-10-10',
  status: 'a_pagar',
  criadoEm: '2026-10-01T10:00:00Z',
  ...dados,
});

describe('competências', () => {
  it('soma meses atravessando o ano', () => {
    expect(somarMeses('2026-11-01', 1)).toBe('2026-12-01');
    expect(somarMeses('2026-12-01', 1)).toBe('2027-01-01');
    expect(somarMeses('2026-01-01', -1)).toBe('2025-12-01');
    expect(somarMeses('2026-03-01', 12)).toBe('2027-03-01');
  });

  it('escreve a competência como "mês/ano"', () => {
    expect(rotuloCompetencia('2026-11-01')).toBe('nov/2026');
    expect(rotuloCompetencia('2027-01-01')).toBe('jan/2027');
  });

  it('próxima: mês seguinte à última, ou ano seguinte se a cobrança for anual', () => {
    const lista = [fatura({ competencia: '2026-09-01' }), fatura({ competencia: '2026-10-01' })];
    expect(proximaCompetencia(lista, 'mensal', agora)).toBe('2026-11-01');
    expect(proximaCompetencia(lista, 'anual', agora)).toBe('2027-10-01');
  });

  it('próxima: ignora canceladas e, sem faturas, sugere o mês atual', () => {
    const lista = [fatura({ competencia: '2026-10-01' }), fatura({ competencia: '2026-11-01', status: 'cancelada' })];
    expect(proximaCompetencia(lista, 'mensal', agora)).toBe('2026-11-01');
    expect(proximaCompetencia([], 'mensal', agora)).toBe('2026-11-01');
  });

  it('vencimento sugerido no dia 10 da competência', () => {
    const dia12nov = new Date(2026, 10, 12, 9, 0, 0);
    expect(vencimentoSugerido('2026-12-01', dia12nov)).toBe('2026-12-10');
    // competência atrasada: o dia 10 já passou, então sugere hoje
    expect(vencimentoSugerido('2026-11-01', dia12nov)).toBe('2026-11-12');
  });

  it('opções do formulário vão do futuro ao passado, incluindo a sugerida', () => {
    const op = opcoesCompetencia('2026-11-01', 2, 1);
    expect(op).toEqual(['2026-12-01', '2026-11-01', '2026-10-01', '2026-09-01']);
  });
});

describe('status e totais', () => {
  it('"vencida" só para fatura a pagar com vencimento passado', () => {
    expect(statusExibido(fatura({ vencimento: '2026-11-11' }), agora)).toBe('vencida');
    expect(statusExibido(fatura({ vencimento: '2026-11-12' }), agora)).toBe('a_pagar');
    expect(statusExibido(fatura({ vencimento: '2026-11-01', status: 'paga', pagoEm: '2026-11-02' }), agora)).toBe('paga');
    expect(statusExibido(fatura({ vencimento: '2026-11-01', status: 'cancelada' }), agora)).toBe('cancelada');
  });

  it('total pago no ano pela data de pagamento', () => {
    const lista = [
      fatura({ status: 'paga', pagoEm: '2026-01-05', valor: 100 }),
      fatura({ status: 'paga', pagoEm: '2026-11-02', valor: 50.5 }),
      fatura({ status: 'paga', pagoEm: '2025-12-30', valor: 999 }),
      fatura({ status: 'a_pagar', valor: 777 }),
      fatura({ status: 'cancelada', pagoEm: '2026-03-01', valor: 888 }),
    ];
    expect(totalPagoNoAno(lista, 2026)).toBe(150.5);
  });

  it('resumo do Início: vencidas e as que vencem em até 7 dias', () => {
    const lista = [
      fatura({ vencimento: '2026-11-11' }),
      fatura({ vencimento: '2026-11-12' }),
      fatura({ vencimento: '2026-11-19' }),
      fatura({ vencimento: '2026-11-20' }),
      fatura({ vencimento: '2026-11-01', status: 'paga', pagoEm: '2026-11-01' }),
    ];
    expect(resumoFaturasAPagar(lista, agora)).toEqual({ vencidas: 1, vencemEmBreve: 2 });
  });

  it('lista do alvo da competência mais recente para a mais antiga', () => {
    const lista = [
      fatura({ id: 'a', competencia: '2026-09-01' }),
      fatura({ id: 'b', competencia: '2026-11-01' }),
      fatura({ id: 'c', licencaId: undefined, contratoId: 'ct-1', competencia: '2026-12-01' }),
    ];
    expect(faturasDoAlvo(lista, { licencaId: 'lic-1' }).map((f) => f.id)).toEqual(['b', 'a']);
    expect(faturasDoAlvo(lista, { contratoId: 'ct-1' }).map((f) => f.id)).toEqual(['c']);
  });
});

describe('validarFatura', () => {
  const nova = fatura({ id: 'nova', competencia: '2026-11-01', vencimento: '2026-11-10' });

  it('aceita fatura correta', () => {
    expect(validarFatura(nova, [fatura({})])).toBeNull();
  });

  it('recusa competência repetida, mas aceita se a anterior foi cancelada', () => {
    expect(validarFatura(nova, [fatura({ competencia: '2026-11-01' })])).toMatch(/Já existe fatura não cancelada para nov\/2026/);
    expect(validarFatura(nova, [fatura({ competencia: '2026-11-01', status: 'cancelada' })])).toBeNull();
  });

  it('não acusa a própria fatura ao editar', () => {
    expect(validarFatura(nova, [nova])).toBeNull();
  });

  it('recusa paga sem data, valor negativo e vencimento vazio', () => {
    expect(validarFatura({ ...nova, status: 'paga' }, [])).toBe('Fatura paga precisa da data de pagamento.');
    expect(validarFatura({ ...nova, valor: -1 }, [])).toBe('O valor não pode ser negativo.');
    expect(validarFatura({ ...nova, valor: Number.NaN }, [])).toBe('Informe o valor.');
    expect(validarFatura({ ...nova, vencimento: '' }, [])).toBe('Informe o vencimento.');
  });
});
