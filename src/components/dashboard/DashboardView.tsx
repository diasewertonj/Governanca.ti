import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate, rotuloStatus } from '../../utils/formatters.ts';
import { DIAS_ALERTA_CONTRATO, garantiaEfetiva, situacaoContrato } from '../../utils/contratos.ts';
import { DIAS_ALERTA_FATURA, resumoFaturasAPagar } from '../../utils/faturas.ts';
import { brl, despesasRecorrentes, listarVencimentos } from '../../utils/financeiro.ts';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { VencimentosView } from '../financeiro/FinanceiroViews.tsx';
import { termoAberto } from '../../utils/termos.ts';
import { LembreteGarantia } from '../assets/LembreteGarantia.tsx';
import { IndicadoresAtendimento } from './IndicadoresAtendimento.tsx';
import { CabecalhoTela } from '../ui/Tela.tsx';
import {
  Laptop,
  LifeBuoy,
  Users,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (view: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const {
    assets,
    tickets,
    employees,
    licenses,
    contratos,
    faturas,
    setSelectedAssetIdFor360,
    setSelectedTicketIdForDetail,
    currentRole,
    terms,
    abrirFicha,
  } = useApp();
  const { linhas, estoque } = useRecursos();
  const termosAguardando = terms.filter((t) => termoAberto(t) && (!t.formaAssinatura || t.formaAssinatura === 'pendente'));

  const totalAssets = assets.length;
  const assetsInUse = assets.filter((a) => a.status === 'em_uso').length;
  const assetsAvailable = assets.filter((a) => a.status === 'disponivel').length;
  // Mesma regra do contador do menu: só suporte (processos têm tela própria), incluindo "aguardando"
  const emAbertoSuporte = (t: (typeof tickets)[number]) =>
    t.tipo === 'suporte' && (t.status === 'aberto' || t.status === 'em_andamento' || t.status === 'aguardando_terceiro');
  const openTickets = tickets.filter(emAbertoSuporte).length;
  const urgentTickets = tickets.filter((t) => emAbertoSuporte(t) && t.prioridade === 'critica').length;

  // Garantias (efetivas: fábrica ou contrato de suporte/garantia estendida): vencendo
  // em 30 dias, vencidas em uso e os 5 mais próximos do prazo
  const garantias = assets
    .filter((a) => a.status !== 'descartado')
    .map((a) => ({ asset: a, w: garantiaEfetiva(a, contratos) }));
  const expiringWarranties = garantias.filter((g) => g.w.status === 'expirando');
  const expiredInUse = garantias.filter((g) => g.w.status === 'expirada' && g.asset.status === 'em_uso');
  const garantiasProximas = [
    ...[...expiringWarranties].sort((x, y) => x.w.diasRestantes - y.w.diasRestantes),
    ...[...expiredInUse].sort((x, y) => y.w.diasRestantes - x.w.diasRestantes),
  ].slice(0, 5);

  // Fase 8: contratos que vencem em 60 dias e faturas a pagar vencidas ou vencendo em 7 dias
  const contratosVencendo = contratos.filter((c) => situacaoContrato(c).situacao === 'vencendo').length;
  const faturasAPagar = resumoFaturasAPagar(faturas);
  // Seção 6: custo recorrente (fonte única) e renovações/prazos de cancelamento em 30 dias
  const custoMensal = despesasRecorrentes({ licencas: licenses, contratos, linhas }).reduce((s, i) => s + i.mensal, 0);
  const renovacoes30 = listarVencimentos(
    { ativos: assets, contratos, licencas: licenses, faturas, estoque, linhas, pessoas: employees },
    30
  ).filter((v) => v.tipo === 'contrato' || v.tipo === 'licenca' || v.tipo === 'cancelamento' || v.tipo === 'sem_contrato').length;
  const emManutencao = assets.filter((a) => a.status === 'manutencao').length;
  const mostrarQuadro =
    garantiasProximas.length > 0 ||
    contratosVencendo > 0 ||
    faturasAPagar.vencidas > 0 ||
    faturasAPagar.vencemEmBreve > 0 ||
    emManutencao > 0;

  // Chamados recentes
  const recentTickets = [...tickets]
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <CabecalhoTela titulo="Início" subtitulo="Visão geral do parque de T.I., do atendimento e do que precisa de atenção" />

      {/* 4 Cards de Métricas Principais (Clean, sem pills decorativas) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="cartao p-5">
          <div className="flex items-center justify-between">
            <span className="secao-titulo">
              Ativos Totais de T.I.
            </span>
            <Laptop className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-900">
              {totalAssets}
            </span>
            <span className="text-xs text-slate-500">equipamentos</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span className="font-semibold text-blue-700">{assetsInUse} em uso</span>
            <span>·</span>
            <span className="font-semibold text-emerald-700">{assetsAvailable} em estoque</span>
          </div>
        </div>

        <div className="cartao p-5">
          <div className="flex items-center justify-between">
            <span className="secao-titulo">
              Chamados em aberto
            </span>
            <LifeBuoy className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-900">
              {openTickets}
            </span>
            <span className="text-xs text-slate-500">em aberto</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            {urgentTickets > 0 ? (
              <span className="text-red-700 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {urgentTickets} com prioridade urgente
              </span>
            ) : (
              <span className="text-emerald-700 font-semibold">Sem pendências críticas</span>
            )}
          </div>
        </div>

        <div className="cartao p-5">
          <div className="flex items-center justify-between">
            <span className="secao-titulo">
              Colaboradores Ativos
            </span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-900">
              {employees.filter((e) => e.status === 'ativo').length}
            </span>
            <span className="text-xs text-slate-500">sob gestão</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Com custódia e histórico
          </div>
        </div>

        <div className="cartao p-5">
          <div className="flex items-center justify-between">
            <span className="secao-titulo">
              Licenças de Software
            </span>
            <ShieldCheck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-900">
              {licenses.reduce((acc, l) => acc + l.assentosAlocados, 0)}/
              {licenses.reduce((acc, l) => acc + l.assentosTotais, 0)}
            </span>
            <span className="text-xs text-slate-500">assentos alocados</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {licenses.filter((l) => (l.status || 'ativa') === 'ativa').length} licenças ativas
          </div>
        </div>
      </div>

      {/* Quadro de garantias e contratos (se houver algo a decidir) */}
      {mostrarQuadro && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Garantias e contratos</h3>
              <p className="text-xs text-amber-800 mt-0.5">
                Revise os contratos de suporte e acione os fornecedores caso haja pendências técnicas.
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-3 mt-3">
                <div>
                  <div className="text-xl font-bold text-amber-900">{expiringWarranties.length}</div>
                  <div className="text-xs text-amber-800">garantias vencem em 30 dias</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-amber-900">{expiredInUse.length}</div>
                  <div className="text-xs text-amber-800">vencidas em uso</div>
                </div>
                <button
                  type="button"
                  onClick={() => document.getElementById('precisa-atencao')?.scrollIntoView({ behavior: 'smooth' })}
                  className="btn-icone text-left -m-1"
                >
                  <div className="text-xl font-bold text-amber-900">{contratosVencendo}</div>
                  <div className="text-xs text-amber-800 underline-offset-2 hover:underline">
                    {contratosVencendo === 1 ? 'contrato vence' : 'contratos vencem'} em {DIAS_ALERTA_CONTRATO} dias
                  </div>
                </button>
                <button type="button" onClick={() => onNavigate('financeiro')} className="btn-icone text-left -m-1">
                  <div className="text-xl font-bold text-amber-900 font-mono">{brl(custoMensal)}</div>
                  <div className="text-xs text-amber-800 underline-offset-2 hover:underline">custo mensal recorrente</div>
                </button>
                <button type="button" onClick={() => document.getElementById('precisa-atencao')?.scrollIntoView({ behavior: 'smooth' })} className="btn-icone text-left -m-1">
                  <div className="text-xl font-bold text-amber-900">{renovacoes30}</div>
                  <div className="text-xs text-amber-800 underline-offset-2 hover:underline">renovações e prazos de cancelamento em 30 dias</div>
                </button>
                <button type="button" onClick={() => onNavigate('financeiro')} className="btn-icone text-left -m-1">
                  <div className="text-xl font-bold text-amber-900">
                    <span className={faturasAPagar.vencidas > 0 ? 'text-red-700' : ''}>{faturasAPagar.vencidas}</span>
                    <span className="text-amber-700 font-normal"> · </span>
                    {faturasAPagar.vencemEmBreve}
                  </div>
                  <div className="text-xs text-amber-800 underline-offset-2 hover:underline">faturas vencidas · vencem em {DIAS_ALERTA_FATURA} dias</div>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('assets')}
                  className="btn-icone text-left -m-1"
                >
                  <div className="text-xl font-bold text-amber-900">{emManutencao}</div>
                  <div className="text-xs text-amber-800 underline-offset-2 hover:underline">
                    {emManutencao === 1 ? 'ativo em manutenção' : 'ativos em manutenção'}
                  </div>
                </button>
              </div>
              {garantiasProximas.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {garantiasProximas.map(({ asset: a, w }) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0 flex flex-wrap items-center gap-x-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setSelectedAssetIdFor360(a.id)}
                          className="inline-flex items-center gap-1.5 text-amber-900 font-medium hover:underline text-left"
                        >
                          <span>{a.tag}</span>
                          <span>·</span>
                          <span>{a.nome}</span>
                        </button>
                        <span className="text-slate-600">
                          {w.status === 'expirada'
                            ? `venceu em ${formatDate(w.fim)}`
                            : w.diasRestantes === 0
                            ? 'vence hoje'
                            : `vence em ${w.diasRestantes} dia(s) (${formatDate(w.fim)})`}
                        </span>
                      </div>
                      <LembreteGarantia asset={a} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grid Principal: Fila de Atendimento Recente & Resumo de Estoque */}
      {/* Fase 10 C1: prazos, médias e rankings do atendimento (só a T.I.) */}
      {(currentRole === 'ti_admin' || currentRole === 'ti_suporte') && <IndicadoresAtendimento />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabela de Chamados Recentes */}
        <div className="cartao lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div>
              <h2 className="secao-titulo">Chamados recentes</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('servicedesk')}
              className="btn btn-sm btn-discreto"
            >
              <span>Ver todos</span>
              <ArrowRight />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentTickets.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTicketIdForDetail(t.id)}
                className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50/70 transition-colors cursor-pointer"
              >
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-600">{t.codigo}</span>
                    <span className="font-semibold text-xs text-slate-900 truncate">{t.titulo}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                    <span>{t.solicitanteNome}</span>
                    <span>·</span>
                    <span className="capitalize">{t.tipo}</span>
                    <span>·</span>
                    <span>{formatDate(t.dataCriacao)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`selo ${
                      t.status === 'aberto'
                        ? 'selo-info'
                        : t.status === 'em_andamento' || t.status === 'aguardando_terceiro'
                        ? 'selo-atencao'
                        : t.status === 'cancelado'
                        ? 'selo-neutro'
                        : 'selo-ok'
                    }`}
                  >
                    {rotuloStatus(t.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resumo Rápido de Acesso & Estoque */}
        <div className="space-y-4">
          <div className="cartao p-5 space-y-4">
            <h3 className="secao-titulo">Estoque disponível para empréstimo</h3>
            <p className="text-xs text-slate-500">
              Equipamentos prontos no almoxarifado para novos colaboradores ou reposições rápidas.
            </p>

            <div className="space-y-2.5">
              {assets
                .filter((a) => a.status === 'disponivel')
                .slice(0, 4)
                .map((asset) => (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAssetIdFor360(asset.id)}
                    className="p-3 bg-slate-50/70 hover:bg-slate-100/70 rounded-lg border border-slate-200/80 transition-colors cursor-pointer flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-blue-700">{asset.tag}</span>
                        <span className="font-medium text-slate-900">{asset.nome}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{asset.localizacaoFisica}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                ))}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('assets')}
              className="btn btn-secundario w-full"
            >
              Ver inventário completo
            </button>
          </div>
        </div>
      </div>
      {/* Precisa de atenção: vencimentos (ex-menu Vencimentos) e termos aguardando assinatura */}
      <section id="precisa-atencao" className="space-y-3 scroll-mt-20">
        {termosAguardando.length > 0 && (
          <div className="bg-white border border-amber-200 rounded-xl p-3 text-xs space-y-1">
            <h3 className="secao-titulo">Termos aguardando assinatura ({termosAguardando.length})</h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1">
              {termosAguardando.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => abrirFicha({ tipo: 'colaborador', id: t.colaboradorId })} className="link text-left">
                    {employees.find((e) => e.id === t.colaboradorId)?.nome || 'Pessoa'}
                  </button>
                  <span className="text-slate-500"> · {t.codigo || 'termo'} de {t.tipo === 'entrega' ? 'entrega' : 'devolução'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <VencimentosView noInicio />
      </section>
    </div>
  );
};
