/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { Header } from './components/layout/Header.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { LoginView } from './components/auth/LoginView.tsx';
import { DashboardView } from './components/dashboard/DashboardView.tsx';
import { AssetsView } from './components/assets/AssetsView.tsx';
import { CollaboratorsView } from './components/collaborators/CollaboratorsView.tsx';
import { ServiceDeskView } from './components/servicedesk/ServiceDeskView.tsx';
import { RhProcessesView } from './components/rh/RhProcessesView.tsx';
import { TermsView } from './components/terms/TermsView.tsx';
import { SettingsView } from './components/settings/SettingsView.tsx';
import { MyAssetsView } from './components/collaborators/MyAssetsView.tsx';
import { MyTicketsView } from './components/servicedesk/MyTicketsView.tsx';
import { NewTicketModal } from './components/servicedesk/NewTicketModal.tsx';
import { Asset360Modal } from './components/assets/Asset360Modal.tsx';
import { Employee360Modal } from './components/collaborators/Employee360Modal.tsx';
import { TicketDetailModal } from './components/servicedesk/TicketDetailModal.tsx';
import { PrintableTermModal } from './components/terms/PrintableTermModal.tsx';
import { QrCodeLabelModal } from './components/assets/QrCodeLabelModal.tsx';
import { Software360Modal } from './components/assets/Software360Modal.tsx';
import { SoftwareFormModal } from './components/assets/SoftwareFormModal.tsx';

function MainApp() {
  const {
    currentUser,
    currentRole,
    authLoading,
    selectedAssetIdFor360,
    setSelectedAssetIdFor360,
    selectedEmployeeIdFor360,
    setSelectedEmployeeIdFor360,
    selectedSoftwareIdFor360,
    setSelectedSoftwareIdFor360,
    softwareModalOpen,
    setSoftwareModalOpen,
    softwareToEdit,
    setSoftwareToEdit,
    selectedTicketIdForDetail,
    setSelectedTicketIdForDetail,
    selectedTermForPrint,
    setSelectedTermForPrint,
    selectedAssetForQrCode,
    setSelectedAssetForQrCode,
  } = useApp();

  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);

  // AUDITORIA RBAC: Impedir navegação ou desvios de rotas não autorizadas por papel
  useEffect(() => {
    if (!currentUser) return;

    if (currentRole === 'colaborador') {
      const allowedColaboradorViews = ['my_assets', 'my_tickets'];
      if (!allowedColaboradorViews.includes(currentView)) {
        setCurrentView('my_assets');
      }
    } else if (currentRole === 'rh') {
      const forbiddenRhViews = ['settings', 'dashboard'];
      if (forbiddenRhViews.includes(currentView)) {
        setCurrentView('rh_processes');
      }
    }
  }, [currentRole, currentUser, currentView]);

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

  // Se não estiver logado, exibe tela de login corporativo
  if (!currentUser) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* Barra Superior Corporativa (Zone Contract) */}
      <Header currentView={currentView} />

      <div className="flex-1 flex min-h-[calc(100vh-57px)]">
        {/* Menu Lateral Adaptativo por Perfil */}
        <Sidebar
          currentView={currentView}
          onNavigate={(view) => setCurrentView(view)}
          onOpenNewTicketModal={() => setShowNewTicketModal(true)}
        />

        {/* Viewport Principal com visual leve, respirável e sem densidade pesada */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full overflow-x-hidden">
          {currentView === 'dashboard' && <DashboardView onNavigate={(view) => setCurrentView(view)} />}
          {currentView === 'assets' && <AssetsView />}
          {currentView === 'collaborators' && <CollaboratorsView />}
          {currentView === 'servicedesk' && (
            <ServiceDeskView onOpenNewTicketModal={() => setShowNewTicketModal(true)} />
          )}
          {currentView === 'rh_processes' && <RhProcessesView />}
          {currentView === 'terms' && <TermsView />}
          {currentView === 'settings' && <SettingsView />}
          {currentView === 'my_assets' && (
            <MyAssetsView
              onOpenNewTicketForAsset={(assetId) => {
                setShowNewTicketModal(true);
              }}
            />
          )}
          {currentView === 'my_tickets' && (
            <MyTicketsView onOpenNewTicketModal={() => setShowNewTicketModal(true)} />
          )}
        </main>
      </div>

      {/* Modais Globais de Rastreabilidade Relacional 360° e Impressão */}
      {showNewTicketModal && (
        <NewTicketModal onClose={() => setShowNewTicketModal(false)} />
      )}

      {selectedAssetIdFor360 && (
        <Asset360Modal
          assetId={selectedAssetIdFor360}
          onClose={() => setSelectedAssetIdFor360(null)}
        />
      )}

      {selectedEmployeeIdFor360 && (
        <Employee360Modal
          employeeId={selectedEmployeeIdFor360}
          onClose={() => setSelectedEmployeeIdFor360(null)}
        />
      )}

      {selectedTicketIdForDetail && (
        <TicketDetailModal
          ticketId={selectedTicketIdForDetail}
          onClose={() => setSelectedTicketIdForDetail(null)}
        />
      )}

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

      {selectedSoftwareIdFor360 && (
        <Software360Modal
          softwareId={selectedSoftwareIdFor360}
          onClose={() => setSelectedSoftwareIdFor360(null)}
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
