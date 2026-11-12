import React, { useId, useState } from 'react';
import { ExternalLink, Key, Laptop, User, Wrench } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Ticket } from '../../types/index.ts';
import { formatDate } from '../../utils/formatters.ts';
import { nomeContrato } from '../../utils/contratos.ts';
import { ROTULO_STATUS_MANUTENCAO, ROTULO_TIPO_MANUTENCAO, podeEnviarParaManutencao } from '../../utils/cicloVida.ts';
import {
  contratosDaLicenca,
  equipamentosDaPessoa,
  licencasDaPessoa,
  podeAbrirFicha,
  primeiroDaPessoa,
  rotuloPessoa,
  type CampoVinculo,
  type RascunhoVinculos,
} from '../../utils/vinculos.ts';

const CAMPO = 'w-full text-xs bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900';
const LINK = 'inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline text-left break-words';

interface VinculosChamadoProps {
  ticket: Ticket;
  rascunho: RascunhoVinculos;
  onMudar: (campo: CampoVinculo, valor: string) => void;
}

/**
 * Fase 9: equipamento, software/licença e colaborador relacionado do chamado.
 * Cada vínculo abre a ficha por cima do chamado (fechar volta para cá). A T.I.
 * altera os vínculos como rascunho, gravado no "Salvar alterações" do chamado.
 */
