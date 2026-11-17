// =============================================================================
// Seção 9.5 e 9.6 · Regras de quem tem o quê (puras, testadas).
// - 9.5: item que exige termo (computador, celular, monitor — configurável)
//   ligado ou devolvido fora de um processo deixa o termo da pessoa
//   "desatualizado". Não bloqueia: a ficha e o Precisa de atenção avisam.
// - 9.6: um computador e um periférico de cada tipo por pessoa; o 2º pede
//   justificativa (fica no histórico), sem bloquear.
// =============================================================================
import type {
  Asset,
  Employee,
  ItemEstoque,
  MovimentoEstoque,
  ResponsibilityTerm,
  Ticket,
  TipoAcessorio,
} from '../types/index.ts';
import { CHAVE } from './especificacoes.ts';
import { termoCancelado } from './termos.ts';

export type ClasseItem = 'computador' | 'celular' | 'monitor' | 'outro';

/** Quais classes exigem termo (Configurações › Empresa; padrão: as três) */
export interface TermoExige {
  computador: boolean;
  celular: boolean;
  monitor: boolean;
}
export const TERMO_EXIGE_PADRAO: TermoExige = { computador: true, celular: true, monitor: true };

const REDE = /(roteador|switch|access point|\bap\b|modem|firewall|telefone ip|ramal)/i;
const CELULAR = /(smartphone|celular|iphone|galaxy|moto\s?[a-z]?\d|xiaomi|redmi|android)/i;

type AtivoBase = Pick<Asset, 'categoria' | 'nome'> & { customFields?: Record<string, string> };

/** Classe do equipamento para as regras de termo e de "2º item" */
export function classeDoAtivo(a: AtivoBase): ClasseItem {
  const tipo = a.customFields?.[CHAVE.tipo] || '';
  const texto = `${tipo} ${a.nome}`;
  if (a.categoria === 'hardware') return 'computador';
  if (a.categoria === 'telefonia') return REDE.test(texto) && !CELULAR.test(texto) ? 'outro' : 'celular';
  if (a.categoria === 'periferico') return /monitor/i.test(texto) ? 'monitor' : 'outro';
  return 'outro';
}

/** Tipo do periférico para comparar "do mesmo tipo" (monitor, dock station, impressora...) */
export function tipoDoPeriferico(a: AtivoBase): string {
  const tipo = (a.customFields?.[CHAVE.tipo] || '').trim().toLowerCase();
  if (tipo) return tipo;
  return (a.nome.trim().split(/\s+/)[0] || '').toLowerCase();
}

export const exigeTermo = (a: AtivoBase, cfg: TermoExige = TERMO_EXIGE_PADRAO) => {
  const c = classeDoAtivo(a);
  return c !== 'outro' && cfg[c];
};

// -----------------------------------------------------------------------------
// 9.6 · Segundo item do mesmo tipo
// -----------------------------------------------------------------------------
/**
 * Ao entregar `ativo` para `pessoaId`: se ela já tem um computador (ou um
 * periférico do mesmo tipo), devolve o texto do aviso; senão, null.
 */
export function avisoSegundoAtivo(
  ativo: Pick<Asset, 'id' | 'categoria' | 'nome'> & { customFields?: Record<string, string> },
  pessoaId: string,
  ativos: (Pick<Asset, 'id' | 'categoria' | 'nome' | 'tag' | 'custodianteId' | 'status'> & { customFields?: Record<string, string> })[]
): string | null {
  const daPessoa = ativos.filter((a) => a.custodianteId === pessoaId && a.id !== ativo.id && a.status !== 'descartado');
  if (ativo.categoria === 'hardware') {
    const outro = daPessoa.find((a) => a.categoria === 'hardware');
    return outro ? `A pessoa já tem um computador (${outro.tag} · ${outro.nome}).` : null;
  }
  if (ativo.categoria === 'periferico') {
    const tipo = tipoDoPeriferico(ativo);
    const outro = daPessoa.find((a) => a.categoria === 'periferico' && tipoDoPeriferico(a) === tipo);
    return outro ? `A pessoa já tem ${tipo === 'monitor' ? 'um monitor' : `um item do tipo "${tipo}"`} (${outro.tag} · ${outro.nome}).` : null;
  }
  return null;
}

/** Acessórios por quantidade que contam como periférico (cabo, adaptador e carregador não) */
export const ACESSORIO_PERIFERICO: TipoAcessorio[] = ['monitor', 'mouse', 'teclado', 'headset', 'webcam'];

/** Quantos itens de cada acessório a pessoa tem hoje (saídas − devoluções) */
export function acessoriosDaPessoa(pessoaId: string, movimentos: MovimentoEstoque[]): Map<string, number> {
  const saldo = new Map<string, number>();
  for (const m of movimentos) {
    if (m.colaboradorId !== pessoaId) continue;
    if (m.tipo === 'saida') saldo.set(m.itemId, (saldo.get(m.itemId) || 0) + m.quantidade);
    if (m.tipo === 'devolucao') saldo.set(m.itemId, (saldo.get(m.itemId) || 0) - m.quantidade);
  }
  for (const [k, v] of saldo) if (v <= 0) saldo.delete(k);
  return saldo;
}

