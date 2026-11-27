// =============================================================================
// Seção 29 · E-mail da empresa: domínio a partir do site/e-mail, sugestão do endereço
// pelo nome (padrão escolhido em Configurações) e conferência do domínio.
// =============================================================================
import type { PadraoEmail } from '../types/index.ts';

/** "https://www.empresa.com.br/x" ou "ti@empresa.com.br" → "empresa.com.br" */
export function dominioDe(texto?: string): string {
  const t = (texto || '').trim().toLowerCase();
  if (!t) return '';
  if (t.includes('@')) return t.split('@').pop() || '';
  return t
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0];
}

const limpar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .trim();

/** Partículas que não viram sobrenome no e-mail */
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/** Parte antes do @ pelo padrão (sem acento, minúsculas); vazio se não der para montar */
export function usuarioDoEmail(nome: string, padrao: PadraoEmail): string {
  const partes = limpar(nome)
    .split(/\s+/)
    .filter((p) => p && !PARTICULAS.has(p));
  if (!partes.length || padrao === 'nenhum') return '';
  const [primeiro] = partes;
  const ultimo = partes.length > 1 ? partes[partes.length - 1] : '';
  if (padrao === 'nome') return primeiro;
  if (padrao === 'nome.inicial') return ultimo ? `${primeiro}${ultimo[0]}` : primeiro;
  return ultimo ? `${primeiro}.${ultimo}` : primeiro;
}

/** E-mail sugerido, sem repetir um já usado (acrescenta 2, 3…) */
export function sugerirEmail(nome: string, padrao: PadraoEmail | undefined, dominio: string | undefined, usados: string[]): string {
  const usuario = usuarioDoEmail(nome, padrao || 'nome.sobrenome');
  if (!usuario || !dominio) return '';
  const ocupados = new Set(usados.map((u) => u.trim().toLowerCase()));
  let n = 1;
  let email = `${usuario}@${dominio}`;
  while (ocupados.has(email)) {
    n++;
    email = `${usuario}${n}@${dominio}`;
  }
  return email;
}

/** O e-mail é de um dos domínios da empresa? (sem domínios cadastrados, não há o que conferir) */
export function emailDaEmpresa(email: string, dominios: string[] | undefined): boolean | undefined {
  if (!dominios?.length) return undefined;
  const d = dominioDe(email);
  return d ? dominios.includes(d) : undefined;
}
