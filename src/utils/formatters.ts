/**
 * Utilitários de Formatação e Regras de Negócio
 */

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
  status: 'valida' | 'expirando' | 'expirada';
  label: string;
  diasRestantes: number;
}

export const getWarrantyStatus = (dataGarantia?: string): WarrantyStatus => {
  if (!dataGarantia) {
    return { status: 'expirada', label: 'Sem garantia', diasRestantes: 0 };
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataFinal = new Date(dataGarantia);
  dataFinal.setHours(0, 0, 0, 0);

  const diffTime = dataFinal.getTime() - hoje.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: 'expirada', label: 'Garantia expirada', diasRestantes: diffDays };
  } else if (diffDays <= 30) {
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
