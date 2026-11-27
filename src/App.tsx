/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { DialogoHost } from './components/ui/dialogo.tsx';
import { NavegacaoProvider } from './components/ui/navegacao.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { RecursosProvider } from './context/RecursosContext.tsx';
import { ComprasProvider, useCompras } from './context/ComprasContext.tsx';
import { vistaPermitida } from './utils/permissoes.ts';
import { avisarAlteracaoProcesso, ouvirAlteracoesProcesso, processoDestaJanela } from './utils/janelaProcesso.ts';

// Seção 19: esta aba é a janela própria de um processo (aberta pelo sistema)
const JANELA_DO_PROCESSO = processoDestaJanela();
import { Header } from './components/layout/Header.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { LoginView } from './components/auth/LoginView.tsx';
import { DefinirSenhaView } from './components/auth/DefinirSenhaView.tsx';
import { Carregando as CarregandoLista } from './components/ui/Tela.tsx';

// Fase 4: telas e modais carregam sob demanda (bundle inicial menor)
const DashboardView = lazy(() => import('./components/dashboard/DashboardView.tsx').then((m) => ({ default: m.DashboardView })));
const AssetsView = lazy(() => import('./components/assets/AssetsView.tsx').then((m) => ({ default: m.AssetsView })));
const LinhasView = lazy(() => import('./components/fornecedores/LinhasView.tsx').then((m) => ({ default: m.LinhasView })));
const FornecedoresView = lazy(() => import('./components/fornecedores/FornecedoresView.tsx').then((m) => ({ default: m.FornecedoresView })));
const FinanceiroView = lazy(() => import('./components/financeiro/DespesasView.tsx').then((m) => ({ default: m.FinanceiroView })));
const ContasView = lazy(() => import('./components/financeiro/FinanceiroViews.tsx').then((m) => ({ default: m.ContasView })));
const PainelExecutivoView = lazy(() => import('./components/gestao/GestaoViews.tsx').then((m) => ({ default: m.PainelExecutivoView })));
const OrcamentoGestaoView = lazy(() => import('./components/gestao/GestaoViews.tsx').then((m) => ({ default: m.OrcamentoGestaoView })));
const PatrimonioView = lazy(() => import('./components/gestao/GestaoViews.tsx').then((m) => ({ default: m.PatrimonioView })));
const RelatoriosView = lazy(() => import('./components/gestao/GestaoViews.tsx').then((m) => ({ default: m.RelatoriosView })));
const ImplantacaoView = lazy(() => import('./components/dashboard/ImplantacaoView.tsx').then((m) => ({ default: m.ImplantacaoView })));
const CustosMinhaAreaView = lazy(() => import('./components/gestao/GestaoViews.tsx').then((m) => ({ default: m.CustosMinhaAreaView })));
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
const PedidosCompraView = lazy(() => import('./components/compras/PedidosCompraView.tsx').then((m) => ({ default: m.PedidosCompraView })));
const ConferenciaView = lazy(() => import('./components/compras/ConferenciaView.tsx').then((m) => ({ default: m.ConferenciaView })));
const ContratoFicha = lazy(() => import('./components/fornecedores/ContratoFicha.tsx').then((m) => ({ default: m.ContratoFicha })));
const FornecedorFicha = lazy(() => import('./components/fornecedores/FornecedorFicha.tsx').then((m) => ({ default: m.FornecedorFicha })));
const FichaPedido = lazy(() => import('./components/compras/FichaPedido.tsx').then((m) => ({ default: m.FichaPedido })));
const TelaProcesso = lazy(() => import('./components/processos/TelaProcesso.tsx').then((m) => ({ default: m.TelaProcesso })));

