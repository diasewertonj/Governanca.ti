import { describe, expect, it } from 'vitest';
import type { Contrato } from '../types/index.ts';
import {
  contratosQueCobrem,
  contratoVigente,
  diferencaItens,
  fimCoberturaEfetiva,
  garantiaEfetiva,
  nomeContrato,
  resumoItens,
  resumoVinculos,
  situacaoContrato,
  temVinculos,
  vinculosDoFornecedor,
} from './contratos.ts';

const agora = new Date(2026, 10, 12, 22, 0, 0); // 12/11/2026, 22h local

const contrato = (dados: Partial<Contrato>): Contrato => ({
  id: 'ct-1',
  fornecedorId: 'f-1',
  tipo: 'suporte',
  descricao: 'Dell ProSupport',
  inicio: '2026-01-01',
  fim: '2027-06-30',
  valor: 9000,
  periodicidade: 'anual',
  itens: [{ ativoId: 'ast-1' }],
  criadoEm: '2026-01-01T00:00:00Z',
  ...dados,
});

const ativo = (dataGarantia: string) => ({
  id: 'ast-1',
  fiscal: { numeroNF: '', chaveAcesso44: '', valorCompra: 0, fornecedor: '', dataAquisicao: '', dataGarantia },
});

describe('situacaoContrato', () => {
  it('encerrado quando o fim já passou', () => {
    expect(situacaoContrato({ inicio: '2025-01-01', fim: '2026-11-11' }, agora)).toEqual({ situacao: 'encerrado', dias: -1 });
  });

  it('vencendo até 60 dias antes do fim (inclusive no último dia)', () => {
    expect(situacaoContrato({ inicio: '2025-01-01', fim: '2026-11-12' }, agora).situacao).toBe('vencendo');
    expect(situacaoContrato({ inicio: '2025-01-01', fim: '2027-01-11' }, agora)).toEqual({ situacao: 'vencendo', dias: 60 });
    expect(situacaoContrato({ inicio: '2025-01-01', fim: '2027-01-12' }, agora).situacao).toBe('vigente');
  });

  it('sem fim continua vigente; começo futuro fica "a iniciar"', () => {
    expect(situacaoContrato({ inicio: '2025-01-01' }, agora)).toEqual({ situacao: 'vigente', dias: undefined });
    expect(situacaoContrato({ inicio: '2026-12-01', fim: '2027-12-01' }, agora).situacao).toBe('a_iniciar');
  });

  it('vigência considera início e fim', () => {
    expect(contratoVigente({ inicio: '2026-11-12', fim: '2026-11-12' }, agora)).toBe(true);
    expect(contratoVigente({ inicio: '2026-11-13' }, agora)).toBe(false);
    expect(contratoVigente({ inicio: '2026-01-01', fim: '2026-11-11' }, agora)).toBe(false);
  });
});

describe('cobertura efetiva do ativo', () => {
  it('usa o fim do contrato quando ele vai além da garantia de fábrica', () => {
    expect(fimCoberturaEfetiva(ativo('2026-12-01'), [contrato({})], agora)).toBe('2027-06-30');
    expect(garantiaEfetiva(ativo('2026-12-01'), [contrato({})], agora)).toMatchObject({ status: 'valida', fim: '2027-06-30' });
  });

  it('mantém a garantia de fábrica quando ela é maior', () => {
    expect(fimCoberturaEfetiva(ativo('2028-01-01'), [contrato({})], agora)).toBe('2028-01-01');
  });

  it('cobre ativo sem data de garantia', () => {
    expect(fimCoberturaEfetiva(ativo(''), [contrato({})], agora)).toBe('2027-06-30');
    expect(garantiaEfetiva(ativo(''), [], agora).status).toBe('sem_data');
  });

  it('só conta contratos vigentes, de suporte ou garantia estendida, com fim, que cobrem o ativo', () => {
    const fora = [
      contrato({ id: 'a', tipo: 'locacao' }),
      contrato({ id: 'b', fim: '2026-11-01' }),
      contrato({ id: 'c', inicio: '2026-12-01' }),
      contrato({ id: 'd', fim: undefined }),
      contrato({ id: 'e', itens: [{ ativoId: 'ast-2' }, { licencaId: 'lic-1' }] }),
    ];
    expect(contratosQueCobrem('ast-1', fora, agora)).toEqual([]);
    expect(fimCoberturaEfetiva(ativo('2026-12-01'), fora, agora)).toBe('2026-12-01');
  });

  it('com vários contratos, vale o de fim mais distante', () => {
    const lista = [contrato({ id: 'x', fim: '2027-01-31' }), contrato({ id: 'y', tipo: 'garantia_estendida', fim: '2028-03-31' })];
    expect(contratosQueCobrem('ast-1', lista, agora).map((c) => c.id)).toEqual(['y', 'x']);
    expect(fimCoberturaEfetiva(ativo(''), lista, agora)).toBe('2028-03-31');
  });
});

describe('itens cobertos', () => {
  it('calcula o que entrou e o que saiu', () => {
    const { novos, removidos } = diferencaItens(
      [{ ativoId: 'a1' }, { ativoId: 'a2' }, { licencaId: 'l1' }],
      [{ ativoId: 'a2' }, { licencaId: 'l1' }, { licencaId: 'l2' }, { ativoId: 'a3' }]
    );
    expect(novos).toEqual([{ licencaId: 'l2' }, { ativoId: 'a3' }]);
    expect(removidos).toEqual([{ ativoId: 'a1' }]);
  });

  it('não confunde ativo e licença com o mesmo id', () => {
    expect(diferencaItens([{ ativoId: 'x' }], [{ licencaId: 'x' }])).toEqual({
      novos: [{ licencaId: 'x' }],
      removidos: [{ ativoId: 'x' }],
    });
  });

  it('resume em texto com plural', () => {
    expect(resumoItens([])).toBe('Nenhum item');
    expect(resumoItens([{ ativoId: 'a' }])).toBe('1 ativo');
    expect(resumoItens([{ ativoId: 'a' }, { ativoId: 'b' }, { licencaId: 'l' }])).toBe('2 ativos · 1 licença');
    expect(resumoItens([{ licencaId: 'l' }, { licencaId: 'm' }])).toBe('2 licenças');
  });

  it('conta e resume os vínculos do fornecedor', () => {
    const v = vinculosDoFornecedor('f-1', {
      contratos: [{ fornecedorId: 'f-1' }, { fornecedorId: 'f-2' }],
      ativos: [{ fornecedorId: 'f-1' }, { fornecedorId: 'f-1' }, {}],
      licencas: [{ fornecedorId: 'f-1' }],
    });
    expect(v).toEqual({ contratos: 1, ativos: 2, licencas: 1 });
    expect(resumoVinculos(v)).toBe('1 contrato · 2 ativos · 1 licença');
    expect(temVinculos(v)).toBe(true);
    const nenhum = { contratos: 0, ativos: 0, licencas: 0 };
    expect(resumoVinculos(nenhum)).toBe('Nenhum vínculo');
    expect(temVinculos(nenhum)).toBe(false);
  });

  it('nome do contrato usa número quando houver', () => {
    expect(nomeContrato({ numero: '#CT-88', descricao: 'Dell ProSupport' })).toBe('#CT-88 · Dell ProSupport');
    expect(nomeContrato({ descricao: 'Dell ProSupport' })).toBe('Dell ProSupport');
  });
});
