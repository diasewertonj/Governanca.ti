import type { UserRole } from '../types/index.ts';

/**
 * Tela que cada papel pode ver. Se a tela pedida não for permitida, devolve a
 * tela inicial do papel. É só a proteção de interface: a proteção real está no
 * banco (RLS e triggers das Fases 0 e 1).
 */
export function vistaPermitida(papel: UserRole, view: string): string {
  if (papel === 'colaborador') return ['my_assets', 'my_tickets'].includes(view) ? view : 'my_assets';
  if (papel === 'rh') return ['settings', 'dashboard', 'lembretes'].includes(view) ? 'rh_processes' : view;
  if (papel === 'ti_suporte') return view === 'settings' ? 'dashboard' : view;
  return view; // ti_admin
}
