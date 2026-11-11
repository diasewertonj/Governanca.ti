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
 * SERVIÇO DE PERSISTÊNCIA EM BANCO SUPABASE POSTGRESQL (FULLSTACK)
 */

// 1. Departamentos
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

export async function upsertDepartmentDb(dept: Department) {
  if (!supabase) return;
  await supabase.from('departamentos').upsert({
    id: dept.id,
    nome: dept.nome,
    codigo: dept.codigo,
    descricao: dept.descricao || null,
    ativo: dept.ativo,
    responsavel_id: dept.responsavelId || null,
  });
}

export async function deleteDepartmentDb(id: string) {
  if (!supabase) return;
  await supabase.from('departamentos').delete().eq('id', id);
}

// 2. Colaboradores
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

export async function upsertEmployeeDb(emp: Employee) {
  if (!supabase) return;
  await supabase.from('colaboradores').upsert({
    id: emp.id,
    matricula: emp.matricula,
    nome: emp.nome,
    email: emp.email,
    cargo: emp.cargo,
    setor_id: emp.setorId,
    gestor_id: emp.gestorId || null,
    status: emp.status,
    role: emp.role || 'colaborador',
    data_admissao: emp.dataAdmissao,
    telefone: emp.telefone || null,
    avatar_url: emp.avatarUrl || null,
  });
}

export async function deleteEmployeeDb(id: string) {
  if (!supabase) return;
  await supabase.from('colaboradores').delete().eq('id', id);
}

// 3. Ativos
export async function fetchAssetsFromDb(): Promise<Asset[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('ativos').select('*').order('tag');
  if (error) {
    console.error('Erro ao buscar ativos do Supabase:', error);
    return null;
  }

  // Buscar histórico de custódia vinculado
  const { data: custodyData } = await supabase
    .from('historico_custodia')
    .select('*')
    .order('data_entrega', { ascending: true });

  // Chaves BitLocker ficam em ativos_segredos (só TI enxerga; para os demais a RLS
  // devolve vazio). Em bancos ainda sem a tabela, o erro é ignorado.
  const { data: segredosData } = await supabase.from('ativos_segredos').select('ativo_id, bitlocker_key');
  const bitlockerByAssetId: Record<string, string> = {};
  (segredosData || []).forEach((s: any) => {
    if (s.bitlocker_key) bitlockerByAssetId[s.ativo_id] = s.bitlocker_key;
  });

  const custodyByAssetId: Record<string, CustodyHistoryEntry[]> = {};
  if (custodyData) {
    custodyData.forEach((c: any) => {
      if (!custodyByAssetId[c.ativo_id]) {
        custodyByAssetId[c.ativo_id] = [];
      }
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
  }

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
    custodianteId: a.custodiante_id || null,
    dataEntregaAtual: a.data_entrega_atual || undefined,
    sistemaOperacional: a.sistema_operacional || undefined,
    bitlockerKey: bitlockerByAssetId[a.id] || a.bitlocker_key || undefined,
    fiscal: a.fiscal || undefined,
    customFields: a.custom_fields || {},
    historicoCustodia: custodyByAssetId[a.id] || [],
    historicoManutencao: [],
  })) : [];
}

export async function upsertCustodyEntryDb(ativoId: string, entry: CustodyHistoryEntry) {
  if (!supabase) return;
  await supabase.from('historico_custodia').upsert({
    id: entry.id,
    ativo_id: ativoId,
    colaborador_id: entry.colaboradorId,
    colaborador_nome: entry.colaboradorNome,
    data_entrega: entry.dataEntrega,
    data_devolucao: entry.dataDevolucao || null,
    motivo_devolucao: entry.motivoDevolucao || null,
    termo_id: entry.termoId || null,
    observacoes: entry.observacoes || null,
  });
}

export async function upsertAssetDb(asset: Asset) {
  if (!supabase) return;
  await supabase.from('ativos').upsert({
    id: asset.id,
    tag: asset.tag,
    nome: asset.nome,
    categoria: asset.categoria,
    marca: asset.marca,
    modelo: asset.modelo,
    serial_number: asset.serialNumber,
    status: asset.status,
    localizacao_fisica: asset.localizacaoFisica,
    custodiante_id: asset.custodianteId || null,
    data_entrega_atual: asset.dataEntregaAtual || null,
    sistema_operacional: asset.sistemaOperacional || null,
    fiscal: asset.fiscal || {},
    custom_fields: asset.customFields || {},
  });

  // Segredo separado, depois do ativo (FK)
  if (asset.bitlockerKey) {
    await supabase
      .from('ativos_segredos')
      .upsert({ ativo_id: asset.id, bitlocker_key: asset.bitlockerKey, updated_at: new Date().toISOString() });
  } else {
    await supabase.from('ativos_segredos').delete().eq('ativo_id', asset.id);
  }
}

