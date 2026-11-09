/**
 * Tipos e Interfaces do Sistema Nexus IT & HR
 */

export type UserRole = 'colaborador' | 'rh' | 'ti_admin' | 'ti_suporte';

export type EmployeeStatus = 'ativo' | 'ferias' | 'desligado';

export interface Employee {
  id: string;
  matricula: string;
  nome: string;
  email: string;
  cargo: string;
  setorId: string;
  gestorId?: string;
  status: EmployeeStatus;
  dataAdmissao: string;
  role?: UserRole;
  telefone?: string;
  avatarUrl?: string;
}

export interface Department {
  id: string;
  nome: string;
  codigo: string;
  descricao?: string;
  ativo: boolean;
  responsavelId?: string;
}

export type AssetCategory = 'hardware' | 'software' | 'periferico' | 'telefonia';

export type AssetStatus = 'disponivel' | 'em_uso' | 'manutencao' | 'descartado';

export interface FiscalData {
  numeroNF: string;
  chaveAcesso44: string;
  valorCompra: number;
  fornecedor: string;
  dataAquisicao: string;
  dataGarantia: string;
  suporteContato?: string;
  notaFiscalArquivoUrl?: string;
}

export interface CustodyHistoryEntry {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  dataEntrega: string;
  dataDevolucao?: string;
  motivoDevolucao?: string;
  termoId?: string;
  observacoes?: string;
}

export interface MaintenanceEntry {
  id: string;
  data: string;
  descricao: string;
  fornecedor: string;
  custo: number;
  status: 'concluido' | 'em_andamento';
}

export interface Asset {
  id: string;
  tag: string; // Ex: #PAT-1042
  nome: string;
  categoria: AssetCategory;
  marca: string;
  modelo: string;
  serialNumber: string;
  localizacaoFisica: string;
  setorId?: string;
  custodianteId?: string; // Colaborador em posse
  status: AssetStatus;
  dataEntregaAtual?: string;
  fiscal: FiscalData;
  sistemaOperacional?: string; // Ex: Windows 11 Pro, macOS Sonoma
  bitlockerKey?: string; // Chave de recuperação BitLocker (até 48 dígitos)
  customFields?: Record<string, string>;
  fotos?: string[];
  historicoCustodia: CustodyHistoryEntry[];
  historicoManutencao: MaintenanceEntry[];
}

export interface SoftwareLicense {
  id: string;
  nome: string;
  fornecedor: string;
  chaveContrato: string;
  assentosTotais: number;
  assentosAlocados: number;
  colaboradoresIds: string[];
  dataRenovacao: string;
  valorMensal: number;
  urlPainel?: string;
  tipoCobranca?: 'mensal' | 'anual';
  observacoes?: string;
}

export type TicketType = 'suporte' | 'onboarding' | 'offboarding';
export type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_peca' | 'resolvido' | 'cancelado';
export type TicketPriority = 'baixa' | 'media' | 'alta' | 'urgente';

export interface TicketAttachment {
  id: string;
  nome: string;
  url: string;
  tipo: string;
  tamanho?: string;
  dataUpload: string;
}

export interface TicketMessage {
  id: string;
  autorId: string;
  autorNome: string;
  autorRole: UserRole;
  texto: string;
  ehNotaInterna: boolean; // Invisível para o colaborador
  data: string;
  anexos?: TicketAttachment[];
}

export interface OffboardingChecklistItem {
  id: string;
  texto: string;
  concluido: boolean;
  categoria: 'equipamento' | 'acesso' | 'termo' | 'geral';
}

export interface OffboardingData {
  dataDesligamento: string;
  redirecionarEmail: boolean;
  redirecionarEmailParaId?: string;
  transferirDrive: boolean;
  transferirDriveParaId?: string;
  recolhimentoInstrucoes: string;
  observacoes?: string;
  checklist: OffboardingChecklistItem[];
}

export interface OnboardingData {
  nomeColaborador: string;
  emailColaborador: string;
  cargo: string;
  setorId: string;
  gestorId?: string;
  dataAdmissao: string;
  papelAcessoSugerido?: UserRole;
  tipoComputador: string;
  perifericos: string[];
  acessosSoftwares: string[];
  observacoes?: string;
}

export interface Ticket {
  id: string;
  codigo: string; // Ex: #CH-2026-042
  tipo: TicketType;
  solicitanteId: string;
  solicitanteNome: string;
  solicitanteEmail: string;
  solicitanteCargo: string;
  solicitanteSetorNome: string;
  ativoId?: string; // Vínculo ao ativo em posse
  softwareId?: string; // Vínculo ao software/licença SaaS
  softwareNome?: string; // Nome do software/licença vinculada
  titulo: string;
  categoria: string;
  prioridade: TicketPriority;
  status: TicketStatus;
  tecnicoResponsavelId?: string;
  tecnicoResponsavelNome?: string;
  dataCriacao: string;
  dataAtualizacao: string;
  dataResolucao?: string;
  descricao: string;
  anexos: TicketAttachment[];
  mensagens: TicketMessage[];
  offboarding?: OffboardingData;
  onboarding?: OnboardingData;
}

export interface ResponsibilityTerm {
  id: string;
  codigo: string; // Ex: #TR-2026-0012
  tipo: 'entrega' | 'devolucao';
  colaboradorId: string;
  colaboradorNome: string;
  colaboradorMatricula: string;
  colaboradorCargo: string;
  colaboradorSetorNome: string;
  ativoIds: string[];
  dataEmissao: string;
  statusAssinatura: 'gerado' | 'assinado';
  arquivoAssinadoUrl?: string;
  observacoes?: string;
  responsavelTIId: string;
  responsavelTINome: string;
}

export interface CustomFieldDefinition {
  id: string;
  categoria: AssetCategory;
  key: string;
  label: string;
  tipo: 'text' | 'number' | 'date' | 'select';
  opcoes?: string[];
  obrigatorio?: boolean;
}

export interface CompanySettings {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  endereco: string;
  cidadeUF: string;
  cep: string;
  emailTI: string;
  telefoneTI: string;
  logoUrl?: string;
  textoTermoEntrega: string;
  textoTermoDevolucao: string;
  camposPersonalizados: CustomFieldDefinition[];
}
