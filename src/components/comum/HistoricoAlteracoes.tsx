import React, { useState } from 'react';
import { History } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { fetchEventosCadastroDb } from '../../services/supabaseDb.ts';
import type { EventoCadastro } from '../../types/index.ts';

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

const mostrar = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/**
 * Seção 6 · Histórico de alterações de um cadastro (quem, quando, antes → depois).
 * Carrega só ao abrir. Só a T.I. lê (RLS). Na demonstração não há histórico.
 */
export const HistoricoAlteracoes: React.FC<{ entidade: string; registro: string }> = ({ entidade, registro }) => {
  const { employees, isSupabaseConnected } = useApp();
  const [aberto, setAberto] = useState(false);
  const [eventos, setEventos] = useState<EventoCadastro[] | null>(null);

  const abrir = async () => {
    setAberto(!aberto);
    if (!aberto && eventos === null) setEventos(await fetchEventosCadastroDb(entidade, registro));
  };
  const nome = (id?: string) => employees.find((e) => e.id === id)?.nome || 'Sistema';

  return (
    <div className="border border-slate-200 rounded-xl p-3 text-xs">
      <button type="button" onClick={abrir} className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
        <History className="w-3.5 h-3.5" /> {aberto ? 'Ocultar histórico de alterações' : 'Ver histórico de alterações'}
      </button>
      {aberto && (
        <div className="mt-2 space-y-2">
          {!isSupabaseConnected && <p className="text-slate-500">Na demonstração o histórico não é gravado.</p>}
          {eventos && eventos.length === 0 && isSupabaseConnected && <p className="text-slate-500">Nenhuma alteração registrada.</p>}
          {eventos?.map((ev) => (
            <div key={ev.id} className="border-l-2 border-slate-200 pl-2">
              <p className="text-slate-600">
                {new Date(ev.em).toLocaleString('pt-BR')} · {nome(ev.por)} · {ev.acao}
              </p>
              {ev.acao === 'alterado' && ev.depois && (
                <ul className="text-slate-700">
                  {Object.keys(ev.depois)
                    .filter((k) => !IGNORAR.has(k))
                    .map((k) => (
                      <li key={k}>
                        {ROTULO_CAMPO[k] || k}: {mostrar(ev.antes?.[k])} → {mostrar(ev.depois?.[k])}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
