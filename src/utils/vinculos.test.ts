import { describe, expect, it } from 'vitest';
import type { Asset, Contrato, SoftwareLicense, Ticket } from '../types/index.ts';
import {
  chamadoEmAberto,
  chamadosDaPessoa,
  chamadosDoAtivo,
  chamadosDoSoftware,
  comQuemEstava,
  contratosDaLicenca,
  equipamentosDaPessoa,
  licencasDaPessoa,
  mudancasVinculos,
  notaDaManutencao,
  RASCUNHO_VAZIO,
  papelNoChamado,
  podeAbrirFicha,
  primeiroDaPessoa,
} from './vinculos.ts';

const tk = (id: string, extra: Partial<Ticket>): Ticket =>
  ({ id, codigo: id, solicitanteId: 'emp-9', dataCriacao: '2026-01-01', status: 'aberto', ...extra }) as Ticket;

describe('chamados ligados a cada ficha', () => {
  const tickets = [
    tk('a', { ativoId: 'at-1', dataCriacao: '2026-01-01' }),
    tk('b', { ativoId: 'at-1', softwareId: 'sw-1', dataCriacao: '2026-03-01' }),
    tk('c', { softwareId: 'sw-1', solicitanteId: 'emp-1', dataCriacao: '2026-02-01' }),
    tk('d', { colaboradorId: 'emp-1', solicitanteId: 'emp-2', dataCriacao: '2026-04-01' }),
  ];

  it('equipamento e software: só os ligados, do mais recente para o mais antigo', () => {
    expect(chamadosDoAtivo(tickets, 'at-1').map((t) => t.id)).toEqual(['b', 'a']);
    expect(chamadosDoSoftware(tickets, 'sw-1').map((t) => t.id)).toEqual(['b', 'c']);
    expect(chamadosDoAtivo(tickets, 'at-x')).toEqual([]);
  });

  it('pessoa: os que abriu e aqueles em que é o colaborador relacionado', () => {
    expect(chamadosDaPessoa(tickets, 'emp-1').map((t) => t.id)).toEqual(['d', 'c']);
    expect(papelNoChamado(tickets[2], 'emp-1')).toBe('Solicitante');
    expect(papelNoChamado(tickets[3], 'emp-1')).toBe('Relacionado');
    expect(papelNoChamado(tickets[3], 'emp-2')).toBe('Abriu');
  });

  it('em aberto = nem resolvido nem cancelado', () => {
    expect(chamadoEmAberto({ status: 'aguardando_terceiro' })).toBe(true);
    expect(chamadoEmAberto({ status: 'resolvido' })).toBe(false);
    expect(chamadoEmAberto({ status: 'cancelado' })).toBe(false);
  });
});

describe('quem pode abrir cada ficha', () => {
  it('T.I. abre todas', () => {
    for (const tipo of ['ativo', 'colaborador', 'software', 'chamado'] as const) {
      expect(podeAbrirFicha('ti_suporte', tipo)).toBe(true);
      expect(podeAbrirFicha('ti_admin', tipo)).toBe(true);
    }
  });

  it('RH abre pessoa, chamado e equipamento, mas não software', () => {
    expect(podeAbrirFicha('rh', 'colaborador')).toBe(true);
    expect(podeAbrirFicha('rh', 'chamado')).toBe(true);
    expect(podeAbrirFicha('rh', 'ativo')).toBe(true);
    expect(podeAbrirFicha('rh', 'software')).toBe(false);
  });

  it('colaborador só abre o que é dele', () => {
    const meuId = 'emp-1';
    expect(podeAbrirFicha('colaborador', 'colaborador', { meuId, colaboradorId: 'emp-1' })).toBe(true);
    expect(podeAbrirFicha('colaborador', 'colaborador', { meuId, colaboradorId: 'emp-2' })).toBe(false);
    expect(podeAbrirFicha('colaborador', 'ativo', { meuId, custodianteId: 'emp-1' })).toBe(true);
    expect(podeAbrirFicha('colaborador', 'ativo', { meuId, custodianteId: 'emp-2' })).toBe(false);
    expect(podeAbrirFicha('colaborador', 'chamado', { meuId, solicitanteId: 'emp-1' })).toBe(true);
    expect(podeAbrirFicha('colaborador', 'chamado', { meuId, solicitanteId: 'emp-3' })).toBe(false);
    expect(podeAbrirFicha('colaborador', 'software', { meuId })).toBe(false);
    expect(podeAbrirFicha('colaborador', 'ativo', {})).toBe(false);
  });
});

describe('listas de escolha com o que é da pessoa primeiro', () => {
  const assets = [
    { id: 'at-1', custodianteId: 'emp-1', status: 'em_uso' },
    { id: 'at-2', custodianteId: 'emp-2', status: 'em_uso' },
    { id: 'at-3', custodianteId: 'emp-1', status: 'descartado' },
  ] as Asset[];
  const licencas = [
    { id: 'sw-1', colaboradoresIds: ['emp-1'] },
    { id: 'sw-2', colaboradoresIds: [] as string[] },
  ] as SoftwareLicense[];

  it('equipamentos e licenças da pessoa (sem os baixados)', () => {
    expect(equipamentosDaPessoa(assets, 'emp-1').map((a) => a.id)).toEqual(['at-1']);
    expect(equipamentosDaPessoa(assets, undefined)).toEqual([]);
    expect(licencasDaPessoa(licencas, 'emp-1').map((l) => l.id)).toEqual(['sw-1']);
  });

  it('separa sem repetir', () => {
    const { daPessoa, demais } = primeiroDaPessoa(assets, equipamentosDaPessoa(assets, 'emp-1'));
    expect(daPessoa.map((a) => a.id)).toEqual(['at-1']);
    expect(demais.map((a) => a.id)).toEqual(['at-2', 'at-3']);
  });
});

