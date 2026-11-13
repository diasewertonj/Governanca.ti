import React from 'react';
import { Key, Laptop, UserMinus } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Ticket } from '../../types/index.ts';
import { formatDate } from '../../utils/formatters.ts';

/**
 * Ajustes do desligamento: o "Pedido do RH" organizado (no lugar do texto
 * montado), com o que está com a pessoa hoje, só para leitura. Quem recolhe e
 * desvincula é a T.I., pelo checklist.
 */
export const PedidoDesligamento: React.FC<{ ticket: Ticket }> = ({ ticket }) => {
  const { employees, assets, licenses, setSelectedAssetIdFor360 } = useApp();
  const off = ticket.offboarding;
  if (!off) return null;
  const pessoa = employees.find((e) => e.id === (ticket.colaboradorId || off.colaboradorId));
  const nome = (id?: string) => employees.find((e) => e.id === id)?.nome || 'a definir';
  const equipamentos = pessoa ? assets.filter((a) => a.custodianteId === pessoa.id) : [];
  const softwares = pessoa ? licenses.filter((l) => l.colaboradoresIds.includes(pessoa.id)) : [];
  const linha = (rotulo: string, valor: React.ReactNode) => (
    <div className="flex flex-col sm:flex-row sm:gap-2">
      <span className="text-slate-500 sm:w-40 shrink-0">{rotulo}</span>
      <span className="text-slate-900">{valor}</span>
    </div>
  );

  return (
    <section aria-label="Pedido do RH" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3 text-xs">
      <h3 className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-slate-500">
        <UserMinus className="w-4 h-4" aria-hidden="true" />
        Pedido do RH
      </h3>
      <div className="space-y-1.5 text-[13px]">
        {linha('Quem sai', pessoa ? `${pessoa.nome} · ${pessoa.cargo}` : 'colaborador não encontrado')}
        {linha('Último dia', formatDate(off.dataDesligamento))}
        {linha('E-mail', off.redirecionarEmail ? `redirecionar/dar acesso para ${nome(off.redirecionarEmailParaId)}` : 'não redirecionar')}
        {linha('Meu Drive', off.transferirDrive ? `transferir para ${nome(off.transferirDriveParaId)}` : 'não transferir')}
        {off.recolhimentoInstrucoes?.trim() && linha('Recolhimento', off.recolhimentoInstrucoes)}
        {off.observacoes?.trim() && linha('Observações', <span className="whitespace-pre-wrap">{off.observacoes}</span>)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
        <div>
          <p className="font-semibold text-slate-700 mb-1">Equipamentos com a pessoa ({equipamentos.length})</p>
          {equipamentos.length === 0 ? (
            <p className="text-slate-500">Nenhum.</p>
          ) : (
            <ul className="space-y-1">
              {equipamentos.map((a) => (
                <li key={a.id} className="flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                  <button type="button" onClick={() => setSelectedAssetIdFor360(a.id)} className="text-left text-blue-700 hover:underline">
                    {a.tag} · {a.nome}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="font-semibold text-slate-700 mb-1">Softwares com a pessoa ({softwares.length})</p>
          {softwares.length === 0 ? (
            <p className="text-slate-500">Nenhum.</p>
          ) : (
            <ul className="space-y-1">
              {softwares.map((l) => (
                <li key={l.id} className="flex items-center gap-1.5 text-slate-800">
                  <Key className="w-3.5 h-3.5 text-purple-600 shrink-0" aria-hidden="true" />
                  {l.nome}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="text-slate-500">A T.I. recolhe os equipamentos e desvincula contas e softwares pelo checklist.</p>
    </section>
  );
};
