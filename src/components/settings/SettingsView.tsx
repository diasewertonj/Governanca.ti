import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { AssetCategory, UserRole } from '../../types/index.ts';
import {
  Settings,
  Building2,
  FolderTree,
  Sliders,
  Users,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Edit2,
  Database,
  Key,
  RotateCcw,
  Save,
  Shield,
  Search,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const {
    settings,
    updateSettings,
    departments,
    addDepartment,
    updateDepartment,
    deleteDepartment,
    employees,
    updateEmployeeRole,
    resetToInitialData,
    clearAllDataToProduction,
    isSupabaseConnected,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'empresa' | 'setores' | 'campos' | 'equipe' | 'banco'>('empresa');
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados da Gestão de Acessos / Equipe
  const [equipeSearch, setEquipeSearch] = useState('');
  const [equipeFilter, setEquipeFilter] = useState<'todos' | 'operadores'>('todos');

  // Estados dos Dados Institucionais
  const [razaoSocial, setRazaoSocial] = useState(settings.razaoSocial);
  const [nomeFantasia, setNomeFantasia] = useState(settings.nomeFantasia);
  const [cnpj, setCnpj] = useState(settings.cnpj);
  const [endereco, setEndereco] = useState(settings.endereco);
  const [cidadeUF, setCidadeUF] = useState(settings.cidadeUF);
  const [cep, setCep] = useState(settings.cep);
  const [emailTI, setEmailTI] = useState(settings.emailTI);
  const [telefoneTI, setTelefoneTI] = useState(settings.telefoneTI);
  const [textoTermoEntrega, setTextoTermoEntrega] = useState(settings.textoTermoEntrega);
  const [textoTermoDevolucao, setTextoTermoDevolucao] = useState(settings.textoTermoDevolucao);

  // Estados para Novo Setor
  const [novoSetorNome, setNovoSetorNome] = useState('');
  const [novoSetorCodigo, setNovoSetorCodigo] = useState('');
  const [novoSetorDesc, setNovoSetorDesc] = useState('');

  // Estados para Novo Campo Customizado
  const [novoCampoCategoria, setNovoCampoCategoria] = useState<AssetCategory>('hardware');
  const [novoCampoLabel, setNovoCampoLabel] = useState('');
  const [novoCampoTipo, setNovoCampoTipo] = useState<'text' | 'number' | 'date'>('text');

  const handleSaveCompanySettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      razaoSocial,
      nomeFantasia,
      cnpj,
      endereco,
      cidadeUF,
      cep,
      emailTI,
      telefoneTI,
      textoTermoEntrega,
      textoTermoDevolucao,
    });
    setSuccessMsg('Dados institucionais e cláusulas atualizados com sucesso!');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleAddDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoSetorNome.trim() || !novoSetorCodigo.trim()) return;

    addDepartment({
      nome: novoSetorNome.trim(),
      codigo: novoSetorCodigo.trim().toUpperCase(),
      descricao: novoSetorDesc.trim(),
      ativo: true,
    });

    setNovoSetorNome('');
    setNovoSetorCodigo('');
    setNovoSetorDesc('');
    setSuccessMsg('Novo setor cadastrado com sucesso!');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleDeleteDepartment = (depId: string) => {
    setErrorMsg(null);
    const result = deleteDepartment(depId);
    if (!result.success) {
      setErrorMsg(result.message || 'Erro ao excluir setor.');
    } else {
      setSuccessMsg('Setor removido com sucesso.');
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  const handleToggleDepartmentStatus = (depId: string, currentStatus: boolean) => {
    updateDepartment(depId, { ativo: !currentStatus });
  };

  const handleAddCustomField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoCampoLabel.trim()) return;

    const key = novoCampoLabel
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_');

    const novo = {
      id: `cf-${Date.now()}`,
      categoria: novoCampoCategoria,
      key,
      label: novoCampoLabel.trim(),
      tipo: novoCampoTipo,
    };

    updateSettings({
      camposPersonalizados: [...settings.camposPersonalizados, novo],
    });

    setNovoCampoLabel('');
    setSuccessMsg('Campo personalizado adicionado com sucesso!');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleRemoveCustomField = (cfId: string) => {
    updateSettings({
      camposPersonalizados: settings.camposPersonalizados.filter((cf) => cf.id !== cfId),
    });
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Configurações Gerais da Empresa</h2>
          <p className="text-xs text-slate-500">
            Parâmetros institucionais, integridade referencial de setores e atributos personalizados
          </p>
        </div>

        {/* Tabs de Configuração */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('empresa')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'empresa'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dados Institucionais
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('setores')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'setores'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Gestão de Setores
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('campos')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'campos'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Campos Customizados
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('equipe')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'equipe'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Equipe TI & RH
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('banco')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'banco'
                ? 'bg-white text-emerald-900 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            <span>Banco & Supabase</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2.5 rounded-lg text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ABA 1: DADOS INSTITUCIONAIS & TERMOS */}
      {activeTab === 'empresa' && (
        <form onSubmit={handleSaveCompanySettings} className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-semibold text-slate-900">Identificação Jurídica e Contatos de TI</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Estes dados são carregados dinamicamente nos cabeçalhos dos Termos de Responsabilidade A4 e etiquetas
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Razão Social</label>
              <input
                type="text"
                required
                value={razaoSocial}
                onChange={(e) => setRazaoSocial(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Fantasia</label>
              <input
                type="text"
                required
                value={nomeFantasia}
                onChange={(e) => setNomeFantasia(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">CNPJ</label>
              <input
                type="text"
                required
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Endereço Completo</label>
              <input
                type="text"
                required
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cidade / UF</label>
              <input
                type="text"
                required
                value={cidadeUF}
                onChange={(e) => setCidadeUF(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">CEP</label>
              <input
                type="text"
                required
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail do Suporte de TI</label>
              <input
                type="email"
                required
                value={emailTI}
                onChange={(e) => setEmailTI(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone / Ramal de TI</label>
              <input
                type="text"
                required
                value={telefoneTI}
                onChange={(e) => setTelefoneTI(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>

          {/* Cláusulas dos Termos */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Cláusulas Padrão para Termos de Responsabilidade
            </h4>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Texto Legal do Termo de Entrega de Equipamentos
              </label>
              <textarea
                rows={3}
                value={textoTermoEntrega}
                onChange={(e) => setTextoTermoEntrega(e.target.value)}
                className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-800 leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Texto Legal do Termo de Devolução e Baixa Patrimonial
              </label>
              <textarea
                rows={3}
                value={textoTermoDevolucao}
                onChange={(e) => setTextoTermoDevolucao(e.target.value)}
                className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-800 leading-relaxed"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Configurações Institucionais</span>
            </button>
          </div>
        </form>
      )}

      {/* ABA 2: GESTÃO DE SETORES COM PROTEÇÃO REFERENCIAL */}
      {activeTab === 'setores' && (
        <div className="space-y-6">
          {/* Formulário de Novo Setor */}
          <form onSubmit={handleAddDepartment} className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Cadastrar Novo Setor / Departamento</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Setor</label>
                <input
                  type="text"
                  required
                  value={novoSetorNome}
                  onChange={(e) => setNovoSetorNome(e.target.value)}
                  placeholder="Ex: Operações & Logística"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sigla / Código</label>
                <input
                  type="text"
                  required
                  maxLength={5}
                  value={novoSetorCodigo}
                  onChange={(e) => setNovoSetorCodigo(e.target.value)}
                  placeholder="Ex: OPR"
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Finalidade / Descrição</label>
                <input
                  type="text"
                  value={novoSetorDesc}
                  onChange={(e) => setNovoSetorDesc(e.target.value)}
                  placeholder="Ex: Centro de distribuição e fretes"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Setor</span>
              </button>
            </div>
          </form>

          {/* Tabela de Setores Existentes */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Setores Cadastrados ({departments.length})</h3>
                <p className="text-xs text-slate-500">
                  Regra de integridade: setores com colaboradores vinculados não podem ser excluídos, apenas inativados
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Nome do Setor</th>
                    <th className="py-3 px-4">Descrição</th>
                    <th className="py-3 px-4">Colaboradores Vinculados</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {departments.map((dep) => {
                    const linkedCount = employees.filter((e) => e.setorId === dep.id).length;

                    return (
                      <tr key={dep.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{dep.codigo}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{dep.nome}</td>
                        <td className="py-3 px-4 text-slate-500">{dep.descricao || '-'}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              linkedCount > 0 ? 'text-blue-700' : 'text-slate-400'
                            }`}
                          >
                            {linkedCount} colaborador(es)
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleDepartmentStatus(dep.id, dep.ativo)}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded cursor-pointer ${
                              dep.ativo
                                ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                                : 'text-slate-500 bg-slate-100 border border-slate-200'
                            }`}
                          >
                            {dep.ativo ? 'Ativo' : 'Inativo'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteDepartment(dep.id)}
                            title={
                              linkedCount > 0
                                ? 'Setor protegido contra exclusão pois tem colaboradores vinculados'
                                : 'Excluir setor'
                            }
                            className={`p-1.5 rounded transition-colors ${
                              linkedCount > 0
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-rose-500 hover:bg-rose-50 hover:text-rose-700'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: CAMPOS PERSONALIZADOS POR CATEGORIA */}
      {activeTab === 'campos' && (
        <div className="space-y-6">
          <form onSubmit={handleAddCustomField} className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Adicionar Atributo Dinâmico por Categoria</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria de Ativo</label>
                <select
                  value={novoCampoCategoria}
                  onChange={(e) => setNovoCampoCategoria(e.target.value as AssetCategory)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                >
                  <option value="hardware">Hardware</option>
                  <option value="periferico">Periféricos</option>
                  <option value="telefonia">Telefonia</option>
                  <option value="software">Software</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rótulo do Campo (Label)</label>
                <input
                  type="text"
                  required
                  value={novoCampoLabel}
                  onChange={(e) => setNovoCampoLabel(e.target.value)}
                  placeholder="Ex: Versão do Firmware, Voltagem..."
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Dado</label>
                <select
                  value={novoCampoTipo}
                  onChange={(e) => setNovoCampoTipo(e.target.value as any)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                >
                  <option value="text">Texto Livre</option>
                  <option value="number">Numérico</option>
                  <option value="date">Data</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Salvar Atributo</span>
              </button>
            </div>
          </form>

          {/* Lista de Campos Cadastrados */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Atributos Ativos no Sistema</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {settings.camposPersonalizados.map((cf) => (
                <div
                  key={cf.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-900 block">{cf.label}</span>
                    <span className="text-[10px] text-slate-500 uppercase font-mono">
                      {cf.categoria} · {cf.tipo}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomField(cf.id)}
                    className="text-slate-400 hover:text-rose-600 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: EQUIPE TI & RH / DEFINIÇÃO DE QUEM OPERA O SISTEMA */}
      {activeTab === 'equipe' && (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600" />
                <span>Gestão de Operadores e Níveis de Acesso ao Sistema (RBAC)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Defina e altere diretamente os privilégios de quem pode operar a governança de T.I., o suporte e os processos de RH
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={equipeSearch}
                  onChange={(e) => setEquipeSearch(e.target.value)}
                  placeholder="Buscar colaborador..."
                  className="w-48 text-xs pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
                <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
              </div>

              <select
                value={equipeFilter}
                onChange={(e) => setEquipeFilter(e.target.value as any)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700"
              >
                <option value="todos">Todos os Colaboradores</option>
                <option value="operadores">Apenas Operadores (TI & RH)</option>
              </select>
            </div>
          </div>

          {/* Cards explicativos das 4 permissões */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-1">
              <span className="font-bold text-blue-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                Admin de T.I.
              </span>
              <p className="text-[11px] text-blue-800 leading-tight">
                Acesso integral: inventário 1:1, fila de chamados, configurações, termos, setores e gestão de operadores.
              </p>
            </div>

            <div className="p-3 bg-cyan-50/60 border border-cyan-200 rounded-lg space-y-1">
              <span className="font-bold text-cyan-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-600"></span>
                Suporte de T.I.
              </span>
              <p className="text-[11px] text-cyan-800 leading-tight">
                Atendimento da fila de chamados, movimentação de equipamentos, checklists técnicos e termos A4.
              </p>
            </div>

            <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-lg space-y-1">
              <span className="font-bold text-purple-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                Recursos Humanos (RH)
              </span>
              <p className="text-[11px] text-purple-800 leading-tight">
                Condução de On/Offboarding, inventário em tempo real, regras condicionais e chamados próprios.
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                Colaborador (Solicitante)
              </span>
              <p className="text-[11px] text-slate-600 leading-tight">
                Acesso restrito: visualiza apenas seus equipamentos sob custódia e abre chamados com filtro do seu ativo.
              </p>
            </div>
          </div>

          {/* Tabela de Atribuição de Papéis */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Colaborador</th>
                    <th className="py-3 px-4">E-mail Corporativo</th>
                    <th className="py-3 px-4">Setor / Cargo</th>
                    <th className="py-3 px-4">Papel Atual</th>
                    <th className="py-3 px-4 text-right">Alterar Nível de Acesso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {employees
                    .filter((emp) => {
                      const role = emp.role || (emp.email.includes('admin.ti') ? 'ti_admin' : emp.email.includes('rh@') ? 'rh' : emp.email.includes('.ti@') ? 'ti_suporte' : 'colaborador');
                      const matchesSearch =
                        emp.nome.toLowerCase().includes(equipeSearch.toLowerCase()) ||
                        emp.email.toLowerCase().includes(equipeSearch.toLowerCase()) ||
                        emp.matricula.toLowerCase().includes(equipeSearch.toLowerCase());
                      const matchesOperator = equipeFilter === 'todos' || role !== 'colaborador';
                      return matchesSearch && matchesOperator;
                    })
                    .map((emp) => {
                      const currentEmpRole: UserRole = emp.role || (
                        emp.email === 'admin.ti@nexuscorp.com.br'
                          ? 'ti_admin'
                          : emp.email === 'rh@nexuscorp.com.br' || emp.setorId === 'dep-2'
                          ? 'rh'
                          : emp.email.includes('.ti@')
                          ? 'ti_suporte'
                          : 'colaborador'
                      );

                      const roleBadgeStyles: Record<UserRole, string> = {
                        ti_admin: 'text-blue-700 bg-blue-50 border-blue-200',
                        ti_suporte: 'text-cyan-700 bg-cyan-50 border-cyan-200',
                        rh: 'text-purple-700 bg-purple-50 border-purple-200',
                        colaborador: 'text-slate-600 bg-slate-100 border-slate-200',
                      };

                      const roleLabelsText: Record<UserRole, string> = {
                        ti_admin: 'Admin T.I.',
                        ti_suporte: 'Suporte T.I.',
                        rh: 'Recursos Humanos',
                        colaborador: 'Colaborador',
                      };

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center text-xs">
                                {emp.nome.charAt(0)}
                              </div>
                              <div>
                                <span className="font-semibold text-slate-900 block">{emp.nome}</span>
                                <span className="font-mono text-[10px] text-slate-400">{emp.matricula}</span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {emp.email}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="text-slate-800 block">{emp.cargo}</span>
                            <span className="text-[10px] text-slate-400">
                              {departments.find((d) => d.id === emp.setorId)?.nome || '-'}
                            </span>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${roleBadgeStyles[currentEmpRole]}`}>
                              {roleLabelsText[currentEmpRole]}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <select
                              value={currentEmpRole}
                              onChange={(e) => {
                                const newRole = e.target.value as UserRole;
                                updateEmployeeRole(emp.id, newRole);
                                setSuccessMsg(`Permissão de "${emp.nome}" alterada para "${roleLabelsText[newRole]}".`);
                                setTimeout(() => setSuccessMsg(null), 3000);
                              }}
                              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
                            >
                              <option value="ti_admin">Administrador de T.I. (Acesso Total)</option>
                              <option value="ti_suporte">Técnico de Suporte T.I.</option>
                              <option value="rh">Recursos Humanos (RH)</option>
                              <option value="colaborador">Colaborador Padrão (Sem Acesso de Gestão)</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Aba: Banco de Dados & Conexão Supabase */}
      {activeTab === 'banco' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  Status da Conexão com Supabase (PostgreSQL)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Conexão direta com banco relacional na nuvem e suporte a Row Level Security (RLS)
                </p>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                  isSupabaseConnected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isSupabaseConnected ? 'bg-emerald-600 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                {isSupabaseConnected ? 'Supabase Conectado' : 'Modo Local (Aguardando Chaves)'}
              </span>
            </div>

            {/* Chaves e Instruções de Configuração */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-slate-600" />
                Como conectar seu Supabase em 3 Passos
              </h4>

              <div className="space-y-3 text-xs text-slate-700">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                    1
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">Execute o Schema no Supabase SQL Editor:</p>
                    <p className="text-slate-500 mt-0.5">
                      Copie o conteúdo do arquivo <code className="bg-white px-1.5 py-0.5 rounded border border-slate-300 font-mono text-[11px]">supabase-schema.sql</code> já criado na raiz do projeto e cole na aba <strong>SQL Editor</strong> do painel do Supabase.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                    2
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">Obtenha as Chaves de API:</p>
                    <p className="text-slate-500 mt-0.5">
                      No Supabase, acesse <strong>Project Settings &gt; API</strong> e copie a <strong>Project URL</strong> e a chave <strong>anon public</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                    3
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">Configure na Vercel ou no arquivo .env:</p>
                    <p className="text-slate-500 mt-0.5">
                      Na Vercel, vá em <strong>Settings &gt; Environment Variables</strong> e adicione:
                    </p>
                    <pre className="mt-2 bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[11px] overflow-x-auto">
{`VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-aqui`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {/* Zona de Perigo: Zerar Dados de Exemplo */}
            <div className="border border-rose-200 bg-rose-50/40 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wide">
                    Zona de Produção: Zerar Dados de Exemplo
                  </h4>
                  <p className="text-xs text-rose-700 mt-0.5">
                    Utilize esta opção quando quiser iniciar a operação real da empresa, limpando dados fictícios de ativos, colaboradores e chamados.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Zerar Dados de Exemplo (Reset de Fábrica)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Restaurar a base completa de demonstração?')) {
                      resetToInitialData();
                      setSuccessMsg('Base de demonstração restaurada.');
                      setTimeout(() => setSuccessMsg(null), 3000);
                    }
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restaurar Base de Demonstração</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Seguro para Zerar Dados */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-sm font-bold text-slate-900">Confirmar Limpeza Completa da Base</h3>
              <p className="text-xs text-slate-500 mt-1">
                Esta ação apagará todos os ativos, licenças, colaboradores e chamados de teste para iniciar a base limpa de produção.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-2">
              <label className="block text-[11px] font-semibold text-slate-700">
                Para confirmar, digite <span className="font-mono font-bold text-rose-600">ZERAR</span> abaixo:
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="Digite ZERAR"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-md font-mono text-center text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmText('');
                }}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={resetConfirmText.trim().toUpperCase() !== 'ZERAR'}
                onClick={() => {
                  clearAllDataToProduction();
                  setShowResetModal(false);
                  setResetConfirmText('');
                  setSuccessMsg('Base zerada com sucesso! O sistema está pronto para produção.');
                  setTimeout(() => setSuccessMsg(null), 4000);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-40"
              >
                Confirmar e Limpar Base
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
