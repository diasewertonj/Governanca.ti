import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate, formatCurrency } from '../../utils/formatters.ts';
import { garantiaEfetiva } from '../../utils/contratos.ts';
import { licencaAtiva } from '../../utils/licencas.ts';
import { fonteCustoLicenca, ROTULO_FORMA_COBRANCA } from '../../utils/financeiro.ts';
import type { Asset, Contrato, SoftwareLicense } from '../../types/index.ts';
import { EstoqueAcessorios } from './EstoqueAcessorios.tsx';
import { Copy, Key, Pencil, Plus, QrCode, ShieldAlert, ShieldCheck, User } from 'lucide-react';
import { NewAssetModal } from './NewAssetModal.tsx';
import { MenuAcoes } from '../ui/MenuAcoes.tsx';
import { CHAVE } from '../../utils/especificacoes.ts';
import { soDigitos } from '../../utils/mascaras.ts';
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
  const [duplicarDe, setDuplicarDe] = useState<Asset | null>(null);
  const [novoAcessorio, setNovoAcessorio] = useState(false);
  const [mostrarDesativados, setMostrarDesativados] = useState(false);

  const acessorios = !softwares && categoryFilter === 'acessorios_tab';
  const termo = searchTerm.toLowerCase();
  const termoDigitos = soDigitos(searchTerm);

  // Filtro de ativos
  const filteredAssets = assets.filter((asset) => {
    const matchesCategory = categoryFilter === 'todos' || asset.categoria === categoryFilter;
    const matchesStatus = statusFilter === 'ativos' ? asset.status !== 'descartado' : asset.status === statusFilter;
    // Fase 8: garantia efetiva (fábrica ou contrato de suporte/garantia estendida, a maior)
    const matchesGarantia = garantiaFilter === 'todas' || garantiaEfetiva(asset, contratos).status === garantiaFilter;
    // Seção 9.3: Service Tag e IMEI (com ou sem traços) também entram na busca
    const serviceTag = (asset.customFields?.[CHAVE.serviceTag] || '').toLowerCase();
    const imei = soDigitos(asset.customFields?.[CHAVE.imei]);
    const matchesSearch =
      asset.nome.toLowerCase().includes(termo) ||
      asset.tag.toLowerCase().includes(termo) ||
      asset.marca.toLowerCase().includes(termo) ||
      asset.serialNumber.toLowerCase().includes(termo) ||
      (serviceTag !== '' && serviceTag.includes(termo)) ||
      (imei !== '' && termoDigitos.length >= 4 && imei.includes(termoDigitos)) ||
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
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={mostrarDesativados} onChange={(e) => setMostrarDesativados(e.target.checked)} />
                Mostrar desativados
              </label>
            </>
          ) : (
            <>
              <Busca id="inventario-busca" valor={searchTerm} onMudar={setSearchTerm} placeholder="Buscar patrimônio, modelo, série, Service Tag, IMEI ou NF..." />
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
          <Vazio titulo="Nenhuma licença encontrada">Confira a busca ou cadastre um software novo.</Vazio>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {/* Lote 1 (L3): inativas no fim, apagadas e marcadas */}
            {[...licencasFiltradas]
              .sort((a, b) => Number(!licencaAtiva(a)) - Number(!licencaAtiva(b)))
              .map((lic) => {
                const perc = Math.round((lic.assentosAlocados / lic.assentosTotais) * 100);
                const freeCount = Math.max(0, lic.assentosTotais - lic.assentosAlocados);
                return (
                  /* Seção 19: cartão compacto — a lista de pessoas fica na ficha (aba Pessoas e assentos), que aguenta centenas */
                  <div key={lic.id} className={`cartao relative flex flex-col gap-3 p-3 transition-colors hover:border-blue-300 ${licencaAtiva(lic) ? '' : 'opacity-60'}`}>
                    <div className="flex items-start gap-3">
                      <span className="janela-icone" aria-hidden="true">
                        <Key className="ico" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setSelectedSoftwareIdFor360(lic.id)}
                          className="line-clamp-2 block max-w-full break-words text-left font-semibold text-slate-900 after:absolute after:inset-0 after:content-[''] hover:text-blue-700"
                        >
                          {lic.nome}
                        </button>
                        <p className="texto-aux truncate">{fornecedores.find((f) => f.id === lic.fornecedorId)?.nome || lic.fornecedor}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="num block font-semibold text-slate-900">
                          {(() => {
                            const fonte = fonteCustoLicenca(lic, contratos);
                            if (fonte.forma === 'sem_custo') return 'Sem custo';
                            if (fonte.semContratoVigente) return 'Sem contrato';
                            return `${formatCurrency(fonte.mensalDaLicenca)}/mês`;
                          })()}
                        </span>
                        <span className="texto-aux block">{origemCurta(lic, contratos)}</span>
                      </div>
                    </div>

                    {/* Ocupação: barra fina e a conta em uma linha */}
                    <div className="space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                        <div
                          className={`h-full rounded-full ${perc >= 100 ? 'bg-red-600' : perc >= 85 ? 'bg-amber-500' : 'bg-blue-600'}`}
                          style={{ width: `${Math.min(100, perc)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="texto-aux">
                          <span className="num font-semibold text-slate-900">
                            {lic.assentosAlocados} de {lic.assentosTotais}
                          </span>{' '}
                          {lic.assentosAlocados === 1 ? 'pessoa' : 'pessoas'}
                          {freeCount > 0 && <> · {freeCount} {freeCount === 1 ? 'livre' : 'livres'}</>}
                        </span>
                        <span className="relative z-10 flex items-center gap-1">
                          {!licencaAtiva(lic) && <span className="selo selo-neutro">Inativa</span>}
                          {freeCount === 0 && licencaAtiva(lic) && <span className="selo selo-problema">Esgotado</span>}
                          {isTI && (
                            <button
                              type="button"
                              onClick={() => {
                                setSoftwareToEdit(lic);
                                setSoftwareModalOpen(true);
                              }}
                              title="Editar"
                              aria-label={`Editar ${lic.nome}`}
                              className="btn-icone"
                            >
                              <Pencil />
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )
      ) : (
        /* Tabela de ativos físicos (hardware, periféricos, telefonia) */
        <div className="cartao-tabela">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Patrimônio</th>
                <th>Equipamento / modelo</th>
                <th className="hidden xl:table-cell">Número de série</th>
                <th>Custodiante atual</th>
                <th>Situação</th>
                <th className="hidden xl:table-cell">Garantia</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.length > 0 ? (
                filteredAssets.map((asset) => {
                  const custodian = getCustodian(asset.custodianteId);
                  const warranty = garantiaEfetiva(asset, contratos);

                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/70">
                      <td data-label="Patrimônio" className="font-mono font-semibold text-blue-700">
                        {asset.tag}
                      </td>
                      <td data-label="Equipamento / modelo">
                        <button type="button" onClick={() => setSelectedAssetIdFor360(asset.id)} className="font-semibold text-slate-900 hover:text-blue-700 text-left block">
                          {asset.nome}
                        </button>
                        <span className="texto-aux">
                          {asset.marca} {asset.modelo}
                        </span>
                      </td>
                      <td data-label="Número de série" className="hidden xl:table-cell font-mono text-slate-600">
                        {/* Fase 11: recebido de pedido sem série informada */}
                        {asset.serialNumber.startsWith('A-PREENCHER') ? <span className="selo selo-atencao font-sans">a preencher</span> : asset.serialNumber}
                      </td>

                      {/* Custodiante com link contextual 360° */}
                      <td data-label="Custodiante atual">
                        {custodian ? (
                          <button type="button" onClick={() => setSelectedEmployeeIdFor360(custodian.id)} className="link flex items-center gap-1">
                            <User className="ico-sm" />
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
                      <td data-label="Ações" className="col-acoes">
                        <span className="acoes-linha">
                          <button type="button" onClick={() => setSelectedAssetIdFor360(asset.id)} className="btn btn-sm btn-secundario">
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
                          <MenuAcoes
                            rotulo={`Mais ações de ${asset.tag}`}
                            acoes={[
                              {
                                rotulo: 'Duplicar (mesmo lote)',
                                icone: <Copy />,
                                onClick: () => setDuplicarDe(asset),
                                oculto: !isTI || asset.status === 'descartado',
                              },
                            ]}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7}>
                    <Vazio
                      titulo="Nenhum equipamento encontrado"
                      acao={
                        <button type="button" onClick={() => { setCategoryFilter('todos'); setStatusFilter('ativos'); setGarantiaFilter('todas'); setSearchTerm(''); }} className="btn btn-sm btn-secundario">
                          Limpar filtros
                        </button>
                      }
                    >
                      Nenhum equipamento com os filtros aplicados.
                    </Vazio>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showNewAssetModal && <NewAssetModal onClose={() => setShowNewAssetModal(false)} />}
      {duplicarDe && <NewAssetModal duplicarDe={duplicarDe} onClose={() => setDuplicarDe(null)} />}
    </div>
  );
};
