/**
 * Fase 11 · Ficha do pedido de compra: itens, cotações, impacto no orçamento,
 * compra, recebimento e histórico. As ações seguem o fluxo
 * rascunho → aguardando → aprovado/recusado → comprado → recebido (ou cancelado).
 * Só o administrador aprova ou recusa. RH e gestor veem o pedido sem valores.
 */
import React, { useMemo, useState } from 'react';
import { Ban, Check, ExternalLink, PackageCheck, Pencil, Send, ShoppingCart, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { FormaAprovacao, FormaPagamento, PedidoCompra } from '../../types/index.ts';
import { ROTULO_CATEGORIA, ROTULO_FORMA_PAGAMENTO, brl } from '../../utils/financeiro.ts';
import {
  ROTULO_FORMA_APROVACAO,
  opcaoEscolhida,
  opcoesDoItem,
  fluxoDoPedido,
  vezDoPedido,
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
import { PainelCotacao } from './PainelCotacao.tsx';
import { ConversaPedido } from './ConversaPedido.tsx';
import { CampoMascara } from '../ui/Campos.tsx';

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dataHora = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export const FichaPedido: React.FC<{ pedidoId: string; onClose: () => void }> = ({ pedidoId, onClose }) => {
  const { currentRole, currentUser, employees, fornecedores, assets, tickets, faturas, abrirFicha, setSelectedTicketIdForDetail } = useApp();
  const { pedidos, linhasAnoAtual, mudarStatusPedido, equipeCompras, registrarAprovacao } = useCompras();
  const p = pedidos.find((x) => x.id === pedidoId);
  const [editando, setEditando] = useState(false);
  const [comprando, setComprando] = useState(false);
  const [recebendo, setRecebendo] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [painelAlterado, setPainelAlterado] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  // T.I. e Compras ("equipe") veem valores e operam; a T.I. recebe; Compras/admin aprovam e compram
  const isTI = equipeCompras;
  const ehTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const isAdmin = currentRole === 'ti_admin';
  const ehCompras = currentRole === 'compras';
  const eu = currentUser?.id;

  const ano = new Date().getFullYear();
  const impacto = useMemo(() => (p && isTI ? impactoNoOrcamento(p, linhasAnoAtual, pedidos, faturas, ano) : null), [p, isTI, linhasAnoAtual, pedidos, faturas, ano]);
  if (!p) return null;

  const nome = (id?: string, reserva?: string) => employees.find((e) => e.id === id)?.nome || reserva || '—';
  const fornecedor = (id?: string) => fornecedores.find((f) => f.id === id)?.nome || '—';
  const admissao = tickets.find((t) => t.id === p.chamadoId);
  const ativosRecebidos = assets.filter((a) => a.pedidoId === p.id).sort((a, b) => a.tag.localeCompare(b.tag));
  const fatura = faturas.find((f) => f.id === p.faturaId || (f.pedidoId === p.id && f.status !== 'cancelada'));
  const souSolicitante = !!eu && p.solicitanteId === eu;
  const vez = vezDoPedido(p);
  const aberto = ['rascunho', 'em_cotacao', 'aguardando', 'recusado'].includes(p.status);
  const podeEditar = isTI && aberto;
  // Seção 15 (fluxo enxuto): quem cota registra a aprovação (com quem aprovou); o gestor de quem pediu pode aprovar ele mesmo
  const podeEnviar = (isTI || souSolicitante) && (p.status === 'rascunho' || p.status === 'recusado');
  const podeDevolver = isTI && ['em_cotacao', 'aguardando', 'aprovado'].includes(p.status) && !(p.status === 'aprovado' && !(ehCompras || isAdmin));
  const souGestor = !!eu && p.gestorId === eu && !souSolicitante;
  const podeRegistrar = aberto && p.status !== 'rascunho' && (isTI || souGestor);
  const podeComprar = p.status === 'aprovado' && (ehCompras || isAdmin);
  const podeReceber = p.status === 'comprado' && (ehTI || (ehCompras && p.tipoPedido === 'outros'));
  const podeCancelar = isTI ? ['rascunho', 'em_cotacao', 'aguardando', 'aprovado', 'recusado'].includes(p.status) : souSolicitante && ['rascunho', 'em_cotacao', 'aguardando'].includes(p.status);
  const valor = p.semValores ? undefined : valorDoPedido(p);
  const esperando = !podeRegistrar && !podeComprar && !podeReceber && !podeEnviar ? proximoPasso(p) : '';
  void vez;

  const agir = async (fn: () => Promise<string | null>) => {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    setErro(r || '');
  };

  const cancelar = async () => {
    const motivo = await pedirTexto({ titulo: `Cancelar ${p.codigo}?`, mensagem: 'O pedido fica no histórico como cancelado. Não dá para desfazer: faça outro pedido se precisar.', rotulo: 'Motivo', minimo: 5, confirmar: 'Cancelar pedido', cancelar: 'Voltar', perigo: true });
    if (motivo !== null) await agir(() => mudarStatusPedido(p.id, 'cancelar', motivo));
  };
  const devolver = async () => {
    const aprovado = p.status === 'aprovado';
    const motivo = await pedirTexto({
      titulo: aprovado ? `Devolver ${p.codigo} para a cotação?` : `Devolver ${p.codigo} a quem pediu?`,
      mensagem: aprovado
        ? 'Ex.: a opção acabou, o preço mudou. O pedido volta para a cotação e precisa de nova aprovação.'
        : 'Ex.: já existe no estoque, não é de T.I., falta informação. Quem pediu vê o motivo e pode ajustar e reenviar.',
      rotulo: 'Motivo',
      minimo: 5,
      confirmar: 'Devolver',
      cancelar: 'Voltar',
    });
    if (motivo !== null) await agir(() => mudarStatusPedido(p.id, 'devolver', motivo));
  };
  const enviar = async () => {
    const destino = p.tipoPedido === 'outros' ? 'Compras cota e registra a aprovação.' : 'A T.I. cota e registra a aprovação com a liderança.';
    if (!(await confirmar({ titulo: `Enviar ${p.codigo} para cotação?`, mensagem: destino, confirmar: 'Enviar' }))) return;
    await agir(() => mudarStatusPedido(p.id, 'enviar'));
  };
  const aprovarComoGestor = async () => {
    if (!(await confirmar({ titulo: `Aprovar ${p.codigo}?`, mensagem: 'Fica registrado "Aprovado por você (pelo sistema)" e o pedido segue para Compras comprar.', confirmar: 'Aprovar' }))) return;
    await agir(() => registrarAprovacao(p.id, eu!, 'sistema'));
  };
  const fluxo = fluxoDoPedido(p);
  const passoAtual = fluxo.indexOf(p.status);

  return (
    <>
      <Janela
        titulo={`${p.codigo} · ${p.titulo}`}
        rotuloCaminho={p.codigo}
        subtitulo={`${ROTULO_STATUS_PEDIDO[p.status]}${proximoPasso(p) ? ` · próximo passo: ${proximoPasso(p)}` : ''}`}
        icone={<ShoppingCart className="ico" />}
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
            {esperando && <span className="mr-auto texto-aux">Aguardando: {esperando}.</span>}
            {podeDevolver && (
              <button type="button" disabled={ocupado} onClick={devolver} className="btn btn-secundario">
                <X /> Devolver
              </button>
            )}
            {podeEnviar && (
              <button type="button" disabled={ocupado} onClick={enviar} className="btn btn-primario">
                <Send /> {p.status === 'recusado' ? 'Reenviar para cotação' : 'Enviar para cotação'}
              </button>
            )}
            {podeRegistrar && isTI && (
              <button type="button" disabled={ocupado || painelAlterado} title={painelAlterado ? 'Salve a cotação antes' : undefined} onClick={() => setRegistrando(true)} className="btn btn-primario">
                <Check /> Registrar aprovação
              </button>
            )}
            {podeRegistrar && !isTI && souGestor && (
              <button type="button" disabled={ocupado} onClick={aprovarComoGestor} className="btn btn-primario">
                <Check /> Aprovar (sou o gestor)
              </button>
            )}            {podeComprar && (
              <button type="button" onClick={() => setComprando(true)} className="btn btn-primario">
                <ShoppingCart /> Registrar compra
              </button>
            )}
            {podeReceber && (
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
          <ol className="flex flex-wrap gap-2" aria-label="Etapas do pedido">
            {fluxo.map((s, i) => (
              <li key={s} className={`selo ${p.status === s ? SELO_STATUS_PEDIDO[s] : passoAtual > i ? 'selo-ok' : 'selo-neutro'}`}>
                {i + 1}. {ROTULO_STATUS_PEDIDO[s]}
              </li>
            ))}
            {(p.status === 'recusado' || p.status === 'cancelado') && <li className={`selo ${SELO_STATUS_PEDIDO[p.status]}`}>{ROTULO_STATUS_PEDIDO[p.status]}</li>}
          </ol>
          {p.motivo && (p.status === 'recusado' || p.status === 'cancelado') && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
              <span className="font-semibold">{p.status === 'recusado' ? 'Motivo da recusa' : 'Motivo do cancelamento'}:</span> {p.motivo}
            </p>
          )}

          <section className="cartao space-y-3 p-4">
            <h3 className="secao-titulo">Resumo</h3>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Dado rotulo="Pedido por">{nome(p.solicitanteId, p.solicitanteNome)}</Dado>
              <Dado rotulo="Tipo">{p.tipoPedido === 'outros' ? 'Outros (Compras cota)' : 'De T.I. (a T.I. cota)'}</Dado>
              <Dado rotulo="Gestor">
                {p.gestorId ? nome(p.gestorId, p.gestorNome) : '—'}
              </Dado>
              <Dado rotulo="Em">{formatDate(p.criadoEm.slice(0, 10))}</Dado>
              <Dado rotulo="Categoria">{ROTULO_CATEGORIA[p.categoria]}</Dado>
              <Dado rotulo="Área">{p.area || 'Geral'}</Dado>
              {p.aprovadorId && (
                <Dado rotulo="Aprovado por">
                  {nome(p.aprovadorId)}
                  {p.aprovacaoForma ? ` · ${ROTULO_FORMA_APROVACAO[p.aprovacaoForma]}` : ''}
                  {p.aprovadoEm ? ` · ${formatDate(p.aprovadoEm.slice(0, 10))}` : ''}
                  {p.aprovadoPor && p.aprovadoPor !== p.aprovadorId ? ` (registrado por ${nome(p.aprovadoPor)})` : ''}
                </Dado>
              )}
              <Dado rotulo="Para quem">{p.colaboradorDestinoId ? nome(p.colaboradorDestinoId, p.destinoNome) : '—'}</Dado>
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
                  <span className="num">{brl(valor)}</span>
                </Dado>
              )}
              {p.justificativa && (
                <Dado rotulo="Para que é" className="col-span-2 lg:col-span-4">
                  {p.justificativa}
                </Dado>
              )}
            </dl>
          </section>

          {isTI && aberto && <PainelCotacao pedido={p} onAlterado={setPainelAlterado} />}
          <section className={`cartao overflow-hidden ${isTI && aberto ? 'hidden' : ''}`}>
            <h3 className="secao-titulo px-4 pt-4">Itens ({p.itens.length})</h3>
            <table className="tabela tabela-cartoes mt-2">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th className="num">Qtd.</th>
                  {!p.semValores && <th className="num">Unitário</th>}
                  {!p.semValores && <th className="num">Total</th>}
                </tr>
              </thead>
              <tbody>
                {p.itens.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Item">
                      <span className="font-semibold text-slate-900">{i.descricao}</span>
                      {i.link && /^https?:\/\//i.test(i.link) && (
                        <a href={i.link} target="_blank" rel="noopener noreferrer" className="link ml-2 inline-flex items-center gap-0.5">
                          <ExternalLink className="ico-sm" aria-hidden="true" /> ver produto
                        </a>
                      )}
                      {i.valorReferencia != null && <span className="block text-slate-500">quem pediu viu {brl(i.valorReferencia)}</span>}
                      {opcoesDoItem(p, i.id).length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {opcoesDoItem(p, i.id).map((o) => (
                            <li key={o.id} className={` ${o.vencedora ? 'font-semibold text-emerald-800' : 'text-slate-600'}`}>
                              {o.vencedora ? '✓ recomendada · ' : '· '}
                              {fornecedores.find((f) => f.id === o.fornecedorId)?.nome || o.loja || 'Opção'}
                              {[o.marca, o.modelo].filter(Boolean).length ? ` · ${[o.marca, o.modelo].filter(Boolean).join(' ')}` : ''}
                              {o.valor > 0 && !p.semValores ? ` · ${brl(o.valor)}` : o.valor > 0 && p.semValores ? ` · ${brl(o.valor)} (o seu)` : ''}
                              {o.link && /^https?:\/\//i.test(o.link) && (
                                <a href={o.link} target="_blank" rel="noopener noreferrer" className="link ml-1">
                                  link
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {(i.marca || i.modelo || i.especificacao) && <span className="block text-slate-500">{[i.marca, i.modelo, i.especificacao].filter(Boolean).join(' · ')}</span>}
                    </td>
                    <td data-label="Tipo">{ROTULO_TIPO_ITEM[i.tipo]}</td>
                    <td data-label="Qtd." className="num">{i.quantidade}</td>
                    {!p.semValores && <td data-label="Unitário" className="num">{i.valorUnitario != null ? brl(i.valorUnitario) : '—'}</td>}
                    {!p.semValores && <td data-label="Total" className="num">{i.valorUnitario != null ? brl(i.valorUnitario * i.quantidade) : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {!p.semValores && p.cotacoes.some((c) => !c.itemId) && (
            <section className="cartao space-y-2 p-4">
              <h3 className="secao-titulo">Cotações do pedido inteiro ({p.cotacoes.filter((c) => !c.itemId).length})</h3>
              {p.cotacoes.length === 0 ? (
                <p className="texto-aux">Sem cotações{aberto && isTI ? ': use Editar para incluir até 3.' : '.'}</p>
              ) : (
                <ul className="space-y-2">
                  {p.cotacoes.filter((c) => !c.itemId).map((c) => (
                    <li key={c.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${c.vencedora ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200'}`}>
                      <span className="font-semibold text-slate-900">{fornecedor(c.fornecedorId)}</span>
                      <span className="num">{brl(c.valor)}</span>
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

          {impacto && aberto && (
            <section className={`cartao space-y-2 p-4 ${impacto.pctDepois !== undefined && impacto.pctDepois > 1 ? 'border-red-300' : ''}`}>
              <h3 className="secao-titulo">
                Impacto no orçamento de {ano} · {ROTULO_CATEGORIA[p.categoria]}
                {p.area ? ` · ${p.area}` : ''}
              </h3>
              {impacto.semOrcamento ? (
                <p className="text-amber-800">Não há orçamento para esta categoria e área em {ano}. O gasto vai aparecer como "sem orçamento".</p>
              ) : (
                <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <Dado rotulo="Previsto no ano"><span className="num">{brl(impacto.previsto)}</span></Dado>
                  <Dado rotulo="Já realizado"><span className="num">{brl(impacto.realizado)}</span></Dado>
                  <Dado rotulo="Outros pedidos aprovados"><span className="num">{brl(impacto.comprometido)}</span></Dado>
                  <Dado rotulo="Este pedido"><span className="num">{brl(impacto.pedido)}</span></Dado>
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
                <Dado rotulo="Fornecedor">{p.lojaCompra ? `${p.lojaCompra} (fora do cadastro)` : fornecedor(p.fornecedorId)}</Dado>
                <Dado rotulo="Nota fiscal">{p.numeroNf || '—'}</Dado>
                <Dado rotulo="Data da compra">{p.dataCompra ? formatDate(p.dataCompra) : '—'}</Dado>
                <Dado rotulo="Pagamento">{p.formaPagamento ? ROTULO_FORMA_PAGAMENTO[p.formaPagamento] : '—'}</Dado>
                <Dado rotulo="Chave da NF-e">{p.nfChave ? <span className="font-mono break-all">{p.nfChave}</span> : '—'}</Dado>
                <Dado rotulo="Arquivo da NF">{p.nfArquivo ? <AbrirArquivo caminho={p.nfArquivo} rotulo="Abrir NF" /> : '—'}</Dado>
                {p.fornecedorTrocaMotivo && (
                  <Dado rotulo="Fornecedor diferente do sugerido pela T.I." className="col-span-2">
                    {p.fornecedorTrocaMotivo}
                  </Dado>
                )}
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
                      <button type="button" className="btn btn-sm btn-secundario" onClick={() => (ehTI ? abrirFicha({ tipo: 'ativo', id: a.id }) : undefined)} disabled={!ehTI}>
                        <span className="font-mono">{a.tag}</span> · {a.nome}
                        {ehTI && p.colaboradorDestinoId && a.status === 'disponivel' && <span className="selo selo-info ml-1">entregar a {nome(p.colaboradorDestinoId, p.destinoNome)}</span>}
                        {a.serialNumber.startsWith('A-PREENCHER') && ehTI && <span className="selo selo-atencao ml-1">série a preencher</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="texto-aux">Sem equipamentos (entrada no estoque, assentos ou serviço).</p>
              )}
            </section>
          )}

          <ConversaPedido pedido={p} />

          <section className="cartao space-y-2 p-4">
            <h3 className="secao-titulo">Histórico</h3>
            {p.eventos.length === 0 ? (
              <p className="texto-aux">Sem registros.</p>
            ) : (
              <ol className="space-y-2">
                {p.eventos.map((e, n) => (
                  <li key={n} className="text-slate-700">
                    <span className="text-slate-500">{dataHora(e.em)}</span> · <span className="">{nome(e.por, e.porNome)}</span> ·{' '}
                    {e.campo || (e.de && e.de === e.para) ? '' : e.de ? `${ROTULO_STATUS_PEDIDO[e.de]} → ` : 'Criado como '}
                    <span className="font-semibold">
                      {e.campo === 'item' ? 'Item alterado' : e.de === 'aguardando' && e.para === 'aguardando' ? 'Aprovação do gestor' : ROTULO_STATUS_PEDIDO[e.para]}
                    </span>
                    {e.motivo && <span className="text-slate-600"> — {e.motivo}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </Janela>
      {editando && <FormPedido inicial={p} somenteDados onClose={() => setEditando(false)} />}
      {comprando && <FormCompra pedido={p} onClose={() => setComprando(false)} />}
      {recebendo && <FormRecebimento pedido={p} onClose={() => setRecebendo(false)} />}
      {registrando && <FormAprovacao pedido={p} impacto={impacto} onClose={() => setRegistrando(false)} />}
    </>
  );
};

/** Comprado: NF, data, vencimento, forma de pagamento e valor pago por item → fatura */
const FormCompra: React.FC<{ pedido: PedidoCompra; onClose: () => void }> = ({ pedido: p, onClose }) => {
  const { fornecedores } = useApp();
  const { registrarCompra, anexarCotacao } = useCompras();
  const vencedora = p.cotacoes.find((c) => c.vencedora && !c.itemId);
  // Seção 14: fornecedores das opções escolhidas (por item)
  const sugeridos = [...new Set(p.cotacoes.filter((c) => c.vencedora && c.fornecedorId).map((c) => c.fornecedorId))];
  const [fornecedorId, setFornecedorId] = useState(p.fornecedorId || sugeridos[0] || '');
  const [numeroNf, setNumeroNf] = useState('');
  const [dataCompra, setDataCompra] = useState(hoje());
  const [vencimento, setVencimento] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | ''>('');
  // Seção 13: NF (chave e arquivo) e motivo quando Compras escolhe outro fornecedor
  const [nfChave, setNfChave] = useState('');
  const [nfArquivo, setNfArquivo] = useState<string | undefined>();
  const [enviandoNf, setEnviandoNf] = useState(false);
  const [motivoTroca, setMotivoTroca] = useState('');
  // Seção 16: compra fora do cadastro e fora da lista de opções
  const [loja, setLoja] = useState('');
  const [linkCompra, setLinkCompra] = useState('');
  const trocou = sugeridos.length > 0 && !sugeridos.includes(fornecedorId);
  const anexarNf = async (arquivo?: File) => {
    if (!arquivo) return;
    setEnviandoNf(true);
    const r = await anexarCotacao(p.id, arquivo);
    setEnviandoNf(false);
    if (r.erro) setErro(`Não foi possível enviar a NF: ${r.erro}`);
    else setNfArquivo(r.caminho);
  };
  // Um item só e cotação vencedora: o unitário sai da cotação
  const [valores, setValores] = useState<Record<string, number | undefined>>(() =>
    Object.fromEntries(p.itens.map((i) => [i.id, p.itens.length === 1 && vencedora && !opcaoEscolhida(p, i.id) ? Math.round((vencedora.valor / i.quantidade) * 100) / 100 : i.valorUnitario]))
  );
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const total = p.itens.reduce((s, i) => s + i.quantidade * (valores[i.id] || 0), 0);

  const salvar = async () => {
    if (!fornecedorId && !loja.trim()) return setErro('Escolha o fornecedor do cadastro ou informe a loja.');
    if (!vencimento) return setErro('Informe o vencimento da fatura.');
    if (!(total > 0)) return setErro('Informe o valor pago de cada item.');
    if (trocou && motivoTroca.trim().length < 5) return setErro('Explique por que a compra foi feita em outro fornecedor.');
    const chave = nfChave.replace(/\D/g, '');
    if (chave && chave.length !== 44) return setErro('A chave da NF-e tem 44 dígitos.');
    const ok = await confirmar({
      titulo: `Registrar a compra de ${p.codigo}?`,
      mensagem: `Gera a fatura de ${brl(total)} em Contas a pagar (vence em ${formatDate(vencimento)}). Os valores do pedido ficam fixos. Não dá para desfazer pela tela: a fatura pode ser cancelada em Contas a pagar.`,
      confirmar: 'Registrar compra',
    });
    if (!ok) return;
    setSalvando(true);
    const r = await registrarCompra(p.id, {
      fornecedorId,
      loja: loja.trim() || undefined,
      link: linkCompra.trim() || undefined,
      numeroNf: numeroNf.trim() || undefined,
      dataCompra,
      vencimento,
      formaPagamento: formaPagamento || undefined,
      nfChave: nfChave.replace(/\D/g, '') || undefined,
      nfArquivo,
      motivoTroca: trocou ? motivoTroca.trim() : undefined,
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
            <label htmlFor="compra-forn" className="rotulo">Fornecedor do cadastro</label>
            <select id="compra-forn" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="campo">
              <option value="">Fora do cadastro (informe a loja)</option>
              {fornecedores.filter((f) => f.ativo || f.id === fornecedorId).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          {!fornecedorId && (
            <>
              <div>
                <label htmlFor="compra-loja" className="rotulo">Loja</label>
                <input id="compra-loja" value={loja} onChange={(e) => setLoja(e.target.value)} placeholder="Ex.: Kabum" className="campo" />
              </div>
              <div>
                <label htmlFor="compra-link" className="rotulo">Link da compra (opcional)</label>
                <input id="compra-link" type="url" value={linkCompra} onChange={(e) => setLinkCompra(e.target.value)} placeholder="https://…" className="campo" />
              </div>
            </>
          )}
          {trocou && (
            <div className="sm:col-span-2">
              <label htmlFor="compra-motivo" className="rotulo">Por que outro fornecedor? (a T.I. sugeriu {sugeridos.map((s) => fornecedores.find((f) => f.id === s)?.nome).filter(Boolean).join(', ') || 'outro'})</label>
              <input id="compra-motivo" value={motivoTroca} onChange={(e) => setMotivoTroca(e.target.value)} placeholder="Ex.: preço menor, entrega no mesmo dia" className="campo" />
            </div>
          )}
          <div>
            <label htmlFor="compra-nf" className="rotulo">Número da NF</label>
            <input id="compra-nf" value={numeroNf} onChange={(e) => setNumeroNf(e.target.value)} className="campo" />
          </div>
          <div>
            <span className="rotulo">Arquivo da NF (PDF ou imagem)</span>
            {nfArquivo ? (
              <span className="inline-flex items-center gap-1">
                <AbrirArquivo caminho={nfArquivo} />
                <button type="button" onClick={() => setNfArquivo(undefined)} className="btn btn-sm btn-discreto">
                  Trocar
                </button>
              </span>
            ) : (
              <label className="btn btn-secundario cursor-pointer">
                {enviandoNf ? 'Enviando…' : 'Anexar NF'}
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="sr-only" onChange={(e) => anexarNf(e.target.files?.[0])} />
              </label>
            )}
            <p className="ajuda">Vai junto com a fatura em Contas a pagar.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="compra-chave" className="rotulo">Chave de acesso da NF-e (44 dígitos)</label>
            <CampoMascara id="compra-chave" tipo="chave_nfe" value={nfChave} onChange={setNfChave} />
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
              <label htmlFor={`compra-val-${i.id}`} className="text-slate-700">
                {i.descricao} <span className="text-slate-500">× {i.quantidade}</span>
              </label>
              <CampoMoeda id={`compra-val-${i.id}`} className="campo campo-sm" valor={valores[i.id]} onMudar={(v) => setValores({ ...valores, [i.id]: v })} />
            </div>
          ))}
          <p className="text-right texto-aux">
            Total da fatura: <span className="num font-semibold text-slate-900">{brl(total)}</span>
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
    return equipamentos.flatMap((i) => Array.from({ length: i.quantidade }, (_, k) => ({ chave: `${i.id}-${k}`, itemId: i.id, descricao: i.descricao, tag: tags[n++], serial: '', marca: i.marca || '', modelo: i.modelo || '' })));
  });
  const [localizacao, setLocalizacao] = useState('Almoxarifado T.I.');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const outros = p.itens.filter((i) => i.tipo !== 'equipamento');
  // Seção 14: acessório sem item de estoque vira item novo (marcado por padrão)
  const [criarEstoque, setCriarEstoque] = useState<string[]>(() => outros.filter((i) => i.tipo === 'acessorio' && !i.estoqueItemId).map((i) => i.id));

  const efeitos = [
    ...(totalUnidades ? [`Cria ${totalUnidades} equipamento(s) disponível(is) em "${localizacao}", com NF, fornecedor e valor da compra`] : []),
    ...outros.map((i) =>
      i.tipo === 'acessorio'
        ? i.estoqueItemId
          ? `Entrada de ${i.quantidade} em "${i.descricao}" no estoque`
          : criarEstoque.includes(i.id)
            ? `Cria "${i.descricao}"${i.marca ? ` (${[i.marca, i.modelo].filter(Boolean).join(' ')})` : ''} no estoque com ${i.quantidade} unidade(s)`
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
    const r = await receberPedido(p.id, { localizacao: localizacao.trim(), ativos: linhas.map((l) => ({ itemId: l.itemId, tag: l.tag, serial: l.serial, marca: l.marca, modelo: l.modelo })), criarEstoque });
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
                <div key={l.chave} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_9rem_8rem_8rem_10rem] lg:items-end">
                  <span className="text-slate-700">{l.descricao}</span>
                  <div>
                    <label htmlFor={`rec-tag-${n}`} className="texto-aux">Patrimônio</label>
                    <input id={`rec-tag-${n}`} value={l.tag} onChange={(e) => setLinhas(linhas.map((x) => (x.chave === l.chave ? { ...x, tag: e.target.value } : x)))} className="campo campo-sm font-mono" />
                  </div>
                  <div>
                    <label htmlFor={`rec-marca-${n}`} className="texto-aux">Marca</label>
                    <input id={`rec-marca-${n}`} value={l.marca} onChange={(e) => setLinhas(linhas.map((x) => (x.chave === l.chave ? { ...x, marca: e.target.value } : x)))} className="campo campo-sm" />
                  </div>
                  <div>
                    <label htmlFor={`rec-modelo-${n}`} className="texto-aux">Modelo</label>
                    <input id={`rec-modelo-${n}`} value={l.modelo} onChange={(e) => setLinhas(linhas.map((x) => (x.chave === l.chave ? { ...x, modelo: e.target.value } : x)))} className="campo campo-sm" />
                  </div>
                  <div>
                    <label htmlFor={`rec-serie-${n}`} className="texto-aux">Número de série (opcional)</label>
                    <input id={`rec-serie-${n}`} value={l.serial} onChange={(e) => setLinhas(linhas.map((x) => (x.chave === l.chave ? { ...x, serial: e.target.value } : x)))} className="campo campo-sm font-mono" />
                  </div>
                </div>
              ))}
            </fieldset>
          </>
        )}
        {outros.some((i) => i.tipo === 'acessorio' && !i.estoqueItemId) && (
          <fieldset className="space-y-1">
            <legend className="rotulo">Acessórios que ainda não estão no estoque</legend>
            {outros
              .filter((i) => i.tipo === 'acessorio' && !i.estoqueItemId)
              .map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-slate-700">
                  <input type="checkbox" checked={criarEstoque.includes(i.id)} onChange={(e) => setCriarEstoque(e.target.checked ? [...criarEstoque, i.id] : criarEstoque.filter((x) => x !== i.id))} />
                  Criar &quot;{i.descricao}&quot; no estoque ({[i.marca, i.modelo].filter(Boolean).join(' ') || 'sem marca'}, {i.quantidade} un.)
                </label>
              ))}
          </fieldset>
        )}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
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

/** Seção 15: registrar a aprovação — quem aprovou (nunca quem pediu), como e quando */
const FormAprovacao: React.FC<{ pedido: PedidoCompra; impacto: ReturnType<typeof impactoNoOrcamento> | null; onClose: () => void }> = ({ pedido: p, impacto, onClose }) => {
  const { pessoasAprovacao, registrarAprovacao } = useCompras();
  const [aprovador, setAprovador] = useState(p.gestorId && p.gestorId !== p.solicitanteId ? p.gestorId : '');
  const [forma, setForma] = useState<FormaAprovacao>('pessoalmente');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    const r = await registrarAprovacao(p.id, aprovador, forma, obs);
    setSalvando(false);
    if (r) setErro(r);
    else onClose();
  };
  return (
    <Janela
      titulo="Registrar aprovação"
      subtitulo={`${p.codigo} · ${p.titulo}`}
      tamanho="p"
      onFechar={onClose}
      rodape={
        <>
          <button type="button" onClick={onClose} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="button" disabled={salvando || !aprovador} onClick={salvar} className="btn btn-primario">
            {salvando ? 'Registrando…' : 'Aprovado: seguir para compra'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="aprov-quem" className="rotulo">Aprovado por</label>
          <select id="aprov-quem" value={aprovador} onChange={(e) => setAprovador(e.target.value)} className="campo">
            <option value="">Escolha…</option>
            {pessoasAprovacao
              .filter((x) => x.id !== p.solicitanteId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                  {x.id === p.gestorId ? ' (gestor de quem pediu)' : x.cargo ? ` · ${x.cargo}` : ''}
                </option>
              ))}
          </select>
          <p className="ajuda">Quem pediu não pode aprovar o próprio pedido.</p>
        </div>
        <div>
          <label htmlFor="aprov-forma" className="rotulo">Como foi a aprovação</label>
          <select id="aprov-forma" value={forma} onChange={(e) => setForma(e.target.value as FormaAprovacao)} className="campo">
            {(Object.keys(ROTULO_FORMA_APROVACAO) as FormaAprovacao[]).map((f) => (
              <option key={f} value={f}>
                {ROTULO_FORMA_APROVACAO[f]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="aprov-obs" className="rotulo">Observação (opcional)</label>
          <input id="aprov-obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: conversado na reunião de segunda" className="campo" />
        </div>
        {impacto && (
          <p className={` ${impacto.saldoDepois < 0 ? 'text-red-700' : 'text-slate-600'}`}>
            {impacto.semOrcamento
              ? 'Não há orçamento para esta categoria e área no ano.'
              : `Orçamento depois deste pedido: sobram ${brl(impacto.saldoDepois)} (${Math.round((impacto.pctDepois || 0) * 100)}% usado).`}
          </p>
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