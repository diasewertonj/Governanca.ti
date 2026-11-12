import React from 'react';
import { ArrowLeftRight, FileText, UserMinus, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate } from '../../utils/formatters.ts';
import { progresso } from '../../utils/processos.ts';

/**
 * Fase 7: Início do RH. Mostra o que está em andamento (admissões e
 * desligamentos, com o progresso da T.I.) e os termos ainda sem assinatura.
 */
export const RhInicioView: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { currentUser, tickets, processoItens, terms, employees, setSelectedTicketIdForDetail, setSelectedTermForPrint } =
    useApp();

  const emAndamento = tickets
    .filter((t) => (t.tipo === 'onboarding' || t.tipo === 'offboarding') && t.status !== 'resolvido' && t.status !== 'cancelado')
    .sort((a, b) => a.dataCriacao.localeCompare(b.dataCriacao));
  const admissoes = emAndamento.filter((t) => t.tipo === 'onboarding');
  const desligamentos = emAndamento.filter((t) => t.tipo === 'offboarding');
  const termosPendentes = terms.filter((t) => t.formaAssinatura === 'pendente');

  const pessoa = (t: (typeof emAndamento)[number]) =>
    t.onboarding?.nomeColaborador ||
    employees.find((e) => e.id === (t.colaboradorId || t.offboarding?.colaboradorId))?.nome ||
    t.titulo;
  const dataPrevista = (t: (typeof emAndamento)[number]) =>
    t.onboarding?.dataAdmissao
      ? `Início em ${formatDate(t.onboarding.dataAdmissao)}`
      : t.offboarding?.dataDesligamento
        ? `Último dia ${formatDate(t.offboarding.dataDesligamento)}`
        : '';

  const cartoes = [
    { rotulo: 'Admissões em andamento', valor: admissoes.length, Icone: UserPlus },
    { rotulo: 'Desligamentos em andamento', valor: desligamentos.length, Icone: UserMinus },
    { rotulo: 'Termos sem assinatura', valor: termosPendentes.length, Icone: FileText },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Olá, {currentUser?.nome.split(' ')[0] || 'RH'}</h2>
          <p className="text-sm text-slate-600">Acompanhe as admissões e os desligamentos que a T.I. está executando.</p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('rh_processes')}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <ArrowLeftRight className="w-4 h-4" aria-hidden="true" /> Nova admissão ou desligamento
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cartoes.map(({ rotulo, valor, Icone }) => (
          <div key={rotulo} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <Icone className="w-5 h-5 text-slate-500" aria-hidden="true" />
            <div>
              <p className="text-sm text-slate-600">{rotulo}</p>
              <p className="text-2xl font-semibold text-slate-900">{valor}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Processos em andamento</h3>
        {emAndamento.length === 0 ? (
          <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-xl p-5">
            Nenhuma admissão ou desligamento em andamento.
          </p>
        ) : (
          <ul className="space-y-2">
            {emAndamento.map((t) => {
              const itens = processoItens.filter((i) => i.chamadoId === t.id);
              const p = progresso(itens);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedTicketIdForDetail(t.id)}
                    className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-colors flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                  >
                    <span
                      className={`self-start text-xs font-semibold px-2 py-0.5 rounded ${
                        t.tipo === 'onboarding' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-900'
                      }`}
                    >
                      {t.tipo === 'onboarding' ? 'Admissão' : 'Desligamento'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-900 truncate">{pessoa(t)}</span>
                      <span className="block text-xs text-slate-600">
                        {t.codigo}
                        {dataPrevista(t) && ` · ${dataPrevista(t)}`}
                      </span>
                    </span>
                    <span className="sm:w-48">
                      {itens.length === 0 ? (
                        <span className="text-xs text-slate-600">A T.I. ainda não montou o checklist</span>
                      ) : (
                        <>
                          <span className="block text-xs text-slate-700 mb-1">
                            T.I.: {p.feitos + p.naoSeAplica} de {p.total} passos
                          </span>
                          <span className="block h-1.5 bg-slate-100 rounded-full overflow-hidden" aria-hidden="true">
                            <span className="block h-full bg-blue-600" style={{ width: `${p.percentual}%` }} />
                          </span>
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Termos sem assinatura</h3>
        {termosPendentes.length === 0 ? (
          <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-xl p-5">Todos os termos estão assinados.</p>
        ) : (
          <ul className="space-y-2">
            {termosPendentes.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedTermForPrint(t)}
                  className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 truncate">{t.colaboradorNome}</span>
                    <span className="block text-xs text-slate-600">
                      {t.docCodigo || t.codigo} · {t.tipo === 'entrega' ? 'Entrega' : 'Devolução'} · {formatDate(t.dataEmissao)}
                    </span>
                  </span>
                  <span className="text-xs text-amber-900">
                    Falta: {[!t.aceiteColaboradorEm && 'colaborador', !t.aceiteTiEm && 'T.I.'].filter(Boolean).join(' e ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
