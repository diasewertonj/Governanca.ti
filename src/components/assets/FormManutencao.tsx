import React, { useState } from 'react';
import { CheckCircle2, Save, Wrench, X, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Asset, CategoriaAnexoAtivo, DadosManutencao, Manutencao, TipoManutencao } from '../../types/index.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { contratosVigentesDoAtivo, nomeContrato } from '../../utils/contratos.ts';
import { ROTULO_TIPO_MANUTENCAO, statusAposManutencao } from '../../utils/cicloVida.ts';
import { formatCurrency, formatDate, isoLocal } from '../../utils/formatters.ts';
import { ArquivosParaEnviar, enviarArquivos, type ArquivoParaEnviar } from './ArquivosParaEnviar.tsx';

/** abrir = "Enviar para manutenção"; feita = histórico sem mudar o status; concluir/cancelar = encerrar a aberta */
export type ModoManutencao = 'abrir' | 'feita' | 'concluir' | 'cancelar';

const TITULO: Record<ModoManutencao, string> = {
  abrir: 'Enviar para manutenção',
  feita: 'Registrar manutenção já feita',
  concluir: 'Concluir manutenção',
  cancelar: 'Cancelar manutenção',
};

const CATEGORIAS_ABERTURA: CategoriaAnexoAtivo[] = ['orcamento', 'os', 'laudo', 'foto', 'outro'];
const CATEGORIAS_CONCLUSAO: CategoriaAnexoAtivo[] = ['os', 'laudo', 'orcamento', 'foto', 'outro'];

const ROTULO_RETORNO = { em_uso: 'Em uso', disponivel: 'Disponível' } as const;

/** Texto do campo de valor em número (vazio = sem valor) */
const valorDigitado = (v: string) => (v.trim() === '' ? undefined : Number(v));

interface FormManutencaoProps {
  asset: Asset;
  modo: ModoManutencao;
  /** A manutenção em andamento (concluir ou cancelar) */
  manutencao?: Manutencao;
  onClose: () => void;
}

/**
 * Fase 8: formulário de manutenção em tela cheia no celular (modal-tela).
 * Nada grava antes do clique no botão; os anexos sobem só depois que a
 * manutenção existe, ligados a ela.
 */