export async function deleteAssetDb(id: string) {
  if (!supabase) return;
  await supabase.from('ativos').delete().eq('id', id);
}

// 4. Licenças / Softwares
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
    chaveContrato: chaveByLicId[l.id] || l.chave_contrato || '',
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

export async function upsertLicenseDb(lic: SoftwareLicense) {
  if (!supabase) return;
  await supabase.from('licencas_software').upsert({
    id: lic.id,
    nome: lic.nome,
    fornecedor: lic.fornecedor,
    assentos_totais: lic.assentosTotais,
    colaboradores_ids: lic.colaboradoresIds,
    valor_mensal: lic.valorMensal,
    tipo_cobranca: lic.tipoCobranca || 'mensal',
    data_renovacao: lic.dataRenovacao,
    url_painel: lic.urlPainel || null,
    observacoes: lic.observacoes || null,
  });

  // Segredo separado, depois da licença (FK)
  if (lic.chaveContrato) {
    await supabase
      .from('licencas_segredos')
      .upsert({ licenca_id: lic.id, chave_contrato: lic.chaveContrato, updated_at: new Date().toISOString() });
  } else {
    await supabase.from('licencas_segredos').delete().eq('licenca_id', lic.id);
  }
}

export async function deleteLicenseDb(id: string) {
  if (!supabase) return;
  await supabase.from('licencas_software').delete().eq('id', id);
}

// 5. Chamados (Tickets)
export async function fetchTicketsFromDb(): Promise<Ticket[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('chamados').select('*').order('data_criacao', { ascending: false });
  if (error) {
    console.error('Erro ao buscar chamados do Supabase:', error);
    return null;
  }

  // Buscar mensagens vinculadas aos chamados
  const { data: msgsData } = await supabase
    .from('chamado_mensagens')
    .select('*')
    .order('data_envio', { ascending: true });

  const messagesByTicketId: Record<string, TicketMessage[]> = {};
  if (msgsData) {
    msgsData.forEach((m: any) => {
      if (!messagesByTicketId[m.chamado_id]) {
        messagesByTicketId[m.chamado_id] = [];
      }
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
  }

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

export async function addTicketMessageDb(chamadoId: string, msg: TicketMessage) {
  if (!supabase) return;
  await supabase.from('chamado_mensagens').upsert({
    id: msg.id,
    chamado_id: chamadoId,
    autor_id: msg.autorId,
    autor_nome: msg.autorNome,
    autor_papel: msg.autorRole,
    texto: msg.texto,
    eh_nota_interna: msg.ehNotaInterna,
    data_envio: msg.data,
    anexos: msg.anexos || [],
  });
}

export async function upsertTicketDb(t: Ticket) {
  if (!supabase) return;
  await supabase.from('chamados').upsert({
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
    data_criacao: t.dataCriacao,
    data_atualizacao: t.dataAtualizacao,
  });
}

// 6. Termos
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

export async function upsertTermDb(tm: ResponsibilityTerm) {
  if (!supabase) return;
  await supabase.from('termos_responsabilidade').upsert({
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
    data_assinatura: tm.statusAssinatura === 'assinado' ? new Date().toISOString() : null,
    status_assinatura: tm.statusAssinatura,
    arquivo_url: tm.arquivoAssinadoUrl || null,
    responsavel_ti_id: tm.responsavelTIId,
    responsavel_ti_nome: tm.responsavelTINome,
  });
}

// 7. Configurações da Empresa
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

export async function upsertSettingsDb(st: CompanySettings) {
  if (!supabase) return;
  await supabase.from('configuracoes_empresa').upsert({
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
  });
}

// 8. Health Check e Validação das Tabelas
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

// 9. Limpeza Completa das Tabelas para Produção (Zerar Banco)
export async function clearAllDatabaseTables(keepEmployeeEmail?: string) {
  if (!supabase) return;
  try {
    await supabase.from('chamado_mensagens').delete().neq('id', 'dummy_zero');
    await supabase.from('chamados').delete().neq('id', 'dummy_zero');
    await supabase.from('termos_responsabilidade').delete().neq('id', 'dummy_zero');
    await supabase.from('historico_custodia').delete().neq('id', 'dummy_zero');
    await supabase.from('ativos').delete().neq('id', 'dummy_zero');
    await supabase.from('licencas_software').delete().neq('id', 'dummy_zero');
    if (keepEmployeeEmail) {
      await supabase.from('colaboradores').delete().neq('email', keepEmployeeEmail.toLowerCase());
    }
  } catch (err) {
    console.error('Erro ao limpar tabelas do Supabase:', err);
  }
}

