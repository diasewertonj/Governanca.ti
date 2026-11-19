import React from 'react';
import { Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { indicadoresAtendimento, JANELA_DIAS } from '../../utils/indicadores.ts';
import { duracaoUtil } from '../../utils/sla.ts';
import { ROTULO_CAUSA } from '../../utils/atendimento.ts';

/** Fase 10 C1: como está o atendimento (chamados de suporte) */
export const IndicadoresAtendimento: React.FC = () => {
  const { tickets, assets, eventosSla, prazosSla, setSelectedAssetIdFor360 } = useApp();
  const i = indicadoresAtendimento(tickets, eventosSla, prazosSla);
  // Seção 19: sem chamados encerrados no período não há média para mostrar
  const traco = 'Sem dados';

  const cartoes: { rotulo: string; valor: string; destaque?: string }[] = [
    { rotulo: 'Em atendimento', valor: String(i.abertos) },
    { rotulo: 'Atrasados', valor: String(i.atrasados), destaque: i.atrasados ? 'text-red-700' : undefined },
    { rotulo: 'Encerrados no mês', valor: String(i.encerradosNoMes) },
    { rotulo: 'No prazo', valor: i.pctNoPrazo === undefined ? traco : `${i.pctNoPrazo}%` },
    { rotulo: '1ª resposta (média)', valor: i.mediaPrimeiraRespostaMin === undefined ? traco : duracaoUtil(i.mediaPrimeiraRespostaMin) },
    { rotulo: 'Solução (média)', valor: i.mediaSolucaoMin === undefined ? traco : duracaoUtil(i.mediaSolucaoMin) },
    {
      rotulo: `Avaliação (${i.avaliacoes})`,
      valor: i.avaliacaoMedia === undefined ? traco : `${String(Math.round(i.avaliacaoMedia * 10) / 10).replace('.', ',')} de 5`,
    },
    { rotulo: 'Reabertos', valor: String(i.reabertos) },
  ];

  return (
    <section aria-labelledby="indicadores-atendimento" className="cartao p-4 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="indicadores-atendimento" className="secao-titulo flex items-center gap-2">
          <Clock className="ico" aria-hidden="true" />
          Atendimento
        </h3>
        <span className="texto-aux">Chamados de suporte · médias e rankings dos últimos {JANELA_DIAS} dias · horas úteis</span>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <dt className="texto-aux">{c.rotulo}</dt>
            <dd className={`mt-0.5 text-lg font-semibold ${c.destaque || 'text-slate-900'}`}>{c.valor}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="font-semibold text-slate-700 mb-2">Causas mais comuns</h4>
          {i.topCausas.length === 0 ? (
            <p className="text-slate-500">Sem chamados encerrados no período.</p>
          ) : (
            <ol className="space-y-1">
              {i.topCausas.map((c) => (
                <li key={c.causa} className="flex justify-between gap-2">
                  <span className="text-slate-800">{ROTULO_CAUSA[c.causa]}</span>
                  <span className="font-semibold text-slate-900">{c.total}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h4 className="font-semibold text-slate-700 mb-2">Equipamentos com mais chamados</h4>
          {i.topEquipamentos.length === 0 ? (
            <p className="text-slate-500">Nenhum chamado ligado a equipamento no período.</p>
          ) : (
            <ol className="space-y-1">
              {i.topEquipamentos.map((e) => {
                const a = assets.find((x) => x.id === e.ativoId);
                return (
                  <li key={e.ativoId} className="flex justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAssetIdFor360(e.ativoId)}
                      className="link min-w-0 truncate text-left"
                    >
                      {a ? `${a.tag} · ${a.nome}` : 'Equipamento removido'}
                    </button>
                    <span className="font-semibold text-slate-900">{e.total}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
};
