import React, { createContext, useCallback, useContext, useRef, useState, useEffect } from 'react';
import { confirmarDescarte } from '../components/comum/BarraAlteracoes.tsx';
import {
  AnexoAtivo,
  CategoriaAnexoAtivo,
  Asset,
  CatalogoItem,
  ColaboradorRecurso,
  CompanySettings,
  Contrato,
  CustodyHistoryEntry,
  DadosBaixa,
  DadosEncerramentoManutencao,
  DadosManutencao,
  Department,
  Employee,
  Fatura,
  Fornecedor,
  Lembrete,
  ProcessoItem,
  ProcessoItemRascunho,
  ResponsibilityTerm,
  StatusItemProcesso,
  SoftwareLicense,
  Ticket,
  TicketAttachment,
  TicketStatus,
  UserRole,
} from '../types/index.ts';
import {
  INITIAL_ASSETS,
  INITIAL_COMPANY_SETTINGS,
  INITIAL_CONTRATOS,
  INITIAL_DEPARTMENTS,
  INITIAL_EMPLOYEES,
  INITIAL_FATURAS,
  INITIAL_FORNECEDORES,
  INITIAL_LICENSES,
  INITIAL_TERMS,
  INITIAL_TICKETS,
} from '../data/initialData.ts';

import {
  supabase,
  isSupabaseConfigured,
  signInWithGoogleSupabase,
  signInWithPasswordSupabase,
  signOutSupabase,
  solicitarRecuperacaoSenhaSupabase,
  definirSenhaSupabase,
  tipoLinkAuth,
  erroLinkAuth,
  SupabaseAuthUser,
} from '../services/supabase.ts';

import {
  fetchDepartmentsFromDb,
  insertDepartmentDb,
  updateDepartmentDb,
  deleteDepartmentDb,
  fetchEmployeesFromDb,
  insertEmployeeDb,
  updateEmployeeDb,
  deleteEmployeeDb,
  fetchAssetsFromDb,
  insertAssetDb,
  enviarAnexoAtivoDb,
  removerAnexoAtivoDb,
  updateAssetDb,
  fetchLicensesFromDb,
  insertLicenseDb,
  updateLicenseDb,
  deleteLicenseDb,
  alocarLicencaDb,
  revogarLicencaDb,
  fetchTicketsFromDb,
  insertTicketDb,
  updateTicketDb,
  resolverChamadoDb,
  cancelarChamadoDb,
  reabrirChamadoDb,
  avaliarChamadoDb,
  fetchChamadoDb,
  fetchEventosChamadoDb,
  insertTicketMessageDb,
  fetchTermsFromDb,
  insertTermDb,
  updateTermDb,
  fetchSettingsFromDb,
  saveSettingsDb,
  checkSupabaseHealth,
  clearAllDatabaseTables,
  insertCustodyEntryDb,
  updateCustodyEntryDb,
  mensagemDeErro,
  concluirOffboardingDb,
  anonimizarColaboradorDb,
  ResumoOffboarding,
  SupabaseHealthStatus,
  fetchCatalogoFromDb,
  salvarCatalogoItemDb,
  fetchProcessoItensFromDb,
  inserirProcessoItensDb,
  excluirProcessoItemDb,
  registrarItemProcessoDb,
  DadosRegistroItem,
  concluirProcessoDb,
  fetchRecursosFromDb,
  fetchLembretesFromDb,
  criarLembreteDb,
  encerrarLembreteDb,
  aceitarTermoDb,
  dispensarAssinaturaTermoDb,
  acessoNexusDb,
  fetchFornecedoresFromDb,
  insertFornecedorDb,
  updateFornecedorDb,
  deleteFornecedorDb,
  fetchContratosFromDb,
  insertContratoDb,
  updateContratoDb,
  deleteContratoDb,
  fetchFaturasFromDb,
  insertFaturaDb,
  updateFaturaDb,
  deleteFaturaDb,
  gravarArquivoDb,
  abrirManutencaoDb,
  registrarManutencaoFeitaDb,
  encerrarManutencaoDb,
  baixarAtivoDb,
  estornarBaixaDb,
} from '../services/supabaseDb.ts';
import { CATALOGO_PADRAO } from '../utils/processos.ts';
import {
  empilharFicha,
  fecharFichaNaPosicao,
  fecharUltimaDoTipo,
  voltarFechaOutras,
  type FichaAberta,
  type TipoFicha,
} from '../utils/fichas.ts';
import { notaDaManutencao } from '../utils/vinculos.ts';
import type { AguardandoMotivo, DadosResolucao, EventoChamado, MotivoCancelamento } from '../types/index.ts';
import { erroCancelamento, erroResolucao } from '../utils/atendimento.ts';
import { isoLocal } from '../utils/formatters.ts';
import { resumoVinculos, temVinculos, vinculosDoFornecedor } from '../utils/contratos.ts';
import {
  aplicarAbertura,
  aplicarBaixa,
  aplicarEncerramento,
  aplicarEstorno,
  aplicarManutencaoFeita,
  bloqueiosDaBaixa,
  erroAoAbrirManutencao,
  juntarObservacoes,
  novaManutencao,
  statusAoMudarCustodia,
  validarBaixa,
  validarEncerramento,
  validarManutencao,
} from '../utils/cicloVida.ts';

/** Tipo do pedido de senha: link de e-mail ou primeiro login com senha provisória (Fase 6) */
export type TipoLinkSenha = 'recovery' | 'invite' | 'primeiro_acesso';

/** Fase 8: o id do registro criado (manutenção, baixa) ou o motivo da recusa */
export type ResultadoRegistro = { id: string; erro?: undefined } | { erro: string; id?: undefined };

/** Rascunho de edição de um chamado (Fase 5: só grava ao clicar em Salvar) */
export interface AlteracoesChamado {
  status?: TicketStatus;
  tecnicoId?: string; // '' = remover o técnico
  checklist?: Record<string, boolean>; // id do item -> concluído
  aguardandoMotivo?: AguardandoMotivo | ''; // Fase 10: por que está aguardando
  // Fase 9: vínculos do chamado ('' = remover)
  ativoId?: string;
  softwareId?: string;
  colaboradorId?: string;
}

interface AppContextType {
  // Autenticação e Usuário Atual (Supabase + Perfis)
  supabaseUser: SupabaseAuthUser | null;
  isSupabaseConnected: boolean;
  supabaseHealth: SupabaseHealthStatus | null;
  refreshSupabaseData: () => Promise<void>;
  authLoading: boolean;
  authError: string | null;
  // Último erro de gravação no banco (a alteração na tela já foi desfeita)
  dbErro: string | null;
  limparDbErro: () => void;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  currentUser: Employee | null;
  currentRole: UserRole;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;

  // Entidades
  employees: Employee[];
  departments: Department[];
  assets: Asset[];
  licenses: SoftwareLicense[];
  tickets: Ticket[];
  terms: ResponsibilityTerm[];
  settings: CompanySettings;

  // Ações de Colaboradores
  addEmployee: (employee: Omit<Employee, 'id'>) => Employee;
  cadastrarColaborador: (employee: Omit<Employee, 'id'>) => Promise<{ colaborador?: Employee; erro?: string }>;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  updateEmployeeRole: (employeeId: string, role: UserRole) => void;
  deleteEmployee: (id: string) => { success: boolean; message?: string };

  // Ações de Setores
  addDepartment: (department: Omit<Department, 'id'>) => Department;
  updateDepartment: (id: string, updates: Partial<Department>) => void;
  deleteDepartment: (id: string) => { success: boolean; message?: string };

  // Ações de Ativos
  addAsset: (asset: Omit<Asset, 'id'>) => Asset;
  updateAsset: (id: string, updates: Partial<Asset>) => void;
  /** Fase 8: envia o arquivo e só então mostra o anexo (devolve false se falhar) */
  anexarArquivoAtivo: (
    ativoId: string,
    arquivo: File,
    categoria: CategoriaAnexoAtivo,
    vinculo?: { manutencaoId?: string; baixaId?: string }
  ) => Promise<boolean>;
  removerAnexoAtivo: (anexo: AnexoAtivo) => Promise<boolean>;
  transferAssetCustody: (
    assetId: string,
    newColaboradorId: string | null,
    motivoDevolucao?: string
  ) => void;

  // Fase 8 · Manutenção e baixa. As funções do banco mudam o status e a custódia:
  // a tela espera a resposta, e o erro volta em texto para mostrar no formulário.
  abrirManutencao: (ativoId: string, dados: DadosManutencao) => Promise<ResultadoRegistro>;
  registrarManutencaoFeita: (ativoId: string, dados: DadosManutencao & { concluidaEm: string }) => Promise<ResultadoRegistro>;
  encerrarManutencao: (
    manutencaoId: string,
    status: 'concluida' | 'cancelada',
    dados?: DadosEncerramentoManutencao
  ) => Promise<string | null>;
  baixarAtivo: (ativoId: string, dados: DadosBaixa) => Promise<ResultadoRegistro>;
  estornarBaixa: (baixaId: string, motivo: string) => Promise<string | null>;

  // Ações de Licenças
  addLicense: (license: Omit<SoftwareLicense, 'id' | 'assentosAlocados'>) => SoftwareLicense;
  updateLicense: (id: string, updates: Partial<SoftwareLicense>) => void;
  deleteLicense: (id: string) => { success: boolean; message?: string };
  allocateLicense: (licenseId: string, employeeId: string) => void;
  revokeLicense: (licenseId: string, employeeId: string) => void;

  // Ações de Chamados (Service Desk)
  // Assíncrono: o código (#CH-AAAA-NNNN) vem do banco. Devolve null se falhar.
  createTicket: (
    ticket: Omit<Ticket, 'id' | 'codigo' | 'dataCriacao' | 'dataAtualizacao' | 'mensagens'>
  ) => Promise<Ticket | null>;
  addTicketMessage: (
    ticketId: string,
    texto: string,
    ehNotaInterna: boolean,
    anexos?: TicketAttachment[]
  ) => void;
  updateTicketStatus: (ticketId: string, status: TicketStatus) => void;
  salvarAlteracoesChamado: (ticketId: string, mudancas: AlteracoesChamado) => void;
  // Fase 10: atendimento documentado (devolvem o erro em texto ou null)
  resolverChamado: (ticketId: string, dados: DadosResolucao) => Promise<string | null>;
  cancelarChamado: (ticketId: string, motivo: MotivoCancelamento, detalhe?: string) => Promise<string | null>;
  reabrirChamado: (ticketId: string, motivo: string) => Promise<string | null>;
  avaliarChamado: (ticketId: string, nota: number, comentario?: string) => Promise<string | null>;
  carregarEventosChamado: (ticketId: string) => Promise<EventoChamado[]>;

  // Fase 5: alterações não salvas
  registrarPendencias: (origem: string, itens: string[]) => void;
  podeDescartarPendencias: () => boolean;

  // Ações de Termos
  // Assíncrono: o código (#TR-AAAA-NNNN) vem do banco. Devolve null se falhar.
  createTerm: (
    term: Omit<ResponsibilityTerm, 'id' | 'codigo' | 'dataEmissao'>
  ) => Promise<ResponsibilityTerm | null>;
  markTermSigned: (termId: string, arquivoUrl?: string) => void;

  // Fase 3 · Processos
  concluirOffboarding: (ticketId: string) => Promise<ResumoOffboarding | null>;
  anonimizarColaborador: (employeeId: string) => Promise<boolean>;
  precisaDefinirSenha: boolean;
  tipoLinkSenha: TipoLinkSenha | null;

