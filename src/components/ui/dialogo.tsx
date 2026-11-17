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
  const [fila, setFila] = useState<{ id: number; p: Pedido }[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    mostrar = (p) => setFila((f) => [...f, { id: ++seq.current, p }]);
    return () => {
      mostrar = null;
    };
  }, []);

  const atual = fila[0];
  if (!atual) return null;
  // key: cada pedido começa com o campo limpo
  return <Caixa key={atual.id} pedido={atual.p} onFim={() => setFila((f) => f.slice(1))} />;
};

const Caixa: React.FC<{ pedido: Pedido; onFim: () => void }> = ({ pedido, onFim }) => {
  const [texto, setTexto] = useState(pedido.tipo === 'texto' ? pedido.op.inicial || '' : '');
  const campo = useRef<HTMLInputElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (pedido.tipo === 'texto' ? campo.current : botao.current)?.focus();
  }, [pedido.tipo]);

  const { op } = pedido;
  const minimo = pedido.tipo === 'texto' ? pedido.op.minimo || 0 : 0;
  const fechar = (ok: boolean) => {
    if (pedido.tipo === 'confirmar') pedido.resolver(ok);
    else if (pedido.tipo === 'texto') pedido.resolver(ok ? texto.trim() : null);
    else pedido.resolver();
    onFim();
  };
  const podeConfirmar = pedido.tipo !== 'texto' || texto.trim().length >= minimo;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.preventDefault();
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
            {pedido.tipo === 'texto' && (
              <div>
                <label htmlFor="dialogo-texto" className="rotulo">
                  {pedido.op.rotulo || 'Motivo'}
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
          {pedido.tipo !== 'aviso' && (
            <button type="button" onClick={() => fechar(false)} className="btn btn-secundario">
              {op.cancelar || (op.confirmar === 'Cancelar' ? 'Voltar' : 'Cancelar')}
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