export const VinculosChamado: React.FC<VinculosChamadoProps> = ({ ticket, rascunho, onMudar }) => {
  const { assets, licenses, employees, fornecedores, contratos, currentRole, currentUser, abrirFicha } = useApp();
  const id = useId();
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const [editando, setEditando] = useState(false);

  const ativoId = rascunho.ativoId ?? (ticket.ativoId || '');
  const softwareId = rascunho.softwareId ?? (ticket.softwareId || '');
  const colaboradorId = rascunho.colaboradorId ?? (ticket.colaboradorId || '');
  const mexeu = rascunho.ativoId !== null || rascunho.softwareId !== null || rascunho.colaboradorId !== null;
  const processo = ticket.tipo !== 'suporte';

  const ativo = assets.find((a) => a.id === ativoId);
  const licenca = licenses.find((l) => l.id === softwareId);
  // Software que o perfil não enxerga (ou removido): mostra o nome guardado no chamado
  const nomeSoftware = licenca?.nome || (softwareId && softwareId === ticket.softwareId ? ticket.softwareNome : undefined);
  const colaborador = employees.find((e) => e.id === colaboradorId);

  // As listas mostram primeiro o que é da pessoa: o colaborador relacionado ou, sem ele, quem abriu
  const pessoaRef = colaboradorId || ticket.solicitanteId;
  const primeiroNome = (employees.find((e) => e.id === pessoaRef)?.nome || ticket.solicitanteNome).split(' ')[0];
  const opcoesAtivo = primeiroDaPessoa(
    assets.filter((a) => a.status !== 'descartado' || a.id === ativoId),
    equipamentosDaPessoa(assets, pessoaRef)
  );
  const opcoesSoftware = primeiroDaPessoa(licenses, licencasDaPessoa(licenses, pessoaRef));
  const opcoesPessoa = employees
    .filter((e) => e.status !== 'desligado' || e.id === colaboradorId)
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const pode = (tipo: 'ativo' | 'colaborador' | 'software', ctx: { custodianteId?: string; colaboradorId?: string } = {}) =>
    podeAbrirFicha(currentRole, tipo, { meuId: currentUser?.id, ...ctx });

  const contrato = licenca ? contratosDaLicenca(licenca.id, contratos)[0] : undefined;
  const fornecedorSoftware = licenca
    ? fornecedores.find((f) => f.id === licenca.fornecedorId)?.nome || licenca.fornecedor
    : undefined;

  // Manutenções abertas a partir deste chamado (a T.I. é quem recebe o histórico)
  const manutencoes = isTI
    ? assets.flatMap((a) => (a.historicoManutencao || []).filter((m) => m.chamadoId === ticket.id).map((m) => ({ m, a })))
    : [];
  const podeMandarParaManutencao =
    isTI && !!ativo && ativo.id === ticket.ativoId && rascunho.ativoId === null && podeEnviarParaManutencao(ativo);

  const vazio = !ativo && !nomeSoftware && !colaborador && manutencoes.length === 0;
  if (vazio && !isTI) return null;

  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase font-bold text-slate-500 tracking-wide">Vínculos</span>
        {isTI && (
          <button
            type="button"
            onClick={() => setEditando((v) => !v)}
            className="text-xs font-medium text-blue-700 hover:underline"
            aria-expanded={editando || mexeu}
          >
            {editando || mexeu ? 'Ocultar campos' : 'Alterar'}
          </button>
        )}
      </div>

      {isTI && (editando || mexeu) && (
        <div className="space-y-2.5 p-3 rounded-md bg-slate-50 border border-slate-200">
          {!processo && (
            <div>
              <label htmlFor={`${id}-pessoa`} className="text-xs font-medium text-slate-700 block mb-1">
                Colaborador relacionado
              </label>
              <select
                id={`${id}-pessoa`}
                value={colaboradorId}
                onChange={(e) => onMudar('colaboradorId', e.target.value)}
                className={CAMPO}
              >
                <option value="">— nenhum (só o solicitante) —</option>
                {opcoesPessoa.map((e) => (
                  <option key={e.id} value={e.id}>
                    {rotuloPessoa(e)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor={`${id}-ativo`} className="text-xs font-medium text-slate-700 block mb-1">
              Equipamento
            </label>
            <select id={`${id}-ativo`} value={ativoId} onChange={(e) => onMudar('ativoId', e.target.value)} className={CAMPO}>
              <option value="">— nenhum —</option>
              {opcoesAtivo.daPessoa.length > 0 && (
                <optgroup label={`Com ${primeiroNome}`}>
                  {opcoesAtivo.daPessoa.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.tag} · {a.nome}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Demais equipamentos">
                {opcoesAtivo.demais.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag} · {a.nome}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-software`} className="text-xs font-medium text-slate-700 block mb-1">
              Software / licença
            </label>
            <select
              id={`${id}-software`}
              value={softwareId}
              onChange={(e) => onMudar('softwareId', e.target.value)}
              className={CAMPO}
            >
              <option value="">— nenhum —</option>
              {opcoesSoftware.daPessoa.length > 0 && (
                <optgroup label={`Licenças de ${primeiroNome}`}>
                  {opcoesSoftware.daPessoa.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Demais softwares">
                {opcoesSoftware.demais.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <p className="text-xs text-slate-500">As mudanças são gravadas em “Salvar alterações”.</p>
        </div>
      )}

      {vazio && <p className="text-xs text-slate-500">Nenhum equipamento, software ou colaborador ligado.</p>}

      {colaborador && (
        <div className="flex items-start gap-2">
          <User className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <span className="text-xs text-slate-500 block">
              {processo ? (ticket.tipo === 'onboarding' ? 'Pessoa admitida' : 'Pessoa desligada') : 'Colaborador relacionado'}
            </span>
            {pode('colaborador', { colaboradorId: colaborador.id }) ? (
              <button type="button" onClick={() => abrirFicha({ tipo: 'colaborador', id: colaborador.id })} className={LINK}>
                {colaborador.nome}
                <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
              </button>
            ) : (
              <span className="font-semibold text-slate-900">{colaborador.nome}</span>
            )}
            <p className="text-xs text-slate-500">{colaborador.cargo}</p>
          </div>
        </div>
      )}

      {ativo && (
        <div className="flex items-start gap-2">
          <Laptop className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 block">Equipamento</span>
            {pode('ativo', { custodianteId: ativo.custodianteId }) ? (
              <button type="button" onClick={() => abrirFicha({ tipo: 'ativo', id: ativo.id })} className={LINK}>
                <span className="font-mono">{ativo.tag}</span> · {ativo.nome}
                <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
              </button>
            ) : (
              <span className="font-semibold text-slate-900">
                <span className="font-mono">{ativo.tag}</span> · {ativo.nome}
              </span>
            )}
            <p className="text-xs text-slate-500 break-words">
              {ativo.marca} {ativo.modelo} · S/N: <span className="font-mono">{ativo.serialNumber}</span>
            </p>
            {ativo.status === 'manutencao' && (
              <span className="inline-block mt-1 px-1.5 py-0.5 rounded border text-xs font-medium text-amber-800 bg-amber-50 border-amber-200">
                Em manutenção
              </span>
            )}
            {podeMandarParaManutencao && (
              <button
                type="button"
                onClick={() => abrirFicha({ tipo: 'ativo', id: ativo.id, manutencaoDoChamado: ticket.id })}
                className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100"
              >
                <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                {ativo.status === 'manutencao' ? 'Registrar manutenção' : 'Enviar para manutenção'}
              </button>
            )}
          </div>
        </div>
      )}

      {nomeSoftware && (
        <div className="flex items-start gap-2">
          <Key className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <span className="text-xs text-slate-500 block">Software / licença</span>
            {licenca && pode('software') ? (
              <button type="button" onClick={() => abrirFicha({ tipo: 'software', id: licenca.id })} className={LINK}>
                {licenca.nome}
                <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
              </button>
            ) : (
              <span className="font-semibold text-slate-900">{nomeSoftware}</span>
            )}
            {isTI && fornecedorSoftware && <p className="text-xs text-slate-600">Fornecedor: {fornecedorSoftware}</p>}
            {isTI && licenca && (
              <p className="text-xs text-slate-600 break-words">
                {contrato ? (
                  <>
                    Contrato vigente: {nomeContrato(contrato)}
                    {contrato.fim && ` (até ${formatDate(contrato.fim)})`}
                    {contrato.contatoSuporte && <> · Suporte: {contrato.contatoSuporte}</>}
                  </>
                ) : (
                  'Sem contrato vigente cadastrado.'
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {manutencoes.length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-1.5">
          <span className="text-xs text-slate-500 block">Manutenções abertas por este chamado</span>
          {manutencoes.map(({ m, a }) => (
            <button
              key={m.id}
              type="button"
              onClick={() => abrirFicha({ tipo: 'ativo', id: a.id })}
              className="w-full text-left flex flex-wrap items-center gap-x-1.5 text-xs text-slate-700 hover:text-blue-700"
            >
              <Wrench className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span className="font-mono font-semibold">{a.tag}</span>
              <span>· {ROTULO_TIPO_MANUTENCAO[m.tipo]}</span>
              <span>· {ROTULO_STATUS_MANUTENCAO[m.status]}</span>
              <span className="text-slate-500">· {formatDate(m.abertaEm)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
