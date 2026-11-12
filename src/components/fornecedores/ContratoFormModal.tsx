import React, { useState } from 'react';
import { FileSignature, Plus, Save, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Contrato, Fornecedor, ItemContrato, PeriodicidadeContrato, TipoContrato } from '../../types/index.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { validarArquivo } from '../../services/supabaseDb.ts';
import { formatDate, isoLocal } from '../../utils/formatters.ts';
import {
  ROTULO_PERIODICIDADE,
  ROTULO_TIPO_CONTRATO,
  TIPOS_QUE_COBREM,
  nomeContrato,
  situacaoContrato,
} from '../../utils/contratos.ts';
import { AbrirArquivo } from '../comum/AbrirArquivo.tsx';
import { CLASSE_ARQUIVO, CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { FaturasSecao } from '../financeiro/FaturasSecao.tsx';
import { FornecedorFormModal } from './FornecedorFormModal.tsx';
import { LembreteContrato } from './LembreteContrato.tsx';
import { SeletorItensContrato } from './SeletorItensContrato.tsx';

interface ContratoFormModalProps {
  /** Quando informado, edita este contrato e mostra o vencimento e as faturas */
  contrato?: Contrato;
  onClose: () => void;
}

const SECAO = 'text-xs font-bold uppercase tracking-wider text-slate-500';

/** Fase 8: cadastro e ficha do contrato (só a T.I.). Excluir só para ti_admin. */
export const ContratoFormModal: React.FC<ContratoFormModalProps> = ({ contrato, onClose }) => {
  const {
    fornecedores,
    faturas,
    currentRole,
    criarContrato,
    alterarContrato,
    excluirContrato,
    anexarArquivoContrato,
    podeDescartarPendencias,
  } = useApp();

  const [fornecedorId, setFornecedorId] = useState(contrato?.fornecedorId ?? '');
  const [tipo, setTipo] = useState<TipoContrato>(contrato?.tipo ?? 'suporte');
  const [numero, setNumero] = useState(contrato?.numero ?? '');
  const [descricao, setDescricao] = useState(contrato?.descricao ?? '');
  const [inicio, setInicio] = useState(() => contrato?.inicio ?? isoLocal(new Date()));
  const [fim, setFim] = useState(contrato?.fim ?? '');
  const [valor, setValor] = useState(contrato ? String(contrato.valor) : '');
  const [periodicidade, setPeriodicidade] = useState<PeriodicidadeContrato>(contrato?.periodicidade ?? 'mensal');
  const [sla, setSla] = useState(contrato?.sla ?? '');
  const [contatoSuporte, setContatoSuporte] = useState(contrato?.contatoSuporte ?? '');
  const [itens, setItens] = useState<ItemContrato[]>(contrato?.itens ?? []);
  const [observacoes, setObservacoes] = useState(contrato?.observacoes ?? '');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState('');
  const [erro, setErro] = useState('');
  const [novoFornecedor, setNovoFornecedor] = useState(false);

  // Aviso ao fechar com alterações não salvas (inclui o rascunho de fatura, que se registra sozinho)
  const valores = JSON.stringify([fornecedorId, tipo, numero, descricao, inicio, fim, valor, periodicidade, sla,
    contatoSuporte, itens, observacoes]);
  const [valoresIniciais] = useState(valores);
  const itensPendentes =
    valores !== valoresIniciais || arquivo
      ? [contrato ? `Edição do contrato ${nomeContrato(contrato)} não salva` : 'Contrato novo não cadastrado']
      : [];
  useRegistrarPendencias(contrato ? `contrato:${contrato.id}` : 'novo-contrato', itensPendentes);

  const fechar = () => {
    if (podeDescartarPendencias()) onClose();
  };

  // Inativos ficam fora da lista, exceto o fornecedor atual do contrato
  const opcoesFornecedor = fornecedores.filter((f) => f.ativo || f.id === fornecedorId);
  const exigeFim = TIPOS_QUE_COBREM.includes(tipo);

  const escolherArquivo = (f: File | undefined) => {
    if (!f) return;
    const msg = validarArquivo(f);
    setErroArquivo(msg || '');
    setArquivo(msg ? null : f);
  };

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const valorNumero = valor === '' ? 0 : Number(valor);
    const problema = !fornecedorId
      ? 'Escolha o fornecedor.'
      : !descricao.trim()
      ? 'Informe a descrição do contrato.'
      : !inicio
      ? 'Informe o início do contrato.'
      : fim && fim < inicio
      ? 'O fim do contrato é anterior ao início.'
      : exigeFim && !fim
      ? 'Informe o fim: em contratos de suporte e garantia estendida é ele que estende a cobertura dos equipamentos.'
      : !Number.isFinite(valorNumero) || valorNumero < 0
      ? 'O valor não pode ser negativo.'
      : '';
    if (problema) return setErro(problema);

    const dados = {
      fornecedorId,
      tipo,
      numero: numero.trim() || undefined,
      descricao: descricao.trim(),
      inicio,
      fim: fim || undefined,
      valor: valorNumero,
      periodicidade,
      sla: sla.trim() || undefined,
      contatoSuporte: contatoSuporte.trim() || undefined,
      itens,
      observacoes: observacoes.trim() || undefined,
    };
    const id = contrato ? contrato.id : criarContrato(dados).id;
    if (contrato) alterarContrato(contrato.id, dados);
    if (arquivo) void anexarArquivoContrato(id, arquivo);
    onClose();
  };

  const excluir = () => {
    if (!contrato) return;
    const qtdFaturas = faturas.filter((f) => f.contratoId === contrato.id).length;
    if (qtdFaturas > 0) {
      setErro(`O contrato tem ${qtdFaturas} fatura(s) lançada(s) e não pode ser excluído. As faturas guardam o histórico de custo.`);
      return;
    }
    if (!window.confirm(`Excluir o contrato ${nomeContrato(contrato)}? Esta ação não pode ser desfeita.`)) return;
    const r = excluirContrato(contrato.id);
    if (r.success) onClose();
    else setErro(r.message || 'Não foi possível excluir o contrato.');
  };

  const situacao = contrato ? situacaoContrato(contrato) : null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contrato-titulo"
          className="relative w-full max-w-3xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 sm:overflow-hidden my-0 sm:my-6"
        >
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/70">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-100/70 text-blue-700 flex items-center justify-center">
                <FileSignature className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 id="contrato-titulo" className="text-sm font-semibold text-slate-900 break-words">
                  {contrato ? `Contrato ${nomeContrato(contrato)}` : 'Novo contrato'}
                </h2>
                <p className="text-xs text-slate-500">
                  {contrato
                    ? situacao?.situacao === 'encerrado'
                      ? `Encerrado em ${formatDate(contrato.fim)}`
                      : contrato.fim
                      ? `Vigente até ${formatDate(contrato.fim)}`
                      : 'Sem data de fim'
                    : 'Suporte, garantia estendida, locação, licenciamento e outros'}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={fechar}
              className="p-1.5 shrink-0 text-slate-500 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-5 sm:max-h-[75vh] sm:overflow-y-auto">
            <form id="form-contrato" onSubmit={salvar} className="space-y-5">
              {/* 1. Contrato */}
              <div className="space-y-3">
                <h3 className={SECAO}>1. Contrato</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <label htmlFor="ctr-fornecedor" className="text-xs font-semibold text-slate-700">
                        Fornecedor *
                      </label>
                      <button
                        type="button"
                        onClick={() => setNovoFornecedor(true)}
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 hover:underline"
                      >
                        <Plus className="w-3 h-3" /> novo fornecedor
                      </button>
                    </div>
                    <select
                      id="ctr-fornecedor"
                      required
                      value={fornecedorId}
                      onChange={(e) => setFornecedorId(e.target.value)}
                      className={CLASSE_CAMPO}
                    >
                      <option value="">Escolha o fornecedor...</option>
                      {opcoesFornecedor.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                          {f.ativo ? '' : ' (inativo)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ctr-tipo" className={CLASSE_ROTULO}>
                      Tipo *
                    </label>
                    <select
                      id="ctr-tipo"
                      value={tipo}
                      onChange={(e) => setTipo(e.target.value as TipoContrato)}
                      className={CLASSE_CAMPO}
                    >
                      {(Object.keys(ROTULO_TIPO_CONTRATO) as TipoContrato[]).map((t) => (
                        <option key={t} value={t}>
                          {ROTULO_TIPO_CONTRATO[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ctr-numero" className={CLASSE_ROTULO}>
                      Número
                    </label>
                    <input
                      id="ctr-numero"
                      type="text"
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      placeholder="Ex.: #CT-88"
                      className={`${CLASSE_CAMPO} font-mono`}
                    />
                  </div>
                  <div>
                    <label htmlFor="ctr-descricao" className={CLASSE_ROTULO}>
                      Descrição *
                    </label>
                    <input
                      id="ctr-descricao"
                      type="text"
                      required
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      placeholder="Ex.: Dell ProSupport, 20 notebooks"
                      className={CLASSE_CAMPO}
                    />
                  </div>
                </div>
              </div>

              {/* 2. Vigência e valor */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h3 className={SECAO}>2. Vigência e valor</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label htmlFor="ctr-inicio" className={CLASSE_ROTULO}>
                      Início *
                    </label>
                    <input
                      id="ctr-inicio"
                      type="date"
                      required
                      value={inicio}
                      onChange={(e) => setInicio(e.target.value)}
                      className={CLASSE_CAMPO}
                    />
                  </div>
                  <div>
                    <label htmlFor="ctr-fim" className={CLASSE_ROTULO}>
                      Fim{exigeFim ? ' *' : ''}
                    </label>
                    <input
                      id="ctr-fim"
                      type="date"
                      required={exigeFim}
                      min={inicio || undefined}
                      value={fim}
                      onChange={(e) => setFim(e.target.value)}
                      className={CLASSE_CAMPO}
                    />
                  </div>
                  <div>
                    <label htmlFor="ctr-valor" className={CLASSE_ROTULO}>
                      Valor (R$)
                    </label>
                    <input
                      id="ctr-valor"
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      placeholder="0,00"
                      className={`${CLASSE_CAMPO} font-mono`}
                    />
                  </div>
                  <div>
                    <label htmlFor="ctr-periodicidade" className={CLASSE_ROTULO}>
                      Periodicidade
                    </label>
                    <select
                      id="ctr-periodicidade"
                      value={periodicidade}
                      onChange={(e) => setPeriodicidade(e.target.value as PeriodicidadeContrato)}
                      className={CLASSE_CAMPO}
                    >
                      {(Object.keys(ROTULO_PERIODICIDADE) as PeriodicidadeContrato[]).map((p) => (
                        <option key={p} value={p}>
                          {ROTULO_PERIODICIDADE[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {exigeFim && (
                  <p className="text-xs text-slate-500">
                    Enquanto vigente, o contrato estende a garantia dos equipamentos cobertos até a data de fim.
                  </p>
                )}
              </div>

              {/* 3. Suporte */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h3 className={SECAO}>3. Atendimento</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="ctr-sla" className={CLASSE_ROTULO}>
                      SLA
                    </label>
                    <input
                      id="ctr-sla"
                      type="text"
                      value={sla}
                      onChange={(e) => setSla(e.target.value)}
                      placeholder="Ex.: atendimento no local em até 1 dia útil"
                      className={CLASSE_CAMPO}
                    />
                  </div>
                  <div>
                    <label htmlFor="ctr-contato" className={CLASSE_ROTULO}>
                      Contato do suporte
                    </label>
                    <input
                      id="ctr-contato"
                      type="text"
                      value={contatoSuporte}
                      onChange={(e) => setContatoSuporte(e.target.value)}
                      placeholder="Ex.: 0800 970 3355 · suporte@fornecedor.com"
                      className={CLASSE_CAMPO}
                    />
                  </div>
                </div>
              </div>

              {/* 4. Itens cobertos */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h3 className={SECAO}>4. Itens cobertos</h3>
                <SeletorItensContrato itens={itens} onChange={setItens} />
              </div>

              {/* 5. Arquivo e observações */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h3 className={SECAO}>5. Arquivo e observações</h3>
                <div>
                  <label htmlFor="ctr-arquivo" className={CLASSE_ROTULO}>
                    Arquivo do contrato (PDF)
                  </label>
                  {contrato?.arquivoCaminho && (
                    <p className="mb-1 flex flex-wrap items-center gap-1 text-xs text-slate-600">
                      Atual: <AbrirArquivo caminho={contrato.arquivoCaminho} />
                    </p>
                  )}
                  <input
                    id="ctr-arquivo"
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => escolherArquivo(e.target.files?.[0])}
                    className={CLASSE_ARQUIVO}
                  />
                  {erroArquivo ? (
                    <p className="mt-1 text-xs text-red-700" role="alert">
                      {erroArquivo}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      {contrato?.arquivoCaminho
                        ? 'Um arquivo novo substitui o atual ao salvar.'
                        : 'Até 10 MB. O arquivo sobe ao salvar e só a T.I. abre.'}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="ctr-obs" className={CLASSE_ROTULO}>
                    Observações
                  </label>
                  <textarea
                    id="ctr-obs"
                    rows={3}
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Ex.: reajuste anual pelo IPCA; multa de 20% na rescisão antecipada."
                    className={CLASSE_CAMPO}
                  />
                </div>
              </div>
            </form>

            {/* Ficha do contrato já gravado: vencimento */}
            {contrato && contrato.fim && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs">
                <span className="text-slate-700">
                  {situacao?.situacao === 'encerrado' ? 'Venceu em ' : 'Vence em '}
                  <span className="font-semibold text-slate-900">{formatDate(contrato.fim)}</span>
                  {situacao?.situacao === 'vencendo' && situacao.dias !== undefined && (
                    <span className="font-semibold text-amber-700">
                      {' '}
                      · {situacao.dias === 0 ? 'hoje' : `em ${situacao.dias} dia(s)`}
                    </span>
                  )}
                </span>
                <LembreteContrato contrato={contrato} />
              </div>
            )}

            {/* Faturas do contrato gravado (o valor e a periodicidade sugeridos são os já salvos) */}
            {contrato && (
              <FaturasSecao
                alvo={{ contratoId: contrato.id }}
                periodicidade={contrato.periodicidade}
                valorPadrao={contrato.valor}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-t border-slate-200 bg-white">
            {erro ? (
              <p className="w-full text-xs font-medium text-red-700" role="alert">
                {erro}
              </p>
            ) : null}
            {contrato && currentRole === 'ti_admin' ? (
              <button
                type="button"
                onClick={excluir}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir contrato
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={fechar}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="form-contrato"
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {contrato ? 'Salvar alterações' : 'Cadastrar contrato'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fora da janela do contrato: o fundo desfocado prenderia a janela nova na rolagem */}
      {novoFornecedor && (
        <FornecedorFormModal onClose={() => setNovoFornecedor(false)} onSalvo={(f: Fornecedor) => setFornecedorId(f.id)} />
      )}
    </>
  );
};
