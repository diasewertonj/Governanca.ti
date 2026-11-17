import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, ClipboardList, History, MinusCircle, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
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
import { confirmar } from '../ui/dialogo.tsx';

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
  const { linhas } = useRecursos();

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
        : montarOffboarding(ticket, { recursos, ativos: assets, licencas: licenses, linhas }, nomeDe)
    );

  const salvarRascunho = async () => {
    if (!rascunho) return;
    setSalvando(true);
    const ok = await salvarChecklist(ticket.id, rascunho);
    setSalvando(false);
    if (ok) setRascunho(null);
  };

  const remover = async (item: ProcessoItem) => {
    if (!(await confirmar(`Remover o passo "${item.titulo}" do checklist?`))) return;
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
    if (!(await confirmar(`Concluir ${acao}? O chamado será encerrado.${efeitos}${termo}`))) return;
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
    <section aria-label={ehOnb ? 'Checklist de admissão' : 'Checklist de desligamento'} className="cartao p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="secao-titulo flex items-center gap-1.5">
          <ClipboardList className="h-4 w-4" aria-hidden="true" />
          {ehOnb ? 'Checklist de admissão' : 'Checklist de desligamento'}
          {colab ? ` · ${colab.nome}` : ''}
        </h3>
        {itens.length > 0 && (
          <span className="text-xs font-semibold whitespace-nowrap text-slate-700">
            {prog.feitos + prog.naoSeAplica}/{prog.total} · {prog.percentual}%
          </span>
        )}
      </div>

      {itens.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${prog.percentual}%` }} />
        </div>
      )}

      {mensagem && (
        <div className="flex items-start justify-between gap-2">
          <span className={mensagem.ok ? 'selo selo-ok whitespace-normal' : 'selo selo-problema whitespace-normal'}>{mensagem.texto}</span>
          <button type="button" onClick={() => setMensagem(null)} title="Fechar aviso" aria-label="Fechar aviso" className="btn-icone">
            <X />
          </button>
        </div>
      )}

      {itens.length === 0 && !rascunho && (
        podeEditar ? (
          !ehOnb && !colabId ? (
            <p className="ajuda">
              Este chamado não identifica o colaborador que sai. Peça ao RH para abrir o desligamento pela tela de Processos de RH.
            </p>
          ) : (
            <div className="space-y-2 text-xs text-slate-600">
              <p>
                A sugestão vem {ehOnb ? 'do catálogo e do que o RH pediu' : 'de tudo que está vinculado ao colaborador (contas, grupos, equipamentos, acessórios e licenças)'}.
                Revise antes de salvar: nada é obrigatório.
              </p>
              <button type="button" onClick={montarSugestao} className="btn btn-primario">
                <ClipboardList aria-hidden="true" /> Montar checklist sugerido
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

      {/* Etapas empilhadas: o checklist fica na coluna do pedido, ao lado do atendimento */}
      <div className="grid grid-cols-1 gap-y-3">
      {grupos.map((g) => (
        <div key={g.etapa} className="space-y-1.5">
          <h4 className="secao-titulo">{g.etapa}</h4>
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
      </div>

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
            <button type="button" onClick={() => setRascunho([])} className="btn btn-sm btn-secundario">
              <Plus aria-hidden="true" /> Adicionar passos
            </button>
            <button
              type="button"
              onClick={concluir}
              disabled={!prog.podeConcluir || concluindo}
              className="btn btn-sm btn-primario"
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
    </section>
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
  const { employees } = useApp();
  const cadastrada = item.tipo === 'cadastro' ? employees.find((e) => e.id === ticket.colaboradorId) : undefined;
  const icone =
    item.status === 'feito' ? (
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
    ) : item.status === 'nao_se_aplica' ? (
      <MinusCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
    ) : (
      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
    );
  const registro = [
    item.identificador,
    item.destino ? `destino: ${item.destino}` : undefined,
    item.destinoColaboradorId ? `para ${nomeDe(item.destinoColaboradorId) || '—'}` : undefined,
    item.condicao ? `condição: ${item.condicao}` : undefined,
    item.lembreteEm ? `lembrete ${item.lembreteEm.split('-').reverse().join('/')}` : undefined,
  ].filter(Boolean);
  const pendenteEditavel = podeEditar && item.status === 'pendente' && !aberto;

  return (
    <div className="rounded-lg border border-slate-200 bg-white text-xs">
      <div className="flex items-start gap-2 p-2.5">
        {icone}
        <div className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">{ACAO_DO_TIPO[item.tipo]}</span>
            {item.sugeridoPor === 'rh' && <span className="selo selo-info">pedido do RH</span>}
          </span>
          <span className={`block font-medium ${item.status === 'nao_se_aplica' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
            {item.titulo}
          </span>
          {/* Cadastro concluído: mostra a pessoa como foi cadastrada (o pedido do RH pode ter sido corrigido) */}
          {item.tipo === 'cadastro' && item.status === 'feito' && cadastrada ? (
            <span className="block text-slate-500">
              {cadastrada.nome} · {cadastrada.email}
            </span>
          ) : (
            item.detalhe && <span className="block text-slate-500">{item.detalhe}</span>
          )}
          {item.status !== 'pendente' && (
            <span className="mt-0.5 block text-slate-500">
              {registro.length > 0 && <>{registro.join(' · ')} · </>}
              {item.observacao && <>“{item.observacao}” · </>}
              {nomeDe(item.concluidoPor) || 'T.I.'}
              {item.concluidoEm ? ` em ${formatDateTime(item.concluidoEm)}` : ''}
            </span>
          )}
        </div>
        {(pendenteEditavel || (podeEditar && podeReabrir(item))) && (
          <span className="acoes-linha shrink-0">
            {pendenteEditavel && (
              <>
                <button type="button" onClick={onAbrir} aria-expanded={aberto} className="btn btn-sm btn-primario">
                  Registrar
                </button>
                <button
                  type="button"
                  onClick={onRemover}
                  title="Remover passo"
                  aria-label={`Remover o passo ${item.titulo}`}
                  className="btn-icone btn-icone-perigo"
                >
                  <Trash2 />
                </button>
              </>
            )}
            {podeEditar && podeReabrir(item) && (
              <button
                type="button"
                onClick={onReabrir}
                title="Voltar para pendente"
                aria-label={`Voltar o passo ${item.titulo} para pendente`}
                className="btn-icone"
              >
                <RotateCcw />
              </button>
            )}
          </span>
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
    <div className="space-y-3 rounded-lg border border-dashed border-slate-300 p-3">
      <p className="text-xs font-semibold text-slate-900">
        {existentes > 0 ? 'Novos passos (rascunho)' : 'Checklist sugerido (rascunho)'} — tire o que não se aplica e acrescente o
        que faltar.
      </p>
      {rascunho.length === 0 && <p className="ajuda">Nenhum passo ainda.</p>}
      <ul className="space-y-1">
        {rascunho.map((r) => (
          <li key={r.chave} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
            <span className="w-28 shrink-0 truncate text-xs font-semibold text-slate-500">
              {ACAO_DO_TIPO[r.tipo]}
            </span>
            <span className="flex-1 min-w-0 truncate">
              {r.titulo}
              {r.detalhe && <span className="text-slate-500"> · {r.detalhe}</span>}
            </span>
            {r.sugeridoPor === 'rh' && <span className="selo selo-info">RH</span>}
            <button
              type="button"
              onClick={() => setRascunho(rascunho.filter((x) => x.chave !== r.chave))}
              title="Tirar do checklist"
              aria-label={`Tirar ${r.titulo} do checklist`}
              className="btn-icone btn-icone-perigo"
            >
              <X />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {ehOnb && (
          <select
            value={doCatalogo}
            onChange={(e) => incluirCatalogo(e.target.value)}
            className="campo campo-sm w-auto"
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
          className="campo campo-sm w-auto"
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
          className="campo campo-sm w-auto min-w-[10rem] flex-1"
        />
        <button type="button" onClick={incluirLivre} className="btn btn-sm btn-secundario">
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
        className="btn btn-sm btn-discreto"
      >
        <History aria-hidden="true" /> Ver histórico
        {erro && <span className="erro"> · {erro}</span>}
      </button>
    );
  }
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-xs font-semibold text-slate-600">
        <History className="h-3.5 w-3.5" aria-hidden="true" /> Histórico
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
