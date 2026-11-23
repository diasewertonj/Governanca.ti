import React from 'react';
import { ArrowLeftRight, FileText, UserMinus, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate } from '../../utils/formatters.ts';
import { termoAberto } from '../../utils/termos.ts';
import { progresso } from '../../utils/processos.ts';
import { CabecalhoTela, Vazio } from '../ui/Tela.tsx';

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
  const termosPendentes = terms.filter((t) => termoAberto(t));

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
    <div className="space-y-4">
      <CabecalhoTela
        titulo={`Olá, ${currentUser?.nome.split(' ')[0] || 'RH'}`}
        subtitulo="Acompanhe as admissões e os desligamentos que a T.I. está executando."
        acoes={
          <button type="button" onClick={() => onNavigate('rh_processes')} className="btn btn-primario">
            <ArrowLeftRight aria-hidden="true" /> Nova admissão ou desligamento
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cartoes.map(({ rotulo, valor, Icone }) => (
          <div key={rotulo} className="cartao p-4 flex items-center gap-3">
            <Icone className="ico-lg text-slate-500" aria-hidden="true" />
            <div>
              <p className="texto-aux">{rotulo}</p>
              <p className="text-2xl font-semibold text-slate-900">{valor}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h3 className="secao-titulo">Processos em andamento</h3>
        {emAndamento.length === 0 ? (
          <Vazio>Nenhuma admissão ou desligamento em andamento.</Vazio>
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
                    className="cartao w-full text-left p-4 hover:border-blue-300 transition-colors flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                  >
                    <span className={`selo self-start ${t.tipo === 'onboarding' ? 'selo-info' : 'selo-atencao'}`}>
                      {t.tipo === 'onboarding' ? 'Admissão' : 'Desligamento'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-slate-900 truncate">{pessoa(t)}</span>
                      <span className="block texto-aux">
                        {t.codigo}
                        {dataPrevista(t) && ` · ${dataPrevista(t)}`}
                      </span>
                    </span>
                    <span className="sm:w-48">
                      {itens.length === 0 ? (
                        <span className="texto-aux">A T.I. ainda não montou o checklist</span>
                      ) : (
                        <>
                          <span className="block text-slate-700 mb-1">
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
        <h3 className="secao-titulo">Termos sem assinatura</h3>
        {termosPendentes.length === 0 ? (
          <Vazio>Todos os termos estão assinados.</Vazio>
        ) : (
          <ul className="space-y-2">
            {termosPendentes.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedTermForPrint(t)}
                  className="cartao w-full text-left p-4 hover:border-blue-300 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-slate-900 truncate">{t.colaboradorNome}</span>
                    <span className="block texto-aux">
                      {t.docCodigo || t.codigo} · {t.tipo === 'entrega' ? 'Entrega' : 'Devolução'} · {formatDate(t.dataEmissao)}
                    </span>
                  </span>
                  <span className="selo selo-atencao">
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
