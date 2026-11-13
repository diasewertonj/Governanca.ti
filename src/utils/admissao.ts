// Ajustes da admissão: descrição curta do pedido e casamento conta ↔ licença.
import type { SoftwareLicense } from '../types/index.ts';

/** Descrição curta do chamado de admissão (o resto já fica organizado no pedido) */
export function descricaoAdmissao(d: { nome: string; cargo: string; setor?: string; gestor?: string; inicio: string }): string {
  const partes = [`Admissão de ${d.nome.trim()}`, d.cargo.trim(), d.setor].filter(Boolean).join(' · ');
  return `${partes}. Início em ${d.inicio}${d.gestor ? `; gestor: ${d.gestor}` : ''}.`;
}

/** Minúsculas, sem acentos e sem pontuação: "Microsoft 365" = "microsoft-365" */
export const normalizarNome = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Licença cadastrada que corresponde à conta pedida ("Microsoft 365" casa com
 * "Microsoft 365 E5 Enterprise"). Prefere o nome exato; senão, o nome da licença
 * que começa com o da conta (ou o contrário). Mais de uma candidata: nenhuma.
 */
export function licencaDaConta(nomeConta: string, licencas: SoftwareLicense[]): SoftwareLicense | undefined {
  const alvo = normalizarNome(nomeConta);
  if (!alvo) return undefined;
  const exata = licencas.find((l) => normalizarNome(l.nome) === alvo);
  if (exata) return exata;
  const parecidas = licencas.filter((l) => {
    const n = normalizarNome(l.nome);
    return n.startsWith(`${alvo} `) || alvo.startsWith(`${n} `);
  });
  return parecidas.length === 1 ? parecidas[0] : undefined;
}

export const assentosLivres = (l: Pick<SoftwareLicense, 'assentosTotais' | 'assentosAlocados'>) =>
  Math.max(0, l.assentosTotais - l.assentosAlocados);
