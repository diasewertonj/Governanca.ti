import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import type { Json, Tables, TablesInsert } from '../types/database.types.ts';
import {
  AnexoAtivo,
  Asset,
  BaixaAtivo,
  CategoriaAnexoAtivo,
  DadosBaixa,
  DadosEncerramentoManutencao,
  DadosManutencao,
  DestinoBaixa,
  Manutencao,
  MotivoBaixa,
  StatusManutencao,
  TipoManutencao,
  AssetCategory,
  AssetStatus,
  CatalogoItem,
  ColaboradorRecurso,
  CompanySettings,
  CondicaoItem,
  Contrato,
  DestinoRecurso,
  Fatura,
  Fornecedor,
  ItemContrato,
  Lembrete,
  PeriodicidadeContrato,
  StatusFatura,
  TipoContrato,
  ProcessoEvento,
  ProcessoItem,
  ProcessoItemRascunho,
  StatusItemProcesso,
  StatusRecurso,
  TipoCatalogo,
  TipoItemProcesso,
  CustodyHistoryEntry,
  CustomFieldDefinition,
  Department,
  Employee,
  EmployeeStatus,
  FiscalData,
  ItemTermo,
  ModeloDocumento,
  OffboardingData,
  OnboardingData,
  ResponsibilityTerm,
  SoftwareLicense,
  AtribuicaoLicenca,
  Ticket,
  TicketAttachment,
  TicketMessage,
  TicketPriority,
  TicketStatus,
  TicketType,
  UserRole,
  AguardandoMotivo,
  CausaChamado,
  DadosResolucao,
  EventoChamado,
  MotivoCancelamento,
  TipoSolucao,
} from '../types/index.ts';

// Fase 4: os mapeadores são tipados pelo banco real (database.types.ts, gerado
// pelo Supabase). Coluna escrita errada vira erro de compilação. Os helpers
// genéricos de UPDATE/DELETE usam o cliente sem tipo, pois recebem a tabela
// como parâmetro.
const bd = () => supabase as unknown as SupabaseClient;
const json = (v: unknown) => v as Json;

/**
 * SERVIÇO DE PERSISTÊNCIA EM BANCO SUPABASE POSTGRESQL
 *
 * Fase 2 (CRIT-04 / ALTO-04 / ALTO-05):
 * - toda gravação verifica o `error` do Supabase e lança DbError;
 * - criação usa INSERT (nunca sobrescreve outro registro);
 * - edição usa UPDATE só com os campos que mudaram, e confirma que 1 linha
 *   foi afetada (a RLS recusa em silêncio, devolvendo 0 linhas);
 * - códigos de chamado/termo são gerados pelo banco e devolvidos aqui.
 * Sem Supabase (modo demonstração) as funções não fazem nada.
 */

type Linha = Record<string, unknown>;

export class DbError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'DbError';
    this.code = code;
  }
}

function lancar(error: { message: string; code?: string }): never {
  throw new DbError(error.message, error.code);
}

async function checar<T>(op: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await op;
  if (error) lancar(error);
  return data;
}

/** Só as colunas cujo valor mudou (compara por JSON; null e undefined são iguais) */
export function camposAlterados(antes: Linha, depois: Linha): Linha {
  const diff: Linha = {};
  Object.keys(depois).forEach((k) => {
    if (JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null)) diff[k] = depois[k];
  });
  return diff;
}

const SEM_PERMISSAO = 'Sem permissão para alterar este registro, ou ele não existe mais.';

/** Quantos chamados recentes são carregados no login (os mais antigos ficam no banco) */
export const LIMITE_CHAMADOS = 500;

async function atualizar(tabela: string, id: string, campos: Linha, chave = 'id') {
  if (!supabase || Object.keys(campos).length === 0) return;
  const data = await checar(bd().from(tabela).update(campos).eq(chave, id).select(chave));
  if (!data || (data as unknown[]).length === 0) throw new DbError(SEM_PERMISSAO, '42501');
}

async function excluir(tabela: string, id: string, chave = 'id') {
  if (!supabase) return;
  const data = await checar(bd().from(tabela).delete().eq(chave, id).select(chave));
  if (!data || (data as unknown[]).length === 0) throw new DbError(SEM_PERMISSAO, '42501');
}

// Mensagens técnicas do Postgres/RLS viram texto genérico; as mensagens de regra
// de negócio escritas nas funções do banco (em português) são mostradas como estão.
const MENSAGEM_TECNICA = /violates|permission denied|row-level security|duplicate key|null value/i;

// Fase 8: regras do banco com nome (constraint) viram frases claras
const MENSAGEM_DA_REGRA: Record<string, string> = {
  uq_fornecedores_nome: 'Já existe um fornecedor com esse nome',
  chk_contrato_periodo: 'O fim do contrato é anterior ao início',
  chk_contrato_item_alvo: 'Cada item do contrato deve ser um ativo ou uma licença',
  uq_contrato_item_ativo: 'O ativo já está neste contrato',
  uq_contrato_item_licenca: 'A licença já está neste contrato',
  chk_fatura_alvo: 'A fatura deve ser de uma licença ou de um contrato',
  chk_fatura_paga: 'Fatura paga precisa da data de pagamento',
  chk_fatura_competencia: 'A competência deve ser o primeiro dia do mês',
  uq_fatura_licenca_comp: 'Já existe fatura não cancelada para esta competência',
  uq_fatura_contrato_comp: 'Já existe fatura não cancelada para esta competência',
  uq_manutencao_aberta: 'O ativo já tem uma manutenção em andamento',
  manutencoes_custo_check: 'O custo da manutenção não pode ser negativo',
  manutencoes_descricao_check: 'Descreva o problema ou o serviço',
  chk_manutencao_conclusao: 'Manutenção concluída precisa da data de conclusão',
  uq_baixa_vigente: 'O ativo já está baixado',
  chk_baixa_venda: 'O valor de venda só vale quando o destino é venda',
  ativo_baixas_valor_venda_check: 'O valor de venda não pode ser negativo',
};

// Exclusão recusada por vínculo (23503), conforme a tabela de onde se tentou excluir
const MENSAGEM_DO_VINCULO: Record<string, string> = {
  fornecedores:
    'O fornecedor está vinculado a contratos, ativos, licenças ou manutenções e não pode ser excluído; desative-o',
  contratos: 'O contrato está vinculado a faturas ou manutenções e não pode ser excluído',
};

/** Mensagem curta para o usuário a partir de um erro do banco */
export function mensagemDeErro(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const msg = e?.message || '';
  const deNegocio = msg !== '' && !MENSAGEM_TECNICA.test(msg);
  const regra = Object.keys(MENSAGEM_DA_REGRA).find((nome) => msg.includes(`"${nome}"`));
  if (regra) return MENSAGEM_DA_REGRA[regra];
  switch (e?.code) {
    case 'validacao':
      return msg || 'arquivo inválido';
    case '42501':
      return deNegocio && msg !== SEM_PERMISSAO ? msg : 'sem permissão para esta ação';
    case '23505':
      return deNegocio ? msg : 'já existe um registro com esses dados (e-mail, matrícula, tag, série ou código repetido)';
    case '23503': {
      const tabela = msg.match(/^update or delete on table "(\w+)"/)?.[1];
      return (
        (tabela && MENSAGEM_DO_VINCULO[tabela]) ||
        'o registro está vinculado a outros dados (histórico, chamados ou termos) e não pode ser removido'
      );
    }
    case '23514':
      return deNegocio ? msg : 'valor não aceito pelo banco';
    case '23502':
      return 'campo obrigatório não preenchido';
    default:
      return msg || 'falha de comunicação com o banco';
  }
}

// ---------------------------------------------------------------------------
// Mapeamento entidade -> linha do banco
// ---------------------------------------------------------------------------
const linhaSetor = (d: Department): TablesInsert<'departamentos'> => ({
  id: d.id,
  nome: d.nome,
  codigo: d.codigo,
  descricao: d.descricao || null,
  ativo: d.ativo,
  responsavel_id: d.responsavelId || null,
});

const linhaColaborador = (e: Employee): TablesInsert<'colaboradores'> => ({
  id: e.id,
  matricula: e.matricula,
  nome: e.nome,
  email: e.email.trim().toLowerCase(),
  cargo: e.cargo,
  setor_id: e.setorId || null,
  gestor_id: e.gestorId || null,
  status: e.status,
  role: e.role || 'colaborador',
  data_admissao: e.dataAdmissao,
  telefone: e.telefone || null,
  avatar_url: e.avatarUrl || null,
});

const linhaAtivo = (a: Asset): TablesInsert<'ativos'> => ({
  id: a.id,
  tag: a.tag,
  nome: a.nome,
  categoria: a.categoria,
  marca: a.marca,
  modelo: a.modelo,
  serial_number: a.serialNumber,
  status: a.status,
  localizacao_fisica: a.localizacaoFisica,
  setor_id: a.setorId || null,
  custodiante_id: a.custodianteId || null,
  data_entrega_atual: a.dataEntregaAtual || null,
  sistema_operacional: a.sistemaOperacional || null,
  fiscal: json(a.fiscal || {}),
  custom_fields: json(a.customFields || {}),
  observacoes: a.observacoes?.trim() || null,
  fornecedor_id: a.fornecedorId || null,
});

