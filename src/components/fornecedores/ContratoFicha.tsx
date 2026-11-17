import React, { useEffect, useState } from 'react';
import { Ban, FileSignature, Key, Laptop, Pencil, RefreshCw, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import type { Contrato, LinhaTelefonica, TipoAnexoContrato } from '../../types/index.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { validarArquivo } from '../../services/supabaseDb.ts';
import { formatCurrency, formatDate, isoLocal } from '../../utils/formatters.ts';
import { ROTULO_PERIODICIDADE, ROTULO_TIPO_CONTRATO, nomeContrato, resumoItens, situacaoContrato } from '../../utils/contratos.ts';
import {
  CAMPOS_DETALHES,
  CATEGORIA_DO_TIPO,
  ROTULO_CATEGORIA,
  ROTULO_FORMA_PAGAMENTO,
  TIPOS_COM_LINHAS,
  TIPOS_COM_UNIDADE,
  dataLimiteCancelamento,
} from '../../utils/financeiro.ts';
import { AbrirArquivo } from '../comum/AbrirArquivo.tsx';
import { CLASSE_ARQUIVO, CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import { HistoricoAlteracoes } from '../comum/HistoricoAlteracoes.tsx';
import { FaturasSecao } from '../financeiro/FaturasSecao.tsx';
import { ContratoFormModal } from './ContratoFormModal.tsx';
import { LembreteContrato } from './LembreteContrato.tsx';
import { confirmar, pedirTexto } from '../ui/dialogo.tsx';
import { CampoMoeda } from '../ui/Campos.tsx';
import { Dado, Janela } from '../ui/Janela.tsx';
import { Abas, type ItemAba } from '../ui/Abas.tsx';
import { Vazio } from '../ui/Tela.tsx';

type AbaFicha = 'resumo' | 'itens' | 'linhas' | 'faturas' | 'anexos' | 'historico';

const ROTULO_ANEXO: Record<TipoAnexoContrato, string> = { proposta: 'Proposta', contrato: 'Contrato', aditivo: 'Aditivo', nota: 'Nota fiscal', outro: 'Outro' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ROTULO_STATUS_LINHA: Record<LinhaTelefonica['status'], string> = { ativa: 'Ativa', suspensa: 'Suspensa', cancelada: 'Cancelada' };
const SELO_STATUS_LINHA: Record<LinhaTelefonica['status'], string> = { ativa: 'selo-ok', suspensa: 'selo-atencao', cancelada: 'selo-neutro' };
const ROTULO_STATUS_ATIVO: Record<string, string> = { disponivel: 'Disponível', em_uso: 'Em uso', manutencao: 'Em manutenção', descartado: 'Baixado' };

/** Selo da situação do contrato hoje (vigente, vence em N dias, a iniciar, encerrado) */
export const SeloContrato: React.FC<{ contrato: Pick<Contrato, 'inicio' | 'fim' | 'status'> }> = ({ contrato }) => {
  const { situacao, dias } = situacaoContrato(contrato);
  if (situacao === 'encerrado') return <span className="selo selo-neutro">Encerrado</span>;
  if (situacao === 'vencendo')
    return <span className="selo selo-atencao">{dias === 0 ? 'Vence hoje' : `Vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`}</span>;
  if (situacao === 'a_iniciar') return <span className="selo selo-info">A iniciar</span>;
  return <span className="selo selo-ok">Vigente</span>;
};

/** Cartão de seção do resumo: título + pares rótulo/valor */
const SecaoResumo: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="cartao space-y-3 p-4">
    <h3 className="secao-titulo">{titulo}</h3>
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">{children}</dl>
  </section>
);

/**
 * Seção 6 · Ficha do contrato (só a T.I.): resumo, itens cobertos, linhas (telefonia),
 * faturas, anexos e histórico. Editar abre o formulário; Renovar cria o contrato
 * seguinte; Encerrar pede o motivo; Reabrir só o administrador.
 */
export const ContratoFicha: React.FC<{ contratoId: string; onClose: () => void }> = ({ contratoId, onClose }) => {
  const { contratos, fornecedores, faturas, assets, licenses, employees, currentRole, encerrarContrato, reabrirContrato, renovarContrato, abrirFicha, podeDescartarPendencias } =
    useApp();
  const { linhas, unidades, anexosContrato, anexarContrato, removerAnexoContrato } = useRecursos();
  // Renovar leva à ficha do contrato novo; "Renovação de" volta ao anterior
  const [idAtual, setIdAtual] = useState(contratoId);
  const [aba, setAba] = useState<AbaFicha>('resumo');
  const [editando, setEditando] = useState(false);
  const [renovacao, setRenovacao] = useState<{ inicio: string; fim: string; valor: number | undefined; numero: string } | null>(null);
  const [renovando, setRenovando] = useState(false);
  const [erroRenovacao, setErroRenovacao] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  // Novo anexo: só sobe ao clicar em "Anexar"
  const [anexoTipo, setAnexoTipo] = useState<TipoAnexoContrato>('contrato');
  const [anexoArquivo, setAnexoArquivo] = useState<File | null>(null);
  const [anexoDescricao, setAnexoDescricao] = useState('');
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [erroAnexo, setErroAnexo] = useState('');
  const [campoArquivo, setCampoArquivo] = useState(0); // troca a key para limpar o campo de arquivo
  useRegistrarPendencias(`anexo-contrato:${idAtual}`, anexoArquivo ? ['Anexo do contrato escolhido e não enviado'] : []);

  const contrato = contratos.find((c) => c.id === idAtual);
  // Contrato excluído (pelo formulário) ou que deixou de existir: fecha a ficha
  useEffect(() => {
    if (!contrato) onClose();
  }, [contrato, onClose]);
  if (!contrato) return null;

  const fechar = () => {
    void podeDescartarPendencias().then((ok) => ok && onClose());
  };

  const irPara = (id: string, mensagem = '') => {
    setIdAtual(id);
    setAba('resumo');
    setErro('');
    setAviso(mensagem);
    setAnexoArquivo(null);
    setAnexoDescricao('');
    setErroAnexo('');
  };

  const fornecedor = fornecedores.find((f) => f.id === contrato.fornecedorId);
  const { situacao, dias } = situacaoContrato(contrato);
  const encerrado = contrato.status === 'encerrado';
  const pg = contrato.pagamento;
  const limiteCancelar = dataLimiteCancelamento(contrato.fim, pg?.avisoCancelamentoDias);
  const anterior = contrato.renovadoDe ? contratos.find((c) => c.id === contrato.renovadoDe) : undefined;
  const seguinte = contratos.find((c) => c.renovadoDe === contrato.id);
  const responsavel = employees.find((e) => e.id === contrato.responsavelId);
  const unidade = unidades.find((u) => u.id === contrato.unidadeId);
  const temLinhas = TIPOS_COM_LINHAS.includes(contrato.tipo);
  const linhasDoContrato = linhas
    .filter((l) => l.contratoId === contrato.id)
    .sort((a, b) => Number(a.status === 'cancelada') - Number(b.status === 'cancelada'));
  const qtdFaturas = faturas.filter((f) => f.contratoId === contrato.id).length;
  const anexos = anexosContrato.filter((a) => a.contratoId === contrato.id);
  const camposDetalhes = CAMPOS_DETALHES[contrato.tipo];

  const abas: ItemAba<AbaFicha>[] = [
    { id: 'resumo', rotulo: 'Resumo' },
    { id: 'itens', rotulo: 'Itens cobertos', contador: contrato.itens.length },
    ...(temLinhas ? [{ id: 'linhas' as const, rotulo: 'Linhas', contador: linhasDoContrato.filter((l) => l.status !== 'cancelada').length }] : []),
    { id: 'faturas', rotulo: 'Faturas', contador: qtdFaturas },
    { id: 'anexos', rotulo: 'Anexos', contador: anexos.length + (contrato.arquivoCaminho ? 1 : 0) },
    { id: 'historico', rotulo: 'Histórico' },
  ];
  const abaAtiva: AbaFicha = aba === 'linhas' && !temLinhas ? 'resumo' : aba;

  const abrirRenovacao = () => {
    // Sugestão: começa no dia seguinte ao fim (ou amanhã) e vale por 1 ano
    const ini = contrato.fim ? isoLocal(new Date(`${contrato.fim}T12:00:00`)) : isoLocal(new Date());
    const d = new Date(`${ini}T12:00:00`);
    d.setDate(d.getDate() + 1);
    const novoFim = new Date(d);
    novoFim.setFullYear(novoFim.getFullYear() + 1);
    novoFim.setDate(novoFim.getDate() - 1);
    setErroRenovacao('');
    setRenovacao({ inicio: isoLocal(d), fim: isoLocal(novoFim), valor: contrato.valor, numero: '' });
  };

  const renovar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renovacao || renovando) return;
    if (!renovacao.inicio) return setErroRenovacao('Informe o novo início.');
    if (renovacao.fim && renovacao.fim < renovacao.inicio) return setErroRenovacao('O novo fim é anterior ao novo início.');
    const valor = renovacao.valor ?? 0;
    if (!Number.isFinite(valor) || valor < 0) return setErroRenovacao('O valor não pode ser negativo.');
    setRenovando(true);
    const r = await renovarContrato(contrato.id, renovacao.inicio, renovacao.fim || undefined, valor, renovacao.numero.trim() || undefined);
    setRenovando(false);
    if (r.erro) return setErroRenovacao(r.erro);
    setRenovacao(null);
    if (r.item) irPara(r.item.id, `Contrato renovado. Esta é a ficha do contrato novo; o anterior (${nomeContrato(contrato)}) ficou no histórico.`);
  };

  const encerrar = async () => {
    const motivo = await pedirTexto({
      titulo: `Encerrar o contrato ${nomeContrato(contrato)}?`,
      mensagem:
        'Ele deixa de valer hoje: para de cobrir os itens e de contar no custo recorrente. As faturas e o histórico continuam. Dá para desfazer: o administrador pode reabrir.',
      rotulo: 'Motivo do encerramento',
      minimo: 5,
      confirmar: 'Encerrar',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (motivo === null) return;
    const falha = await encerrarContrato(contrato.id, motivo);
    setAviso('');
    setErro(falha ? `Não foi possível encerrar: ${falha}` : '');
  };

  const reabrir = async () => {
    const falha = await reabrirContrato(contrato.id);
    setAviso('');
    setErro(falha ? `Não foi possível reabrir: ${falha}` : '');
  };

  const anexar = async () => {
    if (!anexoArquivo || enviandoAnexo) return;
    const msg = validarArquivo(anexoArquivo);
    if (msg) return setErroAnexo(msg);
    setEnviandoAnexo(true);
    const falha = await anexarContrato(contrato.id, anexoArquivo, anexoTipo, anexoDescricao);
    setEnviandoAnexo(false);
    if (falha) return setErroAnexo(falha);
    setErroAnexo('');
    setAnexoArquivo(null);
    setAnexoDescricao('');
    setCampoArquivo((n) => n + 1);
  };

  const removerAnexo = async (id: string, nome: string) => {
    const ok = await confirmar({
      titulo: `Remover o anexo ${nome}?`,
      mensagem: 'O arquivo é apagado e sai do contrato. Não dá para desfazer: anexe de novo se precisar.',
      confirmar: 'Remover',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (!ok) return;
    setErroAnexo((await removerAnexoContrato(id)) || '');
  };

  const acoes = (
    <>
      <button type="button" onClick={() => setEditando(true)} title="Editar" aria-label="Editar contrato" className="btn btn-sm btn-secundario">
        <Pencil aria-hidden="true" />
        <span className="hidden sm:inline">Editar</span>
      </button>
      {encerrado ? (
        currentRole === 'ti_admin' && (
          <button type="button" onClick={reabrir} title="Reabrir" aria-label="Reabrir contrato" className="btn btn-sm btn-secundario">
            <RotateCcw aria-hidden="true" />
            <span className="hidden sm:inline">Reabrir</span>
          </button>
        )
      ) : (
        <>
          <button type="button" onClick={abrirRenovacao} title="Renovar" aria-label="Renovar contrato" className="btn btn-sm btn-secundario">
            <RefreshCw aria-hidden="true" />
            <span className="hidden sm:inline">Renovar</span>
          </button>
          <button type="button" onClick={encerrar} title="Encerrar" aria-label="Encerrar contrato" className="btn btn-sm btn-perigo">
            <Ban aria-hidden="true" />
            <span className="hidden sm:inline">Encerrar</span>
          </button>
        </>
      )}
    </>
  );

  return (
    <>
      <Janela
        tamanho="ficha"
        titulo={`Contrato ${nomeContrato(contrato)}`}
        subtitulo={`${fornecedor?.nome || 'Fornecedor não encontrado'} · ${ROTULO_TIPO_CONTRATO[contrato.tipo]}`}
        icone={<FileSignature className="h-4 w-4" />}
        idTitulo="ficha-contrato-titulo"
        acoes={acoes}
        onFechar={fechar}
        faixa={<Abas itens={abas} ativa={abaAtiva} onMudar={setAba} rotulo="Seções do contrato" />}
      >
        {aviso && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">
            {aviso}
          </p>
        )}
        {erro && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800" role="alert">
            {erro}
          </p>
        )}

        {abaAtiva === 'resumo' && (
          <>
            {encerrado && (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Encerrado em <strong className="font-semibold text-slate-900">{formatDate(contrato.encerradoEm)}</strong>
                {contrato.encerramentoMotivo ? ` · ${contrato.encerramentoMotivo}` : ''}
              </p>
            )}

            {contrato.fim && (
              <div className="cartao flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
                <span className="text-slate-700">
                  {situacao === 'encerrado' ? 'Venceu em ' : 'Vence em '}
                  <strong className="font-semibold text-slate-900">{formatDate(contrato.fim)}</strong>
                  {situacao === 'vencendo' && dias !== undefined && (
                    <span className="font-semibold text-amber-800"> · {dias === 0 ? 'hoje' : `em ${dias} ${dias === 1 ? 'dia' : 'dias'}`}</span>
                  )}
                  {limiteCancelar && !encerrado && (
                    <>
                      {' '}
                      · cancelar até <strong className="font-semibold text-slate-900">{formatDate(limiteCancelar)}</strong>
                    </>
                  )}
                </span>
                <LembreteContrato contrato={contrato} />
              </div>
            )}

            <SecaoResumo titulo="Contrato">
              <Dado rotulo="Fornecedor">{fornecedor?.nome || 'Fornecedor não encontrado'}</Dado>
              <Dado rotulo="Tipo">{ROTULO_TIPO_CONTRATO[contrato.tipo]}</Dado>
              <Dado rotulo="Número">{contrato.numero ? <span className="font-mono">{contrato.numero}</span> : undefined}</Dado>
              <Dado rotulo="Vigência">
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {formatDate(contrato.inicio)} a {contrato.fim ? formatDate(contrato.fim) : 'sem data de fim'}
                  <SeloContrato contrato={contrato} />
                </span>
              </Dado>
              <Dado rotulo="Valor">
                <span className="font-mono">{formatCurrency(contrato.valor)}</span> · {ROTULO_PERIODICIDADE[contrato.periodicidade]}
              </Dado>
              <Dado rotulo="Itens cobertos">{resumoItens(contrato.itens)}</Dado>
              <Dado rotulo="Categoria da despesa">{ROTULO_CATEGORIA[contrato.categoriaDespesa || CATEGORIA_DO_TIPO[contrato.tipo]]}</Dado>
              <Dado rotulo="Área / centro de custo">{contrato.centroCusto || undefined}</Dado>
              <Dado rotulo="Responsável interno">
                {responsavel ? (
                  <button type="button" onClick={() => abrirFicha({ tipo: 'colaborador', id: responsavel.id })} className="link text-left">
                    {responsavel.nome}
                  </button>
                ) : undefined}
              </Dado>
              {(TIPOS_COM_UNIDADE.includes(contrato.tipo) || contrato.unidadeId) && (
                <Dado rotulo="Unidade">{unidade ? `${unidade.nome}${unidade.cidade ? ` · ${unidade.cidade}` : ''}` : undefined}</Dado>
              )}
              {contrato.renovadoDe && (
                <Dado rotulo="Renovação de">
                  {anterior ? (
                    <button type="button" onClick={() => irPara(anterior.id)} className="link text-left">
                      {nomeContrato(anterior)}
                    </button>
                  ) : (
                    'Contrato anterior'
                  )}
                </Dado>
              )}
              {seguinte && (
                <Dado rotulo="Renovado por">
                  <button type="button" onClick={() => irPara(seguinte.id)} className="link text-left">
                    {nomeContrato(seguinte)}
                  </button>
                </Dado>
              )}
            </SecaoResumo>

            <SecaoResumo titulo="Pagamento e renovação">
              <Dado rotulo="Forma de pagamento">{pg?.formaPagamento ? ROTULO_FORMA_PAGAMENTO[pg.formaPagamento] : undefined}</Dado>
              {pg?.formaPagamento === 'cartao' && <Dado rotulo="Cartão">{pg.cartaoFinal ? <span className="font-mono">final {pg.cartaoFinal}</span> : undefined}</Dado>}
              <Dado rotulo="Titular">{pg?.titular || undefined}</Dado>
              <Dado rotulo="Moeda">
                {!pg?.moeda || pg.moeda === 'BRL' ? (
                  'Real (R$)'
                ) : (
                  <span className="font-mono">
                    {pg.moeda}
                    {pg.valorMoeda != null ? ` ${pg.valorMoeda.toFixed(2)}` : ''}
                  </span>
                )}
              </Dado>
              <Dado rotulo="Renovação automática">{pg?.renovacaoAutomatica ? 'Sim' : 'Não'}</Dado>
              <Dado rotulo="Aviso prévio para cancelar">{pg?.avisoCancelamentoDias != null ? `${pg.avisoCancelamentoDias} dias` : undefined}</Dado>
              <Dado rotulo="Cancelar até">{limiteCancelar ? formatDate(limiteCancelar) : undefined}</Dado>
              <Dado rotulo="Reajuste">
                {[contrato.reajusteIndice, contrato.reajusteMes ? `em ${MESES[contrato.reajusteMes - 1]}` : ''].filter(Boolean).join(' ') || undefined}
              </Dado>
              <Dado rotulo="Multa por cancelamento">{contrato.multaCancelamento || undefined}</Dado>
            </SecaoResumo>

            <SecaoResumo titulo="Atendimento">
              <Dado rotulo="SLA" className="sm:col-span-2">
                {contrato.sla || undefined}
              </Dado>
              <Dado rotulo="Contato do suporte" className="sm:col-span-2">
                {contrato.contatoSuporte || undefined}
              </Dado>
            </SecaoResumo>

            {camposDetalhes && (
              <SecaoResumo titulo={`Detalhes · ${ROTULO_TIPO_CONTRATO[contrato.tipo]}`}>
                {camposDetalhes.map((c) => (
                  <Dado key={c.chave} rotulo={c.rotulo}>
                    {contrato.detalhes?.[c.chave] || undefined}
                  </Dado>
                ))}
              </SecaoResumo>
            )}

            {contrato.observacoes && (
              <section className="cartao space-y-2 p-4">
                <h3 className="secao-titulo">Observações</h3>
                <p className="text-xs whitespace-pre-line text-slate-700">{contrato.observacoes}</p>
              </section>
            )}
          </>
        )}

        {abaAtiva === 'itens' && (
          <>
            <p className="text-xs text-slate-600">{resumoItens(contrato.itens)}. Para incluir ou tirar itens, use Editar.</p>
            {contrato.itens.length === 0 ? (
              <Vazio>Nenhum equipamento ou software coberto por este contrato.</Vazio>
            ) : (
              <div className="cartao overflow-hidden">
                <table className="tabela tabela-cartoes">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Tipo</th>
                      <th>Detalhe</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contrato.itens.map((i) => {
                      if (i.ativoId) {
                        const a = assets.find((x) => x.id === i.ativoId);
                        return (
                          <tr key={`a:${i.ativoId}`}>
                            <td data-label="Item" className="font-medium text-slate-900">
                              {a ? (
                                <button type="button" onClick={() => abrirFicha({ tipo: 'ativo', id: a.id })} className="link text-left">
                                  <span className="font-mono">{a.tag}</span> · {a.nome}
                                </button>
                              ) : (
                                'Equipamento não encontrado'
                              )}
                            </td>
                            <td data-label="Tipo">
                              <span className="inline-flex items-center gap-1">
                                <Laptop className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" /> Equipamento
                              </span>
                            </td>
                            <td data-label="Detalhe">{a ? `${a.marca} ${a.modelo}`.trim() || '-' : '-'}</td>
                            <td data-label="Situação">{a ? ROTULO_STATUS_ATIVO[a.status] || a.status : '-'}</td>
                          </tr>
                        );
                      }
                      const l = licenses.find((x) => x.id === i.licencaId);
                      return (
                        <tr key={`l:${i.licencaId}`}>
                          <td data-label="Item" className="font-medium text-slate-900">
                            {l ? (
                              <button type="button" onClick={() => abrirFicha({ tipo: 'software', id: l.id })} className="link text-left">
                                {l.nome}
                              </button>
                            ) : (
                              'Software não encontrado'
                            )}
                          </td>
                          <td data-label="Tipo">
                            <span className="inline-flex items-center gap-1">
                              <Key className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" /> Software
                            </span>
                          </td>
                          <td data-label="Detalhe">{l ? `${l.colaboradoresIds.length} de ${l.assentosTotais} assentos em uso` : '-'}</td>
                          <td data-label="Situação">{l ? ((l.status || 'ativa') === 'ativa' ? 'Ativo' : 'Inativo') : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {abaAtiva === 'linhas' && (
          <>
            <p className="text-xs text-slate-600">Para incluir, editar ou cancelar linhas, use Inventário › Linhas telefônicas.</p>
            {linhasDoContrato.length === 0 ? (
              <Vazio>Nenhuma linha ligada a este contrato.</Vazio>
            ) : (
              <div className="cartao overflow-hidden">
                <table className="tabela tabela-cartoes">
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Pessoa</th>
                      <th>Aparelho</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasDoContrato.map((l) => {
                      const pessoa = employees.find((e) => e.id === l.colaboradorId);
                      const aparelho = assets.find((a) => a.id === l.ativoId);
                      return (
                        <tr key={l.id} className={l.status === 'cancelada' ? 'opacity-60' : ''}>
                          <td data-label="Número" className="font-mono font-semibold text-slate-900">
                            {l.numero}
                            {(l.plano || l.franquia) && (
                              <span className="block font-sans font-normal text-slate-500">{[l.plano, l.franquia].filter(Boolean).join(' · ')}</span>
                            )}
                          </td>
                          <td data-label="Pessoa">
                            {pessoa ? (
                              <button type="button" onClick={() => abrirFicha({ tipo: 'colaborador', id: pessoa.id })} className="link text-left">
                                {pessoa.nome}
                              </button>
                            ) : (
                              <span className="text-slate-500">Em estoque</span>
                            )}
                          </td>
                          <td data-label="Aparelho">
                            {aparelho ? (
                              <button type="button" onClick={() => abrirFicha({ tipo: 'ativo', id: aparelho.id })} className="link font-mono">
                                {aparelho.tag}
                              </button>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td data-label="Situação">
                            <span className={`selo ${SELO_STATUS_LINHA[l.status]}`}>{ROTULO_STATUS_LINHA[l.status]}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Faturas do contrato (o valor e a periodicidade sugeridos são os já salvos) */}
        {abaAtiva === 'faturas' && <FaturasSecao alvo={{ contratoId: contrato.id }} periodicidade={contrato.periodicidade} valorPadrao={contrato.valor} />}

        {abaAtiva === 'anexos' && (
          <>
            {!contrato.arquivoCaminho && anexos.length === 0 ? (
              <Vazio>Nenhum arquivo neste contrato.</Vazio>
            ) : (
              <div className="cartao overflow-hidden">
                <table className="tabela tabela-cartoes">
                  <thead>
                    <tr>
                      <th>Arquivo</th>
                      <th>Tipo</th>
                      <th>Descrição</th>
                      <th>Data</th>
                      <th className="text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contrato.arquivoCaminho && (
                      <tr>
                        <td data-label="Arquivo">
                          <AbrirArquivo caminho={contrato.arquivoCaminho} />
                        </td>
                        <td data-label="Tipo">Arquivo principal</td>
                        <td data-label="Descrição" className="text-slate-500">
                          Troque em Editar › Arquivo e observações
                        </td>
                        <td data-label="Data">-</td>
                        <td data-label="Ações" className="text-right" />
                      </tr>
                    )}
                    {anexos.map((a) => (
                      <tr key={a.id}>
                        <td data-label="Arquivo">
                          <AbrirArquivo caminho={a.arquivoCaminho} />
                        </td>
                        <td data-label="Tipo" className="font-medium text-slate-900">
                          {ROTULO_ANEXO[a.tipo]}
                        </td>
                        <td data-label="Descrição">{a.descricao || '-'}</td>
                        <td data-label="Data">{formatDate(a.criadoEm.slice(0, 10))}</td>
                        <td data-label="Ações" className="text-right">
                          <span className="acoes-linha">
                            <button
                              type="button"
                              onClick={() => removerAnexo(a.id, a.descricao || ROTULO_ANEXO[a.tipo])}
                              title="Remover anexo"
                              aria-label={`Remover o anexo ${a.descricao || ROTULO_ANEXO[a.tipo]}`}
                              className="btn-icone btn-icone-perigo"
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <section className="cartao space-y-3 p-4">
              <h3 className="secao-titulo">Novo anexo</h3>
              <p className="text-xs text-slate-500">Proposta, contrato assinado, aditivos e notas. Até 10 MB; só a T.I. abre.</p>
              <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
                <div>
                  <label htmlFor="anx-tipo" className={CLASSE_ROTULO}>
                    Tipo
                  </label>
                  <select id="anx-tipo" value={anexoTipo} onChange={(e) => setAnexoTipo(e.target.value as TipoAnexoContrato)} className={`${CLASSE_CAMPO} campo-sm`}>
                    {Object.entries(ROTULO_ANEXO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="anx-desc" className={CLASSE_ROTULO}>
                    Descrição
                  </label>
                  <input
                    id="anx-desc"
                    value={anexoDescricao}
                    onChange={(e) => setAnexoDescricao(e.target.value)}
                    className={`${CLASSE_CAMPO} campo-sm`}
                    placeholder="Ex.: 1º aditivo"
                  />
                </div>
                <div>
                  <label htmlFor="anx-arq" className={CLASSE_ROTULO}>
                    Arquivo *
                  </label>
                  <input
                    key={campoArquivo}
                    id="anx-arq"
                    type="file"
                    onChange={(e) => {
                      setErroAnexo('');
                      setAnexoArquivo(e.target.files?.[0] || null);
                    }}
                    className={CLASSE_ARQUIVO}
                  />
                </div>
                <div>
                  <button type="button" disabled={!anexoArquivo || enviandoAnexo} onClick={anexar} className="btn btn-sm btn-primario">
                    <Upload aria-hidden="true" />
                    {enviandoAnexo ? 'Enviando…' : 'Anexar'}
                  </button>
                </div>
              </div>
              {erroAnexo && (
                <p className="erro" role="alert">
                  {erroAnexo}
                </p>
              )}
            </section>
          </>
        )}

        {abaAtiva === 'historico' && <HistoricoAlteracoes entidade="contratos" registro={contrato.id} semBotao />}
      </Janela>

      {/* Janelas por cima da ficha: fora dela, para o fundo desfocado não prender a nova na rolagem */}
      {editando && <ContratoFormModal contrato={contrato} onClose={() => setEditando(false)} />}

      {renovacao && (
        <Janela
          tamanho="p"
          titulo="Renovar contrato"
          subtitulo={nomeContrato(contrato)}
          icone={<RefreshCw className="h-4 w-4" />}
          idTitulo="janela-renovar-contrato"
          onFechar={() => setRenovacao(null)}
          rodape={
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => setRenovacao(null)} className="btn btn-secundario">
                Cancelar
              </button>
              <button type="submit" form="form-renovar-contrato" disabled={renovando} className="btn btn-primario">
                <RefreshCw aria-hidden="true" />
                {renovando ? 'Renovando…' : 'Renovar'}
              </button>
            </div>
          }
        >
          <form id="form-renovar-contrato" onSubmit={renovar} noValidate className="space-y-3">
            <p className="text-xs text-slate-600">
              Cria um contrato novo com os mesmos itens e linhas; este termina na véspera do novo início e fica no histórico.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ren-ini" className={CLASSE_ROTULO}>
                  Novo início *
                </label>
                <input
                  id="ren-ini"
                  type="date"
                  value={renovacao.inicio}
                  onChange={(e) => setRenovacao({ ...renovacao, inicio: e.target.value })}
                  className={CLASSE_CAMPO}
                />
              </div>
              <div>
                <label htmlFor="ren-fim" className={CLASSE_ROTULO}>
                  Novo fim
                </label>
                <input
                  id="ren-fim"
                  type="date"
                  min={renovacao.inicio || undefined}
                  value={renovacao.fim}
                  onChange={(e) => setRenovacao({ ...renovacao, fim: e.target.value })}
                  className={CLASSE_CAMPO}
                />
              </div>
              <div>
                <label htmlFor="ren-valor" className={CLASSE_ROTULO}>
                  Valor (R$)
                </label>
                <CampoMoeda id="ren-valor" valor={renovacao.valor} onMudar={(v) => setRenovacao({ ...renovacao, valor: v })} className={CLASSE_CAMPO} />
              </div>
              <div>
                <label htmlFor="ren-num" className={CLASSE_ROTULO}>
                  Número novo
                </label>
                <input
                  id="ren-num"
                  value={renovacao.numero}
                  onChange={(e) => setRenovacao({ ...renovacao, numero: e.target.value })}
                  placeholder={contrato.numero || ''}
                  className={`${CLASSE_CAMPO} font-mono`}
                />
                <p className="ajuda">Vazio: mantém o número atual.</p>
              </div>
            </div>
            {erroRenovacao && (
              <p className="erro" role="alert">
                {erroRenovacao}
              </p>
            )}
          </form>
        </Janela>
      )}
    </>
  );
};
