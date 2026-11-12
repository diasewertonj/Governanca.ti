// =============================================================================
// Fase 8 · Ciclo de vida do ativo: manutenções (com custos) e baixa patrimonial.
// As mesmas regras das funções do banco (abrir_manutencao, encerrar_manutencao,
// baixar_ativo, estornar_baixa), para explicar os bloqueios na tela antes de
// enviar e para o modo demonstração. Datas sempre 'AAAA-MM-DD' locais.
// =============================================================================
import type {
  Asset,
  AssetStatus,
  BaixaAtivo,
  DadosBaixa,
  DadosEncerramentoManutencao,
  DadosManutencao,
  DestinoBaixa,
  Manutencao,
  MotivoBaixa,
  StatusManutencao,
  TipoManutencao,
} from '../types/index.ts';
import { isoLocal } from './formatters.ts';

export const ROTULO_TIPO_MANUTENCAO: Record<TipoManutencao, string> = {
  corretiva: 'Corretiva',
  preventiva: 'Preventiva',
  upgrade: 'Upgrade',
  garantia: 'Garantia (acionamento)',
};

export const ROTULO_STATUS_MANUTENCAO: Record<StatusManutencao, string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const ROTULO_MOTIVO_BAIXA: Record<MotivoBaixa, string> = {
  obsoleto: 'Obsoleto',
  defeito: 'Defeito sem conserto',
  perda: 'Perda',
  roubo_furto: 'Roubo ou furto',
  sinistro: 'Sinistro',
  devolucao_locadora: 'Devolução à locadora',
  outro: 'Outro',
};

export const ROTULO_DESTINO_BAIXA: Record<DestinoBaixa, string> = {
  doacao: 'Doação',
  venda: 'Venda',
  descarte: 'Descarte',
  reciclagem: 'Reciclagem',
  devolucao_locadora: 'Devolução à locadora',
  nao_se_aplica: 'Não se aplica (perda, roubo ou sinistro)',
};

/** Motivos em que a baixa encerra a custódia aberta: não há como devolver o equipamento antes */
export const MOTIVOS_SEM_DEVOLUCAO: MotivoBaixa[] = ['perda', 'roubo_furto', 'sinistro'];

/** Texto gravado na custódia encerrada pela baixa (o mesmo do banco) */
export function motivoDevolucaoNaBaixa(motivo: MotivoBaixa): string {
  const texto = motivo === 'perda' ? 'perda' : motivo === 'roubo_furto' ? 'roubo ou furto' : 'sinistro';
  return `Baixa patrimonial: ${texto}`;
}

type ComManutencoes = Pick<Asset, 'historicoManutencao'>;

/** A manutenção em andamento do ativo (o banco garante no máximo uma) */
export const manutencaoEmAndamento = (asset: ComManutencoes): Manutencao | undefined =>
  asset.historicoManutencao.find((m) => m.status === 'em_andamento');

/** Mais recente primeiro: data de abertura e, no empate, a registrada por último */
export const manutencoesOrdenadas = (lista: Manutencao[]): Manutencao[] =>
  [...lista].sort((a, b) => b.abertaEm.localeCompare(a.abertaEm) || b.criadoEm.localeCompare(a.criadoEm));

/** Total gasto: soma das manutenções concluídas (em andamento e canceladas não contam) */
export const totalGastoManutencoes = (lista: Manutencao[]): number =>
  lista.filter((m) => m.status === 'concluida').reduce((soma, m) => soma + (Number(m.custo) || 0), 0);

/** Custo acumulado: valor de compra + manutenções concluídas */
export const custoAcumulado = (asset: ComManutencoes & Pick<Asset, 'fiscal'>): number =>
  (Number(asset.fiscal?.valorCompra) || 0) + totalGastoManutencoes(asset.historicoManutencao);

/** A baixa que vale hoje (as estornadas ficam só como histórico) */
export const baixaVigente = (asset: Pick<Asset, 'baixas'>): BaixaAtivo | undefined =>
  asset.baixas?.find((b) => !b.estornadaEm);

/** "Enviar para manutenção": só no estoque ou em uso, sem outra manutenção aberta */
export const podeEnviarParaManutencao = (asset: ComManutencoes & Pick<Asset, 'status'>): boolean =>
  (asset.status === 'disponivel' || asset.status === 'em_uso') && !manutencaoEmAndamento(asset);

