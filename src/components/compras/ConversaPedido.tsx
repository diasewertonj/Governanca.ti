/**
 * Seção 13 · Conversa do pedido de compra, como no chamado: quem pediu, o gestor,
 * a T.I. e Compras conversam; nota interna (T.I. e Compras) não aparece para quem pediu.
 * Anexo só pela T.I. e por Compras (pasta pedidos/ do Storage).
 */
import React, { useEffect, useState } from 'react';
import { Lock, Paperclip, Send } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { PedidoCompra } from '../../types/index.ts';
import { validarArquivo } from '../../services/supabaseDb.ts';
import { AbrirArquivo } from '../comum/AbrirArquivo.tsx';

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const ConversaPedido: React.FC<{ pedido: PedidoCompra }> = ({ pedido: p }) => {
  const { employees, currentUser } = useApp();
  const { mensagens, carregarMensagens, enviarMensagem, equipeCompras } = useCompras();
  const [texto, setTexto] = useState('');
  const [interna, setInterna] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const lista = (mensagens[p.id] || []).filter((m) => equipeCompras || !m.interna);

  useEffect(() => {
    void carregarMensagens(p.id);
    // Recarrega só ao trocar de pedido
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  // Nome: cadastro (T.I./RH) ou os nomes que o pedido já traz (quem pediu e o gestor)
  const nome = (id?: string) =>
    employees.find((e) => e.id === id)?.nome || (id === p.solicitanteId ? p.solicitanteNome : id === p.gestorId ? p.gestorNome : undefined) || (id === currentUser?.id ? 'Você' : 'Equipe');

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    const r = await enviarMensagem(p.id, texto, interna, arquivo || undefined);
    setEnviando(false);
    if (r) return setErro(r);
    setErro('');
    setTexto('');
    setArquivo(null);
    setInterna(false);
  };

  return (
    <section className="cartao space-y-3 p-4">
      <h3 className="secao-titulo">Conversa ({lista.length})</h3>
      {lista.length === 0 ? (
        <p className="texto-aux">Nenhuma mensagem. Use para tirar dúvidas sobre o pedido.</p>
      ) : (
        <ol className="space-y-2">
          {lista.map((m) => {
            const minha = m.autorId === currentUser?.id;
            return (
              <li
                key={m.id}
                className={`rounded-lg border p-3 ${m.interna ? 'border-amber-200 bg-amber-50' : minha ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-white'}`}
              >
                <p className="text-slate-500">
                  <span className="font-semibold text-slate-800">{minha ? 'Você' : nome(m.autorId)}</span> · {quando(m.criadoEm)}
                  {m.interna && (
                    <span className="ml-1 inline-flex items-center gap-1 font-semibold text-amber-900">
                      <Lock className="ico-sm" aria-hidden="true" /> nota interna
                    </span>
                  )}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-slate-900">{m.texto}</p>
                {m.anexoCaminho && (
                  <div className="mt-2">
                    <AbrirArquivo caminho={m.anexoCaminho} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {!['recebido', 'cancelado'].includes(p.status) && (
        <form onSubmit={enviar} className="space-y-2">
          <label htmlFor={`conversa-${p.id}`} className="sr-only">
            Mensagem
          </label>
          <textarea
            id={`conversa-${p.id}`}
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={equipeCompras ? 'Escreva para quem pediu (ou marque nota interna)' : 'Escreva para a T.I. e Compras'}
            className="campo"
          />
          <div className="flex flex-wrap items-center gap-3">
            {equipeCompras && (
              <>
                <label className="inline-flex items-center gap-2 text-slate-700">
                  <input type="checkbox" checked={interna} onChange={(e) => setInterna(e.target.checked)} /> Nota interna (só T.I. e Compras)
                </label>
                <label className="btn btn-sm btn-secundario cursor-pointer">
                  <Paperclip /> {arquivo ? arquivo.name : 'Anexar'}
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      const invalido = f ? validarArquivo(f) : null;
                      setErro(invalido || '');
                      setArquivo(invalido ? null : f);
                    }}
                  />
                </label>
              </>
            )}
            <button type="submit" disabled={enviando || !texto.trim()} className="btn btn-sm btn-primario ml-auto">
              <Send /> {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
          {erro && (
            <p role="alert" className="erro">
              {erro}
            </p>
          )}
        </form>
      )}
    </section>
  );
};
