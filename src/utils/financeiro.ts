// =============================================================================
// Seção 6 · Fonte única do custo, vencimentos e despesas.
// Regra: licença "pelo contrato" usa valor/renovação do contrato; "própria" usa
// os da licença; "sem custo" não tem custo. Datas sempre 'AAAA-MM-DD' locais.
// =============================================================================
import type {
  Asset,
  CategoriaDespesa,
  Contrato,
  Employee,
  Fatura,
  FormaCobranca,
  FormaPagamento,
  ItemEstoque,
  LinhaTelefonica,
  Moeda,
  ProcessoItem,
  ResponsibilityTerm,
  SoftwareLicense,
  Ticket,
  TipoContrato,
} from '../types/index.ts';
import { contratoQuePagaLicenca, contratoVigente, fimCoberturaEfetiva, nomeContrato } from './contratos.ts';
import { diasAte, formatCurrency, isoLocal } from './formatters.ts';
import { ACAO_DO_TIPO } from './processos.ts';
import { resumoPendenciaTermo, type PendenciaTermo } from './inventario.ts';

export const ROTULO_FORMA_COBRANCA: Record<FormaCobranca, string> = {
  sem_custo: 'Sem custo',
  propria: 'Cobrança própria',
  contrato: 'Pelo contrato',
};

export const ROTULO_CATEGORIA: Record<CategoriaDespesa, string> = {
  software: 'Software',
  ia: 'Inteligência artificial',
  telefonia: 'Telefonia',
  internet: 'Internet',
  hardware: 'Hardware',
  nuvem: 'Nuvem',
  servicos: 'Serviços',
  outros: 'Outros',
};

export const ROTULO_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  boleto: 'Boleto',
  cartao: 'Cartão corporativo',
  debito: 'Débito automático',
  pix: 'PIX',
  transferencia: 'Transferência',
  outro: 'Outro',
};

export const MOEDAS: Moeda[] = ['BRL', 'USD', 'EUR'];

/** Categoria sugerida pelo tipo do contrato */
export const CATEGORIA_DO_TIPO: Record<TipoContrato, CategoriaDespesa> = {
  suporte: 'hardware',
  garantia_estendida: 'hardware',
  manutencao: 'hardware',
  locacao: 'hardware',
  licenciamento: 'software',
  internet: 'internet',
  telefonia_movel: 'telefonia',
  telefonia_fixa: 'telefonia',
  nuvem: 'nuvem',
  dominio: 'servicos',
  outro: 'outros',
};

/** Campos próprios de cada tipo de contrato (parte "Detalhes do tipo" do formulário) */
export const CAMPOS_DETALHES: Partial<Record<TipoContrato, { chave: string; rotulo: string; dica?: string }[]>> = {
  internet: [
    { chave: 'velocidade', rotulo: 'Velocidade (download/upload)', dica: 'Ex.: 500/250 Mbps' },
    { chave: 'ip_fixo', rotulo: 'IP fixo', dica: 'Ex.: Sim, 1 IP' },
    { chave: 'circuito', rotulo: 'Designador do circuito' },
    { chave: 'tecnologia', rotulo: 'Tecnologia', dica: 'Fibra, rádio, cabo…' },
  ],
  telefonia_movel: [
    { chave: 'plano', rotulo: 'Plano' },
    { chave: 'franquia', rotulo: 'Franquia de dados', dica: 'Ex.: 20 GB por linha' },
    { chave: 'minutos', rotulo: 'Minutos', dica: 'Ex.: ilimitado' },
  ],
  telefonia_fixa: [
    { chave: 'numeros', rotulo: 'Números', dica: 'Ex.: (11) 3000-0000 a 0099' },
    { chave: 'canais', rotulo: 'Troncos / canais' },
    { chave: 'ramais', rotulo: 'Ramais' },
  ],
  locacao: [
    { chave: 'franquia_paginas', rotulo: 'Franquia de páginas' },
    { chave: 'valor_excedente', rotulo: 'Valor por página excedente' },
  ],
  nuvem: [
    { chave: 'conta', rotulo: 'Conta / projeto' },
    { chave: 'cobranca', rotulo: 'Como cobra', dica: 'Ex.: por consumo, mensal' },
  ],
  dominio: [
    { chave: 'dominio', rotulo: 'Domínio' },
    { chave: 'certificado', rotulo: 'Tipo de certificado', dica: 'Ex.: SSL curinga' },
  ],
  outro: [{ chave: 'detalhes', rotulo: 'Detalhes' }],
};

