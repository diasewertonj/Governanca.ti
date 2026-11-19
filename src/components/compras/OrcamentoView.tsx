/**
 * Fase 11 · Financeiro › Orçamento: previsto anual por categoria × área (12 meses,
 * distribuição automática e ajuste mês a mês) e previsto × realizado.
 * Admin edita; T.I. só vê. Realizado = faturas pagas (valor efetivo) + compras de
 * equipamento pela data de aquisição (utils/compras.ts).
 */
import React, { useMemo, useState } from 'react';
import { Copy, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { CategoriaDespesa, Orcamento } from '../../types/index.ts';
import { ROTULO_CATEGORIA, baixarCsv, brl, paraCsv } from '../../utils/financeiro.ts';
import {
  MESES_CURTOS,
  copiarOrcamentos,
  distribuirMensal,
  lancamentosRealizados,
  resumoOrcamento,
  somaMeses,
  type LinhaOrcamento,
} from '../../utils/compras.ts';
import { CabecalhoTela, Vazio } from '../ui/Tela.tsx';
import { Janela } from '../ui/Janela.tsx';
import { CampoMoeda, CampoSugestoes } from '../ui/Campos.tsx';
import { confirmar } from '../ui/dialogo.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';

const CATEGORIAS = Object.keys(ROTULO_CATEGORIA) as CategoriaDespesa[];
const pct = (v?: number) => (v === undefined ? '—' : `${Math.round(v * 100)}%`);
const corPct = (v?: number) => (v === undefined ? 'bg-slate-300' : v >= 1 ? 'bg-red-600' : v >= 0.9 ? 'bg-amber-500' : 'bg-blue-600');

export const OrcamentoView: React.FC<{ abas?: React.ReactNode }> = ({ abas }) => {
  const { currentRole, faturas, contratos, licenses, assets, departments } = useApp();
  const { orcamentos, pedidos, salvarOrcamentos, excluirOrcamento } = useCompras();
  const isAdmin = currentRole === 'ti_admin';
  const anoAtual = new Date().getFullYear();
  const anos = useMemo(() => [...new Set([anoAtual - 1, anoAtual, anoAtual + 1, ...orcamentos.map((o) => o.ano)])].sort((a, b) => b - a), [orcamentos, anoAtual]);
  const [ano, setAno] = useState(anoAtual);
  const [fCategoria, setFCategoria] = useState<CategoriaDespesa | ''>('');
  const [visao, setVisao] = useState<'ano' | 'meses'>('ano');
  const [editando, setEditando] = useState<Orcamento | null>(null);
  const [copiando, setCopiando] = useState(false);
  const [erro, setErro] = useState('');

  const linhas = useMemo(() => {
    const lanc = lancamentosRealizados({ faturas, contratos, licencas: licenses, pedidos, ativos: assets, departamentos: departments }, ano);
    return resumoOrcamento(orcamentos, lanc, ano);
  }, [faturas, contratos, licenses, pedidos, assets, departments, orcamentos, ano]);
  const visiveis = linhas.filter((l) => !fCategoria || l.categoria === fCategoria);
  const total = visiveis.reduce(
    (s, l) => ({
      previsto: s.previsto + l.previsto,
      realizado: s.realizado + l.realizado,
      tendencia: s.tendencia + (l.tendencia || 0),
      previstoMeses: s.previstoMeses.map((v, i) => v + l.previstoMeses[i]),
      realizadoMeses: s.realizadoMeses.map((v, i) => v + l.realizadoMeses[i]),
    }),
    { previsto: 0, realizado: 0, tendencia: 0, previstoMeses: Array(12).fill(0) as number[], realizadoMeses: Array(12).fill(0) as number[] }
  );
  const usoTotal = total.previsto > 0 ? total.realizado / total.previsto : undefined;
  const areas = useMemo(
    () => [...new Set([...departments.map((d) => d.nome), ...orcamentos.map((o) => o.area), ...contratos.map((c) => c.centroCusto || ''), ...licenses.map((l) => l.centroCusto || '')].filter(Boolean))].sort(),
    [departments, orcamentos, contratos, licenses]
  );

  const nova = () =>
    setEditando({ id: `orc-${crypto.randomUUID()}`, ano, categoria: fCategoria || 'hardware', area: '', valorAnual: 0, meses: Array(12).fill(0) });
  const editar = (l: LinhaOrcamento) => {
    const o = orcamentos.find((x) => x.id === l.orcamentoId);
    setEditando(o ? { ...o, meses: o.meses.length === 12 ? [...o.meses] : distribuirMensal(o.valorAnual) } : { id: `orc-${crypto.randomUUID()}`, ano, categoria: l.categoria, area: l.area, valorAnual: 0, meses: Array(12).fill(0) });
  };
  const excluir = async (l: LinhaOrcamento) => {
    if (!l.orcamentoId) return;
    const ok = await confirmar({
      titulo: `Excluir o orçamento de ${ROTULO_CATEGORIA[l.categoria]}${l.area ? ` · ${l.area}` : ''} em ${ano}?`,
      mensagem: 'O previsto desta linha deixa de existir; o realizado continua aparecendo, sem previsto. Não dá para desfazer: cadastre de novo se precisar.',
      confirmar: 'Excluir',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (!ok) return;
    setErro((await excluirOrcamento(l.orcamentoId)) || '');
  };

  const exportar = () =>
    baixarCsv(
      `orcamento-${ano}.csv`,
      paraCsv(
        ['Categoria', 'Área', 'Mês', 'Previsto (R$)', 'Realizado (R$)'],
        visiveis.flatMap((l) => MESES_CURTOS.map((m, i) => [ROTULO_CATEGORIA[l.categoria], l.area || 'Geral', `${m}/${ano}`, l.previstoMeses[i], l.realizadoMeses[i]]))
      )
    );

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo="Orçamento"
        subtitulo={`Orçamento de ${ano}: previsto × realizado por categoria e área · realizado = faturas pagas e compras de equipamento${isAdmin ? '' : ' · só o administrador edita'}`}
        acoes={
          <>
            {isAdmin && (
              <>
                <button type="button" onClick={() => setCopiando(true)} className="btn btn-secundario">
                  <Copy /> Copiar do ano anterior
                </button>
                <button type="button" onClick={nova} className="btn btn-primario">
                  <Plus /> Nova linha
                </button>
              </>
            )}
            <button type="button" onClick={exportar} className="btn btn-secundario">
              <Download /> Exportar CSV
            </button>
          </>
        }
        abas={abas}
        filtros={
          <>
            <select aria-label="Ano" value={ano} onChange={(e) => setAno(Number(e.target.value))} className="campo campo-sm">
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select aria-label="Categoria" value={fCategoria} onChange={(e) => setFCategoria(e.target.value as CategoriaDespesa | '')} className="campo campo-sm">
              <option value="">Todas as categorias</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {ROTULO_CATEGORIA[c]}
                </option>
              ))}
            </select>
            <select aria-label="Visão" value={visao} onChange={(e) => setVisao(e.target.value as 'ano' | 'meses')} className="campo campo-sm">
              <option value="ano">Por categoria e área</option>
              <option value="meses">Mês a mês (total)</option>
            </select>
          </>
        }
      />
      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="cartao min-w-0 p-3">
          <p className="text-xs text-slate-500">Previsto no ano</p>
          <p className="font-mono text-lg font-semibold text-slate-900">{brl(total.previsto)}</p>
        </div>
        <div className="cartao min-w-0 p-3">
          <p className="text-xs text-slate-500">Realizado</p>
          <p className="font-mono text-lg font-semibold text-slate-900">{brl(total.realizado)}</p>
          <p className={`text-xs ${usoTotal !== undefined && usoTotal >= 0.9 ? 'text-red-700 font-semibold' : 'text-slate-500'}`}>{pct(usoTotal)} do previsto</p>
        </div>
        <div className="cartao min-w-0 p-3">
          <p className="text-xs text-slate-500">Saldo</p>
          <p className={`font-mono text-lg font-semibold ${total.previsto - total.realizado < 0 ? 'text-red-700' : 'text-slate-900'}`}>{brl(total.previsto - total.realizado)}</p>
        </div>
        <div className="cartao min-w-0 p-3">
          <p className="text-xs text-slate-500">Tendência até dezembro</p>
          <p className="font-mono text-lg font-semibold text-slate-900">{ano === anoAtual ? brl(total.tendencia) : '—'}</p>
          <p className="text-xs text-slate-500">{ano === anoAtual ? 'no ritmo de gasto atual' : 'só no ano corrente'}</p>
        </div>
      </div>

      {visao === 'ano' ? (
        visiveis.length === 0 ? (
          <Vazio acao={isAdmin ? <button type="button" onClick={nova} className="btn btn-sm btn-primario"><Plus /> Nova linha</button> : undefined}>
            Nenhum orçamento nem gasto em {ano}{fCategoria ? ` para ${ROTULO_CATEGORIA[fCategoria]}` : ''}.
          </Vazio>
        ) : (
          <div className="cartao overflow-hidden">
            <table className="tabela tabela-cartoes">
              <thead>
                <tr>
                  <th>Categoria · área</th>
                  <th className="text-right">Previsto</th>
                  <th className="text-right">Realizado</th>
                  <th>Uso</th>
                  <th className="text-right">Tendência</th>
                  {isAdmin && <th className="text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.chave}>
                    <td data-label="Categoria · área">
                      <span className="font-medium text-slate-900">{ROTULO_CATEGORIA[l.categoria]}</span>
                      <span className="block text-slate-500">{l.area || 'Geral (sem área)'}</span>
                      {!l.orcamentoId && <span className="selo selo-atencao mt-1">Sem orçamento</span>}
                    </td>
                    <td data-label="Previsto" className="text-right font-mono">{l.previsto ? brl(l.previsto) : '—'}</td>
                    <td data-label="Realizado" className="text-right font-mono">{brl(l.realizado)}</td>
                    <td data-label="Uso">
                      <div className="flex min-w-[8rem] items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${corPct(l.pct)}`} style={{ width: `${Math.min(100, (l.pct || 0) * 100)}%` }} />
                        </div>
                        <span className={`text-xs font-semibold ${l.pct !== undefined && l.pct >= 1 ? 'text-red-700' : l.pct !== undefined && l.pct >= 0.9 ? 'text-amber-800' : 'text-slate-700'}`}>{pct(l.pct)}</span>
                      </div>
                    </td>
                    <td data-label="Tendência" className={`text-right font-mono ${l.tendencia !== undefined && l.previsto > 0 && l.tendencia > l.previsto ? 'text-red-700' : ''}`}>
                      {l.tendencia !== undefined ? brl(l.tendencia) : '—'}
                    </td>
                    {isAdmin && (
                      <td data-label="Ações" className="text-right">
                        <span className="acoes-linha">
                          <button type="button" onClick={() => editar(l)} className="btn btn-sm btn-secundario">
                            {l.orcamentoId ? <><Pencil /> Editar</> : <><Plus /> Orçar</>}
                          </button>
                          {l.orcamentoId && (
                            <button type="button" onClick={() => excluir(l)} aria-label={`Excluir o orçamento de ${ROTULO_CATEGORIA[l.categoria]} ${l.area}`} title="Excluir" className="btn-icone btn-icone-perigo">
                              <Trash2 />
                            </button>
                          )}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="cartao overflow-hidden">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="text-right">Previsto</th>
                <th className="text-right">Realizado</th>
                <th className="text-right">Diferença</th>
                <th className="text-right">Acumulado (real/previsto)</th>
              </tr>
            </thead>
            <tbody>
              {MESES_CURTOS.map((m, i) => {
                const prevAc = total.previstoMeses.slice(0, i + 1).reduce((s, v) => s + v, 0);
                const realAc = total.realizadoMeses.slice(0, i + 1).reduce((s, v) => s + v, 0);
                const dif = total.previstoMeses[i] - total.realizadoMeses[i];
                return (
                  <tr key={m}>
                    <td data-label="Mês" className="capitalize">{m}/{ano}</td>
                    <td data-label="Previsto" className="text-right font-mono">{brl(total.previstoMeses[i])}</td>
                    <td data-label="Realizado" className="text-right font-mono">{brl(total.realizadoMeses[i])}</td>
                    <td data-label="Diferença" className={`text-right font-mono ${dif < 0 ? 'text-red-700' : ''}`}>{brl(dif)}</td>
                    <td data-label="Acumulado" className="text-right font-mono">{prevAc > 0 ? pct(realAc / prevAc) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormOrcamento
          inicial={editando}
          areas={areas}
          onClose={() => setEditando(null)}
          onSalvar={async (o) => {
            const r = await salvarOrcamentos([o]);
            if (!r) setEditando(null);
            return r;
          }}
        />
      )}
      {copiando && (
        <CopiarOrcamento
          anoDestino={ano}
          onClose={() => setCopiando(false)}
          onCopiar={async (origem, reajuste, base) => {
            const anoOrigem = ano - 1;
            const fonte: Orcamento[] =
              base === 'previsto'
                ? orcamentos
                : resumoOrcamento(
                    [],
                    lancamentosRealizados({ faturas, contratos, licencas: licenses, pedidos, ativos: assets, departamentos: departments }, anoOrigem),
                    anoOrigem
                  ).map((l) => ({ id: l.chave, ano: anoOrigem, categoria: l.categoria, area: l.area, valorAnual: l.realizado, meses: l.realizadoMeses }));
            const existentes = new Set(orcamentos.filter((o) => o.ano === ano).map((o) => `${o.categoria}|${o.area.trim().toLowerCase()}`));
            const novas = copiarOrcamentos(fonte, origem, ano, reajuste)
              .filter((o) => o.valorAnual > 0 && !existentes.has(`${o.categoria}|${o.area.trim().toLowerCase()}`))
              .map((o) => ({ ...o, id: `orc-${crypto.randomUUID()}` }));
            if (novas.length === 0) return `Nada para copiar: ${ano - 1} não tem ${base === 'previsto' ? 'orçamento' : 'gasto'} ou ${ano} já tem as mesmas linhas.`;
            const r = await salvarOrcamentos(novas);
            if (!r) setCopiando(false);
            return r;
          }}
        />
      )}
    </div>
  );
};

const FormOrcamento: React.FC<{
  inicial: Orcamento;
  areas: string[];
  onClose: () => void;
  onSalvar: (o: Orcamento) => Promise<string | null>;
}> = ({ inicial, areas, onClose, onSalvar }) => {
  const [o, setO] = useState<Orcamento>(inicial);
  const [anual, setAnual] = useState<number | undefined>(inicial.valorAnual || undefined);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const alterado = JSON.stringify(o) !== JSON.stringify(inicial);
  useRegistrarPendencias('orcamento-form', alterado ? ['Orçamento não salvo'] : []);
  const soma = somaMeses(o.meses);
  const fechar = async () => {
    if (alterado && !(await confirmar({ titulo: 'Descartar as alterações do orçamento?', confirmar: 'Descartar', cancelar: 'Continuar editando', perigo: true }))) return;
    onClose();
  };
  const salvar = async () => {
    setSalvando(true);
    const r = await onSalvar({ ...o, valorAnual: soma });
    setSalvando(false);
    setErro(r || '');
  };
  const id = (c: string) => `orc-${c}`;
  return (
    <Janela
      titulo={inicial.valorAnual ? 'Editar orçamento' : 'Nova linha do orçamento'}
      subtitulo={`Ano ${o.ano}`}
      tamanho="m"
      onFechar={fechar}
      rodape={
        <>
          <button type="button" onClick={fechar} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="button" onClick={salvar} disabled={salvando || soma <= 0} className="btn btn-primario">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={id('categoria')} className="rotulo">Categoria</label>
            <select id={id('categoria')} value={o.categoria} onChange={(e) => setO({ ...o, categoria: e.target.value as CategoriaDespesa })} className="campo">
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {ROTULO_CATEGORIA[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id('area')} className="rotulo">Área / centro de custo</label>
            <CampoSugestoes id={id('area')} value={o.area} onChange={(v) => setO({ ...o, area: v })} sugestoes={areas} placeholder="Vazio = geral (sem área)" />
            <p className="ajuda">Use o mesmo nome do centro de custo dos contratos e softwares, ou o setor dos equipamentos.</p>
          </div>
          <div>
            <label htmlFor={id('anual')} className="rotulo">Valor anual</label>
            <div className="flex gap-2">
              <CampoMoeda id={id('anual')} valor={anual} onMudar={setAnual} />
              <button type="button" disabled={!anual} onClick={() => setO({ ...o, meses: distribuirMensal(anual || 0) })} className="btn btn-secundario shrink-0">
                Distribuir igual
              </button>
            </div>
            <p className="ajuda">Divide em 12 meses iguais; depois ajuste mês a mês, se precisar.</p>
          </div>
          <div className="self-end">
            <p className="text-xs text-slate-500">Soma dos meses (o que vale)</p>
            <p className="font-mono text-lg font-semibold text-slate-900">{brl(soma)}</p>
          </div>
        </div>
        <fieldset>
          <legend className="rotulo">Previsto por mês</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {MESES_CURTOS.map((m, i) => (
              <div key={m}>
                <label htmlFor={id(`mes-${i}`)} className="text-xs capitalize text-slate-600">{m}</label>
                <CampoMoeda
                  id={id(`mes-${i}`)}
                  className="campo campo-sm"
                  valor={o.meses[i]}
                  onMudar={(v) => setO({ ...o, meses: o.meses.map((x, j) => (j === i ? v || 0 : x)) })}
                />
              </div>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={id('obs')} className="rotulo">Observações</label>
          <textarea id={id('obs')} rows={2} value={o.observacoes || ''} onChange={(e) => setO({ ...o, observacoes: e.target.value })} className="campo" />
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

const CopiarOrcamento: React.FC<{
  anoDestino: number;
  onClose: () => void;
  onCopiar: (anoOrigem: number, reajustePct: number, base: 'previsto' | 'realizado') => Promise<string | null>;
}> = ({ anoDestino, onClose, onCopiar }) => {
  const [reajuste, setReajuste] = useState('0');
  const [base, setBase] = useState<'previsto' | 'realizado'>('previsto');
  const [erro, setErro] = useState('');
  const [copiando, setCopiando] = useState(false);
  const copiar = async () => {
    const n = Number(reajuste.replace(',', '.'));
    if (!Number.isFinite(n) || n < -100) return setErro('Informe o reajuste em % (ex.: 5 ou 4,5).');
    setCopiando(true);
    setErro((await onCopiar(anoDestino - 1, n, base)) || '');
    setCopiando(false);
  };
  return (
    <Janela
      titulo={`Copiar para ${anoDestino}`}
      subtitulo={`A partir de ${anoDestino - 1}`}
      tamanho="p"
      onFechar={onClose}
      rodape={
        <>
          <button type="button" onClick={onClose} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="button" onClick={copiar} disabled={copiando} className="btn btn-primario">
            {copiando ? 'Copiando…' : 'Copiar'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <fieldset className="space-y-1.5">
          <legend className="rotulo">Base</legend>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="radio" name="base-copia" checked={base === 'previsto'} onChange={() => setBase('previsto')} /> Orçamento (previsto) de {anoDestino - 1}
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="radio" name="base-copia" checked={base === 'realizado'} onChange={() => setBase('realizado')} /> O que foi gasto (realizado) em {anoDestino - 1}
          </label>
        </fieldset>
        <div>
          <label htmlFor="copia-reajuste" className="rotulo">Reajuste (%)</label>
          <input id="copia-reajuste" inputMode="decimal" value={reajuste} onChange={(e) => setReajuste(e.target.value)} className="campo" />
          <p className="ajuda">Mantém a proporção de cada mês. Linhas que já existem em {anoDestino} não são alteradas.</p>
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
