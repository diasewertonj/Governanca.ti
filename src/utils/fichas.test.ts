import { describe, expect, it } from 'vitest';
import {
  LIMITE_FICHAS,
  empilharFicha,
  fecharFichaNaPosicao,
  fecharUltimaDoTipo,
  voltarFechaOutras,
  type FichaAberta,
} from './fichas.ts';

const chamado: FichaAberta = { tipo: 'chamado', id: 'tk-1' };
const ativo: FichaAberta = { tipo: 'ativo', id: 'at-1' };
const pessoa: FichaAberta = { tipo: 'colaborador', id: 'emp-1' };

describe('pilha de fichas', () => {
  it('abre a ficha nova por cima da atual', () => {
    expect(empilharFicha([chamado], ativo)).toEqual([chamado, ativo]);
  });

  it('a mesma ficha já no topo não duplica', () => {
    const pilha = [chamado, ativo];
    expect(empilharFicha(pilha, { tipo: 'ativo', id: 'at-1' })).toBe(pilha);
  });

  it('ficha já aberta mais abaixo: volta até ela em vez de abrir outra cópia', () => {
    expect(empilharFicha([chamado, ativo, pessoa], { tipo: 'chamado', id: 'tk-1' })).toEqual([chamado]);
    expect(voltarFechaOutras([chamado, ativo, pessoa], chamado)).toBe(true);
    expect(voltarFechaOutras([chamado, ativo], ativo)).toBe(false);
    expect(voltarFechaOutras([chamado], ativo)).toBe(false);
  });

  it('mesmo id com tipo diferente é outra ficha', () => {
    const p = { tipo: 'colaborador', id: 'tk-1' } as const;
    expect(empilharFicha([chamado], p)).toEqual([chamado, p]);
  });

  it('pedido de manutenção substitui a ficha do equipamento já aberta', () => {
    const comManutencao: FichaAberta = { tipo: 'ativo', id: 'at-1', manutencaoDoChamado: 'tk-1' };
    expect(empilharFicha([chamado, ativo], comManutencao)).toEqual([chamado, comManutencao]);
  });

  it('respeita o limite tirando a ficha mais antiga', () => {
    let pilha: FichaAberta[] = [];
    for (let i = 0; i < LIMITE_FICHAS + 2; i++) pilha = empilharFicha(pilha, { tipo: 'ativo', id: `at-${i}` });
    expect(pilha).toHaveLength(LIMITE_FICHAS);
    expect(pilha[0].id).toBe('at-2');
  });

  it('fechar uma posição fecha ela e as de cima', () => {
    expect(fecharFichaNaPosicao([chamado, ativo, pessoa], 1)).toEqual([chamado]);
    expect(fecharFichaNaPosicao([chamado, ativo], 1)).toEqual([chamado]);
    expect(fecharFichaNaPosicao([chamado], 5)).toEqual([chamado]);
  });

  it('fechar pelo tipo fecha só a mais de cima daquele tipo', () => {
    const outro: FichaAberta = { tipo: 'ativo', id: 'at-2' };
    expect(fecharUltimaDoTipo([ativo, chamado, outro], 'ativo')).toEqual([ativo, chamado]);
    expect(fecharUltimaDoTipo([chamado], 'software')).toEqual([chamado]);
  });
});
