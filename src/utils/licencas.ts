// Lote 1 (L3–L5): regras da licença, as mesmas na tela e no banco.
import type { AtribuicaoLicenca, SoftwareLicense } from '../types/index.ts';

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
}

export function erroLicenca(d: DadosLicencaForm, hoje: string): string | null {
  if (!d.nome.trim()) return 'Informe o nome do software.';
  if (!d.fornecedorId) return 'Escolha o fornecedor (ou cadastre um novo).';
  if (!Number.isFinite(d.assentosTotais) || d.assentosTotais < 1) return 'A quantidade de assentos deve ser no mínimo 1.';
  if (d.assentosTotais < d.emUso) {
    return `O total de assentos (${d.assentosTotais}) não pode ser menor que os ${d.emUso} em uso.`;
  }
  if (!d.pagaPorContrato) {
    if (!d.dataRenovacao) return 'Informe a data de renovação.';
    if (d.renovacaoMudou && d.dataRenovacao < hoje) return 'A data de renovação precisa ser hoje ou depois.';
  }
  return null;
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
