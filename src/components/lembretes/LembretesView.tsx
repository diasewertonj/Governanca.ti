import React, { useState } from 'react';
import { CheckCircle2, Plus, XCircle, Bell } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Lembrete } from '../../types/index.ts';
import { formatDate, formatDateTime } from '../../utils/formatters.ts';
import { Abas } from '../ui/Abas.tsx';
import { Janela } from '../ui/Janela.tsx';
import { CabecalhoTela, Vazio } from '../ui/Tela.tsx';

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
  const qtdAbertos = lembretes.filter((l) => l.status === 'aberto').length;
  const nomeDe = (id?: string) => employees.find((e) => e.id === id)?.nome;
  const chamado = (id?: string) => tickets.find((t) => t.id === id);
  const lembreteEncerrando = encerrando ? lembretes.find((l) => l.id === encerrando.id) : undefined;

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

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo="Lembretes"
        subtitulo={
          <>
            Pendências com data: exclusões programadas, transferência de dados, assinaturas a coletar.
            {vencidos > 0 && <span className="ml-1 font-semibold text-red-700">{vencidos} vencido(s).</span>}
          </>
        }
        acoes={
          <button type="button" onClick={() => setNovo({ titulo: '', descricao: '', venceEm: hoje })} className="btn btn-primario">
            <Plus /> Novo lembrete
          </button>
        }
        abas={
          <Abas
            rotulo="Lembretes"
            ativa={filtro}
            onMudar={setFiltro}
            itens={[
              { id: 'abertos', rotulo: 'Em aberto', contador: qtdAbertos },
              { id: 'encerrados', rotulo: 'Encerrados' },
            ]}
          />
        }
      />

      {erro && !novo && !encerrando && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <div className="cartao overflow-hidden">
        <table className="tabela tabela-cartoes">
          <thead>
            <tr>
              <th>Lembrete</th>
              <th>Vencimento</th>
              <th>Situação</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <Vazio>{filtro === 'abertos' ? 'Nenhum lembrete em aberto.' : 'Nenhum lembrete encerrado.'}</Vazio>
                </td>
              </tr>
            ) : (
              lista.map((l) => {
                const sit = situacaoLembrete(l, hoje);
                const tkt = chamado(l.chamadoId);
                return (
                  <tr key={l.id}>
                    <td data-label="Lembrete">
                      <span className="font-semibold text-slate-900 block">{l.titulo}</span>
                      {l.descricao && <span className="text-slate-600 block">{l.descricao}</span>}
                      <span className="text-slate-500 block">
                        {l.colaboradorId && <>{nomeDe(l.colaboradorId) || 'colaborador'}</>}
                        {tkt && (
                          <>
                            {l.colaboradorId && ' · '}
                            <button type="button" onClick={() => setSelectedTicketIdForDetail(tkt.id)} className="link">
                              {tkt.codigo}
                            </button>
                          </>
                        )}
                      </span>
                      {l.status !== 'aberto' && (
                        <span className="text-slate-500 block">
                          {l.status === 'feito' ? 'Concluído' : 'Cancelado'} por {nomeDe(l.concluidoPor) || 'T.I.'}
                          {l.concluidoEm ? ` em ${formatDateTime(l.concluidoEm)}` : ''}
                          {l.observacaoConclusao ? ` — “${l.observacaoConclusao}”` : ''}
                        </span>
                      )}
                    </td>
                    <td data-label="Vencimento">{formatDate(l.venceEm)}</td>
                    <td data-label="Situação">
                      {sit === 'vencido' && <span className="selo selo-problema">Vencido</span>}
                      {sit === 'hoje' && <span className="selo selo-atencao">Vence hoje</span>}
                      {sit === 'futuro' && <span className="selo selo-info">Em aberto</span>}
                      {sit === 'feito' && <span className="selo selo-ok">Concluído</span>}
                      {sit === 'cancelado' && <span className="selo selo-neutro">Cancelado</span>}
                    </td>
                    <td data-label="Ações" className="text-right">
                      {l.status === 'aberto' && (
                        <span className="acoes-linha">
                          <button type="button" onClick={() => setEncerrando({ id: l.id, status: 'feito', obs: '' })} className="btn btn-sm btn-secundario">
                            <CheckCircle2 /> Concluir
                          </button>
                          <button
                            type="button"
                            onClick={() => setEncerrando({ id: l.id, status: 'cancelado', obs: '' })}
                            title="Cancelar lembrete"
                            aria-label={`Cancelar o lembrete ${l.titulo}`}
                            className="btn-icone btn-icone-perigo"
                          >
                            <XCircle />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {novo && (
        <Janela
          tamanho="p"
          titulo="Novo lembrete"
          subtitulo="Aviso com data para a equipe de T.I."
          icone={<Bell className="h-4 w-4" />}
          onFechar={() => {
            setNovo(null);
            setErro(null);
          }}
          idTitulo="janela-novo-lembrete"
          rodape={
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setNovo(null);
                  setErro(null);
                }}
                className="btn btn-secundario"
              >
                Cancelar
              </button>
              <button type="submit" form="form-lembrete" className="btn btn-primario">
                Salvar
              </button>
            </div>
          }
        >
          <form
            id="form-lembrete"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void salvarNovo();
            }}
          >
            <div>
              <label htmlFor="lem-titulo" className="rotulo">
                O que precisa ser feito *
              </label>
              <input id="lem-titulo" className="campo" value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
            </div>
            <div>
              <label htmlFor="lem-data" className="rotulo">
                Vence em *
              </label>
              <input id="lem-data" type="date" className="campo" value={novo.venceEm} onChange={(e) => setNovo({ ...novo, venceEm: e.target.value })} />
            </div>
            <div>
              <label htmlFor="lem-desc" className="rotulo">
                Detalhes
              </label>
              <textarea id="lem-desc" className="campo" rows={3} placeholder="Opcional" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
            </div>
            {erro && (
              <p className="erro" role="alert">
                {erro}
              </p>
            )}
          </form>
        </Janela>
      )}

      {encerrando && (
        <Janela
          tamanho="p"
          titulo={encerrando.status === 'feito' ? 'Concluir lembrete' : 'Cancelar lembrete'}
          icone={<Bell className="h-4 w-4" />}
          subtitulo={lembreteEncerrando?.titulo}
          onFechar={() => {
            setEncerrando(null);
            setErro(null);
          }}
          idTitulo="janela-encerrar-lembrete"
          rodape={
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEncerrando(null);
                  setErro(null);
                }}
                className="btn btn-secundario"
              >
                Voltar
              </button>
              <button type="button" onClick={confirmarEncerramento} className={encerrando.status === 'feito' ? 'btn btn-primario' : 'btn btn-perigo'}>
                {encerrando.status === 'feito' ? 'Confirmar conclusão' : 'Confirmar cancelamento'}
              </button>
            </div>
          }
        >
          <div>
            <label htmlFor="lem-obs" className="rotulo">
              {encerrando.status === 'feito' ? 'O que foi feito' : 'Motivo do cancelamento *'}
            </label>
            <textarea
              id="lem-obs"
              className="campo"
              rows={3}
              placeholder={encerrando.status === 'feito' ? 'Opcional' : ''}
              value={encerrando.obs}
              onChange={(e) => setEncerrando({ ...encerrando, obs: e.target.value })}
            />
            {erro && (
              <p className="erro" role="alert">
                {erro}
              </p>
            )}
          </div>
        </Janela>
      )}
    </div>
  );
};
