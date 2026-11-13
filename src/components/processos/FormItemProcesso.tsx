import React, { useState } from 'react';
import { Copy, KeyRound, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { DadosRegistroItem } from '../../services/supabaseDb.ts';
import { assentosLivres, licencaDaConta } from '../../utils/admissao.ts';
import type { CondicaoItem, DestinoRecurso, ProcessoItem, Ticket } from '../../types/index.ts';
import {
  DOC_DEVOLUCAO_PADRAO,
  DOC_ENTREGA_PADRAO,
  itensDoTermo,
  normalizar,
} from '../../utils/processos.ts';

const ROTULO_DESTINO: Record<DestinoRecurso, string> = {
  suspender: 'Suspender',
  excluir: 'Excluir',
  manter: 'Manter ativa',
  transferir: 'Transferir para outra pessoa',
  outro: 'Outro (descrever)',
};

const ROTULO_FORMA: Record<string, string> = {
  pendente: 'aguardando assinaturas',
  eletronica: 'assinado eletronicamente',
  documento: 'assinado (documento anexado)',
  dispensada: 'assinatura dispensada',
};

const campo = 'w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const rotulo = 'block text-xs font-semibold text-slate-600 mb-0.5';

interface Props {
  item: ProcessoItem;
  ticket: Ticket;
  onFechar: () => void;
}

/**
 * Registro de um passo do checklist pela T.I. Cada tipo pede só o necessário
 * (login criado, equipamento entregue, destino da conta, condição da devolução...).
 * Nada grava até clicar em "Marcar como feito" ou "Não se aplica"; o banco
 * valida de novo e aplica os efeitos no inventário numa transação.
 */
export const FormItemProcesso: React.FC<Props> = ({ item, ticket, onFechar }) => {
  const {
    employees,
    assets,
    licenses,
    recursos,
    terms,
    settings,
    departments,
    currentUser,
    currentRole,
    processoItens,
    registrarItemProcesso,
    acessoNexus,
    cadastrarColaborador,
    allocateLicense,
    createTerm,
    setSelectedTermForPrint,
  } = useApp();

  const ob = ticket.onboarding;
  const off = ticket.offboarding;
  const colabId = ticket.colaboradorId || off?.colaboradorId;
  const colab = employees.find((e) => e.id === colabId);
  const recurso = recursos.find((r) => r.id === item.recursoId);
  const encerraConta = item.tipo === 'encerrar_recurso' && recurso?.tipo !== 'acessorio';
  const pedeDestino = encerraConta || item.tipo === 'dados_drive' || item.tipo === 'email';
  // Ajustes do desligamento: conta e licença só saem com a confirmação de que foram removidas na origem
  const desvincula = encerraConta || item.tipo === 'liberar_licenca';
  const colabPorEmail = ob
    ? employees.find((e) => e.email.toLowerCase() === ob.emailColaborador.trim().toLowerCase())
    : undefined;
  const sugestaoDestino =
    item.tipo === 'dados_drive' && off?.transferirDrive
      ? off.transferirDriveParaId
      : item.tipo === 'email' && off?.redirecionarEmail
        ? off.redirecionarEmailParaId
        : undefined;

  const [obs, setObs] = useState('');
  const [ident, setIdent] = useState(
    item.identificador || (item.tipo === 'conta' ? colab?.email || ob?.emailColaborador || '' : '')
  );
  const [colaboradorId, setColaboradorId] = useState(colabId || colabPorEmail?.id || '');
  const [ativoId, setAtivoId] = useState('');
  const [licencaId, setLicencaId] = useState(item.licencaId || '');
  const [destino, setDestino] = useState<DestinoRecurso | ''>(sugestaoDestino ? 'transferir' : '');
  const [destinoColab, setDestinoColab] = useState(sugestaoDestino || '');
  const [condicao, setCondicao] = useState<CondicaoItem | ''>('');
  const [lembrete, setLembrete] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [senha, setSenha] = useState<{ email: string; senha: string } | null>(null);
  const [podeRedefinir, setPodeRedefinir] = useState(false);

  const ativosLivres = assets
    .filter((a) => a.status === 'disponivel' && !a.custodianteId)
    .sort((a, b) => {
      const alvo = normalizar(item.titulo);
      const casa = (x: typeof a) => (normalizar(`${x.nome} ${x.categoria}`).includes(alvo) ? 0 : 1);
      return casa(a) - casa(b) || a.tag.localeCompare(b.tag);
    });
  const licencasLivres = licenses.filter((l) => l.assentosAlocados < l.assentosTotais || l.id === item.licencaId);
  const pessoas = employees.filter((e) => e.status !== 'desligado' && e.id !== colabId);

  // Ajustes da admissão: conta de um software com licença cadastrada já atribui a licença
  const licencaConta = item.tipo === 'conta' ? licencaDaConta(item.titulo, licenses) : undefined;
  const jaTemLicenca = !!(licencaConta && colabId && licencaConta.colaboradoresIds.includes(colabId));
  const livresConta = licencaConta ? assentosLivres(licencaConta) : 0;
  const [atribuirLicenca, setAtribuirLicenca] = useState(true);
  const [confirmouExterno, setConfirmouExterno] = useState(false);
  const licencaDoItem =
    item.tipo === 'liberar_licenca'
      ? licenses.find((l) => l.id === item.licencaId)
      : encerraConta && recurso
        ? licencaDaConta(recurso.nome, licenses)
        : undefined;

  const registrar = async (status: 'feito' | 'nao_se_aplica', observacaoExtra?: string, colaboradorDoCadastro?: string) => {
    setErro(null);
    const observacao = [obs.trim(), observacaoExtra].filter(Boolean).join(' — ') || undefined;
    if (status === 'nao_se_aplica' && !obs.trim()) return setErro('Escreva o motivo para marcar como "não se aplica".');
    const dados: DadosRegistroItem = {};
    if (status === 'feito') {
      if (desvincula && !confirmouExterno) {
        return setErro(
          item.tipo === 'liberar_licenca'
            ? 'Confirme que removeu o acesso no painel do fornecedor.'
            : 'Confirme que desativou a conta no sistema de origem.'
        );
      }
      if (item.tipo === 'cadastro') {
        const escolhido = colaboradorDoCadastro || colaboradorId;
        if (!escolhido) return setErro('Escolha o colaborador cadastrado.');
        dados.colaborador_id = escolhido;
      }
      if ((item.tipo === 'conta' || item.tipo === 'grupo_email') && !ident.trim())
        return setErro('Informe o login, e-mail ou nome do grupo criado.');
      if (ident.trim()) dados.identificador = ident.trim();
      if (item.tipo === 'equipamento') {
        if (!ativoId) return setErro('Escolha o equipamento entregue.');
        dados.ativo_id = ativoId;
      }
      if (item.tipo === 'licenca') {
        if (!licencaId) return setErro('Escolha a licença.');
        dados.licenca_id = licencaId;
      }
      if (pedeDestino) {
        if (!destino) return setErro('Escolha o destino.');
        if (destino === 'transferir' && !destinoColab) return setErro('Escolha quem recebe.');
        if (destino === 'outro' && !obs.trim()) return setErro('Descreva o que foi feito.');
        dados.destino = destino;
        if (destino === 'transferir') dados.destino_colaborador_id = destinoColab;
      }
      if (item.tipo === 'devolver_equipamento') {
        if (!condicao) return setErro('Informe a condição: bom ou avaria.');
        if (condicao === 'avaria' && !obs.trim()) return setErro('Descreva a avaria encontrada.');
        dados.condicao = condicao;
      }
    }
    if (lembrete) dados.lembrete_em = lembrete;
    setGravando(true);
    const falha = await registrarItemProcesso(item.id, status, observacao, dados);
    setGravando(false);
    if (falha) return setErro(falha);
    // Conta criada: ocupa o assento da licença correspondente (função atômica do banco)
    if (status === 'feito' && licencaConta && colabId && atribuirLicenca && !jaTemLicenca && livresConta > 0) {
      allocateLicense(licencaConta.id, colabId);
    }
    if (!senha) onFechar();
  };

  // Cadastro a partir do pedido do RH (mesma regra de papel da Fase 3): cria e já conclui o passo
  const cadastrarDoRh = async () => {
    if (!ob) return;
    setErro(null);
    setGravando(true);
    const { colaborador: novo, erro: falha } = await cadastrarColaborador({
      matricula: `NX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      nome: ob.nomeColaborador,
      email: ob.emailColaborador,
      cargo: ob.cargo,
      setorId: ob.setorId,
      gestorId: ob.gestorId,
      status: 'ativo',
      dataAdmissao: ob.dataAdmissao,
      role: currentRole === 'ti_admin' ? ob.papelAcessoSugerido || 'colaborador' : 'colaborador',
    });
    setGravando(false);
    if (!novo) return setErro(falha || 'Não foi possível cadastrar.');
    setColaboradorId(novo.id);
    setAviso(`Cadastro de ${novo.nome} criado (matrícula ${novo.matricula}).`);
    await registrar('feito', `Cadastro criado com os dados do RH (matrícula ${novo.matricula})`, novo.id);
  };

  const gerarAcesso = async (acao: 'criar' | 'redefinir') => {
    if (!colabId) return setErro('Faça primeiro o passo "Cadastrar colaborador".');
    setErro(null);
    setGravando(true);
    const r = await acessoNexus(colabId, acao, ticket.id);
    setGravando(false);
    if ('erro' in r) {
      setPodeRedefinir(/já tem acesso|já existe/i.test(r.erro));
      return setErro(r.erro);
    }
    setSenha(r);
    // Registra o passo; a senha continua na tela até a pessoa fechar
    const falha = await registrarItemProcesso(
      item.id,
      'feito',
      acao === 'criar' ? `Login criado para ${r.email}` : `Nova senha provisória gerada para ${r.email}`,
      {}
    );
    if (falha) setErro(falha);
  };

  // Termo do processo (entrega no onboarding, devolução no offboarding)
  const termo = terms.find((t) => t.chamadoId === ticket.id);
  const termoOk = termo && termo.formaAssinatura && termo.formaAssinatura !== 'pendente';
  const gerarTermo = async () => {
    if (!colab) return setErro('Faça primeiro o passo "Cadastrar colaborador".');
    const tipo = ticket.tipo === 'onboarding' ? 'entrega' : 'devolucao';
    const linhas = itensDoTermo(
      tipo,
      processoItens.filter((i) => i.chamadoId === ticket.id),
      assets,
      recursos
    );
    if (linhas.length === 0) {
      return setErro(
        tipo === 'entrega'
          ? 'Registre primeiro a entrega dos equipamentos/acessórios: eles formam as linhas do termo.'
          : 'Não há equipamentos ou acessórios neste desligamento para constar no recibo.'
      );
    }
    const doc = (tipo === 'entrega' ? settings.docEntrega : settings.docDevolucao) ||
      (tipo === 'entrega' ? DOC_ENTREGA_PADRAO : DOC_DEVOLUCAO_PADRAO);
    setGravando(true);
    const novo = await createTerm({
      tipo,
      colaboradorId: colab.id,
      colaboradorNome: colab.nome,
      colaboradorMatricula: colab.matricula,
      colaboradorCargo: colab.cargo,
      colaboradorSetorNome: departments.find((d) => d.id === colab.setorId)?.nome || '—',
      ativoIds: linhas.map((l) => l.ativoId).filter((x): x is string => Boolean(x)),
      statusAssinatura: 'gerado',
      responsavelTIId: currentUser?.id || '',
      responsavelTINome: currentUser?.nome || 'Responsável T.I.',
      chamadoId: ticket.id,
      itens: linhas,
      localUnidade: settings.cidadeUF,
      docCodigo: doc.codigo,
      docVersao: doc.versao,
      docReferencia: doc.referencia,
      docTitulo: doc.titulo,
      textoClausula: tipo === 'entrega' ? settings.textoTermoEntrega : settings.textoTermoDevolucao,
      formaAssinatura: 'pendente',
    });
    setGravando(false);
    if (novo) setSelectedTermForPrint(novo);
  };

  const obsObrigatoria =
    (item.tipo === 'devolver_equipamento' && condicao === 'avaria') || (pedeDestino && destino === 'outro');

  const nomeDe = (id?: string) => employees.find((e) => e.id === id)?.nome || '—';

  return (
    <div className="border-t border-slate-200 bg-slate-50/80 p-3 space-y-2.5">
      {/* Campos de cada tipo */}
      {item.tipo === 'cadastro' && (
        <div className="space-y-2">
          <div>
            <label className={rotulo}>Colaborador cadastrado</label>
            <select className={campo} value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)}>
              <option value="">Escolha...</option>
              {employees
                .filter((e) => e.status !== 'desligado')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome} · {e.email}
                  </option>
                ))}
            </select>
          </div>
          {/* Ajustes da admissão: um clique cadastra (ou liga) e já conclui o passo */}
          {ob && !colabPorEmail && !colaboradorId && (
            <button
              type="button"
              disabled={gravando}
              onClick={cadastrarDoRh}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" /> Cadastrar {ob.nomeColaborador} com os dados do RH e concluir
            </button>
          )}
          {ob && colabPorEmail && (
            <button
              type="button"
              disabled={gravando}
              onClick={() => registrar('feito', 'Pessoa já cadastrada com o e-mail informado pelo RH', colabPorEmail.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" /> {colabPorEmail.nome} já está cadastrada: ligar e concluir
            </button>
          )}
        </div>
      )}

      {/* Ajustes da admissão: a conta de um software com licença cadastrada já ocupa o assento */}
      {item.tipo === 'conta' && licencaConta && (
        <div className="rounded-md border border-purple-200 bg-purple-50/60 p-2.5 text-xs">
          {jaTemLicenca ? (
            <p className="text-purple-900">{colab?.nome} já tem a licença {licencaConta.nome}.</p>
          ) : !colabId ? (
            <p className="text-purple-900">
              Licença {licencaConta.nome}: será possível atribuir depois do passo "Cadastrar colaborador".
            </p>
          ) : livresConta === 0 ? (
            <p className="text-amber-800">
              {licencaConta.nome} está sem assento livre ({licencaConta.assentosAlocados} de {licencaConta.assentosTotais} em uso). A conta
              será registrada; atribua a licença depois, na ficha do software.
            </p>
          ) : (
            <label className="flex items-start gap-2 cursor-pointer text-purple-900">
              <input type="checkbox" checked={atribuirLicenca} onChange={(e) => setAtribuirLicenca(e.target.checked)} className="mt-0.5" />
              <span>
                Atribuir a licença <strong>{licencaConta.nome}</strong> a {colab?.nome.split(' ')[0]} ({licencaConta.assentosAlocados} de{' '}
                {licencaConta.assentosTotais} em uso)
              </span>
            </label>
          )}
        </div>
      )}

      {(item.tipo === 'conta' || item.tipo === 'grupo_email' || item.tipo === 'acessorio') && (
        <div>
          <label className={rotulo}>
            {item.tipo === 'conta'
              ? 'Login / e-mail criado'
              : item.tipo === 'grupo_email'
                ? 'E-mail do grupo'
                : 'Identificação (opcional: modelo, nº de série)'}
          </label>
          <input className={campo} value={ident} onChange={(e) => setIdent(e.target.value)} />
        </div>
      )}

      {item.tipo === 'equipamento' && (
        <div>
          <label className={rotulo}>Equipamento entregue (estoque disponível)</label>
          <select className={campo} value={ativoId} onChange={(e) => setAtivoId(e.target.value)}>
            <option value="">Escolha...</option>
            {ativosLivres.map((a) => (
              <option key={a.id} value={a.id}>
                {a.tag} · {a.nome} {a.marca} {a.modelo}
              </option>
            ))}
          </select>
          {ativosLivres.length === 0 && (
            <p className="text-xs text-amber-700 mt-1">Nenhum ativo disponível no estoque. Cadastre ou libere um em Ativos.</p>
          )}
        </div>
      )}

      {item.tipo === 'licenca' && (
        <div>
          <label className={rotulo}>Licença</label>
          <select className={campo} value={licencaId} onChange={(e) => setLicencaId(e.target.value)}>
            <option value="">Escolha...</option>
            {licencasLivres.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome} · {l.assentosTotais - l.assentosAlocados} assento(s) livre(s)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Ajustes do desligamento: desvincular de verdade (painel do fornecedor) e no sistema */}
      {desvincula && (
        <div className="rounded-md border border-rose-200 bg-rose-50/60 p-2.5 text-xs space-y-1.5">
          <label className="flex items-start gap-2 cursor-pointer text-rose-900">
            <input type="checkbox" checked={confirmouExterno} onChange={(e) => setConfirmouExterno(e.target.checked)} className="mt-0.5" />
            <span>
              {item.tipo === 'liberar_licenca'
                ? `Removi o acesso de ${colab?.nome.split(' ')[0] || 'a pessoa'} a ${item.titulo} no painel do fornecedor`
                : `Desativei a conta ${item.titulo}${recurso?.identificador ? ` (${recurso.identificador})` : ''} no sistema de origem`}
            </span>
          </label>
          {licencaDoItem?.urlPainel && (
            <a href={licencaDoItem.urlPainel} target="_blank" rel="noopener noreferrer" className="inline-block font-medium text-blue-700 hover:underline">
              Abrir o painel de {licencaDoItem.nome} ↗
            </a>
          )}
          <p className="text-rose-800">
            {item.tipo === 'liberar_licenca'
              ? 'Ao concluir, o assento também é liberado aqui no sistema.'
              : 'Ao concluir, a conta sai do inventário da pessoa aqui no sistema.'}
          </p>
        </div>
      )}

      {pedeDestino && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className={rotulo}>
              {item.tipo === 'dados_drive' ? 'Destino dos arquivos' : item.tipo === 'email' ? 'Destino da caixa' : 'Destino da conta'}
            </label>
            <select className={campo} value={destino} onChange={(e) => setDestino(e.target.value as DestinoRecurso | '')}>
              <option value="">Escolha...</option>
              {(Object.keys(ROTULO_DESTINO) as DestinoRecurso[]).map((d) => (
                <option key={d} value={d}>
                  {ROTULO_DESTINO[d]}
                </option>
              ))}
            </select>
          </div>
          {destino === 'transferir' && (
            <div>
              <label className={rotulo}>Quem recebe</label>
              <select className={campo} value={destinoColab} onChange={(e) => setDestinoColab(e.target.value)}>
                <option value="">Escolha...</option>
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {item.tipo === 'devolver_equipamento' && (
        <div>
          <span className={rotulo}>Condição na devolução</span>
          <div className="flex gap-4 text-xs">
            {(['bom', 'avaria'] as CondicaoItem[]).map((c) => (
              <label key={c} className="flex items-center gap-1.5">
                <input type="radio" name={`cond-${item.id}`} checked={condicao === c} onChange={() => setCondicao(c)} />
                {c === 'bom' ? 'Bom' : 'Com avaria (vai para manutenção)'}
              </label>
            ))}
          </div>
        </div>
      )}

      {item.tipo === 'acesso_nexus' && (
        <div className="space-y-2">
          {senha ? (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-md space-y-1.5">
              <p className="text-xs font-semibold text-emerald-900">Acesso pronto. A senha aparece só agora:</p>
              <p className="text-xs text-slate-700">
                Login: <span className="font-mono">{senha.email}</span>
              </p>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-white border border-emerald-300 rounded text-sm font-mono tracking-wider select-all">
                  {senha.senha}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(senha.senha)}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-emerald-800 bg-white border border-emerald-300 rounded hover:bg-emerald-100"
                >
                  <Copy className="w-3 h-3" /> Copiar
                </button>
              </div>
              <p className="text-xs text-emerald-800">
                Entregue por um canal seguro (pessoalmente ou mensagem direta). No primeiro login o sistema pede uma senha nova.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-600">
                Cria o login de {colab?.nome || 'colaborador'} ({colab?.email || 'e-mail do cadastro'}) com senha provisória.
                Não depende de e-mail.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={gravando || !colabId}
                  onClick={() => gerarAcesso('criar')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Criar login e gerar senha
                </button>
                {podeRedefinir && (
                  <button
                    type="button"
                    disabled={gravando}
                    onClick={() => gerarAcesso('redefinir')}
                    className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-white border border-indigo-300 rounded-md hover:bg-indigo-50"
                  >
                    Gerar nova senha provisória
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {item.tipo === 'termo' && (
        <div className="space-y-1.5 text-xs">
          {termo ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {termo.docCodigo || termo.codigo} · {termo.codigo} —{' '}
                <span className="font-semibold">{ROTULO_FORMA[termo.formaAssinatura || 'pendente']}</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedTermForPrint(termo)}
                className="px-2 py-1 text-xs font-semibold text-blue-700 bg-white border border-blue-300 rounded hover:bg-blue-50"
              >
                Abrir termo
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={gravando}
              onClick={gerarTermo}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Gerar {ticket.tipo === 'onboarding' ? 'termo de entrega' : 'recibo de devolução'} a partir do checklist
            </button>
          )}
          {!termoOk && (
            <p className="text-xs text-slate-500">
              O processo pode ser concluído com o termo pendente: o sistema cria um lembrete para coletar a assinatura.
            </p>
          )}
        </div>
      )}

      {/* Comuns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2">
          <label className={rotulo}>
            {obsObrigatoria ? 'Descrição / observação (obrigatória)' : 'Descrição / observação'}
          </label>
          <textarea
            className={campo}
            rows={2}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder={
              obsObrigatoria
                ? 'Descreva o que foi encontrado ou feito'
                : item.tipo === 'dados_drive'
                ? 'Ex.: pasta compartilhada com o gestor; prazo para ele revisar'
                : item.tipo === 'email'
                  ? 'Ex.: acesso delegado ao gestor por 30 dias, depois importar'
                  : 'Opcional'
            }
          />
        </div>
        <div>
          <label className={rotulo}>Lembrete (opcional)</label>
          <input type="date" className={campo} value={lembrete} onChange={(e) => setLembrete(e.target.value)} />
        </div>
      </div>

      {aviso && <p className="text-xs text-emerald-700">{aviso}</p>}
      {erro && <p className="text-xs font-medium text-red-700">{erro}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onFechar}
          disabled={gravando}
          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
        >
          {senha ? 'Fechar' : 'Cancelar'}
        </button>
        {!senha && (
          <>
            <button
              type="button"
              onClick={() => registrar('nao_se_aplica')}
              disabled={gravando}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
            >
              Não se aplica
            </button>
            <button
              type="button"
              onClick={() =>
                registrar(
                  'feito',
                  pedeDestino && destino === 'transferir' ? `Transferido para ${nomeDe(destinoColab)}` : undefined
                )
              }
              disabled={gravando || (item.tipo === 'termo' && !termoOk)}
              title={item.tipo === 'termo' && !termoOk ? 'Disponível quando o termo estiver assinado ou dispensado' : undefined}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50"
            >
              {gravando ? 'Gravando...' : 'Marcar como feito'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
