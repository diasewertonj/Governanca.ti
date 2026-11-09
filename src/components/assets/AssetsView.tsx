import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { AssetCategory, AssetStatus } from '../../types/index.ts';
import { formatDate, formatCurrency, getWarrantyStatus } from '../../utils/formatters.ts';
import {
  Laptop,
  Search,
  Plus,
  QrCode,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  User,
  Users,
  Key,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { NewAssetModal } from './NewAssetModal.tsx';

export const AssetsView: React.FC = () => {
  const {
    assets,
    licenses,
    employees,
    departments,
    setSelectedAssetIdFor360,
    setSelectedSoftwareIdFor360,
    setSoftwareModalOpen,
    setSoftwareToEdit,
    setSelectedEmployeeIdFor360,
    setSelectedAssetForQrCode,
    currentRole,
  } = useApp();

  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';

  const [categoryFilter, setCategoryFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewAssetModal, setShowNewAssetModal] = useState(false);

  // Filtro de ativos
  const filteredAssets = assets.filter((asset) => {
    const matchesCategory = categoryFilter === 'todos' || asset.categoria === categoryFilter;
    const matchesStatus = statusFilter === 'todos' || asset.status === statusFilter;
    const matchesSearch =
      asset.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.marca.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (asset.fiscal?.numeroNF && asset.fiscal.numeroNF.includes(searchTerm));

    return matchesCategory && matchesStatus && matchesSearch;
  });

  const getDepartmentName = (depId?: string) => {
    return departments.find((d) => d.id === depId)?.nome || '-';
  };

  const getCustodian = (colabId?: string) => {
    return employees.find((e) => e.id === colabId);
  };

  return (
    <div className="space-y-6">
      {/* Barra de Ações do Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {categoryFilter === 'licencas_tab'
              ? 'Gestão de Licenças, Softwares & Assinaturas SaaS'
              : 'Inventário Patrimonial e Licenças'}
          </h2>
          <p className="text-xs text-slate-500">
            {categoryFilter === 'licencas_tab'
              ? 'Controle de assentos contratados, alocação/liberação de colaboradores e faturamento'
              : 'Controle de equipamentos 1:1, garantias fiscais e especificações técnicas'}
          </p>
        </div>

        {isTI && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {categoryFilter === 'licencas_tab' ? (
              <button
                type="button"
                onClick={() => {
                  setSoftwareToEdit(null);
                  setSoftwareModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Assinatura / SaaS</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewAssetModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar Novo Ativo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSoftwareToEdit(null);
                    setSoftwareModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Key className="w-3.5 h-3.5 text-blue-600" />
                  <span>Nova Licença SaaS</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs de Categorias (Segmented controls) & Filtros */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Tabs por Categoria */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            {[
              { id: 'todos', label: 'Todos os Ativos' },
              { id: 'hardware', label: 'Hardware' },
              { id: 'periferico', label: 'Periféricos' },
              { id: 'telefonia', label: 'Telefonia' },
              { id: 'licencas_tab', label: 'Licenças / SaaS' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  categoryFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Busca e Filtro de Status */}
          {categoryFilter !== 'licencas_tab' && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar patrimônio, modelo, serial ou NF..."
                  className="w-64 text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700"
              >
                <option value="todos">Todos os Status</option>
                <option value="em_uso">Em Uso (Alocado)</option>
                <option value="disponivel">Disponível em Estoque</option>
                <option value="manutencao">Em Manutenção</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Visualização de Licenças de Software quando a tab for 'licencas_tab' */}
      {categoryFilter === 'licencas_tab' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {licenses.map((lic) => {
              const perc = Math.round((lic.assentosAlocados / lic.assentosTotais) * 100);
              const freeCount = Math.max(0, lic.assentosTotais - lic.assentosAlocados);
              return (
                <div
                  key={lic.id}
                  className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <button
                        type="button"
                        onClick={() => setSelectedSoftwareIdFor360(lic.id)}
                        className="flex items-center gap-2 group text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 group-hover:bg-blue-100 transition-colors">
                          <Key className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors flex items-center gap-1.5">
                            <span>{lic.nome}</span>
                            <ExternalLink className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {lic.fornecedor} · Contrato: <span className="font-mono">{lic.chaveContrato}</span>
                          </p>
                        </div>
                      </button>
                    </div>

                    <div className="text-right">
                      <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-50 px-2.5 py-1 rounded border border-slate-200 block">
                        {formatCurrency(lic.valorMensal)}/mês
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        {freeCount > 0 ? (
                          <span className="text-emerald-700 font-semibold">{freeCount} assento(s) livre(s)</span>
                        ) : (
                          <span className="text-rose-600 font-semibold">Esgotado (100%)</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Barra de Progresso de Assentos (ex: 24/30) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium">Ocupação de Assentos</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {lic.assentosAlocados} / {lic.assentosTotais} ({perc}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          perc >= 100 ? 'bg-rose-500' : perc >= 85 ? 'bg-amber-500' : 'bg-blue-600'
                        }`}
                        style={{ width: `${Math.min(100, perc)}%` }}
                      />
                    </div>
                  </div>

                  {/* Colaboradores Vinculados (Rastreabilidade 360°) */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        Colaboradores Alocados ({lic.colaboradoresIds.length})
                      </span>
                    </div>
                    {lic.colaboradoresIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {lic.colaboradoresIds.slice(0, 6).map((empId) => {
                          const emp = employees.find((e) => e.id === empId);
                          if (!emp) return null;
                          return (
                            <button
                              key={empId}
                              type="button"
                              onClick={() => setSelectedEmployeeIdFor360(emp.id)}
                              className="inline-flex items-center gap-1 text-xs text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-0.5 rounded transition-colors"
                            >
                              <span>{emp.nome}</span>
                              <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                            </button>
                          );
                        })}
                        {lic.colaboradoresIds.length > 6 && (
                          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">
                            +{lic.colaboradoresIds.length - 6} outros
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        Nenhum colaborador com assento alocado nesta licença.
                      </p>
                    )}
                  </div>

                  {/* Botões de Ação na Licença */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSoftwareIdFor360(lic.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Gerenciar Assentos & Ficha 360°</span>
                    </button>

                    {isTI && (
                      <button
                        type="button"
                        onClick={() => {
                          setSoftwareToEdit(lic);
                          setSoftwareModalOpen(true);
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                      >
                        Editar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Tabela de Ativos Físicos (Hardware, Periféricos, Telefonia) */
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Patrimônio</th>
                  <th className="py-3 px-4">Equipamento / Modelo</th>
                  <th className="py-3 px-4">Número de Série</th>
                  <th className="py-3 px-4">Custodiante Atual (360°)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Garantia</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredAssets.length > 0 ? (
                  filteredAssets.map((asset) => {
                    const custodian = getCustodian(asset.custodianteId);
                    const warranty = getWarrantyStatus(asset.fiscal?.dataGarantia);

                    return (
                      <tr
                        key={asset.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                          {asset.tag}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => setSelectedAssetIdFor360(asset.id)}
                            className="font-semibold text-slate-900 hover:text-blue-700 text-left block"
                          >
                            {asset.nome}
                          </button>
                          <span className="text-[11px] text-slate-500">
                            {asset.marca} {asset.modelo}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                          {asset.serialNumber}
                        </td>

                        {/* Custodiante com link contextual 360° */}
                        <td className="py-3 px-4">
                          {custodian ? (
                            <button
                              type="button"
                              onClick={() => setSelectedEmployeeIdFor360(custodian.id)}
                              className="font-semibold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1"
                            >
                              <User className="w-3.5 h-3.5 text-blue-500" />
                              <span>{custodian.nome}</span>
                              <ExternalLink className="w-3 h-3 text-blue-400" />
                            </button>
                          ) : (
                            <span className="text-slate-400 italic">Disponível em Estoque</span>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                              asset.status === 'em_uso'
                                ? 'text-blue-700 bg-blue-50'
                                : asset.status === 'disponivel'
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-amber-700 bg-amber-50'
                            }`}
                          >
                            {asset.status.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Badge sutil de garantia */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {warranty.status === 'valida' && (
                            <span className="text-emerald-700 flex items-center gap-1 font-medium text-[11px]">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              {formatDate(asset.fiscal?.dataGarantia)}
                            </span>
                          )}
                          {warranty.status === 'expirando' && (
                            <span className="text-amber-700 flex items-center gap-1 font-semibold text-[11px]">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              Expira em breve
                            </span>
                          )}
                          {warranty.status === 'expirada' && (
                            <span className="text-slate-400 text-[11px]">Expirada</span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedAssetForQrCode(asset)}
                              title="Imprimir Etiqueta com QR Code"
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedAssetIdFor360(asset.id)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
                            >
                              Ficha 360°
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                      Nenhum equipamento encontrado com os filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNewAssetModal && <NewAssetModal onClose={() => setShowNewAssetModal(false)} />}
    </div>
  );
};
