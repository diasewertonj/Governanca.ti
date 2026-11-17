import { describe, expect, it } from 'vitest';
import {
  aplicarMascara,
  avisoMascara,
  chaveNfeDvValido,
  cnpjValido,
  digitandoMoeda,
  formatarCnpj,
  formatarTelefone,
  iccidValido,
  imeiValido,
  textoDaMoeda,
  valorDaMoeda,
} from './mascaras.ts';
import { gravarEspecificacoes, lerEspecificacoes, nomeSugerido, resumoEspecificacoes } from './especificacoes.ts';
import { avisoSegundoAcessorio, avisoSegundoAtivo, classeDoAtivo, pendenciaTermo } from './inventario.ts';
import { listarVencimentos, valorPatrimonio } from './financeiro.ts';
import type { Asset, ProcessoItem, ResponsibilityTerm, Ticket } from '../types/index.ts';

describe('Seção 9.3 · máscaras que ajudam sem travar', () => {
  it('formata CNPJ ao digitar e confere o dígito (numérico e alfanumérico)', () => {
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarCnpj('112223')).toBe('11.222.3');
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(cnpjValido('12ABC34501DE35')).toBe(true); // exemplo oficial do CNPJ alfanumérico
  });

  it('telefone: celular, fixo, 0800 e ramal; texto com letras fica como digitado', () => {
    expect(formatarTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(formatarTelefone('1134567890')).toBe('(11) 3456-7890');
    expect(formatarTelefone('08009703355')).toBe('0800 970 3355');
    expect(formatarTelefone('2345')).toBe('2345');
    expect(aplicarMascara('telefone', 'ramal 204')).toBe('ramal 204');
  });

  it('só avisa (nunca bloqueia) quando o dado não bate', () => {
    expect(avisoMascara('cep', '0131')).toMatch(/faltam 4/);
    expect(avisoMascara('cep', '01310-100')).toBeNull();
    expect(avisoMascara('imei', '')).toBeNull();
    expect(avisoMascara('chave_nfe', '1234')).toMatch(/44 dígitos/);
  });

  it('confere IMEI e ICCID pelo dígito final (Luhn) e a chave da NF-e (módulo 11)', () => {
    expect(imeiValido('490154203237518')).toBe(true);
    expect(imeiValido('490154203237519')).toBe(false);
    expect(iccidValido('89550310000000000003')).toBe(true);
    // 43 dígitos + DV calculado
    const base = '3524011234567800019055001000004821100293847';
    let peso = 2;
    let soma = 0;
    for (let i = base.length - 1; i >= 0; i--) {
      soma += Number(base[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const dv = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    expect(chaveNfeDvValido(base + dv)).toBe(true);
    expect(chaveNfeDvValido(base + ((dv + 1) % 10))).toBe(false);
  });

  it('R$: milhar ao digitar, vírgula nos centavos, colar com ponto decimal', () => {
    expect(digitandoMoeda('6850')).toBe('6.850');
    expect(digitandoMoeda('6850.')).toBe('6.850,');
    expect(digitandoMoeda('6.850,5')).toBe('6.850,5');
    expect(digitandoMoeda('6850.00', true)).toBe('6.850,00');
    expect(valorDaMoeda('6.850,50')).toBe(6850.5);
    expect(valorDaMoeda('')).toBeUndefined();
    expect(textoDaMoeda(1234.5)).toBe('1.234,50');
  });
});

describe('Seção 9.3 · especificações e nome sugerido', () => {
  it('monta o nome sugerido a partir das partes', () => {
    const espec = { cpuFabricante: 'Intel', cpuLinha: 'Core i7', cpuModelo: '1265U', memoriaGb: '16', discoTipo: 'SSD NVMe', discoCapacidade: '512 GB' };
    expect(nomeSugerido({ tipo: 'Notebook', marca: 'Dell', modelo: 'Latitude 5430', espec })).toBe(
      'Notebook Dell Latitude 5430 · i7-1265U · 16 GB · SSD NVMe 512 GB'
    );
    // Modelo digitado com a linha não duplica ("i7 i7-1265U")
    expect(nomeSugerido({ tipo: 'Notebook', espec: { ...espec, cpuModelo: 'i7-1265U' } })).toBe('Notebook · i7-1265U · 16 GB · SSD NVMe 512 GB');
  });

  it('grava as partes e as chaves antigas; lê dados antigos em texto livre', () => {
    const cf = gravarEspecificacoes({}, { cpuFabricante: 'AMD', cpuLinha: 'Ryzen 7', cpuModelo: '7840U', memoriaGb: '32', memoriaTipo: 'DDR5', discoTipo: 'SSD NVMe', discoCapacidade: '1 TB' });
    expect(cf.processador).toBe('AMD Ryzen 7 7840U');
    expect(cf.armazenamento).toBe('SSD NVMe 1 TB');
    const antigo = lerEspecificacoes({ processador: 'Intel Core i7-1265U vPro (10 Cores)', memoriaRam: '32', armazenamento: '512GB NVMe PCIe Gen4 M.2 SSD' });
    expect(antigo).toMatchObject({ cpuFabricante: 'Intel', cpuLinha: 'Core i7', cpuModelo: '1265U vPro', discoTipo: 'SSD NVMe', discoCapacidade: '512 GB', memoriaGb: '32' });
    const resumo = resumoEspecificacoes({ ...cf, serviceTag: 'ABC1234' });
    expect(resumo.map((r) => r.rotulo)).toEqual(['Processador', 'Memória', 'Armazenamento', 'Service Tag / código expresso']);
  });
});

const ativo = (p: Partial<Asset>): Asset =>
  ({
    id: 'a',
    tag: '#PAT-1',
    nome: 'Notebook',
    categoria: 'hardware',
    marca: '',
    modelo: '',
    serialNumber: '',
    localizacaoFisica: '',
    status: 'em_uso',
    fiscal: { numeroNF: '', chaveAcesso44: '', valorCompra: 0, fornecedor: '', dataAquisicao: '', dataGarantia: '' },
    historicoCustodia: [],
    historicoManutencao: [],
    ...p,
  }) as Asset;

describe('Seção 9.5 e 9.6 · termo e segundo item', () => {
  it('classifica computador, celular e monitor', () => {
    expect(classeDoAtivo(ativo({}))).toBe('computador');
    expect(classeDoAtivo(ativo({ categoria: 'telefonia', nome: 'iPhone 15' }))).toBe('celular');
    expect(classeDoAtivo(ativo({ categoria: 'telefonia', nome: 'Roteador Wi-Fi' }))).toBe('outro');
    expect(classeDoAtivo(ativo({ categoria: 'periferico', nome: 'Monitor 24"' }))).toBe('monitor');
  });

  it('pede justificativa no 2º computador e no 2º periférico do mesmo tipo', () => {
    const lista = [ativo({ id: 'n1', custodianteId: 'p1' }), ativo({ id: 'm1', categoria: 'periferico', nome: 'Monitor Dell', custodianteId: 'p1' })];
    expect(avisoSegundoAtivo(ativo({ id: 'n2' }), 'p1', lista)).toMatch(/já tem um computador/);
    expect(avisoSegundoAtivo(ativo({ id: 'm2', categoria: 'periferico', nome: 'Monitor LG' }), 'p1', lista)).toMatch(/monitor/);
    expect(avisoSegundoAtivo(ativo({ id: 'n2' }), 'p2', lista)).toBeNull();
    const estoque = [{ id: 'e1', tipo: 'mouse' as const, nome: 'Mouse USB' }];
    const movs = [{ id: 'x', itemId: 'e1', tipo: 'saida' as const, quantidade: 1, colaboradorId: 'p1', criadoEm: '' }];
    expect(avisoSegundoAcessorio(estoque[0], 'p1', movs, estoque)).toMatch(/já tem 1 item/);
    expect(avisoSegundoAcessorio({ id: 'c', tipo: 'cabo', nome: 'Cabo HDMI' }, 'p1', movs, estoque)).toBeNull();
  });

  it('termo desatualizado: entregue sem termo e devolvido que ainda consta; processo aberto não conta', () => {
    const termo = { id: 't1', tipo: 'entrega', colaboradorId: 'p1', ativoIds: ['n1', 'velho'], dataEmissao: '2026-01-01' } as ResponsibilityTerm;
    const ativos = [ativo({ id: 'n1', custodianteId: 'p1' }), ativo({ id: 'cel', categoria: 'telefonia', nome: 'Galaxy S24', custodianteId: 'p1' }), ativo({ id: 'velho', tag: '#PAT-9', custodianteId: undefined, status: 'disponivel' })];
    const p = pendenciaTermo({ id: 'p1', status: 'ativo' }, { ativos, termos: [termo], chamados: [] });
    expect(p?.semTermo.map((a) => a.id)).toEqual(['cel']);
    expect(p?.devolvidos.map((d) => d.ativoId)).toEqual(['velho']);
    const aberto = [{ tipo: 'offboarding', status: 'em_andamento', colaboradorId: 'p1' } as Ticket];
    expect(pendenciaTermo({ id: 'p1', status: 'ativo' }, { ativos, termos: [termo], chamados: aberto })).toBeNull();
    // Celular configurado como "não exige termo": sobra só o devolvido
    const sem = pendenciaTermo({ id: 'p1', status: 'ativo' }, { ativos, termos: [termo], chamados: [], cfg: { computador: true, celular: false, monitor: true } });
    expect(sem?.semTermo).toEqual([]);
  });
});

describe('Seção 9.2 e 9.4 · Precisa de atenção e patrimônio', () => {
  it('passo agendado entra no Precisa de atenção; processo concluído não', () => {
    const hoje = new Date(2026, 10, 17);
    const item = { id: 'i1', chamadoId: 'c1', tipo: 'equipamento', titulo: 'Notebook', status: 'pendente', lembreteEm: '2026-11-20' } as ProcessoItem;
    const chamado = { id: 'c1', codigo: 'CH-1', tipo: 'onboarding', status: 'em_andamento', onboarding: { nomeColaborador: 'Ana' } } as Ticket;
    const base = { ativos: [], contratos: [], licencas: [], faturas: [], estoque: [], linhas: [], pessoas: [] };
    const v = listarVencimentos({ ...base, processoItens: [item], chamados: [chamado] }, 30, hoje);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ tipo: 'passo_agendado', dias: 3, alvo: { tipo: 'processo', id: 'c1' } });
    expect(listarVencimentos({ ...base, processoItens: [item], chamados: [{ ...chamado, status: 'resolvido' }] }, 30, hoje)).toHaveLength(0);
  });

  it('valor do patrimônio: equipamentos sem baixa + acessórios em estoque', () => {
    const v = valorPatrimonio(
      [ativo({ fiscal: { valorCompra: 5000 } as Asset['fiscal'] }), ativo({ status: 'descartado', fiscal: { valorCompra: 900 } as Asset['fiscal'] }), ativo({})],
      [{ ativo: true, quantidade: 3, valorUnitario: 50 }, { ativo: false, quantidade: 9, valorUnitario: 10 }]
    );
    expect(v).toMatchObject({ equipamentos: 5000, acessorios: 150, total: 5150, qtdEquipamentos: 2, semValor: 1 });
  });
});
