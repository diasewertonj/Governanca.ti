// =============================================================================
// Seção 9.3 · Máscaras que ajudam sem travar.
// Formatam enquanto a pessoa digita; se o dado não bater (tamanho, dígito
// verificador), só avisam — o cadastro salva assim mesmo. Texto com letras
// (ex.: "ramal 204") fica como foi digitado.
// =============================================================================

export type TipoMascara = 'cnpj' | 'cep' | 'telefone' | 'chave_nfe' | 'imei' | 'mac' | 'iccid';

export const soDigitos = (s?: string) => (s || '').replace(/\D/g, '');

/** Junta os pedaços de `d` com os separadores, só até onde já foi digitado */
function montar(d: string, tamanhos: number[], separadores: string[]): string {
  let out = '';
  let i = 0;
  tamanhos.forEach((t, k) => {
    if (i >= d.length) return;
    out += (k > 0 ? separadores[k - 1] : '') + d.slice(i, i + t);
    i += t;
  });
  return out;
}

/** Soma de Luhn (IMEI, ICCID) */
function luhnValido(d: string): boolean {
  let soma = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
  }
  return soma % 10 === 0;
}

// -----------------------------------------------------------------------------
// CNPJ (numérico e alfanumérico, que vale desde julho de 2026)
// -----------------------------------------------------------------------------
const cnpjBruto = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14);

export const formatarCnpj = (v: string) => montar(cnpjBruto(v), [2, 3, 3, 4, 2], ['.', '.', '/', '-']);

