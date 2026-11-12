import { describe, expect, it } from 'vitest';
import type { ColaboradorRecurso, ProcessoItem, Ticket } from '../types/index.ts';
import {
  CATALOGO_PADRAO,
  SEM_TOMBO,
  etapaDoItem,
  itensDoTermo,
  montarOffboarding,
  montarOnboarding,
  normalizar,
  podeReabrir,
  progresso,
} from './processos.ts';

const onb = (perifericos: string[], acessos: string[], grupos: string[] = []): Pick<Ticket, 'onboarding'> => ({
  onboarding: {
    nomeColaborador: 'Ana Teste',
    emailColaborador: 'ana@empresa.test',
    cargo: 'Analista',
    setorId: 'dep-1',
    dataAdmissao: '2026-12-01',
    tipoComputador: 'Notebook Padrão',
    perifericos,
    acessosSoftwares: acessos,
    gruposEmail: grupos,
  },
});

const titulos = (itens: { tipo: string; titulo: string }[], tipo: string) =>
  itens.filter((i) => i.tipo === tipo).map((i) => i.titulo);

describe('montarOnboarding', () => {
  it('pedido antigo (nomes livres): entram os sugeridos do catálogo + os pedidos do RH', () => {
    const itens = montarOnboarding(onb(['Monitor 27"'], ['Figma']), CATALOGO_PADRAO, [{ id: 'lic-f', nome: 'Figma' }]);
    expect(itens[0].tipo).toBe('cadastro');
    expect(titulos(itens, 'conta')).toEqual(['Microsoft 365', 'Google Workspace', 'Slack']);
    expect(titulos(itens, 'licenca')).toEqual(['Figma']);
    expect(itens.find((i) => i.tipo === 'licenca')?.licencaId).toBe('lic-f');
    expect(titulos(itens, 'equipamento')).toEqual(['Notebook']);
    expect(titulos(itens, 'acessorio')).toEqual([
      'Fonte do notebook',
      'Suporte para notebook',
      'Fone de ouvido',
      'Monitor 27"',
    ]);
    expect(itens.at(-1)?.tipo).toBe('termo');
    expect(itens.some((i) => i.tipo === 'acesso_nexus')).toBe(true);
  });

  it('pedido pelo formulário novo: vale exatamente o que o RH marcou (desmarcar remove)', () => {
    const itens = montarOnboarding(
      onb(['Notebook', 'Monitor extra', 'Fone de ouvido'], ['Microsoft 365', 'Slack'], ['comercial@empresa.test']),
      CATALOGO_PADRAO
    );
    expect(titulos(itens, 'conta')).toEqual(['Microsoft 365', 'Slack']);
    expect(titulos(itens, 'equipamento')).toEqual(['Notebook', 'Monitor extra']);
    expect(titulos(itens, 'acessorio')).toEqual(['Fone de ouvido']);
    expect(itens.filter((i) => i.tipo !== 'cadastro' && i.sugeridoPor === 'rh').length).toBeGreaterThan(0);
    const grupo = itens.find((i) => i.tipo === 'grupo_email');
    expect(grupo).toMatchObject({ titulo: 'comercial@empresa.test', identificador: 'comercial@empresa.test' });
  });

  it('ignora itens inativos do catálogo e gera chaves únicas', () => {
    const cat = CATALOGO_PADRAO.map((c) => (c.nome === 'Slack' ? { ...c, ativo: false } : c));
    const itens = montarOnboarding(onb([], []), cat);
    expect(titulos(itens, 'conta')).not.toContain('Slack');
    expect(new Set(itens.map((i) => i.chave)).size).toBe(itens.length);
  });
});

describe('montarOffboarding', () => {
  const recursos: ColaboradorRecurso[] = [
    { id: 'r1', colaboradorId: 'emp-9', tipo: 'conta', nome: 'Microsoft 365', identificador: 'ana@x', status: 'ativo', concedidoEm: '' },
    { id: 'r2', colaboradorId: 'emp-9', tipo: 'acessorio', nome: 'Fone de ouvido', status: 'ativo', concedidoEm: '' },
    { id: 'r3', colaboradorId: 'emp-9', tipo: 'conta', nome: 'Slack', status: 'suspenso', concedidoEm: '' },
    { id: 'r4', colaboradorId: 'emp-1', tipo: 'conta', nome: 'Slack', status: 'ativo', concedidoEm: '' },
  ];
  const ativos = [
    { id: 'a1', nome: 'Notebook Dell', tag: '#PAT-1', custodianteId: 'emp-9' },
    { id: 'a2', nome: 'Monitor', tag: '#PAT-2', custodianteId: 'emp-1' },
  ];
  const licencas = [{ id: 'l1', nome: 'Figma', colaboradoresIds: ['emp-9'] }];

  it('nasce do inventário real: contas ativas, licenças, ativos, acessórios, drive, e-mail e recibo', () => {
    const itens = montarOffboarding(
      { colaboradorId: 'emp-9', offboarding: undefined },
      { recursos, ativos, licencas }
    );
    expect(itens.map((i) => `${i.tipo}:${i.titulo}`)).toEqual([
      'encerrar_recurso:Microsoft 365',
      'liberar_licenca:Figma',
      'dados_drive:Dados do Meu Drive',
      'email:Caixa de e-mail',
      'devolver_equipamento:Notebook Dell',
      'encerrar_recurso:Fone de ouvido',
      'termo:Recibo de devolução de equipamentos',
    ]);
    expect(itens.find((i) => i.tipo === 'devolver_equipamento')).toMatchObject({ ativoId: 'a1', identificador: '#PAT-1' });
  });

  it('usa a sugestão do RH para drive e e-mail', () => {
    const itens = montarOffboarding(
      {
        offboarding: {
          colaboradorId: 'emp-9',
          dataDesligamento: '2026-12-01',
          redirecionarEmail: true,
          redirecionarEmailParaId: 'emp-1',
          transferirDrive: true,
          transferirDriveParaId: 'emp-1',
          recolhimentoInstrucoes: '',
          checklist: [],
        },
      },
      { recursos: [], ativos: [], licencas: [] },
      (id) => (id === 'emp-1' ? 'Gestor Teste' : undefined)
    );
    expect(itens.find((i) => i.tipo === 'dados_drive')).toMatchObject({ sugeridoPor: 'rh', detalhe: expect.stringContaining('Gestor Teste') });
    expect(itens.find((i) => i.tipo === 'email')?.sugeridoPor).toBe('rh');
  });

  it('sem colaborador identificado não sugere nada', () => {
    expect(montarOffboarding({}, { recursos, ativos, licencas })).toEqual([]);
  });
});

