import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatCurrency, formatDate, formatChaveNFe, getWarrantyStatus } from '../../utils/formatters.ts';
import {
  X,
  QrCode,
  FileText,
  User,
  Clock,
  Receipt,
  Wrench,
  ShieldAlert,
  ShieldCheck,
  Copy,
  Check,
  ArrowRightLeft,
  ExternalLink,
  Edit2,
  Lock,
} from 'lucide-react';

interface Asset360ModalProps {
  assetId: string;
  onClose: () => void;
}

export const Asset360Modal: React.FC<Asset360ModalProps> = ({ assetId, onClose }) => {
  const {
    assets,
    employees,
    departments,
    setSelectedEmployeeIdFor360,
    setSelectedAssetForQrCode,
    setSelectedTermForPrint,
    terms,
    transferAssetCustody,
    updateAsset,
    currentUser,
    currentRole,
  } = useApp();

  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedBitlocker, setCopiedBitlocker] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedNewUser, setSelectedNewUser] = useState<string>('');
  const [motivoDevolucao, setMotivoDevolucao] = useState('');
  const [isEditingSecurity, setIsEditingSecurity] = useState(false);
  const [tempSO, setTempSO] = useState('');
  const [tempBitlocker, setTempBitlocker] = useState('');

  const asset = assets.find((a) => a.id === assetId);

  if (!asset) return null;

  const currentCustodian = employees.find((e) => e.id === asset.custodianteId);
  const department = departments.find((d) => d.id === asset.setorId);
  const warranty = getWarrantyStatus(asset.fiscal?.dataGarantia);
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';

  const handleCopyKey = () => {
    if (asset.fiscal?.chaveAcesso44) {
      navigator.clipboard.writeText(asset.fiscal.chaveAcesso44);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleCopyBitlocker = () => {
    if (asset.bitlockerKey) {
      navigator.clipboard.writeText(asset.bitlockerKey);
      setCopiedBitlocker(true);
      setTimeout(() => setCopiedBitlocker(false), 2000);
    }
  };

  const handleSaveSecurity = () => {
    updateAsset(asset.id, {
      sistemaOperacional: tempSO || undefined,
      bitlockerKey: tempBitlocker.trim() || undefined,
    });
    setIsEditingSecurity(false);
  };

  const handleOpenCustodian = (empId: string) => {
    // AUDITORIA RBAC: Colaborador comum não pode abrir perfis de outros colaboradores
    if (currentRole === 'colaborador' && empId !== currentUser?.id) {
      alert('Acesso restrito: Colaboradores não têm permissão para acessar o cadastro de outros colaboradores.');
      return;
    }
    onClose();
    setSelectedEmployeeIdFor360(empId);
  };

  const handleOpenQrCode = () => {
    setSelectedAssetForQrCode(asset);
  };

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const newId = selectedNewUser === 'estoque' ? null : selectedNewUser;
    transferAssetCustody(asset.id, newId, motivoDevolucao);
    setShowTransferModal(false);
    setSelectedNewUser('');
    setMotivoDevolucao('');
  };

  const handleViewTerm = (termoId?: string) => {
    if (!termoId) return;
    const term = terms.find((t) => t.id === termoId);
    if (term) {
      setSelectedTermForPrint(term);
    }
  };

  const statusConfig = {
    disponivel: { label: 'Disponível em Estoque', textClass: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    em_uso: { label: 'Em Uso / Alocado', textClass: 'text-blue-700 bg-blue-50 border-blue-200' },
    manutencao: { label: 'Em Manutenção', textClass: 'text-amber-700 bg-amber-50 border-amber-200' },
    descartado: { label: 'Baixado / Descartado', textClass: 'text-slate-500 bg-slate-100 border-slate-200' },
  }[asset.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 overflow-hidden my-0 sm:my-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-blue-700 bg-blue-100/70 px-2.5 py-1 rounded-md border border-blue-200">
              {asset.tag}
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900 leading-tight">{asset.nome}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span>{asset.marca} {asset.modelo}</span>
                <span>·</span>
                <span className="capitalize">{asset.categoria}</span>
                <span>·</span>
                <span className="font-mono">S/N: {asset.serialNumber}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenQrCode}
              title="Gerar etiqueta física com QR Code"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors shadow-2xs"
            >
              <QrCode className="w-3.5 h-3.5 text-slate-600" />
              Etiqueta QR Code
            </button>

            {(currentRole === 'ti_admin' || currentRole === 'ti_suporte') && (
              <button
                type="button"
                onClick={() => setShowTransferModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors shadow-2xs"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Mudar Custódia
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal interno de Transferência de Custódia */}
        {showTransferModal && (
          <div className="bg-blue-50/70 border-b border-blue-200 p-4 animate-in slide-in-from-top-2 duration-150">
            <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Transferência / Devolução de Custódia 1:1
            </h4>
            <form onSubmit={handleExecuteTransfer} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Novo Destino do Equipamento
                  </label>
                  <select
                    value={selectedNewUser}
                    onChange={(e) => setSelectedNewUser(e.target.value)}
                    required
                    className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Selecione um colaborador ou estoque...</option>
                    <option value="estoque">📦 Devolver para Almoxarifado / Estoque de T.I.</option>
                    <optgroup label="Colaboradores Ativos">
                      {employees
                        .filter((e) => e.status === 'ativo' && e.id !== asset.custodianteId)
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.nome} ({emp.cargo})
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Motivo da Movimentação
                  </label>
                  <input
                    type="text"
                    value={motivoDevolucao}
                    onChange={(e) => setMotivoDevolucao(e.target.value)}
                    placeholder="Ex: Substituição, upgrade ou desligamento..."
                    required
                    className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/50 rounded-md"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Confirmar Transferência
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Conteúdo com scroll */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Card de Status & Custódia Atual (Rastreabilidade 360°) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-xs uppercase font-semibold text-slate-500 block">Status do Ativo</span>
              <div className="mt-1 flex items-center gap-2">
                <span className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-md border ${statusConfig.textClass}`}>
                  {statusConfig.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Localização: <span className="font-medium text-slate-700">{asset.localizacaoFisica}</span>
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg col-span-2">
              <span className="text-xs uppercase font-semibold text-slate-500 block">Custodiante Atual</span>
              {currentCustodian ? (
                <div className="mt-1 flex items-center justify-between">
                  <div>
                    {currentRole === 'colaborador' && currentCustodian.id !== currentUser?.id ? (
                      <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        <User className="w-4 h-4 text-slate-500" />
                        {currentCustodian.nome}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenCustodian(currentCustodian.id)}
                        className="text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1.5"
                      >
                        <User className="w-4 h-4 text-blue-600" />
                        {currentCustodian.nome}
                        <ExternalLink className="w-3 h-3 text-blue-500" />
                      </button>
                    )}
                    <p className="text-xs text-slate-600 mt-0.5">
                      {currentCustodian.cargo} · {department?.nome || 'Setor'}
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <span>Em posse desde</span>
                    <p className="font-medium text-slate-700">{formatDate(asset.dataEntregaAtual)}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-1">
                  <p className="text-xs font-medium text-slate-700">Nenhum colaborador alocado no momento</p>
                  <p className="text-xs text-slate-500">O item está no estoque e pronto para empréstimo.</p>
                </div>
              )}
            </div>
          </div>

          {/* Sistema Operacional & Segurança BitLocker (Hardware) */}
          {asset.categoria === 'hardware' && (
            <div className="border border-slate-200 rounded-lg p-5 space-y-3 bg-white">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Sistema Operacional & Segurança de Disco (BitLocker)
                  </h3>
                </div>
                {isTI && !isEditingSecurity && (
                  <button
                    type="button"
                    onClick={() => {
                      setTempSO(asset.sistemaOperacional || 'Windows 11 Pro 64-bit');
                      setTempBitlocker(asset.bitlockerKey || '');
                      setIsEditingSecurity(true);
                    }}
                    className="text-xs text-blue-700 hover:underline flex items-center gap-1 font-medium"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Editar SO / BitLocker</span>
                  </button>
                )}
              </div>

              {isEditingSecurity ? (
                <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Sistema Operacional
                      </label>
                      <select
                        value={tempSO}
                        onChange={(e) => setTempSO(e.target.value)}
                        className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                      >
                        <option value="Windows 11 Pro 64-bit">Windows 11 Pro (64-bit)</option>
                        <option value="Windows 11 Home">Windows 11 Home</option>
                        <option value="Windows 10 Pro 64-bit">Windows 10 Pro (64-bit)</option>
                        <option value="macOS Sequoia 15.x">macOS Sequoia (Apple Silicon / Intel)</option>
                        <option value="macOS Sonoma 14.x">macOS Sonoma (Apple Silicon)</option>
                        <option value="Ubuntu Linux 24.04 LTS">Ubuntu Linux 24.04 LTS</option>
                        <option value="Outro Sistema">Outro Sistema</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Chave de Recuperação BitLocker (48 dígitos)
                      </label>
                      <input
                        type="text"
                        value={tempBitlocker}
                        onChange={(e) => setTempBitlocker(e.target.value)}
                        placeholder="Ex: 419204-183029-482019-582019-..."
                        className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingSecurity(false)}
                      className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSecurity}
                      className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded"
                    >
                      Salvar Segurança
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50/80 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-xs uppercase font-semibold text-slate-500 block">
                        Sistema Operacional Instalado
                      </span>
                      <span className="font-semibold text-slate-900">
                        {asset.sistemaOperacional || 'Windows 11 Pro 64-bit (Padrão Corporativo)'}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 self-start sm:self-auto">
                      Licenciado OEM/Volume
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase font-semibold text-slate-500">
                        Chave de Recuperação BitLocker / Criptografia
                      </span>
                      {isTI && asset.bitlockerKey && (
                        <button
                          type="button"
                          onClick={handleCopyBitlocker}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors"
                        >
                          {copiedBitlocker ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700 font-medium">Chave Copiada!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-500" />
                              <span>Copiar Chave BitLocker</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {isTI ? (
                      asset.bitlockerKey ? (
                        <p className="font-mono text-xs font-medium text-slate-800 bg-white p-2 rounded border border-slate-200 tracking-wider break-all select-all">
                          {asset.bitlockerKey}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 italic">
                          Nenhuma chave de recuperação BitLocker registrada para este equipamento.
                        </p>
                      )
                    ) : (
                      <p className="text-xs text-slate-500 italic flex items-center gap-1.5 py-1">
                        <Lock className="w-3.5 h-3.5 text-slate-500" />
                        Chave confidencial de criptografia de disco (acesso restrito à equipe de TI).
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dados Fiscais e Garantia com Alerta Visual */}
          <div className="border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Dados Fiscais, Financeiros & Garantia
                </h3>
              </div>
              {/* Badge de Garantia */}
              <div className="flex items-center gap-1.5">
                {warranty.status === 'valida' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-md border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {warranty.label}
                  </span>
                )}
                {warranty.status === 'expirando' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-md border border-amber-200">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {warranty.label}
                  </span>
                )}
                {warranty.status === 'expirada' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md border border-slate-200">
                    <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                    {warranty.label}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-xs text-slate-500 uppercase font-semibold block">Nota Fiscal (NF-e)</span>
                <p className="font-semibold text-slate-900">Nº {asset.fiscal?.numeroNF || 'S/N'}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500 uppercase font-semibold block">Valor de Aquisição</span>
                <p className="font-semibold text-slate-900">{formatCurrency(asset.fiscal?.valorCompra || 0)}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500 uppercase font-semibold block">Fornecedor</span>
                <p className="text-slate-800">{asset.fiscal?.fornecedor || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500 uppercase font-semibold block">Data de Compra</span>
                <p className="text-slate-800">{formatDate(asset.fiscal?.dataAquisicao)}</p>
              </div>
            </div>

            {/* Chave de Acesso NF-e (44 Dígitos) com botão de cópia */}
            {asset.fiscal?.chaveAcesso44 && (
              <div className="bg-slate-50 p-2.5 rounded-md border border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs uppercase font-semibold text-slate-500 block">
                    Chave de Acesso NF-e (44 dígitos)
                  </span>
                  <p className="font-mono text-xs text-slate-700 truncate tracking-tight">
                    {formatChaveNFe(asset.fiscal.chaveAcesso44)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors shrink-0"
                >
                  {copiedKey ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Chave</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {asset.fiscal?.suporteContato && (
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Canais de Suporte Fabricante:</span> {asset.fiscal.suporteContato}
              </p>
            )}
          </div>

          {/* Atributos Personalizados por Categoria */}
          {asset.customFields && Object.keys(asset.customFields).length > 0 && (
            <div className="border border-slate-200 rounded-lg p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 pb-1 border-b border-slate-100">
                Especificações Técnicas Personalizadas
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                {Object.entries(asset.customFields).map(([key, value]) => (
                  <div key={key} className="bg-slate-50/70 p-2 rounded border border-slate-100">
                    <span className="text-xs text-slate-500 uppercase font-semibold block">{key}</span>
                    <span className="font-medium text-slate-800">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Histórico Cronológico de Custódia (Rastreabilidade 360°) */}
          <div className="border border-slate-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Histórico Cronológico de Custódia
                </h3>
              </div>
              <span className="text-xs text-slate-500">
                {asset.historicoCustodia.length} registro(s)
              </span>
            </div>

            {asset.historicoCustodia.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {asset.historicoCustodia.map((entry) => (
                  <div key={entry.id} className="py-2.5 flex items-start justify-between text-xs">
                    <div>
                      {currentRole === 'colaborador' && entry.colaboradorId !== currentUser?.id ? (
                        <span className="font-semibold text-slate-800">
                          {entry.colaboradorNome}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenCustodian(entry.colaboradorId)}
                          className="font-semibold text-blue-700 hover:underline flex items-center gap-1"
                        >
                          {entry.colaboradorNome}
                          <ExternalLink className="w-3 h-3 text-blue-500" />
                        </button>
                      )}
                      <p className="text-xs text-slate-500 mt-0.5">
                        Entrega: {formatDate(entry.dataEntrega)}
                        {entry.dataDevolucao ? ` · Devolução: ${formatDate(entry.dataDevolucao)}` : ' · (Custódia Ativa)'}
                      </p>
                      {entry.motivoDevolucao && (
                        <p className="text-xs text-slate-600 italic mt-0.5">
                          Motivo: {entry.motivoDevolucao}
                        </p>
                      )}
                    </div>

                    {entry.termoId && (
                      <button
                        type="button"
                        onClick={() => handleViewTerm(entry.termoId)}
                        className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-700 bg-slate-50 px-2 py-1 rounded border border-slate-200"
                      >
                        <FileText className="w-3 h-3" />
                        Ver Termo A4
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-2">Nenhum histórico anterior registrado.</p>
            )}
          </div>

          {/* Histórico de Manutenções e Upgrades */}
          {asset.historicoManutencao.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-5 space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                <Wrench className="w-4 h-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Manutenções & Upgrades Técnicos
                </h3>
              </div>
              <div className="space-y-2 text-xs">
                {asset.historicoManutencao.map((man) => (
                  <div key={man.id} className="p-3 bg-slate-50 rounded-md border border-slate-200 flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{man.descricao}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatDate(man.data)} · Fornecedor: {man.fornecedor}
                      </p>
                    </div>
                    <span className="font-semibold text-slate-800 font-mono">
                      {formatCurrency(man.custo)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
