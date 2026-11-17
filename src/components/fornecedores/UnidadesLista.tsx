import React, { useState } from 'react';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { useRecursos } from '../../context/RecursosContext.tsx';
import type { Unidade } from '../../types/index.ts';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { Janela } from '../ui/Janela.tsx';
import { Vazio } from '../ui/Tela.tsx';

const VAZIA = { nome: '', endereco: '', cidade: '', uf: '', cep: '', observacoes: '', ativo: true };

/** Seção 6 · Unidades/endereços da empresa (internet e telefonia fixa apontam para elas). Desativar em vez de excluir. */
export const UnidadesLista: React.FC = () => {
  const { unidades, salvarUnidade } = useRecursos();
  const [editando, setEditando] = useState<Unidade | 'nova' | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">Endereços usados nos contratos de internet e telefonia fixa. Uma unidade inativa sai das listas de escolha.</p>
        <button type="button" onClick={() => setEditando('nova')} className="btn btn-primario">
          <Plus aria-hidden="true" /> Nova unidade
        </button>
      </div>

      {unidades.length === 0 ? (
        <Vazio>Nenhuma unidade cadastrada.</Vazio>
      ) : (
        <div className="cartao overflow-hidden">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Unidade</th>
                <th>Endereço</th>
                <th>Cidade / UF</th>
                <th>Situação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((u) => (
                <tr key={u.id} className={u.ativo ? '' : 'opacity-60'}>
                  <td data-label="Unidade" className="font-semibold text-slate-900">
                    {u.nome}
                  </td>
                  <td data-label="Endereço">
                    {u.endereco || '-'}
                    {u.cep && <span className="block font-mono text-slate-500">{u.cep}</span>}
                  </td>
                  <td data-label="Cidade / UF">{[u.cidade, u.uf].filter(Boolean).join(' / ') || '-'}</td>
                  <td data-label="Situação">
                    <span className={`selo ${u.ativo ? 'selo-ok' : 'selo-neutro'}`}>{u.ativo ? 'Ativa' : 'Inativa'}</span>
                  </td>
                  <td data-label="Ações" className="text-right">
                    <span className="acoes-linha">
                      <button type="button" onClick={() => setEditando(u)} title="Editar" aria-label={`Editar a unidade ${u.nome}`} className="btn-icone">
                        <Pencil aria-hidden="true" />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormUnidade
          key={editando === 'nova' ? 'nova' : editando.id}
          unidade={editando === 'nova' ? undefined : editando}
          onSalvar={async (dados) => {
            const r = await salvarUnidade(dados);
            if (r.erro) return r.erro;
            setEditando(null);
            return null;
          }}
          onFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
};

/** Cadastro rápido da unidade em janela pequena */
const FormUnidade: React.FC<{
  unidade?: Unidade;
  onSalvar: (d: Omit<Unidade, 'id'> & { id?: string }) => Promise<string | null>;
  onFechar: () => void;
}> = ({ unidade, onSalvar, onFechar }) => {
  const inicial = unidade
    ? {
        nome: unidade.nome,
        endereco: unidade.endereco || '',
        cidade: unidade.cidade || '',
        uf: unidade.uf || '',
        cep: unidade.cep || '',
        observacoes: unidade.observacoes || '',
        ativo: unidade.ativo,
      }
    : VAZIA;
  const [d, setD] = useState(inicial);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const alterado = JSON.stringify(d) !== JSON.stringify(inicial);

  const fechar = () => {
    void confirmarDescarte(alterado ? [unidade ? `Edição da unidade ${unidade.nome} não salva` : 'Unidade nova não cadastrada'] : []).then(
      (ok) => ok && onFechar()
    );
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    if (!d.nome.trim()) return setErro('Informe o nome da unidade.');
    setSalvando(true);
    const falha = await onSalvar({
      id: unidade?.id,
      nome: d.nome.trim(),
      endereco: d.endereco.trim() || undefined,
      cidade: d.cidade.trim() || undefined,
      uf: d.uf.trim() || undefined,
      cep: d.cep.trim() || undefined,
      observacoes: d.observacoes.trim() || undefined,
      ativo: d.ativo,
    });
    setSalvando(false);
    if (falha) setErro(falha);
  };

  const campo = (k: 'nome' | 'endereco' | 'cidade' | 'uf' | 'cep' | 'observacoes', rotulo: string, extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}, classe = '') => (
    <div className={classe}>
      <label htmlFor={`uni-${k}`} className={CLASSE_ROTULO}>
        {rotulo}
      </label>
      <input id={`uni-${k}`} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} className={CLASSE_CAMPO} {...extra} />
    </div>
  );

  return (
    <Janela
      tamanho="p"
      titulo={unidade ? `Editar unidade ${unidade.nome}` : 'Nova unidade'}
      icone={<MapPin className="h-4 w-4" />}
      idTitulo="janela-unidade-titulo"
      onFechar={fechar}
      rodape={
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={fechar} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="submit" form="form-unidade" disabled={salvando} className="btn btn-primario">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      }
    >
      <form id="form-unidade" onSubmit={salvar} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {campo('nome', 'Nome *', { required: true, placeholder: 'Ex.: Matriz, Filial Campinas' }, 'sm:col-span-2')}
          {campo('endereco', 'Endereço', {}, 'sm:col-span-2')}
          {campo('cidade', 'Cidade')}
          <div className="grid grid-cols-2 gap-3">
            {campo('uf', 'UF', { maxLength: 2 })}
            {campo('cep', 'CEP', { inputMode: 'numeric' })}
          </div>
          {campo('observacoes', 'Observações', {}, 'sm:col-span-2')}
          {unidade && (
            <div className="sm:col-span-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={d.ativo} onChange={(e) => setD({ ...d, ativo: e.target.checked })} className="h-4 w-4 rounded border-slate-300" /> Unidade ativa
              </label>
              <p className="ajuda">Inativa sai das listas de escolha; os contratos que apontam para ela continuam.</p>
            </div>
          )}
        </div>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
      </form>
    </Janela>
  );
};