/** Por que o banco recusaria abrir a manutenção (null = pode abrir) */
export function erroAoAbrirManutencao(asset: ComManutencoes & Pick<Asset, 'status' | 'tag'>): string | null {
  if (asset.status === 'descartado') return `O ativo ${asset.tag} está baixado`;
  if (!podeEnviarParaManutencao(asset)) return `O ativo ${asset.tag} já está em manutenção`;
  return null;
}

/** Status ao sair da manutenção: em uso se está com alguém, senão disponível */
export const statusAposManutencao = (asset: Pick<Asset, 'custodianteId'>): 'em_uso' | 'disponivel' =>
  asset.custodianteId ? 'em_uso' : 'disponivel';

/**
 * Status ao mudar a custódia (transferência, devolução): com manutenção em
 * andamento o ativo continua "em manutenção", como o gatilho do banco garante.
 */
export const statusAoMudarCustodia = (
  asset: ComManutencoes & Pick<Asset, 'status'>,
  novoCustodianteId: string | null | undefined
): AssetStatus =>
  asset.status === 'manutencao' && manutencaoEmAndamento(asset) ? 'manutencao' : novoCustodianteId ? 'em_uso' : 'disponivel';

/** O que impede a baixa agora (lista vazia = pode baixar). As mesmas recusas do banco. */
export function bloqueiosDaBaixa(
  asset: ComManutencoes & Pick<Asset, 'status' | 'custodianteId'>,
  motivo?: MotivoBaixa | ''
): string[] {
  if (asset.status === 'descartado') return ['O ativo já está baixado.'];
  const bloqueios: string[] = [];
  if (asset.custodianteId && !(motivo && MOTIVOS_SEM_DEVOLUCAO.includes(motivo))) {
    bloqueios.push(
      'O ativo está com um colaborador. Registre a devolução antes da baixa (só perda, roubo/furto e sinistro dispensam a devolução).'
    );
  }
  if (manutencaoEmAndamento(asset)) {
    bloqueios.push('Há uma manutenção em andamento. Conclua ou cancele a manutenção antes da baixa.');
  }
  return bloqueios;
}

const custoValido = (custo: number) => Number.isFinite(custo) && custo >= 0;

/** Validação do formulário de manutenção (abrir ou registrar já feita) */
export function validarManutencao(dados: DadosManutencao & { concluidaEm?: string }, jaFeita = false): string | null {
  if (!dados.descricao.trim()) return 'Descreva o problema ou o serviço.';
  if (!dados.abertaEm) return 'Informe a data de abertura.';
  if (dados.previsao && dados.previsao < dados.abertaEm) return 'A previsão não pode ser anterior à abertura.';
  if (!custoValido(dados.custo)) return 'Informe um custo válido (zero ou mais).';
  if (jaFeita) {
    if (!dados.concluidaEm) return 'Informe a data de conclusão.';
    if (dados.concluidaEm < dados.abertaEm) return 'A conclusão não pode ser anterior à abertura.';
  }
  return null;
}

/** Validação da conclusão (data, custo final) */
export function validarEncerramento(
  m: Pick<Manutencao, 'abertaEm' | 'status'>,
  status: 'concluida' | 'cancelada',
  dados: DadosEncerramentoManutencao
): string | null {
  if (m.status !== 'em_andamento') return 'Esta manutenção já foi encerrada.';
  if (status === 'concluida') {
    if (!dados.concluidaEm) return 'Informe a data de conclusão.';
    if (dados.concluidaEm < m.abertaEm) return 'A conclusão não pode ser anterior à abertura.';
  }
  if (dados.custo !== undefined && !custoValido(dados.custo)) return 'Informe um custo válido (zero ou mais).';
  return null;
}

/** Validação do formulário de baixa (motivo, destino e data obrigatórios) */
export function validarBaixa(dados: DadosBaixa): string | null {
  if (!dados.motivo || !dados.destino) return 'Informe o motivo e o destino da baixa.';
  if (!dados.dataBaixa) return 'Informe a data da baixa.';
  if (dados.valorVenda !== undefined) {
    if (dados.destino !== 'venda') return 'O valor de venda só vale quando o destino é venda.';
    if (!custoValido(dados.valorVenda)) return 'Informe um valor de venda válido (zero ou mais).';
  }
  return null;
}

