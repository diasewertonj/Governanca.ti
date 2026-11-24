import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Paperclip, Pencil, Plus, Receipt, RotateCcw, Trash2, Upload, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { Asset, CategoriaDespesa, Fatura, PeriodicidadeContrato, StatusFatura } from '../../types/index.ts';
import type { FichaAberta } from '../../utils/fichas.ts';
import { LIMITE_CAPITALIZACAO_PADRAO, naturezaDoLancamento } from '../../utils/gestaoFinanceira.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { TIPOS_ARQUIVO_ACEITOS, linkTemporarioDb, mensagemDeErro, validarArquivo } from '../../services/supabaseDb.ts';
import { formatCurrency, formatDate, isoLocal } from '../../utils/formatters.ts';
import { normalizar } from '../../utils/processos.ts';
import {
  ROTULO_STATUS_FATURA,
  competenciaDe,
  faturasDoAlvo,
  opcoesCompetencia,
  proximaCompetencia,
  rotuloCompetencia,
  statusExibido,
  totalPagoNoAno,
  validarFatura,
  vencimentoSugerido,
  type AlvoFatura,
  type StatusExibidoFatura,
} from '../../utils/faturas.ts';
import { CLASSE_ARQUIVO, CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { nomeContrato } from '../../utils/contratos.ts';
import { formaCobrancaDe, ROTULO_CATEGORIA, ROTULO_FORMA_PAGAMENTO, valorEfetivo } from '../../utils/financeiro.ts';
import { confirmar, pedirTexto } from '../ui/dialogo.tsx';
import { CampoMoeda } from '../ui/Campos.tsx';
import { Janela } from '../ui/Janela.tsx';
import { MenuAcoes } from '../ui/MenuAcoes.tsx';
import { Vazio } from '../ui/Tela.tsx';

interface FaturasSecaoProps {
  /** Licença OU contrato dono das faturas. Sem alvo = Contas a pagar (todas, com filtros) */
  alvo?: AlvoFatura;
  /** Cobrança anual sugere a competência do ano seguinte */
  periodicidade?: PeriodicidadeContrato;
  /** Valor cadastrado (licença: valor mensal; contrato: valor), sugerido na fatura nova */
  valorPadrao?: number;
  /** Seção 6 (Contas a pagar): lista já filtrada pela tela */
  listaGlobal?: Fatura[];
  /** Lote 1 (L2): quando informado, não deixa lançar fatura aqui e explica onde lançar */
  bloqueioLancamento?: string;
  /** Seção 17: nome da origem calculado pela tela (Compras usa o resumo de contratos) */
  nomeOrigem?: (f: Fatura) => string;
  /** Seção 21: fornecedor da fatura calculado pela tela (Compras usa o resumo de contratos) */
  fornecedorDe?: (f: Fatura) => string | undefined;
}

/** Seção 21: moeda estrangeira em uma linha só ("US$ 780,00 · R$ 4.300,00") */
const textoValor = (f: Fatura) => {
  const reais = formatCurrency(valorEfetivo(f));
  return f.moeda && f.moeda !== 'BRL' && f.valorMoeda != null ? `${formatCurrency(f.valorMoeda, f.moeda)} · ${reais}` : reais;
};

/** Seção 21: clipe que abre o arquivo da fatura (só aparece quando há arquivo) */
const BotaoArquivo: React.FC<{ caminho: string; rotulo: string; onErro: (msg: string) => void }> = ({ caminho, rotulo, onErro }) => (
  <button
    type="button"
    title={rotulo}
    aria-label={rotulo}
    className="btn-icone"
    onClick={async () => {
      onErro('');
      try {
        window.open(await linkTemporarioDb(caminho), '_blank', 'noopener');
      } catch (err) {
        onErro(`Não foi possível abrir o arquivo: ${mensagemDeErro(err)}`);
      }
    }}
  >
    <Paperclip aria-hidden="true" />
  </button>
);

/** Selo de situação da fatura (padrão único: ok / atenção / problema / neutro) */
const SELO_STATUS: Record<StatusExibidoFatura, string> = {
  vencida: 'selo-problema',
  a_pagar: 'selo-atencao',
  paga: 'selo-ok',
  cancelada: 'selo-neutro',
};

/**
 * Fase 8: faturas de uma licença ou de um contrato (só a T.I.). Lista por
 * competência, total pago no ano, "Lançar fatura" (janela já preenchida com a
 * próxima competência e o valor cadastrado), "Pagar" e "Cancelar fatura".
 * Excluir só para ti_admin. Nada grava sem o clique no botão.
 */
export const FaturasSecao: React.FC<FaturasSecaoProps> = ({ alvo, periodicidade = 'mensal', valorPadrao = 0, bloqueioLancamento, listaGlobal, nomeOrigem, fornecedorDe }) => {
  const { faturas, currentRole, cancelarFatura, excluirFatura, desfazerPagamento, contratos, licenses, fornecedores, assets, abrirFicha } = useApp();
  const [editando, setEditando] = useState<Fatura | null>(null);
  const [lancando, setLancando] = useState(false);
  // Pagamento: janela própria (data, forma, valor pago, comprovante), nunca só a data
  const [pagando, setPagando] = useState<Fatura | null>(null);
  // Arquivo de uma fatura já lançada sem arquivo: janela própria, só sobe ao clicar em "Enviar"
  const [anexando, setAnexando] = useState<Fatura | null>(null);
  // Seção 21: pagamento em lote (Contas a pagar)
  const [selecao, setSelecao] = useState<Set<string>>(() => new Set());
  const [pagandoLote, setPagandoLote] = useState(false);
  const [erro, setErro] = useState('');
  const { pedidos: pedidosCompra } = useCompras();

  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  // Seção 13: Compras vê e paga as faturas dos pedidos (a RLS só entrega essas)
  if (!isTI && currentRole !== 'compras') return null;

  const lista = alvo ? faturasDoAlvo(faturas, alvo) : listaGlobal || faturas;
  const origem = (f: Fatura) => {
    if (nomeOrigem) return nomeOrigem(f);
    if (f.pedidoId) {
      const p = pedidosCompra.find((x) => x.id === f.pedidoId);
      return p ? `Pedido ${p.codigo}` : 'Pedido de compra';
    }
    if (f.contratoId) {
      const c = contratos.find((x) => x.id === f.contratoId);
      return c ? nomeContrato(c) : 'Contrato';
    }
    if (ehAvulsa(f)) return f.descricao || 'Conta avulsa';
    return licenses.find((l) => l.id === f.licencaId)?.nome || 'Licença';
  };
  // Decisão 2: suporte lança e confere, mas não paga (o banco também recusa)
  const podePagar = currentRole === 'ti_admin' || currentRole === 'compras';
  const desfazer = async (f: Fatura) => {
    const motivo = await pedirTexto({
      titulo: `Desfazer o pagamento da fatura de ${rotuloCompetencia(f.competencia)}?`,
      mensagem:
        'Ela volta para "a pagar", sem a data de pagamento, e sai do realizado em Despesas. O motivo fica registrado na fatura. Dá para desfazer: marque como paga de novo.',
      rotulo: 'Motivo',
      minimo: 5,
      confirmar: 'Desfazer pagamento',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (motivo === null) return;
    const falha = await desfazerPagamento(f.id, motivo);
    setErro(falha ? `Não foi possível desfazer: ${falha}` : '');
  };
  const agora = new Date();
  const ano = agora.getFullYear();

  // Forma de pagamento já cadastrada no contrato ou no software (sugestão na janela)
  const formaCadastrada = (f: Fatura) =>
    (f.contratoId ? contratos.find((c) => c.id === f.contratoId)?.pagamento : licenses.find((l) => l.id === f.licencaId)?.pagamento) || undefined;

  // Seção 21: fornecedor da fatura (a tela pode calcular; senão, pelo pedido, contrato ou licença)
  const fornecedorDaFatura = (f: Fatura): string | undefined =>
    fornecedorDe
      ? fornecedorDe(f)
      : f.fornecedorId ||
        (f.pedidoId
          ? pedidosCompra.find((p) => p.id === f.pedidoId)?.fornecedorId
          : f.contratoId
            ? contratos.find((c) => c.id === f.contratoId)?.fornecedorId
            : licenses.find((l) => l.id === f.licencaId)?.fornecedorId);

  // Pagar rápido: a forma da própria fatura; senão a última usada com o mesmo fornecedor
  // (ou com a mesma origem); senão a cadastrada no contrato ou no software
  const formaSugerida = (f: Fatura): Fatura['formaPagamento'] => {
    if (f.formaPagamento) return f.formaPagamento;
    const forn = fornecedorDaFatura(f);
    const pagas = faturas
      .filter((x) => x.id !== f.id && x.status === 'paga' && x.formaPagamento)
      .sort((a, b) => (b.pagoEm || '').localeCompare(a.pagoEm || ''));
    const doFornecedor = forn ? pagas.find((x) => fornecedorDaFatura(x) === forn) : undefined;
    const daOrigem = pagas.find((x) => (f.contratoId && x.contratoId === f.contratoId) || (f.licencaId && x.licencaId === f.licencaId));
    return doFornecedor?.formaPagamento || daOrigem?.formaPagamento || formaCadastrada(f)?.formaPagamento;
  };

  // Seção 21 (tudo leva ao item): a origem abre a ficha do contrato, do software, do pedido ou do equipamento
  const fichaDaOrigem = (f: Fatura): FichaAberta | undefined => {
    if (f.pedidoId) return pedidosCompra.some((p) => p.id === f.pedidoId) ? { tipo: 'pedido', id: f.pedidoId } : undefined;
    if (f.contratoId) return contratos.some((c) => c.id === f.contratoId) ? { tipo: 'contrato', id: f.contratoId } : undefined;
    if (f.licencaId) return licenses.some((l) => l.id === f.licencaId) ? { tipo: 'software', id: f.licencaId } : undefined;
    if (f.ativoId && assets.some((a) => a.id === f.ativoId)) return { tipo: 'ativo', id: f.ativoId };
    return undefined;
  };

  // A linha abre a edição da fatura (a ação principal que existe hoje), quando a pessoa pode editar
  const podeEditar = (f: Fatura) => f.status === 'a_pagar' && !f.pedidoId && isTI;
  const abrirEdicao = (f: Fatura) => {
    setLancando(false);
    setEditando(f);
  };

  // Pagamento em lote: só em Contas a pagar, para quem pode pagar; vale só o que está na lista e em aberto
  const emLote = !alvo && podePagar;
  const abertas = lista.filter((f) => f.status === 'a_pagar');
  const selecionadas = abertas.filter((f) => selecao.has(f.id));
  const totalSelecionado = selecionadas.reduce((s, f) => s + valorEfetivo(f), 0);
  const todasMarcadas = abertas.length > 0 && selecionadas.length === abertas.length;
  const marcar = (id: string, sim: boolean) =>
    setSelecao((antes) => {
      const nova = new Set(antes);
      if (sim) nova.add(id);
      else nova.delete(id);
      return nova;
    });
  const formasSelecionadas = new Set(selecionadas.map(formaSugerida));
  const temDocumento = lista.some((f) => f.numeroDocumento);

  const cancelar = async (f: Fatura) => {
    const ok = await confirmar({
      titulo: `Cancelar a fatura de ${rotuloCompetencia(f.competencia)}?`,
      mensagem: 'Ela sai do total a pagar e fica no histórico como cancelada. Não dá para desfazer: lance outra se precisar.',
      confirmar: 'Cancelar fatura',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (!ok) return;
    const falha = await cancelarFatura(f.id);
    setErro(falha ? `Não foi possível cancelar: ${falha}` : '');
  };

  const excluir = async (f: Fatura) => {
    const ok = await confirmar({
      titulo: `Excluir a fatura de ${rotuloCompetencia(f.competencia)}?`,
      mensagem:
        `Ela é apagada e sai da lista e dos totais${f.arquivoCaminho ? ', junto com o arquivo anexado' : ''}. Não dá para desfazer.` +
        (f.status === 'a_pagar' ? ' Para só tirar do total a pagar e manter o registro, prefira Cancelar fatura.' : ''),
      confirmar: 'Excluir',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (ok) excluirFatura(f.id);
  };

  const alvoDaFatura = (f: Fatura): AlvoFatura | undefined =>
    f.contratoId ? { contratoId: f.contratoId } : f.licencaId ? { licencaId: f.licencaId } : undefined;
  const alvoEditando = editando ? alvoDaFatura(editando) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="secao-titulo inline-flex items-center gap-2">
          <Receipt className="ico-sm" aria-hidden="true" />
          Faturas ({lista.length})
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          {alvo && (
            <span className="texto-aux">
              Pago em {ano}: <span className="num font-semibold text-slate-900">{formatCurrency(totalPagoNoAno(lista, ano))}</span>
            </span>
          )}
          {!bloqueioLancamento && isTI && (
            <button
              type="button"
              onClick={() => {
                setEditando(null);
                setLancando(true);
              }}
              className="btn btn-sm btn-primario"
            >
              <Plus aria-hidden="true" /> Lançar fatura
            </button>
          )}
        </div>
      </div>

      {bloqueioLancamento && <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 texto-aux">{bloqueioLancamento}</p>}

      {lista.length === 0 ? (
        <Vazio>Nenhuma fatura lançada.</Vazio>
      ) : (
        <div className="cartao-tabela">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                {emLote && (
                  <th className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todas as faturas em aberto da lista"
                      title="Selecionar todas as faturas em aberto"
                      checked={todasMarcadas}
                      disabled={abertas.length === 0}
                      ref={(el) => {
                        if (el) el.indeterminate = selecionadas.length > 0 && !todasMarcadas;
                      }}
                      onChange={(e) => setSelecao(e.target.checked ? new Set(abertas.map((f) => f.id)) : new Set())}
                    />
                  </th>
                )}
                {!alvo && <th>Origem</th>}
                <th>Competência</th>
                <th className="num">Valor</th>
                <th>Vencimento</th>
                <th>Situação</th>
                {temDocumento && <th className="hidden xl:table-cell">Nº do documento</th>}
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => {
                const status = statusExibido(f, agora);
                const comp = rotuloCompetencia(f.competencia);
                const editavel = podeEditar(f);
                const ficha = !alvo ? fichaDaOrigem(f) : undefined;
                const fornId = !alvo ? fornecedorDaFatura(f) : undefined;
                const forn = fornId ? fornecedores.find((x) => x.id === fornId) : undefined;
                const nome = origem(f) || 'Conta avulsa';
                return (
                  <tr
                    key={f.id}
                    onClick={(e) => {
                      // Botões, links e caixas da linha fazem a própria ação
                      if (!editavel || (e.target as HTMLElement).closest('button, a, input, select, label, textarea')) return;
                      abrirEdicao(f);
                    }}
                    className={`${editavel ? 'cursor-pointer hover:bg-slate-50/70' : ''} ${status === 'cancelada' ? 'opacity-60' : ''}`}
                  >
                    {emLote && (
                      <td data-label="Selecionar">
                        {f.status === 'a_pagar' && (
                          <input
                            type="checkbox"
                            aria-label={`Selecionar a fatura ${nome} de ${comp}`}
                            checked={selecao.has(f.id)}
                            onChange={(e) => marcar(f.id, e.target.checked)}
                          />
                        )}
                      </td>
                    )}
                    {!alvo && (
                      <td data-label="Origem" className="min-w-64">
                        {ficha ? (
                          <button type="button" onClick={() => abrirFicha(ficha)} className="link text-left">
                            {nome}
                          </button>
                        ) : (
                          <span className="font-semibold text-slate-900">{nome}</span>
                        )}
                        {forn && (
                          <span className="block texto-aux">
                            <button type="button" onClick={() => abrirFicha({ tipo: 'fornecedor', id: forn.id })} className="link text-left">
                              {forn.nome}
                            </button>
                          </span>
                        )}
                      </td>
                    )}
                    <td data-label="Competência" className="font-semibold text-slate-900">
                      <span className="inline-flex items-center gap-1">
                        {comp}
                        {f.arquivoCaminho && <BotaoArquivo caminho={f.arquivoCaminho} rotulo={`Abrir o arquivo da fatura de ${comp}`} onErro={setErro} />}
                      </span>
                    </td>
                    <td data-label="Valor" className="num text-slate-800">
                      {textoValor(f)}
                      {f.formaPagamento && <span className="block font-sans text-slate-500">{ROTULO_FORMA_PAGAMENTO[f.formaPagamento]}</span>}
                    </td>
                    <td data-label="Vencimento">{formatDate(f.vencimento)}</td>
                    <td data-label="Situação">
                      <span className={`selo ${SELO_STATUS[status]}`}>
                        {status === 'vencida' && <AlertTriangle aria-hidden="true" />}
                        {status === 'paga' && <CheckCircle2 aria-hidden="true" />}
                        {ROTULO_STATUS_FATURA[status]}
                      </span>
                      {f.status === 'paga' && f.pagoEm && <span className="mt-0.5 block text-slate-500">em {formatDate(f.pagoEm)}</span>}
                    </td>
                    {temDocumento && (
                      <td data-label="Nº do documento" className="hidden font-mono break-all xl:table-cell">
                        {f.numeroDocumento || '—'}
                      </td>
                    )}
                    <td data-label="Ações" className="col-acoes">
                      <span className="acoes-linha">
                        {f.status === 'a_pagar' && podePagar && (
                          <button type="button" onClick={() => setPagando(f)} aria-label={`Pagar a fatura de ${comp}`} className="btn btn-sm btn-secundario mr-1">
                            <CheckCircle2 aria-hidden="true" /> Pagar
                          </button>
                        )}
                        <MenuAcoes
                          rotulo={`Mais ações da fatura de ${comp}`}
                          acoes={[
                            { rotulo: 'Editar fatura', icone: <Pencil aria-hidden="true" />, onClick: () => abrirEdicao(f), oculto: !editavel },
                            {
                              rotulo: 'Anexar arquivo',
                              icone: <Paperclip aria-hidden="true" />,
                              onClick: () => {
                                setErro('');
                                setAnexando(f);
                              },
                              oculto: !!f.arquivoCaminho,
                            },
                            {
                              rotulo: 'Desfazer pagamento',
                              icone: <RotateCcw aria-hidden="true" />,
                              onClick: () => void desfazer(f),
                              oculto: !(f.status === 'paga' && currentRole === 'ti_admin'),
                            },
                            {
                              rotulo: 'Cancelar fatura',
                              icone: <XCircle aria-hidden="true" />,
                              onClick: () => void cancelar(f),
                              oculto: !(f.status === 'a_pagar' && (isTI || currentRole === 'compras')),
                            },
                            {
                              rotulo: 'Excluir fatura',
                              icone: <Trash2 aria-hidden="true" />,
                              onClick: () => void excluir(f),
                              perigo: true,
                              oculto: !(currentRole === 'ti_admin' && !f.pedidoId),
                            },
                          ]}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Seção 21: barra fixa do pagamento em lote */}
      {emLote && selecionadas.length > 0 && (
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <span>
            <span className="num font-semibold text-slate-900">{selecionadas.length}</span> {selecionadas.length === 1 ? 'selecionada' : 'selecionadas'} · total{' '}
            <span className="num font-semibold text-slate-900">{formatCurrency(totalSelecionado)}</span>
          </span>
          <span className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelecao(new Set())} className="btn btn-sm btn-secundario">
              Limpar seleção
            </button>
            <button type="button" onClick={() => setPagandoLote(true)} className="btn btn-sm btn-primario">
              <CheckCircle2 aria-hidden="true" /> Registrar pagamento
            </button>
          </span>
        </div>
      )}

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {/* Lançar / editar em janela própria. Em portal: a seção pode estar dentro de uma ficha
          (janela com fundo desfocado), que prenderia a janela nova na rolagem dela. */}
      {editando
        ? createPortal(
            <FormFatura
              key={editando.id}
              alvo={alvoEditando}
              periodicidade={periodicidade}
              valorPadrao={editando.valor}
              doMesmoAlvo={alvoEditando ? faturasDoAlvo(faturas, alvoEditando) : []}
              editando={editando}
              onFechar={() => setEditando(null)}
            />,
            document.body
          )
        : lancando && !bloqueioLancamento
          ? createPortal(
              <FormFatura alvo={alvo} periodicidade={periodicidade} valorPadrao={valorPadrao} doMesmoAlvo={lista} onFechar={() => setLancando(false)} />,
              document.body
            )
          : null}
      {pagando &&
        createPortal(
          <JanelaPagamento
            fatura={pagando}
            origem={origem(pagando)}
            formaSugerida={formaSugerida(pagando)}
            cartaoFinal={formaCadastrada(pagando)?.cartaoFinal}
            onFechar={() => setPagando(null)}
            onPago={() => {
              setPagando(null);
              setErro('');
            }}
          />,
          document.body
        )}
      {pagandoLote &&
        selecionadas.length > 0 &&
        createPortal(
          <JanelaPagamentoLote
            faturas={selecionadas}
            nome={(f) => `${origem(f) || 'Conta avulsa'} · ${rotuloCompetencia(f.competencia)}`}
            formaSugerida={formasSelecionadas.size === 1 ? [...formasSelecionadas][0] : undefined}
            onFechar={() => setPagandoLote(false)}
            onPagas={(ids) => setSelecao((antes) => new Set([...antes].filter((id) => !ids.includes(id))))}
          />,
          document.body
        )}
      {anexando && createPortal(<JanelaAnexo fatura={anexando} onFechar={() => setAnexando(null)} />, document.body)}
    </div>
  );
};

/**
 * Seção 21: pagamento em lote. Uma janela (data e forma) registra cada fatura com o
 * mesmo `editarFatura` do pagamento individual, uma por vez; diz qual falhou.
 */
const JanelaPagamentoLote: React.FC<{
  faturas: Fatura[];
  nome: (f: Fatura) => string;
  formaSugerida?: Fatura['formaPagamento'];
  onFechar: () => void;
  onPagas: (ids: string[]) => void;
}> = ({ faturas, nome, formaSugerida, onFechar, onPagas }) => {
  const { editarFatura } = useApp();
  const [data, setData] = useState(() => isoLocal(new Date()));
  const [forma, setForma] = useState<string>(formaSugerida || '');
  const [erros, setErros] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const total = faturas.reduce((s, f) => s + valorEfetivo(f), 0);
  const id = 'pagamento-lote';

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (salvando) return;
    if (!data) return setErro('Informe a data do pagamento.');
    if (data > isoLocal(new Date())) return setErro('A data do pagamento não pode ser no futuro.');
    if (!forma) return setErro('Informe a forma de pagamento.');
    setErro('');
    setErros([]);
    setSalvando(true);
    const pagas: string[] = [];
    const falhas: string[] = [];
    for (const f of faturas) {
      const falha = await editarFatura(f.id, { status: 'paga', pagoEm: data, formaPagamento: forma as Fatura['formaPagamento'] });
      if (falha) falhas.push(`${nome(f)}: ${falha}`);
      else pagas.push(f.id);
    }
    setSalvando(false);
    onPagas(pagas);
    if (falhas.length === 0) return onFechar();
    setErros(falhas);
  };

  return (
    <Janela
      tamanho="p"
      titulo="Registrar pagamento"
      subtitulo={`${faturas.length} ${faturas.length === 1 ? 'fatura' : 'faturas'} · total ${formatCurrency(total)}`}
      icone={<CheckCircle2 className="ico" />}
      onFechar={onFechar}
      rodape={
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onFechar} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="submit" form={id} disabled={salvando} autoFocus={!!forma} className="btn btn-primario">
            {salvando ? 'Registrando…' : 'Confirmar'}
          </button>
        </div>
      }
    >
      <form id={id} onSubmit={registrar} className="space-y-3">
        <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {faturas.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">{nome(f)}</span>
              <span className="num shrink-0">{textoValor(f)}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-data`} className={CLASSE_ROTULO}>
              Data do pagamento *
            </label>
            <input id={`${id}-data`} type="date" required max={isoLocal(new Date())} value={data} onChange={(e) => setData(e.target.value)} className={CLASSE_CAMPO} />
          </div>
          <div>
            <label htmlFor={`${id}-forma`} className={CLASSE_ROTULO}>
              Forma de pagamento *
            </label>
            <select id={`${id}-forma`} required autoFocus={!forma} value={forma} onChange={(e) => setForma(e.target.value)} className={CLASSE_CAMPO}>
              <option value="">Escolha…</option>
              {Object.entries(ROTULO_FORMA_PAGAMENTO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="ajuda">Cada fatura é registrada pelo valor lançado. Juros, desconto ou comprovante: pague a fatura sozinha.</p>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        {erros.length > 0 && (
          <div className="erro" role="alert">
            <p>Estas não foram registradas (as demais foram):</p>
            <ul className="list-disc pl-4">
              {erros.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Janela>
  );
};

/** Seção 21: anexar o arquivo de uma fatura já lançada (sai da linha; vem do menu de ações) */
const JanelaAnexo: React.FC<{ fatura: Fatura; onFechar: () => void }> = ({ fatura, onFechar }) => {
  const { anexarArquivoFatura } = useApp();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  useRegistrarPendencias(`fatura-arquivo:${fatura.id}`, arquivo ? ['Arquivo da fatura não enviado'] : []);
  const id = `fatura-arq-${fatura.id}`;

  const escolher = (f: File | undefined) => {
    if (!f) return;
    const msg = validarArquivo(f);
    setErro(msg || '');
    setArquivo(msg ? null : f);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!arquivo || enviando) return;
    setEnviando(true);
    // Sobe para faturas/<id>/ e grava o caminho; se falhar, o aviso de erro explica
    const ok = await anexarArquivoFatura(fatura.id, arquivo);
    setEnviando(false);
    if (ok) onFechar();
    else setErro('Não foi possível enviar o arquivo. Tente de novo.');
  };

  return (
    <Janela
      tamanho="p"
      titulo="Anexar arquivo"
      subtitulo={`Fatura de ${rotuloCompetencia(fatura.competencia)} · ${formatCurrency(valorEfetivo(fatura))}`}
      icone={<Paperclip className="ico" />}
      onFechar={onFechar}
      rodape={
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onFechar} disabled={enviando} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="submit" form={id} disabled={!arquivo || enviando} className="btn btn-primario">
            <Upload aria-hidden="true" />
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      }
    >
      <form id={id} onSubmit={enviar} className="space-y-3">
        <div>
          <label htmlFor={`${id}-campo`} className={CLASSE_ROTULO}>
            Arquivo (PDF ou imagem)
          </label>
          <input id={`${id}-campo`} type="file" accept={TIPOS_ARQUIVO_ACEITOS.join(',')} onChange={(e) => escolher(e.target.files?.[0])} className={CLASSE_ARQUIVO} />
        </div>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
      </form>
    </Janela>
  );
};

/**
 * Registrar pagamento (janela pequena): data, forma de pagamento, valor efetivamente pago
 * (juros/multa/desconto/IOF pedem motivo), nº do comprovante e arquivo. Antes era só a data,
 * direto na linha.
 */
const JanelaPagamento: React.FC<{
  fatura: Fatura;
  origem: string;
  formaSugerida?: Fatura['formaPagamento'];
  cartaoFinal?: string;
  onFechar: () => void;
  onPago: () => void;
}> = ({ fatura, origem, formaSugerida, cartaoFinal, onFechar, onPago }) => {
  const { editarFatura, anexarArquivoFatura } = useApp();
  const [data, setData] = useState(() => isoLocal(new Date()));
  const [forma, setForma] = useState<string>(formaSugerida || '');
  const [valor, setValor] = useState<number | undefined>(fatura.valor);
  const [motivoValor, setMotivoValor] = useState('');
  const [documento, setDocumento] = useState(fatura.numeroDocumento || '');
  const [observacao, setObservacao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const valorMudou = valor !== undefined && Math.abs(valor - fatura.valor) >= 0.005;
  const estrangeira = !!fatura.moeda && fatura.moeda !== 'BRL';
  const id = `pagamento-${fatura.id}`;

  const escolherArquivo = (f: File | undefined) => {
    if (!f) return;
    const msg = validarArquivo(f);
    setErro(msg || '');
    setArquivo(msg ? null : f);
  };

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    if (!data) return setErro('Informe a data do pagamento.');
    if (data > isoLocal(new Date())) return setErro('A data do pagamento não pode ser no futuro.');
    if (!forma) return setErro('Informe a forma de pagamento.');
    if (valor === undefined || !Number.isFinite(valor) || valor < 0) return setErro('Informe o valor pago.');
    if (valorMudou && motivoValor.trim().length < 3) return setErro('O valor pago é diferente do valor da fatura: informe o motivo (juros, multa, desconto…).');
    const notas = [
      fatura.observacoes,
      valorMudou ? `Pago ${formatCurrency(valor)} em vez de ${formatCurrency(fatura.valor)}: ${motivoValor.trim()}` : '',
      observacao.trim(),
    ]
      .filter(Boolean)
      .join('\n');
    setErro('');
    setSalvando(true);
    const falha = await editarFatura(fatura.id, {
      status: 'paga',
      pagoEm: data,
      formaPagamento: forma as Fatura['formaPagamento'],
      // O valor da fatura fica como foi lançado; o pago (com juros, multa ou desconto) vai à parte
      valorPago: valorMudou ? valor : undefined,
      numeroDocumento: documento.trim() || undefined,
      observacoes: notas || undefined,
    });
    setSalvando(false);
    if (falha) return setErro(`Não foi possível registrar o pagamento: ${falha}`);
    if (arquivo) void anexarArquivoFatura(fatura.id, arquivo);
    onPago();
  };

  return (
    <Janela
      tamanho="p"
      titulo="Registrar pagamento"
      subtitulo={`${origem} · ${rotuloCompetencia(fatura.competencia)} · vence ${formatDate(fatura.vencimento)}`}
      icone={<CheckCircle2 className="ico" />}
      onFechar={onFechar}
      rodape={
        <>
          <span />
          <span className="flex gap-2">
            <button type="button" onClick={onFechar} className="btn btn-secundario">
              Cancelar
            </button>
            {/* Seção 21 (pagar rápido): já vem preenchida; o foco fica em Confirmar, um clique conclui */}
            <button type="submit" form={id} disabled={salvando} autoFocus={!!formaSugerida} className="btn btn-primario">
              {salvando ? 'Registrando…' : 'Confirmar'}
            </button>
          </span>
        </>
      }
    >
      <form id={id} onSubmit={registrar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-data`} className={CLASSE_ROTULO}>
            Data do pagamento *
          </label>
          <input id={`${id}-data`} type="date" required max={isoLocal(new Date())} value={data} onChange={(e) => setData(e.target.value)} className={CLASSE_CAMPO} />
        </div>
        <div>
          <label htmlFor={`${id}-forma`} className={CLASSE_ROTULO}>
            Forma de pagamento *
          </label>
          <select id={`${id}-forma`} required autoFocus={!formaSugerida} value={forma} onChange={(e) => setForma(e.target.value)} className={CLASSE_CAMPO}>
            <option value="">Escolha…</option>
            {Object.entries(ROTULO_FORMA_PAGAMENTO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {forma === 'cartao' && cartaoFinal && <p className="ajuda">Cartão cadastrado: final {cartaoFinal}</p>}
        </div>
        <div>
          <label htmlFor={`${id}-valor`} className={CLASSE_ROTULO}>
            {estrangeira ? 'Valor pago em R$ (com IOF) *' : 'Valor pago *'}
          </label>
          <CampoMoeda id={`${id}-valor`} valor={valor} onMudar={setValor} />
          <p className="ajuda">Valor da fatura: {formatCurrency(fatura.valor)}</p>
        </div>
        <div>
          <label htmlFor={`${id}-doc`} className={CLASSE_ROTULO}>
            Nº do documento / comprovante
          </label>
          <input id={`${id}-doc`} value={documento} onChange={(e) => setDocumento(e.target.value)} className={`${CLASSE_CAMPO} font-mono`} placeholder="Boleto, NF, autenticação…" />
        </div>
        {valorMudou && (
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-motivo`} className={CLASSE_ROTULO}>
              Por que o valor é diferente? *
            </label>
            <input id={`${id}-motivo`} value={motivoValor} onChange={(e) => setMotivoValor(e.target.value)} className={CLASSE_CAMPO} placeholder="Ex.: juros por atraso, desconto, IOF" />
          </div>
        )}
        {!fatura.arquivoCaminho && (
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-arq`} className={CLASSE_ROTULO}>
              Comprovante (PDF ou imagem)
            </label>
            <input id={`${id}-arq`} type="file" accept={TIPOS_ARQUIVO_ACEITOS.join(',')} onChange={(e) => escolherArquivo(e.target.files?.[0])} className={CLASSE_ARQUIVO} />
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-obs`} className={CLASSE_ROTULO}>
            Observação
          </label>
          <textarea id={`${id}-obs`} rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} className={CLASSE_CAMPO} />
        </div>
        {erro && (
          <p className="erro sm:col-span-2" role="alert">
            {erro}
          </p>
        )}
      </form>
    </Janela>
  );
};

/**
 * Seção 17 (decisão 11): equipamento comprado sem pedido e sem conta lançada.
 * Mostra "Lançar conta a pagar" já preenchido (fornecedor, NF, valor, área e mês da compra).
 */
export const BotaoContaDoAtivo: React.FC<{ ativo: Asset; compacto?: boolean }> = ({ ativo, compacto }) => {
  const { faturas, currentRole } = useApp();
  const [aberto, setAberto] = useState(false);
  const valor = Number(ativo.fiscal?.valorCompra) || 0;
  if (currentRole !== 'ti_admin' && currentRole !== 'ti_suporte') return null;
  if (!valor || ativo.pedidoId || faturas.some((f) => f.ativoId === ativo.id && f.status !== 'cancelada')) return null;
  const competencia = ativo.fiscal?.dataAquisicao ? `${ativo.fiscal.dataAquisicao.slice(0, 7)}-01` : undefined;
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={`btn btn-sm ${compacto ? 'btn-secundario' : 'btn-primario'}`} title="Comprado sem pedido e sem conta a pagar: lance para entrar no orçamento e no livro">
        <Receipt aria-hidden="true" /> Lançar conta a pagar
      </button>
      {aberto &&
        createPortal(
          <FormFatura
            periodicidade="unico"
            valorPadrao={valor}
            doMesmoAlvo={[]}
            avulsaInicial={{
              ativoId: ativo.id,
              fornecedorId: ativo.fornecedorId,
              descricao: `${ativo.tag} · ${ativo.nome}${ativo.fiscal?.numeroNF ? ` (NF ${ativo.fiscal.numeroNF})` : ''}`,
              categoriaDespesa: 'hardware',
              departamentoId: ativo.setorId,
              valor,
              competencia,
            }}
            onFechar={() => setAberto(false)}
          />,
          document.body
        )}
    </>
  );
};

/** Seção 21: grupos da escolha de origem em "Lançar fatura" */
const GRUPOS_ORIGEM = ['Contratos', 'Licenças', 'Pedidos'] as const;

/** Fatura avulsa: sem contrato, licença ou pedido (seção 17) */
export const ehAvulsa = (f: Pick<Fatura, 'licencaId' | 'contratoId' | 'pedidoId'>) => !f.licencaId && !f.contratoId && !f.pedidoId;

/** Dados que já vêm preenchidos na avulsa (ex.: "lançar conta a pagar" da ficha do ativo) */
export type AvulsaInicial = Partial<Pick<Fatura, 'fornecedorId' | 'descricao' | 'categoriaDespesa' | 'departamentoId' | 'ativoId' | 'valor' | 'competencia'>>;

/** Janela de fatura nova (ou edição), já preenchida com a próxima competência, o valor e o vencimento no dia 10 */
export const FormFatura: React.FC<{
  alvo?: AlvoFatura; // sem alvo: Contas a pagar escolhe licença, contrato ou avulsa
  periodicidade: PeriodicidadeContrato;
  valorPadrao: number;
  doMesmoAlvo: Fatura[];
  editando?: Fatura;
  /** Abre já como avulsa, com estes dados */
  avulsaInicial?: AvulsaInicial;
  onFechar: () => void;
}> = ({ alvo: alvoFixo, periodicidade, valorPadrao, doMesmoAlvo: doMesmoAlvoFixo, editando, avulsaInicial, onFechar }) => {
  const { cadastrarFatura, editarFatura, anexarArquivoFatura, faturas, contratos, licenses, fornecedores, departments, settings, currentRole } = useApp();
  const [salvando, setSalvando] = useState(false);
  // Seção 6: em Contas a pagar a pessoa escolhe de quem é a fatura (licença paga por contrato vai para o contrato)
  // Seção 17: ou "avulsa" (fornecedor + descrição), para o que não tem contrato, licença nem pedido
  const [alvoEscolhido, setAlvoEscolhido] = useState(avulsaInicial || (editando && ehAvulsa(editando)) ? 'avulsa' : '');
  const avulsa = !alvoFixo && alvoEscolhido === 'avulsa';
  const [fornecedorId, setFornecedorId] = useState(editando?.fornecedorId || avulsaInicial?.fornecedorId || '');
  const [descricao, setDescricao] = useState(editando?.descricao || avulsaInicial?.descricao || '');
  const [categoria, setCategoria] = useState<CategoriaDespesa>(editando?.categoriaDespesa || avulsaInicial?.categoriaDespesa || 'outros');
  const [departamentoId, setDepartamentoId] = useState(editando?.departamentoId || avulsaInicial?.departamentoId || '');
  const [naturezaManual, setNaturezaManual] = useState<'' | 'capex' | 'opex'>(editando?.naturezaManual && editando.natureza ? editando.natureza : '');
  const [naturezaMotivo, setNaturezaMotivo] = useState(editando?.naturezaMotivo || '');
  const limite = settings.premissasFinanceiras?.limiteCapitalizacao ?? LIMITE_CAPITALIZACAO_PADRAO;
  const alvo: AlvoFatura | undefined =
    alvoFixo ||
    (alvoEscolhido.startsWith('c:')
      ? { contratoId: alvoEscolhido.slice(2) }
      : alvoEscolhido.startsWith('l:')
        ? { licencaId: alvoEscolhido.slice(2) }
        : undefined);
  // Seção 21: pedido comprado cuja fatura foi cancelada pode ganhar fatura nova aqui
  const { pedidos: pedidosCompra } = useCompras();
  const pedidoId = !alvoFixo && alvoEscolhido.startsWith('p:') ? alvoEscolhido.slice(2) : '';
  const pedidoEscolhido = pedidoId ? pedidosCompra.find((p) => p.id === pedidoId) : undefined;
  const doMesmoAlvo = alvoFixo ? doMesmoAlvoFixo : alvo ? faturasDoAlvo(faturas, alvo) : pedidoId ? faturas.filter((f) => f.pedidoId === pedidoId) : [];
  // Seção 21: em Contas a pagar a competência padrão é o mês atual; na ficha, a próxima da sequência
  const [sugerida] = useState(() => editando?.competencia || (alvoFixo ? proximaCompetencia(doMesmoAlvo, periodicidade) : competenciaDe(isoLocal(new Date()))));
  const [filtroOrigem, setFiltroOrigem] = useState('');
  // Origens possíveis, em grupos: contratos ativos, licenças com cobrança própria e pedidos comprados sem fatura
  const opcoesOrigem: { grupo: (typeof GRUPOS_ORIGEM)[number]; valor: string; nome: string; valorPadrao?: number }[] = [
    ...contratos.filter((c) => c.status !== 'encerrado').map((c) => ({ grupo: 'Contratos' as const, valor: `c:${c.id}`, nome: nomeContrato(c), valorPadrao: c.valor })),
    ...licenses
      .filter((l) => l.status !== 'inativa' && formaCobrancaDe(l, contratos) === 'propria')
      .map((l) => ({ grupo: 'Licenças' as const, valor: `l:${l.id}`, nome: l.nome, valorPadrao: l.valorMensal })),
    ...pedidosCompra
      .filter((p) => (p.status === 'comprado' || p.status === 'recebido') && !p.semValores && !faturas.some((f) => f.pedidoId === p.id && f.status !== 'cancelada'))
      .map((p) => ({ grupo: 'Pedidos' as const, valor: `p:${p.id}`, nome: `${p.codigo} · ${p.titulo}`, valorPadrao: p.valorFinal })),
  ];
  const [competencia, setCompetencia] = useState(avulsaInicial?.competencia || sugerida);
  const [valor, setValor] = useState<number | undefined>(editando?.valor ?? avulsaInicial?.valor ?? valorPadrao);
  const naturezaAuto = naturezaDoLancamento({ categoria, valorUnitario: valor || 0 }, limite);
  const [vencimento, setVencimento] = useState(() => editando?.vencimento || vencimentoSugerido(sugerida));
  const [vencimentoEditado, setVencimentoEditado] = useState(!!editando);
  const [status, setStatus] = useState<Exclude<StatusFatura, 'cancelada'>>('a_pagar');
  const [pagoEm, setPagoEm] = useState('');
  const [numeroDocumento, setNumeroDocumento] = useState(editando?.numeroDocumento || '');
  const [observacoes, setObservacoes] = useState(editando?.observacoes || '');
  const [moeda, setMoeda] = useState(editando?.moeda || 'BRL');
  const [valorMoeda, setValorMoeda] = useState(editando?.valorMoeda != null ? String(editando.valorMoeda) : '');
  const [formaPagamento, setFormaPagamento] = useState(editando?.formaPagamento || '');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');

  const chave = editando ? `editar:${editando.id}` : avulsaInicial?.ativoId ? `ativo:${avulsaInicial.ativoId}` : alvo?.licencaId ? `licenca:${alvo.licencaId}` : alvo?.contratoId ? `contrato:${alvo.contratoId}` : 'nova';
  const valores = JSON.stringify([competencia, valor, vencimento, status, pagoEm, numeroDocumento, observacoes, fornecedorId, descricao, categoria, departamentoId, naturezaManual]);
  const [valoresIniciais] = useState(valores);
  const pendenciasFatura = valores !== valoresIniciais || arquivo ? [editando ? 'Edição da fatura não salva' : 'Fatura nova não lançada'] : [];
  useRegistrarPendencias(`fatura:${chave}`, pendenciasFatura);
  const cancelarDigitacao = () => {
    void confirmarDescarte(pendenciasFatura).then((ok) => ok && onFechar());
  };

  const nomeAlvo = (() => {
    if (avulsa) return 'Conta avulsa (sem contrato, licença ou pedido)';
    if (pedidoEscolhido) return `Pedido ${pedidoEscolhido.codigo} · ${pedidoEscolhido.titulo}`;
    if (!alvo) return 'Escolha de quem é a fatura';
    if (alvo.contratoId) {
      const c = contratos.find((x) => x.id === alvo.contratoId);
      return c ? `Contrato ${nomeContrato(c)}` : 'Contrato';
    }
    return licenses.find((l) => l.id === alvo.licencaId)?.nome || 'Licença';
  })();

  const mudarCompetencia = (nova: string) => {
    setCompetencia(nova);
    // O vencimento acompanha a competência até a pessoa mudá-lo à mão
    if (!vencimentoEditado) setVencimento(vencimentoSugerido(nova));
  };

  const escolherArquivo = (f: File | undefined) => {
    if (!f) return;
    const msg = validarArquivo(f);
    setErro(msg || '');
    setArquivo(msg ? null : f);
  };

  // Lote 1: só fecha depois do banco confirmar; se recusar, o digitado continua aqui
  const lancar = async (e: React.FormEvent) => {
    e.preventDefault();
    // A janela fica em portal, mas o React ainda propaga o "submit" pela árvore: não deixa chegar a um formulário de fora
    e.stopPropagation();
    if (salvando) return;
    if (!alvo && !avulsa && !pedidoId) return setErro('Escolha de quem é a fatura (contrato, licença, pedido ou avulsa).');
    if (avulsa && !fornecedorId) return setErro('Conta avulsa: escolha o fornecedor.');
    if (avulsa && descricao.trim().length < 3) return setErro('Conta avulsa: descreva o que foi comprado ou contratado.');
    if (naturezaManual && naturezaManual !== naturezaAuto && naturezaMotivo.trim().length < 3)
      return setErro('Você trocou a natureza (CAPEX/OPEX) sugerida: informe o motivo.');
    const extrasAvulsa: Partial<Fatura> = avulsa
      ? {
          fornecedorId,
          descricao: descricao.trim(),
          categoriaDespesa: categoria,
          departamentoId: departamentoId || undefined,
          ativoId: editando?.ativoId || avulsaInicial?.ativoId,
          natureza: naturezaManual || naturezaAuto,
          naturezaManual: !!naturezaManual && naturezaManual !== naturezaAuto,
          naturezaMotivo: naturezaManual && naturezaManual !== naturezaAuto ? naturezaMotivo.trim() : undefined,
        }
      : {};
    const dados = {
      ...(alvo || {}),
      ...(pedidoId ? { pedidoId } : {}),
      ...extrasAvulsa,
      moeda: moeda as Fatura['moeda'],
      valorMoeda: moeda !== 'BRL' && valorMoeda !== '' ? Number(valorMoeda) : undefined,
      formaPagamento: (formaPagamento || undefined) as Fatura['formaPagamento'],
      competencia,
      valor: valor ?? Number.NaN,
      vencimento,
      status,
      pagoEm: status === 'paga' ? pagoEm || undefined : undefined,
      numeroDocumento: numeroDocumento.trim() || undefined,
      observacoes: observacoes.trim() || undefined,
    };
    // Fatura lançada já paga: mesmo cuidado do "Registrar pagamento" (data e forma)
    if (!editando && status === 'paga' && !formaPagamento) return setErro('Fatura já paga: informe a forma de pagamento.');
    if (!editando && status === 'paga' && pagoEm && pagoEm > isoLocal(new Date())) return setErro('A data do pagamento não pode ser no futuro.');
    const problema = validarFatura({ id: editando?.id || '', ...dados }, doMesmoAlvo.filter((f) => f.id !== editando?.id));
    if (problema) return setErro(problema);
    // Mesmo mês já lançado do outro lado (na licença e no contrato que a paga): seria contado em dobro
    if (!editando && alvo) {
      const mesmoMes = (f: Fatura) => f.status !== 'cancelada' && f.competencia === dados.competencia;
      const contrato = alvo.contratoId ? contratos.find((c) => c.id === alvo.contratoId) : undefined;
      const cobertas = new Set((contrato?.itens || []).map((i) => i.licencaId).filter(Boolean));
      const pagadores = new Set(
        alvo.licencaId ? contratos.filter((c) => c.itens.some((i) => i.licencaId === alvo.licencaId)).map((c) => c.id) : []
      );
      const repetidas = faturas.filter(
        (f) => mesmoMes(f) && ((f.licencaId && cobertas.has(f.licencaId)) || (f.contratoId && pagadores.has(f.contratoId)))
      );
      if (repetidas.length) {
        const onde = repetidas
          .map((f) => (f.contratoId ? nomeContrato(contratos.find((c) => c.id === f.contratoId) || { descricao: 'contrato' }) : licenses.find((l) => l.id === f.licencaId)?.nome || 'licença'))
          .join(', ');
        const ok = await confirmar({
          titulo: 'Este mês já tem fatura lançada',
          mensagem: `${rotuloCompetencia(dados.competencia)} já tem fatura em ${onde}, que cobre o mesmo software. Lançar de novo conta o gasto em dobro nas despesas. Lance só se forem cobranças diferentes.`,
          confirmar: 'Lançar assim mesmo',
          cancelar: 'Voltar',
        });
        if (!ok) return;
      }
    }
    setErro('');
    setSalvando(true);
    if (editando) {
      const falhaEd = await editarFatura(editando.id, {
        competencia: dados.competencia,
        valor: dados.valor,
        vencimento: dados.vencimento,
        numeroDocumento: dados.numeroDocumento,
        observacoes: dados.observacoes,
        moeda: dados.moeda,
        valorMoeda: dados.valorMoeda,
        formaPagamento: dados.formaPagamento,
        ...extrasAvulsa,
      });
      setSalvando(false);
      if (falhaEd) return setErro(`Não foi possível salvar: ${falhaEd}`);
      return onFechar();
    }
    const { item: nova, erro: falha } = await cadastrarFatura(dados);
    setSalvando(false);
    if (!nova) return setErro(`Não foi possível lançar: ${falha || 'erro desconhecido'}`);
    if (arquivo) void anexarArquivoFatura(nova.id, arquivo);
    onFechar();
  };

  const id = (campo: string) => `fatura-${chave}-${campo}`;

  return (
    <Janela
      tamanho="p"
      titulo={editando ? `Editar fatura de ${rotuloCompetencia(editando.competencia)}` : 'Lançar fatura'}
      subtitulo={nomeAlvo}
      icone={<Receipt className="ico" />}
      idTitulo="janela-fatura-titulo"
      onFechar={cancelarDigitacao}
      rodape={
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={cancelarDigitacao} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="submit" form={id('form')} disabled={salvando} className="btn btn-primario">
            {salvando ? 'Salvando…' : editando ? 'Salvar' : 'Lançar fatura'}
          </button>
        </div>
      }
    >
      <form id={id('form')} onSubmit={lancar} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!alvoFixo && !editando && !avulsaInicial && (
            <div className="sm:col-span-2">
              <label htmlFor={id('alvo')} className={CLASSE_ROTULO}>
                De quem é a fatura *
              </label>
              {/* Seção 21 (escala): com muitas opções, um filtro acima da lista agrupada */}
              {opcoesOrigem.length > 15 && (
                <input
                  type="search"
                  value={filtroOrigem}
                  onChange={(e) => setFiltroOrigem(e.target.value)}
                  aria-label="Filtrar contratos, licenças e pedidos"
                  placeholder="Filtrar contratos, licenças e pedidos…"
                  className={`${CLASSE_CAMPO} mb-2`}
                />
              )}
              <select
                id={id('alvo')}
                value={alvoEscolhido}
                onChange={(e) => {
                  setAlvoEscolhido(e.target.value);
                  const escolhida = opcoesOrigem.find((o) => o.valor === e.target.value);
                  if (escolhida?.valorPadrao !== undefined) setValor(escolhida.valorPadrao);
                }}
                className={CLASSE_CAMPO}
              >
                <option value="">Escolha…</option>
                <option value="avulsa">Conta avulsa (sem contrato, licença ou pedido)</option>
                {GRUPOS_ORIGEM.map((g) => {
                  const doGrupo = opcoesOrigem.filter((o) => o.grupo === g && (o.valor === alvoEscolhido || !filtroOrigem || normalizar(o.nome).includes(normalizar(filtroOrigem))));
                  return doGrupo.length === 0 ? null : (
                    <optgroup key={g} label={g}>
                      {doGrupo.map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.nome}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          )}
          {avulsa && (
            <>
              <div>
                <label htmlFor={id('forn')} className={CLASSE_ROTULO}>
                  Fornecedor *
                </label>
                <select id={id('forn')} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className={CLASSE_CAMPO}>
                  <option value="">Escolha…</option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={id('cat')} className={CLASSE_ROTULO}>
                  Categoria *
                </label>
                <select id={id('cat')} value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaDespesa)} className={CLASSE_CAMPO}>
                  {Object.entries(ROTULO_CATEGORIA).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={id('desc')} className={CLASSE_ROTULO}>
                  O que foi comprado ou contratado *
                </label>
                <input id={id('desc')} value={descricao} onChange={(e) => setDescricao(e.target.value)} className={CLASSE_CAMPO} placeholder="Ex.: conserto da impressora do 2º andar" />
              </div>
              <div>
                <label htmlFor={id('dep')} className={CLASSE_ROTULO}>
                  Área (departamento)
                </label>
                <select id={id('dep')} value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)} className={CLASSE_CAMPO}>
                  <option value="">Sem área (custo geral de T.I.)</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={id('nat')} className={CLASSE_ROTULO}>
                  Natureza
                </label>
                <select id={id('nat')} value={naturezaManual} onChange={(e) => setNaturezaManual(e.target.value as typeof naturezaManual)} className={CLASSE_CAMPO}>
                  <option value="">Automática: {naturezaAuto.toUpperCase()}</option>
                  <option value="capex">CAPEX (investimento, deprecia)</option>
                  <option value="opex">OPEX (despesa do mês)</option>
                </select>
                <p className="ajuda">CAPEX: equipamento ou licença perpétua a partir de {formatCurrency(limite)}.</p>
              </div>
              {naturezaManual && naturezaManual !== naturezaAuto && (
                <div className="sm:col-span-2">
                  <label htmlFor={id('natmot')} className={CLASSE_ROTULO}>
                    Por que trocar a natureza? *
                  </label>
                  <input id={id('natmot')} value={naturezaMotivo} onChange={(e) => setNaturezaMotivo(e.target.value)} className={CLASSE_CAMPO} />
                </div>
              )}
            </>
          )}
          <div>
            <label htmlFor={id('comp')} className={CLASSE_ROTULO}>
              Competência *
            </label>
            <select id={id('comp')} value={competencia} onChange={(e) => mudarCompetencia(e.target.value)} className={CLASSE_CAMPO}>
              {opcoesCompetencia(sugerida).map((c) => (
                <option key={c} value={c}>
                  {rotuloCompetencia(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id('valor')} className={CLASSE_ROTULO}>
              Valor (R$) *
            </label>
            <CampoMoeda id={id('valor')} required valor={valor} onMudar={setValor} className={CLASSE_CAMPO} />
          </div>
          <div>
            <label htmlFor={id('venc')} className={CLASSE_ROTULO}>
              Vencimento *
            </label>
            <input
              id={id('venc')}
              type="date"
              required
              value={vencimento}
              onChange={(e) => {
                setVencimento(e.target.value);
                setVencimentoEditado(true);
              }}
              className={CLASSE_CAMPO}
            />
          </div>
          {!editando && currentRole !== 'ti_suporte' && (
            <div>
              <label htmlFor={id('status')} className={CLASSE_ROTULO}>
                Situação
              </label>
              <select
                id={id('status')}
                value={status}
                onChange={(e) => {
                  const novo = e.target.value as 'a_pagar' | 'paga';
                  setStatus(novo);
                  if (novo === 'paga' && !pagoEm) setPagoEm(isoLocal(new Date()));
                }}
                className={CLASSE_CAMPO}
              >
                <option value="a_pagar">A pagar</option>
                <option value="paga">Já paga</option>
              </select>
            </div>
          )}
          {status === 'paga' && !editando && (
            <div>
              <label htmlFor={id('pago')} className={CLASSE_ROTULO}>
                Pago em *
              </label>
              <input id={id('pago')} type="date" required value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} className={CLASSE_CAMPO} />
            </div>
          )}
          <div>
            <label htmlFor={id('doc')} className={CLASSE_ROTULO}>
              Nº do documento
            </label>
            <input
              id={id('doc')}
              type="text"
              value={numeroDocumento}
              onChange={(e) => setNumeroDocumento(e.target.value)}
              placeholder="Fatura, invoice ou NF de serviço"
              className={`${CLASSE_CAMPO} font-mono`}
            />
          </div>
          <div>
            <label htmlFor={id('pgto')} className={CLASSE_ROTULO}>
              Forma de pagamento
            </label>
            <select id={id('pgto')} value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className={CLASSE_CAMPO}>
              <option value="">—</option>
              {Object.entries(ROTULO_FORMA_PAGAMENTO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id('moeda')} className={CLASSE_ROTULO}>
              Moeda da cobrança
            </label>
            <select id={id('moeda')} value={moeda} onChange={(e) => setMoeda(e.target.value as 'BRL')} className={CLASSE_CAMPO}>
              <option value="BRL">Real (R$)</option>
              <option value="USD">Dólar (US$)</option>
              <option value="EUR">Euro (€)</option>
            </select>
          </div>
          {moeda !== 'BRL' && (
            <div>
              <label htmlFor={id('vmoeda')} className={CLASSE_ROTULO}>
                Valor em {moeda}
              </label>
              <input
                id={id('vmoeda')}
                type="number"
                min={0}
                step="0.01"
                value={valorMoeda}
                onChange={(e) => setValorMoeda(e.target.value)}
                className={`${CLASSE_CAMPO} font-mono`}
              />
              <p className="ajuda">O campo Valor (R$) é o que saiu da conta, já com IOF.</p>
            </div>
          )}
          {!editando && (
            <div className="sm:col-span-2">
              <label htmlFor={id('arq')} className={CLASSE_ROTULO}>
                Arquivo (PDF ou imagem)
              </label>
              <input
                id={id('arq')}
                type="file"
                accept={TIPOS_ARQUIVO_ACEITOS.join(',')}
                onChange={(e) => escolherArquivo(e.target.files?.[0])}
                className={CLASSE_ARQUIVO}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label htmlFor={id('obs')} className={CLASSE_ROTULO}>
              Observações
            </label>
            <textarea id={id('obs')} rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className={CLASSE_CAMPO} />
          </div>
        </div>

        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
      </form>
    </Janela>
  );
};
