// Fase 9: vínculos entre chamado, equipamento, colaborador, software e manutenção.
import type { Asset, Contrato, Employee, SoftwareLicense, Ticket, TipoManutencao, UserRole } from '../types/index.ts';
import type { TipoFicha } from './fichas.ts';
import { contratoVigente, TIPOS_QUE_COBREM } from './contratos.ts';
import { ROTULO_TIPO_MANUTENCAO } from './cicloVida.ts';
import { formatCurrency, formatDate } from './formatters.ts';

const maisRecentesPrimeiro = (a: Ticket, b: Ticket) => b.dataCriacao.localeCompare(a.dataCriacao);

/** Chamados ligados ao equipamento, do mais recente para o mais antigo */
export const chamadosDoAtivo = (tickets: Ticket[], ativoId: string) =>
  tickets.filter((t) => t.ativoId === ativoId).sort(maisRecentesPrimeiro);

/** Chamados ligados ao software/licença */
export const chamadosDoSoftware = (tickets: Ticket[], softwareId: string) =>
  tickets.filter((t) => t.softwareId === softwareId).sort(maisRecentesPrimeiro);

/** Chamados que a pessoa abriu ou em que aparece como colaborador relacionado */
export const chamadosDaPessoa = (tickets: Ticket[], colaboradorId: string) =>
  tickets
    .filter((t) => t.solicitanteId === colaboradorId || t.colaboradorId === colaboradorId)
    .sort(maisRecentesPrimeiro);

/** Como a pessoa aparece no chamado (para a lista da ficha dela) */
export const papelNoChamado = (t: Ticket, colaboradorId: string): string =>
  t.solicitanteId === colaboradorId
    ? t.colaboradorId && t.colaboradorId !== colaboradorId
      ? 'Abriu'
      : 'Solicitante'
    : 'Relacionado';

/** Em aberto = ainda não resolvido nem cancelado */
export const chamadoEmAberto = (t: Pick<Ticket, 'status'>) => t.status !== 'resolvido' && t.status !== 'cancelado';

/**
 * Quem pode abrir cada ficha a partir de um link (regra de interface; quem
 * decide de verdade o que cada um lê é o banco):
 * - T.I.: todas;
 * - RH: pessoa, chamados que já enxerga e equipamento (como já abre hoje na
 *   tela de admissão/desligamento; a ficha esconde o que é só da T.I.);
 *   software não;
 * - colaborador: só a própria ficha, os próprios equipamentos e os próprios chamados.
 */
export function podeAbrirFicha(
  papel: UserRole,
  tipo: TipoFicha,
  contexto: { meuId?: string; colaboradorId?: string; custodianteId?: string; solicitanteId?: string } = {}
): boolean {
  if (papel === 'ti_admin' || papel === 'ti_suporte') return true;
  if (papel === 'rh') return tipo !== 'software';
  const { meuId } = contexto;
  if (!meuId) return false;
  if (tipo === 'colaborador') return contexto.colaboradorId === meuId;
  if (tipo === 'ativo') return contexto.custodianteId === meuId;
  if (tipo === 'chamado') return contexto.solicitanteId === meuId;
  return false;
}

/** Equipamentos com a pessoa (para listar primeiro ao escolher o vínculo) */
export const equipamentosDaPessoa = (assets: Asset[], colaboradorId?: string) =>
  colaboradorId ? assets.filter((a) => a.custodianteId === colaboradorId && a.status !== 'descartado') : [];

/** Licenças atribuídas à pessoa */
export const licencasDaPessoa = (licenses: SoftwareLicense[], colaboradorId?: string) =>
  colaboradorId ? licenses.filter((l) => l.colaboradoresIds.includes(colaboradorId)) : [];

/** Separa a lista em "da pessoa" (primeiro) e "demais", sem repetir */
export function primeiroDaPessoa<T extends { id: string }>(todos: T[], daPessoa: T[]): { daPessoa: T[]; demais: T[] } {
  const ids = new Set(daPessoa.map((x) => x.id));
  return { daPessoa, demais: todos.filter((x) => !ids.has(x.id)) };
}

/**
 * Com quem o equipamento estava numa data (a da abertura da manutenção).
 * Se ninguém estava com ele naquele dia, devolve a última pessoa que o usou
 * antes disso (ex.: devolvido com avaria no desligamento), marcada como devolvido.
 */
