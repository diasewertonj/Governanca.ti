/**
 * Fase 11 · Inventário físico (conferência por local, com QR da etiqueta).
 * Abrir: lista os equipamentos sem baixa do local escolhido. Conferir: encontrado
 * (botão ou leitura do QR), não encontrado ou em outro local. Fechar: pendentes viram
 * "não encontrado", geram lembretes (investigar/baixa; atualizar local) e a conferência
 * fica no histórico. Só a T.I.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, ClipboardCheck, MapPin, Plus, QrCode, RotateCcw, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { InventarioFisico, ItemInventario, SituacaoConferencia } from '../../types/index.ts';
import { formatDate } from '../../utils/formatters.ts';
import { normalizar } from '../../utils/processos.ts';
import { CabecalhoTela, Busca, Vazio } from '../ui/Tela.tsx';
import { Janela } from '../ui/Janela.tsx';
import { pedirTexto } from '../ui/dialogo.tsx';
import { baixarCsv, paraCsv } from '../../utils/financeiro.ts';
import { ativoDoCodigo } from '../../utils/patrimonio.ts';

const ROTULO_SITUACAO: Record<SituacaoConferencia, string> = {
  pendente: 'Pendente',
  encontrado: 'Encontrado',
  nao_encontrado: 'Não encontrado',
  outro_local: 'Em outro local',
};
const SELO_SITUACAO: Record<SituacaoConferencia, string> = {
  pendente: 'selo-neutro',
  encontrado: 'selo-ok',
  nao_encontrado: 'selo-problema',
  outro_local: 'selo-atencao',
};
const ROTULO_STATUS: Record<InventarioFisico['status'], string> = { aberto: 'Em andamento', fechado: 'Fechada', cancelado: 'Cancelada' };

export const ConferenciaView: React.FC = () => {
  const { assets, employees } = useApp();
  const { inventarios } = useCompras();
  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const nome = (id?: string) => employees.find((e) => e.id === id)?.nome || '—';

  const exportar = (inv: InventarioFisico) =>
    baixarCsv(
      `conferencia-${inv.criadoEm.slice(0, 10)}.csv`,
      paraCsv(
        ['Patrimônio', 'Equipamento', 'Local esperado', 'Situação', 'Encontrado em', 'Pelo QR', 'Conferido por', 'Conferido em'],
        inv.itens.map((i) => {
          const a = assets.find((x) => x.id === i.ativoId);
          return [a?.tag || '', a?.nome || '', i.localEsperado || '', ROTULO_SITUACAO[i.situacao], i.localEncontrado || '', i.viaQr ? 'sim' : 'não', nome(i.conferidoPor), i.conferidoEm?.slice(0, 16).replace('T', ' ') || ''];
        })
      )
    );

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo="Inventário físico"
        subtitulo="Conferência por local: marque o que foi encontrado (inclusive lendo o QR da etiqueta). Ao fechar, o que faltou vira pendência e a conferência fica no histórico."
        acoes={
          <button type="button" onClick={() => setNova(true)} className="btn btn-primario">
            <Plus /> Nova conferência
          </button>
        }
      />
      {inventarios.length === 0 ? (
        <Vazio acao={<button type="button" onClick={() => setNova(true)} className="btn btn-sm btn-primario"><Plus /> Nova conferência</button>}>Nenhuma conferência ainda.</Vazio>
      ) : (
        <div className="cartao overflow-hidden">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Conferência</th>
                <th>Situação</th>
                <th>Progresso</th>
                <th className="text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {inventarios.map((inv) => {
                const conferidos = inv.itens.filter((i) => i.situacao !== 'pendente').length;
                return (
                  <tr key={inv.id}>
                    <td data-label="Conferência">
                      <span className="font-medium text-slate-900">{inv.titulo}</span>
                      <span className="block text-slate-500">
                        {inv.local || 'Todos os locais'} · aberta em {formatDate(inv.criadoEm.slice(0, 10))} por {nome(inv.criadoPor)}
                      </span>
                    </td>
                    <td data-label="Situação">
                      <span className={`selo ${inv.status === 'aberto' ? 'selo-info' : inv.status === 'fechado' ? 'selo-ok' : 'selo-neutro'}`}>{ROTULO_STATUS[inv.status]}</span>
                      {inv.resumo && inv.resumo.nao_encontrados > 0 && <span className="block text-red-700">{inv.resumo.nao_encontrados} não encontrado(s)</span>}
                    </td>
                    <td data-label="Progresso">
                      {conferidos} de {inv.itens.length}
                    </td>
                    <td data-label="Ação" className="text-right">
                      <span className="acoes-linha">
                        <button type="button" onClick={() => exportar(inv)} className="btn btn-sm btn-secundario">
                          CSV
                        </button>
                        <button type="button" onClick={() => setAberta(inv.id)} className="btn btn-sm btn-secundario">
                          {inv.status === 'aberto' ? 'Conferir' : 'Ver'}
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {nova && <NovaConferencia onClose={() => setNova(false)} onCriada={(id) => setAberta(id)} />}
      {aberta && <TelaConferencia inventarioId={aberta} onClose={() => setAberta(null)} />}
    </div>
  );
};

const NovaConferencia: React.FC<{ onClose: () => void; onCriada: (id: string) => void }> = ({ onClose, onCriada }) => {
  const { assets } = useApp();
  const { unidades } = useRecursos();
  const { abrirInventario } = useCompras();
  const locais = useMemo(() => {
    const m = new Map<string, number>();
    assets.filter((a) => a.status !== 'descartado').forEach((a) => m.set(a.localizacaoFisica.trim(), (m.get(a.localizacaoFisica.trim()) || 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [assets]);
  const [local, setLocal] = useState('');
  const [titulo, setTitulo] = useState(`Conferência de ${new Date().toLocaleDateString('pt-BR')}`);
  const [unidadeId, setUnidadeId] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const qtd = local ? locais.find((l) => l[0] === local)?.[1] || 0 : locais.reduce((s, l) => s + l[1], 0);
  const abrir = async () => {
    setSalvando(true);
    const r = await abrirInventario(titulo, local, unidadeId || undefined);
    setSalvando(false);
    if (r.erro) return setErro(r.erro);
    onClose();
    if (r.id) onCriada(r.id);
  };
  return (
    <Janela
      titulo="Nova conferência"
      tamanho="p"
      onFechar={onClose}
      rodape={
        <>
          <button type="button" onClick={onClose} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="button" disabled={salvando || qtd === 0} onClick={abrir} className="btn btn-primario">
            {salvando ? 'Abrindo…' : `Abrir com ${qtd} equipamento(s)`}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="conf-titulo" className="rotulo">Nome</label>
          <input id="conf-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="campo" />
        </div>
        <div>
          <label htmlFor="conf-local" className="rotulo">Local a conferir</label>
          <select id="conf-local" value={local} onChange={(e) => setLocal(e.target.value)} className="campo">
            <option value="">Todos os locais</option>
            {locais.map(([l, n]) => (
              <option key={l} value={l}>
                {l} ({n})
              </option>
            ))}
          </select>
          <p className="ajuda">A lista sai da localização cadastrada em cada equipamento (sem os baixados).</p>
        </div>
        {unidades.length > 0 && (
          <div>
            <label htmlFor="conf-unidade" className="rotulo">Unidade (opcional)</label>
            <select id="conf-unidade" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} className="campo">
              <option value="">—</option>
              {unidades.filter((u) => u.ativo).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
      </div>
    </Janela>
  );
};

const TelaConferencia: React.FC<{ inventarioId: string; onClose: () => void }> = ({ inventarioId, onClose }) => {
  const { assets, employees, abrirFicha } = useApp();
  const { inventarios, conferirItem, incluirItemInventario, fecharInventario, cancelarInventario } = useCompras();
  const inv = inventarios.find((i) => i.id === inventarioId);
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [filtro, setFiltro] = useState<SituacaoConferencia | ''>('');
  const [busca, setBusca] = useState('');
  const [camera, setCamera] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  if (!inv) return null;
  const aberto = inv.status === 'aberto';
  const ativo = (id: string) => assets.find((a) => a.id === id);
  const conferidos = inv.itens.filter((i) => i.situacao !== 'pendente').length;
  const contagem = (s: SituacaoConferencia) => inv.itens.filter((i) => i.situacao === s).length;
  const termo = normalizar(busca.trim());
  const lista = inv.itens
    .filter((i) => !filtro || i.situacao === filtro)
    .filter((i) => {
      if (!termo) return true;
      const a = ativo(i.ativoId);
      return normalizar(`${a?.tag || ''} ${a?.nome || ''} ${a?.serialNumber || ''}`).includes(termo);
    })
    .sort((a, b) => (a.situacao === 'pendente' ? 0 : 1) - (b.situacao === 'pendente' ? 0 : 1) || (ativo(a.ativoId)?.tag || '').localeCompare(ativo(b.ativoId)?.tag || ''));

  const marcar = async (item: ItemInventario, situacao: SituacaoConferencia, extra: Partial<ItemInventario> = {}) => {
    setOcupado(true);
    const r = await conferirItem(inv.id, { ...item, situacao, ...extra });
    setOcupado(false);
    if (r) setAviso({ ok: false, texto: r });
  };
  const outroLocal = async (item: ItemInventario) => {
    const local = await pedirTexto({ titulo: `Onde ${ativo(item.ativoId)?.tag} foi encontrado?`, rotulo: 'Local onde está', minimo: 2, inicial: item.localEncontrado, confirmar: 'Registrar' });
    if (local !== null) await marcar(item, 'outro_local', { localEncontrado: local.trim() });
  };

  // Leitura do QR (câmera ou leitor USB, que "digita" o link e Enter) ou do patrimônio digitado
  const ler = async (texto: string) => {
    const a = ativoDoCodigo(texto, assets);
    setCodigo('');
    if (!a) return setAviso({ ok: false, texto: `Nenhum equipamento com o código "${texto.trim()}".` });
    const item = inv.itens.find((i) => i.ativoId === a.id);
    if (item) {
      if (item.situacao === 'encontrado') return setAviso({ ok: true, texto: `${a.tag} já estava marcado como encontrado.` });
      await marcar(item, 'encontrado', { viaQr: true, localEncontrado: undefined });
      return setAviso({ ok: true, texto: `${a.tag} encontrado.` });
    }
    // Não estava na lista: está aqui, mas cadastrado em outro local
    const completo = assets.find((x) => x.id === a.id);
    if (completo?.status === 'descartado') return setAviso({ ok: false, texto: `${a.tag} está baixado. Confira com o administrador.` });
    const aqui = inv.local || (await pedirTexto({ titulo: `${a.tag} não estava na lista`, mensagem: `Cadastrado em "${completo?.localizacaoFisica}". Onde ele está agora?`, rotulo: 'Local', minimo: 2, confirmar: 'Registrar' }));
    if (!aqui) return;
    setOcupado(true);
    const r = await incluirItemInventario(inv.id, { ativoId: a.id, localEsperado: completo?.localizacaoFisica, situacao: 'outro_local', localEncontrado: aqui, viaQr: true });
    setOcupado(false);
    setAviso(r ? { ok: false, texto: r } : { ok: true, texto: `${a.tag} incluído: estava cadastrado em "${completo?.localizacaoFisica}" (em outro local).` });
  };

  const cancelar = async () => {
    const motivo = await pedirTexto({ titulo: 'Cancelar esta conferência?', mensagem: 'Ela fica no histórico como cancelada, sem gerar pendências. Não dá para desfazer.', rotulo: 'Motivo', minimo: 5, confirmar: 'Cancelar conferência', cancelar: 'Voltar', perigo: true });
    if (motivo === null) return;
    const r = await cancelarInventario(inv.id, motivo);
    if (r) setAviso({ ok: false, texto: r });
  };

  return (
    <>
      <Janela
        titulo={inv.titulo}
        subtitulo={`${inv.local || 'Todos os locais'} · ${ROTULO_STATUS[inv.status]} · ${conferidos} de ${inv.itens.length} conferido(s)`}
        icone={<ClipboardCheck className="h-4 w-4" />}
        tamanho="g"
        onFechar={onClose}
        acoes={
          aberto ? (
            <button type="button" onClick={cancelar} className="btn btn-sm btn-secundario">
              Cancelar conferência
            </button>
          ) : undefined
        }
        rodape={
          aberto ? (
            <button type="button" onClick={() => setFechando(true)} className="btn btn-primario">
              <CheckCircle2 /> Fechar conferência
            </button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {!aberto && inv.resumo && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              Fechada em {inv.fechadoEm ? formatDate(inv.fechadoEm.slice(0, 10)) : '—'}: {inv.resumo.encontrados} encontrado(s), {inv.resumo.nao_encontrados} não encontrado(s) e {inv.resumo.outro_local} em outro local
              {inv.resumo.via_qr ? ` (${inv.resumo.via_qr} pelo QR)` : ''}. {inv.resumo.nao_encontrados || inv.resumo.outro_local ? 'As pendências estão em Lembretes.' : ''}
              {inv.resumo.locais_atualizados ? ' Os locais foram atualizados nos cadastros.' : ''}
            </div>
          )}
          {inv.status === 'cancelado' && <p className="text-xs text-slate-600">Cancelada{inv.observacoes ? `: ${inv.observacoes}` : ''}.</p>}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['pendente', 'encontrado', 'nao_encontrado', 'outro_local'] as SituacaoConferencia[]).map((s) => (
              <button key={s} type="button" onClick={() => setFiltro(filtro === s ? '' : s)} aria-pressed={filtro === s} className={`cartao p-2.5 text-left ${filtro === s ? 'ring-2 ring-blue-500' : ''}`}>
                <span className="block text-xs text-slate-500">{ROTULO_SITUACAO[s]}</span>
                <span className="font-mono text-lg font-semibold text-slate-900">{contagem(s)}</span>
              </button>
            ))}
          </div>

          {aberto && (
            <section className="cartao space-y-2 p-3">
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (codigo.trim()) void ler(codigo);
                }}
              >
                <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                  <label htmlFor="conf-codigo" className="rotulo">
                    <QrCode className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                    Ler QR da etiqueta ou digitar o patrimônio
                  </label>
                  <input id="conf-codigo" autoComplete="off" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Aponte o leitor ou digite #PAT-0001" className="campo" />
                </div>
                <button type="submit" disabled={ocupado || !codigo.trim()} className="btn btn-secundario">
                  Marcar encontrado
                </button>
                <button type="button" onClick={() => setCamera(true)} className="btn btn-secundario">
                  <Camera /> Usar câmera
                </button>
              </form>
              {aviso && (
                <p role="status" className={`text-xs ${aviso.ok ? 'text-emerald-800' : 'text-red-700'}`}>
                  {aviso.texto}
                </p>
              )}
            </section>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Busca id="conf-busca" valor={busca} onMudar={setBusca} placeholder="Buscar patrimônio, nome ou série" />
            {filtro && (
              <button type="button" onClick={() => setFiltro('')} className="btn btn-sm btn-secundario">
                Mostrar todos
              </button>
            )}
          </div>

          {lista.length === 0 ? (
            <Vazio>Nada nesta lista.</Vazio>
          ) : (
            <div className="cartao overflow-hidden">
              <table className="tabela tabela-cartoes">
                <thead>
                  <tr>
                    <th>Equipamento</th>
                    <th>Local cadastrado</th>
                    <th>Situação</th>
                    {aberto && <th className="text-right">Conferir</th>}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((i) => {
                    const a = ativo(i.ativoId);
                    return (
                      <tr key={i.id}>
                        <td data-label="Equipamento">
                          <button type="button" className="link text-left" onClick={() => abrirFicha({ tipo: 'ativo', id: i.ativoId })}>
                            <span className="font-mono">{a?.tag || '—'}</span> · {a?.nome || 'Equipamento'}
                          </button>
                          {a?.custodianteId && <span className="block text-slate-500">com {employees.find((e) => e.id === a.custodianteId)?.nome}</span>}
                        </td>
                        <td data-label="Local cadastrado">{i.localEsperado || '—'}</td>
                        <td data-label="Situação">
                          <span className={`selo ${SELO_SITUACAO[i.situacao]}`}>{ROTULO_SITUACAO[i.situacao]}</span>
                          {i.viaQr && <span className="selo selo-neutro ml-1">QR</span>}
                          {i.situacao === 'outro_local' && i.localEncontrado && <span className="block text-slate-600">em {i.localEncontrado}</span>}
                        </td>
                        {aberto && (
                          <td data-label="Conferir" className="text-right">
                            <span className="acoes-linha">
                              {i.situacao !== 'encontrado' && (
                                <button type="button" disabled={ocupado} onClick={() => marcar(i, 'encontrado', { viaQr: false, localEncontrado: undefined })} className="btn btn-sm btn-secundario">
                                  <CheckCircle2 /> Encontrado
                                </button>
                              )}
                              {i.situacao !== 'nao_encontrado' && (
                                <button type="button" disabled={ocupado} onClick={() => marcar(i, 'nao_encontrado', { localEncontrado: undefined })} aria-label={`Não encontrado: ${a?.tag}`} title="Não encontrado" className="btn-icone">
                                  <XCircle />
                                </button>
                              )}
                              <button type="button" disabled={ocupado} onClick={() => outroLocal(i)} aria-label={`Em outro local: ${a?.tag}`} title="Em outro local" className="btn-icone">
                                <MapPin />
                              </button>
                              {i.situacao !== 'pendente' && (
                                <button type="button" disabled={ocupado} onClick={() => marcar(i, 'pendente', { viaQr: false, localEncontrado: undefined })} aria-label={`Desfazer: ${a?.tag}`} title="Voltar para pendente" className="btn-icone">
                                  <RotateCcw />
                                </button>
                              )}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Janela>
      {camera && (
        <LeitorQr
          onClose={() => setCamera(false)}
          onLer={(t) => {
            setCamera(false);
            void ler(t);
          }}
        />
      )}
      {fechando && <FecharConferencia inventario={inv} onClose={() => setFechando(false)} onFechar={fecharInventario} />}
    </>
  );
};

const FecharConferencia: React.FC<{
  inventario: InventarioFisico;
  onClose: () => void;
  onFechar: (id: string, atualizar: boolean) => Promise<{ erro?: string }>;
}> = ({ inventario: inv, onClose, onFechar }) => {
  const [atualizar, setAtualizar] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const pendentes = inv.itens.filter((i) => i.situacao === 'pendente').length;
  const naoEnc = inv.itens.filter((i) => i.situacao === 'nao_encontrado').length + pendentes;
  const outro = inv.itens.filter((i) => i.situacao === 'outro_local').length;
  const fechar = async () => {
    setSalvando(true);
    const r = await onFechar(inv.id, atualizar);
    setSalvando(false);
    if (r.erro) setErro(r.erro);
    else onClose();
  };
  return (
    <Janela
      titulo="Fechar conferência"
      subtitulo={inv.titulo}
      tamanho="p"
      onFechar={onClose}
      rodape={
        <>
          <button type="button" onClick={onClose} className="btn btn-secundario">
            Voltar
          </button>
          <button type="button" disabled={salvando} onClick={fechar} className="btn btn-primario">
            {salvando ? 'Fechando…' : 'Fechar conferência'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-xs text-slate-700">
        <ul className="list-disc space-y-1 pl-4">
          {pendentes > 0 && <li>{pendentes} item(ns) ainda pendente(s) vira(m) "não encontrado".</li>}
          <li>{naoEnc} não encontrado(s): cada um gera um lembrete para investigar e, se for o caso, dar baixa.</li>
          <li>{outro} em outro local.</li>
          <li>Depois de fechada, a conferência não muda mais e fica no histórico.</li>
        </ul>
        {outro > 0 && (
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={atualizar} onChange={(e) => setAtualizar(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>Atualizar o local no cadastro dos {outro} equipamento(s) achado(s) em outro lugar (sem isso, vira lembrete para conferir).</span>
          </label>
        )}
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
      </div>
    </Janela>
  );
};

type Detector = { detect: (fonte: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opcoes: { formats: string[] }) => Detector;

/** Câmera do celular/notebook lendo o QR (BarcodeDetector do navegador; sem ele, usar leitor USB ou digitar) */
const LeitorQr: React.FC<{ onClose: () => void; onLer: (texto: string) => void }> = ({ onClose, onLer }) => {
  const video = useRef<HTMLVideoElement>(null);
  // A janela de cima recria onLer a cada render: guarda a última sem reiniciar a câmera
  const lerRef = useRef(onLer);
  useEffect(() => {
    lerRef.current = onLer;
  });
  const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  const [erro, setErro] = useState(Ctor ? '' : 'Este navegador não lê QR pela câmera. Use o Chrome no celular, um leitor USB ou digite o patrimônio.');

  useEffect(() => {
    if (!Ctor) return;
    let fluxo: MediaStream | null = null;
    let parar = false;
    let timer: number | undefined;
    const detector = new Ctor({ formats: ['qr_code'] });
    (async () => {
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current || parar) return;
        video.current.srcObject = fluxo;
        await video.current.play();
        const tentar = async () => {
          if (parar || !video.current) return;
          try {
            const achados = await detector.detect(video.current);
            if (achados[0]?.rawValue) return lerRef.current(achados[0].rawValue);
          } catch {
            /* quadro ainda sem imagem: tenta de novo */
          }
          timer = window.setTimeout(tentar, 350);
        };
        void tentar();
      } catch {
        setErro('Não foi possível usar a câmera (permissão negada ou sem câmera). Use um leitor USB ou digite o patrimônio.');
      }
    })();
    return () => {
      parar = true;
      if (timer) window.clearTimeout(timer);
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, [Ctor]);

  return (
    <Janela titulo="Ler QR da etiqueta" tamanho="p" onFechar={onClose} rodape={<button type="button" onClick={onClose} className="btn btn-secundario">Fechar</button>}>
      {erro ? (
        <p role="alert" className="erro">
          {erro}
        </p>
      ) : (
        <div className="space-y-2">
          <video ref={video} muted playsInline className="aspect-square w-full rounded-lg bg-slate-900 object-cover" aria-label="Imagem da câmera" />
          <p className="ajuda">Aponte para o QR da etiqueta do equipamento.</p>
        </div>
      )}
    </Janela>
  );
};
