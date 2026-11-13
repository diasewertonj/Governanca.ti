// Fase 10 · C1: prazos de atendimento (SLA) em horário comercial.
// Seg–sex, 8h–18h (horário do navegador). "Aguardando" pausa o prazo de solução.
import type { EventoChamado, Ticket, TicketPriority } from '../types/index.ts';

export const HORA_INICIO = 8;
export const HORA_FIM = 18;
export const MINUTOS_DIA_UTIL = (HORA_FIM - HORA_INICIO) * 60;

export interface PrazoPrioridade {
  /** minutos úteis até a 1ª resposta */
  resposta: number;
  /** minutos úteis até a solução */
  solucao: number;
}
export type PrazosSla = Record<TicketPriority, PrazoPrioridade>;

export const PRAZOS_PADRAO: PrazosSla = {
  critica: { resposta: 60, solucao: 240 },
  alta: { resposta: 240, solucao: MINUTOS_DIA_UTIL },
  media: { resposta: MINUTOS_DIA_UTIL, solucao: 3 * MINUTOS_DIA_UTIL },
  baixa: { resposta: MINUTOS_DIA_UTIL, solucao: 5 * MINUTOS_DIA_UTIL },
};

/** Prazos configurados por cima do padrão (o que faltar usa o padrão) */
export function prazosEfetivos(config?: Partial<Record<TicketPriority, Partial<PrazoPrioridade>>> | null): PrazosSla {
  const r = { ...PRAZOS_PADRAO };
  for (const p of Object.keys(PRAZOS_PADRAO) as TicketPriority[]) {
    r[p] = { ...PRAZOS_PADRAO[p], ...(config?.[p] || {}) };
  }
  return r;
}

const ehDiaUtil = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
const comHora = (d: Date, h: number) => {
  const x = new Date(d);
  x.setHours(h, 0, 0, 0);
  return x;
};

/** Minutos dentro do horário comercial entre duas datas */
export function minutosUteisEntre(a: Date, b: Date): number {
  if (b <= a) return 0;
  let total = 0;
  const dia = comHora(a, 0);
  while (dia < b) {
    if (ehDiaUtil(dia)) {
      const s = Math.max(comHora(dia, HORA_INICIO).getTime(), a.getTime());
      const e = Math.min(comHora(dia, HORA_FIM).getTime(), b.getTime());
      if (e > s) total += (e - s) / 60000;
    }
    dia.setDate(dia.getDate() + 1);
  }
  return Math.round(total);
}

/** A data em que se completam N minutos úteis a partir de "inicio" */
export function somarMinutosUteis(inicio: Date, minutos: number): Date {
  let restante = Math.max(0, minutos);
  const cursor = new Date(inicio);
  for (let guarda = 0; guarda < 3700; guarda++) {
    const fim = comHora(cursor, HORA_FIM);
    if (!ehDiaUtil(cursor) || cursor >= fim) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(HORA_INICIO, 0, 0, 0);
      continue;
    }
    const ini = comHora(cursor, HORA_INICIO);
    if (cursor < ini) cursor.setTime(ini.getTime());
    const disponivel = (fim.getTime() - cursor.getTime()) / 60000;
    if (restante <= disponivel) return new Date(cursor.getTime() + restante * 60000);
    restante -= disponivel;
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(HORA_INICIO, 0, 0, 0);
  }
  return cursor;
}

/** Intervalos em que o chamado ficou "aguardando" (o último pode estar em aberto) */
export function pausas(eventos: Pick<EventoChamado, 'tipo' | 'de' | 'para' | 'criadoEm'>[]): { inicio: Date; fim?: Date }[] {
  const lista: { inicio: Date; fim?: Date }[] = [];
  const ordenados = [...eventos].sort((x, y) => x.criadoEm.localeCompare(y.criadoEm));
  for (const e of ordenados) {
    const aberta = lista.length && !lista[lista.length - 1].fim ? lista[lista.length - 1] : undefined;
    if (e.para === 'aguardando_terceiro' && !aberta) lista.push({ inicio: new Date(e.criadoEm) });
    else if (aberta && e.de === 'aguardando_terceiro' && e.para !== 'aguardando_terceiro') aberta.fim = new Date(e.criadoEm);
  }
  return lista;
}

