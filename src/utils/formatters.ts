/**
 * Utilitários de Formatação e Regras de Negócio
 */

// Rótulos de chamados. Os valores seguem os CHECKs do banco (critica,
// aguardando_terceiro); o texto exibido mantém a linguagem da equipe.
const ROTULO_STATUS: Record<string, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  aguardando_terceiro: 'Aguardando peça',
  resolvido: 'Resolvido',
  cancelado: 'Cancelado',
};

const ROTULO_PRIORIDADE: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Urgente',
};

export const rotuloStatus = (status: string): string => ROTULO_STATUS[status] || status.replace(/_/g, ' ');
export const rotuloPrioridade = (prioridade: string): string => ROTULO_PRIORIDADE[prioridade] || prioridade;

export const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
};

export const formatDate = (dateString?: string): string => {
  if (!dateString) return '-';
  // Se for apenas YYYY-MM-DD
  if (dateString.length === 10) {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  }
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
};

export const formatDateTime = (dateString?: string): string => {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

export interface WarrantyStatus {
  status: 'valida' | 'expirando' | 'expirada' | 'sem_data';
  label: string;
  diasRestantes: number;
}

/** Dias de antecedência do alerta de garantia */
export const DIAS_ALERTA_GARANTIA = 30;

/**
 * 'AAAA-MM-DD' como data local. `new Date('AAAA-MM-DD')` é lido em UTC e,
 * no Brasil, vira o dia anterior (a contagem ficava com 1 dia a menos).
 */
export const dataLocal = (iso: string): Date => {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1);
};

export const getWarrantyStatus = (dataGarantia?: string, agora: Date = new Date()): WarrantyStatus => {
  if (!dataGarantia) {
    return { status: 'sem_data', label: 'Sem data de garantia', diasRestantes: 0 };
  }

  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  // round: absorve a hora a mais/a menos de um eventual horário de verão
  const diffDays = Math.round((dataLocal(dataGarantia).getTime() - hoje.getTime()) / 86_400_000);

  if (diffDays < 0) {
    return { status: 'expirada', label: 'Garantia expirada', diasRestantes: diffDays };
  } else if (diffDays <= DIAS_ALERTA_GARANTIA) {
    return {
      status: 'expirando',
      label: `Expira em ${diffDays} dias`,
      diasRestantes: diffDays,
    };
  } else {
    return {
      status: 'valida',
      label: `Em garantia (${diffDays} dias)`,
      diasRestantes: diffDays,
    };
  }
};

export const formatChaveNFe = (chave?: string): string => {
  if (!chave || chave.length !== 44) return chave || '-';
  return chave.replace(/(\d{4})/g, '$1 ').trim();
};
