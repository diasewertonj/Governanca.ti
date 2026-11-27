/**
 * Seção 28 · Completar cadastros (só a T.I., no Início): aparece só quando há algo
 * incompleto; cada item abre a ficha certa para completar.
 */
import React, { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { pendenciasDeCadastro } from '../../utils/pendenciasCadastro.ts';

const MOSTRAR = 5;

export const CompletarCadastros: React.FC = () => {
  const { fornecedores, licenses, contratos, assets, employees, currentRole, abrirFicha } = useApp();
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  if (currentRole !== 'ti_admin' && currentRole !== 'ti_suporte') return null;
  const grupos = pendenciasDeCadastro({ fornecedores, licencas: licenses, contratos, ativos: assets, pessoas: employees });
  if (grupos.length === 0) return null;
  const total = grupos.reduce((s, g) => s + g.itens.length, 0);

  return (
    <section className="cartao p-4 space-y-3" aria-label="Completar cadastros">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="ico text-amber-700" aria-hidden="true" />
        <h3 className="secao-titulo">Completar cadastros</h3>
        <span className="selo selo-atencao">{total}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {grupos.map((g) => {
          const todos = abertos[g.grupo];
          const lista = todos ? g.itens : g.itens.slice(0, MOSTRAR);
          return (
            <div key={g.grupo} className="rounded-lg border border-slate-200 p-3 space-y-1">
              <p className="font-semibold text-slate-900">
                {g.grupo} <span className="num text-slate-500">({g.itens.length})</span>
              </p>
              <p className="texto-aux">{g.acao}</p>
              <ul className="space-y-0.5">
                {lista.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => abrirFicha(i.ficha)} className="link text-left">
                      {i.nome}
                    </button>
                  </li>
                ))}
              </ul>
              {g.itens.length > MOSTRAR && (
                <button type="button" onClick={() => setAbertos((a) => ({ ...a, [g.grupo]: !todos }))} className="btn btn-sm btn-secundario">
                  {todos ? 'Mostrar menos' : `Ver todos (${g.itens.length})`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
