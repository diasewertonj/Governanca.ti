// Fase 10: relatório do chamado para imprimir ou salvar em PDF (janela do navegador).
import type { Employee, Ticket } from '../../types/index.ts';
import { formatDateTime, rotuloPrioridade } from '../../utils/formatters.ts';
import { ROTULO_TIPO_CHAMADO, mensagensDaConversa, ROTULO_PAPEL } from '../../utils/conversa.ts';
import {
  formatarTempo,
  rotuloSituacao,
  ROTULO_CAUSA,
  ROTULO_MOTIVO_CANCELAMENTO,
  ROTULO_TIPO_SOLUCAO,
} from '../../utils/atendimento.ts';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const texto = (s?: string) => (s ? esc(s).replace(/\n/g, '<br>') : '');

/** Monta o HTML do relatório (notas internas só entram para a T.I.) */
export function htmlRelatorio(t: Ticket, employees: Employee[], incluirNotas: boolean): string {
  const nome = (id?: string) => employees.find((e) => e.id === id)?.nome || '';
  const r = t.resolucao;
  const c = t.cancelamento;
  const mensagens = mensagensDaConversa(t, incluirNotas);

  const linha = (rotulo: string, valor?: string) =>
    valor ? `<tr><th>${esc(rotulo)}</th><td>${valor}</td></tr>` : '';

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(t.codigo)} · ${esc(t.titulo)}</title>
<style>
  body{font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;margin:32px;max-width:780px}
  h1{font-size:20px;margin:4px 0 2px} h2{font-size:14px;margin:22px 0 6px;border-bottom:1px solid #cbd5e1;padding-bottom:4px}
  .meta{color:#475569;font-size:12px} table{border-collapse:collapse;width:100%} th{text-align:left;color:#475569;font-weight:600;width:170px;vertical-align:top;padding:3px 8px 3px 0} td{padding:3px 0}
  .caixa{border:1px solid #cbd5e1;border-radius:6px;padding:10px 12px} .ok{border-color:#6ee7b7;background:#ecfdf5}
  .msg{margin:8px 0;padding:8px 10px;border-left:3px solid #cbd5e1} .nota{border-color:#f59e0b;background:#fffbeb}
  @media print{body{margin:12mm}}
</style></head><body>
<div class="meta">${esc(t.codigo)} · ${esc(ROTULO_TIPO_CHAMADO[t.tipo])} · ${esc(t.categoria)}</div>
<h1>${esc(t.titulo)}</h1>
<div class="meta">Emitido em ${esc(formatDateTime(new Date().toISOString()))}</div>

<h2>Dados do chamado</h2>
<table>
${linha('Situação', esc(rotuloSituacao(t)))}
${linha('Prioridade', esc(rotuloPrioridade(t.prioridade)))}
${linha('Aberto por', `${esc(t.solicitanteNome)} (${esc(t.solicitanteSetorNome)}) em ${esc(formatDateTime(t.dataCriacao))}`)}
${linha('Técnico', esc(t.tecnicoResponsavelNome || 'não atribuído'))}
${linha('Software', t.softwareNome ? esc(t.softwareNome) : undefined)}
${linha('Reaberturas', t.reaberturas ? String(t.reaberturas) : undefined)}
</table>

<h2>Problema relatado</h2>
<div class="caixa">${texto(t.descricao)}</div>

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

<h2>Atendimento</h2>
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
</body></html>`;
}

export function imprimirRelatorio(t: Ticket, employees: Employee[], incluirNotas: boolean) {
  const janela = window.open('', '_blank');
  if (!janela) return;
  janela.opener = null;
  janela.document.write(htmlRelatorio(t, employees, incluirNotas));
  janela.document.close();
  // A política de segurança do site não permite script dentro do relatório: imprime daqui
  janela.focus();
  janela.print();
}