describe('com quem o equipamento estava', () => {
  const asset = {
    historicoCustodia: [
      { id: 'h1', colaboradorId: 'emp-1', colaboradorNome: 'Ana', dataEntrega: '2025-01-10', dataDevolucao: '2025-06-30' },
      { id: 'h2', colaboradorId: 'emp-2', colaboradorNome: 'Bruno', dataEntrega: '2025-07-01T09:00:00Z' },
    ],
  } as Pick<Asset, 'historicoCustodia'>;

  it('pessoa com o equipamento na data', () => {
    expect(comQuemEstava(asset, '2025-03-01')).toEqual({ colaboradorId: 'emp-1', colaboradorNome: 'Ana' });
    expect(comQuemEstava(asset, '2025-06-30')?.colaboradorId).toBe('emp-1');
    expect(comQuemEstava(asset, '2026-01-01')?.colaboradorId).toBe('emp-2');
  });

  it('ninguém na data: a última pessoa, marcada como devolvido', () => {
    const devolvido = {
      historicoCustodia: [
        { id: 'h1', colaboradorId: 'emp-1', colaboradorNome: 'Ana', dataEntrega: '2025-01-10', dataDevolucao: '2025-06-30' },
      ],
    } as Pick<Asset, 'historicoCustodia'>;
    expect(comQuemEstava(devolvido, '2025-07-02')).toEqual({
      colaboradorId: 'emp-1',
      colaboradorNome: 'Ana',
      devolvidoEm: '2025-06-30',
    });
  });

  it('nunca teve ninguém', () => {
    expect(comQuemEstava({ historicoCustodia: [] }, '2025-01-01')).toBeNull();
    expect(comQuemEstava(asset, '2024-01-01')).toBeNull();
  });
});

describe('rascunho dos vínculos do chamado', () => {
  const suporte = { tipo: 'suporte' as const, ativoId: 'at-1', softwareId: undefined, colaboradorId: undefined };

  it('só conta o que muda de fato', () => {
    expect(mudancasVinculos(suporte, RASCUNHO_VAZIO)).toEqual([]);
    expect(mudancasVinculos(suporte, { ...RASCUNHO_VAZIO, ativoId: 'at-1' })).toEqual([]);
    expect(mudancasVinculos(suporte, { ...RASCUNHO_VAZIO, ativoId: '' })).toEqual(['ativoId']);
    expect(mudancasVinculos(suporte, { ativoId: null, softwareId: 'sw-1', colaboradorId: 'emp-1' })).toEqual([
      'softwareId',
      'colaboradorId',
    ]);
  });

  it('a pessoa da admissão/desligamento não muda por aqui', () => {
    expect(mudancasVinculos({ ...suporte, tipo: 'offboarding' }, { ...RASCUNHO_VAZIO, colaboradorId: 'emp-2' })).toEqual([]);
  });
});

describe('nota no chamado de origem', () => {
  const d = { tag: 'NB-0123', tipo: 'corretiva' as const, descricao: 'Tela quebrada' };

  it('abertura, já feita, conclusão e cancelamento', () => {
    expect(notaDaManutencao('aberta', d)).toBe('Equipamento NB-0123 enviado para manutenção (Corretiva): Tela quebrada');
    expect(notaDaManutencao('feita', { ...d, concluidaEm: '2026-03-10' })).toContain('10/03/2026');
    expect(notaDaManutencao('concluida', { ...d, concluidaEm: '2026-03-10', custo: 350 })).toMatch(
      /^Manutenção do equipamento NB-0123 concluída em 10\/03\/2026\. Custo: R\$\s?350,00\.$/
    );
    expect(notaDaManutencao('concluida', { ...d, custo: 0 })).toBe('Manutenção do equipamento NB-0123 concluída.');
    expect(notaDaManutencao('cancelada', d)).toBe('Manutenção do equipamento NB-0123 cancelada.');
  });
});

describe('contratos da licença', () => {
  const base = { fornecedorId: 'f1', descricao: 'x', valor: 0, periodicidade: 'anual', criadoEm: '2025-01-01' };
  const contratos = [
    { ...base, id: 'c1', tipo: 'licenciamento', inicio: '2025-01-01', fim: '2027-01-01', itens: [{ licencaId: 'sw-1' }] },
    { ...base, id: 'c2', tipo: 'suporte', inicio: '2025-01-01', fim: '2027-01-01', itens: [{ licencaId: 'sw-1' }] },
    { ...base, id: 'c3', tipo: 'suporte', inicio: '2025-01-01', fim: '2025-12-31', itens: [{ licencaId: 'sw-1' }] },
    { ...base, id: 'c4', tipo: 'suporte', inicio: '2025-01-01', fim: '2027-01-01', itens: [{ ativoId: 'at-1' }] },
  ] as Contrato[];

  it('só os vigentes da licença, suporte primeiro', () => {
    const agora = new Date('2026-06-01T12:00:00');
    expect(contratosDaLicenca('sw-1', contratos, agora).map((c) => c.id)).toEqual(['c2', 'c1']);
  });
});
