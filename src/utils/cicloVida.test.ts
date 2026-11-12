import { describe, expect, it } from 'vitest';
import type { Asset, BaixaAtivo, DadosManutencao, Manutencao } from '../types/index.ts';
import {
  aplicarAbertura,
  aplicarBaixa,
  aplicarEncerramento,
  aplicarEstorno,
  baixaVigente,
  bloqueiosDaBaixa,
  custoAcumulado,
  erroAoAbrirManutencao,
  juntarObservacoes,
  manutencaoEmAndamento,
  manutencoesOrdenadas,
  novaManutencao,
  statusAoMudarCustodia,
  totalGastoManutencoes,
  validarBaixa,
  validarEncerramento,
  validarManutencao,
} from './cicloVida.ts';

const agora = new Date(2026, 10, 12, 22, 0, 0); // 12/11/2026, 22h local

const manutencao = (dados: Partial<Manutencao>): Manutencao => ({
  id: 'm-1',
  ativoId: 'ast-1',
  tipo: 'corretiva',
  descricao: 'Tela piscando',
  abertaEm: '2026-11-01',
  custo: 0,
  cobertoGarantia: false,
  status: 'concluida',
  concluidaEm: '2026-11-02',
  criadoEm: '2026-11-01T10:00:00Z',
  ...dados,
});

const ativo = (dados: Partial<Asset> = {}): Asset => ({
  id: 'ast-1',
  tag: '#P1',
  nome: 'Notebook',
  categoria: 'hardware',
  marca: 'Dell',
  modelo: 'X',
  serialNumber: 'SN1',
  localizacaoFisica: 'Casa',
  status: 'em_uso',
  custodianteId: 'emp-1',
  dataEntregaAtual: '2026-01-10',
  fiscal: { numeroNF: '', chaveAcesso44: '', valorCompra: 5000, fornecedor: '', dataAquisicao: '', dataGarantia: '' },
  historicoCustodia: [
    { id: 'h-0', colaboradorId: 'emp-0', colaboradorNome: 'Antigo', dataEntrega: '2025-01-01', dataDevolucao: '2026-01-09' },
    { id: 'h-1', colaboradorId: 'emp-1', colaboradorNome: 'Ana', dataEntrega: '2026-01-10' },
  ],
  historicoManutencao: [],
  ...dados,
});

const dados: DadosManutencao = {
  tipo: 'corretiva',
  descricao: ' Troca do painel ',
  abertaEm: '2026-11-12',
  custo: 980,
  cobertoGarantia: false,
};

