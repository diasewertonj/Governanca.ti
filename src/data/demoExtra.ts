/**
 * Modo demonstração (sem Supabase): dados extras para a base parecer uma empresa
 * pequena/média (~45 pessoas, ~70 equipamentos, contratos, faturas, chamados e processos).
 * Datas pensadas para "hoje" = 19/11/2026 (garantias e contratos vencendo, faturas a vencer).
 * Os registros são montados a partir de listas-base curtas; `montarDemoExtra` recebe as
 * pessoas/setores/licenças da base original (initialData) para preencher nomes e cargos.
 */
import type {
  AguardandoMotivo,
  Asset,
  AssetCategory,
  AssetStatus,
  CausaChamado,
  Contrato,
  CustodyHistoryEntry,
  Department,
  Employee,
  Fatura,
  Fornecedor,
  GrupoDepreciacao,
  ItemEstoque,
  LinhaTelefonica,
  Manutencao,
  MotivoCancelamento,
  MovimentoEstoque,
  PedidoCompra,
  ResponsibilityTerm,
  SoftwareLicense,
  Ticket,
  TicketPriority,
  TicketStatus,
  TipoSolucao,
  UserRole,
} from '../types/index.ts';

const HOJE = '2026-11-19';
const somaMin = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60000).toISOString().replace('.000Z', 'Z');
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// -----------------------------------------------------------------------------
// Pessoas (emp-9 a emp-45). Desligadas: emp-17 (Diego) e emp-32 (Hugo).
// -----------------------------------------------------------------------------
type BasePessoa = [n: number, nome: string, cargo: string, setorId: string, gestorId: string, admissao: string, extra?: Partial<Employee>];

const PESSOAS: BasePessoa[] = [
  // Gestores de área
  [9, 'Ricardo Tavares Nogueira', 'Gerente Comercial', 'dep-4', '', '2022-04-11'],
  [10, 'Camila Ferreira Duarte', 'Gerente Financeira & Controladoria', 'dep-5', '', '2022-07-04'],
  [11, 'Sandra Regina Coutinho', 'Gerente de Gente & Gestão', 'dep-2', '', '2021-10-18', { role: 'rh' }],
  // Tecnologia da Informação
  [12, 'André Luiz Pacheco', 'Analista de Infraestrutura & Redes', 'dep-1', 'emp-1', '2025-02-03', { role: 'ti_suporte' }],
  [13, 'Vanessa Ribeiro Gomes', 'Analista de Segurança da Informação', 'dep-1', 'emp-1', '2024-09-09'],
  [14, 'Matheus Oliveira Cardoso', 'Estagiário de Suporte Técnico', 'dep-1', 'emp-7', '2026-03-02'],
  [44, 'Sabrina Lemos Arruda', 'Analista de Suporte N1', 'dep-1', 'emp-1', '2025-11-03', { role: 'ti_suporte' }],
  // Recursos Humanos
  [15, 'Renata Cristina Barros', 'Analista de Departamento Pessoal', 'dep-2', 'emp-11', '2023-08-14', { role: 'rh' }],
  [16, 'Paulo Sérgio Antunes', 'Analista de Recrutamento & Seleção', 'dep-2', 'emp-11', '2025-05-19', { role: 'rh' }],
  [42, 'Elaine Cristina Dutra', 'Recepcionista & Facilities', 'dep-2', 'emp-11', '2024-06-17'],
  // Engenharia de Software & Produto
  [17, 'Diego Almeida Pires', 'Desenvolvedor Back-end Pleno', 'dep-3', 'emp-4', '2024-02-19', { status: 'desligado' }],
  [18, 'Fernanda Costa Machado', 'Desenvolvedora Front-end Sênior', 'dep-3', 'emp-4', '2023-03-27'],
  [19, 'Gustavo Henrique Lacerda', 'Engenheiro DevOps', 'dep-3', 'emp-4', '2023-06-12'],
  [20, 'Aline Moura Bastos', 'Analista de Qualidade (QA)', 'dep-3', 'emp-4', '2024-04-22'],
  [21, 'Rodrigo Fagundes Lima', 'Tech Lead Mobile', 'dep-3', 'emp-4', '2022-11-07'],
  [22, 'Priscila Nunes Azevedo', 'Desenvolvedora Mobile Pleno', 'dep-3', 'emp-21', '2025-01-13'],
  [23, 'Eduardo Siqueira Batista', 'Desenvolvedor Back-end Sênior', 'dep-3', 'emp-4', '2023-09-04'],
  [24, 'Natália Freitas Coelho', 'Product Manager', 'dep-3', 'emp-4', '2024-07-01'],
  [25, 'Leonardo Dias Rezende', 'Desenvolvedor Júnior', 'dep-3', 'emp-23', '2025-09-15'],
  [45, 'Henrique Paiva Santana', 'Arquiteto de Soluções', 'dep-3', 'emp-4', '2022-08-08'],
  // Vendas & Negócios
  [26, 'Bruno Henrique Carvalho', 'Executivo de Contas', 'dep-4', 'emp-9', '2025-04-07'],
  [27, 'Tatiane Lopes Brandão', 'Executiva de Contas Sênior', 'dep-4', 'emp-9', '2023-02-06'],
  [28, 'Marcelo Augusto Viana', 'Engenheiro de Pré-vendas', 'dep-4', 'emp-9', '2024-05-13'],
  [29, 'Daniela Correia Prado', 'SDR (Pré-vendas)', 'dep-4', 'emp-9', '2025-08-04'],
  [30, 'Otávio Bezerra Melo', 'Customer Success Manager', 'dep-4', 'emp-9', '2024-01-22'],
  [31, 'Isabela Martins Quintela', 'Analista de Marketing', 'dep-4', 'emp-9', '2024-10-07', { status: 'ferias' }],
  [32, 'Hugo Fernandes Rocha', 'Executivo de Vendas', 'dep-4', 'emp-9', '2023-05-02', { status: 'desligado' }],
  // Financeiro & Controladoria (inclui Compras)
  [33, 'Gabriela Santos Moura', 'Analista Financeira', 'dep-5', 'emp-10', '2024-10-14'],
  [34, 'Sérgio Luiz Monteiro', 'Contador Sênior', 'dep-5', 'emp-10', '2022-03-14'],
  [35, 'Letícia Amaral Pinto', 'Analista de Contas a Pagar', 'dep-5', 'emp-10', '2025-03-10'],
  [36, 'Rogério Antunes Farias', 'Comprador Sênior', 'dep-5', 'emp-10', '2023-01-16', { role: 'compras' }],
  [37, 'Cláudia Helena Rios', 'Assistente Administrativa', 'dep-5', 'emp-10', '2025-06-02'],
  [43, 'Fábio Junqueira Paes', 'Analista de BI', 'dep-5', 'emp-10', '2025-07-21'],
  // Design & UX
  [38, 'Larissa Campos Vieira', 'Designer de Interfaces (UI)', 'dep-6', 'emp-6', '2025-01-20'],
  [39, 'Victor Hugo Sampaio', 'UX Researcher', 'dep-6', 'emp-6', '2024-08-26'],
  [40, 'Mirela Tavares Castro', 'Designer Gráfica', 'dep-6', 'emp-6', '2025-10-06'],
  [41, 'Caio Rangel Moreira', 'Motion Designer', 'dep-6', 'emp-6', '2024-03-11'],
];

const emailDe = (nome: string) => {
  const partes = semAcento(nome).split(' ');
  return `${partes[0]}.${partes[partes.length - 1]}@nexuscorp.com.br`;
};

export const EXTRA_EMPLOYEES: Employee[] = [...PESSOAS].sort((a, b) => a[0] - b[0]).map(([n, nome, cargo, setorId, gestorId, dataAdmissao, extra]): Employee => ({
  id: `emp-${n}`,
  matricula: `NX-${1000 + n}`,
  nome,
  email: emailDe(nome),
  cargo,
  setorId,
  ...(gestorId ? { gestorId } : {}),
  status: 'ativo',
  dataAdmissao,
  role: 'colaborador',
  telefone: `(11) 98765-${1000 + n}`,
  ...extra,
}));

// -----------------------------------------------------------------------------
// Licenças: novas pessoas nos assentos (assentosAlocados = pessoas na lista)
// -----------------------------------------------------------------------------
const ativosExtras = EXTRA_EMPLOYEES.filter((e) => e.status !== 'desligado').map((e) => e.id);
const ids = (...n: number[]) => n.map((x) => `emp-${x}`);

const LICENCAS_EXTRA: Record<string, { pessoas: string[]; total: number }> = {
  'lic-1': { pessoas: ['emp-8', ...ativosExtras], total: 45 },
  'lic-3': { pessoas: ids(24, 38, 39, 40, 41), total: 10 },
  'lic-4': { pessoas: ids(18, 19, 21, 22, 23, 25, 45), total: 10 },
  'lic-5': { pessoas: ids(9, 12, 13, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 38, 39, 45), total: 25 },
  'lic-6': { pessoas: ids(9, 26, 27, 30), total: 8 },
  'lic-7': { pessoas: ids(38, 40, 41), total: 6 },
  'lic-8': { pessoas: ids(9, 26, 27, 28, 29, 30), total: 8 },
  'lic-9': { pessoas: ids(10, 33, 34, 43), total: 6 },
  'lic-10': { pessoas: ids(12, 13, 19, 44), total: 10 },
  'lic-11': { pessoas: ids(18, 19, 21, 22, 23, 45), total: 12 },
};

export const ampliarLicencas = (lista: SoftwareLicense[]): SoftwareLicense[] =>
  lista.map((l) => {
    const extra = LICENCAS_EXTRA[l.id];
    if (!extra) return l;
    const colaboradoresIds = [...l.colaboradoresIds, ...extra.pessoas.filter((p) => !l.colaboradoresIds.includes(p))];
    return { ...l, colaboradoresIds, assentosAlocados: colaboradoresIds.length, assentosTotais: extra.total };
  });

// -----------------------------------------------------------------------------
// Fornecedores e contratos
// -----------------------------------------------------------------------------
const CRIADO = '2026-01-05T10:00:00Z';

export const EXTRA_FORNECEDORES: Fornecedor[] = [
  { id: 'forn-3', nome: 'Lenovo Tecnologia (Brasil) Ltda', contato: 'Lenovo Premier Support', telefone: '0800 047 4550', site: 'https://www.lenovo.com/br', ativo: true, criadoEm: CRIADO },
  { id: 'forn-4', nome: 'Telefônica Brasil S.A. (Vivo Empresas)', contato: 'Gerente de contas: Marcos Lima', telefone: '0800 770 8486', email: 'atendimento.empresas@vivo.com.br', site: 'https://www.vivo.com.br/empresas', ativo: true, criadoEm: CRIADO },
  { id: 'forn-5', nome: 'Algar Telecom S/A', contato: 'NOC Empresarial', telefone: '0800 941 4000', site: 'https://www.algartelecom.com.br', ativo: true, criadoEm: CRIADO },
  { id: 'forn-6', nome: 'Simpress Comércio, Locação e Serviços Ltda', contato: 'Central de Serviços', telefone: '0800 772 7200', site: 'https://www.simpress.com.br', observacoes: 'Locação de impressoras com toner incluso.', ativo: true, criadoEm: CRIADO },
  { id: 'forn-7', nome: 'Amazon Web Services Serviços Brasil Ltda', contato: 'Console de faturamento', site: 'https://aws.amazon.com/pt/', ativo: true, criadoEm: CRIADO },
  { id: 'forn-8', nome: 'Ingram Micro Brasil Ltda', contato: 'Revenda Fortinet / Cisco', telefone: '(11) 2078-4200', site: 'https://br.ingrammicro.com', ativo: true, criadoEm: CRIADO },
];

