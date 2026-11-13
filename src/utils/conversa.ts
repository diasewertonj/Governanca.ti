// Tela do chamado: a descrição é o 1º item da conversa, sem repetição.
import type { Ticket, TicketMessage, TicketType, UserRole } from '../types/index.ts';

export const ROTULO_PAPEL: Record<UserRole, string> = {
  ti_admin: 'Administrador de T.I.',
  ti_suporte: 'Suporte de T.I.',
  rh: 'RH',
  colaborador: 'Colaborador',
};

export const ROTULO_TIPO_CHAMADO: Record<TicketType, string> = {
  suporte: 'Suporte',
  onboarding: 'Admissão',
  offboarding: 'Desligamento',
};

/**
 * Mensagens exibidas depois da abertura. Ao abrir o chamado o sistema grava a
 * descrição também como 1ª mensagem; ela some da lista quando repete a
 * descrição (o banco não muda). Notas internas só para quem pode vê-las.
 */
export function mensagensDaConversa(
  ticket: Pick<Ticket, 'descricao' | 'solicitanteId' | 'mensagens'>,
  podeVerNotas: boolean
): TicketMessage[] {
  const descricao = ticket.descricao.trim();
  return ticket.mensagens.filter((m, i) => {
    if (m.ehNotaInterna && !podeVerNotas) return false;
    const repeteAbertura = i === 0 && !m.ehNotaInterna && m.autorId === ticket.solicitanteId && m.texto.trim() === descricao;
    return !repeteAbertura;
  });
}

/** Inicial do nome para o círculo ao lado da mensagem */
export const inicial = (nome: string) => (nome.trim().charAt(0) || '?').toUpperCase();
