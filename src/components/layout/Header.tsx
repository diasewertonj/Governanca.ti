import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  Shield,
  User,
  Users,
  LogOut,
  ChevronDown,
  RotateCcw,
  Building2,
  Check,
} from 'lucide-react';

interface HeaderProps {
  currentView: string;
}

export const Header: React.FC<HeaderProps> = ({ currentView }) => {
  const {
    currentUser,
    currentRole,
    supabaseUser,
    isSupabaseConnected,
    logout,
    switchUser,
    employees,
    resetToInitialData,
  } = useApp();
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);

  const viewTitles: Record<string, string> = {
    dashboard: 'Painel Geral',
    assets: 'Gestão de Ativos & Licenças',
    collaborators: 'Colaboradores & Custódia 360°',
    servicedesk: 'Service Desk & Fila Unificada',
    rh_processes: 'Onboarding & Offboarding (RH)',
    terms: 'Termos de Responsabilidade A4',
    settings: 'Configurações Institucionais',
    my_assets: 'Meus Equipamentos & Termos',
    my_tickets: 'Meus Chamados de Suporte',
  };

  const roleLabels: Record<string, { label: string; badgeClass: string }> = {
    ti_admin: { label: 'Admin T.I.', badgeClass: 'text-blue-700 bg-blue-50 border-blue-200' },
    ti_suporte: { label: 'Suporte T.I.', badgeClass: 'text-cyan-700 bg-cyan-50 border-cyan-200' },
    rh: { label: 'Recursos Humanos', badgeClass: 'text-purple-700 bg-purple-50 border-purple-200' },
    colaborador: { label: 'Colaborador', badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  };

  const handleResetData = () => {
    if (window.confirm('Deseja restaurar todos os dados para os valores de demonstração padrão?')) {
      resetToInitialData();
    }
  };

  const userAvatar = currentUser?.avatarUrl || supabaseUser?.avatarUrl;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200/80">
      {/* Zona 1 & 2: Identidade e Navegação Contextual */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
            N
          </div>
          <span className="font-bold text-slate-900 tracking-tight text-base whitespace-nowrap">
            Nexus IT & HR
          </span>
        </div>

        <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>

        <h1 className="text-sm font-semibold text-slate-700 truncate hidden sm:block">
          {viewTitles[currentView] || 'Visão Geral'}
        </h1>
      </div>

      {/* Zona 3: Ações de Perfil e Alternador de Demonstração */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Botão sutil de restaurar dados */}
        <button
          type="button"
          onClick={handleResetData}
          title="Restaurar dados iniciais da demonstração"
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="text-[11px]">Restaurar Demo</span>
        </button>

        {/* Dropdown de Alternância de Perfil e Conta Real */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSwitchMenu(!showSwitchMenu)}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs transition-colors"
          >
            {userAvatar ? (
              <img
                src={userAvatar}
                alt={currentUser?.nome || 'User'}
                className="w-6 h-6 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-blue-600/10 text-blue-700 flex items-center justify-center font-semibold text-[11px]">
                {currentUser?.nome.charAt(0) || 'U'}
              </div>
            )}
            <div className="text-left hidden sm:block">
              <p className="font-semibold text-slate-800 leading-none truncate max-w-[120px]">
                {currentUser?.nome || supabaseUser?.nome || 'Usuário'}
              </p>
              <span className="text-[10px] text-slate-500 leading-none mt-0.5 block">
                {roleLabels[currentRole]?.label || 'Colaborador'}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showSwitchMenu && (
            <div className="absolute right-0 mt-1.5 w-72 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              {supabaseUser && (
                <div className="px-3 py-2 bg-emerald-50/70 border-b border-emerald-100 mb-1">
                  <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-800 tracking-wider">
                    <span>Supabase Auth Conectado</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-800 truncate mt-0.5">
                    {supabaseUser.email}
                  </p>
                </div>
              )}

              {/* AUDITORIA RBAC: Somente Administradores de TI podem alternar livremente entre identidades para teste */}
              {currentRole === 'ti_admin' ? (
                <>
                  <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Simulação de Perfil (Admin TI)
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Alternar visualização para testes de auditoria
                    </p>
                  </div>

                  <div className="space-y-0.5 px-1 max-h-48 overflow-y-auto">
                    {employees.map((emp) => {
                      const isSelected = emp.id === currentUser?.id;
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => {
                            switchUser(emp.id);
                            setShowSwitchMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                            isSelected
                              ? 'bg-blue-50 text-blue-900 font-medium'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-medium truncate">{emp.nome}</p>
                            <p className="text-[10px] text-slate-400 truncate">{emp.cargo}</p>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-100">
                  <p className="font-medium text-slate-700">{currentUser?.nome}</p>
                  <p className="text-[11px] text-slate-400">{currentUser?.email}</p>
                </div>
              )}

              <div className="mt-1 pt-1 border-t border-slate-100 px-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowSwitchMenu(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair (Ir para Tela de Login)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