export const EXTRA_CONTRATOS: Contrato[] = [
  {
    id: 'ctr-2',
    fornecedorId: 'forn-4',
    tipo: 'telefonia_movel',
    numero: 'VIVO-EMP-447120',
    descricao: 'Plano corporativo Vivo Empresas: 10 linhas móveis de 20 GB',
    inicio: '2025-01-03',
    fim: '2027-01-02', // vence em ~45 dias
    valor: 620,
    periodicidade: 'mensal',
    sla: 'Troca de chip e portabilidade em até 48 h',
    contatoSuporte: '0800 770 8486',
    itens: [],
    criadoEm: CRIADO,
    status: 'ativo',
    pagamento: { formaPagamento: 'boleto', renovacaoAutomatica: false, avisoCancelamentoDias: 30 },
    multaCancelamento: 'Proporcional aos meses restantes da fidelidade de 24 meses',
    responsavelId: 'emp-1',
    categoriaDespesa: 'telefonia',
  },
  {
    id: 'ctr-3',
    fornecedorId: 'forn-3',
    tipo: 'garantia_estendida',
    numero: 'LNV-PS-2025-0193',
    descricao: 'Lenovo Premier Support: extensão de garantia on-site dos ThinkPad T14',
    inicio: '2025-07-01',
    fim: '2027-12-31',
    valor: 3800,
    periodicidade: 'unico',
    sla: 'Técnico no local no próximo dia útil',
    contatoSuporte: '0800 047 4550',
    itens: [{ ativoId: 'ast-7' }, { ativoId: 'ast-14' }, { ativoId: 'ast-27' }],
    criadoEm: '2025-07-01T10:00:00Z',
    status: 'ativo',
    responsavelId: 'emp-1',
    categoriaDespesa: 'hardware',
  },
  {
    id: 'ctr-4',
    fornecedorId: 'forn-5',
    tipo: 'internet',
    numero: 'ALG-LD-88412',
    descricao: 'Link dedicado de internet 500 Mbps com IP fixo (matriz)',
    inicio: '2024-03-01',
    fim: '2027-02-28',
    valor: 1890,
    periodicidade: 'mensal',
    sla: 'Disponibilidade de 99,5% e reparo em até 4 h',
    contatoSuporte: '0800 941 4000 (NOC)',
    itens: [],
    criadoEm: '2024-03-01T10:00:00Z',
    status: 'ativo',
    reajusteIndice: 'IGP-M',
    reajusteMes: 3,
    pagamento: { formaPagamento: 'boleto', renovacaoAutomatica: true, avisoCancelamentoDias: 60 },
    categoriaDespesa: 'internet',
    responsavelId: 'emp-12',
  },
  {
    id: 'ctr-5',
    fornecedorId: 'forn-6',
    tipo: 'locacao',
    numero: 'SMP-LOC-5521',
    descricao: 'Locação de 2 impressoras com toner e manutenção inclusos',
    inicio: '2024-12-01',
    fim: '2026-11-30', // vence em 11 dias
    valor: 690,
    periodicidade: 'mensal',
    sla: 'Atendimento técnico em até 8 h úteis',
    contatoSuporte: '0800 772 7200',
    observacoes: 'Renovação em negociação: proposta nova recebida em 10/11.',
    itens: [{ ativoId: 'ast-70' }, { ativoId: 'ast-71' }],
    criadoEm: '2024-12-01T10:00:00Z',
    status: 'ativo',
    categoriaDespesa: 'servicos',
    responsavelId: 'emp-12',
  },
  {
    id: 'ctr-6',
    fornecedorId: 'forn-7',
    tipo: 'nuvem',
    numero: 'AWS-ACC-5512-0098',
    descricao: 'Hospedagem do ambiente de produção (EC2, RDS e S3)',
    inicio: '2024-01-01',
    valor: 4300,
    periodicidade: 'mensal',
    contatoSuporte: 'AWS Business Support (console)',
    itens: [],
    criadoEm: '2024-01-01T10:00:00Z',
    status: 'ativo',
    pagamento: { moeda: 'USD', valorMoeda: 780, formaPagamento: 'cartao', cartaoFinal: '4471', titular: 'Nexus Tecnologia e Inovação S.A.', renovacaoAutomatica: true },
    categoriaDespesa: 'nuvem',
    responsavelId: 'emp-19',
  },
  {
    id: 'ctr-7',
    fornecedorId: 'forn-5',
    tipo: 'internet',
    numero: 'ALG-LB-40211',
    descricao: 'Link de backup 100 Mbps',
    inicio: '2023-03-01',
    fim: '2026-08-31',
    valor: 450,
    periodicidade: 'mensal',
    itens: [],
    criadoEm: '2023-03-01T10:00:00Z',
    status: 'encerrado',
    encerradoEm: '2026-08-31',
    encerradoPor: 'emp-1',
    encerramentoMotivo: 'Substituído pela contingência 4G configurada no firewall.',
    categoriaDespesa: 'internet',
  },
  {
    id: 'ctr-8',
    fornecedorId: 'forn-8',
    tipo: 'suporte',
    numero: 'FCT-60F-77310',
    descricao: 'FortiCare 24x7 e licença UTP do firewall FortiGate 60F',
    inicio: '2024-07-01',
    fim: '2027-06-30',
    valor: 5400,
    periodicidade: 'anual',
    sla: 'Troca do equipamento no próximo dia útil (RMA)',
    contatoSuporte: 'support.fortinet.com',
    itens: [{ ativoId: 'ast-74' }],
    criadoEm: '2024-07-01T10:00:00Z',
    status: 'ativo',
    categoriaDespesa: 'servicos',
    responsavelId: 'emp-12',
  },
];

// -----------------------------------------------------------------------------
// Faturas: últimos 6 meses e próximos 30 dias (vencida = a pagar com vencimento passado)
// -----------------------------------------------------------------------------
type BaseSerie = {
  ref: Pick<Fatura, 'contratoId' | 'licencaId'>;
  doc: string;
  meses: string[];
  valor: number | number[];
  dia: string;
  emAberto?: string[];
  extra?: Partial<Fatura>;
};

