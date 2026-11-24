import { describe, expect, it } from 'vitest';
import { erroAjusteAssentos, erroLicenca, historicoAssentos, licencaAtiva, quantidadeContratadaDaLicenca, valorProporcional } from './licencas.ts';
import type { Contrato } from '../types/index.ts';

const base = {
  nome: 'Figma',
  fornecedorId: 'f-1',
  assentosTotais: 5,
  emUso: 2,
  dataRenovacao: '2027-01-01',
  renovacaoMudou: true,
  pagaPorContrato: false,
};
const hoje = '2026-11-13';

describe('formulário de licença', () => {
  it('exige fornecedor do cadastro e assentos >= em uso', () => {
    expect(erroLicenca({ ...base, fornecedorId: '' }, hoje)).toMatch(/fornecedor/);
    expect(erroLicenca({ ...base, assentosTotais: 1 }, hoje)).toMatch(/2 em uso/);
    expect(erroLicenca(base, hoje)).toBeNull();
  });
  it('renovação futura só quando tem custo próprio e a data mudou', () => {
    expect(erroLicenca({ ...base, dataRenovacao: '2026-01-01' }, hoje)).toMatch(/renovação/);
    expect(erroLicenca({ ...base, dataRenovacao: '2026-01-01', renovacaoMudou: false }, hoje)).toBeNull();
    expect(erroLicenca({ ...base, dataRenovacao: '2026-01-01', pagaPorContrato: true }, hoje)).toBeNull();
  });
  it('situação e histórico', () => {
    expect(licencaAtiva({})).toBe(true);
    expect(licencaAtiva({ status: 'inativa' })).toBe(false);
    const h = historicoAssentos(
      [
        { id: '1', licencaId: 'l', colaboradorId: 'a', inicio: '2026-01-01', fim: '2026-02-01' },
        { id: '2', licencaId: 'l', colaboradorId: 'b', inicio: '2026-03-01' },
        { id: '3', licencaId: 'x', colaboradorId: 'a', inicio: '2026-03-01' },
      ],
      { licencaId: 'l' }
    );
    expect(h.map((a) => a.id)).toEqual(['2', '1']);
  });
});

describe('ajuste do total de assentos', () => {
  const lic = { status: 'ativa' as const, assentosTotais: 10, assentosAlocados: 4, formaCobranca: 'contrato' as const };
  const d = { licenca: lic, total: 12, motivo: 'Nova equipe', papel: 'ti_admin', quantidadeContratada: 12 as number | null };

  it('só o administrador ajusta', () => {
    expect(erroAjusteAssentos({ ...d, papel: 'ti_suporte' })).toMatch(/Só o administrador/);
    expect(erroAjusteAssentos({ ...d, papel: 'compras' })).toMatch(/Só o administrador/);
    expect(erroAjusteAssentos(d)).toBeNull();
  });
  it('exige motivo, licença ativa e total não abaixo do em uso', () => {
    expect(erroAjusteAssentos({ ...d, motivo: 'ok' })).toMatch(/motivo/);
    expect(erroAjusteAssentos({ ...d, licenca: { ...lic, status: 'inativa' } })).toMatch(/inativa/);
    expect(erroAjusteAssentos({ ...d, total: 3 })).toMatch(/4 em uso/);
  });
  it('por contrato recusa acima do contratado e aceita dentro', () => {
    expect(erroAjusteAssentos({ ...d, total: 13 })).toMatch(/Acima do contratado \(12\)/);
    expect(erroAjusteAssentos({ ...d, total: 13, quantidadeContratada: null })).toBeNull();
  });
  it('cobrança própria pede o novo valor', () => {
    const propria = { ...lic, formaCobranca: 'propria' as const };
    expect(erroAjusteAssentos({ ...d, licenca: propria })).toMatch(/valor mensal/);
    expect(erroAjusteAssentos({ ...d, licenca: propria, valorMensal: 120 })).toBeNull();
  });
  it('sugere o valor proporcional em centavos', () => {
    expect(valorProporcional(100, 10, 12)).toBe(120);
    expect(valorProporcional(99.9, 7, 10)).toBe(142.71);
  });
  it('quantidade contratada vem do contrato aberto mais recente', () => {
    const c = (id: string, inicio: string, status: 'ativo' | 'encerrado', q?: number) =>
      ({ id, inicio, status, itens: [{ licencaId: 'l1', quantidadeContratada: q }] }) as unknown as Contrato;
    expect(quantidadeContratadaDaLicenca('l1', [c('a', '2025-01-01', 'ativo', 5), c('b', '2026-01-01', 'ativo', 8), c('c', '2027-01-01', 'encerrado', 99)])).toBe(8);
    expect(quantidadeContratadaDaLicenca('l1', [c('a', '2025-01-01', 'ativo')])).toBeNull();
  });
});