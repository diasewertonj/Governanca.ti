import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmarDescarte } from './BarraAlteracoes.tsx';

describe('confirmarDescarte (Fase 5: nada se perde sem perguntar)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sem alterações pendentes, segue sem perguntar', async () => {
    const confirm = vi.fn();
    vi.stubGlobal('window', { confirm });
    expect(await confirmarDescarte([])).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('com alterações, pergunta e lista o que será perdido', async () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal('window', { confirm });
    expect(await confirmarDescarte(['Status: Aberto → Resolvido', 'Papel de Ana: Colaborador → Admin T.I.'])).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    const texto = confirm.mock.calls[0][0] as string;
    expect(texto).toContain('2 alterações não salvas');
    expect(texto).toContain('Status: Aberto → Resolvido');
    expect(texto).toContain('Papel de Ana');
  });

  it('descarta quando a pessoa confirma', async () => {
    vi.stubGlobal('window', { confirm: vi.fn().mockReturnValue(true) });
    expect(await confirmarDescarte(['Setor TI: inativar'])).toBe(true);
  });
});
