import { confirmar } from '../ui/dialogo.tsx';
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { AssetCategory, Employee, ModeloDocumento, UserRole } from '../../types/index.ts';
import { BarraAlteracoes } from '../comum/BarraAlteracoes.tsx';
import { CatalogoSettings } from './CatalogoSettings.tsx';
import { PrazosSettings } from './PrazosSettings.tsx';
import { UnidadesLista } from '../fornecedores/UnidadesLista.tsx';
import { Janela } from '../ui/Janela.tsx';
import { NavLateral, type GrupoNav } from '../ui/Abas.tsx';
import { CabecalhoTela } from '../ui/Tela.tsx';
import { DOC_DEVOLUCAO_PADRAO, DOC_ENTREGA_PADRAO } from '../../utils/processos.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { mensagemDeErro } from '../../services/supabaseDb.ts';
import {
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Database,
  RotateCcw,
  Shield,
  Search,
  RefreshCw,
} from 'lucide-react';

const ROTULO_PAPEL: Record<UserRole, string> = {
  ti_admin: 'Administrador de T.I.',
  ti_suporte: 'Suporte de T.I.',
  rh: 'Recursos Humanos',
  colaborador: 'Colaborador',
};

const ROTULO_CATEGORIA: Record<AssetCategory, string> = {
  hardware: 'Hardware',
  periferico: 'Periférico',
  telefonia: 'Telefonia',
  software: 'Software',
};

const ROTULO_CAMPO_EMPRESA = {
  razaoSocial: 'razão social',
  nomeFantasia: 'nome fantasia',
  cnpj: 'CNPJ',
  endereco: 'endereço',
  cidadeUF: 'cidade/UF',
  cep: 'CEP',
  emailTI: 'e-mail da TI',
  telefoneTI: 'telefone da TI',
  textoTermoEntrega: 'texto do termo de entrega',
  textoTermoDevolucao: 'texto do termo de devolução',
} as const;

