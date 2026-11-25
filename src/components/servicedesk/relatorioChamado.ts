// Fase 10: relatório do chamado para imprimir ou salvar em PDF (janela do navegador).
// Seção 21: admissão e desligamento saem como processo (pedido do RH, checklist com
// quem fez cada passo, anotações), não como chamado de suporte; e a folha não leva
// o cabeçalho/rodapé do navegador (data, "about:blank", página).
import type { Employee, ProcessoItem, Ticket } from '../../types/index.ts';
import { formatDate, formatDateTime, rotuloPrioridade } from '../../utils/formatters.ts';
import { ROTULO_TIPO_CHAMADO, mensagensDaConversa, ROTULO_PAPEL } from '../../utils/conversa.ts';
import {
  formatarTempo,
  rotuloSituacao,
  ROTULO_CAUSA,
  ROTULO_MOTIVO_CANCELAMENTO,
  ROTULO_TIPO_SOLUCAO,
} from '../../utils/atendimento.ts';
import { ROTULO_ESTADO_SLA, type SituacaoSla } from '../../utils/sla.ts';
import { ACAO_DO_TIPO } from '../../utils/processos.ts';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const texto = (s?: string) => (s ? esc(s).replace(/\n/g, '<br>') : '');

/** Dados extras para o relatório de admissão/desligamento */
export interface DadosProcessoRelatorio {
  itens: ProcessoItem[];
  setores: { id: string; nome: string }[];
}

const SITUACAO_PASSO: Record<ProcessoItem['status'], string> = {
  feito: 'Feito',
  nao_se_aplica: 'Não se aplica',
  pendente: 'Pendente',
};

