/**
 * Menu "⋯" padrão (seção 8.6): quando uma linha teria mais de 3 ícones de ação,
 * as ações secundárias ficam aqui. Fecha ao escolher, ao clicar fora e com Esc.
 */
import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface AcaoMenu {
  rotulo: string;
  icone?: React.ReactNode;
  onClick: () => void;
  perigo?: boolean;
  oculto?: boolean;
}

export const MenuAcoes: React.FC<{ acoes: AcaoMenu[]; rotulo?: string }> = ({ acoes, rotulo = 'Mais ações' }) => {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visiveis = acoes.filter((a) => !a.oculto);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAberto(false);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setAberto(false);
      }
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla, true);
    };
  }, [aberto]);

  if (visiveis.length === 0) return null;
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        className="btn-icone"
        title={rotulo}
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={(e) => {
          e.stopPropagation();
          setAberto(!aberto);
        }}
      >
        <MoreHorizontal />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 z-40 mt-1 min-w-44 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
          {visiveis.map((a) => (
            <button
              key={a.rotulo}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setAberto(false);
                a.onClick();
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs whitespace-nowrap ${
                a.perigo ? 'text-red-700 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
              } [&_svg]:h-3.5 [&_svg]:w-3.5`}
            >
              {a.icone}
              {a.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
