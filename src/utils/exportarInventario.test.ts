import { describe, expect, it } from 'vitest';
import { COLUNAS_ACESSORIO, colunasDoNivel, montarAba, type Contexto } from './exportarInventario.ts';
import { dentroDoPeriodo, periodoDoAtalho } from '../components/ui/FiltroPeriodo.tsx';
import type { ItemEstoque } from '../types/index.ts';

const ctx = (veValores: boolean): Contexto => ({ pessoas: [], areas: [], contratos: [], limite: 1200, veValores });
const item: ItemEstoque = { id: 'i1', nome: 'Mouse', tipo: 'mouse', quantidade: 4, minimo: 1, valorUnitario: 50, ativo: true };

describe('exportar inventário', () => {
  it('nível Básico não traz colunas financeiras; Financeiro traz', () => {
    expect(colunasDoNivel(COLUNAS_ACESSORIO, 'basico')).not.toContain('total');
    expect(colunasDoNivel(COLUNAS_ACESSORIO, 'financeiro')).toContain('total');
  });
  it('acessório: custo total = quantidade × unitário; fora da T.I. sai vazio', () => {
    const cols = ['nome', 'total'];
    expect(montarAba(COLUNAS_ACESSORIO, cols, [item], ctx(true)).linhas[0]).toEqual(['Mouse', 200]);
    expect(montarAba(COLUNAS_ACESSORIO, cols, [item], ctx(false)).linhas[0]).toEqual(['Mouse', '']);
  });
});

describe('período comum', () => {
  const hoje = new Date(2027, 2, 15);
  it('próximo mês e próximo ano', () => {
    expect(periodoDoAtalho('proximo_mes', hoje)).toEqual({ de: '2027-04-01', ate: '2027-04-30' });
    expect(periodoDoAtalho('proximo_ano', hoje)).toEqual({ de: '2028-01-01', ate: '2028-12-31' });
    expect(periodoDoAtalho('todos', hoje)).toBeNull();
  });
  it('dentro do período aceita data com hora; sem período passa tudo', () => {
    const p = { de: '2027-03-01', ate: '2027-03-31' };
    expect(dentroDoPeriodo('2027-03-31T23:00:00Z', p)).toBe(true);
    expect(dentroDoPeriodo('2027-04-01', p)).toBe(false);
    expect(dentroDoPeriodo(undefined, p)).toBe(false);
    expect(dentroDoPeriodo(undefined, null)).toBe(true);
  });
});
