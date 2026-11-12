import { describe, expect, it } from 'vitest';
import { dataDoLembrete, dataLocal, getWarrantyStatus, isoLocal } from './formatters.ts';

// 12/11/2026 às 22h no horário local: perto da virada do dia, onde o erro de UTC aparecia
const agora = new Date(2026, 10, 12, 22, 0, 0);

describe('getWarrantyStatus', () => {
  it('lê a data como local, sem perder um dia', () => {
    expect(dataLocal('2026-12-01').getDate()).toBe(1);
    expect(getWarrantyStatus('2026-11-13', agora)).toMatchObject({ status: 'expirando', diasRestantes: 1 });
    expect(getWarrantyStatus('2026-11-12', agora)).toMatchObject({ status: 'expirando', diasRestantes: 0 });
  });

  it('separa "sem data" de "expirada"', () => {
    expect(getWarrantyStatus(undefined, agora).status).toBe('sem_data');
    expect(getWarrantyStatus('', agora).status).toBe('sem_data');
    expect(getWarrantyStatus('2026-11-11', agora)).toMatchObject({ status: 'expirada', diasRestantes: -1 });
  });

  it('alerta até 30 dias antes e considera válida depois disso', () => {
    expect(getWarrantyStatus('2026-12-12', agora)).toMatchObject({ status: 'expirando', diasRestantes: 30 });
    expect(getWarrantyStatus('2026-12-13', agora)).toMatchObject({ status: 'valida', diasRestantes: 31 });
  });
});

describe('isoLocal e dataDoLembrete', () => {
  it('usa o dia local, não o de UTC', () => {
    expect(isoLocal(agora)).toBe('2026-11-12');
  });

  it('marca o lembrete N dias antes do prazo, mas nunca antes de hoje', () => {
    expect(dataDoLembrete('2027-01-31', 30, agora)).toBe('2027-01-01');
    expect(dataDoLembrete('2026-11-20', 30, agora)).toBe('2026-11-12');
    expect(dataDoLembrete('2026-10-01', 15, agora)).toBe('2026-11-12');
  });
});
