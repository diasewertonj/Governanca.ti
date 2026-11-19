/**
 * Seção 6 · Telas do menu: Vencimentos, Contas a pagar, Despesas e Conciliar fornecedores.
 * Tudo calculado a partir da fonte única (utils/financeiro.ts); nada é digitado duas vezes.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { contratosResumo, licencasResumo, type ContratoResumo } from '../../services/financeiroDb.ts';
import { Download } from 'lucide-react';
import { Busca, CabecalhoTela, Vazio } from '../ui/Tela.tsx';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import { esperaPorMim } from '../../utils/compras.ts';
import type { Fatura } from '../../types/index.ts';
import { formatDate } from '../../utils/formatters.ts';
import { statusExibido } from '../../utils/faturas.ts';
import { nomeContrato } from '../../utils/contratos.ts';
import { normalizar } from '../../utils/processos.ts';
import { pendenciasTermo } from '../../utils/inventario.ts';
import {
  ROTULO_VENCIMENTO,
  baixarCsv,
  brl,
  listarVencimentos,
  paraCsv,
  type TipoVencimento,
  type Vencimento,
  valorEfetivo,
} from '../../utils/financeiro.ts';
import { FaturasSecao } from './FaturasSecao.tsx';

// -----------------------------------------------------------------------------
// Vencimentos
// -----------------------------------------------------------------------------
export const VencimentosView: React.FC<{ noInicio?: boolean }> = ({ noInicio }) => {
  const { assets, contratos, licenses, faturas, employees, tickets, terms, settings, processoItens, abrirFicha, setSelectedTicketIdForDetail } = useApp();
  const { estoque, linhas } = useRecursos();
  const { pedidos: todosPedidos, alertas: alertasOrcamento } = useCompras();
  const { currentRole, currentUser } = useApp();
  const pedidos = useMemo(() => todosPedidos.filter((p) => esperaPorMim(p, currentRole, currentUser?.id)), [todosPedidos, currentRole, currentUser?.id]);
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);
  const [horizonte, setHorizonte] = useState(60);
  const [tipo, setTipo] = useState<TipoVencimento | 'todos'>('todos');
  const [contratoAberto, setContratoAberto] = useState<string | null>(null);

  // Seção 9.2/9.5: passos agendados dos processos e termos desatualizados entram aqui também
  const lista = useMemo(() => {
    const termosDesatualizados = pendenciasTermo(employees, { ativos: assets, termos: terms, chamados: tickets, cfg: settings.termoExige });
    return listarVencimentos(
      { ativos: assets, contratos, licencas: licenses, faturas, estoque, linhas, pessoas: employees, processoItens, chamados: tickets, termosDesatualizados, termos: terms, pedidos, alertasOrcamento, papel: currentRole },
      horizonte
    );
  }, [assets, contratos, licenses, faturas, estoque, linhas, employees, processoItens, tickets, terms, settings.termoExige, horizonte, pedidos, alertasOrcamento, currentRole]).filter(
    (v) => tipo === 'todos' || v.tipo === tipo
  );

  const abrir = (v: Vencimento) => {
    if (v.alvo.tipo === 'processo') setSelectedTicketIdForDetail(v.alvo.id);
    else if (v.alvo.tipo === 'pessoa') abrirFicha({ tipo: 'colaborador', id: v.alvo.id });
    else if (v.alvo.tipo === 'ativo') abrirFicha({ tipo: 'ativo', id: v.alvo.id });
    else if (v.alvo.tipo === 'licenca') abrirFicha({ tipo: 'software', id: v.alvo.id });
    else if (v.alvo.tipo === 'contrato') setContratoAberto(v.alvo.id);
    else if (v.alvo.tipo === 'pedido') setPedidoAberto(v.alvo.id);
    else if (v.alvo.tipo === 'fatura') {
      const f = faturas.find((x) => x.id === v.alvo.id);
      if (f?.pedidoId) setPedidoAberto(f.pedidoId);
      else if (f?.contratoId) setContratoAberto(f.contratoId);
      else if (f?.licencaId) abrirFicha({ tipo: 'software', id: f.licencaId });
    }
  };

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo={noInicio ? 'Precisa de atenção' : 'Vencimentos'}
        subtitulo="Garantias, contratos, prazos de cancelamento, renovações, faturas, estoque baixo, recursos de desligados, passos agendados, termos desatualizados, orçamento e pedidos de compra"
        filtros={
          <>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoVencimento | 'todos')} aria-label="Tipo" className="campo campo-sm">
              <option value="todos">Todos os tipos</option>
              {Object.entries(ROTULO_VENCIMENTO).map(([k, r]) => (
                <option key={k} value={k}>{r}</option>
              ))}
            </select>
            <select value={horizonte} onChange={(e) => setHorizonte(Number(e.target.value))} aria-label="Período" className="campo campo-sm">
              <option value={30}>Próximos 30 dias</option>
              <option value={60}>Próximos 60 dias</option>
              <option value={90}>Próximos 90 dias</option>
              <option value={365}>Próximos 12 meses</option>
            </select>
          </>
        }
      />
      {lista.length === 0 ? (
        <Vazio>Nada vencendo neste período.</Vazio>
      ) : (
        <div className="cartao overflow-hidden">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Tipo</th>
                <th>O quê</th>
                <th className="text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <tr key={v.id}>
                  <td data-label="Quando">
                    {v.data ? (
                      <>
                        <span className="font-semibold text-slate-900">{formatDate(v.data)}</span>
                        <span className={`block ${v.dias !== undefined && v.dias < 0 ? 'text-red-700' : v.dias !== undefined && v.dias <= 15 ? 'text-amber-800' : 'text-slate-500'}`}>
                          {v.dias === undefined ? '' : v.dias < 0 ? `há ${-v.dias} dia(s)` : v.dias === 0 ? 'hoje' : `em ${v.dias} dia(s)`}
                        </span>
                      </>
                    ) : (
                      <span className="text-red-700 font-semibold">Pendência</span>
                    )}
                  </td>
                  <td data-label="Tipo">{ROTULO_VENCIMENTO[v.tipo]}</td>
                  <td data-label="O quê">
                    <span className="font-medium text-slate-900">{v.titulo}</span>
                    {v.detalhe && <span className="block text-slate-500">{v.detalhe}</span>}
                  </td>
                  <td data-label="Ação" className="text-right">
                    {v.alvo.tipo !== 'estoque' && v.alvo.tipo !== 'linha' && v.alvo.tipo !== 'orcamento' && (
                      <span className="acoes-linha">
                        <button type="button" onClick={() => abrir(v)} className="btn btn-sm btn-secundario">
                          {v.alvo.tipo === 'processo'
                            ? 'Abrir processo'
                            : v.alvo.tipo === 'pedido'
                              ? 'Abrir pedido'
                            : v.alvo.tipo === 'pessoa'
                              ? 'Abrir ficha'
                              : v.tipo === 'contrato' || v.tipo === 'cancelamento'
                                ? 'Abrir contrato (renovar/encerrar)'
                                : 'Abrir'}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {contratoAberto && <ContratoPorId id={contratoAberto} onClose={() => setContratoAberto(null)} />}
      {pedidoAberto && (
        <React.Suspense fallback={null}>
          <FichaPedidoLazy pedidoId={pedidoAberto} onClose={() => setPedidoAberto(null)} />
        </React.Suspense>
      )}
    </div>
  );
};

const FichaPedidoLazy = React.lazy(() => import('../compras/FichaPedido.tsx').then((m) => ({ default: m.FichaPedido })));

/** Abre a ficha do contrato a partir de outras telas */
const ContratoFichaLazy = React.lazy(() => import('../fornecedores/ContratoFicha.tsx').then((m) => ({ default: m.ContratoFicha })));
export const ContratoPorId: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const { contratos } = useApp();
  const contrato = contratos.find((c) => c.id === id);
  if (!contrato) return null;
  return (
    <React.Suspense fallback={null}>
      <ContratoFichaLazy contratoId={contrato.id} onClose={onClose} />
    </React.Suspense>
  );
};

