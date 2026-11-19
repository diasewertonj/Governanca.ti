/**
 * Seção 16 · Cotação direto na ficha do pedido (T.I.; Compras no pedido "Outros").
 * Cada item é um cartão com quantidade e a lista de opções (a sugestão de quem pediu
 * vem como 1ª opção): + Opção, "Recomendada" (opcional), excluir; + Item e excluir item.
 * Tudo fica em rascunho até "Salvar cotação"; cada mudança entra no histórico do pedido.
 */
import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { AssetCategory, CotacaoPedido, ItemPedido, PedidoCompra, TipoItemPedido } from '../../types/index.ts';
import { ROTULO_TIPO_ITEM } from '../../utils/compras.ts';
import { validarArquivo } from '../../services/supabaseDb.ts';
import { confirmar } from '../ui/dialogo.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { ProdutoDoItem } from './FormPedido.tsx';

const chave = (p: Pick<PedidoCompra, 'itens' | 'cotacoes'>) => JSON.stringify({ i: p.itens, c: p.cotacoes });

export const PainelCotacao: React.FC<{ pedido: PedidoCompra; onAlterado: (alterado: boolean) => void }> = ({ pedido, onAlterado }) => {
  const { salvarPedido, anexarCotacao } = useCompras();
  const [p, setP] = useState(pedido);
  const [base, setBase] = useState(chave(pedido));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [enviandoArquivo, setEnviandoArquivo] = useState<string | null>(null);

  // O pedido mudou fora daqui (salvo, recarregado): recomeça do que está gravado
  if (chave(pedido) !== base) {
    setBase(chave(pedido));
    setP(pedido);
  }
  const alterado = chave(p) !== chave(pedido);
  useEffect(() => onAlterado(alterado), [alterado, onAlterado]);
  useRegistrarPendencias(`cotacao:${pedido.id}`, alterado ? ['Cotação do pedido não salva'] : []);

  const id = (c: string) => `cot-${pedido.id}-${c}`;
  const mudarItem = (iid: string, mud: Partial<ItemPedido>) => setP((x) => ({ ...x, itens: x.itens.map((i) => (i.id === iid ? { ...i, ...mud } : i)) }));
  const anexar = async (c: CotacaoPedido, arquivo?: File) => {
    if (!arquivo) return;
    const invalido = validarArquivo(arquivo);
    if (invalido) return setErro(invalido);
    setEnviandoArquivo(c.id);
    const r = await anexarCotacao(pedido.id, arquivo);
    setEnviandoArquivo(null);
    if (r.erro) return setErro(`Não foi possível enviar o anexo: ${r.erro}`);
    setP((x) => ({ ...x, cotacoes: x.cotacoes.map((o) => (o.id === c.id ? { ...o, arquivoCaminho: r.caminho } : o)) }));
  };
  const novoItem = () =>
    setP((x) => ({
      ...x,
      itens: [
        ...x.itens,
        {
          id: `pit-${crypto.randomUUID()}`,
          tipo: x.tipoPedido === 'outros' ? 'servico' : 'equipamento',
          categoriaAtivo: x.tipoPedido === 'outros' ? undefined : 'hardware',
          descricao: '',
          quantidade: 1,
          ordem: x.itens.length + 1,
        },
      ],
    }));
  const excluirItem = async (i: ItemPedido) => {
    if (p.itens.length === 1) return setErro('O pedido precisa de pelo menos um item. Para desistir, cancele o pedido.');
    const ok = await confirmar({
      titulo: `Excluir "${i.descricao || 'item'}" do pedido?`,
      mensagem: 'O item e as opções dele saem do pedido ao salvar a cotação. Fica registrado no histórico (quem pediu vê).',
      confirmar: 'Excluir',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (ok) setP((x) => ({ ...x, itens: x.itens.filter((y) => y.id !== i.id), cotacoes: x.cotacoes.filter((c) => c.itemId !== i.id) }));
  };
  const salvar = async () => {
    if (p.itens.some((i) => !i.descricao.trim())) return setErro('Descreva cada item.');
    setSalvando(true);
    const r = await salvarPedido({ ...pedido, itens: p.itens, cotacoes: p.cotacoes }, false);
    setSalvando(false);
    setErro(r.erro || '');
  };

  return (
    <section className="cartao space-y-3 p-4" aria-label="Cotação">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="secao-titulo">Cotação ({p.itens.length} {p.itens.length === 1 ? 'item' : 'itens'})</h3>
        <p className="texto-aux">Inclua opções pelo "+ Opção"; recomendar uma é opcional (sem recomendação, Compras escolhe).</p>
      </div>
      {p.itens.map((i, n) => (
        <div key={i.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto] lg:grid-cols-[12rem_minmax(0,1fr)_6rem_auto]">
            {p.tipoPedido !== 'outros' && (
              <div>
                <label htmlFor={id(`tipo-${n}`)} className="texto-aux">Tipo</label>
                <select
                  id={id(`tipo-${n}`)}
                  value={i.tipo}
                  onChange={(e) => mudarItem(i.id, { tipo: e.target.value as TipoItemPedido, categoriaAtivo: e.target.value === 'equipamento' ? (i.categoriaAtivo || ('hardware' as AssetCategory)) : undefined })}
                  className="campo campo-sm"
                >
                  {(Object.keys(ROTULO_TIPO_ITEM) as TipoItemPedido[]).map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO_ITEM[t]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor={id(`desc-${n}`)} className="texto-aux">Item {n + 1}</label>
              <input id={id(`desc-${n}`)} value={i.descricao} onChange={(e) => mudarItem(i.id, { descricao: e.target.value })} placeholder="O que é" className="campo campo-sm" />
            </div>
            <div>
              <label htmlFor={id(`qtd-${n}`)} className="texto-aux">Quantidade</label>
              <input id={id(`qtd-${n}`)} type="number" min={1} step={1} value={i.quantidade} onChange={(e) => mudarItem(i.id, { quantidade: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} className="campo campo-sm" />
            </div>
            <div className="flex items-end">
              <button type="button" onClick={() => excluirItem(i)} aria-label={`Excluir o item ${n + 1}`} title="Excluir item" className="btn-icone btn-icone-perigo">
                <Trash2 />
              </button>
            </div>
          </div>
          <ProdutoDoItem pedido={p} item={i} n={n} simples={false} id={id} mudarItem={mudarItem} setP={setP} anexar={anexar} enviandoArquivo={enviandoArquivo} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={novoItem} className="btn btn-sm btn-secundario">
          <Plus /> Item
        </button>
        <span className="ml-auto" />
        {alterado && (
          <button type="button" disabled={salvando} onClick={() => setP(pedido)} className="btn btn-sm btn-secundario">
            Descartar
          </button>
        )}
        <button type="button" disabled={salvando || !alterado} onClick={salvar} className="btn btn-sm btn-primario">
          {salvando ? 'Salvando…' : 'Salvar cotação'}
        </button>
      </div>
      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}
    </section>
  );
};
