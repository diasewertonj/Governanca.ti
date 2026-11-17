import React, { useState } from 'react';
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
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
      <span className="text-slate-500">{rotulo}</span>
      <span className="text-slate-900 break-words">{valor}</span>
    </div>
  );

  return (
    <section aria-label="Pedido do RH" className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-2xs space-y-2 text-xs">
      <h3 className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-slate-500">
        <UserMinus className="w-4 h-4" aria-hidden="true" />
        Pedido do RH
      </h3>
      <div className="grid grid-cols-1 gap-y-1 text-[13px]">
        {linha('Quem sai', pessoa ? `${pessoa.nome} · ${pessoa.cargo}` : 'colaborador não encontrado')}
        {linha('Último dia', formatDate(off.dataDesligamento))}
        {linha('E-mail', off.redirecionarEmail ? `redirecionar/dar acesso para ${nome(off.redirecionarEmailParaId)}` : 'não redirecionar')}
        {linha('Meu Drive', off.transferirDrive ? `transferir para ${nome(off.transferirDriveParaId)}` : 'não transferir')}
        {off.recolhimentoInstrucoes?.trim() && linha('Recolhimento', off.recolhimentoInstrucoes)}
        {off.observacoes?.trim() && linha('Observações', <span className="whitespace-pre-wrap">{off.observacoes}</span>)}
      </div>

      {/* Equipamentos e softwares como etiquetas que quebram linha; listas longas mostram as 12 primeiras */}
      <div className="space-y-2 pt-2 border-t border-slate-100">
        <ListaEtiquetas
          titulo={`Equipamentos com a pessoa (${equipamentos.length})`}
          itens={equipamentos.map((a) => ({ id: a.id, texto: `${a.tag} · ${a.nome}`, onClick: () => setSelectedAssetIdFor360(a.id) }))}
          icone={<Laptop className="w-3 h-3 text-slate-500 shrink-0" aria-hidden="true" />}
        />
        <ListaEtiquetas
          titulo={`Softwares com a pessoa (${softwares.length})`}
          itens={softwares.map((l) => ({ id: l.id, texto: l.nome }))}
          icone={<Key className="w-3 h-3 text-purple-600 shrink-0" aria-hidden="true" />}
        />
      </div>      <p className="text-slate-500">A T.I. recolhe os equipamentos e desvincula contas e softwares pelo checklist.</p>
    </section>
  );
};

const LIMITE_ETIQUETAS = 12;

/** Etiquetas lado a lado (quebram linha); acima de 12, "mostrar todas" */
const ListaEtiquetas: React.FC<{
  titulo: string;
  itens: { id: string; texto: string; onClick?: () => void }[];
  icone: React.ReactNode;
}> = ({ titulo, itens, icone }) => {
  const [todas, setTodas] = useState(false);
  const visiveis = todas ? itens : itens.slice(0, LIMITE_ETIQUETAS);
  return (
    <div>
      <p className="font-semibold text-slate-700 mb-1">{titulo}</p>
      {itens.length === 0 ? (
        <p className="text-slate-500">Nenhum.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {visiveis.map((i) => {
            const conteudo = (
              <>
                {icone}
                <span className="truncate max-w-[16rem]">{i.texto}</span>
              </>
            );
            return i.onClick ? (
              <button key={i.id} type="button" onClick={i.onClick} title={i.texto} className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100">
                {conteudo}
              </button>
            ) : (
              <span key={i.id} title={i.texto} className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-800">
                {conteudo}
              </span>
            );
          })}
          {itens.length > LIMITE_ETIQUETAS && (
            <button type="button" onClick={() => setTodas(!todas)} className="px-2 py-0.5 text-blue-700 hover:underline">
              {todas ? 'mostrar menos' : `mostrar todas (+${itens.length - LIMITE_ETIQUETAS})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};