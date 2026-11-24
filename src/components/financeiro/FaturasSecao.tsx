import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Paperclip, Pencil, Plus, Receipt, RotateCcw, Trash2, Upload, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { Asset, CategoriaDespesa, Fatura, PeriodicidadeContrato, StatusFatura } from '../../types/index.ts';
import { LIMITE_CAPITALIZACAO_PADRAO, naturezaDoLancamento } from '../../utils/gestaoFinanceira.ts';
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
import { formaCobrancaDe, ROTULO_CATEGORIA, ROTULO_FORMA_PAGAMENTO, valorDaFatura } from '../../utils/financeiro.ts';
import { confirmar, pedirTexto } from '../ui/dialogo.tsx';
import { CampoMoeda } from '../ui/Campos.tsx';
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
  /** Seção 17: nome da origem calculado pela tela (Compras usa o resumo de contratos) */
  nomeOrigem?: (f: Fatura) => string;
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
export const FaturasSecao: React.FC<FaturasSecaoProps> = ({ alvo, periodicidade = 'mensal', valorPadrao = 0, bloqueioLancamento, listaGlobal, nomeOrigem }) => {
  const { faturas, currentRole, cancelarFatura, excluirFatura, anexarArquivoFatura, desfazerPagamento, contratos, licenses } = useApp();
  const [editando, setEditando] = useState<Fatura | null>(null);
  const [lancando, setLancando] = useState(false);
  // Pagamento: janela própria (data, forma, valor pago, comprovante), nunca só a data
  const [pagando, setPagando] = useState<Fatura | null>(null);
  // Arquivo de uma fatura já lançada sem arquivo: escolhe e só sobe ao clicar em "Enviar"
  const [anexando, setAnexando] = useState<{ id: string; arquivo: File | null; enviando: boolean } | null>(null);
  const [erro, setErro] = useState('');
  const { pedidos: pedidosCompra } = useCompras();
  useRegistrarPendencias(`fatura-arquivo:${alvo ? alvo.licencaId || alvo.contratoId : 'todas'}`, anexando?.arquivo ? ['Arquivo da fatura não enviado'] : []);

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
                {!alvo && <th>Origem</th>}
                <th>Competência</th>
                <th className="num">Valor</th>
                <th>Vencimento</th>
                <th>Situação</th>
                <th className="hidden xl:table-cell">Nº do documento</th>
                <th>Arquivo</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => {
                const status = statusExibido(f, agora);
                return (
                  <tr key={f.id} className={status === 'cancelada' ? 'opacity-60' : ''}>
                    {!alvo && (
                      <td data-label="Origem" className="min-w-64 font-semibold text-slate-900">
                        {origem(f) || 'Conta avulsa'}
                      </td>
                    )}
                    <td data-label="Competência" className="font-semibold text-slate-900">
                      {rotuloCompetencia(f.competencia)}
                    </td>
                    <td data-label="Valor" className="num text-slate-800">
                      {valorDaFatura(f)}
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
                        <span className="flex min-w-0 flex-col gap-2">
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
                          <span className="inline-flex flex-wrap gap-2">
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
                          className="link inline-flex items-center gap-1"
                        >
                          <Paperclip className="ico-sm" aria-hidden="true" /> Anexar
                        </button>
                      )}
                    </td>
                    <td data-label="Ações" className="col-acoes">
                      {(
                        <span className="acoes-linha">
                          {f.status === 'a_pagar' && podePagar && (
                            <button
                              type="button"
                              onClick={() => setPagando(f)}
                              aria-label={`Pagar a fatura de ${rotuloCompetencia(f.competencia)}`}
                              className="btn btn-sm btn-secundario mr-1"
                            >
                              <CheckCircle2 aria-hidden="true" /> Pagar
                            </button>
                          )}
                          {f.status === 'a_pagar' && !f.pedidoId && isTI && (
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
                          {f.status === 'a_pagar' && (isTI || currentRole === 'compras') && (
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
                          {currentRole === 'ti_admin' && !f.pedidoId && (
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
            formaSugerida={pagando.formaPagamento || formaCadastrada(pagando)?.formaPagamento}
            cartaoFinal={formaCadastrada(pagando)?.cartaoFinal}
            onFechar={() => setPagando(null)}
            onPago={() => {
              setPagando(null);
              setErro('');
            }}
          />,
          document.body
        )}
    </div>
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
            <button type="submit" form={id} disabled={salvando} className="btn btn-primario">
              {salvando ? 'Registrando…' : 'Registrar pagamento'}
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
          <select id={`${id}-forma`} required value={forma} onChange={(e) => setForma(e.target.value)} className={CLASSE_CAMPO}>
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
  const doMesmoAlvo = alvoFixo ? doMesmoAlvoFixo : alvo ? faturasDoAlvo(faturas, alvo) : [];
  const [sugerida] = useState(() => editando?.competencia || proximaCompetencia(doMesmoAlvo, periodicidade));
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
    if (!alvo && !avulsa) return setErro('Escolha de quem é a fatura (contrato, licença ou avulsa).');
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
              <select
                id={id('alvo')}
                value={alvoEscolhido}
                onChange={(e) => {
                  setAlvoEscolhido(e.target.value);
                  const c = contratos.find((x) => 'c:' + x.id === e.target.value);
                  const l = licenses.find((x) => 'l:' + x.id === e.target.value);
                  if (c) setValor(c.valor);
                  if (l) setValor(l.valorMensal);
                }}
                className={CLASSE_CAMPO}
              >
                <option value="">Escolha…</option>
                <option value="avulsa">Conta avulsa (sem contrato, licença ou pedido)</option>
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
