import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate, formatCurrency } from '../../utils/formatters.ts';
import { garantiaEfetiva } from '../../utils/contratos.ts';
import { licencaAtiva } from '../../utils/licencas.ts';
import { fonteCustoLicenca, ROTULO_FORMA_COBRANCA } from '../../utils/financeiro.ts';
import type { Contrato, SoftwareLicense } from '../../types/index.ts';
import { EstoqueAcessorios } from './EstoqueAcessorios.tsx';
import { ExternalLink, Key, Plus, QrCode, ShieldAlert, ShieldCheck, User, Users } from 'lucide-react';
import { NewAssetModal } from './NewAssetModal.tsx';
import { Abas } from '../ui/Abas.tsx';
import { Busca, CabecalhoTela, Vazio } from '../ui/Tela.tsx';

/** Seção 6: Inventário › Hardware (equipamentos e acessórios) ou Softwares e licenças */
const origemCurta = (lic: SoftwareLicense, contratos: Contrato[]) => {
  const f = fonteCustoLicenca(lic, contratos);
  return f.forma === 'contrato' && f.contrato ? `pelo contrato ${f.contrato.numero || f.contrato.descricao}` : ROTULO_FORMA_COBRANCA[f.forma];
};

const SELO_STATUS_ATIVO: Record<string, string> = {
  em_uso: 'selo-info',
  disponivel: 'selo-ok',
  descartado: 'selo-neutro',
  manutencao: 'selo-atencao',
};

type Categoria = 'todos' | 'hardware' | 'periferico' | 'telefonia' | 'acessorios_tab';

const ABAS_HARDWARE: { id: Categoria; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos os equipamentos' },
  { id: 'hardware', rotulo: 'Computadores e servidores' },
  { id: 'periferico', rotulo: 'Periféricos com patrimônio' },
  { id: 'telefonia', rotulo: 'Celulares' },
  { id: 'acessorios_tab', rotulo: 'Acessórios (estoque)' },
];

