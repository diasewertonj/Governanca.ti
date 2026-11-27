import { ROTULO_GRUPO_DEPRECIACAO, VIDA_UTIL_PADRAO } from '../../utils/patrimonio.ts';
import { confirmar } from '../ui/dialogo.tsx';
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { AssetCategory, Employee, ModeloDocumento, PadraoEmail, UserRole, VidaUtil } from '../../types/index.ts';
import { dominioDe } from '../../utils/emailEmpresa.ts';
import { logoParaDataUrl } from '../../utils/logoArquivo.ts';
import { BarraAlteracoes } from '../comum/BarraAlteracoes.tsx';
import { CatalogoSettings } from './CatalogoSettings.tsx';
import { PrazosSettings } from './PrazosSettings.tsx';
import { FinanceiroSettings } from './FinanceiroSettings.tsx';
import { IniciarUsoReal } from './IniciarUsoReal.tsx';
import { ContatosSite } from './ContatosSite.tsx';
import { GaleriaVisual } from './GaleriaVisual.tsx';
import { UnidadesLista } from '../fornecedores/UnidadesLista.tsx';
import { Janela } from '../ui/Janela.tsx';
import { NavLateral, type GrupoNav } from '../ui/Abas.tsx';
import { CabecalhoTela } from '../ui/Tela.tsx';
import { DOC_DEVOLUCAO_PADRAO, DOC_ENTREGA_PADRAO } from '../../utils/processos.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { mensagemDeErro } from '../../services/supabaseDb.ts';
import { CampoCep, CampoCnpj, CampoMascara } from '../ui/Campos.tsx';
import { formatarCep } from '../../utils/mascaras.ts';
import type { DadosCep, DadosCnpj } from '../../services/consultas.ts';
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
  ChevronUp,
  Pencil,
} from 'lucide-react';

