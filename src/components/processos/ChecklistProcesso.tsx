import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, ClipboardList, History, MinusCircle, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { fetchEventosProcessoDb, mensagemDeErro } from '../../services/supabaseDb.ts';
import type { ProcessoEvento, ProcessoItem, ProcessoItemRascunho, Ticket, TipoItemProcesso } from '../../types/index.ts';
import { formatDateTime } from '../../utils/formatters.ts';
import {
  ACAO_DO_TIPO,
  ORDEM_ETAPAS,
  etapaDoItem,
  montarOffboarding,
  montarOnboarding,
  podeReabrir,
  progresso,
} from '../../utils/processos.ts';
import { BarraAlteracoes } from '../comum/BarraAlteracoes.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { FormItemProcesso } from './FormItemProcesso.tsx';

const TIPOS_LIVRES_ONB: TipoItemProcesso[] = ['conta', 'grupo_email', 'licenca', 'equipamento', 'acessorio', 'tarefa'];
const TIPOS_LIVRES_OFF: TipoItemProcesso[] = ['tarefa', 'dados_drive', 'email'];

const ROTULO_EVENTO: Record<string, string> = {
  item_criado: 'incluiu o passo',
  status_feito: 'concluiu',
  status_nao_se_aplica: 'marcou "não se aplica"',
  status_pendente: 'reabriu',
  item_alterado: 'alterou',
  item_removido: 'removeu o passo',
  acesso_nexus_criado: 'criou o login no Nexus',
  acesso_nexus_senha_redefinida: 'gerou nova senha provisória',
};

const novaChave = () => crypto.randomUUID();

/**
 * Fase 6: checklist guiado de admissão/desligamento dentro do chamado.
 * - T.I.: monta a sugestão (rascunho, salva com a barra), registra cada passo e conclui.
 * - RH: acompanha o andamento (somente leitura) e conversa pelas mensagens.
 */
