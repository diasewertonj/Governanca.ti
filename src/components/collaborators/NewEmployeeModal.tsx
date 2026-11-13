import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext.tsx';
import type { Employee, EmployeeStatus, UserRole } from '../../types/index.ts';
import { X, UserPlus } from 'lucide-react';

/** Fase 10: dados que já vêm preenchidos (ex.: do chamado de admissão) */
export interface DadosIniciaisColaborador {
  nome?: string;
  email?: string;
  cargo?: string;
  setorId?: string;
  gestorId?: string;
  dataAdmissao?: string;
  /** Papel de acesso (só o admin de T.I. passa algo além de colaborador) */
  papel?: UserRole;
}

interface NewEmployeeModalProps {
  onClose: () => void;
  inicial?: DadosIniciaisColaborador;
  /** Chamado depois que o banco confirma o cadastro; sem ele, abre a ficha da pessoa */
  onCriado?: (colaboradorId: string) => void | Promise<void>;
  /** Editar dados de quem já está cadastrado (mesmo formulário) */
  colaborador?: Employee;
}

export const NewEmployeeModal: React.FC<NewEmployeeModalProps> = ({ onClose, inicial, onCriado, colaborador }) => {
  const { employees, departments, cadastrarColaborador, salvarColaborador, setSelectedEmployeeIdFor360, currentRole } = useApp();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const editando = !!colaborador;
  // E-mail é a identidade da pessoa. Quem já tem login não troca o e-mail aqui
  // (derrubaria o acesso); sem login, a T.I. corrige. Perfis de gestão: só o admin.
  const temLogin = !!colaborador?.temLogin;
  const podeMudarEmail =
    !editando || (!temLogin && (currentRole === 'ti_admin' || (colaborador.role || 'colaborador') === 'colaborador'));
  // Desligado só volta a ativo pelo administrador de T.I.
  const desligado = colaborador?.status === 'desligado';
  const podeReativar = !desligado || currentRole === 'ti_admin';

  const nextMatricula = `NX-${1000 + employees.length + 1}`;

  const [nome, setNome] = useState(colaborador?.nome ?? inicial?.nome ?? '');
  const [email, setEmail] = useState(colaborador?.email ?? inicial?.email ?? '');
  const [matricula, setMatricula] = useState(colaborador?.matricula ?? nextMatricula);
  const [cargo, setCargo] = useState(colaborador?.cargo ?? inicial?.cargo ?? '');
  const [setorId, setSetorId] = useState(colaborador?.setorId || inicial?.setorId || departments[0]?.id || 'dep-1');
  const [gestorId, setGestorId] = useState(colaborador?.gestorId ?? inicial?.gestorId ?? '');
  const [status, setStatus] = useState<EmployeeStatus>(colaborador?.status ?? 'ativo');
  const [dataAdmissao, setDataAdmissao] = useState(
    colaborador?.dataAdmissao || inicial?.dataAdmissao || new Date().toISOString().split('T')[0]
  );
  const [telefone, setTelefone] = useState(colaborador?.telefone ?? '');
  const emailMudou = editando && email.trim().toLowerCase() !== colaborador.email;

  const activeEmployees = employees.filter((e) => e.status === 'ativo' && e.id !== colaborador?.id);

  // Edição: grava só o que mudou e só fecha depois do banco confirmar
  const salvarEdicao = async () => {
    if (!colaborador) return;
    const novo = {
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      cargo: cargo.trim(),
      setorId,
      gestorId: gestorId || undefined,
      status,
      dataAdmissao,
      telefone: telefone.trim() || undefined,
    };
    const mudou = (Object.keys(novo) as (keyof typeof novo)[]).filter((k) => (novo[k] || undefined) !== (colaborador[k] || undefined));
    if (mudou.length === 0) return onClose();
    if (
      desligado &&
      status !== 'desligado' &&
      !window.confirm(
        `Reativar ${colaborador.nome}?\n\nA pessoa volta a aparecer como ativa. Se tinha login, o acesso ao sistema volta a funcionar.`
      )
    ) {
      return;
    }
    setErro(null);
    setSalvando(true);
    const falha = await salvarColaborador(colaborador.id, Object.fromEntries(mudou.map((k) => [k, novo[k]])));
    setSalvando(false);
    if (falha) return setErro(`Não foi possível salvar: ${falha}`);
    onClose();
  };

  // Espera o banco confirmar: quem chamou (ex.: o checklist) usa o id logo em seguida
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !email.trim() || !cargo.trim() || salvando) return;
    if (editando) return salvarEdicao();
    setErro(null);
    setSalvando(true);
    const { colaborador, erro: falha } = await cadastrarColaborador({
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      matricula: matricula.trim(),
      cargo: cargo.trim(),
      setorId,
      gestorId: gestorId || undefined,
      status,
      dataAdmissao,
      telefone: telefone.trim(),
      ...(inicial?.papel ? { role: inicial.papel } : {}),
    });
    setSalvando(false);
    if (!colaborador) return setErro(falha || 'Não foi possível cadastrar.');

    onClose();
    if (onCriado) await onCriado(colaborador.id);
    else setSelectedEmployeeIdFor360(colaborador.id);
  };

  // Em portal e acima das outras janelas: abre por cima do chamado sem ficar presa nele
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {editando ? `Editar dados de ${colaborador.nome}` : 'Novo colaborador'}
            </h2>
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

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 sm:max-h-[75vh] sm:overflow-y-auto">
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Identificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Amanda Silva Castro"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Matrícula Funcional
                </label>
                <input
                  type="text"
                  required
                  value={matricula}
                  disabled={editando}
                  onChange={(e) => setMatricula(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Contato</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail Corporativo
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  disabled={!podeMudarEmail}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@empresa.com.br"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
                />
                {editando && temLogin && (
                  <p className="text-xs text-slate-500 mt-1">
                    Esta pessoa já tem login. Para trocar o e-mail de quem já tem login, use "Trocar login" — em breve.
                  </p>
                )}
                {editando && !temLogin && !podeMudarEmail && (
                  <p className="text-xs text-slate-500 mt-1">Só o administrador de T.I. altera o e-mail de perfis de gestão.</p>
                )}
                {emailMudou && (
                  <p className="text-xs text-amber-800 mt-1">
                    Confira o novo e-mail: ele será usado quando a pessoa receber o acesso ao sistema.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Telefone / Ramal
                </label>
                <input
                  type="text"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(11) 98765-0000"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Entradas Dinâmicas Estritas (Setor & Gestor) */}
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Vínculo</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cargo / Função
                </label>
                <input
                  type="text"
                  required
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  placeholder="Ex: Engenheiro(a) de Software"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Setor / Departamento (Pré-cadastrado)
                </label>
                <select
                  value={setorId}
                  onChange={(e) => setSetorId(e.target.value)}
                  required
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  {departments
                    .filter((d) => d.ativo)
                    .map((dep) => (
                      <option key={dep.id} value={dep.id}>
                        {dep.nome} ({dep.codigo})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Líder Imediato / Gestor (Ativo)
                </label>
                <select
                  value={gestorId}
                  onChange={(e) => setGestorId(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Nenhum (Diretoria / Gestão Superior)</option>
                  {activeEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nome} ({emp.cargo})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Situação</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  disabled={!podeReativar}
                  onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
                >
                  <option value="ativo">{desligado ? 'Ativo (reativar)' : 'Ativo'}</option>
                  <option value="ferias">Férias</option>
                  {/* Na edição, desligar é pelo processo de desligamento (recolhe equipamentos e acessos) */}
                  {(!editando || desligado) && <option value="desligado">Desligado</option>}
                </select>
                {!podeReativar && (
                  <p className="text-xs text-slate-500 mt-1">Só o administrador de T.I. reativa uma pessoa desligada.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Data de Admissão
                </label>
                <input
                  type="date"
                  value={dataAdmissao}
                  onChange={(e) => setDataAdmissao(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {erro && (
            <p role="alert" className="text-xs text-rose-700">
              {erro}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {editando
                ? salvando
                  ? 'Salvando…'
                  : 'Salvar alterações'
                : salvando
                  ? 'Cadastrando…'
                  : onCriado
                    ? 'Cadastrar e concluir o passo'
                    : 'Cadastrar colaborador'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
