import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate, rotuloStatus } from '../../utils/formatters.ts';
import { Plus, Laptop } from 'lucide-react';

interface MyTicketsViewProps {
  onOpenNewTicketModal: () => void;
}

export const MyTicketsView: React.FC<MyTicketsViewProps> = ({ onOpenNewTicketModal }) => {
  const { currentUser, tickets, assets, setSelectedTicketIdForDetail } = useApp();

  if (!currentUser) return null;

  const myTickets = tickets.filter((t) => t.solicitanteId === currentUser.id);

  const getAsset = (assetId?: string) => {
    return assets.find((a) => a.id === assetId);
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Meus Chamados de Suporte Técnico</h2>
          <p className="text-xs text-slate-500">
            Acompanhe o andamento das suas solicitações e as respostas da equipe de T.I.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenNewTicketModal}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Abrir Novo Chamado</span>
        </button>
      </div>

      {/* Lista de Chamados */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs divide-y divide-slate-100 overflow-hidden">
        {myTickets.length > 0 ? (
          myTickets.map((tkt) => {
            const asset = getAsset(tkt.ativoId);

            return (
              <div
                key={tkt.id}
                onClick={() => setSelectedTicketIdForDetail(tkt.id)}
                className="p-5 flex items-center justify-between hover:bg-slate-50/70 transition-colors cursor-pointer text-xs"
              >
                <div className="min-w-0 pr-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-800">{tkt.codigo}</span>
                    <span className="font-semibold text-slate-900 text-sm">{tkt.titulo}</span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                    <span className="capitalize">{tkt.categoria}</span>
                    <span>·</span>
                    <span>Aberto em {formatDate(tkt.dataCriacao)}</span>
                    {asset && (
                      <>
                        <span>·</span>
                        <span className="text-blue-700 font-medium flex items-center gap-1">
                          <Laptop className="w-3 h-3" />
                          {asset.tag} ({asset.nome})
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize ${
                      tkt.status === 'aberto'
                        ? 'text-blue-700 bg-blue-50 border border-blue-200'
                        : tkt.status === 'em_andamento'
                        ? 'text-amber-700 bg-amber-50 border border-amber-200'
                        : tkt.status === 'aguardando_terceiro'
                        ? 'text-purple-700 bg-purple-50 border border-purple-200'
                        : 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                    }`}
                  >
                    {rotuloStatus(tkt.status)}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs">
            Você não possui nenhum chamado aberto no momento.
          </div>
        )}
      </div>
    </div>
  );
};
