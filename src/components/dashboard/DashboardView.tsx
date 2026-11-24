/**
 * Seção 19 — Início como painel: indicadores no topo, "Precisa de atenção" com
 * semáforo (só o que pede ação; o que está zerado não aparece), atalhos e, para a
 * T.I., os números do atendimento. Embaixo, os vencimentos e prazos em detalhe.
 */
import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate, rotuloStatus } from '../../utils/formatters.ts';
import { DIAS_ALERTA_CONTRATO, garantiaEfetiva, situacaoContrato } from '../../utils/contratos.ts';
import { DIAS_ALERTA_FATURA, resumoFaturasAPagar } from '../../utils/faturas.ts';
import { listarVencimentos } from '../../utils/financeiro.ts';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { VencimentosView } from '../financeiro/FinanceiroViews.tsx';
import { termoAberto, termoContestadoAberto } from '../../utils/termos.ts';
import { IndicadoresAtendimento } from './IndicadoresAtendimento.tsx';
import { CabecalhoTela, Vazio } from '../ui/Tela.tsx';
import { ArrowLeftRight, ArrowRight, CheckCircle2, ChevronRight, FileSignature, Laptop, LifeBuoy, Plus, Wallet } from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (view: string) => void;
  /** Abre a janela de novo chamado */
  onAbrirChamado?: () => void;
}

type Tom = 'problema' | 'atencao' | 'info';
interface Atencao {
  id: string;
  tom: Tom;
  texto: string;
  detalhe?: string;
  acao: string;
  onClick: () => void;
  /** Seção 19: cada item citado abre direto a ficha dele */
  itens?: { id: string; rotulo: string; abrir: () => void }[];
}

