import React, { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useRecursos } from '../../context/RecursosContext.tsx';
import type { Unidade } from '../../types/index.ts';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';

/** Seção 6 · Unidades/endereços da empresa (internet e telefonia fixa apontam para elas). Desativar em vez de excluir. */
export const UnidadesLista: React.FC = () => {
  const { unidades, salvarUnidade } = useRecursos();
  const [editando, setEditando] = useState<Unidade | 'nova' | null>(null);
  const [d, setD] = useState({ nome: '', endereco: '', cidade: '', uf: '', cep: '', observacoes: '', ativo: true });
  const [erro, setErro] = useState('');

  const abrir = (u: Unidade | 'nova') => {
    setEditando(u);
    setErro('');
    setD(
      u === 'nova'
        ? { nome: '', endereco: '', cidade: '', uf: '', cep: '', observacoes: '', ativo: true }
        : { nome: u.nome, endereco: u.endereco || '', cidade: u.cidade || '', uf: u.uf || '', cep: u.cep || '', observacoes: u.observacoes || '', ativo: u.ativo }
    );
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await salvarUnidade({
      id: editando && editando !== 'nova' ? editando.id : undefined,
      nome: d.nome,
      endereco: d.endereco || undefined,
      cidade: d.cidade || undefined,
      uf: d.uf || undefined,
      cep: d.cep || undefined,
      observacoes: d.observacoes || undefined,
      ativo: d.ativo,
    });
    if (r.erro) return setErro(r.erro);
    setEditando(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => abrir('nova')} className="btn btn-secundario">
          <Plus className="w-3.5 h-3.5" /> Nova unidade
        </button>
      </div>
      {editando && (
        <form onSubmit={salvar} className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {(
              [
                ['nome', 'Nome *'],
                ['endereco', 'Endereço'],
                ['cidade', 'Cidade'],
                ['uf', 'UF'],
                ['cep', 'CEP'],
                ['observacoes', 'Observações'],
              ] as const
            ).map(([k, r]) => (
              <div key={k}>
                <label htmlFor={`uni-${k}`} className={CLASSE_ROTULO}>{r}</label>
                <input id={`uni-${k}`} required={k === 'nome'} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} className={CLASSE_CAMPO} />
              </div>
            ))}
            {editando !== 'nova' && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={d.ativo} onChange={(e) => setD({ ...d, ativo: e.target.checked })} /> Ativa
              </label>
            )}
          </div>
          {erro && <p className="text-xs font-medium text-red-700" role="alert">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditando(null)} className="btn btn-secundario">Cancelar</button>
            <button type="submit" className="btn btn-primario">Salvar</button>
          </div>
        </form>
      )}
      {unidades.length === 0 ? (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-4">Nenhuma unidade cadastrada.</p>
      ) : (
        <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
          {unidades.map((u) => (
            <li key={u.id} className={`flex flex-wrap items-center justify-between gap-2 p-3 ${u.ativo ? '' : 'opacity-60'}`}>
              <span>
                <span className="font-semibold text-slate-900">{u.nome}</span>
                <span className="text-slate-500"> {[u.endereco, u.cidade, u.uf].filter(Boolean).join(', ')}</span>
              </span>
              <button type="button" onClick={() => abrir(u)} className="btn btn-secundario btn-sm">
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
