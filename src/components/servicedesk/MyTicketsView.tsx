import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate, rotuloStatus } from '../../utils/formatters.ts';
import { Plus, Laptop } from 'lucide-react';
import { CabecalhoTela, Vazio } from '../ui/Tela.tsx';

interface MyTicketsViewProps {
  onOpenNewTicketModal: () => void;
}

const SELO_STATUS: Record<string, string> = {
  aberto: 'selo-info',
  em_andamento: 'selo-atencao',
  aguardando_terceiro: 'selo-atencao',
  resolvido: 'selo-ok',
  cancelado: 'selo-neutro',
};

export const MyTicketsView: React.FC<MyTicketsViewProps> = ({ onOpenNewTicketModal }) => {
  const { currentUser, tickets, assets, setSelectedTicketIdForDetail } = useApp();

  if (!currentUser) return null;

  const myTickets = tickets.filter((t) => t.solicitanteId === currentUser.id);

  const getAsset = (assetId?: string) => assets.find((a) => a.id === assetId);

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo="Meus chamados"
        subtitulo="Chamados abertos por você e a situação de cada um"
        acoes={
          <button type="button" onClick={onOpenNewTicketModal} className="btn btn-primario">
            <Plus /> Novo chamado
          </button>
        }
      />

      <div className="cartao overflow-hidden">
        <table className="tabela tabela-cartoes">
          <thead>
            <tr>
              <th>Código</th>
              <th>Chamado</th>
              <th>Abertura</th>
              <th>Situação</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {myTickets.length > 0 ? (
              myTickets.map((tkt) => {
                const asset = getAsset(tkt.ativoId);
                return (
                  <tr key={tkt.id} onClick={() => setSelectedTicketIdForDetail(tkt.id)} className="hover:bg-slate-50/70 cursor-pointer">
                    <td data-label="Código" className="font-mono font-bold text-slate-800">
                      {tkt.codigo}
                    </td>
                    <td data-label="Chamado">
                      <span className="font-semibold text-slate-900 block">{tkt.titulo}</span>
                      <span className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2">
                        <span className="capitalize">{tkt.categoria}</span>
                        {asset && (
                          <span className="text-blue-700 font-medium flex items-center gap-1">
                            <Laptop className="w-3 h-3" />
                            {asset.tag} ({asset.nome})
                          </span>
                        )}
                      </span>
                    </td>
                    <td data-label="Abertura" className="text-slate-500">
                      {formatDate(tkt.dataCriacao)}
                    </td>
                    <td data-label="Situação">
                      <span className={`selo ${SELO_STATUS[tkt.status] || 'selo-neutro'}`}>{rotuloStatus(tkt.status)}</span>
                    </td>
                    <td data-label="Ações" className="text-right">
                      <span className="acoes-linha">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTicketIdForDetail(tkt.id);
                          }}
                          aria-label={`Abrir o chamado ${tkt.codigo}`}
                          className="btn btn-sm btn-primario"
                        >
                          Abrir
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5}>
                  <Vazio>Você não possui nenhum chamado aberto no momento.</Vazio>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
