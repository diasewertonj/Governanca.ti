import { describe, expect, it } from 'vitest';
import type { Asset, Employee, Fornecedor, SoftwareLicense } from '../types/index.ts';
import { pendenciasDeCadastro } from './pendenciasCadastro.ts';

const lic = (p: Partial<SoftwareLicense>): SoftwareLicense => ({
  id: 'l1',
  nome: 'Microsoft 365 F1',
  fornecedor: '',
  chaveContrato: '',
  assentosTotais: 55,
  assentosAlocados: 0,
  colaboradoresIds: [],
  dataRenovacao: '2027-07-21',
  valorMensal: 0,
  formaCobranca: 'propria',
  status: 'ativa',
  ...p,
});

describe('completar cadastros', () => {
  it('importado sem preço, sem fornecedor e sem ninguém atribuído aparece nos três grupos', () => {
    const g = pendenciasDeCadastro({ fornecedores: [], licencas: [lic({})], contratos: [], ativos: [], pessoas: [] });
    expect(g.map((x) => x.grupo)).toEqual(['Softwares pagos sem valor', 'Softwares sem fornecedor', 'Softwares sem ninguém atribuído']);
  });

  it('fornecedor sem CNPJ, equipamento sem NF e equipe sem acesso; gratuito e completos não aparecem', () => {
    const forn: Fornecedor = { id: 'f1', nome: 'Revenda', ativo: true, criadoEm: '' };
    const ativo = { id: 'a1', tag: 'PAT-1', nome: 'Notebook', status: 'em_uso', fiscal: { valorCompra: 5000, numeroNF: '' } } as unknown as Asset;
    const rh = { id: 'p1', nome: 'RH', role: 'rh', status: 'ativo', temLogin: false } as unknown as Employee;
    const g = pendenciasDeCadastro({
      fornecedores: [forn],
      licencas: [lic({ formaCobranca: 'sem_custo', fornecedorId: 'f1' }), lic({ id: 'l2', valorMensal: 100, fornecedorId: 'f1', assentosAlocados: 3 })],
      contratos: [],
      ativos: [ativo],
      pessoas: [rh],
    });
    expect(g.map((x) => x.grupo)).toEqual(['Fornecedores sem CNPJ', 'Equipamentos sem valor ou nota fiscal', 'Equipe sem acesso ao sistema']);
  });
});
