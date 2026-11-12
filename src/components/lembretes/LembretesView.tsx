import React, { useState } from 'react';
import { Bell, CheckCircle2, Plus, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Lembrete } from '../../types/index.ts';
import { formatDate, formatDateTime } from '../../utils/formatters.ts';

const hojeISO = () => new Date().toISOString().split('T')[0];

/** Situação do lembrete em aberto: vencido, vence hoje ou futuro */
export function situacaoLembrete(l: Pick<Lembrete, 'status' | 'venceEm'>, hoje = hojeISO()) {
  if (l.status !== 'aberto') return l.status;
  if (l.venceEm < hoje) return 'vencido';
  if (l.venceEm === hoje) return 'hoje';
  return 'futuro';
}

/**
 * Fase 6: lembretes da T.I. (só no painel, por enquanto). Nascem dos passos do
 * checklist (ex.: "excluir a conta em 30 dias", "coletar a assinatura do termo")
 * ou são criados à mão. Concluir pede um registro do que foi feito.
 */
export const LembretesView: React.FC = () => {
  const { lembretes, tickets, employees, criarLembrete, encerrarLembrete, setSelectedTicketIdForDetail } = useApp();
  const [filtro, setFiltro] = useState<'abertos' | 'encerrados'>('abertos');
  const [novo, setNovo] = useState<{ titulo: string; descricao: string; venceEm: string } | null>(null);
  const [encerrando, setEncerrando] = useState<{ id: string; status: 'feito' | 'cancelado'; obs: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const hoje = hojeISO();
  const lista = lembretes
    .filter((l) => (filtro === 'abertos' ? l.status === 'aberto' : l.status !== 'aberto'))
    .sort((a, b) => (filtro === 'abertos' ? a.venceEm.localeCompare(b.venceEm) : b.venceEm.localeCompare(a.venceEm)));
  const vencidos = lembretes.filter((l) => situacaoLembrete(l, hoje) === 'vencido').length;
  const nomeDe = (id?: string) => employees.find((e) => e.id === id)?.nome;
  const chamado = (id?: string) => tickets.find((t) => t.id === id);

  const salvarNovo = async () => {
    if (!novo || !novo.titulo.trim() || !novo.venceEm) return setErro('Informe o título e a data.');
    const falha = await criarLembrete({ titulo: novo.titulo.trim(), descricao: novo.descricao.trim() || undefined, venceEm: novo.venceEm });
    if (falha) return setErro(falha);
    setErro(null);
    setNovo(null);
  };

  const confirmarEncerramento = async () => {
    if (!encerrando) return;
    if (encerrando.status === 'cancelado' && !encerrando.obs.trim()) return setErro('Informe o motivo do cancelamento.');
    const falha = await encerrarLembrete(encerrando.id, encerrando.status, encerrando.obs.trim() || undefined);
    if (falha) return setErro(falha);
    setErro(null);
    setEncerrando(null);
  };

  const campo = 'w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-600" /> Lembretes da T.I.
          </h2>
          <p className="text-xs text-slate-500">
            Pendências com data: exclusões programadas, transferência de dados, assinaturas a coletar.
            {vencidos > 0 && <span className="ml-1 font-semibold text-red-600">{vencidos} vencido(s).</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNovo({ titulo: '', descricao: '', venceEm: hoje })}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> Novo lembrete
        </button>
      </div>

      {novo && (
        <div className="bg-white border border-indigo-200 rounded-lg p-4 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              className={`${campo} md:col-span-2`}
              placeholder="O que precisa ser feito"
              value={novo.titulo}
              onChange={(e) => setNovo({ ...novo, titulo: e.target.value })}
            />
            <input type="date" className={campo} value={novo.venceEm} onChange={(e) => setNovo({ ...novo, venceEm: e.target.value })} />
          </div>
          <textarea
            className={campo}
            rows={2}
            placeholder="Detalhes (opcional)"
            value={novo.descricao}
            onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNovo(null)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white">
              Cancelar
            </button>
            <button type="button" onClick={salvarNovo} className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-md">
              Salvar lembrete
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-xs font-medium text-red-700">{erro}</p>}

      <div className="flex gap-1 text-xs">
        {(['abertos', 'encerrados'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-md font-medium ${filtro === f ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {f === 'abertos' ? 'Em aberto' : 'Encerrados'}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg p-6 text-center">
          {filtro === 'abertos' ? 'Nenhum lembrete em aberto.' : 'Nenhum lembrete encerrado.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {lista.map((l) => {
            const sit = situacaoLembrete(l, hoje);
            const tkt = chamado(l.chamadoId);
            return (
              <li
                key={l.id}
                className={`bg-white border rounded-lg p-3 text-xs ${
                  sit === 'vencido' ? 'border-red-300' : sit === 'hoje' ? 'border-amber-300' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{l.titulo}</p>
                    {l.descricao && <p className="text-slate-600 mt-0.5">{l.descricao}</p>}
                    <p className="text-xs text-slate-500 mt-1">
                      <span
                        className={
                          sit === 'vencido' ? 'font-semibold text-red-600' : sit === 'hoje' ? 'font-semibold text-amber-700' : ''
                        }
                      >
                        {sit === 'vencido' ? 'Venceu em ' : sit === 'hoje' ? 'Vence hoje · ' : 'Vence em '}
                        {formatDate(l.venceEm)}
                      </span>
                      {l.colaboradorId && <> · {nomeDe(l.colaboradorId) || 'colaborador'}</>}
                      {tkt && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            onClick={() => setSelectedTicketIdForDetail(tkt.id)}
                            className="text-indigo-600 hover:underline"
                          >
                            {tkt.codigo}
                          </button>
                        </>
                      )}
                    </p>
                    {l.status !== 'aberto' && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {l.status === 'feito' ? 'Concluído' : 'Cancelado'} por {nomeDe(l.concluidoPor) || 'T.I.'}
                        {l.concluidoEm ? ` em ${formatDateTime(l.concluidoEm)}` : ''}
                        {l.observacaoConclusao ? ` — “${l.observacaoConclusao}”` : ''}
                      </p>
                    )}
                  </div>
                  {l.status === 'aberto' && encerrando?.id !== l.id && (
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEncerrando({ id: l.id, status: 'feito', obs: '' })}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
                      </button>
                      <button
                        type="button"
                        onClick={() => setEncerrando({ id: l.id, status: 'cancelado', obs: '' })}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 bg-white border border-slate-200 rounded"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Cancelar
                      </button>
                    </div>
                  )}
                </div>
                {encerrando?.id === l.id && (
                  <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
                    <textarea
                      className={campo}
                      rows={2}
                      placeholder={encerrando.status === 'feito' ? 'O que foi feito (opcional)' : 'Motivo do cancelamento'}
                      value={encerrando.obs}
                      onChange={(e) => setEncerrando({ ...encerrando, obs: e.target.value })}
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEncerrando(null)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white">
                        Voltar
                      </button>
                      <button
                        type="button"
                        onClick={confirmarEncerramento}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md"
                      >
                        {encerrando.status === 'feito' ? 'Confirmar conclusão' : 'Confirmar cancelamento'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
