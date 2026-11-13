import { describe, expect, it } from 'vitest';
import type { Ticket } from '../types/index.ts';
import { indicadoresAtendimento } from './indicadores.ts';
import { PRAZOS_PADRAO } from './sla.ts';

const d = (dia: number, h: number) => new Date(2026, 10, dia, h).toISOString();
const agora = new Date(2026, 10, 20, 12); // sexta 20/11/2026

const tk = (id: string, extra: Partial<Ticket>): Ticket =>
  ({ id, tipo: 'suporte', prioridade: 'critica', status: 'aberto', dataCriacao: d(16, 9), mensagens: [], ...extra }) as Ticket;

describe('indicadores do atendimento', () => {
  const tickets = [
    tk('a', { status: 'em_andamento', ativoId: 'at-1', primeiraRespostaEm: d(16, 10) }), // atrasado (crítica, 4h)
    tk('b', { status: 'aberto', dataCriacao: d(20, 11), ativoId: 'at-1' }),
    tk('c', {
      status: 'resolvido',
      ativoId: 'at-2',
      primeiraRespostaEm: d(16, 9),
      avaliacao: { nota: 4 },
      reaberturas: 1,
      resolucao: { causa: 'hardware', solucao: 'x', tipo: 'definitiva', resolvidoEm: d(16, 11) },
    }),
    tk('d', {
      status: 'resolvido',
      resolucao: { causa: 'hardware', solucao: 'x', tipo: 'definitiva', resolvidoEm: d(17, 15) },
      avaliacao: { nota: 2 },
    }),
    tk('e', { tipo: 'onboarding', status: 'aberto' }),
    tk('f', { status: 'cancelado' }),
  ];
  const i = indicadoresAtendimento(tickets, {}, PRAZOS_PADRAO, agora);

  it('contagens', () => {
    expect(i.abertos).toBe(2);
    expect(i.atrasados).toBe(1);
    expect(i.encerradosNoMes).toBe(2);
    expect(i.reabertos).toBe(1);
  });

  it('médias e prazo', () => {
    expect(i.mediaPrimeiraRespostaMin).toBe(30); // (60 + 0) / 2
    expect(i.mediaSolucaoMin).toBe((120 + 960) / 2);
    expect(i.pctNoPrazo).toBe(50);
    expect(i.avaliacaoMedia).toBe(3);
    expect(i.avaliacoes).toBe(2);
  });

  it('rankings', () => {
    expect(i.topCausas).toEqual([{ causa: 'hardware', total: 2 }]);
    expect(i.topEquipamentos[0]).toEqual({ ativoId: 'at-1', total: 2 });
  });

  it('sem chamados', () => {
    const v = indicadoresAtendimento([], {}, PRAZOS_PADRAO, agora);
    expect(v.pctNoPrazo).toBeUndefined();
    expect(v.mediaSolucaoMin).toBeUndefined();
  });
});
