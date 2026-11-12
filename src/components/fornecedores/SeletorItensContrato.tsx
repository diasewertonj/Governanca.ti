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
 * viram chips removíveis. Nada é gravado aqui: o formulário salva tudo junto.
 */
export const SeletorItensContrato: React.FC<{ itens: ItemContrato[]; onChange: (itens: ItemContrato[]) => void }> = ({
  itens,
  onChange,
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
  const sugestoes: { item: ItemContrato; texto: string; detalhe: string }[] = termo
    ? [
        ...assets
          .filter((a) => a.status !== 'descartado' && !ativosEscolhidos.has(a.id))
          .filter((a) => normalizar(`${a.tag} ${a.nome} ${a.marca} ${a.modelo} ${a.serialNumber}`).includes(termo))
          .map((a) => ({ item: { ativoId: a.id }, texto: `${a.tag} · ${a.nome}`, detalhe: `${a.marca} ${a.modelo}`.trim() })),
        ...licenses
          .filter((l) => !licencasEscolhidas.has(l.id))
          .filter((l) => normalizar(`${l.nome} ${l.fornecedor}`).includes(termo))
          .map((l) => ({ item: { licencaId: l.id }, texto: l.nome, detalhe: `Licença · ${l.fornecedor}` })),
      ].slice(0, LIMITE_SUGESTOES)
    : [];

  const remover = (alvo: ItemContrato) =>
    onChange(itens.filter((i) => (alvo.ativoId ? i.ativoId !== alvo.ativoId : i.licencaId !== alvo.licencaId)));

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">{resumoItens(itens)}</p>

      {itens.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Itens cobertos pelo contrato">
          {itens.map((i) => {
            const texto = rotulo(i);
            return (
              <li
                key={i.ativoId ? `a:${i.ativoId}` : `l:${i.licencaId}`}
                className="inline-flex items-center gap-1 max-w-full pl-2 pr-1 py-0.5 text-xs text-slate-800 bg-slate-100 border border-slate-200 rounded-md"
              >
                {i.ativoId ? (
                  <Laptop className="w-3 h-3 shrink-0 text-blue-600" aria-hidden="true" />
                ) : (
                  <Key className="w-3 h-3 shrink-0 text-blue-600" aria-hidden="true" />
                )}
                <span className="min-w-0 break-words">{texto}</span>
                <button
                  type="button"
                  onClick={() => remover(i)}
                  aria-label={`Remover ${texto}`}
                  className="p-0.5 shrink-0 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded"
                >
                  <X className="w-3 h-3" />
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
        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" aria-hidden="true" />
        <input
          id="contrato-itens-busca"
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar ativo (patrimônio, nome, série) ou licença para adicionar..."
          className={`${CLASSE_CAMPO} pl-8`}
        />
      </div>

      {termo && (
        <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
          {sugestoes.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">Nenhum ativo ou licença encontrado.</li>
          ) : (
            sugestoes.map((s) => (
              <li key={s.item.ativoId ? `a:${s.item.ativoId}` : `l:${s.item.licencaId}`}>
                <button
                  type="button"
                  onClick={() => onChange([...itens, s.item])}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0 text-blue-600" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900 break-words">{s.texto}</span>
                    {s.detalhe && <span className="block text-slate-500 break-words">{s.detalhe}</span>}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
