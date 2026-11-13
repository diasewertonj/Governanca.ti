import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { SoftwareLicense } from '../../types/index.ts';
import { X, Key, Save, AlertCircle, Plus, FileText } from 'lucide-react';
import { FornecedorFormModal } from '../fornecedores/FornecedorFormModal.tsx';
import { contratoQuePagaLicenca, nomeContrato } from '../../utils/contratos.ts';
import { formatDate, isoLocal } from '../../utils/formatters.ts';
import { erroLicenca } from '../../utils/licencas.ts';

interface SoftwareFormModalProps {
  onClose: () => void;
  softwareToEdit?: SoftwareLicense | null;
}

const CAMPO =
  'w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500';
const ROTULO = 'block text-xs font-semibold text-slate-700 mb-1';
const SECAO = 'space-y-2 pt-3 border-t border-slate-100';
const TITULO = 'text-xs font-bold uppercase tracking-wider text-slate-500';

/**
 * Lote 1 (L1, L2, L5): identificação → fornecedor/contrato → assentos → custo e
 * renovação (só sem contrato) → painel → observações. Fornecedor só do cadastro
 * ("+ Novo fornecedor" na hora). Só fecha depois de o banco confirmar.
 */
export const SoftwareFormModal: React.FC<SoftwareFormModalProps> = ({ onClose, softwareToEdit }) => {
  const { cadastrarLicenca, editarLicenca, setSelectedSoftwareIdFor360, fornecedores, contratos } = useApp();

  const isEditing = Boolean(softwareToEdit);
  const emUso = softwareToEdit?.colaboradoresIds.length || 0;
  // L2: coberta por contrato de licenciamento vigente → custo e faturas pelo contrato
  const contratoPagador = softwareToEdit ? contratoQuePagaLicenca(softwareToEdit.id, contratos) : undefined;

  const [nome, setNome] = useState(softwareToEdit?.nome || '');
  const [chaveContrato, setChaveContrato] = useState(softwareToEdit?.chaveContrato || '');
  const [fornecedorId, setFornecedorId] = useState(softwareToEdit?.fornecedorId || '');
  const [novoFornecedor, setNovoFornecedor] = useState(false);
  const fornecedorCadastro = fornecedores.find((f) => f.id === fornecedorId);
  const opcoesFornecedor = fornecedores.filter((f) => f.ativo || f.id === fornecedorId);
  // Texto livre antigo: só exibido (dado legado) enquanto não houver vínculo
  const fornecedorLegado = !softwareToEdit?.fornecedorId ? softwareToEdit?.fornecedor : undefined;

  const [assentosTotais, setAssentosTotais] = useState<number>(softwareToEdit?.assentosTotais || 1);
  const [valorMensal, setValorMensal] = useState<number>(softwareToEdit?.valorMensal ?? 0);
  const [tipoCobranca, setTipoCobranca] = useState<'mensal' | 'anual'>(softwareToEdit?.tipoCobranca || 'mensal');
  const renovacaoInicial = softwareToEdit?.dataRenovacao || '';
  const [dataRenovacao, setDataRenovacao] = useState(renovacaoInicial);
  const [urlPainel, setUrlPainel] = useState(softwareToEdit?.urlPainel || '');
  const [observacoes, setObservacoes] = useState(softwareToEdit?.observacoes || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    const problema = erroLicenca(
      {
        nome,
        fornecedorId,
        assentosTotais: Number(assentosTotais),
        emUso,
        dataRenovacao,
        renovacaoMudou: dataRenovacao !== renovacaoInicial,
        pagaPorContrato: !!contratoPagador,
      },
      isoLocal(new Date())
    );
    if (problema) return setErrorMsg(problema);
    setErrorMsg(null);

    const dados = {
      nome: nome.trim(),
      // O texto passa a ser o nome do cadastro (é o que as outras telas mostram)
      fornecedor: fornecedorCadastro?.nome || '',
      fornecedorId,
      chaveContrato: chaveContrato.trim(),
      assentosTotais: Number(assentosTotais),
      // Com contrato, custo e renovação ficam como estavam (quem manda é o contrato)
      valorMensal: contratoPagador ? softwareToEdit?.valorMensal || 0 : Number(valorMensal) || 0,
      tipoCobranca: contratoPagador ? softwareToEdit?.tipoCobranca || 'mensal' : tipoCobranca,
      dataRenovacao: contratoPagador ? renovacaoInicial || contratoPagador.fim || isoLocal(new Date()) : dataRenovacao,
      urlPainel: urlPainel.trim() || undefined,
      observacoes: observacoes.trim() || undefined,
    };

    setSalvando(true);
    if (isEditing && softwareToEdit) {
      const falha = await editarLicenca(softwareToEdit.id, dados);
      setSalvando(false);
      if (falha) return setErrorMsg(`Não foi possível salvar: ${falha}`);
      onClose();
      setSelectedSoftwareIdFor360(softwareToEdit.id);
    } else {
      const { item, erro } = await cadastrarLicenca({ ...dados, colaboradoresIds: [] });
      setSalvando(false);
      if (!item) return setErrorMsg(`Não foi possível cadastrar: ${erro || 'erro desconhecido'}`);
      onClose();
      setSelectedSoftwareIdFor360(item.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
      <div className="relative w-full max-w-2xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 sm:overflow-hidden my-0 sm:my-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100/70 text-blue-700 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 leading-tight">
                {isEditing ? `Editar licença ${softwareToEdit?.nome}` : 'Nova licença / assinatura'}
              </h2>
              <p className="text-xs text-slate-500">Identificação, fornecedor, assentos e custo</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 sm:max-h-[75vh] sm:overflow-y-auto">
          {/* 1. Identificação */}
          <div className="space-y-2">
            <h3 className={TITULO}>Identificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label htmlFor="licenca-nome" className={ROTULO}>Nome do software *</label>
                <input
                  id="licenca-nome"
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Microsoft 365 E5, Figma, Slack"
                  className={CAMPO}
                />
              </div>
              <div>
                <label htmlFor="licenca-chave" className={ROTULO}>Chave / ID da assinatura</label>
                <input
                  id="licenca-chave"
                  type="text"
                  value={chaveContrato}
                  onChange={(e) => setChaveContrato(e.target.value)}
                  placeholder="Opcional"
                  className={`${CAMPO} font-mono`}
                />
              </div>
            </div>
          </div>

          {/* 2. Fornecedor e contrato */}
          <div className={SECAO}>
            <h3 className={TITULO}>Fornecedor e contrato</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="licenca-fornecedor" className={ROTULO}>Fornecedor *</label>
                <div className="flex gap-2">
                  <select
                    id="licenca-fornecedor"
                    value={fornecedorId}
                    onChange={(e) => setFornecedorId(e.target.value)}
                    className={CAMPO}
                  >
                    <option value="">Escolha…</option>
                    {opcoesFornecedor.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                        {f.ativo ? '' : ' (inativo)'}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setNovoFornecedor(true)}
                    className="shrink-0 flex items-center gap-1 px-2.5 text-xs font-semibold text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Novo
                  </button>
                </div>
                {fornecedorLegado && !fornecedorId && (
                  <p className="text-xs text-amber-800 mt-1">
                    Registro antigo: "{fornecedorLegado}" (texto). Escolha o fornecedor do cadastro para salvar.
                  </p>
                )}
              </div>
              <div>
                <span className={ROTULO}>Contrato de licenciamento</span>
                {contratoPagador ? (
                  <p className="flex items-start gap-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      Custo e faturas pelo contrato <strong>{nomeContrato(contratoPagador)}</strong>
                      {contratoPagador.fim ? ` (até ${formatDate(contratoPagador.fim)})` : ''}.
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 px-1 py-2">
                    Sem contrato: o custo e as faturas ficam na própria licença. Para cobrir por contrato, inclua a licença
                    no contrato de licenciamento (Fornecedores e contratos).
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 3. Assentos */}
          <div className={SECAO}>
            <h3 className={TITULO}>Assentos</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="licenca-assentos" className={ROTULO}>Total de assentos *</label>
                <input
                  id="licenca-assentos"
                  type="number"
                  min={Math.max(1, emUso)}
                  required
                  value={assentosTotais}
                  onChange={(e) => setAssentosTotais(Number(e.target.value))}
                  className={`${CAMPO} font-mono font-bold`}
                />
                <span className="text-xs text-slate-500 mt-0.5 block">
                  {isEditing ? `${emUso} em uso — o total não pode ficar abaixo disso` : 'Quantas pessoas podem usar'}
                </span>
              </div>
            </div>
          </div>

          {/* 4. Custo e renovação (só sem contrato) */}
          {!contratoPagador && (
            <div className={SECAO}>
              <h3 className={TITULO}>Custo e renovação</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="licenca-valor" className={ROTULO}>Valor (R$) *</label>
                  <div className="relative">
                    <input
                      id="licenca-valor"
                      type="number"
                      step="0.01"
                      min={0}
                      required
                      value={valorMensal}
                      onChange={(e) => setValorMensal(Number(e.target.value))}
                      className={`${CAMPO} font-mono pl-8`}
                    />
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-500">R$</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="licenca-cobranca" className={ROTULO}>Cobrança</label>
                  <select
                    id="licenca-cobranca"
                    value={tipoCobranca}
                    onChange={(e) => setTipoCobranca(e.target.value as 'mensal' | 'anual')}
                    className={CAMPO}
                  >
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="licenca-renovacao" className={ROTULO}>Próxima renovação *</label>
                  <input
                    id="licenca-renovacao"
                    type="date"
                    required
                    value={dataRenovacao}
                    onChange={(e) => setDataRenovacao(e.target.value)}
                    className={CAMPO}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 5. Painel */}
          <div className={SECAO}>
            <label htmlFor="licenca-painel" className={ROTULO}>Painel de administração (URL)</label>
            <input
              id="licenca-painel"
              type="url"
              value={urlPainel}
              onChange={(e) => setUrlPainel(e.target.value)}
              placeholder="https://admin.microsoft.com"
              className={CAMPO}
            />
          </div>

          {/* 6. Observações */}
          <div>
            <label htmlFor="licenca-obs" className={ROTULO}>Observações</label>
            <textarea
              id="licenca-obs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Revendedor, modelo de licenciamento, particularidades…"
              className={`${CAMPO} p-3`}
            />
          </div>

          {errorMsg && (
            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{salvando ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Cadastrar licença'}</span>
            </button>
          </div>
        </form>
      </div>

      {novoFornecedor && (
        <FornecedorFormModal onClose={() => setNovoFornecedor(false)} onSalvo={(f) => setFornecedorId(f.id)} />
      )}
    </div>
  );
};
