import React, { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardList, Copy, History, KeyRound, Plus, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { isSupabaseConfigured } from '../../services/supabase.ts';
import { fetchEventosProcessoDb, mensagemDeErro } from '../../services/supabaseDb.ts';
import type { ProcessoEvento, ProcessoItemRascunho, Ticket, TipoItemProcesso } from '../../types/index.ts';
import { formatDateTime } from '../../utils/formatters.ts';
import {
  ACAO_DO_TIPO,
  ORDEM_ETAPAS,
  etapaDoItem,
  montarOffboarding,
  montarOnboarding,
  progresso,
} from '../../utils/processos.ts';
import { BarraAlteracoes } from '../comum/BarraAlteracoes.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { PassoProcesso, avisoDoLogin } from './PassoProcesso.tsx';
import { confirmar, pedirTexto } from '../ui/dialogo.tsx';
import { Janela } from '../ui/Janela.tsx';

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
 * Fase 6 / seção 9.2: checklist guiado de admissão/desligamento (protagonista da tela do processo).
 * - T.I.: monta a sugestão (rascunho, salva com a barra), registra cada passo na própria linha e conclui.
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
    concluirProcesso,
    reabrirProcesso,
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
  const [senha, setSenha] = useState<{ email: string; senha: string } | null>(null);

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

  const concluir = async () => {
    const acao = ehOnb ? 'a admissão' : `o desligamento${colab ? ` de ${colab.nome}` : ''}`;
    const efeitos = ehOnb ? '' : '\nO colaborador será marcado como desligado.';
    const termo = prog.termoPendente
      ? '\n\nO termo ainda não foi assinado: será criado um lembrete para coletar a assinatura.'
      : '';
    if (!(await confirmar(`Concluir ${acao}?\n\nO processo é encerrado e não volta a ficar aberto (as anotações continuam editáveis).${efeitos}${termo}`))) return;
    setConcluindo(true);
    const erro = await concluirProcesso(ticket.id);
    setConcluindo(false);
    setMensagem(erro ? { ok: false, texto: erro } : { ok: true, texto: 'Processo concluído e chamado encerrado.' });
  };

  const reabrir = async () => {
    const efeito = ehOnb
      ? 'O processo volta para "em atendimento".'
      : `O processo volta para "em atendimento"${colab ? ` e ${colab.nome} volta a ficar ativo` : ''}. Equipamentos e licenças devolvidos não voltam sozinhos: entregue de novo pelo checklist.`;
    const motivo = await pedirTexto(`Reabrir ${ehOnb ? 'a admissão' : 'o desligamento'}?\n\n${efeito} O motivo fica no histórico.`);
    if (!motivo) return;
    setConcluindo(true);
    const erro = await reabrirProcesso(ticket.id, motivo);
    setConcluindo(false);
    setMensagem(erro ? { ok: false, texto: erro } : { ok: true, texto: 'Processo reaberto.' });
  };

  const grupos = ORDEM_ETAPAS.map((etapa) => ({
    etapa,
    itens: itens.filter((i) => etapaDoItem(i, recursos) === etapa),
  })).filter((g) => g.itens.length > 0);

  return (
    <section aria-label={ehOnb ? 'Checklist de admissão' : 'Checklist de desligamento'} className="cartao p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="secao-titulo flex items-center gap-1.5">
          <ClipboardList className="ico" aria-hidden="true" />
          {ehOnb ? 'Checklist de admissão' : 'Checklist de desligamento'}
        </h3>
        {itens.length > 0 && (
          <span className="num texto-aux font-semibold">
            {prog.feitos + prog.naoSeAplica} de {prog.total} · {prog.percentual}%
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
            <div className="space-y-2 text-slate-600">
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
          <p className="texto-aux">
            {emAberto
              ? 'A T.I. ainda não montou o checklist deste processo. Acompanhe por aqui e use as mensagens para falar com a equipe.'
              : 'Processo sem checklist guiado.'}
          </p>
        )
      )}

      {/* Etapas empilhadas; cada passo com a ação na própria linha */}
      <div className="grid grid-cols-1 gap-y-4">
        {grupos.map((g) => (
          <div key={g.etapa} className="space-y-2">
            <h4 className="secao-titulo flex items-center justify-between gap-2">
              {g.etapa}
              <span className="num font-normal normal-case tracking-normal">
                {g.itens.filter((i) => i.status !== 'pendente').length} de {g.itens.length}
              </span>
            </h4>
            {g.itens.map((item) => (
              <PassoProcesso
                key={item.id}
                item={item}
                ticket={ticket}
                podeEditar={podeEditar}
                aberto={abertoId === item.id}
                onAbrir={() => setAbertoId(item.id)}
                onFechar={() => setAbertoId(null)}
                onLogin={(r) => {
                  if ('senha' in r) setSenha(r);
                  else void avisoDoLogin(r);
                }}
              />
            ))}
          </div>
        ))}
      </div>
      {senha && <JanelaSenha email={senha.email} senha={senha.senha} onFechar={() => setSenha(null)} />}

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
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setRascunho([])} className="btn btn-secundario">
              <Plus aria-hidden="true" /> Adicionar passos
            </button>
            <button
              type="button"
              onClick={concluir}
              disabled={!prog.podeConcluir || concluindo}
              className="btn btn-primario"
            >
              {concluindo ? 'Concluindo...' : ehOnb ? 'Concluir admissão' : 'Concluir desligamento'}
            </button>
          </div>
          {!prog.podeConcluir && (
            <p className="texto-aux text-right">
              Para concluir, cada passo precisa estar feito ou como "não se aplica" (o termo pode ficar para depois).
            </p>
          )}
        </div>
      )}

      {currentRole === 'ti_admin' && ticket.status === 'resolvido' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <p className="ajuda">Concluído por engano? O administrador pode reabrir, com motivo.</p>
          <button type="button" onClick={reabrir} disabled={concluindo} className="btn btn-sm btn-secundario">
            Reabrir processo
          </button>
        </div>
      )}
    </section>
  );
};

