import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { TicketPriority } from '../../types/index.ts';
import { rotuloPrioridade } from '../../utils/formatters.ts';
import { HORA_FIM, HORA_INICIO, MINUTOS_DIA_UTIL, PRAZOS_PADRAO, prazosEfetivos, type PrazosSla } from '../../utils/sla.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';

const PRIORIDADES: TicketPriority[] = ['critica', 'alta', 'media', 'baixa'];

/** Minutos úteis ↔ horas (com vírgula) para editar */
const emHoras = (min: number) => String(Math.round((min / 60) * 100) / 100).replace('.', ',');
const deHoras = (txt: string) => Math.round(Number(txt.replace(',', '.')) * 60);

/** Fase 10 C1: prazos de atendimento por prioridade (só o administrador de T.I. grava) */
export const PrazosSettings: React.FC = () => {
  const { settings, updateSettings, currentRole } = useApp();
  const atuais = prazosEfetivos(settings.sla);
  const [rascunho, setRascunho] = useState<Record<TicketPriority, { resposta: string; solucao: string }>>(() =>
    Object.fromEntries(
      PRIORIDADES.map((p) => [p, { resposta: emHoras(atuais[p].resposta), solucao: emHoras(atuais[p].solucao) }])
    ) as Record<TicketPriority, { resposta: string; solucao: string }>
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const podeEditar = currentRole === 'ti_admin';

  // Os prazos gravados mudaram (carga do banco, outra aba, gravação recusada): a tela acompanha
  const base = JSON.stringify(atuais);
  const [baseVista, setBaseVista] = useState(base);
  if (baseVista !== base) {
    setBaseVista(base);
    setRascunho(
      Object.fromEntries(
        PRIORIDADES.map((p) => [p, { resposta: emHoras(atuais[p].resposta), solucao: emHoras(atuais[p].solucao) }])
      ) as Record<TicketPriority, { resposta: string; solucao: string }>
    );
  }

  const alterado = PRIORIDADES.some(
    (p) => deHoras(rascunho[p].resposta) !== atuais[p].resposta || deHoras(rascunho[p].solucao) !== atuais[p].solucao
  );
  useRegistrarPendencias('prazos-sla', alterado ? ['Prazos de atendimento não salvos'] : []);

  const mudar = (p: TicketPriority, campo: 'resposta' | 'solucao', v: string) => {
    setSalvo(false);
    setRascunho((r) => ({ ...r, [p]: { ...r[p], [campo]: v } }));
  };

  const salvar = () => {
    const sla = {} as PrazosSla;
    for (const p of PRIORIDADES) {
      const resposta = deHoras(rascunho[p].resposta);
      const solucao = deHoras(rascunho[p].solucao);
      if (!Number.isFinite(resposta) || !Number.isFinite(solucao) || resposta <= 0 || solucao <= 0) {
        return setErro(`Prioridade ${rotuloPrioridade(p).toLowerCase()}: use números maiores que zero.`);
      }
      if (resposta > solucao) {
        return setErro(`Prioridade ${rotuloPrioridade(p).toLowerCase()}: a 1ª resposta não pode vir depois da solução.`);
      }
      sla[p] = { resposta, solucao };
    }
    setErro(null);
    updateSettings({ sla });
    setSalvo(true);
  };

  const padrao = () => {
    setSalvo(false);
    setRascunho(
      Object.fromEntries(
        PRIORIDADES.map((p) => [p, { resposta: emHoras(PRAZOS_PADRAO[p].resposta), solucao: emHoras(PRAZOS_PADRAO[p].solucao) }])
      ) as Record<TicketPriority, { resposta: string; solucao: string }>
    );
  };

  return (
    <div className="cartao p-4 space-y-4">
      <div>
        <h3 className="secao-titulo">Prazos de atendimento</h3>
        <p className="ajuda">
          Em horas úteis: segunda a sexta, das {HORA_INICIO}h às {HORA_FIM}h ({MINUTOS_DIA_UTIL / 60} horas = 1 dia útil). "Aguardando"
          pausa o prazo de solução. Valem para chamados de suporte.
        </p>
      </div>

      <table className="w-full max-w-xl">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-2 font-semibold">Prioridade</th>
            <th className="py-2 font-semibold">1ª resposta (h)</th>
            <th className="py-2 font-semibold">Solução (h)</th>
          </tr>
        </thead>
        <tbody>
          {PRIORIDADES.map((p) => (
            <tr key={p} className="border-t border-slate-100">
              <td className="py-2 font-semibold text-slate-800">{rotuloPrioridade(p)}</td>
              {(['resposta', 'solucao'] as const).map((campo) => (
                <td key={campo} className="py-2 pr-3">
                  <input
                    inputMode="decimal"
                    aria-label={`${rotuloPrioridade(p)}: ${campo === 'resposta' ? '1ª resposta' : 'solução'} em horas`}
                    value={rascunho[p][campo]}
                    disabled={!podeEditar}
                    onChange={(e) => mudar(p, campo, e.target.value)}
                    className="campo campo-sm w-24"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {erro && <p role="alert" className="erro">{erro}</p>}
      {salvo && !alterado && <p className="text-emerald-700">Prazos salvos.</p>}
      {podeEditar && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={salvar}
            disabled={!alterado}
            className="btn btn-primario"
          >
            Salvar prazos
          </button>
          <button type="button" onClick={padrao} className="btn btn-secundario">
            Voltar ao padrão
          </button>
        </div>
      )}
    </div>
  );
};
