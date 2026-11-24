/**
 * Seção 17 · Recebimentos (decisão 3): o dinheiro que entra para a T.I. — venda de
 * equipamento baixado, ressarcimento de colaborador, reembolso ou crédito de
 * fornecedor e devolução de compra. Previsto → recebido (ou cancelado). Sem boleto.
 * T.I. registra; T.I. e Compras confirmam o recebimento.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, HandCoins, Plus, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Recebimento, StatusRecebimento, TipoRecebimento } from '../../types/index.ts';
import type { FichaAberta } from '../../utils/fichas.ts';
import { listarRecebimentos, salvarRecebimento } from '../../services/financeiroDb.ts';
import { formatDate, isoLocal } from '../../utils/formatters.ts';
import { baixarCsv, brl, paraCsv } from '../../utils/financeiro.ts';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { CampoMoeda } from '../ui/Campos.tsx';
import { confirmar } from '../ui/dialogo.tsx';
import { Janela } from '../ui/Janela.tsx';
import { CabecalhoTela, Vazio } from '../ui/Tela.tsx';

export const ROTULO_TIPO_RECEBIMENTO: Record<TipoRecebimento, string> = {
  venda_ativo: 'Venda de equipamento baixado',
  ressarcimento: 'Ressarcimento de colaborador',
  reembolso_fornecedor: 'Reembolso ou crédito de fornecedor',
  devolucao_compra: 'Devolução de compra',
  outro: 'Outro',
};
const ROTULO_STATUS: Record<StatusRecebimento, string> = { previsto: 'Previsto', recebido: 'Recebido', cancelado: 'Cancelado' };
const SELO: Record<StatusRecebimento, string> = { previsto: 'selo-atencao', recebido: 'selo-ok', cancelado: 'selo-neutro' };

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Lê os recebimentos do banco (na demonstração, ficam só na memória) */
export function useRecebimentos() {
  const [lista, setLista] = useState<Recebimento[]>([]);
  useEffect(() => {
    let vivo = true;
    listarRecebimentos().then((r) => {
      if (vivo && r) setLista(r);
    });
    return () => {
      vivo = false;
    };
  }, []);
  const salvar = async (r: Partial<Recebimento> & Pick<Recebimento, 'tipo' | 'descricao' | 'valor'>): Promise<string | null> => {
    try {
      const gravado = await salvarRecebimento(r);
      const final: Recebimento = gravado || {
        status: 'previsto',
        criadoEm: new Date().toISOString(),
        ...lista.find((x) => x.id === r.id),
        ...r,
        id: r.id || `rec-${crypto.randomUUID()}`,
      };
      setLista((l) => [final, ...l.filter((x) => x.id !== final.id)]);
      return null;
    } catch (e) {
      return mensagem(e);
    }
  };
  return { lista, salvar };
}