/** Tipos cujo contrato cobre linhas telefônicas */
export const TIPOS_COM_LINHAS: TipoContrato[] = ['telefonia_movel', 'telefonia_fixa'];
/** Tipos ligados a uma unidade/endereço */
export const TIPOS_COM_UNIDADE: TipoContrato[] = ['internet', 'telefonia_fixa'];

/** Valor mensal equivalente de um contrato (anual ÷ 12; pagamento único não é recorrente) */
export function mensalDoContrato(c: Pick<Contrato, 'valor' | 'periodicidade'>): number {
  if (c.periodicidade === 'anual') return c.valor / 12;
  if (c.periodicidade === 'unico') return 0;
  return c.valor;
}

/** Valor mensal equivalente da licença em cobrança própria */
export function mensalDaLicenca(l: Pick<SoftwareLicense, 'valorMensal' | 'tipoCobranca'>): number {
  return l.tipoCobranca === 'anual' ? l.valorMensal / 12 : l.valorMensal;
}

/** Forma de cobrança efetiva (dados antigos sem o campo: contrato vigente → contrato) */
export function formaCobrancaDe(l: SoftwareLicense, contratos: Contrato[]): FormaCobranca {
  if (l.formaCobranca) return l.formaCobranca;
  return contratoQuePagaLicenca(l.id, contratos) ? 'contrato' : 'propria';
}

export interface FonteCusto {
  forma: FormaCobranca;
  contrato?: Contrato; // contrato que paga (pelo contrato)
  semContratoVigente?: boolean; // "pelo contrato" mas nenhum vigente → alerta
  valor: number; // valor no período (licença ou contrato)
  periodicidade?: 'mensal' | 'anual' | 'unico';
  mensal: number; // valor mensal equivalente (o contrato inteiro, não rateado)
  /** Parte deste software no mensal: o contrato dividido igualmente entre as licenças que cobre */
  mensalDaLicenca: number;
  /** Quantas licenças o contrato cobre (só quando pago pelo contrato) */
  licencasNoContrato?: number;
  renovacao?: string; // próxima renovação / fim
  origem: string; // ex.: "do contrato CT-14" ou "da licença"
}

/** De onde vêm o custo e a renovação mostrados na ficha (seção 6.2) */
export function fonteCustoLicenca(l: SoftwareLicense, contratos: Contrato[], agora: Date = new Date()): FonteCusto {
  const forma = formaCobrancaDe(l, contratos);
  if (forma === 'sem_custo') return { forma, valor: 0, mensal: 0, mensalDaLicenca: 0, origem: 'sem custo', renovacao: l.dataRenovacao || undefined };
  if (forma === 'contrato') {
    const contrato =
      contratoQuePagaLicenca(l.id, contratos, undefined, agora) ||
      contratos.find((c) => contratoVigente(c, agora) && c.itens.some((i) => i.licencaId === l.id));
    if (!contrato) return { forma, semContratoVigente: true, valor: 0, mensal: 0, mensalDaLicenca: 0, origem: 'sem contrato vigente' };
    const licencasNoContrato = Math.max(1, contrato.itens.filter((i) => i.licencaId).length);
    return {
      forma,
      contrato,
      valor: contrato.valor,
      periodicidade: contrato.periodicidade,
      mensal: mensalDoContrato(contrato),
      mensalDaLicenca: mensalDoContrato(contrato) / licencasNoContrato,
      licencasNoContrato,
      renovacao: contrato.fim,
      origem: `do contrato ${nomeContrato(contrato)}`,
    };
  }
  return {
    forma,
    valor: l.valorMensal,
    periodicidade: l.tipoCobranca || 'mensal',
    mensal: mensalDaLicenca(l),
    mensalDaLicenca: mensalDaLicenca(l),
    renovacao: l.dataRenovacao || undefined,
    origem: 'da licença',
  };
}

