import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ExternalLink, Plus, ShieldCheck, XCircle } from 'lucide-react';
import { comQuemEstava } from '../../utils/vinculos.ts';
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
import { Dado } from '../ui/Janela.tsx';
import { Vazio } from '../ui/Tela.tsx';

const SELO_STATUS: Record<StatusManutencao, string> = {
  em_andamento: 'selo-atencao',
  concluida: 'selo-ok',
  cancelada: 'selo-neutro',
};

/** Fase 9: chamado e pessoas da manutenção abrem a ficha por cima */
const LINK = 'link inline-flex items-center gap-0.5';

/**
 * Fase 8: manutenções do ativo (só a T.I.), da mais recente para a mais antiga,
 * com total gasto e custo acumulado. A manutenção em andamento tem "Concluir"
 * e "Cancelar"; "Registrar manutenção já feita" lança histórico sem mudar o status.
 */
export const ManutencoesAtivo: React.FC<{ asset: Asset; podeEditar: boolean }> = ({ asset, podeEditar }) => {
  const { fornecedores, contratos, tickets, employees, setSelectedTicketIdForDetail, setSelectedEmployeeIdFor360 } = useApp();
  const [form, setForm] = useState<{ modo: ModoManutencao; manutencao?: Manutencao } | null>(null);

  const lista = manutencoesOrdenadas(asset.historicoManutencao);
  const nomeFornecedor = (id?: string) => (id ? fornecedores.find((f) => f.id === id)?.nome || 'Fornecedor removido' : 'T.I. interna');
  const contrato = (id?: string) => contratos.find((c) => c.id === id);
  const chamado = (id?: string) => tickets.find((t) => t.id === id);

  return (
    <div className="space-y-4">
      <section className="cartao space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="secao-titulo">Custos de manutenção</h3>
          {podeEditar && (
            <button type="button" onClick={() => setForm({ modo: 'feita' })} className="btn btn-sm btn-secundario">
              <Plus aria-hidden="true" /> Registrar manutenção já feita
            </button>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Dado rotulo="Manutenções">{lista.length}</Dado>
          <Dado rotulo="Total gasto">
            <span className="font-mono">{formatCurrency(totalGastoManutencoes(lista))}</span>
          </Dado>
          <Dado rotulo="Custo acumulado (compra + manutenções)">
            <span className="font-mono">{formatCurrency(custoAcumulado(asset))}</span>
          </Dado>
        </dl>
      </section>

      {lista.length === 0 ? (
        <Vazio>Nenhuma manutenção registrada.</Vazio>
      ) : (
        <ul className="space-y-3">
          {lista.map((m) => {
            const ct = contrato(m.contratoId);
            const tk = chamado(m.chamadoId);
            const arquivos = (asset.anexos || []).filter((a) => a.manutencaoId === m.id);
            // Fase 9: com quem estava o equipamento no dia e quem abriu (ambos abrem a ficha da pessoa)
            const comQuem = comQuemEstava(asset, m.abertaEm);
            const abriu = m.criadoPor ? employees.find((e) => e.id === m.criadoPor) : undefined;
            return (
              <li key={m.id} className="cartao space-y-2 p-4 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-slate-700">{ROTULO_TIPO_MANUTENCAO[m.tipo]}</span>
                      <span className={`selo ${SELO_STATUS[m.status]}`}>{ROTULO_STATUS_MANUTENCAO[m.status]}</span>
                      {m.cobertoGarantia && (
                        <span className="selo selo-ok">
                          <ShieldCheck aria-hidden="true" /> Coberto pela garantia
                        </span>
                      )}
                    </p>
                    <p className="font-semibold break-words text-slate-900">{m.descricao}</p>
                  </div>
                  <span className={`text-right font-mono font-semibold text-slate-800 ${m.status === 'cancelada' ? 'text-slate-500 line-through' : ''}`}>
                    {formatCurrency(m.custo)}
                    {m.status === 'em_andamento' && <span className="block font-sans font-normal text-slate-500">estimado</span>}
                  </span>
                </div>

                <p className="break-words text-slate-600">
                  {nomeFornecedor(m.fornecedorId)}
                  {m.numeroOs && (
                    <>
                      {' '}
                      · OS <span className="font-mono">{m.numeroOs}</span>
                    </>
                  )}
                  {' · '}Aberta em {formatDate(m.abertaEm)}
                  {m.status === 'concluida' && ` · Concluída em ${formatDate(m.concluidaEm)}`}
                  {m.status === 'em_andamento' && m.previsao && ` · Previsão ${formatDate(m.previsao)}`}
                  {m.status === 'cancelada' && m.encerradoEm && ` · Cancelada em ${formatDate(m.encerradoEm)}`}
                </p>
                {(ct || tk) && (
                  <p className="break-words text-slate-600">
                    {ct && <>Contrato: {nomeContrato(ct)}</>}
                    {ct && tk && ' · '}
                    {tk && (
                      <>
                        Chamado:{' '}
                        <button type="button" onClick={() => setSelectedTicketIdForDetail(tk.id)} className={LINK}>
                          <span className="font-mono">{tk.codigo}</span>
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </p>
                )}
                {(comQuem || abriu) && (
                  <p className="break-words text-slate-600">
                    {comQuem && (
                      <>
                        {comQuem.devolvidoEm ? 'Último a usar' : 'Com'}:{' '}
                        <button type="button" onClick={() => setSelectedEmployeeIdFor360(comQuem.colaboradorId)} className={LINK}>
                          {comQuem.colaboradorNome}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </button>
                        {comQuem.devolvidoEm && ` (devolvido em ${formatDate(comQuem.devolvidoEm)})`}
                      </>
                    )}
                    {comQuem && abriu && ' · '}
                    {abriu && (
                      <>
                        Aberta por:{' '}
                        <button type="button" onClick={() => setSelectedEmployeeIdFor360(abriu.id)} className={LINK}>
                          {abriu.nome}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </p>
                )}
                {m.observacoes && <p className="break-words whitespace-pre-wrap text-slate-700">{m.observacoes}</p>}
                {arquivos.length > 0 && (
                  <ul className="flex flex-wrap gap-x-2 gap-y-1">
                    {arquivos.map((a) => (
                      <li key={a.id} className="min-w-0">
                        <AbrirArquivo caminho={a.caminho} rotulo={`${ROTULO_CATEGORIA_ANEXO[a.categoria]}: ${a.nome}`} />
                      </li>
                    ))}
                  </ul>
                )}

                {podeEditar && m.status === 'em_andamento' && (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                    <button type="button" onClick={() => setForm({ modo: 'cancelar', manutencao: m })} className="btn btn-sm btn-perigo">
                      <XCircle aria-hidden="true" /> Cancelar
                    </button>
                    <button type="button" onClick={() => setForm({ modo: 'concluir', manutencao: m })} className="btn btn-sm btn-primario">
                      <CheckCircle2 aria-hidden="true" /> Concluir
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

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
