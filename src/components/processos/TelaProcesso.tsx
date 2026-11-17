/**
 * Seção 9.2 · Tela própria do processo (admissão ou desligamento), em largura total,
 * no lugar da janela do chamado: checklist à esquerda (protagonista); pedido do RH e
 * anotações fixas à direita; conversa e histórico em abas. Abre por Admissões e
 * desligamentos, pelo Precisa de atenção, pela ficha da pessoa ou por um lembrete.
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, CalendarClock, CheckCircle2, FileCheck, Lock, Printer, Send, ShieldCheck, StickyNote, UserMinus, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { AguardandoMotivo, Ticket, TicketStatus } from '../../types/index.ts';
import { formatDate, formatDateTime } from '../../utils/formatters.ts';
import { chamadoEncerrado, rotuloSituacao } from '../../utils/atendimento.ts';
import { situacaoSla } from '../../utils/sla.ts';
import { progresso } from '../../utils/processos.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { ChecklistProcesso, TrilhaAuditoria } from './ChecklistProcesso.tsx';
import { PedidoDesligamento } from '../servicedesk/PedidoDesligamento.tsx';
import { ConversaChamado } from '../servicedesk/ConversaChamado.tsx';
import { BlocoCancelamento, FormCancelamento, HistoricoChamado } from '../servicedesk/AtendimentoChamado.tsx';
import { SELO_STATUS_CHAMADO } from '../servicedesk/SeloSla.tsx';
import { imprimirRelatorio } from '../servicedesk/relatorioChamado.ts';
import { Abas } from '../ui/Abas.tsx';
import { Vazio } from '../ui/Tela.tsx';
import { confirmar } from '../ui/dialogo.tsx';

const PAPEL: Record<string, string> = {
  ti_admin: 'Admin de T.I.',
  ti_suporte: 'Suporte de T.I.',
  rh: 'Recursos Humanos (RH)',
  colaborador: 'Colaborador',
};

/** Linha "rótulo à esquerda, valor à direita" */
const Linha: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
    <span className="text-slate-500">{rotulo}</span>
    <span className="break-words text-slate-900">{children}</span>
  </div>
);