const ROTULO_PAPEL: Record<UserRole, string> = {
  ti_admin: 'Administrador de T.I.',
  ti_suporte: 'Suporte de T.I.',
  rh: 'Recursos Humanos',
  colaborador: 'Colaborador',
  compras: 'Compras',
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
type Aba = 'empresa' | 'documentos' | 'unidades' | 'setores' | 'equipe' | 'catalogo' | 'prazos' | 'campos' | 'vida_util' | 'financeiro' | 'banco' | 'galeria' | 'contatos';
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
  {
    titulo: 'Inventário',
    itens: [
      { id: 'campos', rotulo: 'Campos dos ativos' },
      { id: 'vida_util', rotulo: 'Vida útil (depreciação)' },
    ],
  },
  // Seção 17: premissas da Gestão de T.I. e mapa de áreas
  { titulo: 'Financeiro', itens: [{ id: 'financeiro', rotulo: 'Premissas e áreas' }] },
  { titulo: 'Sistema', itens: [{ id: 'banco', rotulo: 'Conexão' }, { id: 'contatos', rotulo: 'Contatos do site' }] },
];
// Seção 19: galeria de componentes (só admin)
const GRUPOS_ADMIN: GrupoNav<Aba>[] = GRUPOS.map((g) =>
  g.titulo === 'Sistema' ? { ...g, itens: [...g.itens, { id: 'galeria', rotulo: 'Galeria visual' }] } : g
);

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
    currentRole,
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
  // Seção 29: site, domínios de e-mail e padrão do endereço (sugestão no cadastro de pessoas)
  const [site, setSite] = useState(settings.site || '');
  const [dominiosTexto, setDominiosTexto] = useState((settings.dominiosEmail || []).join(', '));
  const [padraoEmail, setPadraoEmail] = useState<PadraoEmail>(settings.padraoEmail || 'nome.sobrenome');
  const dominiosLista = dominiosTexto.split(/[,;\s]+/).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  const emailEmpresaAlterado =
    site.trim() !== (settings.site || '') || dominiosLista.join(',') !== (settings.dominiosEmail || []).join(',') || padraoEmail !== (settings.padraoEmail || 'nome.sobrenome');
  const dominioSugerido = dominioDe(site) || dominioDe(emailTI);
  const [textoTermoEntrega, setTextoTermoEntrega] = useState(settings.textoTermoEntrega);
  const [textoTermoDevolucao, setTextoTermoDevolucao] = useState(settings.textoTermoDevolucao);
  // Seção 21: o texto legal fica recolhido; o campo grande só aparece ao editar
  const [textoEditando, setTextoEditando] = useState<string[]>([]);
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
  const logoEnviado = logoUrl.startsWith('data:image/');
  const logoInvalido = logoUrl.trim() !== '' && !logoEnviado && !/^https:\/\//i.test(logoUrl.trim());
  const [erroLogo, setErroLogo] = useState('');
  // Seção 29: logo por arquivo — reduzido no navegador e guardado na própria configuração
  // (aparece na tela de login, que é pública, e não sai na virada "Iniciar uso real")
  const enviarLogo = async (arquivo?: File) => {
    if (!arquivo) return;
    setErroLogo('');
    try {
      setLogoUrl(await logoParaDataUrl(arquivo));
    } catch (e) {
      setErroLogo(e instanceof Error ? e.message : String(e));
    }
  };
  // 9.5: o que exige termo de responsabilidade (vazio = tudo marcado)
  const termoExigeSalvo = settings.termoExige || { computador: true, celular: true, monitor: true };
  const [termoExige, setTermoExige] = useState(termoExigeSalvo);
  const termoExigeAlterado = JSON.stringify(termoExige) !== JSON.stringify(termoExigeSalvo);
  // Fase 11: vida útil (anos) por grupo e valor residual (%)
  const vidaUtilSalva: VidaUtil = { ...VIDA_UTIL_PADRAO, residualPct: 0, ...(settings.vidaUtil || {}) };
  const [vidaUtil, setVidaUtil] = useState<VidaUtil>(vidaUtilSalva);
  const vidaUtilAlterada = JSON.stringify(vidaUtil) !== JSON.stringify(vidaUtilSalva);
  const vidaUtilInvalida =
    (Object.keys(VIDA_UTIL_PADRAO) as (keyof typeof VIDA_UTIL_PADRAO)[]).some((k) => !(Number(vidaUtil[k]) >= 1 && Number(vidaUtil[k]) <= 50)) ||
    !(Number(vidaUtil.residualPct ?? 0) >= 0 && Number(vidaUtil.residualPct ?? 0) < 100);

  // 9.3: CNPJ/CEP achados preenchem só os campos vazios
  const cidadeUfDe = (cidade?: string, uf?: string) => [cidade, uf].filter(Boolean).join(' - ');
  const preencherDoCnpj = (d: DadosCnpj) => {
    setRazaoSocial((v) => (v.trim() ? v : d.razaoSocial));
    setNomeFantasia((v) => (v.trim() ? v : d.nomeFantasia || ''));
    setEndereco((v) => (v.trim() ? v : d.endereco || ''));
    setCep((v) => (v.trim() ? v : d.cep ? formatarCep(d.cep) : ''));
    setCidadeUF((v) => (v.trim() ? v : cidadeUfDe(d.cidade, d.uf)));
  };
  const preencherDoCep = (d: DadosCep) => {
    setEndereco((v) => (v.trim() ? v : [d.endereco, d.bairro].filter(Boolean).join(' - ')));
    setCidadeUF((v) => (v.trim() ? v : cidadeUfDe(d.cidade, d.uf)));
  };

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
    ...(emailEmpresaAlterado ? ['Site, domínios e padrão do e-mail'] : []),
    ...(termoExigeAlterado ? ['O que exige termo de responsabilidade'] : []),
    ...(vidaUtilAlterada ? ['Vida útil e valor residual (depreciação)'] : []),
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
    setSite(settings.site || '');
    setDominiosTexto((settings.dominiosEmail || []).join(', '));
    setPadraoEmail(settings.padraoEmail || 'nome.sobrenome');
    setTextoTermoEntrega(settings.textoTermoEntrega);
    setTextoTermoDevolucao(settings.textoTermoDevolucao);
    setDocEntrega(docEntregaSalvo);
    setDocDevolucao(docDevolucaoSalvo);
    setLogoUrl(settings.logoUrl || '');
    setTermoExige(termoExigeSalvo);
    setVidaUtil(vidaUtilSalva);
  };

  const salvarTudo = async () => {
    // Valida antes de gravar qualquer coisa (nada fica salvo pela metade)
    if (logoInvalido) {
      setActiveTab('empresa');
      setErrorMsg('O logo precisa ser um link que começa com https://');
      return;
    }
    if (vidaUtilInvalida) {
      setActiveTab('vida_util');
      setErrorMsg('Vida útil entre 1 e 50 anos em cada grupo; valor residual entre 0% e 99%.');
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
    if (camposEmpresaAlterados.length > 0 || docsAlterados || logoAlterado || termoExigeAlterado || vidaUtilAlterada || emailEmpresaAlterado) {
      updateSettings({
        ...empresaRascunho,
        docEntrega,
        docDevolucao,
        logoUrl: logoUrl.trim() || undefined,
        site: site.trim() || undefined,
        dominiosEmail: dominiosLista,
        padraoEmail,
        ...(termoExigeAlterado ? { termoExige } : {}),
        ...(vidaUtilAlterada ? { vidaUtil } : {}),
      });
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
    if (vinculados === 0 && !(await confirmar(`Excluir o setor "${dep?.nome}"?\n\nO setor sai das listas. Não dá para desfazer: para só tirar das listas, inative em vez de excluir.`))) return;
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
        `Remover o campo personalizado "${campo?.label}"?\n\nO campo sai dos ativos na hora e os valores já preenchidos deixam de aparecer na ficha. Não dá para desfazer.`
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
    compras: 'selo-atencao',
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
        <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
          <CheckCircle2 className="ico text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          <AlertTriangle className="ico text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <NavLateral rotulo="Seções das configurações" grupos={currentRole === 'ti_admin' ? GRUPOS_ADMIN : GRUPOS} ativa={activeTab} onMudar={setActiveTab} />

        <div className="min-w-0 space-y-4">
          {/* DADOS DA EMPRESA E DOCUMENTOS E TERMOS */}
          {(activeTab === 'empresa' || activeTab === 'documentos') && (
            <form onSubmit={handleSaveCompanySettings} className="space-y-4">
              {activeTab === 'empresa' && (
                <>
                  <div className="cartao p-4">
                    {secao('Identificação jurídica', 'Aparece no cabeçalho dos termos e nas etiquetas')}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
                      <div className="md:col-span-2 xl:col-span-2">
                        <label htmlFor="emp-razao" className="rotulo">Razão social</label>
                        <input id="emp-razao" type="text" required value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} className="campo" />
                      </div>
                      <div className="xl:col-span-2">
                        <label htmlFor="emp-fantasia" className="rotulo">Nome fantasia</label>
                        <input id="emp-fantasia" type="text" required value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} className="campo" />
                      </div>
                      <div className="md:col-span-2 xl:col-span-2">
                        <label htmlFor="emp-cnpj" className="rotulo">CNPJ</label>
                        <CampoCnpj id="emp-cnpj" required value={cnpj} onChange={setCnpj} onAchado={preencherDoCnpj} />
                        <p className="ajuda">"Buscar" preenche razão social, nome fantasia, endereço, CEP e cidade/UF que estiverem vazios.</p>
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
                      <div className="md:col-span-2 xl:col-span-1">
                        <label htmlFor="emp-cep" className="rotulo">CEP</label>
                        <CampoCep id="emp-cep" required value={cep} onChange={setCep} onAchado={preencherDoCep} />
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
                        <CampoMascara id="emp-telefone" tipo="telefone" required value={telefoneTI} onChange={setTelefoneTI} />
                      </div>
                    </div>
                    {/* Seção 29: site, domínios e padrão do e-mail — sugerem o e-mail no cadastro de pessoas */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
                      <div>
                        <label htmlFor="emp-site" className="rotulo">Site</label>
                        <input id="emp-site" value={site} onChange={(e) => setSite(e.target.value)} placeholder="www.suaempresa.com.br" className="campo" />
                      </div>
                      <div className="md:col-span-2">
                        <label htmlFor="emp-dominios" className="rotulo">Domínios de e-mail</label>
                        <input
                          id="emp-dominios"
                          value={dominiosTexto}
                          onChange={(e) => setDominiosTexto(e.target.value)}
                          placeholder="suaempresa.com.br, suaempresa.com"
                          className="campo"
                          disabled={padraoEmail === 'nenhum'}
                        />
                        {padraoEmail !== 'nenhum' && !dominiosLista.length && dominioSugerido && (
                          <button type="button" onClick={() => setDominiosTexto(dominioSugerido)} className="link mt-1 text-sm">
                            Usar {dominioSugerido}
                          </button>
                        )}
                        <p className="ajuda">Separe por vírgula. O primeiro é o usado na sugestão de e-mail.</p>
                      </div>
                      <div>
                        <label htmlFor="emp-padrao-email" className="rotulo">A empresa usa e-mail próprio?</label>
                        <select id="emp-padrao-email" value={padraoEmail} onChange={(e) => setPadraoEmail(e.target.value as PadraoEmail)} className="campo">
                          <option value="nome.sobrenome">Sim: nome.sobrenome</option>
                          <option value="nome.inicial">Sim: nome + inicial do sobrenome</option>
                          <option value="nome">Sim: só o primeiro nome</option>
                          <option value="nenhum">Não (e-mails pessoais): não sugerir</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Fase 7: logo — aparece no cabeçalho do sistema. Seção 29: arquivo ou link https */}
                  <div className="cartao p-4">
                    {secao('Logo', 'Aparece no cabeçalho do sistema e na tela de entrada')}
                    <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3 xl:grid-cols-4">
                      <div className="md:col-span-2 xl:col-span-2 space-y-2">
                        <div>
                          <label htmlFor="emp-logo-arquivo" className="rotulo">Enviar arquivo (PNG, JPG, WEBP ou SVG)</label>
                          <input
                            id="emp-logo-arquivo"
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            onChange={(e) => {
                              void enviarLogo(e.target.files?.[0]);
                              e.target.value = '';
                            }}
                            className="campo"
                          />
                          {erroLogo && <p className="erro">{erroLogo}</p>}
                        </div>
                        {logoEnviado ? (
                          <p className="ajuda">
                            Logo enviado por arquivo.{' '}
                            <button type="button" onClick={() => setLogoUrl('')} className="link">
                              Remover
                            </button>
                          </p>
                        ) : (
                          <div>
                            <label htmlFor="emp-logo" className="rotulo">ou um link https</label>
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
                        )}
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
                  <p className="texto-aux">
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
                          {textoEditando.includes(nome) ? (
                            <>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <label htmlFor={`doc-${nome}-texto`} className="rotulo">{rotuloTexto}</label>
                                <button
                                  type="button"
                                  onClick={() => setTextoEditando(textoEditando.filter((x) => x !== nome))}
                                  aria-controls={`doc-${nome}-texto`}
                                  aria-expanded="true"
                                  className="btn btn-sm btn-discreto"
                                >
                                  <ChevronUp /> Recolher
                                </button>
                              </div>
                              <textarea id={`doc-${nome}-texto`} rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} className="campo leading-relaxed" />
                            </>
                          ) : (
                            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
                              <div className="min-w-0 flex-1">
                                <p className="rotulo">{rotuloTexto}</p>
                                <p className="texto-aux line-clamp-2 whitespace-pre-line">{texto.trim() || 'Sem texto: o termo sai só com os dados do documento.'}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setTextoEditando([...textoEditando, nome])}
                                aria-expanded="false"
                                className="btn btn-sm btn-secundario"
                              >
                                <Pencil /> Editar texto
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* 9.5: quais itens geram "Termo desatualizado" ao entregar ou devolver */}
                  <div className="cartao p-4">
                    {secao(
                      'O que exige termo de responsabilidade',
                      "Ao entregar ou devolver um desses itens fora de uma admissão/desligamento, a ficha da pessoa e o Precisa de atenção mostram 'Termo desatualizado'. Acessórios (mouse, cabo) não geram pendência."
                    )}
                    <div role="group" aria-label="Itens que exigem termo de responsabilidade" className="flex flex-wrap gap-x-6 gap-y-2">
                      {(
                        [
                          ['computador', 'Computadores'],
                          ['celular', 'Celulares'],
                          ['monitor', 'Monitores'],
                        ] as const
                      ).map(([chave, rotulo]) => (
                        <label key={chave} className="inline-flex items-center gap-2 font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={termoExige[chave]}
                            onChange={(e) => setTermoExige({ ...termoExige, [chave]: e.target.checked })}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          {rotulo}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </form>
          )}

          {/* Fase 11: VIDA ÚTIL (depreciação linear) */}
          {activeTab === 'vida_util' && (
            <div className="cartao p-4">
              {secao('Vida útil e valor residual', 'Depreciação linear, mês a mês, desde a data de compra. Vale para a ficha do equipamento, o Valor do patrimônio, o relatório e a baixa. Salve pela barra de alterações.')}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(Object.keys(VIDA_UTIL_PADRAO) as (keyof typeof VIDA_UTIL_PADRAO)[]).map((g) => (
                  <div key={g}>
                    <label htmlFor={`vida-${g}`} className="rotulo">{ROTULO_GRUPO_DEPRECIACAO[g]} (anos)</label>
                    <input id={`vida-${g}`} type="number" min={1} max={50} step={1} value={vidaUtil[g] ?? ''} onChange={(e) => setVidaUtil({ ...vidaUtil, [g]: e.target.value === '' ? undefined : Number(e.target.value) })} className="campo" />
                    <p className="ajuda">Padrão: {VIDA_UTIL_PADRAO[g]} anos</p>
                  </div>
                ))}
                <div>
                  <label htmlFor="vida-residual" className="rotulo">Valor residual (% da compra)</label>
                  <input id="vida-residual" type="number" min={0} max={99} step={1} value={vidaUtil.residualPct ?? 0} onChange={(e) => setVidaUtil({ ...vidaUtil, residualPct: Number(e.target.value) || 0 })} className="campo" />
                  <p className="ajuda">0% = deprecia até zerar.</p>
                </div>
              </div>
              {vidaUtilInvalida && <p className="erro">Use de 1 a 50 anos e residual de 0% a 99%.</p>}
            </div>
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

              <div className="cartao-tabela">
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
                        <th className="col-acoes">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departments.map((dep) => {
                        const linkedCount = employees.filter((e) => e.setorId === dep.id).length;
                        const ativoExibido = setoresPendentes[dep.id] ?? dep.ativo;
                        return (
                          <tr key={dep.id}>
                            <td data-label="Código" className="font-mono font-semibold text-slate-900">{dep.codigo}</td>
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
                            <td data-label="Ações" className="col-acoes">
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
                {settings.camposPersonalizados.length === 0 && <p className="texto-aux">Nenhum campo criado.</p>}
                {(Object.keys(ROTULO_CATEGORIA) as AssetCategory[]).map((cat) => {
                  const doGrupo = settings.camposPersonalizados.filter((cf) => cf.categoria === cat);
                  if (doGrupo.length === 0) return null;
                  return (
                    <div key={cat} className="space-y-2">
                      <h4 className="rotulo">{ROTULO_CATEGORIA[cat]}</h4>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {doGrupo.map((cf) => (
                          <div key={cf.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div>
                              <span className="block font-semibold text-slate-900">{cf.label}</span>
                              <span className="font-mono texto-aux uppercase">
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
          {activeTab === 'financeiro' && <FinanceiroSettings />}
          {activeTab === 'galeria' && currentRole === 'ti_admin' && <GaleriaVisual />}

          {/* USUÁRIOS E PERMISSÕES: quem opera o sistema */}
          {activeTab === 'equipe' && (
            <>
              <div className="cartao p-4">
                <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="secao-titulo flex items-center gap-2">
                      <Shield className="ico text-blue-600" />
                      <span>Usuários e permissões</span>
                    </h3>
                    <p className="ajuda">O perfil define o que cada pessoa vê e faz no sistema</p>
                  </div>
                  <div className="barra-filtros">
                    <div className="relative">
                      <label htmlFor="equipe-busca" className="sr-only">Buscar colaborador</label>
                      <input id="equipe-busca" type="text" value={equipeSearch} onChange={(e) => setEquipeSearch(e.target.value)} placeholder="Buscar colaborador..." className="campo campo-sm w-48 pl-6" />
                      <Search className="ico-sm absolute top-2.5 left-2.5 text-slate-500" />
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {(
                    [
                      ['bg-blue-600', 'Admin de T.I.', 'Acesso integral: inventário 1:1, fila de chamados, configurações, termos, setores e gestão de operadores.'],
                      ['bg-emerald-600', 'Suporte de T.I.', 'Atendimento da fila de chamados, movimentação de equipamentos, checklists técnicos e termos A4.'],
                      ['bg-amber-500', 'Recursos Humanos (RH)', 'Admissões, desligamentos e os próprios chamados.'],
                      ['bg-slate-400', 'Colaborador (solicitante)', 'Acesso restrito: visualiza apenas seus equipamentos sob custódia e abre chamados com filtro do seu ativo.'],
                    ] as const
                  ).map(([cor, titulo, texto]) => (
                    <div key={titulo} className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <span className="flex items-center gap-2 font-semibold text-slate-900">
                        <span className={`h-2 w-2 rounded-full ${cor}`} />
                        {titulo}
                      </span>
                      <p className="texto-aux leading-tight">{texto}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="cartao-tabela">
                <div className="overflow-x-auto">
                  <table className="tabela tabela-cartoes">
                    <thead>
                      <tr>
                        <th>Colaborador</th>
                        <th>E-mail corporativo</th>
                        <th>Setor / cargo</th>
                        <th>Papel atual</th>
                        <th className="num">Alterar nível de acesso</th>
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
                                <div className="flex items-center gap-3">
                                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-800">
                                    {emp.nome.charAt(0)}
                                  </div>
                                  <div>
                                    <span className="block font-semibold text-slate-900">{emp.nome}</span>
                                    <span className="font-mono texto-aux">{emp.matricula}</span>
                                  </div>
                                </div>
                              </td>
                              <td data-label="E-mail corporativo" className="whitespace-nowrap text-slate-600">{emp.email}</td>
                              <td data-label="Setor / cargo" className="whitespace-nowrap">
                                <span className="block text-slate-800">{emp.cargo}</span>
                                <span className="texto-aux">{departments.find((d) => d.id === emp.setorId)?.nome || '-'}</span>
                              </td>
                              <td data-label="Papel atual" className="whitespace-nowrap">
                                <span className={`selo ${papeisSelo[currentEmpRole]}`}>{ROTULO_PAPEL[currentEmpRole]}</span>
                              </td>
                              <td data-label="Alterar nível de acesso" className="num whitespace-nowrap">
                                <select
                                  value={papelPendente ?? currentEmpRole}
                                  onChange={(e) => alterarPapel(emp, e.target.value as UserRole)}
                                  aria-label={`Papel de ${emp.nome}`}
                                  className="campo campo-sm"
                                >
                                  <option value="ti_admin">Administrador de T.I.</option>
                                  <option value="ti_suporte">Suporte de T.I.</option>
                                  <option value="rh">Recursos Humanos (RH)</option>
                                  <option value="compras">Compras (aprova e compra pedidos)</option>
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

          {/* Seção 30: pedidos do formulário da landing page */}
          {activeTab === 'contatos' && <ContatosSite />}

          {/* CONEXÃO COM O BANCO DE DADOS */}
          {activeTab === 'banco' && (
            <div className="cartao space-y-4 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h3 className="secao-titulo flex items-center gap-2">
                  <Database className="ico text-emerald-600" />
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

              {/* Seção 28: em produção, a virada segura para uso real (prévia + nome da empresa) */}
              {isSupabaseConnected && conexaoOk && <IniciarUsoReal />}

              {/* Fase 0: com Supabase conectado (produção), "Zerar" e "Restaurar demo" nem aparecem */}
              {!isSupabaseConnected && (
                <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/40 p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="ico-lg text-red-600" />
                    <div>
                      <h4 className="secao-titulo text-red-900">Zona de produção: zerar dados de exemplo</h4>
                      <p className="mt-0.5 text-red-700">
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
                        if (await confirmar('Restaurar a base completa de demonstração fictícia?\n\nOs dados deste navegador são trocados pelos de exemplo. Não dá para desfazer.')) {
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
          icone={<AlertTriangle className="ico" />}
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
            <p className="texto-aux">
              Esta ação apagará todos os ativos, licenças e chamados de teste tanto do sistema quanto do Supabase (se conectado), deixando a plataforma zerada e pronta para seus dados reais.
            </p>
            <div>
              <label htmlFor="reset-confirmacao" className="rotulo">
                Digite <span className="font-mono font-semibold text-red-600">ZERAR</span> para liberar a limpeza
              </label>
              <input
                id="reset-confirmacao"
                type="text"
                autoFocus
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="Digite ZERAR"
                className="campo text-center font-mono font-semibold tracking-wider"
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
