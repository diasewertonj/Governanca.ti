// =============================================================================
// Seção 28 · Importar licenças do Microsoft 365 (CSV da tela "Produtos" do centro
// de administração) e do Google Workspace (texto copiado de Faturamento › Assinaturas).
// Nenhum dos dois traz o preço; o Google também não traz a data de renovação — a prévia
// da importação pede o que faltar antes de gravar.
// =============================================================================
import { isoLocal } from './formatters.ts';

export interface LicencaImportada {
  origem: 'microsoft' | 'google';
  nome: string;
  fabricante: 'Microsoft' | 'Google';
  /** Assentos contratados (comprados) */
  assentos: number;
  /** Em uso no painel do fabricante (informativo: no Nexus o uso vem das pessoas atribuídas) */
  emUso?: number;
  cobranca: 'mensal' | 'anual';
  /** Plano sem custo (Free Plan, edição gratuita) */
  gratuito: boolean;
  /** AAAA-MM-DD */
  renovacao?: string;
  /** Revenda/perfil de cobrança (vira o fornecedor) */
  revenda?: string;
  detalhe: string;
}

/** CSV com aspas e vírgula (ou ponto e vírgula) como separador */
export function lerCsv(texto: string): string[][] {
  const sep = (texto.split('\n')[0].match(/;/g) || []).length > (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo);
      if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += ch;
  }
  linha.push(campo);
  if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
  return linhas;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/** dd/mm/aaaa (ou aaaa-mm-dd) → aaaa-mm-dd */
function data(s?: string): string | undefined {
  if (!s) return undefined;
  const br = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return isoLocal(new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : undefined;
}

const num = (s?: string) => {
  const n = Number(String(s ?? '').replace(/\D/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Microsoft 365: CSV de Faturamento › Seus produtos (cabeçalho em português ou inglês) */
export function lerMicrosoft(texto: string): LicencaImportada[] {
  const [cab, ...linhas] = lerCsv(texto);
  if (!cab) return [];
  const col = (...nomes: string[]) => cab.findIndex((c) => nomes.some((n) => norm(c).startsWith(norm(n))));
  const iNome = col('Nome do produto', 'Product name');
  if (iNome < 0) return [];
  const iAtrib = col('Licenças atribuídas', 'Assigned licenses');
  const iDisp = col('Licenças disponíveis', 'Available licenses');
  const iQtd = col('Quantidade comprada', 'Purchased quantity', 'Quantity');
  const iFreq = col('Frequência de cobrança', 'Billing frequency');
  const iPerfil = col('Perfil de cobrança', 'Billing profile');
  const iRenov = col('Data de renovação', 'Renewal', 'Expiration');
  const iStatus = col('Status da assinatura', 'Subscription status');
  const iPreco = col('Modelo de preço', 'Pricing model');
  const v = (l: string[], i: number) => (i >= 0 ? (l[i] || '').trim() : '');
  return linhas
    .filter((l) => v(l, iNome) && !/cancel|desabilit|disabled|expirad|expired/i.test(v(l, iStatus)))
    .map((l) => {
      const atrib = num(v(l, iAtrib));
      const assentos = num(v(l, iQtd)) || atrib + num(v(l, iDisp));
      const freq = norm(v(l, iFreq));
      const perfil = v(l, iPerfil);
      return {
        origem: 'microsoft' as const,
        nome: v(l, iNome),
        fabricante: 'Microsoft' as const,
        assentos,
        emUso: atrib,
        cobranca: /anual|ano|year|annual/.test(freq) && !/mensal|month/.test(freq) ? ('anual' as const) : ('mensal' as const),
        gratuito: /gratuit|free|avalia|trial/i.test(v(l, iPreco)),
        renovacao: data(v(l, iRenov)),
        revenda: perfil && !/nao disponivel|not available/.test(norm(perfil)) ? perfil : undefined,
        detalhe: `${atrib} em uso de ${assentos} no Microsoft 365${v(l, iFreq) ? ` · ${v(l, iFreq)}` : ''}`,
      };
    });
}

/** Google Workspace: texto copiado de Faturamento › Assinaturas (com ou sem os links) */
export function lerGoogle(texto: string): LicencaImportada[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: LicencaImportada[] = [];
  const ehStatus = (l: string) => /^(ativo|active|suspenso|suspended|cancelad|pendente)/i.test(l);
  for (let i = 0; i < linhas.length; i++) {
    const link = linhas[i].match(/^\[(.+?)\]\(https?:\/\/admin\.google\.com\/ac\/billing\/subscriptions/);
    const nome = link ? link[1] : linhas[i + 1] && ehStatus(linhas[i + 1]) && !/^(nome|status|licen)/i.test(linhas[i]) ? linhas[i] : '';
    if (!nome) continue;
    // Bloco até a próxima assinatura
    const bloco: string[] = [];
    for (let j = i + 1; j < linhas.length; j++) {
      if (/^\[.+?\]\(https?:\/\/admin\.google\.com\/ac\/billing\/subscriptions/.test(linhas[j])) break;
      if (!link && linhas[j + 1] && ehStatus(linhas[j + 1]) && bloco.length > 1) break;
      bloco.push(linhas[j]);
    }
    const txt = bloco.join(' ');
    if (/suspens|cancelad/i.test(bloco[0] || '')) continue;
    const disp = num(txt.match(/(\d+)\s*dispon[ií]ve(?:l|is)/i)?.[1] || txt.match(/dispon[ií]ve(?:l|is):\s*(\d+)/i)?.[1]);
    const atrib = num(txt.match(/(\d+)\s*atribu[ií]da/i)?.[1] || txt.match(/(\d+)\s*assigned/i)?.[1]);
    const gratuito = /free plan|gratuit|sem cobran|no charge/i.test(txt);
    const plano = txt.match(/(Annual Plan[^)]*\)?|Flexible Plan|Free Plan|Plano [^ ]+(?: [^ ]+)?)/i)?.[1] || '';
    out.push({
      origem: 'google',
      nome,
      fabricante: 'Google',
      assentos: atrib + disp || (gratuito ? 1 : 0),
      emUso: atrib || undefined,
      // Annual Plan (Monthly Payment) é pago todo mês; Flexible também
      cobranca: /annual plan(?!.*monthly)|anual \(pagamento anual\)/i.test(txt) ? 'anual' : 'mensal',
      gratuito,
      revenda: 'Google',
      detalhe: [atrib ? `${atrib} em uso` : '', disp ? `${disp} disponíveis` : '', plano].filter(Boolean).join(' · ') || 'Google Workspace',
    });
  }
  return out;
}

/** Nome comparável para achar o software já cadastrado */
export const chaveNome = (s: string) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
