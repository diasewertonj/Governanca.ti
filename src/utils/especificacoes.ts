// =============================================================================
// Seção 9.3 · Cadastro de equipamento padronizado.
// Especificações estruturadas (com sugestões) gravadas nos campos atuais do
// ativo (customFields): nada muda no banco. As chaves antigas continuam
// preenchidas (processador, memoriaRam, armazenamento, macAddress) para quem
// já lê esses campos; as novas guardam as partes para editar depois.
// =============================================================================
import type { AssetCategory, CustomFieldDefinition } from '../types/index.ts';

/** Fabricantes sugeridos (a lista aceita qualquer outro nome digitado) */
export const FABRICANTES: Record<'equipamento' | 'telefonia' | 'acessorio' | 'software', string[]> = {
  equipamento: ['Dell', 'Lenovo', 'HP', 'Apple', 'Samsung', 'LG', 'Acer', 'Asus', 'Positivo', 'Multilaser', 'Microsoft', 'Vaio', 'AOC', 'Philips', 'BenQ', 'Epson', 'Brother', 'APC', 'SMS'],
  telefonia: ['Apple', 'Samsung', 'Motorola', 'Xiaomi', 'Realme', 'Asus', 'Nokia', 'Intelbras', 'Cisco', 'Ubiquiti', 'TP-Link', 'Mikrotik', 'Huawei', 'Grandstream', 'Yealink'],
  acessorio: ['Logitech', 'Microsoft', 'Dell', 'HP', 'Lenovo', 'Multilaser', 'C3Tech', 'JBL', 'Jabra', 'Plantronics (Poly)', 'Razer', 'Redragon', 'Philips', 'Samsung', 'LG', 'AOC', 'Ugreen', 'Baseus', 'Anker', 'Intelbras'],
  software: ['Microsoft', 'Google', 'Adobe', 'Autodesk', 'Atlassian', 'Salesforce', 'Oracle', 'SAP', 'TOTVS', 'Slack', 'Zoom', 'OpenAI', 'Anthropic', 'Figma', 'Notion', 'GitHub', 'AWS', 'Kaspersky', 'ESET', 'Sophos', 'Fortinet', 'Bitdefender', 'TeamViewer', 'AnyDesk'],
};

/** Lista de sugestões de fabricante por categoria do ativo */
export const fabricantesDaCategoria = (c: AssetCategory) =>
  c === 'telefonia' ? FABRICANTES.telefonia : c === 'software' ? FABRICANTES.software : FABRICANTES.equipamento;

/** Tipo do equipamento (primeira palavra do nome sugerido) */
export const TIPOS_EQUIPAMENTO: Record<AssetCategory, string[]> = {
  hardware: ['Notebook', 'Desktop', 'All-in-one', 'Mini PC', 'Workstation', 'Servidor', 'Tablet'],
  periferico: ['Monitor', 'Dock station', 'Impressora', 'Scanner', 'Projetor', 'Nobreak', 'Webcam', 'Headset'],
  telefonia: ['Smartphone', 'Telefone IP', 'Roteador', 'Switch', 'Access point', 'Modem', 'Firewall'],
  software: [],
};

export const MEMORIA_TAMANHOS = ['4', '8', '12', '16', '24', '32', '36', '48', '64', '128'];
export const MEMORIA_TIPOS = ['DDR3', 'DDR4', 'DDR5', 'LPDDR4X', 'LPDDR5', 'LPDDR5X', 'Unificada'];
export const DISCO_TIPOS = ['SSD NVMe', 'SSD SATA', 'HD', 'eMMC'];
export const DISCO_CAPACIDADES = ['128 GB', '256 GB', '512 GB', '1 TB', '2 TB', '4 TB'];
export const CPU_FABRICANTES = ['Intel', 'AMD', 'Apple', 'Qualcomm', 'MediaTek'];
export const CPU_LINHAS: Record<string, string[]> = {
  Intel: ['Core i3', 'Core i5', 'Core i7', 'Core i9', 'Core Ultra 5', 'Core Ultra 7', 'Core Ultra 9', 'Core 3', 'Core 5', 'Core 7', 'Celeron', 'Pentium', 'Xeon'],
  AMD: ['Ryzen 3', 'Ryzen 5', 'Ryzen 7', 'Ryzen 9', 'Ryzen AI 5', 'Ryzen AI 7', 'Ryzen AI 9', 'Athlon', 'Threadripper', 'EPYC'],
  Apple: ['M1', 'M1 Pro', 'M1 Max', 'M2', 'M2 Pro', 'M2 Max', 'M3', 'M3 Pro', 'M3 Max', 'M4', 'M4 Pro', 'M4 Max'],
  Qualcomm: ['Snapdragon X', 'Snapdragon X Plus', 'Snapdragon X Elite', 'Snapdragon 8 Gen 3', 'Snapdragon 8 Elite'],
  MediaTek: ['Dimensity', 'Helio', 'Kompanio'],
};
/** Dica do campo "modelo/geração" do processador, por fabricante */
export const DICA_CPU_MODELO: Record<string, string> = {
  Intel: 'Ex.: 1265U, 1345U, 155H',
  AMD: 'Ex.: 7840U, 5600G',
  Apple: 'Ex.: 10 núcleos',
  Qualcomm: 'Ex.: X1E-78-100',
  MediaTek: 'Ex.: 9000',
};
export const SISTEMAS_OPERACIONAIS = [
  'Windows 11 Pro 64-bit',
  'Windows 11 Home',
  'Windows 10 Pro 64-bit',
  'macOS Sequoia 15.x',
  'macOS Sonoma 14.x',
  'Ubuntu Linux 24.04 LTS',
  'ChromeOS',
  'Android',
  'iOS',
];

