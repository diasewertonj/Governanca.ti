// Lote 1: tag de patrimônio sugerida e conferência de duplicados.
import type { Asset } from '../types/index.ts';

const normalizar = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');

/**
 * Próxima tag = maior número já usado + 1, com o prefixo da tag mais alta
 * (antes era "quantidade de ativos + 1040", que repetia tags existentes).
 */
export function proximaTag(ativos: Pick<Asset, 'tag'>[], prefixoPadrao = '#PAT-'): string {
  let maior = 0;
  let prefixo = prefixoPadrao;
  let digitos = 4;
  for (const a of ativos) {
    const m = /^(.*?)(\d+)\s*$/.exec(a.tag || '');
    if (!m) continue;
    const n = Number(m[2]);
    if (n > maior) {
      maior = n;
      prefixo = m[1] || prefixoPadrao;
      digitos = m[2].length;
    }
  }
  return `${prefixo}${String(maior + 1).padStart(digitos, '0')}`;
}

/** Tag ou número de série já cadastrados em outro ativo (comparação sem espaços e sem caixa) */
export function erroDuplicadoAtivo(
  ativos: Pick<Asset, 'id' | 'tag' | 'serialNumber'>[],
  tag: string,
  serial: string,
  ignorarId?: string
): string | null {
  const outros = ativos.filter((a) => a.id !== ignorarId);
  const mesmaTag = tag.trim() && outros.find((a) => normalizar(a.tag) === normalizar(tag));
  if (mesmaTag) return `A tag ${tag.trim()} já está em uso em outro ativo.`;
  const mesmoSerial = serial.trim() && outros.find((a) => a.serialNumber && normalizar(a.serialNumber) === normalizar(serial));
  if (mesmoSerial) return `O número de série ${serial.trim()} já está cadastrado no ativo ${mesmoSerial.tag}.`;
  return null;
}
