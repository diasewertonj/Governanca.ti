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
  | 'conferencia';

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
  despesas: 'Despesas',
  conciliar: 'Conciliar fornecedores',
  financeiro: 'Financeiro',
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
  | 'conferencia';

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
}

/** Menu de cada perfil (a proteção real continua no banco, por RLS) */
export function menuDoPapel(papel: UserRole, opcoes: OpcoesMenu = {}): GrupoMenu[] {
  // Fase 11: o gestor (colaborador com equipe) pede compra pela Minha área
  if (papel === 'colaborador')
    return [opcoes.pedeCompra === false ? MINHA_AREA : { ...MINHA_AREA, itens: [...MINHA_AREA.itens, item('pedidos_compra', 'compras', 'pedidos')] }];

  // Seção 13: departamento de Compras (aprova, compra e paga as faturas dos pedidos)
  if (papel === 'compras') {
    return [
      { itens: [item('pedidos_compra', 'compras', 'pedidos')] },
      { titulo: 'Financeiro', itens: [item('financeiro', 'contas_pagar'), item('fornecedores', 'fornecedores')] },
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
    // Item único: sem título de grupo repetindo o nome
    { itens: [item('financeiro', 'contas_pagar')] },
    // T.I./admin: sem Minha área — Meus equipamentos fica no menu da conta; os próprios chamados, em Chamados
  ];
  if (papel === 'ti_admin')
    grupos.push({
      titulo: 'Administração',
      itens: [item('settings', 'configuracoes')],
    });
  return grupos;
}

/** Telas que o perfil pode abrir (as que aparecem no menu dele) */
export function vistasDoPapel(papel: UserRole, opcoes: OpcoesMenu = {}): Vista[] {
  const doMenu = menuDoPapel(papel, opcoes).flatMap((g) => g.itens.map((i) => i.vista));
  // Meus equipamentos abre pelo menu da conta (cabeçalho) para quem não tem Minha área no menu
  return doMenu.includes('my_assets') ? doMenu : [...doMenu, 'my_assets'];
}
