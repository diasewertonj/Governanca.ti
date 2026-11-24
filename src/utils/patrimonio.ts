// Lote 1: tag de patrimônio sugerida e conferência de duplicados.
// Fase 11: depreciação linear por grupo de vida útil (valor atual e valor contábil).
import type { Asset, GrupoDepreciacao, VidaUtil } from '../types/index.ts';

const normalizar = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');

/**
 * Próxima tag = maior número já usado + 1, com o prefixo da tag mais alta
 * (antes era "quantidade de ativos + 1040", que repetia tags existentes).
 */
export function proximaTag(ativos: Pick<Asset, 'tag'>[], prefixoPadrao = '#PAT-'): string {
  return proximasTags(ativos, 1, prefixoPadrao)[0];
}

/** N tags seguidas a partir da próxima livre (recebimento de pedido com várias unidades) */
export function proximasTags(ativos: Pick<Asset, 'tag'>[], quantidade: number, prefixoPadrao = '#PAT-'): string[] {
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
  return Array.from({ length: Math.max(0, quantidade) }, (_, i) => `${prefixo}${String(maior + 1 + i).padStart(digitos, '0')}`);
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

// -----------------------------------------------------------------------------
// Fase 11 · Depreciação linear
// -----------------------------------------------------------------------------
export const ROTULO_GRUPO_DEPRECIACAO: Record<GrupoDepreciacao, string> = {
  computadores: 'Computadores',
  celulares: 'Celulares e tablets',
  servidores: 'Servidores e rede',
  perifericos: 'Periféricos',
  moveis: 'Móveis',
  nao_deprecia: 'Não deprecia',
};

/** Vida útil padrão (anos), referência fiscal; ajustável em Configurações */
export const VIDA_UTIL_PADRAO: Required<Omit<VidaUtil, 'residualPct'>> = {
  computadores: 5,
  celulares: 5,
  servidores: 5,
  perifericos: 5,
  moveis: 10,
};

type AtivoDepreciavel = Pick<Asset, 'fiscal'> & Partial<Pick<Asset, 'categoria' | 'nome' | 'modelo' | 'grupoDepreciacao' | 'status' | 'baixas'>>;

/** Grupo de vida útil: o escolhido na ficha ou, sem escolha, pela categoria e pelo nome */
export function grupoDoAtivo(a: AtivoDepreciavel): GrupoDepreciacao {
  if (a.grupoDepreciacao) return a.grupoDepreciacao;
  if (a.categoria === 'software') return 'nao_deprecia';
  if (a.categoria === 'telefonia') return 'celulares';
  if (a.categoria === 'periferico') return 'perifericos';
  const texto = `${a.nome || ''} ${a.modelo || ''}`;
  if (/servidor|server|switch|roteador|router|firewall|storage|\bnas\b|access point|rack|nobreak/i.test(texto)) return 'servidores';
  if (/cadeira|mesa|arm[aá]rio|gaveteiro|estante|m[oó]vel/i.test(texto)) return 'moveis';
  if (/tablet|ipad|celular|smartphone|iphone/i.test(texto)) return 'celulares';
  return 'computadores';
}

/** Vida útil (anos) do grupo, com o que estiver configurado */
export function anosDeVida(grupo: GrupoDepreciacao, vida?: VidaUtil): number {
  if (grupo === 'nao_deprecia') return 0;
  const v = Number(vida?.[grupo]);
  return v > 0 ? v : VIDA_UTIL_PADRAO[grupo];
}

/** Meses inteiros entre duas datas 'AAAA-MM-DD' (só conta o mês completo) */
export function mesesEntre(inicio: string, fim: string): number {
  const [a1, m1, d1] = inicio.slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = fim.slice(0, 10).split('-').map(Number);
  if (!a1 || !a2) return 0;
  const meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return Math.max(0, meses);
}

/** Soma N meses a uma data 'AAAA-MM-DD' */
export function somarMeses(data: string, meses: number): string {
  const [a, m, d] = data.slice(0, 10).split('-').map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const dia = Math.min(d, ultimoDia);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const hojeIso = (agora: Date) =>
  `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
const centavos = (v: number) => Math.round(v * 100) / 100;

export interface Depreciacao {
  grupo: GrupoDepreciacao;
  anos: number;
  valorCompra: number;
  residual: number;
  mesesDecorridos: number;
  /** Depreciação acumulada até a data */
  acumulada: number;
  valorAtual: number;
  /** Mês em que chega ao valor residual (sem data de compra: indefinido) */
  zeraEm?: string;
  /** Sem valor ou sem data de compra: o valor atual fica igual ao de compra */
  semDados: boolean;
}

/** Depreciação linear mensal a partir da data de aquisição (valor residual opcional, em %) */
export function depreciacao(a: AtivoDepreciavel, vida?: VidaUtil, ate: Date | string = new Date()): Depreciacao {
  const grupo = grupoDoAtivo(a);
  const anos = anosDeVida(grupo, vida);
  const valorCompra = Number(a.fiscal?.valorCompra) || 0;
  const residualPct = Math.min(100, Math.max(0, Number(vida?.residualPct) || 0));
  const residual = centavos((valorCompra * residualPct) / 100);
  const aquisicao = a.fiscal?.dataAquisicao;
  const base = { grupo, anos, valorCompra, residual };
  if (!valorCompra || !aquisicao || anos === 0) {
    return { ...base, residual: anos === 0 ? valorCompra : residual, mesesDecorridos: 0, acumulada: 0, valorAtual: valorCompra, semDados: anos !== 0 };
  }
  const vidaMeses = anos * 12;
  let dataFim = typeof ate === 'string' ? ate.slice(0, 10) : hojeIso(ate);
  // Ativo baixado deixa de depreciar na data da baixa (a vigente, não a estornada)
  if (a.status === 'descartado') {
    const dataBaixa = a.baixas?.find((b) => !b.estornadaEm)?.dataBaixa?.slice(0, 10);
    if (dataBaixa && dataBaixa < dataFim) dataFim = dataBaixa;
  }
  const mesesDecorridos = mesesEntre(aquisicao, dataFim);
  const acumulada = centavos(((valorCompra - residual) * Math.min(mesesDecorridos, vidaMeses)) / vidaMeses);
  return {
    ...base,
    mesesDecorridos,
    acumulada,
    valorAtual: centavos(valorCompra - acumulada),
    zeraEm: somarMeses(aquisicao, vidaMeses),
    semDados: false,
  };
}

/** Ativo a partir do que o leitor devolveu: link da etiqueta (…#asset/<id>), id ou patrimônio */
export function ativoDoCodigo(codigo: string, ativos: Pick<Asset, 'id' | 'tag' | 'serialNumber'>[]): Pick<Asset, 'id' | 'tag' | 'serialNumber'> | undefined {
  const texto = codigo.trim();
  if (!texto) return undefined;
  const id = /#asset\/([^/?#\s]+)/.exec(texto)?.[1];
  if (id) return ativos.find((a) => a.id === decodeURIComponent(id));
  // Patrimônio com ou sem "#" (PAT-1050 = #PAT-1050)
  const limpar = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/^#/, '');
  const n = limpar(texto);
  return ativos.find((a) => a.id === texto || limpar(a.tag) === n || limpar(a.serialNumber || '') === n);
}
