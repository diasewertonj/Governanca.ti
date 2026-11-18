/**
 * Fase 11 · Pedidos de compra.
 * T.I.: aba do Financeiro, com valores e todas as ações. RH e gestor: tela própria
 * (menu Pessoas / Minha área), pedem compra e acompanham a situação, sem valores.
 */
import React, { useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { PedidoCompra, StatusPedido } from '../../types/index.ts';
import { ROTULO_CATEGORIA, baixarCsv, brl, paraCsv } from '../../utils/financeiro.ts';
import { ROTULO_STATUS_PEDIDO, SELO_STATUS_PEDIDO, proximoPasso, valorDoPedido } from '../../utils/compras.ts';
import { normalizar } from '../../utils/processos.ts';
import { formatDate } from '../../utils/formatters.ts';
import { Busca, CabecalhoTela, Vazio } from '../ui/Tela.tsx';
import { FichaPedido } from './FichaPedido.tsx';
import { FormPedido, pedidoVazio } from './FormPedido.tsx';

type Filtro = 'andamento' | 'aguardando' | 'encerrados' | 'todos';
const EM_ANDAMENTO: StatusPedido[] = ['rascunho', 'aguardando', 'aprovado', 'comprado', 'recusado'];

export const PedidosCompraView: React.FC<{ abas?: React.ReactNode }> = ({ abas }) => {
  const { currentRole, employees } = useApp();
  const { pedidos, podePedirCompra } = useCompras();
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const [filtro, setFiltro] = useState<Filtro>('andamento');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState<PedidoCompra | null>(null);

  const termo = normalizar(busca.trim());
  const lista = pedidos
    .filter((p) =>
      filtro === 'todos' ? true : filtro === 'encerrados' ? !EM_ANDAMENTO.includes(p.status) : filtro === 'aguardando' ? p.status === 'aguardando' : EM_ANDAMENTO.includes(p.status)
    )
    .filter((p) => !termo || normalizar(`${p.codigo} ${p.titulo} ${p.area} ${p.itens.map((i) => i.descricao).join(' ')}`).includes(termo));
  const nome = (id?: string) => employees.find((e) => e.id === id)?.nome || '—';
  const totalLista = isTI ? lista.filter((p) => p.status !== 'cancelado' && p.status !== 'recusado').reduce((s, p) => s + valorDoPedido(p), 0) : 0;

  const exportar = () =>
    baixarCsv(
      'pedidos-de-compra.csv',
      paraCsv(
        ['Código', 'Pedido', 'Situação', 'Categoria', 'Área', 'Pedido por', 'Criado em', ...(isTI ? ['Valor (R$)'] : [])],
        lista.map((p) => [p.codigo, p.titulo, ROTULO_STATUS_PEDIDO[p.status], ROTULO_CATEGORIA[p.categoria], p.area, nome(p.solicitanteId), p.criadoEm.slice(0, 10), ...(isTI ? [valorDoPedido(p)] : [])])
      )
    );

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo={abas ? 'Financeiro' : 'Pedidos de compra'}
        subtitulo={
          isTI
            ? 'Rascunho → aprovação do administrador → compra (gera a fatura) → recebimento (entra no inventário)'
            : 'Peça equipamentos e acompanhe a situação. A T.I. cota e o administrador aprova; os valores ficam com a T.I.'
        }
        acoes={
          <>
            <button type="button" onClick={exportar} className="btn btn-secundario">
              <Download /> Exportar CSV
            </button>
            {podePedirCompra && (
              <button type="button" onClick={() => setNovo(pedidoVazio())} className="btn btn-primario">
                <Plus /> {isTI ? 'Novo pedido' : 'Pedir compra'}
              </button>
            )}
          </>
        }
        abas={abas}
        filtros={
          <>
            <Busca id="pedidos-busca" valor={busca} onMudar={setBusca} placeholder="Buscar por código, pedido ou item" />
            <select aria-label="Situação" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className="campo campo-sm">
              <option value="andamento">Em andamento</option>
              <option value="aguardando">Aguardando aprovação</option>
              <option value="encerrados">Recebidos e cancelados</option>
              <option value="todos">Todos</option>
            </select>
            {isTI && (
              <span className="ml-auto text-xs text-slate-600">
                Total na lista: <span className="font-mono font-semibold text-slate-900">{brl(totalLista)}</span>
              </span>
            )}
          </>
        }
      />
      {lista.length === 0 ? (
        <Vazio acao={podePedirCompra ? <button type="button" onClick={() => setNovo(pedidoVazio())} className="btn btn-sm btn-primario"><Plus /> {isTI ? 'Novo pedido' : 'Pedir compra'}</button> : undefined}>
          {pedidos.length === 0 ? 'Nenhum pedido de compra ainda.' : 'Nenhum pedido com estes filtros.'}
        </Vazio>
      ) : (
        <div className="cartao overflow-hidden">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Situação</th>
                <th>Área · quem pediu</th>
                {isTI && <th className="text-right">Valor</th>}
                <th className="text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td data-label="Pedido">
                    <span className="font-mono text-slate-500">{p.codigo}</span>
                    <span className="block font-medium text-slate-900">{p.titulo}</span>
                    <span className="block text-slate-500">
                      {p.itens.length} {p.itens.length === 1 ? 'item' : 'itens'} · {formatDate(p.criadoEm.slice(0, 10))}
                      {p.necessarioEm ? ` · precisa até ${formatDate(p.necessarioEm)}` : ''}
                    </span>
                  </td>
                  <td data-label="Situação">
                    <span className={`selo ${SELO_STATUS_PEDIDO[p.status]}`}>{ROTULO_STATUS_PEDIDO[p.status]}</span>
                    {proximoPasso(p) && <span className="block text-slate-500">{proximoPasso(p)}</span>}
                  </td>
                  <td data-label="Área · quem pediu">
                    {p.area || 'Geral'}
                    <span className="block text-slate-500">{nome(p.solicitanteId)}</span>
                  </td>
                  {isTI && (
                    <td data-label="Valor" className="text-right font-mono">
                      {brl(valorDoPedido(p))}
                    </td>
                  )}
                  <td data-label="Ação" className="text-right">
                    <span className="acoes-linha">
                      <button type="button" onClick={() => setAberto(p.id)} className="btn btn-sm btn-secundario">
                        Abrir
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {aberto && <FichaPedido pedidoId={aberto} onClose={() => setAberto(null)} />}
      {novo && <FormPedido inicial={novo} simples={!isTI} onClose={() => setNovo(null)} onSalvo={(p) => setAberto(p.id)} />}
    </div>
  );
};
