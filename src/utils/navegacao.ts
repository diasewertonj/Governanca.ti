// =============================================================================
// Fase 7 · Navegação: fonte única dos nomes das telas e dos menus por perfil.
// Menu lateral, cabeçalho e permissões usam estes nomes (um nome por tela,
// em português, igual no menu e no título).
// =============================================================================
import type { UserRole } from '../types/index.ts';

export type Vista =
  | 'dashboard'
  | 'assets'
  | 'softwares'
  | 'linhas'
  | 'fornecedores'
  | 'contratos'
  | 'vencimentos'
  | 'contas_pagar'
  | 'despesas'
  | 'conciliar'
  | 'financeiro'
  | 'collaborators'
  | 'servicedesk'
  | 'rh_processes'
  | 'terms'
  | 'lembretes'
  | 'settings'
  | 'my_assets'
  | 'my_tickets'
  | 'pedidos_compra'
  | 'conferencia'
  // Seção 17: Financeiro e Gestão de T.I.
  | 'recebimentos'
  | 'painel_executivo'
  | 'orcamento'
  | 'projecao'
  | 'patrimonio'
  | 'relatorios'
  | 'custos_area';

/** Título da tela (cabeçalho e aba do navegador) */
export const TITULO_VISTA: Record<Vista, string> = {
  dashboard: 'Início',
  assets: 'Hardware',
  softwares: 'Softwares e licenças',
  linhas: 'Linhas telefônicas',
  fornecedores: 'Fornecedores',
  contratos: 'Contratos',
  vencimentos: 'Vencimentos',
  contas_pagar: 'Contas a pagar',
  despesas: 'Custos do período',
  conciliar: 'Conciliar fornecedores',
  financeiro: 'Contas a pagar',
  collaborators: 'Colaboradores',
  servicedesk: 'Chamados',
  rh_processes: 'Admissões e desligamentos',
  terms: 'Termos',
  lembretes: 'Lembretes',
  settings: 'Configurações',
  my_assets: 'Meus equipamentos',
  my_tickets: 'Meus chamados',
  pedidos_compra: 'Pedidos de compra',
  conferencia: 'Inventário físico',
  recebimentos: 'Recebimentos',
  painel_executivo: 'Painel executivo',
  orcamento: 'Orçamento e projeção',
  projecao: 'Orçamento e projeção',
  patrimonio: 'Patrimônio',
  relatorios: 'Relatórios',
  custos_area: 'Custos da minha área',
};

export type Contador = 'chamados' | 'lembretes' | 'meus_chamados' | 'termos_para_assinar' | 'vencimentos' | 'conciliar' | 'processos' | 'pedidos';

export type Icone =
  | 'inicio'
  | 'chamados'
  | 'lembretes'
  | 'colaboradores'
  | 'admissoes'
  | 'termos'
  | 'ativos'
  | 'fornecedores'
  | 'softwares'
  | 'linhas'
  | 'contratos'
  | 'vencimentos'
  | 'contas_pagar'
  | 'despesas'
  | 'conciliar'
  | 'meus_equipamentos'
  | 'meus_chamados'
  | 'configuracoes'
  | 'compras'
  | 'conferencia'
  | 'recebimentos'
  | 'painel'
  | 'orcamento'
  | 'projecao'
  | 'patrimonio'
  | 'relatorios';

export interface ItemMenu {
  vista: Vista;
  rotulo: string;
  icone: Icone;
  contador?: Contador;
}

export interface GrupoMenu {
  titulo?: string;
  itens: ItemMenu[];
}

const item = (vista: Vista, icone: Icone, contador?: Contador, rotulo = TITULO_VISTA[vista]): ItemMenu => ({
  vista,
  rotulo,
  icone,
  contador,
});

const MINHA_AREA: GrupoMenu = {
  titulo: 'Minha área',
  itens: [
    item('my_assets', 'meus_equipamentos', 'termos_para_assinar'),
    item('my_tickets', 'meus_chamados', 'meus_chamados'),
  ],
};

/** O que muda o menu além do papel (Fase 11: gestor pede compra) */
export interface OpcoesMenu {
  pedeCompra?: boolean;
  /** Seção 17 (decisão 10): colaborador com equipe vê os custos da área dele */
  gestor?: boolean;
}