/** Valor que conta como gasto: o efetivamente pago (juros, multa, desconto) ou o da fatura */
export const valorEfetivo = (f: Pick<Fatura, 'status' | 'valor' | 'valorPago'>) =>
  f.status === 'paga' && f.valorPago != null ? f.valorPago : f.valor;

/** Valor da fatura para exibir: R$ no padrão brasileiro; moeda estrangeira com o R$ entre parênteses */
export function valorDaFatura(f: Pick<Fatura, 'status' | 'valor' | 'valorPago' | 'moeda' | 'valorMoeda'>): string {
  const reais = formatCurrency(valorEfetivo(f));
  return f.moeda && f.moeda !== 'BRL' && f.valorMoeda != null ? `${formatCurrency(f.valorMoeda, f.moeda)} (${reais})` : reais;
}

/** Data limite para cancelar sem renovar (fim − aviso prévio) */
export function dataLimiteCancelamento(fim?: string, avisoDias?: number): string | undefined {
  if (!fim || !avisoDias) return undefined;
  const [a, m, d] = fim.split('-').map(Number);
  return isoLocal(new Date(a, m - 1, d - avisoDias));
}

/** Nome comparável: minúsculas, sem acento, sem pontuação e espaços repetidos */
export function normalizarNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Cadastros com nome igual ou muito parecido (um contém o outro) — aviso de duplicidade */
export function nomesParecidos<T extends { id: string; nome: string }>(nome: string, lista: T[], ignorarId?: string): T[] {
  const n = normalizarNome(nome);
  if (n.length < 3) return [];
  return lista.filter((x) => {
    if (x.id === ignorarId) return false;
    const o = normalizarNome(x.nome);
    return o === n || (o.length >= 3 && (o.includes(n) || n.includes(o)));
  });
}

/** Cadastros com fornecedor antigo em texto e sem vínculo com o cadastro (tela Conciliar fornecedores) */
export interface PendenciaConciliacao {
  tipo: 'licenca' | 'ativo';
  id: string;
  nome: string;
  textoFornecedor: string;
}
export function pendenciasConciliacao(licencas: SoftwareLicense[], ativos: Asset[]): PendenciaConciliacao[] {
  return [
    ...licencas
      .filter((l) => !l.fornecedorId && (l.fornecedor || '').trim())
      .map((l) => ({ tipo: 'licenca' as const, id: l.id, nome: l.nome, textoFornecedor: l.fornecedor.trim() })),
    ...ativos
      .filter((a) => !a.fornecedorId && (a.fiscal?.fornecedor || '').trim() && a.status !== 'descartado')
      .map((a) => ({ tipo: 'ativo' as const, id: a.id, nome: `${a.tag} · ${a.nome}`, textoFornecedor: (a.fiscal?.fornecedor || '').trim() })),
  ];
}

/** CNPJ só com números (para comparar) */
export const soDigitos = (s?: string) => (s || '').replace(/\D/g, '');

// -----------------------------------------------------------------------------
// Vencimentos (uma lista para tudo)
// -----------------------------------------------------------------------------
export type TipoVencimento =
  | 'garantia'
  | 'contrato'
  | 'cancelamento'
  | 'licenca'
  | 'fatura'
  | 'sem_contrato'
  | 'estoque'
  | 'desligado_com_recurso'
  | 'passo_agendado'
  | 'termo_desatualizado'
  | 'termo_contestado';

export interface Vencimento {
  id: string;
  tipo: TipoVencimento;
  data?: string; // sem data = pendência
  dias?: number;
  titulo: string;
  detalhe?: string;
  alvo: { tipo: 'ativo' | 'contrato' | 'licenca' | 'fatura' | 'estoque' | 'linha' | 'processo' | 'pessoa'; id: string };
}

