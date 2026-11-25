import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { MeusDadosModal } from '../lgpd/MeusDadosModal.tsx';
import { Shield, LogOut, ChevronDown, Menu, Briefcase } from 'lucide-react';
import { termoAberto, termoContestadoAberto } from '../../utils/termos.ts';
import { TITULO_VISTA, type Vista } from '../../utils/navegacao.ts';
import { SeletorDensidade, SeletorTema } from '../ui/Tela.tsx';

interface HeaderProps {
  currentView: string;
  /** Fase 7: abre o menu (gaveta) no celular/tablet */
  onAbrirMenu: () => void;
  menuAberto: boolean;
  /** Seção 7: abre Meus equipamentos pelo menu da conta (T.I./admin) */
  onNavigate?: (view: string) => void;
}

const ROTULO_PAPEL: Record<string, { label: string; badgeClass: string }> = {
  ti_admin: { label: 'Admin T.I.', badgeClass: 'selo-info' },
  ti_suporte: { label: 'Suporte T.I.', badgeClass: 'selo-info' },
  rh: { label: 'Recursos Humanos', badgeClass: 'selo-neutro' },
  colaborador: { label: 'Colaborador', badgeClass: 'selo-neutro' },
  compras: { label: 'Compras', badgeClass: 'selo-neutro' },
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
    <div className={`${tamanho} rounded-lg bg-blue-600 text-white flex items-center justify-center font-semibold`} aria-hidden="true">
      {iniciais}
    </div>
  );
};

/**
 * Cabeçalho do sistema (seção 19): altura fixa de 64px (o cabeçalho das tabelas
 * gruda logo abaixo), ícones de 16px, avatar e contadores por classe.
 */
export const Header: React.FC<HeaderProps> = ({ currentView, onAbrirMenu, menuAberto, onNavigate }) => {
  const { currentUser, currentRole, supabaseUser, logout, podeDescartarPendencias, settings, terms } = useApp();
  // T.I./admin não têm Minha área no menu: Meus equipamentos fica aqui, com o aviso de termo a assinar
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const termosParaAssinar = terms.filter((t) => t.colaboradorId === currentUser?.id && termoAberto(t) && !t.aceiteColaboradorEm && !termoContestadoAberto(t)).length;
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);
  const [showMeusDados, setShowMeusDados] = useState(false);

  const titulo = TITULO_VISTA[currentView as Vista] || 'Início';
  useEffect(() => {
    document.title = `${titulo} · Nexus`;
  }, [titulo]);

  const userAvatar = currentUser?.avatarUrl || supabaseUser?.avatarUrl;
  const papel = ROTULO_PAPEL[currentRole] || ROTULO_PAPEL.colaborador;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menu"
          aria-controls="menu-principal"
          aria-expanded={menuAberto}
          className="btn-icone -ml-1 p-2 lg:hidden"
        >
          <Menu className="ico-lg" />
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <LogoEmpresa />
          <span className="hidden font-semibold tracking-tight whitespace-nowrap text-slate-900 sm:inline">
            {settings.nomeFantasia ? 'Nexus' : 'Nexus IT & HR'}
          </span>
        </div>
        <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
          /
        </span>
        <h1 className="truncate font-semibold text-slate-900">{titulo}</h1>
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowSwitchMenu(!showSwitchMenu)}
          aria-haspopup="menu"
          aria-expanded={showSwitchMenu}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 transition-colors hover:bg-slate-100"
        >
          {userAvatar ? (
            <img src={userAvatar} alt="" className="avatar" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar">{currentUser?.nome.charAt(0) || 'U'}</span>
          )}
          <span className="hidden text-left md:block">
            <span className="block max-w-[160px] truncate leading-tight font-semibold text-slate-900">
              {currentUser?.nome || supabaseUser?.nome || 'Usuário'}
            </span>
            <span className="texto-aux block leading-tight">{papel.label}</span>
          </span>
          {isTI && termosParaAssinar > 0 && (
            <span className="contador contador-atencao" title={`${termosParaAssinar} termo(s) para você assinar`}>
              {termosParaAssinar}
            </span>
          )}
          <ChevronDown className="ico text-slate-500" aria-hidden="true" />
          <span className="sr-only">Abrir menu da conta</span>
        </button>

        {showSwitchMenu && (
          <div role="menu" className="cartao absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] py-2 shadow-lg">
            <div className="border-b border-slate-100 px-4 py-2">
              <p className="truncate font-semibold text-slate-900">{currentUser?.nome || supabaseUser?.nome}</p>
              <p className="texto-aux truncate">{currentUser?.email || supabaseUser?.email}</p>
              <span className={`selo mt-2 ${papel.badgeClass}`}>{papel.label}</span>
            </div>
            {/* Seção 19: densidade das tabelas, escolha de cada pessoa (fica neste navegador) */}
            <div className="space-y-1 border-b border-slate-100 px-4 py-2">
              <p className="texto-aux">Tabelas</p>
              <SeletorDensidade cheio />
              <p className="texto-aux pt-1">Aparência</p>
              <SeletorTema cheio />
            </div>
            <div className="space-y-1 px-1 pt-1">
              {isTI && onNavigate && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowSwitchMenu(false);
                    onNavigate('my_assets');
                  }}
                  className="nav-item px-3 py-2"
                >
                  <Briefcase aria-hidden="true" />
                  <span className="flex-1">Meus equipamentos</span>
                  {termosParaAssinar > 0 && <span className="contador contador-atencao">{termosParaAssinar} a assinar</span>}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowSwitchMenu(false);
                  setShowMeusDados(true);
                }}
                className="nav-item px-3 py-2"
              >
                <Shield aria-hidden="true" />
                <span>Meus dados (LGPD)</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowSwitchMenu(false);
                  void podeDescartarPendencias().then((ok) => ok && logout());
                }}
                className="nav-item nav-item-perigo px-3 py-2"
              >
                <LogOut aria-hidden="true" />
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
