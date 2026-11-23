/**
 * Seção 19: densidade das tabelas (confortável ou compacta), escolha de cada
 * usuário guardada no navegador. Vale para todas as tabelas (variável CSS
 * --tabela-py em src/index.css, ligada por data-densidade no <html>).
 */
export type Densidade = 'confortavel' | 'compacta';

const CHAVE = 'nexus_densidade';

export function lerDensidade(): Densidade {
  try {
    return localStorage.getItem(CHAVE) === 'compacta' ? 'compacta' : 'confortavel';
  } catch {
    return 'confortavel';
  }
}

export function aplicarDensidade(d: Densidade): void {
  if (typeof document === 'undefined') return;
  if (d === 'compacta') document.documentElement.dataset.densidade = 'compacta';
  else delete document.documentElement.dataset.densidade;
}

export function salvarDensidade(d: Densidade): void {
  aplicarDensidade(d);
  try {
    localStorage.setItem(CHAVE, d);
  } catch {
    /* navegador sem armazenamento: vale só nesta visita */
  }
}
