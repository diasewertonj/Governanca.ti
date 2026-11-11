import { supabase } from './supabase.ts';
import {
  Asset,
  CompanySettings,
  CustodyHistoryEntry,
  Department,
  Employee,
  ResponsibilityTerm,
  SoftwareLicense,
  Ticket,
  TicketMessage,
} from '../types/index.ts';

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

async function checar<T>(op: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await op;
  if (error) lancar(error);
  return data;
}

function camposAlterados(antes: Linha, depois: Linha): Linha {
  const diff: Linha = {};
  Object.keys(depois).forEach((k) => {
    if (JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null)) diff[k] = depois[k];
  });
  return diff;
}

const SEM_PERMISSAO = 'Sem permissão para alterar este registro, ou ele não existe mais.';

async function atualizar(tabela: string, id: string, campos: Linha, chave = 'id') {
  if (!supabase || Object.keys(campos).length === 0) return;
  const data = await checar(supabase.from(tabela).update(campos).eq(chave, id).select(chave));
  if (!data || (data as unknown[]).length === 0) throw new DbError(SEM_PERMISSAO, '42501');
}

async function excluir(tabela: string, id: string, chave = 'id') {
  if (!supabase) return;
  const data = await checar(supabase.from(tabela).delete().eq(chave, id).select(chave));
  if (!data || (data as unknown[]).length === 0) throw new DbError(SEM_PERMISSAO, '42501');
}

/** Mensagem curta para o usuário a partir de um erro do banco */
export function mensagemDeErro(err: unknown): string {
  const e = err as { code?: string; message?: string };
  switch (e?.code) {
    case '42501':
      return 'sem permissão para esta ação';
    case '23505':
      return 'já existe um registro com esses dados (e-mail, matrícula, tag, série ou código repetido)';
    case '23503':
      return 'o registro está vinculado a outros dados (histórico, chamados ou termos) e não pode ser removido';
    case '23514':
      return e.message?.includes('assento') ? e.message : 'valor não aceito pelo banco';
    case '23502':
      return 'campo obrigatório não preenchido';
    default:
      return e?.message || 'falha de comunicação com o banco';
  }
}

// ---------------------------------------------------------------------------
// Mapeamento entidade -> linha do banco
// ---------------------------------------------------------------------------
const linhaSetor = (d: Department): Linha => ({
  id: d.id,
  nome: d.nome,
  codigo: d.codigo,
  descricao: d.descricao || null,
  ativo: d.ativo,
  responsavel_id: d.responsavelId || null,
});

