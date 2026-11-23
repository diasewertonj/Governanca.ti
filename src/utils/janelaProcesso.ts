/**
 * Seção 19: o processo (admissão/desligamento) abre numa janela própria do
 * navegador, ao lado do sistema — dá para seguir o checklist e continuar usando
 * as outras telas. Em telas pequenas (celular/tablet) ou com pop-up bloqueado,
 * abre como antes, dentro do sistema.
 *
 * As duas janelas conversam pelo BroadcastChannel: quando o processo muda na
 * janela dele, a janela principal recarrega os dados do banco.
 */
const PARAMETRO = 'processo';
const CANAL = 'nexus-processo';

/** Id do processo quando esta janela é a janela própria de um processo */
export function processoDestaJanela(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get(PARAMETRO);
  } catch {
    return null;
  }
}

/** Tenta abrir o processo numa janela própria; false = abrir dentro do sistema */
export function abrirProcessoEmJanela(chamadoId: string): boolean {
  if (typeof window === 'undefined' || processoDestaJanela()) return false;
  if (!window.matchMedia?.('(min-width: 1024px)').matches) return false;
  const url = `${window.location.origin}${window.location.pathname}?${PARAMETRO}=${encodeURIComponent(chamadoId)}`;
  const largura = Math.min(1320, window.screen.availWidth - 40);
  const altura = Math.min(940, window.screen.availHeight - 40);
  const janela = window.open(url, `nexus-processo-${chamadoId}`, `popup=yes,width=${largura},height=${altura},left=40,top=20`);
  if (!janela) return false;
  janela.focus();
  return true;
}

function canal(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CANAL);
  } catch {
    return null;
  }
}

/** Na janela do processo: avisa a janela principal que algo mudou */
export function avisarAlteracaoProcesso(): void {
  const c = canal();
  if (!c) return;
  c.postMessage('alterado');
  c.close();
}

/** Na janela principal: recarrega quando a janela de um processo avisar */
export function ouvirAlteracoesProcesso(aoMudar: () => void): () => void {
  const c = canal();
  if (!c) return () => undefined;
  let espera: ReturnType<typeof setTimeout> | undefined;
  c.onmessage = () => {
    clearTimeout(espera);
    espera = setTimeout(aoMudar, 800);
  };
  return () => {
    clearTimeout(espera);
    c.close();
  };
}