export const FormManutencao: React.FC<FormManutencaoProps> = ({ asset, modo, manutencao, onClose }) => {
  const {
    fornecedores,
    contratos,
    tickets,
    abrirManutencao,
    registrarManutencaoFeita,
    encerrarManutencao,
    anexarArquivoAtivo,
  } = useApp();
  const hoje = isoLocal(new Date());
  const encerrando = modo === 'concluir' || modo === 'cancelar';

  // Abrir / registrar já feita
  const [tipo, setTipo] = useState<TipoManutencao>(modo === 'feita' ? 'upgrade' : 'corretiva');
  const [fornecedorId, setFornecedorId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [numeroOs, setNumeroOs] = useState('');
  const [contratoId, setContratoId] = useState('');
  const [chamadoId, setChamadoId] = useState('');
  const [abertaEm, setAbertaEm] = useState(hoje);
  const [previsao, setPrevisao] = useState('');
  const [custo, setCusto] = useState(encerrando && manutencao ? String(manutencao.custo) : '');
  const [cobertoGarantia, setCobertoGarantia] = useState(false);
  // Conclusão (também a data da manutenção já feita)
  const [concluidaEm, setConcluidaEm] = useState(hoje);
  const [observacoes, setObservacoes] = useState('');
  const [anexos, setAnexos] = useState<ArquivoParaEnviar[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const opcoesFornecedor = fornecedores.filter((f) => f.ativo || f.id === fornecedorId);
  const opcoesContrato = contratosVigentesDoAtivo(asset.id, contratos);
  const chamadosDoAtivo = tickets
    .filter((t) => t.ativoId === asset.id)
    .sort((a, b) => b.dataCriacao.localeCompare(a.dataCriacao));
  const retorno = ROTULO_RETORNO[statusAposManutencao(asset)];

  const valores = JSON.stringify([tipo, fornecedorId, descricao, numeroOs, contratoId, chamadoId, abertaEm, previsao,
    custo, cobertoGarantia, concluidaEm, observacoes]);
  const [valoresIniciais] = useState(valores);
  const itensPendentes = valores !== valoresIniciais || anexos.length ? [`${TITULO[modo]} (${asset.tag}) não salvo`] : [];
  useRegistrarPendencias(`manutencao:${asset.id}:${modo}`, itensPendentes);

  const fechar = () => {
    if (!salvando && confirmarDescarte(itensPendentes)) onClose();
  };

  const mudarTipo = (novo: TipoManutencao) => {
    setTipo(novo);
    // Acionar a garantia é, por definição, coberto por ela
    if (novo === 'garantia') setCobertoGarantia(true);
  };

  const dadosManutencao = (): DadosManutencao => ({
    tipo,
    descricao,
    numeroOs: numeroOs || undefined,
    fornecedorId: fornecedorId || undefined,
    contratoId: contratoId || undefined,
    chamadoId: chamadoId || undefined,
    abertaEm,
    previsao: modo === 'abrir' ? previsao || undefined : undefined,
    custo: valorDigitado(custo) ?? 0,
    cobertoGarantia,
    observacoes: observacoes || undefined,
  });

  const gravar = async (): Promise<{ id?: string; erro?: string | null }> => {
    if (modo === 'abrir') return abrirManutencao(asset.id, dadosManutencao());
    if (modo === 'feita') return registrarManutencaoFeita(asset.id, { ...dadosManutencao(), concluidaEm });
    if (!manutencao) return { erro: 'Manutenção não encontrada.' };
    const erroEncerrar = await encerrarManutencao(manutencao.id, modo === 'concluir' ? 'concluida' : 'cancelada', {
      concluidaEm: modo === 'concluir' ? concluidaEm : undefined,
      custo: modo === 'concluir' ? valorDigitado(custo) : undefined,
      observacoes: observacoes || undefined,
    });
    return { id: manutencao.id, erro: erroEncerrar };
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    setErro('');
    setSalvando(true);
    const r = await gravar();
    if (r.erro || !r.id) {
      setErro(r.erro || 'Não foi possível salvar.');
      setSalvando(false);
      return;
    }
    // Os arquivos sobem só agora, ligados à manutenção salva
    await enviarArquivos(anexarArquivoAtivo, asset.id, anexos, { manutencaoId: r.id });
    onClose();
  };

  const id = (campo: string) => `manutencao-${asset.id}-${campo}`;
  const BotaoIcone = modo === 'concluir' ? CheckCircle2 : modo === 'cancelar' ? XCircle : modo === 'abrir' ? Wrench : Save;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id('titulo')}
        className="relative w-full max-w-2xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 sm:overflow-hidden my-0 sm:my-6"
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="min-w-0">
            <h2 id={id('titulo')} className="text-base font-semibold text-slate-900">
              {TITULO[modo]}
            </h2>
            <p className="text-xs text-slate-600 break-words">
              {asset.tag} · {asset.nome}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={fechar}
            className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={salvar} className="p-6 space-y-4 sm:max-h-[75vh] sm:overflow-y-auto">
          <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            {modo === 'abrir' && `O ativo fica "Em manutenção" até a conclusão. A custódia não muda.`}
            {modo === 'feita' && 'Lança no histórico um serviço já concluído (ex.: troca de SSD em março), sem mudar o status do ativo.'}
            {encerrando && `Ao ${modo === 'concluir' ? 'concluir' : 'cancelar'}, o ativo volta para "${retorno}".`}
          </p>

          {encerrando && manutencao && (
            <div className="text-xs text-slate-700 border border-slate-200 rounded-md px-3 py-2 space-y-0.5">
              <p className="font-semibold text-slate-900 break-words">
                {ROTULO_TIPO_MANUTENCAO[manutencao.tipo]} · {manutencao.descricao}
              </p>
              <p className="text-slate-600">
                Aberta em {formatDate(manutencao.abertaEm)}
                {manutencao.previsao ? ` · previsão ${formatDate(manutencao.previsao)}` : ''} · custo estimado{' '}
                {formatCurrency(manutencao.custo)}
              </p>
            </div>
          )}

          {!encerrando && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor={id('tipo')} className={CLASSE_ROTULO}>
                  Tipo *
                </label>
                <select id={id('tipo')} value={tipo} onChange={(e) => mudarTipo(e.target.value as TipoManutencao)} className={CLASSE_CAMPO}>
                  {(Object.keys(ROTULO_TIPO_MANUTENCAO) as TipoManutencao[]).map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO_MANUTENCAO[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={id('fornecedor')} className={CLASSE_ROTULO}>
                  Fornecedor
                </label>
                <select id={id('fornecedor')} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className={CLASSE_CAMPO}>
                  <option value="">T.I. interna (sem fornecedor)</option>
                  {opcoesFornecedor.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor={id('descricao')} className={CLASSE_ROTULO}>
                  Descrição *
                </label>
                <textarea
                  id={id('descricao')}
                  rows={2}
                  required
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder={modo === 'abrir' ? 'Ex.: tela piscando, troca do painel LCD' : 'Ex.: troca do SSD por 1 TB'}
                  className={CLASSE_CAMPO}
                />
              </div>
              <div>
                <label htmlFor={id('os')} className={CLASSE_ROTULO}>
                  Nº da OS ou protocolo
                </label>
                <input
                  id={id('os')}
                  type="text"
                  value={numeroOs}
                  onChange={(e) => setNumeroOs(e.target.value)}
                  className={`${CLASSE_CAMPO} font-mono`}
                />
              </div>
              <div>
                <label htmlFor={id('contrato')} className={CLASSE_ROTULO}>
                  Coberto por contrato
                </label>
                <select
                  id={id('contrato')}
                  value={contratoId}
                  onChange={(e) => setContratoId(e.target.value)}
                  disabled={opcoesContrato.length === 0}
                  aria-describedby={opcoesContrato.length === 0 ? id('contrato-ajuda') : undefined}
                  className={`${CLASSE_CAMPO} disabled:bg-slate-100 disabled:text-slate-600`}
                >
                  <option value="">— nenhum —</option>
                  {opcoesContrato.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nomeContrato(c)}
                    </option>
                  ))}
                </select>
                {opcoesContrato.length === 0 && (
                  <p id={id('contrato-ajuda')} className="text-xs text-slate-500 mt-1">
                    Nenhum contrato vigente cobre este ativo.
                  </p>
                )}
              </div>
              {chamadosDoAtivo.length > 0 && (
                <div className="md:col-span-2">
                  <label htmlFor={id('chamado')} className={CLASSE_ROTULO}>
                    Chamado de origem
                  </label>
                  <select id={id('chamado')} value={chamadoId} onChange={(e) => setChamadoId(e.target.value)} className={CLASSE_CAMPO}>
                    <option value="">— nenhum —</option>
                    {chamadosDoAtivo.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.codigo} · {t.titulo}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor={id('aberta')} className={CLASSE_ROTULO}>
                  Aberta em *
                </label>
                <input
                  id={id('aberta')}
                  type="date"
                  required
                  value={abertaEm}
                  onChange={(e) => setAbertaEm(e.target.value)}
                  className={CLASSE_CAMPO}
                />
              </div>
              {modo === 'abrir' ? (
                <div>
                  <label htmlFor={id('previsao')} className={CLASSE_ROTULO}>
                    Previsão de retorno
                  </label>
                  <input
                    id={id('previsao')}
                    type="date"
                    min={abertaEm || undefined}
                    value={previsao}
                    onChange={(e) => setPrevisao(e.target.value)}
                    className={CLASSE_CAMPO}
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor={id('concluida')} className={CLASSE_ROTULO}>
                    Concluída em *
                  </label>
                  <input
                    id={id('concluida')}
                    type="date"
                    required
                    min={abertaEm || undefined}
                    value={concluidaEm}
                    onChange={(e) => setConcluidaEm(e.target.value)}
                    className={CLASSE_CAMPO}
                  />
                </div>
              )}
              <div>
                <label htmlFor={id('custo')} className={CLASSE_ROTULO}>
                  {modo === 'abrir' ? 'Custo estimado (R$)' : 'Custo (R$)'}
                </label>
                <input
                  id={id('custo')}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={custo}
                  onChange={(e) => setCusto(e.target.value)}
                  placeholder="0,00"
                  className={`${CLASSE_CAMPO} font-mono`}
                />
              </div>
              <div className="flex items-center md:pt-5">
                <label htmlFor={id('garantia')} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    id={id('garantia')}
                    type="checkbox"
                    checked={cobertoGarantia}
                    onChange={(e) => setCobertoGarantia(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  Coberto pela garantia
                </label>
              </div>
            </div>
          )}

          {modo === 'concluir' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor={id('concluida')} className={CLASSE_ROTULO}>
                  Concluída em *
                </label>
                <input
                  id={id('concluida')}
                  type="date"
                  required
                  min={manutencao?.abertaEm}
                  value={concluidaEm}
                  onChange={(e) => setConcluidaEm(e.target.value)}
                  className={CLASSE_CAMPO}
                />
              </div>
              <div>
                <label htmlFor={id('custo')} className={CLASSE_ROTULO}>
                  Custo final (R$)
                </label>
                <input
                  id={id('custo')}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={custo}
                  onChange={(e) => setCusto(e.target.value)}
                  className={`${CLASSE_CAMPO} font-mono`}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor={id('obs')} className={CLASSE_ROTULO}>
              {modo === 'cancelar' ? 'Motivo do cancelamento' : 'Observações'}
            </label>
            <textarea
              id={id('obs')}
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder={modo === 'concluir' ? 'Ex.: painel trocado, testado com o usuário' : undefined}
              className={CLASSE_CAMPO}
            />
          </div>

          {modo !== 'cancelar' && (
            <ArquivosParaEnviar
              id={id('anexos')}
              rotulo="Anexos (orçamento, OS, laudo, nota de serviço, foto)"
              itens={anexos}
              onChange={setAnexos}
              categorias={modo === 'abrir' ? CATEGORIAS_ABERTURA : CATEGORIAS_CONCLUSAO}
            />
          )}

          {erro && (
            <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">
              {erro}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={fechar}
              disabled={salvando}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              {modo === 'cancelar' ? 'Voltar' : 'Cancelar'}
            </button>
            <button
              type="submit"
              disabled={salvando}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg shadow-xs transition-colors disabled:opacity-50 ${
                modo === 'cancelar' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <BotaoIcone className="w-3.5 h-3.5" aria-hidden="true" />
              {salvando ? 'Salvando...' : TITULO[modo]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
