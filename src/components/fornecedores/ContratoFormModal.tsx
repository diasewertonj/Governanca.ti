import React, { useState } from 'react';
import { Ban, FileSignature, Plus, RefreshCw, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { CategoriaDespesa, Contrato, FormaPagamento, Fornecedor, ItemContrato, Moeda, PeriodicidadeContrato, TipoAnexoContrato, TipoContrato } from '../../types/index.ts';
import { useRecursos } from '../../context/RecursosContext.tsx';
import {
  CAMPOS_DETALHES,
  CATEGORIA_DO_TIPO,
  ROTULO_CATEGORIA,
  ROTULO_FORMA_PAGAMENTO,
  TIPOS_COM_LINHAS,
  TIPOS_COM_UNIDADE,
  dataLimiteCancelamento,
} from '../../utils/financeiro.ts';
import { contratoVigente } from '../../utils/contratos.ts';
import { LinhasLista } from './LinhasLista.tsx';
import { HistoricoAlteracoes } from '../comum/HistoricoAlteracoes.tsx';
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
import { confirmar } from '../ui/dialogo.tsx';

interface ContratoFormModalProps {
  /** Quando informado, edita este contrato e mostra o vencimento e as faturas */
  contrato?: Contrato | null;
  /** Seção 6: contrato novo já preenchido (ex.: criado a partir do software) */
  inicial?: Partial<Contrato>;
  onClose: () => void;
}

const ROTULO_ANEXO: Record<TipoAnexoContrato, string> = { proposta: 'Proposta', contrato: 'Contrato', aditivo: 'Aditivo', nota: 'Nota fiscal', outro: 'Outro' };

const SECAO = 'secao-titulo';

/** Fase 8: cadastro e ficha do contrato (só a T.I.). Excluir só para ti_admin. */
export const ContratoFormModal: React.FC<ContratoFormModalProps> = ({ contrato: contratoProp, inicial, onClose }) => {
  const contrato = contratoProp || undefined;
  const base: Partial<Contrato> = contrato ?? inicial ?? {};
  const {
    fornecedores,
    faturas,
    contratos,
    licenses,
    employees,
    encerrarContrato,
    reabrirContrato,
    renovarContrato,
    currentRole,
    cadastrarContrato,
    editarContrato,
    excluirContrato,
    anexarArquivoContrato,
    podeDescartarPendencias,
  } = useApp();

  const { unidades, anexosContrato, anexarContrato, removerAnexoContrato, linhas } = useRecursos();
  const [fornecedorId, setFornecedorId] = useState(base.fornecedorId ?? '');
  const [tipo, setTipo] = useState<TipoContrato>(base.tipo ?? 'suporte');
  const [numero, setNumero] = useState(base.numero ?? '');
  const [descricao, setDescricao] = useState(base.descricao ?? '');
  const [inicio, setInicio] = useState(() => base.inicio ?? isoLocal(new Date()));
  const [fim, setFim] = useState(base.fim ?? '');
  const [valor, setValor] = useState(base.valor !== undefined ? String(base.valor) : '');
  const [periodicidade, setPeriodicidade] = useState<PeriodicidadeContrato>(base.periodicidade ?? 'mensal');
  const [sla, setSla] = useState(base.sla ?? '');
  const [contatoSuporte, setContatoSuporte] = useState(base.contatoSuporte ?? '');
  const [itens, setItens] = useState<ItemContrato[]>(base.itens ?? []);
  const [observacoes, setObservacoes] = useState(base.observacoes ?? '');
  // Seção 6: detalhes do tipo, pagamento, renovação, reajuste, responsável e área
  const [detalhes, setDetalhes] = useState<Record<string, string>>(base.detalhes ?? {});
  const [unidadeId, setUnidadeId] = useState(base.unidadeId ?? '');
  const [moeda, setMoeda] = useState<Moeda>(base.pagamento?.moeda ?? 'BRL');
  const [valorMoeda, setValorMoeda] = useState(base.pagamento?.valorMoeda != null ? String(base.pagamento.valorMoeda) : '');
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | ''>(base.pagamento?.formaPagamento ?? '');
  const [cartaoFinal, setCartaoFinal] = useState(base.pagamento?.cartaoFinal ?? '');
  const [titular, setTitular] = useState(base.pagamento?.titular ?? '');
  const [renovacaoAutomatica, setRenovacaoAutomatica] = useState(!!base.pagamento?.renovacaoAutomatica);
  const [avisoDias, setAvisoDias] = useState(base.pagamento?.avisoCancelamentoDias != null ? String(base.pagamento.avisoCancelamentoDias) : '');
  const [reajusteIndice, setReajusteIndice] = useState(base.reajusteIndice ?? '');
  const [reajusteMes, setReajusteMes] = useState(base.reajusteMes != null ? String(base.reajusteMes) : '');
  const [multa, setMulta] = useState(base.multaCancelamento ?? '');
  const [responsavelId, setResponsavelId] = useState(base.responsavelId ?? '');
  const [centroCusto, setCentroCusto] = useState(base.centroCusto ?? '');
  const [categoria, setCategoria] = useState<CategoriaDespesa | ''>(base.categoriaDespesa ?? '');
  // Encerrar / renovar / anexos (só no contrato já gravado)
  const [acao, setAcao] = useState<null | 'encerrar' | 'renovar'>(null);
  const [motivoEncerrar, setMotivoEncerrar] = useState('');
  const [renovacao, setRenovacao] = useState({ inicio: '', fim: '', valor: '', numero: '' });
  const [anexoTipo, setAnexoTipo] = useState<TipoAnexoContrato>('contrato');
  const [anexoArquivo, setAnexoArquivo] = useState<File | null>(null);
  const [anexoDescricao, setAnexoDescricao] = useState('');
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState('');
  const [erro, setErro] = useState('');
  const [novoFornecedor, setNovoFornecedor] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Aviso ao fechar com alterações não salvas (inclui o rascunho de fatura, que se registra sozinho)
  const valores = JSON.stringify([fornecedorId, tipo, numero, descricao, inicio, fim, valor, periodicidade, sla,
    contatoSuporte, itens, observacoes, detalhes, unidadeId, moeda, valorMoeda, formaPagamento, cartaoFinal, titular,
    renovacaoAutomatica, avisoDias, reajusteIndice, reajusteMes, multa, responsavelId, centroCusto, categoria]);
  const [valoresIniciais] = useState(valores);
  const itensPendentes =
    valores !== valoresIniciais || arquivo
      ? [contrato ? `Edição do contrato ${nomeContrato(contrato)} não salva` : 'Contrato novo não cadastrado']
      : [];
  useRegistrarPendencias(contrato ? `contrato:${contrato.id}` : 'novo-contrato', itensPendentes);

  const fechar = () => {
    void podeDescartarPendencias().then((ok) => ok && onClose());
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

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;
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
    if (formaPagamento === 'cartao' && cartaoFinal && !/^\d{4}$/.test(cartaoFinal)) return setErro('Do cartão, informe só os 4 últimos dígitos.');
    // Seção 6: avisos de duplicidade e de fornecedor divergente (a pessoa decide)
    const mesmoNumero = numero.trim() && contratos.find((c) => c.id !== contrato?.id && c.fornecedorId === fornecedorId && (c.numero || '').trim().toLowerCase() === numero.trim().toLowerCase());
    if (mesmoNumero && !(await confirmar(`Já existe o contrato ${nomeContrato(mesmoNumero)} deste fornecedor com o mesmo número. Salvar mesmo assim?`))) return;
    const licencasDoContrato = itens.filter((i) => i.licencaId).map((i) => licenses.find((l) => l.id === i.licencaId)).filter(Boolean) as typeof licenses;
    const jaPagas = tipo === 'licenciamento'
      ? licencasDoContrato.filter((l) => contratos.some((c) => c.id !== contrato?.id && c.tipo === 'licenciamento' && contratoVigente(c) && c.itens.some((i) => i.licencaId === l.id) && c.renovadoDe !== contrato?.id && contrato?.renovadoDe !== c.id))
      : [];
    if (jaPagas.length && !(await confirmar(`Já pago por outro contrato vigente: ${jaPagas.map((l) => l.nome).join(', ')}. Salvar mesmo assim?`))) return;
    const divergentes = licencasDoContrato.filter((l) => l.fornecedorId && l.fornecedorId !== fornecedorId);
    if (divergentes.length && !(await confirmar(`Estes softwares estão com outro fornecedor: ${divergentes.map((l) => l.nome).join(', ')}. Ajuste o fornecedor deles na ficha do software. Salvar o contrato assim mesmo?`))) return;

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
      detalhes: Object.fromEntries(Object.entries(detalhes).filter(([, v]) => v.trim())),
      unidadeId: TIPOS_COM_UNIDADE.includes(tipo) ? unidadeId || undefined : undefined,
      pagamento: {
        moeda,
        valorMoeda: moeda !== 'BRL' && valorMoeda !== '' ? Number(valorMoeda) : undefined,
        formaPagamento: formaPagamento || undefined,
        cartaoFinal: formaPagamento === 'cartao' ? cartaoFinal || undefined : undefined,
        titular: titular.trim() || undefined,
        renovacaoAutomatica,
        avisoCancelamentoDias: avisoDias === '' ? undefined : Number(avisoDias),
      },
      reajusteIndice: reajusteIndice.trim() || undefined,
      reajusteMes: reajusteMes === '' ? undefined : Number(reajusteMes),
      multaCancelamento: multa.trim() || undefined,
      responsavelId: responsavelId || undefined,
      centroCusto: centroCusto.trim() || undefined,
      categoriaDespesa: (categoria || CATEGORIA_DO_TIPO[tipo]) as CategoriaDespesa,
      status: contrato?.status ?? 'ativo',
    };
    // Lote 1: só fecha depois do banco confirmar; se recusar, o digitado continua aqui
    setErro('');
    setSalvando(true);
    let id = contrato?.id;
    if (contrato) {
      const falha = await editarContrato(contrato.id, dados);
      if (falha) {
        setSalvando(false);
        return setErro(`Não foi possível salvar: ${falha}`);
      }
    } else {
      const { item, erro: falha } = await cadastrarContrato(dados);
      if (!item) {
        setSalvando(false);
        return setErro(`Não foi possível cadastrar: ${falha || 'erro desconhecido'}`);
      }
      id = item.id;
    }
    setSalvando(false);
    if (arquivo && id) void anexarArquivoContrato(id, arquivo);
    onClose();
  };

  const excluir = async () => {
    if (!contrato) return;
    const qtdFaturas = faturas.filter((f) => f.contratoId === contrato.id).length;
    if (qtdFaturas > 0) {
      setErro(`O contrato tem ${qtdFaturas} fatura(s) lançada(s) e não pode ser excluído. As faturas guardam o histórico de custo.`);
      return;
    }
    if (!(await confirmar(`Excluir o contrato ${nomeContrato(contrato)}? Esta ação não pode ser desfeita.`))) return;
    const r = excluirContrato(contrato.id);
    if (r.success) onClose();
    else setErro(r.message || 'Não foi possível excluir o contrato.');
  };

  const situacao = contrato ? situacaoContrato(contrato) : null;

  return (
    <>
      <div className="janela-fundo modal-tela">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contrato-titulo"
          className="janela janela-ficha"
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
                      : situacao?.situacao === 'a_iniciar'
                      ? `Começa em ${formatDate(contrato.inicio)}${contrato.fim ? ` e vai até ${formatDate(contrato.fim)}` : ''}`
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
              className="btn-icone shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-5 sm:max-h-[85vh] sm:overflow-y-auto">
            <form id="form-contrato" onSubmit={salvar} className="space-y-5">
              {/* 1. Contrato */}
              <div className="space-y-3">
                <h3 className={SECAO}>1. Contrato</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
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
                      onChange={(e) => {
                        setTipo(e.target.value as TipoContrato);
                        if (!categoria) setCategoria('');
                      }}
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

              {/* Seção 6: detalhes próprios do tipo */}
              {(CAMPOS_DETALHES[tipo] || TIPOS_COM_UNIDADE.includes(tipo)) && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <h3 className={SECAO}>Detalhes · {ROTULO_TIPO_CONTRATO[tipo]}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    {TIPOS_COM_UNIDADE.includes(tipo) && (
                      <div>
                        <label htmlFor="ctr-unidade" className={CLASSE_ROTULO}>Unidade / endereço</label>
                        <select id="ctr-unidade" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} className={CLASSE_CAMPO}>
                          <option value="">—</option>
                          {unidades.filter((u) => u.ativo || u.id === unidadeId).map((u) => (
                            <option key={u.id} value={u.id}>{u.nome}{u.cidade ? ` · ${u.cidade}` : ''}</option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">Unidades são cadastradas em Contratos › Unidades.</p>
                      </div>
                    )}
                    {(CAMPOS_DETALHES[tipo] || []).map((c) => (
                      <div key={c.chave}>
                        <label htmlFor={`ctr-det-${c.chave}`} className={CLASSE_ROTULO}>{c.rotulo}</label>
                        <input
                          id={`ctr-det-${c.chave}`}
                          value={detalhes[c.chave] || ''}
                          onChange={(e) => setDetalhes({ ...detalhes, [c.chave]: e.target.value })}
                          placeholder={c.dica}
                          className={CLASSE_CAMPO}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Seção 6: pagamento, renovação, reajuste e responsável */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h3 className={SECAO}>Pagamento e renovação</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  <div>
                    <label htmlFor="ctr-moeda" className={CLASSE_ROTULO}>Moeda</label>
                    <select id="ctr-moeda" value={moeda} onChange={(e) => setMoeda(e.target.value as Moeda)} className={CLASSE_CAMPO}>
                      <option value="BRL">Real (R$)</option>
                      <option value="USD">Dólar (US$)</option>
                      <option value="EUR">Euro (€)</option>
                    </select>
                  </div>
                  {moeda !== 'BRL' && (
                    <div>
                      <label htmlFor="ctr-vmoeda" className={CLASSE_ROTULO}>Valor em {moeda}</label>
                      <input id="ctr-vmoeda" type="number" min={0} step="0.01" value={valorMoeda} onChange={(e) => setValorMoeda(e.target.value)} className={`${CLASSE_CAMPO} font-mono`} />
                    </div>
                  )}
                  <div>
                    <label htmlFor="ctr-pgto" className={CLASSE_ROTULO}>Forma de pagamento</label>
                    <select id="ctr-pgto" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento | '')} className={CLASSE_CAMPO}>
                      <option value="">—</option>
                      {Object.entries(ROTULO_FORMA_PAGAMENTO).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  {formaPagamento === 'cartao' && (
                    <div>
                      <label htmlFor="ctr-cartao" className={CLASSE_ROTULO}>Cartão (4 últimos dígitos)</label>
                      <input id="ctr-cartao" inputMode="numeric" maxLength={4} value={cartaoFinal} onChange={(e) => setCartaoFinal(e.target.value.replace(/\D/g, ''))} className={`${CLASSE_CAMPO} font-mono`} />
                    </div>
                  )}
                  <div>
                    <label htmlFor="ctr-titular" className={CLASSE_ROTULO}>Titular do pagamento</label>
                    <input id="ctr-titular" value={titular} onChange={(e) => setTitular(e.target.value)} className={CLASSE_CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="ctr-aviso" className={CLASSE_ROTULO}>Aviso prévio para cancelar (dias)</label>
                    <input id="ctr-aviso" type="number" min={0} value={avisoDias} onChange={(e) => setAvisoDias(e.target.value)} placeholder="Ex.: 30" className={CLASSE_CAMPO} />
                    {fim && avisoDias && (
                      <p className="text-xs text-slate-500 mt-1">Cancelar até {formatDate(dataLimiteCancelamento(fim, Number(avisoDias)))}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="ctr-reajuste" className={CLASSE_ROTULO}>Reajuste (índice)</label>
                    <input id="ctr-reajuste" value={reajusteIndice} onChange={(e) => setReajusteIndice(e.target.value)} placeholder="Ex.: IPCA" className={CLASSE_CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="ctr-reajuste-mes" className={CLASSE_ROTULO}>Mês do reajuste</label>
                    <select id="ctr-reajuste-mes" value={reajusteMes} onChange={(e) => setReajusteMes(e.target.value)} className={CLASSE_CAMPO}>
                      <option value="">—</option>
                      {['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].map((m, i) => (
                        <option key={m} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ctr-multa" className={CLASSE_ROTULO}>Multa por cancelamento</label>
                    <input id="ctr-multa" value={multa} onChange={(e) => setMulta(e.target.value)} placeholder="Ex.: 20% do restante" className={CLASSE_CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="ctr-resp" className={CLASSE_ROTULO}>Responsável interno</label>
                    <select id="ctr-resp" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className={CLASSE_CAMPO}>
                      <option value="">—</option>
                      {employees.filter((e) => e.status !== 'desligado' || e.id === responsavelId).map((e) => (
                        <option key={e.id} value={e.id}>{e.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ctr-cc" className={CLASSE_ROTULO}>Área / centro de custo</label>
                    <input id="ctr-cc" value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)} className={CLASSE_CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="ctr-cat" className={CLASSE_ROTULO}>Categoria da despesa</label>
                    <select id="ctr-cat" value={categoria || CATEGORIA_DO_TIPO[tipo]} onChange={(e) => setCategoria(e.target.value as CategoriaDespesa)} className={CLASSE_CAMPO}>
                      {Object.entries(ROTULO_CATEGORIA).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 md:col-span-3 xl:col-span-4">
                    <input type="checkbox" checked={renovacaoAutomatica} onChange={(e) => setRenovacaoAutomatica(e.target.checked)} /> Renova automaticamente se ninguém cancelar
                  </label>
                </div>
              </div>

              {/* 3. Suporte */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h3 className={SECAO}>3. Atendimento</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
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
                <SeletorItensContrato itens={itens} onChange={setItens} fornecedorId={fornecedorId} />
                {TIPOS_COM_LINHAS.includes(tipo) && (
                  <p className="text-xs text-slate-500">
                    {contrato
                      ? `Linhas deste contrato: ${linhas.filter((l) => l.contratoId === contrato.id && l.status !== 'cancelada').length} (gerencie abaixo).`
                      : 'Depois de cadastrar, inclua as linhas na parte Linhas deste contrato.'}
                  </p>
                )}
              </div>

              {/* 5. Arquivo e observações */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h3 className={SECAO}>5. Arquivo principal e observações</h3>
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

            {/* Seção 6: encerrar, reabrir e renovar */}
            {contrato && (
              <div className="space-y-2 p-3 rounded-lg border border-slate-200 text-xs">
                {contrato.status === 'encerrado' ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-700">
                      Encerrado em <strong>{formatDate(contrato.encerradoEm)}</strong>
                      {contrato.encerramentoMotivo ? ` · ${contrato.encerramentoMotivo}` : ''}
                    </span>
                    {currentRole === 'ti_admin' && (
                      <button type="button" onClick={async () => setErro((await reabrirContrato(contrato.id)) || '')} className="btn btn-secundario btn-sm">
                        <RotateCcw className="w-3.5 h-3.5" /> Reabrir
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAcao('renovar');
                        const ini = contrato.fim ? isoLocal(new Date(`${contrato.fim}T12:00:00`)) : isoLocal(new Date());
                        const d = new Date(`${ini}T12:00:00`);
                        d.setDate(d.getDate() + 1);
                        const novoIni = isoLocal(d);
                        const novoFim = new Date(d);
                        novoFim.setFullYear(novoFim.getFullYear() + 1);
                        novoFim.setDate(novoFim.getDate() - 1);
                        setRenovacao({ inicio: novoIni, fim: isoLocal(novoFim), valor: String(contrato.valor), numero: '' });
                      }}
                      className="btn btn-secundario btn-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Renovar contrato
                    </button>
                    <button type="button" onClick={() => setAcao('encerrar')} className="btn btn-secundario btn-sm">
                      <Ban className="w-3.5 h-3.5" /> Encerrar
                    </button>
                    {contrato.renovadoDe && <span className="text-slate-500 self-center">Renovação de {nomeContrato(contratos.find((c) => c.id === contrato.renovadoDe) || { descricao: 'contrato anterior' })}</span>}
                  </div>
                )}
                {acao === 'encerrar' && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-48">
                      <label htmlFor="ctr-motivo-enc" className={CLASSE_ROTULO}>Motivo do encerramento *</label>
                      <input id="ctr-motivo-enc" value={motivoEncerrar} onChange={(e) => setMotivoEncerrar(e.target.value)} className={CLASSE_CAMPO} />
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const falha = await encerrarContrato(contrato.id, motivoEncerrar);
                        if (falha) return setErro(falha);
                        setAcao(null);
                        onClose();
                      }}
                      className="px-3 py-2 font-semibold text-white bg-slate-800 rounded-lg"
                    >
                      Confirmar encerramento
                    </button>
                    <button type="button" onClick={() => setAcao(null)} className="btn btn-secundario">Voltar</button>
                  </div>
                )}
                {acao === 'renovar' && (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                    <div>
                      <label htmlFor="ren-ini" className={CLASSE_ROTULO}>Novo início *</label>
                      <input id="ren-ini" type="date" value={renovacao.inicio} onChange={(e) => setRenovacao({ ...renovacao, inicio: e.target.value })} className={CLASSE_CAMPO} />
                    </div>
                    <div>
                      <label htmlFor="ren-fim" className={CLASSE_ROTULO}>Novo fim</label>
                      <input id="ren-fim" type="date" value={renovacao.fim} onChange={(e) => setRenovacao({ ...renovacao, fim: e.target.value })} className={CLASSE_CAMPO} />
                    </div>
                    <div>
                      <label htmlFor="ren-valor" className={CLASSE_ROTULO}>Valor (R$)</label>
                      <input id="ren-valor" type="number" min={0} step="0.01" value={renovacao.valor} onChange={(e) => setRenovacao({ ...renovacao, valor: e.target.value })} className={CLASSE_CAMPO} />
                    </div>
                    <div>
                      <label htmlFor="ren-num" className={CLASSE_ROTULO}>Número novo</label>
                      <input id="ren-num" value={renovacao.numero} onChange={(e) => setRenovacao({ ...renovacao, numero: e.target.value })} placeholder={contrato.numero || ''} className={CLASSE_CAMPO} />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await renovarContrato(contrato.id, renovacao.inicio, renovacao.fim || undefined, Number(renovacao.valor) || 0, renovacao.numero || undefined);
                          if (r.erro) return setErro(r.erro);
                          setAcao(null);
                          onClose();
                        }}
                        className="btn btn-primario"
                      >
                        Renovar
                      </button>
                      <button type="button" onClick={() => setAcao(null)} className="btn btn-secundario">Voltar</button>
                    </div>
                    <p className="md:col-span-5 text-slate-500">Cria um contrato novo com os mesmos itens e linhas; este termina na véspera do novo início e fica no histórico.</p>
                  </div>
                )}
              </div>
            )}

            {/* Seção 6: linhas do contrato de telefonia */}
            {contrato && TIPOS_COM_LINHAS.includes(contrato.tipo) && (
              <div className="space-y-2">
                <h3 className={SECAO}>Linhas</h3>
                <LinhasLista contratoId={contrato.id} />
              </div>
            )}

            {/* Seção 6: vários anexos (proposta, contrato, aditivos, notas) */}
            {contrato && (
              <div className="space-y-2 p-3 rounded-lg border border-slate-200">
                <h3 className={SECAO}>Anexos</h3>
                {anexosContrato.filter((a) => a.contratoId === contrato.id).length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum anexo além do arquivo principal.</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {anexosContrato
                      .filter((a) => a.contratoId === contrato.id)
                      .map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{ROTULO_ANEXO[a.tipo]}</span>
                          {a.descricao && <span className="text-slate-600">{a.descricao}</span>}
                          <span className="text-slate-500">{formatDate(a.criadoEm.slice(0, 10))}</span>
                          <AbrirArquivo caminho={a.arquivoCaminho} />
                          <button
                            type="button"
                            onClick={async () => {
                              if ((await confirmar('Remover este anexo?'))) setErro((await removerAnexoContrato(a.id)) || '');
                            }}
                            aria-label="Remover anexo"
                            className="btn-icone btn-icone-perigo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                  <div>
                    <label htmlFor="anx-tipo" className={CLASSE_ROTULO}>Tipo</label>
                    <select id="anx-tipo" value={anexoTipo} onChange={(e) => setAnexoTipo(e.target.value as TipoAnexoContrato)} className={CLASSE_CAMPO}>
                      {Object.entries(ROTULO_ANEXO).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="anx-desc" className={CLASSE_ROTULO}>Descrição</label>
                    <input id="anx-desc" value={anexoDescricao} onChange={(e) => setAnexoDescricao(e.target.value)} className={CLASSE_CAMPO} placeholder="Ex.: 1º aditivo" />
                  </div>
                  <div>
                    <label htmlFor="anx-arq" className={CLASSE_ROTULO}>Arquivo</label>
                    <input id="anx-arq" type="file" onChange={(e) => setAnexoArquivo(e.target.files?.[0] || null)} className={CLASSE_ARQUIVO} />
                  </div>
                  <button
                    type="button"
                    disabled={!anexoArquivo || enviandoAnexo}
                    onClick={async () => {
                      if (!anexoArquivo) return;
                      const msg = validarArquivo(anexoArquivo);
                      if (msg) return setErro(msg);
                      setEnviandoAnexo(true);
                      const falha = await anexarContrato(contrato.id, anexoArquivo, anexoTipo, anexoDescricao);
                      setEnviandoAnexo(false);
                      if (falha) return setErro(falha);
                      setAnexoArquivo(null);
                      setAnexoDescricao('');
                    }}
                    className="btn btn-secundario"
                  >
                    {enviandoAnexo ? 'Enviando…' : 'Anexar'}
                  </button>
                </div>
              </div>
            )}

            {contrato && <HistoricoAlteracoes entidade="contratos" registro={contrato.id} />}

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
                className="btn btn-perigo"
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
                className="btn btn-secundario"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="form-contrato"
                disabled={salvando}
                className="btn btn-primario"
              >
                <Save className="w-3.5 h-3.5" />
                {salvando ? 'Salvando…' : contrato ? 'Salvar alterações' : 'Cadastrar contrato'}
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
