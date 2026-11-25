/**
 * Seletor de período comum (Despesas, Compras, Pedidos de compra, Vencimentos, Softwares):
 * atalhos de mês/ano (passado e futuro) ou de/até. Devolve { de, ate } em ISO (yyyy-mm-dd).
 */
import React, { useState } from 'react';
import { isoLocal } from '../../utils/formatters.ts';

export type Atalho =
  | 'todos'
  | 'este_mes'
  | 'mes_anterior'
  | 'proximo_mes'
  | 'ult3'
  | 'ult6'
  | 'ult12'
  | 'prox3'
  | 'prox12'
  | 'este_ano'
  | 'ano_anterior'
  | 'proximo_ano'
  | 'personalizado';

export const ROTULO_ATALHO: Record<Atalho, string> = {
  todos: 'Qualquer data',
  este_mes: 'Este mês',
  mes_anterior: 'Mês anterior',
  proximo_mes: 'Próximo mês',
  ult3: 'Últimos 3 meses',
  ult6: 'Últimos 6 meses',
  ult12: 'Últimos 12 meses',
  prox3: 'Próximos 3 meses',
  prox12: 'Próximos 12 meses',
  este_ano: 'Este ano',
  ano_anterior: 'Ano anterior',
  proximo_ano: 'Próximo ano',
  personalizado: 'De / até (escolher)',
};

/** Atalhos para olhar o que já passou (gastos, compras) */
export const ATALHOS_PASSADO: Atalho[] = ['este_mes', 'mes_anterior', 'ult3', 'ult6', 'ult12', 'este_ano', 'ano_anterior', 'personalizado'];
/** Atalhos para olhar o que vem (renovações, vencimentos) */
export const ATALHOS_FUTURO: Atalho[] = ['este_mes', 'proximo_mes', 'prox3', 'prox12', 'este_ano', 'proximo_ano', 'personalizado'];

export interface Periodo {
  de: string;
  ate: string;
}

/** Competências (1º dia) do mês de `de` até o mês de `ate` */
export function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  for (let d = new Date(a1, m1 - 1, 1); d <= new Date(a2, m2 - 1, 1); d.setMonth(d.getMonth() + 1)) out.push(isoLocal(d));
  return out;
}

/** Período de um atalho; "todos" devolve null (sem filtro) */
export function periodoDoAtalho(a: Atalho, hoje = new Date()): Periodo | null {
  const y = hoje.getFullYear();
  const m = hoje.getMonth();
  const ini = (yy: number, mm: number) => isoLocal(new Date(yy, mm, 1));
  const fim = (yy: number, mm: number) => isoLocal(new Date(yy, mm + 1, 0));
  switch (a) {
    case 'todos':
      return null;
    case 'mes_anterior':
      return { de: ini(y, m - 1), ate: fim(y, m - 1) };
    case 'proximo_mes':
      return { de: ini(y, m + 1), ate: fim(y, m + 1) };
    case 'ult3':
      return { de: ini(y, m - 2), ate: fim(y, m) };
    case 'ult6':
      return { de: ini(y, m - 5), ate: fim(y, m) };
    case 'ult12':
      return { de: ini(y, m - 11), ate: fim(y, m) };
    case 'prox3':
      return { de: ini(y, m), ate: fim(y, m + 2) };
    case 'prox12':
      return { de: ini(y, m), ate: fim(y, m + 11) };
    case 'este_ano':
      return { de: ini(y, 0), ate: fim(y, 11) };
    case 'ano_anterior':
      return { de: ini(y - 1, 0), ate: fim(y - 1, 11) };
    case 'proximo_ano':
      return { de: ini(y + 1, 0), ate: fim(y + 1, 11) };
    default:
      return { de: ini(y, m), ate: fim(y, m) };
  }
}

/** Data (ISO, com ou sem hora) dentro do período; sem período, tudo passa */
export function dentroDoPeriodo(data: string | undefined | null, p: Periodo | null): boolean {
  if (!p) return true;
  if (!data) return false;
  const d = data.slice(0, 10);
  return d >= p.de && d <= p.ate;
}

/**
 * Estado do seletor + o próprio seletor. `inicial` é o atalho de partida; `atalhos`, a lista oferecida
 * (com "todos" no começo quando o filtro é opcional).
 */
export function usePeriodo(inicial: Atalho, atalhos: Atalho[] = ATALHOS_PASSADO) {
  const [atalho, setAtalho] = useState<Atalho>(inicial);
  const [deManual, setDeManual] = useState('');
  const [ateManual, setAteManual] = useState('');
  const periodo: Periodo | null =
    atalho === 'personalizado'
      ? deManual && ateManual && deManual <= ateManual
        ? { de: deManual, ate: ateManual }
        : periodoDoAtalho('este_mes')
      : periodoDoAtalho(atalho);

  const seletor = (
    <>
      <select aria-label="Período" value={atalho} onChange={(e) => setAtalho(e.target.value as Atalho)} className="campo campo-sm">
        {atalhos.map((k) => (
          <option key={k} value={k}>{ROTULO_ATALHO[k]}</option>
        ))}
      </select>
      {atalho === 'personalizado' && (
        <>
          <input aria-label="De" title="De" type="date" value={deManual} onChange={(e) => setDeManual(e.target.value)} className="campo campo-sm" />
          <input aria-label="Até" title="Até" type="date" value={ateManual} min={deManual || undefined} onChange={(e) => setAteManual(e.target.value)} className="campo campo-sm" />
        </>
      )}
    </>
  );
  return { atalho, periodo, seletor };
}

/** Texto curto do período ("01/03/2027 a 31/03/2027") ou "qualquer data" */
export function rotuloPeriodo(p: Periodo | null, fmt: (d: string) => string): string {
  return p ? `${fmt(p.de)} a ${fmt(p.ate)}` : 'qualquer data';
}