export const ROTULO_VENCIMENTO: Record<TipoVencimento, string> = {
  garantia: 'Garantia',
  contrato: 'Fim de contrato',
  cancelamento: 'Prazo para cancelar',
  licenca: 'Renovação de licença',
  fatura: 'Fatura',
  sem_contrato: 'Sem contrato vigente',
  estoque: 'Estoque baixo',
  desligado_com_recurso: 'Desligado com recurso',
  passo_agendado: 'Passo agendado',
  termo_desatualizado: 'Termo desatualizado',
  termo_contestado: 'Termo contestado',
};

export function listarVencimentos(
  dados: {
    ativos: Asset[];
    contratos: Contrato[];
    licencas: SoftwareLicense[];
    faturas: Fatura[];
    estoque: ItemEstoque[];
    linhas: LinhaTelefonica[];
    pessoas: Employee[];
    /** Seção 9.2: passos agendados de admissões/desligamentos em andamento */
    processoItens?: ProcessoItem[];
    chamados?: Ticket[];
    /** Seção 9.5: pendências de termo já calculadas (utils/inventario.ts) */
    termosDesatualizados?: PendenciaTermo[];
    /** Entrega A: termos contestados pelo colaborador, aguardando a T.I. */
    termos?: ResponsibilityTerm[];
  },
  horizonteDias = 90,
  agora: Date = new Date()
): Vencimento[] {
  const out: Vencimento[] = [];
  const dentro = (data?: string) => {
    if (!data) return undefined;
    const dias = diasAte(data, agora);
    return dias <= horizonteDias ? dias : undefined;
  };

  dados.ativos
    .filter((a) => a.status !== 'descartado')
    .forEach((a) => {
      const fim = fimCoberturaEfetiva(a, dados.contratos, agora);
      const dias = dentro(fim);
      if (dias !== undefined && dias >= -30)
        out.push({ id: `g-${a.id}`, tipo: 'garantia', data: fim, dias, titulo: `${a.tag} · ${a.nome}`, alvo: { tipo: 'ativo', id: a.id } });
    });

  dados.contratos
    .filter((c) => c.status !== 'encerrado')
    .forEach((c) => {
      const renovado = dados.contratos.some((o) => o.renovadoDe === c.id);
      if (renovado) return;
      const dias = dentro(c.fim);
      const cobertos = c.itens.length;
      if (dias !== undefined && dias >= -30)
        out.push({
          id: `c-${c.id}`,
          tipo: 'contrato',
          data: c.fim,
          dias,
          titulo: nomeContrato(c),
          detalhe: cobertos ? `cobre ${cobertos} ${cobertos === 1 ? 'item' : 'itens'}` : undefined,
          alvo: { tipo: 'contrato', id: c.id },
        });
      const limite = dataLimiteCancelamento(c.fim, c.pagamento?.avisoCancelamentoDias);
      const dl = dentro(limite);
      if (limite && dl !== undefined && dl >= 0)
        out.push({ id: `x-${c.id}`, tipo: 'cancelamento', data: limite, dias: dl, titulo: nomeContrato(c), detalhe: 'último dia para pedir cancelamento', alvo: { tipo: 'contrato', id: c.id } });
    });

  dados.licencas
    .filter((l) => l.status !== 'inativa')
    .forEach((l) => {
      const forma = formaCobrancaDe(l, dados.contratos);
      if (forma === 'contrato') {
        const fonte = fonteCustoLicenca(l, dados.contratos, agora);
        if (fonte.semContratoVigente)
          out.push({ id: `s-${l.id}`, tipo: 'sem_contrato', titulo: l.nome, detalhe: 'renovar o contrato ou passar a cobrar na licença', alvo: { tipo: 'licenca', id: l.id } });
        return;
      }
      if (forma !== 'propria') return;
      const dias = dentro(l.dataRenovacao);
      if (dias !== undefined && dias >= -30)
        out.push({ id: `l-${l.id}`, tipo: 'licenca', data: l.dataRenovacao, dias, titulo: l.nome, alvo: { tipo: 'licenca', id: l.id } });
      const limite = dataLimiteCancelamento(l.dataRenovacao, l.pagamento?.avisoCancelamentoDias);
      const dl = dentro(limite);
      if (limite && dl !== undefined && dl >= 0)
        out.push({ id: `y-${l.id}`, tipo: 'cancelamento', data: limite, dias: dl, titulo: l.nome, detalhe: 'último dia para cancelar a assinatura', alvo: { tipo: 'licenca', id: l.id } });
    });

  dados.faturas
    .filter((f) => f.status === 'a_pagar')
    .forEach((f) => {
      const dias = dentro(f.vencimento);
      if (dias === undefined) return;
      const alvoNome = f.contratoId
        ? nomeContrato(dados.contratos.find((c) => c.id === f.contratoId) || { descricao: 'Contrato' })
        : dados.licencas.find((l) => l.id === f.licencaId)?.nome || 'Licença';
      out.push({ id: `f-${f.id}`, tipo: 'fatura', data: f.vencimento, dias, titulo: alvoNome, detalhe: valorDaFatura(f), alvo: { tipo: 'fatura', id: f.id } });
    });

  dados.estoque
    .filter((i) => i.ativo && i.quantidade <= i.minimo && i.minimo > 0)
    .forEach((i) =>
      out.push({ id: `e-${i.id}`, tipo: 'estoque', titulo: i.nome, detalhe: `${i.quantidade} em estoque (mínimo ${i.minimo})`, alvo: { tipo: 'estoque', id: i.id } })
    );

  // Desligado ainda ocupando assento ou linha (assentos ociosos pagos)
  const desligados = new Set(dados.pessoas.filter((p) => p.status === 'desligado').map((p) => p.id));
  dados.licencas.forEach((l) =>
    l.colaboradoresIds.filter((id) => desligados.has(id)).forEach((id) => {
      const nome = dados.pessoas.find((p) => p.id === id)?.nome || 'Pessoa';
      out.push({ id: `dl-${l.id}-${id}`, tipo: 'desligado_com_recurso', titulo: `${nome} · ${l.nome}`, detalhe: 'desligado ainda ocupa assento', alvo: { tipo: 'licenca', id: l.id } });
    })
  );
  dados.linhas
    .filter((ln) => ln.status !== 'cancelada' && ln.colaboradorId && desligados.has(ln.colaboradorId))
    .forEach((ln) => {
      const nome = dados.pessoas.find((p) => p.id === ln.colaboradorId)?.nome || 'Pessoa';
      out.push({ id: `dn-${ln.id}`, tipo: 'desligado_com_recurso', titulo: `${nome} · ${ln.numero}`, detalhe: 'desligado ainda com a linha', alvo: { tipo: 'linha', id: ln.id } });
    });

  // Seção 9.2: passo pendente com data marcada (atrasado continua aparecendo)
  (dados.processoItens || [])
    .filter((i) => i.status === 'pendente' && i.lembreteEm)
    .forEach((i) => {
      const ch = (dados.chamados || []).find((t) => t.id === i.chamadoId);
      if (!ch || ch.status === 'resolvido' || ch.status === 'cancelado') return;
      const dias = dentro(i.lembreteEm);
      if (dias === undefined) return;
      const pessoa =
        dados.pessoas.find((p) => p.id === (ch.colaboradorId || ch.offboarding?.colaboradorId))?.nome || ch.onboarding?.nomeColaborador;
      out.push({
        id: `pa-${i.id}`,
        tipo: 'passo_agendado',
        data: i.lembreteEm,
        dias,
        titulo: `${ACAO_DO_TIPO[i.tipo]}: ${i.titulo}`,
        detalhe: `${ch.tipo === 'onboarding' ? 'Admissão' : 'Desligamento'}${pessoa ? ` de ${pessoa}` : ''} · ${ch.codigo}`,
        alvo: { tipo: 'processo', id: ch.id },
      });
    });

  // Seção 9.5: termo desatualizado (pendência sem data)
  (dados.termosDesatualizados || []).forEach((p) => {
    const nome = dados.pessoas.find((x) => x.id === p.colaboradorId)?.nome || 'Pessoa';
    out.push({ id: `td-${p.colaboradorId}`, tipo: 'termo_desatualizado', titulo: nome, detalhe: resumoPendenciaTermo(p), alvo: { tipo: 'pessoa', id: p.colaboradorId } });
  });

  // Entrega A: contestação do colaborador aguardando resposta
  (dados.termos || [])
    .filter((t) => t.contestacaoEm && !t.contestacaoRespondidaEm && !t.canceladoEm)
    .forEach((t) =>
      out.push({ id: `tc-${t.id}`, tipo: 'termo_contestado', titulo: `${t.colaboradorNome} · ${t.codigo}`, detalhe: t.contestacaoMotivo, alvo: { tipo: 'pessoa', id: t.colaboradorId } })
    );

  // Pendências (sem data) primeiro; depois por data
  return out.sort((a, b) => (a.data ? (b.data ? a.data.localeCompare(b.data) : 1) : b.data ? -1 : 0));
}

