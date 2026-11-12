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
export type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_terceiro' | 'resolvido' | 'cancelado';
export type TicketPriority = 'baixa' | 'media' | 'alta' | 'critica';

export interface TicketAttachment {
  id: string;
  nome: string;
  url: string;
  // Fase 3: caminho no Storage privado (bucket "documentos"). Quando existe,
  // o link é gerado na hora (URL temporária); `url` fica só para dados antigos/demo.
  caminho?: string;
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
  colaboradorId?: string; // Fase 3: quem será desligado (usado pelo offboarding automático)
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
  gruposEmail?: string[]; // Fase 6: sugestão do RH, a TI confirma
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
  colaboradorId?: string; // Fase 6: a pessoa que entra/sai
}

// -----------------------------------------------------------------------------
// Fase 6 · Processos guiados de onboarding e offboarding
// -----------------------------------------------------------------------------
export type TipoCatalogo = 'conta' | 'grupo_email' | 'equipamento' | 'acessorio' | 'tarefa';

export interface CatalogoItem {
  id: string;
  tipo: TipoCatalogo;
  nome: string;
  descricao?: string;
  sugeridoOnboarding: boolean;
  ativo: boolean;
  ordem: number;
}

export type TipoItemProcesso =
  | 'cadastro'
  | 'conta'
  | 'grupo_email'
  | 'equipamento'
  | 'acessorio'
  | 'licenca'
  | 'termo'
  | 'acesso_nexus'
  | 'encerrar_recurso'
  | 'devolver_equipamento'
  | 'liberar_licenca'
  | 'dados_drive'
  | 'email'
  | 'tarefa';

export type StatusItemProcesso = 'pendente' | 'feito' | 'nao_se_aplica';
export type DestinoRecurso = 'suspender' | 'excluir' | 'manter' | 'transferir' | 'outro';
export type CondicaoItem = 'bom' | 'avaria';

export interface ProcessoItem {
  id: string;
  chamadoId: string;
  tipo: TipoItemProcesso;
  titulo: string;
  detalhe?: string;
  sugeridoPor: 'rh' | 'ti' | 'sistema';
  status: StatusItemProcesso;
  observacao?: string;
  catalogoId?: string;
  recursoId?: string;
  ativoId?: string;
  licencaId?: string;
  identificador?: string;
  destino?: DestinoRecurso;
  destinoColaboradorId?: string;
  condicao?: CondicaoItem;
  lembreteEm?: string;
  ordem: number;
  criadoPor?: string;
  criadoEm: string;
  concluidoPor?: string;
  concluidoEm?: string;
}

/** Item ainda em montagem (antes de "Salvar checklist") */
export type ProcessoItemRascunho = Pick<
  ProcessoItem,
  'tipo' | 'titulo' | 'detalhe' | 'sugeridoPor' | 'catalogoId' | 'recursoId' | 'ativoId' | 'licencaId' | 'identificador'
> & { chave: string };

export type StatusRecurso = 'ativo' | 'suspenso' | 'excluido' | 'mantido' | 'transferido' | 'devolvido';

export interface ColaboradorRecurso {
  id: string;
  colaboradorId: string;
  tipo: 'conta' | 'grupo_email' | 'acessorio';
  catalogoId?: string;
  nome: string;
  identificador?: string;
  status: StatusRecurso;
  concedidoEm: string;
  concedidoPor?: string;
  chamadoConcessao?: string;
  encerradoEm?: string;
  encerradoPor?: string;
  chamadoEncerramento?: string;
  observacao?: string;
}

export interface Lembrete {
  id: string;
  titulo: string;
  descricao?: string;
  venceEm: string;
  status: 'aberto' | 'feito' | 'cancelado';
  chamadoId?: string;
  colaboradorId?: string;
  itemId?: string;
  criadoPor?: string;
  criadoEm: string;
  concluidoPor?: string;
  concluidoEm?: string;
  observacaoConclusao?: string;
}

export interface ProcessoEvento {
  id: number;
  chamadoId: string;
  itemId?: string;
  acao: string;
  detalhe?: Record<string, unknown>;
  por?: string;
  em: string;
}

/** Documento controlado da Qualidade (ex.: RG.TI.002, versão 02, POP.TI.013) */
export interface ModeloDocumento {
  codigo: string;
  versao: string;
  referencia: string;
  titulo: string;
}

/** Linha do termo: equipamento ou acessório, com condição e situação */
export interface ItemTermo {
  descricao: string;
  patrimonio?: string;
  marcaModelo?: string;
  condicao?: CondicaoItem;
  situacao: 'entregue' | 'devolvido' | 'pendente' | 'na';
  observacao?: string;
  ativoId?: string;
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
  // Fase 6: modelo da Qualidade, itens com condição/situação e aceite eletrônico
  chamadoId?: string;
  itens?: ItemTermo[];
  localUnidade?: string;
  docCodigo?: string;
  docVersao?: string;
  docReferencia?: string;
  docTitulo?: string;
  textoClausula?: string;
  hashConteudo?: string;
  aceiteColaboradorEm?: string;
  aceiteTiEm?: string;
  aceiteTiPor?: string;
  formaAssinatura?: 'pendente' | 'eletronica' | 'documento' | 'dispensada';
  motivoDispensa?: string;
  dataAssinatura?: string;
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
  docEntrega?: ModeloDocumento; // Fase 6: documento controlado da Qualidade
  docDevolucao?: ModeloDocumento;
}
