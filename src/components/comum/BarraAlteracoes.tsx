import React from 'react';

interface BarraAlteracoesProps {
  /** Itens alterados, ex.: ["Status: Aberto → Aguardando peça"] */
  itens: string[];
  onCancelar: () => void;
  onSalvar: () => void;
  salvando?: boolean;
  /** Texto do botão principal (padrão: "Salvar alterações") */
  rotuloSalvar?: string;
}

/**
 * Fase 5: padrão único de edição com confirmação. Nada vai para o banco até a
 * pessoa clicar em Salvar; Cancelar volta aos valores originais.
 */
export const BarraAlteracoes: React.FC<BarraAlteracoesProps> = ({
  itens,
  onCancelar,
  onSalvar,
  salvando = false,
  rotuloSalvar = 'Salvar alterações',
}) => {
  if (itens.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Alterações não salvas"
      className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-amber-50 border-t-2 border-amber-300"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-amber-900">
          {itens.length === 1 ? '1 alteração não salva' : `${itens.length} alterações não salvas`}
        </p>
        <ul className="mt-0.5 text-xs text-amber-800 space-y-0.5">
          {itens.map((item) => (
            <li key={item} className="truncate">
              • {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onCancelar}
          disabled={salvando}
          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : rotuloSalvar}
        </button>
      </div>
    </div>
  );
};

/** Pergunta antes de descartar alterações (fechar janela, trocar de aba). */
export function confirmarDescarte(itens: string[]): boolean {
  if (itens.length === 0) return true;
  return window.confirm(
    `Há ${itens.length === 1 ? '1 alteração não salva' : `${itens.length} alterações não salvas`}:\n\n` +
      itens.map((i) => `• ${i}`).join('\n') +
      '\n\nDescartar e continuar?'
  );
}
