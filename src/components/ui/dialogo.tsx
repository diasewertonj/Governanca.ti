/**
 * Diálogos do sistema (substituem confirm/prompt/alert do navegador).
 * Uso imperativo, de qualquer lugar: `if (!(await confirmar('Excluir X?'))) return;`
 * O <DialogoHost/> (no App) desenha a janela. Sem host (testes), cai no navegador.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

export interface OpcoesConfirmar {
  titulo: string;
  mensagem?: string;
  confirmar?: string;
  cancelar?: string;
  perigo?: boolean;
}

export interface OpcoesTexto extends OpcoesConfirmar {
  rotulo?: string;
  minimo?: number;
  inicial?: string;
}

type Pedido =
  | { tipo: 'confirmar'; op: OpcoesConfirmar; resolver: (v: boolean) => void }
  | { tipo: 'texto'; op: OpcoesTexto; resolver: (v: string | null) => void }
  | { tipo: 'aviso'; op: OpcoesConfirmar; resolver: () => void };

let mostrar: ((p: Pedido) => void) | null = null;

/** Texto livre vira título (1ª parte) + mensagem (o resto, depois de uma linha em branco) */
function normalizar(x: string | OpcoesConfirmar): OpcoesConfirmar {
  if (typeof x !== 'string') return x;
  const [titulo, ...resto] = x.split('\n\n');
  const perigo = /\b(excluir|remover|apagar|cancelar|estornar|desfazer|liberar|não pode ser desfeita)\b/i.test(x);
  const verbo = titulo.match(/^(Excluir|Remover|Cancelar|Estornar|Desfazer|Liberar|Concluir|Gerar|Reativar|Restaurar|Registrar|Salvar|Usar|Assinar)\b/);
  return { titulo, mensagem: resto.join('\n\n') || undefined, perigo, confirmar: verbo ? verbo[1] : 'Confirmar' };
}

export function confirmar(x: string | OpcoesConfirmar): Promise<boolean> {
  const op = normalizar(x);
  if (!mostrar) return Promise.resolve(window.confirm([op.titulo, op.mensagem].filter(Boolean).join('\n\n')));
  return new Promise((resolver) => mostrar!({ tipo: 'confirmar', op, resolver }));
}

export function pedirTexto(x: string | OpcoesTexto): Promise<string | null> {
  const op = typeof x === 'string' ? { ...normalizar(x), rotulo: 'Motivo', minimo: 5 } : x;
  if (!mostrar) return Promise.resolve(window.prompt([op.titulo, op.mensagem].filter(Boolean).join('\n\n')));
  return new Promise((resolver) => mostrar!({ tipo: 'texto', op, resolver }));
}

export function avisar(x: string | OpcoesConfirmar): Promise<void> {
  const op = { ...normalizar(x), perigo: false, confirmar: 'Entendi' };
  if (!mostrar) {
    window.alert([op.titulo, op.mensagem].filter(Boolean).join('\n\n'));
    return Promise.resolve();
  }
  return new Promise((resolver) => mostrar!({ tipo: 'aviso', op, resolver }));
}

export const DialogoHost: React.FC = () => {
  const [fila, setFila] = useState<Pedido[]>([]);
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const atual = fila[0];

  useEffect(() => {
    mostrar = (p) => setFila((f) => [...f, p]);
    return () => {
      mostrar = null;
    };
  }, []);

  useEffect(() => {
    if (!atual) return;
    setTexto(atual.tipo === 'texto' ? atual.op.inicial || '' : '');
    setTimeout(() => (atual.tipo === 'texto' ? campo.current : botao.current)?.focus(), 0);
  }, [atual]);

  if (!atual) return null;
  const { op } = atual;
  const minimo = atual.tipo === 'texto' ? atual.op.minimo || 0 : 0;
  const fechar = (ok: boolean) => {
    if (atual.tipo === 'confirmar') atual.resolver(ok);
    else if (atual.tipo === 'texto') atual.resolver(ok ? texto.trim() : null);
    else atual.resolver();
    setFila((f) => f.slice(1));
  };
  const podeConfirmar = atual.tipo !== 'texto' || texto.trim().length >= minimo;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          fechar(false);
        }
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo" className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 p-5">
          <span className={`mt-0.5 shrink-0 rounded-full p-1.5 ${op.perigo ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
            {op.perigo ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <h2 id="dialogo-titulo" className="text-sm font-semibold text-slate-900">
              {op.titulo}
            </h2>
            {op.mensagem && <p className="text-xs whitespace-pre-line text-slate-600">{op.mensagem}</p>}
            {atual.tipo === 'texto' && (
              <div>
                <label htmlFor="dialogo-texto" className="rotulo">
                  {atual.op.rotulo || 'Motivo'}
                  {minimo ? ' *' : ''}
                </label>
                <input
                  id="dialogo-texto"
                  ref={campo}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && podeConfirmar && fechar(true)}
                  className="campo"
                />
                {minimo > 0 && <p className="ajuda">Mínimo de {minimo} caracteres.</p>}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {atual.tipo !== 'aviso' && (
            <button type="button" onClick={() => fechar(false)} className="btn btn-secundario">
              {op.cancelar || 'Voltar'}
            </button>
          )}
          <button
            ref={botao}
            type="button"
            disabled={!podeConfirmar}
            onClick={() => fechar(true)}
            className={`btn ${op.perigo ? 'btn-perigo-cheio' : 'btn-primario'}`}
          >
            {op.confirmar || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};
