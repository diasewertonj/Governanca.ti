import React, { useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  ArrowLeftRight,
  Bell,
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

const ICONES: Record<Icone, LucideIcon> = {
  inicio: House,
  chamados: LifeBuoy,
  lembretes: Bell,
  colaboradores: Users,
  admissoes: ArrowLeftRight,
  termos: FileText,
  ativos: Laptop,
  fornecedores: Handshake,
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
  const { currentRole, tickets, currentUser, lembretes, terms } = useApp();

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
    chamados: tickets.filter((t) => emAberto(t.status)).length,
    lembretes: lembretes.filter((l) => l.status === 'aberto' && l.venceEm <= hoje).length,
    meus_chamados: tickets.filter((t) => t.solicitanteId === currentUser?.id && emAberto(t.status)).length,
    termos_para_assinar: terms.filter(
      (t) => t.colaboradorId === currentUser?.id && t.formaAssinatura === 'pendente' && !t.aceiteColaboradorEm
    ).length,
  };
  const corContador: Record<Contador, string> = {
    chamados: 'bg-slate-100 text-slate-700',
    meus_chamados: 'bg-slate-100 text-slate-700',
    lembretes: 'bg-red-100 text-red-800',
    termos_para_assinar: 'bg-amber-100 text-amber-900',
  };
  const dicaContador: Record<Contador, string> = {
    chamados: 'chamados em aberto',
    meus_chamados: 'chamados seus em aberto',
    lembretes: 'lembretes vencidos ou para hoje',
    termos_para_assinar: 'termos para você assinar',
  };

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

        <div className="p-4 space-y-5 flex-1">
          <button
            type="button"
            onClick={() => {
              onOpenNewTicketModal();
              onFechar();
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Abrir chamado</span>
          </button>

          <nav className="space-y-4">
            {menuDoPapel(currentRole).map((grupo, gi) => (
              <div key={grupo.titulo || gi} className="space-y-0.5">
                {grupo.titulo && <p className="px-3 pb-1 text-xs font-medium text-slate-500">{grupo.titulo}</p>}
                {grupo.itens.map((it) => {
                  const Icon = ICONES[it.icone];
                  const ativo = currentView === it.vista;
                  const n = it.contador ? contadores[it.contador] : 0;
                  return (
                    <button
                      key={it.vista}
                      type="button"
                      onClick={() => ir(it.vista)}
                      aria-current={ativo ? 'page' : undefined}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
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
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
};
