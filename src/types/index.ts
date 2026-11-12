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
}

/** Fase 8: arquivo ligado ao ativo (NF, orçamento, OS, laudo, foto, evidência de baixa) */
export type CategoriaAnexoAtivo = 'nota_fiscal' | 'orcamento' | 'os' | 'laudo' | 'foto' | 'evidencia_baixa' | 'outro';

export interface AnexoAtivo {
  id: string;
  ativoId: string;
  categoria: CategoriaAnexoAtivo;
  nome: string;
  caminho: string;
  tipo?: string;
  tamanho?: number;
  manutencaoId?: string;
  baixaId?: string;
  criadoPor?: string;
  criadoEm: string;
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

// -----------------------------------------------------------------------------
// Fase 8 · Manutenção e baixa patrimonial (só a T.I. lê; o colaborador vê só o status)
// -----------------------------------------------------------------------------
export type TipoManutencao = 'corretiva' | 'preventiva' | 'upgrade' | 'garantia';
export type StatusManutencao = 'em_andamento' | 'concluida' | 'cancelada';

export interface Manutencao {
  id: string;
  ativoId: string;
  tipo: TipoManutencao;
  descricao: string;
  numeroOs?: string;
  fornecedorId?: string; // vazio = feita pela própria T.I.
  contratoId?: string; // contrato que cobre o serviço
  chamadoId?: string; // chamado de origem
  abertaEm: string;
  previsao?: string;
  concluidaEm?: string;
  custo: number;
  cobertoGarantia: boolean;
  status: StatusManutencao;
  observacoes?: string;
  criadoPor?: string; // quem abriu (carimbado pelo banco)
  criadoEm: string;
  encerradoPor?: string; // quem concluiu ou cancelou
  encerradoEm?: string;
}

/** O que o formulário informa ao abrir ou registrar uma manutenção */
export type DadosManutencao = Pick<
  Manutencao,
  | 'tipo'
  | 'descricao'
  | 'numeroOs'
  | 'fornecedorId'
  | 'contratoId'
  | 'chamadoId'
  | 'abertaEm'
  | 'previsao'
  | 'custo'
  | 'cobertoGarantia'
  | 'observacoes'
>;

/** Conclusão ou cancelamento: data, custo final e observação (todos opcionais) */
export type DadosEncerramentoManutencao = Partial<Pick<Manutencao, 'concluidaEm' | 'custo' | 'observacoes'>>;

export type MotivoBaixa = 'obsoleto' | 'defeito' | 'perda' | 'roubo_furto' | 'sinistro' | 'devolucao_locadora' | 'outro';
export type DestinoBaixa = 'doacao' | 'venda' | 'descarte' | 'reciclagem' | 'devolucao_locadora' | 'nao_se_aplica';

export interface BaixaAtivo {
  id: string;
  ativoId: string;
  dataBaixa: string;
  motivo: MotivoBaixa;
  destino: DestinoBaixa;
  destinatario?: string;
  valorVenda?: number; // só quando o destino é venda
  documento?: string; // laudo, certificado de descarte, BO...
  observacoes?: string;
  criadoPor?: string; // quem registrou (carimbado pelo banco)
  criadoEm: string;
  estornadaEm?: string;
  estornadaPor?: string;
  motivoEstorno?: string;
}

export type DadosBaixa = Pick<
  BaixaAtivo,
  'dataBaixa' | 'motivo' | 'destino' | 'destinatario' | 'valorVenda' | 'documento' | 'observacoes'
>;

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
  observacoes?: string; // Fase 8
  fornecedorId?: string; // Fase 8: vínculo com o cadastro de fornecedores
  anexos?: AnexoAtivo[]; // Fase 8: só a TI recebe
  historicoCustodia: CustodyHistoryEntry[];
  historicoManutencao: Manutencao[]; // Fase 8: só a T.I. recebe
  baixas?: BaixaAtivo[]; // Fase 8: vigente e estornadas (só a T.I. recebe)
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
  fornecedorId?: string; // Fase 8: vínculo com o cadastro; `fornecedor` guarda o nome (texto)
}

// -----------------------------------------------------------------------------
// Fase 8 · Fornecedores, contratos e faturas (só a T.I. lê e grava)
// -----------------------------------------------------------------------------
export interface Fornecedor {
  id: string;
  nome: string;
  cnpj?: string;
  contato?: string;
  telefone?: string;
  email?: string;
  site?: string;
  observacoes?: string;
  ativo: boolean;
  criadoPor?: string;
  criadoEm: string;
}

export type TipoContrato = 'suporte' | 'garantia_estendida' | 'manutencao' | 'locacao' | 'licenciamento' | 'outro';
export type PeriodicidadeContrato = 'mensal' | 'anual' | 'unico';

/** O que o contrato cobre: um ativo OU uma licença (o banco confere) */
export type ItemContrato = { ativoId: string; licencaId?: never } | { licencaId: string; ativoId?: never };

export interface Contrato {
  id: string;
  fornecedorId: string;
  tipo: TipoContrato;
  numero?: string;
  descricao: string;
  inicio: string;
  fim?: string;
  valor: number;
  periodicidade: PeriodicidadeContrato;
  sla?: string;
  contatoSuporte?: string;
  arquivoCaminho?: string;
  observacoes?: string;
  itens: ItemContrato[];
  criadoPor?: string;
  criadoEm: string;
}

/** "Vencida" não é gravada: é calculada (a pagar com vencimento já passado) */
export type StatusFatura = 'a_pagar' | 'paga' | 'cancelada';

/** Fatura de uma licença OU de um contrato, por competência (1º dia do mês) */
export interface Fatura {
  id: string;
  licencaId?: string;
  contratoId?: string;
  competencia: string;
  valor: number;
  vencimento: string;
  pagoEm?: string;
  status: StatusFatura;
  numeroDocumento?: string;
  arquivoCaminho?: string;
  observacoes?: string;
  criadoPor?: string;
  criadoEm: string;
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
  ativoId?: string;
  contratoId?: string;
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
