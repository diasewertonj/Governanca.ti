/**
 * Fase 11 · Valor do equipamento na ficha: compra, depreciação acumulada, valor atual
 * e mês em que chega ao residual (linear, pela vida útil do grupo em Configurações).
 * A T.I. pode trocar o grupo de vida útil (ex.: um servidor cadastrado como hardware).
 */
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { Asset, GrupoDepreciacao } from '../../types/index.ts';
import { ROTULO_GRUPO_DEPRECIACAO, anosDeVida, depreciacao, grupoDoAtivo } from '../../utils/patrimonio.ts';
import { brl } from '../../utils/financeiro.ts';
import { Dado } from '../ui/Janela.tsx';

const mesAno = (iso?: string) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

export const DepreciacaoAtivo: React.FC<{ asset: Asset; podeEditar: boolean }> = ({ asset, podeEditar }) => {
  const { settings, editarAtivo } = useApp();
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const d = depreciacao(asset, settings.vidaUtil);
  const automatico = grupoDoAtivo({ ...asset, grupoDepreciacao: undefined });
  const pct = d.valorCompra > 0 ? Math.round((d.acumulada / d.valorCompra) * 100) : 0;

  const trocarGrupo = async (valor: string) => {
    setSalvando(true);
    const r = await editarAtivo(asset.id, { grupoDepreciacao: valor as GrupoDepreciacao | '' });
    setSalvando(false);
    setErro(r || '');
  };

  return (
    <section className="cartao space-y-3 p-4">
      <h3 className="secao-titulo">Valor e depreciação</h3>
      {d.semDados ? (
        <p className="text-amber-800">Informe o valor e a data de compra (Editar) para calcular o valor atual.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Dado rotulo="Valor de compra">
            <span className="num">{brl(d.valorCompra)}</span>
          </Dado>
          <Dado rotulo="Depreciação acumulada">
            <span className="font-mono">
              {brl(d.acumulada)} ({pct}%)
            </span>
          </Dado>
          <Dado rotulo="Valor atual">
            <span className="num font-semibold">{brl(d.valorAtual)}</span>
          </Dado>
          <Dado rotulo={d.residual > 0 ? 'Chega ao residual em' : 'Zera em'}>{d.anos ? mesAno(d.zeraEm) : 'não deprecia'}</Dado>
        </dl>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`grupo-${asset.id}`} className="texto-aux">
            Grupo de vida útil
          </label>
          <select
            id={`grupo-${asset.id}`}
            disabled={!podeEditar || salvando}
            value={asset.grupoDepreciacao || ''}
            onChange={(e) => void trocarGrupo(e.target.value)}
            className="campo campo-sm"
          >
            <option value="">
              Automático: {ROTULO_GRUPO_DEPRECIACAO[automatico]} ({anosDeVida(automatico, settings.vidaUtil) || 0} anos)
            </option>
            {(Object.keys(ROTULO_GRUPO_DEPRECIACAO) as GrupoDepreciacao[]).map((g) => (
              <option key={g} value={g}>
                {ROTULO_GRUPO_DEPRECIACAO[g]}
                {g !== 'nao_deprecia' ? ` (${anosDeVida(g, settings.vidaUtil)} anos)` : ''}
              </option>
            ))}
          </select>
        </div>
        <p className="ajuda">Linear, mês a mês, desde a data de compra. Anos e valor residual em Configurações › Vida útil.</p>
      </div>
      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}
    </section>
  );
};
