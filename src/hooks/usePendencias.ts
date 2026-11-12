import { useEffect } from 'react';
import { useApp } from '../context/AppContext.tsx';

/**
 * Fase 5: informa ao app que esta tela tem alterações não salvas, para ele
 * perguntar antes de trocar de tela, sair da conta ou fechar a aba.
 * A pendência some quando a lista fica vazia ou a tela é desmontada.
 */
export function useRegistrarPendencias(origem: string, itens: string[]) {
  const { registrarPendencias } = useApp();
  const chave = itens.join('\u0000');

  useEffect(() => {
    registrarPendencias(origem, chave ? chave.split('\u0000') : []);
  }, [origem, chave, registrarPendencias]);

  useEffect(() => () => registrarPendencias(origem, []), [origem, registrarPendencias]);
}