const ORDEM_TOM: Record<Tom, number> = { problema: 0, atencao: 1, info: 2 };
const ROTULO_TOM: Record<Tom, string> = { problema: 'Urgente', atencao: 'Atenção', info: 'Para acompanhar' };
const SELO_STATUS: Record<string, string> = {
  aberto: 'selo-info',
  em_andamento: 'selo-atencao',
  aguardando_terceiro: 'selo-atencao',
  cancelado: 'selo-neutro',
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onAbrirChamado }) => {
  const { assets, tickets, employees, licenses, contratos, faturas, setSelectedTicketIdForDetail, currentRole, terms, abrirFicha } = useApp();
  const { linhas, estoque } = useRecursos();
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';

  // Contestado fica à parte: quem deve a próxima ação é a T.I., não o colaborador
  const termosContestados = terms.filter((t) => termoAberto(t) && termoContestadoAberto(t));
  const termosAguardando = terms.filter((t) => termoAberto(t) && !termoContestadoAberto(t));
  const totalAssets = assets.filter((a) => a.status !== 'descartado').length;
  const assetsInUse = assets.filter((a) => a.status === 'em_uso').length;
  const assetsAvailable = assets.filter((a) => a.status === 'disponivel').length;
  // Mesma regra do contador do menu: só suporte (processos têm tela própria), incluindo "aguardando"
  const emAbertoSuporte = (t: (typeof tickets)[number]) =>
    t.tipo === 'suporte' && (t.status === 'aberto' || t.status === 'em_andamento' || t.status === 'aguardando_terceiro');
  const abertos = tickets.filter(emAbertoSuporte);
  const urgentes = abertos.filter((t) => t.prioridade === 'critica');

  // Garantias efetivas (fábrica ou contrato de suporte/garantia estendida)
  const garantias = assets.filter((a) => a.status !== 'descartado').map((a) => ({ asset: a, w: garantiaEfetiva(a, contratos) }));
  const garantiasVencendo = garantias.filter((g) => g.w.status === 'expirando').sort((x, y) => x.w.diasRestantes - y.w.diasRestantes);
  const vencidasEmUso = garantias.filter((g) => g.w.status === 'expirada' && g.asset.status === 'em_uso');

  const contratosVencendo = contratos.filter((c) => situacaoContrato(c).situacao === 'vencendo');
  const faturasAPagar = resumoFaturasAPagar(faturas);
  // Seção 6: renovações/prazos de cancelamento em 30 dias (detalhe em Vencimentos e prazos, abaixo)
  const renovacoes30 = listarVencimentos(
    { ativos: assets, contratos, licencas: licenses, faturas, estoque, linhas, pessoas: employees },
    30
  ).filter((v) => v.tipo === 'contrato' || v.tipo === 'licenca' || v.tipo === 'cancelamento' || v.tipo === 'sem_contrato').length;
  const emManutencao = assets.filter((a) => a.status === 'manutencao').length;
  const assentosUsados = licenses.reduce((s, l) => s + l.assentosAlocados, 0);
  const assentosTotais = licenses.reduce((s, l) => s + l.assentosTotais, 0);

  const verVencimentos = () => document.getElementById('vencimentos-prazos')?.scrollIntoView({ behavior: 'smooth' });
  const nomeDe = (id: string) => employees.find((e) => e.id === id)?.nome || 'Pessoa';

  // Precisa de atenção: só o que pede ação, do mais urgente para o menos
  const atencao: Atencao[] = [];
  if (faturasAPagar.vencidas > 0)
    atencao.push({ id: 'faturas-vencidas', tom: 'problema', texto: plural(faturasAPagar.vencidas, 'fatura vencida', 'faturas vencidas'), acao: 'Ver contas', onClick: () => onNavigate('financeiro') });
  if (urgentes.length > 0)
    atencao.push({
      id: 'urgentes',
      tom: 'problema',
      texto: plural(urgentes.length, 'chamado com prioridade crítica', 'chamados com prioridade crítica'),
      itens: urgentes.map((t) => ({ id: t.id, rotulo: t.codigo, abrir: () => setSelectedTicketIdForDetail(t.id) })),
      acao: 'Ver chamados',
      onClick: () => onNavigate('servicedesk'),
    });
  if (vencidasEmUso.length > 0)
    atencao.push({
      id: 'garantias-vencidas',
      tom: 'problema',
      texto: plural(vencidasEmUso.length, 'equipamento em uso com garantia vencida', 'equipamentos em uso com garantia vencida'),
      itens: vencidasEmUso.map((g) => ({ id: g.asset.id, rotulo: g.asset.tag, abrir: () => abrirFicha({ tipo: 'ativo', id: g.asset.id }) })),
      acao: 'Ver equipamentos',
      onClick: () => onNavigate('assets'),
    });
  if (faturasAPagar.vencemEmBreve > 0)
    atencao.push({
      id: 'faturas-breve',
      tom: 'atencao',
      texto: `${plural(faturasAPagar.vencemEmBreve, 'fatura vence', 'faturas vencem')} em ${DIAS_ALERTA_FATURA} dias`,
      acao: 'Ver contas',
      onClick: () => onNavigate('financeiro'),
    });
  if (garantiasVencendo.length > 0)
    atencao.push({
      id: 'garantias-breve',
      tom: 'atencao',
      texto: `${plural(garantiasVencendo.length, 'garantia vence', 'garantias vencem')} em 30 dias`,
      itens: garantiasVencendo.map((g) => ({ id: g.asset.id, rotulo: `${g.asset.tag} (${formatDate(g.w.fim)})`, abrir: () => abrirFicha({ tipo: 'ativo', id: g.asset.id }) })),
      acao: 'Ver equipamentos',
      onClick: () => onNavigate('assets'),
    });
  if (termosAguardando.length > 0)
    atencao.push({
      id: 'termos',
      tom: 'atencao',
      texto: plural(termosAguardando.length, 'termo aguardando assinatura', 'termos aguardando assinatura'),
      itens: termosAguardando.map((t) => ({ id: t.id, rotulo: nomeDe(t.colaboradorId), abrir: () => abrirFicha({ tipo: 'colaborador', id: t.colaboradorId }) })),
      acao: 'Ver termos',
      onClick: () => onNavigate('terms'),
    });
  if (termosContestados.length > 0)
    atencao.push({
      id: 'termos-contestados',
      tom: 'atencao',
      texto: plural(termosContestados.length, 'termo contestado — aguardando a T.I.', 'termos contestados — aguardando a T.I.'),
      itens: termosContestados.map((t) => ({ id: t.id, rotulo: nomeDe(t.colaboradorId), abrir: () => abrirFicha({ tipo: 'colaborador', id: t.colaboradorId }) })),
      acao: 'Responder',
      onClick: () => onNavigate('terms'),
    });
  if (contratosVencendo.length > 0)
    atencao.push({
      id: 'contratos',
      tom: 'info',
      texto: `${plural(contratosVencendo.length, 'contrato vence', 'contratos vencem')} em ${DIAS_ALERTA_CONTRATO} dias`,
      acao: 'Ver contratos',
      onClick: () => onNavigate('contratos'),
    });
  if (renovacoes30 > 0)
    atencao.push({ id: 'renovacoes', tom: 'info', texto: `${plural(renovacoes30, 'renovação ou prazo de cancelamento', 'renovações e prazos de cancelamento')} em 30 dias`, acao: 'Ver prazos', onClick: verVencimentos });
  if (emManutencao > 0)
    atencao.push({ id: 'manutencao', tom: 'info', texto: plural(emManutencao, 'equipamento em manutenção', 'equipamentos em manutenção'), acao: 'Ver equipamentos', onClick: () => onNavigate('assets') });
  atencao.sort((a, b) => ORDEM_TOM[a.tom] - ORDEM_TOM[b.tom]);
  const urgentesAtencao = atencao.filter((a) => a.tom === 'problema').length;

  const indicadores: { rotulo: string; valor: string; detalhe: string; tom: Tom | 'ok'; icone: React.ReactNode; vista: string }[] = [
    {
      rotulo: 'Chamados em aberto',
      valor: String(abertos.length),
      detalhe: urgentes.length ? plural(urgentes.length, 'crítico', 'críticos') : 'Nenhum crítico',
      tom: urgentes.length ? 'problema' : 'ok',
      icone: <LifeBuoy className="ico" />,
      vista: 'servicedesk',
    },
    {
      rotulo: 'Equipamentos em uso',
      valor: String(assetsInUse),
      detalhe: `de ${totalAssets} · ${assetsAvailable} em estoque`,
      tom: 'ok',
      icone: <Laptop className="ico" />,
      vista: 'assets',
    },
    {
      rotulo: 'Termos a assinar',
      valor: String(termosAguardando.length),
      detalhe: [
        termosAguardando.length ? 'aguardando o colaborador' : '',
        termosContestados.length ? `${termosContestados.length} contestado(s) — aguardando a T.I.` : '',
      ]
        .filter(Boolean)
        .join(' · ') || 'Tudo assinado',
      tom: termosAguardando.length || termosContestados.length ? 'atencao' : 'ok',
      icone: <FileSignature className="ico" />,
      vista: 'terms',
    },
    {
      rotulo: 'Assentos de software',
      valor: `${assentosUsados}/${assentosTotais}`,
      detalhe: `${assentosTotais - assentosUsados} livres`,
      tom: assentosTotais > 0 && assentosUsados >= assentosTotais ? 'atencao' : 'ok',
      icone: <Wallet className="ico" />,
      vista: 'softwares',
    },
  ];

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const recentes = [...tickets].sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime()).slice(0, 5);

  const atalhos: { rotulo: string; icone: React.ReactNode; onClick: () => void }[] = [
    ...(isTI
      ? [
          { rotulo: 'Equipamentos', icone: <Laptop aria-hidden="true" />, onClick: () => onNavigate('assets') },
          { rotulo: 'Admissões e desligamentos', icone: <ArrowLeftRight aria-hidden="true" />, onClick: () => onNavigate('rh_processes') },
          { rotulo: 'Termos', icone: <FileSignature aria-hidden="true" />, onClick: () => onNavigate('terms') },
        ]
      : []),
    { rotulo: 'Chamados', icone: <LifeBuoy aria-hidden="true" />, onClick: () => onNavigate('servicedesk') },
  ];

  return (
    <div className="space-y-6">
      <CabecalhoTela
        titulo="Início"
        subtitulo={hoje.charAt(0).toUpperCase() + hoje.slice(1)}
        acoes={
          onAbrirChamado && (
            <button type="button" onClick={onAbrirChamado} className="btn btn-primario">
              <Plus aria-hidden="true" /> Abrir chamado
            </button>
          )
        }
      />

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {indicadores.map((k) => (
          <button
            key={k.rotulo}
            type="button"
            onClick={() => onNavigate(k.vista)}
            className="cartao space-y-2 p-4 text-left transition-colors hover:border-slate-300"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="texto-aux">{k.rotulo}</span>
              <span className="text-slate-400" aria-hidden="true">
                {k.icone}
              </span>
            </span>
            <span className="numero-kpi block">{k.valor}</span>
            <span className="texto-aux flex items-center gap-2">
              <span className={`semaforo semaforo-${k.tom}`} aria-hidden="true" />
              {k.detalhe}
            </span>
          </button>
        ))}
      </div>

      {/* Atalhos em uma faixa (Seção 19: sem coluna alta ao lado da lista) */}
      <nav aria-label="Atalhos" className="flex flex-wrap gap-2">
        {atalhos.map((a) => (
          <button key={a.rotulo} type="button" onClick={a.onClick} className="btn btn-secundario">
            {a.icone}
            {a.rotulo}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {/* Precisa de atenção: a linha inteira leva à tela; cada item citado abre a ficha dele */}
        <section className="cartao min-w-0" aria-labelledby="inicio-atencao">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h2 id="inicio-atencao" className="secao-titulo">
              Precisa de atenção
            </h2>
            {atencao.length > 0 && (
              <span className={`contador ${urgentesAtencao ? 'contador-alerta' : 'contador-atencao'}`} title={`${atencao.length} assunto(s)`}>
                {atencao.length}
              </span>
            )}
          </div>
          {atencao.length === 0 ? (
            <div className="p-4">
              <Vazio icone={<CheckCircle2 className="ico-lg text-emerald-600" />} titulo="Tudo em dia">
                Nenhuma conta vencida, garantia vencendo ou termo pendente.
              </Vazio>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {atencao.map((a) => (
                <li key={a.id} className="group relative flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                  <span className={`semaforo semaforo-${a.tom} mt-2`} role="img" aria-label={ROTULO_TOM[a.tom]} />
                  <div className="min-w-0 flex-1">
                    {/* Botão que cobre a linha toda (os links dos itens ficam por cima) */}
                    <button type="button" onClick={a.onClick} className="text-left font-semibold text-slate-900 after:absolute after:inset-0 after:content-['']">
                      {a.texto}
                    </button>
                    {a.itens && a.itens.length > 0 ? (
                      <p className="texto-aux relative z-10 flex flex-wrap gap-x-3 gap-y-1">
                        {a.itens.slice(0, 4).map((i) => (
                          <button key={i.id} type="button" onClick={i.abrir} className="link font-normal">
                            {i.rotulo}
                          </button>
                        ))}
                        {a.itens.length > 4 && <span>e mais {a.itens.length - 4}</span>}
                      </p>
                    ) : (
                      a.detalhe && <p className="texto-aux truncate">{a.detalhe}</p>
                    )}
                  </div>
                  <span className="texto-aux inline-flex shrink-0 items-center gap-1 self-center group-hover:text-blue-700">
                    {a.acao}
                    <ChevronRight className="ico-sm" aria-hidden="true" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Chamados recentes */}
        <section className="cartao min-w-0" aria-labelledby="inicio-recentes">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h2 id="inicio-recentes" className="secao-titulo">
              Chamados recentes
            </h2>
            <button type="button" onClick={() => onNavigate('servicedesk')} className="btn btn-sm btn-discreto">
              Ver todos <ArrowRight aria-hidden="true" />
            </button>
          </div>
          {recentes.length === 0 ? (
            <div className="p-4">
              <Vazio
                titulo="Nenhum chamado ainda"
                acao={
                  onAbrirChamado && (
                    <button type="button" onClick={onAbrirChamado} className="btn btn-sm btn-primario">
                      <Plus aria-hidden="true" /> Abrir chamado
                    </button>
                  )
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentes.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setSelectedTicketIdForDetail(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900">{t.titulo}</span>
                      <span className="texto-aux block truncate">
                        <span className="font-mono">{t.codigo}</span> · {t.solicitanteNome} · <span className="num">{formatDate(t.dataCriacao)}</span>
                      </span>
                    </span>
                    <span className={`selo ${SELO_STATUS[t.status] || 'selo-ok'}`}>{rotuloStatus(t.status)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Fase 10 C1: prazos, médias e rankings do atendimento (só a T.I.) */}
      {isTI && <IndicadoresAtendimento />}

      {/* Vencimentos e prazos em detalhe (ex-menu Vencimentos) */}
      <section id="vencimentos-prazos" className="scroll-mt-20">
        <VencimentosView noInicio />
      </section>
    </div>
  );
};
