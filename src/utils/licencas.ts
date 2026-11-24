// Lote 1 (L3–L5): regras da licença, as mesmas na tela e no banco.
import type { AtribuicaoLicenca, Contrato, SoftwareLicense } from '../types/index.ts';

export const licencaAtiva = (l: Pick<SoftwareLicense, 'status'>) => (l.status || 'ativa') === 'ativa';

export interface DadosLicencaForm {
  nome: string;
  fornecedorId: string;
  assentosTotais: number;
  emUso: number;
  /** Só é validada quando a licença tem custo próprio (sem contrato) */
  dataRenovacao: string;
  /** Na edição, a data antiga pode já ter passado: só valida se mudou */
  renovacaoMudou: boolean;
  pagaPorContrato: boolean;
  /** Seção 6: sem custo dispensa fornecedor e renovação */
  semCusto?: boolean;
}

export function erroLicenca(d: DadosLicencaForm, hoje: string): string | null {
  if (!d.nome.trim()) return 'Informe o nome do software.';
  if (!d.fornecedorId && !d.semCusto) return 'Escolha o fornecedor (ou cadastre um novo).';
  if (!Number.isFinite(d.assentosTotais) || d.assentosTotais < 1) return 'A quantidade de assentos deve ser no mínimo 1.';
  if (d.assentosTotais < d.emUso) {
    return `O total de assentos (${d.assentosTotais}) não pode ser menor que os ${d.emUso} em uso.`;
  }
  if (!d.pagaPorContrato && !d.semCusto) {
    if (!d.dataRenovacao) return 'Informe a data de renovação.';
    if (d.renovacaoMudou && d.dataRenovacao < hoje) return 'A data de renovação precisa ser hoje ou depois.';
  }
  return null;
}

/** Quantidade contratada do contrato aberto mais recente que cobre a licença (nula = não informada) */
export function quantidadeContratadaDaLicenca(licencaId: string, contratos: Contrato[]): number | null {
  const candidatos = contratos
    .filter((c) => c.status !== 'encerrado')
    .map((c) => ({ c, item: c.itens.find((i) => i.licencaId === licencaId && i.quantidadeContratada != null) }))
    .filter((x) => x.item)
    .sort((a, b) => b.c.inicio.localeCompare(a.c.inicio));
  return candidatos[0]?.item?.quantidadeContratada ?? null;
}

export const PODE_AJUSTAR_ASSENTOS = ['ti_admin', 'compras'];

/** Regras do ajuste do total de assentos (o banco repete todas; aqui só dá a resposta rápida e vale no modo demonstração) */
export function erroAjusteAssentos(d: {
  licenca: Pick<SoftwareLicense, 'status' | 'assentosTotais' | 'assentosAlocados' | 'formaCobranca'>;
  total: number;
  valorMensal?: number;
  motivo: string;
  papel?: string;
  quantidadeContratada: number | null;
}): string | null {
  if (!PODE_AJUSTAR_ASSENTOS.includes(d.papel || '')) return 'Só o administrador da T.I. ou Compras ajustam o total de assentos.';
  if (d.motivo.trim().length < 5) return 'Informe o motivo do ajuste (mínimo 5 caracteres).';
  if (!Number.isInteger(d.total) || d.total < 0) return 'Informe um total de assentos válido.';
  if (!licencaAtiva(d.licenca)) return 'Licença inativa não muda de total. Reative-a antes.';
  if (d.total < d.licenca.assentosAlocados) {
    return `Assentos totais (${d.total}) não podem ser menos que os ${d.licenca.assentosAlocados} em uso.`;
  }
  const mudou = d.total !== d.licenca.assentosTotais;
  if (mudou && d.licenca.formaCobranca === 'contrato' && d.quantidadeContratada != null && d.total > d.quantidadeContratada) {
    return `Acima do contratado (${d.quantidadeContratada}). Faça um aditivo/renovação do contrato com a nova quantidade ou um pedido de compra.`;
  }
  if (mudou && (d.licenca.formaCobranca || 'propria') === 'propria' && (d.valorMensal == null || !(d.valorMensal >= 0))) {
    return 'Informe o novo valor mensal da licença.';
  }
  return null;
}

/** Valor sugerido ao mudar o total na cobrança própria: proporcional ao total antigo, em centavos */
export function valorProporcional(valorAtual: number, totalAntigo: number, totalNovo: number): number {
  if (!(totalAntigo > 0)) return Math.round(valorAtual * 100) / 100;
  return Math.round((valorAtual / totalAntigo) * totalNovo * 100) / 100;
}

/** Histórico de assentos mais recente primeiro (em aberto antes dos encerrados) */
export function historicoAssentos(
  atribuicoes: AtribuicaoLicenca[],
  filtro: { licencaId?: string; colaboradorId?: string }
): AtribuicaoLicenca[] {
  return atribuicoes
    .filter(
      (a) =>
        (!filtro.licencaId || a.licencaId === filtro.licencaId) &&
        (!filtro.colaboradorId || a.colaboradorId === filtro.colaboradorId)
    )
    .sort((a, b) => {
      if (!a.fim !== !b.fim) return a.fim ? 1 : -1;
      return (b.fim || b.inicio || '').localeCompare(a.fim || a.inicio || '');
    });
}
