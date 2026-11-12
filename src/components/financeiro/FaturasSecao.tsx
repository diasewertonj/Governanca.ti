import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Paperclip, Plus, Receipt, Trash2, Upload, XCircle } from 'lucide-react';
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

interface FaturasSecaoProps {
  /** Licença OU contrato dono das faturas */
  alvo: AlvoFatura;
  /** Cobrança anual sugere a competência do ano seguinte */
  periodicidade: PeriodicidadeContrato;
  /** Valor cadastrado (licença: valor mensal; contrato: valor), sugerido na fatura nova */
  valorPadrao: number;
}

const COR_STATUS: Record<StatusExibidoFatura, string> = {
  vencida: 'text-red-700 bg-red-50 border-red-200',
  a_pagar: 'text-amber-800 bg-amber-50 border-amber-200',
  paga: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  cancelada: 'text-slate-600 bg-slate-100 border-slate-200',
};

const BOTAO_LINHA = 'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border';

/**
 * Fase 8: faturas de uma licença ou de um contrato (só a T.I.). Lista por
 * competência, total pago no ano, "+ Lançar fatura" (já preenchida com a
 * próxima competência e o valor cadastrado), "Marcar como paga" e "Cancelar
 * fatura". Excluir só para ti_admin. Nada grava sem o clique no botão.
 */