export function avisoSegundoAcessorio(
  item: Pick<ItemEstoque, 'id' | 'tipo' | 'nome'>,
  pessoaId: string,
  movimentos: MovimentoEstoque[],
  estoque: Pick<ItemEstoque, 'id' | 'tipo' | 'nome'>[],
  quantidade = 1
): string | null {
  if (!ACESSORIO_PERIFERICO.includes(item.tipo)) return null;
  const saldo = acessoriosDaPessoa(pessoaId, movimentos);
  const mesmos = [...saldo.entries()]
    .map(([id, qtd]) => ({ e: estoque.find((x) => x.id === id), qtd }))
    .filter((x) => x.e?.tipo === item.tipo);
  const jaTem = mesmos.reduce((s, x) => s + x.qtd, 0);
  if (jaTem === 0 && quantidade <= 1) return null;
  if (jaTem === 0) return `Você está entregando ${quantidade} itens do mesmo tipo de uma vez.`;
  return `A pessoa já tem ${jaTem} ${jaTem === 1 ? 'item' : 'itens'} deste tipo (${mesmos.map((x) => x.e?.nome).join(', ')}).`;
}

// -----------------------------------------------------------------------------
// 9.5 · Termo desatualizado
// -----------------------------------------------------------------------------
export interface PendenciaTermo {
  colaboradorId: string;
  /** Termo de entrega vigente (o mais recente não cancelado) */
  termoVigente?: ResponsibilityTerm;
  /** Itens que exigem termo e estão com a pessoa sem constar no termo vigente */
  semTermo: Pick<Asset, 'id' | 'tag' | 'nome'>[];
  /** Itens do termo vigente que não estão mais com a pessoa */
  devolvidos: { ativoId: string; descricao: string }[];
}

/** Termo de entrega vigente da pessoa */
export function termoVigente(pessoaId: string, termos: ResponsibilityTerm[]): ResponsibilityTerm | undefined {
  return termos
    .filter((t) => t.colaboradorId === pessoaId && t.tipo === 'entrega' && !termoCancelado(t))
    .sort((a, b) => (b.dataEmissao || '').localeCompare(a.dataEmissao || ''))[0];
}

/** A pessoa tem admissão ou desligamento em andamento (o termo é feito no processo) */
export const temProcessoAberto = (pessoaId: string, chamados: Pick<Ticket, 'tipo' | 'status' | 'colaboradorId' | 'offboarding'>[]) =>
  chamados.some(
    (t) =>
      (t.tipo === 'onboarding' || t.tipo === 'offboarding') &&
      t.status !== 'resolvido' &&
      t.status !== 'cancelado' &&
      (t.colaboradorId || t.offboarding?.colaboradorId) === pessoaId
  );

export function pendenciaTermo(
  pessoa: Pick<Employee, 'id' | 'status'>,
  dados: {
    ativos: (Pick<Asset, 'id' | 'tag' | 'nome' | 'categoria' | 'custodianteId' | 'status'> & { customFields?: Record<string, string> })[];
    termos: ResponsibilityTerm[];
    chamados: Pick<Ticket, 'tipo' | 'status' | 'colaboradorId' | 'offboarding'>[];
    cfg?: TermoExige;
  }
): PendenciaTermo | null {
  if (pessoa.status === 'desligado') return null;
  if (temProcessoAberto(pessoa.id, dados.chamados)) return null;
  const vigente = termoVigente(pessoa.id, dados.termos);
  const noTermo = new Set(vigente?.ativoIds || []);
  const comPessoa = dados.ativos.filter((a) => a.custodianteId === pessoa.id && a.status !== 'descartado');
  const semTermo = comPessoa.filter((a) => exigeTermo(a, dados.cfg) && !noTermo.has(a.id));
  const ids = new Set(comPessoa.map((a) => a.id));
  const devolvidos = [...noTermo]
    .filter((id) => !ids.has(id))
    .map((id) => {
      const a = dados.ativos.find((x) => x.id === id);
      const linha = vigente?.itens?.find((i) => i.ativoId === id);
      return { ativoId: id, descricao: a ? `${a.tag} · ${a.nome}` : linha?.descricao || 'Equipamento' };
    });
  if (semTermo.length === 0 && devolvidos.length === 0) return null;
  return { colaboradorId: pessoa.id, termoVigente: vigente, semTermo, devolvidos };
}

/** Pendências de termo de todas as pessoas (Precisa de atenção) */
export function pendenciasTermo(
  pessoas: Pick<Employee, 'id' | 'status'>[],
  dados: Parameters<typeof pendenciaTermo>[1]
): PendenciaTermo[] {
  return pessoas.map((p) => pendenciaTermo(p, dados)).filter((x): x is PendenciaTermo => x !== null);
}

/** Texto curto da pendência ("2 sem termo · 1 devolvido ainda no termo") */
export function resumoPendenciaTermo(p: PendenciaTermo): string {
  const partes: string[] = [];
  if (p.semTermo.length) partes.push(`${p.semTermo.length} ${p.semTermo.length === 1 ? 'item entregue' : 'itens entregues'} sem termo`);
  if (p.devolvidos.length) partes.push(`${p.devolvidos.length} ${p.devolvidos.length === 1 ? 'devolvido ainda consta' : 'devolvidos ainda constam'} no termo`);
  return partes.join(' · ');
}
