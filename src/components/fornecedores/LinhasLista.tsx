import React, { useState } from 'react';
import { History, Pencil, Plus, Trash2, Phone } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import type { LinhaTelefonica } from '../../types/index.ts';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { formatCurrency, formatDate } from '../../utils/formatters.ts';
import { nomeContrato } from '../../utils/contratos.ts';
import { TIPOS_COM_LINHAS } from '../../utils/financeiro.ts';
import { normalizar } from '../../utils/processos.ts';
import { confirmar, confirmarMovimento } from '../ui/dialogo.tsx';
import { Janela } from '../ui/Janela.tsx';
import { Vazio } from '../ui/Tela.tsx';
import { CampoMascara, CampoMoeda } from '../ui/Campos.tsx';

const SEM_PESSOA = 'Sem pessoa (estoque)';

const ROTULO_STATUS: Record<LinhaTelefonica['status'], string> = { ativa: 'Ativa', suspensa: 'Suspensa', cancelada: 'Cancelada' };
const SELO_STATUS: Record<LinhaTelefonica['status'], string> = { ativa: 'selo-ok', suspensa: 'selo-atencao', cancelada: 'selo-neutro' };

/**
 * Seção 6 · Linhas de celular/fixo, tratadas como assentos: pessoa, aparelho,
 * contrato e histórico de quem usou. `contratoId` filtra (dentro do contrato).
 */