// -----------------------------------------------------------------------------
// Despesas (custo mensal recorrente e realizado)
// -----------------------------------------------------------------------------
export interface LinhaDespesa {
  origem: 'licenca' | 'contrato' | 'linha';
  id: string;
  nome: string;
  fornecedorId?: string;
  categoria: CategoriaDespesa;
  centroCusto?: string;
  mensal: number;
}

/** Custo mensal recorrente de hoje: licenças próprias + contratos vigentes + linhas sem contrato */
export function despesasRecorrentes(
  dados: { licencas: SoftwareLicense[]; contratos: Contrato[]; linhas: LinhaTelefonica[] },
  agora: Date = new Date()
): LinhaDespesa[] {
  const out: LinhaDespesa[] = [];
  dados.licencas
    .filter((l) => l.status !== 'inativa' && formaCobrancaDe(l, dados.contratos) === 'propria')
    .forEach((l) =>
      out.push({
        origem: 'licenca',
        id: l.id,
        nome: l.nome,
        fornecedorId: l.fornecedorId,
        categoria: l.categoriaDespesa || 'software',
        centroCusto: l.centroCusto,
        mensal: mensalDaLicenca(l),
      })
    );
  dados.contratos
    .filter((c) => contratoVigente(c, agora))
    .forEach((c) =>
      out.push({
        origem: 'contrato',
        id: c.id,
        nome: nomeContrato(c),
        fornecedorId: c.fornecedorId,
        categoria: c.categoriaDespesa || CATEGORIA_DO_TIPO[c.tipo],
        centroCusto: c.centroCusto,
        mensal: mensalDoContrato(c),
      })
    );
  dados.linhas
    .filter((ln) => ln.status === 'ativa' && !ln.contratoId && ln.valorMensal)
    .forEach((ln) =>
      out.push({ origem: 'linha', id: ln.id, nome: ln.numero, categoria: 'telefonia', centroCusto: ln.centroCusto, mensal: ln.valorMensal || 0 })
    );
  return out;
}