// -----------------------------------------------------------------------------
// Contas a pagar
// -----------------------------------------------------------------------------
export const ContasPagarView: React.FC<{ abas?: React.ReactNode }> = ({ abas }) => {
  const { faturas, contratos, licenses, fornecedores, currentRole } = useApp();
  const [status, setStatus] = useState<'abertas' | 'vencidas' | 'pagas' | 'todas'>('abertas');
  const [fornecedorId, setFornecedorId] = useState('');
  const [mes, setMes] = useState('');
  const [busca, setBusca] = useState('');
  // Decisão 1: Compras paga todas as faturas e vê só o resumo de contratos e licenças
  const [resumo, setResumo] = useState<{ contratos: ContratoResumo[]; licencas: { id: string; nome: string; fornecedorId?: string }[] }>({ contratos: [], licencas: [] });
  useEffect(() => {
    if (currentRole !== 'compras') return;
    let vivo = true;
    Promise.all([contratosResumo(), licencasResumo()]).then(([c, l]) => {
      if (vivo) setResumo({ contratos: c || [], licencas: l || [] });
    });
    return () => {
      vivo = false;
    };
  }, [currentRole]);

  const { pedidos: pedidosCompra } = useCompras();
  const fornecedorDe = (f: Fatura) =>
    f.fornecedorId ||
    (f.pedidoId
      ? pedidosCompra.find((p) => p.id === f.pedidoId)?.fornecedorId
      : f.contratoId
        ? contratos.find((c) => c.id === f.contratoId)?.fornecedorId || resumo.contratos.find((c) => c.id === f.contratoId)?.fornecedorId
        : licenses.find((l) => l.id === f.licencaId)?.fornecedorId || resumo.licencas.find((l) => l.id === f.licencaId)?.fornecedorId);
  const nomeOrigem = (f: Fatura) => {
    const c = contratos.find((x) => x.id === f.contratoId);
    if (f.pedidoId) {
      const p = pedidosCompra.find((x) => x.id === f.pedidoId);
      return p ? `Pedido ${p.codigo} · ${p.titulo}` : 'Pedido de compra';
    }
    if (!f.contratoId && !f.licencaId) return f.descricao || 'Conta avulsa';
    if (f.contratoId && !c) {
      const r = resumo.contratos.find((x) => x.id === f.contratoId);
      return r ? `Contrato ${fornecedores.find((x) => x.id === r.fornecedorId)?.nome || ''} (${r.tipo})` : 'Contrato';
    }
    return c ? nomeContrato(c) : licenses.find((l) => l.id === f.licencaId)?.nome || resumo.licencas.find((l) => l.id === f.licencaId)?.nome || '';
  };
  const agora = new Date();
  const lista = faturas
    .filter((f) => {
      const s = statusExibido(f, agora);
      if (status === 'abertas') return s === 'a_pagar' || s === 'vencida';
      if (status === 'vencidas') return s === 'vencida';
      if (status === 'pagas') return s === 'paga';
      return true;
    })
    .filter((f) => !fornecedorId || fornecedorDe(f) === fornecedorId)
    .filter((f) => !mes || f.competencia.startsWith(mes))
    .filter((f) => !busca || normalizar(`${nomeOrigem(f)} ${f.numeroDocumento || ''}`).includes(normalizar(busca)))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const total = lista.filter((f) => f.status !== 'cancelada').reduce((s, f) => s + valorEfetivo(f), 0);

  const exportar = () =>
    baixarCsv(
      'contas-a-pagar.csv',
      paraCsv(
        ['Origem', 'Fornecedor', 'Competência', 'Vencimento', 'Valor (R$)', 'Situação', 'Pago em', 'Documento'],
        lista.map((f) => [
          nomeOrigem(f),
          fornecedores.find((x) => x.id === fornecedorDe(f))?.nome || '',
          f.competencia.slice(0, 7),
          f.vencimento,
          valorEfetivo(f),
          statusExibido(f, agora),
          f.pagoEm || '',
          f.numeroDocumento || '',
        ])
      )
    );

  return (
    <div className="space-y-3">
      <CabecalhoTela
        titulo="Contas a pagar"
        subtitulo="Todas as faturas: contratos, licenças, pedidos de compra e contas avulsas"
        acoes={
          <button type="button" onClick={exportar} className="btn btn-secundario">
            <Download /> Exportar CSV
          </button>
        }
        abas={abas}
        filtros={
          <>
            <Busca id="contas-busca" valor={busca} onMudar={setBusca} placeholder="Buscar origem ou documento..." />
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Situação" className="campo campo-sm">
              <option value="abertas">A pagar e vencidas</option>
              <option value="vencidas">Só vencidas</option>
              <option value="pagas">Pagas</option>
              <option value="todas">Todas</option>
            </select>
            <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} aria-label="Fornecedor" className="campo campo-sm">
              <option value="">Todos os fornecedores</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Competência" title="Competência" className="campo campo-sm" />
            <span className="ml-auto text-xs text-slate-600">
              Total na lista: <span className="font-mono font-semibold text-slate-900">{brl(total)}</span>
            </span>
          </>
        }
      />
      <FaturasSecao listaGlobal={lista} nomeOrigem={nomeOrigem} />
    </div>
  );
};

