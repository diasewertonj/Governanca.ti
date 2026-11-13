// Fase 10 · C1: indicadores do atendimento (chamados de suporte) para o Início da T.I.
import type { CausaChamado, EventoChamado, Ticket } from '../types/index.ts';
import { chamadoEncerrado } from './atendimento.ts';
import { minutosUteisEntre, situacaoSla, type PrazosSla } from './sla.ts';

export const JANELA_DIAS = 90;

export interface IndicadoresAtendimento {
  abertos: number;
  atrasados: number;
  encerradosNoMes: number;
  /** médias em minutos úteis (janela de 90 dias); undefined = sem dados */
  mediaPrimeiraRespostaMin?: number;
  mediaSolucaoMin?: number;
  /** % dos encerrados (90 dias) dentro do prazo */
  pctNoPrazo?: number;
  avaliacaoMedia?: number;
  avaliacoes: number;
  reabertos: number;
  topCausas: { causa: CausaChamado; total: number }[];
  topEquipamentos: { ativoId: string; total: number }[];
}

const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : undefined);

function top<K extends string>(chaves: K[], n = 5): { chave: K; total: number }[] {
  const cont = new Map<K, number>();
  for (const k of chaves) cont.set(k, (cont.get(k) || 0) + 1);
  return [...cont.entries()]
    .map(([chave, total]) => ({ chave, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

export function indicadoresAtendimento(
  tickets: Ticket[],
  eventos: Record<string, Pick<EventoChamado, 'tipo' | 'de' | 'para' | 'criadoEm'>[]>,
  prazos: PrazosSla,
  agora: Date = new Date()
): IndicadoresAtendimento {
  const suporte = tickets.filter((t) => t.tipo === 'suporte');
  const desde = new Date(agora.getTime() - JANELA_DIAS * 86400000);
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const sla = (t: Ticket) => situacaoSla(t, eventos[t.id] || [], prazos, agora);

  const abertos = suporte.filter((t) => !chamadoEncerrado(t));
  const recentes = suporte.filter((t) => new Date(t.dataCriacao) >= desde);
  const encerradosJanela = suporte.filter(
    (t) => t.status === 'resolvido' && t.resolucao?.resolvidoEm && new Date(t.resolucao.resolvidoEm) >= desde
  );

  const primeiras = recentes
    .filter((t) => t.primeiraRespostaEm)
    .map((t) => minutosUteisEntre(new Date(t.dataCriacao), new Date(t.primeiraRespostaEm as string)));
  const solucoes = encerradosJanela.map((t) =>
    minutosUteisEntre(new Date(t.dataCriacao), new Date(t.resolucao?.resolvidoEm as string))
  );
  const noPrazo = encerradosJanela.filter((t) => sla(t)?.solucao.estado === 'cumprido').length;
  const notas = encerradosJanela.flatMap((t) => (t.avaliacao ? [t.avaliacao.nota] : []));

  return {
    abertos: abertos.length,
    atrasados: abertos.filter((t) => sla(t)?.solucao.estado === 'atrasado').length,
    encerradosNoMes: suporte.filter(
      (t) => t.status === 'resolvido' && t.resolucao?.resolvidoEm && new Date(t.resolucao.resolvidoEm) >= inicioMes
    ).length,
    mediaPrimeiraRespostaMin: media(primeiras),
    mediaSolucaoMin: media(solucoes),
    pctNoPrazo: encerradosJanela.length ? Math.round((noPrazo / encerradosJanela.length) * 100) : undefined,
    avaliacaoMedia: media(notas),
    avaliacoes: notas.length,
    reabertos: recentes.filter((t) => (t.reaberturas || 0) > 0).length,
    topCausas: top(encerradosJanela.map((t) => t.resolucao!.causa)).map(({ chave, total }) => ({ causa: chave, total })),
    topEquipamentos: top(recentes.flatMap((t) => (t.ativoId ? [t.ativoId] : []))).map(({ chave, total }) => ({
      ativoId: chave,
      total,
    })),
  };
}
