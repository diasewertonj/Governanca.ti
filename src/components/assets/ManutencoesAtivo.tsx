import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Plus, ShieldCheck, Wrench, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Asset, Manutencao, StatusManutencao } from '../../types/index.ts';
import { formatCurrency, formatDate } from '../../utils/formatters.ts';
import { nomeContrato } from '../../utils/contratos.ts';
import {
  ROTULO_STATUS_MANUTENCAO,
  ROTULO_TIPO_MANUTENCAO,
  custoAcumulado,
  manutencoesOrdenadas,
  totalGastoManutencoes,
} from '../../utils/cicloVida.ts';
import { AbrirArquivo } from '../comum/AbrirArquivo.tsx';
import { ROTULO_CATEGORIA_ANEXO } from './AnexosAtivo.tsx';
import { FormManutencao, type ModoManutencao } from './FormManutencao.tsx';

const COR_STATUS: Record<StatusManutencao, string> = {
  em_andamento: 'text-amber-800 bg-amber-50 border-amber-200',
  concluida: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  cancelada: 'text-slate-600 bg-slate-100 border-slate-200',
};

const BOTAO_LINHA = 'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border';

/**
 * Fase 8: manutenções do ativo (só a T.I.), da mais recente para a mais antiga,
 * com total gasto e custo acumulado. A manutenção em andamento tem "Concluir"
 * e "Cancelar"; "Registrar manutenção já feita" lança histórico sem mudar o status.
 */
export const ManutencoesAtivo: React.FC<{ asset: Asset; podeEditar: boolean }> = ({ asset, podeEditar }) => {
  const { fornecedores, contratos, tickets } = useApp();
  const [form, setForm] = useState<{ modo: ModoManutencao; manutencao?: Manutencao } | null>(null);

  const lista = manutencoesOrdenadas(asset.historicoManutencao);
  const nomeFornecedor = (id?: string) => (id ? fornecedores.find((f) => f.id === id)?.nome || 'Fornecedor removido' : 'T.I. interna');
  const contrato = (id?: string) => contratos.find((c) => c.id === id);
  const chamado = (id?: string) => tickets.find((t) => t.id === id);

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-slate-600" aria-hidden="true" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Manutenções</h3>
          <span className="text-xs text-slate-500">({lista.length})</span>
        </div>
        <span className="text-xs text-slate-600">
          Total gasto:{' '}
          <span className="font-semibold font-mono text-slate-900">{formatCurrency(totalGastoManutencoes(lista))}</span>
        </span>
      </div>

      {lista.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma manutenção registrada.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((m) => {
            const ct = contrato(m.contratoId);
            const tk = chamado(m.chamadoId);
            const arquivos = (asset.anexos || []).filter((a) => a.manutencaoId === m.id);
            return (
              <li key={m.id} className="p-3 bg-slate-50 rounded-md border border-slate-200 text-xs space-y-1.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-slate-700">{ROTULO_TIPO_MANUTENCAO[m.tipo]}</span>
                      <span className={`inline-block px-1.5 py-0.5 rounded border text-xs font-medium ${COR_STATUS[m.status]}`}>
                        {ROTULO_STATUS_MANUTENCAO[m.status]}
                      </span>
                      {m.cobertoGarantia && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium text-emerald-700 bg-emerald-50 border-emerald-200">
                          <ShieldCheck className="w-3 h-3" aria-hidden="true" /> Coberto pela garantia
                        </span>
                      )}
                    </p>
                    <p className="font-semibold text-slate-900 mt-1 break-words">{m.descricao}</p>
                  </div>
                  <span className={`font-semibold font-mono text-slate-800 ${m.status === 'cancelada' ? 'line-through text-slate-500' : ''}`}>
                    {formatCurrency(m.custo)}
                    {m.status === 'em_andamento' && <span className="block text-right font-sans font-normal text-slate-500">estimado</span>}
                  </span>
                </div>

                <p className="text-slate-600 break-words">
                  {nomeFornecedor(m.fornecedorId)}
                  {m.numeroOs && <> · OS <span className="font-mono">{m.numeroOs}</span></>}
                  {' · '}Aberta em {formatDate(m.abertaEm)}
                  {m.status === 'concluida' && ` · Concluída em ${formatDate(m.concluidaEm)}`}
                  {m.status === 'em_andamento' && m.previsao && ` · Previsão ${formatDate(m.previsao)}`}
                  {m.status === 'cancelada' && m.encerradoEm && ` · Cancelada em ${formatDate(m.encerradoEm)}`}
                </p>
                {(ct || tk) && (
                  <p className="text-slate-600 break-words">
                    {ct && <>Contrato: {nomeContrato(ct)}</>}
                    {ct && tk && ' · '}
                    {tk && <>Chamado: {tk.codigo}</>}
                  </p>
                )}
                {m.observacoes && <p className="text-slate-700 whitespace-pre-wrap break-words">{m.observacoes}</p>}
                {arquivos.length > 0 && (
                  <ul className="flex flex-wrap gap-x-3 gap-y-1">
                    {arquivos.map((a) => (
                      <li key={a.id} className="min-w-0">
                        <AbrirArquivo caminho={a.caminho} rotulo={`${ROTULO_CATEGORIA_ANEXO[a.categoria]}: ${a.nome}`} />
                      </li>
                    ))}
                  </ul>
                )}

                {podeEditar && m.status === 'em_andamento' && (
                  <div className="flex flex-wrap justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setForm({ modo: 'concluir', manutencao: m })}
                      className={`${BOTAO_LINHA} text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Concluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ modo: 'cancelar', manutencao: m })}
                      className={`${BOTAO_LINHA} text-slate-700 bg-white border-slate-200 hover:bg-slate-50`}
                    >
                      <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> Cancelar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {podeEditar ? (
          <button
            type="button"
            onClick={() => setForm({ modo: 'feita' })}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Registrar manutenção já feita
          </button>
        ) : (
          <span />
        )}
        <span className="text-xs text-slate-600">
          Custo acumulado (compra + manutenções):{' '}
          <span className="font-semibold font-mono text-slate-900">{formatCurrency(custoAcumulado(asset))}</span>
        </span>
      </div>

      {/* No body: dentro da ficha (fundo com backdrop-filter e rolagem própria) a janela abriria
          fora da tela no celular, no alto da rolagem da ficha */}
      {form &&
        createPortal(
          <FormManutencao asset={asset} modo={form.modo} manutencao={form.manutencao} onClose={() => setForm(null)} />,
          document.body
        )}
    </div>
  );
};
