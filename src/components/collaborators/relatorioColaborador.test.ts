import { describe, expect, it } from 'vitest';
import { htmlRelatorioColaborador, linhasExcelColaborador, type DadosRelatorioColaborador } from './relatorioColaborador.ts';

const d: DadosRelatorioColaborador = {
  empresa: 'Empresa',
  nome: 'Ana <Souza>',
  subtitulo: 'Analista · T.I.',
  dados: [['Gestor imediato', 'Bia']],
  secoes: [
    { titulo: 'Equipamentos com a pessoa', rotuloValor: 'Valor de compra', linhas: [{ item: 'NB-1 · Notebook', detalhe: 'Dell X', data: '2026-01-10', valor: 5000 }] },
    { titulo: 'Licenças de software', linhas: [], vazio: 'Nenhuma licença.' },
  ],
};

describe('relatório do colaborador', () => {
  it('HTML escapa o texto, mostra a coluna de valor só quando há valor e o vazio da seção', () => {
    const h = htmlRelatorioColaborador(d);
    expect(h).toContain('Ana &lt;Souza&gt;');
    expect(h).toContain('Valor de compra');
    expect(h).toContain('Nenhuma licença.');
    expect(h).toContain('@page{size:A4;margin:0}');
  });
  it('Excel: uma linha por item, com a seção na primeira coluna', () => {
    expect(linhasExcelColaborador(d)).toEqual([
      ['Dados', 'Gestor imediato', 'Bia', undefined, undefined],
      ['Equipamentos com a pessoa', 'NB-1 · Notebook', 'Dell X', '10/01/2026', 5000],
    ]);
  });
});
