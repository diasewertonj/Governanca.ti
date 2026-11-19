import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { UserPlus, Laptop, User } from 'lucide-react';
import { NewEmployeeModal } from './NewEmployeeModal.tsx';
import { Busca, CabecalhoTela, Vazio } from '../ui/Tela.tsx';

const SELO_STATUS: Record<string, string> = { ativo: 'selo-ok', ferias: 'selo-atencao', desligado: 'selo-neutro' };
const ROTULO_STATUS: Record<string, string> = { ativo: 'Ativo', ferias: 'Férias', desligado: 'Desligado' };

export const CollaboratorsView: React.FC = () => {
  const { employees, departments, assets, licenses, setSelectedEmployeeIdFor360 } = useApp();

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

  const getDepartment = (depId?: string) => departments.find((d) => d.id === depId);
  const getManager = (gestorId?: string) => employees.find((e) => e.id === gestorId);
  const getCustodyCount = (empId: string) => assets.filter((a) => a.custodianteId === empId).length;
  const getLicensesCount = (empId: string) => licenses.filter((l) => l.colaboradoresIds.includes(empId)).length;

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo="Colaboradores"
        subtitulo="Pessoas, setores, equipamentos e licenças em uso"
        acoes={
          <button type="button" onClick={() => setShowNewEmployeeModal(true)} className="btn btn-primario">
            <UserPlus /> Novo colaborador
          </button>
        }
        filtros={
          <>
            <Busca id="colaboradores-busca" valor={searchTerm} onMudar={setSearchTerm} placeholder="Buscar por nome, matrícula, cargo ou e-mail..." />
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} aria-label="Filtrar por setor" className="campo campo-sm">
              <option value="todos">Todos os setores</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por situação" className="campo campo-sm">
              <option value="todos">Todas as situações</option>
              <option value="ativo">Ativo</option>
              <option value="ferias">Férias</option>
              <option value="desligado">Desligado</option>
            </select>
          </>
        }
      />

      <div className="cartao-tabela">
        <table className="tabela tabela-cartoes">
          <thead>
            <tr>
              <th>Colaborador</th>
              <th className="hidden xl:table-cell">Matrícula</th>
              <th>Setor / departamento</th>
              <th className="hidden 2xl:table-cell">Líder imediato</th>
              <th className="hidden xl:table-cell">Equipamentos em uso</th>
              <th>Situação</th>
              <th className="col-acoes">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length > 0 ? (
              filteredEmployees.map((emp) => {
                const dept = getDepartment(emp.setorId);
                const manager = getManager(emp.gestorId);
                const custodyCount = getCustodyCount(emp.id);
                const licCount = getLicensesCount(emp.id);

                return (
                  <tr key={emp.id} onClick={() => setSelectedEmployeeIdFor360(emp.id)} className="hover:bg-slate-50/70 cursor-pointer">
                    <td data-label="Colaborador">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 shrink-0 rounded-full bg-blue-600/10 text-blue-700 font-semibold flex items-center justify-center">
                          {emp.nome.charAt(0)}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 block">{emp.nome}</span>
                          <span className="text-slate-500">{emp.cargo}</span>
                        </div>
                      </div>
                    </td>

                    <td data-label="Matrícula" className="hidden xl:table-cell font-mono text-slate-600">
                      {emp.matricula}
                    </td>

                    <td data-label="Setor / departamento" className="text-slate-800">
                      {dept?.nome || '-'}
                    </td>

                    <td data-label="Líder imediato" className="hidden 2xl:table-cell">
                      {manager ? (
                        <span className="text-slate-800 flex items-center gap-1">
                          <User className="ico-sm text-slate-500" />
                          {manager.nome}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Diretoria</span>
                      )}
                    </td>

                    <td data-label="Equipamentos em uso" className="hidden xl:table-cell">
                      <div className="flex items-center gap-2">
                        <Laptop className="ico-sm text-blue-600" />
                        <span className="font-semibold text-slate-900">{custodyCount} item(ns)</span>
                        {licCount > 0 && <span className="selo selo-neutro">+{licCount} licença(s)</span>}
                      </div>
                    </td>

                    <td data-label="Situação">
                      <span className={`selo ${SELO_STATUS[emp.status] || 'selo-neutro'}`}>{ROTULO_STATUS[emp.status] || emp.status}</span>
                    </td>

                    <td data-label="Ações" className="col-acoes">
                      <span className="acoes-linha">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEmployeeIdFor360(emp.id);
                          }}
                          aria-label={`Abrir a ficha de ${emp.nome}`}
                          className="btn btn-sm btn-secundario"
                        >
                          Ficha
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7}>
                  <Vazio
                    titulo="Nenhum colaborador encontrado"
                    acao={
                      <button type="button" onClick={() => { setSearchTerm(''); setDepartmentFilter('todos'); setStatusFilter('todos'); }} className="btn btn-sm btn-secundario">
                        Limpar filtros
                      </button>
                    }
                  >
                    Nenhuma pessoa com os filtros aplicados.
                  </Vazio>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showNewEmployeeModal && <NewEmployeeModal onClose={() => setShowNewEmployeeModal(false)} />}
    </div>
  );
};