export const AssetsView: React.FC<{ modo?: 'hardware' | 'softwares' }> = ({ modo = 'hardware' }) => {
  const {
    assets,
    licenses,
    employees,
    setSelectedAssetIdFor360,
    setSelectedSoftwareIdFor360,
    setSoftwareModalOpen,
    setSoftwareToEdit,
    setSelectedEmployeeIdFor360,
    setSelectedAssetForQrCode,
    currentRole,
    contratos,
    fornecedores,
  } = useApp();

  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const softwares = modo === 'softwares';

  const [categoryFilter, setCategoryFilter] = useState<Categoria>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('ativos');
  const [garantiaFilter, setGarantiaFilter] = useState<string>('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewAssetModal, setShowNewAssetModal] = useState(false);
  const [novoAcessorio, setNovoAcessorio] = useState(false);
  const [mostrarDesativados, setMostrarDesativados] = useState(false);

  const acessorios = !softwares && categoryFilter === 'acessorios_tab';
  const termo = searchTerm.toLowerCase();

  // Filtro de ativos
  const filteredAssets = assets.filter((asset) => {
    const matchesCategory = categoryFilter === 'todos' || asset.categoria === categoryFilter;
    const matchesStatus = statusFilter === 'ativos' ? asset.status !== 'descartado' : asset.status === statusFilter;
    // Fase 8: garantia efetiva (fábrica ou contrato de suporte/garantia estendida, a maior)
    const matchesGarantia = garantiaFilter === 'todas' || garantiaEfetiva(asset, contratos).status === garantiaFilter;
    const matchesSearch =
      asset.nome.toLowerCase().includes(termo) ||
      asset.tag.toLowerCase().includes(termo) ||
      asset.marca.toLowerCase().includes(termo) ||
      asset.serialNumber.toLowerCase().includes(termo) ||
      (asset.fiscal?.numeroNF && asset.fiscal.numeroNF.includes(searchTerm));

    return matchesCategory && matchesStatus && matchesGarantia && matchesSearch;
  });

  const licencasFiltradas = licenses.filter(
    (l) => !termo || `${l.nome} ${fornecedores.find((f) => f.id === l.fornecedorId)?.nome || l.fornecedor || ''} ${l.chaveContrato || ''}`.toLowerCase().includes(termo)
  );

  const getCustodian = (colabId?: string) => employees.find((e) => e.id === colabId);

  const novaLicenca = () => {
    setSoftwareToEdit(null);
    setSoftwareModalOpen(true);
  };

  const acaoPrincipal = !isTI ? null : softwares ? (
    <button type="button" onClick={novaLicenca} className="btn btn-primario">
      <Plus /> Nova licença
    </button>
  ) : acessorios ? (
    <button type="button" onClick={() => setNovoAcessorio(true)} className="btn btn-primario">
      <Plus /> Novo acessório
    </button>
  ) : (
    <button type="button" onClick={() => setShowNewAssetModal(true)} className="btn btn-primario">
      <Plus /> Novo equipamento
    </button>
  );

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo={softwares ? 'Softwares e licenças' : 'Hardware'}
        subtitulo={
          softwares
            ? 'Assentos contratados, alocação e liberação de colaboradores e faturamento'
            : 'Equipamentos com patrimônio, garantias, especificações técnicas e acessórios em estoque'
        }
        acoes={acaoPrincipal}
        abas={
          softwares ? undefined : (
            <Abas rotulo="Categorias de hardware" itens={ABAS_HARDWARE} ativa={categoryFilter} onMudar={setCategoryFilter} />
          )
        }
        filtros={
          softwares ? (
            <Busca id="inventario-busca" valor={searchTerm} onMudar={setSearchTerm} placeholder="Buscar software, fornecedor ou contrato..." />
          ) : acessorios ? (
            <>
              <Busca id="inventario-busca" valor={searchTerm} onMudar={setSearchTerm} placeholder="Buscar acessório, marca ou local..." />
              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={mostrarDesativados} onChange={(e) => setMostrarDesativados(e.target.checked)} />
                Mostrar desativados
              </label>
            </>
          ) : (
            <>
              <Busca id="inventario-busca" valor={searchTerm} onMudar={setSearchTerm} placeholder="Buscar patrimônio, modelo, serial ou NF..." />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por status" className="campo campo-sm">
                <option value="ativos">Todos (exceto baixados)</option>
                <option value="em_uso">Em uso (alocado)</option>
                <option value="disponivel">Disponível em estoque</option>
                <option value="manutencao">Em manutenção</option>
                <option value="descartado">Baixados</option>
              </select>
              <select value={garantiaFilter} onChange={(e) => setGarantiaFilter(e.target.value)} aria-label="Filtrar por garantia" className="campo campo-sm">
                <option value="todas">Garantia: todas</option>
                <option value="expirando">Vencendo</option>
                <option value="expirada">Vencida</option>
                <option value="sem_data">Sem data</option>
              </select>
            </>
          )
        }
      />

      {acessorios ? (
        <EstoqueAcessorios busca={searchTerm} mostrarInativos={mostrarDesativados} novoAberto={novoAcessorio} onFecharNovo={() => setNovoAcessorio(false)} />
      ) : softwares ? (
        licencasFiltradas.length === 0 ? (
          <Vazio>Nenhuma licença encontrada.</Vazio>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Lote 1 (L3): inativas no fim, apagadas e marcadas */}
            {[...licencasFiltradas]
              .sort((a, b) => Number(!licencaAtiva(a)) - Number(!licencaAtiva(b)))
              .map((lic) => {
                const perc = Math.round((lic.assentosAlocados / lic.assentosTotais) * 100);
                const freeCount = Math.max(0, lic.assentosTotais - lic.assentosAlocados);
                return (
                  <div key={lic.id} className={`cartao p-5 space-y-4 ${licencaAtiva(lic) ? '' : 'opacity-60'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => setSelectedSoftwareIdFor360(lic.id)} className="flex items-center gap-2 group text-left min-w-0">
                        <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                          <Key className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 flex items-center gap-1.5">
                            <span>{lic.nome}</span>
                            {!licencaAtiva(lic) && <span className="selo selo-neutro">Inativa</span>}
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {fornecedores.find((f) => f.id === lic.fornecedorId)?.nome || lic.fornecedor}
                            {lic.chaveContrato && (
                              <>
                                {' · '}
                                <span className="font-mono">{lic.chaveContrato}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </button>

                      <div className="text-right shrink-0">
                        <span className="font-mono text-xs font-semibold text-slate-700 block">
                          {(() => {
                            const fonte = fonteCustoLicenca(lic, contratos);
                            if (fonte.forma === 'sem_custo') return 'Sem custo';
                            if (fonte.semContratoVigente) return 'Sem contrato vigente';
                            return `${formatCurrency(fonte.mensal)}/mês`;
                          })()}
                        </span>
                        <span className="text-xs text-slate-500 block mt-0.5">{origemCurta(lic, contratos)}</span>
                        <span className="mt-1 block">
                          {freeCount > 0 ? (
                            <span className="selo selo-ok">{freeCount} assento(s) livre(s)</span>
                          ) : (
                            <span className="selo selo-problema">Esgotado (100%)</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Barra de progresso de assentos (ex.: 24/30) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 font-medium">Ocupação de assentos</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {lic.assentosAlocados} / {lic.assentosTotais} ({perc}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${perc >= 100 ? 'bg-red-600' : perc >= 85 ? 'bg-amber-500' : 'bg-blue-600'}`}
                          style={{ width: `${Math.min(100, perc)}%` }}
                        />
                      </div>
                    </div>

                    {/* Colaboradores vinculados (rastreabilidade 360°) */}
                    <div className="pt-2 border-t border-slate-100">
                      <p className="secao-titulo mb-2">Colaboradores alocados ({lic.colaboradoresIds.length})</p>
                      {lic.colaboradoresIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {lic.colaboradoresIds.slice(0, 6).map((empId) => {
                            const emp = employees.find((e) => e.id === empId);
                            if (!emp) return null;
                            return (
                              <button key={empId} type="button" onClick={() => setSelectedEmployeeIdFor360(emp.id)} className="btn btn-secundario btn-sm">
                                <span>{emp.nome}</span>
                                <ExternalLink />
                              </button>
                            );
                          })}
                          {lic.colaboradoresIds.length > 6 && <span className="selo selo-neutro">+{lic.colaboradoresIds.length - 6} outros</span>}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">Nenhum colaborador com assento alocado nesta licença.</p>
                      )}
                    </div>

                    {/* Ações da licença */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                      {isTI && (
                        <button
                          type="button"
                          onClick={() => {
                            setSoftwareToEdit(lic);
                            setSoftwareModalOpen(true);
                          }}
                          className="btn btn-sm btn-secundario"
                        >
                          Editar
                        </button>
                      )}
                      <button type="button" onClick={() => setSelectedSoftwareIdFor360(lic.id)} className="btn btn-sm btn-primario">
                        <Users /> Assentos e ficha
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )
      ) : (
        /* Tabela de ativos físicos (hardware, periféricos, telefonia) */
        <div className="cartao overflow-hidden">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Patrimônio</th>
                <th>Equipamento / modelo</th>
                <th className="hidden xl:table-cell">Número de série</th>
                <th>Custodiante atual</th>
                <th>Situação</th>
                <th className="hidden xl:table-cell">Garantia</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.length > 0 ? (
                filteredAssets.map((asset) => {
                  const custodian = getCustodian(asset.custodianteId);
                  const warranty = garantiaEfetiva(asset, contratos);

                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/70">
                      <td data-label="Patrimônio" className="font-mono font-bold text-blue-700">
                        {asset.tag}
                      </td>
                      <td data-label="Equipamento / modelo">
                        <button type="button" onClick={() => setSelectedAssetIdFor360(asset.id)} className="font-semibold text-slate-900 hover:text-blue-700 text-left block">
                          {asset.nome}
                        </button>
                        <span className="text-xs text-slate-500">
                          {asset.marca} {asset.modelo}
                        </span>
                      </td>
                      <td data-label="Número de série" className="hidden xl:table-cell font-mono text-slate-600">
                        {asset.serialNumber}
                      </td>

                      {/* Custodiante com link contextual 360° */}
                      <td data-label="Custodiante atual">
                        {custodian ? (
                          <button type="button" onClick={() => setSelectedEmployeeIdFor360(custodian.id)} className="link flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            <span>{custodian.nome}</span>
                          </button>
                        ) : (
                          <span className="text-slate-500 italic">{asset.status === 'descartado' ? 'Baixado (fora do estoque)' : 'Disponível em estoque'}</span>
                        )}
                      </td>

                      <td data-label="Situação">
                        <span className={`selo ${SELO_STATUS_ATIVO[asset.status] || 'selo-neutro'}`}>
                          {/* Fase 8: o status "descartado" é a baixa patrimonial (como na ficha e no filtro) */}
                          {asset.status === 'descartado' ? 'Baixado' : asset.status === 'em_uso' ? 'Em uso' : asset.status === 'disponivel' ? 'Disponível' : 'Em manutenção'}
                        </span>
                      </td>

                      {/* Garantia */}
                      <td data-label="Garantia" className="hidden xl:table-cell">
                        {warranty.status === 'valida' && (
                          <span className="selo selo-ok">
                            <ShieldCheck />
                            {formatDate(warranty.fim)}
                          </span>
                        )}
                        {warranty.status === 'expirando' && (
                          <span className="selo selo-atencao">
                            <ShieldAlert />
                            Expira em breve
                          </span>
                        )}
                        {warranty.status === 'expirada' && <span className="selo selo-neutro">Expirada</span>}
                        {warranty.status === 'sem_data' && <span className="text-slate-500">Sem data</span>}
                      </td>

                      {/* Ações */}
                      <td data-label="Ações" className="text-right">
                        <span className="acoes-linha">
                          <button type="button" onClick={() => setSelectedAssetIdFor360(asset.id)} className="btn btn-sm btn-primario">
                            Ficha
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedAssetForQrCode(asset)}
                            title="Imprimir etiqueta com QR Code"
                            aria-label={`Imprimir etiqueta com QR Code de ${asset.tag}`}
                            className="btn-icone"
                          >
                            <QrCode />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7}>
                    <Vazio>Nenhum equipamento encontrado com os filtros aplicados.</Vazio>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showNewAssetModal && <NewAssetModal onClose={() => setShowNewAssetModal(false)} />}
    </div>
  );
};