// Seção 19: enquanto a tela carrega, esqueleto no lugar do conteúdo
const Carregando = () => (
  <div className="space-y-4">
    <div className="cartao space-y-2 p-4" role="status" aria-label="Carregando">
      <div className="esqueleto h-5 w-48" />
      <div className="esqueleto h-3 w-72 max-w-full" />
    </div>
    <CarregandoLista />
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
    processoAberto,
    fecharProcesso,
    processoItens,
    tickets,
    refreshSupabaseData,
  } = useApp();
  const { podePedirCompra, ehGestor } = useCompras();

  const [viewSolicitada, setCurrentView] = useState<string>('dashboard');
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  // Fase 10: chamado aberto pelo painel do equipamento já vem com ele escolhido
  const [ativoNovoChamado, setAtivoNovoChamado] = useState<string | undefined>();
  // Fase 7: menu em gaveta no celular/tablet
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = useCallback(() => setMenuAberto(false), []);

  // Padrão: Esc fecha a janela de cima (pelo botão Fechar dela, que já avisa alterações não salvas)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const janelas = [...document.querySelectorAll<HTMLElement>('.modal-tela')].filter((j) => j.offsetParent !== null || j.getClientRects().length);
      const topo = janelas[janelas.length - 1];
      // No caminho, Esc volta um nível (botão Voltar); sem caminho, fecha a janela
      const fechar =
        topo?.querySelector<HTMLButtonElement>('button[aria-label="Voltar"]') ||
        topo?.querySelector<HTMLButtonElement>('button[aria-label^="Fechar"]:not([aria-label="Fechar tudo"]), button[aria-label^="fechar"]');
      if (fechar) {
        e.preventDefault();
        fechar.click();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  // Seção 19: a janela do processo avisa a principal a cada mudança; a principal recarrega
  const primeiraCarga = useRef(true);
  useEffect(() => {
    if (!JANELA_DO_PROCESSO) return;
    if (primeiraCarga.current) {
      primeiraCarga.current = false;
      return;
    }
    avisarAlteracaoProcesso();
  }, [processoItens, tickets]);
  useEffect(() => {
    if (JANELA_DO_PROCESSO) return;
    return ouvirAlteracoesProcesso(() => void refreshSupabaseData());
  }, [refreshSupabaseData]);

  // RBAC de interface: a tela exibida é calculada a partir do papel (sem efeito
  // e sem renderização extra). A proteção real está no banco (RLS das Fases 0-1).
  const currentView = vistaPermitida(currentRole, viewSolicitada, { pedeCompra: podePedirCompra, gestor: ehGestor });

  // Fase 5: trocar de tela com alterações não salvas pede confirmação
  // Seção 9.2: com a tela de um processo aberta, o menu volta para a tela escolhida
  const navegar = (view: string) => {
    if (view === currentView && !processoAberto) return setCurrentView(view);
    void podeDescartarPendencias().then((ok) => {
      if (!ok) return;
      fecharProcesso();
      setCurrentView(view);
    });
  };
  // Processo só para quem vê processos (T.I. e RH); o colaborador nunca chega aqui
  const mostrarProcesso = processoAberto && currentRole !== 'colaborador';

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-semibold text-lg animate-pulse">
            N
          </div>
          <span className="texto-aux">Carregando governança corporativa...</span>
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
      {!JANELA_DO_PROCESSO && (
        <Header currentView={currentView} onAbrirMenu={() => setMenuAberto(true)} menuAberto={menuAberto} onNavigate={navegar} />
      )}

      {/* Fase 2 (CRIT-04): falha de gravação no banco nunca mais passa em silêncio */}
      {dbErro && (
        <div
          role="alert"
          className="selo-problema fixed bottom-4 right-4 z-[60] max-w-md flex items-start gap-3 p-3 rounded-xl border shadow-lg"
        >
          <span className="leading-relaxed flex-1">{dbErro}</span>
          <button
            type="button"
            onClick={limparDbErro}
            className="btn btn-sm btn-perigo shrink-0"
            aria-label="Fechar aviso de erro"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="flex-1 flex">
        {/* Menu por perfil (Fase 7: gaveta abaixo de 1024px); a janela do processo não tem menu */}
        {!JANELA_DO_PROCESSO && (
          <Sidebar
            currentView={currentView}
            onNavigate={navegar}
            onOpenNewTicketModal={() => setShowNewTicketModal(true)}
            aberto={menuAberto}
            onFechar={fecharMenu}
          />
        )}

        <main className="flex-1 min-w-0 p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-x-clip">
          <Suspense fallback={<Carregando />}>
          {mostrarProcesso ? (
            <TelaProcesso key={processoAberto} chamadoId={processoAberto} onVoltar={fecharProcesso} emJanela={Boolean(JANELA_DO_PROCESSO)} />
          ) : (
          <>
          {currentView === 'dashboard' &&
            (currentRole === 'rh' ? <RhInicioView onNavigate={navegar} /> : <DashboardView onNavigate={navegar} onAbrirChamado={() => setShowNewTicketModal(true)} />)}
          {currentView === 'assets' && <AssetsView key="hardware" modo="hardware" />}
          {currentView === 'softwares' && <AssetsView key="softwares" modo="softwares" />}
          {currentView === 'linhas' && <LinhasView />}
          {currentView === 'fornecedores' && <FornecedoresView key="fornecedores" modo="fornecedores" />}
          {currentView === 'contratos' && <FornecedoresView key="contratos" modo="contratos" />}
          {/* Seção 17: Financeiro (executar e pagar) e Gestão de T.I. (planejar e prestar contas) */}
          {/* Seção 27: Contas a pagar e a receber num item só (Recebimentos é a segunda aba) */}
          {(currentView === 'financeiro' || currentView === 'recebimentos') && (
            <ContasView key={currentView} abaInicial={currentView === 'recebimentos' ? 'receber' : 'pagar'} />
          )}
          {currentView === 'despesas' && <FinanceiroView />}
          {currentView === 'painel_executivo' && <PainelExecutivoView onNavigate={navegar} />}
          {/* Seção 23: a projeção abre como aba de Orçamento e projeção */}
          {(currentView === 'orcamento' || currentView === 'projecao') && (
            <OrcamentoGestaoView key={currentView} abaInicial={currentView === 'projecao' ? 'projecao' : 'acompanhamento'} />
          )}
          {currentView === 'patrimonio' && <PatrimonioView />}
          {currentView === 'relatorios' && <RelatoriosView />}
          {currentView === 'custos_area' && <CustosMinhaAreaView />}
          {/* Seção 31: primeiros passos e cadastros a completar, fora do Início */}
          {currentView === 'implantacao' && <ImplantacaoView onNavigate={navegar} />}
          {currentView === 'collaborators' && <CollaboratorsView />}
          {currentView === 'servicedesk' && (
            <ServiceDeskView onOpenNewTicketModal={() => setShowNewTicketModal(true)} />
          )}
          {currentView === 'rh_processes' && <RhProcessesView />}
          {currentView === 'terms' && <TermsView />}
          {currentView === 'lembretes' && <LembretesView />}
          {currentView === 'settings' && <SettingsView />}
          {currentView === 'pedidos_compra' && <PedidosCompraView />}
          {currentView === 'conferencia' && <ConferenciaView />}
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
          </>
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
            key={`${posicao}:${ficha.tipo}:${ficha.id}:${ficha.manutencaoDoChamado ?? ''}:${ficha.entregarPara ?? ''}`}
            className={posicao === pilhaFichas.length - 1 ? undefined : 'hidden'}
          >
            {ficha.tipo === 'ativo' && (
              <Asset360Modal assetId={ficha.id} manutencaoDoChamado={ficha.manutencaoDoChamado} entregarPara={ficha.entregarPara} onClose={fechar} />
            )}
            {ficha.tipo === 'colaborador' && <Employee360Modal employeeId={ficha.id} onClose={fechar} />}
            {ficha.tipo === 'chamado' && <TicketDetailModal ticketId={ficha.id} onClose={fechar} />}
            {ficha.tipo === 'software' && <Software360Modal softwareId={ficha.id} entregarPara={ficha.entregarPara} onClose={fechar} />}
            {ficha.tipo === 'contrato' && <ContratoFicha contratoId={ficha.id} onClose={fechar} />}
            {ficha.tipo === 'fornecedor' && <FornecedorFicha fornecedorId={ficha.id} onClose={fechar} />}
            {ficha.tipo === 'pedido' && <FichaPedido pedidoId={ficha.id} onClose={fechar} />}
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
      <DialogoHost />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <RecursosProvider>
        <ComprasProvider>
          <NavegacaoProvider>
            <MainApp />
          </NavegacaoProvider>
        </ComprasProvider>
      </RecursosProvider>
    </AppProvider>
  );
}