describe('custos das manutenções', () => {
  it('total gasto soma só as concluídas; custo acumulado inclui o valor de compra', () => {
    const lista = [
      manutencao({ id: 'a', custo: 400 }),
      manutencao({ id: 'b', custo: 980.5 }),
      manutencao({ id: 'c', custo: 300, status: 'em_andamento', concluidaEm: undefined }),
      manutencao({ id: 'd', custo: 50, status: 'cancelada', concluidaEm: undefined }),
    ];
    expect(totalGastoManutencoes(lista)).toBe(1380.5);
    expect(custoAcumulado(ativo({ historicoManutencao: lista }))).toBe(6380.5);
    expect(custoAcumulado(ativo({ fiscal: undefined as unknown as Asset['fiscal'] }))).toBe(0);
  });

  it('lista da mais recente para a mais antiga (no empate, a registrada por último)', () => {
    const lista = [
      manutencao({ id: 'a', abertaEm: '2026-03-02' }),
      manutencao({ id: 'b', abertaEm: '2026-10-15', criadoEm: '2026-10-15T08:00:00Z' }),
      manutencao({ id: 'c', abertaEm: '2026-10-15', criadoEm: '2026-10-15T09:00:00Z' }),
    ];
    expect(manutencoesOrdenadas(lista).map((m) => m.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('enviar para manutenção e concluir', () => {
  it('só abre com o ativo não baixado e sem outra manutenção aberta', () => {
    expect(erroAoAbrirManutencao(ativo())).toBeNull();
    expect(erroAoAbrirManutencao(ativo({ status: 'descartado' }))).toBe('O ativo #P1 está baixado');
    // "em manutenção" sem registro (avaria no desligamento) pode ganhar o registro
    expect(erroAoAbrirManutencao(ativo({ status: 'manutencao' }))).toBeNull();
    const aberta = novaManutencao('m-8', 'ast-1', dados, 'emp-sup', agora);
    expect(erroAoAbrirManutencao(ativo({ status: 'manutencao', historicoManutencao: [aberta] }))).toBe(
      'O ativo #P1 já está em manutenção'
    );
  });

  it('abrir põe o ativo em manutenção sem mexer na custódia', () => {
    const m = novaManutencao('m-9', 'ast-1', dados, 'emp-sup', agora);
    expect(m).toMatchObject({ status: 'em_andamento', descricao: 'Troca do painel', criadoPor: 'emp-sup', concluidaEm: undefined });
    const depois = aplicarAbertura(ativo(), m);
    expect(depois).toMatchObject({ status: 'manutencao', custodianteId: 'emp-1' });
    expect(manutencaoEmAndamento(depois)?.id).toBe('m-9');
  });

  it('concluir volta para "em uso" com custodiante e para "disponível" sem', () => {
    const aberta = manutencao({ id: 'm-9', status: 'em_andamento', concluidaEm: undefined, custo: 980 });
    const comAlguem = aplicarEncerramento(ativo({ status: 'manutencao', historicoManutencao: [aberta] }), 'm-9', 'concluida',
      { concluidaEm: '2026-11-20', custo: 1050.5 }, 'emp-sup', agora);
    expect(comAlguem.status).toBe('em_uso');
    expect(comAlguem.historicoManutencao[0]).toMatchObject({ status: 'concluida', concluidaEm: '2026-11-20', custo: 1050.5, encerradoPor: 'emp-sup' });

    const noEstoque = aplicarEncerramento(ativo({ status: 'manutencao', custodianteId: undefined, historicoManutencao: [aberta] }),
      'm-9', 'cancelada', {}, 'emp-sup', agora);
    expect(noEstoque.status).toBe('disponivel');
    expect(noEstoque.historicoManutencao[0]).toMatchObject({ status: 'cancelada', concluidaEm: undefined, custo: 980 });
  });

  it('mudar a custódia de ativo em manutenção mantém "em manutenção" (como o gatilho do banco)', () => {
    const emManutencao = ativo({ status: 'manutencao', historicoManutencao: [manutencao({ status: 'em_andamento' })] });
    expect(statusAoMudarCustodia(emManutencao, null)).toBe('manutencao');
    expect(statusAoMudarCustodia(emManutencao, 'emp-2')).toBe('manutencao');
    // Sem manutenção aberta (ex.: avaria no desligamento), o status segue a custódia
    expect(statusAoMudarCustodia(ativo({ status: 'manutencao' }), null)).toBe('disponivel');
    expect(statusAoMudarCustodia(ativo(), 'emp-2')).toBe('em_uso');
  });

  it('a observação do encerramento não apaga a da abertura', () => {
    expect(juntarObservacoes('Cliente relatou queda', ' Painel trocado ', 'concluida')).toBe('Cliente relatou queda\nConclusão: Painel trocado');
    expect(juntarObservacoes(undefined, 'Sem peça', 'cancelada')).toBe('Cancelamento: Sem peça');
    expect(juntarObservacoes('Algo', '  ', 'concluida')).toBeUndefined();
  });
});

describe('validações da manutenção', () => {
  it('exige descrição, abertura, custo não negativo e datas em ordem', () => {
    expect(validarManutencao(dados)).toBeNull();
    expect(validarManutencao({ ...dados, descricao: '  ' })).toBe('Descreva o problema ou o serviço.');
    expect(validarManutencao({ ...dados, custo: -1 })).toBe('Informe um custo válido (zero ou mais).');
    expect(validarManutencao({ ...dados, custo: Number.NaN })).toBe('Informe um custo válido (zero ou mais).');
    expect(validarManutencao({ ...dados, previsao: '2026-11-11' })).toBe('A previsão não pode ser anterior à abertura.');
  });

  it('manutenção já feita exige a conclusão, não anterior à abertura', () => {
    expect(validarManutencao(dados, true)).toBe('Informe a data de conclusão.');
    expect(validarManutencao({ ...dados, concluidaEm: '2026-11-11' }, true)).toBe('A conclusão não pode ser anterior à abertura.');
    expect(validarManutencao({ ...dados, concluidaEm: '2026-11-12' }, true)).toBeNull();
  });

  it('concluir exige data; cancelar não; encerrada não encerra de novo', () => {
    const aberta = { abertaEm: '2026-11-01', status: 'em_andamento' as const };
    expect(validarEncerramento(aberta, 'concluida', {})).toBe('Informe a data de conclusão.');
    expect(validarEncerramento(aberta, 'concluida', { concluidaEm: '2026-10-31' })).toBe('A conclusão não pode ser anterior à abertura.');
    expect(validarEncerramento(aberta, 'cancelada', {})).toBeNull();
    expect(validarEncerramento({ ...aberta, status: 'concluida' }, 'cancelada', {})).toBe('Esta manutenção já foi encerrada.');
  });
});

describe('baixa patrimonial', () => {
  const baixa = (d: Partial<BaixaAtivo> = {}): BaixaAtivo => ({
    id: 'b-1',
    ativoId: 'ast-1',
    dataBaixa: '2026-11-12',
    motivo: 'roubo_furto',
    destino: 'nao_se_aplica',
    criadoEm: '2026-11-12T10:00:00Z',
    ...d,
  });

  it('com alguém, só perda, roubo/furto e sinistro dispensam a devolução', () => {
    expect(bloqueiosDaBaixa(ativo(), 'defeito')).toHaveLength(1);
    expect(bloqueiosDaBaixa(ativo(), '')[0]).toContain('Registre a devolução antes da baixa');
    expect(bloqueiosDaBaixa(ativo(), 'roubo_furto')).toEqual([]);
    expect(bloqueiosDaBaixa(ativo({ custodianteId: undefined, status: 'disponivel' }), 'obsoleto')).toEqual([]);
  });

  it('manutenção em andamento bloqueia; ativo já baixado também', () => {
    const emManutencao = ativo({ custodianteId: undefined, status: 'manutencao', historicoManutencao: [manutencao({ status: 'em_andamento' })] });
    expect(bloqueiosDaBaixa(emManutencao, 'obsoleto')).toEqual([
      'Há uma manutenção em andamento. Conclua ou cancele a manutenção antes da baixa.',
    ]);
    expect(bloqueiosDaBaixa(ativo({ status: 'descartado' }), 'obsoleto')).toEqual(['O ativo já está baixado.']);
  });

  it('valida motivo, destino, data e valor de venda', () => {
    const ok = { dataBaixa: '2026-11-12', motivo: 'obsoleto' as const, destino: 'venda' as const, valorVenda: 50 };
    expect(validarBaixa(ok)).toBeNull();
    expect(validarBaixa({ ...ok, destino: '' as never })).toBe('Informe o motivo e o destino da baixa.');
    expect(validarBaixa({ ...ok, dataBaixa: '' })).toBe('Informe a data da baixa.');
    expect(validarBaixa({ ...ok, destino: 'doacao' })).toBe('O valor de venda só vale quando o destino é venda.');
    expect(validarBaixa({ ...ok, valorVenda: -5 })).toBe('Informe um valor de venda válido (zero ou mais).');
  });

  it('roubo encerra a custódia aberta com o motivo e tira o ativo da circulação', () => {
    const depois = aplicarBaixa(ativo(), baixa());
    expect(depois).toMatchObject({ status: 'descartado', custodianteId: undefined, dataEntregaAtual: undefined });
    expect(depois.historicoCustodia[0].dataDevolucao).toBe('2026-01-09');
    expect(depois.historicoCustodia[1]).toMatchObject({ dataDevolucao: '2026-11-12', motivoDevolucao: 'Baixa patrimonial: roubo ou furto' });
    expect(baixaVigente(depois)?.id).toBe('b-1');
  });

  it('estorno guarda quem, quando e por quê e devolve o ativo ao estoque', () => {
    const baixado = aplicarBaixa(ativo({ custodianteId: undefined, status: 'disponivel' }), baixa({ motivo: 'obsoleto', destino: 'reciclagem' }));
    const estornado = aplicarEstorno(baixado, 'b-1', ' Ativo errado ', 'emp-admin', agora);
    expect(estornado.status).toBe('disponivel');
    expect(estornado.baixas?.[0]).toMatchObject({ estornadaPor: 'emp-admin', motivoEstorno: 'Ativo errado' });
    expect(baixaVigente(estornado)).toBeUndefined();
  });
});
