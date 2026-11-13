import { describe, expect, it } from 'vitest';
import { erroLicenca, historicoAssentos, licencaAtiva } from './licencas.ts';

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
