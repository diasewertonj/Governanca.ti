/**
 * Seção 30 · Contatos do site (formulário "Quero conhecer" da landing). Só o administrador vê;
 * marca como atendido ou apaga. Sem o Supabase (demonstração), avisa que não há contatos.
 */
import React, { useEffect, useState } from 'react';
import { Check, Mail, Trash2 } from 'lucide-react';
import { supabase } from '../../services/supabase.ts';
import { confirmar } from '../ui/dialogo.tsx';
import { Vazio } from '../ui/Tela.tsx';

interface ContatoSite {
  id: string;
  nome: string;
  empresa: string | null;
  email: string;
  telefone: string | null;
  mensagem: string | null;
  atendido: boolean;
  criado_em: string;
}

export const ContatosSite: React.FC = () => {
  const [lista, setLista] = useState<ContatoSite[] | null>(null);
  const [erro, setErro] = useState('');
  const [verAtendidos, setVerAtendidos] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let vivo = true;
    supabase
      .from('contatos_site' as never)
      .select('*')
      .order('criado_em', { ascending: false })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) setErro(/contatos_site|PGRST205|42P01/i.test(`${error.code} ${error.message}`) ? 'Rode o SQL dos contatos do site para ver a lista.' : error.message);
        else setLista((data as unknown as ContatoSite[]) || []);
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!supabase) return <Vazio>Os contatos do site aparecem aqui com o sistema conectado ao banco.</Vazio>;
  if (erro) return <p className="erro">{erro}</p>;
  if (!lista) return <p className="texto-aux">Carregando…</p>;

  const atender = async (c: ContatoSite) => {
    const { error } = await supabase!.from('contatos_site' as never).update({ atendido: !c.atendido } as never).eq('id', c.id);
    if (error) return setErro(error.message);
    setLista((l) => (l || []).map((x) => (x.id === c.id ? { ...x, atendido: !x.atendido } : x)));
  };
  const apagar = async (c: ContatoSite) => {
    if (!(await confirmar({ titulo: `Apagar o contato de ${c.nome}?`, mensagem: 'Não dá para desfazer.', confirmar: 'Apagar', cancelar: 'Voltar', perigo: true }))) return;
    const { error } = await supabase!.from('contatos_site' as never).delete().eq('id', c.id);
    if (error) return setErro(error.message);
    setLista((l) => (l || []).filter((x) => x.id !== c.id));
  };

  const visiveis = lista.filter((c) => verAtendidos || !c.atendido);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="texto-aux">Pedidos do formulário "Quero conhecer" da página inicial. {lista.filter((c) => !c.atendido).length} sem atendimento.</p>
        <label className="inline-flex items-center gap-2 text-slate-700">
          <input type="checkbox" checked={verAtendidos} onChange={(e) => setVerAtendidos(e.target.checked)} /> Mostrar atendidos
        </label>
      </div>
      {visiveis.length === 0 ? (
        <Vazio>Nenhum contato {verAtendidos ? '' : 'sem atendimento '}por enquanto.</Vazio>
      ) : (
        <div className="cartao-tabela">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>Mensagem</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => (
                <tr key={c.id} className={c.atendido ? 'opacity-60' : undefined}>
                  <td data-label="Quando" className="num">{new Date(c.criado_em).toLocaleString('pt-BR')}</td>
                  <td data-label="Quem">
                    <span className="font-semibold text-slate-900">{c.nome}</span>
                    {c.empresa && <span className="block text-slate-500">{c.empresa}</span>}
                    <a href={`mailto:${c.email}`} className="link inline-flex items-center gap-1">
                      <Mail className="ico-sm" aria-hidden="true" /> {c.email}
                    </a>
                    {c.telefone && <span className="block text-slate-500">{c.telefone}</span>}
                  </td>
                  <td data-label="Mensagem" className="whitespace-pre-line">{c.mensagem || '—'}</td>
                  <td data-label="Ações" className="col-acoes">
                    <span className="acoes-linha">
                      <button type="button" onClick={() => atender(c)} className="btn btn-sm btn-secundario">
                        <Check /> {c.atendido ? 'Reabrir' : 'Atendido'}
                      </button>
                      <button type="button" onClick={() => apagar(c)} aria-label={`Apagar o contato de ${c.nome}`} title="Apagar" className="btn-icone btn-icone-perigo">
                        <Trash2 />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