/** Menu de cada perfil (a proteção real continua no banco, por RLS) */
export function menuDoPapel(papel: UserRole, opcoes: OpcoesMenu = {}): GrupoMenu[] {
  // Fase 11: o gestor (colaborador com equipe) pede compra pela Minha área
  if (papel === 'colaborador') {
    const itens = [...MINHA_AREA.itens];
    if (opcoes.pedeCompra !== false) itens.push(item('pedidos_compra', 'compras', 'pedidos'));
    if (opcoes.gestor) itens.push(item('custos_area', 'orcamento'));
    return [{ ...MINHA_AREA, itens }];
  }

  // Seção 13 + 17 (decisão 1): Compras paga todas as faturas, confirma recebimentos,
  // acompanha o orçamento e a projeção (totais) e tira os relatórios
  if (papel === 'compras') {
    return [
      { itens: [item('pedidos_compra', 'compras', 'pedidos')] },
      { titulo: 'Financeiro', itens: [item('financeiro', 'contas_pagar'), item('recebimentos', 'recebimentos'), item('fornecedores', 'fornecedores')] },
      { titulo: 'Acompanhamento', itens: [item('orcamento', 'orcamento'), item('relatorios', 'relatorios')] },
      MINHA_AREA,
    ];
  }

  if (papel === 'rh') {
    return [
      { itens: [item('dashboard', 'inicio')] },
      // Os chamados do RH ficam em Minha área › Meus chamados; processos têm tela própria
      {
        titulo: 'Pessoas',
        itens: [item('rh_processes', 'admissoes', 'processos'), item('collaborators', 'colaboradores'), item('pedidos_compra', 'compras', 'pedidos')],
      },
      MINHA_AREA,
    ];
  }

  const grupos: GrupoMenu[] = [
    // Início traz o Precisa de atenção (vencimentos, termos a assinar): o contador fica aqui
    { itens: [item('dashboard', 'inicio', 'vencimentos')] },
    { titulo: 'Atendimento', itens: [item('servicedesk', 'chamados', 'chamados'), item('lembretes', 'lembretes', 'lembretes')] },
    { titulo: 'Pessoas', itens: [item('collaborators', 'colaboradores'), item('rh_processes', 'admissoes', 'processos')] },
    // Seção 6: inventário separado de fornecedores/contratos; Financeiro centraliza as despesas
    { titulo: 'Inventário', itens: [item('assets', 'ativos'), item('softwares', 'softwares'), item('linhas', 'linhas'), item('conferencia', 'conferencia')] },
    {
      titulo: 'Fornecedores e contratos',
      itens: [item('fornecedores', 'fornecedores'), item('contratos', 'contratos')],
    },
    // Seção 15: pedidos de compra com item próprio (não é mais aba do Financeiro)
    { titulo: 'Compras', itens: [item('pedidos_compra', 'compras', 'pedidos')] },
    // Seção 17: Financeiro (executar e pagar) separado da Gestão de T.I. (planejar e prestar contas)
    { titulo: 'Financeiro', itens: [item('financeiro', 'contas_pagar'), item('recebimentos', 'recebimentos'), item('despesas', 'despesas')] },
    {
      titulo: 'Gestão de T.I.',
      itens: [
        // Painel executivo e exportações contábeis: só o admin (decisão 2)
        ...(papel === 'ti_admin' ? [item('painel_executivo', 'painel')] : []),
        // Seção 23: Orçamento e Projeção num item só (a projeção é uma aba)
        item('orcamento', 'orcamento'),
        item('patrimonio', 'patrimonio'),
        // Seção 23: para o admin, Relatórios traz as análises cruzadas
        ...(papel === 'ti_admin' ? [item('relatorios', 'relatorios', undefined, 'Análises e relatórios')] : []),
      ],
    },
    // T.I./admin: sem Minha área — Meus equipamentos fica no menu da conta; os próprios chamados, em Chamados
  ];
  if (papel === 'ti_admin')
    grupos.push({
      titulo: 'Administração',
      itens: [item('settings', 'configuracoes')],
    });
  return grupos;
}

/** Telas que abrem como aba de outro item do menu (seção 23): a tela → o item que fica marcado */
export const VISTA_NO_MENU: Partial<Record<Vista, Vista>> = { projecao: 'orcamento' };

/** Item do menu que fica marcado para a tela atual */
export const itemDoMenu = (vista: string): string => VISTA_NO_MENU[vista as Vista] || vista;

/** Telas que o perfil pode abrir (as que aparecem no menu dele) */
export function vistasDoPapel(papel: UserRole, opcoes: OpcoesMenu = {}): Vista[] {
  const doMenu = menuDoPapel(papel, opcoes).flatMap((g) => g.itens.map((i) => i.vista));
  // Telas que são aba de um item do menu valem para quem tem o item
  const abas = (Object.keys(VISTA_NO_MENU) as Vista[]).filter((v) => doMenu.includes(VISTA_NO_MENU[v] as Vista));
  const todas = [...doMenu, ...abas];
  // Meus equipamentos abre pelo menu da conta (cabeçalho) para quem não tem Minha área no menu
  return todas.includes('my_assets') ? todas : [...todas, 'my_assets'];
}