export interface Especificacoes {
  tipo?: string;
  memoriaGb?: string;
  memoriaTipo?: string;
  discoTipo?: string;
  discoCapacidade?: string;
  cpuFabricante?: string;
  cpuLinha?: string;
  cpuModelo?: string;
}

/** Onde cada parte fica em customFields */
export const CHAVE: Record<keyof Especificacoes | 'serviceTag' | 'imei' | 'mac' | 'processador' | 'armazenamento', string> = {
  tipo: 'tipoEquipamento',
  memoriaGb: 'memoriaRam',
  memoriaTipo: 'memoriaTipo',
  discoTipo: 'armazenamentoTipo',
  discoCapacidade: 'armazenamentoCapacidade',
  cpuFabricante: 'processadorFabricante',
  cpuLinha: 'processadorLinha',
  cpuModelo: 'processadorModelo',
  processador: 'processador',
  armazenamento: 'armazenamento',
  serviceTag: 'serviceTag',
  imei: 'imei',
  mac: 'macAddress',
};

/** Chaves que o formulário estruturado cuida (não aparecem de novo como campo personalizado) */
export const CHAVES_ESTRUTURADAS = new Set(Object.values(CHAVE));

/** Rótulos das chaves conhecidas (as outras usam o rótulo do campo personalizado ou a própria chave) */
export const ROTULO_CHAVE: Record<string, string> = {
  tipoEquipamento: 'Tipo',
  processador: 'Processador',
  memoriaRam: 'Memória',
  armazenamento: 'Armazenamento',
  serviceTag: 'Service Tag / código expresso',
  imei: 'IMEI',
  macAddress: 'Endereço MAC',
};

/** Rótulo para exibir uma chave de customFields */
export function rotuloDaChave(chave: string, definicoes: CustomFieldDefinition[] = []): string {
  return ROTULO_CHAVE[chave] || definicoes.find((d) => d.key === chave)?.label || chave;
}

/** Processador em uma linha ("Intel Core i7-1265U", "Apple M3 Pro", "AMD Ryzen 7 7840U") */
/** Linha + modelo ("Core i7-1265U": Intel Core i3–i9 usa hífen antes do número) */
function linhaEModelo(e: Especificacoes): string {
  // Modelo digitado já com a linha ("i7-1265U", "Ryzen 7 7840U"): não repete a linha
  const curto = (e.cpuLinha || '').replace(/^Core /, '').toLowerCase();
  if (e.cpuModelo && curto && e.cpuModelo.toLowerCase().startsWith(curto)) {
    return `${/^Core /.test(e.cpuLinha || '') && !/^core /i.test(e.cpuModelo) ? 'Core ' : ''}${e.cpuModelo}`;
  }
  const intelCore = e.cpuFabricante === 'Intel' && /^Core (i\d|Ultra \d|\d)$/.test(e.cpuLinha || '');
  return [e.cpuLinha, e.cpuModelo].filter(Boolean).join(intelCore && e.cpuModelo && /^\d/.test(e.cpuModelo) ? '-' : ' ');
}

export function textoProcessador(e: Especificacoes): string {
  return [e.cpuFabricante, linhaEModelo(e)].filter(Boolean).join(' ').trim();
}

/** Forma curta para o nome sugerido ("i7-1265U", "Ryzen 7 7840U", "M3 Pro") */
export function processadorCurto(e: Especificacoes): string {
  return linhaEModelo(e).replace(/^Core (i\d)/, '$1');
}

export const textoMemoria = (e: Especificacoes) =>
  e.memoriaGb ? `${e.memoriaGb} GB${e.memoriaTipo ? ` ${e.memoriaTipo}` : ''}` : '';

export const textoDisco = (e: Especificacoes) => [e.discoTipo, e.discoCapacidade].filter(Boolean).join(' ');

/**
 * Nome sugerido: "Notebook Dell Latitude 5430 · i7-1265U · 16 GB · SSD NVMe 512 GB".
 * A pessoa pode editar; a sugestão só acompanha enquanto o nome não foi mexido.
 */
export function nomeSugerido(d: { tipo?: string; marca?: string; modelo?: string; espec?: Especificacoes }): string {
  const base = [d.tipo, d.marca, d.modelo].map((x) => (x || '').trim()).filter(Boolean).join(' ');
  const e = d.espec || {};
  const partes = [processadorCurto(e), e.memoriaGb ? `${e.memoriaGb} GB` : '', textoDisco(e)].filter(Boolean);
  return [base, ...partes].filter(Boolean).join(' · ');
}

