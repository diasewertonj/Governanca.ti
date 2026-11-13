import { describe, expect, it } from 'vitest';
import { erroDuplicadoAtivo, proximaTag } from './patrimonio.ts';

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