const linhaCustodia = (ativoId: string, c: CustodyHistoryEntry): TablesInsert<'historico_custodia'> => ({
  id: c.id,
  ativo_id: ativoId,
  colaborador_id: c.colaboradorId,
  colaborador_nome: c.colaboradorNome,
  data_entrega: c.dataEntrega,
  data_devolucao: c.dataDevolucao || null,
  motivo_devolucao: c.motivoDevolucao || null,
  termo_id: c.termoId || null,
  observacoes: c.observacoes || null,
});

const linhaLicenca = (l: SoftwareLicense): TablesInsert<'licencas_software'> => ({
  id: l.id,
  nome: l.nome,
  fornecedor: l.fornecedor,
  assentos_totais: l.assentosTotais,
  colaboradores_ids: l.colaboradoresIds || [],
  valor_mensal: l.valorMensal,
  tipo_cobranca: l.tipoCobranca || 'mensal',
  data_renovacao: l.dataRenovacao,
  url_painel: l.urlPainel || null,
  observacoes: l.observacoes || null,
  fornecedor_id: l.fornecedorId || null,
  // Lote 1 (L3): quem/quando da inativação é carimbado pelo banco
  status: l.status || 'ativa',
  inativacao_motivo: l.inativacaoMotivo || null,
});

const linhaChamado = (t: Ticket): TablesInsert<'chamados'> => ({
  id: t.id,
  codigo: t.codigo,
  titulo: t.titulo,
  descricao: t.descricao,
  tipo: t.tipo,
  categoria: t.categoria,
  prioridade: t.prioridade,
  status: t.status,
  solicitante_id: t.solicitanteId,
  solicitante_nome: t.solicitanteNome,
  solicitante_email: t.solicitanteEmail,
  solicitante_cargo: t.solicitanteCargo,
  solicitante_setor_nome: t.solicitanteSetorNome,
  tecnico_responsavel_id: t.tecnicoResponsavelId || null,
  tecnico_responsavel_nome: t.tecnicoResponsavelNome || null,
  ativo_id: t.ativoId || null,
  software_id: t.softwareId || null,
  software_nome: t.softwareNome || null,
  onboarding: t.onboarding ? json(t.onboarding) : null,
  offboarding: t.offboarding ? json(t.offboarding) : null,
  anexos: json(t.anexos || []),
  colaborador_id: t.colaboradorId || null,
  aguardando_motivo: t.status === 'aguardando_terceiro' ? t.aguardandoMotivo || null : null,
});

const linhaMensagem = (chamadoId: string, m: TicketMessage): TablesInsert<'chamado_mensagens'> => ({
  id: m.id,
  chamado_id: chamadoId,
  autor_id: m.autorId,
  autor_nome: m.autorNome,
  autor_papel: m.autorRole,
  texto: m.texto,
  eh_nota_interna: m.ehNotaInterna,
  data_envio: m.data,
  anexos: json(m.anexos || []),
});

const linhaTermo = (tm: ResponsibilityTerm): TablesInsert<'termos_responsabilidade'> => ({
  id: tm.id,
  codigo: tm.codigo,
  tipo: tm.tipo,
  colaborador_id: tm.colaboradorId,
  colaborador_nome: tm.colaboradorNome,
  colaborador_matricula: tm.colaboradorMatricula,
  colaborador_cargo: tm.colaboradorCargo,
  colaborador_setor_nome: tm.colaboradorSetorNome,
  ativo_ids: tm.ativoIds,
  data_emissao: tm.dataEmissao,
  status_assinatura: tm.statusAssinatura,
  arquivo_url: tm.arquivoAssinadoUrl || null,
  responsavel_ti_id: tm.responsavelTIId,
  responsavel_ti_nome: tm.responsavelTINome,
  chamado_id: tm.chamadoId || null,
  itens: json(tm.itens || []),
  observacoes: tm.observacoes || null,
  local_unidade: tm.localUnidade || null,
  doc_codigo: tm.docCodigo || null,
  doc_versao: tm.docVersao || null,
  doc_referencia: tm.docReferencia || null,
  doc_titulo: tm.docTitulo || null,
  texto_clausula: tm.textoClausula || null,
  forma_assinatura: tm.formaAssinatura || 'pendente',
});

// ---------------------------------------------------------------------------
// 1. Departamentos
// ---------------------------------------------------------------------------
export async function fetchDepartmentsFromDb(): Promise<Department[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('departamentos').select('*').order('nome');
  if (error) {
    console.error('Erro ao buscar departamentos do Supabase:', error);
    return null;
  }
  return data ? data.map((d) => ({
    id: d.id,
    nome: d.nome,
    codigo: d.codigo,
    descricao: d.descricao || undefined,
    ativo: d.ativo,
    responsavelId: d.responsavel_id || undefined,
  })) : [];
}

export async function insertDepartmentDb(dept: Department) {
  if (!supabase) return;
  await checar(supabase.from('departamentos').insert(linhaSetor(dept)));
}

export async function updateDepartmentDb(antes: Department, depois: Department) {
  await atualizar('departamentos', depois.id, camposAlterados(linhaSetor(antes), linhaSetor(depois)));
}

export async function deleteDepartmentDb(id: string) {
  await excluir('departamentos', id);
}

// ---------------------------------------------------------------------------
// 2. Colaboradores
// ---------------------------------------------------------------------------
export async function fetchEmployeesFromDb(): Promise<Employee[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('colaboradores').select('*').order('nome');
  if (error) {
    console.error('Erro ao buscar colaboradores do Supabase:', error);
    return null;
  }
  return data ? data.map((e) => ({
    id: e.id,
    matricula: e.matricula,
    nome: e.nome,
    email: e.email,
    cargo: e.cargo,
    setorId: e.setor_id || '',
    gestorId: e.gestor_id || undefined,
    status: e.status as EmployeeStatus,
    role: e.role as UserRole,
    dataAdmissao: e.data_admissao,
    telefone: e.telefone || undefined,
    avatarUrl: e.avatar_url || undefined,
    temLogin: !!e.auth_user_id,
  })) : [];
}

export async function insertEmployeeDb(emp: Employee) {
  if (!supabase) return;
  await checar(supabase.from('colaboradores').insert(linhaColaborador(emp)));
}

export async function updateEmployeeDb(antes: Employee, depois: Employee) {
  await atualizar('colaboradores', depois.id, camposAlterados(linhaColaborador(antes), linhaColaborador(depois)));
}

export async function deleteEmployeeDb(id: string) {
  await excluir('colaboradores', id);
}

// ---------------------------------------------------------------------------
// 3. Ativos e custódia
// ---------------------------------------------------------------------------
export async function fetchAssetsFromDb(): Promise<Asset[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('ativos').select('*').order('tag');
  if (error) {
    console.error('Erro ao buscar ativos do Supabase:', error);
    return null;
  }

  const { data: custodyData, error: custodyError } = await supabase
    .from('historico_custodia')
    .select('*')
    .order('data_entrega', { ascending: true });
  if (custodyError) console.error('Erro ao buscar histórico de custódia:', custodyError);

  // Chaves BitLocker ficam em ativos_segredos (só TI enxerga; para os demais a RLS devolve vazio)
  const { data: segredosData } = await supabase.from('ativos_segredos').select('ativo_id, bitlocker_key');
  const bitlockerByAssetId: Record<string, string> = {};
  (segredosData || []).forEach((s) => {
    if (s.bitlocker_key) bitlockerByAssetId[s.ativo_id] = s.bitlocker_key;
  });

  // Fase 8: anexos, manutenções e baixas (só TI; para os demais a RLS devolve vazio, e
  // antes da migration as tabelas não existem: o erro é ignorado e as listas ficam vazias)
  const [{ data: anexosData }, { data: manutencoesData }, { data: baixasData }] = await Promise.all([
    supabase.from('ativo_anexos').select('*').order('criado_em'),
    supabase.from('manutencoes').select('*').order('aberta_em'),
    supabase.from('ativo_baixas').select('*').order('criado_em'),
  ]);
  const anexosPorAtivo: Record<string, AnexoAtivo[]> = {};
  (anexosData || []).forEach((l) => {
    (anexosPorAtivo[l.ativo_id] ||= []).push(anexoAtivoDeLinha(l));
  });
  const manutencoesPorAtivo: Record<string, Manutencao[]> = {};
  (manutencoesData || []).forEach((l) => {
    (manutencoesPorAtivo[l.ativo_id] ||= []).push(manutencaoDeLinha(l));
  });
  const baixasPorAtivo: Record<string, BaixaAtivo[]> = {};
  (baixasData || []).forEach((l) => {
    (baixasPorAtivo[l.ativo_id] ||= []).push(baixaDeLinha(l));
  });

  const custodyByAssetId: Record<string, CustodyHistoryEntry[]> = {};
  (custodyData || []).forEach((c) => {
    if (!custodyByAssetId[c.ativo_id]) custodyByAssetId[c.ativo_id] = [];
    custodyByAssetId[c.ativo_id].push({
      id: c.id,
      colaboradorId: c.colaborador_id,
      colaboradorNome: c.colaborador_nome,
      dataEntrega: c.data_entrega,
      dataDevolucao: c.data_devolucao || undefined,
      motivoDevolucao: c.motivo_devolucao || undefined,
      termoId: c.termo_id || undefined,
      observacoes: c.observacoes || undefined,
    });
  });

  return data ? data.map((a) => ({
    id: a.id,
    tag: a.tag,
    nome: a.nome,
    categoria: a.categoria as AssetCategory,
    marca: a.marca,
    modelo: a.modelo,
    serialNumber: a.serial_number,
    status: a.status as AssetStatus,
    localizacaoFisica: a.localizacao_fisica,
    setorId: a.setor_id || undefined,
    custodianteId: a.custodiante_id || undefined,
    dataEntregaAtual: a.data_entrega_atual || undefined,
    sistemaOperacional: a.sistema_operacional || undefined,
    bitlockerKey: bitlockerByAssetId[a.id] || undefined,
    fiscal: (a.fiscal || {}) as unknown as FiscalData,
    customFields: (a.custom_fields || {}) as Record<string, string>,
    observacoes: a.observacoes || undefined,
    fornecedorId: a.fornecedor_id || undefined,
    anexos: anexosPorAtivo[a.id] || [],
    historicoCustodia: custodyByAssetId[a.id] || [],
    historicoManutencao: manutencoesPorAtivo[a.id] || [],
    baixas: baixasPorAtivo[a.id] || [],
  })) : [];
}

