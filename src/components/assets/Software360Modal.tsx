import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatCurrency, formatDate } from '../../utils/formatters.ts';
import { Key, ExternalLink, Pencil, UserPlus, UserMinus, CheckCircle2, AlertCircle, Ban, ChevronRight } from 'lucide-react';
import { FaturasSecao } from '../financeiro/FaturasSecao.tsx';
import { chamadosDoSoftware } from '../../utils/vinculos.ts';
import { ChamadosVinculados } from '../servicedesk/ChamadosVinculados.tsx';
import { contratoQuePagaLicenca, nomeContrato } from '../../utils/contratos.ts';
import { ROTULO_FORMA_COBRANCA, ROTULO_FORMA_PAGAMENTO, dataLimiteCancelamento, fonteCustoLicenca } from '../../utils/financeiro.ts';
import { HistoricoAlteracoes } from '../comum/HistoricoAlteracoes.tsx';
import { LembreteLicenca } from './LembreteLicenca.tsx';
import { ContratoPorId } from '../financeiro/FinanceiroViews.tsx';
import { historicoAssentos, licencaAtiva } from '../../utils/licencas.ts';
import { avisar, confirmar, confirmarMovimento, pedirTexto } from '../ui/dialogo.tsx';
import { chamadoEncerrado } from '../../utils/atendimento.ts';
import { Janela, Dado } from '../ui/Janela.tsx';
import { Abas, type ItemAba } from '../ui/Abas.tsx';
import { Busca, Vazio } from '../ui/Tela.tsx';
import type { DadosPagamento, SoftwareLicense } from '../../types/index.ts';

interface Software360ModalProps {
  softwareId: string;
  onClose: () => void;
}

type AbaSoftware = 'resumo' | 'pessoas' | 'custo' | 'chamados' | 'historico';

type FonteCusto = ReturnType<typeof fonteCustoLicenca>;

/** Texto do botão some no celular (fica só o ícone, com o nome no title/aria-label) */
const Rotulo: React.FC<{ texto: string }> = ({ texto }) => <span className="hidden sm:inline">{texto}</span>;