/** Soma por chave (categoria, fornecedor ou área), da maior para a menor */
export function somarPor<T>(itens: T[], chave: (i: T) => string, valor: (i: T) => number): { chave: string; total: number }[] {
  const m = new Map<string, number>();
  itens.forEach((i) => m.set(chave(i), (m.get(chave(i)) || 0) + valor(i)));
  return [...m.entries()].map(([k, total]) => ({ chave: k, total })).sort((a, b) => b.total - a.total);
}

/** Total pago por mês (competência), últimos N meses */
export function pagoPorMes(faturas: Fatura[], meses = 12, agora: Date = new Date()): { mes: string; total: number }[] {
  const out: { mes: string; total: number }[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const mes = isoLocal(d);
    out.push({
      mes: mes.slice(0, 7),
      total: faturas.filter((f) => f.status === 'paga' && f.competencia === mes).reduce((s, f) => s + valorEfetivo(f), 0),
    });
  }
  return out;
}

/** Assentos livres de licenças próprias e o custo deles (ociosidade) */
export function assentosOciosos(licencas: SoftwareLicense[], contratos: Contrato[]) {
  return licencas
    .filter((l) => l.status !== 'inativa' && l.assentosTotais > l.assentosAlocados && formaCobrancaDe(l, contratos) !== 'sem_custo')
    .map((l) => {
      const livres = l.assentosTotais - l.assentosAlocados;
      const fonte = fonteCustoLicenca(l, contratos);
      const porAssento = l.assentosTotais ? fonte.mensalDaLicenca / l.assentosTotais : 0;
      return { licenca: l, livres, custoMensal: livres * porAssento };
    })
    .filter((x) => x.livres > 0);
}

