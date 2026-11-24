import { describe, expect, it } from 'vitest';
import { depreciacao, erroDuplicadoAtivo, proximaTag } from './patrimonio.ts';

describe('depreciação após a baixa', () => {
  const fiscal = { valorCompra: 1200, dataAquisicao: '2025-01-01' } as never;
  const baixa = { id: 'b1', ativoId: 'a', dataBaixa: '2025-07-01', motivo: 'defeito', destino: 'descarte', criadoEm: '2025-07-01' } as never;
  it('para na data da baixa; ativo em uso segue até hoje; baixa estornada não conta', () => {
    const ativo = { fiscal, categoria: 'hardware' as const };
    const emUso = depreciacao(ativo, undefined, '2026-01-01').acumulada;
    const baixado = depreciacao({ ...ativo, status: 'descartado', baixas: [baixa] }, undefined, '2026-01-01').acumulada;
    const estornado = depreciacao({ ...ativo, status: 'disponivel', baixas: [{ ...(baixa as object), estornadaEm: '2025-08-01' } as never] }, undefined, '2026-01-01').acumulada;
    expect(baixado).toBeLessThan(emUso);
    expect(baixado).toBe(depreciacao(ativo, undefined, '2025-07-01').acumulada);
    expect(estornado).toBe(emUso);
  });
});

describe('tag de patrimônio', () => {
  it('próxima = maior número + 1, mesmo com buracos e fora de ordem', () => {
    expect(proximaTag([{ tag: '#PAT-1041' }, { tag: '#PAT-1050' }, { tag: '#PAT-1043' }])).toBe('#PAT-1051');
    expect(proximaTag([{ tag: 'NB-009' }])).toBe('NB-010');
    expect(proximaTag([])).toBe('#PAT-0001');
    expect(proximaTag([{ tag: 'sem número' }])).toBe('#PAT-0001');
  });
  it('recusa tag ou série repetidas (ignora o próprio ativo na edição)', () => {
    const ativos = [{ id: 'a1', tag: '#PAT-1', serialNumber: 'SN 123' }];
    expect(erroDuplicadoAtivo(ativos, '#pat-1', 'X', undefined)).toMatch(/tag/);
    expect(erroDuplicadoAtivo(ativos, '#PAT-2', 'sn123', undefined)).toMatch(/série/);
    expect(erroDuplicadoAtivo(ativos, '#PAT-1', 'SN 123', 'a1')).toBeNull();
  });
});
