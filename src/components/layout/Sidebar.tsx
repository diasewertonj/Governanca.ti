import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { isoLocal } from '../../utils/formatters.ts';
import {
  ArrowLeftRight,
  Bell,
  ChartLine,
  FileBarChart,
  Gauge,
  HandCoins,
  Landmark,
  Target,
  CalendarClock,
  ChevronDown,
  FileSignature,
  GitMerge,
  KeyRound,
  PieChart,
  Phone,
  Wallet,
  Briefcase,
  ClipboardCheck,
  ShoppingCart,
  FileText,
  Handshake,
  House,
  Laptop,
  LifeBuoy,
  PlusCircle,
  Settings,
  Ticket,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { itemDoMenu, menuDoPapel, type Contador, type Icone } from '../../utils/navegacao.ts';
import { termoAberto, termoContestadoAberto } from '../../utils/termos.ts';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import { listarVencimentos, pendenciasConciliacao } from '../../utils/financeiro.ts';
import { esperaPorMim } from '../../utils/compras.ts';
import { pendenciasTermo } from '../../utils/inventario.ts';

const ICONES: Record<Icone, LucideIcon> = {
  inicio: House,
  chamados: LifeBuoy,
  lembretes: Bell,
  colaboradores: Users,
  admissoes: ArrowLeftRight,
  termos: FileText,
  ativos: Laptop,
  fornecedores: Handshake,
  softwares: KeyRound,
  contratos: FileSignature,
  vencimentos: CalendarClock,
  contas_pagar: Wallet,
  despesas: PieChart,
  conciliar: GitMerge,
  linhas: Phone,
  meus_equipamentos: Briefcase,
  meus_chamados: Ticket,
  configuracoes: Settings,
  compras: ShoppingCart,
  conferencia: ClipboardCheck,
  recebimentos: HandCoins,
  painel: Gauge,
  orcamento: Target,
  projecao: ChartLine,
  patrimonio: Landmark,
  relatorios: FileBarChart,
};

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenNewTicketModal: () => void;
  /** Fase 7: no celular/tablet o menu é uma gaveta */
  aberto: boolean;
  onFechar: () => void;
}

/**
 * Fase 7: menu único por perfil (utils/navegacao.ts). No computador fica fixo
 * à esquerda; abaixo de 1024px vira gaveta aberta pelo botão do cabeçalho.
 */