// ---------------------------------------------------------------------------
// 3a. Fase 8 · Manutenções e baixa patrimonial (só a T.I., pela RLS).
// Enviar para manutenção, concluir/cancelar, dar baixa e estornar passam pelas
// funções do banco, que mudam o status e a custódia do ativo na mesma
// transação. "Manutenção já feita" é um INSERT direto (não muda o status).
// ---------------------------------------------------------------------------
const manutencaoDeLinha = (l: Tables<'manutencoes'>): Manutencao => ({
  id: l.id,
  ativoId: l.ativo_id,
  tipo: l.tipo as TipoManutencao,
  descricao: l.descricao,
  numeroOs: l.numero_os || undefined,
  fornecedorId: l.fornecedor_id || undefined,
  contratoId: l.contrato_id || undefined,
  chamadoId: l.chamado_id || undefined,
  abertaEm: l.aberta_em,
  previsao: l.previsao || undefined,
  concluidaEm: l.concluida_em || undefined,
  custo: Number(l.custo) || 0,
  cobertoGarantia: l.coberto_garantia,
  status: l.status as StatusManutencao,
  observacoes: l.observacoes || undefined,
  criadoPor: l.criado_por || undefined,
  criadoEm: l.criado_em,
  encerradoPor: l.encerrado_por || undefined,
  encerradoEm: l.encerrado_em || undefined,
});

const baixaDeLinha = (l: Tables<'ativo_baixas'>): BaixaAtivo => ({
  id: l.id,
  ativoId: l.ativo_id,
  dataBaixa: l.data_baixa,
  motivo: l.motivo as MotivoBaixa,
  destino: l.destino as DestinoBaixa,
  destinatario: l.destinatario || undefined,
  valorVenda: l.valor_venda ?? undefined,
  documento: l.documento || undefined,
  observacoes: l.observacoes || undefined,
  criadoPor: l.criado_por || undefined,
  criadoEm: l.criado_em,
  estornadaEm: l.estornada_em || undefined,
  estornadaPor: l.estornada_por || undefined,
  motivoEstorno: l.motivo_estorno || undefined,
});

// Campos da manutenção nos nomes das colunas (texto vazio vira nulo, como nas funções do banco)
const colunasManutencao = (d: DadosManutencao) => ({
  tipo: d.tipo,
  descricao: d.descricao.trim(),
  numero_os: d.numeroOs?.trim() || null,
  fornecedor_id: d.fornecedorId || null,
  contrato_id: d.contratoId || null,
  chamado_id: d.chamadoId || null,
  aberta_em: d.abertaEm,
  previsao: d.previsao || null,
  custo: d.custo,
  coberto_garantia: d.cobertoGarantia,
  observacoes: d.observacoes?.trim() || null,
});

/** Envia o ativo para manutenção (grava e muda o status); devolve o id da manutenção */
export async function abrirManutencaoDb(ativoId: string, dados: DadosManutencao): Promise<string> {
  if (!supabase) throw new DbError('Disponível apenas com o Supabase configurado.', 'validacao');
  const id = await checar(supabase.rpc('abrir_manutencao', { p_ativo: ativoId, p_dados: json(colunasManutencao(dados)) }));
  return id as string;
}

/** Lança no histórico uma manutenção já concluída, sem mexer no status do ativo */
export async function registrarManutencaoFeitaDb(
  ativoId: string,
  dados: DadosManutencao & { concluidaEm: string }
): Promise<string> {
  if (!supabase) throw new DbError('Disponível apenas com o Supabase configurado.', 'validacao');
  const linha: TablesInsert<'manutencoes'> = {
    ...colunasManutencao(dados),
    ativo_id: ativoId,
    concluida_em: dados.concluidaEm,
    status: 'concluida',
  };
  const data = await checar(supabase.from('manutencoes').insert(linha).select('id').single());
  return (data as { id: string }).id;
}

/** Conclui ou cancela: o banco devolve o ativo para "em uso" ou "disponível" */
export async function encerrarManutencaoDb(
  manutencaoId: string,
  status: 'concluida' | 'cancelada',
  dados: DadosEncerramentoManutencao
) {
  if (!supabase) return;
  await checar(
    supabase.rpc('encerrar_manutencao', {
      p_manutencao: manutencaoId,
      p_status: status,
      p_dados: json({ concluida_em: dados.concluidaEm, custo: dados.custo, observacoes: dados.observacoes }),
    })
  );
}

/** Baixa patrimonial (só ti_admin); devolve o id da baixa */
export async function baixarAtivoDb(ativoId: string, dados: DadosBaixa): Promise<string> {
  if (!supabase) throw new DbError('Disponível apenas com o Supabase configurado.', 'validacao');
  const id = await checar(
    supabase.rpc('baixar_ativo', {
      p_ativo: ativoId,
      p_dados: json({
        data_baixa: dados.dataBaixa,
        motivo: dados.motivo,
        destino: dados.destino,
        destinatario: dados.destinatario,
        valor_venda: dados.destino === 'venda' ? dados.valorVenda : undefined,
        documento: dados.documento,
        observacoes: dados.observacoes,
      }),
    })
  );
  return id as string;
}

/** Estorno da baixa (só ti_admin): o registro fica e o ativo volta ao estoque */
export async function estornarBaixaDb(baixaId: string, motivo: string) {
  if (!supabase) return;
  await checar(supabase.rpc('estornar_baixa', { p_baixa: baixaId, p_motivo: motivo }));
}

type LinhaAnexoAtivo = Tables<'ativo_anexos'>;
const anexoAtivoDeLinha = (l: LinhaAnexoAtivo): AnexoAtivo => ({
  id: l.id,
  ativoId: l.ativo_id,
  categoria: l.categoria as CategoriaAnexoAtivo,
  nome: l.nome,
  caminho: l.caminho,
  tipo: l.tipo || undefined,
  tamanho: l.tamanho ?? undefined,
  manutencaoId: l.manutencao_id || undefined,
  baixaId: l.baixa_id || undefined,
  criadoPor: l.criado_por || undefined,
  criadoEm: l.criado_em,
});

