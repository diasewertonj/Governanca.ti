import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  LayoutDashboard,
  Laptop,
  LifeBuoy,
  Users,
  UserCheck,
  FileText,
  Settings,
  FolderSync,
  PlusCircle,
  Shield,
  HelpCircle,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenNewTicketModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  onOpenNewTicketModal,
}) => {
  const { currentRole, tickets, assets, currentUser } = useApp();

  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const isRH = currentRole === 'rh';
  const isColaborador = currentRole === 'colaborador';

  // Contadores dinâmicos sensíveis ao papel
  const openTicketsCount = isRH
    ? tickets.filter(
        (t) =>
          (t.tipo === 'onboarding' ||
            t.tipo === 'offboarding' ||
            t.solicitanteId === currentUser?.id) &&
          (t.status === 'aberto' || t.status === 'em_andamento')
      ).length
    : tickets.filter(
        (t) => t.status === 'aberto' || t.status === 'em_andamento'
      ).length;

  const myTicketsCount = tickets.filter(
    (t) =>
      t.solicitanteId === currentUser?.id &&
      (t.status === 'aberto' || t.status === 'em_andamento')
  ).length;

  const myAssetsCount = assets.filter((a) => a.custodianteId === currentUser?.id).length;

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200/80 flex flex-col justify-between p-4 min-h-[calc(100vh-57px)]">
      <div className="space-y-6">
        {/* Ação Primária Rápida */}
        <div>
          <button
            type="button"
            onClick={onOpenNewTicketModal}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Abrir Chamado</span>
          </button>
        </div>

        {/* Grupo de Navegação: Colaborador Padrão */}
        {isColaborador && (
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 px-3 block tracking-wider">
              Área do Solicitante
            </span>
            <button
              type="button"
              onClick={() => onNavigate('my_assets')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'my_assets'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Laptop className="w-4 h-4 text-slate-500" />
                <span>Meus Equipamentos</span>
              </div>
              {myAssetsCount > 0 && (
                <span className="text-[10px] font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                  {myAssetsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onNavigate('my_tickets')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'my_tickets'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LifeBuoy className="w-4 h-4 text-slate-500" />
                <span>Meus Chamados</span>
              </div>
              {myTicketsCount > 0 && (
                <span className="text-[10px] font-mono font-medium text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">
                  {myTicketsCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Grupo de Navegação: Gestão de TI & Governança */}
        {isTI && (
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 px-3 block tracking-wider">
              Governança & TI
            </span>

            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'dashboard'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-slate-500" />
              <span>Painel Geral</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('assets')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'assets'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Laptop className="w-4 h-4 text-slate-500" />
              <span>Ativos & Licenças</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('servicedesk')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'servicedesk'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LifeBuoy className="w-4 h-4 text-slate-500" />
                <span>Service Desk</span>
              </div>
              {openTicketsCount > 0 && (
                <span className="text-[10px] font-mono font-medium text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                  {openTicketsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onNavigate('collaborators')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'collaborators'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4 text-slate-500" />
              <span>Colaboradores 360°</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('rh_processes')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'rh_processes'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <FolderSync className="w-4 h-4 text-slate-500" />
              <span>On/Offboarding RH</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('terms')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'terms'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4 text-slate-500" />
              <span>Termos de Responsabilidade</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'settings'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>Configurações</span>
            </button>
          </div>
        )}

        {/* Grupo de Navegação: Recursos Humanos (RH) */}
        {isRH && (
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 px-3 block tracking-wider">
              Gestão de Pessoas (RH)
            </span>

            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'dashboard'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-slate-500" />
              <span>Visão Geral</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('rh_processes')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'rh_processes'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-4 h-4 text-slate-500" />
              <span>Onboarding & Offboarding</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('collaborators')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'collaborators'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4 text-slate-500" />
              <span>Colaboradores 360°</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('servicedesk')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'servicedesk'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LifeBuoy className="w-4 h-4 text-slate-500" />
                <span>Requisições de RH</span>
              </div>
              {openTicketsCount > 0 && (
                <span className="text-[10px] font-mono font-medium text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                  {openTicketsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onNavigate('my_tickets')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'my_tickets'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LifeBuoy className="w-4 h-4 text-purple-600" />
                <span>Meus Chamados Pessoais</span>
              </div>
              {myTicketsCount > 0 && (
                <span className="text-[10px] font-mono font-medium text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded">
                  {myTicketsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onNavigate('terms')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentView === 'terms'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4 text-slate-500" />
              <span>Termos Assinados</span>
            </button>
          </div>
        )}
      </div>

      {/* Rodapé da Sidebar */}
      <div className="pt-4 border-t border-slate-100 space-y-2 text-[11px] text-slate-400">
        <div className="flex items-center justify-between">
          <span className="font-medium text-slate-600">Empresa Single-Tenant</span>
          <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] font-mono">
            Ativo
          </span>
        </div>
        <p className="leading-tight">
          Governança Patrimonial & Service Desk Integrado
        </p>
      </div>
    </aside>
  );
};
