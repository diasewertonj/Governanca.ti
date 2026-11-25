/**
 * Seção 27 · Peças comuns das telas de Gestão de T.I. (Painel, Orçamento, Projeção,
 * Patrimônio e Análises): número de painel, percentual e link para a ficha.
 * Antes cada tela tinha a sua cópia.
 */
import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { FichaAberta } from '../../utils/fichas.ts';

/** 0,93 → "93%"; sem valor → "—" */
export const pct = (v?: number) => (v === undefined ? '—' : `${Math.round(v * 100)}%`);

/** Número de painel; com `onAbrir`, o cartão inteiro leva à tela do assunto (seção 21) */
export const Numero: React.FC<{ rotulo: string; valor: string; detalhe?: React.ReactNode; tom?: 'atencao' | 'problema'; onAbrir?: () => void }> = ({
  rotulo,
  valor,
  detalhe,
  tom,
  onAbrir,
}) => {
  const conteudo = (
    <>
      <span className="block texto-aux">{rotulo}</span>
      <span className={`block text-lg font-semibold font-mono ${tom === 'problema' ? 'text-red-700' : tom === 'atencao' ? 'text-amber-800' : 'text-slate-900'}`}>{valor}</span>
      {detalhe && <span className="block texto-aux">{detalhe}</span>}
    </>
  );
  return onAbrir ? (
    <button type="button" onClick={onAbrir} className="cartao p-3 min-w-0 text-left hover:border-blue-300 hover:bg-slate-50">
      {conteudo}
    </button>
  ) : (
    <div className="cartao p-3 min-w-0">{conteudo}</div>
  );
};

/** Item citado numa lista: com ficha, vira link que abre a ficha */
export const LinkFicha: React.FC<{ ficha?: FichaAberta; children: React.ReactNode; className?: string }> = ({ ficha, children, className = 'min-w-0 truncate' }) => {
  const { abrirFicha } = useApp();
  return ficha ? (
    <button type="button" onClick={() => abrirFicha(ficha)} className={`link text-left ${className}`}>
      {children}
    </button>
  ) : (
    <span className={className}>{children}</span>
  );
};
