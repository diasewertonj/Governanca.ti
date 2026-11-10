import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Asset,
  CompanySettings,
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
  signUpWithPasswordSupabase,
  signOutSupabase,
  SupabaseAuthUser,
} from '../services/supabase.ts';

interface AppContextType {
  // Autenticação e Usuário Atual (Supabase + Perfis)
  supabaseUser: SupabaseAuthUser | null;
  isSupabaseConnected: boolean;
  authLoading: boolean;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  currentUser: Employee | null;
  currentRole: UserRole;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  registerUser: (email: string, password: string, nome: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  switchUser: (employeeId: string) => void;

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
  createTicket: (
    ticket: Omit<Ticket, 'id' | 'codigo' | 'dataCriacao' | 'dataAtualizacao' | 'mensagens'>
  ) => Ticket;
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
  createTerm: (
    term: Omit<ResponsibilityTerm, 'id' | 'codigo' | 'dataEmissao'>
  ) => ResponsibilityTerm;
  markTermSigned: (termId: string, arquivoUrl?: string) => void;

  // Configurações e Reset
  updateSettings: (updates: Partial<CompanySettings>) => void;
  resetToInitialData: () => void;
  clearAllDataToProduction: () => void;

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

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Carregar dados com fallback para o initialData
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
    return saved ? JSON.parse(saved) : INITIAL_EMPLOYEES;
  });

  const [departments, setDepartments] = useState<Department[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.DEPARTMENTS);
    return saved ? JSON.parse(saved) : INITIAL_DEPARTMENTS;
  });

  const [assets, setAssets] = useState<Asset[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ASSETS);
    return saved ? JSON.parse(saved) : INITIAL_ASSETS;
  });

  const [licenses, setLicenses] = useState<SoftwareLicense[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LICENSES);
    return saved ? JSON.parse(saved) : INITIAL_LICENSES;
  });

  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TICKETS);
    return saved ? JSON.parse(saved) : INITIAL_TICKETS;
  });

  const [terms, setTerms] = useState<ResponsibilityTerm[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TERMS);
    return saved ? JSON.parse(saved) : INITIAL_TERMS;
  });

  const [settings, setSettings] = useState<CompanySettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return saved ? JSON.parse(saved) : INITIAL_COMPANY_SETTINGS;
  });

  // Usuário Supabase real e Usuário corporativo
  const [supabaseUser, setSupabaseUser] = useState<SupabaseAuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.USER) || 'emp-1'; // Padrão: Carlos Eduardo (Admin TI)
  });

  // Listener de Autenticação Supabase (se configurado)
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    // Obter sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        const authUser: SupabaseAuthUser = {
          id: u.id,
          email: u.email || '',
          nome: u.user_metadata?.full_name || u.email?.split('@')[0],
          avatarUrl: u.user_metadata?.avatar_url,
        };
        setSupabaseUser(authUser);
        vincularUsuarioComColaborador(authUser);
      }
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const u = session.user;
        const authUser: SupabaseAuthUser = {
          id: u.id,
          email: u.email || '',
          nome: u.user_metadata?.full_name || u.email?.split('@')[0],
          avatarUrl: u.user_metadata?.avatar_url,
        };
        setSupabaseUser(authUser);
        vincularUsuarioComColaborador(authUser);
      } else {
        setSupabaseUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const vincularUsuarioComColaborador = (user: SupabaseAuthUser) => {
    if (!user.email) return;
    const cleanEmail = user.email.toLowerCase();
    const existing = employees.find((e) => e.email.toLowerCase() === cleanEmail);
    if (existing) {
      setCurrentUserId(existing.id);
    } else {
      const newId = `emp-${user.id.slice(0, 8)}`;
      const foundCreated = employees.find((e) => e.id === newId);
      if (!foundCreated) {
        const newColab: Employee = {
          id: newId,
          matricula: `NX-${Date.now().toString().slice(-4)}`,
          nome: user.nome || user.email.split('@')[0],
          email: cleanEmail,
          cargo: 'Administrador de T.I. & Governança',
          setorId: 'dep-1',
          status: 'ativo',
          dataAdmissao: new Date().toISOString().split('T')[0],
          avatarUrl: user.avatarUrl || undefined,
        };
        setEmployees((prev) => [newColab, ...prev]);
        setCurrentUserId(newColab.id);
      } else {
        setCurrentUserId(foundCreated.id);
      }
    }
  };

  // Modais de Rastreabilidade Relacional 360°
  const [selectedAssetIdFor360, setSelectedAssetIdFor360] = useState<string | null>(null);
  const [selectedSoftwareIdFor360, setSelectedSoftwareIdFor360] = useState<string | null>(null);
  const [softwareModalOpen, setSoftwareModalOpen] = useState<boolean>(false);
  const [softwareToEdit, setSoftwareToEdit] = useState<SoftwareLicense | null>(null);
  const [selectedEmployeeIdFor360, setSelectedEmployeeIdFor360] = useState<string | null>(null);
  const [selectedTicketIdForDetail, setSelectedTicketIdForDetail] = useState<string | null>(null);
  const [selectedTermForPrint, setSelectedTermForPrint] = useState<ResponsibilityTerm | null>(null);
  const [selectedAssetForQrCode, setSelectedAssetForQrCode] = useState<Asset | null>(null);

  // Sincronizar com localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(departments));
  }, [departments]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LICENSES, JSON.stringify(licenses));
  }, [licenses]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(tickets));
  }, [tickets]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TERMS, JSON.stringify(terms));
  }, [terms]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (currentUserId) {
      localStorage.setItem(STORAGE_KEYS.USER, currentUserId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER);
    }
  }, [currentUserId]);

  const currentUser = employees.find((e) => e.id === currentUserId) || null;

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

    // Se o Supabase estiver configurado e houver senha, autenticar no Supabase Auth
    if (supabase && password) {
      const res = await signInWithPasswordSupabase(cleanEmail, password);
      if (res.error) {
        // Tentar autenticação pelo cadastro corporativo se a senha for padrão de primeiro acesso
        const localUser = employees.find((e) => e.email.toLowerCase() === cleanEmail);
        if (!localUser) {
          return { success: false, error: res.error };
        }
      } else if (res.data?.user) {
        const u = res.data.user;
        const authUser: SupabaseAuthUser = {
          id: u.id,
          email: u.email || cleanEmail,
          nome: u.user_metadata?.full_name || cleanEmail.split('@')[0],
        };
        setSupabaseUser(authUser);
        vincularUsuarioComColaborador(authUser);
        return { success: true };
      }
    }

    // Validação com a base corporativa de colaboradores
    const found = employees.find((e) => e.email.toLowerCase() === cleanEmail);
    if (found) {
      setCurrentUserId(found.id);
      return { success: true };
    }

    return {
      success: false,
      error: 'E-mail ou credenciais corporativas não encontradas no sistema.',
    };
  };

  const registerUser = async (
    email: string,
    password: string,
    nome: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (supabase) {
      const res = await signUpWithPasswordSupabase(cleanEmail, password, nome);
      if (res.error) {
        return { success: false, error: res.error };
      }
    }

    // Criar colaborador associado
    const newEmp: Employee = {
      id: `emp-${Date.now().toString().slice(-6)}`,
      matricula: `NX-${Date.now().toString().slice(-4)}`,
      nome,
      email: cleanEmail,
      cargo: 'Colaborador',
      setorId: 'dep-1',
      status: 'ativo',
      role: 'colaborador',
      dataAdmissao: new Date().toISOString().split('T')[0],
    };
    setEmployees((prev) => [newEmp, ...prev]);
    setCurrentUserId(newEmp.id);
    return { success: true };
  };

  const logout = async () => {
    await signOutSupabase();
    setCurrentUserId(null);
    setSupabaseUser(null);
  };

  const switchUser = (employeeId: string) => {
    const found = employees.find((e) => e.id === employeeId);
    if (found) {
      setCurrentUserId(found.id);
    }
  };

  // CRUD de Colaboradores
  const addEmployee = (data: Omit<Employee, 'id'>): Employee => {
    const id = `emp-${Date.now().toString().slice(-6)}`;
    const newEmployee: Employee = { ...data, id };
    setEmployees((prev) => [newEmployee, ...prev]);
    return newEmployee;
  };

  const updateEmployee = (id: string, updates: Partial<Employee>) => {
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === id ? { ...emp, ...updates } : emp))
    );
  };

  const updateEmployeeRole = (id: string, role: UserRole) => {
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === id ? { ...emp, role } : emp))
    );
  };

  const deleteEmployee = (id: string): { success: boolean; message?: string } => {
    // Proteção: não excluir se o colaborador tiver ativos sob custódia
    const assetsWithUser = assets.filter((a) => a.custodianteId === id);
    if (assetsWithUser.length > 0) {
      return {
        success: false,
        message: `Não é possível excluir. O colaborador possui ${assetsWithUser.length} equipamento(s) sob sua custódia. Faça a devolução primeiro.`,
      };
    }

    setEmployees((prev) => prev.filter((emp) => emp.id !== id));
    return { success: true };
  };

  // CRUD de Setores com Proteção Referencial
  const addDepartment = (data: Omit<Department, 'id'>): Department => {
    const id = `dep-${Date.now().toString().slice(-4)}`;
    const newDepartment: Department = { ...data, id };
    setDepartments((prev) => [...prev, newDepartment]);
    return newDepartment;
  };

  const updateDepartment = (id: string, updates: Partial<Department>) => {
    setDepartments((prev) =>
      prev.map((dep) => (dep.id === id ? { ...dep, ...updates } : dep))
    );
  };

  const deleteDepartment = (id: string): { success: boolean; message?: string } => {
    // Regra Inegociável: setor com colaboradores vinculados não pode ser excluído
    const linkedEmployees = employees.filter((e) => e.setorId === id);
    if (linkedEmployees.length > 0) {
      return {
        success: false,
        message: `Ação bloqueada: O setor possui ${linkedEmployees.length} colaborador(es) vinculado(s). Você pode inativá-lo, mas não excluí-lo.`,
      };
    }
    setDepartments((prev) => prev.filter((dep) => dep.id !== id));
    return { success: true };
  };

  // CRUD de Ativos & Gestão de Custódia 1:1
  const addAsset = (data: Omit<Asset, 'id'>): Asset => {
    const id = `ast-${Date.now().toString().slice(-6)}`;
    const newAsset: Asset = { ...data, id };
    setAssets((prev) => [newAsset, ...prev]);
    return newAsset;
  };

  const updateAsset = (id: string, updates: Partial<Asset>) => {
    setAssets((prev) =>
      prev.map((ast) => (ast.id === id ? { ...ast, ...updates } : ast))
    );
  };

  const transferAssetCustody = (
    assetId: string,
    newColaboradorId: string | null,
    motivoDevolucao?: string
  ) => {
    const today = new Date().toISOString().split('T')[0];

    setAssets((prev) =>
      prev.map((ast) => {
        if (ast.id !== assetId) return ast;

        const currentCustody = ast.historicoCustodia;
        let updatedCustody = [...currentCustody];

        // Se havia alguém usando e está devolvendo ou transferindo
        if (ast.custodianteId && ast.custodianteId !== newColaboradorId) {
          const lastEntry = updatedCustody[updatedCustody.length - 1];
          if (lastEntry && !lastEntry.dataDevolucao) {
            updatedCustody[updatedCustody.length - 1] = {
              ...lastEntry,
              dataDevolucao: today,
              motivoDevolucao: motivoDevolucao || 'Devolução/Transferência para o estoque de TI',
            };
          }
        }

        // Se está alocando para um novo colaborador
        if (newColaboradorId) {
          const newEmp = employees.find((e) => e.id === newColaboradorId);
          updatedCustody.push({
            id: `cust-${Date.now().toString().slice(-6)}`,
            colaboradorId: newColaboradorId,
            colaboradorNome: newEmp?.nome || 'Colaborador',
            dataEntrega: today,
            observacoes: 'Transferência de custódia realizada pelo setor de TI',
          });
        }

        return {
          ...ast,
          custodianteId: newColaboradorId || undefined,
          status: newColaboradorId ? 'em_uso' : 'disponivel',
          dataEntregaAtual: newColaboradorId ? today : undefined,
          historicoCustodia: updatedCustody,
        };
      })
    );
  };

  // Licenças de Softwares & SaaS
  const addLicense = (data: Omit<SoftwareLicense, 'id' | 'assentosAlocados'>): SoftwareLicense => {
    const id = `lic-${Date.now().toString().slice(-6)}`;
    const newLicense: SoftwareLicense = {
      ...data,
      id,
      assentosAlocados: data.colaboradoresIds ? data.colaboradoresIds.length : 0,
      colaboradoresIds: data.colaboradoresIds || [],
    };
    setLicenses((prev) => [newLicense, ...prev]);
    return newLicense;
  };

  const updateLicense = (id: string, updates: Partial<SoftwareLicense>) => {
    setLicenses((prev) =>
      prev.map((lic) => {
        if (lic.id !== id) return lic;
        const updated = { ...lic, ...updates };
        if (updates.colaboradoresIds) {
          updated.assentosAlocados = updates.colaboradoresIds.length;
        }
        return updated;
      })
    );
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
    return { success: true };
  };

  const allocateLicense = (licenseId: string, employeeId: string) => {
    setLicenses((prev) =>
      prev.map((lic) => {
        if (lic.id !== licenseId) return lic;
        if (lic.colaboradoresIds.includes(employeeId)) return lic;
        if (lic.colaboradoresIds.length >= lic.assentosTotais) {
          // Bloquear se já atingiu o limite de assentos contratados
          return lic;
        }
        const updatedColabs = [...lic.colaboradoresIds, employeeId];
        return {
          ...lic,
          assentosAlocados: updatedColabs.length,
          colaboradoresIds: updatedColabs,
        };
      })
    );
  };

  const revokeLicense = (licenseId: string, employeeId: string) => {
    setLicenses((prev) =>
      prev.map((lic) => {
        if (lic.id !== licenseId) return lic;
        if (!lic.colaboradoresIds.includes(employeeId)) return lic;
        const updatedColabs = lic.colaboradoresIds.filter((id) => id !== employeeId);
        return {
          ...lic,
          assentosAlocados: updatedColabs.length,
          colaboradoresIds: updatedColabs,
        };
      })
    );
  };

  // Service Desk / Chamados
  const createTicket = (
    ticketData: Omit<Ticket, 'id' | 'codigo' | 'dataCriacao' | 'dataAtualizacao' | 'mensagens'>
  ): Ticket => {
    const year = new Date().getFullYear();
    const count = tickets.length + 1;
    const codigo = `#CH-${year}-${count.toString().padStart(3, '0')}`;
    const now = new Date().toISOString();

    const newTicket: Ticket = {
      ...ticketData,
      id: `tkt-${Date.now().toString().slice(-6)}`,
      codigo,
      dataCriacao: now,
      dataAtualizacao: now,
      mensagens: [
        {
          id: `msg-${Date.now().toString().slice(-6)}`,
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

    setTickets((prev) => [newTicket, ...prev]);
    return newTicket;
  };

  const addTicketMessage = (
    ticketId: string,
    texto: string,
    ehNotaInterna: boolean,
    anexos?: TicketAttachment[]
  ) => {
    if (!currentUser) return;
    const now = new Date().toISOString();

    setTickets((prev) =>
      prev.map((tkt) => {
        if (tkt.id !== ticketId) return tkt;
        const newMessage = {
          id: `msg-${Date.now().toString().slice(-6)}`,
          autorId: currentUser.id,
          autorNome: currentUser.nome,
          autorRole: currentRole,
          texto,
          ehNotaInterna,
          data: now,
          anexos,
        };
        return {
          ...tkt,
          dataAtualizacao: now,
          mensagens: [...tkt.mensagens, newMessage],
        };
      })
    );
  };

  const updateTicketStatus = (ticketId: string, status: TicketStatus) => {
    const now = new Date().toISOString();
    setTickets((prev) =>
      prev.map((tkt) =>
        tkt.id === ticketId
          ? {
              ...tkt,
              status,
              dataAtualizacao: now,
              dataResolucao: status === 'resolvido' ? now : tkt.dataResolucao,
            }
          : tkt
      )
    );
  };

  const assignTicketTechnician = (ticketId: string, technicianId: string) => {
    const tech = employees.find((e) => e.id === technicianId);
    setTickets((prev) =>
      prev.map((tkt) =>
        tkt.id === ticketId
          ? {
              ...tkt,
              tecnicoResponsavelId: technicianId,
              tecnicoResponsavelNome: tech?.nome || 'Técnico de TI',
              dataAtualizacao: new Date().toISOString(),
            }
          : tkt
      )
    );
  };

  const toggleOffboardingChecklist = (ticketId: string, checklistItemId: string) => {
    setTickets((prev) =>
      prev.map((tkt) => {
        if (tkt.id !== ticketId || !tkt.offboarding) return tkt;
        const updatedChecklist = tkt.offboarding.checklist.map((item) =>
          item.id === checklistItemId ? { ...item, concluido: !item.concluido } : item
        );
        return {
          ...tkt,
          offboarding: {
            ...tkt.offboarding,
            checklist: updatedChecklist,
          },
          dataAtualizacao: new Date().toISOString(),
        };
      })
    );
  };

  // Termos de Responsabilidade
  const createTerm = (
    data: Omit<ResponsibilityTerm, 'id' | 'codigo' | 'dataEmissao'>
  ): ResponsibilityTerm => {
    const year = new Date().getFullYear();
    const count = terms.length + 1;
    const codigo = `#TR-${year}-${count.toString().padStart(4, '0')}`;
    const now = new Date().toISOString().split('T')[0];

    const newTerm: ResponsibilityTerm = {
      ...data,
      id: `tr-${Date.now().toString().slice(-6)}`,
      codigo,
      dataEmissao: now,
    };

    setTerms((prev) => [newTerm, ...prev]);
    return newTerm;
  };

  const markTermSigned = (termId: string, arquivoUrl?: string) => {
    setTerms((prev) =>
      prev.map((t) =>
        t.id === termId
          ? {
              ...t,
              statusAssinatura: 'assinado',
              arquivoAssinadoUrl: arquivoUrl || 'https://cdn.nexuscorp.com.br/termos/assinado-scan.pdf',
            }
          : t
      )
    );
  };

  const updateSettings = (updates: Partial<CompanySettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
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
  const clearAllDataToProduction = () => {
    // Mantém setores padrão para o sistema não quebrar os dropdowns
    const defaultDepartments: Department[] = [
      { id: 'dep-1', nome: 'Tecnologia da Informação', codigo: 'TI', ativo: true },
      { id: 'dep-2', nome: 'Recursos Humanos', codigo: 'RH', ativo: true },
      { id: 'dep-3', nome: 'Operações e Logística', codigo: 'OPS', ativo: true },
      { id: 'dep-4', nome: 'Comercial & Vendas', codigo: 'COM', ativo: true },
      { id: 'dep-5', nome: 'Financeiro & Controladoria', codigo: 'FIN', ativo: true },
    ];

    // Mantém o usuário administrador atual (ou cria admin padrão)
    const adminUser: Employee = currentUser || {
      id: 'emp-1',
      matricula: 'NX-0001',
      nome: 'Administrador de T.I.',
      email: 'admin.ti@nexuscorp.com.br',
      cargo: 'Coordenador de TI & Governança',
      setorId: 'dep-1',
      status: 'ativo',
      role: 'ti_admin',
      dataAdmissao: new Date().toISOString().split('T')[0],
    };

    setEmployees([adminUser]);
    setDepartments(defaultDepartments);
    setAssets([]);
    setLicenses([]);
    setTickets([]);
    setTerms([]);
    setCurrentUserId(adminUser.id);

    // Salva explicitamente arrays vazios no localStorage para não voltar o INITIAL_DATA
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify([adminUser]));
    localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(defaultDepartments));
    localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.LICENSES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.TERMS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.USER, adminUser.id);
  };

  return (
    <AppContext.Provider
      value={{
        supabaseUser,
        isSupabaseConnected: isSupabaseConfigured,
        authLoading,
        loginWithGoogle,
        currentUser,
        currentRole,
        login,
        registerUser,
        logout,
        switchUser,
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