// -----------------------------------------------------------------------------
/** Senha provisória do login criado no cadastro (aparece uma vez, para copiar) */
const JanelaSenha: React.FC<{ email: string; senha: string; onFechar: () => void }> = ({ email, senha, onFechar }) => {
  const [copiada, setCopiada] = useState(false);
  return (
    <Janela
      tamanho="p"
      icone={<KeyRound className="ico" />}
      titulo="Login criado"
      subtitulo="O passo Acesso ao Nexus foi concluído"
      onFechar={onFechar}
      idTitulo="janela-senha"
      rodape={
        <button type="button" onClick={onFechar} className="btn btn-primario ml-auto">
          Pronto
        </button>
      }
    >
      <div className="space-y-2">
        <p className="text-slate-700">
          Login: <span className="font-mono">{email}</span>
        </p>
        <p className="text-slate-700">Senha provisória (aparece só agora):</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 font-mono tracking-wider select-all">{senha}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(senha);
              setCopiada(true);
            }}
            className="btn btn-sm btn-secundario"
          >
            {copiada ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copiada ? 'Copiada' : 'Copiar'}
          </button>
        </div>
        <p className="ajuda">Entregue por um canal seguro (pessoalmente ou mensagem direta). No primeiro login o sistema pede uma senha nova.</p>
      </div>
    </Janela>
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
      <p className="font-semibold text-slate-900">
        {existentes > 0 ? 'Novos passos (rascunho)' : 'Checklist sugerido (rascunho)'} — tire o que não se aplica e acrescente o
        que faltar.
      </p>
      {rascunho.length === 0 && <p className="ajuda">Nenhum passo ainda.</p>}
      <ul className="space-y-1">
        {rascunho.map((r) => (
          <li key={r.chave} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1">
            <span className="texto-aux w-32 shrink-0 truncate">
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
/** Trilha do checklist (quem fez cada passo e quando); carrega ao abrir a aba Histórico */
export const TrilhaAuditoria: React.FC<{ chamadoId: string; nomeDe: (id?: string) => string | undefined; atualizar?: number }> = ({
  chamadoId,
  nomeDe,
  atualizar = 0,
}) => {
  const [eventos, setEventos] = useState<ProcessoEvento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchEventosProcessoDb(chamadoId)
      .then((e) => vivo && setEventos(e))
      .catch((err) => vivo && setErro(mensagemDeErro(err)));
    return () => {
      vivo = false;
    };
  }, [chamadoId, atualizar]);

  if (erro) return <p className="erro">{erro}</p>;
  if (!eventos) return <p className="texto-aux">Carregando…</p>;
  return (
    <div className="space-y-1">
      <p className="secao-titulo flex items-center gap-1.5">
        <History className="ico-sm" aria-hidden="true" /> Passos do checklist
      </p>
      {eventos.length === 0 ? (
        <p className="texto-aux">
          {isSupabaseConfigured ? 'Nenhum passo registrado ainda.' : 'Na demonstração a trilha dos passos fica no banco; aqui aparecem só os registros do checklist acima.'}
        </p>
      ) : (
        <ul className="texto-aux max-h-72 space-y-1 overflow-y-auto">
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
