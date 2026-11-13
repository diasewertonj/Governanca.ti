/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useCallback, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { vistaPermitida } from './utils/permissoes.ts';
import { Header } from './components/layout/Header.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { LoginView } from './components/auth/LoginView.tsx';
import { DefinirSenhaView } from './components/auth/DefinirSenhaView.tsx';

// Fase 4: telas e modais carregam sob demanda (bundle inicial menor)
const DashboardView = lazy(() => import('./components/dashboard/DashboardView.tsx').then((m) => ({ default: m.DashboardView })));
const AssetsView = lazy(() => import('./components/assets/AssetsView.tsx').then((m) => ({ default: m.AssetsView })));
const FornecedoresView = lazy(() => import('./components/fornecedores/FornecedoresView.tsx').then((m) => ({ default: m.FornecedoresView })));
const CollaboratorsView = lazy(() => import('./components/collaborators/CollaboratorsView.tsx').then((m) => ({ default: m.CollaboratorsView })));
const ServiceDeskView = lazy(() => import('./components/servicedesk/ServiceDeskView.tsx').then((m) => ({ default: m.ServiceDeskView })));
const RhProcessesView = lazy(() => import('./components/rh/RhProcessesView.tsx').then((m) => ({ default: m.RhProcessesView })));
const TermsView = lazy(() => import('./components/terms/TermsView.tsx').then((m) => ({ default: m.TermsView })));
const RhInicioView = lazy(() => import('./components/rh/RhInicioView.tsx').then((m) => ({ default: m.RhInicioView })));
const LembretesView = lazy(() => import('./components/lembretes/LembretesView.tsx').then((m) => ({ default: m.LembretesView })));
const SettingsView = lazy(() => import('./components/settings/SettingsView.tsx').then((m) => ({ default: m.SettingsView })));
const MyAssetsView = lazy(() => import('./components/collaborators/MyAssetsView.tsx').then((m) => ({ default: m.MyAssetsView })));
const MyTicketsView = lazy(() => import('./components/servicedesk/MyTicketsView.tsx').then((m) => ({ default: m.MyTicketsView })));
const NewTicketModal = lazy(() => import('./components/servicedesk/NewTicketModal.tsx').then((m) => ({ default: m.NewTicketModal })));
const Asset360Modal = lazy(() => import('./components/assets/Asset360Modal.tsx').then((m) => ({ default: m.Asset360Modal })));
const Employee360Modal = lazy(() => import('./components/collaborators/Employee360Modal.tsx').then((m) => ({ default: m.Employee360Modal })));
const TicketDetailModal = lazy(() => import('./components/servicedesk/TicketDetailModal.tsx').then((m) => ({ default: m.TicketDetailModal })));
const PrintableTermModal = lazy(() => import('./components/terms/PrintableTermModal.tsx').then((m) => ({ default: m.PrintableTermModal })));
const QrCodeLabelModal = lazy(() => import('./components/assets/QrCodeLabelModal.tsx').then((m) => ({ default: m.QrCodeLabelModal })));
const Software360Modal = lazy(() => import('./components/assets/Software360Modal.tsx').then((m) => ({ default: m.Software360Modal })));
const SoftwareFormModal = lazy(() => import('./components/assets/SoftwareFormModal.tsx').then((m) => ({ default: m.SoftwareFormModal })));

const Carregando = () => (
  <div className="py-16 flex justify-center" role="status" aria-label="Carregando">
    <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
  </div>
);