/** Fase 8: anexa um arquivo ao ativo (pasta ativos/<id>/ do bucket privado; só TI) */
export async function enviarAnexoAtivoDb(
  ativoId: string,
  arquivo: File,
  categoria: CategoriaAnexoAtivo,
  vinculo: { manutencaoId?: string; baixaId?: string } = {}
): Promise<AnexoAtivo> {
  const erro = validarArquivo(arquivo);
  if (erro) throw new DbError(erro, 'validacao');
  const caminho = `ativos/${ativoId}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
  const linha: TablesInsert<'ativo_anexos'> = {
    ativo_id: ativoId,
    categoria,
    nome: arquivo.name,
    caminho,
    tipo: arquivo.type,
    tamanho: arquivo.size,
    manutencao_id: vinculo.manutencaoId || null,
    baixa_id: vinculo.baixaId || null,
  };
  if (!supabase) {
    // Modo demonstração: arquivo só no navegador
    return anexoAtivoDeLinha({
      ...linha,
      id: crypto.randomUUID(),
      caminho: URL.createObjectURL(arquivo),
      criado_em: new Date().toISOString(),
    } as LinhaAnexoAtivo);
  }
  await enviar(caminho, arquivo);
  try {
    const data = await checar(supabase.from('ativo_anexos').insert(linha).select().single());
    return anexoAtivoDeLinha(data as LinhaAnexoAtivo);
  } catch (err) {
    await removerArquivosDb([caminho]).catch(() => undefined);
    throw err;
  }
}

/** Fase 8: remove o registro e o arquivo do anexo */
export async function removerAnexoAtivoDb(anexo: AnexoAtivo) {
  if (!supabase) return;
  await excluir('ativo_anexos', anexo.id);
  // O registro já saiu: se apagar o arquivo falhar, o anexo some da tela do mesmo jeito
  // (o arquivo fica só no Storage privado, sem link para ninguém abrir)
  await removerArquivosDb([anexo.caminho]).catch((err) => console.error('Arquivo do anexo não apagado', err));
}

async function gravarSegredoAtivo(ativoId: string, chave?: string) {
  if (!supabase) return;
  if (chave) {
    await checar(
      supabase
        .from('ativos_segredos')
        .upsert({ ativo_id: ativoId, bitlocker_key: chave, updated_at: new Date().toISOString() })
    );
  } else {
    await checar(supabase.from('ativos_segredos').delete().eq('ativo_id', ativoId));
  }
}

/** Cria o ativo, a chave BitLocker e o histórico de custódia inicial (MED-01) */
export async function insertAssetDb(asset: Asset) {
  if (!supabase) return;
  await checar(supabase.from('ativos').insert(linhaAtivo(asset)));
  if (asset.bitlockerKey) await gravarSegredoAtivo(asset.id, asset.bitlockerKey);
  for (const entrada of asset.historicoCustodia || []) {
    await insertCustodyEntryDb(asset.id, entrada);
  }
}

export async function updateAssetDb(antes: Asset, depois: Asset) {
  await atualizar('ativos', depois.id, camposAlterados(linhaAtivo(antes), linhaAtivo(depois)));
  if ((antes.bitlockerKey || '') !== (depois.bitlockerKey || '')) {
    await gravarSegredoAtivo(depois.id, depois.bitlockerKey);
  }
}

export async function deleteAssetDb(id: string) {
  await excluir('ativos', id);
}

export async function insertCustodyEntryDb(ativoId: string, entry: CustodyHistoryEntry) {
  if (!supabase) return;
  await checar(supabase.from('historico_custodia').insert(linhaCustodia(ativoId, entry)));
}

export async function updateCustodyEntryDb(ativoId: string, antes: CustodyHistoryEntry, depois: CustodyHistoryEntry) {
  await atualizar(
    'historico_custodia',
    depois.id,
    camposAlterados(linhaCustodia(ativoId, antes), linhaCustodia(ativoId, depois))
  );
}

// ---------------------------------------------------------------------------
// 4. Licenças
// ---------------------------------------------------------------------------
export async function fetchLicensesFromDb(): Promise<SoftwareLicense[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('licencas_software').select('*').order('nome');
  if (error) {
    console.error('Erro ao buscar licenças do Supabase:', error);
    return null;
  }
  // Chaves de contrato ficam em licencas_segredos (só TI)
  const { data: segredosData } = await supabase.from('licencas_segredos').select('licenca_id, chave_contrato');
  const chaveByLicId: Record<string, string> = {};
  (segredosData || []).forEach((s) => {
    if (s.chave_contrato) chaveByLicId[s.licenca_id] = s.chave_contrato;
  });
  return data ? data.map((l) => ({
    id: l.id,
    nome: l.nome,
    fornecedor: l.fornecedor,
    chaveContrato: chaveByLicId[l.id] || '',
    assentosTotais: l.assentos_totais,
    assentosAlocados: ((l.colaboradores_ids || []) as string[]).length,
    colaboradoresIds: (l.colaboradores_ids || []) as string[],
    valorMensal: Number(l.valor_mensal) || 0,
    tipoCobranca: (l.tipo_cobranca || 'mensal') as 'mensal' | 'anual',
    dataRenovacao: l.data_renovacao,
    urlPainel: l.url_painel || undefined,
    observacoes: l.observacoes || undefined,
    fornecedorId: l.fornecedor_id || undefined,
    status: (l.status === 'inativa' ? 'inativa' : 'ativa') as 'ativa' | 'inativa',
    inativadaEm: l.inativada_em || undefined,
    inativadaPor: l.inativada_por || undefined,
    inativacaoMotivo: l.inativacao_motivo || undefined,
  })) : [];
}

/** Lote 1 (L4): histórico de assentos (a RLS entrega tudo à T.I. e só o próprio aos demais) */
export async function fetchAtribuicoesLicencaFromDb(): Promise<AtribuicaoLicenca[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('licenca_atribuicoes')
    .select('*')
    .order('inicio', { ascending: false, nullsFirst: false });
  if (error) {
    if (!tabelaAusente(error)) console.error('Erro ao buscar histórico de assentos:', error);
    return null;
  }
  return (data || []).map((a) => ({
    id: a.id,
    licencaId: a.licenca_id,
    colaboradorId: a.colaborador_id,
    inicio: a.inicio || undefined,
    fim: a.fim || undefined,
    atribuidoPor: a.atribuido_por || undefined,
    removidoPor: a.removido_por || undefined,
  }));
}

async function gravarSegredoLicenca(licencaId: string, chave?: string) {
  if (!supabase) return;
  if (chave) {
    await checar(
      supabase
        .from('licencas_segredos')
        .upsert({ licenca_id: licencaId, chave_contrato: chave, updated_at: new Date().toISOString() })
    );
  } else {
    await checar(supabase.from('licencas_segredos').delete().eq('licenca_id', licencaId));
  }
}

export async function insertLicenseDb(lic: SoftwareLicense) {
  if (!supabase) return;
  await checar(supabase.from('licencas_software').insert(linhaLicenca(lic)));
  if (lic.chaveContrato) await gravarSegredoLicenca(lic.id, lic.chaveContrato);
}

/** Edição de dados da licença. Assentos de colaboradores vão pelas RPCs abaixo. */
export async function updateLicenseDb(antes: SoftwareLicense, depois: SoftwareLicense) {
  const diff = camposAlterados(linhaLicenca(antes), linhaLicenca(depois));
  delete diff.colaboradores_ids;
  await atualizar('licencas_software', depois.id, diff);
  if ((antes.chaveContrato || '') !== (depois.chaveContrato || '')) {
    await gravarSegredoLicenca(depois.id, depois.chaveContrato);
  }
}

export async function deleteLicenseDb(id: string) {
  await excluir('licencas_software', id);
}

/** Aloca um assento de forma atômica no banco; devolve a lista atualizada */
export async function alocarLicencaDb(licencaId: string, colaboradorId: string): Promise<string[] | null> {
  if (!supabase) return null;
  return (await checar(
    supabase.rpc('alocar_licenca', { p_licenca: licencaId, p_colaborador: colaboradorId })
  )) as string[];
}

export async function revogarLicencaDb(licencaId: string, colaboradorId: string): Promise<string[] | null> {
  if (!supabase) return null;
  return (await checar(
    supabase.rpc('revogar_licenca', { p_licenca: licencaId, p_colaborador: colaboradorId })
  )) as string[];
}

// ---------------------------------------------------------------------------
// 4b. Fase 8 · Fornecedores, contratos e faturas (só a T.I., pela RLS).
// Quem cadastrou e quando é carimbado pelo banco. Antes da migration as
// tabelas não existem: a leitura devolve lista vazia e as telas seguem.
// ---------------------------------------------------------------------------
const linhaFornecedor = (f: Fornecedor): TablesInsert<'fornecedores'> => ({
  id: f.id,
  nome: f.nome.trim(),
  cnpj: f.cnpj?.trim() || null,
  contato: f.contato?.trim() || null,
  telefone: f.telefone?.trim() || null,
  email: f.email?.trim() || null,
  site: f.site?.trim() || null,
  observacoes: f.observacoes?.trim() || null,
  ativo: f.ativo,
});

const fornecedorDeLinha = (l: Tables<'fornecedores'>): Fornecedor => ({
  id: l.id,
  nome: l.nome,
  cnpj: l.cnpj || undefined,
  contato: l.contato || undefined,
  telefone: l.telefone || undefined,
  email: l.email || undefined,
  site: l.site || undefined,
  observacoes: l.observacoes || undefined,
  ativo: l.ativo,
  criadoPor: l.criado_por || undefined,
  criadoEm: l.criado_em,
});

export async function fetchFornecedoresFromDb(): Promise<Fornecedor[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('fornecedores').select('*').order('nome');
  return error ? [] : (data || []).map(fornecedorDeLinha);
}

export async function insertFornecedorDb(f: Fornecedor) {
  if (!supabase) return;
  await checar(supabase.from('fornecedores').insert(linhaFornecedor(f)));
}

export async function updateFornecedorDb(antes: Fornecedor, depois: Fornecedor) {
  await atualizar('fornecedores', depois.id, camposAlterados(linhaFornecedor(antes), linhaFornecedor(depois)));
}

export async function deleteFornecedorDb(id: string) {
  await excluir('fornecedores', id);
}

// O arquivo do contrato não entra aqui: vai por gravarArquivoDb, depois do registro
const linhaContrato = (c: Contrato): TablesInsert<'contratos'> => ({
  id: c.id,
  fornecedor_id: c.fornecedorId,
  tipo: c.tipo,
  numero: c.numero?.trim() || null,
  descricao: c.descricao.trim(),
  inicio: c.inicio,
  fim: c.fim || null,
  valor: c.valor,
  periodicidade: c.periodicidade,
  sla: c.sla?.trim() || null,
  contato_suporte: c.contatoSuporte?.trim() || null,
  observacoes: c.observacoes?.trim() || null,
});

export async function fetchContratosFromDb(): Promise<Contrato[] | null> {
  if (!supabase) return null;
  const [{ data, error }, { data: itensData }] = await Promise.all([
    supabase.from('contratos').select('*').order('inicio', { ascending: false }),
    supabase.from('contrato_itens').select('contrato_id, ativo_id, licenca_id'),
  ]);
  if (error) return [];
  const itensPorContrato: Record<string, ItemContrato[]> = {};
  (itensData || []).forEach((i) => {
    const item: ItemContrato | null = i.ativo_id ? { ativoId: i.ativo_id } : i.licenca_id ? { licencaId: i.licenca_id } : null;
    if (item) (itensPorContrato[i.contrato_id] ||= []).push(item);
  });
  return (data || []).map((l) => ({
    id: l.id,
    fornecedorId: l.fornecedor_id,
    tipo: l.tipo as TipoContrato,
    numero: l.numero || undefined,
    descricao: l.descricao,
    inicio: l.inicio,
    fim: l.fim || undefined,
    valor: Number(l.valor) || 0,
    periodicidade: l.periodicidade as PeriodicidadeContrato,
    sla: l.sla || undefined,
    contatoSuporte: l.contato_suporte || undefined,
    arquivoCaminho: l.arquivo_caminho || undefined,
    observacoes: l.observacoes || undefined,
    itens: itensPorContrato[l.id] || [],
    criadoPor: l.criado_por || undefined,
    criadoEm: l.criado_em,
  }));
}

/**
 * Contrato e itens cobertos numa transação só (função salvar_contrato do banco):
 * cria ou atualiza o contrato, inclui os itens novos e exclui os que saíram.
 * Se algo falhar, nada fica gravado e a tela desfaz a alteração.
 */
async function salvarContratoDb(c: Contrato) {
  if (!supabase) return;
  await checar(
    supabase.rpc('salvar_contrato', {
      p_contrato: json(linhaContrato(c)),
      p_itens: json(c.itens.map((i) => ({ ativo_id: i.ativoId || null, licenca_id: i.licencaId || null }))),
    })
  );
}

export const insertContratoDb = (c: Contrato) => salvarContratoDb(c);

export const updateContratoDb = (_antes: Contrato, depois: Contrato) => salvarContratoDb(depois);

/** Exclui o contrato (os itens saem junto) e o arquivo dele */
export async function deleteContratoDb(c: Contrato) {
  await excluir('contratos', c.id);
  if (c.arquivoCaminho) await removerArquivosDb([c.arquivoCaminho]).catch(() => undefined);
}

const linhaFatura = (f: Fatura): TablesInsert<'faturas'> => ({
  id: f.id,
  licenca_id: f.licencaId || null,
  contrato_id: f.contratoId || null,
  competencia: f.competencia,
  valor: f.valor,
  vencimento: f.vencimento,
  pago_em: f.pagoEm || null,
  status: f.status,
  numero_documento: f.numeroDocumento?.trim() || null,
  observacoes: f.observacoes?.trim() || null,
});

export async function fetchFaturasFromDb(): Promise<Fatura[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('faturas').select('*').order('competencia', { ascending: false });
  if (error) return [];
  return (data || []).map((l) => ({
    id: l.id,
    licencaId: l.licenca_id || undefined,
    contratoId: l.contrato_id || undefined,
    competencia: l.competencia,
    valor: Number(l.valor) || 0,
    vencimento: l.vencimento,
    pagoEm: l.pago_em || undefined,
    status: l.status as StatusFatura,
    numeroDocumento: l.numero_documento || undefined,
    arquivoCaminho: l.arquivo_caminho || undefined,
    observacoes: l.observacoes || undefined,
    criadoPor: l.criado_por || undefined,
    criadoEm: l.criado_em,
  }));
}

export async function insertFaturaDb(f: Fatura) {
  if (!supabase) return;
  await checar(supabase.from('faturas').insert(linhaFatura(f)));
}

export async function updateFaturaDb(antes: Fatura, depois: Fatura) {
  await atualizar('faturas', depois.id, camposAlterados(linhaFatura(antes), linhaFatura(depois)));
}

export async function deleteFaturaDb(f: Fatura) {
  await excluir('faturas', f.id);
  if (f.arquivoCaminho) await removerArquivosDb([f.arquivoCaminho]).catch(() => undefined);
}

/**
 * Arquivo do contrato ou da fatura (pastas contratos/<id>/ e faturas/<id>/,
 * só a T.I. envia). Sobe o arquivo, grava o caminho no registro e só então
 * apaga o arquivo anterior. Devolve o caminho novo.
 */
export async function gravarArquivoDb(
  tabela: 'contratos' | 'faturas',
  id: string,
  arquivo: File,
  anterior?: string
): Promise<string> {
  const erro = validarArquivo(arquivo);
  if (erro) throw new DbError(erro, 'validacao');
  // Modo demonstração: arquivo só no navegador
  if (!supabase) return URL.createObjectURL(arquivo);
  const caminho = `${tabela}/${id}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
  await enviar(caminho, arquivo);
  try {
    await atualizar(tabela, id, { arquivo_caminho: caminho });
  } catch (err) {
    await removerArquivosDb([caminho]).catch(() => undefined);
    throw err;
  }
  if (anterior && anterior !== caminho) await removerArquivosDb([anterior]).catch(() => undefined);
  return caminho;
}

