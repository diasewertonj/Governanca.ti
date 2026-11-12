import type { UserRole } from '../types/index.ts';
import { vistasDoPapel } from './navegacao.ts';

/**
 * Tela que cada papel pode ver: as do menu dele (Fase 7: fonte única em
 * navegacao.ts). Se a tela pedida não for permitida, devolve a tela inicial do
 * papel. É só a proteção de interface: a proteção real está no banco (RLS e
 * triggers das Fases 0 e 1).
 */
export function vistaPermitida(papel: UserRole, view: string): string {
  const permitidas: string[] = vistasDoPapel(papel);
  if (permitidas.includes(view)) return view;
  return permitidas[0];
}
