// =============================================================================
// Fase 6 · Processos guiados de onboarding e offboarding (regras puras)
// -----------------------------------------------------------------------------
// - Onboarding: o checklist nasce do CATÁLOGO (itens sugeridos) + pedidos do RH.
//   Nada é obrigatório: a T.I. tira ou acrescenta o que quiser antes de salvar.
// - Offboarding: o checklist nasce do INVENTÁRIO REAL da pessoa (contas e grupos
//   concedidos, acessórios, ativos em posse e licenças) + dados do Drive, e-mail
//   e o recibo de devolução. Assim nada fica esquecido.
// O título do item é o NOME do recurso ("Microsoft 365", "Fone de ouvido"); a
// ação ("Criar conta", "Entregar"...) vem do tipo.
// =============================================================================
import type {
  Asset,
  CatalogoItem,
  ColaboradorRecurso,
  ItemTermo,
  ModeloDocumento,
  ProcessoItem,
  ProcessoItemRascunho,
  SoftwareLicense,
  Ticket,
  TipoItemProcesso,
} from '../types/index.ts';

/** Catálogo inicial (o mesmo semeado pela migração; usado no modo demonstração) */
export const CATALOGO_PADRAO: CatalogoItem[] = [
  { id: 'cat-m365', tipo: 'conta', nome: 'Microsoft 365', sugeridoOnboarding: true, ativo: true, ordem: 1 },
  { id: 'cat-google', tipo: 'conta', nome: 'Google Workspace', sugeridoOnboarding: true, ativo: true, ordem: 2 },
  { id: 'cat-slack', tipo: 'conta', nome: 'Slack', sugeridoOnboarding: true, ativo: true, ordem: 3 },
  { id: 'cat-notebook', tipo: 'equipamento', nome: 'Notebook', sugeridoOnboarding: true, ativo: true, ordem: 1 },
  { id: 'cat-monitor', tipo: 'equipamento', nome: 'Monitor extra', sugeridoOnboarding: false, ativo: true, ordem: 2 },
  { id: 'cat-fonte', tipo: 'acessorio', nome: 'Fonte do notebook', sugeridoOnboarding: true, ativo: true, ordem: 1 },
  { id: 'cat-suporte', tipo: 'acessorio', nome: 'Suporte para notebook', sugeridoOnboarding: true, ativo: true, ordem: 2 },
  { id: 'cat-fone', tipo: 'acessorio', nome: 'Fone de ouvido', sugeridoOnboarding: true, ativo: true, ordem: 3 },
  { id: 'cat-teclado', tipo: 'acessorio', nome: 'Teclado', sugeridoOnboarding: false, ativo: true, ordem: 4 },
  { id: 'cat-mouse', tipo: 'acessorio', nome: 'Mouse', sugeridoOnboarding: false, ativo: true, ordem: 5 },
];

/** Verbo de cada tipo de passo (o título traz o nome do recurso) */
export const ACAO_DO_TIPO: Record<TipoItemProcesso, string> = {
  cadastro: 'Cadastrar colaborador',
  conta: 'Criar conta',
  grupo_email: 'Incluir no grupo de e-mail',
  equipamento: 'Entregar equipamento',
  acessorio: 'Entregar acessório',
  licenca: 'Alocar licença',
  termo: 'Termo assinado',
  acesso_nexus: 'Acesso ao Nexus',
  encerrar_recurso: 'Encerrar acesso',
  devolver_equipamento: 'Recolher equipamento',
  liberar_licenca: 'Liberar licença',
  dados_drive: 'Dados do Drive',
  email: 'Caixa de e-mail',
  tarefa: 'Tarefa',
};

export type Etapa = 'Cadastro' | 'Contas e acessos' | 'Equipamentos' | 'Dados' | 'Fechamento';
export const ORDEM_ETAPAS: Etapa[] = ['Cadastro', 'Contas e acessos', 'Equipamentos', 'Dados', 'Fechamento'];

