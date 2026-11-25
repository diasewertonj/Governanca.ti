/**
 * Orçamento: janelas de edição (linha do previsto, 12 meses) e de cópia do ano anterior.
 * Seção 27: a tela "Planejamento" saiu — a edição acontece na própria linha do
 * Orçamento (Gestão de T.I. › Orçamento e projeção), com a mesma conta do Acompanhamento.
 */
import React, { useState } from 'react';
import type { CategoriaDespesa, Orcamento } from '../../types/index.ts';
import { ROTULO_CATEGORIA, brl } from '../../utils/financeiro.ts';
import { MESES_CURTOS, distribuirMensal, somaMeses } from '../../utils/compras.ts';
import { Janela } from '../ui/Janela.tsx';
import { CampoMoeda, CampoSugestoes } from '../ui/Campos.tsx';
import { confirmar } from '../ui/dialogo.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';

const CATEGORIAS = Object.keys(ROTULO_CATEGORIA) as CategoriaDespesa[];

export const FormOrcamento: React.FC<{
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
            <p className="texto-aux">Soma dos meses (o que vale)</p>
            <p className="num text-lg font-semibold text-slate-900">{brl(soma)}</p>
          </div>
        </div>
        <fieldset>
          <legend className="rotulo">Previsto por mês</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {MESES_CURTOS.map((m, i) => (
              <div key={m}>
                <label htmlFor={id(`mes-${i}`)} className="texto-aux capitalize">{m}</label>
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

export const CopiarOrcamento: React.FC<{
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
        <fieldset className="space-y-2">
          <legend className="rotulo">Base</legend>
          <label className="flex items-center gap-2 text-slate-700">
            <input type="radio" name="base-copia" checked={base === 'previsto'} onChange={() => setBase('previsto')} /> Orçamento (previsto) de {anoDestino - 1}
          </label>
          <label className="flex items-center gap-2 text-slate-700">
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
