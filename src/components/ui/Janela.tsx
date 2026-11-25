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
  /** Seção 19: fichas de pessoa mostram as iniciais num avatar no lugar do ícone */
  avatar?: string;
}> = ({ titulo, subtitulo, icone, tamanho = 'm', acoes, rodape, onFechar, children, faixa, idTitulo = 'janela-titulo', rotuloCaminho, noCaminho, avatar }) => {
  const iniciais = avatar
    ? avatar
        .split(/\s+/)
        .filter(Boolean)
        .filter((_, i, a) => i === 0 || i === a.length - 1)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
    : '';
  const rotulo = rotuloCaminho || (typeof titulo === 'string' ? titulo : 'Janela');
  const nav = useNivelNavegacao(rotulo, onFechar, noCaminho ?? tamanho !== 'p');
  const temAnterior = nav.noCaminho && nav.indice > 0;

  return (
    <div className={`janela-fundo modal-tela ${nav.topo ? '' : 'hidden'}`}>
      <div role="dialog" aria-modal="true" aria-labelledby={idTitulo} className={`janela janela-${tamanho}`}>
        <div className="janela-cabecalho">
          {/* Linha de cima: ícone, título e subtítulo ocupam tudo; o fechar fica ao lado */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {temAnterior && <BotaoVoltar onClick={onFechar} anterior={nav.niveis[nav.indice - 1]?.rotulo} />}
            {avatar ? (
              <span className="avatar avatar-lg" aria-hidden="true">
                {iniciais}
              </span>
            ) : (
              icone && <div className="janela-icone">{icone}</div>
            )}
            <div className="min-w-0">
              {temAnterior && <Caminho niveis={nav.niveis} indice={nav.indice} voltarAte={nav.voltarAte} />}
              <h2 id={idTitulo} className="janela-titulo line-clamp-2 break-words">
                {titulo}
              </h2>
              {subtitulo && <p className="texto-aux line-clamp-2 break-words">{subtitulo}</p>}
            </div>
          </div>
          {/* Decisão do dono: fechar sempre no canto de cima; as ações sempre numa linha própria,
              abaixo do título e alinhadas à esquerda (igual em qualquer largura) */}
          {temAnterior ? (
            <button type="button" aria-label="Fechar tudo" title="Fechar tudo" onClick={() => void nav.fecharTudo?.()} className="btn-icone self-start">
              <X className="ico-lg" />
            </button>
          ) : (
            <button type="button" aria-label="Fechar" onClick={onFechar} className="btn-icone self-start">
              <X className="ico-lg" />
            </button>
          )}
          {acoes && <div className="flex w-full flex-wrap items-center gap-2">{acoes}</div>}
        </div>
        {/* Seção 19: abas da ficha sublinhadas, coladas ao cabeçalho (sem faixa cinza à parte) */}
        {faixa && <div className="janela-faixa">{faixa}</div>}
        <div className="janela-corpo">{children}</div>
        {rodape && <div className="janela-rodape">{rodape}</div>}
      </div>
    </div>
  );
};

/**
 * Seção 19: resumo compacto — rótulo e valor na mesma linha, em colunas; o que
 * está vazio não aparece (nada de "—" ocupando espaço). Use dentro de `<dl className="resumo">`.
 */
export const DadoLinha: React.FC<{ rotulo: string; children?: React.ReactNode; largo?: boolean; naoMostrar?: boolean }> = ({ rotulo, children, largo, naoMostrar }) => {
  if (naoMostrar || children === null || children === undefined || children === '' || children === '—' || children === false) return null;
  return (
    <div className={`flex min-w-0 items-baseline gap-2 ${largo ? 'sm:col-span-full' : ''}`}>
      <dt className="texto-aux w-32 shrink-0">{rotulo}</dt>
      <dd className="min-w-0 break-words text-slate-900">{children}</dd>
    </div>
  );
};

/**
 * Rótulo em cima, valor embaixo (resumos das fichas). Seção 19: campo vazio
 * ("—", vazio ou nulo) não aparece; `mostrarVazio` mantém o "—" quando a falta
 * do dado é a informação.
 */
export const Dado: React.FC<{ rotulo: string; children?: React.ReactNode; className?: string; mostrarVazio?: boolean }> = ({
  rotulo,
  children,
  className = '',
  mostrarVazio = false,
}) => {
  const vazio = children === null || children === undefined || children === '' || children === '—' || children === false;
  if (vazio && !mostrarVazio) return null;
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="texto-aux">{rotulo}</dt>
      <dd className="font-semibold break-words text-slate-900">{vazio ? '—' : children}</dd>
    </div>
  );
};
