import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { SoftwareLicense } from '../../types/index.ts';
import { X, Key, Save, AlertCircle } from 'lucide-react';

interface SoftwareFormModalProps {
  onClose: () => void;
  softwareToEdit?: SoftwareLicense | null;
}

export const SoftwareFormModal: React.FC<SoftwareFormModalProps> = ({ onClose, softwareToEdit }) => {
  const { addLicense, updateLicense, setSelectedSoftwareIdFor360, fornecedores } = useApp();

  const isEditing = Boolean(softwareToEdit);

  const [nome, setNome] = useState(softwareToEdit?.nome || '');
  // Fase 8: fornecedor do cadastro; o texto antigo fica como reserva enquanto não houver vínculo
  const [fornecedorId, setFornecedorId] = useState(softwareToEdit?.fornecedorId || '');
  const [fornecedor, setFornecedor] = useState(softwareToEdit?.fornecedor || '');
  const fornecedorCadastro = fornecedores.find((f) => f.id === fornecedorId);
  const opcoesFornecedor = fornecedores.filter((f) => f.ativo || f.id === fornecedorId);
  const [chaveContrato, setChaveContrato] = useState(() =>
    softwareToEdit?.chaveContrato || `CTR-SaaS-${Date.now().toString().slice(-4)}`
  );
  const [assentosTotais, setAssentosTotais] = useState<number>(softwareToEdit?.assentosTotais || 10);
  const [valorMensal, setValorMensal] = useState<number>(softwareToEdit?.valorMensal || 500);
  const [tipoCobranca, setTipoCobranca] = useState<'mensal' | 'anual'>(
    softwareToEdit?.tipoCobranca || 'mensal'
  );
  const [dataRenovacao, setDataRenovacao] = useState(() =>
    softwareToEdit?.dataRenovacao ||
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [urlPainel, setUrlPainel] = useState(softwareToEdit?.urlPainel || '');
  const [observacoes, setObservacoes] = useState(softwareToEdit?.observacoes || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Com vínculo, o texto passa a ser o nome do cadastro (é o que as outras telas mostram)
    const nomeFornecedor = fornecedorCadastro ? fornecedorCadastro.nome : fornecedor.trim();
    if (!nome.trim() || !nomeFornecedor || !chaveContrato.trim()) {
      setErrorMsg('Preencha os campos obrigatórios.');
      return;
    }

    if (assentosTotais < 1) {
      setErrorMsg('A quantidade total de assentos deve ser no mínimo 1.');
      return;
    }

    if (isEditing && softwareToEdit) {
      if (assentosTotais < softwareToEdit.colaboradoresIds.length) {
        setErrorMsg(
          `O total de assentos (${assentosTotais}) não pode ser inferior aos colaboradores já alocados (${softwareToEdit.colaboradoresIds.length}).`
        );
        return;
      }

      updateLicense(softwareToEdit.id, {
        nome: nome.trim(),
        fornecedor: nomeFornecedor,
        fornecedorId: fornecedorId || undefined,
        chaveContrato: chaveContrato.trim(),
        assentosTotais: Number(assentosTotais),
        valorMensal: Number(valorMensal),
        tipoCobranca,
        dataRenovacao,
        urlPainel: urlPainel.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
      });

      onClose();
      setSelectedSoftwareIdFor360(softwareToEdit.id);
    } else {
      const created = addLicense({
        nome: nome.trim(),
        fornecedor: nomeFornecedor,
        fornecedorId: fornecedorId || undefined,
        chaveContrato: chaveContrato.trim(),
        assentosTotais: Number(assentosTotais),
        colaboradoresIds: [],
        valorMensal: Number(valorMensal),
        tipoCobranca,
        dataRenovacao,
        urlPainel: urlPainel.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
      });

      onClose();
      setSelectedSoftwareIdFor360(created.id);
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
                {isEditing ? 'Editar Software / Assinatura SaaS' : 'Cadastrar Nova Assinatura de Software / SaaS'}
              </h2>
              <p className="text-xs text-slate-500">
                Parâmetros contratuais, teto de assentos e dados de faturamento
              </p>
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

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 sm:max-h-[75vh] sm:overflow-y-auto">
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Identificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Software / Sistema SaaS *
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Microsoft 365 E5, Figma Enterprise, Slack"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="licenca-fornecedor" className="block text-xs font-semibold text-slate-700 mb-1">
                  Fornecedor *
                </label>
                <select
                  id="licenca-fornecedor"
                  value={fornecedorId}
                  onChange={(e) => setFornecedorId(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Sem vínculo (informar o nome)</option>
                  {opcoesFornecedor.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                      {f.ativo ? '' : ' (inativo)'}
                    </option>
                  ))}
                </select>
              </div>

              {!fornecedorId && (
                <div>
                  <label htmlFor="licenca-fornecedor-texto" className="block text-xs font-semibold text-slate-700 mb-1">
                    Fornecedor (texto) *
                  </label>
                  <input
                    id="licenca-fornecedor-texto"
                    type="text"
                    required
                    value={fornecedor}
                    onChange={(e) => setFornecedor(e.target.value)}
                    placeholder="Ex: Microsoft, Google, Adobe, Atlassian"
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-500 mt-0.5 block">
                    Cadastre o fornecedor em "Fornecedores e contratos" para vinculá-lo.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Chave de Contrato / ID da Assinatura *
                </label>
                <input
                  type="text"
                  required
                  value={chaveContrato}
                  onChange={(e) => setChaveContrato(e.target.value)}
                  className="w-full text-xs font-mono font-bold px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  URL do Painel / Console de Administração Web
                </label>
                <input
                  type="url"
                  value={urlPainel}
                  onChange={(e) => setUrlPainel(e.target.value)}
                  placeholder="https://admin.microsoft.com ou https://admin.google.com"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Contrato e custo</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantidade Total de Assentos *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={assentosTotais}
                  onChange={(e) => setAssentosTotais(Number(e.target.value))}
                  className="w-full text-xs font-mono font-bold px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-500 mt-0.5 block">
                  Teto máximo de colaboradores
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Data de Renovação / Vigência *
                </label>
                <input
                  type="date"
                  required
                  value={dataRenovacao}
                  onChange={(e) => setDataRenovacao(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Periodicidade de Cobrança
                </label>
                <select
                  value={tipoCobranca}
                  onChange={(e) => setTipoCobranca(e.target.value as 'mensal' | 'anual')}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  <option value="mensal">Mensal (Faturamento Recorrente)</option>
                  <option value="anual">Anual (Contrato Fechado)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Valor Financeiro (R$) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={valorMensal}
                    onChange={(e) => setValorMensal(Number(e.target.value))}
                    className="w-full text-xs font-mono font-semibold pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-500">R$</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Observações / Cláusulas Contratuais
            </label>
            <textarea
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Particularidades do contrato, revendedor autorizado, modelo de licenciamento..."
              className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>

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
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Salvar Alterações' : 'Cadastrar Software / SaaS'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
