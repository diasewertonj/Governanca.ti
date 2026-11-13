// Fase 10: atendimento profissional — rótulos e regras (as mesmas do banco).
import type {
  AguardandoMotivo,
  CausaChamado,
  DadosResolucao,
  EventoChamado,
  MotivoCancelamento,
  Ticket,
  TicketStatus,
  TipoSolucao,
  UserRole,
} from '../types/index.ts';
import { rotuloPrioridade, rotuloStatus } from './formatters.ts';

export const ROTULO_CAUSA: Record<CausaChamado, string> = {
  hardware: 'Defeito de hardware',
  configuracao: 'Configuração',
  software: 'Software / bug',
  rede: 'Rede / conexão',
  acesso: 'Acesso / permissão',
  uso: 'Uso / orientação',
  fornecedor: 'Fornecedor externo',
  outro: 'Outro',
};

export const ROTULO_TIPO_SOLUCAO: Record<TipoSolucao, string> = {
  definitiva: 'Definitiva',
  paliativa: 'Paliativa (contorno)',
};

export const ROTULO_MOTIVO_CANCELAMENTO: Record<MotivoCancelamento, string> = {
  duplicado: 'Duplicado (já existe outro chamado)',
  engano: 'Aberto por engano',
  sem_retorno: 'Sem retorno do solicitante',
  outro: 'Outro',
};

export const ROTULO_AGUARDANDO: Record<AguardandoMotivo, string> = {
  peca: 'peça',
  fornecedor: 'fornecedor',
  solicitante: 'solicitante',
};

/** Status que a T.I. escolhe na lista; encerrar e cancelar têm botões próprios */
export const STATUS_EM_ATENDIMENTO: TicketStatus[] = ['aberto', 'em_andamento', 'aguardando_terceiro'];

export const chamadoEncerrado = (t: Pick<Ticket, 'status'>) => t.status === 'resolvido' || t.status === 'cancelado';

/** Rótulo do status, com o motivo da espera ("Aguardando peça") */
export function rotuloSituacao(t: Pick<Ticket, 'status' | 'aguardandoMotivo'>): string {
  if (t.status === 'aguardando_terceiro') {
    return t.aguardandoMotivo ? `Aguardando ${ROTULO_AGUARDANDO[t.aguardandoMotivo]}` : 'Aguardando';
  }
  if (t.status === 'resolvido') return 'Encerrado';
  return rotuloStatus(t.status);
}

/** Mesmas regras do banco (resolver_chamado), para avisar antes de enviar */
export function erroResolucao(d: Partial<DadosResolucao>): string | null {
  if (!d.causa) return 'Escolha a causa.';
  if ((d.solucao || '').trim().length < 10) return 'Descreva a solução com pelo menos 10 caracteres.';
  if (!d.tipo) return 'Diga se a solução é definitiva ou paliativa.';
  if (d.tipo === 'paliativa' && !(d.proximoPasso || '').trim()) return 'Solução paliativa: informe o próximo passo.';
  if (d.tempoMin !== undefined && (!Number.isFinite(d.tempoMin) || d.tempoMin < 0)) return 'Tempo gasto inválido.';
  return null;
}

export const ehProcesso = (t: Pick<Ticket, 'tipo'>) => t.tipo === 'onboarding' || t.tipo === 'offboarding';

export function erroCancelamento(
  motivo: MotivoCancelamento | '',
  detalhe: string,
  tipo: Ticket['tipo'] = 'suporte'
): string | null {
  if (!motivo) return 'Escolha o motivo.';
  if (ehProcesso({ tipo }) && !detalhe.trim()) return 'Para cancelar uma admissão ou um desligamento, descreva o motivo.';
  if (motivo === 'outro' && !detalhe.trim()) return 'Motivo "outro": descreva o motivo do cancelamento.';
  return null;
}

