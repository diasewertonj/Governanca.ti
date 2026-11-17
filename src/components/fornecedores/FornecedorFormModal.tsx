import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Save, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Fornecedor } from '../../types/index.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { normalizar } from '../../utils/processos.ts';
import { resumoVinculos, temVinculos, vinculosDoFornecedor } from '../../utils/contratos.ts';
import { nomesParecidos, soDigitos } from '../../utils/financeiro.ts';
import { confirmar } from '../ui/dialogo.tsx';
import { Janela } from '../ui/Janela.tsx';

interface FornecedorFormModalProps {
  /** Quando informado, edita este fornecedor */
  fornecedor?: Fornecedor;
  onClose: () => void;
  /** Chamado depois de salvar (ex.: o formulário de contrato seleciona o fornecedor novo) */
  onSalvo?: (f: Fornecedor) => void;
  /** Seção 6: nome já sugerido (ex.: fabricante, texto antigo na conciliação) */
  nomeInicial?: string;
}

/** Fase 8: cadastro de fornecedor (só a T.I.). Excluir só para ti_admin e sem vínculos. */
export const FornecedorFormModal: React.FC<FornecedorFormModalProps> = ({ fornecedor, onClose, onSalvo, nomeInicial }) => {
  const { fornecedores, contratos, assets, licenses, currentRole, cadastrarFornecedor, editarFornecedor, alterarFornecedor, excluirFornecedor } = useApp();

  const [nome, setNome] = useState(fornecedor?.nome ?? nomeInicial ?? '');
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
    void confirmarDescarte(itensPendentes).then((ok) => ok && onClose());
  };

  const vinculos = fornecedor ? vinculosDoFornecedor(fornecedor.id, { contratos, ativos: assets, licencas: licenses }) : null;
  const parecidos = fornecedor ? [] : nomesParecidos(nome, fornecedores);

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
    // Seção 6: CNPJ repetido (só números) também é duplicidade
    const cnpjRepetido = soDigitos(cnpj) && fornecedores.find((f) => f.id !== fornecedor?.id && soDigitos(f.cnpj) === soDigitos(cnpj));
    if (cnpjRepetido) return setErro(`O CNPJ já está cadastrado em ${cnpjRepetido.nome}.`);

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

  const excluir = async () => {
    if (!fornecedor || !vinculos) return;
    if (temVinculos(vinculos)) {
      if (!fornecedor.ativo) {
        setErro(`O fornecedor está vinculado a ${resumoVinculos(vinculos)} e não pode ser excluído.`);
        return;
      }
      const desativar = await confirmar({
        titulo: `${fornecedor.nome} não pode ser excluído`,
        mensagem: `Ele está vinculado a ${resumoVinculos(vinculos)}.\n\nDesativar o fornecedor? Ele sai das listas de escolha, mas o histórico continua.`,
        confirmar: 'Desativar',
        cancelar: 'Voltar',
      });
      if (desativar) {
        alterarFornecedor(fornecedor.id, { ativo: false });
        onClose();
      }
      return;
    }
    if (!(await confirmar(`Excluir o fornecedor ${fornecedor.nome}?\n\nEsta ação não pode ser desfeita.`))) return;
    const r = excluirFornecedor(fornecedor.id);
    if (r.success) onClose();
    else setErro(r.message || 'Não foi possível excluir o fornecedor.');
  };

  // Em portal: abre por cima de outro formulário ou ficha (licença, ativo, contrato) sem ficar dentro dele
  return createPortal(
    <Janela
      tamanho="m"
      titulo={fornecedor ? `Editar fornecedor ${fornecedor.nome}` : 'Novo fornecedor'}
      subtitulo={vinculos ? `Vínculos: ${resumoVinculos(vinculos)}` : 'Cadastro usado em contratos, equipamentos e softwares'}
      icone={<Building2 className="h-4 w-4" />}
      idTitulo="fornecedor-form-titulo"
      onFechar={fechar}
      rodape={
        <>
          {fornecedor && currentRole === 'ti_admin' ? (
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
            <button type="submit" form="form-fornecedor" disabled={salvando} className="btn btn-primario">
              <Save aria-hidden="true" />
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </>
      }
    >
      <form id="form-fornecedor" onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
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
            {/* Seção 6: aviso de fornecedor parecido antes de criar repetido */}
            {parecidos.length > 0 && (
              <p className="ajuda text-amber-800">Parecido com: {parecidos.map((f) => f.nome).join(', ')}. Confira se não é o mesmo.</p>
            )}
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
            <p className="ajuda">Opcional para empresa estrangeira.</p>
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
          <div className="sm:col-span-2">
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
          <div className="sm:col-span-2">
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
          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
              Fornecedor ativo
            </label>
            <p className="ajuda">Inativo sai das listas de escolha de contratos, equipamentos e softwares; o histórico continua.</p>
          </div>
        </div>

        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
      </form>
    </Janela>,
    document.body
  );
};
