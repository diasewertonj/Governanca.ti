import { describe, expect, it } from 'vitest';
import type { TicketMessage } from '../types/index.ts';
import { inicial, mensagensDaConversa } from './conversa.ts';

const msg = (id: string, extra: Partial<TicketMessage>): TicketMessage =>
  ({ id, autorId: 'emp-2', autorNome: 'RH', autorRole: 'rh', texto: '', ehNotaInterna: false, data: '2026-11-12', ...extra }) as TicketMessage;

describe('conversa do chamado', () => {
  const base = { descricao: 'A impressora está mastigando papel', solicitanteId: 'emp-2' };

  it('não repete a descrição como 1ª mensagem', () => {
    const mensagens = [msg('m1', { texto: 'A impressora está mastigando papel ' }), msg('m2', { autorId: 'emp-1', texto: 'Vou ver' })];
    expect(mensagensDaConversa({ ...base, mensagens }, true).map((m) => m.id)).toEqual(['m2']);
  });

  it('mantém a 1ª mensagem quando ela é diferente da descrição ou de outra pessoa', () => {
    expect(mensagensDaConversa({ ...base, mensagens: [msg('m1', { texto: 'Outro texto' })] }, true)).toHaveLength(1);
    expect(
      mensagensDaConversa({ ...base, mensagens: [msg('m1', { autorId: 'emp-1', texto: base.descricao })] }, true)
    ).toHaveLength(1);
  });

  it('só repete-se a 1ª: uma mensagem igual mais adiante continua', () => {
    const mensagens = [msg('m1', { texto: 'oi' }), msg('m2', { texto: base.descricao })];
    expect(mensagensDaConversa({ ...base, mensagens }, true).map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('nota interna só para quem pode ver', () => {
    const mensagens = [msg('m1', { texto: 'nota', ehNotaInterna: true, autorId: 'emp-1' })];
    expect(mensagensDaConversa({ ...base, mensagens }, false)).toEqual([]);
    expect(mensagensDaConversa({ ...base, mensagens }, true)).toHaveLength(1);
  });

  it('inicial do nome', () => {
    expect(inicial(' beatriz')).toBe('B');
    expect(inicial('')).toBe('?');
  });
});