export const LinhasLista: React.FC<{
  busca?: string;
  contratoId?: string;
  /** Quando a tela dona controla o filtro e o botão "Nova linha" (LinhasView), a barra interna some */
  mostrarCanceladas?: boolean;
  novaAberta?: boolean;
  onFecharNova?: () => void;
}> = ({ busca = '', contratoId, mostrarCanceladas: canceladasExterno, novaAberta = false, onFecharNova }) => {
  const { employees, assets, contratos, currentRole, abrirFicha } = useApp();
  const { linhas, atribuicoesLinha, salvarLinha, excluirLinha } = useRecursos();
  const [editando, setEditando] = useState<LinhaTelefonica | 'nova' | null>(null);
  const [historico, setHistorico] = useState<string | null>(null);
  const [canceladasInterno, setCanceladasInterno] = useState(false);
  const controlada = canceladasExterno !== undefined;
  const mostrarCanceladas = controlada ? canceladasExterno : canceladasInterno;
  const [erro, setErro] = useState('');
  const fecharForm = () => {
    setEditando(null);
    onFecharNova?.();
  };
  const formAberto = editando !== null || novaAberta;
  const linhaEmEdicao = editando && editando !== 'nova' ? editando : undefined;

  const nomePessoa = (id?: string) => employees.find((e) => e.id === id)?.nome || '';
  const lista = linhas
    .filter((l) => (contratoId ? l.contratoId === contratoId : true))
    .filter((l) => mostrarCanceladas || l.status !== 'cancelada')
    .filter((l) => {
      if (!busca) return true;
      const c = contratos.find((x) => x.id === l.contratoId);
      return normalizar(`${l.numero} ${l.plano || ''} ${nomePessoa(l.colaboradorId)} ${c ? nomeContrato(c) : ''}`).includes(busca);
    });

  return (
    <div className="space-y-3">
      {!controlada && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={mostrarCanceladas} onChange={(e) => setCanceladasInterno(e.target.checked)} /> Mostrar canceladas
          </label>
          <button type="button" onClick={() => setEditando('nova')} className="btn btn-secundario">
            <Plus /> Nova linha
          </button>
        </div>
      )}

      {formAberto && (
        <FormLinha
          linha={linhaEmEdicao}
          contratoFixo={contratoId}
          onSalvar={async (dados) => {
            const r = await salvarLinha(dados);
            if (r.erro) return r.erro;
            fecharForm();
            return null;
          }}
          onCancelar={fecharForm}
        />
      )}
      {erro && <p className="erro" role="alert">{erro}</p>}

      {lista.length === 0 ? (
        // Seção 21: com o botão "Nova linha" no cabeçalho da tela, o vazio só explica
        <Vazio
          titulo={busca ? 'Nenhuma linha encontrada' : 'Nenhuma linha cadastrada'}
          acao={
            controlada ? undefined : (
              <button type="button" onClick={() => setEditando('nova')} className="btn btn-sm btn-primario">
                Nova linha
              </button>
            )
          }
        />
      ) : (
        <div className="cartao-tabela">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Número</th>
                <th>Pessoa</th>
                <th className="hidden xl:table-cell">Aparelho</th>
                {!contratoId && <th>Contrato</th>}
                <th>Situação</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => {
                const aparelho = assets.find((a) => a.id === l.ativoId);
                const contrato = contratos.find((c) => c.id === l.contratoId);
                const pessoa = employees.find((e) => e.id === l.colaboradorId);
                return (
                  <React.Fragment key={l.id}>
                    <tr className={`linha-clicavel ${l.status === 'cancelada' ? 'opacity-60' : ''}`}>
                      <td data-label="Número" className="font-mono font-semibold text-slate-900">
                        {/* Seção 21: a linha inteira abre a linha para editar (não há ficha própria de linha) */}
                        <button type="button" onClick={() => setEditando(l)} className="abre-linha text-left after:absolute after:inset-0 after:content-['']">
                          {l.numero}
                        </button>
                        {(l.plano || l.franquia) && <span className="block font-sans font-normal text-slate-500">{[l.plano, l.franquia].filter(Boolean).join(' · ')}</span>}
                      </td>
                      <td data-label="Pessoa">
                        {pessoa ? (
                          <button type="button" onClick={() => abrirFicha({ tipo: 'colaborador', id: pessoa.id })} className="link text-left">
                            {pessoa.nome}
                          </button>
                        ) : (
                          <span className="texto-aux">Em estoque</span>
                        )}
                        {pessoa?.status === 'desligado' && <span className="block text-red-700">Pessoa desligada</span>}
                      </td>
                      <td data-label="Aparelho" className="hidden xl:table-cell">
                        {aparelho ? (
                          <button
                            type="button"
                            onClick={() => abrirFicha({ tipo: 'ativo', id: aparelho.id })}
                            title={aparelho.nome}
                            className="link font-mono"
                          >
                            {aparelho.tag}
                          </button>
                        ) : (
                          <span className="texto-aux">—</span>
                        )}
                      </td>
                      {!contratoId && (
                        <td data-label="Contrato">
                          {/* Seção 21: só o código do contrato, com link para a ficha (o nome completo fica no título) */}
                          {contrato ? (
                            <button
                              type="button"
                              onClick={() => abrirFicha({ tipo: 'contrato', id: contrato.id })}
                              title={nomeContrato(contrato)}
                              className={`link text-left ${contrato.numero ? 'font-mono' : 'block max-w-48 truncate'}`}
                            >
                              {contrato.numero || contrato.descricao}
                            </button>
                          ) : l.valorMensal ? (
                            <span className="texto-aux">
                              Avulsa · <span className="num">{formatCurrency(l.valorMensal)}</span>/mês
                            </span>
                          ) : (
                            <span className="texto-aux">—</span>
                          )}
                        </td>
                      )}
                      <td data-label="Situação">
                        <span className={`selo ${SELO_STATUS[l.status]}`}>{ROTULO_STATUS[l.status]}</span>
                      </td>
                      <td data-label="Ações" className="col-acoes">
                        <span className="acoes-linha">
                          <button type="button" onClick={() => setEditando(l)} aria-label={`Editar ${l.numero}`} className="btn btn-sm btn-secundario">
                            <Pencil /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistorico(historico === l.id ? null : l.id)}
                            title="Histórico de uso"
                            aria-label={`Histórico de uso de ${l.numero}`}
                            className="btn-icone"
                          >
                            <History />
                          </button>
                          {currentRole === 'ti_admin' && (
                            <button
                              type="button"
                              title="Excluir"
                              aria-label={`Excluir ${l.numero}`}
                              onClick={async () => {
                                // Com histórico de uso o banco não deixa excluir: avisa antes de pedir confirmação
                                if (atribuicoesLinha.some((a) => a.linhaId === l.id)) {
                                  setErro(`A linha ${l.numero} tem histórico de uso: em vez de excluir, edite e mude a situação para Cancelada.`);
                                  return;
                                }
                                if (await confirmar(`Excluir a linha ${l.numero}?\n\nO cadastro sai das listas. Não dá para desfazer.`)) setErro((await excluirLinha(l.id)) || '');
                              }}
                              className="btn-icone btn-icone-perigo"
                            >
                              <Trash2 />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                    {historico === l.id && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50">
                          {atribuicoesLinha.filter((a) => a.linhaId === l.id).length === 0 ? (
                            <p className="text-slate-500">Sem histórico de uso.</p>
                          ) : (
                            <ul className="space-y-1">
                              {atribuicoesLinha
                                .filter((a) => a.linhaId === l.id)
                                .map((a) => (
                                  <li key={a.id}>
                                    {nomePessoa(a.colaboradorId) || 'Pessoa'} · {a.inicio ? formatDate(a.inicio.slice(0, 10)) : 'antes do histórico'} até{' '}
                                    {a.fim ? formatDate(a.fim.slice(0, 10)) : 'hoje'}
                                  </li>
                                ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const FormLinha: React.FC<{
  linha?: LinhaTelefonica;
  contratoFixo?: string;
  onSalvar: (d: Omit<LinhaTelefonica, 'id' | 'criadoEm'> & { id?: string }) => Promise<string | null>;
  onCancelar: () => void;
}> = ({ linha, contratoFixo, onSalvar, onCancelar }) => {
  const { employees, assets, contratos } = useApp();
  const { linhas } = useRecursos();
  const [d, setD] = useState({
    numero: linha?.numero || '',
    tipo: linha?.tipo || ('movel' as LinhaTelefonica['tipo']),
    contratoId: linha?.contratoId || contratoFixo || '',
    plano: linha?.plano || '',
    franquia: linha?.franquia || '',
    chip: linha?.chip || '',
    ativoId: linha?.ativoId || '',
    colaboradorId: linha?.colaboradorId || '',
    status: linha?.status || ('ativa' as LinhaTelefonica['status']),
    valorMensal: linha?.valorMensal ?? undefined,
    centroCusto: linha?.centroCusto || '',
    observacoes: linha?.observacoes || '',
    diaVencimento: String(linha?.diaVencimento ?? 10),
  });
  const [erro, setErro] = useState('');
  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));
  const contratosTel = contratos.filter((c) => TIPOS_COM_LINHAS.includes(c.tipo) && c.status !== 'encerrado');
  const celulares = assets.filter((a) => a.categoria === 'telefonia' && a.status !== 'descartado');
  // Aparelho já usado por outra linha ativa: aviso (não bloqueia — dual chip existe)
  const aparelhoEmUso = d.ativoId && linhas.some((l) => l.id !== linha?.id && l.ativoId === d.ativoId && l.status !== 'cancelada');

  // Ao escolher o aparelho, sugere a pessoa que está com ele
  const escolherAparelho = (id: string) => {
    const a = assets.find((x) => x.id === id);
    setD((p) => ({ ...p, ativoId: id, colaboradorId: p.colaboradorId || a?.custodianteId || '' }));
  };

  const nome = (id?: string) => employees.find((x) => x.id === id)?.nome || 'Pessoa';

  /** 9.1: mudar quem usa a linha (ou cancelar a linha) passa pela confirmação "de → para". false = não grava */
  const confirmarMudanca = async (): Promise<boolean> => {
    const antes = linha?.colaboradorId || '';
    // Linha cancelada fica sem pessoa (o salvar já faz isso)
    const depois = d.status === 'cancelada' ? '' : d.colaboradorId;
    if (linha && linha.status !== 'cancelada' && d.status === 'cancelada') {
      const r = await confirmarMovimento({
        titulo: 'Cancelar linha',
        item: d.numero,
        de: antes ? nome(antes) : SEM_PESSOA,
        para: 'Linha cancelada',
        efeitos: [
          'A linha sai das listas (só aparece em "Mostrar canceladas") e o número fica livre para outro cadastro',
          ...(antes ? [`A linha sai da ficha de ${nome(antes)}; o histórico de uso registra o fim hoje`] : []),
        ],
        foraDoNexus: ['Pedir o cancelamento à operadora (o Nexus não cancela lá)', ...(antes ? [`Recolher o chip/aparelho com ${nome(antes)}`] : [])],
        desfazer: 'Dá para reativar: marque "Mostrar canceladas", edite a linha e volte a situação para Ativa. A pessoa precisa ser escolhida de novo.',
        confirmar: 'Confirmar cancelamento',
        perigo: true,
      });
      return r !== null;
    }
    if (antes === depois) return true;
    const titulo = !antes ? 'Entregar linha' : !depois ? 'Devolver linha' : 'Trocar quem usa a linha';
    const aparelho = assets.find((a) => a.id === d.ativoId);
    const r = await confirmarMovimento({
      titulo,
      item: [d.numero, d.plano].filter(Boolean).join(' · '),
      de: antes ? nome(antes) : SEM_PESSOA,
      para: depois ? nome(depois) : SEM_PESSOA,
      efeitos: [
        ...(depois ? [`A linha passa a constar na ficha de ${nome(depois)}`] : []),
        ...(antes ? [`A linha sai da ficha de ${nome(antes)}`] : []),
        !antes ? 'O histórico de uso registra o início hoje' : !depois ? 'O histórico de uso registra o fim do uso hoje' : 'O histórico de uso registra a troca hoje',
        ...(aparelho && (aparelho.custodianteId || '') !== depois
          ? [`O aparelho ${aparelho.tag} não muda de mãos por aqui: se ele também mudou, troque a custódia na ficha dele`]
          : []),
      ],
      foraDoNexus: [
        ...(depois ? [`Entregar o chip/aparelho a ${nome(depois)}`] : []),
        ...(antes ? [`Recolher o chip/aparelho com ${nome(antes)}`] : []),
        'Se mudar o titular ou o centro de custo, avisar a operadora',
      ],
      desfazer: 'Dá para desfazer editando a linha de novo; o histórico guarda as duas trocas.',
      confirmar: !antes ? 'Entregar' : !depois ? 'Devolver' : 'Trocar',
    });
    return r !== null;
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    // Confere o número antes de perguntar (o mesmo que o salvar confere)
    const digitos = d.numero.replace(/\D/g, '');
    if (digitos.length < 8) return setErro('Informe o número completo da linha (com DDD).');
    const repetida = linhas.find((l) => l.id !== linha?.id && l.status !== 'cancelada' && l.numero.replace(/\D/g, '') === digitos);
    if (repetida) return setErro(`O número ${repetida.numero} já está cadastrado.`);
    setErro('');
    if (!(await confirmarMudanca())) return;
    const falha = await onSalvar({
      id: linha?.id,
      numero: d.numero,
      tipo: d.tipo,
      contratoId: d.contratoId || undefined,
      plano: d.plano || undefined,
      franquia: d.franquia || undefined,
      chip: d.chip || undefined,
      ativoId: d.ativoId || undefined,
      colaboradorId: d.colaboradorId || undefined,
      status: d.status,
      valorMensal: d.valorMensal,
      centroCusto: d.centroCusto || undefined,
      observacoes: d.observacoes || undefined,
      diaVencimento: Math.min(31, Math.max(1, Number(d.diaVencimento) || 10)),
    });
    if (falha) setErro(falha);
  };

  return (
    <Janela
      tamanho="p"
      titulo={linha ? `Editar linha ${linha.numero}` : 'Nova linha'}
      subtitulo="Número, plano, aparelho e pessoa"
      icone={<Phone className="ico" />}
      onFechar={onCancelar}
      idTitulo="janela-linha"
      rodape={
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancelar} className="btn btn-secundario">Cancelar</button>
          <button type="submit" form="form-linha" className="btn btn-primario">Salvar</button>
        </div>
      }
    >
    <form id="form-linha" onSubmit={salvar} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="ln-num" className={CLASSE_ROTULO}>Número *</label>
          <CampoMascara id="ln-num" tipo="telefone" required value={d.numero} onChange={(v) => set('numero', v)} className={CLASSE_CAMPO} placeholder="(11) 99999-0000" />
        </div>
        <div>
          <label htmlFor="ln-tipo" className={CLASSE_ROTULO}>Tipo</label>
          <select id="ln-tipo" value={d.tipo} onChange={(e) => set('tipo', e.target.value)} className={CLASSE_CAMPO}>
            <option value="movel">Celular</option>
            <option value="fixa">Fixa</option>
          </select>
        </div>
        <div>
          <label htmlFor="ln-status" className={CLASSE_ROTULO}>Situação</label>
          <select id="ln-status" value={d.status} onChange={(e) => set('status', e.target.value)} className={CLASSE_CAMPO}>
            {Object.entries(ROTULO_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        {!contratoFixo && (
          <div className="sm:col-span-2">
            <label htmlFor="ln-ctr" className={CLASSE_ROTULO}>Contrato da operadora</label>
            <select id="ln-ctr" value={d.contratoId} onChange={(e) => set('contratoId', e.target.value)} className={CLASSE_CAMPO}>
              <option value="">Sem contrato (linha avulsa)</option>
              {contratosTel.map((c) => (
                <option key={c.id} value={c.id}>{nomeContrato(c)}</option>
              ))}
            </select>
          </div>
        )}
        {!d.contratoId && (
          <div>
            <label htmlFor="ln-valor" className={CLASSE_ROTULO}>Valor mensal (R$)</label>
            <CampoMoeda id="ln-valor" valor={d.valorMensal} onMudar={(v) => setD((p) => ({ ...p, valorMensal: v }))} className={CLASSE_CAMPO} />
          </div>
        )}
        {!d.contratoId && (
          <div>
            <label htmlFor="ln-dia-venc" className={CLASSE_ROTULO}>Dia do vencimento</label>
            <input id="ln-dia-venc" type="number" min={1} max={31} value={d.diaVencimento} onChange={(e) => set('diaVencimento', e.target.value)} className={CLASSE_CAMPO} />
            <p className="ajuda">Com valor mensal, a fatura é gerada sozinha 30 dias antes.</p>
          </div>
        )}
        <div>
          <label htmlFor="ln-plano" className={CLASSE_ROTULO}>Plano</label>
          <input id="ln-plano" value={d.plano} onChange={(e) => set('plano', e.target.value)} className={CLASSE_CAMPO} />
        </div>
        <div>
          <label htmlFor="ln-franq" className={CLASSE_ROTULO}>Franquia</label>
          <input id="ln-franq" value={d.franquia} onChange={(e) => set('franquia', e.target.value)} className={CLASSE_CAMPO} placeholder="Ex.: 20 GB" />
        </div>
        <div>
          <label htmlFor="ln-chip" className={CLASSE_ROTULO}>Chip (ICCID)</label>
          <CampoMascara id="ln-chip" tipo="iccid" value={d.chip} onChange={(v) => set('chip', v)} className={CLASSE_CAMPO} />
        </div>
        <div>
          <label htmlFor="ln-aparelho" className={CLASSE_ROTULO}>Aparelho</label>
          <select id="ln-aparelho" value={d.ativoId} onChange={(e) => escolherAparelho(e.target.value)} className={CLASSE_CAMPO}>
            <option value="">—</option>
            {celulares.map((a) => (
              <option key={a.id} value={a.id}>{a.tag} · {a.nome}</option>
            ))}
          </select>
          {aparelhoEmUso && <p className="ajuda text-amber-800">Este aparelho já tem outra linha ativa.</p>}
        </div>
        <div>
          <label htmlFor="ln-pessoa" className={CLASSE_ROTULO}>Pessoa</label>
          <select id="ln-pessoa" value={d.colaboradorId} onChange={(e) => set('colaboradorId', e.target.value)} className={CLASSE_CAMPO} disabled={d.status === 'cancelada'}>
            <option value="">Em estoque (sem pessoa)</option>
            {employees
              .filter((e) => e.status !== 'desligado' || e.id === d.colaboradorId)
              .map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="ln-cc" className={CLASSE_ROTULO}>Área / centro de custo</label>
          <input id="ln-cc" value={d.centroCusto} onChange={(e) => set('centroCusto', e.target.value)} className={CLASSE_CAMPO} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ln-obs" className={CLASSE_ROTULO}>Observações</label>
          <textarea id="ln-obs" rows={2} value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} className={CLASSE_CAMPO} />
        </div>
      </div>
      {erro && <p className="erro" role="alert">{erro}</p>}
    </form>
    </Janela>
  );
};