/** Monta o HTML do relatório (notas internas só entram para a T.I.) */
export function htmlRelatorio(
  t: Ticket,
  employees: Employee[],
  incluirNotas: boolean,
  sla?: SituacaoSla | null,
  processo?: DadosProcessoRelatorio
): string {
  const nome = (id?: string) => employees.find((e) => e.id === id)?.nome || '';
  const r = t.resolucao;
  const c = t.cancelamento;
  const mensagens = mensagensDaConversa(t, incluirNotas);
  const ehProcesso = t.tipo === 'onboarding' || t.tipo === 'offboarding';
  const ob = t.onboarding;
  const off = t.offboarding;
  const setor = (id?: string) => processo?.setores.find((s) => s.id === id)?.nome || '';

  const linha = (rotulo: string, valor?: string) =>
    valor ? `<tr><th>${esc(rotulo)}</th><td>${valor}</td></tr>` : '';

  // ---- Processo: pessoa, pedido do RH e checklist ----
  const pessoaId = t.colaboradorId || off?.colaboradorId;
  const pessoa = employees.find((e) => e.id === pessoaId);
  const blocoProcesso = !ehProcesso
    ? ''
    : `
<h2>${t.tipo === 'onboarding' ? 'Admissão' : 'Desligamento'}</h2>
<table>
${linha('Pessoa', esc(pessoa?.nome || ob?.nomeColaborador || ''))}
${linha('Cargo', esc(pessoa?.cargo || ob?.cargo || ''))}
${linha('Setor', esc(setor(pessoa?.setorId || ob?.setorId)))}
${t.tipo === 'onboarding' ? linha('Início', ob?.dataAdmissao ? esc(formatDate(ob.dataAdmissao)) : undefined) : linha('Último dia', off?.dataDesligamento ? esc(formatDate(off.dataDesligamento)) : undefined)}
${linha('Pedido por', `${esc(t.solicitanteNome)} em ${esc(formatDateTime(t.dataCriacao))}`)}
</table>

<h2>Pedido do RH</h2>
<table>
${
  ob
    ? [
        linha('E-mail', esc(ob.emailColaborador)),
        linha('Gestor', ob.gestorId ? esc(nome(ob.gestorId)) : undefined),
        linha('Equipamento', ob.tipoComputador?.trim() ? esc(ob.tipoComputador) : undefined),
        linha('Kit', ob.perifericos.length ? esc(ob.perifericos.join(', ')) : undefined),
        linha('Acessos', ob.acessosSoftwares.length ? esc(ob.acessosSoftwares.join(', ')) : undefined),
        linha('Grupos de e-mail', ob.gruposEmail?.length ? esc(ob.gruposEmail.join(', ')) : undefined),
        linha('Observações', texto(ob.observacoes)),
      ].join('')
    : ''
}
${
  off
    ? [
        linha('E-mail', off.redirecionarEmail ? `redirecionar para ${esc(nome(off.redirecionarEmailParaId) || 'outra pessoa')}` : 'encerrar'),
        linha('Arquivos (drive)', off.transferirDrive ? `transferir para ${esc(nome(off.transferirDriveParaId) || 'outra pessoa')}` : 'não transferir'),
        linha('Recolhimento', texto(off.recolhimentoInstrucoes)),
        linha('Observações', texto(off.observacoes)),
      ].join('')
    : ''
}
</table>

<h2>Checklist</h2>
${
  processo && processo.itens.length
    ? `<table class="grade"><thead><tr><th>Passo</th><th>Situação</th><th>Quem e quando</th><th>Registro</th></tr></thead><tbody>
${[...processo.itens]
  .sort((a, b) => a.ordem - b.ordem)
  .map(
    (i) => `<tr><td><strong>${esc(i.titulo)}</strong><br><span class="meta">${esc(ACAO_DO_TIPO[i.tipo] || '')}</span></td>
<td>${esc(SITUACAO_PASSO[i.status])}</td>
<td>${i.status !== 'pendente' ? `${esc(nome(i.concluidoPor) || 'T.I.')}${i.concluidoEm ? `<br><span class="meta">${esc(formatDateTime(i.concluidoEm))}</span>` : ''}` : '—'}</td>
<td>${[i.identificador, i.observacao].filter(Boolean).map((x) => esc(x as string)).join(' · ') || ''}</td></tr>`
  )
  .join('')}
</tbody></table>`
    : off?.checklist.length
      ? `<table class="grade"><tbody>${off.checklist
          .map((i) => `<tr><td>${esc(i.texto)}</td><td>${i.concluido ? 'Feito' : 'Pendente'}</td></tr>`)
          .join('')}</tbody></table>`
      : '<p class="meta">Checklist ainda não montado.</p>'
}
${t.anotacoesProcesso?.trim() ? `<h2>Anotações do processo</h2><div class="caixa">${texto(t.anotacoesProcesso)}</div>` : ''}`;

  // A folha não leva o cabeçalho/rodapé do navegador (@page sem margem); a margem
  // vem de dentro: espaços repetidos em cada página (thead/tfoot) e nas laterais.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(t.codigo)} · ${esc(t.titulo)}</title>
<style>
  body{font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;margin:32px auto;max-width:780px;padding:0 16px}
  h1{font-size:20px;margin:4px 0 2px} h2{font-size:14px;margin:22px 0 6px;border-bottom:1px solid #cbd5e1;padding-bottom:4px}
  .meta{color:#475569;font-size:12px} table{border-collapse:collapse;width:100%} th{text-align:left;color:#475569;font-weight:600;width:170px;vertical-align:top;padding:3px 8px 3px 0} td{padding:3px 0;vertical-align:top}
  table.grade th{width:auto;border-bottom:1px solid #cbd5e1;padding:4px 8px 4px 0} table.grade td{border-bottom:1px solid #e2e8f0;padding:5px 8px 5px 0}
  .caixa{border:1px solid #cbd5e1;border-radius:6px;padding:10px 12px} .ok{border-color:#6ee7b7;background:#ecfdf5}
  .msg{margin:8px 0;padding:8px 10px;border-left:3px solid #cbd5e1} .nota{border-color:#f59e0b;background:#fffbeb}
  table.folha,table.folha>tbody>tr>td{border:0;padding:0}
  .respiro{height:14mm}
  @page{size:A4;margin:0}
  @media screen{.respiro{display:none}}
  @media print{body{margin:0;max-width:none;padding:0 16mm} h2{break-after:avoid} .caixa,.msg,tr{break-inside:avoid}}
</style></head><body>
<table class="folha"><thead><tr><td><div class="respiro"></div></td></tr></thead><tfoot><tr><td><div class="respiro"></div></td></tr></tfoot><tbody><tr><td>
<div class="meta">${esc(t.codigo)} · ${esc(ROTULO_TIPO_CHAMADO[t.tipo])} · ${esc(t.categoria)}</div>
<h1>${esc(t.titulo)}</h1>
<div class="meta">Emitido em ${esc(formatDateTime(new Date().toISOString()))}</div>

<h2>${ehProcesso ? 'Situação' : 'Dados do chamado'}</h2>
<table>
${linha('Situação', esc(rotuloSituacao(t)))}
${ehProcesso ? '' : linha('Prioridade', esc(rotuloPrioridade(t.prioridade)))}
${ehProcesso ? '' : linha('Aberto por', `${esc(t.solicitanteNome)} (${esc(t.solicitanteSetorNome)}) em ${esc(formatDateTime(t.dataCriacao))}`)}
${linha('Técnico', esc(t.tecnicoResponsavelNome || 'não atribuído'))}
${linha('Software', t.softwareNome ? esc(t.softwareNome) : undefined)}
${linha('Reaberturas', t.reaberturas ? String(t.reaberturas) : undefined)}
${linha('Prazo de solução', sla ? `${esc(ROTULO_ESTADO_SLA[sla.solucao.estado])} (até ${esc(formatDateTime(sla.solucao.vence.toISOString()))})` : undefined)}
${linha('1ª resposta', sla ? (sla.resposta.respondidaEm ? `${sla.resposta.atrasada ? 'fora do prazo' : 'no prazo'}, ${esc(formatDateTime(sla.resposta.respondidaEm.toISOString()))}` : 'sem resposta registrada') : undefined)}
</table>

${ehProcesso ? blocoProcesso : `<h2>Problema relatado</h2>\n<div class="caixa">${texto(t.descricao)}</div>`}

${
  r
    ? `<h2>Resolução</h2><div class="caixa ok"><table>
${linha('Causa', esc(ROTULO_CAUSA[r.causa]))}
${linha('Tipo de solução', esc(ROTULO_TIPO_SOLUCAO[r.tipo]))}
${linha('Solução aplicada', texto(r.solucao))}
${linha('Próximo passo', texto(r.proximoPasso))}
${linha('Tempo gasto', r.tempoMin !== undefined ? esc(formatarTempo(r.tempoMin)) : undefined)}
${linha('Registrada por', r.resolvidoPor ? `${esc(nome(r.resolvidoPor))}${r.resolvidoEm ? ` em ${esc(formatDateTime(r.resolvidoEm))}` : ''}` : undefined)}
${linha('Avaliação de quem abriu', t.avaliacao ? `${t.avaliacao.nota} de 5${t.avaliacao.comentario ? ` — ${esc(t.avaliacao.comentario)}` : ''}` : undefined)}
</table></div>`
    : ''
}
${
  c
    ? `<h2>Cancelamento</h2><div class="caixa"><table>
${linha('Motivo', esc(ROTULO_MOTIVO_CANCELAMENTO[c.motivo]))}
${linha('Detalhe', texto(c.detalhe))}
${linha('Cancelado por', c.canceladoPor ? esc(nome(c.canceladoPor)) : undefined)}
</table></div>`
    : ''
}

<h2>${ehProcesso ? 'Conversa com o RH' : 'Atendimento'}</h2>
${
  mensagens.length
    ? mensagens
        .map(
          (m) => `<div class="msg${m.ehNotaInterna ? ' nota' : ''}"><strong>${esc(m.autorNome)}</strong>
 · ${esc(ROTULO_PAPEL[m.autorRole] || '')} · ${esc(formatDateTime(m.data))}${m.ehNotaInterna ? ' · <em>nota interna</em>' : ''}<br>${texto(m.texto)}</div>`
        )
        .join('')
    : '<p class="meta">Sem mensagens.</p>'
}
</td></tr></tbody></table>
</body></html>`;
}

export function imprimirRelatorio(
  t: Ticket,
  employees: Employee[],
  incluirNotas: boolean,
  sla?: SituacaoSla | null,
  processo?: DadosProcessoRelatorio
) {
  const janela = window.open('', '_blank');
  if (!janela) return;
  janela.opener = null;
  janela.document.write(htmlRelatorio(t, employees, incluirNotas, sla, processo));
  janela.document.close();
  // A política de segurança do site não permite script dentro do relatório: imprime daqui
  janela.focus();
  janela.print();
}
