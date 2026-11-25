/**
 * Modelo de tela de lista (seção 8): Cabeçalho (título, subtítulo, ações à direita)
 * → Barra de filtros (busca à esquerda, filtros, total/CSV à direita) → conteúdo.
 * Seção 19: estados padrão `Carregando` (esqueleto) e `Vazio` (com ação sugerida)
 * e o seletor de densidade das tabelas.
 */
import React, { useState } from 'react';
import { Inbox, Monitor, Moon, Rows3, Rows4, Search, Sun } from 'lucide-react';
import { lerDensidade, salvarDensidade, type Densidade } from '../../utils/densidade.ts';
import { lerTema, salvarTema, type Tema } from '../../utils/tema.ts';

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
    <Search className="ico-sm pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
  </div>
);

/**
 * Estado vazio padrão: ícone, título curto, explicação e a ação sugerida
 * (ex.: "Novo chamado", "Limpar filtros").
 */
export const Vazio: React.FC<{
  children?: React.ReactNode;
  titulo?: React.ReactNode;
  icone?: React.ReactNode;
  acao?: React.ReactNode;
  className?: string;
}> = ({ children, titulo, icone, acao, className = '' }) => (
  <div className={`vazio ${className}`}>
    <span className="text-slate-400" aria-hidden="true">
      {icone ?? <Inbox className="ico-lg" />}
    </span>
    {titulo && <p className="vazio-titulo">{titulo}</p>}
    {children && <p className="max-w-md">{children}</p>}
    {acao && <div className="mt-1 flex flex-wrap justify-center gap-2">{acao}</div>}
  </div>
);

/** Carregando: esqueleto no formato do que vai aparecer (linhas de tabela ou cartões) */
export const Carregando: React.FC<{ linhas?: number; formato?: 'tabela' | 'cartoes' | 'painel'; rotulo?: string }> = ({
  linhas = 5,
  formato = 'tabela',
  rotulo = 'Carregando',
}) => (
  <div role="status" aria-label={rotulo} aria-busy="true">
    {formato === 'tabela' && (
      <div className="cartao-tabela">
        <div className="esqueleto h-8 rounded-none" />
        <div className="space-y-3 p-4">
          {Array.from({ length: linhas }, (_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="esqueleto h-3 flex-[2]" />
              <div className="esqueleto h-3 flex-1" />
              <div className="esqueleto h-3 flex-1" />
              <div className="esqueleto h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    )}
    {formato === 'cartoes' && (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="cartao space-y-2 p-4">
            <div className="esqueleto h-3 w-2/3" />
            <div className="esqueleto h-3 w-1/2" />
            <div className="esqueleto h-3 w-1/3" />
          </div>
        ))}
      </div>
    )}
    {formato === 'painel' && (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="cartao space-y-3 p-4">
            <div className="esqueleto h-3 w-1/2" />
            <div className="esqueleto h-7 w-1/3" />
          </div>
        ))}
      </div>
    )}
    <span className="sr-only">{rotulo}…</span>
  </div>
);

/** Seção 22: aparência (automático, claro, escuro), salva no navegador */
export const SeletorTema: React.FC = () => {
  const [t, setT] = useState<Tema>(lerTema);
  const opcoes: { id: Tema; rotulo: string; icone: React.ReactNode }[] = [
    { id: 'auto', rotulo: 'Automático', icone: <Monitor aria-hidden="true" /> },
    { id: 'claro', rotulo: 'Claro', icone: <Sun aria-hidden="true" /> },
    { id: 'escuro', rotulo: 'Escuro', icone: <Moon aria-hidden="true" /> },
  ];
  return (
    <div role="radiogroup" aria-label="Aparência" className="abas">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={t === o.id}
          onClick={() => {
            setT(o.id);
            salvarTema(o.id);
          }}
          className="aba"
          title={o.id === 'auto' ? 'Segue o tema do computador ou celular' : undefined}
        >
          {o.icone}
          {o.rotulo}
        </button>
      ))}
    </div>
  );
};

/** Densidade das tabelas (confortável / compacta), salva no navegador */
export const SeletorDensidade: React.FC = () => {
  const [d, setD] = useState<Densidade>(lerDensidade);
  const mudar = (nova: Densidade) => {
    setD(nova);
    salvarDensidade(nova);
  };
  return (
    <div role="radiogroup" aria-label="Densidade das tabelas" className="abas">
      <button type="button" role="radio" aria-checked={d === 'confortavel'} onClick={() => mudar('confortavel')} className="aba">
        <Rows3 aria-hidden="true" />
        Confortável
      </button>
      <button type="button" role="radio" aria-checked={d === 'compacta'} onClick={() => mudar('compacta')} className="aba">
        <Rows4 aria-hidden="true" />
        Compacta
      </button>
    </div>
  );
};