export function cnpjValido(v: string): boolean {
  const c = cnpjBruto(v);
  if (c.length !== 14 || !/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const valor = (ch: string) => ch.charCodeAt(0) - 48;
  const dv = (base: string, pesos: number[]) => {
    const soma = base.split('').reduce((s, ch, i) => s + valor(ch) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = dv(c.slice(0, 12), p1);
  const d2 = dv(c.slice(0, 12) + d1, p2);
  return c.slice(12) === `${d1}${d2}`;
}

// -----------------------------------------------------------------------------
// CEP, telefone
// -----------------------------------------------------------------------------
export const formatarCep = (v: string) => montar(soDigitos(v).slice(0, 8), [5, 3], ['-']);

export function formatarTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  if (!d) return '';
  // Ramal (até 5 dígitos, sem parênteses digitados) fica como está
  if (d.length <= 5 && !/[()]/.test(v)) return d;
  // 0800 / 0300 / 0500: "0800 970 3355"
  if (/^0[358]00/.test(d)) return montar(d, [4, 3, 4], [' ', ' ']);
  // 4004-0000 / 3003-0000 (números únicos nacionais)
  if (/^(400[0-9]|300[0-9])/.test(d) && d.length <= 8) return montar(d, [4, 4], ['-']);
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const corte = resto.length > 8 ? 5 : 4;
  return resto.length > corte ? `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}` : `(${ddd}) ${resto}`;
}

export function telefoneValido(v: string): boolean {
  const d = soDigitos(v);
  if (d.length >= 3 && d.length <= 5 && !/[()]/.test(v)) return true; // ramal
  if (/^0[358]00/.test(d)) return d.length === 11;
  if (/^(400|300)/.test(d) && d.length === 8) return true;
  return d.length === 10 || d.length === 11;
}

// -----------------------------------------------------------------------------
// Chave de acesso da NF-e (44 dígitos, DV módulo 11)
// -----------------------------------------------------------------------------
export const formatarChaveNfe = (v: string) => (soDigitos(v).slice(0, 44).match(/.{1,4}/g) || []).join(' ');

export function chaveNfeDvValido(v: string): boolean {
  const d = soDigitos(v);
  if (d.length !== 44) return false;
  let peso = 2;
  let soma = 0;
  for (let i = 42; i >= 0; i--) {
    soma += Number(d[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  const dv = r < 2 ? 0 : 11 - r;
  return dv === Number(d[43]);
}

// -----------------------------------------------------------------------------
// IMEI (15), MAC, ICCID do chip (19 ou 20, começa com 89)
// -----------------------------------------------------------------------------
export const formatarImei = (v: string) => montar(soDigitos(v).slice(0, 15), [2, 6, 6, 1], ['-', '-', '-']);
export const imeiValido = (v: string) => {
  const d = soDigitos(v);
  return d.length === 15 && luhnValido(d);
};

const macBruto = (v: string) => v.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
export const formatarMac = (v: string) => (macBruto(v).match(/.{1,2}/g) || []).join(':');
export const macValido = (v: string) => macBruto(v).length === 12;

export const formatarIccid = (v: string) => (soDigitos(v).slice(0, 20).match(/.{1,4}/g) || []).join(' ');
export const iccidValido = (v: string) => {
  const d = soDigitos(v);
  return (d.length === 19 || d.length === 20) && d.startsWith('89') && luhnValido(d);
};

// -----------------------------------------------------------------------------
// Uma entrada só para os campos: formatar, avisar, teclado do celular
// -----------------------------------------------------------------------------
interface DefMascara {
  formatar: (v: string) => string;
  /** Caracteres que a máscara entende; com outros (ex.: "ramal"), o texto fica como foi digitado */
  aceita: RegExp;
  aviso: (v: string) => string | null;
  inputMode: 'numeric' | 'tel' | 'text';
  placeholder: string;
}

const faltam = (atual: number, total: number) => (atual < total ? ` (faltam ${total - atual})` : '');

export const MASCARAS: Record<TipoMascara, DefMascara> = {
  cnpj: {
    formatar: formatarCnpj,
    aceita: /^[0-9A-Za-z.\-/\s]*$/,
    aviso: (v) => {
      const n = cnpjBruto(v).length;
      if (n !== 14) return `CNPJ tem 14 caracteres${faltam(n, 14)}. Confira; dá para salvar assim mesmo.`;
      return cnpjValido(v) ? null : 'Os dígitos verificadores do CNPJ não conferem. Confira; dá para salvar assim mesmo.';
    },
    inputMode: 'text',
    placeholder: '00.000.000/0000-00',
  },
  cep: {
    formatar: formatarCep,
    aceita: /^[0-9.\-\s]*$/,
    aviso: (v) => (soDigitos(v).length === 8 ? null : `CEP tem 8 dígitos${faltam(soDigitos(v).length, 8)}.`),
    inputMode: 'numeric',
    placeholder: '00000-000',
  },
  telefone: {
    formatar: formatarTelefone,
    aceita: /^[0-9()+\-\s]*$/,
    aviso: (v) => (telefoneValido(v) ? null : 'Telefone com DDD tem 10 ou 11 dígitos. Confira; dá para salvar assim mesmo.'),
    inputMode: 'tel',
    placeholder: '(11) 98765-4321',
  },
  chave_nfe: {
    formatar: formatarChaveNfe,
    aceita: /^[0-9\s.-]*$/,
    aviso: (v) => {
      const n = soDigitos(v).length;
      if (n !== 44) return `A chave da NF-e tem 44 dígitos${faltam(n, 44)}${n > 44 ? ' (sobram dígitos)' : ''}.`;
      return chaveNfeDvValido(v) ? null : 'O dígito verificador da chave não confere. Confira com a nota; dá para salvar assim mesmo.';
    },
    inputMode: 'numeric',
    placeholder: '3524 0112 3456 7800 0190 5500 1000 0048 2110 0293 8475',
  },
  imei: {
    formatar: formatarImei,
    aceita: /^[0-9\-\s/]*$/,
    aviso: (v) => {
      const n = soDigitos(v).length;
      if (n !== 15) return `IMEI tem 15 dígitos${faltam(n, 15)}. Disque *#06# no aparelho para ver.`;
      return imeiValido(v) ? null : 'O IMEI não confere (dígito final). Confira; dá para salvar assim mesmo.';
    },
    inputMode: 'numeric',
    placeholder: '35-209900-176148-1',
  },
  mac: {
    formatar: formatarMac,
    aceita: /^[0-9A-Fa-f:\-.\s]*$/,
    aviso: (v) => (macValido(v) ? null : 'Endereço MAC tem 12 caracteres (0–9 e A–F).'),
    inputMode: 'text',
    placeholder: 'AA:BB:CC:DD:EE:FF',
  },
  iccid: {
    formatar: formatarIccid,
    aceita: /^[0-9\s]*$/,
    aviso: (v) => {
      const n = soDigitos(v).length;
      if (n !== 19 && n !== 20) return `O ICCID do chip tem 19 ou 20 dígitos${faltam(n, 19)}.`;
      return iccidValido(v) ? null : 'O ICCID não confere (começa com 89 e tem dígito final). Confira; dá para salvar assim mesmo.';
    },
    inputMode: 'numeric',
    placeholder: '8955 0000 0000 0000 0000',
  },
};

/** Valor como fica no campo: formatado se a máscara entende o texto; senão, como foi digitado */
export function aplicarMascara(tipo: TipoMascara, v: string): string {
  const def = MASCARAS[tipo];
  return def.aceita.test(v) ? def.formatar(v) : v;
}

/** Aviso (não bloqueia) para um valor preenchido; vazio não avisa */
export function avisoMascara(tipo: TipoMascara, v: string): string | null {
  if (!v.trim()) return null;
  const def = MASCARAS[tipo];
  if (!def.aceita.test(v)) return 'Formato não reconhecido. Confira; dá para salvar assim mesmo.';
  return def.aviso(v);
}

// -----------------------------------------------------------------------------
// R$: "6850" → "6.850"; vírgula para os centavos; ao sair do campo, "6.850,00"
// -----------------------------------------------------------------------------
/**
 * Texto do campo enquanto se digita. `colado` = o texto chegou de uma vez (colar):
 * aí "6850.00" é lido como 6.850,00 (ponto decimal à moda americana).
 */
export function digitandoMoeda(texto: string, colado = false): string {
  let t = texto.replace(/[^\d,.]/g, '');
  // Ponto digitado por último sem vírgula = a pessoa quis a vírgula dos centavos
  if (!t.includes(',') && t.endsWith('.')) t = `${t.slice(0, -1)},`;
  if (colado && !t.includes(',') && (t.match(/\./g) || []).length === 1 && /\.\d{1,2}$/.test(t)) t = t.replace('.', ',');
  const [inteiro, ...resto] = t.split(',');
  const centavos = resto.join('').slice(0, 2);
  const int = inteiro.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return t.includes(',') ? `${intFmt || '0'},${centavos}` : intFmt;
}

/** Número do texto digitado (vazio = undefined) */
export function valorDaMoeda(texto: string): number | undefined {
  const t = texto.replace(/[^\d,]/g, '').replace(',', '.');
  if (!t || t === '.') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Número → texto do campo ("6.850,00") */
export const textoDaMoeda = (n?: number) =>
  n === undefined || n === null || !Number.isFinite(n)
    ? ''
    : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