/**
 * Observação ao encerrar: o banco troca a observação da manutenção pela nova.
 * Para não perder a da abertura, a nova entra numa linha abaixo, com o rótulo.
 */
export function juntarObservacoes(
  anterior: string | undefined,
  nova: string | undefined,
  status: 'concluida' | 'cancelada'
): string | undefined {
  const texto = nova?.trim();
  if (!texto) return undefined;
  const linha = `${status === 'concluida' ? 'Conclusão' : 'Cancelamento'}: ${texto}`;
  return anterior?.trim() ? `${anterior.trim()}\n${linha}` : linha;
}

// -----------------------------------------------------------------------------
// Efeito no ativo (modo demonstração, e reserva caso a releitura do banco falhe)
// -----------------------------------------------------------------------------

/** Registro local de uma manutenção, como o banco gravaria */
export function novaManutencao(
  id: string,
  ativoId: string,
  dados: DadosManutencao,
  quem: string | undefined,
  agora: Date,
  concluidaEm?: string
): Manutencao {
  return {
    ...dados,
    id,
    ativoId,
    descricao: dados.descricao.trim(),
    numeroOs: dados.numeroOs?.trim() || undefined,
    observacoes: dados.observacoes?.trim() || undefined,
    status: concluidaEm ? 'concluida' : 'em_andamento',
    concluidaEm,
    criadoPor: quem,
    criadoEm: agora.toISOString(),
  };
}

/** Enviar para manutenção: grava a manutenção e põe o ativo "em manutenção" (custódia não muda) */
export const aplicarAbertura = (asset: Asset, m: Manutencao): Asset => ({
  ...asset,
  status: 'manutencao',
  historicoManutencao: [...asset.historicoManutencao, m],
});

/** Manutenção já feita: só entra no histórico, sem mexer no status */
export const aplicarManutencaoFeita = (asset: Asset, m: Manutencao): Asset => ({
  ...asset,
  historicoManutencao: [...asset.historicoManutencao, m],
});

/** Concluir ou cancelar: o ativo volta para "em uso" (com alguém) ou "disponível" */
export function aplicarEncerramento(
  asset: Asset,
  manutencaoId: string,
  status: 'concluida' | 'cancelada',
  dados: DadosEncerramentoManutencao,
  quem: string | undefined,
  agora: Date
): Asset {
  return {
    ...asset,
    status: asset.status === 'manutencao' ? statusAposManutencao(asset) : asset.status,
    historicoManutencao: asset.historicoManutencao.map((m) =>
      m.id !== manutencaoId
        ? m
        : {
            ...m,
            status,
            concluidaEm: status === 'concluida' ? dados.concluidaEm || isoLocal(agora) : undefined,
            custo: dados.custo ?? m.custo,
            observacoes: dados.observacoes?.trim() || m.observacoes,
            encerradoPor: quem,
            encerradoEm: agora.toISOString(),
          }
    ),
  };
}

/** Baixa: o ativo vira "Baixado", sai da custódia e, em perda/roubo/sinistro, a custódia aberta é encerrada */
export function aplicarBaixa(asset: Asset, baixa: BaixaAtivo): Asset {
  return {
    ...asset,
    status: 'descartado',
    custodianteId: undefined,
    dataEntregaAtual: undefined,
    historicoCustodia: asset.custodianteId
      ? asset.historicoCustodia.map((h) =>
          h.dataDevolucao ? h : { ...h, dataDevolucao: baixa.dataBaixa, motivoDevolucao: motivoDevolucaoNaBaixa(baixa.motivo) }
        )
      : asset.historicoCustodia,
    baixas: [...(asset.baixas || []), baixa],
  };
}

/** Estorno: o registro fica (com quem, quando e por quê) e o ativo volta ao estoque */
export function aplicarEstorno(
  asset: Asset,
  baixaId: string,
  motivo: string,
  quem: string | undefined,
  agora: Date
): Asset {
  return {
    ...asset,
    status: 'disponivel',
    baixas: (asset.baixas || []).map((b) =>
      b.id === baixaId ? { ...b, estornadaEm: agora.toISOString(), estornadaPor: quem, motivoEstorno: motivo.trim() } : b
    ),
  };
}
