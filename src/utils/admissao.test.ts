import { describe, expect, it } from 'vitest';
import type { SoftwareLicense } from '../types/index.ts';
import { assentosLivres, descricaoAdmissao, licencaDaConta, normalizarNome } from './admissao.ts';

const lic = (id: string, nome: string, total = 10, usados = 3) =>
  ({ id, nome, assentosTotais: total, assentosAlocados: usados, colaboradoresIds: [] }) as unknown as SoftwareLicense;

describe('descrição curta da admissão', () => {
  it('nome, cargo, setor, início e gestor', () => {
    expect(descricaoAdmissao({ nome: 'Tiana de Souza', cargo: 'Analista', setor: 'Faturamento', inicio: '16/11/2026', gestor: 'Ana' })).toBe(
      'Admissão de Tiana de Souza · Analista · Faturamento. Início em 16/11/2026; gestor: Ana.'
    );
    expect(descricaoAdmissao({ nome: 'Bia', cargo: 'Dev', inicio: '01/12/2026' })).toBe('Admissão de Bia · Dev. Início em 01/12/2026.');
  });
});

describe('conta ↔ licença', () => {
  const licencas = [lic('m', 'Microsoft 365 E5 Enterprise'), lic('g', 'Google Workspace Enterprise Plus'), lic('s', 'Slack')];
  it('normaliza acentos e pontuação', () => expect(normalizarNome('Área-Fiscal 365!')).toBe('area fiscal 365'));
  it('casa pelo nome exato ou pelo começo do nome', () => {
    expect(licencaDaConta('Slack', licencas)?.id).toBe('s');
    expect(licencaDaConta('Microsoft 365', licencas)?.id).toBe('m');
    expect(licencaDaConta('google workspace', licencas)?.id).toBe('g');
  });
  it('não chuta: sem correspondência ou ambígua', () => {
    expect(licencaDaConta('VPN', licencas)).toBeUndefined();
    expect(licencaDaConta('Microsoft', [lic('a', 'Microsoft 365'), lic('b', 'Microsoft Teams Rooms')])).toBeUndefined();
    expect(licencaDaConta('', licencas)).toBeUndefined();
  });
  it('assentos livres', () => {
    expect(assentosLivres({ assentosTotais: 5, assentosAlocados: 5 })).toBe(0);
    expect(assentosLivres({ assentosTotais: 5, assentosAlocados: 2 })).toBe(3);
  });
});