/** Assentos usados/livres com a barra de ocupação */
const BarraAssentos: React.FC<{ license: SoftwareLicense }> = ({ license }) => {
  const livres = Math.max(0, license.assentosTotais - license.assentosAlocados);
  const ocupacao = Math.round((license.assentosAlocados / (license.assentosTotais || 1)) * 100);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="texto-aux">
          <span className="font-mono text-base font-semibold text-slate-900">
            {license.assentosAlocados} / {license.assentosTotais}
          </span>{' '}
          assentos em uso ({ocupacao}%)
        </p>
        <span className={`selo ${livres === 0 ? 'selo-problema' : livres <= 3 ? 'selo-atencao' : 'selo-ok'}`}>
          {livres} livre{livres === 1 ? '' : 's'}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label="Ocupação dos assentos"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, ocupacao)}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            ocupacao >= 100 ? 'bg-red-500' : ocupacao >= 85 ? 'bg-amber-500' : 'bg-blue-600'
          }`}
          style={{ width: `${Math.min(100, ocupacao)}%` }}
        />
      </div>
    </div>
  );
};

/** Valor, por assento, renovação/fim e prazo para cancelar (fonte única do custo) */
const ValoresCusto: React.FC<{ fonte: FonteCusto; license: SoftwareLicense; pg?: DadosPagamento; limite?: string }> = ({
  fonte,
  license,
  pg,
  limite,
}) => (
  <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <Dado rotulo="Valor">
      <span className="font-mono">
        {formatCurrency(fonte.valor)}
        {fonte.periodicidade === 'anual' ? '/ano' : fonte.periodicidade === 'unico' ? ' (único)' : '/mês'}
      </span>
      <span className="block font-normal text-slate-500">{fonte.origem}</span>
    </Dado>
    <Dado rotulo="Por assento">
      <span className="num">{formatCurrency(license.assentosTotais > 0 ? fonte.mensalDaLicenca / license.assentosTotais : 0)}/mês</span>
      {(fonte.licencasNoContrato || 0) > 1 && (
        <span className="block font-normal text-slate-500">
          {formatCurrency(fonte.mensalDaLicenca)}/mês deste software (contrato dividido entre {fonte.licencasNoContrato} softwares)
        </span>
      )}
    </Dado>
    <Dado rotulo={fonte.forma === 'contrato' ? 'Fim do contrato' : 'Renovação'}>
      {fonte.renovacao ? formatDate(fonte.renovacao) : '—'}
      {pg?.renovacaoAutomatica && <span className="block font-normal text-slate-500">renova sozinho</span>}
    </Dado>
    <Dado rotulo="Cancelar até">{limite ? formatDate(limite) : '—'}</Dado>
  </dl>
);

export const Software360Modal: React.FC<Software360ModalProps> = ({ softwareId, onClose }) => {
  const {
    licenses,
    employees,
    departments,
    allocateLicense,
    revokeLicense,
    editarLicenca,
    setSelectedEmployeeIdFor360,
    setSelectedTicketIdForDetail,
    setSoftwareToEdit,
    setSoftwareModalOpen,
    currentRole,
    fornecedores,
    podeDescartarPendencias,
    tickets,
    contratos,
    atribuicoesLicenca,
    mudarSituacaoLicenca,
    faturas,
  } = useApp();
  const [aba, setAba] = useState<AbaSoftware>('resumo');
  // Seção 6: contrato aberto por cima da ficha (renovar, ver faturas)
  const [contratoAberto, setContratoAberto] = useState<string | null>(null);

  const [selectedColabToAssign, setSelectedColabToAssign] = useState('');
  const [colabFilterSearch, setColabFilterSearch] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isEditingSeats, setIsEditingSeats] = useState(false);
  const [newTotalSeats, setNewTotalSeats] = useState<number>(0);

  const license = licenses.find((l) => l.id === softwareId);

  if (!license) return null;

  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  // Lote 1: situação, contrato que paga e histórico de assentos
  const ativa = licencaAtiva(license);
  const contratoPagador = contratoQuePagaLicenca(license.id, contratos);
  const historico = historicoAssentos(atribuicoesLicenca, { licencaId: license.id });
  // Último contrato que cobriu a licença (para renovar quando nenhum está vigente)
  const ultimoContrato = contratos
    .filter((c) => c.itens.some((i) => i.licencaId === license.id))
    .sort((a, b) => (b.fim || '9999').localeCompare(a.fim || '9999'))[0];
  // Seção 6: custo e renovação vêm da fonte única (contrato, licença ou sem custo)
  const fonte = fonteCustoLicenca(license, contratos);
  const pg = fonte.forma === 'contrato' ? fonte.contrato?.pagamento : license.pagamento;
  const limite = dataLimiteCancelamento(fonte.renovacao, pg?.avisoCancelamentoDias);
  const chamados = chamadosDoSoftware(tickets, license.id);
  const responsavel = license.responsavelId ? employees.find((e) => e.id === license.responsavelId) : undefined;

  const onEditar = () => {
    setSoftwareToEdit(license);
    setSoftwareModalOpen(true);
  };
  const nomePessoa = (id: string) => employees.find((e) => e.id === id)?.nome || 'Pessoa removida';

  // Lote 1 (L3): inativar com motivo (a licença fica no histórico); antes, liberar os assentos
  const inativar = async () => {
    const explicacao =
      'A licença não é excluída: fica no histórico e sai das listas de atribuição. Dá para desfazer: o administrador de T.I. reativa quando quiser.';
    if (license.colaboradoresIds.length > 0) {
      setAba('pessoas');
      await avisar({
        titulo: `Antes de inativar, libere os ${license.colaboradoresIds.length} assento(s) em uso.`,
        mensagem: explicacao,
      });
      return;
    }
    const motivo = await pedirTexto({
      titulo: `Inativar ${license.nome}?`,
      mensagem: `${explicacao}\n\nEx.: contrato encerrado; trocado pelo Google Workspace.`,
      rotulo: 'Motivo da inativação',
      minimo: 3,
      confirmar: 'Inativar',
      perigo: true,
    });
    if (!motivo) return;
    const falha = await mudarSituacaoLicenca(license.id, false, motivo);
    if (falha) return setFeedbackMsg({ text: falha, type: 'error' });
    setFeedbackMsg({ text: 'Licença inativada. Ela sai das listas de atribuição.', type: 'success' });
  };
  const reativar = async () => {
    if (!(await confirmar(`Reativar ${license.nome}?\n\nEla volta às listas de atribuição. Dá para inativar de novo depois, com motivo.`))) return;
    const falha = await mudarSituacaoLicenca(license.id, true);
    setFeedbackMsg(falha ? { text: falha, type: 'error' } : { text: 'Licença reativada.', type: 'success' });
  };
  // Fase 8: nome do cadastro de fornecedores; sem vínculo, o texto antigo
  const nomeFornecedor = fornecedores.find((f) => f.id === license.fornecedorId)?.nome || license.fornecedor;
  // Fecha perguntando se houver fatura em digitação
  const fechar = () => {
    void podeDescartarPendencias().then((ok) => ok && onClose());
  };
  const freeSeats = Math.max(0, license.assentosTotais - license.assentosAlocados);

  // Colaboradores ativos que NÃO possuem esta licença
  const unassignedEmployees = employees.filter((emp) => emp.status === 'ativo' && !license.colaboradoresIds.includes(emp.id));

  // Colaboradores que POSSUEM esta licença (filtrados por busca)
  const termo = colabFilterSearch.toLowerCase();
  const assignedEmployees = employees
    .filter((emp) => license.colaboradoresIds.includes(emp.id))
    .filter(
      (emp) => emp.nome.toLowerCase().includes(termo) || emp.email.toLowerCase().includes(termo) || emp.cargo.toLowerCase().includes(termo)
    );

  const handleAllocate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedColabToAssign) return;

    if (freeSeats <= 0) {
      setFeedbackMsg({
        text: 'Não há assentos livres disponíveis neste contrato. Aumente o total de assentos antes de alocar.',
        type: 'error',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }

    const colab = employees.find((emp) => emp.id === selectedColabToAssign);
    allocateLicense(license.id, selectedColabToAssign);
    setSelectedColabToAssign('');
    setFeedbackMsg({
      text: `Assento alocado com sucesso para ${colab?.nome || 'o colaborador'}!`,
      type: 'success',
    });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleRevoke = async (empId: string, empNome: string) => {
    // Seção 9.1: com desligamento em andamento, a liberação é feita pelo passo do checklist
    const desligamento = tickets.find(
      (t) => t.tipo === 'offboarding' && !chamadoEncerrado(t) && (t.colaboradorId || t.offboarding?.colaboradorId) === empId
    );
    if (desligamento) {
      const ir = await confirmar({
        titulo: `${empNome} está em desligamento (${desligamento.codigo})`,
        mensagem: `Libere o assento pelo passo "Liberar licença" do checklist: assim o desligamento registra quem fez, quando e a confirmação de que o acesso foi removido no painel do fornecedor.\n\nNada é alterado aqui.`,
        confirmar: 'Abrir o desligamento',
      });
      if (ir) setSelectedTicketIdForDetail(desligamento.id);
      return;
    }
    const primeiro = empNome.split(' ')[0];
    const r = await confirmarMovimento({
      titulo: `Liberar o assento de ${empNome}`,
      item: license.nome,
      de: empNome,
      para: 'Saldo livre da licença',
      efeitos: [
        `A vaga volta ao saldo livre na hora (${license.assentosAlocados - 1} de ${license.assentosTotais} em uso)`,
        'A saída fica no histórico de assentos, com o motivo',
      ],
      foraDoNexus: [`Remover o acesso de ${primeiro} no painel do fornecedor (o Nexus não mexe na conta lá)`],
      motivos: ['Desligamento', 'Troca de licença / plano', 'Não usa mais'],
      confirmacoes: [
        {
          texto: `Removi o acesso de ${primeiro} a ${license.nome} no painel do fornecedor`,
          link: license.urlPainel ? { url: license.urlPainel, rotulo: `Abrir o painel de ${license.nome}` } : undefined,
        },
      ],
      desfazer: 'Dá para desfazer alocando o assento de novo; o histórico guarda as duas movimentações.',
      confirmar: 'Liberar assento',
      perigo: true,
    });
    if (!r) return;
    revokeLicense(license.id, empId, r.motivo);
    setFeedbackMsg({
      text: `Assento de ${empNome} liberado com sucesso. Saldo livre atualizado!`,
      type: 'success',
    });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleSaveTotalSeats = async () => {
    if (newTotalSeats < license.assentosAlocados) {
      setFeedbackMsg({
        text: `O total de assentos não pode ser menor que os assentos atualmente em uso (${license.assentosAlocados}).`,
        type: 'error',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }
    const falha = await editarLicenca(license.id, { assentosTotais: newTotalSeats });
    if (falha) return setFeedbackMsg({ text: `Não foi possível salvar: ${falha}`, type: 'error' });
    setIsEditingSeats(false);
    setFeedbackMsg({
      text: `Quantidade total de assentos atualizada para ${newTotalSeats}!`,
      type: 'success',
    });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const abas: ItemAba<AbaSoftware>[] = [
    { id: 'resumo', rotulo: 'Resumo' },
    { id: 'pessoas', rotulo: 'Pessoas e assentos', contador: license.colaboradoresIds.length },
    { id: 'custo', rotulo: 'Custo e faturas' },
    { id: 'chamados', rotulo: 'Chamados', contador: chamados.length },
    ...(isTI ? [{ id: 'historico' as const, rotulo: 'Histórico' }] : []),
  ];
  const abaAtual = abas.some((a) => a.id === aba) ? aba : 'resumo';
  // Painéis ficam montados (escondidos) para não perder o que está em digitação (ex.: fatura)
  const painel = (id: AbaSoftware) => (abaAtual === id ? 'space-y-4' : 'hidden');

  const linkContrato = (id: string, nome: string) => (
    <button type="button" onClick={() => setContratoAberto(id)} className="link">
      {nome}
    </button>
  );

  // Seção 6: faturas no lugar certo — software pago por contrato mostra (e lança) as do contrato
  const secaoFaturas = (() => {
    if (fonte.forma === 'contrato' && fonte.contrato) {
      return (
        <div className="space-y-2">
          <p className="texto-aux">Faturas do contrato {nomeContrato(fonte.contrato)} (que paga este software):</p>
          <FaturasSecao alvo={{ contratoId: fonte.contrato.id }} periodicidade={fonte.contrato.periodicidade} valorPadrao={fonte.contrato.valor} />
          {faturas.some((f) => f.licencaId === license.id) && (
            <FaturasSecao alvo={{ licencaId: license.id }} bloqueioLancamento="Faturas antigas, de quando a cobrança era no próprio software." />
          )}
        </div>
      );
    }
    if (fonte.forma === 'sem_custo' && !faturas.some((f) => f.licencaId === license.id)) return null;
    return (
      <FaturasSecao
        alvo={{ licencaId: license.id }}
        periodicidade={license.tipoCobranca || 'mensal'}
        valorPadrao={license.valorMensal}
        bloqueioLancamento={fonte.forma === 'sem_custo' ? 'Software sem custo: não recebe faturas novas.' : undefined}
      />
    );
  })();

  const avisoSemContrato = (
    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
      <p>Este software é pago por contrato, mas nenhum contrato vigente o cobre.</p>
      {isTI && (
        <div className="flex flex-wrap gap-2">
          {ultimoContrato && (
            <button type="button" onClick={() => setContratoAberto(ultimoContrato.id)} className="btn btn-sm btn-secundario">
              Renovar o contrato {nomeContrato(ultimoContrato)}
            </button>
          )}
          <button type="button" onClick={() => onEditar()} className="btn btn-sm btn-secundario">
            Passar a cobrar no software
          </button>
        </div>
      )}
    </div>
  );


  return (
    <>
      <Janela
        tamanho="ficha"
        icone={<Key className="ico" />}
        rotuloCaminho={license.nome}
        titulo={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{license.nome}</span>
            {!ativa && <span className="selo selo-neutro shrink-0">Inativa</span>}
          </span>
        }
        subtitulo={
          <>
            {nomeFornecedor || 'Sem fornecedor'}
            {contratoPagador && ` · paga pelo contrato ${nomeContrato(contratoPagador)}`}
          </>
        }
        onFechar={fechar}
        acoes={
          <>
            {isTI && (
              <button
                type="button"
                title="Editar"
                aria-label="Editar"
                onClick={async () => {
                  // Fase 8: a ficha fecha; pergunta antes se há fatura em digitação
                  if (!(await podeDescartarPendencias())) return;
                  setSoftwareToEdit(license);
                  setSoftwareModalOpen(true);
                  onClose();
                }}
                className="btn btn-sm btn-secundario"
              >
                <Pencil />
                <Rotulo texto="Editar" />
              </button>
            )}
            {/* Lote 1 (L3): inativar com motivo; reativar só o administrador */}
            {currentRole === 'ti_admin' && !ativa && (
              <button type="button" title="Reativar" aria-label="Reativar" onClick={reativar} className="btn btn-sm btn-secundario">
                <CheckCircle2 />
                <Rotulo texto="Reativar" />
              </button>
            )}
            {isTI && ativa && (
              <button type="button" title="Inativar" aria-label="Inativar" onClick={inativar} className="btn btn-sm btn-perigo">
                <Ban />
                <Rotulo texto="Inativar" />
              </button>
            )}
          </>
        }
        faixa={<Abas<AbaSoftware> rotulo="Seções da ficha do software" itens={abas} ativa={abaAtual} onMudar={setAba} />}
      >
        {feedbackMsg && (
          <p
            role="status"
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
              feedbackMsg.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {feedbackMsg.type === 'success' ? <CheckCircle2 className="ico" /> : <AlertCircle className="ico" />}
            <span>{feedbackMsg.text}</span>
          </p>
        )}

        {/* ---------------- Resumo ---------------- */}
        <div role="tabpanel" aria-label="Resumo" className={painel('resumo')}>
          {!ativa && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              Inativada{license.inativadaEm ? ` em ${formatDate(license.inativadaEm)}` : ''}
              {license.inativadaPor ? ` por ${nomePessoa(license.inativadaPor)}` : ''}: {license.inativacaoMotivo || 'sem motivo'}
            </p>
          )}

          <section className="cartao space-y-3 p-4">
            <h3 className="secao-titulo">Dados do software</h3>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Dado rotulo="Situação">
                <span className={`selo ${ativa ? 'selo-ok' : 'selo-neutro'}`}>{ativa ? 'Ativa' : 'Inativa'}</span>
              </Dado>
              <Dado rotulo="Fabricante">{license.fabricante || '—'}</Dado>
              <Dado rotulo="Fornecedor">{nomeFornecedor || '—'}</Dado>
              {isTI && (
                <Dado rotulo="Chave / ID do contrato">
                  {license.chaveContrato ? <span className="font-mono break-all">{license.chaveContrato}</span> : '—'}
                </Dado>
              )}
              {responsavel && <Dado rotulo="Responsável">{responsavel.nome}</Dado>}
              {license.urlPainel && (
                <Dado rotulo="Painel de administração">
                  <a href={license.urlPainel} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                    Abrir painel
                    <ExternalLink className="ico-sm" aria-hidden="true" />
                  </a>
                </Dado>
              )}
            </dl>
          </section>

          <section className="cartao space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="secao-titulo">Assentos</h3>
              <button type="button" onClick={() => setAba('pessoas')} className="btn btn-sm btn-discreto">
                Ver pessoas
                <ChevronRight />
              </button>
            </div>
            <BarraAssentos license={license} />
          </section>

          {/* Custo e pagamento ficam só na aba própria; aqui só o alerta, se houver */}
          {fonte.semContratoVigente && avisoSemContrato}

          {license.observacoes && (
            <section className="cartao space-y-2 p-4">
              <h3 className="secao-titulo">Observações</h3>
              <p className="whitespace-pre-line text-slate-700">{license.observacoes}</p>
            </section>
          )}
        </div>

        {/* ---------------- Pessoas e assentos ---------------- */}
        <div role="tabpanel" aria-label="Pessoas e assentos" className={painel('pessoas')}>
          <section className="cartao space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="secao-titulo">Capacidade</h3>
              {isTI && !isEditingSeats && (
                <button
                  type="button"
                  onClick={() => {
                    setNewTotalSeats(license.assentosTotais);
                    setIsEditingSeats(true);
                  }}
                  className="btn btn-sm btn-secundario"
                >
                  <Pencil />
                  Ajustar total de assentos
                </button>
              )}
            </div>

            {isTI && isEditingSeats && (
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor={`total-assentos-${license.id}`} className="rotulo">
                    Total de assentos
                  </label>
                  <input
                    id={`total-assentos-${license.id}`}
                    type="number"
                    min={license.assentosAlocados}
                    value={newTotalSeats}
                    onChange={(e) => setNewTotalSeats(Number(e.target.value))}
                    className="campo campo-sm w-28 font-mono"
                  />
                </div>
                <button type="button" onClick={handleSaveTotalSeats} className="btn btn-sm btn-primario">
                  Salvar
                </button>
                <button type="button" onClick={() => setIsEditingSeats(false)} className="btn btn-sm btn-secundario">
                  Cancelar
                </button>
                <p className="ajuda w-full">Não pode ser menor que os assentos em uso ({license.assentosAlocados}).</p>
              </div>
            )}

            <BarraAssentos license={license} />

            {/* Alocação de assento (licença inativa não recebe assento) */}
            {isTI && ativa && (
              <form onSubmit={handleAllocate} className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`alocar-assento-${license.id}`} className="rotulo">
                    Alocar assento para
                  </label>
                  <select
                    id={`alocar-assento-${license.id}`}
                    value={selectedColabToAssign}
                    onChange={(e) => setSelectedColabToAssign(e.target.value)}
                    disabled={freeSeats <= 0}
                    className="campo"
                  >
                    <option value="">
                      {freeSeats <= 0 ? 'Nenhum assento livre (limite atingido)' : 'Selecione um colaborador ativo sem esta licença...'}
                    </option>
                    {unassignedEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nome} ({emp.cargo} · {departments.find((d) => d.id === emp.setorId)?.nome || 'TI'})
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={!selectedColabToAssign || freeSeats <= 0} className="btn btn-primario">
                  <UserPlus />
                  Alocar assento
                </button>
              </form>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="secao-titulo">Pessoas com assento em uso ({license.colaboradoresIds.length})</h3>
                <p className="tela-subtitulo">Liberar o assento devolve a vaga ao saldo livre na hora.</p>
              </div>
              <Busca
                id={`busca-assentos-${license.id}`}
                valor={colabFilterSearch}
                onMudar={setColabFilterSearch}
                placeholder="Buscar pessoa neste software"
              />
            </div>

            {assignedEmployees.length === 0 ? (
              <Vazio>
                {colabFilterSearch
                  ? 'Nenhum colaborador encontrado com os termos de busca.'
                  : 'Nenhum colaborador alocado neste software no momento.'}
              </Vazio>
            ) : (
              <div className="cartao-tabela">
                <table className="tabela tabela-cartoes">
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>E-mail</th>
                      <th>Cargo e setor</th>
                      <th className="col-acoes">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedEmployees.map((emp) => {
                      const dep = departments.find((d) => d.id === emp.setorId);
                      return (
                        <tr key={emp.id}>
                          <td data-label="Pessoa">
                            <button
                              type="button"
                              onClick={() => setSelectedEmployeeIdFor360(emp.id)}
                              className="link text-left"
                            >
                              {emp.nome}
                            </button>
                          </td>
                          <td data-label="E-mail" className="font-mono break-all">
                            {emp.email}
                          </td>
                          <td data-label="Cargo e setor">
                            <span className="block font-semibold text-slate-800">{emp.cargo}</span>
                            <span className="text-slate-500">{dep?.nome || '-'}</span>
                          </td>
                          <td data-label="Ações" className="col-acoes">
                            {isTI ? (
                              <span className="acoes-linha">
                                <button type="button" onClick={() => handleRevoke(emp.id, emp.nome)} className="btn btn-sm btn-perigo">
                                  <UserMinus />
                                  Liberar assento
                                </button>
                              </span>
                            ) : (
                              <span className="selo selo-ok">Ativo</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Lote 1 (L4): quem teve assento, de quando a quando */}
          {isTI && (
            <section className="space-y-2">
              <h3 className="secao-titulo">Histórico de assentos</h3>
              {historico.length === 0 ? (
                <Vazio>Nenhuma atribuição registrada ainda.</Vazio>
              ) : (
                <div className="cartao-tabela">
                  <table className="tabela tabela-cartoes">
                    <thead>
                      <tr>
                        <th>Pessoa</th>
                        <th>Entrou</th>
                        <th>Saiu</th>
                        <th className="num">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historico.map((a) => (
                        <tr key={a.id}>
                          <td data-label="Pessoa">
                            <button type="button" onClick={() => setSelectedEmployeeIdFor360(a.colaboradorId)} className="link text-left">
                              {nomePessoa(a.colaboradorId)}
                            </button>
                          </td>
                          <td data-label="Entrou">
                            {a.inicio ? formatDate(a.inicio) : 'antes do histórico'}
                            {a.atribuidoPor && <span className="block text-slate-500">por {nomePessoa(a.atribuidoPor)}</span>}
                          </td>
                          <td data-label="Saiu">
                            {a.fim ? formatDate(a.fim) : '—'}
                            {a.fim && a.removidoPor && <span className="block text-slate-500">por {nomePessoa(a.removidoPor)}</span>}
                            {a.fim && a.motivoRemocao && <span className="block text-slate-500">motivo: {a.motivoRemocao}</span>}
                          </td>
                          <td data-label="Situação" className="num">
                            <span className={`selo ${a.fim ? 'selo-neutro' : 'selo-ok'}`}>{a.fim ? 'Encerrado' : 'Em uso'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ---------------- Custo e faturas ---------------- */}
        <div role="tabpanel" aria-label="Custo e faturas" className={painel('custo')}>
          <section className="cartao space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="secao-titulo">Forma de cobrança</h3>
              <span className={`selo ${fonte.semContratoVigente ? 'selo-problema' : fonte.forma === 'sem_custo' ? 'selo-neutro' : 'selo-info'}`}>
                {ROTULO_FORMA_COBRANCA[fonte.forma]}
              </span>
            </div>
            {fonte.contrato && (
              <p className="texto-aux">
                Pago pelo contrato {linkContrato(fonte.contrato.id, nomeContrato(fonte.contrato))}
                {fonte.contrato.fim ? `, vigente até ${formatDate(fonte.contrato.fim)}` : ''}.
              </p>
            )}
            {fonte.semContratoVigente ? (
              avisoSemContrato
            ) : fonte.forma === 'sem_custo' ? (
              <p className="texto-aux">Software sem custo.</p>
            ) : (
              <ValoresCusto fonte={fonte} license={license} pg={pg} limite={limite} />
            )}
          </section>

          {fonte.forma !== 'sem_custo' && !fonte.semContratoVigente && (
            <section className="cartao space-y-3 p-4">
              <h3 className="secao-titulo">Dados de pagamento</h3>
              {pg?.formaPagamento || pg?.titular || pg?.avisoCancelamentoDias || (pg?.moeda && pg.moeda !== 'BRL') ? (
                <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Dado rotulo="Forma de pagamento">
                    {pg?.formaPagamento ? ROTULO_FORMA_PAGAMENTO[pg.formaPagamento] : '—'}
                    {pg?.cartaoFinal && currentRole !== 'ti_suporte' ? ` final ${pg.cartaoFinal}` : ''}
                  </Dado>
                  {/* Seção 17 (decisão 2): o suporte não vê cartão nem titular */}
                  {currentRole !== 'ti_suporte' && <Dado rotulo="Titular">{pg?.titular || '—'}</Dado>}
                  <Dado rotulo="Moeda">
                    {pg?.moeda && pg.moeda !== 'BRL' && pg.valorMoeda != null ? (
                      <span className="font-mono">
                        {pg.moeda} {pg.valorMoeda.toFixed(2)}
                      </span>
                    ) : (
                      pg?.moeda || 'BRL'
                    )}
                  </Dado>
                  <Dado rotulo="Aviso para cancelar">
                    {pg?.avisoCancelamentoDias ? `${pg.avisoCancelamentoDias} dias antes` : '—'}
                    {pg?.renovacaoAutomatica && <span className="block font-normal text-slate-500">renova sozinho</span>}
                  </Dado>
                </dl>
              ) : (
                <p className="texto-aux">
                  Nenhum dado de pagamento informado{fonte.forma === 'contrato' ? ' no contrato' : ''}.
                </p>
              )}
            </section>
          )}

          {isTI && <LembreteLicenca licenca={license} />}
          {isTI && secaoFaturas}
        </div>

        {/* ---------------- Chamados ---------------- */}
        <div role="tabpanel" aria-label="Chamados" className={painel('chamados')}>
          {/* Fase 9: chamados ligados a este software */}
          <ChamadosVinculados chamados={chamados} vazio="Nenhum chamado ligado a este software." />
        </div>

        {/* ---------------- Histórico (só a T.I.; carrega ao abrir a aba) ---------------- */}
        {isTI && abaAtual === 'historico' && (
          <div role="tabpanel" aria-label="Histórico" className="space-y-4">
            <HistoricoAlteracoes entidade="licencas_software" registro={license.id} semBotao />
          </div>
        )}
      </Janela>
      {contratoAberto && <ContratoPorId id={contratoAberto} onClose={() => setContratoAberto(null)} />}
    </>
  );
};
