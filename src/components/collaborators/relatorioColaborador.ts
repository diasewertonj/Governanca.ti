// Seção 24: relatório geral do colaborador (PDF pela janela de impressão e Excel).
// Mesma folha do relatório do chamado: A4 sem o cabeçalho/rodapé do navegador.
import { baixarExcel, brl, paraExcel } from '../../utils/financeiro.ts';
import { formatDate, formatDateTime } from '../../utils/formatters.ts';

export interface LinhaRelatorio {
  item: string;
  detalhe?: string;
  /** AAAA-MM-DD */
  data?: string;
  valor?: number;
}
export interface SecaoRelatorio {
  titulo: string;
  linhas: LinhaRelatorio[];
  vazio?: string;
  /** Rótulo da coluna de data (ex.: "Desde", "Emissão") */
  rotuloData?: string;
  /** Rótulo da coluna de valor (ex.: "Valor de compra", "Por mês") */
  rotuloValor?: string;
}
export interface DadosRelatorioColaborador {
  empresa?: string;
  nome: string;
  subtitulo: string;
  dados: [string, string][];
  secoes: SecaoRelatorio[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function htmlRelatorioColaborador(d: DadosRelatorioColaborador): string {
  const secao = (s: SecaoRelatorio) => {
    if (!s.linhas.length) return `<h2>${esc(s.titulo)}</h2><p class="meta">${esc(s.vazio || 'Nada registrado.')}</p>`;
    const temDetalhe = s.linhas.some((l) => l.detalhe);
    const temData = s.linhas.some((l) => l.data);
    const temValor = s.linhas.some((l) => l.valor !== undefined);
    return `<h2>${esc(s.titulo)} (${s.linhas.length})</h2>
<table class="grade"><thead><tr><th>Item</th>${temDetalhe ? '<th>Detalhe</th>' : ''}${temData ? `<th>${esc(s.rotuloData || 'Data')}</th>` : ''}${temValor ? `<th class="n">${esc(s.rotuloValor || 'Valor')}</th>` : ''}</tr></thead><tbody>
${s.linhas
  .map(
    (l) =>
      `<tr><td>${esc(l.item)}</td>${temDetalhe ? `<td>${esc(l.detalhe || '')}</td>` : ''}${temData ? `<td>${l.data ? esc(formatDate(l.data)) : ''}</td>` : ''}${temValor ? `<td class="n">${l.valor !== undefined ? esc(brl(l.valor)) : ''}</td>` : ''}</tr>`
  )
  .join('\n')}
</tbody></table>`;
  };
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório · ${esc(d.nome)}</title>
<style>
  body{font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;margin:32px auto;max-width:780px;padding:0 16px}
  h1{font-size:20px;margin:4px 0 2px} h2{font-size:14px;margin:22px 0 6px;border-bottom:1px solid #cbd5e1;padding-bottom:4px}
  .meta{color:#475569;font-size:12px} table{border-collapse:collapse;width:100%} th{text-align:left;color:#475569;font-weight:600;vertical-align:top;padding:3px 8px 3px 0} td{padding:3px 0;vertical-align:top}
  table.dados th{width:170px}
  table.grade th{border-bottom:1px solid #cbd5e1;padding:4px 8px 4px 0} table.grade td{border-bottom:1px solid #e2e8f0;padding:5px 8px 5px 0}
  .n{text-align:right;white-space:nowrap}
  table.folha,table.folha>tbody>tr>td{border:0;padding:0}
  .respiro{height:14mm}
  @page{size:A4;margin:0}
  @media screen{.respiro{display:none}}
  @media print{body{margin:0;max-width:none;padding:0 16mm} h2{break-after:avoid} tr{break-inside:avoid}}
</style></head><body>
<table class="folha"><thead><tr><td><div class="respiro"></div></td></tr></thead><tfoot><tr><td><div class="respiro"></div></td></tr></tfoot><tbody><tr><td>
<div class="meta">${esc(d.empresa || '')}${d.empresa ? ' · ' : ''}Relatório do colaborador</div>
<h1>${esc(d.nome)}</h1>
<div class="meta">${esc(d.subtitulo)} · emitido em ${esc(formatDateTime(new Date().toISOString()))}</div>
<h2>Dados</h2>
<table class="dados">${d.dados.map(([r, v]) => `<tr><th>${esc(r)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
${d.secoes.map(secao).join('\n')}
</td></tr></tbody></table>
</body></html>`;
}

export function imprimirRelatorioColaborador(d: DadosRelatorioColaborador) {
  const janela = window.open('', '_blank');
  if (!janela) return;
  janela.opener = null;
  janela.document.write(htmlRelatorioColaborador(d));
  janela.document.close();
  // A política de segurança do site não permite script dentro do relatório: imprime daqui
  janela.focus();
  janela.print();
}

/** Excel: uma tabela só (Seção · Item · Detalhe · Data · Valor), fácil de filtrar */
export function linhasExcelColaborador(d: DadosRelatorioColaborador): (string | number | undefined)[][] {
  return [
    ...d.dados.map(([r, v]) => ['Dados', r, v, undefined, undefined]),
    ...d.secoes.flatMap((s) => s.linhas.map((l) => [s.titulo, l.item, l.detalhe, l.data ? formatDate(l.data) : undefined, l.valor])),
  ];
}

export function baixarExcelColaborador(d: DadosRelatorioColaborador) {
  const nome = d.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase();
  baixarExcel(`colaborador-${nome}.xls`, paraExcel('Colaborador', ['Seção', 'Item', 'Detalhe', 'Data', 'Valor'], linhasExcelColaborador(d)));
}
