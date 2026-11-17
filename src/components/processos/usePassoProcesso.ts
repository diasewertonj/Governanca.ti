/**
 * Seção 9.2 · Registro de um passo do checklist, com os efeitos que ficam fora da
 * função do banco: licença da conta criada, linha entregue/devolvida e acessório que
 * sai do estoque para a pessoa. Usado na linha do passo (ação direta) e no
 * formulário completo ("Mais opções"), para as duas fazerem exatamente o mesmo.
 */
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { isSupabaseConfigured } from '../../services/supabase.ts';
import type { DadosRegistroItem } from '../../services/supabaseDb.ts';
import type { ProcessoItem, StatusItemProcesso, Ticket } from '../../types/index.ts';
import { assentosLivres } from '../../utils/admissao.ts';

export interface OpcoesRegistro {
  observacao?: string;
  dados?: DadosRegistroItem;
  /** Conta criada: ocupa um assento desta licença (se houver vaga) */
  licencaContaId?: string;
  /** Acessório: sai do estoque para a pessoa */
  estoque?: { itemId: string; quantidade: number; justificativa?: string };
  /** Linha: entregar (linhaId) ou devolver (destino) */
  linha?: { linhaId?: string; destino?: 'estoque' | 'cancelar' | 'transferir'; para?: string };
  /** Pessoa já ligada agora (cadastro): usada nos efeitos antes de o chamado ser relido */
  colaboradorId?: string;
}

export type ResultadoLogin = { email: string; senha: string } | { demo: true } | { erro: string };

export function usePassoProcesso(ticket: Ticket) {
  const { registrarItemProcesso, allocateLicense, licenses, acessoNexus, processoItens } = useApp();
  const { linhas, salvarLinha, movimentarEstoque } = useRecursos();

  const registrar = async (item: ProcessoItem, status: StatusItemProcesso, op: OpcoesRegistro = {}): Promise<string | null> => {
    const falha = await registrarItemProcesso(item.id, status, op.observacao, op.dados || {});
    if (falha) return falha;
    if (status !== 'feito') return null;
    const colab = op.colaboradorId || op.dados?.colaborador_id || ticket.colaboradorId || ticket.offboarding?.colaboradorId;
    if (!colab) return null;

    if (op.licencaContaId) {
      const lic = licenses.find((l) => l.id === op.licencaContaId);
      if (lic && !lic.colaboradoresIds.includes(colab) && assentosLivres(lic) > 0) allocateLicense(lic.id, colab);
    }
    if (item.tipo === 'entregar_linha' && op.linha?.linhaId) {
      const l = linhas.find((x) => x.id === op.linha?.linhaId);
      if (l) {
        const r = await salvarLinha({ ...l, colaboradorId: colab });
        if (r.erro) return `Passo registrado, mas a linha não foi ligada à pessoa: ${r.erro}`;
      }
    }
    if (item.tipo === 'liberar_linha' && op.linha?.destino) {
      const l = linhas.find((x) => x.id === item.linhaId);
      if (l) {
        const r = await salvarLinha({
          ...l,
          colaboradorId: op.linha.destino === 'transferir' ? op.linha.para : undefined,
          status: op.linha.destino === 'cancelar' ? 'cancelada' : l.status,
        });
        if (r.erro) return `Passo registrado, mas a linha não foi atualizada: ${r.erro}`;
      }
    }
    if (item.tipo === 'acessorio' && op.estoque?.itemId) {
      const motivo = [item.titulo, op.estoque.justificativa ? `justificativa: ${op.estoque.justificativa}` : ''].filter(Boolean).join(' — ');
      const falhaEst = await movimentarEstoque({
        itemId: op.estoque.itemId,
        tipo: 'saida',
        quantidade: op.estoque.quantidade,
        colaboradorId: colab,
        chamadoId: ticket.id,
        motivo,
      });
      if (falhaEst) return `Passo registrado, mas o estoque não baixou: ${falhaEst}`;
    }
    return null;
  };

  /**
   * Login no Nexus com senha provisória. Marca o passo "Acesso ao Nexus" (se houver)
   * como feito. Na demonstração (sem banco) não cria login: só avisa e registra.
   */
  const criarLogin = async (colaboradorId: string): Promise<ResultadoLogin> => {
    const passo = processoItens.find((i) => i.chamadoId === ticket.id && i.tipo === 'acesso_nexus' && i.status === 'pendente');
    if (!isSupabaseConfigured) {
      // colaborador_id: a pessoa acabou de ser ligada (o chamado em memória ainda não foi relido)
      if (passo) await registrarItemProcesso(passo.id, 'feito', 'Modo demonstração: login não criado (sem banco)', { colaborador_id: colaboradorId });
      return { demo: true };
    }
    let r = await acessoNexus(colaboradorId, 'criar', ticket.id);
    if ('erro' in r && /já tem acesso|já existe/i.test(r.erro)) r = await acessoNexus(colaboradorId, 'redefinir', ticket.id);
    if ('erro' in r) return r;
    // A senha aparece mesmo que o registro do passo falhe (a pessoa marca depois)
    if (passo) await registrarItemProcesso(passo.id, 'feito', `Login criado para ${r.email}`, {});
    return r;
  };

  return { registrar, criarLogin };
}
