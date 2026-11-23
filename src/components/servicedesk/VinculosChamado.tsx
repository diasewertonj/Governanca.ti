import React, { useId, useState } from 'react';
import { ExternalLink, Key, Laptop, Phone, User, Wrench } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
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

const LINK = 'link inline-flex items-center gap-1 text-left break-words';

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
export const VinculosChamado: React.FC<VinculosChamadoProps & { embutido?: boolean }> = ({ ticket, rascunho, onMudar, embutido }) => {
  const { assets, licenses, employees, fornecedores, contratos, currentRole, currentUser, abrirFicha, processoItens } = useApp();
  const id = useId();
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const [editando, setEditando] = useState(false);

  const ativoId = rascunho.ativoId ?? (ticket.ativoId || '');
  const softwareId = rascunho.softwareId ?? (ticket.softwareId || '');
  const colaboradorId = rascunho.colaboradorId ?? (ticket.colaboradorId || '');
  const linhaId = rascunho.linhaId ?? (ticket.linhaId || '');
  const mexeu = rascunho.ativoId !== null || rascunho.softwareId !== null || rascunho.colaboradorId !== null || rascunho.linhaId !== null;
  // Linhas telefônicas: só a T.I. tem a lista (as demais pessoas veem o número guardado no vínculo)
  const { linhas } = useRecursos();
  const linha = linhas.find((l) => l.id === linhaId);
  const opcoesLinha = linhas
    .filter((l) => l.status !== 'cancelada' || l.id === linhaId)
    .sort((a, b) => Number(b.colaboradorId === (rascunho.colaboradorId ?? ticket.colaboradorId ?? ticket.solicitanteId)) - Number(a.colaboradorId === (rascunho.colaboradorId ?? ticket.colaboradorId ?? ticket.solicitanteId)));
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

  // Admissão/desligamento: equipamento e licenças vêm do checklist (só leitura aqui)
  const entregues = processo ? processoItens.filter((i) => i.chamadoId === ticket.id && i.status === 'feito') : [];
  const ativosEntregues = [...new Set(entregues.flatMap((i) => (i.ativoId ? [i.ativoId] : [])))]
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a);
  const licencasEntregues = [...new Set(entregues.flatMap((i) => (i.licencaId ? [i.licencaId] : [])))]
    .map((id) => licenses.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => !!l);
  const podeAlterar = isTI && !processo;
  const nomeCurto = (id?: string) => employees.find((e) => e.id === id)?.nome.split(' ')[0];
  const rotuloOpcaoAtivo = (a: (typeof assets)[number]) =>
    `${a.tag} · ${a.nome}${a.custodianteId && a.custodianteId !== pessoaRef ? ` (com ${nomeCurto(a.custodianteId) || 'outra pessoa'})` : ''}`;
  const demaisEstoque = opcoesAtivo.demais.filter((a) => !a.custodianteId);
  const demaisComOutros = opcoesAtivo.demais.filter((a) => a.custodianteId);

  const vazio =
    !ativo && !nomeSoftware && !colaborador && !linhaId && manutencoes.length === 0 && !ativosEntregues.length && !licencasEntregues.length;
  if (vazio && !isTI) return null;

  return (
    // embutido: faixa fina no topo do chamado (sem cartão; itens lado a lado)
    <section aria-label="Vínculos" className={embutido ? 'space-y-2' : 'cartao p-4 space-y-3'}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="secao-titulo">Vínculos</h3>
        {podeAlterar && (
          <button
            type="button"
            onClick={() => setEditando((v) => !v)}
            className="link"
            aria-expanded={editando || mexeu}
          >
            {editando || mexeu ? 'Ocultar campos' : 'Alterar'}
          </button>
        )}
      </div>

      {podeAlterar && (editando || mexeu) && (
        <div className={embutido ? 'grid gap-2 border-b border-slate-100 pb-2 md:grid-cols-3' : 'space-y-3 border-b border-slate-100 pb-3'}>
          {!processo && (
            <div>
              <label htmlFor={`${id}-pessoa`} className="rotulo">
                Colaborador relacionado
              </label>
              <select
                id={`${id}-pessoa`}
                value={colaboradorId}
                onChange={(e) => onMudar('colaboradorId', e.target.value)}
                className="campo"
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
            <label htmlFor={`${id}-ativo`} className="rotulo">
              Equipamento
            </label>
            <select id={`${id}-ativo`} value={ativoId} onChange={(e) => onMudar('ativoId', e.target.value)} className="campo">
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
              {demaisEstoque.length > 0 && (
                <optgroup label="Em estoque">
                  {demaisEstoque.map((a) => (
                    <option key={a.id} value={a.id}>
                      {rotuloOpcaoAtivo(a)}
                    </option>
                  ))}
                </optgroup>
              )}
              {demaisComOutros.length > 0 && (
                <optgroup label="Com outras pessoas">
                  {demaisComOutros.map((a) => (
                    <option key={a.id} value={a.id}>
                      {rotuloOpcaoAtivo(a)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-software`} className="rotulo">
              Software / licença
            </label>
            <select
              id={`${id}-software`}
              value={softwareId}
              onChange={(e) => onMudar('softwareId', e.target.value)}
              className="campo"
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
          {opcoesLinha.length > 0 && (
            <div>
              <label htmlFor={`${id}-linha`} className="rotulo">
                Linha telefônica
              </label>
              <select id={`${id}-linha`} value={linhaId} onChange={(e) => onMudar('linhaId', e.target.value)} className="campo">
                <option value="">— nenhuma —</option>
                {opcoesLinha.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.numero}
                    {l.colaboradorId ? ` · ${employees.find((e) => e.id === l.colaboradorId)?.nome || 'com alguém'}` : ' · sem pessoa'}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className={embutido ? 'ajuda md:col-span-3' : 'ajuda'}>As mudanças são gravadas em “Salvar alterações”.</p>
        </div>
      )}

      <div className={embutido ? 'flex flex-wrap items-start gap-x-8 gap-y-2' : 'space-y-3'}>
      {vazio && (
        <p className="texto-aux">
          {processo
            ? 'O equipamento e as licenças aparecem aqui quando o checklist os entregar.'
            : 'Nenhum equipamento, software ou colaborador ligado.'}
        </p>
      )}

      {(ativosEntregues.length > 0 || licencasEntregues.length > 0) && (
        <div className="space-y-2">
          <span className="texto-aux block">Entregue pelo checklist</span>
          {ativosEntregues.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <Laptop className="ico text-slate-500" aria-hidden="true" />
              {pode('ativo', { custodianteId: a.custodianteId }) ? (
                <button type="button" onClick={() => abrirFicha({ tipo: 'ativo', id: a.id })} className={LINK}>
                  <span className="font-mono">{a.tag}</span> · {a.nome}
                  <ExternalLink className="ico-sm" aria-hidden="true" />
                </button>
              ) : (
                <span className="font-semibold text-slate-900">{a.tag} · {a.nome}</span>
              )}
            </div>
          ))}
          {licencasEntregues.map((l) => (
            <div key={l.id} className="flex items-center gap-2">
              <Key className="ico text-slate-500" aria-hidden="true" />
              {pode('software') ? (
                <button type="button" onClick={() => abrirFicha({ tipo: 'software', id: l.id })} className={LINK}>
                  {l.nome}
                  <ExternalLink className="ico-sm" aria-hidden="true" />
                </button>
              ) : (
                <span className="font-semibold text-slate-900">{l.nome}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {colaborador && (
        <div className="flex items-start gap-2">
          <User className="ico text-slate-500 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <span className="texto-aux block">
              {processo ? (ticket.tipo === 'onboarding' ? 'Pessoa admitida' : 'Pessoa desligada') : 'Colaborador relacionado'}
            </span>
            {pode('colaborador', { colaboradorId: colaborador.id }) ? (
              <button type="button" onClick={() => abrirFicha({ tipo: 'colaborador', id: colaborador.id })} className={LINK}>
                {colaborador.nome}
                <ExternalLink className="ico-sm" aria-hidden="true" />
              </button>
            ) : (
              <span className="font-semibold text-slate-900">{colaborador.nome}</span>
            )}
            <p className="texto-aux">{colaborador.cargo}</p>
          </div>
        </div>
      )}

      {ativo && (
        <div className="flex items-start gap-2">
          <Laptop className="ico text-slate-500 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <span className="texto-aux block">Equipamento</span>
            {pode('ativo', { custodianteId: ativo.custodianteId }) ? (
              <button type="button" onClick={() => abrirFicha({ tipo: 'ativo', id: ativo.id })} className={LINK}>
                <span className="font-mono">{ativo.tag}</span> · {ativo.nome}
                <ExternalLink className="ico-sm" aria-hidden="true" />
              </button>
            ) : (
              <span className="font-semibold text-slate-900">
                <span className="font-mono">{ativo.tag}</span> · {ativo.nome}
              </span>
            )}
            <p className="texto-aux break-words">
              {ativo.marca} {ativo.modelo} · S/N: <span className="font-mono">{ativo.serialNumber}</span>
            </p>
            {ativo.status === 'manutencao' && (
              <span className="selo selo-atencao mt-1">
                Em manutenção
              </span>
            )}
            {podeMandarParaManutencao && (
              <button
                type="button"
                onClick={() => abrirFicha({ tipo: 'ativo', id: ativo.id, manutencaoDoChamado: ticket.id })}
                className="btn btn-sm btn-secundario mt-2"
              >
                <Wrench className="ico-sm" aria-hidden="true" />
                {ativo.status === 'manutencao' ? 'Registrar manutenção' : 'Enviar para manutenção'}
              </button>
            )}
          </div>
        </div>
      )}

      {nomeSoftware && (
        <div className="flex items-start gap-2">
          <Key className="ico text-slate-500 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <span className="texto-aux block">Software / licença</span>
            {licenca && pode('software') ? (
              <button type="button" onClick={() => abrirFicha({ tipo: 'software', id: licenca.id })} className={LINK}>
                {licenca.nome}
                <ExternalLink className="ico-sm" aria-hidden="true" />
              </button>
            ) : (
              <span className="font-semibold text-slate-900">{nomeSoftware}</span>
            )}
            {isTI && fornecedorSoftware && <p className="texto-aux">Fornecedor: {fornecedorSoftware}</p>}
            {isTI && licenca && (
              <p className="texto-aux break-words">
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

      {linhaId && (
        <div className="flex items-start gap-2">
          <Phone className="ico text-slate-500 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <span className="texto-aux block">Linha telefônica</span>
            <span className="font-semibold text-slate-900">{linha?.numero || 'Linha vinculada'}</span>
            {isTI && linha && (
              <p className="texto-aux">
                {[linha.plano, linha.tipo === 'fixa' ? 'fixa' : 'móvel', linha.status !== 'ativa' ? linha.status : '']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        </div>
      )}

      {manutencoes.length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <span className="texto-aux block">Manutenções abertas por este chamado</span>
          {manutencoes.map(({ m, a }) => (
            <button
              key={m.id}
              type="button"
              onClick={() => abrirFicha({ tipo: 'ativo', id: a.id })}
              className="link flex w-full flex-wrap items-center gap-x-2 text-left"
            >
              <Wrench className="ico-sm text-slate-500" aria-hidden="true" />
              <span className="font-mono font-semibold">{a.tag}</span>
              <span>· {ROTULO_TIPO_MANUTENCAO[m.tipo]}</span>
              <span>· {ROTULO_STATUS_MANUTENCAO[m.status]}</span>
              <span className="text-slate-500">· {formatDate(m.abertaEm)}</span>
            </button>
          ))}
        </div>
      )}
      </div>
    </section>
  );
};