export function comQuemEstava(
  asset: Pick<Asset, 'historicoCustodia'>,
  dataISO: string
): { colaboradorId: string; colaboradorNome: string; devolvidoEm?: string } | null {
  const dia = dataISO.slice(0, 10);
  const historico = asset.historicoCustodia || [];
  const naData = historico.find(
    (h) => h.dataEntrega.slice(0, 10) <= dia && (!h.dataDevolucao || h.dataDevolucao.slice(0, 10) >= dia)
  );
  if (naData) return { colaboradorId: naData.colaboradorId, colaboradorNome: naData.colaboradorNome };
  const anteriores = historico
    .filter((h) => h.dataDevolucao && h.dataDevolucao.slice(0, 10) < dia)
    .sort((a, b) => (b.dataDevolucao as string).localeCompare(a.dataDevolucao as string));
  const ultima = anteriores[0];
  return ultima
    ? { colaboradorId: ultima.colaboradorId, colaboradorNome: ultima.colaboradorNome, devolvidoEm: ultima.dataDevolucao }
    : null;
}

/**
 * Contratos vigentes que têm a licença entre os itens; suporte e garantia
 * estendida primeiro (são os que dizem a quem recorrer).
 */
export function contratosDaLicenca(licencaId: string, contratos: Contrato[], agora: Date = new Date()): Contrato[] {
  const peso = (c: Contrato) => (TIPOS_QUE_COBREM.includes(c.tipo) ? 0 : 1);
  return contratos
    .filter((c) => contratoVigente(c, agora) && c.itens.some((i) => i.licencaId === licencaId))
    .sort((a, b) => peso(a) - peso(b));
}

/** Rascunho dos vínculos do chamado: null = não mexido; '' = remover */
export interface RascunhoVinculos {
  ativoId: string | null;
  softwareId: string | null;
  colaboradorId: string | null;
}
export type CampoVinculo = keyof RascunhoVinculos;
export const RASCUNHO_VAZIO: RascunhoVinculos = { ativoId: null, softwareId: null, colaboradorId: null };
export const ROTULO_VINCULO: Record<CampoVinculo, string> = {
  ativoId: 'Equipamento',
  softwareId: 'Software',
  colaboradorId: 'Colaborador relacionado',
};

/** Campos do rascunho que de fato mudam o chamado (a pessoa de admissão/desligamento não muda) */
export function mudancasVinculos(
  ticket: Pick<Ticket, 'tipo' | 'ativoId' | 'softwareId' | 'colaboradorId'>,
  rascunho: RascunhoVinculos
): CampoVinculo[] {
  return (Object.keys(rascunho) as CampoVinculo[]).filter(
    (campo) =>
      rascunho[campo] !== null &&
      rascunho[campo] !== (ticket[campo] || '') &&
      !(campo === 'colaboradorId' && ticket.tipo !== 'suporte')
  );
}

export type EventoManutencao = 'aberta' | 'feita' | 'concluida' | 'cancelada';

/**
 * Nota interna gravada no chamado de origem quando a manutenção ligada a ele
 * é aberta, registrada, concluída ou cancelada. O chamado não muda de status.
 */
export function notaDaManutencao(
  evento: EventoManutencao,
  d: { tag: string; tipo: TipoManutencao; descricao: string; concluidaEm?: string; custo?: number }
): string {
  const tipo = ROTULO_TIPO_MANUTENCAO[d.tipo];
  const quando = d.concluidaEm ? ` em ${formatDate(d.concluidaEm)}` : '';
  switch (evento) {
    case 'aberta':
      return `Equipamento ${d.tag} enviado para manutenção (${tipo}): ${d.descricao}`;
    case 'feita':
      return `Registrada manutenção já feita no equipamento ${d.tag} (${tipo})${quando}: ${d.descricao}`;
    case 'concluida':
      return `Manutenção do equipamento ${d.tag} concluída${quando}.${d.custo ? ` Custo: ${formatCurrency(d.custo)}.` : ''}`;
    case 'cancelada':
      return `Manutenção do equipamento ${d.tag} cancelada.`;
  }
}

/** Rótulo curto de uma pessoa nas listas de escolha */
export const rotuloPessoa = (e: Pick<Employee, 'nome' | 'matricula'>) => `${e.nome} (${e.matricula})`;
