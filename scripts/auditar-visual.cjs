#!/usr/bin/env node
/**
 * Seção 19 — auditoria automática do padrão visual 2.0.
 * Conta os desvios no código das telas: tamanho de texto avulso (text-xs/sm/[Npx]),
 * peso avulso (font-bold/medium), ícone com tamanho manual (h-N w-N num ícone do
 * lucide), espaçamento fora da escala 4/8/12/16/24, cores proibidas
 * (índigo/roxo/rosa/…) e botão só de ícone sem aria-label.
 *
 * Exceções justificadas (não contam): arquivos de impressão, que têm medidas
 * próprias de papel, e a galeria, cujo quadro "Antes" reproduz o visual antigo.
 *
 * Uso: node scripts/auditar-visual.cjs  [--detalhe]
 */
const fs = require('fs');
const path = require('path');

const EXCECOES = ['PrintableTermModal.tsx', 'relatorioChamado.ts', 'QrCodeLabelModal.tsx', 'GaleriaVisual.tsx'];
const detalhe = process.argv.includes('--detalhe');

function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return arquivos(p);
    return /\.(tsx|ts)$/.test(d.name) && !/\.test\./.test(d.name) && !EXCECOES.includes(d.name) ? [p] : [];
  });
}

const regras = {
  'texto avulso (text-xs/sm/[Npx])': /\btext-(xs|sm|\[\d+px\])\b/g,
  'peso avulso (font-bold/medium)': /\bfont-(bold|medium)\b/g,
  'cor proibida': /\b(?:text|bg|border|ring|from|to|decoration)-(indigo|violet|purple|pink|rose|fuchsia)-\d+/g,
  'espaço fora da escala': /(?<![\w-])-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-y|space-x)-(1\.5|2\.5|3\.5|5|7)\b/g,
};

const total = Object.fromEntries([...Object.keys(regras), 'ícone com tamanho manual', 'btn-icone sem aria-label'].map((k) => [k, 0]));
const porArquivo = [];

for (const f of arquivos(path.join(__dirname, '..', 'src'))) {
  const t = fs.readFileSync(f, 'utf8');
  const linha = { arquivo: path.relative(path.join(__dirname, '..'), f), n: 0 };
  for (const [nome, re] of Object.entries(regras)) {
    const c = (t.match(re) || []).length;
    total[nome] += c;
    linha.n += c;
  }
  // ícones do lucide com h-/w- manual
  const imp = t.match(/import\s*\{([^}]*)\}\s*from\s*'lucide-react'/);
  if (imp) {
    const nomes = imp[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop()).filter(Boolean);
    const re = new RegExp(`<(?:${nomes.join('|')})\\b[^>]*className="[^"]*\\b!?[hw]-\\d`, 'g');
    const c = (t.match(re) || []).length;
    total['ícone com tamanho manual'] += c;
    linha.n += c;
  }
  // btn-icone sem aria-label (no mesmo elemento)
  let sem = 0;
  for (let i = t.indexOf('<button'); i >= 0; i = t.indexOf('<button', i + 1)) {
    // fim da tag de abertura, ignorando ">" dentro de {…} e de textos
    let j = i + 7;
    let chaves = 0;
    let aspas = null;
    for (; j < t.length; j++) {
      const c = t[j];
      if (aspas) {
        if (c === aspas) aspas = null;
      } else if (c === '"' || c === "'" || c === '`') aspas = c;
      else if (c === '{') chaves++;
      else if (c === '}') chaves--;
      else if (c === '>' && chaves === 0) break;
    }
    const tag = t.slice(i, j);
    if (/\bbtn-icone\b/.test(tag) && !/aria-label=/.test(tag)) {
      sem++;
      if (detalhe) console.log(`  sem aria-label: ${path.relative(process.cwd(), f)}:${t.slice(0, i).split('\n').length}`);
    }
  }
  total['btn-icone sem aria-label'] += sem;
  linha.n += sem;
  if (linha.n) porArquivo.push(linha);
}

console.log('Auditoria do padrão visual 2.0 (seção 19)');
for (const [k, v] of Object.entries(total)) console.log(`  ${k.padEnd(34)} ${v}`);
if (detalhe) porArquivo.sort((a, b) => b.n - a.n).forEach((l) => console.log(`  ${String(l.n).padStart(4)}  ${l.arquivo}`));
process.exitCode = Object.values(total).some((v) => v > 0) ? 1 : 0;