/** Lê as partes de customFields; dados antigos (texto livre) são interpretados quando dá */
export function lerEspecificacoes(cf: Record<string, string> = {}): Especificacoes {
  const e: Especificacoes = {
    tipo: cf[CHAVE.tipo] || undefined,
    memoriaGb: (cf[CHAVE.memoriaGb] || '').replace(/\s*GB.*$/i, '').trim() || undefined,
    memoriaTipo: cf[CHAVE.memoriaTipo] || undefined,
    discoTipo: cf[CHAVE.discoTipo] || undefined,
    discoCapacidade: cf[CHAVE.discoCapacidade] || undefined,
    cpuFabricante: cf[CHAVE.cpuFabricante] || undefined,
    cpuLinha: cf[CHAVE.cpuLinha] || undefined,
    cpuModelo: cf[CHAVE.cpuModelo] || undefined,
  };
  // Processador antigo em texto: "Intel Core i7-1265U vPro (10 Cores...)", "Apple Silicon M3 Pro"
  const proc = cf[CHAVE.processador];
  if (proc && !e.cpuFabricante && !e.cpuLinha) {
    const fab = CPU_FABRICANTES.find((f) => new RegExp(`\\b${f}\\b`, 'i').test(proc));
    if (fab) {
      e.cpuFabricante = fab;
      const linhas = [...(CPU_LINHAS[fab] || [])].sort((a, b) => b.length - a.length);
      const linha = linhas.find((l) => proc.toLowerCase().includes(l.toLowerCase()));
      if (linha) {
        e.cpuLinha = linha;
        const depois = proc.slice(proc.toLowerCase().indexOf(linha.toLowerCase()) + linha.length).replace(/^[-\s]+/, '');
        e.cpuModelo = depois.split(/\s*\(/)[0].trim() || undefined;
      } else {
        e.cpuModelo = proc.replace(new RegExp(fab, 'i'), '').trim() || undefined;
      }
    } else {
      e.cpuModelo = proc;
    }
  }
  // Armazenamento antigo: "512GB NVMe PCIe Gen4 M.2 SSD", "1TB Apple Unified SSD", "256GB SSD"
  const disco = cf[CHAVE.armazenamento];
  if (disco && !e.discoTipo && !e.discoCapacidade) {
    e.discoTipo = /nvme/i.test(disco) ? 'SSD NVMe' : /ssd/i.test(disco) ? 'SSD SATA' : /\b(hd|hdd)\b/i.test(disco) ? 'HD' : /emmc/i.test(disco) ? 'eMMC' : undefined;
    const cap = /(\d+(?:[.,]\d+)?)\s*(GB|TB)/i.exec(disco);
    if (cap) e.discoCapacidade = `${cap[1]} ${cap[2].toUpperCase()}`;
  }
  return e;
}

/** Grava as partes (e as chaves antigas compostas) em customFields */
export function gravarEspecificacoes(cf: Record<string, string>, e: Especificacoes): Record<string, string> {
  const out: Record<string, string> = { ...cf };
  const por = (chave: string, valor?: string) => {
    if (valor && valor.trim()) out[chave] = valor.trim();
    else delete out[chave];
  };
  por(CHAVE.tipo, e.tipo);
  por(CHAVE.memoriaGb, e.memoriaGb);
  por(CHAVE.memoriaTipo, e.memoriaTipo);
  por(CHAVE.discoTipo, e.discoTipo);
  por(CHAVE.discoCapacidade, e.discoCapacidade);
  por(CHAVE.cpuFabricante, e.cpuFabricante);
  por(CHAVE.cpuLinha, e.cpuLinha);
  por(CHAVE.cpuModelo, e.cpuModelo);
  por(CHAVE.processador, textoProcessador(e));
  por(CHAVE.armazenamento, textoDisco(e));
  return out;
}

/** Itens do resumo da ficha (rótulo, valor) — partes internas não aparecem soltas */
export function resumoEspecificacoes(cf: Record<string, string> = {}, definicoes: CustomFieldDefinition[] = []): { rotulo: string; valor: string }[] {
  const e = lerEspecificacoes(cf);
  const itens: { rotulo: string; valor: string }[] = [];
  if (e.tipo) itens.push({ rotulo: 'Tipo', valor: e.tipo });
  const proc = textoProcessador(e) || cf[CHAVE.processador];
  if (proc) itens.push({ rotulo: 'Processador', valor: proc });
  if (e.memoriaGb) itens.push({ rotulo: 'Memória', valor: textoMemoria(e) });
  const disco = textoDisco(e) || cf[CHAVE.armazenamento];
  if (disco) itens.push({ rotulo: 'Armazenamento', valor: disco });
  for (const [k, v] of Object.entries(cf)) {
    if (!v || (CHAVES_ESTRUTURADAS.has(k) && !['serviceTag', 'imei', 'macAddress'].includes(k))) continue;
    itens.push({ rotulo: rotuloDaChave(k, definicoes), valor: v });
  }
  return itens;
}
