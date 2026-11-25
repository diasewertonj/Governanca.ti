/**
 * Seção 22: tema claro, escuro ou automático (segue o sistema), escolha de cada
 * pessoa guardada no navegador. O tema escuro é a classe `dark` no <html>; as
 * cores vêm das variáveis de src/index.css. O arquivo public/tema-inicial.js
 * aplica a mesma regra antes da tela aparecer (sem piscar branco).
 */
export type Tema = 'auto' | 'claro' | 'escuro';

const CHAVE = 'nexus_tema';
const consultaEscuro = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === 'claro' || t === 'escuro' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function aplicarTema(t: Tema): void {
  if (typeof document === 'undefined') return;
  const escuro = t === 'escuro' || (t === 'auto' && !!consultaEscuro()?.matches);
  document.documentElement.classList.toggle('dark', escuro);
  document.documentElement.style.colorScheme = escuro ? 'dark' : 'light';
}

export function salvarTema(t: Tema): void {
  aplicarTema(t);
  try {
    localStorage.setItem(CHAVE, t);
  } catch {
    /* navegador sem armazenamento: vale só nesta visita */
  }
}

/** No automático, acompanha a troca de tema do computador/celular */
export function acompanharSistema(): () => void {
  const c = consultaEscuro();
  if (!c) return () => undefined;
  const mudou = () => {
    if (lerTema() === 'auto') aplicarTema('auto');
  };
  c.addEventListener('change', mudou);
  return () => c.removeEventListener('change', mudou);
}