  // Fase 6 · Processos guiados
  catalogo: CatalogoItem[];
  processoItens: ProcessoItem[];
  recursos: ColaboradorRecurso[];
  lembretes: Lembrete[];
  salvarChecklist: (chamadoId: string, itens: ProcessoItemRascunho[]) => Promise<boolean>;
  removerItemProcesso: (itemId: string) => Promise<boolean>;
  /** Devolve a mensagem de erro (ou null se gravou) para mostrar junto do formulário */
  registrarItemProcesso: (
    itemId: string,
    status: StatusItemProcesso,
    observacao: string | undefined,
    dados: DadosRegistroItem
  ) => Promise<string | null>;
  concluirProcesso: (chamadoId: string) => Promise<string | null>;
  acessoNexus: (
    colaboradorId: string,
    acao: 'criar' | 'redefinir',
    chamadoId?: string
  ) => Promise<{ email: string; senha: string } | { erro: string }>;
  salvarCatalogo: (itens: CatalogoItem[], novosIds: string[]) => Promise<boolean>;
  criarLembrete: (
    l: Pick<Lembrete, 'titulo' | 'descricao' | 'venceEm' | 'chamadoId' | 'colaboradorId' | 'ativoId' | 'contratoId'>
  ) => Promise<string | null>;
  encerrarLembrete: (id: string, status: 'feito' | 'cancelado', observacao?: string) => Promise<string | null>;
  aceitarTermo: (termoId: string) => Promise<string | null>;
  dispensarAssinaturaTermo: (termoId: string, motivo: string) => Promise<string | null>;

  // Fase 8 · Fornecedores, contratos e faturas (só a T.I.; gravação otimista)
  fornecedores: Fornecedor[];
  contratos: Contrato[];
  faturas: Fatura[];
  criarFornecedor: (dados: Omit<Fornecedor, 'id' | 'criadoEm' | 'criadoPor'>) => Fornecedor;
  alterarFornecedor: (id: string, mudancas: Partial<Fornecedor>) => void;
  excluirFornecedor: (id: string) => { success: boolean; message?: string };
  criarContrato: (dados: Omit<Contrato, 'id' | 'criadoEm' | 'criadoPor' | 'arquivoCaminho'>) => Contrato;
  alterarContrato: (id: string, mudancas: Partial<Contrato>) => void;
  excluirContrato: (id: string) => { success: boolean; message?: string };
  lancarFatura: (dados: Omit<Fatura, 'id' | 'criadoEm' | 'criadoPor' | 'arquivoCaminho'>) => Fatura;
  alterarFatura: (id: string, mudancas: Partial<Fatura>) => void;
  excluirFatura: (id: string) => void;
  /** Sobe o arquivo do contrato/fatura (espera o registro novo ser gravado); false se falhar */
  anexarArquivoContrato: (contratoId: string, arquivo: File) => Promise<boolean>;
  anexarArquivoFatura: (faturaId: string, arquivo: File) => Promise<boolean>;

  erroLinkAuth: string | null;
  solicitarRecuperacaoSenha: (email: string) => Promise<{ success: boolean; error?: string }>;
  definirNovaSenha: (senha: string) => Promise<{ success: boolean; error?: string }>;

  // Configurações e Reset
  updateSettings: (updates: Partial<CompanySettings>) => void;
  resetToInitialData: () => void;
  clearAllDataToProduction: () => Promise<void>;

  // Navegação Relacional 360° e Modais
  // Fase 9: as fichas ficam numa pilha; os set...(id) abrem por cima da atual
  pilhaFichas: FichaAberta[];
  abrirFicha: (ficha: FichaAberta) => void;
  fecharFicha: (posicao: number) => void;
  setSelectedAssetIdFor360: (id: string | null) => void;
  setSelectedSoftwareIdFor360: (id: string | null) => void;
  softwareModalOpen: boolean;
  setSoftwareModalOpen: (open: boolean) => void;
  softwareToEdit: SoftwareLicense | null;
  setSoftwareToEdit: (lic: SoftwareLicense | null) => void;
  setSelectedEmployeeIdFor360: (id: string | null) => void;
  setSelectedTicketIdForDetail: (id: string | null) => void;
  selectedTermForPrint: ResponsibilityTerm | null;
  setSelectedTermForPrint: (term: ResponsibilityTerm | null) => void;
  selectedAssetForQrCode: Asset | null;
  setSelectedAssetForQrCode: (asset: Asset | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  USER: 'nexus_user_id',
  EMPLOYEES: 'nexus_employees_v1',
  DEPARTMENTS: 'nexus_departments_v1',
  ASSETS: 'nexus_assets_v1',
  LICENSES: 'nexus_licenses_v1',
  TICKETS: 'nexus_tickets_v1',
  TERMS: 'nexus_terms_v1',
  SETTINGS: 'nexus_settings_v1',
};

// Fase 1: com Supabase (produção), dados de negócio NÃO ficam no navegador.
// O cache só existe no modo demonstração (sem Supabase).
function limparCacheLocal() {
  try {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  } catch {
    // armazenamento indisponível (modo privado etc.): nada a limpar
  }
}

if (isSupabaseConfigured) {
  limparCacheLocal();
}

// Funções utilitárias para descartar dados mock legados caso Supabase esteja configurado
function parseStoredOrNull<T>(key: string, isDemoDetector?: (data: T) => boolean): T | null {
  if (isSupabaseConfigured) return null;
  const saved = localStorage.getItem(key);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved);
    if (isSupabaseConfigured && isDemoDetector && isDemoDetector(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Quando conectado ao Supabase, a base de produção inicia ZERADA (limpa)!
  // Apenas em modo offline/sem chaves o sistema carrega os dados de teste (INITIAL_*).
  const isProduction = isSupabaseConfigured;

  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = parseStoredOrNull<Employee[]>(STORAGE_KEYS.EMPLOYEES, (emps) =>
      emps.some((e) => (e.id === 'emp-1' || e.id === 'emp-001') && e.nome === 'Carlos Eduardo Mendes')
    );
    if (saved) return saved;
    return isProduction ? [] : INITIAL_EMPLOYEES;
  });

  const [departments, setDepartments] = useState<Department[]>(() => {
    const saved = parseStoredOrNull<Department[]>(STORAGE_KEYS.DEPARTMENTS);
    if (saved && saved.length > 0) return saved;
    return INITIAL_DEPARTMENTS;
  });

  const [assets, setAssets] = useState<Asset[]>(() => {
    const saved = parseStoredOrNull<Asset[]>(STORAGE_KEYS.ASSETS, (ast) =>
      ast.some((a) => a.id === 'ast-1' || a.id === 'ast-001')
    );
    // Fase 8: o cache do modo demonstração pode ter manutenções no formato antigo (sem abertaEm)
    if (saved) {
      return saved.map((a) => ({ ...a, historicoManutencao: (a.historicoManutencao || []).filter((m) => Boolean(m.abertaEm)) }));
    }
    return isProduction ? [] : INITIAL_ASSETS;
  });