export const TelaProcesso: React.FC<{ chamadoId: string; onVoltar: () => void }> = ({ chamadoId, onVoltar }) => {
  const {
    tickets,
    employees,
    departments,
    currentRole,
    currentUser,
    processoItens,
    salvarAlteracoesChamado,
    salvarAnotacoesProcesso,
    addTicketMessage,
    concluirOffboarding,
    eventosSla,
    prazosSla,
    podeDescartarPendencias,
    setSelectedEmployeeIdFor360,
  } = useApp();
  const ticket = tickets.find((t) => t.id === chamadoId);
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const [aba, setAba] = useState<'conversa' | 'historico'>('conversa');
  const [cancelando, setCancelando] = useState(false);

  // Abre no topo da página (a lista podia estar rolada) e com o título do processo na aba
  const codigo = ticket?.codigo;
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const antes = document.title;
    if (codigo) document.title = `${codigo} · Nexus`;
    return () => {
      document.title = antes;
    };
  }, [chamadoId, codigo]);

  const voltar = () => void podeDescartarPendencias().then((ok) => ok && onVoltar());

  if (!ticket) {
    return (
      <Vazio
        acao={
          <button type="button" onClick={onVoltar} className="btn btn-secundario">
            <ArrowLeft /> Voltar
          </button>
        }
      >
        Processo não encontrado. Ele pode ter sido removido ou estar fora dos chamados recentes.
      </Vazio>
    );
  }

  const ehOnb = ticket.tipo === 'onboarding';
  const encerrado = chamadoEncerrado(ticket);
  const colabId = ticket.colaboradorId || ticket.offboarding?.colaboradorId;
  const colab = employees.find((e) => e.id === colabId);
  const nomePessoa = colab?.nome || ticket.onboarding?.nomeColaborador || 'colaborador';
  const itens = processoItens.filter((i) => i.chamadoId === ticket.id);
  const prog = progresso(itens);
  const proximo = itens
    .filter((i) => i.status === 'pendente' && i.lembreteEm)
    .sort((a, b) => (a.lembreteEm || '').localeCompare(b.lembreteEm || ''))[0];
  const usaChecklistLegado = !ehOnb && itens.length === 0 && (ticket.offboarding?.checklist.length || 0) > 0;
  const tecnicos = employees.filter((e) => (e.role === 'ti_admin' || e.role === 'ti_suporte') && e.status !== 'desligado');
  const data = ehOnb ? ticket.onboarding?.dataAdmissao : ticket.offboarding?.dataDesligamento;
  const setor = departments.find((d) => d.id === (colab?.setorId || ticket.onboarding?.setorId))?.nome;

  const mudarSituacao = (status: TicketStatus, aguardandoMotivo?: AguardandoMotivo | '') =>
    salvarAlteracoesChamado(ticket.id, { status, ...(status === 'aguardando_terceiro' ? { aguardandoMotivo: aguardandoMotivo ?? '' } : {}) });

  return (
    <div className="space-y-4">
      {/* Cabeçalho do processo */}
      <section className="cartao space-y-3 p-4" aria-labelledby="processo-titulo">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={voltar} className="btn btn-sm btn-secundario" title="Voltar para Admissões e desligamentos">
            <ArrowLeft />
            <span className="hidden sm:inline">Admissões e desligamentos</span>
            <span className="sm:hidden">Voltar</span>
          </button>
          <span className="font-mono text-xs font-semibold text-slate-700">{ticket.codigo}</span>
          <span className="selo selo-neutro">
            {ehOnb ? <UserPlus aria-hidden="true" /> : <UserMinus aria-hidden="true" />}
            {ehOnb ? 'Admissão' : 'Desligamento'}
          </span>
          <span className="flex-1" />
          <span className={SELO_STATUS_CHAMADO[ticket.status]}>{ticket.status === 'resolvido' ? 'Concluído' : rotuloSituacao(ticket)}</span>
          <button
            type="button"
            onClick={() => imprimirRelatorio(ticket, employees, isTI, situacaoSla(ticket, eventosSla[ticket.id] || [], prazosSla))}
            title="Relatório do processo (imprimir ou salvar em PDF)"
            aria-label="Relatório do processo"
            className="btn btn-sm btn-secundario"
          >
            <Printer aria-hidden="true" />
            <span className="hidden sm:inline">Relatório</span>
          </button>
        </div>
        <div>
          <h2 id="processo-titulo" className="tela-titulo break-words">
            {ehOnb ? 'Admissão de ' : 'Desligamento de '}
            {colab && (isTI || currentRole === 'rh') ? (
              <button type="button" onClick={() => setSelectedEmployeeIdFor360(colab.id)} className="link">
                {nomePessoa}
              </button>
            ) : (
              nomePessoa
            )}
          </h2>
          <p className="tela-subtitulo">
            {[colab?.cargo || ticket.onboarding?.cargo, setor, data ? `${ehOnb ? 'início' : 'último dia'} ${formatDate(data)}` : '']
              .filter(Boolean)
              .join(' · ')}
            {' · '}pedido por {ticket.solicitanteNome} em {formatDateTime(ticket.dataCriacao)}
          </p>
        </div>
        {itens.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${prog.percentual}%` }} />
            </div>
            <span className="font-semibold text-slate-700">
              {prog.feitos + prog.naoSeAplica}/{prog.total} passos · {prog.percentual}%
            </span>
            {proximo?.lembreteEm && !encerrado && (
              <span className="inline-flex items-center gap-1 text-slate-600">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                próximo agendado: {proximo.titulo} em {formatDate(proximo.lembreteEm)}
              </span>
            )}
          </div>
        )}
        {isTI && !encerrado && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-slate-600">Situação</span>
              <select value={ticket.status} onChange={(e) => mudarSituacao(e.target.value as TicketStatus)} className="campo campo-sm w-auto">
                <option value="aberto">Aguardando a T.I.</option>
                <option value="em_andamento">Em andamento</option>
                <option value="aguardando_terceiro">Aguardando…</option>
              </select>
            </label>
            {ticket.status === 'aguardando_terceiro' && (
              <select
                aria-label="Aguardando o quê"
                value={ticket.aguardandoMotivo || ''}
                onChange={(e) => mudarSituacao('aguardando_terceiro', e.target.value as AguardandoMotivo | '')}
                className="campo campo-sm w-auto"
              >
                <option value="">Aguardando o quê?</option>
                <option value="peca">Equipamento / peça</option>
                <option value="fornecedor">Fornecedor</option>
                <option value="solicitante">Resposta do RH</option>
              </select>
            )}
            <label className="flex items-center gap-1.5">
              <span className="text-slate-600">Técnico</span>
              <select
                value={ticket.tecnicoResponsavelId || ''}
                onChange={(e) => salvarAlteracoesChamado(ticket.id, { tecnicoId: e.target.value })}
                className="campo campo-sm w-auto max-w-56"
              >
                <option value="">Não atribuído</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
            <span className="flex-1" />
            <button type="button" onClick={() => setCancelando(true)} className="btn btn-sm btn-perigo">
              {ehOnb ? 'Cancelar admissão' : 'Cancelar desligamento'}
            </button>
          </div>
        )}
        {!isTI && <p className="text-xs text-slate-600">Técnico: {ticket.tecnicoResponsavelNome || 'não atribuído'}</p>}
      </section>

      {ticket.status === 'cancelado' && ticket.cancelamento && <BlocoCancelamento ticket={ticket} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          {usaChecklistLegado ? <ChecklistLegado ticket={ticket} isTI={isTI} concluir={concluirOffboarding} /> : <ChecklistProcesso ticket={ticket} />}
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Pedido, anotações e conversa">
          {ehOnb ? <PedidoAdmissao ticket={ticket} /> : ticket.offboarding && <PedidoDesligamento ticket={ticket} />}
          <AnotacoesProcesso ticket={ticket} podeEditar={isTI} onSalvar={salvarAnotacoesProcesso} />
          <section className="cartao space-y-3 p-4">
            <Abas
              rotulo="Conversa e histórico"
              ativa={aba}
              onMudar={setAba}
              itens={[
                { id: 'conversa', rotulo: 'Conversa', contador: ticket.mensagens.length },
                { id: 'historico', rotulo: 'Histórico' },
              ]}
            />
            {aba === 'conversa' ? (
              <Conversa ticket={ticket} isTI={isTI} encerrado={encerrado} enviar={addTicketMessage} meuId={currentUser?.id} />
            ) : (
              <div className="space-y-4">
                <TrilhaAuditoria chamadoId={ticket.id} nomeDe={(id) => employees.find((e) => e.id === id)?.nome} atualizar={itens.filter((i) => i.status !== 'pendente').length} />
                <HistoricoChamado ticket={ticket} />
              </div>
            )}
          </section>
        </aside>
      </div>
      {cancelando && <FormCancelamento ticket={ticket} onClose={() => setCancelando(false)} />}
    </div>
  );
};

// -----------------------------------------------------------------------------
/** Pedido do RH (admissão): dados do admitido e o kit pedido */
const PedidoAdmissao: React.FC<{ ticket: Ticket }> = ({ ticket }) => {
  const { departments, employees } = useApp();
  const ob = ticket.onboarding;
  if (!ob) return null;
  const gestor = employees.find((e) => e.id === ob.gestorId);
  return (
    <section aria-label="Pedido do RH" className="cartao space-y-3 p-4 text-xs">
      <h3 className="secao-titulo flex items-center gap-1.5">
        <UserPlus className="h-4 w-4" aria-hidden="true" /> Pedido do RH
      </h3>
      <div className="grid grid-cols-1 gap-y-1.5">
        <Linha rotulo="Nome">{ob.nomeColaborador}</Linha>
        <Linha rotulo="Cargo">{ob.cargo || '—'}</Linha>
        <Linha rotulo="E-mail">
          <span className="font-mono">{ob.emailColaborador}</span>
        </Linha>
        <Linha rotulo="Setor">{departments.find((d) => d.id === ob.setorId)?.nome || '—'}</Linha>
        {gestor && <Linha rotulo="Gestor">{gestor.nome}</Linha>}
        <Linha rotulo="Início">{formatDate(ob.dataAdmissao)}</Linha>
        <Linha rotulo="Acesso sugerido">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            {PAPEL[ob.papelAcessoSugerido || 'colaborador']}
          </span>
        </Linha>
        {ob.tipoComputador?.trim() && <Linha rotulo="Equipamento">{ob.tipoComputador}</Linha>}
        {ob.perifericos.length > 0 && (
          <Linha rotulo="Kit">
            <span className="flex flex-wrap gap-1">
              {ob.perifericos.map((p) => (
                <span key={p} className="selo selo-neutro">
                  {p}
                </span>
              ))}
            </span>
          </Linha>
        )}
        {ob.acessosSoftwares.length > 0 && (
          <Linha rotulo="Acessos">
            <span className="flex flex-wrap gap-1">
              {ob.acessosSoftwares.map((a) => (
                <span key={a} className="selo selo-neutro">
                  {a}
                </span>
              ))}
            </span>
          </Linha>
        )}
        {(ob.gruposEmail || []).length > 0 && <Linha rotulo="Grupos">{(ob.gruposEmail || []).join(', ')}</Linha>}
        {ob.observacoes?.trim() && (
          <Linha rotulo="Observações">
            <span className="whitespace-pre-wrap">{ob.observacoes}</span>
          </Linha>
        )}
      </div>
    </section>
  );
};

// -----------------------------------------------------------------------------
/** Anotações fixas do processo: visíveis durante e depois de concluir */
const AnotacoesProcesso: React.FC<{ ticket: Ticket; podeEditar: boolean; onSalvar: (id: string, texto: string) => Promise<string | null> }> = ({
  ticket,
  podeEditar,
  onSalvar,
}) => {
  const salvo = ticket.anotacoesProcesso || '';
  const [texto, setTexto] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const atual = texto ?? salvo;
  const alterado = texto !== null && texto.trim() !== salvo.trim();
  useRegistrarPendencias(`processo:${ticket.id}:anotacoes`, alterado ? ['Anotações do processo não salvas'] : []);

  const salvar = async () => {
    setGravando(true);
    const falha = await onSalvar(ticket.id, atual);
    setGravando(false);
    if (falha) return setMsg({ ok: false, t: falha });
    setTexto(null);
    setMsg({ ok: true, t: 'Anotações salvas.' });
  };

  return (
    <section aria-label="Anotações do processo" className="cartao space-y-2 p-4">
      <h3 className="secao-titulo flex items-center gap-1.5">
        <StickyNote className="h-4 w-4" aria-hidden="true" /> Anotações do processo
      </h3>
      {podeEditar ? (
        <>
          <textarea
            aria-label="Anotações do processo"
            rows={4}
            value={atual}
            onChange={(e) => {
              setTexto(e.target.value);
              setMsg(null);
            }}
            placeholder="Ex.: notebook vai pelo motoboy na segunda; gestor pediu acesso ao drive da equipe; senha do cofre entregue em mãos."
            className="campo"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`text-xs ${msg ? (msg.ok ? 'text-emerald-700' : 'text-red-700') : 'text-slate-500'}`}>
              {msg ? msg.t : 'Ficam visíveis depois de concluir, no histórico e na ficha da pessoa.'}
            </span>
            <button type="button" disabled={!alterado || gravando} onClick={salvar} className="btn btn-sm btn-secundario">
              {gravando ? 'Salvando…' : 'Salvar anotações'}
            </button>
          </div>
        </>
      ) : salvo ? (
        <p className="text-xs whitespace-pre-wrap text-slate-700">{salvo}</p>
      ) : (
        <p className="text-xs text-slate-500">A T.I. ainda não fez anotações neste processo.</p>
      )}
    </section>
  );
};

// -----------------------------------------------------------------------------
/** Conversa com o RH (e notas internas da T.I.) */
const Conversa: React.FC<{
  ticket: Ticket;
  isTI: boolean;
  encerrado: boolean;
  meuId?: string;
  enviar: (ticketId: string, texto: string, interna: boolean) => void;
}> = ({ ticket, isTI, encerrado, meuId, enviar }) => {
  const [texto, setTexto] = useState('');
  const [interna, setInterna] = useState(false);
  return (
    <div className="space-y-3">
      <ConversaChamado ticket={ticket} podeVerNotas={isTI} meuId={meuId} abaInicial="conversa" />
      {encerrado ? (
        <p className="ajuda">Processo encerrado: a conversa fica registrada como está.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!texto.trim()) return;
            enviar(ticket.id, texto.trim(), interna);
            setTexto('');
          }}
          className="space-y-2 border-t border-slate-200 pt-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`processo-msg-${ticket.id}`} className="rotulo !mb-0">
              {isTI ? 'Escrever para o RH' : 'Escrever para a T.I.'}
            </label>
            {isTI && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700 select-none">
                <input type="checkbox" checked={interna} onChange={(e) => setInterna(e.target.checked)} />
                <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                Nota interna (só a T.I.)
              </label>
            )}
          </div>
          <textarea id={`processo-msg-${ticket.id}`} rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} className="campo" placeholder="Mensagem…" />
          <div className="flex justify-end">
            <button type="submit" disabled={!texto.trim()} className="btn btn-sm btn-secundario">
              <Send aria-hidden="true" /> {interna ? 'Salvar nota' : 'Enviar'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
/** Desligamentos antigos (antes do checklist guiado): lista simples + conclusão automática */
const ChecklistLegado: React.FC<{
  ticket: Ticket;
  isTI: boolean;
  concluir: (id: string) => Promise<{ ativosDevolvidos: number; licencasLiberadas: number } | null>;
}> = ({ ticket, isTI, concluir }) => {
  const { employees, salvarAlteracoesChamado } = useApp();
  const [resumo, setResumo] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);
  const off = ticket.offboarding;
  if (!off) return null;
  const pessoa = employees.find((e) => e.id === off.colaboradorId);
  const encerrado = chamadoEncerrado(ticket);
  const feitos = off.checklist.filter((c) => c.concluido).length;

  const finalizar = async () => {
    if (!pessoa) return;
    const ok = await confirmar(
      `Concluir o desligamento de ${pessoa.nome}?\n\n• Todos os equipamentos voltam ao estoque (custódia fechada hoje)\n• Todas as licenças são liberadas\n• O acesso ao sistema é encerrado (status "desligado")\n• O processo é encerrado\n\nNão dá para desfazer pela tela.`
    );
    if (!ok) return;
    setConcluindo(true);
    const r = await concluir(ticket.id);
    setConcluindo(false);
    if (r) setResumo(`Desligamento concluído: ${r.ativosDevolvidos} equipamento(s) devolvido(s) e ${r.licencasLiberadas} licença(s) liberada(s).`);
  };

  return (
    <section aria-label="Checklist de desligamento (formato antigo)" className="cartao space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="secao-titulo flex items-center gap-1.5">
          <FileCheck className="h-4 w-4" aria-hidden="true" /> Checklist de desligamento
        </h3>
        <span className="text-xs font-semibold text-slate-700">
          {feitos}/{off.checklist.length}
        </span>
      </div>
      <p className="ajuda">Processo aberto antes do checklist guiado: marque cada item; a conclusão faz as devoluções automaticamente.</p>
      <div className="space-y-1.5">
        {off.checklist.map((c) => (
          <label key={c.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 text-xs ${c.concluido ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
            <input
              type="checkbox"
              checked={c.concluido}
              disabled={!isTI || encerrado}
              onChange={() => salvarAlteracoesChamado(ticket.id, { checklist: { [c.id]: !c.concluido } })}
              className="mt-0.5"
            />
            <span className="flex-1">{c.texto}</span>
          </label>
        ))}
      </div>
      {resumo && (
        <span className="selo selo-ok whitespace-normal">
          <CheckCircle2 aria-hidden="true" /> {resumo}
        </span>
      )}
      {isTI && !encerrado && pessoa && (
        <div className="flex justify-end">
          <button type="button" onClick={finalizar} disabled={concluindo} className="btn btn-sm btn-primario">
            <ShieldCheck aria-hidden="true" /> {concluindo ? 'Concluindo…' : `Concluir desligamento de ${pessoa.nome}`}
          </button>
        </div>
      )}
    </section>
  );
};
