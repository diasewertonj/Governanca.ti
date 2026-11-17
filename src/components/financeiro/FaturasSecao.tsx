import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Paperclip, Pencil, Plus, Receipt, RotateCcw, Trash2, Upload, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Fatura, PeriodicidadeContrato, StatusFatura } from '../../types/index.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { TIPOS_ARQUIVO_ACEITOS, validarArquivo } from '../../services/supabaseDb.ts';
import { formatCurrency, formatDate, isoLocal } from '../../utils/formatters.ts';
import {
  ROTULO_STATUS_FATURA,
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
import { AbrirArquivo } from '../comum/AbrirArquivo.tsx';
import { CLASSE_ARQUIVO, CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { nomeContrato } from '../../utils/contratos.ts';
import { formaCobrancaDe, ROTULO_FORMA_PAGAMENTO } from '../../utils/financeiro.ts';
import { confirmar, pedirTexto } from '../ui/dialogo.tsx';
import { Janela } from '../ui/Janela.tsx';
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
}

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
export const FaturasSecao: React.FC<FaturasSecaoProps> = ({ alvo, periodicidade = 'mensal', valorPadrao = 0, bloqueioLancamento, listaGlobal }) => {
  const { faturas, currentRole, alterarFatura, editarFatura, excluirFatura, anexarArquivoFatura, desfazerPagamento, contratos, licenses } = useApp();
  const [editando, setEditando] = useState<Fatura | null>(null);
  const [lancando, setLancando] = useState(false);
  const [pagando, setPagando] = useState<{ id: string; data: string } | null>(null);
  // Arquivo de uma fatura já lançada sem arquivo: escolhe e só sobe ao clicar em "Enviar"
  const [anexando, setAnexando] = useState<{ id: string; arquivo: File | null; enviando: boolean } | null>(null);
  const [erro, setErro] = useState('');
  useRegistrarPendencias(`fatura-arquivo:${alvo ? alvo.licencaId || alvo.contratoId : 'todas'}`, anexando?.arquivo ? ['Arquivo da fatura não enviado'] : []);

  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  if (!isTI) return null;

  const lista = alvo ? faturasDoAlvo(faturas, alvo) : listaGlobal || faturas;
  const origem = (f: Fatura) => {
    if (f.contratoId) {
      const c = contratos.find((x) => x.id === f.contratoId);
      return c ? nomeContrato(c) : 'Contrato';
    }
    return licenses.find((l) => l.id === f.licencaId)?.nome || 'Licença';
  };
  const desfazer = async (f: Fatura) => {
    const motivo = await pedirTexto(`Desfazer o pagamento da fatura de ${rotuloCompetencia(f.competencia)}?\n\nInforme o motivo:`);
    if (motivo === null) return;
    const falha = await desfazerPagamento(f.id, motivo);
    setErro(falha ? `Não foi possível desfazer: ${falha}` : '');
  };
  const agora = new Date();
  const ano = agora.getFullYear();

  // Lote 1: o campo de pagamento só fecha depois do banco confirmar
  const confirmarPagamento = async () => {
    if (!pagando) return;
    if (!pagando.data) return setErro('Fatura paga precisa da data de pagamento.');
    const falha = await editarFatura(pagando.id, { status: 'paga', pagoEm: pagando.data });
    if (falha) return setErro(`Não foi possível marcar como paga: ${falha}`);
    setPagando(null);
    setErro('');
  };

  const cancelar = async (f: Fatura) => {
    const aviso = `Cancelar a fatura de ${rotuloCompetencia(f.competencia)}?\n\nEla continua no histórico, mas deixa de contar como paga ou a pagar.`;
    if (await confirmar(aviso)) alterarFatura(f.id, { status: 'cancelada' });
  };

  const escolherArquivo = (arquivo: File | undefined) => {
    if (!anexando || !arquivo) return;
    const msg = validarArquivo(arquivo);
    setErro(msg || '');
    setAnexando({ ...anexando, arquivo: msg ? null : arquivo });
  };

  const enviarArquivo = async () => {
    if (!anexando?.arquivo || anexando.enviando) return;
    setAnexando({ ...anexando, enviando: true });
    // Sobe para faturas/<id>/ e grava o caminho; se falhar, o aviso de erro explica
    const ok = await anexarArquivoFatura(anexando.id, anexando.arquivo);
    setAnexando(ok ? null : { ...anexando, enviando: false });
  };

  const excluir = async (f: Fatura) => {
    if (await confirmar(`Excluir a fatura de ${rotuloCompetencia(f.competencia)}? Esta ação não pode ser desfeita.`)) {
      excluirFatura(f.id);
    }
  };

  const alvoDaFatura = (f: Fatura): AlvoFatura => (f.contratoId ? { contratoId: f.contratoId } : { licencaId: f.licencaId as string });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="secao-titulo inline-flex items-center gap-1.5">
          <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
          Faturas ({lista.length})
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          {alvo && (
            <span className="text-xs text-slate-600">
              Pago em {ano}: <span className="font-mono font-semibold text-slate-900">{formatCurrency(totalPagoNoAno(lista, ano))}</span>
            </span>
          )}
          {!bloqueioLancamento && (
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

      {bloqueioLancamento && <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">{bloqueioLancamento}</p>}

      {lista.length === 0 ? (
        <Vazio>Nenhuma fatura lançada.</Vazio>
      ) : (
        <div className="cartao overflow-hidden">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                {!alvo && <th>Origem</th>}
                <th>Competência</th>
                <th className="text-right">Valor</th>
                <th>Vencimento</th>
                <th>Situação</th>
                <th className="hidden xl:table-cell">Nº do documento</th>
                <th>Arquivo</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => {
                const status = statusExibido(f, agora);
                return (
                  <tr key={f.id} className={status === 'cancelada' ? 'opacity-60' : ''}>
                    {!alvo && (
                      <td data-label="Origem" className="font-medium text-slate-900">
                        {origem(f)}
                      </td>
                    )}
                    <td data-label="Competência" className="font-semibold text-slate-900">
                      {rotuloCompetencia(f.competencia)}
                    </td>
                    <td data-label="Valor" className="text-right font-mono text-slate-800">
                      {formatCurrency(f.valor)}
                      {f.moeda && f.moeda !== 'BRL' && f.valorMoeda != null && (
                        <span className="block text-slate-500">
                          {f.moeda} {f.valorMoeda.toFixed(2)}
                        </span>
                      )}
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
                    <td data-label="Nº do documento" className="hidden font-mono break-all xl:table-cell">
                      {f.numeroDocumento || '-'}
                    </td>
                    <td data-label="Arquivo" className="min-w-0">
                      {f.arquivoCaminho ? (
                        <AbrirArquivo caminho={f.arquivoCaminho} />
                      ) : anexando?.id === f.id ? (
                        <span className="flex min-w-0 flex-col gap-1.5">
                          <label htmlFor={`fatura-arq-${f.id}`} className="sr-only">
                            Arquivo da fatura de {rotuloCompetencia(f.competencia)}
                          </label>
                          <input
                            id={`fatura-arq-${f.id}`}
                            type="file"
                            accept={TIPOS_ARQUIVO_ACEITOS.join(',')}
                            onChange={(e) => escolherArquivo(e.target.files?.[0])}
                            className={CLASSE_ARQUIVO}
                          />
                          <span className="inline-flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={enviarArquivo}
                              disabled={!anexando.arquivo || anexando.enviando}
                              className="btn btn-sm btn-primario"
                            >
                              <Upload aria-hidden="true" />
                              {anexando.enviando ? 'Enviando...' : 'Enviar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAnexando(null);
                                setErro('');
                              }}
                              disabled={anexando.enviando}
                              className="btn btn-sm btn-secundario"
                            >
                              Voltar
                            </button>
                          </span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAnexando({ id: f.id, arquivo: null, enviando: false });
                            setErro('');
                          }}
                          aria-label={`Anexar arquivo à fatura de ${rotuloCompetencia(f.competencia)}`}
                          className="link inline-flex items-center gap-1 text-xs"
                        >
                          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" /> Anexar
                        </button>
                      )}
                    </td>
                    <td data-label="Ações" className="text-right">
                      {pagando?.id === f.id ? (
                        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <label htmlFor={`pago-em-${f.id}`} className="text-xs text-slate-700">
                            Pago em
                          </label>
                          <input
                            id={`pago-em-${f.id}`}
                            type="date"
                            value={pagando.data}
                            onChange={(e) => setPagando({ ...pagando, data: e.target.value })}
                            className="campo campo-sm w-auto"
                          />
                          <button type="button" onClick={confirmarPagamento} className="btn btn-sm btn-primario">
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPagando(null);
                              setErro('');
                            }}
                            className="btn btn-sm btn-secundario"
                          >
                            Voltar
                          </button>
                        </span>
                      ) : (
                        <span className="acoes-linha">
                          {f.status === 'a_pagar' && (
                            <button
                              type="button"
                              onClick={() => setPagando({ id: f.id, data: isoLocal(new Date()) })}
                              aria-label={`Pagar a fatura de ${rotuloCompetencia(f.competencia)}`}
                              className="btn btn-sm btn-primario mr-1"
                            >
                              <CheckCircle2 aria-hidden="true" /> Pagar
                            </button>
                          )}
                          {f.status === 'a_pagar' && (
                            <button
                              type="button"
                              onClick={() => {
                                setLancando(false);
                                setEditando(f);
                              }}
                              title="Editar fatura"
                              aria-label={`Editar a fatura de ${rotuloCompetencia(f.competencia)}`}
                              className="btn-icone"
                            >
                              <Pencil aria-hidden="true" />
                            </button>
                          )}
                          {f.status === 'paga' && currentRole === 'ti_admin' && (
                            <button
                              type="button"
                              onClick={() => desfazer(f)}
                              title="Desfazer pagamento"
                              aria-label={`Desfazer o pagamento da fatura de ${rotuloCompetencia(f.competencia)}`}
                              className="btn-icone"
                            >
                              <RotateCcw aria-hidden="true" />
                            </button>
                          )}
                          {f.status === 'a_pagar' && (
                            <button
                              type="button"
                              onClick={() => cancelar(f)}
                              title="Cancelar fatura"
                              aria-label={`Cancelar a fatura de ${rotuloCompetencia(f.competencia)}`}
                              className="btn-icone"
                            >
                              <XCircle aria-hidden="true" />
                            </button>
                          )}
                          {currentRole === 'ti_admin' && (
                            <button
                              type="button"
                              onClick={() => excluir(f)}
                              title="Excluir fatura"
                              aria-label={`Excluir a fatura de ${rotuloCompetencia(f.competencia)}`}
                              className="btn-icone btn-icone-perigo"
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
              alvo={alvoDaFatura(editando)}
              periodicidade={periodicidade}
              valorPadrao={editando.valor}
              doMesmoAlvo={faturasDoAlvo(faturas, alvoDaFatura(editando))}
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
    </div>
  );
};

/** Janela de fatura nova (ou edição), já preenchida com a próxima competência, o valor e o vencimento no dia 10 */
const FormFatura: React.FC<{
  alvo?: AlvoFatura; // sem alvo: Contas a pagar escolhe licença ou contrato
  periodicidade: PeriodicidadeContrato;
  valorPadrao: number;
  doMesmoAlvo: Fatura[];
  editando?: Fatura;
  onFechar: () => void;
}> = ({ alvo: alvoFixo, periodicidade, valorPadrao, doMesmoAlvo: doMesmoAlvoFixo, editando, onFechar }) => {
  const { cadastrarFatura, editarFatura, anexarArquivoFatura, faturas, contratos, licenses } = useApp();
  const [salvando, setSalvando] = useState(false);
  // Seção 6: em Contas a pagar a pessoa escolhe de quem é a fatura (licença paga por contrato vai para o contrato)
  const [alvoEscolhido, setAlvoEscolhido] = useState('');
  const alvo: AlvoFatura | undefined =
    alvoFixo ||
    (alvoEscolhido.startsWith('c:')
      ? { contratoId: alvoEscolhido.slice(2) }
      : alvoEscolhido.startsWith('l:')
        ? { licencaId: alvoEscolhido.slice(2) }
        : undefined);
  const doMesmoAlvo = alvoFixo ? doMesmoAlvoFixo : alvo ? faturasDoAlvo(faturas, alvo) : [];
  const [sugerida] = useState(() => editando?.competencia || proximaCompetencia(doMesmoAlvo, periodicidade));
  const [competencia, setCompetencia] = useState(sugerida);
  const [valor, setValor] = useState(String(editando?.valor ?? valorPadrao));
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

  const chave = editando ? `editar:${editando.id}` : alvo?.licencaId ? `licenca:${alvo.licencaId}` : alvo?.contratoId ? `contrato:${alvo.contratoId}` : 'nova';
  const valores = JSON.stringify([competencia, valor, vencimento, status, pagoEm, numeroDocumento, observacoes]);
  const [valoresIniciais] = useState(valores);
  const pendenciasFatura = valores !== valoresIniciais || arquivo ? [editando ? 'Edição da fatura não salva' : 'Fatura nova não lançada'] : [];
  useRegistrarPendencias(`fatura:${chave}`, pendenciasFatura);
  const cancelarDigitacao = () => {
    void confirmarDescarte(pendenciasFatura).then((ok) => ok && onFechar());
  };

  const nomeAlvo = (() => {
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
    if (!alvo) return setErro('Escolha de quem é a fatura (contrato ou licença).');
    const dados = {
      ...alvo,
      moeda: moeda as Fatura['moeda'],
      valorMoeda: moeda !== 'BRL' && valorMoeda !== '' ? Number(valorMoeda) : undefined,
      formaPagamento: (formaPagamento || undefined) as Fatura['formaPagamento'],
      competencia,
      valor: valor === '' ? Number.NaN : Number(valor),
      vencimento,
      status,
      pagoEm: status === 'paga' ? pagoEm || undefined : undefined,
      numeroDocumento: numeroDocumento.trim() || undefined,
      observacoes: observacoes.trim() || undefined,
    };
    const problema = validarFatura({ id: editando?.id || '', ...dados }, doMesmoAlvo.filter((f) => f.id !== editando?.id));
    if (problema) return setErro(problema);
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
      icone={<Receipt className="h-4 w-4" />}
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
          {!alvoFixo && (
            <div className="sm:col-span-2">
              <label htmlFor={id('alvo')} className={CLASSE_ROTULO}>
                De quem é a fatura *
              </label>
              <select
                id={id('alvo')}
                value={alvoEscolhido}
                onChange={(e) => {
                  setAlvoEscolhido(e.target.value);
                  const c = contratos.find((x) => 'c:' + x.id === e.target.value);
                  const l = licenses.find((x) => 'l:' + x.id === e.target.value);
                  if (c) setValor(String(c.valor));
                  if (l) setValor(String(l.valorMensal));
                }}
                className={CLASSE_CAMPO}
              >
                <option value="">Escolha…</option>
                <optgroup label="Contratos">
                  {contratos
                    .filter((c) => c.status !== 'encerrado')
                    .map((c) => (
                      <option key={c.id} value={`c:${c.id}`}>
                        {nomeContrato(c)}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Softwares com cobrança própria">
                  {licenses
                    .filter((l) => l.status !== 'inativa' && formaCobrancaDe(l, contratos) === 'propria')
                    .map((l) => (
                      <option key={l.id} value={`l:${l.id}`}>
                        {l.nome}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>
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
            <input
              id={id('valor')}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              required
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className={`${CLASSE_CAMPO} font-mono`}
            />
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
          {!editando && (
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