/** Em que etapa o passo aparece na tela */
export function etapaDoItem(
  item: Pick<ProcessoItem, 'tipo' | 'recursoId'>,
  recursos: Pick<ColaboradorRecurso, 'id' | 'tipo'>[] = []
): Etapa {
  switch (item.tipo) {
    case 'cadastro':
      return 'Cadastro';
    case 'conta':
    case 'grupo_email':
    case 'licenca':
    case 'liberar_licenca':
    case 'acesso_nexus':
      return 'Contas e acessos';
    case 'equipamento':
    case 'acessorio':
    case 'devolver_equipamento':
      return 'Equipamentos';
    case 'encerrar_recurso':
      return recursos.find((r) => r.id === item.recursoId)?.tipo === 'acessorio' ? 'Equipamentos' : 'Contas e acessos';
    case 'dados_drive':
    case 'email':
      return 'Dados';
    default:
      return 'Fechamento';
  }
}

/** Compara nomes sem acento/caixa ("Fone de Ouvido" = "fone de ouvido") */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const novaChave = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

function item(
  tipo: TipoItemProcesso,
  titulo: string,
  extra: Partial<Omit<ProcessoItemRascunho, 'tipo' | 'titulo' | 'chave'>> = {}
): ProcessoItemRascunho {
  return { chave: novaChave(), tipo, titulo, sugeridoPor: 'sistema', ...extra };
}

// -----------------------------------------------------------------------------
// Onboarding
// -----------------------------------------------------------------------------
export function montarOnboarding(
  ticket: Pick<Ticket, 'onboarding'>,
  catalogo: CatalogoItem[],
  licencas: Pick<SoftwareLicense, 'id' | 'nome'>[] = []
): ProcessoItemRascunho[] {
  const ob = ticket.onboarding;
  const ativos = catalogo.filter((c) => c.ativo).sort((a, b) => a.ordem - b.ordem);
  const pedidosRh = [...(ob?.acessosSoftwares || []), ...(ob?.perifericos || [])];
  const pedidosNorm = new Set(pedidosRh.map(normalizar));
  const atendidos = new Set<string>();
  // Pedido feito pelo formulário novo (itens do catálogo): vale exatamente o que
  // o RH marcou. Pedido antigo (nomes livres): entram os sugeridos do catálogo.
  const rhUsouCatalogo = ativos.some((c) => pedidosNorm.has(normalizar(c.nome)));

  const itens: ProcessoItemRascunho[] = [
    item('cadastro', ob?.nomeColaborador || 'Novo colaborador', {
      detalhe: ob ? [ob.cargo, ob.emailColaborador].filter(Boolean).join(' · ') : undefined,
    }),
  ];

  // Do catálogo: o que é sugerido para todos + o que o RH pediu pelo nome
  const doCatalogo = (tipo: CatalogoItem['tipo'], tipoItem: TipoItemProcesso) => {
    for (const c of ativos.filter((x) => x.tipo === tipo)) {
      const pedido = pedidosNorm.has(normalizar(c.nome));
      if (pedido) atendidos.add(normalizar(c.nome));
      if (!pedido && !(c.sugeridoOnboarding && !rhUsouCatalogo)) continue;
      itens.push(
        item(tipoItem, c.nome, {
          catalogoId: c.id,
          sugeridoPor: pedido ? 'rh' : 'sistema',
          detalhe:
            tipo === 'equipamento' && c.nome === 'Notebook' && ob?.tipoComputador
              ? `Pedido do RH: ${ob.tipoComputador}`
              : c.descricao,
        })
      );
    }
  };

  doCatalogo('conta', 'conta');

  // Softwares pedidos pelo RH que não estão no catálogo: licença (se existir) ou conta
  for (const nome of ob?.acessosSoftwares || []) {
    const n = normalizar(nome);
    if (atendidos.has(n)) continue;
    atendidos.add(n);
    const lic = licencas.find((l) => normalizar(l.nome) === n);
    itens.push(
      lic
        ? item('licenca', lic.nome, { licencaId: lic.id, sugeridoPor: 'rh' })
        : item('conta', nome, { sugeridoPor: 'rh' })
    );
  }

  for (const grupo of ob?.gruposEmail || []) {
    if (grupo.trim()) itens.push(item('grupo_email', grupo.trim(), { identificador: grupo.trim(), sugeridoPor: 'rh' }));
  }

  itens.push(item('acesso_nexus', 'Login no Nexus (senha provisória)'));

  doCatalogo('equipamento', 'equipamento');
  doCatalogo('acessorio', 'acessorio');

  // Periféricos pedidos pelo RH fora do catálogo: acessório livre
  for (const nome of ob?.perifericos || []) {
    const n = normalizar(nome);
    if (atendidos.has(n)) continue;
    atendidos.add(n);
    itens.push(item('acessorio', nome, { sugeridoPor: 'rh' }));
  }

  for (const t of ativos.filter((x) => x.tipo === 'tarefa' && x.sugeridoOnboarding)) {
    itens.push(item('tarefa', t.nome, { catalogoId: t.id, detalhe: t.descricao }));
  }

  itens.push(item('termo', 'Termo de responsabilidade e entrega'));
  return itens;
}