export const FaturasSecao: React.FC<FaturasSecaoProps> = ({ alvo, periodicidade, valorPadrao }) => {
  const { faturas, currentRole, alterarFatura, excluirFatura, anexarArquivoFatura } = useApp();
  const [lancando, setLancando] = useState(false);
  const [pagando, setPagando] = useState<{ id: string; data: string } | null>(null);
  // Arquivo de uma fatura já lançada sem arquivo: escolhe e só sobe ao clicar em "Enviar"
  const [anexando, setAnexando] = useState<{ id: string; arquivo: File | null; enviando: boolean } | null>(null);
  const [erro, setErro] = useState('');
  useRegistrarPendencias(`fatura-arquivo:${alvo.licencaId || alvo.contratoId}`, anexando?.arquivo ? ['Arquivo da fatura não enviado'] : []);

  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  if (!isTI) return null;

  const lista = faturasDoAlvo(faturas, alvo);
  const agora = new Date();
  const ano = agora.getFullYear();

  const confirmarPagamento = () => {
    if (!pagando) return;
    if (!pagando.data) return setErro('Fatura paga precisa da data de pagamento.');
    alterarFatura(pagando.id, { status: 'paga', pagoEm: pagando.data });
    setPagando(null);
    setErro('');
  };

  const cancelar = (f: Fatura) => {
    const aviso = `Cancelar a fatura de ${rotuloCompetencia(f.competencia)}?\n\nEla continua no histórico, mas deixa de contar como paga ou a pagar.`;
    if (window.confirm(aviso)) alterarFatura(f.id, { status: 'cancelada' });
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

  const excluir = (f: Fatura) => {
    if (window.confirm(`Excluir a fatura de ${rotuloCompetencia(f.competencia)}? Esta ação não pode ser desfeita.`)) {
      excluirFatura(f.id);
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-slate-600" aria-hidden="true" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Faturas</h3>
          <span className="text-xs text-slate-500">({lista.length})</span>
        </div>
        <span className="text-xs text-slate-600">
          Pago em {ano}: <span className="font-semibold font-mono text-slate-900">{formatCurrency(totalPagoNoAno(lista, ano))}</span>
        </span>
      </div>

      {lista.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma fatura lançada.</p>
      ) : (
        <table className="tabela-cartoes w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-xs tracking-wider">
              <th className="py-2 px-3">Competência</th>
              <th className="py-2 px-3">Valor</th>
              <th className="py-2 px-3">Vencimento</th>
              <th className="py-2 px-3">Status</th>
              <th className="hidden xl:table-cell py-2 px-3">Nº do documento</th>
              <th className="py-2 px-3">Arquivo</th>
              <th className="py-2 px-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {lista.map((f) => {
              const status = statusExibido(f, agora);
              return (
                <tr key={f.id} className={status === 'cancelada' ? 'opacity-60' : ''}>
                  <td data-label="Competência" className="py-2 px-3 font-semibold text-slate-900">
                    {rotuloCompetencia(f.competencia)}
                  </td>
                  <td data-label="Valor" className="py-2 px-3 font-mono text-slate-800">
                    {formatCurrency(f.valor)}
                  </td>
                  <td data-label="Vencimento" className="py-2 px-3">
                    {formatDate(f.vencimento)}
                  </td>
                  <td data-label="Status" className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium ${COR_STATUS[status]}`}>
                      {status === 'vencida' && <AlertTriangle className="w-3 h-3" aria-hidden="true" />}
                      {status === 'paga' && <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}
                      {ROTULO_STATUS_FATURA[status]}
                    </span>
                    {f.status === 'paga' && f.pagoEm && (
                      <span className="block text-slate-500 mt-0.5">em {formatDate(f.pagoEm)}</span>
                    )}
                  </td>
                  <td data-label="Nº do documento" className="hidden xl:table-cell py-2 px-3 font-mono break-all">
                    {f.numeroDocumento || '-'}
                  </td>
                  <td data-label="Arquivo" className="py-2 px-3 min-w-0">
                    {f.arquivoCaminho ? (
                      <AbrirArquivo caminho={f.arquivoCaminho} />
                    ) : anexando?.id === f.id ? (
                      <span className="flex flex-col gap-1.5 min-w-0">
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
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                          >
                            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                            {anexando.enviando ? 'Enviando...' : 'Enviar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAnexando(null);
                              setErro('');
                            }}
                            disabled={anexando.enviando}
                            className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md disabled:opacity-50"
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
                        className={`${BOTAO_LINHA} text-blue-700 bg-white border-blue-200 hover:bg-blue-50`}
                      >
                        <Paperclip className="w-3.5 h-3.5" aria-hidden="true" /> Anexar arquivo
                      </button>
                    )}
                  </td>
                  <td data-label="Ações" className="py-2 px-3 text-right">
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
                          className="text-xs px-2 py-1 bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={confirmarPagamento}
                          className="px-2 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPagando(null);
                            setErro('');
                          }}
                          className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                        >
                          Voltar
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {f.status === 'a_pagar' && (
                          <button
                            type="button"
                            onClick={() => setPagando({ id: f.id, data: isoLocal(new Date()) })}
                            className={`${BOTAO_LINHA} text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Marcar como paga
                          </button>
                        )}
                        {f.status !== 'cancelada' && (
                          <button
                            type="button"
                            onClick={() => cancelar(f)}
                            className={`${BOTAO_LINHA} text-slate-700 bg-white border-slate-200 hover:bg-slate-50`}
                          >
                            <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> Cancelar fatura
                          </button>
                        )}
                        {currentRole === 'ti_admin' && (
                          <button
                            type="button"
                            onClick={() => excluir(f)}
                            aria-label={`Excluir a fatura de ${rotuloCompetencia(f.competencia)}`}
                            className="p-1.5 text-red-700 hover:bg-red-50 rounded-md"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {erro && (
        <p className="text-xs font-medium text-red-700" role="alert">
          {erro}
        </p>
      )}

      {lancando ? (
        <FormFatura
          alvo={alvo}
          periodicidade={periodicidade}
          valorPadrao={valorPadrao}
          doMesmoAlvo={lista}
          onFechar={() => setLancando(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setLancando(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" /> Lançar fatura
        </button>
      )}
    </div>
  );
};

/** Formulário de fatura nova, já preenchido com a próxima competência, o valor e o vencimento no dia 10 */
const FormFatura: React.FC<{
  alvo: AlvoFatura;
  periodicidade: PeriodicidadeContrato;
  valorPadrao: number;
  doMesmoAlvo: Fatura[];
  onFechar: () => void;
}> = ({ alvo, periodicidade, valorPadrao, doMesmoAlvo, onFechar }) => {
  const { lancarFatura, anexarArquivoFatura } = useApp();
  const [sugerida] = useState(() => proximaCompetencia(doMesmoAlvo, periodicidade));
  const [competencia, setCompetencia] = useState(sugerida);
  const [valor, setValor] = useState(String(valorPadrao));
  const [vencimento, setVencimento] = useState(() => vencimentoSugerido(sugerida));
  const [vencimentoEditado, setVencimentoEditado] = useState(false);
  const [status, setStatus] = useState<Exclude<StatusFatura, 'cancelada'>>('a_pagar');
  const [pagoEm, setPagoEm] = useState('');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');

  const chave = alvo.licencaId ? `licenca:${alvo.licencaId}` : `contrato:${alvo.contratoId}`;
  const valores = JSON.stringify([competencia, valor, vencimento, status, pagoEm, numeroDocumento, observacoes]);
  const [valoresIniciais] = useState(valores);
  const pendenciasFatura = valores !== valoresIniciais || arquivo ? ['Fatura nova não lançada'] : [];
  useRegistrarPendencias(`fatura:${chave}`, pendenciasFatura);
  const cancelarDigitacao = () => {
    if (confirmarDescarte(pendenciasFatura)) onFechar();
  };

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

  const lancar = (e: React.FormEvent) => {
    e.preventDefault();
    const dados = {
      ...alvo,
      competencia,
      valor: valor === '' ? Number.NaN : Number(valor),
      vencimento,
      status,
      pagoEm: status === 'paga' ? pagoEm || undefined : undefined,
      numeroDocumento: numeroDocumento.trim() || undefined,
      observacoes: observacoes.trim() || undefined,
    };
    const problema = validarFatura({ id: '', ...dados }, doMesmoAlvo);
    if (problema) return setErro(problema);
    const nova = lancarFatura(dados);
    if (arquivo) void anexarArquivoFatura(nova.id, arquivo);
    onFechar();
  };

  const id = (campo: string) => `fatura-${chave}-${campo}`;

  return (
    <form onSubmit={lancar} className="border border-blue-200 bg-blue-50/40 rounded-lg p-3 space-y-3">
      <h4 className="text-xs font-bold text-blue-900">Lançar fatura</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
        {status === 'paga' && (
          <div>
            <label htmlFor={id('pago')} className={CLASSE_ROTULO}>
              Pago em *
            </label>
            <input
              id={id('pago')}
              type="date"
              required
              value={pagoEm}
              onChange={(e) => setPagoEm(e.target.value)}
              className={CLASSE_CAMPO}
            />
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
        <div className="md:col-span-3">
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
        <div className="md:col-span-3">
          <label htmlFor={id('obs')} className={CLASSE_ROTULO}>
            Observações
          </label>
          <textarea
            id={id('obs')}
            rows={2}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>
      </div>

      {erro && (
        <p className="text-xs font-medium text-red-700" role="alert">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={cancelarDigitacao}
          className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
        >
          Cancelar
        </button>
        <button type="submit" className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
          <Plus className="w-3.5 h-3.5" /> Lançar fatura
        </button>
      </div>
    </form>
  );
};
