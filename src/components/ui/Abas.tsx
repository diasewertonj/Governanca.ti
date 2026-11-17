/**
 * Padrão único de abas e de navegação lateral (seção 8).
 * Abas: no máximo 6, sempre numa linha (rola na horizontal se faltar espaço).
 * Acima disso (ex.: Configurações), use NavLateral: lista em uma coluna; no celular vira seletor.
 */
import React from 'react';

export interface ItemAba<T extends string> {
  id: T;
  rotulo: string;
  contador?: number;
  icone?: React.ReactNode;
}

export function Abas<T extends string>({
  itens,
  ativa,
  onMudar,
  rotulo,
  className = '',
}: {
  itens: ItemAba<T>[];
  ativa: T;
  onMudar: (id: T) => void;
  rotulo: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={rotulo} className={`abas ${className}`}>
      {itens.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={ativa === a.id} onClick={() => onMudar(a.id)} className="aba">
          {a.icone}
          {a.rotulo}
          {a.contador !== undefined && a.contador > 0 && <span className="aba-contador">{a.contador}</span>}
        </button>
      ))}
    </div>
  );
}

export interface GrupoNav<T extends string> {
  titulo: string;
  itens: ItemAba<T>[];
}

export function NavLateral<T extends string>({
  grupos,
  ativa,
  onMudar,
  rotulo,
}: {
  grupos: GrupoNav<T>[];
  ativa: T;
  onMudar: (id: T) => void;
  rotulo: string;
}) {
  return (
    <>
      {/* Celular: um seletor */}
      <div className="md:hidden">
        <label htmlFor="nav-lateral" className="sr-only">
          {rotulo}
        </label>
        <select id="nav-lateral" value={ativa} onChange={(e) => onMudar(e.target.value as T)} className="campo">
          {grupos.map((g) => (
            <optgroup key={g.titulo} label={g.titulo}>
              {g.itens.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.rotulo}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {/* Telas largas: lista em uma coluna */}
      <nav aria-label={rotulo} className="hidden md:block cartao p-2 space-y-3 self-start">
        {grupos.map((g) => (
          <div key={g.titulo} className="space-y-0.5">
            <p className="px-2.5 pt-1 pb-0.5 secao-titulo">{g.titulo}</p>
            {g.itens.map((i) => (
              <button
                key={i.id}
                type="button"
                aria-current={ativa === i.id ? 'page' : undefined}
                onClick={() => onMudar(i.id)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                  ativa === i.id ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {i.icone}
                <span className="flex-1">{i.rotulo}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
    </>
  );
}