// -----------------------------------------------------------------------------
// Offboarding
// -----------------------------------------------------------------------------
export function montarOffboarding(
  ticket: Pick<Ticket, 'offboarding' | 'colaboradorId'>,
  inventario: {
    recursos: ColaboradorRecurso[];
    ativos: Pick<Asset, 'id' | 'nome' | 'tag' | 'custodianteId'>[];
    licencas: Pick<SoftwareLicense, 'id' | 'nome' | 'colaboradoresIds'>[];
  },
  nomeDe: (id?: string) => string | undefined = () => undefined
): ProcessoItemRascunho[] {
  const colab = ticket.colaboradorId || ticket.offboarding?.colaboradorId;
  const off = ticket.offboarding;
  const itens: ProcessoItemRascunho[] = [];
  if (!colab) return itens;

  const ativosRec = inventario.recursos.filter((r) => r.colaboradorId === colab && r.status === 'ativo');
  for (const r of ativosRec.filter((x) => x.tipo !== 'acessorio')) {
    itens.push(item('encerrar_recurso', r.nome, { recursoId: r.id, detalhe: r.identificador, catalogoId: r.catalogoId }));
  }
  for (const l of inventario.licencas.filter((x) => x.colaboradoresIds.includes(colab))) {
    itens.push(item('liberar_licenca', l.nome, { licencaId: l.id }));
  }

  const driveDestino = off?.transferirDrive ? nomeDe(off.transferirDriveParaId) : undefined;
  itens.push(
    item('dados_drive', 'Dados do Meu Drive', {
      sugeridoPor: driveDestino ? 'rh' : 'sistema',
      detalhe: driveDestino ? `RH sugere transferir para ${driveDestino}` : 'Definir quem recebe os arquivos',
    })
  );
  const emailDestino = off?.redirecionarEmail ? nomeDe(off.redirecionarEmailParaId) : undefined;
  itens.push(
    item('email', 'Caixa de e-mail', {
      sugeridoPor: emailDestino ? 'rh' : 'sistema',
      detalhe: emailDestino
        ? `RH sugere dar acesso/importar para ${emailDestino}`
        : 'Liberar acesso ao gestor ou importar a caixa',
    })
  );

  for (const a of inventario.ativos.filter((x) => x.custodianteId === colab)) {
    itens.push(item('devolver_equipamento', a.nome, { ativoId: a.id, identificador: a.tag }));
  }
  for (const r of ativosRec.filter((x) => x.tipo === 'acessorio')) {
    itens.push(item('encerrar_recurso', r.nome, { recursoId: r.id, catalogoId: r.catalogoId }));
  }

  itens.push(item('termo', 'Recibo de devolução de equipamentos'));
  return itens;
}

// -----------------------------------------------------------------------------
// Andamento
// -----------------------------------------------------------------------------
export interface Progresso {
  total: number;
  feitos: number;
  naoSeAplica: number;
  pendentes: number;
  percentual: number;
  /** Só o termo pode ficar pendente na conclusão (vira lembrete) */
  podeConcluir: boolean;
  termoPendente: boolean;
}

