// =============================================================================
// Seção 28 · "Completar cadastros": o que ficou incompleto (ex.: fornecedor criado pela
// importação só com o nome) e leva à ficha certa para completar.
// =============================================================================
import type { Asset, Contrato, Employee, Fornecedor, SoftwareLicense } from '../types/index.ts';
import type { FichaAberta } from './fichas.ts';
import { formaCobrancaDe } from './financeiro.ts';
import { licencaAtiva } from './licencas.ts';

export interface PendenciaCadastro {
  grupo: string;
  /** O que fazer, numa frase */
  acao: string;
  itens: { id: string; nome: string; ficha: FichaAberta }[];
}

export function pendenciasDeCadastro(d: {
  fornecedores: Fornecedor[];
  licencas: SoftwareLicense[];
  contratos: Contrato[];
  ativos: Asset[];
  pessoas: Employee[];
}): PendenciaCadastro[] {
  const ativas = d.licencas.filter(licencaAtiva);
  const sw = (l: SoftwareLicense) => ({ id: l.id, nome: l.nome, ficha: { tipo: 'software' as const, id: l.id } });
  const grupos: PendenciaCadastro[] = [
    {
      grupo: 'Fornecedores sem CNPJ',
      acao: 'Complete CNPJ e contato (os criados pela importação entram só com o nome)',
      itens: d.fornecedores
        .filter((f) => f.ativo && !(f.cnpj || '').replace(/\D/g, ''))
        .map((f) => ({ id: f.id, nome: f.nome, ficha: { tipo: 'fornecedor' as const, id: f.id } })),
    },
    {
      grupo: 'Softwares pagos sem valor',
      acao: 'Informe o valor mensal para entrar nas faturas e nos custos',
      itens: ativas.filter((l) => formaCobrancaDe(l, d.contratos) === 'propria' && !(l.valorMensal > 0)).map(sw),
    },
    {
      grupo: 'Softwares sem fornecedor',
      acao: 'Escolha de quem a empresa compra',
      itens: ativas.filter((l) => formaCobrancaDe(l, d.contratos) !== 'contrato' && !l.fornecedorId && !(l.fornecedor || '').trim()).map(sw),
    },
    {
      grupo: 'Softwares sem ninguém atribuído',
      acao: 'Atribua as pessoas que usam (em Pessoas e assentos ou pela ficha da pessoa)',
      itens: ativas.filter((l) => formaCobrancaDe(l, d.contratos) !== 'sem_custo' && l.assentosTotais > 0 && l.assentosAlocados === 0).map(sw),
    },
    {
      grupo: 'Equipamentos sem valor ou nota fiscal',
      acao: 'Complete o valor de compra e o número da NF (patrimônio e depreciação dependem deles)',
      itens: d.ativos
        .filter((a) => a.status !== 'descartado' && (!(Number(a.fiscal?.valorCompra) > 0) || !(a.fiscal?.numeroNF || '').trim()))
        .map((a) => ({ id: a.id, nome: `${a.tag} · ${a.nome}`, ficha: { tipo: 'ativo' as const, id: a.id } })),
    },
    {
      grupo: 'Equipe sem acesso ao sistema',
      acao: 'Use "Criar acesso" na ficha (senha provisória na tela)',
      itens: d.pessoas
        .filter((p) => p.status !== 'desligado' && p.role !== 'colaborador' && p.temLogin === false)
        .map((p) => ({ id: p.id, nome: p.nome, ficha: { tipo: 'colaborador' as const, id: p.id } })),
    },
  ];
  return grupos.filter((g) => g.itens.length > 0);
}
