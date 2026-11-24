/**
 * TEMPORÁRIO (seção 19 — escolha do dono): dois modelos de disposição para a
 * tela do processo e a ficha do chamado. Troca por `?layout=a` ou `?layout=b`
 * na URL (fica guardado neste navegador). Depois da escolha, este arquivo sai e
 * fica só o modelo escolhido.
 */
export type ModeloLayout = 'a' | 'b';
const CHAVE = 'nexus_layout_teste';

export function modeloLayout(): ModeloLayout {
  try {
    const daUrl = new URLSearchParams(window.location.search).get('layout');
    if (daUrl === 'a' || daUrl === 'b') {
      localStorage.setItem(CHAVE, daUrl);
      return daUrl;
    }
    return localStorage.getItem(CHAVE) === 'b' ? 'b' : 'a';
  } catch {
    return 'a';
  }
}