export function progresso(itens: Pick<ProcessoItem, 'tipo' | 'status'>[]): Progresso {
  const total = itens.length;
  const feitos = itens.filter((i) => i.status === 'feito').length;
  const naoSeAplica = itens.filter((i) => i.status === 'nao_se_aplica').length;
  const pendentes = total - feitos - naoSeAplica;
  const bloqueiam = itens.filter((i) => i.status === 'pendente' && i.tipo !== 'termo').length;
  return {
    total,
    feitos,
    naoSeAplica,
    pendentes,
    percentual: total ? Math.round(((feitos + naoSeAplica) / total) * 100) : 0,
    podeConcluir: total > 0 && bloqueiam === 0,
    termoPendente: itens.some((i) => i.tipo === 'termo' && i.status === 'pendente'),
  };
}

/** Passos que não mexem no inventário e podem voltar para "pendente" */
export function podeReabrir(item: Pick<ProcessoItem, 'tipo' | 'status'>): boolean {
  if (item.status === 'pendente') return false;
  if (item.status === 'nao_se_aplica') return true;
  return ['dados_drive', 'email', 'tarefa', 'termo', 'acesso_nexus'].includes(item.tipo);
}

// -----------------------------------------------------------------------------
// Linhas do termo (modelo RG.TI.001/002 da Qualidade)
// -----------------------------------------------------------------------------
export const SEM_TOMBO = 'S/ nº de tombo';

/** Documento controlado padrão (editável em Configurações > Empresa) */
export const DOC_ENTREGA_PADRAO: ModeloDocumento = {
  codigo: 'RG.TI.001',
  versao: '01',
  referencia: 'POP.TI.013',
  titulo: 'Termo de Responsabilidade e Entrega de Equipamentos',
};
export const DOC_DEVOLUCAO_PADRAO: ModeloDocumento = {
  codigo: 'RG.TI.002',
  versao: '02',
  referencia: 'POP.TI.013',
  titulo: 'Recibo de Devolução de Equipamento para o Setor de T.I.',
};

export function itensDoTermo(
  tipo: 'entrega' | 'devolucao',
  itens: ProcessoItem[],
  ativos: Pick<Asset, 'id' | 'nome' | 'tag' | 'serialNumber' | 'marca' | 'modelo'>[],
  recursos: Pick<ColaboradorRecurso, 'id' | 'tipo'>[] = []
): ItemTermo[] {
  const ativo = (id?: string) => ativos.find((a) => a.id === id);
  const patrimonio = (a?: { tag: string; serialNumber: string }) =>
    a ? [a.tag, a.serialNumber].filter(Boolean).join(' / ') : SEM_TOMBO;
  const marcaModelo = (a?: { marca: string; modelo: string }) =>
    a ? [a.marca, a.modelo].filter(Boolean).join(' ') || undefined : undefined;

  if (tipo === 'entrega') {
    return itens
      .filter((i) => (i.tipo === 'equipamento' || i.tipo === 'acessorio') && i.status === 'feito')
      .map((i) => {
        const a = ativo(i.ativoId);
        return {
          descricao: a?.nome || i.titulo,
          patrimonio: i.tipo === 'equipamento' ? patrimonio(a) : SEM_TOMBO,
          marcaModelo: marcaModelo(a),
          condicao: 'bom',
          situacao: 'entregue',
          observacao: i.observacao,
          ativoId: a?.id,
        } satisfies ItemTermo;
      });
  }

  const ehAcessorio = (i: ProcessoItem) =>
    i.tipo === 'encerrar_recurso' && recursos.find((r) => r.id === i.recursoId)?.tipo === 'acessorio';
  return itens
    .filter((i) => i.tipo === 'devolver_equipamento' || ehAcessorio(i))
    .map((i) => {
      const a = ativo(i.ativoId);
      return {
        descricao: a?.nome || i.titulo,
        patrimonio: i.tipo === 'devolver_equipamento' ? patrimonio(a) : SEM_TOMBO,
        marcaModelo: marcaModelo(a),
        condicao: i.condicao,
        situacao: i.status === 'feito' ? 'devolvido' : i.status === 'nao_se_aplica' ? 'na' : 'pendente',
        observacao: i.observacao,
        ativoId: a?.id,
      } satisfies ItemTermo;
    });
}
