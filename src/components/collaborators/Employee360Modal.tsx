import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { formatDate } from '../../utils/formatters.ts';
import { chamadosDaPessoa, papelNoChamado, podeAbrirFicha } from '../../utils/vinculos.ts';
import { ChamadosVinculados } from '../servicedesk/ChamadosVinculados.tsx';
import { NewEmployeeModal } from './NewEmployeeModal.tsx';
import { ConferenciaTermo } from '../terms/ConferenciaTermo.tsx';
import type { EmployeeStatus, ItemTermo, Ticket } from '../../types/index.ts';
import { DOC_DEVOLUCAO_PADRAO, DOC_ENTREGA_PADRAO } from '../../utils/processos.ts';
import { situacaoTermo, type TomSituacao } from '../../utils/termos.ts';
import { pendenciaTermo, resumoPendenciaTermo, termoVigente } from '../../utils/inventario.ts';
import { historicoAssentos } from '../../utils/licencas.ts';
import { FileText, FilePlus, Pencil, KeyRound, CheckCircle2, AlertCircle, Copy, ShieldOff, FileSpreadsheet, Printer } from 'lucide-react';
import { custoPorPessoa } from '../../utils/analises.ts';
import { brl } from '../../utils/financeiro.ts';
import { ROTULO_PAPEL } from '../../utils/conversa.ts';
import { baixarExcelColaborador, imprimirRelatorioColaborador, type DadosRelatorioColaborador } from './relatorioColaborador.ts';
import { avisar, confirmar } from '../ui/dialogo.tsx';
import { Janela, DadoLinha } from '../ui/Janela.tsx';
import { CartaoItem, iconeDoAcessorio, iconeDoAtivo } from '../comum/ItemPatrimonio.tsx';
import { Abas, type ItemAba } from '../ui/Abas.tsx';
import { Vazio } from '../ui/Tela.tsx';

interface Employee360ModalProps {
  employeeId: string;
  onClose: () => void;
}

// Seção 24: 3 abas (eram 5): a visão geral mostra quase tudo; o detalhe e os termos ficam juntos
type AbaPessoa = 'visao' | 'inventario' | 'chamados';

/** Tempo de casa a partir da admissão (ex.: "2 anos e 3 meses") */
function tempoDeCasa(admissao?: string, agora = new Date()): string | null {
  if (!admissao) return null;
  const d = new Date(`${admissao.slice(0, 10)}T00:00:00`);
  let meses = (agora.getFullYear() - d.getFullYear()) * 12 + (agora.getMonth() - d.getMonth()) - (agora.getDate() < d.getDate() ? 1 : 0);
  if (meses < 0) return null;
  const anos = Math.floor(meses / 12);
  meses %= 12;
  const a = anos ? `${anos} ano${anos > 1 ? 's' : ''}` : '';
  const m = meses ? `${meses} ${meses > 1 ? 'meses' : 'mês'}` : '';
  return [a, m].filter(Boolean).join(' e ') || 'menos de 1 mês';
}

const SITUACAO: Record<EmployeeStatus, { rotulo: string; selo: string }> = {
  ativo: { rotulo: 'Ativo', selo: 'selo-ok' },
  ferias: { rotulo: 'Férias', selo: 'selo-atencao' },
  desligado: { rotulo: 'Desligado', selo: 'selo-neutro' },
};

/** Situação do termo no selo padrão */
const SELO_TOM: Record<TomSituacao, string> = {
  ok: 'selo-ok',
  pendente: 'selo-atencao',
  neutro: 'selo-neutro',
  cancelado: 'selo-problema line-through',
};

/** Texto do botão some no celular (fica só o ícone, com o nome no title/aria-label) */
const Rotulo: React.FC<{ texto: string }> = ({ texto }) => <span className="hidden sm:inline">{texto}</span>;

/** Processos guiados (admissão/desligamento) aparecem marcados na lista de chamados */
const ROTULO_PROCESSO: Partial<Record<Ticket['tipo'], string>> = {
  onboarding: 'Admissão',
  offboarding: 'Desligamento',
};

