/**
 * Janela padrão (seção 8): fundo, largura (p/m/g/ficha), cabeçalho com ícone,
 * título, subtítulo, ações e fechar; corpo com rolagem; rodapé opcional
 * (excluir à esquerda; Cancelar/Salvar à direita). Esc fecha (pelo App).
 */
import React from 'react';
import { X } from 'lucide-react';

export type TamanhoJanela = 'p' | 'm' | 'g' | 'ficha';

export const Janela: React.FC<{
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  icone?: React.ReactNode;
  tamanho?: TamanhoJanela;
  acoes?: React.ReactNode;
  rodape?: React.ReactNode;
  onFechar: () => void;
  children: React.ReactNode;
  /** Abas ou faixa logo abaixo do cabeçalho (fixas, não rolam) */
  faixa?: React.ReactNode;
  idTitulo?: string;
}> = ({ titulo, subtitulo, icone, tamanho = 'm', acoes, rodape, onFechar, children, faixa, idTitulo = 'janela-titulo' }) => (
  <div className="janela-fundo modal-tela">
    <div role="dialog" aria-modal="true" aria-labelledby={idTitulo} className={`janela janela-${tamanho}`}>
      <div className="janela-cabecalho">
        <div className="flex min-w-0 items-center gap-2.5">
          {icone && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100/70 text-blue-700">{icone}</div>}
          <div className="min-w-0">
            <h2 id={idTitulo} className="truncate text-sm font-semibold text-slate-900">
              {titulo}
            </h2>
            {subtitulo && <p className="truncate text-xs text-slate-500">{subtitulo}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {acoes}
          <button type="button" aria-label="Fechar" onClick={onFechar} className="btn-icone">
            <X className="!h-5 !w-5" />
          </button>
        </div>
      </div>
      {faixa && <div className="border-b border-slate-200 bg-white px-5 py-2">{faixa}</div>}
      <div className="janela-corpo">{children}</div>
      {rodape && <div className="janela-rodape">{rodape}</div>}
    </div>
  </div>
);

/** Linha "rótulo: valor" usada nos resumos das fichas */
export const Dado: React.FC<{ rotulo: string; children: React.ReactNode; className?: string }> = ({ rotulo, children, className = '' }) => (
  <div className={`min-w-0 ${className}`}>
    <dt className="text-xs text-slate-500">{rotulo}</dt>
    <dd className="text-xs font-medium break-words text-slate-900">{children ?? '—'}</dd>
  </div>
);
