import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  ArrowLeftRight,
  Bell,
  CalendarClock,
  ChevronDown,
  FileSignature,
  GitMerge,
  KeyRound,
  PieChart,
  Phone,
  Wallet,
  Briefcase,
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
import { menuDoPapel, type Contador, type Icone } from '../../utils/navegacao.ts';
import { termoAberto } from '../../utils/termos.ts';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { listarVencimentos, pendenciasConciliacao } from '../../utils/financeiro.ts';
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
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  // Seção 6: o que vence em 30 dias (e pendências sem data), só para a T.I. — os mesmos
  // dados do "Precisa de atenção" (inclui passos agendados e termos desatualizados)
  const qtdVencimentos = useMemo(() => {
    if (!isTI) return 0;
    const termosDesatualizados = pendenciasTermo(employees, { ativos: assets, termos: terms, chamados: tickets, cfg: settings.termoExige });
    return listarVencimentos(
      { ativos: assets, contratos, licencas: licenses, faturas, estoque, linhas, pessoas: employees, processoItens, chamados: tickets, termosDesatualizados, termos: terms },
      30
    ).length;
  }, [isTI, assets, contratos, licenses, faturas, estoque, linhas, employees, processoItens, tickets, terms, settings.termoExige]);
  const qtdConciliar = currentRole === 'ti_admin' ? pendenciasConciliacao(licenses, assets).length : 0;

  // Fecha a gaveta com Esc
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto, onFechar]);

  const hoje = new Date().toISOString().split('T')[0];
  const emAberto = (s: string) => s === 'aberto' || s === 'em_andamento' || s === 'aguardando_terceiro';
  const contadores: Record<Contador, number> = {
    // A RLS já limita o que cada perfil enxerga (RH: os próprios e os de admissão/desligamento)
    chamados: tickets.filter((t) => t.tipo === 'suporte' && emAberto(t.status)).length,
    processos: tickets.filter((t) => t.tipo !== 'suporte' && emAberto(t.status)).length,
    lembretes: lembretes.filter((l) => l.status === 'aberto' && l.venceEm <= hoje).length,
    meus_chamados: tickets.filter((t) => t.solicitanteId === currentUser?.id && emAberto(t.status)).length,
    // Lote 1: termo cancelado/substituído não conta (mesma regra de "Meus termos")
    termos_para_assinar: terms.filter(
      (t) => t.colaboradorId === currentUser?.id && termoAberto(t) && !t.aceiteColaboradorEm
    ).length,
    vencimentos: qtdVencimentos,
    conciliar: qtdConciliar,
  };
  const corContador: Record<Contador, string> = {
    chamados: 'bg-slate-100 text-slate-700',
    meus_chamados: 'bg-slate-100 text-slate-700',
    lembretes: 'bg-red-100 text-red-800',
    termos_para_assinar: 'bg-amber-100 text-amber-900',
    vencimentos: 'bg-amber-100 text-amber-900',
    conciliar: 'bg-amber-100 text-amber-900',
    processos: 'bg-slate-100 text-slate-700',
  };
  const dicaContador: Record<Contador, string> = {
    chamados: 'chamados em aberto',
    meus_chamados: 'chamados seus em aberto',
    lembretes: 'lembretes vencidos ou para hoje',
    termos_para_assinar: 'termos para você assinar',
    vencimentos: 'vencimentos nos próximos 30 dias ou pendências',
    conciliar: 'cadastros com fornecedor antigo em texto',
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
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform transition-transform duration-200 lg:sticky lg:top-[57px] lg:z-auto lg:h-[calc(100vh-57px)] lg:w-64 lg:max-w-none lg:translate-x-0 ${
          aberto ? 'translate-x-0' : '-translate-x-full'
        } shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-4 pt-4 lg:hidden">
          <span className="text-sm font-semibold text-slate-900">Menu</span>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar menu"
            className="p-2 -mr-2 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
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
            <PlusCircle className="w-4 h-4" />
            <span>Abrir chamado</span>
          </button>

          <nav className="space-y-2">
            {menuDoPapel(currentRole).map((grupo, gi) => {
              // Grupos recolhíveis: o do item atual fica sempre aberto; recolhido mostra a soma dos contadores
              const temAtual = grupo.itens.some((it) => it.vista === currentView);
              const recolhido = !!grupo.titulo && !temAtual && recolhidos.includes(grupo.titulo);
              const somaGrupo = grupo.itens.reduce((s, it) => s + (it.contador ? contadores[it.contador] : 0), 0);
              return (
              <div key={grupo.titulo || gi} className="space-y-0.5">
                {grupo.titulo && (
                  <button
                    type="button"
                    onClick={() => alternarGrupo(grupo.titulo as string)}
                    aria-expanded={!recolhido}
                    className="w-full flex items-center gap-1 px-3 pb-0.5 text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${recolhido ? "-rotate-90" : ""}`} aria-hidden="true" />
                    <span className="flex-1 text-left">{grupo.titulo}</span>
                    {recolhido && somaGrupo > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-slate-700">{somaGrupo}</span>}
                  </button>
                )}
                {!recolhido && grupo.itens.map((it) => {
                  const Icon = ICONES[it.icone];
                  const ativo = currentView === it.vista;
                  const n = it.contador ? contadores[it.contador] : 0;
                  return (
                    <button
                      key={it.vista}
                      type="button"
                      onClick={() => ir(it.vista)}
                      aria-current={ativo ? 'page' : undefined}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        ativo ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${ativo ? 'text-blue-700' : 'text-slate-500'}`} aria-hidden="true" />
                      <span className="flex-1 text-left truncate">{it.rotulo}</span>
                      {it.contador && n > 0 && (
                        <span
                          className={`text-xs font-semibold rounded-full px-2 py-0.5 ${corContador[it.contador]}`}
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