const linhaColaborador = (e: Employee): Linha => ({
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

const linhaAtivo = (a: Asset): Linha => ({
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
  fiscal: a.fiscal || {},
  custom_fields: a.customFields || {},
});

const linhaCustodia = (ativoId: string, c: CustodyHistoryEntry): Linha => ({
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

const linhaLicenca = (l: SoftwareLicense): Linha => ({
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
});

const linhaChamado = (t: Ticket): Linha => ({
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
  onboarding: t.onboarding || null,
  offboarding: t.offboarding || null,
  anexos: t.anexos || [],
});

const linhaMensagem = (chamadoId: string, m: TicketMessage): Linha => ({
  id: m.id,
  chamado_id: chamadoId,
  autor_id: m.autorId,
  autor_nome: m.autorNome,
  autor_papel: m.autorRole,
  texto: m.texto,
  eh_nota_interna: m.ehNotaInterna,
  data_envio: m.data,
  anexos: m.anexos || [],
});

const linhaTermo = (tm: ResponsibilityTerm): Linha => ({
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
  return data ? data.map((d: any) => ({
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
  return data ? data.map((e: any) => ({
    id: e.id,
    matricula: e.matricula,
    nome: e.nome,
    email: e.email,
    cargo: e.cargo,
    setorId: e.setor_id,
    gestorId: e.gestor_id || undefined,
    status: e.status,
    role: e.role,
    dataAdmissao: e.data_admissao,
    telefone: e.telefone || undefined,
    avatarUrl: e.avatar_url || undefined,
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
  (segredosData || []).forEach((s: any) => {
    if (s.bitlocker_key) bitlockerByAssetId[s.ativo_id] = s.bitlocker_key;
  });

  const custodyByAssetId: Record<string, CustodyHistoryEntry[]> = {};
  (custodyData || []).forEach((c: any) => {
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

  return data ? data.map((a: any) => ({
    id: a.id,
    tag: a.tag,
    nome: a.nome,
    categoria: a.categoria,
    marca: a.marca,
    modelo: a.modelo,
    serialNumber: a.serial_number,
    status: a.status,
    localizacaoFisica: a.localizacao_fisica,
    setorId: a.setor_id || undefined,
    custodianteId: a.custodiante_id || undefined,
    dataEntregaAtual: a.data_entrega_atual || undefined,
    sistemaOperacional: a.sistema_operacional || undefined,
    bitlockerKey: bitlockerByAssetId[a.id] || undefined,
    fiscal: a.fiscal || undefined,
    customFields: a.custom_fields || {},
    historicoCustodia: custodyByAssetId[a.id] || [],
    historicoManutencao: [],
  })) : [];
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
  (segredosData || []).forEach((s: any) => {
    if (s.chave_contrato) chaveByLicId[s.licenca_id] = s.chave_contrato;
  });
  return data ? data.map((l: any) => ({
    id: l.id,
    nome: l.nome,
    fornecedor: l.fornecedor,
    chaveContrato: chaveByLicId[l.id] || '',
    assentosTotais: l.assentos_totais,
    assentosAlocados: (l.colaboradores_ids || []).length,
    colaboradoresIds: l.colaboradores_ids || [],
    valorMensal: Number(l.valor_mensal) || 0,
    tipoCobranca: l.tipo_cobranca || 'mensal',
    dataRenovacao: l.data_renovacao,
    urlPainel: l.url_painel || undefined,
    observacoes: l.observacoes || undefined,
  })) : [];
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
// 5. Chamados e mensagens
// ---------------------------------------------------------------------------
export async function fetchTicketsFromDb(): Promise<Ticket[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('chamados').select('*').order('data_criacao', { ascending: false });
  if (error) {
    console.error('Erro ao buscar chamados do Supabase:', error);
    return null;
  }

  const { data: msgsData, error: msgsError } = await supabase
    .from('chamado_mensagens')
    .select('*')
    .order('data_envio', { ascending: true });
  if (msgsError) console.error('Erro ao buscar mensagens dos chamados:', msgsError);

  const messagesByTicketId: Record<string, TicketMessage[]> = {};
  (msgsData || []).forEach((m: any) => {
    if (!messagesByTicketId[m.chamado_id]) messagesByTicketId[m.chamado_id] = [];
    messagesByTicketId[m.chamado_id].push({
      id: m.id,
      autorId: m.autor_id,
      autorNome: m.autor_nome,
      autorRole: m.autor_papel || 'colaborador',
      texto: m.texto,
      ehNotaInterna: Boolean(m.eh_nota_interna),
      data: m.data_envio,
      anexos: m.anexos || [],
    });
  });

  return data ? data.map((t: any) => ({
    id: t.id,
    codigo: t.codigo,
    titulo: t.titulo,
    descricao: t.descricao,
    tipo: t.tipo,
    categoria: t.categoria,
    prioridade: t.prioridade,
    status: t.status,
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
    onboarding: t.onboarding || undefined,
    offboarding: t.offboarding || undefined,
    anexos: t.anexos || [],
    mensagens: messagesByTicketId[t.id] || [],
    dataCriacao: t.data_criacao,
    dataAtualizacao: t.data_atualizacao,
  })) : [];
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
  return data ? data.map((tm: any) => ({
    id: tm.id,
    codigo: tm.codigo,
    tipo: tm.tipo,
    colaboradorId: tm.colaborador_id,
    colaboradorNome: tm.colaborador_nome,
    colaboradorMatricula: tm.colaborador_matricula,
    colaboradorCargo: tm.colaborador_cargo,
    colaboradorSetorNome: tm.colaborador_setor_nome,
    ativoIds: tm.ativo_ids || [],
    dataEmissao: tm.data_emissao,
    statusAssinatura: (tm.status_assinatura === 'assinado' ? 'assinado' : 'gerado') as 'gerado' | 'assinado',
    arquivoAssinadoUrl: tm.arquivo_url || undefined,
    responsavelTIId: tm.responsavel_ti_id,
    responsavelTINome: tm.responsavel_ti_nome,
  })) : [];
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
    camposPersonalizados: data.campos_personalizados || [],
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
        campos_personalizados: st.camposPersonalizados || [],
        updated_at: new Date().toISOString(),
      })
      .select('id')
  );
  if (!data || (data as unknown[]).length === 0) throw new DbError(SEM_PERMISSAO, '42501');
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
  } catch (err: any) {
    return {
      connected: false,
      tablesExist: false,
      message: err?.message || 'Falha de comunicação com o Supabase.',
    };
  }
}

// ---------------------------------------------------------------------------
// 9. Limpeza completa (zerar base) — só ti_admin pela RLS; oculta em produção
// ---------------------------------------------------------------------------
export async function clearAllDatabaseTables(keepEmployeeEmail?: string) {
  if (!supabase) return;
  const tabelas = [
    'chamado_mensagens',
    'chamados',
    'termos_responsabilidade',
    'historico_custodia',
    'ativos',
    'licencas_software',
  ];
  for (const t of tabelas) {
    await checar(supabase.from(t).delete().neq('id', 'dummy_zero'));
  }
  if (keepEmployeeEmail) {
    await checar(supabase.from('colaboradores').delete().neq('email', keepEmployeeEmail.toLowerCase()));
  }
}
