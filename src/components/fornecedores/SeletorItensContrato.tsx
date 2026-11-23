import React, { useState } from 'react';
import { Key, Laptop, Plus, Search, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { ItemContrato } from '../../types/index.ts';
import { normalizar } from '../../utils/processos.ts';
import { resumoItens } from '../../utils/contratos.ts';
import { CLASSE_CAMPO } from '../comum/campos.ts';

/** Quantas sugestões mostrar na busca */
const LIMITE_SUGESTOES = 8;

/**
 * Fase 8: escolhe o que o contrato cobre (ativos não baixados e licenças).
 * Busca por patrimônio, nome, marca, modelo, série ou fornecedor; os escolhidos
 * viram etiquetas removíveis. Nada é gravado aqui: o formulário salva tudo junto.
 * Seção 6: com fornecedorId, sugere primeiro (e sem digitar) os equipamentos e softwares desse fornecedor.
 */
export const SeletorItensContrato: React.FC<{ itens: ItemContrato[]; onChange: (itens: ItemContrato[]) => void; fornecedorId?: string }> = ({
  itens,
  onChange,
  fornecedorId,
}) => {
  const { assets, licenses } = useApp();
  const [busca, setBusca] = useState('');

  const rotulo = (i: ItemContrato) => {
    if (i.ativoId) {
      const a = assets.find((x) => x.id === i.ativoId);
      return a ? `${a.tag} · ${a.nome}` : 'Ativo não encontrado';
    }
    return licenses.find((x) => x.id === i.licencaId)?.nome || 'Licença não encontrada';
  };

  const termo = normalizar(busca);
  const ativosEscolhidos = new Set(itens.flatMap((i) => (i.ativoId ? [i.ativoId] : [])));
  const licencasEscolhidas = new Set(itens.flatMap((i) => (i.licencaId ? [i.licencaId] : [])));
  const doFornecedor = (x: { fornecedorId?: string }) => !!fornecedorId && x.fornecedorId === fornecedorId;
  const primeiroDoFornecedor = <T extends { fornecedorId?: string }>(a: T, b: T) => Number(doFornecedor(b)) - Number(doFornecedor(a));
  const sugestoes: { item: ItemContrato; texto: string; detalhe: string }[] =
    termo || fornecedorId
      ? [
          ...[...assets]
            .sort(primeiroDoFornecedor)
            .filter((a) => a.status !== 'descartado' && !ativosEscolhidos.has(a.id))
            .filter((a) => (termo ? normalizar(`${a.tag} ${a.nome} ${a.marca} ${a.modelo} ${a.serialNumber}`).includes(termo) : doFornecedor(a)))
            .map((a) => ({ item: { ativoId: a.id }, texto: `${a.tag} · ${a.nome}`, detalhe: `${a.marca} ${a.modelo}`.trim() })),
          ...[...licenses]
            .sort(primeiroDoFornecedor)
            .filter((l) => !licencasEscolhidas.has(l.id) && l.status !== 'inativa')
            .filter((l) => (termo ? normalizar(`${l.nome} ${l.fornecedor}`).includes(termo) : doFornecedor(l)))
            .map((l) => ({ item: { licencaId: l.id }, texto: l.nome, detalhe: `Licença · ${l.fornecedor}` })),
        ].slice(0, LIMITE_SUGESTOES)
      : [];
  // Sem digitar: mostra só as sugestões do fornecedor (quando houver)
  const mostrarLista = !!termo || sugestoes.length > 0;

  const remover = (alvo: ItemContrato) => onChange(itens.filter((i) => (alvo.ativoId ? i.ativoId !== alvo.ativoId : i.licencaId !== alvo.licencaId)));

  return (
    <div className="space-y-2">
      <p className="texto-aux">{resumoItens(itens)}</p>

      {itens.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Itens cobertos pelo contrato">
          {itens.map((i) => {
            const texto = rotulo(i);
            return (
              <li
                key={i.ativoId ? `a:${i.ativoId}` : `l:${i.licencaId}`}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 py-0.5 pr-0.5 pl-2 text-slate-800"
              >
                {i.ativoId ? (
                  <Laptop className="ico-sm text-slate-500" aria-hidden="true" />
                ) : (
                  <Key className="ico-sm text-slate-500" aria-hidden="true" />
                )}
                <span className="min-w-0 break-words">{texto}</span>
                <button type="button" onClick={() => remover(i)} title="Remover" aria-label={`Remover ${texto}`} className="btn-icone btn-icone-perigo !p-0.5">
                  <X aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <label htmlFor="contrato-itens-busca" className="sr-only">
          Buscar ativo ou licença para adicionar
        </label>
        <Search className="ico-sm pointer-events-none absolute top-2.5 left-2.5 text-slate-500" aria-hidden="true" />
        <input
          id="contrato-itens-busca"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar equipamento (patrimônio, nome, série) ou software para adicionar..."
          className={`${CLASSE_CAMPO} pl-8`}
        />
      </div>

      {mostrarLista && (
        <div className="space-y-1">
          {!termo && <p className="secao-titulo">Sugestões deste fornecedor</p>}
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {sugestoes.length === 0 ? (
              <li className="px-3 py-2 texto-aux">Nenhum equipamento ou software encontrado.</li>
            ) : (
              sugestoes.map((s) => (
                <li key={s.item.ativoId ? `a:${s.item.ativoId}` : `l:${s.item.licencaId}`}>
                  <button
                    type="button"
                    onClick={() => onChange([...itens, s.item])}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-blue-50"
                  >
                    <Plus className="ico-sm text-blue-600" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-semibold break-words text-slate-900">{s.texto}</span>
                      {s.detalhe && <span className="block break-words text-slate-500">{s.detalhe}</span>}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
