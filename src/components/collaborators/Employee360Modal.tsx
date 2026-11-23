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
import { FileText, FilePlus, Pencil, KeyRound, CheckCircle2, AlertCircle, Copy, ShieldOff } from 'lucide-react';
import { avisar, confirmar } from '../ui/dialogo.tsx';
import { Janela, DadoLinha } from '../ui/Janela.tsx';
import { Abas, type ItemAba } from '../ui/Abas.tsx';
import { Vazio } from '../ui/Tela.tsx';

interface Employee360ModalProps {
  employeeId: string;
  onClose: () => void;
}

type AbaPessoa = 'resumo' | 'equipamentos' | 'softwares' | 'termos' | 'chamados';

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
  } = useApp();
  const { linhas, atribuicoesLinha, movimentos, estoque } = useRecursos();

  const [aba, setAba] = useState<AbaPessoa>('resumo');
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
    setAba('termos');
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
    setAba('termos');
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

  const abas: ItemAba<AbaPessoa>[] = [
    { id: 'resumo', rotulo: 'Resumo' },
    { id: 'equipamentos', rotulo: 'Equipamentos e acessórios', contador: currentAssets.length },
    { id: 'softwares', rotulo: 'Softwares e linhas', contador: assignedLicenses.length + (isTIFicha ? minhasLinhas.length : 0) },
    { id: 'termos', rotulo: 'Termos', contador: employeeTerms.length },
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
        <div role="tabpanel" aria-label="Resumo" className={painel('resumo')}>
          {avisoTermo}
          {/* Seção 19: blocos curtos lado a lado (dados da pessoa e acesso / o que ainda está com ela) */}
          <div className="grid items-start gap-4 lg:grid-cols-2">
          {/* Seção 19: cargo, setor, matrícula e situação já estão no cabeçalho; aqui só o resto, compacto */}
          <section className="cartao space-y-3 p-4">
            <h3 className="secao-titulo">Dados da pessoa</h3>
            <dl className="grid gap-y-1">
              <DadoLinha rotulo="E-mail">
                <span className="break-all">{employee.email}</span>
              </DadoLinha>
              <DadoLinha rotulo="Gestor imediato">
                {manager ? (
                  podeAbrirGestor ? (
                    <button type="button" onClick={() => setSelectedEmployeeIdFor360(manager.id)} className="link text-left">
                      {manager.nome}
                    </button>
                  ) : (
                    manager.nome
                  )
                ) : (
                  <span className="text-slate-600">Diretoria / sem gestor</span>
                )}
              </DadoLinha>
              <DadoLinha rotulo="Admissão">{employee.dataAdmissao ? <span className="num">{formatDate(employee.dataAdmissao)}</span> : null}</DadoLinha>
              <DadoLinha rotulo="Telefone / ramal">{employee.telefone || null}</DadoLinha>
            </dl>
          </section>

          {/* Revisão 10.5: o RH vê, no desligamento, o que ainda está com a pessoa */}
          {currentRole === 'rh' &&
            (employee.status === 'desligado' ||
              tickets.some(
                (t) =>
                  t.tipo === 'offboarding' &&
                  (t.colaboradorId === employee.id || t.offboarding?.colaboradorId === employee.id) &&
                  t.status !== 'resolvido' &&
                  t.status !== 'cancelado'
              )) && (
              <section className="cartao space-y-2 p-4">
                <h3 className="secao-titulo">Ainda com a pessoa</h3>
                {currentAssets.length === 0 && assignedLicenses.length === 0 ? (
                  <p className="texto-aux">Nenhum equipamento nem software em nome dela.</p>
                ) : (
                  <ul className="space-y-1 text-slate-700">
                    {currentAssets.map((a) => (
                      <li key={a.id}>
                        <span className="font-mono">{a.tag}</span> · {a.nome}
                      </li>
                    ))}
                    {assignedLicenses.map((l) => (
                      <li key={l.id}>Software: {l.nome}</li>
                    ))}
                  </ul>
                )}
                <p className="ajuda">A T.I. devolve e desvincula tudo pelo checklist do desligamento.</p>
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

        {/* ---------------- Equipamentos e acessórios ---------------- */}
        <div role="tabpanel" aria-label="Equipamentos e acessórios" className={painel('equipamentos')}>
          <section className="space-y-2">
            <h3 className="secao-titulo">Equipamentos com a pessoa ({currentAssets.length})</h3>
            {currentAssets.length === 0 ? (
              <Vazio>Nenhum equipamento físico alocado no momento para este colaborador.</Vazio>
            ) : (
              <div className="cartao-tabela">
                <table className="tabela tabela-cartoes">
                  <thead>
                    <tr>
                      <th>Equipamento</th>
                      <th>Marca e modelo</th>
                      <th>Número de série</th>
                      <th>Em posse desde</th>
                      <th className="col-acoes">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentAssets.map((asset) => (
                      <tr key={asset.id}>
                        <td data-label="Equipamento">
                          <span className="block font-mono font-semibold text-blue-700">{asset.tag}</span>
                          <span className="font-semibold text-slate-900">{asset.nome}</span>
                        </td>
                        <td data-label="Marca e modelo">{[asset.marca, asset.modelo].filter(Boolean).join(' ') || '—'}</td>
                        <td data-label="Número de série" className="font-mono break-all">
                          {asset.serialNumber || '—'}
                        </td>
                        <td data-label="Em posse desde">{formatDate(asset.dataEntregaAtual)}</td>
                        <td data-label="Ações" className="col-acoes">
                          <span className="acoes-linha">
                            <button type="button" onClick={() => handleOpenAsset(asset.id)} className="btn btn-sm btn-secundario">
                              Abrir ficha
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              <h3 className="secao-titulo">Acessórios ({acessoriosRecebidos.length})</h3>
              {acessoriosRecebidos.length === 0 ? (
                <Vazio>Nenhum acessório entregue a esta pessoa.</Vazio>
              ) : (
                <div className="cartao-tabela">
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
              )}
            </section>
          )}
        </div>

        {/* ---------------- Softwares e linhas ---------------- */}
        <div role="tabpanel" aria-label="Softwares e linhas" className={painel('softwares')}>
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
        </div>

        {/* ---------------- Termos ---------------- */}
        <div role="tabpanel" aria-label="Termos" className={painel('termos')}>
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
