import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { rotuloPrioridade, rotuloStatus } from './formatters.ts';
import { vistaPermitida } from './permissoes.ts';

// Lê a lista de valores aceitos por um CHECK ... IN (...) do schema do banco
function valoresDoCheck(coluna: string): string[] {
  const schema = fs.readFileSync(path.resolve(__dirname, '../../supabase-schema.sql'), 'utf8');
  const bloco = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS public.chamados'));
  const m = bloco.match(new RegExp(`${coluna}\\s+TEXT[^\\n]*CHECK \\(${coluna} IN \\(([^)]*)\\)`));
  if (!m) throw new Error(`CHECK de ${coluna} não encontrado`);
  return m[1].split(',').map((v) => v.trim().replace(/'/g, ''));
}

describe('valores de chamado batem com o banco (CRIT-03 não pode voltar)', () => {
  it('toda prioridade aceita pelo banco tem rótulo na tela', () => {
    const doBanco = valoresDoCheck('prioridade');
    expect(doBanco).toEqual(['baixa', 'media', 'alta', 'critica']);
    for (const v of doBanco) expect(rotuloPrioridade(v)).not.toBe(v);
    expect(rotuloPrioridade('critica')).toBe('Urgente');
  });

  it('todo status aceito pelo banco tem rótulo na tela', () => {
    const doBanco = valoresDoCheck('status');
    expect(doBanco).toContain('aguardando_terceiro');
    for (const v of doBanco) expect(rotuloStatus(v)).not.toBe(v);
    expect(rotuloStatus('aguardando_terceiro')).toBe('Aguardando peça');
  });

  it('o site só usa valores que o banco aceita', () => {
    const fonte = ['servicedesk/NewTicketModal.tsx', 'servicedesk/ServiceDeskView.tsx', 'servicedesk/TicketDetailModal.tsx']
      .map((f) => fs.readFileSync(path.resolve(__dirname, '../components', f), 'utf8'))
      .join('\n');
    const usados = [...fonte.matchAll(/<option value="([a-z_]+)"/g)].map((m) => m[1]);
    const aceitos = new Set([...valoresDoCheck('prioridade'), ...valoresDoCheck('status'), 'todos', 'suporte', 'onboarding', 'offboarding']);
    const fora = usados.filter((v) => !aceitos.has(v));
    expect(fora).toEqual([]);
  });
});

describe('vistaPermitida (RBAC de interface)', () => {
  it('colaborador só vê as próprias telas', () => {
    expect(vistaPermitida('colaborador', 'my_tickets')).toBe('my_tickets');
    expect(vistaPermitida('colaborador', 'settings')).toBe('my_assets');
    expect(vistaPermitida('colaborador', 'dashboard')).toBe('my_assets');
  });

  it('rh tem Início próprio e não acessa configurações, lembretes nem ativos (Fase 7)', () => {
    expect(vistaPermitida('rh', 'settings')).toBe('dashboard');
    expect(vistaPermitida('rh', 'lembretes')).toBe('dashboard');
    expect(vistaPermitida('rh', 'assets')).toBe('dashboard');
    expect(vistaPermitida('rh', 'dashboard')).toBe('dashboard');
    expect(vistaPermitida('rh', 'my_assets')).toBe('my_assets');
    expect(vistaPermitida('rh', 'collaborators')).toBe('collaborators');
  });

  it('fornecedores e contratos só para a T.I. (Fase 8)', () => {
    expect(vistaPermitida('ti_admin', 'fornecedores')).toBe('fornecedores');
    expect(vistaPermitida('ti_suporte', 'fornecedores')).toBe('fornecedores');
    expect(vistaPermitida('rh', 'fornecedores')).toBe('dashboard');
    expect(vistaPermitida('colaborador', 'fornecedores')).toBe('my_assets');
  });

  it('configurações só para ti_admin', () => {
    expect(vistaPermitida('ti_suporte', 'settings')).toBe('dashboard');
    expect(vistaPermitida('ti_admin', 'settings')).toBe('settings');
  });
});