// ---------------------------------------------------------------------------
// 5. Chamados e mensagens
// ---------------------------------------------------------------------------
export async function fetchTicketsFromDb(): Promise<Ticket[] | null> {
  if (!supabase) return null;
  // Fase 4 (MED-07): janela dos chamados mais recentes, e só as mensagens dessa
  // janela (antes: todos os chamados e TODAS as mensagens a cada login).
  const { data, error } = await supabase
    .from('chamados')
    .select('*')
    .order('data_criacao', { ascending: false })
    .limit(LIMITE_CHAMADOS);
  if (error) {
    console.error('Erro ao buscar chamados do Supabase:', error);
    return null;
  }

  const maisAntigo = data && data.length > 0 ? data[data.length - 1].data_criacao : null;
  let consultaMsgs = supabase.from('chamado_mensagens').select('*').order('data_envio', { ascending: true });
  if (maisAntigo) consultaMsgs = consultaMsgs.gte('data_envio', maisAntigo);
  const { data: msgsData, error: msgsError } = await consultaMsgs;
  if (msgsError) console.error('Erro ao buscar mensagens dos chamados:', msgsError);

  const messagesByTicketId: Record<string, TicketMessage[]> = {};
  (msgsData || []).forEach((m) => {
    if (!messagesByTicketId[m.chamado_id]) messagesByTicketId[m.chamado_id] = [];
    messagesByTicketId[m.chamado_id].push({
      id: m.id,
      autorId: m.autor_id,
      autorNome: m.autor_nome,
      autorRole: (m.autor_papel || 'colaborador') as UserRole,
      texto: m.texto,
      ehNotaInterna: Boolean(m.eh_nota_interna),
      data: m.data_envio,
      anexos: (m.anexos || []) as unknown as TicketAttachment[],
    });
  });

  return data ? data.map((t) => ({
    id: t.id,
    codigo: t.codigo,
    titulo: t.titulo,
    descricao: t.descricao,
    tipo: t.tipo as TicketType,
    categoria: t.categoria,
    prioridade: t.prioridade as TicketPriority,
    status: t.status as TicketStatus,
    solicitanteId: t.solicitante_id,
    solicitanteNome: t.solicitante_nome,
    solicitanteEmail: t.solicitante_email,
    solicitanteCargo: t.solicitante_cargo,
    solicitanteSetorNome: t.solicitante_setor_nome,
    tecnicoResponsavelId: t.tecnico_responsavel_id || undefined,
    tecnicoResponsavelNome: t.tecnico_responsavel_nome || undefined,
    ativoId: t.ativo_id || undefined,
    softwareId: t.software_id || undefined,
    softwareNome: t.software_nome || undefined,
    onboarding: (t.onboarding || undefined) as unknown as OnboardingData | undefined,
    offboarding: (t.offboarding || undefined) as unknown as OffboardingData | undefined,
    anexos: (t.anexos || []) as unknown as TicketAttachment[],
    mensagens: messagesByTicketId[t.id] || [],
    dataCriacao: t.data_criacao,
    dataAtualizacao: t.data_atualizacao,
    colaboradorId: t.colaborador_id || undefined,
    ...camposAtendimento(t),
  })) : [];
}