function MainApp() {
  const {
    currentUser,
    currentRole,
    authLoading,
    pilhaFichas,
    fecharFicha,
    softwareModalOpen,
    setSoftwareModalOpen,
    softwareToEdit,
    setSoftwareToEdit,
    selectedTermForPrint,
    setSelectedTermForPrint,
    selectedAssetForQrCode,
    setSelectedAssetForQrCode,
    dbErro,
    limparDbErro,
    precisaDefinirSenha,
    podeDescartarPendencias,
  } = useApp();

  const [viewSolicitada, setCurrentView] = useState<string>('dashboard');
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  // Fase 10: chamado aberto pelo painel do equipamento já vem com ele escolhido
  const [ativoNovoChamado, setAtivoNovoChamado] = useState<string | undefined>();
  // Fase 7: menu em gaveta no celular/tablet
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = useCallback(() => setMenuAberto(false), []);

  // RBAC de interface: a tela exibida é calculada a partir do papel (sem efeito
  // e sem renderização extra). A proteção real está no banco (RLS das Fases 0-1).
  const currentView = vistaPermitida(currentRole, viewSolicitada);

  // Fase 5: trocar de tela com alterações não salvas pede confirmação
  const navegar = (view: string) => {
    if (view === currentView || podeDescartarPendencias()) setCurrentView(view);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg animate-pulse">
            N
          </div>
          <span className="text-xs text-slate-500 font-medium">Carregando governança corporativa...</span>
        </div>
      </div>
    );
  }

  // Fase 3: aberto por link de convite/recuperação -> definir a senha primeiro
  if (precisaDefinirSenha) {
    return <DefinirSenhaView />;
  }

  // Se não estiver logado, exibe tela de login corporativo
  if (!currentUser) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* Barra Superior Corporativa (Zone Contract) */}
      <Header currentView={currentView} onAbrirMenu={() => setMenuAberto(true)} menuAberto={menuAberto} />

      {/* Fase 2 (CRIT-04): falha de gravação no banco nunca mais passa em silêncio */}
      {dbErro && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-[60] max-w-md flex items-start gap-3 p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 shadow-lg"
        >
          <span className="text-xs leading-relaxed flex-1">{dbErro}</span>
          <button
            type="button"
            onClick={limparDbErro}
            className="text-xs font-semibold text-rose-700 hover:text-rose-900 shrink-0"
            aria-label="Fechar aviso de erro"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="flex-1 flex min-h-[calc(100vh-57px)]">
        {/* Menu por perfil (Fase 7: gaveta abaixo de 1024px) */}
        <Sidebar
          currentView={currentView}
          onNavigate={navegar}
          onOpenNewTicketModal={() => setShowNewTicketModal(true)}
          aberto={menuAberto}
          onFechar={fecharMenu}
        />

        <main className="flex-1 min-w-0 p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-x-hidden">
          <Suspense fallback={<Carregando />}>
          {currentView === 'dashboard' &&
            (currentRole === 'rh' ? <RhInicioView onNavigate={navegar} /> : <DashboardView onNavigate={navegar} />)}
          {currentView === 'assets' && <AssetsView />}
          {currentView === 'fornecedores' && <FornecedoresView />}
          {currentView === 'collaborators' && <CollaboratorsView />}
          {currentView === 'servicedesk' && (
            <ServiceDeskView onOpenNewTicketModal={() => setShowNewTicketModal(true)} />
          )}
          {currentView === 'rh_processes' && <RhProcessesView />}
          {currentView === 'terms' && <TermsView />}
          {currentView === 'lembretes' && <LembretesView />}
          {currentView === 'settings' && <SettingsView />}
          {currentView === 'my_assets' && (
            <MyAssetsView
              onOpenNewTicketForAsset={(ativoId) => {
                setAtivoNovoChamado(ativoId);
                setShowNewTicketModal(true);
              }}
            />
          )}
          {currentView === 'my_tickets' && (
            <MyTicketsView onOpenNewTicketModal={() => setShowNewTicketModal(true)} />
          )}
          </Suspense>
        </main>
      </div>

      {/* Modais Globais de Rastreabilidade Relacional 360° e Impressão */}
      <Suspense fallback={null}>
      {showNewTicketModal && (
        <NewTicketModal
          ativoInicial={ativoNovoChamado}
          onClose={() => {
            setShowNewTicketModal(false);
            setAtivoNovoChamado(undefined);
          }}
        />
      )}

      {/* Fase 9: fichas empilhadas. Só a de cima aparece; as de baixo ficam
          montadas (escondidas) para voltar a elas do jeito que estavam. */}
      {pilhaFichas.map((ficha, posicao) => {
        const fechar = () => fecharFicha(posicao);
        return (
          <div
            key={`${posicao}:${ficha.tipo}:${ficha.id}:${ficha.manutencaoDoChamado ?? ''}`}
            className={posicao === pilhaFichas.length - 1 ? undefined : 'hidden'}
          >
            {ficha.tipo === 'ativo' && (
              <Asset360Modal assetId={ficha.id} manutencaoDoChamado={ficha.manutencaoDoChamado} onClose={fechar} />
            )}
            {ficha.tipo === 'colaborador' && <Employee360Modal employeeId={ficha.id} onClose={fechar} />}
            {ficha.tipo === 'chamado' && <TicketDetailModal ticketId={ficha.id} onClose={fechar} />}
            {ficha.tipo === 'software' && <Software360Modal softwareId={ficha.id} onClose={fechar} />}
          </div>
        );
      })}

      {selectedTermForPrint && (
        <PrintableTermModal
          term={selectedTermForPrint}
          onClose={() => setSelectedTermForPrint(null)}
        />
      )}

      {selectedAssetForQrCode && (
        <QrCodeLabelModal
          asset={selectedAssetForQrCode}
          onClose={() => setSelectedAssetForQrCode(null)}
        />
      )}

      {softwareModalOpen && (
        <SoftwareFormModal
          softwareToEdit={softwareToEdit}
          onClose={() => {
            setSoftwareModalOpen(false);
            setSoftwareToEdit(null);
          }}
        />
      )}
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