export const ChecklistProcesso: React.FC<{ ticket: Ticket }> = ({ ticket }) => {
  const {
    currentRole,
    processoItens,
    recursos,
    catalogo,
    assets,
    licenses,
    employees,
    salvarChecklist,
    removerItemProcesso,
    registrarItemProcesso,
    concluirProcesso,
  } = useApp();

  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const emAberto = ticket.status !== 'resolvido' && ticket.status !== 'cancelado';
  const podeEditar = isTI && emAberto;
  const ehOnb = ticket.tipo === 'onboarding';
  const colabId = ticket.colaboradorId || ticket.offboarding?.colaboradorId;
  const colab = employees.find((e) => e.id === colabId);
  const nomeDe = (id?: string) => employees.find((e) => e.id === id)?.nome;

  const itens = useMemo(
    () => processoItens.filter((i) => i.chamadoId === ticket.id).sort((a, b) => a.ordem - b.ordem),
    [processoItens, ticket.id]
  );
  const prog = progresso(itens);

  const [rascunho, setRascunho] = useState<ProcessoItemRascunho[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
  const [concluindo, setConcluindo] = useState(false);

  useRegistrarPendencias(
    `checklist-${ticket.id}`,
    rascunho && rascunho.length > 0 ? [`Checklist: ${rascunho.length} passo(s) não salvos`] : []
  );

  const montarSugestao = () =>
    setRascunho(
      ehOnb
        ? montarOnboarding(ticket, catalogo, licenses)
        : montarOffboarding(ticket, { recursos, ativos: assets, licencas: licenses }, nomeDe)
    );

  const salvarRascunho = async () => {
    if (!rascunho) return;
    setSalvando(true);
    const ok = await salvarChecklist(ticket.id, rascunho);
    setSalvando(false);
    if (ok) setRascunho(null);
  };

  const remover = async (item: ProcessoItem) => {
    if (!window.confirm(`Remover o passo "${item.titulo}" do checklist?`)) return;
    await removerItemProcesso(item.id);
  };

  const reabrir = async (item: ProcessoItem) => {
    const erro = await registrarItemProcesso(item.id, 'pendente', undefined, {});
    if (erro) setMensagem({ ok: false, texto: erro });
  };

  const concluir = async () => {
    const acao = ehOnb ? 'a admissão' : `o desligamento${colab ? ` de ${colab.nome}` : ''}`;
    const efeitos = ehOnb ? '' : '\nO colaborador será marcado como desligado.';
    const termo = prog.termoPendente
      ? '\n\nO termo ainda não foi assinado: será criado um lembrete para coletar a assinatura.'
      : '';
    if (!window.confirm(`Concluir ${acao}? O chamado será encerrado.${efeitos}${termo}`)) return;
    setConcluindo(true);
    const erro = await concluirProcesso(ticket.id);
    setConcluindo(false);
    setMensagem(erro ? { ok: false, texto: erro } : { ok: true, texto: 'Processo concluído e chamado encerrado.' });
  };

  const grupos = ORDEM_ETAPAS.map((etapa) => ({
    etapa,
    itens: itens.filter((i) => etapaDoItem(i, recursos) === etapa),
  })).filter((g) => g.itens.length > 0);

  return (
    <div className="border border-indigo-200 bg-indigo-50/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-indigo-200">
        <div className="flex items-center gap-1.5">
          <ClipboardList className="w-4 h-4 text-indigo-700" />
          <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wide">
            {ehOnb ? 'Checklist de admissão' : 'Checklist de desligamento'}
            {colab ? ` · ${colab.nome}` : ''}
          </h4>
        </div>
        {itens.length > 0 && (
          <span className="text-xs font-semibold text-indigo-800 whitespace-nowrap">
            {prog.feitos + prog.naoSeAplica}/{prog.total} · {prog.percentual}%
          </span>
        )}
      </div>

      {itens.length > 0 && (
        <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden" aria-hidden>
          <div className="h-full bg-indigo-600 transition-all" style={{ width: `${prog.percentual}%` }} />
        </div>
      )}

      {mensagem && (
        <div
          className={`flex items-start justify-between gap-2 p-2.5 rounded text-xs border ${
            mensagem.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{mensagem.texto}</span>
          <button type="button" onClick={() => setMensagem(null)} aria-label="Fechar aviso">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {itens.length === 0 && !rascunho && (
        podeEditar ? (
          !ehOnb && !colabId ? (
            <p className="text-xs text-amber-800">
              Este chamado não identifica o colaborador que sai. Peça ao RH para abrir o desligamento pela tela de Processos de RH.
            </p>
          ) : (
            <div className="space-y-2 text-xs text-slate-600">
              <p>
                A sugestão vem {ehOnb ? 'do catálogo e do que o RH pediu' : 'de tudo que está vinculado ao colaborador (contas, grupos, equipamentos, acessórios e licenças)'}.
                Revise antes de salvar: nada é obrigatório.
              </p>
              <button
                type="button"
                onClick={montarSugestao}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              >
                <ClipboardList className="w-3.5 h-3.5" /> Montar checklist sugerido
              </button>
            </div>
          )
        ) : (
          <p className="text-xs text-slate-500">
            {emAberto
              ? 'A T.I. ainda não montou o checklist deste processo. Acompanhe por aqui e use as mensagens para falar com a equipe.'
              : 'Processo sem checklist guiado.'}
          </p>
        )
      )}

      {grupos.map((g) => (
        <div key={g.etapa} className="space-y-1.5">
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">{g.etapa}</h5>
          {g.itens.map((item) => (
            <LinhaItem
              key={item.id}
              item={item}
              ticket={ticket}
              podeEditar={podeEditar}
              aberto={abertoId === item.id}
              onAbrir={() => setAbertoId(item.id)}
              onFechar={() => setAbertoId(null)}
              onRemover={() => remover(item)}
              onReabrir={() => reabrir(item)}
              nomeDe={nomeDe}
            />
          ))}
        </div>
      ))}

      {rascunho && (
        <Montagem rascunho={rascunho} setRascunho={setRascunho} ehOnb={ehOnb} existentes={itens.length} />
      )}
      {rascunho && (
        <BarraAlteracoes
          itens={rascunho.length > 0 ? [`${rascunho.length} passo(s) a incluir no checklist`] : ['Nenhum passo escolhido']}
          onCancelar={() => setRascunho(null)}
          onSalvar={salvarRascunho}
          salvando={salvando}
          rotuloSalvar="Salvar checklist"
        />
      )}

      {podeEditar && itens.length > 0 && !rascunho && (
        <div className="space-y-1.5 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setRascunho([])}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-white border border-indigo-300 rounded-md hover:bg-indigo-50"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar passos
            </button>
            <button
              type="button"
              onClick={concluir}
              disabled={!prog.podeConcluir || concluindo}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50"
            >
              {concluindo ? 'Concluindo...' : ehOnb ? 'Concluir admissão' : 'Concluir desligamento'}
            </button>
          </div>
          {!prog.podeConcluir && (
            <p className="text-xs text-slate-500">
              Para concluir, cada passo precisa estar feito ou marcado como "não se aplica" (o termo pode ficar para depois).
            </p>
          )}
        </div>
      )}

      {itens.length > 0 && <TrilhaAuditoria chamadoId={ticket.id} nomeDe={nomeDe} />}
    </div>
  );
};

// -----------------------------------------------------------------------------
const LinhaItem: React.FC<{
  item: ProcessoItem;
  ticket: Ticket;
  podeEditar: boolean;
  aberto: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  onRemover: () => void;
  onReabrir: () => void;
  nomeDe: (id?: string) => string | undefined;
}> = ({ item, ticket, podeEditar, aberto, onAbrir, onFechar, onRemover, onReabrir, nomeDe }) => {
  const icone =
    item.status === 'feito' ? (
      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
    ) : item.status === 'nao_se_aplica' ? (
      <MinusCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
    ) : (
      <Circle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
    );
  const registro = [
    item.identificador,
    item.destino ? `destino: ${item.destino}` : undefined,
    item.destinoColaboradorId ? `para ${nomeDe(item.destinoColaboradorId) || '—'}` : undefined,
    item.condicao ? `condição: ${item.condicao}` : undefined,
    item.lembreteEm ? `lembrete ${item.lembreteEm.split('-').reverse().join('/')}` : undefined,
  ].filter(Boolean);
  const clicavel = podeEditar && item.status === 'pendente' && !aberto;

  return (
    <div
      className={`rounded-md border text-xs ${
        item.status === 'feito'
          ? 'bg-emerald-50/50 border-emerald-200'
          : item.status === 'nao_se_aplica'
            ? 'bg-slate-50 border-slate-200'
            : 'bg-white border-slate-200'
      }`}
    >
      <div className="flex items-start gap-2 p-2">
        {icone}
        <button
          type="button"
          onClick={clicavel ? onAbrir : undefined}
          className={`flex-1 min-w-0 text-left ${clicavel ? 'cursor-pointer' : 'cursor-default'}`}
          aria-expanded={aberto}
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs uppercase font-semibold text-slate-500">{ACAO_DO_TIPO[item.tipo]}</span>
            {item.sugeridoPor === 'rh' && (
              <span className="text-xs px-1.5 rounded bg-blue-50 text-blue-700 border border-blue-200">pedido do RH</span>
            )}
          </span>
          <span
            className={`block font-medium ${item.status === 'nao_se_aplica' ? 'text-slate-500 line-through' : 'text-slate-800'}`}
          >
            {item.titulo}
          </span>
          {item.detalhe && <span className="block text-xs text-slate-500">{item.detalhe}</span>}
          {item.status !== 'pendente' && (
            <span className="block text-xs text-slate-500 mt-0.5">
              {registro.length > 0 && <>{registro.join(' · ')} · </>}
              {item.observacao && <>“{item.observacao}” · </>}
              {nomeDe(item.concluidoPor) || 'T.I.'}
              {item.concluidoEm ? ` em ${formatDateTime(item.concluidoEm)}` : ''}
            </span>
          )}
          {clicavel && <span className="block text-xs text-indigo-600 mt-0.5">Registrar este passo</span>}
        </button>
        {podeEditar && item.status === 'pendente' && !aberto && (
          <button type="button" onClick={onRemover} title="Remover passo" className="p-1 text-slate-500 hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {podeEditar && podeReabrir(item) && (
          <button type="button" onClick={onReabrir} title="Voltar para pendente" className="p-1 text-slate-500 hover:text-indigo-600">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {aberto && <FormItemProcesso item={item} ticket={ticket} onFechar={onFechar} />}
    </div>
  );
};

// -----------------------------------------------------------------------------
const Montagem: React.FC<{
  rascunho: ProcessoItemRascunho[];
  setRascunho: (r: ProcessoItemRascunho[]) => void;
  ehOnb: boolean;
  existentes: number;
}> = ({ rascunho, setRascunho, ehOnb, existentes }) => {
  const { catalogo } = useApp();
  const tipos = ehOnb ? TIPOS_LIVRES_ONB : TIPOS_LIVRES_OFF;
  const [tipo, setTipo] = useState<TipoItemProcesso>(tipos[0]);
  const [nome, setNome] = useState('');
  const [doCatalogo, setDoCatalogo] = useState('');

  const incluir = (r: Omit<ProcessoItemRascunho, 'chave'>) => setRascunho([...rascunho, { ...r, chave: novaChave() }]);

  const incluirLivre = () => {
    if (!nome.trim()) return;
    incluir({
      tipo,
      titulo: nome.trim(),
      sugeridoPor: 'ti',
      identificador: tipo === 'grupo_email' ? nome.trim() : undefined,
    });
    setNome('');
  };

  const incluirCatalogo = (id: string) => {
    const c = catalogo.find((x) => x.id === id);
    if (!c) return;
    incluir({
      tipo: c.tipo,
      titulo: c.nome,
      catalogoId: c.id,
      sugeridoPor: 'ti',
      detalhe: c.descricao,
      identificador: c.tipo === 'grupo_email' ? c.nome : undefined,
    });
    setDoCatalogo('');
  };

  return (
    <div className="rounded-md border-2 border-dashed border-indigo-300 bg-white p-3 space-y-2">
      <p className="text-xs font-semibold text-indigo-900">
        {existentes > 0 ? 'Novos passos (rascunho)' : 'Checklist sugerido (rascunho)'} — tire o que não se aplica e acrescente o
        que faltar.
      </p>
      {rascunho.length === 0 && <p className="text-xs text-slate-500">Nenhum passo ainda.</p>}
      <ul className="space-y-1">
        {rascunho.map((r) => (
          <li key={r.chave} className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1">
            <span className="text-xs uppercase font-semibold text-slate-500 w-28 shrink-0 truncate">
              {ACAO_DO_TIPO[r.tipo]}
            </span>
            <span className="flex-1 min-w-0 truncate">
              {r.titulo}
              {r.detalhe && <span className="text-slate-500"> · {r.detalhe}</span>}
            </span>
            {r.sugeridoPor === 'rh' && <span className="text-xs text-blue-700">RH</span>}
            <button
              type="button"
              onClick={() => setRascunho(rascunho.filter((x) => x.chave !== r.chave))}
              title="Tirar do checklist"
              className="p-0.5 text-slate-500 hover:text-red-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end gap-2 pt-1">
        {ehOnb && (
          <select
            value={doCatalogo}
            onChange={(e) => incluirCatalogo(e.target.value)}
            className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            aria-label="Adicionar do catálogo"
          >
            <option value="">+ Do catálogo...</option>
            {catalogo
              .filter((c) => c.ativo)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {ACAO_DO_TIPO[c.tipo]}: {c.nome}
                </option>
              ))}
          </select>
        )}
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoItemProcesso)}
          className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          aria-label="Tipo do passo"
        >
          {tipos.map((t) => (
            <option key={t} value={t}>
              {ACAO_DO_TIPO[t]}
            </option>
          ))}
        </select>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              incluirLivre();
            }
          }}
          placeholder="Nome (ex.: VPN, grupo financeiro@...)"
          className="flex-1 min-w-[10rem] px-2 py-1.5 text-xs border border-slate-300 rounded-md"
        />
        <button
          type="button"
          onClick={incluirLivre}
          className="px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100"
        >
          Incluir
        </button>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
const TrilhaAuditoria: React.FC<{ chamadoId: string; nomeDe: (id?: string) => string | undefined }> = ({
  chamadoId,
  nomeDe,
}) => {
  const [eventos, setEventos] = useState<ProcessoEvento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    try {
      setErro(null);
      setEventos(await fetchEventosProcessoDb(chamadoId));
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  };

  if (!eventos) {
    return (
      <button
        type="button"
        onClick={carregar}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-700"
      >
        <History className="w-3.5 h-3.5" /> Ver histórico
        {erro && <span className="text-red-600"> · {erro}</span>}
      </button>
    );
  }
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-xs font-semibold text-slate-600">
        <History className="w-3.5 h-3.5" /> Histórico
      </p>
      {eventos.length === 0 ? (
        <p className="text-xs text-slate-500">Sem eventos registrados (no modo demonstração a trilha fica no banco).</p>
      ) : (
        <ul className="max-h-40 overflow-y-auto text-xs text-slate-600 space-y-0.5">
          {eventos.map((e) => (
            <li key={e.id}>
              {formatDateTime(e.em)} · {nomeDe(e.por) || 'Sistema'} {ROTULO_EVENTO[e.acao] || e.acao}
              {typeof e.detalhe?.titulo === 'string' ? `: ${e.detalhe.titulo}` : ''}
              {typeof e.detalhe?.observacao === 'string' && e.detalhe.observacao ? ` (“${e.detalhe.observacao}”)` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