export const RecebimentosView: React.FC = () => {
  const { currentRole, fornecedores, employees, assets, departments, abrirFicha } = useApp();
  const { lista, salvar } = useRecebimentos();
  const [status, setStatus] = useState<'' | StatusRecebimento>('previsto');
  const [tipo, setTipo] = useState<'' | TipoRecebimento>('');
  const [novo, setNovo] = useState(false);
  const [recebendo, setRecebendo] = useState<Recebimento | null>(null);
  const [erro, setErro] = useState('');
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';

  const filtrada = useMemo(() => lista.filter((r) => (!status || r.status === status) && (!tipo || r.tipo === tipo)), [lista, status, tipo]);
  const previsto = lista.filter((r) => r.status === 'previsto').reduce((s, r) => s + r.valor, 0);
  const ano = String(new Date().getFullYear());
  const recebidoAno = lista.filter((r) => r.status === 'recebido' && r.recebidoEm?.startsWith(ano)).reduce((s, r) => s + (r.valorRecebido ?? r.valor), 0);

  const ligadoA = (r: Recebimento) =>
    [
      r.ativoId && assets.find((a) => a.id === r.ativoId)?.tag,
      r.colaboradorId && employees.find((e) => e.id === r.colaboradorId)?.nome,
      r.fornecedorId && fornecedores.find((f) => f.id === r.fornecedorId)?.nome,
    ]
      .filter(Boolean)
      .join(' · ');
  // Seção 21: o que está ligado ao recebimento abre a ficha (equipamento, pessoa, fornecedor)
  const linksDe = (r: Recebimento): { ficha: FichaAberta; texto: string }[] => {
    const out: { ficha: FichaAberta; texto: string }[] = [];
    const a = r.ativoId ? assets.find((x) => x.id === r.ativoId) : undefined;
    if (a) out.push({ ficha: { tipo: 'ativo', id: a.id }, texto: a.tag });
    const p = r.colaboradorId ? employees.find((x) => x.id === r.colaboradorId) : undefined;
    if (p) out.push({ ficha: { tipo: 'colaborador', id: p.id }, texto: p.nome });
    const f = r.fornecedorId ? fornecedores.find((x) => x.id === r.fornecedorId) : undefined;
    if (f) out.push({ ficha: { tipo: 'fornecedor', id: f.id }, texto: f.nome });
    return out;
  };
  const temFiltro = !!(status || tipo);

  const cancelar = async (r: Recebimento) => {
    const ok = await confirmar({
      titulo: 'Cancelar este recebimento?',
      mensagem: `${r.descricao} (${brl(r.valor)}) sai do previsto e fica no histórico como cancelado.`,
      confirmar: 'Cancelar recebimento',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (ok) setErro((await salvar({ ...r, status: 'cancelado' })) || '');
  };

  const exportar = () =>
    baixarCsv(
      'recebimentos.csv',
      paraCsv(
        ['Tipo', 'Descrição', 'Ligado a', 'Valor previsto', 'Previsto para', 'Situação', 'Recebido em', 'Valor recebido'],
        filtrada.map((r) => [ROTULO_TIPO_RECEBIMENTO[r.tipo], r.descricao, ligadoA(r), r.valor, r.previstoPara, ROTULO_STATUS[r.status], r.recebidoEm, r.valorRecebido])
      )
    );

  return (
    <div className="space-y-3">
      <CabecalhoTela
        titulo="Recebimentos"
        subtitulo="Dinheiro que entra: venda de equipamento baixado, ressarcimento, crédito de fornecedor e devolução de compra"
        acoes={
          <>
            <button type="button" onClick={exportar} className="btn btn-secundario">
              <Download /> Exportar CSV
            </button>
            {isTI && (
              <button type="button" onClick={() => setNovo(true)} className="btn btn-primario">
                <Plus /> Novo recebimento
              </button>
            )}
          </>
        }
        filtros={
          <>
            <select aria-label="Situação" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="campo campo-sm">
              <option value="">Todas as situações</option>
              {Object.entries(ROTULO_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="campo campo-sm">
              <option value="">Todos os tipos</option>
              {Object.entries(ROTULO_TIPO_RECEBIMENTO).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <span className="ml-auto texto-aux">
              A receber: <span className="num font-semibold text-slate-900">{brl(previsto)}</span> · Recebido em {ano}:{' '}
              <span className="num font-semibold text-slate-900">{brl(recebidoAno)}</span>
            </span>
          </>
        }
      />
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {lista.length === 0 ? (
        <Vazio
          titulo="Nenhum recebimento registrado"
          acao={
            isTI ? (
              <button type="button" onClick={() => setNovo(true)} className="btn btn-sm btn-primario">
                <Plus /> Novo recebimento
              </button>
            ) : undefined
          }
        >
          Venda de equipamento baixado, ressarcimento, crédito de fornecedor ou devolução de compra aparecem aqui.
        </Vazio>
      ) : filtrada.length === 0 ? (
        <Vazio
          titulo="Nenhum recebimento"
          acao={
            temFiltro ? (
              <button type="button" onClick={() => { setStatus(''); setTipo(''); }} className="btn btn-sm btn-secundario">
                Limpar filtros
              </button>
            ) : undefined
          }
        >
          {status === 'previsto' && !tipo ? 'Nada a receber agora.' : 'Nenhum recebimento com estes filtros.'}
        </Vazio>
      ) : (
        <div className="cartao-tabela">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>O quê</th>
                <th>Ligado a</th>
                <th className="num">Valor</th>
                <th>Previsto para</th>
                <th>Situação</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map((r) => (
                <tr key={r.id} className={r.status === 'cancelado' ? 'opacity-60' : ''}>
                  <td data-label="O quê">
                    <span className="font-semibold text-slate-900">{r.descricao}</span>
                    <span className="block text-slate-500">{ROTULO_TIPO_RECEBIMENTO[r.tipo]}</span>
                  </td>
                  <td data-label="Ligado a">
                    {linksDe(r).length === 0
                      ? '—'
                      : linksDe(r).map((l, i) => (
                          <React.Fragment key={l.ficha.tipo}>
                            {i > 0 && ' · '}
                            <button type="button" onClick={() => abrirFicha(l.ficha)} className="link">{l.texto}</button>
                          </React.Fragment>
                        ))}
                  </td>
                  <td data-label="Valor" className="num">
                    {brl(r.valor)}
                    {r.valorRecebido != null && r.valorRecebido !== r.valor && <span className="block text-slate-500">recebido {brl(r.valorRecebido)}</span>}
                  </td>
                  <td data-label="Previsto para">{r.previstoPara ? formatDate(r.previstoPara) : '—'}</td>
                  <td data-label="Situação">
                    <span className={`selo ${SELO[r.status]}`}>{ROTULO_STATUS[r.status]}</span>
                    {r.recebidoEm && <span className="block text-slate-500">em {formatDate(r.recebidoEm)}</span>}
                  </td>
                  <td data-label="Ações" className="col-acoes">
                    {r.status === 'previsto' && (
                      <span className="acoes-linha">
                        <button type="button" onClick={() => setRecebendo(r)} className="btn btn-sm btn-secundario mr-1">
                          <CheckCircle2 aria-hidden="true" /> Recebido
                        </button>
                        <button type="button" onClick={() => cancelar(r)} title="Cancelar recebimento" aria-label={`Cancelar o recebimento ${r.descricao}`} className="btn-icone">
                          <XCircle aria-hidden="true" />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {novo && <FormRecebimento departamentos={departments} onFechar={() => setNovo(false)} onSalvar={salvar} />}
      {recebendo && <JanelaRecebido recebimento={recebendo} onFechar={() => setRecebendo(null)} onSalvar={salvar} />}
    </div>
  );
};

type Salvar = ReturnType<typeof useRecebimentos>['salvar'];

const FormRecebimento: React.FC<{ departamentos: { id: string; nome: string }[]; onFechar: () => void; onSalvar: Salvar }> = ({ departamentos, onFechar, onSalvar }) => {
  const { fornecedores, employees, assets } = useApp();
  const [tipo, setTipo] = useState<TipoRecebimento>('venda_ativo');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<number | undefined>();
  const [previstoPara, setPrevistoPara] = useState('');
  const [ativoId, setAtivoId] = useState('');
  const [buscaAtivo, setBuscaAtivo] = useState('');
  // Seção 21 (escala): filtro de texto; baixados primeiro (é a venda de equipamento baixado); o escolhido nunca some da lista
  const ativosFiltrados = useMemo(() => {
    const t = buscaAtivo.trim().toLowerCase();
    return assets
      .filter((a) => a.id === ativoId || !t || `${a.tag} ${a.nome}`.toLowerCase().includes(t))
      .sort((a, b) => Number(b.status === 'descartado') - Number(a.status === 'descartado') || a.tag.localeCompare(b.tag));
  }, [assets, buscaAtivo, ativoId]);
  const [colaboradorId, setColaboradorId] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [departamentoId, setDepartamentoId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const id = 'form-recebimento';

  const gravar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (descricao.trim().length < 3) return setErro('Descreva o recebimento.');
    if (!valor || valor <= 0) return setErro('Informe o valor.');
    setSalvando(true);
    const falha = await onSalvar({
      tipo,
      descricao: descricao.trim(),
      valor,
      previstoPara: previstoPara || undefined,
      // Só a venda de equipamento liga o recebimento a um equipamento
      // Venda do equipamento baixado ou ressarcimento por equipamento danificado/perdido
      ativoId: tipo === 'venda_ativo' || tipo === 'ressarcimento' ? ativoId || undefined : undefined,
      colaboradorId: tipo === 'ressarcimento' ? colaboradorId || undefined : undefined,
      fornecedorId: tipo === 'reembolso_fornecedor' || tipo === 'devolucao_compra' || tipo === 'outro' ? fornecedorId || undefined : undefined,
      departamentoId: departamentoId || undefined,
      observacoes: observacoes.trim() || undefined,
    });
    setSalvando(false);
    if (falha) return setErro(`Não foi possível salvar: ${falha}`);
    onFechar();
  };

  return (
    <Janela
      tamanho="p"
      titulo="Novo recebimento"
      icone={<HandCoins className="ico" />}
      onFechar={onFechar}
      rodape={
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onFechar} className="btn btn-secundario">Cancelar</button>
          <button type="submit" form={id} disabled={salvando} className="btn btn-primario">{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      }
    >
      <form id={id} onSubmit={gravar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-tipo`} className={CLASSE_ROTULO}>Tipo *</label>
          <select id={`${id}-tipo`} value={tipo} onChange={(e) => setTipo(e.target.value as TipoRecebimento)} className={CLASSE_CAMPO}>
            {Object.entries(ROTULO_TIPO_RECEBIMENTO).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-desc`} className={CLASSE_ROTULO}>Descrição *</label>
          <input id={`${id}-desc`} value={descricao} onChange={(e) => setDescricao(e.target.value)} className={CLASSE_CAMPO} placeholder="Ex.: venda do notebook NB-0123 baixado" />
        </div>
        <div>
          <label htmlFor={`${id}-valor`} className={CLASSE_ROTULO}>Valor *</label>
          <CampoMoeda id={`${id}-valor`} valor={valor} onMudar={setValor} className={CLASSE_CAMPO} />
        </div>
        <div>
          <label htmlFor={`${id}-prev`} className={CLASSE_ROTULO}>Previsto para</label>
          <input id={`${id}-prev`} type="date" value={previstoPara} onChange={(e) => setPrevistoPara(e.target.value)} className={CLASSE_CAMPO} />
        </div>
        {(tipo === 'venda_ativo' || tipo === 'ressarcimento') && (
          <div className="sm:col-span-2 space-y-1">
            <label htmlFor={`${id}-ativo`} className={CLASSE_ROTULO}>Equipamento vendido</label>
            <input
              type="search"
              aria-label="Filtrar equipamentos"
              value={buscaAtivo}
              onChange={(e) => setBuscaAtivo(e.target.value)}
              placeholder="Filtrar por patrimônio ou nome…"
              className={CLASSE_CAMPO}
            />
            <select id={`${id}-ativo`} value={ativoId} onChange={(e) => setAtivoId(e.target.value)} className={CLASSE_CAMPO}>
              <option value="">{ativosFiltrados.length ? 'Escolha o equipamento…' : 'Nenhum equipamento com esse filtro'}</option>
              {ativosFiltrados.map((a) => (
                <option key={a.id} value={a.id}>{a.tag} · {a.nome}{a.status === 'descartado' ? ' (baixado)' : ''}</option>
              ))}
            </select>
          </div>
        )}
        {tipo === 'ressarcimento' && (
          <div>
            <label htmlFor={`${id}-colab`} className={CLASSE_ROTULO}>Colaborador</label>
            <select id={`${id}-colab`} value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} className={CLASSE_CAMPO}>
              <option value="">—</option>
              {employees.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
        )}
        {(tipo === 'reembolso_fornecedor' || tipo === 'devolucao_compra' || tipo === 'outro') && (
          <div>
            <label htmlFor={`${id}-forn`} className={CLASSE_ROTULO}>Fornecedor</label>
            <select id={`${id}-forn`} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className={CLASSE_CAMPO}>
              <option value="">—</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`${id}-dep`} className={CLASSE_ROTULO}>Área (departamento)</label>
          <select id={`${id}-dep`} value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)} className={CLASSE_CAMPO}>
            <option value="">—</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>{d.nome}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-obs`} className={CLASSE_ROTULO}>Observações</label>
          <textarea id={`${id}-obs`} rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className={CLASSE_CAMPO} />
        </div>
        {erro && <p className="erro sm:col-span-2" role="alert">{erro}</p>}
      </form>
    </Janela>
  );
};

const JanelaRecebido: React.FC<{ recebimento: Recebimento; onFechar: () => void; onSalvar: Salvar }> = ({ recebimento, onFechar, onSalvar }) => {
  const [data, setData] = useState(() => isoLocal(new Date()));
  const [valor, setValor] = useState<number | undefined>(recebimento.valor);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const id = 'form-recebido';
  const gravar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || data > isoLocal(new Date())) return setErro('Informe a data do recebimento (hoje ou antes).');
    if (valor === undefined || valor < 0) return setErro('Informe o valor recebido.');
    setSalvando(true);
    const falha = await onSalvar({ ...recebimento, status: 'recebido', recebidoEm: data, valorRecebido: valor });
    setSalvando(false);
    if (falha) return setErro(`Não foi possível salvar: ${falha}`);
    onFechar();
  };
  return (
    <Janela
      tamanho="p"
      titulo="Confirmar recebimento"
      subtitulo={`${recebimento.descricao} · previsto ${brl(recebimento.valor)}`}
      icone={<CheckCircle2 className="ico" />}
      onFechar={onFechar}
      rodape={
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onFechar} className="btn btn-secundario">Cancelar</button>
          <button type="submit" form={id} disabled={salvando} className="btn btn-primario">{salvando ? 'Salvando…' : 'Confirmar'}</button>
        </div>
      }
    >
      <form id={id} onSubmit={gravar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-data`} className={CLASSE_ROTULO}>Recebido em *</label>
          <input id={`${id}-data`} type="date" max={isoLocal(new Date())} value={data} onChange={(e) => setData(e.target.value)} className={CLASSE_CAMPO} />
        </div>
        <div>
          <label htmlFor={`${id}-valor`} className={CLASSE_ROTULO}>Valor recebido *</label>
          <CampoMoeda id={`${id}-valor`} valor={valor} onMudar={setValor} className={CLASSE_CAMPO} />
        </div>
        {erro && <p className="erro sm:col-span-2" role="alert">{erro}</p>}
      </form>
    </Janela>
  );
};
