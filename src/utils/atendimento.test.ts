import { describe, expect, it } from 'vitest';
import {
  descreverEvento,
  erroCancelamento,
  erroResolucao,
  formatarTempo,
  podeAvaliar,
  podeCancelar,
  podeReabrirChamado,
  rotuloSituacao,
} from './atendimento.ts';

describe('registrar solução', () => {
  const ok = { causa: 'hardware' as const, solucao: 'Troquei o rolo de tração', tipo: 'definitiva' as const };
  it('aceita solução completa', () => expect(erroResolucao(ok)).toBeNull());
  it('exige causa, solução de 10+ caracteres e tipo', () => {
    expect(erroResolucao({ ...ok, causa: undefined })).toMatch(/causa/);
    expect(erroResolucao({ ...ok, solucao: 'ok' })).toMatch(/10 caracteres/);
    expect(erroResolucao({ ...ok, tipo: undefined })).toMatch(/definitiva ou paliativa/);
  });
  it('paliativa exige próximo passo; tempo não pode ser negativo', () => {
    expect(erroResolucao({ ...ok, tipo: 'paliativa' })).toMatch(/próximo passo/);
    expect(erroResolucao({ ...ok, tipo: 'paliativa', proximoPasso: 'Trocar a peça' })).toBeNull();
    expect(erroResolucao({ ...ok, tempoMin: -5 })).toMatch(/Tempo/);
  });
});

describe('cancelar, reabrir e avaliar', () => {
  const t = { status: 'aberto' as const, solicitanteId: 'emp-1', tipo: 'suporte' as const };
  it('cancelar: quem abriu só antes do atendimento; T.I. sempre que em aberto', () => {
    expect(podeCancelar(t, 'colaborador', 'emp-1')).toBe(true);
    expect(podeCancelar({ ...t, status: 'em_andamento' }, 'colaborador', 'emp-1')).toBe(false);
    expect(podeCancelar({ ...t, status: 'em_andamento' }, 'ti_suporte', 'emp-9')).toBe(true);
    expect(podeCancelar({ ...t, status: 'resolvido' }, 'ti_admin')).toBe(false);
    expect(erroCancelamento('', '')).toMatch(/motivo/);
    expect(erroCancelamento('outro', ' ')).toMatch(/descreva/);
    expect(erroCancelamento('engano', '')).toBeNull();
  });
  it('reabrir: suporte encerrado, por quem abriu ou T.I.', () => {
    const fechado = { ...t, status: 'resolvido' as const };
    expect(podeReabrirChamado(fechado, 'colaborador', 'emp-1')).toBe(true);
    expect(podeReabrirChamado(fechado, 'colaborador', 'emp-2')).toBe(false);
    expect(podeReabrirChamado(fechado, 'ti_suporte')).toBe(true);
    expect(podeReabrirChamado({ ...fechado, tipo: 'onboarding' }, 'ti_suporte')).toBe(false);
    expect(podeReabrirChamado(t, 'colaborador', 'emp-1')).toBe(false);
  });
  it('avaliar: só quem abriu, encerrado', () => {
    expect(podeAvaliar({ status: 'resolvido', solicitanteId: 'emp-1' }, 'emp-1')).toBe(true);
    expect(podeAvaliar({ status: 'resolvido', solicitanteId: 'emp-1' }, 'emp-2')).toBe(false);
    expect(podeAvaliar({ status: 'aberto', solicitanteId: 'emp-1' }, 'emp-1')).toBe(false);
  });
});

describe('textos', () => {
  it('situação com o motivo da espera', () => {
    expect(rotuloSituacao({ status: 'aguardando_terceiro', aguardandoMotivo: 'fornecedor' })).toBe('Aguardando fornecedor');
    expect(rotuloSituacao({ status: 'resolvido' })).toBe('Encerrado');
  });
  it('tempo e histórico', () => {
    expect(formatarTempo(80)).toBe('1h 20min');
    expect(formatarTempo(40)).toBe('40min');
    expect(formatarTempo(120)).toBe('2h');
    expect(descreverEvento({ tipo: 'tecnico', para: 'Carlos' })).toBe('Técnico: nenhum → Carlos');
    expect(descreverEvento({ tipo: 'status', de: 'aberto', para: 'aguardando_terceiro', detalhe: 'peca' })).toBe(
      'Status: Aberto → Aguardando peça'
    );
    expect(descreverEvento({ tipo: 'cancelado', detalhe: 'engano' })).toBe('Cancelado: Aberto por engano');
    expect(descreverEvento({ tipo: 'avaliado', para: '5' })).toBe('Avaliado com 5 de 5');
  });
});
