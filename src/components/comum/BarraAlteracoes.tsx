import { confirmar } from '../ui/dialogo.tsx';
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
        <p className="font-semibold text-amber-900">
          {itens.length === 1 ? '1 alteração não salva' : `${itens.length} alterações não salvas`}
        </p>
        <ul className="mt-0.5 text-amber-800 space-y-0.5">
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
          className="btn btn-secundario"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando}
          className="btn btn-primario"
        >
          {salvando ? 'Salvando...' : rotuloSalvar}
        </button>
      </div>
    </div>
  );
};

// Fechar vários níveis do caminho de uma vez: a pergunta é feita uma vez só (antes),
// e os fechamentos em seguida não perguntam de novo.
let pularConfirmacao = false;
export function pularConfirmacaoDescarte(fechar: () => void) {
  pularConfirmacao = true;
  try {
    fechar();
  } finally {
    setTimeout(() => {
      pularConfirmacao = false;
    }, 0);
  }
}

/** Pergunta antes de descartar alterações (fechar janela, trocar de aba). */
export async function confirmarDescarte(itens: string[]): Promise<boolean> {
  if (itens.length === 0 || pularConfirmacao) return true;
  return confirmar({
    titulo: itens.length === 1 ? 'Há 1 alteração não salva' : `Há ${itens.length} alterações não salvas`,
    mensagem: itens.map((i) => `• ${i}`).join('\n') + '\n\nSe continuar, elas serão descartadas.',
    confirmar: 'Descartar e continuar',
    cancelar: 'Voltar e salvar',
    perigo: true,
  });
}
