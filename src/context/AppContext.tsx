import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Asset,
  CompanySettings,
  CustodyHistoryEntry,
  Department,
  Employee,
  ResponsibilityTerm,
  SoftwareLicense,
  Ticket,
  TicketAttachment,
  TicketStatus,
  UserRole,
} from '../types/index.ts';
import {
  INITIAL_ASSETS,
  INITIAL_COMPANY_SETTINGS,
  INITIAL_DEPARTMENTS,
  INITIAL_EMPLOYEES,
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
  SupabaseHealthStatus,
} from '../services/supabaseDb.ts';

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
  transferAssetCustody: (
    assetId: string,
    newColaboradorId: string | null,
    motivoDevolucao?: string
  ) => void;

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
  assignTicketTechnician: (ticketId: string, technicianId: string) => void;
  toggleOffboardingChecklist: (ticketId: string, checklistItemId: string) => void;

  // Ações de Termos
  // Assíncrono: o código (#TR-AAAA-NNNN) vem do banco. Devolve null se falhar.
  createTerm: (
    term: Omit<ResponsibilityTerm, 'id' | 'codigo' | 'dataEmissao'>
  ) => Promise<ResponsibilityTerm | null>;
  markTermSigned: (termId: string, arquivoUrl?: string) => void;

  // Configurações e Reset
  updateSettings: (updates: Partial<CompanySettings>) => void;
  resetToInitialData: () => void;
  clearAllDataToProduction: () => Promise<void>;

  // Navegação Relacional 360° e Modais
  selectedAssetIdFor360: string | null;
  setSelectedAssetIdFor360: (id: string | null) => void;
  selectedSoftwareIdFor360: string | null;
  setSelectedSoftwareIdFor360: (id: string | null) => void;
  softwareModalOpen: boolean;
  setSoftwareModalOpen: (open: boolean) => void;
  softwareToEdit: SoftwareLicense | null;
  setSoftwareToEdit: (lic: SoftwareLicense | null) => void;
  selectedEmployeeIdFor360: string | null;
  setSelectedEmployeeIdFor360: (id: string | null) => void;
  selectedTicketIdForDetail: string | null;
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
    if (saved) return saved;
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

      const u = session.user;
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
  }, []);


  // Modais de Rastreabilidade Relacional 360°
  const [selectedAssetIdFor360, setSelectedAssetIdFor360] = useState<string | null>(null);
  const [selectedSoftwareIdFor360, setSelectedSoftwareIdFor360] = useState<string | null>(null);
  const [softwareModalOpen, setSoftwareModalOpen] = useState<boolean>(false);
  const [softwareToEdit, setSoftwareToEdit] = useState<SoftwareLicense | null>(null);
  const [selectedEmployeeIdFor360, setSelectedEmployeeIdFor360] = useState<string | null>(null);
  const [selectedTicketIdForDetail, setSelectedTicketIdForDetail] = useState<string | null>(null);
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

    // 2. Modo Offline / Demonstração: Exige senha padrão segura (nexus@2026)
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
    persistir(
      insertAssetDb(novo),
      () => setAssets((prev) => prev.filter((a) => a.id !== novo.id)),
      `Não foi possível cadastrar o ativo ${novo.tag}`
    );
    return novo;
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
      status: newColaboradorId ? 'em_uso' : 'disponivel',
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

  const assignTicketTechnician = (ticketId: string, technicianId: string) => {
    const tech = employees.find((e) => e.id === technicianId);
    alterarChamado(
      ticketId,
      (t) => ({ ...t, tecnicoResponsavelId: technicianId, tecnicoResponsavelNome: tech?.nome || 'Técnico de TI' }),
      'Não foi possível atribuir o técnico'
    );
  };

  const toggleOffboardingChecklist = (ticketId: string, checklistItemId: string) => {
    alterarChamado(
      ticketId,
      (t) =>
        t.offboarding
          ? {
              ...t,
              offboarding: {
                ...t.offboarding,
                checklist: t.offboarding.checklist.map((item) =>
                  item.id === checklistItemId ? { ...item, concluido: !item.concluido } : item
                ),
              },
            }
          : t,
      'Não foi possível atualizar o checklist'
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
    };
    setTerms((prev) => trocar(prev, depois));
    persistir(updateTermDb(antes, depois), () => setTerms((prev) => trocar(prev, antes)), `Não foi possível registrar a assinatura de ${antes.codigo}`);
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
        updateEmployee,
        updateEmployeeRole,
        deleteEmployee,
        addDepartment,
        updateDepartment,
        deleteDepartment,
        addAsset,
        updateAsset,
        transferAssetCustody,
        addLicense,
        updateLicense,
        deleteLicense,
        allocateLicense,
        revokeLicense,
        createTicket,
        addTicketMessage,
        updateTicketStatus,
        assignTicketTechnician,
        toggleOffboardingChecklist,
        createTerm,
        markTermSigned,
        updateSettings,
        resetToInitialData,
        clearAllDataToProduction,
        selectedAssetIdFor360,
        setSelectedAssetIdFor360,
        selectedSoftwareIdFor360,
        setSelectedSoftwareIdFor360,
        softwareModalOpen,
        setSoftwareModalOpen,
        softwareToEdit,
        setSoftwareToEdit,
        selectedEmployeeIdFor360,
        setSelectedEmployeeIdFor360,
        selectedTicketIdForDetail,
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
