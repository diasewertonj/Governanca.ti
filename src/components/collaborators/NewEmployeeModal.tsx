import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { EmployeeStatus } from '../../types/index.ts';
import { X, UserPlus, Building, Mail, Phone, UserCheck } from 'lucide-react';

interface NewEmployeeModalProps {
  onClose: () => void;
}

export const NewEmployeeModal: React.FC<NewEmployeeModalProps> = ({ onClose }) => {
  const { employees, departments, addEmployee, setSelectedEmployeeIdFor360 } = useApp();

  const nextMatricula = `NX-${1000 + employees.length + 1}`;

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [matricula, setMatricula] = useState(nextMatricula);
  const [cargo, setCargo] = useState('');
  const [setorId, setSetorId] = useState(departments[0]?.id || 'dep-1');
  const [gestorId, setGestorId] = useState('');
  const [status, setStatus] = useState<EmployeeStatus>('ativo');
  const [dataAdmissao, setDataAdmissao] = useState(new Date().toISOString().split('T')[0]);
  const [telefone, setTelefone] = useState('');

  const activeEmployees = employees.filter((e) => e.status === 'ativo');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !email.trim() || !cargo.trim()) return;

    const created = addEmployee({
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      matricula: matricula.trim(),
      cargo: cargo.trim(),
      setorId,
      gestorId: gestorId || undefined,
      status,
      dataAdmissao,
      telefone: telefone.trim(),
    });

    onClose();
    setSelectedEmployeeIdFor360(created.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Novo Colaborador Corporativo</h2>
            <p className="text-xs text-slate-500">
              Cadastro unificado integrado a ativos e ciclo de vida
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
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
                onChange={(e) => setMatricula(e.target.value)}
                className="w-full text-xs font-mono font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail Corporativo
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome.sobrenome@nexuscorp.com.br"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

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
          </div>

          {/* Entradas Dinâmicas Estritas (Setor & Gestor) */}
          <div className="grid grid-cols-2 gap-3 pt-1">
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

          <div className="grid grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                <option value="ativo">Ativo</option>
                <option value="ferias">Férias</option>
                <option value="desligado">Desligado</option>
              </select>
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
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Cadastrar Colaborador
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
