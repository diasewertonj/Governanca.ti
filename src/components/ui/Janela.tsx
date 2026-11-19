/**
 * Janela padrão (seção 8): fundo, largura (p/m/g/ficha), cabeçalho com ícone,
 * título, subtítulo, ações e fechar; corpo com rolagem; rodapé opcional
 * (excluir à esquerda; Cancelar/Salvar à direita).
 *
 * Navegação por caminho (seção 8.8): janelas m, g e ficha abertas umas a partir
 * das outras viram níveis de uma janela só — aparece a de cima, com "← Voltar"
 * (fecha só ela; o Esc faz o mesmo), o caminho clicável e o X que fecha tudo.
 * Janelas p (cadastro rápido, motivo) ficam por cima, fora do caminho.
 */
import React from 'react';
import { X } from 'lucide-react';
import { BotaoVoltar, Caminho, useNivelNavegacao } from './navegacao.tsx';

export type TamanhoJanela = 'p' | 'm' | 'g' | 'ficha';

export const Janela: React.FC<{
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  icone?: React.ReactNode;
  tamanho?: TamanhoJanela;
  acoes?: React.ReactNode;
  rodape?: React.ReactNode;
  /** Fecha esta janela (no caminho: volta ao nível anterior) */
  onFechar: () => void;
  children: React.ReactNode;
  /** Abas ou faixa logo abaixo do cabeçalho (fixas, não rolam) */
  faixa?: React.ReactNode;
  idTitulo?: string;
  /** Nome no caminho quando o título não é texto simples */
  rotuloCaminho?: string;
  /** false = fica por cima, fora do caminho (padrão: só as pequenas) */
  noCaminho?: boolean;
}> = ({ titulo, subtitulo, icone, tamanho = 'm', acoes, rodape, onFechar, children, faixa, idTitulo = 'janela-titulo', rotuloCaminho, noCaminho }) => {
  const rotulo = rotuloCaminho || (typeof titulo === 'string' ? titulo : 'Janela');
  const nav = useNivelNavegacao(rotulo, onFechar, noCaminho ?? tamanho !== 'p');
  const temAnterior = nav.noCaminho && nav.indice > 0;

  return (
    <div className={`janela-fundo modal-tela ${nav.topo ? '' : 'hidden'}`}>
      <div role="dialog" aria-modal="true" aria-labelledby={idTitulo} className={`janela janela-${tamanho}`}>
        <div className="janela-cabecalho">
          <div className="flex min-w-[12rem] flex-1 items-center gap-2.5">
            {temAnterior && <BotaoVoltar onClick={onFechar} anterior={nav.niveis[nav.indice - 1]?.rotulo} />}
            {icone && <div className="janela-icone">{icone}</div>}
            <div className="min-w-0">
              {temAnterior && <Caminho niveis={nav.niveis} indice={nav.indice} voltarAte={nav.voltarAte} />}
              <h2 id={idTitulo} className="janela-titulo truncate">
                {titulo}
              </h2>
              {subtitulo && <p className="texto-aux truncate">{subtitulo}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 ml-auto">
            {acoes}
            {temAnterior ? (
              <button type="button" aria-label="Fechar tudo" title="Fechar tudo" onClick={() => void nav.fecharTudo?.()} className="btn-icone">
                <X className="ico-lg" />
              </button>
            ) : (
              <button type="button" aria-label="Fechar" onClick={onFechar} className="btn-icone">
                <X className="ico-lg" />
              </button>
            )}
          </div>
        </div>
        {faixa && <div className="border-b border-slate-200 bg-white px-4 py-2 sm:px-6">{faixa}</div>}
        <div className="janela-corpo">{children}</div>
        {rodape && <div className="janela-rodape">{rodape}</div>}
      </div>
    </div>
  );
};

/** Linha "rótulo: valor" usada nos resumos das fichas */
export const Dado: React.FC<{ rotulo: string; children: React.ReactNode; className?: string }> = ({ rotulo, children, className = '' }) => (
  <div className={`min-w-0 ${className}`}>
    <dt className="texto-aux">{rotulo}</dt>
    <dd className="font-semibold break-words text-slate-900">{children ?? '—'}</dd>
  </div>
);
