/**
 * Seção 17 · Financeiro de T.I. no banco: recebimentos, rateios, fechamento do
 * imobilizado e resumo de contratos/licenças para Compras.
 * Mesmo padrão do comprasDb: gravação lança DbError; leitura que falha devolve null
 * (antes da migration as tabelas não existem). Sem Supabase, nada acontece.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import { DbError } from './supabaseDb.ts';
import type { FechamentoImobilizado, Rateio, Recebimento, StatusRecebimento, TipoRecebimento } from '../types/index.ts';

type Linha = Record<string, unknown>;
const bd = () => supabase as unknown as SupabaseClient;
const txt = (v: unknown) => (v == null || v === '' ? undefined : String(v));
const num = (v: unknown) => (v == null || v === '' ? undefined : Number(v));
const nulo = (v: unknown) => (v === undefined || v === '' ? null : v);

async function checar<T>(op: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await op;
  if (error) throw new DbError(error.message, error.code);
  return data;
}

async function ler<T>(op: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  const { data, error } = await op;
  return error ? null : data;
}

// Recebimentos -----------------------------------------------------------------
const paraRecebimento = (r: Linha): Recebimento => ({
  id: String(r.id),
  tipo: r.tipo as TipoRecebimento,
  descricao: String(r.descricao || ''),
  valor: Number(r.valor) || 0,
  previstoPara: txt(r.previsto_para),
  recebidoEm: txt(r.recebido_em),
  valorRecebido: num(r.valor_recebido),
  status: r.status as StatusRecebimento,
  ativoId: txt(r.ativo_id),
  baixaId: txt(r.baixa_id),
  colaboradorId: txt(r.colaborador_id),
  fornecedorId: txt(r.fornecedor_id),
  pedidoId: txt(r.pedido_id),
  departamentoId: txt(r.departamento_id),
  arquivoCaminho: txt(r.arquivo_caminho),
  observacoes: txt(r.observacoes),
  criadoPor: txt(r.criado_por),
  criadoEm: String(r.criado_em || ''),
});

export async function listarRecebimentos(): Promise<Recebimento[] | null> {
  if (!supabase) return null;
  const d = await ler(bd().from('recebimentos').select('*').order('criado_em', { ascending: false }));
  return d ? (d as Linha[]).map(paraRecebimento) : null;
}

export async function salvarRecebimento(r: Partial<Recebimento> & Pick<Recebimento, 'tipo' | 'descricao' | 'valor'>): Promise<Recebimento | null> {
  if (!supabase) return null;
  const linha = {
    tipo: r.tipo,
    descricao: r.descricao,
    valor: r.valor,
    previsto_para: nulo(r.previstoPara),
    recebido_em: nulo(r.recebidoEm),
    valor_recebido: nulo(r.valorRecebido),
    status: r.status || 'previsto',
    ativo_id: nulo(r.ativoId),
    baixa_id: nulo(r.baixaId),
    colaborador_id: nulo(r.colaboradorId),
    fornecedor_id: nulo(r.fornecedorId),
    pedido_id: nulo(r.pedidoId),
    departamento_id: nulo(r.departamentoId),
    arquivo_caminho: nulo(r.arquivoCaminho),
    observacoes: nulo(r.observacoes),
  };
  const q = r.id ? bd().from('recebimentos').update(linha).eq('id', r.id) : bd().from('recebimentos').insert(linha);
  const d = await checar(q.select('*').single());
  return paraRecebimento(d as Linha);
}

// Rateios ----------------------------------------------------------------------
const paraRateio = (r: Linha): Rateio => ({
  id: String(r.id),
  origemTipo: r.origem_tipo as Rateio['origemTipo'],
  origemId: String(r.origem_id),
  departamentoId: String(r.departamento_id),
  percentual: Number(r.percentual) || 0,
});

export async function listarRateios(): Promise<Rateio[] | null> {
  if (!supabase) return null;
  const d = await ler(bd().from('rateios').select('*'));
  return d ? (d as Linha[]).map(paraRateio) : null;
}

/** Troca o rateio inteiro de uma origem (apaga as áreas que saíram) */
export async function salvarRateioDe(origemTipo: Rateio['origemTipo'], origemId: string, partes: { departamentoId: string; percentual: number }[]): Promise<void> {
  if (!supabase) return;
  await checar(bd().from('rateios').delete().eq('origem_tipo', origemTipo).eq('origem_id', origemId));
  if (partes.length)
    await checar(
      bd()
        .from('rateios')
        .insert(partes.map((p) => ({ origem_tipo: origemTipo, origem_id: origemId, departamento_id: p.departamentoId, percentual: p.percentual })))
    );
}

// Imobilizado ------------------------------------------------------------------
export async function listarFechamentos(): Promise<FechamentoImobilizado[] | null> {
  if (!supabase) return null;
  const d = await ler(bd().from('imobilizado_fechamentos').select('*').order('fechado_em', { ascending: false }));
  return d
    ? (d as Linha[]).map((r) => ({
        id: String(r.id),
        ano: Number(r.ano),
        foto: r.foto,
        fechadoPor: txt(r.fechado_por),
        fechadoEm: String(r.fechado_em || ''),
        reabertoPor: txt(r.reaberto_por),
        reabertoEm: txt(r.reaberto_em),
        reaberturaMotivo: txt(r.reabertura_motivo),
      }))
    : null;
}

export async function fecharImobilizado(ano: number, foto: unknown): Promise<void> {
  if (!supabase) return;
  await checar(bd().rpc('fechar_imobilizado', { p_ano: ano, p_foto: foto }));
}

export async function reabrirImobilizado(ano: number, motivo: string): Promise<void> {
  if (!supabase) return;
  await checar(bd().rpc('reabrir_imobilizado', { p_ano: ano, p_motivo: motivo }));
}

// Resumo para Compras (decisão 1) ----------------------------------------------
export interface ContratoResumo {
  id: string;
  fornecedorId: string;
  tipo: string;
  valor: number;
  periodicidade: string;
  inicio?: string;
  fim?: string;
  status?: string;
}

export async function contratosResumo(): Promise<ContratoResumo[] | null> {
  if (!supabase) return null;
  const d = await ler(bd().rpc('contratos_resumo'));
  return d
    ? (d as Linha[]).map((r) => ({
        id: String(r.id),
        fornecedorId: String(r.fornecedor_id || ''),
        tipo: String(r.tipo || ''),
        valor: Number(r.valor) || 0,
        periodicidade: String(r.periodicidade || ''),
        inicio: txt(r.inicio),
        fim: txt(r.fim),
        status: txt(r.status),
      }))
    : null;
}

export async function licencasResumo(): Promise<{ id: string; nome: string; fornecedorId?: string }[] | null> {
  if (!supabase) return null;
  const d = await ler(bd().rpc('licencas_resumo'));
  return d ? (d as Linha[]).map((r) => ({ id: String(r.id), nome: String(r.nome || ''), fornecedorId: txt(r.fornecedor_id) })) : null;
}