const SERIES: BaseSerie[] = [
  { ref: { contratoId: 'ctr-2' }, doc: 'VIVO', meses: ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'], valor: 620, dia: '12' },
  { ref: { contratoId: 'ctr-4' }, doc: 'ALG', meses: ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'], valor: 1890, dia: '22' },
  // Simpress: novembro ficou sem pagar (vencida)
  { ref: { contratoId: 'ctr-5' }, doc: 'SMP', meses: ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'], valor: 690, dia: '05', emAberto: ['2026-11'] },
  {
    ref: { contratoId: 'ctr-6' },
    doc: 'AWS',
    meses: ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'],
    valor: [4180, 4260, 4310, 4390, 4300],
    dia: '25',
    extra: { moeda: 'USD', valorMoeda: 780, formaPagamento: 'cartao' },
  },
  { ref: { licencaId: 'lic-5' }, doc: 'SLK', meses: ['2026-09', '2026-10', '2026-11'], valor: 780, dia: '28' },
  { ref: { licencaId: 'lic-8' }, doc: 'SF', meses: ['2026-10', '2026-11'], valor: 1350, dia: '15' },
  { ref: { contratoId: 'ctr-8' }, doc: 'FCT', meses: ['2026-07'], valor: 5400, dia: '10' },
];

const faturasDasSeries: Fatura[] = SERIES.flatMap((s) =>
  s.meses.map((mes, i): Fatura => {
    const vencimento = `${mes}-${s.dia}`;
    const paga = vencimento < HOJE && !s.emAberto?.includes(mes);
    return {
      id: '',
      ...s.ref,
      competencia: `${mes}-01`,
      valor: Array.isArray(s.valor) ? s.valor[i] : s.valor,
      vencimento,
      ...(paga ? { pagoEm: `${mes}-${String(Number(s.dia) - 2).padStart(2, '0')}` } : {}),
      status: paga ? ('paga' as const) : ('a_pagar' as const),
      numeroDocumento: `${s.doc}-${mes.replace('-', '')}`,
      criadoEm: `${mes}-01T10:00:00Z`,
      ...s.extra,
    };
  })
);

export const EXTRA_FATURAS: Fatura[] = [
  ...faturasDasSeries.map((f, i) => ({ ...f, id: `fat-${i + 3}` })),
  // Geradas pelos pedidos de compra (ver DEMO_PEDIDOS_EXTRA)
  {
    id: `fat-${faturasDasSeries.length + 3}`,
    pedidoId: 'ped-8',
    competencia: '2026-11-01',
    valor: 7800,
    vencimento: '2026-12-02',
    status: 'a_pagar',
    numeroDocumento: 'NF 010245',
    formaPagamento: 'boleto',
    criadoEm: '2026-11-14T15:00:00Z',
  },
  {
    id: `fat-${faturasDasSeries.length + 4}`,
    pedidoId: 'ped-9',
    competencia: '2026-10-01',
    valor: 4350,
    vencimento: '2026-10-25',
    pagoEm: '2026-10-24',
    status: 'paga',
    numeroDocumento: 'NF 009871',
    formaPagamento: 'boleto',
    criadoEm: '2026-10-15T15:00:00Z',
  },
];
const FATURA_PED_8 = EXTRA_FATURAS[EXTRA_FATURAS.length - 2].id;
const FATURA_PED_9 = EXTRA_FATURAS[EXTRA_FATURAS.length - 1].id;

// -----------------------------------------------------------------------------
// Equipamentos (ast-9 em diante). Terceiro campo: 'emp-X' = custodiante; 'dep-X' = setor (sem custodiante)
// -----------------------------------------------------------------------------
interface Modelo {
  nome: string;
  categoria: AssetCategory;
  marca: string;
  modelo: string;
  valor: number;
  fornecedor: string;
  suporte: string;
  serial: string;
  so?: string;
  cf?: Record<string, string>;
  grupo?: GrupoDepreciacao;
}

const DELL = 'Dell Computadores do Brasil Ltda';
const LENOVO = 'Lenovo Tecnologia (Brasil) Ltda';
const APPLE = 'Apple Computer Brasil Ltda';
const VIVO = 'Telefônica Brasil S.A. (Vivo Empresas)';
const SIMPRESS = 'Simpress Comércio, Locação e Serviços Ltda';
const INGRAM = 'Ingram Micro Brasil Ltda';

const MODELOS = {
  lat5440: { nome: 'Notebook Dell Latitude 5440', categoria: 'hardware', marca: 'Dell Technologies', modelo: 'Latitude 5440 Intel Core i7-1355U', valor: 7150, fornecedor: DELL, suporte: '0800 970 3355 (ProSupport)', serial: 'BR5440', so: 'Windows 11 Pro 64-bit', cf: { processador: 'Intel Core i7-1355U (10 Cores)', memoriaRam: '16', armazenamento: '512GB NVMe SSD' } },
  lat3440: { nome: 'Notebook Dell Latitude 3440', categoria: 'hardware', marca: 'Dell Technologies', modelo: 'Latitude 3440 Intel Core i5-1335U', valor: 4350, fornecedor: DELL, suporte: '0800 970 3355', serial: 'BR3440', so: 'Windows 11 Pro 64-bit', cf: { processador: 'Intel Core i5-1335U', memoriaRam: '16', armazenamento: '256GB SSD' } },
  tpe14: { nome: 'Notebook Lenovo ThinkPad E14 Gen 5', categoria: 'hardware', marca: 'Lenovo', modelo: 'ThinkPad E14 Gen 5 Intel Core i5-1335U', valor: 5480, fornecedor: LENOVO, suporte: '0800 047 4550', serial: 'PF4E', so: 'Windows 11 Pro 64-bit', cf: { processador: 'Intel Core i5-1335U', memoriaRam: '16', armazenamento: '512GB SSD' } },
  tpt14: { nome: 'Notebook Lenovo ThinkPad T14 Gen 4', categoria: 'hardware', marca: 'Lenovo', modelo: 'ThinkPad T14 AMD Ryzen 7 PRO 7840U', valor: 7200, fornecedor: LENOVO, suporte: '0800 047 4550', serial: 'PF4T', so: 'Windows 11 Pro 64-bit', cf: { processador: 'AMD Ryzen 7 PRO 7840U', memoriaRam: '32', armazenamento: '1TB NVMe SSD' } },
  hp440: { nome: 'Notebook HP ProBook 440 G8', categoria: 'hardware', marca: 'HP Inc.', modelo: 'ProBook 440 G8 Intel Core i5-1135G7', valor: 4900, fornecedor: 'HP Brasil Indústria e Comércio de Equipamentos Eletrônicos Ltda', suporte: '0800 709 7751', serial: '5CD1', so: 'Windows 11 Pro 64-bit', cf: { processador: 'Intel Core i5-1135G7', memoriaRam: '8', armazenamento: '256GB SSD' } },
  mbp14: { nome: 'MacBook Pro 14" M3 Pro', categoria: 'hardware', marca: 'Apple', modelo: 'MacBook Pro 14 (M3 Pro, 18 GB)', valor: 17900, fornecedor: APPLE, suporte: '0800 761 0880 (AppleCare)', serial: 'C02X', so: 'macOS Sequoia 15', cf: { processador: 'Apple Silicon M3 Pro', memoriaRam: '18', armazenamento: '512GB SSD' } },
  mba13: { nome: 'MacBook Air 13" M2', categoria: 'hardware', marca: 'Apple', modelo: 'MacBook Air 13 (M2, 16 GB)', valor: 9800, fornecedor: APPLE, suporte: '0800 761 0880', serial: 'C02Y', so: 'macOS Sequoia 15', cf: { processador: 'Apple Silicon M2', memoriaRam: '16', armazenamento: '512GB SSD' } },
  optiplex: { nome: 'Desktop Dell OptiPlex 7010 Micro', categoria: 'hardware', marca: 'Dell Technologies', modelo: 'OptiPlex 7010 Micro Intel Core i5-13500T', valor: 5200, fornecedor: DELL, suporte: '0800 970 3355', serial: 'BR7010', so: 'Windows 11 Pro 64-bit', cf: { processador: 'Intel Core i5-13500T', memoriaRam: '16', armazenamento: '512GB SSD' } },
  precision: { nome: 'Workstation Dell Precision 3660', categoria: 'hardware', marca: 'Dell Technologies', modelo: 'Precision 3660 Tower Intel Core i9-13900', valor: 14900, fornecedor: DELL, suporte: '0800 970 3355 (ProSupport)', serial: 'BR3660', so: 'Windows 11 Pro for Workstations', cf: { processador: 'Intel Core i9-13900 (24 Cores)', memoriaRam: '64', armazenamento: '2TB NVMe SSD' } },
  mon24: { nome: 'Monitor Dell 24" P2422H', categoria: 'hardware', marca: 'Dell Technologies', modelo: 'P2422H Full HD IPS', valor: 1100, fornecedor: DELL, suporte: '0800 970 3355', serial: 'CN0P24', grupo: 'perifericos' },
  mon27: { nome: 'Monitor LG UltraFine 27" 4K', categoria: 'hardware', marca: 'LG Electronics', modelo: '27UP850-W 4K USB-C', valor: 2600, fornecedor: 'Kabum Comércio Eletrônico S/A', suporte: '4004 5400 (LG)', serial: '308NT', grupo: 'perifericos' },
  iph15: { nome: 'iPhone 15 Corporativo 128GB', categoria: 'telefonia', marca: 'Apple', modelo: 'iPhone 15 Black 128GB (MDM)', valor: 4999, fornecedor: VIVO, suporte: '0800 761 0880', serial: 'F2LX' },
  iph13: { nome: 'iPhone 13 Corporativo 128GB', categoria: 'telefonia', marca: 'Apple', modelo: 'iPhone 13 Midnight 128GB (MDM)', valor: 3600, fornecedor: VIVO, suporte: '0800 761 0880', serial: 'F2LQ' },
  galaxyS23: { nome: 'Samsung Galaxy S23 FE 128GB', categoria: 'telefonia', marca: 'Samsung', modelo: 'SM-S711B 128GB (Knox)', valor: 2799, fornecedor: VIVO, suporte: '0800 555 0000 (Samsung)', serial: 'R5CW' },
  galaxyA54: { nome: 'Samsung Galaxy A54 5G 128GB', categoria: 'telefonia', marca: 'Samsung', modelo: 'SM-A546E 128GB (Knox)', valor: 1899, fornecedor: VIVO, suporte: '0800 555 0000 (Samsung)', serial: 'R5CT' },
  ipad: { nome: 'Tablet iPad 10ª geração 64GB', categoria: 'hardware', marca: 'Apple', modelo: 'iPad 10th gen Wi-Fi 64GB', valor: 3299, fornecedor: APPLE, suporte: '0800 761 0880', serial: 'DMPX', so: 'iPadOS 18' },
  tabS9: { nome: 'Tablet Samsung Galaxy Tab S9 FE', categoria: 'hardware', marca: 'Samsung', modelo: 'SM-X510 Wi-Fi 128GB', valor: 2999, fornecedor: 'Samsung Eletrônica da Amazônia Ltda', suporte: '0800 555 0000', serial: 'R52W', so: 'Android 14' },
  hpMfp: { nome: 'Impressora Multifuncional HP LaserJet Pro M428fdw', categoria: 'hardware', marca: 'HP Inc.', modelo: 'LaserJet Pro MFP M428fdw', valor: 0, fornecedor: SIMPRESS, suporte: '0800 772 7200 (Simpress)', serial: 'BRBSN', grupo: 'nao_deprecia' },
  brother: { nome: 'Impressora Brother HL-L5102DW', categoria: 'hardware', marca: 'Brother', modelo: 'HL-L5102DW Laser Mono', valor: 0, fornecedor: SIMPRESS, suporte: '0800 772 7200 (Simpress)', serial: 'E7N4', grupo: 'nao_deprecia' },
  switch: { nome: 'Switch Cisco Catalyst 1000 24 portas PoE+', categoria: 'hardware', marca: 'Cisco', modelo: 'C1000-24P-4G-L', valor: 6900, fornecedor: INGRAM, suporte: 'Cisco TAC via Ingram Micro', serial: 'FOC2', grupo: 'servidores' },
  ap: { nome: 'Access Point Ubiquiti UniFi U6 Pro', categoria: 'hardware', marca: 'Ubiquiti', modelo: 'U6-Pro Wi-Fi 6', valor: 1450, fornecedor: 'Kabum Comércio Eletrônico S/A', suporte: 'help.ui.com', serial: '7483C2', grupo: 'servidores' },
  fw: { nome: 'Firewall Fortinet FortiGate 60F', categoria: 'hardware', marca: 'Fortinet', modelo: 'FG-60F', valor: 8900, fornecedor: INGRAM, suporte: 'FortiCare 24x7 (support.fortinet.com)', serial: 'FGT60F', grupo: 'servidores' },
} satisfies Record<string, Modelo>;

interface OpcoesAtivo {
  local?: string;
  linha?: string;
  pedidoId?: string;
  observacoes?: string;
  /** Quem teve o equipamento antes (já devolvido) */
  anterior?: { id: string; entrega: string; devolucao: string; motivo: string };
  manutencao?: Omit<Manutencao, 'id' | 'ativoId' | 'criadoEm' | 'status'>;
}

type BaseAtivo = [n: number, modelo: keyof typeof MODELOS, quem: string, status: AssetStatus, aquisicao: string, garantia: string, opcoes?: OpcoesAtivo];

const ESCRITORIO = 'São Paulo - Escritório Central 14º Andar';
const ALMOXARIFADO = 'Almoxarifado T.I. - Armário B3';
const CAMPINAS = 'Campinas - Home Office (Caio Moreira)';

const ATIVOS: BaseAtivo[] = [
  // Computadores em uso
  [9, 'lat5440', 'emp-1', 'em_uso', '2025-02-10', '2028-02-10'],
  [10, 'lat5440', 'emp-7', 'em_uso', '2024-06-03', '2027-06-03'],
  [11, 'tpe14', 'emp-2', 'em_uso', '2023-12-09', '2026-12-09'], // garantia vence em 20 dias
  [12, 'lat3440', 'emp-8', 'em_uso', '2024-08-12', '2027-08-12'],
  [13, 'precision', 'emp-4', 'em_uso', '2025-01-10', '2028-01-10', { local: `${ESCRITORIO} (mesa fixa da Engenharia)` }],
  [14, 'tpt14', 'emp-12', 'manutencao', '2023-06-30', '2026-06-30', {
    local: 'Em reparo - Lenovo Premier Support',
    manutencao: { tipo: 'garantia', descricao: 'Troca do teclado e do touchpad pela garantia estendida Lenovo', numeroOs: 'LNV-OS-552190', fornecedorId: 'forn-3', contratoId: 'ctr-3', chamadoId: 'tkt-7', abertaEm: '2026-11-12', previsao: '2026-11-26', custo: 0, cobertoGarantia: true, criadoPor: 'emp-7' },
  }],
  [15, 'lat5440', 'emp-13', 'em_uso', '2024-09-05', '2027-09-05'],
  [16, 'lat3440', 'emp-14', 'em_uso', '2026-02-25', '2027-02-25'],
  [17, 'tpe14', 'emp-44', 'em_uso', '2025-10-28', '2028-10-28'],
  [18, 'hp440', 'emp-11', 'em_uso', '2022-08-20', '2025-08-20'], // garantia vencida
  [19, 'hp440', 'emp-15', 'em_uso', '2023-08-01', '2026-08-01'], // garantia vencida
  [20, 'lat3440', 'emp-16', 'em_uso', '2025-05-12', '2028-05-12'],
  [21, 'lat3440', 'emp-42', 'em_uso', '2024-06-10', '2027-06-10'],
  [22, 'mbp14', 'emp-18', 'em_uso', '2023-03-20', '2026-03-20'], // garantia vencida
  [23, 'lat5440', 'emp-19', 'em_uso', '2023-12-05', '2026-12-05'], // vence em 16 dias
  [24, 'lat5440', 'emp-20', 'em_uso', '2024-04-15', '2027-04-15'],
  [25, 'mbp14', 'emp-21', 'em_uso', '2024-11-04', '2027-11-04'],
  [26, 'mbp14', 'emp-22', 'em_uso', '2025-01-08', '2028-01-08'],
  [27, 'tpt14', 'emp-23', 'em_uso', '2023-09-01', '2026-09-01'], // coberto pelo contrato Lenovo (ctr-3)
  [28, 'lat5440', 'emp-24', 'em_uso', '2024-06-25', '2027-06-25'],
  [29, 'lat3440', 'emp-25', 'em_uso', '2025-09-10', '2028-09-10'],
  [30, 'tpt14', 'emp-45', 'em_uso', '2022-08-01', '2025-08-01'], // garantia vencida
  [31, 'lat5440', 'emp-26', 'em_uso', '2025-04-01', '2028-04-01'],
  [32, 'lat3440', 'emp-27', 'em_uso', '2024-01-30', '2027-01-30'],
  [33, 'lat3440', 'emp-28', 'em_uso', '2024-05-06', '2027-05-06'],
  [34, 'lat3440', 'emp-29', 'em_uso', '2025-07-28', '2028-07-28'],
  [35, 'lat5440', 'emp-30', 'em_uso', '2024-01-15', '2027-01-15'],
  [36, 'mba13', 'emp-31', 'em_uso', '2024-10-01', '2025-10-01'], // garantia vencida
  [37, 'hp440', 'emp-33', 'em_uso', '2024-10-07', '2027-10-07'],
  [38, 'optiplex', 'emp-34', 'em_uso', '2022-03-07', '2025-03-07'], // garantia vencida
  [39, 'lat3440', 'emp-35', 'em_uso', '2025-03-03', '2028-03-03'],
  [40, 'lat3440', 'emp-36', 'em_uso', '2023-12-18', '2026-12-18'], // vence em 29 dias
  [41, 'optiplex', 'emp-37', 'em_uso', '2025-05-26', '2028-05-26'],
  [42, 'lat5440', 'emp-43', 'em_uso', '2025-07-14', '2028-07-14'],
  [43, 'mbp14', 'emp-38', 'em_uso', '2025-01-13', '2028-01-13'],
  [44, 'mba13', 'emp-39', 'em_uso', '2024-08-19', '2027-08-19'],
  [45, 'mbp14', 'emp-40', 'em_uso', '2025-09-29', '2028-09-29'],
  [46, 'mbp14', 'emp-41', 'em_uso', '2024-03-04', '2027-03-04', { local: CAMPINAS }],
  [47, 'lat5440', 'emp-9', 'manutencao', '2022-04-04', '2025-04-04', {
    local: 'Em reparo - assistência Dell',
    manutencao: { tipo: 'corretiva', descricao: 'Substituição da bateria estufada (fora da garantia)', numeroOs: 'DELL-SR-1180452', fornecedorId: 'forn-1', chamadoId: 'tkt-12', abertaEm: '2026-11-13', previsao: '2026-11-21', custo: 650, cobertoGarantia: false, criadoPor: 'emp-12' },
  }],
  [48, 'hp440', 'emp-10', 'em_uso', '2022-07-01', '2025-07-01'], // garantia vencida
  // Computadores no estoque / devolvidos
  [49, 'lat3440', 'dep-1', 'disponivel', '2026-10-15', '2029-10-15', { pedidoId: 'ped-9', observacoes: 'Reservado para a admissão do Vinícius Lopes (Financeiro).' }],
  [50, 'tpe14', 'dep-1', 'disponivel', '2024-02-14', '2027-02-14', {
    anterior: { id: 'emp-17', entrega: '2024-02-19', devolucao: '2026-09-30', motivo: 'Desligamento do colaborador. Formatado e pronto para reuso.' },
  }],
  [51, 'lat5440', 'dep-1', 'manutencao', '2023-04-25', '2026-04-25', {
    local: 'Bancada T.I. - avaliação',
    anterior: { id: 'emp-32', entrega: '2023-05-02', devolucao: '2026-10-31', motivo: 'Desligamento. Devolvido com tela riscada e dobradiça solta.' },
    manutencao: { tipo: 'corretiva', descricao: 'Avaliação após devolução: tela riscada e dobradiça esquerda solta', abertaEm: '2026-11-03', previsao: '2026-11-28', custo: 0, cobertoGarantia: false, criadoPor: 'emp-7' },
  }],
  // Monitores
  [52, 'mon27', 'emp-38', 'em_uso', '2025-01-13', '2028-01-13'],
  [53, 'mon27', 'emp-18', 'em_uso', '2023-03-20', '2026-03-20'],
  [54, 'mon24', 'emp-19', 'em_uso', '2023-06-05', '2026-06-05'],
  [55, 'mon24', 'emp-23', 'em_uso', '2023-09-01', '2026-09-01'],
  [56, 'mon24', 'emp-33', 'em_uso', '2024-10-07', '2027-10-07'],
  [57, 'mon24', 'dep-1', 'disponivel', '2026-10-15', '2029-10-15'],
  [58, 'mon27', 'emp-4', 'em_uso', '2025-01-10', '2028-01-10'],
  [59, 'mon24', 'emp-41', 'em_uso', '2024-03-04', '2027-03-04', { local: CAMPINAS }],
  // Celulares
  [60, 'iph15', 'emp-9', 'em_uso', '2024-09-20', '2025-09-20', { linha: '(11) 99000-0001' }],
  [61, 'galaxyS23', 'emp-26', 'em_uso', '2025-04-01', '2027-04-01', { linha: '(11) 99000-0002' }],
  [62, 'galaxyS23', 'emp-27', 'em_uso', '2024-12-02', '2026-12-02', { linha: '(11) 99000-0004' }], // vence em 13 dias
  [63, 'galaxyA54', 'emp-29', 'em_uso', '2025-07-28', '2027-07-28', { linha: '(11) 99000-0005' }],
  [64, 'iph13', 'emp-30', 'em_uso', '2024-01-15', '2025-01-15', { linha: '(11) 99000-0006' }],
  [65, 'iph15', 'emp-1', 'em_uso', '2025-02-10', '2027-02-10', { linha: '(11) 99000-0007' }],
  [66, 'galaxyA54', 'emp-10', 'em_uso', '2024-07-01', '2026-07-01', { linha: '(11) 99000-0008' }],
  [67, 'galaxyA54', 'dep-1', 'disponivel', '2023-05-02', '2025-05-02', {
    anterior: { id: 'emp-32', entrega: '2023-05-02', devolucao: '2026-10-31', motivo: 'Desligamento. Restaurado de fábrica e removido do Knox.' },
  }],
  // Tablets
  [68, 'ipad', 'emp-28', 'em_uso', '2024-05-06', '2027-05-06', { observacoes: 'Usado em demonstrações para clientes.' }],
  [69, 'tabS9', 'dep-1', 'disponivel', '2025-11-10', '2026-11-10'],
  // Impressoras (locadas) e rede
  [70, 'hpMfp', 'dep-5', 'em_uso', '2024-12-01', '2026-11-30', { local: `${ESCRITORIO} - Ilha do Financeiro`, observacoes: 'Equipamento locado (contrato Simpress SMP-LOC-5521).' }],
  [71, 'brother', 'dep-2', 'em_uso', '2024-12-01', '2026-11-30', { local: `${ESCRITORIO} - Recursos Humanos`, observacoes: 'Equipamento locado (contrato Simpress SMP-LOC-5521).' }],
  [72, 'switch', 'dep-1', 'em_uso', '2024-01-10', '2029-01-10', { local: 'Rack do CPD - 14º Andar' }],
  [73, 'ap', 'dep-1', 'em_uso', '2024-01-10', '2026-01-10', { local: 'Sala de reunião 14B (teto)' }],
  [74, 'fw', 'dep-1', 'em_uso', '2024-01-10', '2026-12-30', { local: 'Rack do CPD - 14º Andar', observacoes: 'Coberto pelo FortiCare (ctr-8) até 30/06/2027.' }],
];

// Termos: quem tem equipamento recebe termo de entrega; 6 ainda pendentes de assinatura
const TERMO_PENDENTE = new Set(ids(9, 14, 22, 29, 38, 40));
const SEM_TERMO = new Set(['emp-1', 'emp-4']); // lacuna proposital: equipamento sem termo

// -----------------------------------------------------------------------------
// Estoque de acessórios, movimentos e linhas (RecursosContext)
// -----------------------------------------------------------------------------
const ALMOX_B2 = 'Almoxarifado T.I. - Armário B2';
export const DEMO_ESTOQUE_EXTRA: ItemEstoque[] = [
  { id: 'est-5', nome: 'Mouse sem fio Logitech M280', tipo: 'mouse', marca: 'Logitech', modelo: 'M280', quantidade: 9, minimo: 4, localizacao: ALMOX_B2, valorUnitario: 79, ativo: true },
  { id: 'est-6', nome: 'Teclado sem fio Logitech K270', tipo: 'teclado', marca: 'Logitech', modelo: 'K270', quantidade: 2, minimo: 3, localizacao: ALMOX_B2, valorUnitario: 139, ativo: true },
  { id: 'est-7', nome: 'Headset USB Jabra Evolve2 30', tipo: 'headset', marca: 'Jabra', modelo: 'Evolve2 30 UC', quantidade: 4, minimo: 3, localizacao: ALMOX_B2, valorUnitario: 420, ativo: true },
  { id: 'est-8', nome: 'Headset Bluetooth Logitech Zone Vibe 100', tipo: 'headset', marca: 'Logitech', modelo: 'Zone Vibe 100', quantidade: 1, minimo: 2, localizacao: ALMOX_B2, valorUnitario: 590, ativo: true },
  { id: 'est-9', nome: 'Cabo USB-C para USB-C 2 m (100 W)', tipo: 'cabo', quantidade: 15, minimo: 5, localizacao: ALMOX_B2, valorUnitario: 59, ativo: true },
  { id: 'est-10', nome: 'Cabo de rede Cat6 2,5 m', tipo: 'cabo', quantidade: 30, minimo: 10, localizacao: 'Rack do CPD - gaveta', valorUnitario: 18, ativo: true },
  { id: 'est-11', nome: 'Adaptador USB-C para HDMI', tipo: 'adaptador', quantidade: 3, minimo: 4, localizacao: ALMOX_B2, valorUnitario: 89, ativo: true },
  { id: 'est-12', nome: 'Hub USB-C multiportas (HDMI, USB, RJ45)', tipo: 'adaptador', marca: 'Baseus', quantidade: 5, minimo: 2, localizacao: ALMOX_B2, valorUnitario: 249, ativo: true },
  { id: 'est-13', nome: 'Webcam Logitech C920 Full HD', tipo: 'webcam', marca: 'Logitech', modelo: 'C920', quantidade: 2, minimo: 2, localizacao: ALMOX_B2, valorUnitario: 399, ativo: true },
  { id: 'est-14', nome: 'Carregador USB-C 65 W Dell', tipo: 'carregador', marca: 'Dell', quantidade: 4, minimo: 2, localizacao: ALMOX_B2, fornecedorId: 'forn-1', valorUnitario: 289, ativo: true },
  { id: 'est-15', nome: 'Carregador MagSafe 3 70 W Apple', tipo: 'carregador', marca: 'Apple', quantidade: 0, minimo: 1, localizacao: ALMOX_B2, valorUnitario: 549, ativo: true },
  { id: 'est-16', nome: 'Carregador de celular USB-C 25 W Samsung', tipo: 'carregador', marca: 'Samsung', quantidade: 6, minimo: 2, localizacao: ALMOX_B2, valorUnitario: 99, ativo: true },
  { id: 'est-17', nome: 'Suporte ergonômico para notebook', tipo: 'outro', quantidade: 7, minimo: 2, localizacao: 'Almoxarifado T.I. - Prateleira 3', valorUnitario: 129, ativo: true },
  { id: 'est-18', nome: 'Mochila para notebook 15,6"', tipo: 'outro', quantidade: 5, minimo: 3, localizacao: 'Almoxarifado T.I. - Prateleira 3', valorUnitario: 189, ativo: true },
];

export const DEMO_MOVIMENTOS: MovimentoEstoque[] = [
  { id: 'mov-1', itemId: 'est-9', tipo: 'entrada', quantidade: 20, motivo: 'Compra NF 88120 (Kabum)', criadoPor: 'emp-7', criadoEm: '2026-09-15T14:00:00Z' },
  { id: 'mov-2', itemId: 'est-5', tipo: 'saida', quantidade: 1, colaboradorId: 'emp-29', motivo: 'Troca de mouse com defeito', criadoPor: 'emp-44', criadoEm: '2026-10-14T10:20:00Z' },
  { id: 'mov-3', itemId: 'est-11', tipo: 'saida', quantidade: 1, colaboradorId: 'emp-30', motivo: 'Apresentações em clientes', criadoPor: 'emp-44', criadoEm: '2026-10-21T09:05:00Z' },
  { id: 'mov-4', itemId: 'est-13', tipo: 'saida', quantidade: 1, colaboradorId: 'emp-16', chamadoId: 'tkt-21', motivo: 'Webcam substituta', criadoPor: 'emp-44', criadoEm: '2026-10-30T16:40:00Z' },
  { id: 'mov-5', itemId: 'est-16', tipo: 'devolucao', quantidade: 1, colaboradorId: 'emp-32', motivo: 'Devolução no desligamento', criadoPor: 'emp-7', criadoEm: '2026-10-31T17:10:00Z' },
  { id: 'mov-6', itemId: 'est-8', tipo: 'saida', quantidade: 1, colaboradorId: 'emp-27', motivo: 'Headset para calls com clientes', criadoPor: 'emp-7', criadoEm: '2026-11-04T11:00:00Z' },
  { id: 'mov-7', itemId: 'est-6', tipo: 'ajuste', quantidade: -1, motivo: 'Conferência: teclado com defeito descartado', criadoPor: 'emp-7', criadoEm: '2026-11-10T15:30:00Z' },
  { id: 'mov-8', itemId: 'est-15', tipo: 'saida', quantidade: 1, colaboradorId: 'emp-21', motivo: 'Carregador original com cabo danificado', criadoPor: 'emp-44', criadoEm: '2026-11-16T10:15:00Z' },
];

const linhaMovel = (n: number, numero: string, colaboradorId?: string, ativoId?: string, extra: Partial<LinhaTelefonica> = {}): LinhaTelefonica => ({
  id: `lin-${n}`,
  numero,
  tipo: 'movel',
  contratoId: 'ctr-2',
  plano: '20 GB',
  ...(colaboradorId ? { colaboradorId } : {}),
  ...(ativoId ? { ativoId } : {}),
  status: 'ativa',
  valorMensal: 62,
  criadoEm: '2025-01-10T12:00:00Z',
  ...extra,
});

export const DEMO_LINHAS: LinhaTelefonica[] = [
  linhaMovel(1, '(11) 99000-0001', 'emp-9', 'ast-60'),
  linhaMovel(2, '(11) 99000-0002', 'emp-26', 'ast-61'),
  linhaMovel(3, '(11) 98111-4050', 'emp-5', 'ast-6', { plano: 'Ilimitado Corp', valorMensal: 89 }),
  linhaMovel(4, '(11) 99000-0004', 'emp-27', 'ast-62'),
  linhaMovel(5, '(11) 99000-0005', 'emp-29', 'ast-63'),
  linhaMovel(6, '(11) 99000-0006', 'emp-30', 'ast-64'),
  linhaMovel(7, '(11) 99000-0007', 'emp-1', 'ast-65', { observacoes: 'Linha de plantão da T.I.' }),
  linhaMovel(8, '(11) 99000-0008', 'emp-10', 'ast-66'),
  linhaMovel(9, '(11) 99000-0009', undefined, undefined, { status: 'suspensa', observacoes: 'Era do Hugo Rocha (desligado em 31/10). Cancelar se não houver novo uso até 30/11.' }),
  {
    id: 'lin-10',
    numero: '(11) 3280-4000',
    tipo: 'fixa',
    plano: 'Tronco SIP 30 canais (PABX)',
    status: 'ativa',
    valorMensal: 380,
    centroCusto: 'Tecnologia da Informação',
    observacoes: 'Número principal da empresa (recepção e ramais).',
    criadoEm: '2024-03-01T12:00:00Z',
  },
];

// -----------------------------------------------------------------------------
// Pedidos de compra extras (ComprasContext)
// -----------------------------------------------------------------------------
export const DEMO_PEDIDOS_EXTRA: PedidoCompra[] = [
  {
    id: 'ped-7',
    codigo: 'PC-2026-0007',
    titulo: 'MacBook Pro para nova desenvolvedora (Amanda Rangel)',
    justificativa: 'Admissão em 07/12; não há MacBook disponível no estoque.',
    categoria: 'hardware',
    area: 'Engenharia de Software & Produto',
    status: 'aguardando',
    tipoPedido: 'ti',
    solicitanteId: 'emp-4',
    gestorId: 'emp-1',
    chamadoId: 'tkt-34',
    necessarioEm: '2026-12-04',
    criadoEm: '2026-11-17T10:00:00Z',
    itens: [{ id: 'pit-7', tipo: 'equipamento', descricao: 'MacBook Pro 14" M4 Pro 24 GB', categoriaAtivo: 'hardware', marca: 'Apple', modelo: 'MacBook Pro 14 M4 Pro', quantidade: 1, valorUnitario: 19900, ordem: 1 }],
    cotacoes: [
      { id: 'cot-7', itemId: 'pit-7', fornecedorId: '', loja: 'Apple Store Business', link: 'https://www.apple.com/br/business/', marca: 'Apple', modelo: 'MacBook Pro 14 M4 Pro', valor: 19900, prazoDias: 7, vencedora: true },
      { id: 'cot-8', itemId: 'pit-7', fornecedorId: '', loja: 'Kabum', link: 'https://www.kabum.com.br', marca: 'Apple', modelo: 'MacBook Pro 14 M4 Pro', valor: 20450, prazoDias: 3, vencedora: false },
    ],
    eventos: [
      { para: 'rascunho', por: 'emp-4', em: '2026-11-17T10:00:00Z' },
      { de: 'rascunho', para: 'em_cotacao', por: 'emp-4', em: '2026-11-17T10:05:00Z' },
      { de: 'em_cotacao', para: 'aguardando', por: 'emp-7', motivo: 'Cotação concluída; aguardando aprovação.', em: '2026-11-18T09:30:00Z' },
    ],
  },
  {
    id: 'ped-8',
    codigo: 'PC-2026-0008',
    titulo: 'Monitores 27" 4K para o time de Design',
    justificativa: 'Revisão de cor e protótipos em alta resolução.',
    categoria: 'hardware',
    area: 'Design & UX',
    status: 'comprado',
    tipoPedido: 'ti',
    solicitanteId: 'emp-6',
    gestorId: 'emp-4',
    aprovadoGestorPor: 'emp-4',
    aprovadoGestorEm: '2026-11-10T14:00:00Z',
    aprovadoPor: 'emp-8',
    aprovadoEm: '2026-11-11T10:00:00Z',
    lojaCompra: 'Kabum',
    linkCompra: 'https://www.kabum.com.br',
    numeroNf: '010245',
    dataCompra: '2026-11-14',
    vencimento: '2026-12-02',
    formaPagamento: 'boleto',
    valorFinal: 7800,
    faturaId: FATURA_PED_8,
    criadoEm: '2026-11-06T09:00:00Z',
    itens: [{ id: 'pit-8', tipo: 'equipamento', descricao: 'Monitor LG UltraFine 27" 4K', categoriaAtivo: 'hardware', marca: 'LG Electronics', modelo: '27UP850-W', quantidade: 3, valorUnitario: 2600, ordem: 1 }],
    cotacoes: [{ id: 'cot-9', itemId: 'pit-8', fornecedorId: '', loja: 'Kabum', marca: 'LG Electronics', modelo: '27UP850-W', valor: 2600, prazoDias: 6, vencedora: true }],
    eventos: [
      { para: 'em_cotacao', por: 'emp-6', em: '2026-11-06T09:00:00Z' },
      { de: 'em_cotacao', para: 'aguardando', por: 'emp-7', em: '2026-11-09T11:00:00Z' },
      { de: 'aguardando', para: 'aprovado', por: 'emp-8', em: '2026-11-11T10:00:00Z' },
      { de: 'aprovado', para: 'comprado', por: 'emp-8', motivo: 'NF 010245', em: '2026-11-14T15:00:00Z' },
    ],
  },
  {
    id: 'ped-9',
    codigo: 'PC-2026-0009',
    titulo: 'Notebook para reposição do estoque',
    justificativa: 'Estoque sem notebook Windows para novas admissões.',
    categoria: 'hardware',
    area: 'Tecnologia da Informação',
    status: 'recebido',
    tipoPedido: 'ti',
    solicitanteId: 'emp-7',
    gestorId: 'emp-1',
    aprovadoGestorPor: 'emp-1',
    aprovadoGestorEm: '2026-10-08T10:00:00Z',
    aprovadoPor: 'emp-36',
    aprovadoEm: '2026-10-09T10:00:00Z',
    fornecedorId: 'forn-1',
    numeroNf: '009871',
    dataCompra: '2026-10-15',
    vencimento: '2026-10-25',
    formaPagamento: 'boleto',
    valorFinal: 4350,
    faturaId: FATURA_PED_9,
    recebidoPor: 'emp-7',
    recebidoEm: '2026-10-20T14:00:00Z',
    criadoEm: '2026-10-06T09:00:00Z',
    itens: [{ id: 'pit-9', tipo: 'equipamento', descricao: 'Notebook Dell Latitude 3440 i5 16 GB', categoriaAtivo: 'hardware', marca: 'Dell Technologies', modelo: 'Latitude 3440', quantidade: 1, valorUnitario: 4350, ordem: 1 }],
    cotacoes: [{ id: 'cot-10', itemId: 'pit-9', fornecedorId: 'forn-1', marca: 'Dell', modelo: 'Latitude 3440', valor: 4350, prazoDias: 5, vencedora: true }],
    eventos: [
      { para: 'em_cotacao', por: 'emp-7', em: '2026-10-06T09:00:00Z' },
      { de: 'em_cotacao', para: 'aguardando', por: 'emp-7', em: '2026-10-07T16:00:00Z' },
      { de: 'aguardando', para: 'aprovado', por: 'emp-36', em: '2026-10-09T10:00:00Z' },
      { de: 'aprovado', para: 'comprado', por: 'emp-36', motivo: 'NF 009871', em: '2026-10-15T15:00:00Z' },
      { de: 'comprado', para: 'recebido', por: 'emp-7', motivo: 'Patrimônio #PAT-1149', em: '2026-10-20T14:00:00Z' },
    ],
  },
  {
    id: 'ped-10',
    codigo: 'PC-2026-0010',
    titulo: 'Cadeira gamer para home office',
    justificativa: 'Cadeira atual causa dor nas costas.',
    categoria: 'outros',
    area: 'Engenharia de Software & Produto',
    status: 'recusado',
    tipoPedido: 'outros',
    solicitanteId: 'emp-25',
    gestorId: 'emp-23',
    motivo: 'Fora da política de mobiliário: usar o auxílio home office (RH).',
    criadoEm: '2026-11-03T13:00:00Z',
    itens: [{ id: 'pit-10', tipo: 'servico', descricao: 'Cadeira gamer reclinável', quantidade: 1, valorReferencia: 1490, ordem: 1 }],
    cotacoes: [],
    eventos: [
      { para: 'em_cotacao', por: 'emp-25', em: '2026-11-03T13:00:00Z' },
      { de: 'em_cotacao', para: 'recusado', por: 'emp-36', motivo: 'Fora da política de mobiliário: usar o auxílio home office (RH).', em: '2026-11-05T10:00:00Z' },
    ],
  },
];

// -----------------------------------------------------------------------------
// Chamados de suporte (tkt-4 a tkt-32)
// -----------------------------------------------------------------------------
interface BaseChamado {
  n: number;
  de: string;
  titulo: string;
  categoria: string;
  prioridade: TicketPriority;
  status: TicketStatus;
  tecnico?: string;
  em: string;
  descricao: string;
  ativoId?: string;
  softwareId?: string;
  resposta?: string;
  resolucao?: { causa: CausaChamado; solucao: string; min: number; tipo?: TipoSolucao; proximoPasso?: string };
  aguardando?: AguardandoMotivo;
  nota?: number;
  cancelamento?: MotivoCancelamento;
}

const CHAMADOS: BaseChamado[] = [
  { n: 4, de: 'emp-10', titulo: 'Sem acesso à VPN: equipe do Financeiro inteira fora', categoria: 'Rede / VPN', prioridade: 'critica', status: 'aberto', em: '2026-11-19T08:42:00Z',
    descricao: 'Desde as 8h ninguém do Financeiro conecta na VPN (erro "falha na autenticação"). Hoje é dia de fechamento e precisamos do ERP.' },
  { n: 5, de: 'emp-33', titulo: 'Notebook lento ao abrir planilhas grandes no Excel', categoria: 'Hardware / Desempenho', prioridade: 'media', status: 'em_andamento', tecnico: 'emp-7', em: '2026-11-17T09:10:00Z', ativoId: 'ast-37',
    descricao: 'Planilhas de conciliação com mais de 50 mil linhas demoram minutos para abrir e o Excel trava.',
    resposta: 'Oi Gabriela! O uso de memória está em 95%. Vou agendar a troca do pente de memória para 16 GB.' },
  { n: 6, de: 'emp-39', titulo: 'Acesso ao Adobe Creative Cloud para editar vídeos de pesquisa', categoria: 'Software / Licença', prioridade: 'media', status: 'em_andamento', tecnico: 'emp-1', em: '2026-11-14T13:00:00Z', softwareId: 'lic-7',
    descricao: 'Preciso do Premiere para editar as gravações das entrevistas com usuários.',
    resposta: 'Victor, há 1 assento livre do Adobe. Estou confirmando com a Beatriz antes de liberar.' },
  { n: 7, de: 'emp-12', titulo: 'ThinkPad T14 com teclas falhando e touchpad sem resposta', categoria: 'Hardware', prioridade: 'alta', status: 'aguardando_terceiro', tecnico: 'emp-7', em: '2026-11-11T08:30:00Z', ativoId: 'ast-14', aguardando: 'fornecedor',
    descricao: 'Várias teclas da linha do meio não respondem e o touchpad parou. Já reiniciei e atualizei drivers.',
    resposta: 'André, abrimos a OS LNV-OS-552190 na garantia estendida Lenovo. Técnico previsto até 26/11.' },
  { n: 8, de: 'emp-26', titulo: 'Celular não sincroniza o e-mail corporativo', categoria: 'Telefonia / Mobile', prioridade: 'baixa', status: 'aguardando_terceiro', tecnico: 'emp-44', em: '2026-11-13T15:20:00Z', ativoId: 'ast-61', aguardando: 'solicitante',
    descricao: 'O Outlook do Galaxy parou de receber e-mails desde ontem.',
    resposta: 'Bruno, preciso que você aceite o novo perfil do Knox no celular. Me avise quando puder fazer comigo.' },
  { n: 9, de: 'emp-42', titulo: 'Impressora do RH não imprime pela rede', categoria: 'Impressão', prioridade: 'media', status: 'resolvido', tecnico: 'emp-12', em: '2026-11-04T09:00:00Z', ativoId: 'ast-71', nota: 5,
    descricao: 'A impressora Brother aparece offline para todos do RH.',
    resposta: 'Elaine, a impressora pegou outro IP depois da queda de energia. Já estou ajustando.',
    resolucao: { causa: 'rede', solucao: 'Reserva de IP fixo no DHCP e fila de impressão recriada nos computadores do RH.', min: 35 } },
  { n: 10, de: 'emp-6', titulo: 'Conta bloqueada após troca de senha', categoria: 'Acesso / Conta', prioridade: 'alta', status: 'resolvido', tecnico: 'emp-7', em: '2026-11-06T10:15:00Z', nota: 4,
    descricao: 'Troquei a senha e agora a conta bloqueia sozinha a cada 10 minutos.',
    resposta: 'Beatriz, o celular estava tentando logar com a senha antiga. Vou te ligar.',
    resolucao: { causa: 'acesso', solucao: 'Senha antiga removida do celular e do Mac; conta desbloqueada no Entra ID.', min: 15 } },
  { n: 11, de: 'emp-3', titulo: 'Instalar Docker Desktop e WSL2', categoria: 'Software / Instalação', prioridade: 'baixa', status: 'resolvido', tecnico: 'emp-7', em: '2026-10-29T14:00:00Z', ativoId: 'ast-1', nota: 5,
    descricao: 'Preciso do Docker Desktop com WSL2 para o novo projeto.',
    resposta: 'Lucas, vou instalar remotamente às 16h.',
    resolucao: { causa: 'software', solucao: 'Docker Desktop instalado via Intune e WSL2 habilitado com Ubuntu 24.04.', min: 40 } },
  { n: 12, de: 'emp-9', titulo: 'Notebook com bateria estufada', categoria: 'Hardware', prioridade: 'alta', status: 'em_andamento', tecnico: 'emp-12', em: '2026-11-12T11:00:00Z', ativoId: 'ast-47',
    descricao: 'O touchpad está levantando e o notebook não fecha direito. Parece a bateria.',
    resposta: 'Ricardo, é a bateria estufada: pare de usar agora. Enviamos para a assistência Dell (fora da garantia).' },
  { n: 13, de: 'emp-27', titulo: 'Salesforce não abre pelo login único (SSO)', categoria: 'Software / SaaS', prioridade: 'alta', status: 'resolvido', tecnico: 'emp-12', em: '2026-11-10T08:50:00Z', softwareId: 'lic-8', nota: 4,
    descricao: 'Ao entrar no Salesforce pelo login da Microsoft aparece "usuário não provisionado".',
    resposta: 'Tatiane, o certificado do SSO venceu ontem. Já estou renovando.',
    resolucao: { causa: 'configuracao', solucao: 'Certificado SAML renovado no Entra ID e no Salesforce.', min: 25, proximoPasso: 'Lembrete de renovação criado para 2027.' } },
  { n: 14, de: 'emp-19', titulo: 'Pedido de segundo monitor', categoria: 'Hardware / Periférico', prioridade: 'baixa', status: 'aberto', em: '2026-11-18T16:30:00Z',
    descricao: 'Gostaria de um segundo monitor para acompanhar os painéis de observabilidade.' },
  { n: 15, de: 'emp-18', titulo: 'MacBook não carrega pela porta USB-C direita', categoria: 'Hardware', prioridade: 'media', status: 'aberto', tecnico: 'emp-44', em: '2026-11-18T09:40:00Z', ativoId: 'ast-22',
    descricao: 'Só carrega pela porta esquerda. A direita não reconhece nem o carregador nem o monitor.' },
  { n: 16, de: 'emp-30', titulo: 'Zoom travando em reuniões com clientes', categoria: 'Software', prioridade: 'media', status: 'em_andamento', tecnico: 'emp-44', em: '2026-11-16T14:10:00Z', softwareId: 'lic-6',
    descricao: 'O vídeo congela depois de uns 20 minutos de reunião.',
    resposta: 'Otávio, atualizei o Zoom. Pode testar na próxima reunião e me contar?' },
  { n: 17, de: 'emp-35', titulo: 'Acesso à pasta Contas a Pagar no SharePoint', categoria: 'Acesso / Permissão', prioridade: 'media', status: 'resolvido', tecnico: 'emp-44', em: '2026-11-03T10:00:00Z', nota: 5,
    descricao: 'Preciso de acesso de edição à pasta Contas a Pagar.',
    resposta: 'Letícia, a Camila aprovou. Liberando agora.',
    resolucao: { causa: 'acesso', solucao: 'Incluída no grupo FIN-ContasPagar (edição) com aprovação da gestora.', min: 10 } },
  { n: 18, de: 'emp-29', titulo: 'Wi-Fi caindo na sala de reunião 14B', categoria: 'Rede / Wi-Fi', prioridade: 'alta', status: 'em_andamento', tecnico: 'emp-12', em: '2026-11-17T11:20:00Z', ativoId: 'ast-73',
    descricao: 'Em reuniões com mais de 8 pessoas o Wi-Fi da 14B cai para todo mundo.',
    resposta: 'Daniela, o access point está no limite de clientes. Vou ajustar o canal e avaliar um segundo AP.' },
  { n: 19, de: 'emp-34', titulo: 'Desktop desligando sozinho', categoria: 'Hardware', prioridade: 'alta', status: 'aguardando_terceiro', tecnico: 'emp-7', em: '2026-11-10T09:00:00Z', ativoId: 'ast-38', aguardando: 'peca',
    descricao: 'O OptiPlex desliga sozinho umas três vezes por dia.',
    resposta: 'Sérgio, é a fonte. O equipamento está fora da garantia; a peça foi pedida e chega em até 7 dias.' },
  { n: 20, de: 'emp-24', titulo: 'Licença do Figma para a Product Manager', categoria: 'Software / Licença', prioridade: 'baixa', status: 'resolvido', tecnico: 'emp-1', em: '2026-10-22T10:00:00Z', softwareId: 'lic-3', nota: 5,
    descricao: 'Preciso comentar e editar os protótipos do time de Design.',
    resposta: 'Natália, liberei o assento de editor.',
    resolucao: { causa: 'acesso', solucao: 'Assento de editor do Figma atribuído.', min: 5 } },
  { n: 21, de: 'emp-16', titulo: 'Webcam não reconhecida no Teams', categoria: 'Periférico', prioridade: 'baixa', status: 'resolvido', tecnico: 'emp-44', em: '2026-10-30T15:00:00Z', nota: 4,
    descricao: 'A webcam externa não aparece no Teams nem no app Câmera.',
    resposta: 'Paulo, a webcam queimou. Vou te entregar uma do estoque.',
    resolucao: { causa: 'hardware', solucao: 'Webcam trocada por uma Logitech C920 do estoque.', min: 20 } },
  { n: 22, de: 'emp-13', titulo: 'Alerta de phishing recebido por vários colaboradores', categoria: 'Segurança', prioridade: 'alta', status: 'resolvido', tecnico: 'emp-1', em: '2026-11-07T08:15:00Z', nota: 5,
    descricao: 'Pelo menos 12 pessoas receberam um e-mail falso de "atualização de folha de pagamento".',
    resposta: 'Vanessa, obrigado pelo alerta. Bloqueando o domínio e removendo as mensagens das caixas.',
    resolucao: { causa: 'outro', solucao: 'Domínio bloqueado, mensagens removidas de todas as caixas e senhas de 2 pessoas que clicaram foram trocadas.', min: 90, proximoPasso: 'Campanha de conscientização em dezembro.' } },
  { n: 23, de: 'emp-31', titulo: 'Configurar e-mail no celular pessoal durante as férias', categoria: 'Telefonia / Mobile', prioridade: 'baixa', status: 'cancelado', tecnico: 'emp-44', em: '2026-11-05T12:00:00Z', cancelamento: 'sem_retorno',
    descricao: 'Quero acompanhar os e-mails pelo meu celular durante as férias.',
    resposta: 'Isabela, preciso que você instale o Portal da Empresa. Me avise quando puder.' },
  { n: 24, de: 'emp-21', titulo: 'Build do app iOS falhando no Xcode após atualização do macOS', categoria: 'Software', prioridade: 'media', status: 'em_andamento', tecnico: 'emp-7', em: '2026-11-18T10:00:00Z', ativoId: 'ast-25',
    descricao: 'Depois da atualização o Xcode não encontra o certificado de assinatura.',
    resposta: 'Rodrigo, vou reinstalar o certificado de desenvolvedor pelo MDM.' },
  { n: 25, de: 'emp-37', titulo: 'Toner da impressora do Financeiro acabando', categoria: 'Impressão', prioridade: 'baixa', status: 'aguardando_terceiro', tecnico: 'emp-12', em: '2026-11-14T09:30:00Z', ativoId: 'ast-70', aguardando: 'fornecedor',
    descricao: 'A impressora avisa que o toner está em 5%.',
    resposta: 'Cláudia, pedimos o toner à Simpress (incluso no contrato). Entrega prevista para 21/11.' },
  { n: 26, de: 'emp-45', titulo: 'Tela do ThinkPad piscando', categoria: 'Hardware', prioridade: 'media', status: 'aberto', em: '2026-11-19T10:05:00Z', ativoId: 'ast-30',
    descricao: 'A tela pisca quando abro mais de 90 graus. O notebook já está fora da garantia.' },
  { n: 27, de: 'emp-28', titulo: 'iPad não espelha a tela na TV da sala de reunião', categoria: 'Hardware / Periférico', prioridade: 'baixa', status: 'resolvido', tecnico: 'emp-44', em: '2026-11-11T13:00:00Z', ativoId: 'ast-68', nota: 5,
    descricao: 'O AirPlay não encontra a TV da sala 14A.',
    resposta: 'Marcelo, a TV estava na rede de visitantes. Ajustando.',
    resolucao: { causa: 'configuracao', solucao: 'TV movida para a rede corporativa e AirPlay liberado.', min: 15 } },
  { n: 28, de: 'emp-2', titulo: 'Criar grupo de e-mail para o time de Recrutamento', categoria: 'Acesso / E-mail', prioridade: 'media', status: 'resolvido', tecnico: 'emp-7', em: '2026-11-05T11:00:00Z', nota: 5,
    descricao: 'Precisamos do grupo recrutamento@nexuscorp.com.br com Patrícia, Paulo e Sandra.',
    resposta: 'Patrícia, grupo criado. Pode testar?',
    resolucao: { causa: 'acesso', solucao: 'Grupo recrutamento@nexuscorp.com.br criado com 3 membros.', min: 10 } },
  { n: 29, de: 'emp-25', titulo: 'Sem acesso ao repositório do GitHub', categoria: 'Acesso', prioridade: 'media', status: 'aberto', tecnico: 'emp-7', em: '2026-11-19T09:30:00Z', softwareId: 'lic-11',
    descricao: 'Recebo 404 ao abrir o repositório da API. Acho que não fui incluído na organização.' },
  { n: 30, de: 'emp-43', titulo: 'Power BI não atualiza o painel de custos', categoria: 'Software / SaaS', prioridade: 'media', status: 'aguardando_terceiro', tecnico: 'emp-1', em: '2026-11-12T10:00:00Z', softwareId: 'lic-9', aguardando: 'fornecedor',
    descricao: 'A atualização agendada falha toda madrugada com erro de gateway.',
    resposta: 'Fábio, abrimos chamado na Microsoft (caso 2611120040012). Aguardando retorno.' },
  { n: 31, de: 'emp-20', titulo: 'Monitor externo com listras na tela', categoria: 'Hardware', prioridade: 'media', status: 'em_andamento', tecnico: 'emp-44', em: '2026-11-15T14:00:00Z',
    descricao: 'O monitor da mesa compartilhada 14-D03 mostra listras verticais.',
    resposta: 'Aline, vou trocar o cabo e, se continuar, substituir o monitor.' },
  { n: 32, de: 'emp-14', titulo: 'Solicitação de acesso de administrador local', categoria: 'Acesso', prioridade: 'baixa', status: 'resolvido', tecnico: 'emp-1', em: '2026-10-27T09:00:00Z', nota: 3,
    descricao: 'Preciso instalar ferramentas de diagnóstico no notebook.',
    resposta: 'Matheus, não liberamos admin local; vou instalar as ferramentas pelo Intune.',
    resolucao: { causa: 'uso', solucao: 'Acesso de administrador negado pela política; ferramentas instaladas via Intune.', min: 10 } },
];

// -----------------------------------------------------------------------------
// Montagem (precisa das pessoas, setores e licenças da base)
// -----------------------------------------------------------------------------
export function montarDemoExtra(base: { pessoas: Employee[]; setores: Department[]; licencas: SoftwareLicense[] }) {
  const todas = [...base.pessoas, ...EXTRA_EMPLOYEES];
  const pessoa = (id: string): Employee => {
    const p = todas.find((e) => e.id === id);
    if (!p) throw new Error(`Dados de demonstração: pessoa ${id} não existe`);
    return p;
  };
  const setorNome = (id: string) => base.setores.find((d) => d.id === id)?.nome || '';
  const licNome = (id: string) => base.licencas.find((l) => l.id === id)?.nome || '';
  const primeiroUltimo = (nome: string) => {
    const p = nome.split(' ');
    return `${p[0]} ${p[p.length - 1]}`;
  };

  // --- Termos de entrega: um por pessoa com equipamento (ordem de aparição)
  const custodiantes: string[] = [];
  for (const [, , quem] of ATIVOS) {
    if (quem.startsWith('emp-') && !custodiantes.includes(quem) && !SEM_TERMO.has(quem)) custodiantes.push(quem);
  }
  const termoDe = new Map(custodiantes.map((c, i) => [c, `tr-${i + 3}`]));
  const termoDevolucao = { 'emp-17': `tr-${custodiantes.length + 3}`, 'emp-32': `tr-${custodiantes.length + 4}` } as Record<string, string>;

  // --- Equipamentos
  const assets: Asset[] = ATIVOS.map(([n, chave, quem, status, aquisicao, garantia, op = {}]): Asset => {
    const m: Modelo = MODELOS[chave];
    const id = `ast-${n}`;
    const custodiante = quem.startsWith('emp-') ? pessoa(quem) : undefined;
    const entrega = custodiante ? (custodiante.dataAdmissao > aquisicao ? custodiante.dataAdmissao : aquisicao) : undefined;
    const nf = String(7000 + n * 13);
    const [aa, mm] = [aquisicao.slice(2, 4), aquisicao.slice(5, 7)];
    const historicoCustodia: CustodyHistoryEntry[] = [];
    if (op.anterior) {
      historicoCustodia.push({
        id: `cust-x${n}-a`,
        colaboradorId: op.anterior.id,
        colaboradorNome: pessoa(op.anterior.id).nome,
        dataEntrega: op.anterior.entrega,
        dataDevolucao: op.anterior.devolucao,
        motivoDevolucao: op.anterior.motivo,
        termoId: termoDevolucao[op.anterior.id],
      });
    }
    if (custodiante && entrega) {
      const termoId = termoDe.get(custodiante.id);
      historicoCustodia.push({
        id: `cust-x${n}`,
        colaboradorId: custodiante.id,
        colaboradorNome: custodiante.nome,
        dataEntrega: entrega,
        ...(termoId ? { termoId } : {}),
      });
    }
    const historicoManutencao: Manutencao[] = op.manutencao
      ? [{ ...op.manutencao, id: `man-x${n}`, ativoId: id, status: 'em_andamento', criadoEm: `${op.manutencao.abertaEm}T10:00:00Z` }]
      : [];
    const cf: Record<string, string> = { ...(m.cf || {}), ...(op.linha ? { numeroLinha: op.linha } : {}) };
    const local = op.local || (custodiante ? `${ESCRITORIO} (${primeiroUltimo(custodiante.nome)})` : ALMOXARIFADO);
    return {
      id,
      tag: `#PAT-${1100 + n}`,
      nome: m.nome,
      categoria: m.categoria,
      marca: m.marca,
      modelo: m.modelo,
      serialNumber: `${m.serial}${String((n * 7919) % 100000).padStart(5, '0')}`,
      localizacaoFisica: local,
      setorId: custodiante ? custodiante.setorId : quem,
      ...(custodiante ? { custodianteId: custodiante.id, dataEntregaAtual: entrega } : {}),
      status,
      fiscal: {
        numeroNF: nf.padStart(6, '0'),
        chaveAcesso44: `35${aa}${mm}1234567800019055001${nf.padStart(9, '0')}1${String(n * 104729).padStart(8, '0').slice(-8)}${n % 10}`,
        valorCompra: m.valor,
        fornecedor: m.fornecedor,
        dataAquisicao: aquisicao,
        dataGarantia: garantia,
        suporteContato: m.suporte,
      },
      ...(m.so ? { sistemaOperacional: m.so } : {}),
      customFields: cf,
      ...(op.observacoes ? { observacoes: op.observacoes } : {}),
      ...(op.pedidoId ? { pedidoId: op.pedidoId } : {}),
      ...(m.grupo ? { grupoDepreciacao: m.grupo } : {}),
      historicoCustodia,
      historicoManutencao,
    };
  });

  // --- Termos (entrega por pessoa + devoluções dos desligados)
  const ativosDe = (empId: string) => assets.filter((a) => a.custodianteId === empId);
  const ti = pessoa('emp-1');
  // Código por ano (#TR-AAAA-0101...), sem colidir com os termos da base (0012, 0028)
  const seqAno = new Map<string, number>();
  const codigoTermo = (data: string) => {
    const ano = data.slice(0, 4);
    const k = (seqAno.get(ano) || 100) + 1;
    seqAno.set(ano, k);
    return `#TR-${ano}-${String(k).padStart(4, '0')}`;
  };
  const termoBase = (id: string, codigo: string, p: Employee) => ({
    id,
    codigo,
    colaboradorId: p.id,
    colaboradorNome: p.nome,
    colaboradorMatricula: p.matricula,
    colaboradorCargo: p.cargo,
    colaboradorSetorNome: setorNome(p.setorId),
    responsavelTIId: ti.id,
    responsavelTINome: ti.nome,
  });
  const terms: ResponsibilityTerm[] = custodiantes.map((empId, i): ResponsibilityTerm => {
    const p = pessoa(empId);
    const seus = ativosDe(empId);
    const primeiraEntrega = seus.map((a) => a.dataEntregaAtual || '').sort()[0];
    const pendente = TERMO_PENDENTE.has(empId);
    const dataEmissao = pendente ? `2026-11-${String(10 + (i % 8)).padStart(2, '0')}` : primeiraEntrega;
    const codigo = codigoTermo(dataEmissao);
    return {
      ...termoBase(termoDe.get(empId) as string, codigo, p),
      tipo: 'entrega',
      ativoIds: seus.map((a) => a.id),
      dataEmissao,
      ...(pendente
        ? {
            statusAssinatura: 'gerado' as const,
            formaAssinatura: 'pendente' as const,
            observacoes: 'Termo reemitido no modelo novo da Qualidade; aguardando o aceite do colaborador.',
          }
        : {
            statusAssinatura: 'assinado' as const,
            arquivoAssinadoUrl: `https://cdn.nexuscorp.com.br/termos/${codigo.slice(1)}-assinado.pdf`,
          }),
    };
  });
  for (const [empId, devolucao] of [['emp-17', '2026-09-30'], ['emp-32', '2026-10-31']] as const) {
    const p = pessoa(empId);
    const codigo = codigoTermo(devolucao);
    terms.push({
      ...termoBase(termoDevolucao[empId], codigo, p),
      tipo: 'devolucao',
      ativoIds: assets.filter((a) => a.historicoCustodia.some((h) => h.colaboradorId === empId && h.dataDevolucao)).map((a) => a.id),
      dataEmissao: devolucao,
      statusAssinatura: 'assinado',
      arquivoAssinadoUrl: `https://cdn.nexuscorp.com.br/termos/${codigo.slice(1)}-assinado.pdf`,
      observacoes: 'Devolução no desligamento, conferida pela T.I.',
    });
  }

  // --- Chamados de suporte
  const codigoChamado = (n: number) => `#CH-2026-${String(88 + n).padStart(3, '0')}`;
  const solicitante = (p: Employee) => ({
    solicitanteId: p.id,
    solicitanteNome: p.nome,
    solicitanteEmail: p.email,
    solicitanteCargo: p.cargo,
    solicitanteSetorNome: setorNome(p.setorId),
  });
  const papel = (p: Employee): UserRole => p.role || 'colaborador';

  const suporte: Ticket[] = CHAMADOS.map((b): Ticket => {
    const p = pessoa(b.de);
    const tec = b.tecnico ? pessoa(b.tecnico) : undefined;
    const respostaEm = tec && b.resposta ? somaMin(b.em, 35) : undefined;
    const fimEm = b.resolucao ? somaMin(b.em, b.resolucao.min + 180) : b.cancelamento ? somaMin(b.em, 3 * 24 * 60) : undefined;
    return {
      id: `tkt-${b.n}`,
      codigo: codigoChamado(b.n),
      tipo: 'suporte',
      ...solicitante(p),
      ...(b.ativoId ? { ativoId: b.ativoId } : {}),
      ...(b.softwareId ? { softwareId: b.softwareId, softwareNome: licNome(b.softwareId) } : {}),
      titulo: b.titulo,
      categoria: b.categoria,
      prioridade: b.prioridade,
      status: b.status,
      ...(tec ? { tecnicoResponsavelId: tec.id, tecnicoResponsavelNome: tec.nome } : {}),
      dataCriacao: b.em,
      dataAtualizacao: fimEm || respostaEm || b.em,
      ...(b.resolucao ? { dataResolucao: fimEm } : {}),
      descricao: b.descricao,
      anexos: [],
      mensagens:
        tec && b.resposta && respostaEm
          ? [{ id: `msg-x${b.n}`, autorId: tec.id, autorNome: tec.nome, autorRole: papel(tec), texto: b.resposta, ehNotaInterna: false, data: respostaEm }]
          : [],
      ...(respostaEm ? { primeiraRespostaEm: respostaEm } : {}),
      ...(b.resolucao
        ? {
            resolucao: {
              causa: b.resolucao.causa,
              solucao: b.resolucao.solucao,
              tipo: b.resolucao.tipo || 'definitiva',
              tempoMin: b.resolucao.min,
              ...(b.resolucao.proximoPasso ? { proximoPasso: b.resolucao.proximoPasso } : {}),
              resolvidoPor: tec?.id,
              resolvidoEm: fimEm,
            },
          }
        : {}),
      ...(b.aguardando ? { aguardandoMotivo: b.aguardando } : {}),
      ...(b.nota ? { avaliacao: { nota: b.nota } } : {}),
      ...(b.cancelamento ? { cancelamento: { motivo: b.cancelamento, canceladoPor: tec?.id } } : {}),
    };
  });

  // --- Processos: 2 admissões e 2 desligamentos em aberto + 1 desligamento concluído
  const rh = pessoa('emp-15');
  const msgRh = (id: string, texto: string, data: string) => ({ id, autorId: rh.id, autorNome: rh.nome, autorRole: papel(rh), texto, ehNotaInterna: false, data });
  const processos: Ticket[] = [
    {
      id: 'tkt-33',
      codigo: codigoChamado(33),
      tipo: 'onboarding',
      ...solicitante(rh),
      titulo: 'Admissão: Analista de Planejamento Financeiro (Vinícius Araújo Lopes)',
      categoria: 'Onboarding de Colaborador',
      prioridade: 'alta',
      status: 'aberto',
      tecnicoResponsavelId: 'emp-7',
      tecnicoResponsavelNome: pessoa('emp-7').nome,
      dataCriacao: '2026-11-18T11:20:00Z',
      dataAtualizacao: '2026-11-18T11:20:00Z',
      descricao: 'Admissão aprovada para o Financeiro. Início em 30/11. Preparar notebook, periféricos e acessos.',
      anexos: [],
      mensagens: [msgRh('msg-onb-33', 'Ele vai sentar na mesa 14-F07, ao lado da Gabriela. A Camila é a gestora.', '2026-11-18T11:25:00Z')],
      onboarding: {
        nomeColaborador: 'Vinícius Araújo Lopes',
        emailColaborador: 'vinicius.lopes@nexuscorp.com.br',
        cargo: 'Analista de Planejamento Financeiro (FP&A)',
        setorId: 'dep-5',
        gestorId: 'emp-10',
        dataAdmissao: '2026-11-30',
        papelAcessoSugerido: 'colaborador',
        tipoComputador: 'Notebook padrão (i5, 16 GB) com dois monitores',
        perifericos: ['Monitor 24"', 'Kit teclado e mouse sem fio', 'Headset USB'],
        acessosSoftwares: ['Microsoft 365 E5 Enterprise', 'Microsoft Power BI Pro', 'Slack Business+'],
        gruposEmail: ['financeiro@nexuscorp.com.br', 'todos@nexuscorp.com.br'],
        observacoes: 'Trabalho presencial. Notebook #PAT-1149 já reservado no estoque.',
      },
    },
    {
      id: 'tkt-34',
      codigo: codigoChamado(34),
      tipo: 'onboarding',
      ...solicitante(rh),
      titulo: 'Admissão: Desenvolvedora Back-end Pleno (Amanda Vieira Rangel)',
      categoria: 'Onboarding de Colaborador',
      prioridade: 'media',
      status: 'aberto',
      dataCriacao: '2026-11-16T15:00:00Z',
      dataAtualizacao: '2026-11-16T15:00:00Z',
      descricao: 'Vaga de reposição na Engenharia. Início em 07/12, modelo híbrido.',
      anexos: [],
      mensagens: [msgRh('msg-onb-34', 'A Mariana pediu MacBook Pro; já abriu o pedido de compra PC-2026-0007.', '2026-11-16T15:05:00Z')],
      onboarding: {
        nomeColaborador: 'Amanda Vieira Rangel',
        emailColaborador: 'amanda.rangel@nexuscorp.com.br',
        cargo: 'Desenvolvedora Back-end Pleno',
        setorId: 'dep-3',
        gestorId: 'emp-4',
        dataAdmissao: '2026-12-07',
        papelAcessoSugerido: 'colaborador',
        tipoComputador: 'MacBook Pro 14" (pedido de compra PC-2026-0007)',
        perifericos: ['Monitor 27" 4K', 'Headset USB', 'Hub USB-C'],
        acessosSoftwares: ['Microsoft 365 E5 Enterprise', 'GitHub Enterprise', 'JetBrains All Products Pack', 'Slack Business+'],
        gruposEmail: ['engenharia@nexuscorp.com.br', 'todos@nexuscorp.com.br'],
        observacoes: 'Reposição da vaga do Diego Almeida Pires.',
      },
    },
    {
      id: 'tkt-35',
      codigo: codigoChamado(35),
      tipo: 'offboarding',
      ...solicitante(rh),
      titulo: 'Desligamento: Bruno Henrique Carvalho',
      categoria: 'Offboarding de Colaborador',
      prioridade: 'alta',
      status: 'aberto',
      dataCriacao: '2026-11-18T16:00:00Z',
      dataAtualizacao: '2026-11-18T16:00:00Z',
      descricao: 'Pedido de demissão. Último dia em 28/11. Recolher notebook e celular e encerrar acessos.',
      anexos: [],
      mensagens: [msgRh('msg-off-35', 'A carteira de clientes do Bruno passa para a Tatiane. E-mails para o Ricardo.', '2026-11-18T16:05:00Z')],
      colaboradorId: 'emp-26',
      offboarding: {
        colaboradorId: 'emp-26',
        dataDesligamento: '2026-11-28',
        redirecionarEmail: true,
        redirecionarEmailParaId: 'emp-9',
        transferirDrive: true,
        transferirDriveParaId: 'emp-27',
        recolhimentoInstrucoes: 'Devolução presencial na T.I. (14º andar) no último dia, às 16h: notebook Dell Latitude 5440 e Galaxy S23 FE com carregadores.',
        observacoes: 'Pedido de demissão. Manter a caixa de e-mail por 90 dias.',
        checklist: [],
      },
    },
    {
      id: 'tkt-36',
      codigo: codigoChamado(36),
      tipo: 'offboarding',
      ...solicitante(rh),
      titulo: 'Desligamento: Caio Rangel Moreira',
      categoria: 'Offboarding de Colaborador',
      prioridade: 'media',
      status: 'aberto',
      dataCriacao: '2026-11-19T09:00:00Z',
      dataAtualizacao: '2026-11-19T09:00:00Z',
      descricao: 'Desligamento sem justa causa comunicado pela gestora. Colaborador em home office em Campinas.',
      anexos: [],
      mensagens: [],
      colaboradorId: 'emp-41',
      offboarding: {
        colaboradorId: 'emp-41',
        dataDesligamento: '2026-12-04',
        redirecionarEmail: true,
        redirecionarEmailParaId: 'emp-6',
        transferirDrive: true,
        transferirDriveParaId: 'emp-40',
        recolhimentoInstrucoes: 'Coleta por portador no endereço residencial em Campinas, agendada para 04/12: MacBook Pro e monitor Dell 24".',
        observacoes: 'Arquivos de projeto (After Effects) devem ir para a Mirela.',
        checklist: [],
      },
    },
    {
      id: 'tkt-37',
      codigo: codigoChamado(37),
      tipo: 'offboarding',
      ...solicitante(rh),
      titulo: 'Desligamento: Hugo Fernandes Rocha',
      categoria: 'Offboarding de Colaborador',
      prioridade: 'alta',
      status: 'resolvido',
      tecnicoResponsavelId: 'emp-7',
      tecnicoResponsavelNome: pessoa('emp-7').nome,
      dataCriacao: '2026-10-27T10:00:00Z',
      dataAtualizacao: '2026-11-03T17:00:00Z',
      dataResolucao: '2026-11-03T17:00:00Z',
      descricao: 'Desligamento em 31/10. Recolher notebook e celular, encerrar acessos e suspender a linha.',
      anexos: [],
      mensagens: [msgRh('msg-off-37', 'Último dia do Hugo é 31/10. E-mails para o Ricardo.', '2026-10-27T10:05:00Z')],
      colaboradorId: 'emp-32',
      anotacoesProcesso: 'Linha (11) 99000-0009 suspensa; cancelar se não houver novo uso até 30/11. Notebook devolvido com avaria (em avaliação).',
      offboarding: {
        colaboradorId: 'emp-32',
        dataDesligamento: '2026-10-31',
        redirecionarEmail: true,
        redirecionarEmailParaId: 'emp-9',
        transferirDrive: true,
        transferirDriveParaId: 'emp-9',
        recolhimentoInstrucoes: 'Devolução presencial na T.I. no último dia.',
        checklist: [
          { id: 'chk-37-1', texto: 'Redirecionar e-mails para Ricardo Tavares Nogueira', concluido: true, categoria: 'acesso' },
          { id: 'chk-37-2', texto: 'Liberar licenças (Microsoft 365, Slack, Salesforce)', concluido: true, categoria: 'acesso' },
          { id: 'chk-37-3', texto: 'Recolher notebook Dell Latitude 5440 (#PAT-1151)', concluido: true, categoria: 'equipamento' },
          { id: 'chk-37-4', texto: 'Recolher Galaxy A54 (#PAT-1167) e remover do Knox', concluido: true, categoria: 'equipamento' },
          { id: 'chk-37-5', texto: 'Assinar termo de devolução', concluido: true, categoria: 'termo' },
          { id: 'chk-37-6', texto: 'Suspender a linha (11) 99000-0009', concluido: true, categoria: 'geral' },
        ],
      },
    },
  ];

  return { assets, terms, tickets: [...suporte, ...processos] };
}