/** Fase 10: solução, cancelamento, avaliação e "aguardando" vindos do banco */
function camposAtendimento(t: Tables<'chamados'>): Partial<Ticket> {
  return {
    resolucao:
      t.resolucao_solucao && t.resolucao_causa && t.resolucao_tipo
        ? {
            causa: t.resolucao_causa as CausaChamado,
            solucao: t.resolucao_solucao,
            tipo: t.resolucao_tipo as TipoSolucao,
            proximoPasso: t.resolucao_proximo_passo || undefined,
            tempoMin: t.resolucao_tempo_min ?? undefined,
            resolvidoPor: t.resolvido_por || undefined,
            resolvidoEm: t.resolvido_em || undefined,
          }
        : undefined,
    cancelamento: t.cancelamento_motivo
      ? {
          motivo: t.cancelamento_motivo as MotivoCancelamento,
          detalhe: t.cancelamento_detalhe || undefined,
          canceladoPor: t.cancelado_por || undefined,
        }
      : undefined,
    reaberturas: t.reaberturas ?? 0,
    avaliacao: t.avaliacao ? { nota: t.avaliacao, comentario: t.avaliacao_comentario || undefined } : undefined,
    aguardandoMotivo: (t.aguardando_motivo as AguardandoMotivo | null) || undefined,
    primeiraRespostaEm: t.primeira_resposta_em || undefined,
  };
}

/** Fase 10 C1: mudanças de situação de todos os chamados visíveis (pausas do prazo) */
export async function fetchEventosStatusDb(): Promise<Record<string, EventoChamado[]>> {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from('chamado_eventos')
    .select('*')
    .in('tipo', ['status', 'reaberto', 'resolvido', 'cancelado'])
    .order('criado_em', { ascending: true });
  if (error || !data) return {};
  const porChamado: Record<string, EventoChamado[]> = {};
  for (const e of data) {
    (porChamado[e.chamado_id] ||= []).push({
      id: e.id,
      chamadoId: e.chamado_id,
      tipo: e.tipo as EventoChamado['tipo'],
      de: e.de || undefined,
      para: e.para || undefined,
      detalhe: e.detalhe || undefined,
      autorId: e.autor_id || undefined,
      criadoEm: e.criado_em,
    });
  }
  return porChamado;
}

// Fase 10: ações do atendimento (funções no banco; validam papel e regras)
export async function resolverChamadoDb(chamadoId: string, d: DadosResolucao) {
  if (!supabase) return;
  await checar(
    supabase.rpc('resolver_chamado', {
      p_chamado: chamadoId,
      p_causa: d.causa,
      p_solucao: d.solucao,
      p_tipo: d.tipo,
      p_proximo_passo: d.proximoPasso || undefined,
      p_tempo_min: d.tempoMin ?? undefined,
    })
  );
}

export async function cancelarChamadoDb(chamadoId: string, motivo: MotivoCancelamento, detalhe?: string) {
  if (!supabase) return;
  await checar(supabase.rpc('cancelar_chamado', { p_chamado: chamadoId, p_motivo: motivo, p_detalhe: detalhe || undefined }));
}

export async function reabrirChamadoDb(chamadoId: string, motivo: string) {
  if (!supabase) return;
  await checar(supabase.rpc('reabrir_chamado', { p_chamado: chamadoId, p_motivo: motivo }));
}

export async function avaliarChamadoDb(chamadoId: string, nota: number, comentario?: string) {
  if (!supabase) return;
  await checar(supabase.rpc('avaliar_chamado', { p_chamado: chamadoId, p_nota: nota, p_comentario: comentario || undefined }));
}

/** Um chamado relido do banco (depois de uma ação feita por função) */
export async function fetchChamadoDb(chamadoId: string): Promise<Partial<Ticket> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('chamados').select('*').eq('id', chamadoId).single();
  if (error || !data) return null;
  return {
    status: data.status as TicketStatus,
    dataAtualizacao: data.data_atualizacao,
    ...camposAtendimento(data),
  };
}

export async function fetchEventosChamadoDb(chamadoId: string): Promise<EventoChamado[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('chamado_eventos')
    .select('*')
    .eq('chamado_id', chamadoId)
    .order('criado_em', { ascending: true });
  if (error || !data) return [];
  return data.map((e) => ({
    id: e.id,
    chamadoId: e.chamado_id,
    tipo: e.tipo as EventoChamado['tipo'],
    de: e.de || undefined,
    para: e.para || undefined,
    detalhe: e.detalhe || undefined,
    autorId: e.autor_id || undefined,
    criadoEm: e.criado_em,
  }));
}

/** Cria o chamado e devolve o código gerado pelo banco (#CH-AAAA-NNNN) */
export async function insertTicketDb(t: Ticket): Promise<{ codigo: string } | null> {
  if (!supabase) return null;
  return (await checar(
    supabase.from('chamados').insert(linhaChamado(t)).select('codigo').single()
  )) as { codigo: string };
}

export async function updateTicketDb(antes: Ticket, depois: Ticket) {
  await atualizar('chamados', depois.id, camposAlterados(linhaChamado(antes), linhaChamado(depois)));
}

export async function insertTicketMessageDb(chamadoId: string, msg: TicketMessage) {
  if (!supabase) return;
  await checar(supabase.from('chamado_mensagens').insert(linhaMensagem(chamadoId, msg)));
}

// ---------------------------------------------------------------------------
// 6. Termos
// ---------------------------------------------------------------------------
export async function fetchTermsFromDb(): Promise<ResponsibilityTerm[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('termos_responsabilidade').select('*').order('data_emissao', { ascending: false });
  if (error) {
    console.error('Erro ao buscar termos do Supabase:', error);
    return null;
  }
  return data ? data.map((tm) => ({
    id: tm.id,
    codigo: tm.codigo,
    tipo: tm.tipo as 'entrega' | 'devolucao',
    colaboradorId: tm.colaborador_id,
    colaboradorNome: tm.colaborador_nome,
    colaboradorMatricula: tm.colaborador_matricula,
    colaboradorCargo: tm.colaborador_cargo,
    colaboradorSetorNome: tm.colaborador_setor_nome,
    ativoIds: (tm.ativo_ids || []) as string[],
    dataEmissao: tm.data_emissao,
    statusAssinatura: (tm.status_assinatura === 'assinado' ? 'assinado' : 'gerado') as 'gerado' | 'assinado',
    arquivoAssinadoUrl: tm.arquivo_url || undefined,
    responsavelTIId: tm.responsavel_ti_id,
    responsavelTINome: tm.responsavel_ti_nome,
    chamadoId: tm.chamado_id || undefined,
    itens: (tm.itens || []) as unknown as ItemTermo[],
    observacoes: tm.observacoes || undefined,
    localUnidade: tm.local_unidade || undefined,
    docCodigo: tm.doc_codigo || undefined,
    docVersao: tm.doc_versao || undefined,
    docReferencia: tm.doc_referencia || undefined,
    docTitulo: tm.doc_titulo || undefined,
    textoClausula: tm.texto_clausula || undefined,
    hashConteudo: tm.hash_conteudo || undefined,
    aceiteColaboradorEm: tm.aceite_colaborador_em || undefined,
    aceiteTiEm: tm.aceite_ti_em || undefined,
    aceiteTiPor: tm.aceite_ti_por || undefined,
    formaAssinatura: (tm.forma_assinatura || 'pendente') as ResponsibilityTerm['formaAssinatura'],
    motivoDispensa: tm.motivo_dispensa || undefined,
    dataAssinatura: tm.data_assinatura || undefined,
    canceladoEm: tm.cancelado_em || undefined,
    canceladoPor: tm.cancelado_por || undefined,
    cancelamentoMotivo: tm.cancelamento_motivo || undefined,
    substituidoPor: tm.substituido_por || undefined,
  })) : [];
}

/** Lote 1: cancela (ou marca como substituído) o termo; o anterior fica no histórico */
export async function cancelarTermoDb(termoId: string, motivo: string, substitutoId?: string) {
  if (!supabase) return;
  await checar(
    supabase.rpc('cancelar_termo', { p_termo: termoId, p_motivo: motivo, p_substituto: substitutoId || undefined })
  );
}

/** Cria o termo e devolve o código gerado pelo banco (#TR-AAAA-NNNN) */
export async function insertTermDb(tm: ResponsibilityTerm): Promise<{ codigo: string } | null> {
  if (!supabase) return null;
  return (await checar(
    supabase.from('termos_responsabilidade').insert(linhaTermo(tm)).select('codigo').single()
  )) as { codigo: string };
}

export async function updateTermDb(antes: ResponsibilityTerm, depois: ResponsibilityTerm) {
  const diff = camposAlterados(linhaTermo(antes), linhaTermo(depois));
  if (diff.status_assinatura === 'assinado') diff.data_assinatura = new Date().toISOString();
  await atualizar('termos_responsabilidade', depois.id, diff);
}

