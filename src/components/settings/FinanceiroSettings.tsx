/**
 * Seção 17 · Premissas financeiras (só o administrador grava): limite de
 * capitalização (CAPEX × OPEX), reajuste padrão da projeção, custo de reposição por
 * categoria de equipamento, conta contábil por categoria de despesa e o mapa
 * "centro de custo antigo → departamento" (decisão 7).
 */
import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { AssetCategory, CategoriaDespesa, PremissasFinanceiras } from '../../types/index.ts';
import { ROTULO_CATEGORIA } from '../../utils/financeiro.ts';
import { LIMITE_CAPITALIZACAO_PADRAO } from '../../utils/gestaoFinanceira.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { CampoMoeda } from '../ui/Campos.tsx';
import { CLASSE_ROTULO } from '../comum/campos.ts';

const CATEGORIAS_ATIVO: { id: AssetCategory; rotulo: string }[] = [
  { id: 'hardware', rotulo: 'Hardware (computadores, servidores)' },
  { id: 'periferico', rotulo: 'Periféricos' },
  { id: 'telefonia', rotulo: 'Telefonia (celulares)' },
];

export const chaveArea = (texto?: string) => (texto || '').trim().toLowerCase();

export const FinanceiroSettings: React.FC = () => {
  const { settings, updateSettings, currentRole, contratos, licenses, departments } = useApp();
  const { linhas } = useRecursos();
  const { orcamentos, pedidos } = useCompras();
  const podeEditar = currentRole === 'ti_admin';
  const salvas: PremissasFinanceiras = useMemo(() => settings.premissasFinanceiras || {}, [settings.premissasFinanceiras]);
  const [rascunho, setRascunho] = useState<PremissasFinanceiras>(salvas);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState('');

  // O que foi gravado mudou (carga do banco): a tela acompanha
  const base = JSON.stringify(salvas);
  const [baseVista, setBaseVista] = useState(base);
  if (baseVista !== base) {
    setBaseVista(base);
    setRascunho(salvas);
  }
  const alterado = JSON.stringify(rascunho) !== base;
  useRegistrarPendencias('premissas-financeiras', alterado ? ['Premissas financeiras não salvas'] : []);

  // Textos de área antigos que ainda não são um departamento
  const textos = useMemo(() => {
    const nomes = new Set(departments.map((d) => chaveArea(d.nome)));
    const todos = [
      ...contratos.map((c) => c.centroCusto),
      ...licenses.map((l) => l.centroCusto),
      ...linhas.map((l) => l.centroCusto),
      ...orcamentos.filter((o) => !o.departamentoId).map((o) => o.area),
      ...pedidos.map((p) => p.area),
    ];
    const m = new Map<string, string>();
    todos.forEach((t) => {
      const k = chaveArea(t);
      if (k && !nomes.has(k) && !m.has(k)) m.set(k, (t || '').trim());
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [contratos, licenses, linhas, orcamentos, pedidos, departments]);

  const mudar = (p: Partial<PremissasFinanceiras>) => {
    setSalvo(false);
    setRascunho((r) => ({ ...r, ...p }));
  };

  const salvar = () => {
    const limite = rascunho.limiteCapitalizacao;
    const reajuste = rascunho.reajustePadraoPct;
    if (limite !== undefined && !(limite >= 0)) return setErro('O limite de capitalização não pode ser negativo.');
    if (reajuste !== undefined && !(reajuste >= 0 && reajuste <= 50)) return setErro('Use um reajuste de 0% a 50% ao ano.');
    setErro('');
    updateSettings({ premissasFinanceiras: rascunho });
    setSalvo(true);
  };

  return (
    <div className="cartao p-4 space-y-5 text-xs">
      <div>
        <h3 className="secao-titulo">Premissas financeiras</h3>
        <p className="ajuda">Valem para CAPEX × OPEX, projeção, orçamento, patrimônio e exportações da Gestão de T.I.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-2xl">
        <div>
          <label htmlFor="prem-limite" className={CLASSE_ROTULO}>Limite de capitalização (R$)</label>
          <CampoMoeda id="prem-limite" valor={rascunho.limiteCapitalizacao ?? LIMITE_CAPITALIZACAO_PADRAO} onMudar={(v) => mudar({ limiteCapitalizacao: v })} className="campo" />
          <p className="ajuda">Equipamento ou licença perpétua a partir deste valor é CAPEX (deprecia); abaixo, OPEX.</p>
        </div>
        <div>
          <label htmlFor="prem-reajuste" className={CLASSE_ROTULO}>Reajuste padrão da projeção (% ao ano)</label>
          <input
            id="prem-reajuste"
            type="number"
            min={0}
            max={50}
            step="0.1"
            disabled={!podeEditar}
            value={rascunho.reajustePadraoPct ?? 5}
            onChange={(e) => mudar({ reajustePadraoPct: e.target.value === '' ? undefined : Number(e.target.value) })}
            className="campo"
          />
          <p className="ajuda">Usado quando o contrato não tem mês de reajuste.</p>
        </div>
      </div>

      <div className="space-y-2 max-w-2xl">
        <h4 className="font-semibold text-slate-800">Custo de reposição por categoria</h4>
        <p className="ajuda">Valor de referência para trocar o equipamento no fim da vida útil (projeção). Vazio: o valor de compra.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {CATEGORIAS_ATIVO.map((c) => (
            <div key={c.id}>
              <label htmlFor={`prem-rep-${c.id}`} className={CLASSE_ROTULO}>{c.rotulo}</label>
              <CampoMoeda
                id={`prem-rep-${c.id}`}
                valor={rascunho.reposicao?.[c.id]}
                onMudar={(v) => {
                  const r = { ...(rascunho.reposicao || {}) };
                  if (v === undefined) delete r[c.id];
                  else r[c.id] = v;
                  mudar({ reposicao: r });
                }}
                className="campo"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 max-w-2xl">
        <h4 className="font-semibold text-slate-800">Conta contábil por categoria (opcional)</h4>
        <p className="ajuda">Sai na exportação de lançamentos para a contabilidade.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(Object.keys(ROTULO_CATEGORIA) as CategoriaDespesa[]).map((k) => (
            <div key={k}>
              <label htmlFor={`prem-conta-${k}`} className={CLASSE_ROTULO}>{ROTULO_CATEGORIA[k]}</label>
              <input
                id={`prem-conta-${k}`}
                disabled={!podeEditar}
                value={rascunho.contaContabil?.[k] || ''}
                onChange={(e) => mudar({ contaContabil: { ...(rascunho.contaContabil || {}), [k]: e.target.value || undefined } })}
                className="campo font-mono"
                placeholder="Ex.: 3.1.2.05"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 max-w-2xl">
        <h4 className="font-semibold text-slate-800">Áreas antigas → departamento</h4>
        <p className="ajuda">
          Contratos, softwares, linhas, orçamentos e pedidos antigos guardam a área como texto. Ligue cada texto a um departamento para que orçamento,
          relatórios e "Custos da minha área" somem tudo junto.
        </p>
        {textos.length === 0 ? (
          <p className="text-slate-500">Nenhum texto de área solto: tudo já bate com um departamento.</p>
        ) : (
          <table className="w-full">
            <tbody>
              {textos.map(([k, rotulo]) => (
                <tr key={k} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 text-slate-800">{rotulo}</td>
                  <td className="py-1.5">
                    <select
                      aria-label={`Departamento de "${rotulo}"`}
                      disabled={!podeEditar}
                      value={rascunho.mapaAreas?.[k] || ''}
                      onChange={(e) => {
                        const m = { ...(rascunho.mapaAreas || {}) };
                        if (e.target.value) m[k] = e.target.value;
                        else delete m[k];
                        mudar({ mapaAreas: m });
                      }}
                      className="campo campo-sm"
                    >
                      <option value="">Sem departamento</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.nome}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {erro && <p role="alert" className="erro">{erro}</p>}
      {salvo && !alterado && <p className="text-emerald-700">Premissas salvas.</p>}
      {podeEditar && (
        <button type="button" onClick={salvar} disabled={!alterado} className="btn btn-primario">
          Salvar premissas
        </button>
      )}
    </div>
  );
};
