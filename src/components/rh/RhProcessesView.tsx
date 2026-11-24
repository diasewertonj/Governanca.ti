import React, { useState } from 'react';
import { HistoricoProcessos, type FiltroSituacaoProcesso, type FiltroTipoProcesso } from './HistoricoProcessos.tsx';
import { Busca, CabecalhoTela } from '../ui/Tela.tsx';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate, isoLocal } from '../../utils/formatters.ts';
import { descricaoAdmissao } from '../../utils/admissao.ts';
import { chamadoEncerrado } from '../../utils/atendimento.ts';
import type { CatalogoItem } from '../../types/index.ts';
import {
  UserPlus,
  UserMinus,
  Laptop,
  Mail,
  HardDrive,
  Truck,
  CheckCircle2,
  ExternalLink,
  Send,
} from 'lucide-react';

export const RhProcessesView: React.FC = () => {
  const {
    employees,
    departments,
    assets,
    licenses,
    catalogo,
    tickets,
    currentUser,
    currentRole,
    createTicket,
    setSelectedTicketIdForDetail,
    setSelectedAssetIdFor360,
  } = useApp();
  // Perfis de T.I. só a própria T.I. sugere (o RH escolhe entre colaborador e RH)
  const sugereTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';

  // Abre no histórico; os formulários só aparecem em Nova admissão / Novo desligamento
  const [activeTab, setActiveTab] = useState<'lista' | 'offboarding' | 'onboarding'>('lista');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Filtros do histórico (ficam no cabeçalho da tela)
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipoProcesso>('todos');
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacaoProcesso>('andamento');
  const [filtroBusca, setFiltroBusca] = useState('');
  const processos = tickets.filter((t) => t.tipo === 'onboarding' || t.tipo === 'offboarding');
  const qtdAndamento = processos.filter((t) => t.status !== 'resolvido' && t.status !== 'cancelado').length;

  // Estados do Offboarding
  const [selectedColabId, setSelectedColabId] = useState('');
  const [dataDesligamento, setDataDesligamento] = useState(() =>
    isoLocal(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000))
  );
  const [redirecionarEmail, setRedirecionarEmail] = useState(true);
  const [destinatarioEmailId, setDestinatarioEmailId] = useState('');
  const [transferirDrive, setTransferirDrive] = useState(true);
  const [destinatarioDriveId, setDestinatarioDriveId] = useState('');
  const [recolhimentoInstrucoes, setRecolhimentoInstrucoes] = useState(
    'Devolução presencial agendada na recepção da filial central ou entrega direta ao gestor imediato.'
  );
  const [observacoesOff, setObservacoesOff] = useState('');

  // Estados do Onboarding
  const [onbNome, setOnbNome] = useState('');
  const [onbEmail, setOnbEmail] = useState('');
  const [onbCargo, setOnbCargo] = useState('');
  const [onbSetorId, setOnbSetorId] = useState(departments[0]?.id || 'dep-1');
  const [onbGestorId, setOnbGestorId] = useState('');
  const [onbPapelAcesso, setOnbPapelAcesso] = useState<'colaborador' | 'rh' | 'ti_suporte' | 'ti_admin'>('colaborador');
  const [onbDataInicio, setOnbDataInicio] = useState(() =>
    isoLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  );
  // Observação livre sobre o equipamento (o RH não escolhe modelo)
  const [onbTipoComputador, setOnbTipoComputador] = useState('');
  // Fase 6: kit e acessos vêm do catálogo da T.I. Os sugeridos já vêm marcados;
  // o RH marca/desmarca e a T.I. decide o pacote final no checklist.
  const [kitEscolha, setKitEscolha] = useState<Record<string, boolean>>({});
  const [onbGruposEmail, setOnbGruposEmail] = useState('');
  const [onbOutrosAcessos, setOnbOutrosAcessos] = useState('');
  const [onbObservacoes, setOnbObservacoes] = useState('');

  const separarLista = (texto: string) =>
    texto
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  const catalogoAtivo = catalogo.filter((c) => c.ativo).sort((a, b) => a.ordem - b.ordem);
  const marcado = (c: CatalogoItem) => kitEscolha[c.id] ?? c.sugeridoOnboarding;
  const alternar = (c: CatalogoItem) => setKitEscolha((p) => ({ ...p, [c.id]: !marcado(c) }));
  const itensKit = catalogoAtivo.filter((c) => c.tipo === 'equipamento' || c.tipo === 'acessorio');
  const itensAcesso = catalogoAtivo.filter((c) => c.tipo === 'conta');
  const onbPerifericos = itensKit.filter(marcado).map((c) => c.nome);
  const onbAcessos = [...itensAcesso.filter(marcado).map((c) => c.nome), ...separarLista(onbOutrosAcessos)];

  const activeEmployees = employees.filter((e) => e.status === 'ativo');
  const selectedColaborador = employees.find((e) => e.id === selectedColabId);
  // Lote 1: um desligamento aberto por pessoa (o banco também recusa)
  const desligamentoAberto = (colabId: string) =>
    tickets.find(
      (t) =>
        t.tipo === 'offboarding' &&
        !chamadoEncerrado(t) &&
        (t.colaboradorId || t.offboarding?.colaboradorId) === colabId
    );
  const desligamentoJaAberto = selectedColabId ? desligamentoAberto(selectedColabId) : undefined;

  // INVENTÁRIO INSTANTÂNEO do colaborador selecionado no Offboarding
  const colabAssets = assets.filter((a) => a.custodianteId === selectedColabId);
  const colabLicenses = licenses.filter((l) => l.colaboradoresIds.includes(selectedColabId));

  // Submissão do Offboarding Inteligente
  const handleOffboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedColaborador || desligamentoJaAberto) return;

    // Fase 6: o checklist é montado pela T.I. no chamado, a partir do inventário
    // real da pessoa (contas, grupos, equipamentos, acessórios e licenças).
    const ticket = await createTicket({
      colaboradorId: selectedColaborador.id,
      tipo: 'offboarding',
      solicitanteId: currentUser?.id || 'emp-2',
      solicitanteNome: `${currentUser?.nome || 'RH'} (Gente & Gestão)`,
      solicitanteEmail: currentUser?.email || 'rh@nexuscorp.com.br',
      solicitanteCargo: currentUser?.cargo || 'Recursos Humanos',
      solicitanteSetorNome: 'Recursos Humanos',
      titulo: `Offboarding & Desligamento: ${selectedColaborador.nome} (${selectedColaborador.matricula})`,
      categoria: 'Offboarding de Colaborador',
      prioridade: 'critica',
      status: 'aberto',
      // Descrição curta: o restante fica organizado no pedido
      descricao: `Desligamento de ${selectedColaborador.nome} · ${selectedColaborador.cargo}. Último dia: ${formatDate(dataDesligamento)}.`,
      anexos: [],
      offboarding: {
        colaboradorId: selectedColaborador.id, // Fase 3: usado na conclusão automática
        dataDesligamento,
        redirecionarEmail,
        redirecionarEmailParaId: destinatarioEmailId || undefined,
        transferirDrive,
        transferirDriveParaId: destinatarioDriveId || undefined,
        recolhimentoInstrucoes,
        observacoes: observacoesOff,
        checklist: [],
      },
    });
    if (!ticket) return; // o erro já aparece no aviso global

    setSuccessMessage(`Requisição de Offboarding aberta com sucesso (${ticket.codigo})!`);
    setSelectedColabId('');
    setTimeout(() => {
      setSuccessMessage(null);
      setSelectedTicketIdForDetail(ticket.id);
    }, 1500);
  };

  // Submissão do Onboarding
  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onbNome.trim() || !onbEmail.trim()) return;

    const setor = departments.find((d) => d.id === onbSetorId);
    const gestor = employees.find((e) => e.id === onbGestorId);

    const ticket = await createTicket({
      tipo: 'onboarding',
      solicitanteId: currentUser?.id || 'emp-2',
      solicitanteNome: `${currentUser?.nome || 'RH'} (Gente & Gestão)`,
      solicitanteEmail: currentUser?.email || 'rh@nexuscorp.com.br',
      solicitanteCargo: currentUser?.cargo || 'Recursos Humanos',
      solicitanteSetorNome: 'Recursos Humanos',
      titulo: `Admissão & Kit de Entrada: ${onbNome} (${onbCargo})`,
      categoria: 'Onboarding de Colaborador',
      prioridade: 'alta',
      status: 'aberto',
      // Ajuste da admissão: descrição curta; acessos e periféricos já ficam organizados no pedido
      descricao: descricaoAdmissao({
        nome: onbNome,
        cargo: onbCargo,
        setor: setor?.nome,
        gestor: gestor?.nome,
        inicio: formatDate(onbDataInicio),
      }),
      anexos: [],
      onboarding: {
        nomeColaborador: onbNome,
        emailColaborador: onbEmail,
        cargo: onbCargo,
        setorId: onbSetorId,
        gestorId: onbGestorId || undefined,
        dataAdmissao: onbDataInicio,
        papelAcessoSugerido: onbPapelAcesso,
        tipoComputador: onbTipoComputador.trim(),
        perifericos: onbPerifericos,
        acessosSoftwares: onbAcessos,
        gruposEmail: separarLista(onbGruposEmail),
        observacoes: onbObservacoes,
      },
    });
    if (!ticket) return; // o erro já aparece no aviso global

    setSuccessMessage(`Requisição de Onboarding ${ticket.codigo} enviada para a equipe de T.I.!`);
    setOnbNome('');
    setOnbEmail('');
    setOnbCargo('');
    setKitEscolha({});
    setOnbGruposEmail('');
    setOnbOutrosAcessos('');
    setTimeout(() => {
      setSuccessMessage(null);
      setActiveTab('lista');
      setSelectedTicketIdForDetail(ticket.id);
    }, 1500);
  };

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo={activeTab === 'lista' ? 'Admissões e desligamentos' : activeTab === 'onboarding' ? 'Nova admissão' : 'Novo desligamento'}
        subtitulo={activeTab === 'lista' ? 'Histórico e andamento de todos os processos' : 'Preencha o pedido; a T.I. recebe e monta o checklist'}
        filtros={
          activeTab === 'lista' ? (
            <>
              <Busca id="processos-busca" valor={filtroBusca} onMudar={setFiltroBusca} placeholder="Buscar pessoa ou código..." />
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as FiltroTipoProcesso)} aria-label="Tipo" className="campo campo-sm">
                <option value="todos">Admissões e desligamentos</option>
                <option value="onboarding">Só admissões</option>
                <option value="offboarding">Só desligamentos</option>
              </select>
              <select value={filtroSituacao} onChange={(e) => setFiltroSituacao(e.target.value as FiltroSituacaoProcesso)} aria-label="Situação" className="campo campo-sm">
                <option value="andamento">Em andamento ({qtdAndamento})</option>
                <option value="concluidos">Concluídos</option>
                <option value="cancelados">Cancelados</option>
                <option value="todos">Todos ({processos.length})</option>
              </select>
            </>
          ) : undefined
        }
        acoes={
          // Com um formulário aberto, só o caminho de volta (o envio fica no rodapé do formulário)
          activeTab !== 'lista' ? (
            <button type="button" onClick={() => setActiveTab('lista')} className="btn btn-secundario">
              Voltar ao histórico
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setActiveTab('offboarding')} className="btn btn-secundario">
                <UserMinus /> Novo desligamento
              </button>
              <button type="button" onClick={() => setActiveTab('onboarding')} className="btn btn-primario">
                <UserPlus /> Nova admissão
              </button>
            </>
          )
        }
      />
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="ico text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {activeTab === 'lista' && <HistoricoProcessos tipo={filtroTipo} situacao={filtroSituacao} busca={filtroBusca} />}

      {/* MÓDULO 1: OFFBOARDING INTELIGENTE & CONDICIONAL */}
      {activeTab === 'offboarding' && (
        <form onSubmit={handleOffboardingSubmit} className="space-y-6">
          <div className="cartao p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="secao-titulo flex items-center gap-2">
                <UserMinus className="ico text-red-700" />
                Dados do Desligamento
              </h3>
              <p className="texto-aux mt-0.5">
                Selecione o colaborador para auditar o inventário em posse e configurar as ações de transição
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="rh-campo-1" className="rotulo">
                  Colaborador a ser Desligado (Seleção Dinâmica)
                </label>
                <select id="rh-campo-1"
                  value={selectedColabId}
                  onChange={(e) => {
                    setSelectedColabId(e.target.value);
                    const colab = employees.find((emp) => emp.id === e.target.value);
                    // Sugerir o gestor como destinatário se existir
                    if (colab?.gestorId) {
                      setDestinatarioEmailId(colab.gestorId);
                      setDestinatarioDriveId(colab.gestorId);
                    }
                  }}
                  required
                  className="campo w-full"
                >
                  <option value="">Selecione um colaborador ativo...</option>
                  {activeEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nome} ({emp.cargo} · Matrícula {emp.matricula})
                      {desligamentoAberto(emp.id) ? ' — desligamento em andamento' : ''}
                    </option>
                  ))}
                </select>
                {desligamentoJaAberto && (
                  <div role="alert" className="mt-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    Já existe um desligamento em andamento para esta pessoa ({desligamentoJaAberto.codigo}).{' '}
                    <button
                      type="button"
                      onClick={() => setSelectedTicketIdForDetail(desligamentoJaAberto.id)}
                      className="font-semibold underline hover:text-amber-900"
                    >
                      Abrir o processo
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="rh-campo-2" className="rotulo">
                  Data do Último Dia de Trabalho
                </label>
                <input id="rh-campo-2"
                  type="date"
                  required
                  value={dataDesligamento}
                  onChange={(e) => setDataDesligamento(e.target.value)}
                  className="campo w-full"
                />
              </div>
            </div>

            {/* INVENTÁRIO INSTANTÂNEO CARREGADO AUTOMATICAMENTE */}
            {selectedColaborador && (
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Laptop className="ico text-blue-600" />
                    <h4 className="secao-titulo">
                      Equipamentos e softwares com {selectedColaborador.nome} (a T.I. recolhe e desvincula)
                    </h4>
                  </div>
                  <span className="texto-aux font-mono">
                    {colabAssets.length} equipamento(s) · {colabLicenses.length} licença(s)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Equipamentos Físicos */}
                  <div className="space-y-2">
                    <span className="font-semibold text-slate-700 block">
                      Equipamentos
                    </span>
                    {colabAssets.length > 0 ? (
                      <div className="space-y-2">
                        {colabAssets.map((asset) => (
                          <div
                            key={asset.id}
                            className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-blue-700">{asset.tag}</span>
                                <span className="font-semibold text-slate-900">{asset.nome}</span>
                              </div>
                              <p className="texto-aux mt-0.5">
                                {asset.marca} {asset.modelo} · S/N: <span className="font-mono">{asset.serialNumber}</span>
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedAssetIdFor360(asset.id)}
                              className="link flex items-center gap-0.5"
                            >
                              Ver ficha
                              <ExternalLink className="ico-sm" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="texto-aux italic py-2">
                        Nenhum equipamento físico registrado sob a posse deste colaborador.
                      </p>
                    )}
                  </div>

                  {/* Licenças & Acessos */}
                  <div className="space-y-2">
                    <span className="font-semibold text-slate-700 block">
                      Softwares e licenças
                    </span>
                    {colabLicenses.length > 0 ? (
                      <div className="space-y-2">
                        {colabLicenses.map((lic) => (
                          <div
                            key={lic.id}
                            className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between"
                          >
                            <span className="font-semibold text-slate-800">{lic.nome}</span>
                            <span className="texto-aux bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                              A T.I. desvincula
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="texto-aux italic py-2">
                        Nenhuma licença corporativa individual atribuída.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* REGRAS CONDICIONAIS COM DROPDOWNS DINÂMICOS */}
            <div className="space-y-4 pt-2">
              <h4 className="secao-titulo">
                Regras de Transição e Continuidade Operacional
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Regra 1: Redirecionamento de E-mail */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={redirecionarEmail}
                    onChange={(e) => setRedirecionarEmail(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-2">
                    <Mail className="ico text-slate-600" />
                    <span className="font-semibold text-slate-900">
                      Redirecionar E-mails Corporativos (Exchange / Google Workspace)
                    </span>
                  </div>
                </label>

                {redirecionarEmail && (
                  <div className="pl-6 pt-1">
                    <label htmlFor="rh-campo-3" className="rotulo">
                      Destinatário que receberá os e-mails (Colaborador Ativo)
                    </label>
                    <select id="rh-campo-3"
                      value={destinatarioEmailId}
                      onChange={(e) => setDestinatarioEmailId(e.target.value)}
                      required={redirecionarEmail}
                      className="campo campo-sm w-full"
                    >
                      <option value="">Selecione o destinatário...</option>
                      {activeEmployees
                        .filter((e) => e.id !== selectedColabId)
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.nome} ({emp.cargo})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Regra 2: Transferência de Google Drive / Pastas */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transferirDrive}
                    onChange={(e) => setTransferirDrive(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-2">
                    <HardDrive className="ico text-slate-600" />
                    <span className="font-semibold text-slate-900">
                      Transferir Custódia de Arquivos e Pastas do Google Drive / Nuvem
                    </span>
                  </div>
                </label>

                {transferirDrive && (
                  <div className="pl-6 pt-1">
                    <label htmlFor="rh-campo-4" className="rotulo">
                      Destinatário que receberá a propriedade dos arquivos
                    </label>
                    <select id="rh-campo-4"
                      value={destinatarioDriveId}
                      onChange={(e) => setDestinatarioDriveId(e.target.value)}
                      required={transferirDrive}
                      className="campo campo-sm w-full"
                    >
                      <option value="">Selecione o destinatário...</option>
                      {activeEmployees
                        .filter((e) => e.id !== selectedColabId)
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.nome} ({emp.cargo})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
              </div>

              {/* Regra 3: Logística de Recolhimento */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Truck className="ico text-slate-600" />
                  <label className="font-semibold text-slate-900">
                    Instruções Logísticas de Recolhimento dos Equipamentos
                  </label>
                </div>
                <input
                  type="text"
                  value={recolhimentoInstrucoes}
                  onChange={(e) => setRecolhimentoInstrucoes(e.target.value)}
                  placeholder="Ex: Entrega presencial ao gestor, portaria central ou código reverso dos Correios"
                  className="campo w-full"
                />
              </div>

              {/* Observações Livres */}
              <div>
                <label htmlFor="rh-campo-5" className="rotulo">
                  Observações Operacionais do Desligamento
                </label>
                <textarea id="rh-campo-5"
                  rows={2}
                  value={observacoesOff}
                  onChange={(e) => setObservacoesOff(e.target.value)}
                  placeholder="Particularidades do encerramento contratual, data de corte de acesso ou prazos..."
                  className="campo w-full"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setActiveTab('lista')} className="btn btn-secundario">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!selectedColaborador || !!desligamentoJaAberto}
                className="btn btn-primario"
              >
                <Send />
                <span>Enviar pedido de desligamento</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* MÓDULO 2: SOLICITAÇÃO DE ONBOARDING */}
      {activeTab === 'onboarding' && (
        <form onSubmit={handleOnboardingSubmit} className="space-y-6">
          <div className="cartao p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="secao-titulo flex items-center gap-2">
                <UserPlus className="ico text-blue-600" />
                Solicitação de Admissão & Kit de Trabalho
              </h3>
              <p className="texto-aux mt-0.5">
                Defina os dados do admitido e o pacote operacional desejado sem complexidade técnica
              </p>
            </div>

            <div className="space-y-3">
            <h4 className="secao-titulo">Dados do admitido</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label htmlFor="rh-campo-6" className="rotulo">
                  Nome Completo do Novo Colaborador
                </label>
                <input id="rh-campo-6"
                  type="text"
                  required
                  value={onbNome}
                  onChange={(e) => setOnbNome(e.target.value)}
                  placeholder="Ex: Gustavo Henrique Ribeiro"
                  className="campo w-full"
                />
              </div>

              <div>
                <label htmlFor="rh-campo-7" className="rotulo">
                  E-mail Corporativo Sugerido
                </label>
                <input id="rh-campo-7"
                  type="email"
                  required
                  value={onbEmail}
                  onChange={(e) => setOnbEmail(e.target.value)}
                  placeholder="nome@empresa.com.br"
                  className="campo w-full"
                />
              </div>

              <div>
                <label htmlFor="rh-campo-8" className="rotulo">
                  Cargo / Função
                </label>
                <input id="rh-campo-8"
                  type="text"
                  required
                  value={onbCargo}
                  onChange={(e) => setOnbCargo(e.target.value)}
                  placeholder="Ex: Desenvolvedor Front-end"
                  className="campo w-full"
                />
              </div>

              <div>
                <label htmlFor="rh-campo-9" className="rotulo">
                  Setor / Departamento
                </label>
                <select id="rh-campo-9"
                  value={onbSetorId}
                  onChange={(e) => setOnbSetorId(e.target.value)}
                  className="campo w-full"
                >
                  {departments
                    .filter((d) => d.ativo)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nome}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label htmlFor="rh-campo-10" className="rotulo">
                  Líder Imediato / Gestor
                </label>
                <select id="rh-campo-10"
                  value={onbGestorId}
                  onChange={(e) => setOnbGestorId(e.target.value)}
                  className="campo w-full"
                >
                  <option value="">Selecione o gestor...</option>
                  {activeEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nome} ({emp.cargo})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="rh-campo-11" className="rotulo">
                  Data de Início Prevista
                </label>
                <input id="rh-campo-11"
                  type="date"
                  required
                  value={onbDataInicio}
                  onChange={(e) => setOnbDataInicio(e.target.value)}
                  className="campo w-full"
                />
              </div>
            </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-100">
              <h4 className="secao-titulo">Equipamento</h4>
              {/* Ajuste da admissão: o RH não escolhe modelo; no máximo descreve uma necessidade */}
              <div>
                <label htmlFor="onb-obs-equipamento" className="rotulo">
                  Observação sobre o equipamento <span className="font-normal text-slate-500">(opcional)</span>
                </label>
                <input
                  id="onb-obs-equipamento"
                  type="text"
                  value={onbTipoComputador}
                  onChange={(e) => setOnbTipoComputador(e.target.value)}
                  placeholder="Ex.: precisa de dois monitores; trabalha com edição de vídeo"
                  className="campo w-full"
                />
                <span className="texto-aux mt-0.5 block">A T.I. escolhe o equipamento no estoque.</span>
              </div>

            {/* Fase 6: kit sugerido (catálogo da T.I.) */}
            <div>
              <label className="rotulo">Equipamentos e acessórios</label>
              <p className="texto-aux mb-2">
                Sugestão padrão da T.I. — desmarque o que não precisa. A T.I. confirma o kit final.
              </p>
              <div className="flex flex-wrap gap-2">
                {itensKit.map((c) => {
                  const selected = marcado(c);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => alternar(c)}
                      aria-pressed={selected}
                      className={`px-3 py-2 rounded-lg border transition-colors ${
                        selected
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {selected ? '✓ ' : '+ '}
                      {c.nome}
                    </button>
                  );
                })}
              </div>
            </div>

            </div>

            <div className="space-y-3 pt-3 border-t border-slate-100">
              <h4 className="secao-titulo">Acessos</h4>
              <div>
                <label htmlFor="rh-campo-12" className="rotulo">
                  Nível de Acesso Sugerido ao Sistema
                </label>
                <select id="rh-campo-12"
                  value={onbPapelAcesso}
                  onChange={(e) => setOnbPapelAcesso(e.target.value as 'colaborador' | 'rh' | 'ti_suporte' | 'ti_admin')}
                  className="campo w-full"
                >
                  <option value="colaborador">Colaborador Padrão (Solicitante)</option>
                  <option value="rh">Recursos Humanos (admissões e desligamentos)</option>
                  {sugereTI && <option value="ti_suporte">Técnico de Suporte T.I.</option>}
                  {sugereTI && <option value="ti_admin">Administrador de T.I. (Acesso Total)</option>}
                </select>
                <span className="texto-aux mt-0.5 block">
                  Pré-define as permissões do novo usuário pós-login
                </span>
              </div>

            {/* Fase 6: contas (catálogo) + outros acessos + grupos de e-mail */}
            <div>
              <label className="rotulo">Contas e acessos</label>
              <div className="flex flex-wrap gap-2">
                {itensAcesso.map((c) => {
                  const selected = marcado(c);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => alternar(c)}
                      aria-pressed={selected}
                      className={`px-3 py-2 rounded-lg border transition-colors ${
                        selected
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {selected ? '✓ ' : '+ '}
                      {c.nome}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div>
                  <label htmlFor="rh-campo-13" className="rotulo">Outros sistemas (opcional)</label>
                  <input id="rh-campo-13"
                    value={onbOutrosAcessos}
                    onChange={(e) => setOnbOutrosAcessos(e.target.value)}
                    placeholder="Ex.: Figma, VPN, ERP (separe por vírgula)"
                    className="campo w-full"
                  />
                </div>
                <div>
                  <label htmlFor="rh-campo-14" className="rotulo">
                    Grupos de e-mail sugeridos (opcional)
                  </label>
                  <input id="rh-campo-14"
                    value={onbGruposEmail}
                    onChange={(e) => setOnbGruposEmail(e.target.value)}
                    placeholder="Ex.: comercial@empresa.com.br, todos@..."
                    className="campo w-full"
                  />
                </div>
              </div>
            </div>
            </div>

            <div>
              <label htmlFor="rh-campo-15" className="rotulo">
                Instruções de Entrega / Modelo Híbrido
              </label>
              <textarea id="rh-campo-15"
                rows={2}
                value={onbObservacoes}
                onChange={(e) => setOnbObservacoes(e.target.value)}
                placeholder="Endereço de envio residencial ou retirada no primeiro dia no escritório..."
                className="campo w-full"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setActiveTab('lista')} className="btn btn-secundario">
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primario"
              >
                <Send />
                <span>Enviar pedido de admissão</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
