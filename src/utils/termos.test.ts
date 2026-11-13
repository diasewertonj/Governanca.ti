import { describe, expect, it } from 'vitest';
import { erroCancelarTermo, erroConferenciaTermo, situacaoTermo, termoAberto } from './termos.ts';

const base = { statusAssinatura: 'gerado' as const, formaAssinatura: 'pendente' as const };

describe('situação do termo', () => {
  it('pendente, parcial e assinado', () => {
    expect(situacaoTermo(base).rotulo).toBe('Pendente de assinatura');
    expect(situacaoTermo(base, true).rotulo).toBe('Aguardando sua assinatura');
    expect(situacaoTermo({ ...base, aceiteColaboradorEm: 'x' }, true).rotulo).toBe('Você assinou; falta a T.I.');
    expect(situacaoTermo({ ...base, aceiteTiEm: 'x' }).rotulo).toBe('Falta a assinatura do colaborador');
    expect(situacaoTermo({ statusAssinatura: 'assinado', formaAssinatura: 'eletronica' }).tom).toBe('ok');
    expect(situacaoTermo({ statusAssinatura: 'assinado', formaAssinatura: 'documento' }).rotulo).toBe('Assinado (documento)');
    expect(situacaoTermo({ ...base, formaAssinatura: 'dispensada' }).rotulo).toBe('Assinatura dispensada');
  });
  it('cancelado e substituído vencem qualquer assinatura', () => {
    expect(situacaoTermo({ statusAssinatura: 'assinado', formaAssinatura: 'eletronica', canceladoEm: 'x' }).rotulo).toBe('Cancelado');
    expect(situacaoTermo({ ...base, canceladoEm: 'x', substituidoPor: 't2' }, false, '#TR-2').rotulo).toBe('Substituído por #TR-2');
    expect(termoAberto({ ...base, canceladoEm: 'x' })).toBe(false);
    expect(termoAberto(base)).toBe(true);
  });
  it('conferência: condição de cada item entregue e confirmação', () => {
    const linhas = [
      { descricao: 'Notebook', situacao: 'entregue' as const },
      { descricao: 'Mouse', situacao: 'pendente' as const },
    ];
    expect(erroConferenciaTermo(linhas, true)).toMatch(/Notebook/);
    expect(erroConferenciaTermo([{ ...linhas[0], condicao: 'bom' as const }, linhas[1]], false)).toMatch(/conferiu/);
    expect(erroConferenciaTermo([{ ...linhas[0], condicao: 'avaria' as const }, linhas[1]], true)).toBeNull();
    expect(erroConferenciaTermo([], true)).toMatch(/itens/);
  });
  it('cancelar exige motivo', () => {
    expect(erroCancelarTermo('x')).toMatch(/motivo/);
    expect(erroCancelarTermo('Itens errados')).toBeNull();
  });
});
