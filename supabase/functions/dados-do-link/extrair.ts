// =============================================================================
// Seção 14 · Leitura dos dados públicos de um produto a partir do HTML da loja:
// dados estruturados (JSON-LD schema.org Product) e Open Graph / metatags.
// Sem dependências (roda na Edge Function e nos testes do Vitest).
// =============================================================================

export interface DadosProduto {
  nome?: string;
  marca?: string;
  modelo?: string;
  preco?: number;
  moeda?: string;
  imagem?: string;
  loja?: string;
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodificar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** "1.234,56", "1234.56", "R$ 1.299" → número */
export function lerPreco(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : undefined;
  if (typeof v !== 'string') return undefined;
  let s = v.replace(/[^\d.,]/g, '');
  if (!s) return undefined;
  const ultVirgula = s.lastIndexOf(',');
  const ultPonto = s.lastIndexOf('.');
  if (ultVirgula > ultPonto) s = s.replace(/\./g, '').replace(',', '.');
  else if (ultPonto > ultVirgula && s.length - ultPonto - 1 === 3 && ultVirgula === -1 && (s.match(/\./g) || []).length >= 1 && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
}

const texto = (v: unknown): string | undefined => {
  if (typeof v === 'string') return decodificar(v) || undefined;
  if (v && typeof v === 'object' && 'name' in v) return texto((v as { name: unknown }).name);
  return undefined;
};
const imagemDe = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return imagemDe(v[0]);
  if (v && typeof v === 'object' && 'url' in v) return imagemDe((v as { url: unknown }).url);
  return undefined;
};
const ehProduto = (o: Record<string, unknown>) => {
  const t = o['@type'];
  return t === 'Product' || (Array.isArray(t) && t.includes('Product'));
};

function produtosDoJson(dado: unknown, achados: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(dado)) dado.forEach((d) => produtosDoJson(d, achados));
  else if (dado && typeof dado === 'object') {
    const o = dado as Record<string, unknown>;
    if (ehProduto(o)) achados.push(o);
    if (o['@graph']) produtosDoJson(o['@graph'], achados);
    if (o.mainEntity) produtosDoJson(o.mainEntity, achados);
  }
  return achados;
}

/** Metatags: property/name e content em qualquer ordem */
function metas(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const chave = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const valor = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (chave && valor && !(chave in out)) out[chave] = decodificar(valor);
  }
  return out;
}

/** Junta o que der: JSON-LD primeiro (mais preciso), Open Graph/metatags para completar */
export function extrairDadosProduto(html: string, url?: string): DadosProduto {
  const d: DadosProduto = {};
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const [p] = produtosDoJson(JSON.parse(m[1].trim()));
      if (!p) continue;
      d.nome ??= texto(p.name);
      d.marca ??= texto(p.brand) || texto(p.manufacturer);
      d.modelo ??= texto(p.model) || texto(p.mpn) || texto(p.sku);
      d.imagem ??= imagemDe(p.image);
      const ofertas = Array.isArray(p.offers) ? p.offers : p.offers ? [p.offers] : [];
      for (const o of ofertas as Record<string, unknown>[]) {
        d.preco ??= lerPreco(o.price) ?? lerPreco(o.lowPrice);
        d.moeda ??= texto(o.priceCurrency);
      }
    } catch {
      /* JSON-LD inválido: segue para as metatags */
    }
  }
  const mt = metas(html);
  d.nome ??= mt['og:title'] || mt['twitter:title'] || decodificar(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '') || undefined;
  d.marca ??= mt['product:brand'] || mt['og:brand'] || mt['brand'];
  d.preco ??= lerPreco(mt['product:price:amount'] || mt['og:price:amount'] || mt['price']);
  d.moeda ??= mt['product:price:currency'] || mt['og:price:currency'] || mt['pricecurrency'];
  d.imagem ??= mt['og:image'] || mt['twitter:image'];
  d.loja ??= mt['og:site_name'] || (url ? new URL(url).hostname.replace(/^www\./, '') : undefined);
  // Só imagens https (a página mostra a imagem direto da loja)
  if (d.imagem && url) {
    try {
      d.imagem = new URL(d.imagem, url).toString();
    } catch {
      d.imagem = undefined;
    }
  }
  if (d.imagem && !d.imagem.startsWith('https://')) d.imagem = undefined;
  if (d.nome && d.nome.length > 200) d.nome = d.nome.slice(0, 200);
  return d;
}

/** Endereço que a função não deve buscar (rede interna, localhost, nuvem): proteção contra SSRF */
export function enderecoBloqueado(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h === 'metadata.google.internal') return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (h.includes(':')) return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
  return false;
}
