// Fase 9: fichas (chamado, equipamento, colaborador, software) abrem uma por
// cima da outra. Fechar a de cima volta para a anterior, do jeito que estava.

export type TipoFicha = 'ativo' | 'colaborador' | 'software' | 'chamado';

export interface FichaAberta {
  tipo: TipoFicha;
  id: string;
  /** Só na ficha do equipamento: já abre "Enviar para manutenção" ligado a este chamado */
  manutencaoDoChamado?: string;
}

/** Acima disso, a ficha mais antiga (a de baixo) sai da pilha */
export const LIMITE_FICHAS = 10;

const mesma = (a: FichaAberta, b: FichaAberta) => a.tipo === b.tipo && a.id === b.id;

/** Posição da ficha na pilha (-1 se não estiver aberta) */
export const posicaoNaPilha = (pilha: FichaAberta[], ficha: FichaAberta) => pilha.findIndex((f) => mesma(f, ficha));

/**
 * Abre a ficha por cima das outras. Se ela já estiver aberta mais abaixo,
 * volta até ela (fecha as de cima) em vez de abrir uma segunda cópia, que
 * teria um rascunho próprio e confundiria quem está editando.
 */
export function empilharFicha(pilha: FichaAberta[], nova: FichaAberta): FichaAberta[] {
  const i = posicaoNaPilha(pilha, nova);
  if (i >= 0) {
    const atual = pilha[i];
    const manter = nova.manutencaoDoChamado ? nova : atual;
    if (i === pilha.length - 1 && manter === atual) return pilha;
    return [...pilha.slice(0, i), manter];
  }
  const resultado = [...pilha, nova];
  return resultado.length > LIMITE_FICHAS ? resultado.slice(resultado.length - LIMITE_FICHAS) : resultado;
}

/** Fecha a ficha da posição indicada (e as que estiverem por cima dela) */
export const fecharFichaNaPosicao = (pilha: FichaAberta[], posicao: number): FichaAberta[] =>
  posicao < 0 || posicao >= pilha.length ? pilha : pilha.slice(0, posicao);

/** Fecha a ficha mais de cima do tipo indicado (compatível com os antigos set...(null)) */
export function fecharUltimaDoTipo(pilha: FichaAberta[], tipo: TipoFicha): FichaAberta[] {
  for (let i = pilha.length - 1; i >= 0; i--) {
    if (pilha[i].tipo === tipo) return pilha.slice(0, i);
  }
  return pilha;
}

/** Abrir esta ficha fecharia outras que estão por cima dela? (pede confirmação se houver rascunho) */
export const voltarFechaOutras = (pilha: FichaAberta[], ficha: FichaAberta) => {
  const i = posicaoNaPilha(pilha, ficha);
  return i >= 0 && i < pilha.length - 1;
};