  const [licenses, setLicenses] = useState<SoftwareLicense[]>(() => {
    const saved = parseStoredOrNull<SoftwareLicense[]>(STORAGE_KEYS.LICENSES, (lic) =>
      lic.some((l) => l.id === 'lic-1' || l.id === 'lic-001')
    );
    if (saved) return saved;
    return isProduction ? [] : INITIAL_LICENSES;
  });

  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const saved = parseStoredOrNull<Ticket[]>(STORAGE_KEYS.TICKETS, (tkt) =>
      tkt.some((t) => t.id === 'tkt-1' || t.id === 'tkt-001')
    );
    if (saved) return saved;
    return isProduction ? [] : INITIAL_TICKETS;
  });

  const [terms, setTerms] = useState<ResponsibilityTerm[]>(() => {
    const saved = parseStoredOrNull<ResponsibilityTerm[]>(STORAGE_KEYS.TERMS, (trm) =>
      trm.some((t) => t.id === 'tr-1' || t.id === 'tr-001')
    );
    if (saved) return saved;
    return isProduction ? [] : INITIAL_TERMS;
  });

  const [settings, setSettings] = useState<CompanySettings>(() => {
    const saved = parseStoredOrNull<CompanySettings>(STORAGE_KEYS.SETTINGS);
    return saved ? saved : INITIAL_COMPANY_SETTINGS;
  });

  // Usuário Supabase real e Usuário corporativo
  const [supabaseUser, setSupabaseUser] = useState<SupabaseAuthUser | null>(null);
  const [supabaseHealth, setSupabaseHealth] = useState<SupabaseHealthStatus | null>(null);
  // Em produção, a tela fica em "carregando" até o Supabase dizer se há sessão
  const [authLoading, setAuthLoading] = useState<boolean>(isSupabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  // Fase 3: aberto por link de convite/recuperação -> pedir nova senha antes de tudo
  const [precisaDefinirSenha, setPrecisaDefinirSenha] = useState<boolean>(Boolean(tipoLinkAuth));
  const [tipoLinkSenha, setTipoLinkSenha] = useState<TipoLinkSenha | null>(tipoLinkAuth as TipoLinkSenha | null);

  // Fase 6: catálogo, checklists, inventário de acessos e lembretes
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>(isProduction ? [] : CATALOGO_PADRAO);
  const [processoItens, setProcessoItens] = useState<ProcessoItem[]>([]);
  const [recursos, setRecursos] = useState<ColaboradorRecurso[]>([]);
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);

  // Fase 8: fornecedores, contratos e faturas (no modo demonstração, só em memória)
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>(isProduction ? [] : INITIAL_FORNECEDORES);
  const [contratos, setContratos] = useState<Contrato[]>(isProduction ? [] : INITIAL_CONTRATOS);
  const [faturas, setFaturas] = useState<Fatura[]>(isProduction ? [] : INITIAL_FATURAS);

  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    if (isProduction) return null;
    return localStorage.getItem(STORAGE_KEYS.USER) || 'emp-1';
  });

  // Fase 1 (CRIT-02): o login só ENCONTRA o perfil já cadastrado pela TI/RH.
  // Nunca cria perfil nem define papel pelo navegador.
  const vincularUsuarioComColaborador = (user: SupabaseAuthUser, lista: Employee[]) => {
    const cleanEmail = (user.email || '').toLowerCase();
    const existing = lista.find((e) => e.email.toLowerCase() === cleanEmail);
    if (existing && existing.status !== 'desligado') {
      setAuthError(null);
      setCurrentUserId(existing.id);
      return existing;
    }
    setCurrentUserId(null);
    setAuthError(
      existing
        ? 'Seu acesso foi encerrado. Fale com a equipe de T.I.'
        : 'Seu login ainda não tem um perfil liberado no sistema. Peça à equipe de T.I. para cadastrar seu e-mail em Colaboradores.'
    );
    return null;
  };

  // Limpa todo o estado de negócio (logout, sessão expirada)
  const limparEstado = () => {
    setEmployees(isProduction ? [] : INITIAL_EMPLOYEES);
    setAssets([]);
    setLicenses([]);
    setTickets([]);
    setTerms([]);
    setProcessoItens([]);
    setRecursos([]);
    setLembretes([]);
    setFornecedores([]);
    setContratos([]);
    setFaturas([]);
    setCurrentUserId(null);
    setSupabaseUser(null);
    limparCacheLocal();
  };

  // Carregar dados das tabelas do Supabase (Modo Fullstack).
  // Só faz sentido com sessão: sem login a RLS devolve listas vazias.
  // Retorna a lista de colaboradores lida (ou null se não leu).
  const loadDataFromSupabase = async (): Promise<Employee[] | null> => {
    if (!isSupabaseConfigured) return null;
    let empsLidos: Employee[] | null = null;

    try {
      const health = await checkSupabaseHealth();
      setSupabaseHealth(health);

      if (health.tablesExist) {
        const [dbDepts, dbEmps, dbAssets, dbLics, dbTickets, dbTerms, dbSettings] =
          await Promise.all([
            fetchDepartmentsFromDb(),
            fetchEmployeesFromDb(),
            fetchAssetsFromDb(),
            fetchLicensesFromDb(),
            fetchTicketsFromDb(),
            fetchTermsFromDb(),
            fetchSettingsFromDb(),
          ]);

        // Sincronizar departamentos
        if (dbDepts && dbDepts.length > 0) {
          setDepartments(dbDepts);
        } else {
          // Banco sem setores: semeia os padrões (só ti_admin tem permissão; os demais ignoram)
          try {
            for (const d of INITIAL_DEPARTMENTS) {
              await insertDepartmentDb(d);
            }
          } catch (err) {
            console.warn('Setores padrão não semeados:', mensagemDeErro(err));
          }
          setDepartments(INITIAL_DEPARTMENTS);
        }

        // Sincronizar colaboradores
        if (dbEmps) {
          setEmployees(dbEmps);
          empsLidos = dbEmps;
        }

        // Ativos (se a tabela estiver vazia, define [] limpo para produção)
        if (dbAssets !== null) {
          setAssets(dbAssets);
        }

        // Licenças
        if (dbLics !== null) {
          setLicenses(dbLics);
        }

        // Chamados
        if (dbTickets !== null) {
          setTickets(dbTickets);
        }

        // Termos
        if (dbTerms !== null) {
          setTerms(dbTerms);
        }

        // Fase 6 (tabelas novas: se ainda não existirem, as telas seguem sem elas)
        const [dbCatalogo, dbItens, dbRecursos, dbLembretes] = await Promise.all([
          fetchCatalogoFromDb(),
          fetchProcessoItensFromDb(),
          fetchRecursosFromDb(),
          fetchLembretesFromDb(),
        ]);
        if (dbCatalogo) setCatalogo(dbCatalogo);
        if (dbItens) setProcessoItens(dbItens);
        if (dbRecursos) setRecursos(dbRecursos);
        if (dbLembretes) setLembretes(dbLembretes);

        // Fase 8: só a T.I. lê (para os demais a RLS devolve vazio; sem a migration, também)
        const [dbFornecedores, dbContratos, dbFaturas] = await Promise.all([
          fetchFornecedoresFromDb(),
          fetchContratosFromDb(),
          fetchFaturasFromDb(),
        ]);
        if (dbFornecedores) setFornecedores(dbFornecedores);
        if (dbContratos) setContratos(dbContratos);
        if (dbFaturas) setFaturas(dbFaturas);

        // Configurações
        if (dbSettings) {
          setSettings(dbSettings);
        } else {
          try {
            await saveSettingsDb(INITIAL_COMPANY_SETTINGS);
          } catch (err) {
            console.warn('Configuração padrão não gravada:', mensagemDeErro(err));
          }
        }
      }
    } catch (err) {
      console.error('Erro ao sincronizar dados com o Supabase:', err);
    }
    return empsLidos;
  };

  // Sessão do Supabase Auth é a única fonte de verdade do login (ALTO-02).
  // INITIAL_SESSION / SIGNED_IN -> carrega dados e encontra o perfil;
  // SIGNED_OUT (logout ou sessão expirada) -> limpa tudo.
  useEffect(() => {
    if (!supabase) return;
    let ativo = true;

    // Sem sessão, só a configuração (razão social) é pública: usada na tela de login
    fetchSettingsFromDb().then((st) => {
      if (ativo && st) setSettings(st);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;

      if (!session?.user) {
        limparEstado();
        setAuthLoading(false);
        return;
      }

      // Link de recuperação/convite: a pessoa define a senha primeiro; os dados
      // carregam depois (a página recarrega ao salvar a senha).
      if (event === 'PASSWORD_RECOVERY' || tipoLinkAuth) {
        setTipoLinkSenha(event === 'PASSWORD_RECOVERY' ? 'recovery' : (tipoLinkAuth as TipoLinkSenha));
        setPrecisaDefinirSenha(true);
        setAuthLoading(false);
        return;
      }

      const u = session.user;

      // Fase 6: login criado pela T.I. com senha provisória -> trocar antes de entrar
      if (u.user_metadata?.precisa_trocar_senha === true) {
        setTipoLinkSenha('primeiro_acesso');
        setPrecisaDefinirSenha(true);
        setAuthLoading(false);
        return;
      }
      const authUser: SupabaseAuthUser = {
        id: u.id,
        email: u.email || '',
        nome: u.user_metadata?.full_name || u.email?.split('@')[0],
        avatarUrl: u.user_metadata?.avatar_url,
      };
      setSupabaseUser(authUser);

      // Chamadas ao Supabase fora do callback (recomendação da supabase-js
      // para evitar travamento dentro do onAuthStateChange)
      setTimeout(async () => {
        const lista = await loadDataFromSupabase();
        if (!ativo) return;
        const perfil = vincularUsuarioComColaborador(authUser, lista || []);
        if (!perfil) {
          // Login válido, mas sem perfil liberado: encerra a sessão e mostra o motivo
          await signOutSupabase();
        }
        setAuthLoading(false);
      }, 0);
    });

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
    // Assinatura única do listener de sessão. limparEstado/loadDataFromSupabase/
    // vincularUsuarioComColaborador só usam setters de estado e o cliente
    // Supabase (estáveis); reassinar a cada render duplicaria os eventos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Modais de Rastreabilidade Relacional 360°
  // Fase 9: pilha de fichas. Abrir uma ficha de dentro de outra não fecha a
  // anterior; fechar a de cima volta para ela (com o rascunho intacto).
  const [pilhaFichas, setPilhaFichas] = useState<FichaAberta[]>([]);
  const abrirFicha = (ficha: FichaAberta) => {
    // Voltar a uma ficha que está mais abaixo fecha as de cima: confirma se houver rascunho
    if (voltarFechaOutras(pilhaFichas, ficha) && !podeDescartarPendencias()) return;
    setPilhaFichas((p) => empilharFicha(p, ficha));
  };
  const fecharFicha = (posicao: number) => setPilhaFichas((p) => fecharFichaNaPosicao(p, posicao));
  const abrirOuFechar = (tipo: TipoFicha) => (id: string | null) => {
    if (id) abrirFicha({ tipo, id });
    else setPilhaFichas((p) => fecharUltimaDoTipo(p, tipo));
  };
  const setSelectedAssetIdFor360 = abrirOuFechar('ativo');
  const setSelectedSoftwareIdFor360 = abrirOuFechar('software');
  const setSelectedEmployeeIdFor360 = abrirOuFechar('colaborador');
  const setSelectedTicketIdForDetail = abrirOuFechar('chamado');
  const [softwareModalOpen, setSoftwareModalOpen] = useState<boolean>(false);
  const [softwareToEdit, setSoftwareToEdit] = useState<SoftwareLicense | null>(null);
  const [selectedTermForPrint, setSelectedTermForPrint] = useState<ResponsibilityTerm | null>(null);
  const [selectedAssetForQrCode, setSelectedAssetForQrCode] = useState<Asset | null>(null);

  // Cache em localStorage SÓ no modo demonstração (sem Supabase). Em produção,
  // nada de negócio fica no navegador (ALTO-01: chaves, notas internas etc.).
  useEffect(() => {
    if (isProduction) return;
    try {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
      localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(departments));
      localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify(assets));
      localStorage.setItem(STORAGE_KEYS.LICENSES, JSON.stringify(licenses));
      localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(tickets));
      localStorage.setItem(STORAGE_KEYS.TERMS, JSON.stringify(terms));
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      if (currentUserId) {
        localStorage.setItem(STORAGE_KEYS.USER, currentUserId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.USER);
      }
    } catch {
      // armazenamento indisponível: o modo demo segue só em memória
    }
  }, [isProduction, employees, departments, assets, licenses, tickets, terms, settings, currentUserId]);

  // Em produção, sem sessão do Supabase não há usuário (ALTO-02)
  const currentUser =
    isProduction && !supabaseUser ? null : employees.find((e) => e.id === currentUserId) || null;

  // Derivação do papel atual
  const currentRole: UserRole = (() => {
    if (!currentUser) return 'colaborador';
    // Se houver papel definido explicitamente no cadastro do colaborador
    if (currentUser.role) {
      return currentUser.role;
    }
    if (
      currentUser.email === 'admin.ti@nexuscorp.com.br' ||
      currentUser.cargo.toLowerCase().includes('coordenador de infraestrutura') ||
      currentUser.cargo.toLowerCase().includes('administrador')
    ) {
      return 'ti_admin';
    }
    if (currentUser.email.includes('.ti@') || currentUser.cargo.toLowerCase().includes('suporte')) {
      return 'ti_suporte';
    }
    if (currentUser.email === 'rh@nexuscorp.com.br' || currentUser.setorId === 'dep-2') {
      return 'rh';
    }
    return 'colaborador';
  })();

  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseConfigured) {
      return {
        success: false,
        error:
          'Supabase ainda não configurado no .env. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para ativar autenticação em nuvem.',
      };
    }
    const res = await signInWithGoogleSupabase();
    if (res.error) {
      return { success: false, error: res.error };
    }
    return { success: true };
  };

  const login = async (
    email: string,
    password?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Se o Supabase estiver configurado, autenticação real e estrita no Supabase Auth
    if (supabase) {
      if (!password) {
        return {
          success: false,
          error: 'Por favor, informe a senha corporativa de acesso.',
        };
      }

      setAuthError(null);
      const res = await signInWithPasswordSupabase(cleanEmail, password);
      if (res.error) {
        return {
          success: false,
          error: `Falha na autenticação: ${res.error}`,
        };
      }
      // O listener onAuthStateChange (SIGNED_IN) carrega os dados e encontra o perfil
      return { success: true };
    }

    // 2. Modo demonstração: só em desenvolvimento local (npm run dev sem Supabase).
    // No build de produção este trecho e a senha demo nem entram no bundle
    // (import.meta.env.DEV vira false e o minificador remove o código).
    if (!import.meta.env.DEV) {
      return {
        success: false,
        error: 'Sistema sem conexão com o banco (Supabase não configurado). Fale com a equipe de T.I.',
      };
    }
    const found = employees.find((e) => e.email.toLowerCase() === cleanEmail);
    if (!found) {
      return {
        success: false,
        error: 'E-mail corporativo não cadastrado no sistema.',
      };
    }

    if (password !== 'nexus@2026') {
      return {
        success: false,
        error: 'Senha incorreta. No modo de demonstração utilize a credencial padrão nexus@2026.',
      };
    }

    setCurrentUserId(found.id);
    return { success: true };
  };

  const logout = async () => {
    await signOutSupabase();
    setAuthError(null);
    limparEstado();
  };

  // ---------------------------------------------------------------------------
  // Gravação com verificação de erro (Fase 2 · CRIT-04)
  // A tela muda na hora (otimista); se o banco recusar, a mudança é desfeita
  // e o motivo aparece no aviso de erro.
  // ---------------------------------------------------------------------------
  const [dbErro, setDbErro] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fase 5: alterações não salvas registradas pelas telas (origem -> itens).
  // Usado para perguntar antes de trocar de tela, sair ou fechar a aba.
  // ---------------------------------------------------------------------------
  const [pendencias, setPendencias] = useState<Record<string, string[]>>({});

  const registrarPendencias = useCallback((origem: string, itens: string[]) => {
    setPendencias((atual) => {
      if (itens.length === 0) {
        if (!(origem in atual)) return atual;
        const resto = { ...atual };
        delete resto[origem];
        return resto;
      }
      if (atual[origem]?.join('\u0000') === itens.join('\u0000')) return atual;
      return { ...atual, [origem]: itens };
    });
  }, []);

  const itensPendentes = Object.values(pendencias).flat();
  const podeDescartarPendencias = () => confirmarDescarte(itensPendentes);

  useEffect(() => {
    if (itensPendentes.length === 0) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [itensPendentes.length]);

  const persistir = (op: Promise<unknown>, desfazer: () => void, contexto: string) => {
    op.catch((err) => {
      console.error(contexto, err);
      desfazer();
      setDbErro(`${contexto}: ${mensagemDeErro(err)}. A alteração foi desfeita.`);
    });
  };

  // IDs aleatórios (ALTO-05: Date.now().slice(-6) repetia a cada ~17 minutos)
  const novoId = (prefixo: string) => `${prefixo}-${crypto.randomUUID()}`;

  function trocar<T extends { id: string }>(lista: T[], item: T): T[] {
    return lista.map((x) => (x.id === item.id ? item : x));
  }

  // CRUD de Colaboradores
  const addEmployee = (data: Omit<Employee, 'id'>): Employee => {
    const novo: Employee = { ...data, email: data.email.trim().toLowerCase(), id: novoId('emp') };
    setEmployees((prev) => [novo, ...prev]);
    persistir(
      insertEmployeeDb(novo),
      () => setEmployees((prev) => prev.filter((e) => e.id !== novo.id)),
      `Não foi possível cadastrar ${novo.nome}`
    );
    return novo;
  };

  /** Ajustes da admissão: cadastra e espera o banco confirmar (para usar o id logo em seguida) */
  const cadastrarColaborador = async (data: Omit<Employee, 'id'>): Promise<{ colaborador?: Employee; erro?: string }> => {
    const novo: Employee = { ...data, email: data.email.trim().toLowerCase(), id: novoId('emp') };
    try {
      if (isProduction) await insertEmployeeDb(novo);
      setEmployees((prev) => [novo, ...prev]);
      return { colaborador: novo };
    } catch (err) {
      console.error('Cadastrar colaborador', err);
      return { erro: mensagemDeErro(err) };
    }
  };

  const updateEmployee = (id: string, updates: Partial<Employee>, contexto = 'Não foi possível salvar o colaborador') => {
    const antes = employees.find((e) => e.id === id);
    if (!antes) return;
    const depois: Employee = { ...antes, ...updates };
    setEmployees((prev) => trocar(prev, depois));
    persistir(updateEmployeeDb(antes, depois), () => setEmployees((prev) => trocar(prev, antes)), contexto);
  };

  const updateEmployeeRole = (id: string, role: UserRole) => {
    updateEmployee(id, { role }, 'Não foi possível alterar o papel de acesso');
  };

  const deleteEmployee = (id: string): { success: boolean; message?: string } => {
    const assetsWithUser = assets.filter((a) => a.custodianteId === id);
    if (assetsWithUser.length > 0) {
      return {
        success: false,
        message: `Não é possível excluir. O colaborador possui ${assetsWithUser.length} equipamento(s) sob sua custódia. Faça a devolução primeiro.`,
      };
    }
    const antes = employees.find((e) => e.id === id);
    if (!antes) return { success: false, message: 'Colaborador não encontrado.' };
    setEmployees((prev) => prev.filter((emp) => emp.id !== id));
    persistir(
      deleteEmployeeDb(id),
      () => setEmployees((prev) => [antes, ...prev]),
      `Não foi possível excluir ${antes.nome}`
    );
    return { success: true };
  };

  // CRUD de Setores com Proteção Referencial
  const addDepartment = (data: Omit<Department, 'id'>): Department => {
    const novo: Department = { ...data, id: novoId('dep') };
    setDepartments((prev) => [...prev, novo]);
    persistir(
      insertDepartmentDb(novo),
      () => setDepartments((prev) => prev.filter((d) => d.id !== novo.id)),
      `Não foi possível cadastrar o setor ${novo.nome}`
    );
    return novo;
  };

  const updateDepartment = (id: string, updates: Partial<Department>) => {
    const antes = departments.find((d) => d.id === id);
    if (!antes) return;
    const depois: Department = { ...antes, ...updates };
    setDepartments((prev) => trocar(prev, depois));
    persistir(
      updateDepartmentDb(antes, depois),
      () => setDepartments((prev) => trocar(prev, antes)),
      'Não foi possível salvar o setor'
    );
  };

  const deleteDepartment = (id: string): { success: boolean; message?: string } => {
    const linkedEmployees = employees.filter((e) => e.setorId === id);
    if (linkedEmployees.length > 0) {
      return {
        success: false,
        message: `Ação bloqueada: O setor possui ${linkedEmployees.length} colaborador(es) vinculado(s). Você pode inativá-lo, mas não excluí-lo.`,
      };
    }
    const antes = departments.find((d) => d.id === id);
    if (!antes) return { success: false, message: 'Setor não encontrado.' };
    setDepartments((prev) => prev.filter((dep) => dep.id !== id));
    persistir(
      deleteDepartmentDb(id),
      () => setDepartments((prev) => [...prev, antes]),
      `Não foi possível excluir o setor ${antes.nome}`
    );
    return { success: true };
  };

  // CRUD de Ativos & Gestão de Custódia 1:1
  const addAsset = (data: Omit<Asset, 'id'>): Asset => {
    const novo: Asset = {
      ...data,
      id: novoId('ast'),
      historicoCustodia: (data.historicoCustodia || []).map((c) => ({ ...c, id: novoId('cust') })),
    };
    setAssets((prev) => [novo, ...prev]);
    const insercao = insertAssetDb(novo);
    insercoes.current.set(novo.id, insercao);
    persistir(
      insercao,
      () => setAssets((prev) => prev.filter((a) => a.id !== novo.id)),
      `Não foi possível cadastrar o ativo ${novo.tag}`
    );
    return novo;
  };

  // Fase 8: o arquivo de um registro recém-cadastrado (ativo, contrato, fatura)
  // espera a gravação do registro terminar
  const insercoes = useRef(new Map<string, Promise<unknown>>());

  const anexarArquivoAtivo: AppContextType['anexarArquivoAtivo'] = async (ativoId, arquivo, categoria, vinculo) => {
    try {
      await insercoes.current.get(ativoId);
      const anexo = await enviarAnexoAtivoDb(ativoId, arquivo, categoria, vinculo);
      setAssets((prev) => prev.map((a) => (a.id === ativoId ? { ...a, anexos: [...(a.anexos || []), anexo] } : a)));
      return true;
    } catch (err) {
      console.error('Anexo do ativo', err);
      setDbErro(`Não foi possível anexar "${arquivo.name}": ${mensagemDeErro(err)}.`);
      return false;
    }
  };

  const removerAnexoAtivo = async (anexo: AnexoAtivo) => {
    try {
      await removerAnexoAtivoDb(anexo);
      setAssets((prev) =>
        prev.map((a) => (a.id === anexo.ativoId ? { ...a, anexos: (a.anexos || []).filter((x) => x.id !== anexo.id) } : a))
      );
      return true;
    } catch (err) {
      console.error('Remover anexo do ativo', err);
      setDbErro(`Não foi possível remover "${anexo.nome}": ${mensagemDeErro(err)}.`);
      return false;
    }
  };

  const updateAsset = (id: string, updates: Partial<Asset>) => {
    const antes = assets.find((a) => a.id === id);
    if (!antes) return;
    const depois: Asset = { ...antes, ...updates };
    setAssets((prev) => trocar(prev, depois));
    persistir(updateAssetDb(antes, depois), () => setAssets((prev) => trocar(prev, antes)), 'Não foi possível salvar o ativo');
  };

  const transferAssetCustody = (
    assetId: string,
    newColaboradorId: string | null,
    motivoDevolucao?: string
  ) => {
    const antes = assets.find((a) => a.id === assetId);
    if (!antes) return;
    const today = new Date().toISOString().split('T')[0];
    const historico = [...antes.historicoCustodia];

    let entradaAberta: CustodyHistoryEntry | undefined;
    let entradaFechada: CustodyHistoryEntry | undefined;
    if (antes.custodianteId && antes.custodianteId !== newColaboradorId) {
      const ultima = historico[historico.length - 1];
      if (ultima && !ultima.dataDevolucao) {
        entradaAberta = ultima;
        entradaFechada = {
          ...ultima,
          dataDevolucao: today,
          motivoDevolucao: motivoDevolucao || 'Devolução/Transferência para o estoque de TI',
        };
        historico[historico.length - 1] = entradaFechada;
      }
    }

    let entradaNova: CustodyHistoryEntry | undefined;
    if (newColaboradorId) {
      const newEmp = employees.find((e) => e.id === newColaboradorId);
      entradaNova = {
        id: novoId('cust'),
        colaboradorId: newColaboradorId,
        colaboradorNome: newEmp?.nome || 'Colaborador',
        dataEntrega: today,
        observacoes: 'Transferência de custódia realizada pelo setor de TI',
      };
      historico.push(entradaNova);
    }

    const depois: Asset = {
      ...antes,
      custodianteId: newColaboradorId || undefined,
      // Fase 8: com manutenção em andamento continua "em manutenção" (o banco garante o mesmo)
      status: statusAoMudarCustodia(antes, newColaboradorId),
      dataEntregaAtual: newColaboradorId ? today : undefined,
      historicoCustodia: historico,
    };
    setAssets((prev) => trocar(prev, depois));

    const gravar = async () => {
      if (entradaAberta && entradaFechada) await updateCustodyEntryDb(assetId, entradaAberta, entradaFechada);
      if (entradaNova) await insertCustodyEntryDb(assetId, entradaNova);
      await updateAssetDb(antes, depois);
    };
    persistir(gravar(), () => setAssets((prev) => trocar(prev, antes)), `Não foi possível transferir a custódia de ${antes.tag}`);
  };

  // ---------------------------------------------------------------------------
  // Fase 8 · Manutenção e baixa patrimonial. As funções do banco mudam o status
  // e a custódia numa transação: a tela espera a resposta e então relê os ativos
  // como o banco ficou. Sem Supabase, as mesmas regras valem só na memória.
  // ---------------------------------------------------------------------------
  const ehTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';

  const aplicarNoAtivo = (ativoId: string, mudar: (a: Asset) => Asset) =>
    setAssets((prev) => prev.map((a) => (a.id === ativoId ? mudar(a) : a)));

  /** Depois de uma função do banco: relê os ativos; se a leitura falhar, aplica a mesma regra localmente */
  const refletirDoBanco = async (ativoId: string, mudar: (a: Asset) => Asset) => {
    const lista = await fetchAssetsFromDb();
    if (lista) setAssets(lista);
    else aplicarNoAtivo(ativoId, mudar);
  };

  const ativoDaManutencao = (manutencaoId: string) => {
    for (const a of assets) {
      const m = a.historicoManutencao.find((x) => x.id === manutencaoId);
      if (m) return { ativo: a, manutencao: m };
    }
    return null;
  };

  // Fase 9: o chamado de origem ganha uma nota interna a cada passo da manutenção
  // (não muda o status do chamado; quem resolve continua sendo a T.I.)
  const registrarNoChamado = (chamadoId: string | undefined, texto: string) => {
    if (chamadoId && tickets.some((t) => t.id === chamadoId)) addTicketMessage(chamadoId, texto, true);
  };

  const abrirManutencao = async (ativoId: string, dados: DadosManutencao): Promise<ResultadoRegistro> => {
    const ativo = assets.find((a) => a.id === ativoId);
    if (!ativo) return { erro: 'Ativo não encontrado.' };
    const problema = validarManutencao(dados) || erroAoAbrirManutencao(ativo);
    if (problema) return { erro: problema };
    if (!isProduction && !ehTI) return { erro: 'Apenas a T.I. registra manutenções' };
    try {
      const id = isProduction ? await abrirManutencaoDb(ativoId, dados) : novoId('man');
      const mudar = (a: Asset) => aplicarAbertura(a, novaManutencao(id, ativoId, dados, currentUser?.id, new Date()));
      if (isProduction) await refletirDoBanco(ativoId, mudar);
      else aplicarNoAtivo(ativoId, mudar);
      registrarNoChamado(dados.chamadoId, notaDaManutencao('aberta', { ...dados, tag: ativo.tag }));
      return { id };
    } catch (err) {
      console.error('Enviar para manutenção', err);
      return { erro: mensagemDeErro(err) };
    }
  };

  const registrarManutencaoFeita = async (
    ativoId: string,
    dados: DadosManutencao & { concluidaEm: string }
  ): Promise<ResultadoRegistro> => {
    const problema = validarManutencao(dados, true);
    if (problema) return { erro: problema };
    if (!isProduction && !ehTI) return { erro: 'Apenas a T.I. registra manutenções' };
    try {
      const id = isProduction ? await registrarManutencaoFeitaDb(ativoId, dados) : novoId('man');
      // Não muda o status: basta acrescentar ao histórico do ativo
      aplicarNoAtivo(ativoId, (a) =>
        aplicarManutencaoFeita(a, novaManutencao(id, ativoId, dados, currentUser?.id, new Date(), dados.concluidaEm))
      );
      const tag = assets.find((a) => a.id === ativoId)?.tag || '';
      registrarNoChamado(dados.chamadoId, notaDaManutencao('feita', { ...dados, tag }));
      return { id };
    } catch (err) {
      console.error('Registrar manutenção já feita', err);
      return { erro: mensagemDeErro(err) };
    }
  };

  const encerrarManutencao = async (
    manutencaoId: string,
    status: 'concluida' | 'cancelada',
    dados: DadosEncerramentoManutencao = {}
  ): Promise<string | null> => {
    const achado = ativoDaManutencao(manutencaoId);
    if (!achado) return 'Manutenção não encontrada.';
    const { ativo, manutencao } = achado;
    const problema = validarEncerramento(manutencao, status, dados);
    if (problema) return problema;
    if (!isProduction && !ehTI) return 'Apenas a T.I. registra manutenções';
    // O banco troca a observação pela nova: a da abertura é mantida numa linha acima
    const final = { ...dados, observacoes: juntarObservacoes(manutencao.observacoes, dados.observacoes, status) };
    const mudar = (a: Asset) => aplicarEncerramento(a, manutencaoId, status, final, currentUser?.id, new Date());
    try {
      if (isProduction) {
        await encerrarManutencaoDb(manutencaoId, status, final);
        await refletirDoBanco(ativo.id, mudar);
      } else {
        aplicarNoAtivo(ativo.id, mudar);
      }
      registrarNoChamado(
        manutencao.chamadoId,
        notaDaManutencao(status, {
          tag: ativo.tag,
          tipo: manutencao.tipo,
          descricao: manutencao.descricao,
          concluidaEm: status === 'concluida' ? dados.concluidaEm || isoLocal(new Date()) : undefined,
          custo: dados.custo ?? manutencao.custo,
        })
      );
      return null;
    } catch (err) {
      console.error('Encerrar manutenção', err);
      return mensagemDeErro(err);
    }
  };

  const baixarAtivo = async (ativoId: string, dados: DadosBaixa): Promise<ResultadoRegistro> => {
    const ativo = assets.find((a) => a.id === ativoId);
    if (!ativo) return { erro: 'Ativo não encontrado.' };
    const problema = validarBaixa(dados) || bloqueiosDaBaixa(ativo, dados.motivo)[0];
    if (problema) return { erro: problema };
    if (!isProduction && currentRole !== 'ti_admin') return { erro: 'Apenas o administrador de T.I. dá baixa em ativos' };
    try {
      const id = isProduction ? await baixarAtivoDb(ativoId, dados) : novoId('bxa');
      const mudar = (a: Asset) =>
        aplicarBaixa(a, {
          ...dados,
          id,
          ativoId,
          destinatario: dados.destinatario?.trim() || undefined,
          documento: dados.documento?.trim() || undefined,
          observacoes: dados.observacoes?.trim() || undefined,
          valorVenda: dados.destino === 'venda' ? dados.valorVenda : undefined,
          criadoPor: currentUser?.id,
          criadoEm: new Date().toISOString(),
        });
      if (isProduction) await refletirDoBanco(ativoId, mudar);
      else aplicarNoAtivo(ativoId, mudar);
      return { id };
    } catch (err) {
      console.error('Dar baixa', err);
      return { erro: mensagemDeErro(err) };
    }
  };

  const estornarBaixa = async (baixaId: string, motivo: string): Promise<string | null> => {
    const ativo = assets.find((a) => a.baixas?.some((b) => b.id === baixaId));
    const baixa = ativo?.baixas?.find((b) => b.id === baixaId);
    if (!ativo || !baixa) return 'Baixa não encontrada.';
    if (!motivo.trim()) return 'Informe o motivo do estorno.';
    if (baixa.estornadaEm) return 'Esta baixa já foi estornada.';
    if (!isProduction && currentRole !== 'ti_admin') return 'Apenas o administrador de T.I. estorna baixas';
    const mudar = (a: Asset) => aplicarEstorno(a, baixaId, motivo, currentUser?.id, new Date());
    try {
      if (isProduction) {
        await estornarBaixaDb(baixaId, motivo.trim());
        await refletirDoBanco(ativo.id, mudar);
      } else {
        aplicarNoAtivo(ativo.id, mudar);
      }
      return null;
    } catch (err) {
      console.error('Estornar baixa', err);
      return mensagemDeErro(err);
    }
  };

  // Licenças de Softwares & SaaS
  const addLicense = (data: Omit<SoftwareLicense, 'id' | 'assentosAlocados'>): SoftwareLicense => {
    const nova: SoftwareLicense = {
      ...data,
      id: novoId('lic'),
      assentosAlocados: data.colaboradoresIds ? data.colaboradoresIds.length : 0,
      colaboradoresIds: data.colaboradoresIds || [],
    };
    setLicenses((prev) => [nova, ...prev]);
    persistir(
      insertLicenseDb(nova),
      () => setLicenses((prev) => prev.filter((l) => l.id !== nova.id)),
      `Não foi possível cadastrar a licença ${nova.nome}`
    );
    return nova;
  };

  const updateLicense = (id: string, updates: Partial<SoftwareLicense>) => {
    const antes = licenses.find((l) => l.id === id);
    if (!antes) return;
    const depois: SoftwareLicense = { ...antes, ...updates };
    if (updates.colaboradoresIds) depois.assentosAlocados = updates.colaboradoresIds.length;
    setLicenses((prev) => trocar(prev, depois));
    persistir(updateLicenseDb(antes, depois), () => setLicenses((prev) => trocar(prev, antes)), 'Não foi possível salvar a licença');
  };

  const deleteLicense = (id: string): { success: boolean; message?: string } => {
    const found = licenses.find((l) => l.id === id);
    if (!found) return { success: false, message: 'Licença não encontrada.' };
    if (found.colaboradoresIds.length > 0) {
      return {
        success: false,
        message: `Não é possível excluir. Existem ${found.colaboradoresIds.length} colaborador(es) com assento ativo nesta licença. Libere os assentos primeiro.`,
      };
    }
    // Fase 8: faturas e contratos guardam o histórico de custo da licença
    if (faturas.some((f) => f.licencaId === id) || contratos.some((c) => c.itens.some((i) => i.licencaId === id))) {
      return {
        success: false,
        message: 'Não é possível excluir. A licença tem faturas lançadas ou está coberta por um contrato.',
      };
    }
    setLicenses((prev) => prev.filter((l) => l.id !== id));
    persistir(deleteLicenseDb(id), () => setLicenses((prev) => [found, ...prev]), `Não foi possível excluir a licença ${found.nome}`);
    return { success: true };
  };

  // Alocação e revogação vão por RPC atômica no banco (ALTO-04); a lista
  // devolvida pelo banco substitui a da tela.
  const aplicarAssentos = (licenseId: string, ids: string[] | null) => {
    if (!ids) return;
    setLicenses((prev) =>
      prev.map((l) => (l.id === licenseId ? { ...l, colaboradoresIds: ids, assentosAlocados: ids.length } : l))
    );
  };

  const allocateLicense = (licenseId: string, employeeId: string) => {
    const antes = licenses.find((l) => l.id === licenseId);
    if (!antes || antes.colaboradoresIds.includes(employeeId)) return;
    if (antes.colaboradoresIds.length >= antes.assentosTotais) return;
    const ids = [...antes.colaboradoresIds, employeeId];
    setLicenses((prev) => trocar(prev, { ...antes, colaboradoresIds: ids, assentosAlocados: ids.length }));
    persistir(
      alocarLicencaDb(licenseId, employeeId).then((doBanco) => aplicarAssentos(licenseId, doBanco)),
      () => setLicenses((prev) => trocar(prev, antes)),
      `Não foi possível alocar assento em ${antes.nome}`
    );
  };

  const revokeLicense = (licenseId: string, employeeId: string) => {
    const antes = licenses.find((l) => l.id === licenseId);
    if (!antes || !antes.colaboradoresIds.includes(employeeId)) return;
    const ids = antes.colaboradoresIds.filter((x) => x !== employeeId);
    setLicenses((prev) => trocar(prev, { ...antes, colaboradoresIds: ids, assentosAlocados: ids.length }));
    persistir(
      revogarLicencaDb(licenseId, employeeId).then((doBanco) => aplicarAssentos(licenseId, doBanco)),
      () => setLicenses((prev) => trocar(prev, antes)),
      `Não foi possível liberar o assento em ${antes.nome}`
    );
  };

  // ---------------------------------------------------------------------------
  // Fase 8 · Fornecedores, contratos e faturas (só a T.I.). A tela muda na hora
  // e volta atrás se o banco recusar (persistir). Arquivos sobem depois do registro.
  // ---------------------------------------------------------------------------
  const criarFornecedor = (dados: Omit<Fornecedor, 'id' | 'criadoEm' | 'criadoPor'>): Fornecedor => {
    const novo: Fornecedor = { ...dados, id: novoId('forn'), criadoEm: new Date().toISOString() };
    setFornecedores((prev) => [...prev, novo].sort((a, b) => a.nome.localeCompare(b.nome)));
    persistir(
      insertFornecedorDb(novo),
      () => setFornecedores((prev) => prev.filter((f) => f.id !== novo.id)),
      `Não foi possível cadastrar o fornecedor ${novo.nome}`
    );
    return novo;
  };

  const alterarFornecedor = (id: string, mudancas: Partial<Fornecedor>) => {
    const antes = fornecedores.find((f) => f.id === id);
    if (!antes) return;
    const depois: Fornecedor = { ...antes, ...mudancas };
    setFornecedores((prev) => trocar(prev, depois));
    persistir(
      updateFornecedorDb(antes, depois),
      () => setFornecedores((prev) => trocar(prev, antes)),
      `Não foi possível salvar o fornecedor ${antes.nome}`
    );
  };

  const excluirFornecedor = (id: string): { success: boolean; message?: string } => {
    const antes = fornecedores.find((f) => f.id === id);
    if (!antes) return { success: false, message: 'Fornecedor não encontrado.' };
    const vinculos = vinculosDoFornecedor(id, { contratos, ativos: assets, licencas: licenses });
    if (temVinculos(vinculos)) {
      return {
        success: false,
        message: `${antes.nome} está vinculado a ${resumoVinculos(vinculos)} e não pode ser excluído. Desative o fornecedor para tirá-lo das listas de escolha.`,
      };
    }
    setFornecedores((prev) => prev.filter((f) => f.id !== id));
    persistir(
      deleteFornecedorDb(id),
      () => setFornecedores((prev) => [...prev, antes].sort((a, b) => a.nome.localeCompare(b.nome))),
      `Não foi possível excluir o fornecedor ${antes.nome}`
    );
    return { success: true };
  };

  const criarContrato = (dados: Omit<Contrato, 'id' | 'criadoEm' | 'criadoPor' | 'arquivoCaminho'>): Contrato => {
    const novo: Contrato = { ...dados, id: novoId('ctr'), criadoEm: new Date().toISOString() };
    setContratos((prev) => [novo, ...prev]);
    // Contrato e itens são gravados juntos (salvar_contrato): falhou, nada fica e a tela desfaz
    const insercao = insertContratoDb(novo);
    insercoes.current.set(novo.id, insercao);
    persistir(
      insercao,
      () => setContratos((prev) => prev.filter((c) => c.id !== novo.id)),
      `Não foi possível cadastrar o contrato ${novo.numero || novo.descricao}`
    );
    return novo;
  };

  const alterarContrato = (id: string, mudancas: Partial<Contrato>) => {
    const antes = contratos.find((c) => c.id === id);
    if (!antes) return;
    const depois: Contrato = { ...antes, ...mudancas };
    setContratos((prev) => trocar(prev, depois));
    persistir(
      updateContratoDb(antes, depois),
      () => setContratos((prev) => trocar(prev, antes)),
      `Não foi possível salvar o contrato ${antes.numero || antes.descricao}`
    );
  };

  const excluirContrato = (id: string): { success: boolean; message?: string } => {
    const antes = contratos.find((c) => c.id === id);
    if (!antes) return { success: false, message: 'Contrato não encontrado.' };
    const qtdFaturas = faturas.filter((f) => f.contratoId === id).length;
    if (qtdFaturas > 0) {
      return {
        success: false,
        message: `O contrato tem ${qtdFaturas} fatura(s) lançada(s) e não pode ser excluído. As faturas guardam o histórico de custo.`,
      };
    }
    setContratos((prev) => prev.filter((c) => c.id !== id));
    persistir(
      deleteContratoDb(antes),
      () => setContratos((prev) => [antes, ...prev]),
      `Não foi possível excluir o contrato ${antes.numero || antes.descricao}`
    );
    return { success: true };
  };

  const lancarFatura = (dados: Omit<Fatura, 'id' | 'criadoEm' | 'criadoPor' | 'arquivoCaminho'>): Fatura => {
    const nova: Fatura = { ...dados, id: novoId('fat'), criadoEm: new Date().toISOString() };
    setFaturas((prev) => [nova, ...prev]);
    const insercao = insertFaturaDb(nova);
    insercoes.current.set(nova.id, insercao);
    persistir(
      insercao,
      () => setFaturas((prev) => prev.filter((f) => f.id !== nova.id)),
      'Não foi possível lançar a fatura'
    );
    return nova;
  };

  const alterarFatura = (id: string, mudancas: Partial<Fatura>) => {
    const antes = faturas.find((f) => f.id === id);
    if (!antes) return;
    const depois: Fatura = { ...antes, ...mudancas };
    setFaturas((prev) => trocar(prev, depois));
    persistir(updateFaturaDb(antes, depois), () => setFaturas((prev) => trocar(prev, antes)), 'Não foi possível salvar a fatura');
  };

  const excluirFatura = (id: string) => {
    const antes = faturas.find((f) => f.id === id);
    if (!antes) return;
    setFaturas((prev) => prev.filter((f) => f.id !== id));
    persistir(deleteFaturaDb(antes), () => setFaturas((prev) => [antes, ...prev]), 'Não foi possível excluir a fatura');
  };

  const anexarArquivoRegistro = async (
    tabela: 'contratos' | 'faturas',
    id: string,
    arquivo: File,
    anterior: string | undefined,
    aplicar: (caminho: string) => void
  ) => {
    try {
      await insercoes.current.get(id);
      aplicar(await gravarArquivoDb(tabela, id, arquivo, anterior));
      return true;
    } catch (err) {
      console.error(`Arquivo (${tabela})`, err);
      setDbErro(`Não foi possível anexar "${arquivo.name}": ${mensagemDeErro(err)}.`);
      return false;
    }
  };

  const anexarArquivoContrato = (contratoId: string, arquivo: File) =>
    anexarArquivoRegistro('contratos', contratoId, arquivo, contratos.find((c) => c.id === contratoId)?.arquivoCaminho, (caminho) =>
      setContratos((prev) => prev.map((c) => (c.id === contratoId ? { ...c, arquivoCaminho: caminho } : c)))
    );

  const anexarArquivoFatura = (faturaId: string, arquivo: File) =>
    anexarArquivoRegistro('faturas', faturaId, arquivo, faturas.find((f) => f.id === faturaId)?.arquivoCaminho, (caminho) =>
      setFaturas((prev) => prev.map((f) => (f.id === faturaId ? { ...f, arquivoCaminho: caminho } : f)))
    );

  // Service Desk / Chamados
  const createTicket = async (
    ticketData: Omit<Ticket, 'id' | 'codigo' | 'dataCriacao' | 'dataAtualizacao' | 'mensagens'>
  ): Promise<Ticket | null> => {
    const now = new Date().toISOString();
    const id = novoId('tkt');
    // Código definitivo vem do banco; o local só vale no modo demonstração
    const codigoLocal = `#CH-${new Date().getFullYear()}-${(tickets.length + 1).toString().padStart(4, '0')}`;

    const newTicket: Ticket = {
      ...ticketData,
      id,
      codigo: codigoLocal,
      dataCriacao: now,
      dataAtualizacao: now,
      mensagens: [
        {
          id: novoId('msg'),
          autorId: ticketData.solicitanteId,
          autorNome: ticketData.solicitanteNome,
          autorRole: currentRole,
          texto: ticketData.descricao,
          ehNotaInterna: false,
          data: now,
          anexos: ticketData.anexos,
        },
      ],
    };

    try {
      const doBanco = await insertTicketDb(newTicket);
      const salvo: Ticket = { ...newTicket, codigo: doBanco?.codigo || newTicket.codigo };
      setTickets((prev) => [salvo, ...prev]);
      // A mensagem depende do chamado (FK): grava depois dele (MED-02)
      try {
        await insertTicketMessageDb(id, newTicket.mensagens[0]);
      } catch (err) {
        setDbErro(
          `O chamado ${salvo.codigo} foi aberto, mas a descrição inicial não foi salva como mensagem: ${mensagemDeErro(err)}`
        );
      }
      return salvo;
    } catch (err) {
      console.error('Erro ao abrir chamado', err);
      setDbErro(`Não foi possível abrir o chamado: ${mensagemDeErro(err)}.`);
      return null;
    }
  };

  const addTicketMessage = (
    ticketId: string,
    texto: string,
    ehNotaInterna: boolean,
    anexos?: TicketAttachment[]
  ) => {
    if (!currentUser) return;
    const now = new Date().toISOString();
    const newMessage = {
      id: novoId('msg'),
      autorId: currentUser.id,
      autorNome: currentUser.nome,
      autorRole: currentRole,
      texto,
      ehNotaInterna,
      data: now,
      anexos,
    };

    // Não regrava o chamado: o banco atualiza data_atualizacao ao receber a mensagem
    setTickets((prev) =>
      prev.map((tkt) =>
        tkt.id === ticketId ? { ...tkt, dataAtualizacao: now, mensagens: [...tkt.mensagens, newMessage] } : tkt
      )
    );
    persistir(
      insertTicketMessageDb(ticketId, newMessage),
      () =>
        setTickets((prev) =>
          prev.map((tkt) =>
            tkt.id === ticketId ? { ...tkt, mensagens: tkt.mensagens.filter((m) => m.id !== newMessage.id) } : tkt
          )
        ),
      'Não foi possível enviar a mensagem'
    );
  };

  const alterarChamado = (ticketId: string, mudar: (t: Ticket) => Ticket, contexto: string) => {
    const antes = tickets.find((t) => t.id === ticketId);
    if (!antes) return;
    const depois = { ...mudar(antes), dataAtualizacao: new Date().toISOString() };
    setTickets((prev) => trocar(prev, depois));
    persistir(updateTicketDb(antes, depois), () => setTickets((prev) => trocar(prev, antes)), contexto);
  };

  const updateTicketStatus = (ticketId: string, status: TicketStatus) => {
    alterarChamado(
      ticketId,
      (t) => ({ ...t, status, dataResolucao: status === 'resolvido' ? new Date().toISOString() : t.dataResolucao }),
      'Não foi possível alterar o status do chamado'
    );
  };

  // Fase 5: status, técnico e checklist mudam na tela como rascunho e só são
  // gravados aqui, quando a pessoa clica em "Salvar alterações" (um único UPDATE).
  const salvarAlteracoesChamado = (ticketId: string, mudancas: AlteracoesChamado) => {
    const tecnico = mudancas.tecnicoId ? employees.find((e) => e.id === mudancas.tecnicoId) : undefined;
    const agora = new Date().toISOString();
    alterarChamado(
      ticketId,
      (t) => {
        let novo: Ticket = { ...t };
        if (mudancas.status) {
          novo = { ...novo, status: mudancas.status, dataResolucao: mudancas.status === 'resolvido' ? agora : t.dataResolucao };
        }
        if (mudancas.aguardandoMotivo !== undefined) novo = { ...novo, aguardandoMotivo: mudancas.aguardandoMotivo || undefined };
        // O banco limpa o motivo quando o chamado deixa de aguardar; a tela acompanha
        if (novo.status !== 'aguardando_terceiro') novo = { ...novo, aguardandoMotivo: undefined };
        if (mudancas.tecnicoId !== undefined) {
          novo = {
            ...novo,
            tecnicoResponsavelId: mudancas.tecnicoId || undefined,
            tecnicoResponsavelNome: mudancas.tecnicoId ? tecnico?.nome || 'Técnico de TI' : undefined,
          };
        }
        if (mudancas.checklist && t.offboarding) {
          const marcados = mudancas.checklist;
          novo = {
            ...novo,
            offboarding: {
              ...t.offboarding,
              checklist: t.offboarding.checklist.map((item) =>
                item.id in marcados ? { ...item, concluido: marcados[item.id] } : item
              ),
            },
          };
        }
        if (mudancas.ativoId !== undefined) novo = { ...novo, ativoId: mudancas.ativoId || undefined };
        if (mudancas.softwareId !== undefined) {
          novo = {
            ...novo,
            softwareId: mudancas.softwareId || undefined,
            softwareNome: mudancas.softwareId ? licenses.find((l) => l.id === mudancas.softwareId)?.nome : undefined,
          };
        }
        // Admissão e desligamento: a pessoa do processo não muda por aqui
        // Fase 10: na admissão, liga a pessoa cadastrada ao chamado (só enquanto não houver uma)
        if (mudancas.colaboradorId !== undefined && (t.tipo === 'suporte' || (t.tipo === 'onboarding' && !t.colaboradorId))) {
          novo = { ...novo, colaboradorId: mudancas.colaboradorId || undefined };
        }
        return novo;
      },
      'Não foi possível salvar as alterações do chamado'
    );
  };

  // Termos de Responsabilidade
  const createTerm = async (
    data: Omit<ResponsibilityTerm, 'id' | 'codigo' | 'dataEmissao'>
  ): Promise<ResponsibilityTerm | null> => {
    const novo: ResponsibilityTerm = {
      ...data,
      id: novoId('tr'),
      codigo: `#TR-${new Date().getFullYear()}-${(terms.length + 1).toString().padStart(4, '0')}`,
      dataEmissao: new Date().toISOString().split('T')[0],
    };
    try {
      const doBanco = await insertTermDb(novo);
      const salvo: ResponsibilityTerm = { ...novo, codigo: doBanco?.codigo || novo.codigo };
      setTerms((prev) => [salvo, ...prev]);
      return salvo;
    } catch (err) {
      console.error('Erro ao gerar termo', err);
      setDbErro(`Não foi possível gerar o termo: ${mensagemDeErro(err)}.`);
      return null;
    }
  };

  const markTermSigned = (termId: string, arquivoUrl?: string) => {
    const antes = terms.find((t) => t.id === termId);
    if (!antes) return;
    const depois: ResponsibilityTerm = {
      ...antes,
      statusAssinatura: 'assinado',
      arquivoAssinadoUrl: arquivoUrl || 'https://cdn.nexuscorp.com.br/termos/assinado-scan.pdf',
      // Fase 6: termos do processo guiado registram a forma (documento físico anexado)
      ...(antes.formaAssinatura ? { formaAssinatura: 'documento' as const } : {}),
    };
    setTerms((prev) => trocar(prev, depois));
    persistir(updateTermDb(antes, depois), () => setTerms((prev) => trocar(prev, antes)), `Não foi possível registrar a assinatura de ${antes.codigo}`);
  };

  // ---------------------------------------------------------------------------
  // Fase 10 · Atendimento documentado (as regras e o histórico ficam no banco)
  // ---------------------------------------------------------------------------
  const mudarNoChamado = (ticketId: string, mudar: (t: Ticket) => Ticket) =>
    setTickets((prev) => prev.map((t) => (t.id === ticketId ? mudar(t) : t)));

  /** Executa a função do banco e relê o chamado; no modo demonstração, aplica localmente */
  const acaoNoChamado = async (
    ticketId: string,
    noBanco: () => Promise<void>,
    local: (t: Ticket) => Ticket,
    contexto: string
  ): Promise<string | null> => {
    try {
      if (isProduction) {
        await noBanco();
        const relido = await fetchChamadoDb(ticketId);
        if (relido) {
          // Campos que o banco limpou somem também na tela
          mudarNoChamado(ticketId, (t) => ({
            ...t,
            resolucao: undefined,
            cancelamento: undefined,
            avaliacao: undefined,
            aguardandoMotivo: undefined,
            ...relido,
          }));
        }
      } else {
        mudarNoChamado(ticketId, (t) => ({ ...local(t), dataAtualizacao: new Date().toISOString() }));
      }
      return null;
    } catch (err) {
      console.error(contexto, err);
      return mensagemDeErro(err);
    }
  };

  const resolverChamado = async (ticketId: string, dados: DadosResolucao) => {
    const problema = erroResolucao(dados);
    if (problema) return problema;
    if (!isProduction && !ehTI) return 'Apenas a T.I. registra a solução de um chamado.';
    const agora = new Date().toISOString();
    return acaoNoChamado(
      ticketId,
      () => resolverChamadoDb(ticketId, dados),
      (t) => ({
        ...t,
        status: 'resolvido',
        dataResolucao: agora,
        avaliacao: undefined,
        resolucao: { ...dados, solucao: dados.solucao.trim(), resolvidoPor: currentUser?.id, resolvidoEm: agora },
      }),
      'Registrar solução'
    );
  };

  const cancelarChamado = async (ticketId: string, motivo: MotivoCancelamento, detalhe?: string) => {
    const problema = erroCancelamento(motivo, detalhe || '');
    if (problema) return problema;
    return acaoNoChamado(
      ticketId,
      () => cancelarChamadoDb(ticketId, motivo, detalhe?.trim()),
      (t) => ({ ...t, status: 'cancelado', cancelamento: { motivo, detalhe: detalhe?.trim() || undefined, canceladoPor: currentUser?.id } }),
      'Cancelar chamado'
    );
  };

  const reabrirChamado = async (ticketId: string, motivo: string) => {
    if (motivo.trim().length < 5) return 'Explique por que o problema continua.';
    const erro = await acaoNoChamado(
      ticketId,
      () => reabrirChamadoDb(ticketId, motivo.trim()),
      (t) => ({
        ...t,
        status: t.tecnicoResponsavelId ? 'em_andamento' : 'aberto',
        reaberturas: (t.reaberturas || 0) + 1,
        resolucao: undefined,
        avaliacao: undefined,
      }),
      'Reabrir chamado'
    );
    // O banco já gravou o motivo na conversa; aqui só aparece na tela
    if (!erro && currentUser) {
      mudarNoChamado(ticketId, (t) => ({
        ...t,
        mensagens: [
          ...t.mensagens,
          {
            id: novoId('msg'),
            autorId: currentUser.id,
            autorNome: currentUser.nome,
            autorRole: currentRole,
            texto: `Reaberto: ${motivo.trim()}`,
            ehNotaInterna: false,
            data: new Date().toISOString(),
          },
        ],
      }));
    }
    return erro;
  };

  const avaliarChamado = async (ticketId: string, nota: number, comentario?: string) => {
    if (nota < 1 || nota > 5) return 'A avaliação vai de 1 a 5.';
    return acaoNoChamado(
      ticketId,
      () => avaliarChamadoDb(ticketId, nota, comentario?.trim()),
      (t) => ({ ...t, avaliacao: { nota, comentario: comentario?.trim() || undefined } }),
      'Avaliar chamado'
    );
  };

  const carregarEventosChamado = async (ticketId: string): Promise<EventoChamado[]> => {
    if (isProduction) return fetchEventosChamadoDb(ticketId);
    // Demonstração: um histórico mínimo a partir do próprio chamado
    const t = tickets.find((x) => x.id === ticketId);
    if (!t) return [];
    const eventos: EventoChamado[] = [{ id: `${t.id}-a`, chamadoId: t.id, tipo: 'aberto', criadoEm: t.dataCriacao, autorId: t.solicitanteId }];
    if (t.resolucao) {
      eventos.push({ id: `${t.id}-r`, chamadoId: t.id, tipo: 'resolvido', criadoEm: t.resolucao.resolvidoEm || t.dataAtualizacao, autorId: t.resolucao.resolvidoPor });
    }
    if (t.cancelamento) {
      eventos.push({ id: `${t.id}-c`, chamadoId: t.id, tipo: 'cancelado', detalhe: t.cancelamento.motivo, criadoEm: t.dataAtualizacao, autorId: t.cancelamento.canceladoPor });
    }
    return eventos;
  };

  // ---------------------------------------------------------------------------
  // Fase 3 · Offboarding automático e LGPD
  // ---------------------------------------------------------------------------
  const concluirOffboarding = async (ticketId: string): Promise<ResumoOffboarding | null> => {
    const tkt = tickets.find((t) => t.id === ticketId);
    const colabId = tkt?.offboarding?.colaboradorId;
    if (!tkt || !colabId) return null;

    if (isProduction) {
      try {
        // Uma transação no banco: devolve ativos, libera licenças, desliga e resolve
        const resumo = await concluirOffboardingDb(ticketId);
        await loadDataFromSupabase();
        return resumo;
      } catch (err) {
        console.error('Erro ao concluir offboarding', err);
        setDbErro(`Não foi possível concluir o desligamento: ${mensagemDeErro(err)}.`);
        return null;
      }
    }

    // Modo demonstração: mesma regra, só na memória
    const hoje = new Date().toISOString().split('T')[0];
    const ativosDoColab = assets.filter((a) => a.custodianteId === colabId);
    const licsDoColab = licenses.filter((l) => l.colaboradoresIds.includes(colabId));
    setAssets((prev) =>
      prev.map((a) =>
        a.custodianteId !== colabId
          ? a
          : {
              ...a,
              custodianteId: undefined,
              status: statusAoMudarCustodia(a, null),
              dataEntregaAtual: undefined,
              historicoCustodia: a.historicoCustodia.map((h) =>
                h.colaboradorId === colabId && !h.dataDevolucao
                  ? { ...h, dataDevolucao: hoje, motivoDevolucao: `Devolução por desligamento (${tkt.codigo})` }
                  : h
              ),
            }
      )
    );
    setLicenses((prev) =>
      prev.map((l) => {
        if (!l.colaboradoresIds.includes(colabId)) return l;
        const ids = l.colaboradoresIds.filter((x) => x !== colabId);
        return { ...l, colaboradoresIds: ids, assentosAlocados: ids.length };
      })
    );
    setEmployees((prev) => prev.map((e) => (e.id === colabId ? { ...e, status: 'desligado' } : e)));
    setTickets((prev) =>
      prev.map((t) =>
        t.id !== ticketId || !t.offboarding
          ? t
          : {
              ...t,
              status: 'resolvido',
              offboarding: { ...t.offboarding, checklist: t.offboarding.checklist.map((c) => ({ ...c, concluido: true })) },
            }
      )
    );
    return { colaboradorId: colabId, ativosDevolvidos: ativosDoColab.length, licencasLiberadas: licsDoColab.length };
  };

  const anonimizarColaborador = async (employeeId: string): Promise<boolean> => {
    if (isProduction) {
      try {
        await anonimizarColaboradorDb(employeeId);
        await loadDataFromSupabase();
        return true;
      } catch (err) {
        console.error('Erro ao anonimizar', err);
        setDbErro(`Não foi possível anonimizar: ${mensagemDeErro(err)}.`);
        return false;
      }
    }
    const rotulo = 'Titular anonimizado';
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === employeeId
          ? { ...e, nome: rotulo, email: `anonimizado.${e.id}@anonimizado.invalid`, telefone: undefined, avatarUrl: undefined }
          : e
      )
    );
    return true;
  };

  // ---------------------------------------------------------------------------
  // Fase 3 · Senha (recuperação e convite)
  // ---------------------------------------------------------------------------
  const solicitarRecuperacaoSenha = async (email: string) => {
    const res = await solicitarRecuperacaoSenhaSupabase(email);
    return res.error ? { success: false, error: res.error } : { success: true };
  };

  const definirNovaSenha = async (senha: string) => {
    const res = await definirSenhaSupabase(senha);
    if (res.error) return { success: false, error: res.error };
    setPrecisaDefinirSenha(false);
    // Recarrega sem o link na URL: a sessão segue ativa e o fluxo normal carrega os dados
    window.location.replace(window.location.origin);
    return { success: true };
  };

  // ---------------------------------------------------------------------------
  // Fase 6 · Processos guiados (onboarding/offboarding com checklist)
  // Cada passo é uma ação explícita da T.I. ("Registrar"); o banco valida e
  // faz os efeitos no inventário numa transação. Depois, recarrega o que mudou.
  // ---------------------------------------------------------------------------
  const recarregarProcesso = async () => {
    const [itens, recs, ativos, lics, chamados, lems, termos] = await Promise.all([
      fetchProcessoItensFromDb(),
      fetchRecursosFromDb(),
      fetchAssetsFromDb(),
      fetchLicensesFromDb(),
      fetchTicketsFromDb(),
      fetchLembretesFromDb(),
      fetchTermsFromDb(),
    ]);
    if (itens) setProcessoItens(itens);
    if (recs) setRecursos(recs);
    if (ativos) setAssets(ativos);
    if (lics) setLicenses(lics);
    if (chamados) setTickets(chamados);
    if (lems) setLembretes(lems);
    if (termos) setTerms(termos);
  };

  const salvarChecklist = async (chamadoId: string, rascunhos: ProcessoItemRascunho[]) => {
    if (rascunhos.length === 0) return true;
    const ordemInicial = Math.max(0, ...processoItens.filter((i) => i.chamadoId === chamadoId).map((i) => i.ordem));
    if (isProduction) {
      try {
        const novos = await inserirProcessoItensDb(chamadoId, rascunhos, ordemInicial);
        if (novos) setProcessoItens((prev) => [...prev, ...novos]);
        return true;
      } catch (err) {
        setDbErro(`Não foi possível salvar o checklist: ${mensagemDeErro(err)}.`);
        return false;
      }
    }
    const agora = new Date().toISOString();
    setProcessoItens((prev) => [
      ...prev,
      ...rascunhos.map(({ chave: _chave, ...r }, i): ProcessoItem => ({
        ...r,
        id: novoId('pit'),
        chamadoId,
        status: 'pendente',
        ordem: ordemInicial + i + 1,
        criadoEm: agora,
        criadoPor: currentUserId || undefined,
      })),
    ]);
    return true;
  };

  const removerItemProcesso = async (itemId: string) => {
    if (isProduction) {
      try {
        await excluirProcessoItemDb(itemId);
      } catch (err) {
        setDbErro(`Não foi possível remover o passo: ${mensagemDeErro(err)}.`);
        return false;
      }
    }
    setProcessoItens((prev) => prev.filter((i) => i.id !== itemId));
    return true;
  };

  const registrarItemProcesso = async (
    itemId: string,
    status: StatusItemProcesso,
    observacao: string | undefined,
    dados: DadosRegistroItem
  ): Promise<string | null> => {
    if (isProduction) {
      try {
        await registrarItemProcessoDb(itemId, status, observacao, dados);
        await recarregarProcesso();
        return null;
      } catch (err) {
        return mensagemDeErro(err);
      }
    }
    // Modo demonstração: só registra o passo (sem efeitos no inventário)
    const item = processoItens.find((i) => i.id === itemId);
    if (!item) return 'Passo não encontrado';
    if (status === 'nao_se_aplica' && !observacao?.trim()) return 'Informe o motivo para marcar como "não se aplica"';
    const chamado = tickets.find((t) => t.id === item.chamadoId);
    if (status === 'feito' && item.tipo === 'cadastro') {
      if (!dados.colaborador_id) return 'Informe o colaborador cadastrado';
      setTickets((prev) => prev.map((t) => (t.id === item.chamadoId ? { ...t, colaboradorId: dados.colaborador_id } : t)));
    } else if (status === 'feito' && !chamado?.colaboradorId) {
      return 'Faça primeiro o passo "Cadastrar colaborador"';
    }
    const agora = new Date().toISOString();
    setProcessoItens((prev) =>
      prev.map((i) =>
        i.id !== itemId
          ? i
          : {
              ...i,
              status,
              observacao: observacao ?? i.observacao,
              identificador: dados.identificador ?? i.identificador,
              ativoId: dados.ativo_id ?? i.ativoId,
              licencaId: dados.licenca_id ?? i.licencaId,
              destino: dados.destino ?? i.destino,
              destinoColaboradorId: dados.destino_colaborador_id ?? i.destinoColaboradorId,
              condicao: dados.condicao ?? i.condicao,
              lembreteEm: dados.lembrete_em ?? i.lembreteEm,
              concluidoEm: status === 'pendente' ? undefined : agora,
              concluidoPor: status === 'pendente' ? undefined : currentUserId || undefined,
            }
      )
    );
    return null;
  };

  const concluirProcesso = async (chamadoId: string): Promise<string | null> => {
    if (isProduction) {
      try {
        await concluirProcessoDb(chamadoId);
        await loadDataFromSupabase();
        return null;
      } catch (err) {
        return mensagemDeErro(err);
      }
    }
    const itens = processoItens.filter((i) => i.chamadoId === chamadoId);
    if (itens.length === 0) return 'Monte o checklist antes de concluir';
    const pendentes = itens.filter((i) => i.status === 'pendente' && i.tipo !== 'termo').length;
    if (pendentes > 0) return `Ainda há ${pendentes} passo(s) pendente(s).`;
    const tkt = tickets.find((t) => t.id === chamadoId);
    setTickets((prev) => prev.map((t) => (t.id === chamadoId ? { ...t, status: 'resolvido' } : t)));
    if (tkt?.tipo === 'offboarding' && tkt.colaboradorId) {
      setEmployees((prev) => prev.map((e) => (e.id === tkt.colaboradorId ? { ...e, status: 'desligado' } : e)));
    }
    return null;
  };

  const acessoNexus = async (colaboradorId: string, acao: 'criar' | 'redefinir', chamadoId?: string) => {
    try {
      const r = await acessoNexusDb(colaboradorId, acao, chamadoId);
      return { email: r.email, senha: r.senha };
    } catch (err) {
      return { erro: mensagemDeErro(err) };
    }
  };

  const salvarCatalogo = async (itens: CatalogoItem[], novosIds: string[]) => {
    if (isProduction) {
      try {
        for (const c of itens) await salvarCatalogoItemDb(c, novosIds.includes(c.id));
        const atual = await fetchCatalogoFromDb();
        if (atual) setCatalogo(atual);
        return true;
      } catch (err) {
        setDbErro(`Não foi possível salvar o catálogo: ${mensagemDeErro(err)}.`);
        const atual = await fetchCatalogoFromDb();
        if (atual) setCatalogo(atual);
        return false;
      }
    }
    setCatalogo((prev) => {
      const mapa = new Map(prev.map((c) => [c.id, c]));
      for (const c of itens) mapa.set(c.id, c);
      return [...mapa.values()];
    });
    return true;
  };

  const criarLembrete = async (
    l: Pick<Lembrete, 'titulo' | 'descricao' | 'venceEm' | 'chamadoId' | 'colaboradorId' | 'ativoId' | 'contratoId'>
  ): Promise<string | null> => {
    if (isProduction) {
      try {
        await criarLembreteDb(l);
        const lems = await fetchLembretesFromDb();
        if (lems) setLembretes(lems);
        return null;
      } catch (err) {
        return mensagemDeErro(err);
      }
    }
    setLembretes((prev) => [
      ...prev,
      { ...l, id: novoId('lem'), status: 'aberto', criadoEm: new Date().toISOString(), criadoPor: currentUserId || undefined },
    ]);
    return null;
  };

  const encerrarLembrete = async (id: string, status: 'feito' | 'cancelado', observacao?: string) => {
    if (isProduction) {
      try {
        await encerrarLembreteDb(id, status, observacao);
        const lems = await fetchLembretesFromDb();
        if (lems) setLembretes(lems);
        return null;
      } catch (err) {
        return mensagemDeErro(err);
      }
    }
    setLembretes((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, status, observacaoConclusao: observacao, concluidoEm: new Date().toISOString(), concluidoPor: currentUserId || undefined }
          : l
      )
    );
    return null;
  };

  const aceitarTermo = async (termoId: string): Promise<string | null> => {
    if (isProduction) {
      try {
        await aceitarTermoDb(termoId);
        const termos = await fetchTermsFromDb();
        if (termos) setTerms(termos);
        return null;
      } catch (err) {
        return mensagemDeErro(err);
      }
    }
    const t = terms.find((x) => x.id === termoId);
    if (!t) return 'Termo não encontrado';
    const agora = new Date().toISOString();
    const souColab = currentUserId === t.colaboradorId;
    const depois: ResponsibilityTerm = souColab
      ? { ...t, aceiteColaboradorEm: agora }
      : { ...t, aceiteTiEm: agora, aceiteTiPor: currentUserId || undefined };
    if (depois.aceiteColaboradorEm && depois.aceiteTiEm) {
      depois.statusAssinatura = 'assinado';
      depois.formaAssinatura = 'eletronica';
      depois.dataAssinatura = agora;
    }
    setTerms((prev) => trocar(prev, depois));
    return null;
  };

  const dispensarAssinaturaTermo = async (termoId: string, motivo: string): Promise<string | null> => {
    if (!motivo.trim()) return 'Informe o motivo da dispensa';
    if (isProduction) {
      try {
        await dispensarAssinaturaTermoDb(termoId, motivo);
        const termos = await fetchTermsFromDb();
        if (termos) setTerms(termos);
        return null;
      } catch (err) {
        return mensagemDeErro(err);
      }
    }
    setTerms((prev) => prev.map((t) => (t.id === termoId ? { ...t, formaAssinatura: 'dispensada', motivoDispensa: motivo } : t)));
    return null;
  };

  const updateSettings = (updates: Partial<CompanySettings>) => {
    const antes = settings;
    const depois = { ...settings, ...updates };
    setSettings(depois);
    persistir(saveSettingsDb(depois), () => setSettings(antes), 'Não foi possível salvar as configurações');
  };

  const resetToInitialData = () => {
    setEmployees(INITIAL_EMPLOYEES);
    setDepartments(INITIAL_DEPARTMENTS);
    setAssets(INITIAL_ASSETS);
    setLicenses(INITIAL_LICENSES);
    setTickets(INITIAL_TICKETS);
    setTerms(INITIAL_TERMS);
    setSettings(INITIAL_COMPANY_SETTINGS);
    setFornecedores(INITIAL_FORNECEDORES);
    setContratos(INITIAL_CONTRATOS);
    setFaturas(INITIAL_FATURAS);
    setCurrentUserId('emp-1');
  };

  // ZERAR DADOS: Remove todos os ativos, licenças, chamados e termos para modo de produção limpo
  const clearAllDataToProduction = async () => {
    // 1. Limpar no banco Supabase se estiver conectado
    if (isSupabaseConfigured) {
      await clearAllDatabaseTables(currentUser?.email);
    }

    // 2. Setores padrão de governança para dropdowns não ficarem vazios
    const defaultDepartments: Department[] = [
      { id: 'dep-1', nome: 'Tecnologia da Informação', codigo: 'TI', ativo: true },
      { id: 'dep-2', nome: 'Recursos Humanos', codigo: 'RH', ativo: true },
      { id: 'dep-3', nome: 'Operações e Logística', codigo: 'OPS', ativo: true },
      { id: 'dep-4', nome: 'Comercial & Vendas', codigo: 'COM', ativo: true },
      { id: 'dep-5', nome: 'Financeiro & Controladoria', codigo: 'FIN', ativo: true },
    ];

    // 3. Manter o usuário logado atual
    const activeAdmin: Employee | null = currentUser
      ? currentUser
      : supabaseUser
      ? {
          id: `emp-${supabaseUser.id.slice(0, 8)}`,
          matricula: 'NX-0001',
          nome: supabaseUser.nome || supabaseUser.email.split('@')[0].toUpperCase(),
          email: supabaseUser.email,
          cargo: 'Administrador de T.I. & Governança',
          setorId: 'dep-1',
          status: 'ativo',
          role: 'ti_admin',
          dataAdmissao: new Date().toISOString().split('T')[0],
        }
      : null;

    const remainingEmployees = activeAdmin ? [activeAdmin] : [];

    setEmployees(remainingEmployees);
    setDepartments(defaultDepartments);
    setAssets([]);
    setLicenses([]);
    setTickets([]);
    setTerms([]);
    setFornecedores([]);
    setContratos([]);
    setFaturas([]);
    if (activeAdmin) {
      setCurrentUserId(activeAdmin.id);
      localStorage.setItem(STORAGE_KEYS.USER, activeAdmin.id);
    }

    // Salva explicitamente arrays vazios no localStorage para não voltar o INITIAL_DATA
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(remainingEmployees));
    localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(defaultDepartments));
    localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.LICENSES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.TERMS, JSON.stringify([]));

  };

  return (
    <AppContext.Provider
      value={{
        supabaseUser,
        isSupabaseConnected: isSupabaseConfigured,
        supabaseHealth,
        refreshSupabaseData: async () => {
          await loadDataFromSupabase();
        },
        authLoading,
        authError,
        dbErro,
        limparDbErro: () => setDbErro(null),
        concluirOffboarding,
        anonimizarColaborador,
        precisaDefinirSenha,
        tipoLinkSenha,
        erroLinkAuth,
        catalogo,
        processoItens,
        recursos,
        lembretes,
        salvarChecklist,
        removerItemProcesso,
        registrarItemProcesso,
        concluirProcesso,
        acessoNexus,
        salvarCatalogo,
        criarLembrete,
        encerrarLembrete,
        aceitarTermo,
        dispensarAssinaturaTermo,
        fornecedores,
        contratos,
        faturas,
        criarFornecedor,
        alterarFornecedor,
        excluirFornecedor,
        criarContrato,
        alterarContrato,
        excluirContrato,
        lancarFatura,
        alterarFatura,
        excluirFatura,
        anexarArquivoContrato,
        anexarArquivoFatura,
        solicitarRecuperacaoSenha,
        definirNovaSenha,
        loginWithGoogle,
        currentUser,
        currentRole,
        login,
        logout,
        employees,
        departments,
        assets,
        licenses,
        tickets,
        terms,
        settings,
        addEmployee,
        cadastrarColaborador,
        updateEmployee,
        updateEmployeeRole,
        deleteEmployee,
        addDepartment,
        updateDepartment,
        deleteDepartment,
        addAsset,
        updateAsset,
        anexarArquivoAtivo,
        removerAnexoAtivo,
        transferAssetCustody,
        abrirManutencao,
        registrarManutencaoFeita,
        encerrarManutencao,
        baixarAtivo,
        estornarBaixa,
        addLicense,
        updateLicense,
        deleteLicense,
        allocateLicense,
        revokeLicense,
        createTicket,
        addTicketMessage,
        updateTicketStatus,
        salvarAlteracoesChamado,
        resolverChamado,
        cancelarChamado,
        reabrirChamado,
        avaliarChamado,
        carregarEventosChamado,
        registrarPendencias,
        podeDescartarPendencias,
        createTerm,
        markTermSigned,
        updateSettings,
        resetToInitialData,
        clearAllDataToProduction,
        pilhaFichas,
        abrirFicha,
        fecharFicha,
        setSelectedAssetIdFor360,
        setSelectedSoftwareIdFor360,
        softwareModalOpen,
        setSoftwareModalOpen,
        softwareToEdit,
        setSoftwareToEdit,
        setSelectedEmployeeIdFor360,
        setSelectedTicketIdForDetail,
        selectedTermForPrint,
        setSelectedTermForPrint,
        selectedAssetForQrCode,
        setSelectedAssetForQrCode,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp deve ser utilizado dentro de um AppProvider');
  }
  return context;
};