describe('progresso e regras', () => {
  it('só o termo pode ficar pendente na conclusão', () => {
    expect(progresso([])).toMatchObject({ total: 0, podeConcluir: false });
    const p = progresso([
      { tipo: 'conta', status: 'feito' },
      { tipo: 'tarefa', status: 'nao_se_aplica' },
      { tipo: 'termo', status: 'pendente' },
    ]);
    expect(p).toMatchObject({ feitos: 1, naoSeAplica: 1, pendentes: 1, percentual: 67, podeConcluir: true, termoPendente: true });
    expect(progresso([{ tipo: 'conta', status: 'pendente' }]).podeConcluir).toBe(false);
  });

  it('reabrir só o que não mexeu no inventário', () => {
    expect(podeReabrir({ tipo: 'equipamento', status: 'feito' })).toBe(false);
    expect(podeReabrir({ tipo: 'equipamento', status: 'nao_se_aplica' })).toBe(true);
    expect(podeReabrir({ tipo: 'dados_drive', status: 'feito' })).toBe(true);
    expect(podeReabrir({ tipo: 'tarefa', status: 'pendente' })).toBe(false);
  });

  it('etapas e normalização', () => {
    expect(etapaDoItem({ tipo: 'encerrar_recurso', recursoId: 'r2' }, [{ id: 'r2', tipo: 'acessorio' }])).toBe('Equipamentos');
    expect(etapaDoItem({ tipo: 'encerrar_recurso', recursoId: 'r1' }, [{ id: 'r1', tipo: 'conta' }])).toBe('Contas e acessos');
    expect(normalizar('  Fone  de OUVIDO ')).toBe(normalizar('fone de ouvido'));
    expect(normalizar('Configuração')).toBe('configuracao');
  });
});

describe('itensDoTermo', () => {
  const base = (p: Partial<ProcessoItem>): ProcessoItem => ({
    id: 'x',
    chamadoId: 't',
    tipo: 'tarefa',
    titulo: '',
    sugeridoPor: 'sistema',
    status: 'pendente',
    ordem: 1,
    criadoEm: '',
    ...p,
  });
  const ativos = [{ id: 'a1', nome: 'Notebook Dell', tag: '#PAT-1', serialNumber: 'SN1', marca: 'Dell', modelo: 'Latitude' }];

  it('entrega: equipamentos e acessórios entregues', () => {
    const linhas = itensDoTermo(
      'entrega',
      [
        base({ tipo: 'equipamento', titulo: 'Notebook', status: 'feito', ativoId: 'a1' }),
        base({ tipo: 'acessorio', titulo: 'Fone de ouvido', status: 'feito' }),
        base({ tipo: 'acessorio', titulo: 'Mouse', status: 'pendente' }),
      ],
      ativos
    );
    expect(linhas).toEqual([
      expect.objectContaining({ descricao: 'Notebook Dell', patrimonio: '#PAT-1 / SN1', marcaModelo: 'Dell Latitude', situacao: 'entregue' }),
      expect.objectContaining({ descricao: 'Fone de ouvido', patrimonio: SEM_TOMBO, situacao: 'entregue' }),
    ]);
  });

  it('devolução: condição e situação (devolvido, pendente, N/A)', () => {
    const linhas = itensDoTermo(
      'devolucao',
      [
        base({ tipo: 'devolver_equipamento', titulo: 'Notebook Dell', status: 'feito', ativoId: 'a1', condicao: 'avaria', observacao: 'tela riscada' }),
        base({ tipo: 'encerrar_recurso', titulo: 'Fone de ouvido', status: 'pendente', recursoId: 'r2' }),
        base({ tipo: 'encerrar_recurso', titulo: 'Microsoft 365', status: 'feito', recursoId: 'r1' }),
      ],
      ativos,
      [
        { id: 'r1', tipo: 'conta' },
        { id: 'r2', tipo: 'acessorio' },
      ]
    );
    expect(linhas.map((l) => [l.descricao, l.condicao, l.situacao])).toEqual([
      ['Notebook Dell', 'avaria', 'devolvido'],
      ['Fone de ouvido', undefined, 'pendente'],
    ]);
  });
});
