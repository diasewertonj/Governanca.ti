import React, { useState } from 'react';
import { FileSignature, Plus, Save, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { CategoriaDespesa, Contrato, FormaPagamento, Fornecedor, ItemContrato, Moeda, PeriodicidadeContrato, TipoContrato } from '../../types/index.ts';
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
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { validarArquivo } from '../../services/supabaseDb.ts';
import { formatDate, isoLocal } from '../../utils/formatters.ts';
import { ROTULO_PERIODICIDADE, ROTULO_TIPO_CONTRATO, TIPOS_QUE_COBREM, contratoVigente, nomeContrato } from '../../utils/contratos.ts';
import { AbrirArquivo } from '../comum/AbrirArquivo.tsx';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { CLASSE_ARQUIVO, CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { FornecedorFormModal } from './FornecedorFormModal.tsx';
import { SeletorItensContrato } from './SeletorItensContrato.tsx';
import { confirmar } from '../ui/dialogo.tsx';
import { CampoMoeda } from '../ui/Campos.tsx';
import { Janela } from '../ui/Janela.tsx';
import { Abas, type ItemAba } from '../ui/Abas.tsx';

interface ContratoFormModalProps {
  /** Quando informado, edita este contrato */
  contrato?: Contrato | null;
  /** Seção 6: contrato novo já preenchido (ex.: criado a partir do software) */
  inicial?: Partial<Contrato>;
  onClose: () => void;
}

/** Etapas do formulário (abas). A aba com erro ganha um ponto vermelho. */
type Etapa = 'dados' | 'pagamento' | 'itens' | 'arquivo';
const ETAPAS: { id: Etapa; rotulo: string }[] = [
  { id: 'dados', rotulo: '1. Dados' },
  { id: 'pagamento', rotulo: '2. Pagamento e renovação' },
  { id: 'itens', rotulo: '3. Itens cobertos' },
  { id: 'arquivo', rotulo: '4. Arquivo e observações' },
];

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SECAO = 'space-y-3 border-t border-slate-100 pt-4';
const GRADE = 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4';

/**
 * Fase 8 · Cadastro e edição do contrato (só a T.I.), em etapas. A ficha (resumo,
 * itens, linhas, faturas, anexos, histórico) fica em ContratoFicha. Excluir só para ti_admin.
 */
export const ContratoFormModal: React.FC<ContratoFormModalProps> = ({ contrato: contratoProp, inicial, onClose }) => {
  const contrato = contratoProp || undefined;
  const base: Partial<Contrato> = contrato ?? inicial ?? {};
  const { fornecedores, faturas, contratos, licenses, employees, currentRole, cadastrarContrato, editarContrato, excluirContrato, anexarArquivoContrato } =
    useApp();
  const { unidades, linhas } = useRecursos();

  const [fornecedorId, setFornecedorId] = useState(base.fornecedorId ?? '');
  const [tipo, setTipo] = useState<TipoContrato>(base.tipo ?? 'suporte');
  const [numero, setNumero] = useState(base.numero ?? '');
  const [descricao, setDescricao] = useState(base.descricao ?? '');
  const [inicio, setInicio] = useState(() => base.inicio ?? isoLocal(new Date()));
  const [fim, setFim] = useState(base.fim ?? '');
  const [valor, setValor] = useState<number | undefined>(base.valor);
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
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState('');
  const [erro, setErro] = useState('');
  const [novoFornecedor, setNovoFornecedor] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>('dados');
  // Depois da 1ª tentativa de salvar, o ponto vermelho da aba acompanha a correção
  const [tentouSalvar, setTentouSalvar] = useState(false);

  // Aviso ao fechar com alterações não salvas
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
    void confirmarDescarte(itensPendentes).then((ok) => ok && onClose());
  };

  // Inativos ficam fora da lista, exceto o fornecedor atual do contrato
  const opcoesFornecedor = fornecedores.filter((f) => f.ativo || f.id === fornecedorId);
  const exigeFim = TIPOS_QUE_COBREM.includes(tipo);
  const temDetalhes = !!CAMPOS_DETALHES[tipo] || TIPOS_COM_UNIDADE.includes(tipo);

  const escolherArquivo = (f: File | undefined) => {
    if (!f) return;
    const msg = validarArquivo(f);
    setErroArquivo(msg || '');
    setArquivo(msg ? null : f);
  };

  /** Primeiro problema do formulário e a etapa em que ele está */
  const validar = (): { etapa: Etapa; msg: string } | null => {
    const valorNumero = valor ?? 0;
    if (!fornecedorId) return { etapa: 'dados', msg: 'Escolha o fornecedor.' };
    if (!descricao.trim()) return { etapa: 'dados', msg: 'Informe a descrição do contrato.' };
    if (!inicio) return { etapa: 'dados', msg: 'Informe o início do contrato.' };
    if (fim && fim < inicio) return { etapa: 'dados', msg: 'O fim do contrato é anterior ao início.' };
    if (exigeFim && !fim)
      return { etapa: 'dados', msg: 'Informe o fim: em contratos de suporte e garantia estendida é ele que estende a cobertura dos equipamentos.' };
    if (!Number.isFinite(valorNumero) || valorNumero < 0) return { etapa: 'dados', msg: 'O valor não pode ser negativo.' };
    if (moeda !== 'BRL' && valorMoeda !== '' && (!Number.isFinite(Number(valorMoeda)) || Number(valorMoeda) < 0))
      return { etapa: 'pagamento', msg: `O valor em ${moeda} não pode ser negativo.` };
    if (formaPagamento === 'cartao' && cartaoFinal && !/^\d{4}$/.test(cartaoFinal)) return { etapa: 'pagamento', msg: 'Do cartão, informe só os 4 últimos dígitos.' };
    if (avisoDias !== '' && (!Number.isInteger(Number(avisoDias)) || Number(avisoDias) < 0))
      return { etapa: 'pagamento', msg: 'O aviso prévio para cancelar deve ser um número de dias (0 ou mais).' };
    return null;
  };
  const problema = tentouSalvar ? validar() : null;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    setTentouSalvar(true);
    const falhaValidacao = validar();
    if (falhaValidacao) {
      setErro('');
      setEtapa(falhaValidacao.etapa);
      return;
    }
    const valorNumero = valor ?? 0;
    // Seção 6: avisos de duplicidade e de fornecedor divergente (a pessoa decide)
    const mesmoNumero =
      numero.trim() &&
      contratos.find((c) => c.id !== contrato?.id && c.fornecedorId === fornecedorId && (c.numero || '').trim().toLowerCase() === numero.trim().toLowerCase());
    if (
      mesmoNumero &&
      !(await confirmar({
        titulo: 'Número de contrato repetido',
        mensagem: `Já existe o contrato ${nomeContrato(mesmoNumero)} deste fornecedor com o mesmo número. Salvar mesmo assim?`,
        confirmar: 'Salvar assim mesmo',
      }))
    ) {
      setEtapa('dados');
      return;
    }
    const licencasDoContrato = itens.filter((i) => i.licencaId).map((i) => licenses.find((l) => l.id === i.licencaId)).filter(Boolean) as typeof licenses;
    const jaPagas =
      tipo === 'licenciamento'
        ? licencasDoContrato.filter((l) =>
            contratos.some(
              (c) =>
                c.id !== contrato?.id &&
                c.tipo === 'licenciamento' &&
                contratoVigente(c) &&
                c.itens.some((i) => i.licencaId === l.id) &&
                c.renovadoDe !== contrato?.id &&
                contrato?.renovadoDe !== c.id
            )
          )
        : [];
    if (
      jaPagas.length &&
      !(await confirmar({
        titulo: 'Software já pago por outro contrato',
        mensagem: `Já pago por outro contrato vigente: ${jaPagas.map((l) => l.nome).join(', ')}. Salvar mesmo assim?`,
        confirmar: 'Salvar assim mesmo',
      }))
    ) {
      setEtapa('itens');
      return;
    }
    const divergentes = licencasDoContrato.filter((l) => l.fornecedorId && l.fornecedorId !== fornecedorId);
    if (
      divergentes.length &&
      !(await confirmar({
        titulo: 'Fornecedor diferente nos softwares',
        mensagem: `Estes softwares estão com outro fornecedor: ${divergentes.map((l) => l.nome).join(', ')}. Ajuste o fornecedor deles na ficha do software. Salvar o contrato assim mesmo?`,
        confirmar: 'Salvar assim mesmo',
      }))
    ) {
      setEtapa('itens');
      return;
    }

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
    const ok = await confirmar({
      titulo: `Excluir o contrato ${nomeContrato(contrato)}?`,
      mensagem: `Ele é apagado${contrato.arquivoCaminho ? ', junto com o arquivo do contrato,' : ''} e deixa de cobrir os itens. Não dá para desfazer: cadastre de novo se precisar. Para só parar de valer e manter o histórico, use Encerrar na ficha do contrato.`,
      confirmar: 'Excluir',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (!ok) return;
    const r = excluirContrato(contrato.id);
    if (r.success) onClose();
    else setErro(r.message || 'Não foi possível excluir o contrato.');
  };

  const abas: ItemAba<Etapa>[] = ETAPAS.map((e) => ({
    id: e.id,
    rotulo: e.rotulo,
    icone:
      problema?.etapa === e.id ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden="true" />
          <span className="sr-only">Com erro:</span>
        </>
      ) : undefined,
  }));
  const mensagemErro = problema?.msg || erro;
  const linhasDoContrato = contrato ? linhas.filter((l) => l.contratoId === contrato.id && l.status !== 'cancelada').length : 0;

  return (
    <>
      <Janela
        tamanho="g"
        titulo={contrato ? `Editar contrato ${nomeContrato(contrato)}` : 'Novo contrato'}
        subtitulo={contrato ? `${ROTULO_TIPO_CONTRATO[contrato.tipo]} · ${fornecedores.find((f) => f.id === contrato.fornecedorId)?.nome || 'Fornecedor'}` : 'Suporte, garantia estendida, locação, licenciamento, telefonia, internet e outros'}
        icone={<FileSignature className="ico" />}
        idTitulo="contrato-form-titulo"
        onFechar={fechar}
        faixa={<Abas itens={abas} ativa={etapa} onMudar={setEtapa} rotulo="Etapas do contrato" />}
        rodape={
          <>
            {contrato && currentRole === 'ti_admin' ? (
              <button type="button" onClick={excluir} className="btn btn-perigo">
                <Trash2 aria-hidden="true" /> Excluir
              </button>
            ) : (
              <span />
            )}
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={fechar} className="btn btn-secundario">
                Cancelar
              </button>
              <button type="submit" form="form-contrato" disabled={salvando} className="btn btn-primario">
                <Save aria-hidden="true" />
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </>
        }
      >
        {/* noValidate: a validação é a do sistema, que leva à etapa com problema */}
        <form id="form-contrato" onSubmit={salvar} noValidate className="space-y-4">
          {mensagemErro && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800" role="alert">
              {mensagemErro}
            </p>
          )}

          {etapa === 'dados' && (
            <>
              <div className="space-y-3">
                <h3 className="secao-titulo">Contrato</h3>
                <div className={GRADE}>
                  <div>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="ctr-fornecedor" className="font-semibold text-slate-700">
                        Fornecedor *
                      </label>
                      <button type="button" onClick={() => setNovoFornecedor(true)} className="link inline-flex items-center gap-0.5">
                        <Plus className="ico-sm" aria-hidden="true" /> Novo fornecedor
                      </button>
                    </div>
                    <select
                      id="ctr-fornecedor"
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
                    <select id="ctr-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoContrato)} className={CLASSE_CAMPO}>
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
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      placeholder="Ex.: Dell ProSupport, 20 notebooks"
                      className={CLASSE_CAMPO}
                    />
                  </div>
                </div>
              </div>

              <div className={SECAO}>
                <h3 className="secao-titulo">Vigência e valor</h3>
                <div className={GRADE}>
                  <div>
                    <label htmlFor="ctr-inicio" className={CLASSE_ROTULO}>
                      Início *
                    </label>
                    <input id="ctr-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={CLASSE_CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="ctr-fim" className={CLASSE_ROTULO}>
                      Fim{exigeFim ? ' *' : ''}
                    </label>
                    <input id="ctr-fim" type="date" min={inicio || undefined} value={fim} onChange={(e) => setFim(e.target.value)} className={CLASSE_CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="ctr-valor" className={CLASSE_ROTULO}>
                      Valor (R$)
                    </label>
                    <CampoMoeda id="ctr-valor" valor={valor} onMudar={setValor} className={CLASSE_CAMPO} />
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
                {exigeFim && <p className="ajuda">Enquanto vigente, o contrato estende a garantia dos equipamentos cobertos até a data de fim.</p>}
              </div>

              {/* Seção 6: detalhes próprios do tipo */}
              {temDetalhes && (
                <div className={SECAO}>
                  <h3 className="secao-titulo">Detalhes · {ROTULO_TIPO_CONTRATO[tipo]}</h3>
                  <div className={GRADE}>
                    {TIPOS_COM_UNIDADE.includes(tipo) && (
                      <div>
                        <label htmlFor="ctr-unidade" className={CLASSE_ROTULO}>
                          Unidade / endereço
                        </label>
                        <select id="ctr-unidade" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} className={CLASSE_CAMPO}>
                          <option value="">—</option>
                          {unidades
                            .filter((u) => u.ativo || u.id === unidadeId)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.nome}
                                {u.cidade ? ` · ${u.cidade}` : ''}
                              </option>
                            ))}
                        </select>
                        <p className="ajuda">As unidades são cadastradas em Configurações.</p>
                      </div>
                    )}
                    {(CAMPOS_DETALHES[tipo] || []).map((c) => (
                      <div key={c.chave}>
                        <label htmlFor={`ctr-det-${c.chave}`} className={CLASSE_ROTULO}>
                          {c.rotulo}
                        </label>
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
            </>
          )}

          {etapa === 'pagamento' && (
            <>
              <div className="space-y-3">
                <h3 className="secao-titulo">Pagamento</h3>
                <div className={GRADE}>
                  <div>
                    <label htmlFor="ctr-moeda" className={CLASSE_ROTULO}>
                      Moeda
                    </label>
                    <select id="ctr-moeda" value={moeda} onChange={(e) => setMoeda(e.target.value as Moeda)} className={CLASSE_CAMPO}>
                      <option value="BRL">Real (R$)</option>
                      <option value="USD">Dólar (US$)</option>
                      <option value="EUR">Euro (€)</option>
                    </select>
                  </div>
                  {moeda !== 'BRL' && (
                    <div>
                      <label htmlFor="ctr-vmoeda" className={CLASSE_ROTULO}>
                        Valor em {moeda}
                      </label>
                      <input
                        id="ctr-vmoeda"
                        type="number"
                        min={0}
                        step="0.01"
                        value={valorMoeda}
                        onChange={(e) => setValorMoeda(e.target.value)}
                        className={`${CLASSE_CAMPO} font-mono`}
                      />
                    </div>
                  )}
                  <div>
                    <label htmlFor="ctr-pgto" className={CLASSE_ROTULO}>
                      Forma de pagamento
                    </label>
                    <select id="ctr-pgto" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento | '')} className={CLASSE_CAMPO}>
                      <option value="">—</option>
                      {Object.entries(ROTULO_FORMA_PAGAMENTO).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  {formaPagamento === 'cartao' && currentRole !== 'ti_suporte' && (
                    <div>
                      <label htmlFor="ctr-cartao" className={CLASSE_ROTULO}>
                        Cartão (4 últimos dígitos)
                      </label>
                      <input
                        id="ctr-cartao"
                        inputMode="numeric"
                        maxLength={4}
                        value={cartaoFinal}
                        onChange={(e) => setCartaoFinal(e.target.value.replace(/\D/g, ''))}
                        className={`${CLASSE_CAMPO} font-mono`}
                      />
                    </div>
                  )}
                  {currentRole !== 'ti_suporte' && (
                    <div>
                      <label htmlFor="ctr-titular" className={CLASSE_ROTULO}>
                        Titular do pagamento
                      </label>
                      <input id="ctr-titular" value={titular} onChange={(e) => setTitular(e.target.value)} className={CLASSE_CAMPO} />
                    </div>
                  )}
                </div>
              </div>

              <div className={SECAO}>
                <h3 className="secao-titulo">Renovação e reajuste</h3>
                <div className={GRADE}>
                  <div>
                    <label htmlFor="ctr-aviso" className={CLASSE_ROTULO}>
                      Aviso prévio para cancelar (dias)
                    </label>
                    <input
                      id="ctr-aviso"
                      type="number"
                      min={0}
                      value={avisoDias}
                      onChange={(e) => setAvisoDias(e.target.value)}
                      placeholder="Ex.: 30"
                      className={CLASSE_CAMPO}
                    />
                    {fim && avisoDias && <p className="ajuda">Cancelar até {formatDate(dataLimiteCancelamento(fim, Number(avisoDias)))}</p>}
                  </div>
                  <div>
                    <label htmlFor="ctr-reajuste" className={CLASSE_ROTULO}>
                      Reajuste (índice)
                    </label>
                    <input id="ctr-reajuste" value={reajusteIndice} onChange={(e) => setReajusteIndice(e.target.value)} placeholder="Ex.: IPCA" className={CLASSE_CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="ctr-reajuste-mes" className={CLASSE_ROTULO}>
                      Mês do reajuste
                    </label>
                    <select id="ctr-reajuste-mes" value={reajusteMes} onChange={(e) => setReajusteMes(e.target.value)} className={CLASSE_CAMPO}>
                      <option value="">—</option>
                      {MESES.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ctr-multa" className={CLASSE_ROTULO}>
                      Multa por cancelamento
                    </label>
                    <input id="ctr-multa" value={multa} onChange={(e) => setMulta(e.target.value)} placeholder="Ex.: 20% do restante" className={CLASSE_CAMPO} />
                  </div>
                  <label className="inline-flex items-center gap-2 text-slate-700 md:col-span-2 xl:col-span-4">
                    <input type="checkbox" checked={renovacaoAutomatica} onChange={(e) => setRenovacaoAutomatica(e.target.checked)} /> Renova
                    automaticamente se ninguém cancelar
                  </label>
                </div>
              </div>

              <div className={SECAO}>
                <h3 className="secao-titulo">Responsável e despesa</h3>
                <div className={GRADE}>
                  <div>
                    <label htmlFor="ctr-resp" className={CLASSE_ROTULO}>
                      Responsável interno
                    </label>
                    <select id="ctr-resp" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className={CLASSE_CAMPO}>
                      <option value="">—</option>
                      {employees
                        .filter((p) => p.status !== 'desligado' || p.id === responsavelId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome}
                          </option>
                        ))}
                    </select>
                    <p className="ajuda">Recebe os avisos do contrato.</p>
                  </div>
                  <div>
                    <label htmlFor="ctr-cc" className={CLASSE_ROTULO}>
                      Área / centro de custo
                    </label>
                    <input id="ctr-cc" value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)} className={CLASSE_CAMPO} />
                  </div>
                  <div>
                    <label htmlFor="ctr-cat" className={CLASSE_ROTULO}>
                      Categoria da despesa
                    </label>
                    <select
                      id="ctr-cat"
                      value={categoria || CATEGORIA_DO_TIPO[tipo]}
                      onChange={(e) => setCategoria(e.target.value as CategoriaDespesa)}
                      className={CLASSE_CAMPO}
                    >
                      {Object.entries(ROTULO_CATEGORIA).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          {etapa === 'itens' && (
            <>
              <div className="space-y-3">
                <h3 className="secao-titulo">Itens cobertos</h3>
                <SeletorItensContrato itens={itens} onChange={setItens} fornecedorId={fornecedorId} />
                {TIPOS_COM_LINHAS.includes(tipo) && (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 texto-aux">
                    {contrato
                      ? `Linhas deste contrato: ${linhasDoContrato}. Para incluir ou alterar linhas, use Inventário › Linhas telefônicas.`
                      : 'Depois de cadastrar, inclua as linhas em Inventário › Linhas telefônicas, escolhendo este contrato.'}
                  </p>
                )}
              </div>

              <div className={SECAO}>
                <h3 className="secao-titulo">Atendimento</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
            </>
          )}

          {etapa === 'arquivo' && (
            <div className="space-y-3">
              <h3 className="secao-titulo">Arquivo principal e observações</h3>
              <div>
                <label htmlFor="ctr-arquivo" className={CLASSE_ROTULO}>
                  Arquivo do contrato (PDF)
                </label>
                {contrato?.arquivoCaminho && (
                  <p className="mb-1 flex flex-wrap items-center gap-1 texto-aux">
                    Atual: <AbrirArquivo caminho={contrato.arquivoCaminho} />
                  </p>
                )}
                <input id="ctr-arquivo" type="file" accept="application/pdf" onChange={(e) => escolherArquivo(e.target.files?.[0])} className={CLASSE_ARQUIVO} />
                {arquivo && !erroArquivo && <p className="ajuda">Escolhido: {arquivo.name}</p>}
                {erroArquivo ? (
                  <p className="erro" role="alert">
                    {erroArquivo}
                  </p>
                ) : (
                  <p className="ajuda">
                    {contrato?.arquivoCaminho
                      ? 'Um arquivo novo substitui o atual ao salvar. Propostas, aditivos e notas vão na aba Anexos da ficha.'
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
                  rows={4}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Ex.: reajuste anual pelo IPCA; multa de 20% na rescisão antecipada."
                  className={CLASSE_CAMPO}
                />
              </div>
            </div>
          )}
        </form>
      </Janela>

      {/* Fora da janela do contrato: o fundo desfocado prenderia a janela nova na rolagem */}
      {novoFornecedor && <FornecedorFormModal onClose={() => setNovoFornecedor(false)} onSalvo={(f: Fornecedor) => setFornecedorId(f.id)} />}
    </>
  );
};
