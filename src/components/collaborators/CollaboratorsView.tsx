import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {  } from '../../utils/formatters.ts';
import {
  Search,
  UserPlus,
  Laptop,
  ExternalLink,
  User,
} from 'lucide-react';
import { NewEmployeeModal } from './NewEmployeeModal.tsx';

export const CollaboratorsView: React.FC = () => {
  const {
    employees,
    departments,
    assets,
    licenses,
    setSelectedEmployeeIdFor360,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [showNewEmployeeModal, setShowNewEmployeeModal] = useState(false);

  const filteredEmployees = employees.filter((emp) => {
    const matchesDept = departmentFilter === 'todos' || emp.setorId === departmentFilter;
    const matchesStatus = statusFilter === 'todos' || emp.status === statusFilter;
    const matchesSearch =
      emp.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.matricula.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.cargo.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesDept && matchesStatus && matchesSearch;
  });

  const getDepartment = (depId?: string) => {
    return departments.find((d) => d.id === depId);
  };

  const getManager = (gestorId?: string) => {
    return employees.find((e) => e.id === gestorId);
  };

  const getCustodyCount = (empId: string) => {
    return assets.filter((a) => a.custodianteId === empId).length;
  };

  const getLicensesCount = (empId: string) => {
    return licenses.filter((l) => l.colaboradoresIds.includes(empId)).length;
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Colaboradores</h2>
          <p className="text-xs text-slate-500">
            Rastreabilidade completa de equipamentos, termos de responsabilidade e liderança
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewEmployeeModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Cadastrar Colaborador</span>
        </button>
      </div>

      {/* Filtros e Busca */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, matrícula, cargo ou e-mail..."
            className="w-80 text-xs pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700"
          >
            <option value="todos">Todos os Setores</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700"
          >
            <option value="todos">Todos os Status</option>
            <option value="ativo">Ativo</option>
            <option value="ferias">Férias</option>
            <option value="desligado">Desligado</option>
          </select>
        </div>
      </div>

      {/* Tabela de Colaboradores */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tabela-cartoes w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-xs tracking-wider">
                <th className="py-3 px-4">Colaborador</th>
                <th className="hidden xl:table-cell py-3 px-4">Matrícula</th>
                <th className="py-3 px-4">Setor / Departamento</th>
                <th className="hidden 2xl:table-cell py-3 px-4">Líder Imediato</th>
                <th className="hidden xl:table-cell py-3 px-4">Equipamentos em Uso</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ficha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((emp) => {
                  const dept = getDepartment(emp.setorId);
                  const manager = getManager(emp.gestorId);
                  const custodyCount = getCustodyCount(emp.id);
                  const licCount = getLicensesCount(emp.id);

                  return (
                    <tr
                      key={emp.id}
                      onClick={() => setSelectedEmployeeIdFor360(emp.id)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                    >
                      <td data-label="Colaborador" className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-600/10 text-blue-700 font-bold flex items-center justify-center text-xs">
                            {emp.nome.charAt(0)}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900 block hover:text-blue-700">
                              {emp.nome}
                            </span>
                            <span className="text-xs text-slate-500">{emp.cargo}</span>
                          </div>
                        </div>
                      </td>

                      <td data-label="Matrícula" className="hidden xl:table-cell py-3 px-4 font-mono font-medium text-slate-600">
                        {emp.matricula}
                      </td>

                      <td data-label="Setor / Departamento" className="py-3 px-4 text-slate-800">
                        {dept?.nome || '-'}
                      </td>

                      <td data-label="Líder Imediato" className="hidden 2xl:table-cell py-3 px-4">
                        {manager ? (
                          <span className="text-slate-800 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-500" />
                            {manager.nome}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Diretoria</span>
                        )}
                      </td>

                      <td data-label="Equipamentos em Uso" className="hidden xl:table-cell py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Laptop className="w-3.5 h-3.5 text-blue-600" />
                          <span className="font-semibold text-slate-900">
                            {custodyCount} item(ns)
                          </span>
                          {licCount > 0 && (
                            <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                              +{licCount} licença(s)
                            </span>
                          )}
                        </div>
                      </td>

                      <td data-label="Status" className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${
                            emp.status === 'ativo'
                              ? 'text-emerald-700 bg-emerald-50'
                              : emp.status === 'ferias'
                              ? 'text-amber-700 bg-amber-50'
                              : 'text-slate-500 bg-slate-100'
                          }`}
                        >
                          {emp.status}
                        </span>
                      </td>

                      <td data-label="Ficha" className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEmployeeIdFor360(emp.id);
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors inline-flex items-center gap-1"
                        >
                          <span>Ver ficha</span>
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                    Nenhum colaborador encontrado com os filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showNewEmployeeModal && (
        <NewEmployeeModal onClose={() => setShowNewEmployeeModal(false)} />
      )}
    </div>
  );
};