// Fase 7: abas com nomes do glossário (a chave interna não muda)
type Aba = 'empresa' | 'documentos' | 'unidades' | 'setores' | 'equipe' | 'catalogo' | 'prazos' | 'campos' | 'banco';
const GRUPOS: GrupoNav<Aba>[] = [
  {
    titulo: 'Empresa',
    itens: [
      { id: 'empresa', rotulo: 'Dados da empresa' },
      { id: 'documentos', rotulo: 'Documentos e termos' },
      { id: 'unidades', rotulo: 'Unidades' },
    ],
  },
  {
    titulo: 'Pessoas e acesso',
    itens: [
      { id: 'setores', rotulo: 'Setores' },
      { id: 'equipe', rotulo: 'Usuários e permissões' },
    ],
  },
  {
    titulo: 'Atendimento',
    itens: [
      { id: 'catalogo', rotulo: 'Catálogo de admissão' },
      { id: 'prazos', rotulo: 'Prazos de atendimento' },
    ],
  },
  { titulo: 'Inventário', itens: [{ id: 'campos', rotulo: 'Campos dos ativos' }] },
  { titulo: 'Sistema', itens: [{ id: 'banco', rotulo: 'Conexão' }] },
];

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
    supabaseHealth,
    refreshSupabaseData,
  } = useApp();

  const [activeTab, setActiveTab] = useState<Aba>('empresa');
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  // Fase 6: documentos controlados da Qualidade (código, versão, referência ao POP)
  const docEntregaSalvo = settings.docEntrega || DOC_ENTREGA_PADRAO;
  const docDevolucaoSalvo = settings.docDevolucao || DOC_DEVOLUCAO_PADRAO;
  const [docEntrega, setDocEntrega] = useState<ModeloDocumento>(docEntregaSalvo);
  const [docDevolucao, setDocDevolucao] = useState<ModeloDocumento>(docDevolucaoSalvo);
  const docsAlterados =
    JSON.stringify(docEntrega) !== JSON.stringify(docEntregaSalvo) ||
    JSON.stringify(docDevolucao) !== JSON.stringify(docDevolucaoSalvo);
  // Fase 7: logo da empresa (link https)
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '');
  const logoAlterado = logoUrl.trim() !== (settings.logoUrl || '');
  const logoInvalido = logoUrl.trim() !== '' && !/^https:\/\//i.test(logoUrl.trim());

  // Estados para Novo Setor
  const [novoSetorNome, setNovoSetorNome] = useState('');
  const [novoSetorCodigo, setNovoSetorCodigo] = useState('');
  const [novoSetorDesc, setNovoSetorDesc] = useState('');

  // Estados para Novo Campo Customizado
  const [novoCampoCategoria, setNovoCampoCategoria] = useState<AssetCategory>('hardware');
  const [novoCampoLabel, setNovoCampoLabel] = useState('');
  const [novoCampoTipo, setNovoCampoTipo] = useState<'text' | 'number' | 'date'>('text');

  // ---------------------------------------------------------------------------
  // Fase 5: papéis, situação dos setores e dados da empresa ficam em rascunho.
  // Nada é gravado até "Salvar alterações"; "Cancelar" volta tudo ao original.
  // ---------------------------------------------------------------------------
  const [papeisPendentes, setPapeisPendentes] = useState<Record<string, UserRole>>({});
  const [setoresPendentes, setSetoresPendentes] = useState<Record<string, boolean>>({});

  const papelAtual = (emp: Employee): UserRole => emp.role || 'colaborador';

  const empresaRascunho = {
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
  };
  const camposEmpresaAlterados = (Object.keys(empresaRascunho) as (keyof typeof empresaRascunho)[]).filter(
    (k) => empresaRascunho[k] !== settings[k]
  );

  const itensPendentes: string[] = [
    ...Object.entries(papeisPendentes).flatMap(([id, papel]) => {
      const emp = employees.find((e) => e.id === id);
      return emp ? [`Papel de ${emp.nome}: ${ROTULO_PAPEL[papelAtual(emp)]} → ${ROTULO_PAPEL[papel]}`] : [];
    }),
    ...Object.entries(setoresPendentes).flatMap(([id, ativo]) => {
      const dep = departments.find((d) => d.id === id);
      return dep ? [`Setor ${dep.nome}: ${ativo ? 'reativar' : 'inativar'}`] : [];
    }),
    ...(camposEmpresaAlterados.length > 0
      ? [`Dados da empresa: ${camposEmpresaAlterados.map((k) => ROTULO_CAMPO_EMPRESA[k]).join(', ')}`]
      : []),
    ...(docsAlterados ? ['Documentos da Qualidade (código/versão dos termos)'] : []),
    ...(logoAlterado ? ['Logo da empresa'] : []),
  ];
  useRegistrarPendencias('configuracoes', itensPendentes);

  const descartarTudo = () => {
    setPapeisPendentes({});
    setSetoresPendentes({});
    setRazaoSocial(settings.razaoSocial);
    setNomeFantasia(settings.nomeFantasia);
    setCnpj(settings.cnpj);
    setEndereco(settings.endereco);
    setCidadeUF(settings.cidadeUF);
    setCep(settings.cep);
    setEmailTI(settings.emailTI);
    setTelefoneTI(settings.telefoneTI);
    setTextoTermoEntrega(settings.textoTermoEntrega);
    setTextoTermoDevolucao(settings.textoTermoDevolucao);
    setDocEntrega(docEntregaSalvo);
    setDocDevolucao(docDevolucaoSalvo);
    setLogoUrl(settings.logoUrl || '');
  };

  const salvarTudo = async () => {
    // Valida antes de gravar qualquer coisa (nada fica salvo pela metade)
    if (logoInvalido) {
      setActiveTab('empresa');
      setErrorMsg('O logo precisa ser um link que começa com https://');
      return;
    }
    const viramAdmin = Object.entries(papeisPendentes)
      .filter(([id, papel]) => {
        const emp = employees.find((e) => e.id === id);
        return papel === 'ti_admin' && emp && papelAtual(emp) !== 'ti_admin';
      })
      .map(([id]) => employees.find((e) => e.id === id)?.nome);
    if (
      viramAdmin.length > 0 &&
      !(await confirmar(
        `Dar acesso TOTAL (Administrador de T.I.) a: ${viramAdmin.join(', ')}?\n\n` +
          'Administradores trocam papéis, alteram setores e configurações e anonimizam dados pessoais.'
      ))
    ) {
      return;
    }
    Object.entries(papeisPendentes).forEach(([id, papel]) => updateEmployeeRole(id, papel));
    Object.entries(setoresPendentes).forEach(([id, ativo]) => updateDepartment(id, { ativo }));
    if (camposEmpresaAlterados.length > 0 || docsAlterados || logoAlterado) {
      updateSettings({ ...empresaRascunho, docEntrega, docDevolucao, logoUrl: logoUrl.trim() || undefined });
    }
    setPapeisPendentes({});
    setSetoresPendentes({});
    setSuccessMsg('Alterações salvas.');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleSaveCompanySettings = (e: React.FormEvent) => {
    e.preventDefault();
    salvarTudo();
  };

  const alterarPapel = (emp: Employee, novo: UserRole) => {
    setPapeisPendentes((p) => {
      const resto = { ...p };
      if (novo === papelAtual(emp)) delete resto[emp.id];
      else resto[emp.id] = novo;
      return resto;
    });
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

  const handleDeleteDepartment = async (depId: string) => {
    setErrorMsg(null);
    const dep = departments.find((d) => d.id === depId);
    const vinculados = employees.filter((e) => e.setorId === depId).length;
    // Fase 5: exclusão sempre pede confirmação (antes: um clique apagava)
    if (vinculados === 0 && !(await confirmar(`Excluir o setor "${dep?.nome}"?\n\nEssa ação não pode ser desfeita.`))) return;
    setSetoresPendentes((p) => {
      const resto = { ...p };
      delete resto[depId];
      return resto;
    });
    const result = deleteDepartment(depId);
    if (!result.success) {
      setErrorMsg(result.message || 'Erro ao excluir setor.');
    } else {
      setSuccessMsg('Setor removido com sucesso.');
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  // Fase 5: ativar/inativar vira rascunho (salvo pela barra de alterações)
  const handleToggleDepartmentStatus = (depId: string, ativoExibido: boolean) => {
    const original = departments.find((d) => d.id === depId)?.ativo;
    setSetoresPendentes((p) => {
      const resto = { ...p };
      if (!ativoExibido === original) delete resto[depId];
      else resto[depId] = !ativoExibido;
      return resto;
    });
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

  const handleRemoveCustomField = async (cfId: string) => {
    const campo = settings.camposPersonalizados.find((cf) => cf.id === cfId);
    if (
      !(await confirmar(
        `Remover o campo personalizado "${campo?.label}"?\n\nOs valores já preenchidos nos ativos deixam de aparecer na ficha.`
      ))
    ) {
      return;
    }
    updateSettings({
      camposPersonalizados: settings.camposPersonalizados.filter((cf) => cf.id !== cfId),
    });
  };

  const papeisSelo: Record<UserRole, string> = {
    ti_admin: 'selo-info',
    ti_suporte: 'selo-ok',
    rh: 'selo-atencao',
    colaborador: 'selo-neutro',
  };

  const secao = (titulo: string, descricao?: string) => (
    <div className="mb-3">
      <h3 className="secao-titulo">{titulo}</h3>
      {descricao && <p className="ajuda">{descricao}</p>}
    </div>
  );

  const conexaoOk = isSupabaseConnected && supabaseHealth?.tablesExist;

  return (
    <div className="space-y-4">
      <CabecalhoTela titulo="Configurações" subtitulo="Edite os campos de qualquer seção: a barra Salvar alterações aparece embaixo assim que houver mudança. Nada grava sozinho." />

      {successMsg && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <NavLateral rotulo="Seções das configurações" grupos={GRUPOS} ativa={activeTab} onMudar={setActiveTab} />

        <div className="min-w-0 space-y-4">
          {/* DADOS DA EMPRESA E DOCUMENTOS E TERMOS */}
          {(activeTab === 'empresa' || activeTab === 'documentos') && (
            <form onSubmit={handleSaveCompanySettings} className="space-y-4">
              {activeTab === 'empresa' && (
                <>
                  <div className="cartao p-4">
                    {secao('Identificação jurídica', 'Aparece no cabeçalho dos termos e nas etiquetas')}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
                      <div className="xl:col-span-2">
                        <label htmlFor="emp-razao" className="rotulo">Razão social</label>
                        <input id="emp-razao" type="text" required value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} className="campo" />
                      </div>
                      <div>
                        <label htmlFor="emp-fantasia" className="rotulo">Nome fantasia</label>
                        <input id="emp-fantasia" type="text" required value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} className="campo" />
                      </div>
                      <div>
                        <label htmlFor="emp-cnpj" className="rotulo">CNPJ</label>
                        <input id="emp-cnpj" type="text" required value={cnpj} onChange={(e) => setCnpj(e.target.value)} className="campo font-mono" />
                      </div>
                    </div>
                  </div>

                  <div className="cartao p-4">
                    {secao('Endereço')}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
                      <div className="md:col-span-3 xl:col-span-2">
                        <label htmlFor="emp-endereco" className="rotulo">Endereço completo</label>
                        <input id="emp-endereco" type="text" required value={endereco} onChange={(e) => setEndereco(e.target.value)} className="campo" />
                      </div>
                      <div>
                        <label htmlFor="emp-cep" className="rotulo">CEP</label>
                        <input id="emp-cep" type="text" required value={cep} onChange={(e) => setCep(e.target.value)} className="campo font-mono" />
                      </div>
                      <div>
                        <label htmlFor="emp-cidade" className="rotulo">Cidade / UF</label>
                        <input id="emp-cidade" type="text" required value={cidadeUF} onChange={(e) => setCidadeUF(e.target.value)} className="campo" />
                      </div>
                    </div>
                  </div>

                  <div className="cartao p-4">
                    {secao('Contatos da T.I.')}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
                      <div className="md:col-span-2">
                        <label htmlFor="emp-email" className="rotulo">E-mail do suporte de TI</label>
                        <input id="emp-email" type="email" required value={emailTI} onChange={(e) => setEmailTI(e.target.value)} className="campo" />
                      </div>
                      <div>
                        <label htmlFor="emp-telefone" className="rotulo">Telefone / ramal de TI</label>
                        <input id="emp-telefone" type="text" required value={telefoneTI} onChange={(e) => setTelefoneTI(e.target.value)} className="campo" />
                      </div>
                    </div>
                  </div>

                  {/* Fase 7: logo (link https) — aparece no cabeçalho do sistema */}
                  <div className="cartao p-4">
                    {secao('Logo', 'Aparece no cabeçalho do sistema')}
                    <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3 xl:grid-cols-4">
                      <div className="md:col-span-2 xl:col-span-2">
                        <label htmlFor="emp-logo" className="rotulo">Logo da empresa (link https)</label>
                        <input
                          id="emp-logo"
                          type="url"
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                          placeholder="https://www.suaempresa.com.br/logo.png"
                          aria-invalid={logoInvalido}
                          className="campo"
                        />
                        {logoInvalido && <p className="erro">Use um link que começa com https://</p>}
                      </div>
                      {logoUrl.trim() && !logoInvalido && (
                        <img
                          src={logoUrl.trim()}
                          alt="Prévia do logo"
                          className="h-12 w-auto max-w-[12rem] rounded-lg border border-slate-200 bg-white object-contain p-1"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'documentos' && (
                <>
                  {/* Fase 6: documentos controlados (Qualidade) com o texto legal de cada um */}
                  <p className="text-xs text-slate-500">
                    Código, versão e referência aparecem no cabeçalho dos termos. Mantenha igual à versão aprovada pela
                    Qualidade no POP.
                  </p>
                  {(
                    [
                      ['Termo de entrega', docEntrega, setDocEntrega, 'Texto legal do termo de entrega', textoTermoEntrega, setTextoTermoEntrega],
                      ['Recibo de devolução', docDevolucao, setDocDevolucao, 'Texto legal do termo de devolução e baixa patrimonial', textoTermoDevolucao, setTextoTermoDevolucao],
                    ] as const
                  ).map(([nome, doc, setDoc, rotuloTexto, texto, setTexto]) => (
                    <div key={nome} className="cartao p-4">
                      {secao(nome)}
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
                        {(
                          [
                            ['codigo', 'Código', ''],
                            ['versao', 'Versão', ''],
                            ['referencia', 'Referência (POP)', ''],
                            ['titulo', 'Título', 'md:col-span-3 xl:col-span-4'],
                          ] as const
                        ).map(([chave, rotulo, cols]) => (
                          <div key={chave} className={cols}>
                            <label htmlFor={`doc-${nome}-${chave}`} className="rotulo">{rotulo}</label>
                            <input id={`doc-${nome}-${chave}`} value={doc[chave]} onChange={(e) => setDoc({ ...doc, [chave]: e.target.value })} className="campo" />
                          </div>
                        ))}
                        <div className="md:col-span-3 xl:col-span-4">
                          <label htmlFor={`doc-${nome}-texto`} className="rotulo">{rotuloTexto}</label>
                          <textarea id={`doc-${nome}-texto`} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} className="campo leading-relaxed" />
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </form>
          )}

          {/* UNIDADES */}
          {activeTab === 'unidades' && (
            <div className="space-y-3">
              {secao('Unidades', 'Locais da empresa (matriz, filiais) usados em equipamentos, contratos e fornecedores')}
              <UnidadesLista />
            </div>
          )}

          {/* SETORES COM PROTEÇÃO REFERENCIAL */}
          {activeTab === 'setores' && (
            <>
              <form onSubmit={handleAddDepartment} className="cartao p-4">
                {secao('Cadastrar novo setor / departamento')}
                <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-4 xl:grid-cols-6">
                  <div className="md:col-span-2">
                    <label htmlFor="setor-nome" className="rotulo">Nome do setor</label>
                    <input id="setor-nome" type="text" required value={novoSetorNome} onChange={(e) => setNovoSetorNome(e.target.value)} placeholder="Ex: Operações & Logística" className="campo" />
                  </div>
                  <div>
                    <label htmlFor="setor-codigo" className="rotulo">Sigla / código</label>
                    <input id="setor-codigo" type="text" required maxLength={5} value={novoSetorCodigo} onChange={(e) => setNovoSetorCodigo(e.target.value)} placeholder="Ex: OPR" className="campo font-mono" />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="setor-desc" className="rotulo">Finalidade / descrição</label>
                    <input id="setor-desc" type="text" value={novoSetorDesc} onChange={(e) => setNovoSetorDesc(e.target.value)} placeholder="Ex: Centro de distribuição e fretes" className="campo" />
                  </div>
                  <button type="submit" className="btn btn-primario">
                    <Plus />
                    <span>Adicionar setor</span>
                  </button>
                </div>
              </form>

              <div className="cartao overflow-hidden">
                <div className="border-b border-slate-100 p-4">
                  <h3 className="secao-titulo">Setores cadastrados ({departments.length})</h3>
                  <p className="ajuda">Regra de integridade: setores com colaboradores vinculados não podem ser excluídos, apenas inativados</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="tabela tabela-cartoes">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Nome do setor</th>
                        <th>Descrição</th>
                        <th>Colaboradores vinculados</th>
                        <th>Situação</th>
                        <th className="text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departments.map((dep) => {
                        const linkedCount = employees.filter((e) => e.setorId === dep.id).length;
                        const ativoExibido = setoresPendentes[dep.id] ?? dep.ativo;
                        return (
                          <tr key={dep.id}>
                            <td data-label="Código" className="font-mono font-bold text-slate-900">{dep.codigo}</td>
                            <td data-label="Nome do setor" className="font-semibold text-slate-900">{dep.nome}</td>
                            <td data-label="Descrição" className="text-slate-500">{dep.descricao || '-'}</td>
                            <td data-label="Colaboradores vinculados">{linkedCount} colaborador(es)</td>
                            <td data-label="Situação">
                              <button
                                type="button"
                                onClick={() => handleToggleDepartmentStatus(dep.id, ativoExibido)}
                                title="Ativar ou inativar (salvo pela barra de alterações)"
                                className={`selo cursor-pointer ${ativoExibido ? 'selo-ok' : 'selo-neutro'} ${dep.id in setoresPendentes ? 'ring-2 ring-amber-400' : ''}`}
                              >
                                {ativoExibido ? 'Ativo' : 'Inativo'}
                                {dep.id in setoresPendentes && ' (não salvo)'}
                              </button>
                            </td>
                            <td data-label="Ações" className="text-right">
                              <div className="acoes-linha">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDepartment(dep.id)}
                                  title={linkedCount > 0 ? 'Setor protegido contra exclusão pois tem colaboradores vinculados' : 'Excluir setor'}
                                  aria-label={`Excluir setor ${dep.nome}`}
                                  className={`btn-icone btn-icone-perigo ${linkedCount > 0 ? 'opacity-40' : ''}`}
                                >
                                  <Trash2 />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* CAMPOS PERSONALIZADOS POR CATEGORIA */}
          {activeTab === 'campos' && (
            <>
              <form onSubmit={handleAddCustomField} className="cartao p-4">
                {secao('Novo campo')}
                <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
                  <div>
                    <label htmlFor="campo-categoria" className="rotulo">Categoria de ativo</label>
                    <select id="campo-categoria" value={novoCampoCategoria} onChange={(e) => setNovoCampoCategoria(e.target.value as AssetCategory)} className="campo">
                      <option value="hardware">Hardware</option>
                      <option value="periferico">Periféricos</option>
                      <option value="telefonia">Telefonia</option>
                      <option value="software">Software</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="campo-nome" className="rotulo">Nome do campo</label>
                    <input id="campo-nome" type="text" required value={novoCampoLabel} onChange={(e) => setNovoCampoLabel(e.target.value)} placeholder="Ex: Versão do Firmware, Voltagem..." className="campo" />
                  </div>
                  <div>
                    <label htmlFor="campo-tipo" className="rotulo">Tipo de dado</label>
                    <select id="campo-tipo" value={novoCampoTipo} onChange={(e) => setNovoCampoTipo(e.target.value as 'text' | 'number' | 'date')} className="campo">
                      <option value="text">Texto livre</option>
                      <option value="number">Numérico</option>
                      <option value="date">Data</option>
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primario">
                    <Plus />
                    <span>Adicionar campo</span>
                  </button>
                </div>
              </form>

              <div className="cartao space-y-4 p-4">
                <h3 className="secao-titulo">Campos criados</h3>
                {settings.camposPersonalizados.length === 0 && <p className="text-xs text-slate-500">Nenhum campo criado.</p>}
                {(Object.keys(ROTULO_CATEGORIA) as AssetCategory[]).map((cat) => {
                  const doGrupo = settings.camposPersonalizados.filter((cf) => cf.categoria === cat);
                  if (doGrupo.length === 0) return null;
                  return (
                    <div key={cat} className="space-y-2">
                      <h4 className="rotulo">{ROTULO_CATEGORIA[cat]}</h4>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {doGrupo.map((cf) => (
                          <div key={cf.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                            <div>
                              <span className="block font-semibold text-slate-900">{cf.label}</span>
                              <span className="font-mono text-xs text-slate-500 uppercase">
                                {cf.categoria} · {cf.tipo}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomField(cf.id)}
                              title="Remover campo"
                              aria-label={`Remover campo ${cf.label}`}
                              className="btn-icone btn-icone-perigo"
                            >
                              <Trash2 />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === 'catalogo' && <CatalogoSettings />}
          {activeTab === 'prazos' && <PrazosSettings />}

          {/* USUÁRIOS E PERMISSÕES: quem opera o sistema */}
          {activeTab === 'equipe' && (
            <>
              <div className="cartao p-4">
                <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="secao-titulo flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-600" />
                      <span>Usuários e permissões</span>
                    </h3>
                    <p className="ajuda">O perfil define o que cada pessoa vê e faz no sistema</p>
                  </div>
                  <div className="barra-filtros">
                    <div className="relative">
                      <label htmlFor="equipe-busca" className="sr-only">Buscar colaborador</label>
                      <input id="equipe-busca" type="text" value={equipeSearch} onChange={(e) => setEquipeSearch(e.target.value)} placeholder="Buscar colaborador..." className="campo campo-sm w-48 pl-7" />
                      <Search className="absolute top-2.5 left-2.5 h-3 w-3 text-slate-500" />
                    </div>
                    <select
                      value={equipeFilter}
                      onChange={(e) => setEquipeFilter(e.target.value as 'todos' | 'operadores')}
                      aria-label="Filtrar colaboradores"
                      className="campo campo-sm"
                    >
                      <option value="todos">Todos os colaboradores</option>
                      <option value="operadores">Apenas operadores (TI & RH)</option>
                    </select>
                  </div>
                </div>

                {/* Explicação das 4 permissões */}
                <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                  {(
                    [
                      ['bg-blue-600', 'Admin de T.I.', 'Acesso integral: inventário 1:1, fila de chamados, configurações, termos, setores e gestão de operadores.'],
                      ['bg-emerald-600', 'Suporte de T.I.', 'Atendimento da fila de chamados, movimentação de equipamentos, checklists técnicos e termos A4.'],
                      ['bg-amber-500', 'Recursos Humanos (RH)', 'Admissões, desligamentos e os próprios chamados.'],
                      ['bg-slate-400', 'Colaborador (solicitante)', 'Acesso restrito: visualiza apenas seus equipamentos sob custódia e abre chamados com filtro do seu ativo.'],
                    ] as const
                  ).map(([cor, titulo, texto]) => (
                    <div key={titulo} className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-900">
                        <span className={`h-2 w-2 rounded-full ${cor}`} />
                        {titulo}
                      </span>
                      <p className="text-xs leading-tight text-slate-600">{texto}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="cartao overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="tabela tabela-cartoes">
                    <thead>
                      <tr>
                        <th>Colaborador</th>
                        <th>E-mail corporativo</th>
                        <th>Setor / cargo</th>
                        <th>Papel atual</th>
                        <th className="text-right">Alterar nível de acesso</th>
                      </tr>
                    </thead>
                    <tbody>
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
                          const currentEmpRole: UserRole = papelAtual(emp);
                          const papelPendente = papeisPendentes[emp.id];
                          return (
                            <tr key={emp.id} className={papelPendente ? 'bg-amber-50' : ''}>
                              <td data-label="Colaborador">
                                <div className="flex items-center gap-2.5">
                                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-800">
                                    {emp.nome.charAt(0)}
                                  </div>
                                  <div>
                                    <span className="block font-semibold text-slate-900">{emp.nome}</span>
                                    <span className="font-mono text-xs text-slate-500">{emp.matricula}</span>
                                  </div>
                                </div>
                              </td>
                              <td data-label="E-mail corporativo" className="whitespace-nowrap text-slate-600">{emp.email}</td>
                              <td data-label="Setor / cargo" className="whitespace-nowrap">
                                <span className="block text-slate-800">{emp.cargo}</span>
                                <span className="text-xs text-slate-500">{departments.find((d) => d.id === emp.setorId)?.nome || '-'}</span>
                              </td>
                              <td data-label="Papel atual" className="whitespace-nowrap">
                                <span className={`selo ${papeisSelo[currentEmpRole]}`}>{ROTULO_PAPEL[currentEmpRole]}</span>
                              </td>
                              <td data-label="Alterar nível de acesso" className="text-right whitespace-nowrap">
                                <select
                                  value={papelPendente ?? currentEmpRole}
                                  onChange={(e) => alterarPapel(emp, e.target.value as UserRole)}
                                  aria-label={`Papel de ${emp.nome}`}
                                  className="campo campo-sm"
                                >
                                  <option value="ti_admin">Administrador de T.I.</option>
                                  <option value="ti_suporte">Suporte de T.I.</option>
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
            </>
          )}

          {/* CONEXÃO COM O BANCO DE DADOS */}
          {activeTab === 'banco' && (
            <div className="cartao space-y-4 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h3 className="secao-titulo flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-600" />
                  Conexão com o banco de dados
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isRefreshing}
                    onClick={async () => {
                      setIsRefreshing(true);
                      await refreshSupabaseData();
                      setIsRefreshing(false);
                      setSuccessMsg('Verificação com o Supabase concluída.');
                      setTimeout(() => setSuccessMsg(null), 3000);
                    }}
                    className="btn btn-secundario btn-sm"
                    title="Testar conexão e recarregar dados do banco"
                  >
                    <RefreshCw className={isRefreshing ? 'animate-spin' : ''} />
                    <span>{isRefreshing ? 'Verificando...' : 'Atualizar status'}</span>
                  </button>
                  <span className={`selo ${conexaoOk ? 'selo-ok' : isSupabaseConnected ? 'selo-atencao' : 'selo-neutro'}`}>
                    {conexaoOk ? 'Conectado' : isSupabaseConnected ? 'Conectado, mas sem as tabelas' : 'Sem conexão (modo demonstração)'}
                  </span>
                </div>
              </div>

              {/* Fase 0: com Supabase conectado (produção), "Zerar" e "Restaurar demo" nem aparecem */}
              {!isSupabaseConnected && (
                <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/40 p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
                    <div>
                      <h4 className="text-xs font-bold tracking-wide text-red-900 uppercase">Zona de produção: zerar dados de exemplo</h4>
                      <p className="mt-0.5 text-xs text-red-700">
                        Utilize esta opção para iniciar a operação real da sua empresa, limpando ativos fictícios, licenças e chamados de demonstração.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button type="button" onClick={() => setShowResetModal(true)} className="btn btn-perigo">
                      <Trash2 />
                      <span>Zerar dados de exemplo (reset de fábrica)</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirmar('Restaurar a base completa de demonstração fictícia?')) {
                          resetToInitialData();
                          setSuccessMsg('Base de demonstração restaurada no navegador.');
                          setTimeout(() => setSuccessMsg(null), 3000);
                        }
                      }}
                      className="btn btn-secundario"
                    >
                      <RotateCcw />
                      <span>Restaurar base de demonstração</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmação segura para zerar os dados */}
      {showResetModal && !isSupabaseConnected && (
        <Janela
          tamanho="p"
          icone={<AlertTriangle className="h-4 w-4" />}
          titulo="Confirmar limpeza completa da base"
          onFechar={() => {
            if (isResetting) return;
            setShowResetModal(false);
            setResetConfirmText('');
          }}
          rodape={
            <>
              <button
                type="button"
                disabled={isResetting}
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmText('');
                }}
                className="btn btn-secundario"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={resetConfirmText.trim().toUpperCase() !== 'ZERAR' || isResetting}
                onClick={async () => {
                  setIsResetting(true);
                  try {
                    await clearAllDataToProduction();
                    setShowResetModal(false);
                    setResetConfirmText('');
                    setSuccessMsg('Base zerada com sucesso! O sistema está limpo e pronto para produção.');
                    setTimeout(() => setSuccessMsg(null), 4000);
                  } catch (err) {
                    console.error('Erro ao zerar base:', err);
                    setErrorMsg(`Não foi possível limpar o banco: ${mensagemDeErro(err)}.`);
                  } finally {
                    setIsResetting(false);
                  }
                }}
                className="btn btn-perigo-cheio"
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="animate-spin" />
                    <span>Limpando banco...</span>
                  </>
                ) : (
                  <span>Confirmar e limpar base</span>
                )}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Esta ação apagará todos os ativos, licenças e chamados de teste tanto do sistema quanto do Supabase (se conectado), deixando a plataforma zerada e pronta para seus dados reais.
            </p>
            <div>
              <label htmlFor="reset-confirmacao" className="rotulo">
                Digite <span className="font-mono font-bold text-red-600">ZERAR</span> para liberar a limpeza
              </label>
              <input
                id="reset-confirmacao"
                type="text"
                autoFocus
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="Digite ZERAR"
                className="campo text-center font-mono font-bold tracking-wider"
              />
            </div>
          </div>
        </Janela>
      )}

      {/* Fase 5: papéis, setores e dados da empresa só são gravados aqui */}
      <BarraAlteracoes itens={itensPendentes} onCancelar={descartarTudo} onSalvar={salvarTudo} />
    </div>
  );
};