// ---------------------------------------------------------------------------
// 7. Configurações da empresa (linha única)
// ---------------------------------------------------------------------------
export async function fetchSettingsFromDb(): Promise<CompanySettings | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('configuracoes_empresa').select('*').limit(1).maybeSingle();
  if (error || !data) {
    return null;
  }
  return {
    razaoSocial: data.razao_social,
    nomeFantasia: data.nome_fantasia,
    cnpj: data.cnpj,
    endereco: data.endereco,
    cidadeUF: data.cidade_uf,
    cep: data.cep,
    emailTI: data.email_ti,
    telefoneTI: data.telefone_ti,
    textoTermoEntrega: data.texto_termo_entrega,
    textoTermoDevolucao: data.texto_termo_devolucao,
    camposPersonalizados: (data.campos_personalizados || []) as unknown as CustomFieldDefinition[],
    docEntrega: (data.doc_entrega || undefined) as unknown as ModeloDocumento | undefined,
    docDevolucao: (data.doc_devolucao || undefined) as unknown as ModeloDocumento | undefined,
    logoUrl: data.logo_url || undefined,
    sla: (data.sla || undefined) as CompanySettings['sla'],
  };
}

export async function saveSettingsDb(st: CompanySettings) {
  if (!supabase) return;
  const data = await checar(
    supabase
      .from('configuracoes_empresa')
      .upsert({
        id: 'config_principal',
        razao_social: st.razaoSocial,
        nome_fantasia: st.nomeFantasia,
        cnpj: st.cnpj,
        endereco: st.endereco,
        cidade_uf: st.cidadeUF,
        cep: st.cep,
        email_ti: st.emailTI,
        telefone_ti: st.telefoneTI,
        texto_termo_entrega: st.textoTermoEntrega,
        texto_termo_devolucao: st.textoTermoDevolucao,
        campos_personalizados: json(st.camposPersonalizados || []),
        ...(st.docEntrega ? { doc_entrega: json(st.docEntrega) } : {}),
        ...(st.docDevolucao ? { doc_devolucao: json(st.docDevolucao) } : {}),
        logo_url: st.logoUrl || null,
        sla: st.sla ? json(st.sla) : null,
        updated_at: new Date().toISOString(),
      })
      .select('id')
  );
  if (!data || (data as unknown[]).length === 0) throw new DbError(SEM_PERMISSAO, '42501');
}

// ---------------------------------------------------------------------------
// 7b. Arquivos no Storage privado (Fase 3 · MED-04)
// ---------------------------------------------------------------------------
const BUCKET = 'documentos';
export const TIPOS_ARQUIVO_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];
export const TAMANHO_MAXIMO_ARQUIVO = 10 * 1024 * 1024;

/** Valida tipo e tamanho antes de enviar (o bucket valida de novo no servidor) */
export function validarArquivo(arquivo: File): string | null {
  if (!TIPOS_ARQUIVO_ACEITOS.includes(arquivo.type)) {
    return `"${arquivo.name}": tipo não aceito. Envie PDF, PNG, JPG, WEBP ou TXT.`;
  }
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
    return `"${arquivo.name}": maior que 10 MB.`;
  }
  return null;
}

const nomeSeguro = (nome: string) =>
  nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);

/** Nome para mostrar a partir do caminho no Storage (sem a pasta e sem o prefixo aleatório) */
export const nomeDoArquivo = (caminho: string) =>
  caminho.startsWith('blob:') ? 'arquivo' : (caminho.split('/').pop() || caminho).replace(/^[0-9a-f-]{36}-/i, '');

export const formatarTamanho = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function enviar(caminho: string, arquivo: File) {
  if (!supabase) return;
  await checar(
    supabase.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  );
}

/** Anexo de chamado: vai para a pasta da própria pessoa (usuarios/<uid>/...) */
export async function enviarAnexoDb(arquivo: File, authUserId: string | undefined) {
  const erro = validarArquivo(arquivo);
  if (erro) throw new DbError(erro, 'validacao');
  const id = `att-${crypto.randomUUID()}`;
  const base = {
    id,
    nome: arquivo.name,
    tipo: arquivo.type,
    tamanho: formatarTamanho(arquivo.size),
    dataUpload: new Date().toISOString(),
  };
  if (!supabase || !authUserId) {
    // Modo demonstração: arquivo só no navegador
    return { ...base, url: URL.createObjectURL(arquivo) };
  }
  const caminho = `usuarios/${authUserId}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
  await enviar(caminho, arquivo);
  return { ...base, url: '', caminho };
}

/** Remove arquivos do Storage (usado para desfazer anexos de um chamado que não foi aberto) */
export async function removerArquivosDb(caminhos: string[]) {
  if (!supabase || caminhos.length === 0) return;
  await checar(supabase.storage.from(BUCKET).remove(caminhos));
}

/** Termo assinado: só TI envia (termos/<termo_id>/...); devolve o caminho */
export async function enviarTermoAssinadoDb(termoId: string, arquivo: File): Promise<string> {
  const erro = validarArquivo(arquivo);
  if (erro) throw new DbError(erro, 'validacao');
  if (!supabase) return URL.createObjectURL(arquivo);
  const caminho = `termos/${termoId}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
  await enviar(caminho, arquivo);
  return caminho;
}

/** Gera um link temporário (5 min) para um arquivo do Storage, respeitando a RLS */
export async function linkTemporarioDb(caminhoOuUrl: string): Promise<string> {
  if (!supabase || /^(https?:|blob:)/.test(caminhoOuUrl)) return caminhoOuUrl;
  const data = await checar(supabase.storage.from(BUCKET).createSignedUrl(caminhoOuUrl, 300));
  return (data as { signedUrl: string }).signedUrl;
}

// ---------------------------------------------------------------------------
// 7c. Processos (Fase 3): offboarding automático e LGPD
// ---------------------------------------------------------------------------
export interface ResumoOffboarding {
  colaboradorId: string;
  ativosDevolvidos: number;
  licencasLiberadas: number;
}

export async function concluirOffboardingDb(chamadoId: string): Promise<ResumoOffboarding | null> {
  if (!supabase) return null;
  return (await checar(supabase.rpc('concluir_offboarding', { p_chamado: chamadoId }))) as unknown as ResumoOffboarding;
}

export async function anonimizarColaboradorDb(colaboradorId: string) {
  if (!supabase) return;
  await checar(supabase.rpc('anonimizar_colaborador', { p_colaborador: colaboradorId }));
}

// ---------------------------------------------------------------------------
// 7d. Fase 6 · Processos guiados (catálogo, checklist, inventário, lembretes)
// ---------------------------------------------------------------------------
export async function fetchCatalogoFromDb(): Promise<CatalogoItem[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('catalogo_itens').select('*').order('tipo').order('ordem');
  if (error) {
    console.error('Erro ao buscar catálogo:', error);
    return null;
  }
  return (data || []).map((c) => ({
    id: c.id,
    tipo: c.tipo as TipoCatalogo,
    nome: c.nome,
    descricao: c.descricao || undefined,
    sugeridoOnboarding: c.sugerido_onboarding,
    ativo: c.ativo,
    ordem: c.ordem,
  }));
}

export async function salvarCatalogoItemDb(item: CatalogoItem, novo: boolean) {
  if (!supabase) return;
  const linha = {
    id: item.id,
    tipo: item.tipo,
    nome: item.nome.trim(),
    descricao: item.descricao || null,
    sugerido_onboarding: item.sugeridoOnboarding,
    ativo: item.ativo,
    ordem: item.ordem,
  };
  if (novo) {
    await checar(supabase.from('catalogo_itens').insert(linha));
  } else {
    await atualizar('catalogo_itens', item.id, linha);
  }
}

const mapearItem = (i: {
  id: string; chamado_id: string; tipo: string; titulo: string; detalhe: string | null; sugerido_por: string;
  status: string; observacao: string | null; catalogo_id: string | null; recurso_id: string | null;
  ativo_id: string | null; licenca_id: string | null; identificador: string | null; destino: string | null;
  destino_colaborador_id: string | null; condicao: string | null; lembrete_em: string | null; ordem: number;
  criado_por: string | null; criado_em: string; concluido_por: string | null; concluido_em: string | null;
}): ProcessoItem => ({
  id: i.id,
  chamadoId: i.chamado_id,
  tipo: i.tipo as TipoItemProcesso,
  titulo: i.titulo,
  detalhe: i.detalhe || undefined,
  sugeridoPor: i.sugerido_por as ProcessoItem['sugeridoPor'],
  status: i.status as StatusItemProcesso,
  observacao: i.observacao || undefined,
  catalogoId: i.catalogo_id || undefined,
  recursoId: i.recurso_id || undefined,
  ativoId: i.ativo_id || undefined,
  licencaId: i.licenca_id || undefined,
  identificador: i.identificador || undefined,
  destino: (i.destino || undefined) as DestinoRecurso | undefined,
  destinoColaboradorId: i.destino_colaborador_id || undefined,
  condicao: (i.condicao || undefined) as CondicaoItem | undefined,
  lembreteEm: i.lembrete_em || undefined,
  ordem: i.ordem,
  criadoPor: i.criado_por || undefined,
  criadoEm: i.criado_em,
  concluidoPor: i.concluido_por || undefined,
  concluidoEm: i.concluido_em || undefined,
});

