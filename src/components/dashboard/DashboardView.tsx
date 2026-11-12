import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate, getWarrantyStatus, rotuloStatus } from '../../utils/formatters.ts';
import {
  Laptop,
  LifeBuoy,
  Users,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  AlertTriangle,
  FolderSync,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (view: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { assets, tickets, employees, licenses, setSelectedAssetIdFor360, setSelectedTicketIdForDetail } = useApp();

  const totalAssets = assets.length;
  const assetsInUse = assets.filter((a) => a.status === 'em_uso').length;
  const assetsAvailable = assets.filter((a) => a.status === 'disponivel').length;
  const openTickets = tickets.filter((t) => t.status === 'aberto' || t.status === 'em_andamento').length;
  const urgentTickets = tickets.filter(
    (t) => (t.status === 'aberto' || t.status === 'em_andamento') && t.prioridade === 'critica'
  ).length;

  // Garantias expirando nos próximos 30 dias
  const expiringWarranties = assets.filter((a) => {
    if (a.status === 'descartado') return false;
    const w = getWarrantyStatus(a.fiscal?.dataGarantia);
    return w.status === 'expirando';
  });

  // Chamados recentes
  const recentTickets = [...tickets]
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* 4 Cards de Métricas Principais (Clean, sem pills decorativas) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
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

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Chamados em aberto
            </span>
            <LifeBuoy className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-900">
              {openTickets}
            </span>
            <span className="text-xs text-slate-500">em aberto</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            {urgentTickets > 0 ? (
              <span className="text-rose-600 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {urgentTickets} com prioridade urgente
              </span>
            ) : (
              <span className="text-emerald-700 font-semibold">Sem pendências críticas</span>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Colaboradores Ativos
            </span>
            <Users className="w-4 h-4 text-purple-600" />
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

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Licenças de Software
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-900">
              {licenses.reduce((acc, l) => acc + l.assentosAlocados, 0)}/
              {licenses.reduce((acc, l) => acc + l.assentosTotais, 0)}
            </span>
            <span className="text-xs text-slate-500">assentos alocados</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {licenses.length} contratos corporativos ativos
          </div>
        </div>
      </div>

      {/* Alerta de Garantias Expirando (se houver) */}
      {expiringWarranties.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Atenção Fiscal: {expiringWarranties.length} Equipamento(s) com garantia expirando em 30 dias
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">
                Revise os contratos de suporte e acione os fornecedores caso haja pendências técnicas.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {expiringWarranties.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedAssetIdFor360(a.id)}
                    className="inline-flex items-center gap-1.5 text-xs bg-white text-amber-900 px-2.5 py-1 rounded-md border border-amber-300 font-medium hover:bg-amber-100/50 transition-colors"
                  >
                    <span>{a.tag}</span>
                    <span>·</span>
                    <span>{a.nome}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid Principal: Fila de Atendimento Recente & Resumo de Estoque */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabela de Chamados Recentes */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Chamados recentes</h2>
              <p className="text-xs text-slate-500">Chamados técnicos e requisições de admissão/desligamento</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('servicedesk')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <span>Ver todos</span>
              <ArrowRight className="w-3.5 h-3.5" />
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
                    className={`text-xs px-2 py-0.5 rounded-md font-medium capitalize ${
                      t.status === 'aberto'
                        ? 'text-blue-700 bg-blue-50'
                        : t.status === 'em_andamento'
                        ? 'text-amber-700 bg-amber-50'
                        : 'text-emerald-700 bg-emerald-50'
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
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Estoque Disponível para Empréstimo</h3>
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
              className="w-full text-center py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/60 rounded-lg transition-colors block"
            >
              Ver Inventário Completo
            </button>
          </div>

          {/* Atalho para Processos de RH */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <FolderSync className="w-4 h-4 text-blue-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Integração T.I. & RH
              </h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Conduza desligamentos com inventário instantâneo e checklist técnico interativo ou solicite kits admissionais.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('rh_processes')}
              className="w-full py-2 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors"
            >
              Abrir admissões e desligamentos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