/**
 * Passos já feitos que mudaram cadastro, acesso ou inventário: para cancelar o
 * processo, a T.I. declara que vai revertê-los (vira lembrete). Mesma lista do banco.
 */
const TIPOS_A_REVERTER = new Set([
  'cadastro', 'conta', 'grupo_email', 'equipamento', 'acessorio', 'licenca', 'acesso_nexus',
  'encerrar_recurso', 'devolver_equipamento', 'liberar_licenca',
]);
export const passosAReverter = <T extends { tipo: string; status: string; titulo: string }>(itens: T[]) =>
  itens.filter((i) => i.status === 'feito' && TIPOS_A_REVERTER.has(i.tipo));

const ehTI = (papel: UserRole) => papel === 'ti_admin' || papel === 'ti_suporte';

/**
 * Suporte: quem abriu cancela enquanto ninguém começou; a T.I. cancela qualquer um em aberto.
 * Admissão/desligamento: só a T.I.
 */
export const podeCancelar = (t: Pick<Ticket, 'status' | 'solicitanteId' | 'tipo'>, papel: UserRole, meuId?: string) =>
  !chamadoEncerrado(t) &&
  (ehTI(papel) || (t.tipo === 'suporte' && t.solicitanteId === meuId && t.status === 'aberto'));

/** Reabrir: chamado de suporte encerrado; quem abriu ou a T.I. */
export const podeReabrirChamado = (t: Pick<Ticket, 'status' | 'solicitanteId' | 'tipo'>, papel: UserRole, meuId?: string) =>
  t.tipo === 'suporte' && t.status === 'resolvido' && (ehTI(papel) || t.solicitanteId === meuId);

export const podeAvaliar = (t: Pick<Ticket, 'status' | 'solicitanteId'>, meuId?: string) =>
  t.status === 'resolvido' && !!meuId && t.solicitanteId === meuId;

/** "1h 20min" a partir de minutos */
export function formatarTempo(min?: number): string {
  if (min === undefined || min === null) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
}

const ROTULO_VINCULO_EVENTO: Record<string, string> = {
  equipamento: 'Equipamento',
  software: 'Software',
  colaborador: 'Colaborador relacionado',
};

/** Frase do histórico ("Status: Aberto → Em andamento") */
export function descreverEvento(e: Pick<EventoChamado, 'tipo' | 'de' | 'para' | 'detalhe'>): string {
  const seta = (de?: string, para?: string) => `${de || 'nenhum'} → ${para || 'nenhum'}`;
  switch (e.tipo) {
    case 'aberto':
      return 'Chamado aberto';
    case 'status': {
      const rotulo = (s?: string, motivo?: string) =>
        s === 'aguardando_terceiro'
          ? `Aguardando${motivo ? ` ${ROTULO_AGUARDANDO[motivo as AguardandoMotivo] || motivo}` : ''}`
          : s && rotuloStatus(s);
      return `Status: ${seta(rotulo(e.de), rotulo(e.para, e.detalhe))}`;
    }
    case 'tecnico':
      return `Técnico: ${seta(e.de, e.para)}`;
    case 'prioridade':
      return `Prioridade: ${seta(e.de && rotuloPrioridade(e.de), e.para && rotuloPrioridade(e.para))}`;
    case 'vinculo':
      return `${ROTULO_VINCULO_EVENTO[e.detalhe || ''] || 'Vínculo'}: ${seta(e.de, e.para)}`;
    case 'resolvido':
      return 'Solução registrada; chamado encerrado';
    case 'cancelado':
      return `Cancelado: ${ROTULO_MOTIVO_CANCELAMENTO[e.detalhe as MotivoCancelamento] || e.detalhe || 'sem motivo'}`;
    case 'reaberto':
      return `Reaberto${e.detalhe ? `: ${e.detalhe}` : ''}`;
    case 'avaliado':
      return `Avaliado com ${e.para} de 5${e.detalhe ? `: ${e.detalhe}` : ''}`;
  }
}