/** Gera CSV (separador ;) com cabeçalho */
export function paraCsv(cabecalho: string[], linhas: (string | number | undefined)[][]): string {
  const esc = (v: string | number | undefined) => {
    const s = v === undefined ? '' : typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cabecalho, ...linhas].map((l) => l.map(esc).join(';')).join('\n');
}

export function baixarCsv(nome: string, conteudo: string) {
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// -----------------------------------------------------------------------------
// Seção 9.4 · Compras de equipamento e valor do patrimônio. O valor vem da
// ficha fiscal (já digitado no cadastro): nada é lançado de novo.
// -----------------------------------------------------------------------------
export interface ValorPatrimonio {
  equipamentos: number;
  qtdEquipamentos: number;
  semValor: number; // equipamentos ativos sem valor de compra informado
  acessorios: number;
  qtdAcessorios: number;
  total: number;
}

/** Equipamentos ativos (sem baixa) pelo valor de compra + acessórios em estoque × valor unitário */
export function valorPatrimonio(ativos: Pick<Asset, 'status' | 'fiscal'>[], estoque: Pick<ItemEstoque, 'ativo' | 'quantidade' | 'valorUnitario'>[]): ValorPatrimonio {
  const vivos = ativos.filter((a) => a.status !== 'descartado');
  const equipamentos = vivos.reduce((s, a) => s + (Number(a.fiscal?.valorCompra) || 0), 0);
  const itens = estoque.filter((i) => i.ativo && i.quantidade > 0);
  const acessorios = itens.reduce((s, i) => s + i.quantidade * (Number(i.valorUnitario) || 0), 0);
  return {
    equipamentos,
    qtdEquipamentos: vivos.length,
    semValor: vivos.filter((a) => !(Number(a.fiscal?.valorCompra) > 0)).length,
    acessorios,
    qtdAcessorios: itens.reduce((s, i) => s + i.quantidade, 0),
    total: equipamentos + acessorios,
  };
}

export interface CompraEquipamento {
  ativoId: string;
  data?: string; // data de aquisição
  tag: string;
  nome: string;
  categoria: Asset['categoria'];
  fornecedorId?: string;
  fornecedorTexto?: string; // registro antigo sem vínculo
  numeroNF?: string;
  valor: number;
  baixado: boolean;
}

/** Compras de equipamento (uma por ativo com valor ou data de aquisição), mais recentes primeiro */
export function comprasDeEquipamentos(ativos: Asset[]): CompraEquipamento[] {
  return ativos
    .filter((a) => (Number(a.fiscal?.valorCompra) || 0) > 0 || a.fiscal?.dataAquisicao)
    .map((a) => ({
      ativoId: a.id,
      data: a.fiscal?.dataAquisicao || undefined,
      tag: a.tag,
      nome: a.nome,
      categoria: a.categoria,
      fornecedorId: a.fornecedorId,
      fornecedorTexto: a.fiscal?.fornecedor || undefined,
      numeroNF: a.fiscal?.numeroNF || undefined,
      valor: Number(a.fiscal?.valorCompra) || 0,
      baixado: a.status === 'descartado',
    }))
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
}
