import React, { useState } from 'react';
import { History, Pencil, Plus, Trash2, Phone } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import type { LinhaTelefonica } from '../../types/index.ts';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { formatCurrency, formatDate } from '../../utils/formatters.ts';
import { nomeContrato } from '../../utils/contratos.ts';
import { TIPOS_COM_LINHAS } from '../../utils/financeiro.ts';
import { normalizar } from '../../utils/processos.ts';
import { confirmar } from '../ui/dialogo.tsx';
import { Janela } from '../ui/Janela.tsx';
import { Vazio } from '../ui/Tela.tsx';

const ROTULO_STATUS: Record<LinhaTelefonica['status'], string> = { ativa: 'Ativa', suspensa: 'Suspensa', cancelada: 'Cancelada' };
const SELO_STATUS: Record<LinhaTelefonica['status'], string> = { ativa: 'selo-ok', suspensa: 'selo-atencao', cancelada: 'selo-neutro' };

/**
 * Seção 6 · Linhas de celular/fixo, tratadas como assentos: pessoa, aparelho,
 * contrato e histórico de quem usou. `contratoId` filtra (dentro do contrato).
 */
export const LinhasLista: React.FC<{
  busca?: string;
  contratoId?: string;
  /** Quando a tela dona controla o filtro e o botão "Nova linha" (LinhasView), a barra interna some */
  mostrarCanceladas?: boolean;
  novaAberta?: boolean;
  onFecharNova?: () => void;
}> = ({ busca = '', contratoId, mostrarCanceladas: canceladasExterno, novaAberta = false, onFecharNova }) => {
  const { employees, assets, contratos, currentRole, abrirFicha } = useApp();
  const { linhas, atribuicoesLinha, salvarLinha, excluirLinha } = useRecursos();
  const [editando, setEditando] = useState<LinhaTelefonica | 'nova' | null>(null);
  const [historico, setHistorico] = useState<string | null>(null);
  const [canceladasInterno, setCanceladasInterno] = useState(false);
  const controlada = canceladasExterno !== undefined;
  const mostrarCanceladas = controlada ? canceladasExterno : canceladasInterno;
  const [erro, setErro] = useState('');
  const fecharForm = () => {
    setEditando(null);
    onFecharNova?.();
  };
  const formAberto = editando !== null || novaAberta;
  const linhaEmEdicao = editando && editando !== 'nova' ? editando : undefined;

  const nomePessoa = (id?: string) => employees.find((e) => e.id === id)?.nome || '';
  const lista = linhas
    .filter((l) => (contratoId ? l.contratoId === contratoId : true))
    .filter((l) => mostrarCanceladas || l.status !== 'cancelada')
    .filter((l) => {
      if (!busca) return true;
      const c = contratos.find((x) => x.id === l.contratoId);
      return normalizar(`${l.numero} ${l.plano || ''} ${nomePessoa(l.colaboradorId)} ${c ? nomeContrato(c) : ''}`).includes(busca);
    });

  return (
    <div className="space-y-3">
      {!controlada && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={mostrarCanceladas} onChange={(e) => setCanceladasInterno(e.target.checked)} /> Mostrar canceladas
          </label>
          <button type="button" onClick={() => setEditando('nova')} className="btn btn-secundario">
            <Plus /> Nova linha
          </button>
        </div>
      )}

      {formAberto && (
        <FormLinha
          linha={linhaEmEdicao}
          contratoFixo={contratoId}
          onSalvar={async (dados) => {
            const r = await salvarLinha(dados);
            if (r.erro) return r.erro;
            fecharForm();
            return null;
          }}
          onCancelar={fecharForm}
        />
      )}
      {erro && <p className="erro" role="alert">{erro}</p>}

      {lista.length === 0 ? (
        <Vazio>Nenhuma linha cadastrada.</Vazio>
      ) : (
        <div className="cartao overflow-hidden">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Número</th>
                <th>Pessoa</th>
                <th className="hidden xl:table-cell">Aparelho</th>
                {!contratoId && <th>Contrato</th>}
                <th>Situação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => {
                const aparelho = assets.find((a) => a.id === l.ativoId);
                const contrato = contratos.find((c) => c.id === l.contratoId);
                const pessoa = employees.find((e) => e.id === l.colaboradorId);
                return (
                  <React.Fragment key={l.id}>
                    <tr className={l.status === 'cancelada' ? 'opacity-60' : ''}>
                      <td data-label="Número" className="font-mono font-semibold text-slate-900">
                        {l.numero}
                        {(l.plano || l.franquia) && <span className="block font-sans font-normal text-slate-500">{[l.plano, l.franquia].filter(Boolean).join(' · ')}</span>}
                      </td>
                      <td data-label="Pessoa">
                        {pessoa ? (
                          <button type="button" onClick={() => abrirFicha({ tipo: 'colaborador', id: pessoa.id })} className="text-blue-700 hover:underline">
                            {pessoa.nome}
                          </button>
                        ) : (
                          <span className="text-slate-500">Em estoque</span>
                        )}
                        {pessoa?.status === 'desligado' && <span className="block text-red-700">Pessoa desligada</span>}
                      </td>
                      <td data-label="Aparelho" className="hidden xl:table-cell">
                        {aparelho ? (
                          <button type="button" onClick={() => abrirFicha({ tipo: 'ativo', id: aparelho.id })} className="text-blue-700 hover:underline">
                            {aparelho.tag}
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                      {!contratoId && (
                        <td data-label="Contrato">
                          {contrato ? nomeContrato(contrato) : l.valorMensal ? `Avulsa · ${formatCurrency(l.valorMensal)}/mês` : '-'}
                        </td>
                      )}
                      <td data-label="Situação">
                        <span className={`selo ${SELO_STATUS[l.status]}`}>{ROTULO_STATUS[l.status]}</span>
                      </td>
                      <td data-label="Ações" className="text-right">
                        <span className="acoes-linha">
                          <button type="button" onClick={() => setEditando(l)} aria-label={`Editar ${l.numero}`} className="btn btn-sm btn-secundario">
                            <Pencil /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistorico(historico === l.id ? null : l.id)}
                            title="Histórico de uso"
                            aria-label={`Histórico de uso de ${l.numero}`}
                            className="btn-icone"
                          >
                            <History />
                          </button>
                          {currentRole === 'ti_admin' && (
                            <button
                              type="button"
                              title="Excluir"
                              aria-label={`Excluir ${l.numero}`}
                              onClick={async () => {
                                if ((await confirmar(`Excluir a linha ${l.numero}? Esta ação não pode ser desfeita.`))) setErro((await excluirLinha(l.id)) || '');
                              }}
                              className="btn-icone btn-icone-perigo"
                            >
                              <Trash2 />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                    {historico === l.id && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50">
                          {atribuicoesLinha.filter((a) => a.linhaId === l.id).length === 0 ? (
                            <p className="text-slate-500">Sem histórico de uso.</p>
                          ) : (
                            <ul className="space-y-1">
                              {atribuicoesLinha
                                .filter((a) => a.linhaId === l.id)
                                .map((a) => (
                                  <li key={a.id}>
                                    {nomePessoa(a.colaboradorId) || 'Pessoa'} · {a.inicio ? formatDate(a.inicio.slice(0, 10)) : 'antes do histórico'} até{' '}
                                    {a.fim ? formatDate(a.fim.slice(0, 10)) : 'hoje'}
                                  </li>
                                ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const FormLinha: React.FC<{
  linha?: LinhaTelefonica;
  contratoFixo?: string;
  onSalvar: (d: Omit<LinhaTelefonica, 'id' | 'criadoEm'> & { id?: string }) => Promise<string | null>;
  onCancelar: () => void;
}> = ({ linha, contratoFixo, onSalvar, onCancelar }) => {
  const { employees, assets, contratos } = useApp();
  const { linhas } = useRecursos();
  const [d, setD] = useState({
    numero: linha?.numero || '',
    tipo: linha?.tipo || ('movel' as LinhaTelefonica['tipo']),
    contratoId: linha?.contratoId || contratoFixo || '',
    plano: linha?.plano || '',
    franquia: linha?.franquia || '',
    chip: linha?.chip || '',
    ativoId: linha?.ativoId || '',
    colaboradorId: linha?.colaboradorId || '',
    status: linha?.status || ('ativa' as LinhaTelefonica['status']),
    valorMensal: linha?.valorMensal != null ? String(linha.valorMensal) : '',
    centroCusto: linha?.centroCusto || '',
    observacoes: linha?.observacoes || '',
  });
  const [erro, setErro] = useState('');
  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));
  const contratosTel = contratos.filter((c) => TIPOS_COM_LINHAS.includes(c.tipo) && c.status !== 'encerrado');
  const celulares = assets.filter((a) => a.categoria === 'telefonia' && a.status !== 'descartado');
  // Aparelho já usado por outra linha ativa: aviso (não bloqueia — dual chip existe)
  const aparelhoEmUso = d.ativoId && linhas.some((l) => l.id !== linha?.id && l.ativoId === d.ativoId && l.status !== 'cancelada');

  // Ao escolher o aparelho, sugere a pessoa que está com ele
  const escolherAparelho = (id: string) => {
    const a = assets.find((x) => x.id === id);
    setD((p) => ({ ...p, ativoId: id, colaboradorId: p.colaboradorId || a?.custodianteId || '' }));
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const falha = await onSalvar({
      id: linha?.id,
      numero: d.numero,
      tipo: d.tipo,
      contratoId: d.contratoId || undefined,
      plano: d.plano || undefined,
      franquia: d.franquia || undefined,
      chip: d.chip || undefined,
      ativoId: d.ativoId || undefined,
      colaboradorId: d.colaboradorId || undefined,
      status: d.status,
      valorMensal: d.valorMensal === '' ? undefined : Number(d.valorMensal),
      centroCusto: d.centroCusto || undefined,
      observacoes: d.observacoes || undefined,
    });
    if (falha) setErro(falha);
  };

  return (
    <Janela
      tamanho="p"
      titulo={linha ? `Editar linha ${linha.numero}` : 'Nova linha'}
      subtitulo="Número, plano, aparelho e pessoa"
      icone={<Phone className="h-4 w-4" />}
      onFechar={onCancelar}
      idTitulo="janela-linha"
      rodape={
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancelar} className="btn btn-secundario">Cancelar</button>
          <button type="submit" form="form-linha" className="btn btn-primario">Salvar</button>
        </div>
      }
    >
    <form id="form-linha" onSubmit={salvar} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="ln-num" className={CLASSE_ROTULO}>Número *</label>
          <input id="ln-num" required value={d.numero} onChange={(e) => set('numero', e.target.value)} className={`${CLASSE_CAMPO} font-mono`} placeholder="(11) 99999-0000" />
        </div>
        <div>
          <label htmlFor="ln-tipo" className={CLASSE_ROTULO}>Tipo</label>
          <select id="ln-tipo" value={d.tipo} onChange={(e) => set('tipo', e.target.value)} className={CLASSE_CAMPO}>
            <option value="movel">Celular</option>
            <option value="fixa">Fixa</option>
          </select>
        </div>
        <div>
          <label htmlFor="ln-status" className={CLASSE_ROTULO}>Situação</label>
          <select id="ln-status" value={d.status} onChange={(e) => set('status', e.target.value)} className={CLASSE_CAMPO}>
            {Object.entries(ROTULO_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        {!contratoFixo && (
          <div className="sm:col-span-2">
            <label htmlFor="ln-ctr" className={CLASSE_ROTULO}>Contrato da operadora</label>
            <select id="ln-ctr" value={d.contratoId} onChange={(e) => set('contratoId', e.target.value)} className={CLASSE_CAMPO}>
              <option value="">Sem contrato (linha avulsa)</option>
              {contratosTel.map((c) => (
                <option key={c.id} value={c.id}>{nomeContrato(c)}</option>
              ))}
            </select>
          </div>
        )}
        {!d.contratoId && (
          <div>
            <label htmlFor="ln-valor" className={CLASSE_ROTULO}>Valor mensal (R$)</label>
            <input id="ln-valor" type="number" min={0} step="0.01" value={d.valorMensal} onChange={(e) => set('valorMensal', e.target.value)} className={CLASSE_CAMPO} />
          </div>
        )}
        <div>
          <label htmlFor="ln-plano" className={CLASSE_ROTULO}>Plano</label>
          <input id="ln-plano" value={d.plano} onChange={(e) => set('plano', e.target.value)} className={CLASSE_CAMPO} />
        </div>
        <div>
          <label htmlFor="ln-franq" className={CLASSE_ROTULO}>Franquia</label>
          <input id="ln-franq" value={d.franquia} onChange={(e) => set('franquia', e.target.value)} className={CLASSE_CAMPO} placeholder="Ex.: 20 GB" />
        </div>
        <div>
          <label htmlFor="ln-chip" className={CLASSE_ROTULO}>Chip (ICCID)</label>
          <input id="ln-chip" value={d.chip} onChange={(e) => set('chip', e.target.value)} className={`${CLASSE_CAMPO} font-mono`} />
        </div>
        <div>
          <label htmlFor="ln-aparelho" className={CLASSE_ROTULO}>Aparelho</label>
          <select id="ln-aparelho" value={d.ativoId} onChange={(e) => escolherAparelho(e.target.value)} className={CLASSE_CAMPO}>
            <option value="">—</option>
            {celulares.map((a) => (
              <option key={a.id} value={a.id}>{a.tag} · {a.nome}</option>
            ))}
          </select>
          {aparelhoEmUso && <p className="ajuda text-amber-800">Este aparelho já tem outra linha ativa.</p>}
        </div>
        <div>
          <label htmlFor="ln-pessoa" className={CLASSE_ROTULO}>Pessoa</label>
          <select id="ln-pessoa" value={d.colaboradorId} onChange={(e) => set('colaboradorId', e.target.value)} className={CLASSE_CAMPO} disabled={d.status === 'cancelada'}>
            <option value="">Em estoque (sem pessoa)</option>
            {employees
              .filter((e) => e.status !== 'desligado' || e.id === d.colaboradorId)
              .map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="ln-cc" className={CLASSE_ROTULO}>Área / centro de custo</label>
          <input id="ln-cc" value={d.centroCusto} onChange={(e) => set('centroCusto', e.target.value)} className={CLASSE_CAMPO} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ln-obs" className={CLASSE_ROTULO}>Observações</label>
          <textarea id="ln-obs" rows={2} value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} className={CLASSE_CAMPO} />
        </div>
      </div>
      {erro && <p className="erro" role="alert">{erro}</p>}
    </form>
    </Janela>
  );
};
