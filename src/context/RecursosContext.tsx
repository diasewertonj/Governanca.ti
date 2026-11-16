/**
 * Seção 6 · Linhas telefônicas, estoque de acessórios, unidades e anexos de contrato.
 * Separado do AppContext para não crescer o arquivo principal. Só a T.I. carrega.
 * Gravações ESPERAM o banco (padrão do Lote 1): devolvem a mensagem de erro ou null.
 * Modo demonstração: dados de exemplo só em memória.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useApp } from './AppContext.tsx';
import { isSupabaseConfigured } from '../services/supabase.ts';
import {
  deleteItemEstoqueDb,
  deleteLinhaDb,
  enviarAnexoContratoDb,
  fetchAnexosContratoFromDb,
  fetchAtribuicoesLinhaFromDb,
  fetchEstoqueFromDb,
  fetchLinhasFromDb,
  fetchMovimentosEstoqueFromDb,
  fetchUnidadesFromDb,
  insertItemEstoqueDb,
  insertLinhaDb,
  insertMovimentoEstoqueDb,
  insertUnidadeDb,
  mensagemDeErro,
  removerAnexoContratoDb,
  updateItemEstoqueDb,
  updateLinhaDb,
  updateUnidadeDb,
} from '../services/supabaseDb.ts';
import type {
  AnexoContrato,
  AtribuicaoLinha,
  ItemEstoque,
  LinhaTelefonica,
  MovimentoEstoque,
  TipoAnexoContrato,
  TipoMovimentoEstoque,
  Unidade,
} from '../types/index.ts';

type Resultado<T> = { item?: T; erro?: string };

interface RecursosContextType {
  unidades: Unidade[];
  anexosContrato: AnexoContrato[];
  linhas: LinhaTelefonica[];
  atribuicoesLinha: AtribuicaoLinha[];
  estoque: ItemEstoque[];
  movimentos: MovimentoEstoque[];
  salvarUnidade: (u: Omit<Unidade, 'id'> & { id?: string }) => Promise<Resultado<Unidade>>;
  salvarLinha: (l: Omit<LinhaTelefonica, 'id' | 'criadoEm'> & { id?: string }) => Promise<Resultado<LinhaTelefonica>>;
  excluirLinha: (id: string) => Promise<string | null>;
  salvarItemEstoque: (i: Omit<ItemEstoque, 'id' | 'quantidade'> & { id?: string; quantidadeInicial?: number }) => Promise<Resultado<ItemEstoque>>;
  excluirItemEstoque: (id: string) => Promise<string | null>;
  movimentarEstoque: (m: {
    itemId: string;
    tipo: TipoMovimentoEstoque;
    quantidade: number;
    colaboradorId?: string;
    chamadoId?: string;
    motivo?: string;
  }) => Promise<string | null>;
  anexarContrato: (contratoId: string, arquivo: File, tipo: TipoAnexoContrato, descricao?: string) => Promise<string | null>;
  removerAnexoContrato: (id: string) => Promise<string | null>;
  recarregarRecursos: () => Promise<void>;
}

const RecursosContext = createContext<RecursosContextType | undefined>(undefined);

const novoId = (prefixo: string) => `${prefixo}-${crypto.randomUUID()}`;
const agoraIso = () => new Date().toISOString();

// Demonstração: um contrato de telefonia não existe nos dados antigos; as linhas ficam sem contrato
const DEMO_ESTOQUE: ItemEstoque[] = [
  { id: 'est-1', nome: 'Monitor 24" Dell P2422H', tipo: 'monitor', marca: 'Dell', quantidade: 6, minimo: 2, localizacao: 'Almoxarifado T.I.', ativo: true },
  { id: 'est-2', nome: 'Mouse USB Logitech M90', tipo: 'mouse', marca: 'Logitech', quantidade: 3, minimo: 5, localizacao: 'Almoxarifado T.I.', ativo: true },
  { id: 'est-3', nome: 'Teclado ABNT2 USB', tipo: 'teclado', quantidade: 8, minimo: 3, localizacao: 'Almoxarifado T.I.', ativo: true },
  { id: 'est-4', nome: 'Cabo HDMI 1,8 m', tipo: 'cabo', quantidade: 12, minimo: 4, ativo: true },
];
const DEMO_LINHAS: LinhaTelefonica[] = [
  { id: 'lin-1', numero: '(11) 99000-0001', tipo: 'movel', plano: '20 GB', status: 'ativa', valorMensal: 62, criadoEm: '2026-01-10T12:00:00Z' },
  { id: 'lin-2', numero: '(11) 99000-0002', tipo: 'movel', plano: '20 GB', status: 'ativa', valorMensal: 62, criadoEm: '2026-01-10T12:00:00Z' },
];
const DEMO_UNIDADES: Unidade[] = [{ id: 'uni-1', nome: 'Matriz', cidade: 'São Paulo', uf: 'SP', ativo: true }];

export const RecursosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentRole, currentUser } = useApp();
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const demo = !isSupabaseConfigured;

  const [unidades, setUnidades] = useState<Unidade[]>(demo ? DEMO_UNIDADES : []);
  const [anexosContrato, setAnexos] = useState<AnexoContrato[]>([]);
  const [linhas, setLinhas] = useState<LinhaTelefonica[]>(demo ? DEMO_LINHAS : []);
  const [atribuicoesLinha, setAtribuicoesLinha] = useState<AtribuicaoLinha[]>([]);
  const [estoque, setEstoque] = useState<ItemEstoque[]>(demo ? DEMO_ESTOQUE : []);
  const [movimentos, setMovimentos] = useState<MovimentoEstoque[]>([]);

  const recarregarRecursos = useCallback(async () => {
    if (demo || !isTI) return;
    const [u, a, l, al, e, m] = await Promise.all([
      fetchUnidadesFromDb(),
      fetchAnexosContratoFromDb(),
      fetchLinhasFromDb(),
      fetchAtribuicoesLinhaFromDb(),
      fetchEstoqueFromDb(),
      fetchMovimentosEstoqueFromDb(),
    ]);
    if (u) setUnidades(u);
    if (a) setAnexos(a);
    if (l) setLinhas(l);
    if (al) setAtribuicoesLinha(al);
    if (e) setEstoque(e);
    if (m) setMovimentos(m);
  }, [demo, isTI]);

  useEffect(() => {
    if (!currentUser) return;
    void recarregarRecursos();
  }, [currentUser, recarregarRecursos]);

  const noBanco = async (op: () => Promise<unknown>): Promise<string | null> => {
    try {
      await op();
      return null;
    } catch (err) {
      console.error(err);
      return mensagemDeErro(err);
    }
  };

  const salvarUnidade: RecursosContextType['salvarUnidade'] = async (dados) => {
    if (!dados.nome.trim()) return { erro: 'Informe o nome da unidade.' };
    const repetida = unidades.find((u) => u.id !== dados.id && u.nome.trim().toLowerCase() === dados.nome.trim().toLowerCase());
    if (repetida) return { erro: `Já existe a unidade ${repetida.nome}.` };
    const antes = dados.id ? unidades.find((u) => u.id === dados.id) : undefined;
    const item: Unidade = { ...dados, id: dados.id || novoId('uni') };
    const erro = await noBanco(() => (antes ? updateUnidadeDb(antes, item) : insertUnidadeDb(item)));
    if (erro) return { erro };
    setUnidades((prev) => (antes ? prev.map((u) => (u.id === item.id ? item : u)) : [...prev, item]).sort((a, b) => a.nome.localeCompare(b.nome)));
    return { item };
  };

  const salvarLinha: RecursosContextType['salvarLinha'] = async (dados) => {
    const digitos = dados.numero.replace(/\D/g, '');
    if (digitos.length < 8) return { erro: 'Informe o número completo da linha (com DDD).' };
    const repetida = linhas.find((l) => l.id !== dados.id && l.status !== 'cancelada' && l.numero.replace(/\D/g, '') === digitos);
    if (repetida) return { erro: `O número ${repetida.numero} já está cadastrado.` };
    const antes = dados.id ? linhas.find((l) => l.id === dados.id) : undefined;
    const item: LinhaTelefonica = { ...dados, id: dados.id || novoId('lin'), criadoEm: antes?.criadoEm || agoraIso() };
    if (item.status === 'cancelada') item.colaboradorId = undefined;
    const erro = await noBanco(() => (antes ? updateLinhaDb(antes, item) : insertLinhaDb(item)));
    if (erro) return { erro };
    setLinhas((prev) => (antes ? prev.map((l) => (l.id === item.id ? item : l)) : [...prev, item]));
    // Histórico de quem usou (o banco grava por gatilho; aqui só espelha na tela)
    if ((antes?.colaboradorId || '') !== (item.colaboradorId || '')) {
      setAtribuicoesLinha((prev) => [
        ...(item.colaboradorId ? [{ id: novoId('la'), linhaId: item.id, colaboradorId: item.colaboradorId, inicio: agoraIso() }] : []),
        ...prev.map((a) => (a.linhaId === item.id && !a.fim ? { ...a, fim: agoraIso() } : a)),
      ]);
    }
    return { item };
  };

  const excluirLinha: RecursosContextType['excluirLinha'] = async (id) => {
    if (currentRole !== 'ti_admin') return 'Só o administrador exclui uma linha. Cancele a linha para tirá-la de uso.';
    if (atribuicoesLinha.some((a) => a.linhaId === id)) return 'A linha tem histórico de uso: cancele em vez de excluir.';
    const erro = await noBanco(() => deleteLinhaDb(id));
    if (erro) return erro;
    setLinhas((prev) => prev.filter((l) => l.id !== id));
    return null;
  };

  const salvarItemEstoque: RecursosContextType['salvarItemEstoque'] = async ({ quantidadeInicial, ...dados }) => {
    if (!dados.nome.trim()) return { erro: 'Informe o nome do acessório.' };
    const repetido = estoque.find((i) => i.id !== dados.id && i.nome.trim().toLowerCase() === dados.nome.trim().toLowerCase());
    if (repetido) return { erro: `Já existe "${repetido.nome}" no estoque: use a entrada nele.` };
    const antes = dados.id ? estoque.find((i) => i.id === dados.id) : undefined;
    const item: ItemEstoque = { ...dados, id: dados.id || novoId('est'), quantidade: antes?.quantidade ?? 0 };
    const erro = await noBanco(() => (antes ? updateItemEstoqueDb(antes, item) : insertItemEstoqueDb(item)));
    if (erro) return { erro };
    setEstoque((prev) => (antes ? prev.map((i) => (i.id === item.id ? item : i)) : [...prev, item]).sort((a, b) => a.nome.localeCompare(b.nome)));
    if (!antes && quantidadeInicial && quantidadeInicial > 0) {
      const erroMov = await movimentar({ itemId: item.id, tipo: 'entrada', quantidade: quantidadeInicial, motivo: 'Saldo inicial' }, item);
      if (erroMov) return { item, erro: `Acessório cadastrado, mas o saldo inicial não foi lançado: ${erroMov}` };
    }
    return { item };
  };

  const excluirItemEstoque: RecursosContextType['excluirItemEstoque'] = async (id) => {
    if (currentRole !== 'ti_admin') return 'Só o administrador exclui. Desative o acessório para tirá-lo das listas.';
    if (movimentos.some((m) => m.itemId === id)) return 'O acessório tem movimentos no histórico: desative em vez de excluir.';
    const erro = await noBanco(() => deleteItemEstoqueDb(id));
    if (erro) return erro;
    setEstoque((prev) => prev.filter((i) => i.id !== id));
    return null;
  };

  const movimentar = async (m: Parameters<RecursosContextType['movimentarEstoque']>[0], itemConhecido?: ItemEstoque) => {
    const item = itemConhecido || estoque.find((i) => i.id === m.itemId);
    if (!item) return 'Acessório não encontrado.';
    if (!Number.isInteger(m.quantidade) || m.quantidade === 0) return 'Informe uma quantidade inteira.';
    if (m.tipo !== 'ajuste' && m.quantidade < 0) return 'A quantidade precisa ser positiva.';
    if (m.tipo === 'ajuste' && (m.motivo || '').trim().length < 5) return 'Ajuste de estoque precisa de motivo.';
    const delta = m.tipo === 'saida' ? -m.quantidade : m.quantidade;
    if (item.quantidade + delta < 0) return `Estoque insuficiente: há ${item.quantidade} de ${item.nome}.`;
    const mov: MovimentoEstoque = { ...m, id: novoId('mov'), criadoPor: currentUser?.id, criadoEm: agoraIso() };
    const erro = await noBanco(() => insertMovimentoEstoqueDb(mov));
    if (erro) return erro;
    setMovimentos((prev) => [mov, ...prev]);
    setEstoque((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantidade: i.quantidade + delta } : i)));
    return null;
  };

  const anexarContrato: RecursosContextType['anexarContrato'] = async (contratoId, arquivo, tipo, descricao) => {
    if (demo) {
      setAnexos((prev) => [
        { id: novoId('anx'), contratoId, tipo, descricao, arquivoCaminho: `demo/${arquivo.name}`, criadoEm: agoraIso() },
        ...prev,
      ]);
      return null;
    }
    try {
      const novo = await enviarAnexoContratoDb(contratoId, arquivo, tipo, descricao);
      if (novo) setAnexos((prev) => [novo, ...prev]);
      return null;
    } catch (err) {
      return mensagemDeErro(err);
    }
  };

  const removerAnexoContrato: RecursosContextType['removerAnexoContrato'] = async (id) => {
    const anexo = anexosContrato.find((a) => a.id === id);
    if (!anexo) return 'Anexo não encontrado.';
    const erro = demo ? null : await noBanco(() => removerAnexoContratoDb(anexo));
    if (erro) return erro;
    setAnexos((prev) => prev.filter((a) => a.id !== id));
    return null;
  };

  return (
    <RecursosContext.Provider
      value={{
        unidades,
        anexosContrato,
        linhas,
        atribuicoesLinha,
        estoque,
        movimentos,
        salvarUnidade,
        salvarLinha,
        excluirLinha,
        salvarItemEstoque,
        excluirItemEstoque,
        movimentarEstoque: (m) => movimentar(m),
        anexarContrato,
        removerAnexoContrato,
        recarregarRecursos,
      }}
    >
      {children}
    </RecursosContext.Provider>
  );
};

export const useRecursos = () => {
  const ctx = useContext(RecursosContext);
  if (!ctx) throw new Error('useRecursos precisa estar dentro de RecursosProvider');
  return ctx;
};
