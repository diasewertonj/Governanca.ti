/**
 * Seção 9.2 · Um passo do checklist com a ação na própria linha:
 * escolher equipamento/acessório/licença + "Registrar" no mesmo lugar; passos
 * simples com "Feito" de um clique; "Não se aplica" com motivo curto; "Agendar"
 * com data (vira lembrete e entra no Precisa de atenção). O formulário completo
 * (observação, lembrete, termo, outra pessoa) abre em "Mais opções".
 */
import React, { useState } from 'react';
import { Ban, CalendarClock, Check, CheckCircle2, Circle, KeyRound, MinusCircle, Package, Plus, RotateCcw, ShoppingCart, SlidersHorizontal, Trash2, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import { FormPedido, pedidoVazio } from '../compras/FormPedido.tsx';
import { FichaPedido } from '../compras/FichaPedido.tsx';
import { ROTULO_STATUS_PEDIDO } from '../../utils/compras.ts';
import type { Asset, AssetCategory, DestinoRecurso, ItemEstoque, PedidoCompra, ProcessoItem, Ticket, TipoAcessorio } from '../../types/index.ts';
import { ACAO_DO_TIPO, normalizar, podeReabrir } from '../../utils/processos.ts';
import { assentosLivres, licencaDaConta } from '../../utils/admissao.ts';
import { licencaAtiva } from '../../utils/licencas.ts';
import { termoCancelado } from '../../utils/termos.ts';
import { avisoSegundoAcessorio, avisoSegundoAtivo } from '../../utils/inventario.ts';
import { FABRICANTES } from '../../utils/especificacoes.ts';
import { diasAte, formatDate, formatDateTime, isoLocal } from '../../utils/formatters.ts';
import { avisar, confirmar, confirmarMovimento, pedirTexto } from '../ui/dialogo.tsx';
import { MenuAcoes } from '../ui/MenuAcoes.tsx';
import { Janela } from '../ui/Janela.tsx';
import { CampoMoeda, CampoSugestoes } from '../ui/Campos.tsx';
import { NewEmployeeModal } from '../collaborators/NewEmployeeModal.tsx';
import { NewAssetModal } from '../assets/NewAssetModal.tsx';
import { FormItemProcesso } from './FormItemProcesso.tsx';
import { usePassoProcesso, type ResultadoLogin } from './usePassoProcesso.ts';

export const ROTULO_DESTINO: Record<DestinoRecurso, string> = {
  suspender: 'Suspender',
  excluir: 'Excluir',
  manter: 'Manter ativa',
  transferir: 'Transferir para outra pessoa',
  outro: 'Outro (descrever)',
};

const ROTULO_TIPO_ACESSORIO: Record<TipoAcessorio, string> = {
  monitor: 'Monitor',
  mouse: 'Mouse',
  teclado: 'Teclado',
  cabo: 'Cabo',
  headset: 'Headset / fone',
  adaptador: 'Adaptador / hub',
  carregador: 'Carregador / fonte',
  webcam: 'Webcam',
  outro: 'Outro',
};

/** Tipo de acessório pelo nome do passo ("Fone de ouvido" → headset) */
export function tipoAcessorioDoNome(nome: string): TipoAcessorio {
  const n = normalizar(nome);
  if (/mouse/.test(n)) return 'mouse';
  if (/teclado/.test(n)) return 'teclado';
  if (/fone|headset/.test(n)) return 'headset';
  if (/cabo/.test(n)) return 'cabo';
  if (/adaptador|hub|dock/.test(n)) return 'adaptador';
  if (/carregador|fonte/.test(n)) return 'carregador';
  if (/webcam|camera/.test(n)) return 'webcam';
  if (/monitor/.test(n)) return 'monitor';
  return 'outro';
}

/** Categoria do equipamento pelo nome do passo ("Monitor extra" → periférico) */
const categoriaDoNome = (nome: string): AssetCategory =>
  /monitor|dock|impressora|webcam|headset|projetor/i.test(nome) ? 'periferico' : /celular|smartphone|iphone|telefone/i.test(nome) ? 'telefonia' : 'hardware';

const dataCurta = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

interface Props {
  item: ProcessoItem;
  ticket: Ticket;
  podeEditar: boolean;
  aberto: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  /** Senha provisória criada (a tela mostra numa janela para copiar) */
  onLogin: (r: ResultadoLogin) => void;
}

export const PassoProcesso: React.FC<Props> = ({ item, ticket, podeEditar, aberto, onAbrir, onFechar, onLogin }) => {
  const { employees, assets, licenses, recursos, terms, currentRole, removerItemProcesso, setSelectedTermForPrint } = useApp();
  const { estoque, linhas, movimentos } = useRecursos();
  const { registrar, criarLogin } = usePassoProcesso(ticket);

  const ob = ticket.onboarding;
  const off = ticket.offboarding;
  const colabId = ticket.colaboradorId || off?.colaboradorId;
  const colab = employees.find((e) => e.id === colabId);
  const primeiroNome = colab?.nome.split(' ')[0] || 'a pessoa';
  const nomeDe = (id?: string) => employees.find((e) => e.id === id)?.nome || '—';
  const recurso = recursos.find((r) => r.id === item.recursoId);
  const encerraConta = item.tipo === 'encerrar_recurso' && recurso?.tipo !== 'acessorio';
  const sugestaoDestino =
    item.tipo === 'dados_drive' && off?.transferirDrive ? off.transferirDriveParaId : item.tipo === 'email' && off?.redirecionarEmail ? off.redirecionarEmailParaId : undefined;
  const pessoas = employees.filter((e) => e.status !== 'desligado' && e.id !== colabId);

  const alvo = normalizar(item.titulo);
  const casa = (texto: string) => normalizar(texto).includes(alvo) || alvo.includes(normalizar(texto));
  const ativosLivres = assets
    .filter((a) => a.status === 'disponivel' && !a.custodianteId)
    .sort((a, b) => (casa(`${a.nome} ${a.categoria}`) ? 0 : 1) - (casa(`${b.nome} ${b.categoria}`) ? 0 : 1) || a.tag.localeCompare(b.tag));
  const tipoAcessorio = tipoAcessorioDoNome(item.titulo);
  const casaEstoque = (i: ItemEstoque) => casa(i.nome) || (tipoAcessorio !== 'outro' && i.tipo === tipoAcessorio);
  const acessoriosEmEstoque = estoque.filter((i) => i.ativo && i.quantidade > 0).sort((a, b) => (casaEstoque(a) ? 0 : 1) - (casaEstoque(b) ? 0 : 1) || a.nome.localeCompare(b.nome));
  const licencasLivres = licenses.filter((l) => (licencaAtiva(l) && l.assentosAlocados < l.assentosTotais) || l.id === item.licencaId);
  const linhasLivres = linhas.filter((l) => l.status === 'ativa' && !l.colaboradorId);
  const linhaDoItem = linhas.find((l) => l.id === item.linhaId);
  const licencaConta =
    item.tipo === 'conta'
      ? (item.licencaId ? licenses.find((l) => l.id === item.licencaId && licencaAtiva(l)) : undefined) || licencaDaConta(item.titulo, licenses.filter(licencaAtiva))
      : undefined;
  const colabPorEmail = ob ? employees.find((e) => e.email.toLowerCase() === ob.emailColaborador.trim().toLowerCase()) : undefined;
  const termo = terms.filter((t) => t.chamadoId === ticket.id).find((t) => !termoCancelado(t));
  const termoOk = !!termo && !!termo.formaAssinatura && termo.formaAssinatura !== 'pendente';

  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [ident, setIdent] = useState(item.identificador || (item.tipo === 'grupo_email' ? item.titulo : ''));
  const [ativoId, setAtivoId] = useState('');
  const [licencaId, setLicencaId] = useState(item.licencaId || '');
  const [estoqueId, setEstoqueId] = useState(() => (acessoriosEmEstoque.find(casaEstoque)?.id ?? ''));
  const [qtd, setQtd] = useState('1');
  const [linhaId, setLinhaId] = useState('');
  const [destino, setDestino] = useState<DestinoRecurso | ''>(sugestaoDestino ? 'transferir' : '');
  const [destinoColab, setDestinoColab] = useState(sugestaoDestino || '');
  const [destinoLinha, setDestinoLinha] = useState<'estoque' | 'transferir' | 'cancelar'>('estoque');
  const [cadastrando, setCadastrando] = useState(false);
  const [novoAtivo, setNovoAtivo] = useState(false);
  // Fase 11: passo sem equipamento disponível → pedido de compra já preenchido
  const { pedidos, podePedirCompra } = useCompras();
  const [pedindo, setPedindo] = useState<PedidoCompra | null>(null);
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);
  const pedidoDoItem = pedidos.find((p) => p.processoItemId === item.id && p.status !== 'cancelado');
  const chegouDoPedido = (a: Asset) => !!pedidoDoItem && a.pedidoId === pedidoDoItem.id;
  const pedirCompra = () =>
    setPedindo(
      pedidoVazio({
        titulo: `${item.titulo} para ${colab?.nome || ob?.nomeColaborador || 'nova admissão'}`,
        justificativa: `Admissão ${ticket.codigo}${ob?.dataAdmissao ? ` em ${formatDate(ob.dataAdmissao)}` : ''}: não há equipamento disponível no estoque.`,
        area: '',
        chamadoId: ticket.id,
        processoItemId: item.id,
        colaboradorDestinoId: colab?.id,
        necessarioEm: ob?.dataAdmissao,
        itens: [{ id: `pit-${crypto.randomUUID()}`, tipo: 'equipamento', descricao: item.titulo, categoriaAtivo: categoriaDoNome(item.titulo), quantidade: 1, ordem: 1 }],
      })
    );
  const [novoAcessorio, setNovoAcessorio] = useState(false);
  const [agendando, setAgendando] = useState(false);

  const pendente = item.status === 'pendente';
  const editavel = podeEditar && pendente;

  const executar = async (fn: () => Promise<string | null | undefined>) => {
    setErro(null);
    setGravando(true);
    try {
      const falha = await fn();
      if (falha) setErro(falha);
    } finally {
      setGravando(false);
    }
  };

  const aposLigarPessoa = async (pessoaId: string, temLogin?: boolean) => {
    if (temLogin) return;
    const r = await criarLogin(pessoaId);
    onLogin(r);
  };

  // ---------------------------------------------------------------------------
  // Ação principal de cada tipo de passo
  // ---------------------------------------------------------------------------
  const acaoPrincipal = (): Promise<string | null | undefined> => {
    switch (item.tipo) {
      case 'tarefa':
      case 'termo':
        return registrar(item, 'feito');
      case 'conta':
      case 'grupo_email': {
        const valor = ident.trim() || (item.tipo === 'conta' ? colab?.email || ob?.emailColaborador || '' : '');
        if (!valor) return Promise.resolve(item.tipo === 'conta' ? 'Informe o login ou e-mail criado.' : 'Informe o e-mail do grupo.');
        return registrar(item, 'feito', { dados: { identificador: valor }, licencaContaId: licencaConta?.id });
      }
      case 'licenca':
        if (!licencaId) return Promise.resolve('Escolha a licença.');
        return registrar(item, 'feito', { dados: { licenca_id: licencaId } });
      case 'equipamento':
        return entregarEquipamento();
      case 'acessorio':
        return entregarAcessorio();
      case 'entregar_linha': {
        const l = linhas.find((x) => x.id === linhaId);
        if (!l) return Promise.resolve('Escolha a linha entregue.');
        return registrar(item, 'feito', { dados: { identificador: l.numero }, linha: { linhaId: l.id } });
      }
      case 'liberar_linha':
        return devolverLinha();
      case 'liberar_licenca':
        return liberarLicenca();
      case 'acesso_nexus':
        if (!colabId) return Promise.resolve('Faça primeiro o passo "Cadastrar colaborador".');
        return aposLigarPessoa(colabId).then(() => null);
      case 'encerrar_recurso':
        return encerraConta ? encerrarConta() : registrar(item, 'feito', { observacao: 'Devolvido' });
      case 'dados_drive':
      case 'email':
        return definirDestino();
      default:
        return Promise.resolve(null);
    }
  };

  const entregarEquipamento = async () => {
    const a = assets.find((x) => x.id === ativoId);
    if (!a) return 'Escolha o equipamento entregue.';
    let observacao: string | undefined;
    const aviso = colabId ? avisoSegundoAtivo(a, colabId, assets) : null;
    if (aviso) {
      const r = await confirmarMovimento({
        titulo: `Entregar ${a.tag} a ${colab?.nome || 'a pessoa'}`,
        item: `${a.tag} · ${a.nome}`,
        de: 'Estoque de T.I.',
        para: colab?.nome,
        efeitos: ['O equipamento fica com a pessoa a partir de hoje', 'Entra no termo de entrega deste processo'],
        justificativa: { aviso },
        confirmar: 'Registrar entrega',
      });
      if (!r) return null;
      observacao = `Justificativa do 2º item: ${r.justificativa}`;
    }
    return registrar(item, 'feito', { dados: { ativo_id: a.id, identificador: a.tag }, observacao });
  };

  const entregarAcessorio = async () => {
    const est = estoque.find((x) => x.id === estoqueId);
    const q = Math.max(1, Math.round(Number(qtd) || 1));
    if (est && est.quantidade < q) return `Estoque insuficiente: há ${est.quantidade} de ${est.nome}.`;
    let justificativa: string | undefined;
    const aviso = est && colabId ? avisoSegundoAcessorio(est, colabId, movimentos, estoque, q) : null;
    if (aviso && est) {
      const r = await confirmarMovimento({
        titulo: `Entregar ${q > 1 ? `${q} × ` : ''}${est.nome}`,
        de: `Estoque (${est.quantidade} un.)`,
        para: colab?.nome,
        efeitos: [`O saldo vai de ${est.quantidade} para ${est.quantidade - q}`, 'Aparece na ficha da pessoa e no termo deste processo'],
        justificativa: { aviso },
        confirmar: 'Registrar entrega',
      });
      if (!r) return null;
      justificativa = r.justificativa;
    }
    return registrar(item, 'feito', {
      dados: { identificador: est ? `${est.nome}${q > 1 ? ` × ${q}` : ''}` : ident.trim() || undefined },
      observacao: justificativa ? `Justificativa: ${justificativa}` : undefined,
      estoque: est ? { itemId: est.id, quantidade: q, justificativa } : undefined,
    });
  };

  const devolverLinha = async () => {
    if (destinoLinha === 'transferir' && !destinoColab) return 'Escolha quem fica com a linha.';
    const para = destinoLinha === 'transferir' ? nomeDe(destinoColab) : destinoLinha === 'cancelar' ? 'Linha cancelada' : 'Estoque (sem pessoa)';
    const r = await confirmarMovimento({
      titulo: 'Devolver ou cancelar a linha',
      item: `Linha ${linhaDoItem?.numero || item.identificador || ''}`,
      de: colab?.nome,
      para,
      efeitos: [destinoLinha === 'cancelar' ? 'A linha fica cancelada no Nexus e sai do custo recorrente' : `A linha passa para: ${para}`],
      foraDoNexus: ['Recolher o chip/aparelho', destinoLinha === 'cancelar' ? 'Pedir o cancelamento à operadora' : 'Avisar a operadora se mudar o titular'],
      confirmacoes: [{ texto: 'Pedi à operadora o que foi escolhido para a linha' }],
      confirmar: 'Registrar',
      perigo: destinoLinha === 'cancelar',
    });
    if (!r) return null;
    return registrar(item, 'feito', { observacao: `Linha: ${para}`, linha: { destino: destinoLinha, para: destinoColab || undefined } });
  };

  const liberarLicenca = async () => {
    const lic = licenses.find((l) => l.id === item.licencaId);
    const r = await confirmarMovimento({
      titulo: `Liberar o assento de ${colab?.nome || 'a pessoa'}`,
      item: lic?.nome || item.titulo,
      de: colab?.nome,
      para: 'Saldo livre da licença',
      efeitos: ['O assento volta ao saldo livre na hora', 'A saída fica no histórico de assentos'],
      confirmacoes: [
        {
          texto: `Removi o acesso de ${primeiroNome} a ${lic?.nome || item.titulo} no painel do fornecedor`,
          link: lic?.urlPainel ? { url: lic.urlPainel, rotulo: `Abrir o painel de ${lic.nome}` } : undefined,
        },
      ],
      confirmar: 'Liberar assento',
      perigo: true,
    });
    if (!r) return null;
    return registrar(item, 'feito', { observacao: 'Acesso removido no painel do fornecedor (desligamento)' });
  };

  const encerrarConta = async () => {
    if (!destino) return 'Escolha o destino da conta.';
    if (destino === 'transferir' && !destinoColab) return 'Escolha quem recebe.';
    let observacao: string | undefined = destino === 'transferir' ? `Transferido para ${nomeDe(destinoColab)}` : undefined;
    if (destino === 'outro') {
      const t = await pedirTexto({ titulo: `O que foi feito com ${item.titulo}?`, rotulo: 'Descreva', minimo: 3, confirmar: 'Continuar' });
      if (!t) return null;
      observacao = t;
    }
    const lic = recurso ? licencaDaConta(recurso.nome, licenses) : undefined;
    const r = await confirmarMovimento({
      titulo: `Encerrar a conta ${item.titulo}`,
      item: recurso?.identificador,
      de: colab?.nome,
      para: destino === 'transferir' ? `Transferida para ${nomeDe(destinoColab)}` : ROTULO_DESTINO[destino],
      efeitos: ['A conta sai do inventário da pessoa no Nexus'],
      confirmacoes: [
        {
          texto: `Desativei a conta ${item.titulo}${recurso?.identificador ? ` (${recurso.identificador})` : ''} no sistema de origem`,
          link: lic?.urlPainel ? { url: lic.urlPainel, rotulo: `Abrir o painel de ${lic.nome}` } : undefined,
        },
      ],
      confirmar: 'Registrar',
      perigo: destino === 'excluir',
    });
    if (!r) return null;
    return registrar(item, 'feito', { dados: { destino, destino_colaborador_id: destino === 'transferir' ? destinoColab : undefined }, observacao });
  };

  const definirDestino = async () => {
    if (!destino) return 'Escolha o destino.';
    if (destino === 'transferir' && !destinoColab) return 'Escolha quem recebe.';
    let observacao: string | undefined = destino === 'transferir' ? `Transferido para ${nomeDe(destinoColab)}` : undefined;
    if (destino === 'outro') {
      const t = await pedirTexto({ titulo: 'Descreva o que foi feito', rotulo: 'O que foi feito', minimo: 3, confirmar: 'Registrar' });
      if (!t) return null;
      observacao = t;
    }
    return registrar(item, 'feito', { dados: { destino, destino_colaborador_id: destino === 'transferir' ? destinoColab : undefined }, observacao });
  };

  const devolverEquipamento = (condicao: 'bom' | 'avaria') =>
    executar(async () => {
      let observacao: string | undefined;
      if (condicao === 'avaria') {
        const t = await pedirTexto({ titulo: 'Descrever a avaria', mensagem: 'O equipamento volta como "em manutenção".', rotulo: 'O que foi encontrado', minimo: 5, confirmar: 'Registrar' });
        if (!t) return null;
        observacao = t;
      }
      return registrar(item, 'feito', { dados: { condicao }, observacao });
    });

  const naoSeAplica = () =>
    executar(async () => {
      const motivo = await pedirTexto({ titulo: `"${item.titulo}" não se aplica?`, mensagem: 'O passo fica riscado no checklist, com o motivo. Dá para voltar para pendente depois.', rotulo: 'Motivo', minimo: 3, confirmar: 'Marcar' });
      if (!motivo) return null;
      return registrar(item, 'nao_se_aplica', { observacao: motivo });
    });

  const remover = () =>
    executar(async () => {
      if (!(await confirmar({ titulo: `Remover o passo "${item.titulo}"?`, mensagem: 'O passo sai do checklist (fica no histórico do processo). Dá para incluir de novo em "Adicionar passos".', confirmar: 'Remover', perigo: true }))) return null;
      return (await removerItemProcesso(item.id)) ? null : 'Não foi possível remover o passo.';
    });

  // ---------------------------------------------------------------------------
  // Exibição
  // ---------------------------------------------------------------------------
  const icone =
    item.status === 'feito' ? (
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Feito" />
    ) : item.status === 'nao_se_aplica' ? (
      <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-label="Não se aplica" />
    ) : (
      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-label="Pendente" />
    );
  const cadastrada = item.tipo === 'cadastro' ? employees.find((e) => e.id === ticket.colaboradorId) : undefined;
  const registro = [
    item.identificador,
    item.destino ? `destino: ${ROTULO_DESTINO[item.destino]?.toLowerCase() || item.destino}` : undefined,
    item.destinoColaboradorId ? `para ${nomeDe(item.destinoColaboradorId)}` : undefined,
    item.condicao ? `condição: ${item.condicao === 'bom' ? 'bom' : 'com avaria'}` : undefined,
  ].filter(Boolean);
  const dias = item.lembreteEm ? diasAte(item.lembreteEm) : undefined;
  const seloAgenda =
    pendente && item.lembreteEm ? (
      <span className={`selo ${dias !== undefined && dias < 0 ? 'selo-problema' : dias === 0 ? 'selo-atencao' : 'selo-info'}`}>
        <CalendarClock aria-hidden="true" />
        {dias !== undefined && dias < 0 ? `Atrasado (era ${dataCurta(item.lembreteEm)})` : dias === 0 ? 'Agendado para hoje' : `Agendado para ${dataCurta(item.lembreteEm)}`}
      </span>
    ) : null;

  const campoSm = 'campo campo-sm';
  const botao = (rotulo: string, icone?: React.ReactNode, onClick: () => void = () => void executar(acaoPrincipal)) => (
    <button type="button" disabled={gravando} onClick={onClick} className="btn btn-sm btn-secundario">
      {icone}
      {gravando ? 'Registrando…' : rotulo}
    </button>
  );
  const selectPessoa = (valor: string, mudar: (v: string) => void, rotulo: string) => (
    <select aria-label={rotulo} value={valor} onChange={(e) => mudar(e.target.value)} className={`${campoSm} w-full sm:w-44`}>
      <option value="">{rotulo}…</option>
      {pessoas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </select>
  );

  /** Destino de conta, Drive ou caixa de e-mail (+ quem recebe) */
  const controlesDestino = () => (
    <>
      <select aria-label="Destino" value={destino} onChange={(e) => setDestino(e.target.value as DestinoRecurso | '')} className={`${campoSm} w-full sm:w-48`}>
        <option value="">{item.tipo === 'dados_drive' ? 'Destino dos arquivos…' : item.tipo === 'email' ? 'Destino da caixa…' : 'Destino da conta…'}</option>
        {(Object.keys(ROTULO_DESTINO) as DestinoRecurso[]).map((d) => (
          <option key={d} value={d}>
            {ROTULO_DESTINO[d]}
          </option>
        ))}
      </select>
      {destino === 'transferir' && selectPessoa(destinoColab, setDestinoColab, 'Quem recebe')}
      {botao('Registrar')}
    </>
  );

  /** Controles na linha (só passo pendente e quem pode editar) */
  const controles = (): React.ReactNode => {
    switch (item.tipo) {
      case 'cadastro':
        if (colabPorEmail?.status === 'ativo')
          return botao(`Ligar ${colabPorEmail.nome.split(' ')[0]} (cadastro já existe)`, <UserPlus />, () =>
            executar(async () => {
              const f = await registrar(item, 'feito', { dados: { colaborador_id: colabPorEmail.id }, observacao: 'Pessoa já cadastrada com o e-mail informado pelo RH', colaboradorId: colabPorEmail.id });
              if (f) return f;
              await aposLigarPessoa(colabPorEmail.id, colabPorEmail.temLogin);
              return null;
            })
          );
        if (ob && !colabPorEmail) return botao(`Cadastrar ${ob.nomeColaborador.split(' ')[0]}`, <UserPlus />, () => setCadastrando(true));
        return botao('Escolher a pessoa', undefined, onAbrir);
      case 'conta':
      case 'grupo_email':
        return (
          <>
            <input
              aria-label={item.tipo === 'conta' ? 'Login ou e-mail criado' : 'E-mail do grupo'}
              value={ident}
              onChange={(e) => setIdent(e.target.value)}
              placeholder={item.tipo === 'conta' ? colab?.email || ob?.emailColaborador || 'login criado' : 'grupo@empresa.com.br'}
              className={`${campoSm} w-full sm:w-52`}
            />
            {botao('Registrar')}
          </>
        );
      case 'licenca':
        return (
          <>
            <select aria-label="Licença" value={licencaId} onChange={(e) => setLicencaId(e.target.value)} className={`${campoSm} w-full sm:w-52`}>
              <option value="">Escolha a licença…</option>
              {licencasLivres.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} · {l.assentosTotais - l.assentosAlocados} livre(s)
                </option>
              ))}
            </select>
            {botao('Registrar')}
          </>
        );
      case 'equipamento':
        return (
          <>
            <select aria-label="Equipamento entregue" value={ativoId} onChange={(e) => setAtivoId(e.target.value)} className={`${campoSm} w-full sm:w-60`}>
              <option value="">{ativosLivres.length ? 'Escolha no estoque…' : 'Nada disponível no estoque'}</option>
              {[...ativosLivres]
                .sort((a, b) => (chegouDoPedido(a) ? 0 : 1) - (chegouDoPedido(b) ? 0 : 1))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag} · {a.nome}
                    {chegouDoPedido(a) ? ' · chegou do pedido' : ''}
                  </option>
                ))}
            </select>
            <button type="button" onClick={() => setNovoAtivo(true)} title="Cadastrar um equipamento novo aqui" aria-label="Cadastrar equipamento" className="btn-icone">
              <Plus />
            </button>
            {botao('Registrar')}
            {pedidoDoItem ? (
              <button type="button" onClick={() => setPedidoAberto(pedidoDoItem.id)} title="Abrir o pedido de compra deste passo" className="btn btn-sm btn-secundario">
                <ShoppingCart /> {pedidoDoItem.codigo} · {ROTULO_STATUS_PEDIDO[pedidoDoItem.status]}
              </button>
            ) : (
              podePedirCompra && (
                <button
                  type="button"
                  onClick={pedirCompra}
                  title="Abrir um pedido de compra já preenchido para este passo"
                  className={`btn btn-sm ${ativosLivres.length ? 'btn-secundario' : 'btn-primario'}`}
                >
                  <ShoppingCart /> Pedir compra
                </button>
              )
            )}
          </>
        );
      case 'acessorio':
        return (
          <>
            <select aria-label="Sai do estoque" value={estoqueId} onChange={(e) => setEstoqueId(e.target.value)} className={`${campoSm} w-full sm:w-52`}>
              <option value="">Sem baixa no estoque</option>
              {acessoriosEmEstoque.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome} · {i.quantidade} em estoque
                </option>
              ))}
            </select>
            {estoqueId && (
              <input aria-label="Quantidade" type="number" min={1} step={1} value={qtd} onChange={(e) => setQtd(e.target.value)} className={`${campoSm} w-16`} />
            )}
            <button type="button" onClick={() => setNovoAcessorio(true)} title="Cadastrar o acessório no estoque aqui" aria-label="Cadastrar acessório" className="btn-icone">
              <Plus />
            </button>
            {botao('Registrar')}
          </>
        );
      case 'entregar_linha':
        return (
          <>
            <select aria-label="Linha" value={linhaId} onChange={(e) => setLinhaId(e.target.value)} className={`${campoSm} w-full sm:w-52`}>
              <option value="">{linhasLivres.length ? 'Escolha a linha…' : 'Nenhuma linha livre'}</option>
              {linhasLivres.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.numero}
                  {l.plano ? ` · ${l.plano}` : ''}
                </option>
              ))}
            </select>
            {botao('Registrar')}
          </>
        );
      case 'liberar_linha':
        return (
          <>
            <select aria-label="O que fazer com a linha" value={destinoLinha} onChange={(e) => setDestinoLinha(e.target.value as typeof destinoLinha)} className={`${campoSm} w-full sm:w-48`}>
              <option value="estoque">Devolver ao estoque</option>
              <option value="transferir">Passar para outra pessoa</option>
              <option value="cancelar">Cancelar a linha</option>
            </select>
            {destinoLinha === 'transferir' && selectPessoa(destinoColab, setDestinoColab, 'Quem fica com a linha')}
            {botao('Registrar')}
          </>
        );
      case 'liberar_licenca':
        return botao('Liberar assento');
      case 'encerrar_recurso':
        return encerraConta ? controlesDestino() : botao('Devolvido', <Check />);
      case 'dados_drive':
      case 'email':
        return controlesDestino();
      case 'devolver_equipamento':
        return (
          <>
            {botao('Devolvido em bom estado', <Check />, () => devolverEquipamento('bom'))}
            <button type="button" disabled={gravando} onClick={() => devolverEquipamento('avaria')} className="btn btn-sm btn-secundario">
              Com avaria
            </button>
          </>
        );
      case 'acesso_nexus':
        return botao(colab ? 'Criar login e mostrar a senha' : 'Criar login', <KeyRound />);
      case 'termo':
        return (
          <>
            {termo && (
              <button type="button" onClick={() => setSelectedTermForPrint(termo)} className="btn btn-sm btn-secundario">
                Abrir termo
              </button>
            )}
            {termoOk ? botao('Registrar') : botao(termo ? 'Substituir ou conferir' : 'Conferir e gerar', undefined, onAbrir)}
          </>
        );
      case 'tarefa':
      default:
        return botao('Feito', <Check />);
    }
  };

  return (
    <div className={`rounded-lg border bg-white text-xs ${seloAgenda && dias !== undefined && dias <= 0 ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-2 p-2.5">
        {icone}
        <div className="min-w-[11rem] flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">{ACAO_DO_TIPO[item.tipo]}</span>
            {item.sugeridoPor === 'rh' && <span className="selo selo-info">pedido do RH</span>}
            {seloAgenda}
          </span>
          <span className={`block font-medium ${item.status === 'nao_se_aplica' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{item.titulo}</span>
          {item.tipo === 'cadastro' && item.status === 'feito' && cadastrada ? (
            <span className="block text-slate-500">
              {cadastrada.nome} · {cadastrada.email}
            </span>
          ) : (
            item.detalhe && <span className="block text-slate-500">{item.detalhe}</span>
          )}
          {item.tipo === 'conta' && pendente && licencaConta && (
            <span className="block text-slate-500">
              {colabId && licencaConta.colaboradoresIds.includes(colabId)
                ? `${primeiroNome} já tem a licença ${licencaConta.nome}.`
                : assentosLivres(licencaConta) > 0
                  ? `Ao registrar, ocupa 1 assento de ${licencaConta.nome} (${licencaConta.assentosAlocados}/${licencaConta.assentosTotais} em uso).`
                  : `${licencaConta.nome} está sem assento livre: atribua depois, na ficha do software.`}
            </span>
          )}
          {item.status !== 'pendente' && (
            <span className="mt-0.5 block text-slate-500">
              {registro.length > 0 && <>{registro.join(' · ')} · </>}
              {item.observacao && <>“{item.observacao}” · </>}
              {nomeDe(item.concluidoPor) !== '—' ? nomeDe(item.concluidoPor) : 'T.I.'}
              {item.concluidoEm ? ` em ${formatDateTime(item.concluidoEm)}` : ''}
            </span>
          )}
          {pendente && item.lembreteEm && item.observacao && <span className="block text-slate-500">“{item.observacao}”</span>}
        </div>

        {editavel && !aberto && (
          <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
            {controles()}
            <MenuAcoes
              rotulo={`Mais ações do passo ${item.titulo}`}
              acoes={[
                { rotulo: 'Mais opções (observação, lembrete)', icone: <SlidersHorizontal />, onClick: onAbrir },
                { rotulo: item.lembreteEm ? 'Reagendar' : 'Agendar…', icone: <CalendarClock />, onClick: () => setAgendando(true) },
                { rotulo: 'Não se aplica…', icone: <Ban />, onClick: naoSeAplica },
                { rotulo: 'Remover passo', icone: <Trash2 />, perigo: true, onClick: remover },
              ]}
            />
          </div>
        )}
        {podeEditar && !pendente && podeReabrir(item) && (
          <button
            type="button"
            onClick={() => executar(() => registrar(item, 'pendente'))}
            title="Voltar para pendente"
            aria-label={`Voltar o passo ${item.titulo} para pendente`}
            className="btn-icone"
          >
            <RotateCcw />
          </button>
        )}
      </div>
      {erro && (
        <p role="alert" className="erro px-2.5 pb-2.5">
          {erro}
        </p>
      )}
      {aberto && <FormItemProcesso item={item} ticket={ticket} onFechar={onFechar} onLogin={onLogin} />}

      {cadastrando && ob && (
        <NewEmployeeModal
          inicial={{
            nome: ob.nomeColaborador,
            email: ob.emailColaborador,
            cargo: ob.cargo,
            setorId: ob.setorId,
            gestorId: ob.gestorId,
            dataAdmissao: ob.dataAdmissao,
            // Só o admin de T.I. dá papel acima de colaborador (mesma regra do banco)
            papel: currentRole === 'ti_admin' ? ob.papelAcessoSugerido || 'colaborador' : 'colaborador',
          }}
          onCriado={async (id) => {
            await executar(async () => {
              const f = await registrar(item, 'feito', { dados: { colaborador_id: id }, observacao: 'Cadastro criado a partir do pedido do RH', colaboradorId: id });
              if (f) return f;
              // Login automático: a senha provisória aparece já, sem o passo extra
              await aposLigarPessoa(id);
              return null;
            });
          }}
          onClose={() => setCadastrando(false)}
        />
      )}
      {novoAtivo && (
        <NewAssetModal
          inicial={{ nome: item.titulo, categoria: categoriaDoNome(item.titulo) }}
          onCriado={(a: Asset) => {
            setAtivoId(a.id);
            setNovoAtivo(false);
          }}
          onClose={() => setNovoAtivo(false)}
        />
      )}
      {novoAcessorio && (
        <CadastroRapidoAcessorio
          nome={item.titulo}
          tipo={tipoAcessorio}
          onCriado={(id) => {
            setEstoqueId(id);
            setNovoAcessorio(false);
          }}
          onFechar={() => setNovoAcessorio(false)}
        />
      )}
      {agendando && <JanelaAgendar item={item} onFechar={() => setAgendando(false)} />}
      {pedindo && (
        <FormPedido
          inicial={pedindo}
          simples={currentRole !== 'ti_admin' && currentRole !== 'ti_suporte'}
          onClose={() => setPedindo(null)}
          onSalvo={(p) => setPedidoAberto(p.id)}
        />
      )}
      {pedidoAberto && <FichaPedido pedidoId={pedidoAberto} onClose={() => setPedidoAberto(null)} />}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Agendar um passo (data + observação); reagendar cancela o lembrete anterior
// -----------------------------------------------------------------------------
const JanelaAgendar: React.FC<{ item: ProcessoItem; onFechar: () => void }> = ({ item, onFechar }) => {
  const { agendarPasso } = useApp();
  const [data, setData] = useState(item.lembreteEm || '');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const salvar = async (nova: string | null) => {
    if (nova !== null && !nova) return setErro('Escolha a data.');
    setGravando(true);
    const f = await agendarPasso(item.id, nova, obs.trim() || undefined);
    setGravando(false);
    if (f) return setErro(f);
    onFechar();
  };
  return (
    <Janela
      tamanho="p"
      icone={<CalendarClock className="h-4 w-4" />}
      titulo={item.lembreteEm ? 'Reagendar passo' : 'Agendar passo'}
      subtitulo={`${ACAO_DO_TIPO[item.tipo]}: ${item.titulo}`}
      onFechar={onFechar}
      idTitulo="janela-agendar"
      rodape={
        <>
          {item.lembreteEm ? (
            <button type="button" disabled={gravando} onClick={() => salvar(null)} className="btn btn-perigo">
              Tirar agendamento
            </button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button type="button" onClick={onFechar} className="btn btn-secundario">
              Cancelar
            </button>
            <button type="button" disabled={gravando} onClick={() => salvar(data)} className="btn btn-primario">
              {gravando ? 'Salvando…' : 'Agendar'}
            </button>
          </span>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-600">
          O passo continua pendente e aparece como "Agendado para…". No dia, entra no Precisa de atenção e nos Lembretes.
          {item.lembreteEm ? ` Hoje está marcado para ${formatDate(item.lembreteEm)}.` : ''}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="agenda-data" className="rotulo">
              Data *
            </label>
            <input id="agenda-data" type="date" min={isoLocal(new Date())} value={data} onChange={(e) => setData(e.target.value)} className="campo" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="agenda-obs" className="rotulo">
              Observação
            </label>
            <input id="agenda-obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: entregar no 1º dia, na recepção" className="campo" />
          </div>
        </div>
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
      </div>
    </Janela>
  );
};

// -----------------------------------------------------------------------------
// Cadastro rápido de acessório no estoque, sem sair do passo
// -----------------------------------------------------------------------------
const CadastroRapidoAcessorio: React.FC<{ nome: string; tipo: TipoAcessorio; onCriado: (id: string) => void; onFechar: () => void }> = ({ nome, tipo, onCriado, onFechar }) => {
  const { salvarItemEstoque } = useRecursos();
  const [d, setD] = useState({ nome, tipo, marca: '', quantidade: '1', valor: undefined as number | undefined });
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGravando(true);
    const r = await salvarItemEstoque({
      nome: d.nome.trim(),
      tipo: d.tipo,
      marca: d.marca.trim() || undefined,
      minimo: 0,
      ativo: true,
      valorUnitario: d.valor,
      quantidadeInicial: Math.max(0, Math.round(Number(d.quantidade) || 0)),
    });
    setGravando(false);
    if (r.item) return onCriado(r.item.id);
    setErro(r.erro || 'Não foi possível cadastrar.');
  };
  return (
    <Janela
      tamanho="p"
      icone={<Package className="h-4 w-4" />}
      titulo="Cadastrar acessório no estoque"
      subtitulo="Item controlado por quantidade (sem patrimônio)"
      onFechar={onFechar}
      idTitulo="janela-acessorio-rapido"
      rodape={
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={onFechar} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="submit" form="form-acessorio-rapido" disabled={gravando} className="btn btn-primario">
            {gravando ? 'Salvando…' : 'Cadastrar e usar'}
          </button>
        </span>
      }
    >
      <form id="form-acessorio-rapido" onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="ar-nome" className="rotulo">
            Nome *
          </label>
          <input id="ar-nome" required value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} className="campo" />
        </div>
        <div>
          <label htmlFor="ar-tipo" className="rotulo">
            Tipo
          </label>
          <select id="ar-tipo" value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as TipoAcessorio })} className="campo">
            {(Object.keys(ROTULO_TIPO_ACESSORIO) as TipoAcessorio[]).map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_ACESSORIO[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ar-marca" className="rotulo">
            Marca
          </label>
          <CampoSugestoes id="ar-marca" value={d.marca} onChange={(v) => setD({ ...d, marca: v })} sugestoes={FABRICANTES.acessorio} />
        </div>
        <div>
          <label htmlFor="ar-qtd" className="rotulo">
            Quantidade que entra agora
          </label>
          <input id="ar-qtd" type="number" min={0} step={1} value={d.quantidade} onChange={(e) => setD({ ...d, quantidade: e.target.value })} className="campo" />
        </div>
        <div>
          <label htmlFor="ar-valor" className="rotulo">
            Valor unitário
          </label>
          <CampoMoeda id="ar-valor" valor={d.valor} onMudar={(v) => setD({ ...d, valor: v })} />
        </div>
        {erro && (
          <p role="alert" className="erro sm:col-span-2">
            {erro}
          </p>
        )}
      </form>
    </Janela>
  );
};

/** Diz o que aconteceu com o login (senha, demonstração ou erro) */
export function avisoDoLogin(r: ResultadoLogin): Promise<void> | null {
  if ('demo' in r) {
    return avisar({
      titulo: 'Na demonstração o login não é criado',
      mensagem: 'Sem banco não há contas de acesso. Em produção, a senha provisória aparece aqui na hora, para copiar, e o passo "Acesso ao Nexus" conclui sozinho.',
    });
  }
  if ('erro' in r) return avisar({ titulo: 'O login não foi criado', mensagem: `${r.erro}\n\nUse o passo "Acesso ao Nexus" para tentar de novo.` });
  return null;
}
