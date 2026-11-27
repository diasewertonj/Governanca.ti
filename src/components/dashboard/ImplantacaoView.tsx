/**
 * Seção 31 · Implantação (Administração › Implantação, só o admin): os primeiros passos e os
 * cadastros a completar numa tela própria — saíram do Início.
 */
import React from 'react';
import { CabecalhoTela } from '../ui/Tela.tsx';
import { PrimeirosPassos } from './PrimeirosPassos.tsx';
import { CompletarCadastros } from './CompletarCadastros.tsx';

export const ImplantacaoView: React.FC<{ onNavigate: (v: string) => void }> = ({ onNavigate }) => (
  <div className="space-y-4">
    <CabecalhoTela titulo="Implantação" subtitulo="O passo a passo para começar a usar o Nexus e o que ainda falta completar nos cadastros" />
    <PrimeirosPassos onNavigate={onNavigate} naTela />
    <CompletarCadastros naTela />
  </div>
);