export type EstadoSla = 'no_prazo' | 'vence_logo' | 'atrasado' | 'pausado' | 'cumprido' | 'fora_do_prazo';

export interface SituacaoSla {
  resposta: { vence: Date; respondidaEm?: Date; atrasada: boolean };
  solucao: { vence: Date; estado: EstadoSla; restanteMin: number };
}

/** Situação do prazo do chamado (só chamados de suporte não cancelados) */
export function situacaoSla(
  t: Pick<Ticket, 'tipo' | 'status' | 'prioridade' | 'dataCriacao' | 'primeiraRespostaEm' | 'resolucao'>,
  eventos: Pick<EventoChamado, 'tipo' | 'de' | 'para' | 'criadoEm'>[],
  prazos: PrazosSla,
  agora: Date = new Date()
): SituacaoSla | null {
  if (t.tipo !== 'suporte' || t.status === 'cancelado') return null;
  const criado = new Date(t.dataCriacao);
  const prazo = prazos[t.prioridade];
  const fimDaConta = t.status === 'resolvido' && t.resolucao?.resolvidoEm ? new Date(t.resolucao.resolvidoEm) : agora;

  const respondidaEm = t.primeiraRespostaEm ? new Date(t.primeiraRespostaEm) : undefined;
  const venceResposta = somarMinutosUteis(criado, prazo.resposta);
  const respostaAtrasada = respondidaEm ? respondidaEm > venceResposta : agora > venceResposta;

  const pausado = pausas(eventos).reduce((s, p) => s + minutosUteisEntre(p.inicio, p.fim || fimDaConta), 0);
  const venceSolucao = somarMinutosUteis(criado, prazo.solucao + pausado);

  let estado: EstadoSla;
  let restanteMin: number;
  if (t.status === 'resolvido') {
    estado = fimDaConta <= venceSolucao ? 'cumprido' : 'fora_do_prazo';
    restanteMin = 0;
  } else {
    restanteMin = agora <= venceSolucao ? minutosUteisEntre(agora, venceSolucao) : -minutosUteisEntre(venceSolucao, agora);
    if (t.status === 'aguardando_terceiro') estado = 'pausado';
    else if (agora > venceSolucao) estado = 'atrasado';
    else if (restanteMin <= Math.max(60, prazo.solucao * 0.25)) estado = 'vence_logo';
    else estado = 'no_prazo';
  }
  return { resposta: { vence: venceResposta, respondidaEm, atrasada: respostaAtrasada }, solucao: { vence: venceSolucao, estado, restanteMin } };
}

/** "2h 30min", "3 dias úteis" */
export function duracaoUtil(min: number): string {
  const m = Math.abs(Math.round(min));
  if (m >= MINUTOS_DIA_UTIL) {
    const dias = Math.round((m / MINUTOS_DIA_UTIL) * 10) / 10;
    return `${String(dias).replace('.', ',')} ${dias === 1 ? 'dia útil' : 'dias úteis'}`;
  }
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h ${r}min` : `${h}h`) : `${r}min`;
}

export const ROTULO_ESTADO_SLA: Record<EstadoSla, string> = {
  no_prazo: 'No prazo',
  vence_logo: 'Vence logo',
  atrasado: 'Atrasado',
  pausado: 'Prazo pausado',
  cumprido: 'Resolvido no prazo',
  fora_do_prazo: 'Resolvido fora do prazo',
};

/** Texto curto do selo da fila */
export function seloSla(s: SituacaoSla): string {
  const { estado, restanteMin } = s.solucao;
  if (estado === 'atrasado') return `Atrasado ${duracaoUtil(restanteMin)}`;
  if (estado === 'no_prazo' || estado === 'vence_logo') return `Vence em ${duracaoUtil(restanteMin)}`;
  return ROTULO_ESTADO_SLA[estado];
}

export const COR_ESTADO_SLA: Record<EstadoSla, string> = {
  no_prazo: 'text-slate-700 bg-slate-50 border-slate-200',
  vence_logo: 'text-amber-800 bg-amber-50 border-amber-200',
  atrasado: 'text-rose-700 bg-rose-50 border-rose-200',
  pausado: 'text-purple-700 bg-purple-50 border-purple-200',
  cumprido: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  fora_do_prazo: 'text-rose-700 bg-rose-50 border-rose-200',
};
