import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { MeusDadosModal } from '../lgpd/MeusDadosModal.tsx';
import { Shield, LogOut, ChevronDown, Menu } from 'lucide-react';
import { TITULO_VISTA, type Vista } from '../../utils/navegacao.ts';

interface HeaderProps {
  currentView: string;
  /** Fase 7: abre o menu (gaveta) no celular/tablet */
  onAbrirMenu: () => void;
  menuAberto: boolean;
}

const ROTULO_PAPEL: Record<string, { label: string; badgeClass: string }> = {
  ti_admin: { label: 'Admin T.I.', badgeClass: 'text-blue-800 bg-blue-50 border-blue-200' },
  ti_suporte: { label: 'Suporte T.I.', badgeClass: 'text-cyan-800 bg-cyan-50 border-cyan-200' },
  rh: { label: 'Recursos Humanos', badgeClass: 'text-purple-800 bg-purple-50 border-purple-200' },
  colaborador: { label: 'Colaborador', badgeClass: 'text-emerald-800 bg-emerald-50 border-emerald-200' },
};

/** Logo da empresa (Configurações › Empresa) ou as iniciais do nome fantasia */
export const LogoEmpresa: React.FC<{ tamanho?: string }> = ({ tamanho = 'w-8 h-8' }) => {
  const { settings } = useApp();
  const [falhou, setFalhou] = useState(false);
  if (settings.logoUrl && !falhou) {
    return (
      <img
        src={settings.logoUrl}
        alt={settings.nomeFantasia}
        onError={() => setFalhou(true)}
        className={`${tamanho} rounded-lg object-contain bg-white`}
        referrerPolicy="no-referrer"
      />
    );
  }
  const iniciais =
    (settings.nomeFantasia || 'Nexus')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || 'N';
  return (
    <div className={`${tamanho} rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm`} aria-hidden="true">
      {iniciais}
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({ currentView, onAbrirMenu, menuAberto }) => {
  const { currentUser, currentRole, supabaseUser, logout, podeDescartarPendencias, settings } = useApp();
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);
  const [showMeusDados, setShowMeusDados] = useState(false);

  const titulo = TITULO_VISTA[currentView as Vista] || 'Início';
  useEffect(() => {
    document.title = `${titulo} · Nexus`;
  }, [titulo]);

  const userAvatar = currentUser?.avatarUrl || supabaseUser?.avatarUrl;
  const papel = ROTULO_PAPEL[currentRole] || ROTULO_PAPEL.colaborador;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-3 sm:px-6 py-3 bg-white border-b border-slate-200 min-h-[57px]">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menu"
          aria-controls="menu-principal"
          aria-expanded={menuAberto}
          className="lg:hidden p-2 -ml-1 rounded-lg text-slate-700 hover:bg-slate-100"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <LogoEmpresa />
          <span className="font-bold text-slate-900 tracking-tight text-base whitespace-nowrap hidden sm:inline">
            {settings.nomeFantasia ? 'Nexus' : 'Nexus IT & HR'}
          </span>
        </div>
        <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
          /
        </span>
        <h1 className="text-sm font-semibold text-slate-800 truncate">{titulo}</h1>
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowSwitchMenu(!showSwitchMenu)}
          aria-haspopup="menu"
          aria-expanded={showSwitchMenu}
          className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs transition-colors"
        >
          {userAvatar ? (
            <img
              src={userAvatar}
              alt=""
              className="w-7 h-7 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-blue-600/10 text-blue-800 flex items-center justify-center font-semibold text-xs">
              {currentUser?.nome.charAt(0) || 'U'}
            </div>
          )}
          <div className="text-left hidden md:block">
            <p className="font-semibold text-slate-800 leading-none truncate max-w-[160px]">
              {currentUser?.nome || supabaseUser?.nome || 'Usuário'}
            </p>
            <span className="text-xs text-slate-600 leading-none mt-1 block">{papel.label}</span>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-500" aria-hidden="true" />
          <span className="sr-only">Abrir menu da conta</span>
        </button>

        {showSwitchMenu && (
          <div
            role="menu"
            className="absolute right-0 mt-1.5 w-72 max-w-[calc(100vw-1.5rem)] bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50"
          >
            <div className="px-3.5 py-2.5 border-b border-slate-100">
              <p className="font-semibold text-slate-900 text-sm truncate">{currentUser?.nome || supabaseUser?.nome}</p>
              <p className="text-xs text-slate-600 truncate mt-0.5">{currentUser?.email || supabaseUser?.email}</p>
              <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded border font-medium ${papel.badgeClass}`}>
                {papel.label}
              </span>
            </div>
            <div className="pt-1 px-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowSwitchMenu(false);
                  setShowMeusDados(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
              >
                <Shield className="w-4 h-4 text-slate-500" aria-hidden="true" />
                <span>Meus dados (LGPD)</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowSwitchMenu(false);
                  if (podeDescartarPendencias()) logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-rose-700 hover:bg-rose-50 transition-colors text-left"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        )}
      </div>
      {showMeusDados && <MeusDadosModal onClose={() => setShowMeusDados(false)} />}
    </header>
  );
};