export const Employee360Modal: React.FC<Employee360ModalProps> = ({ employeeId, onClose }) => {
  const {
    employees,
    departments,
    assets,
    licenses,
    terms,
    tickets,
    setSelectedAssetIdFor360,
    setSelectedEmployeeIdFor360,
    setSelectedSoftwareIdFor360,
    setSelectedTermForPrint,
    setSelectedTicketIdForDetail,
    createTerm,
    cancelarTermo,
    currentUser,
    currentRole,
    anonimizarColaborador,
    acessoNexus,
    settings,
    atribuicoesLicenca,
    fornecedores,
    contratos,
  } = useApp();
  const { linhas, atribuicoesLinha, movimentos, estoque } = useRecursos();

  const [aba, setAba] = useState<AbaPessoa>('visao');
  const [termSuccess, setTermSuccess] = useState<string | null>(null);
  const [conferencia, setConferencia] = useState<ItemTermo[] | null>(null);
  const [conferenciaDev, setConferenciaDev] = useState<ItemTermo[] | null>(null);
  const [gerandoTermo, setGerandoTermo] = useState(false);
  const [anonimizando, setAnonimizando] = useState(false);
  // Fase 7: senha provisória fora do onboarding (esqueceu a senha; não depende de e-mail)
  const [gerandoSenha, setGerandoSenha] = useState(false);
  const [editandoDados, setEditandoDados] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; senha: string } | null>(null);
  const [erroSenha, setErroSenha] = useState<string | null>(null);

  const handleSenhaProvisoria = async () => {
    const nome = employee?.nome || 'este colaborador';
    if (!(await confirmar(`Gerar uma senha provisória para ${nome}?\n\nSe a pessoa já tem login, a senha atual deixa de valer.`))) return;
    setGerandoSenha(true);
    setSenhaGerada(null);
    setErroSenha(null);
    let r = await acessoNexus(employeeId, 'redefinir');
    // Ainda sem login: cria o acesso com o e-mail do cadastro
    if ('erro' in r && /ainda não tem acesso/i.test(r.erro)) r = await acessoNexus(employeeId, 'criar');
    setGerandoSenha(false);
    if ('erro' in r) setErroSenha(r.erro);
    else setSenhaGerada(r);
  };

  // Fase 3 · LGPD: só ti_admin, só desligados; preserva a trilha sem identificar a pessoa
  const handleAnonimizar = async () => {
    if (!employee) return;
    const ok = await confirmar(
      `Anonimizar os dados pessoais de ${employee.nome}?\n\n` +
        'Nome, e-mail, matrícula e telefone serão substituídos em todo o sistema (cadastro, histórico, chamados e termos). ' +
        'O histórico de equipamentos e chamados continua existindo, sem identificar a pessoa.\n\nNão é possível desfazer.'
    );
    if (!ok) return;
    setAnonimizando(true);
    const feito = await anonimizarColaborador(employee.id);
    setAnonimizando(false);
    if (feito) setTermSuccess('Dados pessoais anonimizados. O histórico foi preservado sem identificação.');
  };

  const employee = employees.find((e) => e.id === employeeId);

  // AUDITORIA RBAC: Colaborador comum só pode visualizar a sua própria ficha cadastral
  const isUnauthorized = currentRole === 'colaborador' && employeeId !== currentUser?.id;

  if (!employee) return null;

  if (isUnauthorized) {
    return (
      <Janela
        tamanho="p"
        icone={<AlertCircle className="ico" />}
        titulo="Acesso restrito ao perfil"
        onFechar={onClose}
        idTitulo="ficha-pessoa-restrita"
        rodape={
          <button type="button" onClick={onClose} className="btn btn-primario ml-auto">
            Fechar
          </button>
        }
      >
        <p className="texto-aux">
          Por políticas de governança e privacidade de dados da empresa, colaboradores comuns têm acesso apenas à sua própria ficha e
          inventário pessoal.
        </p>
      </Janela>
    );
  }

  const isTIFicha = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const anonimizado = employee.email.endsWith('@anonimizado.invalid');
  const department = departments.find((d) => d.id === employee.setorId);
  const manager = employees.find((e) => e.id === employee.gestorId);
  const situacao = SITUACAO[employee.status] || SITUACAO.desligado;

  // Ativos atualmente em posse do colaborador
  const currentAssets = assets.filter((a) => a.custodianteId === employee.id);

  // Histórico de ativos já devolvidos pelo colaborador
  const returnedHistory = assets.flatMap((asset) =>
    asset.historicoCustodia
      .filter((entry) => entry.colaboradorId === employee.id && entry.dataDevolucao)
      .map((entry) => ({ asset, entry }))
  );

  // Licenças de software alocadas
  const assignedLicenses = licenses.filter((lic) => lic.colaboradoresIds.includes(employee.id));
  // Seção 6: linhas e acessórios da pessoa (só a T.I.)
  const minhasLinhas = linhas.filter((l) => l.colaboradorId === employee.id && l.status !== 'cancelada');
  const historicoLinhas = atribuicoesLinha.filter((a) => a.colaboradorId === employee.id && a.fim);
  const acessoriosRecebidos = movimentos.filter(
    (m) => m.colaboradorId === employee.id && (m.tipo === 'saida' || m.tipo === 'devolucao')
  );
  // Seção 19: o que está com a pessoa agora, por item (recebeu − devolveu)
  const acessoriosComPessoa = Object.values(
    acessoriosRecebidos.reduce<Record<string, { itemId: string; qtd: number; ultimo: string }>>((acc, m) => {
      const a = (acc[m.itemId] ??= { itemId: m.itemId, qtd: 0, ultimo: '' });
      a.qtd += m.tipo === 'saida' ? m.quantidade : -m.quantidade;
      if (m.tipo === 'saida' && m.criadoEm > a.ultimo) a.ultimo = m.criadoEm;
      return acc;
    }, {})
  ).filter((a) => a.qtd > 0);

  // Termos gerados para o colaborador
  const employeeTerms = terms.filter((t) => t.colaboradorId === employee.id);
  const chamados = chamadosDaPessoa(tickets, employee.id);

  // Lote 1 (L4): licenças que a pessoa já teve (histórico de assentos)
  const historicoLicencas = historicoAssentos(atribuicoesLicenca, { colaboradorId: employee.id }).filter((a) => a.fim);
  const nomeLicenca = (id: string) => licenses.find((l) => l.id === id)?.nome || 'Licença removida';

  const handleOpenAsset = (assetId: string) => {
    // Fase 9: abre por cima; fechar o equipamento volta para esta ficha
    setSelectedAssetIdFor360(assetId);
  };

  // Seção 9.5: termo desatualizado (item ligado ou devolvido fora de um processo)
  const vigente = termoVigente(employee.id, terms);
  const pendencia = isTIFicha ? pendenciaTermo(employee, { ativos: assets, termos: terms, chamados: tickets, cfg: settings.termoExige }) : null;
  const abrirReciboDevolucao = () => {
    if (!pendencia?.devolvidos.length) return;
    setAba('inventario');
    setConferencia(null);
    setConferenciaDev(
      pendencia.devolvidos.map((d) => {
        const a = assets.find((x) => x.id === d.ativoId);
        return {
          descricao: a?.nome || d.descricao,
          patrimonio: a ? [a.tag, a.serialNumber].filter(Boolean).join(' / ') : undefined,
          marcaModelo: a ? [a.marca, a.modelo].filter(Boolean).join(' ') || undefined : undefined,
          situacao: 'devolvido',
          ativoId: d.ativoId,
        };
      })
    );
  };
  // Processos da pessoa com anotações fixas (seção 9.2)
  const anotacoesProcessos = tickets.filter(
    (t) => (t.tipo === 'onboarding' || t.tipo === 'offboarding') && (t.colaboradorId || t.offboarding?.colaboradorId) === employee.id && t.anotacoesProcesso
  );

  // Lote 1 (1.12): antes de gerar, a T.I. confere item a item (nada vem marcado "Bom")
  const abrirConferencia = () => {
    if (currentAssets.length === 0) {
      void avisar('O colaborador não possui equipamentos vinculados para gerar o termo.');
      return;
    }
    setAba('inventario');
    setConferenciaDev(null);
    setConferencia(
      currentAssets.map((a) => ({
        descricao: a.nome,
        patrimonio: [a.tag, a.serialNumber].filter(Boolean).join(' / '),
        marcaModelo: [a.marca, a.modelo].filter(Boolean).join(' ') || undefined,
        situacao: 'entregue',
        ativoId: a.id,
      }))
    );
  };

  /**
   * Seção 9.5: gera o termo (entrega com o que está com a pessoa hoje, ou recibo de
   * devolução dos itens que saíram). O termo vigente é substituído e fica no histórico.
   */
  const handleGenerateTerm = async (itens: ItemTermo[], motivoSubstituicao = '', tipo: 'entrega' | 'devolucao' = 'entrega'): Promise<string | null> => {
    const doc = tipo === 'entrega' ? settings.docEntrega || DOC_ENTREGA_PADRAO : settings.docDevolucao || DOC_DEVOLUCAO_PADRAO;
    setGerandoTermo(true);
    const newTerm = await createTerm({
      tipo,
      colaboradorId: employee.id,
      colaboradorNome: employee.nome,
      colaboradorMatricula: employee.matricula,
      colaboradorCargo: employee.cargo,
      colaboradorSetorNome: department?.nome || 'Setor',
      ativoIds: itens.map((l) => l.ativoId).filter((x): x is string => Boolean(x)),
      statusAssinatura: 'gerado',
      responsavelTIId: currentUser?.id || 'emp-1',
      responsavelTINome: currentUser?.nome || 'Responsável T.I.',
      itens,
      localUnidade: settings.cidadeUF,
      docCodigo: doc.codigo,
      docVersao: doc.versao,
      docReferencia: doc.referencia,
      docTitulo: doc.titulo,
      textoClausula: tipo === 'entrega' ? settings.textoTermoEntrega : settings.textoTermoDevolucao,
      formaAssinatura: 'pendente',
    });
    if (!newTerm) {
      setGerandoTermo(false);
      return 'O termo não foi gerado. Os itens conferidos continuam aqui; tente de novo.';
    }
    // Entrega nova substitui a vigente; recibo que devolve tudo encerra a vigente
    const devolveuTudo = tipo === 'devolucao' && currentAssets.length === 0;
    if (vigente && (tipo === 'entrega' || devolveuTudo)) {
      const falha = await cancelarTermo(
        vigente.id,
        tipo === 'entrega' ? motivoSubstituicao || 'Termo atualizado: itens entregues ou devolvidos' : `Itens devolvidos (recibo ${newTerm.codigo})`,
        newTerm.id
      );
      if (falha) setTermSuccess(`Termo ${newTerm.codigo} gerado, mas o anterior (${vigente.codigo}) não foi substituído: ${falha}. Cancele-o na tela do termo.`);
    }
    setGerandoTermo(false);
    setConferencia(null);
    setConferenciaDev(null);
    setTermSuccess(`${tipo === 'entrega' ? 'Termo' : 'Recibo'} ${newTerm.codigo} gerado com sucesso!`);
    setTimeout(() => setTermSuccess(null), 3000);
    setSelectedTermForPrint(newTerm);
    return null;
  };

  const podeEditar = (currentRole === 'ti_admin' || currentRole === 'ti_suporte' || currentRole === 'rh') && !anonimizado;
  const podeGerarTermo = isTIFicha && employee.status !== 'desligado';
  const podeAnonimizar = currentRole === 'ti_admin' && employee.status === 'desligado' && !anonimizado;
  const podeAbrirGestor =
    manager && podeAbrirFicha(currentRole, 'colaborador', { meuId: currentUser?.id, colaboradorId: manager.id });
  const podeAbrirSoftware = podeAbrirFicha(currentRole, 'software');

  // Seção 24: estrutura (departamento, responsável, gestor e equipe), custo e relatório
  const responsavelDep = department?.responsavelId ? employees.find((e) => e.id === department.responsavelId) : undefined;
  const equipe = employees.filter((e) => e.gestorId === employee.id && e.status !== 'desligado').sort((a, b) => a.nome.localeCompare(b.nome));
  const podeAbrirPessoa = (id: string) => podeAbrirFicha(currentRole, 'colaborador', { meuId: currentUser?.id, colaboradorId: id });
  const nomePessoa = (id: string, nome: string) =>
    podeAbrirPessoa(id) ? (
      <button key={id} type="button" onClick={() => setSelectedEmployeeIdFor360(id)} className="link text-left">
        {nome}
      </button>
    ) : (
      <span key={id}>{nome}</span>
    );
  const casa = tempoDeCasa(employee.dataAdmissao);
  // Custo da pessoa: só o admin (mesmo cálculo de Análises › Custo por pessoa; equipamento pelo valor de compra)
  const verCusto = currentRole === 'ti_admin';
  const custo = verCusto ? custoPorPessoa([employee], { ativos: assets, licencas: licenses, linhas, contratos })[0] : undefined;
  const mensalDaLicenca = new Map((custo?.licencas || []).map((l) => [l.licenca.id, l.mensal]));
  const podeRelatorio = (isTIFicha || currentRole === 'rh') && !anonimizado;
  const montarRelatorio = (): DadosRelatorioColaborador => {
    const ativosHoje = currentAssets.filter((a) => a.status !== 'descartado');
    return {
      empresa: settings.nomeFantasia || settings.razaoSocial,
      nome: employee.nome,
      subtitulo: [employee.cargo, department?.nome, situacao.rotulo].filter(Boolean).join(' · '),
      dados: [
        ['Matrícula', employee.matricula || '—'],
        ['E-mail', employee.email],
        ['Telefone / ramal', employee.telefone || '—'],
        ['Admissão', employee.dataAdmissao ? `${formatDate(employee.dataAdmissao)}${casa ? ` (${casa})` : ''}` : '—'],
        ['Departamento', department ? `${department.nome}${responsavelDep ? ` · responsável ${responsavelDep.nome}` : ''}` : '—'],
        ['Gestor imediato', manager?.nome || 'Diretoria / sem gestor'],
        ['Equipe que lidera', equipe.length ? equipe.map((e) => e.nome).join(', ') : '—'],
        ['Perfil de acesso', employee.role ? ROTULO_PAPEL[employee.role] : '—'],
        ...(custo
          ? ([
              ['Equipamentos (valor de compra)', brl(custo.valorEquipamentos)],
              ['Licenças e linha por mês', `${brl(custo.mensalTotal)} (${brl(custo.mensalTotal * 12)} por ano)`],
            ] as [string, string][])
          : []),
      ],
      secoes: [
        {
          titulo: 'Equipamentos com a pessoa',
          rotuloData: 'Desde',
          rotuloValor: 'Valor de compra',
          vazio: 'Nenhum equipamento com a pessoa.',
          linhas: ativosHoje.map((a) => ({
            item: `${a.tag} · ${a.nome}`,
            detalhe: [[a.marca, a.modelo].filter(Boolean).join(' '), a.serialNumber && `S/N ${a.serialNumber}`].filter(Boolean).join(' · '),
            data: a.dataEntregaAtual,
            valor: verCusto ? a.fiscal?.valorCompra || 0 : undefined,
          })),
        },
        ...(isTIFicha
          ? [
              {
                titulo: 'Acessórios com a pessoa',
                rotuloData: 'Recebeu em',
                vazio: 'Nenhum acessório com a pessoa.',
                linhas: acessoriosComPessoa.map((a) => {
                  const item = estoque.find((i) => i.id === a.itemId);
                  return { item: item?.nome || 'Acessório', detalhe: `${a.qtd} un.`, data: a.ultimo ? a.ultimo.slice(0, 10) : undefined };
                }),
              },
            ]
          : []),
        {
          titulo: 'Licenças de software',
          rotuloValor: 'Por mês',
          vazio: 'Nenhuma licença.',
          linhas: assignedLicenses.map((l) => ({
            item: l.nome,
            detalhe: fornecedores.find((f) => f.id === l.fornecedorId)?.nome || l.fornecedor || undefined,
            valor: verCusto ? Math.round((mensalDaLicenca.get(l.id) || 0) * 100) / 100 : undefined,
          })),
        },
        ...(isTIFicha
          ? [
              {
                titulo: 'Linhas telefônicas',
                rotuloValor: 'Por mês',
                vazio: 'Nenhuma linha.',
                linhas: minhasLinhas.map((l) => ({ item: l.numero, detalhe: l.plano || undefined, valor: verCusto ? l.valorMensal || 0 : undefined })),
              },
            ]
          : []),
        {
          titulo: 'Termos',
          rotuloData: 'Emissão',
          vazio: 'Nenhum termo emitido.',
          linhas: employeeTerms.map((t) => ({
            item: `${t.codigo} · ${t.tipo === 'entrega' ? 'entrega' : 'devolução'}`,
            detalhe: situacaoTermo(t, false, terms.find((x) => x.id === t.substituidoPor)?.codigo).rotulo,
            data: t.dataEmissao?.slice(0, 10),
          })),
        },
        {
          titulo: 'Equipamentos já devolvidos',
          rotuloData: 'Devolvido em',
          vazio: 'Nenhuma devolução.',
          linhas: returnedHistory.map(({ asset, entry }) => ({
            item: `${asset.tag} · ${asset.nome}`,
            detalhe: [`desde ${formatDate(entry.dataEntrega)}`, entry.motivoDevolucao].filter(Boolean).join(' · '),
            data: entry.dataDevolucao?.slice(0, 10),
          })),
        },
        {
          titulo: 'Chamados e processos em aberto',
          rotuloData: 'Aberto em',
          vazio: 'Nenhum em aberto.',
          linhas: chamados
            .filter((t) => t.status !== 'resolvido' && t.status !== 'cancelado')
            .map((t) => ({ item: `${t.codigo} · ${t.titulo}`, detalhe: ROTULO_PROCESSO[t.tipo] || t.categoria, data: t.dataCriacao?.slice(0, 10) })),
        },
      ],
    };
  };

  const abas: ItemAba<AbaPessoa>[] = [
    { id: 'visao', rotulo: 'Visão geral' },
    {
      id: 'inventario',
      rotulo: 'Inventário e termos',
      contador: currentAssets.length + assignedLicenses.length + (isTIFicha ? minhasLinhas.length + acessoriosComPessoa.length : 0),
    },
    { id: 'chamados', rotulo: 'Chamados e processos', contador: chamados.length },
  ];
  const painel = (id: AbaPessoa) => (aba === id ? 'space-y-4' : 'hidden');

  // Seção 9.5: aviso que não bloqueia nada; o termo anterior fica no histórico
  const avisoTermo = pendencia && podeGerarTermo && (
    <div role="status" className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold">Termo desatualizado</p>
        <p>
          {resumoPendenciaTermo(pendencia)}
          {vigente ? ` (termo vigente ${vigente.codigo})` : ' (a pessoa ainda não tem termo de entrega)'}.
        </p>
        {pendencia.semTermo.length > 0 && <p>Sem termo: {pendencia.semTermo.map((a) => `${a.tag} · ${a.nome}`).join(', ')}.</p>}
        {pendencia.devolvidos.length > 0 && <p>Já devolvidos: {pendencia.devolvidos.map((d) => d.descricao).join(', ')}.</p>}
        <p className="text-amber-800">Não bloqueia nada: o termo novo substitui o anterior, que fica no histórico.</p>
      </div>
      <span className="flex flex-wrap gap-2">
        {currentAssets.length > 0 && (
          <button type="button" onClick={abrirConferencia} className="btn btn-sm btn-secundario">
            <FilePlus aria-hidden="true" /> Gerar termo atualizado
          </button>
        )}
        {pendencia.devolvidos.length > 0 && (
          <button type="button" onClick={abrirReciboDevolucao} className="btn btn-sm btn-secundario">
            <FileText aria-hidden="true" /> Gerar recibo de devolução
          </button>
        )}
      </span>
    </div>
  );

  return (
    <>
      <Janela
        tamanho="ficha"
        avatar={employee.nome}
        rotuloCaminho={employee.nome}
        titulo={
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words">{employee.nome}</span>
            <span className={`selo ${situacao.selo} shrink-0`}>{situacao.rotulo}</span>
          </span>
        }
        subtitulo={
          <>
            {[employee.cargo, department?.nome].filter(Boolean).join(' · ')}
            {employee.matricula && (
              <>
                {' · '}Matrícula <span className="font-mono">{employee.matricula}</span>
              </>
            )}
          </>
        }
        onFechar={onClose}
        acaoTopo={
          podeRelatorio && (
            <>
              <button type="button" title="Relatório do colaborador em PDF (imprimir ou salvar)" aria-label="Relatório em PDF" onClick={() => imprimirRelatorioColaborador(montarRelatorio())} className="btn btn-sm btn-secundario">
                <Printer aria-hidden="true" />
                <Rotulo texto="Relatório" />
              </button>
              <button type="button" title="Relatório do colaborador em Excel" aria-label="Relatório em Excel" onClick={() => baixarExcelColaborador(montarRelatorio())} className="btn btn-sm btn-secundario">
                <FileSpreadsheet aria-hidden="true" />
                <Rotulo texto="Excel" />
              </button>
            </>
          )
        }
        acoes={
          <>
            {/* Editar dados: T.I. e RH (o banco confere o que cada perfil pode mudar) */}
            {podeEditar && (
              <button type="button" title="Editar dados" aria-label="Editar dados" onClick={() => setEditandoDados(true)} className="btn btn-sm btn-secundario">
                <Pencil aria-hidden="true" />
                <Rotulo texto="Editar dados" />
              </button>
            )}
            {podeGerarTermo && (
              <button
                type="button"
                title={vigente ? 'Gerar termo atualizado (substitui o vigente)' : 'Gerar termo de entrega'}
                aria-label={vigente ? 'Gerar termo atualizado' : 'Gerar termo de entrega'}
                onClick={abrirConferencia}
                className="btn btn-sm btn-secundario"
              >
                <FilePlus />
                <Rotulo texto={vigente ? 'Gerar termo atualizado' : 'Gerar termo de entrega'} />
              </button>
            )}
            {podeAnonimizar && (
              <button
                type="button"
                title="Anonimizar dados (LGPD)"
                aria-label="Anonimizar dados (LGPD)"
                onClick={handleAnonimizar}
                disabled={anonimizando}
                className="btn btn-sm btn-perigo"
              >
                <ShieldOff />
                <Rotulo texto={anonimizando ? 'Anonimizando...' : 'Anonimizar dados (LGPD)'} />
              </button>
            )}
          </>
        }
        faixa={<Abas<AbaPessoa> rotulo="Seções da ficha da pessoa" itens={abas} ativa={aba} onMudar={setAba} />}
      >
        {termSuccess && (
          <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
            <CheckCircle2 className="ico" />
            {termSuccess}
          </p>
        )}

        {/* ---------------- Resumo ---------------- */}
        <div role="tabpanel" aria-label="Visão geral" className={painel('visao')}>
          {avisoTermo}
          {/* Seção 24: quem é, onde está na estrutura, o que está com a pessoa e quanto custa, numa tela só */}
          <div className="grid items-start gap-4 lg:grid-cols-2">
          {/* Cargo, setor, matrícula e situação já estão no cabeçalho */}
          <section className="cartao space-y-3 p-4">
            <h3 className="secao-titulo">Dados da pessoa</h3>
            <dl className="grid gap-y-1">
              <DadoLinha rotulo="E-mail">
                <span className="break-all">{employee.email}</span>
              </DadoLinha>
              <DadoLinha rotulo="Telefone / ramal">{employee.telefone || null}</DadoLinha>
              <DadoLinha rotulo="Admissão">
                {employee.dataAdmissao ? (
                  <>
                    <span className="num">{formatDate(employee.dataAdmissao)}</span>
                    {casa && <span className="texto-aux"> · {casa} de casa</span>}
                  </>
                ) : null}
              </DadoLinha>
              {employee.role && <DadoLinha rotulo="Perfil de acesso">{ROTULO_PAPEL[employee.role]}</DadoLinha>}
            </dl>
          </section>

          <section className="cartao space-y-3 p-4">
            <h3 className="secao-titulo">Estrutura</h3>
            <dl className="grid gap-y-1">
              <DadoLinha rotulo="Departamento">
                {department ? (
                  <>
                    {department.nome}
                    {responsavelDep && responsavelDep.id !== employee.id && <span className="texto-aux"> · responsável </span>}
                    {responsavelDep && responsavelDep.id !== employee.id && nomePessoa(responsavelDep.id, responsavelDep.nome)}
                    {responsavelDep?.id === employee.id && <span className="selo selo-info ml-2">Responsável</span>}
                  </>
                ) : null}
              </DadoLinha>
              <DadoLinha rotulo="Gestor imediato">
                {manager ? (
                  podeAbrirGestor ? (
                    nomePessoa(manager.id, manager.nome)
                  ) : (
                    manager.nome
                  )
                ) : (
                  <span className="text-slate-600">Diretoria / sem gestor</span>
                )}
              </DadoLinha>
              <DadoLinha rotulo={`Equipe que lidera${equipe.length ? ` (${equipe.length})` : ''}`}>
                {equipe.length ? (
                  <span className="flex flex-wrap gap-x-1">
                    {equipe.map((e, i) => (
                      <React.Fragment key={e.id}>
                        {nomePessoa(e.id, e.nome)}
                        {i < equipe.length - 1 && <span aria-hidden="true">,</span>}
                      </React.Fragment>
                    ))}
                  </span>
                ) : (
                  <span className="text-slate-600">Ninguém</span>
                )}
              </DadoLinha>
            </dl>
          </section>

          <section className="cartao space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="secao-titulo">Com a pessoa hoje</h3>
              <button type="button" onClick={() => setAba('inventario')} className="link text-sm">Ver detalhes e termos</button>
            </div>
            <dl className="grid gap-y-1">
              <DadoLinha rotulo={`Equipamentos (${currentAssets.length})`}>
                {currentAssets.length ? (
                  <span className="flex flex-wrap gap-x-1">
                    {currentAssets.map((a, i) => (
                      <React.Fragment key={a.id}>
                        <button type="button" onClick={() => handleOpenAsset(a.id)} className="link text-left">{a.tag} · {a.nome}</button>
                        {i < currentAssets.length - 1 && <span aria-hidden="true">,</span>}
                      </React.Fragment>
                    ))}
                  </span>
                ) : (
                  <span className="text-slate-600">Nenhum</span>
                )}
              </DadoLinha>
              {isTIFicha && (
                <DadoLinha rotulo={`Acessórios (${acessoriosComPessoa.reduce((s, a) => s + a.qtd, 0)})`}>
                  {acessoriosComPessoa.length ? (
                    acessoriosComPessoa.map((a) => `${estoque.find((i) => i.id === a.itemId)?.nome || 'Acessório'}${a.qtd > 1 ? ` × ${a.qtd}` : ''}`).join(', ')
                  ) : (
                    <span className="text-slate-600">Nenhum</span>
                  )}
                </DadoLinha>
              )}
              <DadoLinha rotulo={`Licenças (${assignedLicenses.length})`}>
                {assignedLicenses.length ? (
                  <span className="flex flex-wrap gap-x-1">
                    {assignedLicenses.map((l, i) => (
                      <React.Fragment key={l.id}>
                        {podeAbrirSoftware ? (
                          <button type="button" onClick={() => setSelectedSoftwareIdFor360(l.id)} className="link text-left">{l.nome}</button>
                        ) : (
                          <span>{l.nome}</span>
                        )}
                        {i < assignedLicenses.length - 1 && <span aria-hidden="true">,</span>}
                      </React.Fragment>
                    ))}
                  </span>
                ) : (
                  <span className="text-slate-600">Nenhuma</span>
                )}
              </DadoLinha>
              {isTIFicha && (
                <DadoLinha rotulo={`Linhas (${minhasLinhas.length})`}>
                  {minhasLinhas.length ? <span className="font-mono">{minhasLinhas.map((l) => l.numero).join(', ')}</span> : <span className="text-slate-600">Nenhuma</span>}
                </DadoLinha>
              )}
            </dl>
            {/* Revisão 10.5: no desligamento, o RH vê aqui o que ainda está com a pessoa */}
            {currentRole === 'rh' && employee.status === 'desligado' && (currentAssets.length > 0 || assignedLicenses.length > 0) && (
              <p className="ajuda">A T.I. devolve e desvincula tudo pelo checklist do desligamento.</p>
            )}
          </section>

          {custo && (
            <section className="cartao space-y-3 p-4">
              <h3 className="secao-titulo">Custo da pessoa</h3>
              <dl className="grid gap-y-1">
                <DadoLinha rotulo="Equipamentos">
                  <span className="num">{brl(custo.valorEquipamentos)}</span> <span className="texto-aux">valor de compra</span>
                </DadoLinha>
                <DadoLinha rotulo="Licenças">
                  <span className="num">{brl(custo.mensalLicencas)}</span> <span className="texto-aux">por mês (assento)</span>
                </DadoLinha>
                <DadoLinha rotulo="Linha">
                  <span className="num">{brl(custo.mensalLinhas)}</span> <span className="texto-aux">por mês</span>
                </DadoLinha>
                <DadoLinha rotulo="Total recorrente">
                  <span className="num font-semibold">{brl(custo.mensalTotal)}/mês</span> <span className="texto-aux">· {brl(custo.mensalTotal * 12)} por ano</span>
                </DadoLinha>
              </dl>
              <p className="ajuda">Mesmo cálculo de Gestão de T.I. › Análises › Custo por pessoa.</p>
            </section>
          )}

          {/* Fase 7: acesso ao Nexus (senha provisória fora do onboarding) */}
          {isTIFicha && (
            <section className="cartao space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="secao-titulo flex items-center gap-2">
                  Acesso ao Nexus
                  {employee.temLogin !== undefined && (
                    <span className={`selo normal-case tracking-normal ${employee.temLogin ? 'selo-ok' : 'selo-neutro'}`}>
                      {employee.temLogin ? 'Tem login' : 'Ainda sem login'}
                    </span>
                  )}
                </h3>
                {employee.status !== 'desligado' && (
                  <button type="button" onClick={handleSenhaProvisoria} disabled={gerandoSenha} className="btn btn-sm btn-secundario">
                    <KeyRound />
                    {gerandoSenha ? 'Gerando...' : 'Gerar senha provisória'}
                  </button>
                )}
              </div>
              <p className="texto-aux">
                Login: <span className="break-all text-slate-900">{employee.email}</span>
              </p>

              {(senhaGerada || erroSenha) && (
                <div
                  role="status"
                  className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                    senhaGerada ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  {senhaGerada ? (
                    <>
                      <span>
                        Login <span className="font-mono">{senhaGerada.email}</span> · senha provisória (aparece só agora):
                      </span>
                      <code className="rounded-md border border-emerald-300 bg-white px-2 py-0.5 font-mono tracking-wider select-all">
                        {senhaGerada.senha}
                      </code>
                      <button type="button" onClick={() => navigator.clipboard?.writeText(senhaGerada.senha)} className="btn btn-sm btn-secundario">
                        <Copy />
                        Copiar
                      </button>
                      <span className="w-full">No primeiro login o sistema pede uma senha nova.</span>
                    </>
                  ) : (
                    <span>{erroSenha}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSenhaGerada(null);
                      setErroSenha(null);
                    }}
                    className="btn btn-sm btn-discreto ml-auto"
                  >
                    Ocultar
                  </button>
                </div>
              )}
            </section>
          )}
          </div>
        </div>

        {/* ---------------- Inventário e termos (seção 24: equipamentos, acessórios, softwares, linhas e termos juntos) ---------------- */}
        <div role="tabpanel" aria-label="Inventário e termos" className={painel('inventario')}>
          {!conferencia && !conferenciaDev && avisoTermo}
          {conferencia && (
            <section className="cartao p-4">
              <ConferenciaTermo
                tipo="entrega"
                linhasIniciais={conferencia}
                nomePessoa={employee.nome.split(' ')[0]}
                termoAnterior={vigente}
                gravando={gerandoTermo}
                onConfirmar={(itens, motivo) => handleGenerateTerm(itens, motivo, 'entrega')}
                onVoltar={() => setConferencia(null)}
              />
            </section>
          )}
          {conferenciaDev && (
            <section className="cartao p-4">
              <ConferenciaTermo
                tipo="devolucao"
                linhasIniciais={conferenciaDev}
                nomePessoa={employee.nome.split(' ')[0]}
                gravando={gerandoTermo}
                onConfirmar={(itens) => handleGenerateTerm(itens, '', 'devolucao')}
                onVoltar={() => setConferenciaDev(null)}
              />
            </section>
          )}
          <section className="space-y-2">
            <h3 className="secao-titulo">Equipamentos com a pessoa ({currentAssets.length})</h3>
            {currentAssets.length === 0 ? (
              <Vazio>Nenhum equipamento físico alocado no momento para este colaborador.</Vazio>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {currentAssets.map((asset) => (
                  <CartaoItem
                    key={asset.id}
                    icone={iconeDoAtivo(asset)}
                    codigo={asset.tag}
                    titulo={asset.nome}
                    detalhes={[
                      [asset.marca, asset.modelo].filter(Boolean).join(' '),
                      [asset.serialNumber && `S/N ${asset.serialNumber}`, asset.dataEntregaAtual && `desde ${formatDate(asset.dataEntregaAtual)}`]
                        .filter(Boolean)
                        .join(' · '),
                    ]}
                    onAbrir={() => handleOpenAsset(asset.id)}
                    rotuloAbrir={`Abrir a ficha de ${asset.tag} · ${asset.nome}`}
                  />
                ))}
              </div>
            )}
          </section>

          {returnedHistory.length > 0 && (
            <section className="space-y-2">
              <h3 className="secao-titulo">Equipamentos já devolvidos ({returnedHistory.length})</h3>
              <div className="cartao-tabela">
                <table className="tabela tabela-cartoes">
                  <thead>
                    <tr>
                      <th>Equipamento</th>
                      <th>Período</th>
                      <th>Motivo</th>
                      <th className="num">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnedHistory.map(({ asset, entry }) => (
                      <tr key={entry.id}>
                        <td data-label="Equipamento">
                          <span className="block font-mono font-semibold text-slate-700">{asset.tag}</span>
                          <span className="font-semibold text-slate-900">{asset.nome}</span>
                        </td>
                        <td data-label="Período">
                          {formatDate(entry.dataEntrega)} até {formatDate(entry.dataDevolucao)}
                        </td>
                        <td data-label="Motivo" className="break-words">
                          {entry.motivoDevolucao || '—'}
                        </td>
                        <td data-label="Situação" className="num">
                          <span className="selo selo-neutro">Devolvido</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Seção 6: acessórios recebidos e devolvidos (só a T.I.) */}
          {isTIFicha && (
            <section className="space-y-2">
              <h3 className="secao-titulo">Acessórios com a pessoa ({acessoriosComPessoa.length})</h3>
              {acessoriosComPessoa.length === 0 ? (
                <Vazio>Nenhum acessório com esta pessoa.</Vazio>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {acessoriosComPessoa.map((a) => {
                    const item = estoque.find((i) => i.id === a.itemId);
                    return (
                      <CartaoItem
                        key={a.itemId}
                        icone={iconeDoAcessorio(item?.tipo)}
                        titulo={item?.nome || 'Acessório'}
                        detalhes={[[item?.marca, item?.modelo].filter(Boolean).join(' '), a.ultimo && `recebeu em ${formatDate(a.ultimo.slice(0, 10))}`]}
                        extra={<span className="contador">× {a.qtd}</span>}
                      />
                    );
                  })}
                </div>
              )}
              {acessoriosRecebidos.length > 0 && (
                <details className="cartao p-3">
                  <summary className="secao-titulo cursor-pointer">Histórico de acessórios ({acessoriosRecebidos.length})</summary>
                <div className="cartao-tabela mt-3">
                  <table className="tabela tabela-cartoes">
                    <thead>
                      <tr>
                        <th>Acessório</th>
                        <th>Data</th>
                        <th className="num">Quantidade</th>
                        <th className="num">Movimento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acessoriosRecebidos.map((m) => (
                        <tr key={m.id}>
                          <td data-label="Acessório" className="font-semibold text-slate-900">
                            {estoque.find((i) => i.id === m.itemId)?.nome || 'acessório'}
                          </td>
                          <td data-label="Data">{formatDate(m.criadoEm.slice(0, 10))}</td>
                          <td data-label="Quantidade" className="num">
                            {m.quantidade}
                          </td>
                          <td data-label="Movimento" className="num">
                            <span className={`selo ${m.tipo === 'saida' ? 'selo-info' : 'selo-neutro'}`}>
                              {m.tipo === 'saida' ? 'Recebeu' : 'Devolveu'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </details>
              )}
            </section>
          )}
          <section className="space-y-2">
            <h3 className="secao-titulo">Licenças de software e contas ({assignedLicenses.length})</h3>
            {assignedLicenses.length === 0 ? (
              <Vazio>Nenhuma licença vinculada.</Vazio>
            ) : (
              <div className="cartao-tabela">
                <table className="tabela tabela-cartoes">
                  <thead>
                    <tr>
                      <th>Software</th>
                      <th>Fornecedor</th>
                      {isTIFicha && <th>Chave / ID</th>}
                      <th className="num">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedLicenses.map((lic) => (
                      <tr key={lic.id}>
                        <td data-label="Software">
                          {podeAbrirSoftware ? (
                            <button type="button" onClick={() => setSelectedSoftwareIdFor360(lic.id)} className="link text-left">
                              {lic.nome}
                            </button>
                          ) : (
                            <span className="font-semibold text-slate-900">{lic.nome}</span>
                          )}
                        </td>
                        <td data-label="Fornecedor">
                          {fornecedores.find((f) => f.id === lic.fornecedorId)?.nome || lic.fornecedor || 'Sem fornecedor'}
                        </td>
                        {isTIFicha && (
                          <td data-label="Chave / ID" className="font-mono break-all">
                            {lic.chaveContrato || '—'}
                          </td>
                        )}
                        <td data-label="Situação" className="num">
                          <span className="selo selo-ok">Assento ativo</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {historicoLicencas.length > 0 && (
            <section className="space-y-2">
              <h3 className="secao-titulo">Licenças que já teve</h3>
              <ul className="cartao divide-y divide-slate-100">
                {historicoLicencas.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="font-semibold text-slate-900">{nomeLicenca(a.licencaId)}</span>
                    <span className="text-slate-600">
                      {a.inicio ? formatDate(a.inicio) : 'antes do histórico'} até {formatDate(a.fim || '')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Seção 6: linhas telefônicas (só a T.I.) */}
          {isTIFicha && (
            <section className="space-y-2">
              <h3 className="secao-titulo">Linhas telefônicas ({minhasLinhas.length})</h3>
              {minhasLinhas.length === 0 ? (
                <Vazio>Nenhuma linha em uso por esta pessoa.</Vazio>
              ) : (
                <div className="cartao-tabela">
                  <table className="tabela tabela-cartoes">
                    <thead>
                      <tr>
                        <th>Número</th>
                        <th>Plano</th>
                        <th className="num">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {minhasLinhas.map((l) => (
                        <tr key={l.id}>
                          <td data-label="Número" className="font-mono font-semibold text-slate-900">
                            {l.numero}
                          </td>
                          <td data-label="Plano">{l.plano || '—'}</td>
                          <td data-label="Situação" className="num">
                            <span className={`selo ${l.status === 'ativa' ? 'selo-ok' : 'selo-atencao'}`}>
                              {l.status === 'ativa' ? 'Em uso' : l.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {historicoLinhas.length > 0 && (
                <ul className="cartao divide-y divide-slate-100">
                  {historicoLinhas.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <span className="text-slate-900">
                        Teve a linha <span className="font-mono font-semibold">{linhas.find((l) => l.id === a.linhaId)?.numero || '—'}</span>
                      </span>
                      <span className="text-slate-600">
                        {a.inicio ? formatDate(a.inicio.slice(0, 10)) : 'antes do histórico'} até {formatDate((a.fim || '').slice(0, 10))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <section className="space-y-2">
            <h3 className="secao-titulo">Termos de responsabilidade e devolução ({employeeTerms.length})</h3>
            {employeeTerms.length === 0 ? (
              <Vazio>Nenhum termo emitido para este colaborador ainda.</Vazio>
            ) : (
              <div className="cartao-tabela">
                <table className="tabela tabela-cartoes">
                  <thead>
                    <tr>
                      <th>Termo</th>
                      <th>Tipo</th>
                      <th>Situação</th>
                      <th>Emissão</th>
                      <th className="col-acoes">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeTerms.map((term) => {
                      const s = situacaoTermo(term, false, terms.find((x) => x.id === term.substituidoPor)?.codigo);
                      return (
                        <tr key={term.id}>
                          <td data-label="Termo" className="font-mono font-semibold text-slate-900">
                            {term.codigo}
                          </td>
                          <td data-label="Tipo">Termo de {term.tipo === 'entrega' ? 'entrega' : 'devolução'}</td>
                          <td data-label="Situação">
                            <span className={`selo ${SELO_TOM[s.tom]}`}>{s.rotulo}</span>
                          </td>
                          <td data-label="Emissão">
                            {formatDate(term.dataEmissao)}
                            <span className="block text-slate-500">por {term.responsavelTINome}</span>
                          </td>
                          <td data-label="Ações" className="col-acoes">
                            <span className="acoes-linha">
                              <button type="button" onClick={() => setSelectedTermForPrint(term)} className="btn btn-sm btn-secundario">
                                <FileText />
                                Ver e imprimir
                              </button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* ---------------- Chamados e processos ---------------- */}
        <div role="tabpanel" aria-label="Chamados e processos" className={painel('chamados')}>
          {/* Fase 9: chamados que a pessoa abriu ou em que é o colaborador relacionado (inclui admissão/desligamento) */}
          {/* Seção 9.2: anotações fixas dos processos, visíveis também depois de concluir */}
          {anotacoesProcessos.length > 0 && (
            <section className="space-y-2">
              <h3 className="secao-titulo">Anotações dos processos</h3>
              {anotacoesProcessos.map((t) => (
                <div key={t.id} className="cartao space-y-1 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {ROTULO_PROCESSO[t.tipo]} · <span className="font-mono">{t.codigo}</span>
                    </span>
                    <button type="button" onClick={() => setSelectedTicketIdForDetail(t.id)} className="btn btn-sm btn-secundario">
                      Abrir processo
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-slate-700">{t.anotacoesProcesso}</p>
                </div>
              ))}
            </section>
          )}
          <ChamadosVinculados
            chamados={chamados}
            etiqueta={(t) => [ROTULO_PROCESSO[t.tipo], papelNoChamado(t, employee.id)].filter(Boolean).join(' · ')}
            vazio="Nenhum chamado desta pessoa."
          />
        </div>
      </Janela>
      {editandoDados && <NewEmployeeModal colaborador={employee} onClose={() => setEditandoDados(false)} />}
    </>
  );
};
