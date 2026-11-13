import { describe, expect, it } from 'vitest';
import {
  duracaoUtil,
  minutosUteisEntre,
  pausas,
  PRAZOS_PADRAO,
  prazosEfetivos,
  seloSla,
  situacaoSla,
  somarMinutosUteis,
} from './sla.ts';

// 16/11/2026 é segunda-feira (horário local)
const d = (dia: number, h: number, m = 0) => new Date(2026, 10, dia, h, m);

describe('horário comercial', () => {
  it('conta só seg–sex, 8h–18h', () => {
    expect(minutosUteisEntre(d(16, 9), d(16, 11))).toBe(120);
    expect(minutosUteisEntre(d(16, 17), d(17, 9))).toBe(120); // 17h–18h + 8h–9h
    expect(minutosUteisEntre(d(20, 17), d(23, 9))).toBe(120); // sexta → segunda
    expect(minutosUteisEntre(d(21, 10), d(22, 15))).toBe(0); // fim de semana
    expect(minutosUteisEntre(d(16, 6), d(16, 7))).toBe(0);
  });
  it('soma minutos úteis pulando noite e fim de semana', () => {
    expect(somarMinutosUteis(d(16, 9), 60)).toEqual(d(16, 10));
    expect(somarMinutosUteis(d(16, 17), 120)).toEqual(d(17, 9));
    expect(somarMinutosUteis(d(20, 17), 120)).toEqual(d(23, 9));
    expect(somarMinutosUteis(d(21, 10), 30)).toEqual(d(23, 8, 30)); // aberto no sábado
    expect(somarMinutosUteis(d(16, 20), 600)).toEqual(d(17, 18));
  });
});

describe('prazos', () => {
  it('configuração por cima do padrão', () => {
    const p = prazosEfetivos({ critica: { solucao: 120 } });
    expect(p.critica).toEqual({ resposta: 60, solucao: 120 });
    expect(p.baixa).toEqual(PRAZOS_PADRAO.baixa);
  });

  const base = { tipo: 'suporte' as const, prioridade: 'critica' as const, dataCriacao: d(16, 9).toISOString() };

  it('no prazo, vence logo e atrasado', () => {
    expect(situacaoSla({ ...base, status: 'aberto' }, [], PRAZOS_PADRAO, d(16, 9, 30))!.solucao.estado).toBe('no_prazo');
    expect(situacaoSla({ ...base, status: 'aberto' }, [], PRAZOS_PADRAO, d(16, 12, 30))!.solucao.estado).toBe('vence_logo');
    const atrasado = situacaoSla({ ...base, status: 'em_andamento' }, [], PRAZOS_PADRAO, d(16, 14))!;
    expect(atrasado.solucao.estado).toBe('atrasado');
    expect(seloSla(atrasado)).toBe('Atrasado 1h');
  });

  it('1ª resposta no prazo ou atrasada', () => {
    const ok = situacaoSla({ ...base, status: 'em_andamento', primeiraRespostaEm: d(16, 9, 40).toISOString() }, [], PRAZOS_PADRAO, d(16, 11))!;
    expect(ok.resposta.atrasada).toBe(false);
    expect(situacaoSla({ ...base, status: 'aberto' }, [], PRAZOS_PADRAO, d(16, 11))!.resposta.atrasada).toBe(true);
  });

  it('"aguardando" pausa o prazo de solução', () => {
    const eventos = [
      { tipo: 'status' as const, de: 'aberto', para: 'aguardando_terceiro', criadoEm: d(16, 10).toISOString() },
      { tipo: 'status' as const, de: 'aguardando_terceiro', para: 'em_andamento', criadoEm: d(16, 15).toISOString() },
    ];
    expect(pausas(eventos)).toHaveLength(1);
    const s = situacaoSla({ ...base, status: 'em_andamento' }, eventos, PRAZOS_PADRAO, d(16, 16))!;
    expect(s.solucao.vence).toEqual(d(16, 18)); // 9h + 4h de prazo + 5h pausadas
    expect(s.solucao.estado).toBe('no_prazo');
    const pausado = situacaoSla({ ...base, status: 'aguardando_terceiro' }, eventos.slice(0, 1), PRAZOS_PADRAO, d(16, 16))!;
    expect(pausado.solucao.estado).toBe('pausado');
  });

  it('encerrado: no prazo ou fora do prazo; processos e cancelados ficam de fora', () => {
    const resolvido = (h: number) =>
      situacaoSla(
        { ...base, status: 'resolvido', resolucao: { causa: 'hardware', solucao: 'x', tipo: 'definitiva', resolvidoEm: d(16, h).toISOString() } },
        [],
        PRAZOS_PADRAO
      )!.solucao.estado;
    expect(resolvido(12)).toBe('cumprido');
    expect(resolvido(15)).toBe('fora_do_prazo');
    expect(situacaoSla({ ...base, tipo: 'onboarding', status: 'aberto' }, [], PRAZOS_PADRAO)).toBeNull();
    expect(situacaoSla({ ...base, status: 'cancelado' }, [], PRAZOS_PADRAO)).toBeNull();
  });

  it('textos de duração', () => {
    expect(duracaoUtil(90)).toBe('1h 30min');
    expect(duracaoUtil(600)).toBe('1 dia útil');
    expect(duracaoUtil(1500)).toBe('2,5 dias úteis');
  });
});
