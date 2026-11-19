import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { fetchEventosCadastroDb } from '../../services/supabaseDb.ts';
import type { EventoCadastro } from '../../types/index.ts';
import { Vazio } from '../ui/Tela.tsx';

/** Campos técnicos que não interessam a quem lê o histórico */
const IGNORAR = new Set(['id', 'criado_em', 'criado_por', 'colaboradores_ids']);

const ROTULO_CAMPO: Record<string, string> = {
  nome: 'Nome',
  fornecedor_id: 'Fornecedor',
  valor: 'Valor',
  valor_mensal: 'Valor',
  inicio: 'Início',
  fim: 'Fim',
  data_renovacao: 'Renovação',
  status: 'Situação',
  forma_cobranca: 'Como é pago',
  periodicidade: 'Periodicidade',
  tipo_cobranca: 'Periodicidade',
  numero: 'Número',
  descricao: 'Descrição',
  assentos_totais: 'Assentos',
  vencimento: 'Vencimento',
  competencia: 'Competência',
  pago_em: 'Pago em',
  encerramento_motivo: 'Motivo do encerramento',
};

const ROTULO_ACAO: Record<EventoCadastro['acao'], { texto: string; selo: string }> = {
  criado: { texto: 'Criado', selo: 'selo-ok' },
  alterado: { texto: 'Alterado', selo: 'selo-info' },
  excluido: { texto: 'Excluído', selo: 'selo-problema' },
};

const mostrar = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/**
 * Seção 6 · Histórico de alterações de um cadastro (quem, quando, antes → depois).
 * Carrega só ao abrir. Só a T.I. lê (RLS). Na demonstração não há histórico.
 * `semBotao`: já abre carregado (aba "Histórico" das fichas).
 */
export const HistoricoAlteracoes: React.FC<{ entidade: string; registro: string; semBotao?: boolean }> = ({
  entidade,
  registro,
  semBotao = false,
}) => {
  const { employees, isSupabaseConnected } = useApp();
  const [aberto, setAberto] = useState(semBotao);
  const [eventos, setEventos] = useState<EventoCadastro[] | null>(null);

  // Aba "Histórico": carrega ao montar (a aba só monta quando é aberta)
  useEffect(() => {
    if (!semBotao) return;
    let vivo = true;
    void fetchEventosCadastroDb(entidade, registro).then((lista) => {
      if (vivo) setEventos(lista);
    });
    return () => {
      vivo = false;
    };
  }, [semBotao, entidade, registro]);

  const abrir = async () => {
    setAberto(!aberto);
    if (!aberto && eventos === null) setEventos(await fetchEventosCadastroDb(entidade, registro));
  };
  const nome = (id?: string) => employees.find((e) => e.id === id)?.nome || 'Sistema';

  const lista = (
    <div className="space-y-2">
      {!isSupabaseConnected && <Vazio>Na demonstração o histórico não é gravado.</Vazio>}
      {isSupabaseConnected && eventos === null && <p className="texto-aux">Carregando histórico…</p>}
      {eventos && eventos.length === 0 && isSupabaseConnected && <Vazio>Nenhuma alteração registrada.</Vazio>}
      {eventos && eventos.length > 0 && (
        <ol className="cartao divide-y divide-slate-100">
          {eventos.map((ev) => {
            const acao = ROTULO_ACAO[ev.acao];
            const campos =
              ev.acao === 'alterado' && ev.depois ? Object.keys(ev.depois).filter((k) => !IGNORAR.has(k)) : [];
            return (
              <li key={ev.id} className="space-y-1 px-4 py-3">
                <p className="flex flex-wrap items-center gap-2 text-slate-600">
                  <span className={`selo ${acao?.selo || 'selo-neutro'}`}>{acao?.texto || ev.acao}</span>
                  <span className="font-semibold text-slate-900">{nome(ev.por)}</span>
                  <span>{new Date(ev.em).toLocaleString('pt-BR')}</span>
                </p>
                {campos.length > 0 && (
                  <ul className="space-y-0.5 text-slate-700">
                    {campos.map((k) => (
                      <li key={k} className="break-words">
                        <span className="text-slate-500">{ROTULO_CAMPO[k] || k}:</span> {mostrar(ev.antes?.[k])} →{' '}
                        <span className="font-semibold text-slate-900">{mostrar(ev.depois?.[k])}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  if (semBotao) {
    return (
      <section className="space-y-2">
        <h3 className="secao-titulo">Histórico de alterações</h3>
        {lista}
      </section>
    );
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={abrir} aria-expanded={aberto} className="btn btn-sm btn-discreto">
        <History /> {aberto ? 'Ocultar histórico de alterações' : 'Ver histórico de alterações'}
      </button>
      {aberto && lista}
    </div>
  );
};
