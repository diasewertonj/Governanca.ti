/**
 * Modelo de tela de lista (seção 8): Cabeçalho (título, subtítulo, ações à direita)
 * → Barra de filtros (busca à esquerda, filtros, total/CSV à direita) → conteúdo.
 */
import React from 'react';
import { Search } from 'lucide-react';

export const CabecalhoTela: React.FC<{
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  acoes?: React.ReactNode;
  /** Abas da tela, logo abaixo do título (dentro do mesmo cartão) */
  abas?: React.ReactNode;
  /** Filtros dentro do mesmo cartão, abaixo do título */
  filtros?: React.ReactNode;
}> = ({ titulo, subtitulo, acoes, abas, filtros }) => (
  <div className="cartao p-4 space-y-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="tela-titulo">{titulo}</h2>
        {subtitulo && <p className="tela-subtitulo">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{acoes}</div>}
    </div>
    {abas && <div>{abas}</div>}
    {filtros && <div className="barra-filtros">{filtros}</div>}
  </div>
);

/** Campo de busca padrão (ícone à esquerda) */
export const Busca: React.FC<{ valor: string; onMudar: (v: string) => void; placeholder: string; id?: string }> = ({
  valor,
  onMudar,
  placeholder,
  id,
}) => (
  <div className="relative w-full sm:w-64">
    <label htmlFor={id} className="sr-only">
      {placeholder}
    </label>
    <input id={id} type="search" value={valor} onChange={(e) => onMudar(e.target.value)} placeholder={placeholder} className="campo campo-sm pl-8" />
    <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
  </div>
);

/** Estado vazio padrão */
export const Vazio: React.FC<{ children: React.ReactNode; acao?: React.ReactNode }> = ({ children, acao }) => (
  <div className="vazio space-y-2">
    <p>{children}</p>
    {acao}
  </div>
);
