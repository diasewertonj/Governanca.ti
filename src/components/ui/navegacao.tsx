/**
 * Navegação por caminho (seção 8.8): fichas e formulários abertos uns a partir dos
 * outros viram níveis de UMA janela. Só o nível de cima aparece; os de baixo ficam
 * montados (escondidos) para voltar do jeito que estavam.
 *  - ← Voltar (e Esc): fecha só o nível de cima, com a checagem de alterações dele.
 *  - Caminho clicável: volta direto a um nível.
 *  - X: fecha tudo (pergunta uma vez se houver alteração não salva em qualquer nível).
 * Janelas pequenas (confirmação, motivo, cadastro rápido) não entram no caminho.
 */
import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { pularConfirmacaoDescarte } from '../comum/BarraAlteracoes.tsx';

interface Nivel {
  id: number;
  rotulo: string;
  fechar: () => void;
}

interface CtxNav {
  niveis: Nivel[];
  registrar: (n: Nivel) => void;
  remover: (id: number) => void;
  atualizar: (id: number, rotulo: string) => void;
  voltarAte: (indice: number) => Promise<void>;
  fecharTudo: () => Promise<void>;
}

const Ctx = createContext<CtxNav | null>(null);
let seq = 0;

export const NavegacaoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { podeDescartarPendencias } = useApp();
  const [niveis, setNiveis] = useState<Nivel[]>([]);
  const ref = useRef<Nivel[]>([]);
  useLayoutEffect(() => {
    ref.current = niveis;
  }, [niveis]);

  const registrar = useCallback((n: Nivel) => setNiveis((l) => [...l, n]), []);
  const remover = useCallback((id: number) => setNiveis((l) => l.filter((n) => n.id !== id)), []);
  const atualizar = useCallback(
    (id: number, rotulo: string) =>
      setNiveis((l) => (l.some((n) => n.id === id && n.rotulo !== rotulo) ? l.map((n) => (n.id === id ? { ...n, rotulo } : n)) : l)),
    []
  );

  /** Fecha os níveis acima de `indice` (de cima para baixo), perguntando uma vez só */
  const voltarAte = useCallback(
    async (indice: number) => {
      const acima = ref.current.slice(indice + 1).reverse();
      if (acima.length === 0) return;
      if (!(await podeDescartarPendencias())) return;
      pularConfirmacaoDescarte(() => acima.forEach((n) => n.fechar()));
    },
    [podeDescartarPendencias]
  );

  const fecharTudo = useCallback(() => voltarAte(-1), [voltarAte]);

  const valor = useMemo(() => ({ niveis, registrar, remover, atualizar, voltarAte, fecharTudo }), [niveis, registrar, remover, atualizar, voltarAte, fecharTudo]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
};

/**
 * Registra a janela como um nível do caminho. Devolve se ela é a de cima (as outras
 * ficam escondidas) e a posição. Fora do provider (testes) tudo funciona como antes.
 */
export function useNivelNavegacao(rotulo: string, fechar: () => void, ativo = true) {
  const ctx = useContext(Ctx);
  const [id] = useState(() => ++seq);
  const { registrar, remover, atualizar } = ctx || {};
  // A função de fechar muda a cada render: o nível chama sempre a mais recente
  const fecharRef = useRef(fechar);
  useLayoutEffect(() => {
    fecharRef.current = fechar;
  });

  useLayoutEffect(() => {
    if (!ativo || !registrar || !remover) return;
    registrar({ id, rotulo, fechar: () => fecharRef.current() });
    return () => remover(id);
    // registra uma vez; o rótulo é atualizado abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, id, registrar, remover]);

  useLayoutEffect(() => {
    if (ativo && atualizar) atualizar(id, rotulo);
  }, [ativo, atualizar, id, rotulo]);

  const niveis = ctx?.niveis || [];
  const indice = niveis.findIndex((n) => n.id === id);
  return {
    noCaminho: ativo && !!ctx && indice >= 0,
    topo: !ativo || !ctx || indice === -1 || indice === niveis.length - 1,
    indice,
    niveis,
    voltarAte: ctx?.voltarAte,
    fecharTudo: ctx?.fecharTudo,
  };
}

/** Linha do caminho: "Início do caminho › … › anterior › atual" (some no celular) */
export const Caminho: React.FC<{ niveis: { id: number; rotulo: string }[]; indice: number; voltarAte?: (i: number) => void }> = ({
  niveis,
  indice,
  voltarAte,
}) => {
  if (indice <= 0) return null;
  const ate = niveis.slice(0, indice + 1);
  // Caminhos longos: o primeiro, "…" e os dois últimos
  const mostrar = ate.length > 4 ? [ate[0], null, ...ate.slice(-3)] : ate;
  return (
    <nav aria-label="Caminho" className="hidden sm:flex min-w-0 items-center gap-1 text-xs text-slate-500">
      {mostrar.map((n, i) =>
        n === null ? (
          <span key={`r${i}`} className="flex items-center gap-1">
            … <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
          </span>
        ) : (
          <span key={n.id} className="flex min-w-0 items-center gap-1">
            {n.id === ate[ate.length - 1].id ? (
              <span className="truncate max-w-[14rem] font-medium text-slate-700" aria-current="page">
                {n.rotulo}
              </span>
            ) : (
              <>
                <button type="button" onClick={() => voltarAte?.(niveis.findIndex((x) => x.id === n.id))} className="link truncate max-w-[12rem]">
                  {n.rotulo}
                </button>
                <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              </>
            )}
          </span>
        )
      )}
    </nav>
  );
};

/** Botão "Voltar" padrão do caminho (o Esc usa o aria-label) */
export const BotaoVoltar: React.FC<{ onClick: () => void; anterior?: string }> = ({ onClick, anterior }) => (
  <button type="button" aria-label="Voltar" title={anterior ? `Voltar para ${anterior}` : 'Voltar'} onClick={onClick} className="btn btn-sm btn-secundario">
    <ArrowLeft /> <span className="hidden sm:inline">Voltar</span>
  </button>
);
