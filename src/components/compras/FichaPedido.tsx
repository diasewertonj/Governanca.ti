/**
 * Fase 11 · Ficha do pedido de compra: itens, cotações, impacto no orçamento,
 * compra, recebimento e histórico. As ações seguem o fluxo
 * rascunho → aguardando → aprovado/recusado → comprado → recebido (ou cancelado).
 * Só o administrador aprova ou recusa. RH e gestor veem o pedido sem valores.
 */
import React, { useMemo, useState } from 'react';
import { Ban, Check, PackageCheck, Pencil, Send, ShoppingCart, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { FormaPagamento, PedidoCompra } from '../../types/index.ts';
import { ROTULO_CATEGORIA, ROTULO_FORMA_PAGAMENTO, brl } from '../../utils/financeiro.ts';
import {
  FLUXO_PEDIDO,
  ROTULO_STATUS_PEDIDO,
  ROTULO_TIPO_ITEM,
  SELO_STATUS_PEDIDO,
  impactoNoOrcamento,
  proximoPasso,
  valorDoPedido,
} from '../../utils/compras.ts';
import { proximasTags } from '../../utils/patrimonio.ts';
import { formatDate } from '../../utils/formatters.ts';
import { Dado, Janela } from '../ui/Janela.tsx';
import { CampoMoeda } from '../ui/Campos.tsx';
import { confirmar, pedirTexto } from '../ui/dialogo.tsx';
import { AbrirArquivo } from '../comum/AbrirArquivo.tsx';
import { FormPedido } from './FormPedido.tsx';

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dataHora = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export const FichaPedido: React.FC<{ pedidoId: string; onClose: () => void }> = ({ pedidoId, onClose }) => {
  const { currentRole, currentUser, employees, fornecedores, assets, tickets, faturas, abrirFicha, setSelectedTicketIdForDetail } = useApp();
  const { pedidos, linhasAnoAtual, mudarStatusPedido } = useCompras();
  const p = pedidos.find((x) => x.id === pedidoId);
  const [editando, setEditando] = useState(false);
  const [comprando, setComprando] = useState(false);
  const [recebendo, setRecebendo] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const isAdmin = currentRole === 'ti_admin';

  const ano = new Date().getFullYear();
  const impacto = useMemo(() => (p && isTI ? impactoNoOrcamento(p, linhasAnoAtual, pedidos, faturas, ano) : null), [p, isTI, linhasAnoAtual, pedidos, faturas, ano]);
  if (!p) return null;

  const nome = (id?: string) => employees.find((e) => e.id === id)?.nome || '—';
  const fornecedor = (id?: string) => fornecedores.find((f) => f.id === id)?.nome || '—';
  const admissao = tickets.find((t) => t.id === p.chamadoId);
  const ativosRecebidos = assets.filter((a) => a.pedidoId === p.id);
  const fatura = faturas.find((f) => f.id === p.faturaId || (f.pedidoId === p.id && f.status !== 'cancelada'));
  const souSolicitante = !!currentUser && p.solicitanteId === currentUser.id;
  const aberto = p.status === 'rascunho' || p.status === 'aguardando' || p.status === 'recusado';
  const podeEditar = isTI && aberto;
  const podeEnviar = (isTI || souSolicitante) && (p.status === 'rascunho' || p.status === 'recusado');
  const podeCancelar = isTI ? ['rascunho', 'aguardando', 'aprovado', 'recusado'].includes(p.status) : souSolicitante && (p.status === 'rascunho' || p.status === 'aguardando');
  const valor = p.semValores ? undefined : valorDoPedido(p);

  const agir = async (fn: () => Promise<string | null>) => {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    setErro(r || '');
  };

  const aprovar = async () => {
    const linhas = [
      `Valor: ${brl(valor || 0)}${p.cotacoes.find((c) => c.vencedora) ? ` · vencedora: ${fornecedor(p.cotacoes.find((c) => c.vencedora)?.fornecedorId)}` : ''}.`,
      impacto && !impacto.semOrcamento
        ? `Orçamento de ${ROTULO_CATEGORIA[p.categoria]}${p.area ? ` · ${p.area}` : ''} em ${ano}: depois deste pedido sobram ${brl(impacto.saldoDepois)} (${Math.round((impacto.pctDepois || 0) * 100)}% usado).`
        : `Não há orçamento para ${ROTULO_CATEGORIA[p.categoria]}${p.area ? ` · ${p.area}` : ''} em ${ano}.`,
      'A T.I. poderá registrar a compra. Dá para desfazer: cancele o pedido enquanto não for comprado.',
    ];
    if (!(await confirmar({ titulo: `Aprovar ${p.codigo}?`, mensagem: linhas.join('\n\n'), confirmar: 'Aprovar' }))) return;
    await agir(() => mudarStatusPedido(p.id, 'aprovar'));
  };
  const recusar = async () => {
    const motivo = await pedirTexto({ titulo: `Recusar ${p.codigo}?`, mensagem: 'Quem pediu vê o motivo. O pedido pode ser ajustado e reenviado.', rotulo: 'Motivo', minimo: 5, confirmar: 'Recusar', cancelar: 'Voltar', perigo: true });
    if (motivo !== null) await agir(() => mudarStatusPedido(p.id, 'recusar', motivo));
  };
  const cancelar = async () => {
    const motivo = await pedirTexto({ titulo: `Cancelar ${p.codigo}?`, mensagem: 'O pedido fica no histórico como cancelado. Não dá para desfazer: faça outro pedido se precisar.', rotulo: 'Motivo', minimo: 5, confirmar: 'Cancelar pedido', cancelar: 'Voltar', perigo: true });
    if (motivo !== null) await agir(() => mudarStatusPedido(p.id, 'cancelar', motivo));
  };
  const enviar = async () => {
    if (!(await confirmar({ titulo: `Enviar ${p.codigo} para aprovação?`, mensagem: 'O administrador recebe o pedido em Precisa de atenção.', confirmar: 'Enviar' }))) return;
    await agir(() => mudarStatusPedido(p.id, 'enviar'));
  };

  const passoAtual = FLUXO_PEDIDO.indexOf(p.status);

  return (
    <>
      <Janela
        titulo={`${p.codigo} · ${p.titulo}`}
        rotuloCaminho={p.codigo}
        subtitulo={`${ROTULO_STATUS_PEDIDO[p.status]}${proximoPasso(p) ? ` · próximo passo: ${proximoPasso(p)}` : ''}`}
        icone={<ShoppingCart className="h-4 w-4" />}
        tamanho="g"
        onFechar={onClose}
        acoes={
          <>
            {podeEditar && (
              <button type="button" onClick={() => setEditando(true)} className="btn btn-sm btn-secundario">
                <Pencil /> Editar
              </button>
            )}
            {podeCancelar && (
              <button type="button" disabled={ocupado} onClick={cancelar} className="btn btn-sm btn-secundario">
                <Ban /> Cancelar pedido
              </button>
            )}
          </>
        }
        rodape={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {p.status === 'aguardando' && !isAdmin && <span className="mr-auto text-xs text-slate-500">Aguardando o administrador aprovar.</span>}
            {podeEnviar && (
              <button type="button" disabled={ocupado} onClick={enviar} className="btn btn-primario">
                <Send /> {p.status === 'recusado' ? 'Reenviar para aprovação' : 'Enviar para aprovação'}
              </button>
            )}
            {p.status === 'aguardando' && isAdmin && (
              <>
                <button type="button" disabled={ocupado} onClick={recusar} className="btn btn-perigo">
                  <X /> Recusar
                </button>
                <button type="button" disabled={ocupado} onClick={aprovar} className="btn btn-primario">
                  <Check /> Aprovar
                </button>
              </>
            )}
            {p.status === 'aprovado' && isTI && (
              <button type="button" onClick={() => setComprando(true)} className="btn btn-primario">
                <ShoppingCart /> Registrar compra
              </button>
            )}
            {p.status === 'comprado' && isTI && (
              <button type="button" onClick={() => setRecebendo(true)} className="btn btn-primario">
                <PackageCheck /> Registrar recebimento
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {erro && (
            <p role="alert" className="erro">
              {erro}
            </p>
          )}
          {/* Linha do tempo do fluxo */}
          <ol className="flex flex-wrap gap-1.5" aria-label="Etapas do pedido">
            {FLUXO_PEDIDO.map((s, i) => (
              <li key={s} className={`selo ${p.status === s ? SELO_STATUS_PEDIDO[s] : passoAtual > i ? 'selo-ok' : 'selo-neutro'}`}>
                {i + 1}. {ROTULO_STATUS_PEDIDO[s]}
              </li>
            ))}
            {(p.status === 'recusado' || p.status === 'cancelado') && <li className={`selo ${SELO_STATUS_PEDIDO[p.status]}`}>{ROTULO_STATUS_PEDIDO[p.status]}</li>}
          </ol>
          {p.motivo && (p.status === 'recusado' || p.status === 'cancelado') && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <span className="font-semibold">{p.status === 'recusado' ? 'Motivo da recusa' : 'Motivo do cancelamento'}:</span> {p.motivo}
            </p>
          )}

          <section className="cartao space-y-3 p-4">
            <h3 className="secao-titulo">Resumo</h3>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Dado rotulo="Pedido por">{nome(p.solicitanteId)}</Dado>
              <Dado rotulo="Em">{formatDate(p.criadoEm.slice(0, 10))}</Dado>
              <Dado rotulo="Categoria">{ROTULO_CATEGORIA[p.categoria]}</Dado>
              <Dado rotulo="Área">{p.area || 'Geral'}</Dado>
              <Dado rotulo="Para quem">{p.colaboradorDestinoId ? nome(p.colaboradorDestinoId) : '—'}</Dado>
              <Dado rotulo="Precisa até">{p.necessarioEm ? formatDate(p.necessarioEm) : '—'}</Dado>
              <Dado rotulo="Admissão">
                {admissao ? (
                  <button type="button" className="link text-left" onClick={() => setSelectedTicketIdForDetail(admissao.id)}>
                    {admissao.codigo} · {admissao.onboarding?.nomeColaborador || admissao.titulo}
                  </button>
                ) : (
                  '—'
                )}
              </Dado>
              {valor !== undefined && (
                <Dado rotulo={p.valorFinal != null ? 'Valor final' : 'Valor'}>
                  <span className="font-mono">{brl(valor)}</span>
                </Dado>
              )}
              {p.justificativa && (
                <Dado rotulo="Para que é" className="col-span-2 lg:col-span-4">
                  {p.justificativa}
                </Dado>
              )}
            </dl>
          </section>

          <section className="cartao overflow-hidden">
            <h3 className="secao-titulo px-4 pt-4">Itens ({p.itens.length})</h3>
            <table className="tabela tabela-cartoes mt-2">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th className="text-right">Qtd.</th>
                  {!p.semValores && <th className="text-right">Unitário</th>}
                  {!p.semValores && <th className="text-right">Total</th>}
                </tr>
              </thead>
              <tbody>
                {p.itens.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Item">
                      <span className="font-medium text-slate-900">{i.descricao}</span>
                      {(i.marca || i.modelo || i.especificacao) && <span className="block text-slate-500">{[i.marca, i.modelo, i.especificacao].filter(Boolean).join(' · ')}</span>}
                    </td>
                    <td data-label="Tipo">{ROTULO_TIPO_ITEM[i.tipo]}</td>
                    <td data-label="Qtd." className="text-right font-mono">{i.quantidade}</td>
                    {!p.semValores && <td data-label="Unitário" className="text-right font-mono">{i.valorUnitario != null ? brl(i.valorUnitario) : '—'}</td>}
                    {!p.semValores && <td data-label="Total" className="text-right font-mono">{i.valorUnitario != null ? brl(i.valorUnitario * i.quantidade) : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {!p.semValores && (
            <section className="cartao space-y-2 p-4">
              <h3 className="secao-titulo">Cotações ({p.cotacoes.length})</h3>
              {p.cotacoes.length === 0 ? (
                <p className="text-xs text-slate-500">Sem cotações{aberto && isTI ? ': use Editar para incluir até 3.' : '.'}</p>
              ) : (
                <ul className="space-y-2">
                  {p.cotacoes.map((c) => (
                    <li key={c.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-xs ${c.vencedora ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200'}`}>
                      <span className="font-semibold text-slate-900">{fornecedor(c.fornecedorId)}</span>
                      <span className="font-mono">{brl(c.valor)}</span>
                      {c.prazoDias != null && <span className="text-slate-600">prazo {c.prazoDias} dia(s)</span>}
                      {c.validade && <span className="text-slate-600">válida até {formatDate(c.validade)}</span>}
                      {c.vencedora && <span className="selo selo-ok">Vencedora</span>}
                      {c.observacoes && <span className="basis-full text-slate-600">{c.observacoes}</span>}
                      {c.arquivoCaminho && <AbrirArquivo caminho={c.arquivoCaminho} rotulo="Proposta" />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {impacto && (p.status === 'rascunho' || p.status === 'aguardando' || p.status === 'recusado') && (
            <section className={`cartao space-y-2 p-4 ${impacto.pctDepois !== undefined && impacto.pctDepois > 1 ? 'border-red-300' : ''}`}>
              <h3 className="secao-titulo">
                Impacto no orçamento de {ano} · {ROTULO_CATEGORIA[p.categoria]}
                {p.area ? ` · ${p.area}` : ''}
              </h3>
              {impacto.semOrcamento ? (
                <p className="text-xs text-amber-800">Não há orçamento para esta categoria e área em {ano}. O gasto vai aparecer como "sem orçamento".</p>
              ) : (
                <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <Dado rotulo="Previsto no ano"><span className="font-mono">{brl(impacto.previsto)}</span></Dado>
                  <Dado rotulo="Já realizado"><span className="font-mono">{brl(impacto.realizado)}</span></Dado>
                  <Dado rotulo="Outros pedidos aprovados"><span className="font-mono">{brl(impacto.comprometido)}</span></Dado>
                  <Dado rotulo="Este pedido"><span className="font-mono">{brl(impacto.pedido)}</span></Dado>
                  <Dado rotulo="Saldo depois">
                    <span className={`font-mono ${impacto.saldoDepois < 0 ? 'text-red-700' : ''}`}>
                      {brl(impacto.saldoDepois)} ({Math.round((impacto.pctDepois || 0) * 100)}% usado)
                    </span>
                  </Dado>
                </dl>
              )}
            </section>
          )}

          {(p.status === 'comprado' || p.status === 'recebido') && !p.semValores && (
            <section className="cartao space-y-2 p-4">
              <h3 className="secao-titulo">Compra</h3>
              <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Dado rotulo="Fornecedor">{fornecedor(p.fornecedorId)}</Dado>
                <Dado rotulo="Nota fiscal">{p.numeroNf || '—'}</Dado>
                <Dado rotulo="Data da compra">{p.dataCompra ? formatDate(p.dataCompra) : '—'}</Dado>
                <Dado rotulo="Pagamento">{p.formaPagamento ? ROTULO_FORMA_PAGAMENTO[p.formaPagamento] : '—'}</Dado>
                <Dado rotulo="Fatura em Contas a pagar">
                  {fatura ? `${brl(fatura.valor)} · vence ${formatDate(fatura.vencimento)} · ${fatura.status === 'paga' ? 'paga' : fatura.status === 'cancelada' ? 'cancelada' : 'a pagar'}` : '—'}
                </Dado>
              </dl>
            </section>
          )}

          {p.status === 'recebido' && (
            <section className="cartao space-y-2 p-4">
              <h3 className="secao-titulo">Recebimento {p.recebidoEm ? `em ${dataHora(p.recebidoEm)}` : ''}</h3>
              {ativosRecebidos.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {ativosRecebidos.map((a) => (
                    <li key={a.id}>
                      <button type="button" className="btn btn-sm btn-secundario" onClick={() => (isTI ? abrirFicha({ tipo: 'ativo', id: a.id }) : undefined)} disabled={!isTI}>
                        <span className="font-mono">{a.tag}</span> · {a.nome}
                        {a.serialNumber.startsWith('A-PREENCHER') && isTI && <span className="selo selo-atencao ml-1">série a preencher</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">Sem equipamentos (entrada no estoque, assentos ou serviço).</p>
              )}
            </section>
          )}

          <section className="cartao space-y-2 p-4">
            <h3 className="secao-titulo">Histórico</h3>
            {p.eventos.length === 0 ? (
              <p className="text-xs text-slate-500">Sem registros.</p>
            ) : (
              <ol className="space-y-1.5">
                {p.eventos.map((e, n) => (
                  <li key={n} className="text-xs text-slate-700">
                    <span className="text-slate-500">{dataHora(e.em)}</span> · <span className="font-medium">{nome(e.por)}</span> ·{' '}
                    {e.de ? `${ROTULO_STATUS_PEDIDO[e.de]} → ` : 'Criado como '}
                    <span className="font-semibold">{ROTULO_STATUS_PEDIDO[e.para]}</span>
                    {e.motivo && <span className="text-slate-600"> — {e.motivo}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </Janela>
      {editando && <FormPedido inicial={p} onClose={() => setEditando(false)} />}
      {comprando && <FormCompra pedido={p} onClose={() => setComprando(false)} />}
      {recebendo && <FormRecebimento pedido={p} onClose={() => setRecebendo(false)} />}
    </>
  );
};

/** Comprado: NF, data, vencimento, forma de pagamento e valor pago por item → fatura */
const FormCompra: React.FC<{ pedido: PedidoCompra; onClose: () => void }> = ({ pedido: p, onClose }) => {
  const { fornecedores } = useApp();
  const { registrarCompra } = useCompras();
  const vencedora = p.cotacoes.find((c) => c.vencedora);
  const [fornecedorId, setFornecedorId] = useState(p.fornecedorId || vencedora?.fornecedorId || '');
  const [numeroNf, setNumeroNf] = useState('');
  const [dataCompra, setDataCompra] = useState(hoje());
  const [vencimento, setVencimento] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | ''>('');
  // Um item só e cotação vencedora: o unitário sai da cotação
  const [valores, setValores] = useState<Record<string, number | undefined>>(() =>
    Object.fromEntries(p.itens.map((i) => [i.id, p.itens.length === 1 && vencedora ? Math.round((vencedora.valor / i.quantidade) * 100) / 100 : i.valorUnitario]))
  );
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const total = p.itens.reduce((s, i) => s + i.quantidade * (valores[i.id] || 0), 0);

  const salvar = async () => {
    if (!fornecedorId) return setErro('Escolha o fornecedor.');
    if (!vencimento) return setErro('Informe o vencimento da fatura.');
    if (!(total > 0)) return setErro('Informe o valor pago de cada item.');
    const ok = await confirmar({
      titulo: `Registrar a compra de ${p.codigo}?`,
      mensagem: `Gera a fatura de ${brl(total)} em Contas a pagar (vence em ${formatDate(vencimento)}). Os valores do pedido ficam fixos. Não dá para desfazer pela tela: a fatura pode ser cancelada em Contas a pagar.`,
      confirmar: 'Registrar compra',
    });
    if (!ok) return;
    setSalvando(true);
    const r = await registrarCompra(p.id, {
      fornecedorId,
      numeroNf: numeroNf.trim() || undefined,
      dataCompra,
      vencimento,
      formaPagamento: formaPagamento || undefined,
      itens: p.itens.map((i) => ({ id: i.id, valorUnitario: valores[i.id] || 0 })),
    });
    setSalvando(false);
    if (r) setErro(r);
    else onClose();
  };

  return (
    <Janela
      titulo="Registrar compra"
      subtitulo={`${p.codigo} · ${p.titulo}`}
      tamanho="m"
      onFechar={onClose}
      rodape={
        <>
          <button type="button" onClick={onClose} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="button" disabled={salvando} onClick={salvar} className="btn btn-primario">
            {salvando ? 'Registrando…' : `Registrar compra (${brl(total)})`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="compra-forn" className="rotulo">Fornecedor</label>
            <select id="compra-forn" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="campo">
              <option value="">Escolha…</option>
              {fornecedores.filter((f) => f.ativo || f.id === fornecedorId).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="compra-nf" className="rotulo">Número da NF</label>
            <input id="compra-nf" value={numeroNf} onChange={(e) => setNumeroNf(e.target.value)} className="campo" />
          </div>
          <div>
            <label htmlFor="compra-data" className="rotulo">Data da compra</label>
            <input id="compra-data" type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} className="campo" />
            <p className="ajuda">Vira a data de aquisição dos equipamentos e a competência da fatura.</p>
          </div>
          <div>
            <label htmlFor="compra-venc" className="rotulo">Vencimento da fatura</label>
            <input id="compra-venc" type="date" value={vencimento} min={dataCompra} onChange={(e) => setVencimento(e.target.value)} className="campo" />
          </div>
          <div>
            <label htmlFor="compra-forma" className="rotulo">Forma de pagamento</label>
            <select id="compra-forma" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento | '')} className="campo">
              <option value="">—</option>
              {Object.entries(ROTULO_FORMA_PAGAMENTO).map(([k, r]) => (
                <option key={k} value={k}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="rotulo">Valor pago por unidade</legend>
          {p.itens.map((i) => (
            <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_10rem] items-center gap-2">
              <label htmlFor={`compra-val-${i.id}`} className="text-xs text-slate-700">
                {i.descricao} <span className="text-slate-500">× {i.quantidade}</span>
              </label>
              <CampoMoeda id={`compra-val-${i.id}`} className="campo campo-sm" valor={valores[i.id]} onMudar={(v) => setValores({ ...valores, [i.id]: v })} />
            </div>
          ))}
          <p className="text-right text-xs text-slate-600">
            Total da fatura: <span className="font-mono font-semibold text-slate-900">{brl(total)}</span>
            {vencedora && Math.abs(vencedora.valor - total) > 0.009 && <span className="block text-amber-800">Diferente da cotação vencedora ({brl(vencedora.valor)}).</span>}
          </p>
        </fieldset>
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
      </div>
    </Janela>
  );
};

/** Recebido: patrimônio de cada equipamento (sugerido), local; estoque e assentos automáticos */
const FormRecebimento: React.FC<{ pedido: PedidoCompra; onClose: () => void }> = ({ pedido: p, onClose }) => {
  const { assets, licenses } = useApp();
  const { receberPedido } = useCompras();
  const equipamentos = p.itens.filter((i) => i.tipo === 'equipamento');
  const totalUnidades = equipamentos.reduce((s, i) => s + i.quantidade, 0);
  const [linhas, setLinhas] = useState(() => {
    const tags = proximasTags(assets, totalUnidades);
    let n = 0;
    return equipamentos.flatMap((i) => Array.from({ length: i.quantidade }, (_, k) => ({ chave: `${i.id}-${k}`, itemId: i.id, descricao: i.descricao, tag: tags[n++], serial: '' })));
  });
  const [localizacao, setLocalizacao] = useState('Almoxarifado T.I.');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const outros = p.itens.filter((i) => i.tipo !== 'equipamento');

  const efeitos = [
    ...(totalUnidades ? [`Cria ${totalUnidades} equipamento(s) disponível(is) em "${localizacao}", com NF, fornecedor e valor da compra`] : []),
    ...outros.map((i) =>
      i.tipo === 'acessorio'
        ? i.estoqueItemId
          ? `Entrada de ${i.quantidade} em "${i.descricao}" no estoque`
          : `"${i.descricao}": sem item de estoque ligado (nada muda no estoque)`
        : i.tipo === 'licenca'
          ? i.licencaId
            ? `+${i.quantidade} assento(s) em ${licenses.find((l) => l.id === i.licencaId)?.nome || i.descricao}`
            : `"${i.descricao}": licença nova — cadastre em Softwares e licenças`
          : `"${i.descricao}": serviço (nada entra no inventário)`
    ),
  ];

  const salvar = async () => {
    if (linhas.some((l) => !l.tag.trim())) return setErro('Informe o patrimônio de cada equipamento.');
    const ok = await confirmar({
      titulo: `Registrar o recebimento de ${p.codigo}?`,
      mensagem: `${efeitos.join('.\n')}.\n\nNão dá para desfazer pela tela: ajuste o cadastro, o estoque ou a licença se algo vier errado.`,
      confirmar: 'Registrar recebimento',
    });
    if (!ok) return;
    setSalvando(true);
    const r = await receberPedido(p.id, { localizacao: localizacao.trim(), ativos: linhas.map((l) => ({ itemId: l.itemId, tag: l.tag, serial: l.serial })) });
    setSalvando(false);
    if (r) setErro(r);
    else onClose();
  };

  return (
    <Janela
      titulo="Registrar recebimento"
      subtitulo={`${p.codigo} · ${p.titulo}`}
      tamanho="m"
      onFechar={onClose}
      rodape={
        <>
          <button type="button" onClick={onClose} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="button" disabled={salvando} onClick={salvar} className="btn btn-primario">
            {salvando ? 'Registrando…' : 'Registrar recebimento'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {totalUnidades > 0 && (
          <>
            <div>
              <label htmlFor="rec-local" className="rotulo">Onde ficam</label>
              <input id="rec-local" value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} className="campo" />
            </div>
            <fieldset className="space-y-2">
              <legend className="rotulo">Patrimônio de cada unidade</legend>
              <p className="ajuda">Patrimônio sugerido em sequência. O número de série pode ficar para depois (fica marcado "a preencher").</p>
              {linhas.map((l, n) => (
                <div key={l.chave} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[minmax(0,1fr)_9rem_12rem] sm:items-end">
                  <span className="text-xs text-slate-700">{l.descricao}</span>
                  <div>
                    <label htmlFor={`rec-tag-${n}`} className="text-xs text-slate-600">Patrimônio</label>
                    <input id={`rec-tag-${n}`} value={l.tag} onChange={(e) => setLinhas(linhas.map((x) => (x.chave === l.chave ? { ...x, tag: e.target.value } : x)))} className="campo campo-sm font-mono" />
                  </div>
                  <div>
                    <label htmlFor={`rec-serie-${n}`} className="text-xs text-slate-600">Número de série (opcional)</label>
                    <input id={`rec-serie-${n}`} value={l.serial} onChange={(e) => setLinhas(linhas.map((x) => (x.chave === l.chave ? { ...x, serial: e.target.value } : x)))} className="campo campo-sm font-mono" />
                  </div>
                </div>
              ))}
            </fieldset>
          </>
        )}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <p className="font-semibold text-slate-900">O que acontece ao confirmar</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {efeitos.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
      </div>
    </Janela>
  );
};