export async function fetchProcessoItensFromDb(): Promise<ProcessoItem[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('processo_itens').select('*').order('chamado_id').order('ordem');
  if (error) {
    console.error('Erro ao buscar checklists:', error);
    return null;
  }
  return (data || []).map(mapearItem);
}

/** Salva o checklist montado (rascunho) de um chamado; devolve os itens criados */
export async function inserirProcessoItensDb(chamadoId: string, itens: ProcessoItemRascunho[], ordemInicial = 0) {
  if (!supabase) return null;
  const linhas = itens.map((r, i) => ({
    chamado_id: chamadoId,
    tipo: r.tipo,
    titulo: r.titulo,
    detalhe: r.detalhe || null,
    sugerido_por: r.sugeridoPor,
    catalogo_id: r.catalogoId || null,
    recurso_id: r.recursoId || null,
    ativo_id: r.ativoId || null,
    licenca_id: r.licencaId || null,
    identificador: r.identificador || null,
    ordem: ordemInicial + i + 1,
  }));
  const data = await checar(supabase.from('processo_itens').insert(linhas).select('*'));
  return (data || []).map(mapearItem);
}

export async function excluirProcessoItemDb(id: string) {
  await excluir('processo_itens', id);
}

export interface DadosRegistroItem {
  colaborador_id?: string;
  identificador?: string;
  ativo_id?: string;
  licenca_id?: string;
  destino?: DestinoRecurso;
  destino_colaborador_id?: string;
  condicao?: CondicaoItem;
  lembrete_em?: string;
}

export async function registrarItemProcessoDb(
  itemId: string,
  status: StatusItemProcesso,
  observacao: string | undefined,
  dados: DadosRegistroItem
) {
  if (!supabase) return null;
  return checar(
    supabase.rpc('registrar_item_processo', {
      p_item: itemId,
      p_status: status,
      p_observacao: observacao || undefined,
      p_dados: json(dados),
    })
  );
}

export async function concluirProcessoDb(chamadoId: string) {
  if (!supabase) return null;
  return (await checar(supabase.rpc('concluir_processo', { p_chamado: chamadoId }))) as unknown as {
    chamado: string;
    termoPendente: boolean;
  };
}

export async function fetchRecursosFromDb(): Promise<ColaboradorRecurso[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('colaborador_recursos').select('*').order('concedido_em');
  if (error) {
    console.error('Erro ao buscar inventário de acessos:', error);
    return null;
  }
  return (data || []).map((r) => ({
    id: r.id,
    colaboradorId: r.colaborador_id,
    tipo: r.tipo as ColaboradorRecurso['tipo'],
    catalogoId: r.catalogo_id || undefined,
    nome: r.nome,
    identificador: r.identificador || undefined,
    status: r.status as StatusRecurso,
    concedidoEm: r.concedido_em,
    concedidoPor: r.concedido_por || undefined,
    chamadoConcessao: r.chamado_concessao || undefined,
    encerradoEm: r.encerrado_em || undefined,
    encerradoPor: r.encerrado_por || undefined,
    chamadoEncerramento: r.chamado_encerramento || undefined,
    observacao: r.observacao || undefined,
  }));
}

export async function fetchLembretesFromDb(): Promise<Lembrete[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('lembretes').select('*').order('vence_em');
  if (error) {
    // RH e colaborador não têm acesso aos lembretes (são tarefas da TI)
    return [];
  }
  return (data || []).map((l) => ({
    id: l.id,
    titulo: l.titulo,
    descricao: l.descricao || undefined,
    venceEm: l.vence_em,
    status: l.status as Lembrete['status'],
    chamadoId: l.chamado_id || undefined,
    colaboradorId: l.colaborador_id || undefined,
    ativoId: l.ativo_id || undefined,
    contratoId: l.contrato_id || undefined,
    itemId: l.item_id || undefined,
    criadoPor: l.criado_por || undefined,
    criadoEm: l.criado_em,
    concluidoPor: l.concluido_por || undefined,
    concluidoEm: l.concluido_em || undefined,
    observacaoConclusao: l.observacao_conclusao || undefined,
  }));
}

export async function criarLembreteDb(
  l: Pick<Lembrete, 'titulo' | 'descricao' | 'venceEm' | 'chamadoId' | 'colaboradorId' | 'ativoId' | 'contratoId'>
) {
  if (!supabase) return null;
  const data = await checar(
    supabase
      .from('lembretes')
      .insert({
        titulo: l.titulo,
        descricao: l.descricao || null,
        vence_em: l.venceEm,
        chamado_id: l.chamadoId || null,
        colaborador_id: l.colaboradorId || null,
        ativo_id: l.ativoId || null,
        contrato_id: l.contratoId || null,
      })
      .select('id')
      .single()
  );
  return (data as { id: string }).id;
}

export async function encerrarLembreteDb(id: string, status: 'feito' | 'cancelado', observacao?: string) {
  await atualizar('lembretes', id, { status, observacao_conclusao: observacao || null });
}

export async function fetchEventosProcessoDb(chamadoId: string): Promise<ProcessoEvento[]> {
  if (!supabase) return [];
  const data = await checar(
    supabase.from('processo_eventos').select('*').eq('chamado_id', chamadoId).order('em', { ascending: false })
  );
  return (data || []).map((e) => ({
    id: e.id,
    chamadoId: e.chamado_id,
    itemId: e.item_id || undefined,
    acao: e.acao,
    detalhe: (e.detalhe || undefined) as Record<string, unknown> | undefined,
    por: e.por || undefined,
    em: e.em,
  }));
}

export async function aceitarTermoDb(termoId: string) {
  if (!supabase) return null;
  return (await checar(supabase.rpc('aceitar_termo', { p_termo: termoId }))) as unknown as {
    colaborador: boolean;
    ti: boolean;
    assinado: boolean;
    hash: string;
  };
}

export async function dispensarAssinaturaTermoDb(termoId: string, motivo: string) {
  if (!supabase) return;
  await checar(supabase.rpc('dispensar_assinatura_termo', { p_termo: termoId, p_motivo: motivo }));
}

/** 6c: cria o login no Nexus (ou gera nova senha) pela Edge Function; a senha volta uma única vez */
export async function acessoNexusDb(colaboradorId: string, acao: 'criar' | 'redefinir', chamadoId?: string) {
  if (!supabase) throw new DbError('Disponível apenas com o Supabase configurado.', 'validacao');
  const { data, error } = await supabase.functions.invoke('criar-acesso-nexus', {
    body: { colaborador_id: colaboradorId, acao, chamado_id: chamadoId },
  });
  if (error) {
    // A função devolve { erro } com a explicação; o supabase-js a coloca em error.context
    let mensagem = error.message;
    try {
      const corpo = await (error as { context?: Response }).context?.json();
      if (corpo?.erro) mensagem = corpo.erro;
    } catch {
      // mantém a mensagem padrão
    }
    throw new DbError(mensagem, 'validacao');
  }
  return data as { email: string; senha: string; acao: string };
}

// ---------------------------------------------------------------------------
// 8. Health check
// ---------------------------------------------------------------------------
export interface SupabaseHealthStatus {
  connected: boolean;
  tablesExist: boolean;
  message?: string;
}

export async function checkSupabaseHealth(): Promise<SupabaseHealthStatus> {
  if (!supabase) {
    return {
      connected: false,
      tablesExist: false,
      message: 'Supabase não inicializado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
    };
  }
  try {
    const { error } = await supabase.from('departamentos').select('id').limit(1);
    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return {
          connected: true,
          tablesExist: false,
          message: 'Conectado ao Supabase, mas o Schema SQL ainda não foi executado. Execute o arquivo supabase-schema.sql no SQL Editor do Supabase.',
        };
      }
      return {
        connected: false,
        tablesExist: false,
        message: `Erro ao consultar Supabase: ${error.message}`,
      };
    }
    return {
      connected: true,
      tablesExist: true,
      message: 'Conexão ativa e tabelas prontas no Supabase.',
    };
  } catch (err) {
    return {
      connected: false,
      tablesExist: false,
      message: (err as Error)?.message || 'Falha de comunicação com o Supabase.',
    };
  }
}

// ---------------------------------------------------------------------------
// 9. Limpeza completa (zerar base) — só ti_admin pela RLS. A única chamada é o
// "Zerar dados" de Configurações, que fica oculto quando o Supabase está
// configurado (Fase 0): na prática não roda em produção.
// ---------------------------------------------------------------------------

/** Tabela que ainda não existe (migration não aplicada): não há o que apagar nela */
const tabelaAusente = (error: { code?: string; message?: string }) =>
  error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || '');

export async function clearAllDatabaseTables(keepEmployeeEmail?: string) {
  if (!supabase) return;
  // Lote 1: uma função no banco (só ti_admin) apaga tudo numa transação — histórico
  // do chamado, checklist, recursos e assentos incluídos. Ou apaga tudo, ou nada.
  // Baixa patrimonial não se apaga: com baixa registrada, nada é apagado.
  await checar(
    supabase.rpc('limpar_base', { p_confirmacao: 'APAGAR TUDO', p_manter_email: keepEmployeeEmail?.toLowerCase() })
  );
}
