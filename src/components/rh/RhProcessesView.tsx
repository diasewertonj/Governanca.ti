import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate } from '../../utils/formatters.ts';
import { descricaoAdmissao } from '../../utils/admissao.ts';
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
    currentUser,
    createTicket,
    setSelectedTicketIdForDetail,
    setSelectedAssetIdFor360,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'offboarding' | 'onboarding'>('offboarding');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estados do Offboarding
  const [selectedColabId, setSelectedColabId] = useState('');
  const [dataDesligamento, setDataDesligamento] = useState(() =>
    new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
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
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
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

  // INVENTÁRIO INSTANTÂNEO do colaborador selecionado no Offboarding
  const colabAssets = assets.filter((a) => a.custodianteId === selectedColabId);
  const colabLicenses = licenses.filter((l) => l.colaboradoresIds.includes(selectedColabId));

  // Submissão do Offboarding Inteligente
  const handleOffboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedColaborador) return;

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
      descricao: `Solicitação formal de desligamento para ${selectedColaborador.nome}, cargo ${
        selectedColaborador.cargo
      }. Último dia trabalhado: ${formatDate(
        dataDesligamento
      )}. Foram identificados ${colabAssets.length} equipamento(s) sob custódia e ${
        colabLicenses.length
      } licença(s) ativa(s). ${observacoesOff}`,
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
      setSelectedTicketIdForDetail(ticket.id);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Admissões e desligamentos</h2>
        </div>

        {/* Tabs de Seleção */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('offboarding')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'offboarding'
                ? 'bg-white text-rose-700 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserMinus className="w-3.5 h-3.5 text-rose-600" />
            <span>Offboarding Inteligente</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('onboarding')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'onboarding'
                ? 'bg-white text-blue-700 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5 text-blue-600" />
            <span>Solicitar Onboarding</span>
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* MÓDULO 1: OFFBOARDING INTELIGENTE & CONDICIONAL */}
      {activeTab === 'offboarding' && (
        <form onSubmit={handleOffboardingSubmit} className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-6 space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <UserMinus className="w-4 h-4 text-rose-600" />
                Dados do Desligamento
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Selecione o colaborador para auditar o inventário em posse e configurar as ações de transição
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Colaborador a ser Desligado (Seleção Dinâmica)
                </label>
                <select
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
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Selecione um colaborador ativo...</option>
                  {activeEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nome} ({emp.cargo} · Matrícula {emp.matricula})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Data do Último Dia de Trabalho
                </label>
                <input
                  type="date"
                  required
                  value={dataDesligamento}
                  onChange={(e) => setDataDesligamento(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* INVENTÁRIO INSTANTÂNEO CARREGADO AUTOMATICAMENTE */}
            {selectedColaborador && (
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-5 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Inventário Instantâneo sob Custódia de {selectedColaborador.nome}
                    </h4>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    {colabAssets.length} equipamento(s) · {colabLicenses.length} licença(s)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Equipamentos Físicos */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-700 block">
                      Equipamentos Físicos para Devolução (Relação 1:1)
                    </span>
                    {colabAssets.length > 0 ? (
                      <div className="space-y-1.5">
                        {colabAssets.map((asset) => (
                          <div
                            key={asset.id}
                            className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-blue-700">{asset.tag}</span>
                                <span className="font-medium text-slate-900">{asset.nome}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {asset.marca} {asset.modelo} · S/N: <span className="font-mono">{asset.serialNumber}</span>
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedAssetIdFor360(asset.id)}
                              className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                            >
                              Ver ficha
                              <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic py-2">
                        Nenhum equipamento físico registrado sob a posse deste colaborador.
                      </p>
                    )}
                  </div>

                  {/* Licenças & Acessos */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-700 block">
                      Softwares e Contas Corporativas Ativas
                    </span>
                    {colabLicenses.length > 0 ? (
                      <div className="space-y-1.5">
                        {colabLicenses.map((lic) => (
                          <div
                            key={lic.id}
                            className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                          >
                            <span className="font-medium text-slate-800">{lic.nome}</span>
                            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              Revogação automática
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic py-2">
                        Nenhuma licença corporativa individual atribuída.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* REGRAS CONDICIONAIS COM DROPDOWNS DINÂMICOS */}
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
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
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-slate-600" />
                    <span className="text-xs font-semibold text-slate-900">
                      Redirecionar E-mails Corporativos (Exchange / Google Workspace)
                    </span>
                  </div>
                </label>

                {redirecionarEmail && (
                  <div className="pl-6 pt-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Destinatário que receberá os e-mails (Colaborador Ativo)
                    </label>
                    <select
                      value={destinatarioEmailId}
                      onChange={(e) => setDestinatarioEmailId(e.target.value)}
                      required={redirecionarEmail}
                      className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
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
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-slate-600" />
                    <span className="text-xs font-semibold text-slate-900">
                      Transferir Custódia de Arquivos e Pastas do Google Drive / Nuvem
                    </span>
                  </div>
                </label>

                {transferirDrive && (
                  <div className="pl-6 pt-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Destinatário que receberá a propriedade dos arquivos
                    </label>
                    <select
                      value={destinatarioDriveId}
                      onChange={(e) => setDestinatarioDriveId(e.target.value)}
                      required={transferirDrive}
                      className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
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
                <div className="flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-slate-600" />
                  <label className="text-xs font-semibold text-slate-900">
                    Instruções Logísticas de Recolhimento dos Equipamentos
                  </label>
                </div>
                <input
                  type="text"
                  value={recolhimentoInstrucoes}
                  onChange={(e) => setRecolhimentoInstrucoes(e.target.value)}
                  placeholder="Ex: Entrega presencial ao gestor, portaria central ou código reverso dos Correios"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              {/* Observações Livres */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observações Operacionais do Desligamento
                </label>
                <textarea
                  rows={2}
                  value={observacoesOff}
                  onChange={(e) => setObservacoesOff(e.target.value)}
                  placeholder="Particularidades do encerramento contratual, data de corte de acesso ou prazos..."
                  className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={!selectedColaborador}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg shadow-xs transition-colors"
              >
                <Send className="w-4 h-4" />
                <span>Abrir Chamado de Desligamento com Checklist Técnico para T.I.</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* MÓDULO 2: SOLICITAÇÃO DE ONBOARDING */}
      {activeTab === 'onboarding' && (
        <form onSubmit={handleOnboardingSubmit} className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-6 space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-600" />
                Solicitação de Admissão & Kit de Trabalho
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Defina os dados do admitido e o pacote operacional desejado sem complexidade técnica
              </p>
            </div>

            <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Dados do admitido</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome Completo do Novo Colaborador
                </label>
                <input
                  type="text"
                  required
                  value={onbNome}
                  onChange={(e) => setOnbNome(e.target.value)}
                  placeholder="Ex: Gustavo Henrique Ribeiro"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail Corporativo Sugerido
                </label>
                <input
                  type="email"
                  required
                  value={onbEmail}
                  onChange={(e) => setOnbEmail(e.target.value)}
                  placeholder="nome@empresa.com.br"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cargo / Função
                </label>
                <input
                  type="text"
                  required
                  value={onbCargo}
                  onChange={(e) => setOnbCargo(e.target.value)}
                  placeholder="Ex: Desenvolvedor Front-end"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Setor / Departamento
                </label>
                <select
                  value={onbSetorId}
                  onChange={(e) => setOnbSetorId(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Líder Imediato / Gestor
                </label>
                <select
                  value={onbGestorId}
                  onChange={(e) => setOnbGestorId(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Data de Início Prevista
                </label>
                <input
                  type="date"
                  required
                  value={onbDataInicio}
                  onChange={(e) => setOnbDataInicio(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
            </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Equipamento</h4>
              {/* Ajuste da admissão: o RH não escolhe modelo; no máximo descreve uma necessidade */}
              <div>
                <label htmlFor="onb-obs-equipamento" className="block text-xs font-semibold text-slate-700 mb-1">
                  Observação sobre o equipamento <span className="font-normal text-slate-500">(opcional)</span>
                </label>
                <input
                  id="onb-obs-equipamento"
                  type="text"
                  value={onbTipoComputador}
                  onChange={(e) => setOnbTipoComputador(e.target.value)}
                  placeholder="Ex.: precisa de dois monitores; trabalha com edição de vídeo"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
                <span className="text-xs text-slate-500 mt-0.5 block">A T.I. escolhe o equipamento no estoque.</span>
              </div>

            {/* Fase 6: kit sugerido (catálogo da T.I.) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Equipamentos e acessórios</label>
              <p className="text-xs text-slate-500 mb-2">
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
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
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
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Acessos</h4>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nível de Acesso Sugerido ao Sistema
                </label>
                <select
                  value={onbPapelAcesso}
                  onChange={(e) => setOnbPapelAcesso(e.target.value as 'colaborador' | 'rh' | 'ti_suporte' | 'ti_admin')}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                >
                  <option value="colaborador">Colaborador Padrão (Solicitante)</option>
                  <option value="rh">Recursos Humanos (admissões e desligamentos)</option>
                  <option value="ti_suporte">Técnico de Suporte T.I.</option>
                  <option value="ti_admin">Administrador de T.I. (Acesso Total)</option>
                </select>
                <span className="text-xs text-slate-500 mt-0.5 block">
                  Pré-define as permissões do novo usuário pós-login
                </span>
              </div>

            {/* Fase 6: contas (catálogo) + outros acessos + grupos de e-mail */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Contas e acessos</label>
              <div className="flex flex-wrap gap-2">
                {itensAcesso.map((c) => {
                  const selected = marcado(c);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => alternar(c)}
                      aria-pressed={selected}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        selected
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
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
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Outros sistemas (opcional)</label>
                  <input
                    value={onbOutrosAcessos}
                    onChange={(e) => setOnbOutrosAcessos(e.target.value)}
                    placeholder="Ex.: Figma, VPN, ERP (separe por vírgula)"
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Grupos de e-mail sugeridos (opcional)
                  </label>
                  <input
                    value={onbGruposEmail}
                    onChange={(e) => setOnbGruposEmail(e.target.value)}
                    placeholder="Ex.: comercial@empresa.com.br, todos@..."
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>
            </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Instruções de Entrega / Modelo Híbrido
              </label>
              <textarea
                rows={2}
                value={onbObservacoes}
                onChange={(e) => setOnbObservacoes(e.target.value)}
                placeholder="Endereço de envio residencial ou retirada no primeiro dia no escritório..."
                className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
              >
                <Send className="w-4 h-4" />
                <span>Enviar Solicitação de Onboarding para Equipe de T.I.</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
