import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Save, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Fornecedor } from '../../types/index.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { normalizar } from '../../utils/processos.ts';
import { resumoVinculos, temVinculos, vinculosDoFornecedor } from '../../utils/contratos.ts';

interface FornecedorFormModalProps {
  /** Quando informado, edita este fornecedor */
  fornecedor?: Fornecedor;
  onClose: () => void;
  /** Chamado depois de salvar (ex.: o formulário de contrato seleciona o fornecedor novo) */
  onSalvo?: (f: Fornecedor) => void;
}

/** Fase 8: cadastro de fornecedor (só a T.I.). Excluir só para ti_admin e sem vínculos. */
export const FornecedorFormModal: React.FC<FornecedorFormModalProps> = ({ fornecedor, onClose, onSalvo }) => {
  const {
    fornecedores,
    contratos,
    assets,
    licenses,
    currentRole,
    cadastrarFornecedor,
    editarFornecedor,
    alterarFornecedor,
    excluirFornecedor,
  } = useApp();

  const [nome, setNome] = useState(fornecedor?.nome ?? '');
  const [cnpj, setCnpj] = useState(fornecedor?.cnpj ?? '');
  const [contato, setContato] = useState(fornecedor?.contato ?? '');
  const [telefone, setTelefone] = useState(fornecedor?.telefone ?? '');
  const [email, setEmail] = useState(fornecedor?.email ?? '');
  const [site, setSite] = useState(fornecedor?.site ?? '');
  const [observacoes, setObservacoes] = useState(fornecedor?.observacoes ?? '');
  const [ativo, setAtivo] = useState(fornecedor?.ativo ?? true);
  const [erro, setErro] = useState('');

  // Aviso ao fechar com alterações não salvas
  const valores = JSON.stringify([nome, cnpj, contato, telefone, email, site, observacoes, ativo]);
  const [valoresIniciais] = useState(valores);
  const itensPendentes =
    valores !== valoresIniciais ? [fornecedor ? `Edição do fornecedor ${fornecedor.nome} não salva` : 'Fornecedor novo não cadastrado'] : [];
  useRegistrarPendencias(fornecedor ? `fornecedor:${fornecedor.id}` : 'novo-fornecedor', itensPendentes);

  const fechar = () => {
    if (confirmarDescarte(itensPendentes)) onClose();
  };

  const vinculos = fornecedor
    ? vinculosDoFornecedor(fornecedor.id, { contratos, ativos: assets, licencas: licenses })
    : null;

  const [salvando, setSalvando] = useState(false);
  // Lote 1: só fecha depois do banco confirmar
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    // O portal ainda propaga eventos pela árvore do React: não deixa o "submit" chegar ao formulário de fora
    e.stopPropagation();
    if (salvando) return;
    if (!nome.trim()) return setErro('Informe o nome do fornecedor.');
    // Mesma regra do banco (uq_fornecedores_nome): nome único, sem diferenciar maiúsculas
    const repetido = fornecedores.some((f) => f.id !== fornecedor?.id && normalizar(f.nome) === normalizar(nome));
    if (repetido) return setErro('Já existe um fornecedor com esse nome.');

    const dados = {
      nome: nome.trim(),
      cnpj: cnpj.trim() || undefined,
      contato: contato.trim() || undefined,
      telefone: telefone.trim() || undefined,
      email: email.trim() || undefined,
      site: site.trim() || undefined,
      observacoes: observacoes.trim() || undefined,
      ativo,
    };
    setErro('');
    setSalvando(true);
    if (fornecedor) {
      const falha = await editarFornecedor(fornecedor.id, dados);
      setSalvando(false);
      if (falha) return setErro(`Não foi possível salvar: ${falha}`);
      onSalvo?.({ ...fornecedor, ...dados });
    } else {
      const { item: novo, erro: falha } = await cadastrarFornecedor(dados);
      setSalvando(false);
      if (!novo) return setErro(`Não foi possível cadastrar: ${falha || 'erro desconhecido'}`);
      onSalvo?.(novo);
    }
    onClose();
  };

  const excluir = () => {
    if (!fornecedor || !vinculos) return;
    if (temVinculos(vinculos)) {
      if (!fornecedor.ativo) {
        setErro(`O fornecedor está vinculado a ${resumoVinculos(vinculos)} e não pode ser excluído.`);
        return;
      }
      const desativar = window.confirm(
        `${fornecedor.nome} está vinculado a ${resumoVinculos(vinculos)} e não pode ser excluído.\n\nDesativar o fornecedor? Ele sai das listas de escolha, mas o histórico continua.`
      );
      if (desativar) {
        alterarFornecedor(fornecedor.id, { ativo: false });
        onClose();
      }
      return;
    }
    if (!window.confirm(`Excluir o fornecedor ${fornecedor.nome}? Esta ação não pode ser desfeita.`)) return;
    const r = excluirFornecedor(fornecedor.id);
    if (r.success) onClose();
    else setErro(r.message || 'Não foi possível excluir o fornecedor.');
  };

  // Em portal: abre por cima de outro formulário (licença, ativo, contrato) sem ficar dentro dele
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fornecedor-titulo"
        className="relative w-full max-w-2xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 sm:overflow-hidden my-0 sm:my-6"
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-100/70 text-blue-700 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="fornecedor-titulo" className="text-sm font-semibold text-slate-900 break-words">
                {fornecedor ? `Editar fornecedor ${fornecedor.nome}` : 'Novo fornecedor'}
              </h2>
              <p className="text-xs text-slate-500">
                {vinculos ? `Vínculos: ${resumoVinculos(vinculos)}` : 'Cadastro usado em contratos, ativos e licenças'}
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

        <form onSubmit={salvar} className="p-6 space-y-4 sm:max-h-[75vh] sm:overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label htmlFor="forn-nome" className={CLASSE_ROTULO}>
                Nome *
              </label>
              <input
                id="forn-nome"
                type="text"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Dell Computadores do Brasil Ltda"
                className={CLASSE_CAMPO}
              />
            </div>
            <div>
              <label htmlFor="forn-cnpj" className={CLASSE_ROTULO}>
                CNPJ
              </label>
              <input
                id="forn-cnpj"
                type="text"
                inputMode="numeric"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className={`${CLASSE_CAMPO} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="forn-contato" className={CLASSE_ROTULO}>
                Contato
              </label>
              <input
                id="forn-contato"
                type="text"
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                placeholder="Ex.: Ana (gerente de contas)"
                className={CLASSE_CAMPO}
              />
            </div>
            <div>
              <label htmlFor="forn-telefone" className={CLASSE_ROTULO}>
                Telefone
              </label>
              <input
                id="forn-telefone"
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="Ex.: 0800 970 3355"
                className={CLASSE_CAMPO}
              />
            </div>
            <div>
              <label htmlFor="forn-email" className={CLASSE_ROTULO}>
                E-mail
              </label>
              <input
                id="forn-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@fornecedor.com.br"
                className={CLASSE_CAMPO}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="forn-site" className={CLASSE_ROTULO}>
                Site
              </label>
              <input
                id="forn-site"
                type="text"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="Ex.: https://www.fornecedor.com.br"
                className={CLASSE_CAMPO}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="forn-obs" className={CLASSE_ROTULO}>
                Observações
              </label>
              <textarea
                id="forn-obs"
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex.: atende só a região Sul; pedir orçamento com 5 dias de antecedência."
                className={CLASSE_CAMPO}
              />
            </div>
            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600"
                />
                Fornecedor ativo
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Inativo sai das listas de escolha de contratos, ativos e licenças; o histórico continua.
              </p>
            </div>
          </div>

          {erro && (
            <p className="text-xs font-medium text-red-700" role="alert">
              {erro}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-100">
            {fornecedor && currentRole === 'ti_admin' ? (
              <button
                type="button"
                onClick={excluir}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir fornecedor
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
                disabled={salvando}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {salvando ? 'Salvando…' : fornecedor ? 'Salvar alterações' : 'Cadastrar fornecedor'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