export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, onOpenNewTicketModal, aberto, onFechar }) => {
  const { currentRole, tickets, currentUser, lembretes, terms, assets, contratos, licenses, faturas, employees, processoItens, settings } = useApp();
  const { estoque, linhas } = useRecursos();
  const { podePedirCompra, ehGestor, pedidos, alertas: alertasOrcamento } = useCompras();
  // Seção 13: pedidos que esperam uma ação desta pessoa (cotar, aprovar, comprar, receber)
  const pedidosParaMim = useMemo(() => pedidos.filter((p) => esperaPorMim(p, currentRole, currentUser?.id)), [pedidos, currentRole, currentUser?.id]);
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  // Seção 6: o que vence em 30 dias (e pendências sem data), só para a T.I. — os mesmos
  // dados do "Precisa de atenção" (inclui passos agendados e termos desatualizados)
  const qtdVencimentos = useMemo(() => {
    if (!isTI) return 0;
    const termosDesatualizados = pendenciasTermo(employees, { ativos: assets, termos: terms, chamados: tickets, cfg: settings.termoExige });
    return listarVencimentos(
      { ativos: assets, contratos, licencas: licenses, faturas, estoque, linhas, pessoas: employees, processoItens, chamados: tickets, termosDesatualizados, termos: terms, pedidos: pedidosParaMim, alertasOrcamento, papel: currentRole },
      30
    ).length;
  }, [isTI, assets, contratos, licenses, faturas, estoque, linhas, employees, processoItens, tickets, terms, settings.termoExige, pedidosParaMim, alertasOrcamento, currentRole]);
  const qtdConciliar = currentRole === 'ti_admin' ? pendenciasConciliacao(licenses, assets).length : 0;

  // Fecha a gaveta com Esc
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto, onFechar]);

  const hoje = isoLocal(new Date());
  const emAberto = (s: string) => s === 'aberto' || s === 'em_andamento' || s === 'aguardando_terceiro';
  const contadores: Record<Contador, number> = {
    // A RLS já limita o que cada perfil enxerga (RH: os próprios e os de admissão/desligamento)
    chamados: tickets.filter((t) => t.tipo === 'suporte' && emAberto(t.status)).length,
    processos: tickets.filter((t) => t.tipo !== 'suporte' && emAberto(t.status)).length,
    lembretes: lembretes.filter((l) => l.status === 'aberto' && l.venceEm <= hoje).length,
    meus_chamados: tickets.filter((t) => t.solicitanteId === currentUser?.id && emAberto(t.status)).length,
    // Lote 1: termo cancelado/substituído não conta (mesma regra de "Meus termos")
    termos_para_assinar: terms.filter(
      (t) => t.colaboradorId === currentUser?.id && termoAberto(t) && !t.aceiteColaboradorEm && !termoContestadoAberto(t)
    ).length,
    vencimentos: qtdVencimentos,
    conciliar: qtdConciliar,
    pedidos: pedidosParaMim.length,
  };
  // Seção 19: contadores por classe (neutro, atenção ou alerta)
  const corContador: Record<Contador, string> = {
    chamados: '',
    meus_chamados: '',
    lembretes: 'contador-alerta',
    termos_para_assinar: 'contador-atencao',
    vencimentos: 'contador-atencao',
    conciliar: 'contador-atencao',
    pedidos: 'contador-atencao',
    processos: '',
  };
  const dicaContador: Record<Contador, string> = {
    chamados: 'chamados em aberto',
    meus_chamados: 'chamados seus em aberto',
    lembretes: 'lembretes vencidos ou para hoje',
    termos_para_assinar: 'termos para você assinar',
    vencimentos: 'vencimentos nos próximos 30 dias ou pendências',
    conciliar: 'cadastros com fornecedor antigo em texto',
    pedidos: 'pedidos de compra esperando por você',
    processos: 'admissões e desligamentos em andamento',
  };

  // Grupos recolhidos ficam guardados neste navegador (só conveniência)
  const [recolhidos, setRecolhidos] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("nexus_menu_recolhidos") || "[]");
    } catch {
      return [];
    }
  });
  const alternarGrupo = (titulo: string) =>
    setRecolhidos((prev) => {
      const novo = prev.includes(titulo) ? prev.filter((x) => x !== titulo) : [...prev, titulo];
      try {
        localStorage.setItem("nexus_menu_recolhidos", JSON.stringify(novo));
      } catch {
        /* sem armazenamento: só não lembra */
      }
      return novo;
    });

  const ir = (vista: string) => {
    onNavigate(vista);
    onFechar();
  };

  return (
    <>
      {aberto && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={onFechar} aria-hidden="true" />}
      <aside
        id="menu-principal"
        aria-label="Menu principal"
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform transition-transform duration-200 lg:sticky lg:top-16 lg:z-auto lg:h-[calc(100vh-4rem)] lg:w-64 lg:max-w-none lg:translate-x-0 ${
          aberto ? 'translate-x-0' : '-translate-x-full'
        } shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-4 pt-4 lg:hidden">
          <span className="font-semibold text-slate-900">Menu</span>
          <button type="button" onClick={onFechar} aria-label="Fechar menu" className="btn-icone -mr-2 p-2">
            <X className="ico-lg" />
          </button>
        </div>

        <div className="p-3 space-y-3 flex-1">
          <button
            type="button"
            onClick={() => {
              onOpenNewTicketModal();
              onFechar();
            }}
            className="btn btn-primario w-full"
          >
            <PlusCircle aria-hidden="true" />
            <span>Abrir chamado</span>
          </button>

          <nav className="space-y-3">
            {menuDoPapel(currentRole, { pedeCompra: podePedirCompra, gestor: ehGestor }).map((grupo, gi) => {
              // Grupos recolhíveis: o do item atual fica sempre aberto; recolhido mostra a soma dos contadores
              const temAtual = grupo.itens.some((it) => it.vista === itemDoMenu(currentView));
              const recolhido = !!grupo.titulo && !temAtual && recolhidos.includes(grupo.titulo);
              const somaGrupo = grupo.itens.reduce((s, it) => s + (it.contador ? contadores[it.contador] : 0), 0);
              return (
              <div key={grupo.titulo || gi} className="space-y-1">
                {grupo.titulo && (
                  <button
                    type="button"
                    onClick={() => alternarGrupo(grupo.titulo as string)}
                    aria-expanded={!recolhido}
                    className="secao-titulo flex w-full items-center gap-1 rounded-md px-3 py-1 hover:text-slate-900"
                  >
                    <ChevronDown className={`ico-sm transition-transform ${recolhido ? "-rotate-90" : ""}`} aria-hidden="true" />
                    <span className="flex-1 text-left">{grupo.titulo}</span>
                    {recolhido && somaGrupo > 0 && <span className="contador normal-case tracking-normal">{somaGrupo}</span>}
                  </button>
                )}
                {!recolhido && grupo.itens.map((it) => {
                  const Icon = ICONES[it.icone];
                  const ativo = itemDoMenu(currentView) === it.vista;
                  const n = it.contador ? contadores[it.contador] : 0;
                  return (
                    <button
                      key={it.vista}
                      type="button"
                      onClick={() => ir(it.vista)}
                      aria-current={ativo ? 'page' : undefined}
                      className="nav-item gap-3 px-3 py-2"
                    >
                      <Icon aria-hidden="true" />
                      <span className="flex-1 text-left truncate">{it.rotulo}</span>
                      {it.contador && n > 0 && (
                        <span
                          className={`contador ${corContador[it.contador]}`}
                          title={`${n} ${dicaContador[it.contador]}`}
                        >
                          {n}
                          <span className="sr-only"> {dicaContador[it.contador]}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
};
