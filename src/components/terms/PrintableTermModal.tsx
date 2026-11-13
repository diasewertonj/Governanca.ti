import React, { useState } from 'react';
import { ItemTermo, ResponsibilityTerm } from '../../types/index.ts';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate, formatDateTime } from '../../utils/formatters.ts';
import { Printer, X, CheckCircle2, Upload, FileText, PenLine, Ban } from 'lucide-react';
import { enviarTermoAssinadoDb, linkTemporarioDb, mensagemDeErro, TIPOS_ARQUIVO_ACEITOS } from '../../services/supabaseDb.ts';
import { DOC_DEVOLUCAO_PADRAO, DOC_ENTREGA_PADRAO, SEM_TOMBO } from '../../utils/processos.ts';
import { erroCancelarTermo, situacaoTermo, termoCancelado } from '../../utils/termos.ts';

interface PrintableTermModalProps {
  term: ResponsibilityTerm;
  onClose: () => void;
}

const ROTULO_FORMA: Record<string, string> = {
  pendente: 'Aguardando assinaturas',
  eletronica: 'Assinado eletronicamente',
  documento: 'Assinado (documento anexado)',
  dispensada: 'Assinatura dispensada',
};

/** Caixa de marcação no estilo do formulário em papel */
const Caixa: React.FC<{ marcada: boolean; rotulo: string }> = ({ marcada, rotulo }) => (
  <span className="inline-flex items-center gap-1 mr-2 whitespace-nowrap">
    <span className="font-mono">{marcada ? '☒' : '☐'}</span>
    {rotulo}
  </span>
);

/**
 * Termo no layout do documento controlado da Qualidade (RG.TI.001 entrega /
 * RG.TI.002 devolução, ref. POP.TI.013). Código, versão e título vêm das
 * Configurações; as linhas vêm do checklist do processo (Fase 6) ou, nos
 * termos antigos, dos ativos vinculados.
 * Assinatura híbrida: aceite eletrônico (colaborador + T.I.), documento físico
 * anexado ou dispensa com motivo (ex.: desligamento não amigável).
 */
export const PrintableTermModal: React.FC<PrintableTermModalProps> = ({ term, onClose }) => {
  const {
    settings,
    assets,
    markTermSigned,
    currentRole,
    currentUser,
    terms,
    aceitarTermo,
    dispensarAssinaturaTermo,
    cancelarTermo,
    employees,
  } = useApp();
  const [uploadingSigned, setUploadingSigned] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [dispensando, setDispensando] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  // Usa a versão mais recente do termo (o modal recebe uma cópia do momento da abertura)
  const t = terms.find((x) => x.id === term.id) || term;
  const isEntrega = t.tipo === 'entrega';
  const forma = t.formaAssinatura || (t.statusAssinatura === 'assinado' ? 'documento' : 'pendente');
  // Lote 1: termo cancelado/substituído não recebe mais assinatura
  const cancelado = termoCancelado(t);
  const substituto = terms.find((x) => x.id === t.substituidoPor);
  const situacao = situacaoTermo(t, false, substituto?.codigo);
  const encerrado = forma !== 'pendente' || cancelado;
  const souColaborador = currentUser?.id === t.colaboradorId;

  const padrao = isEntrega ? settings.docEntrega || DOC_ENTREGA_PADRAO : settings.docDevolucao || DOC_DEVOLUCAO_PADRAO;
  const doc = {
    codigo: t.docCodigo || padrao.codigo,
    versao: t.docVersao || padrao.versao,
    referencia: t.docReferencia || padrao.referencia,
    titulo: t.docTitulo || padrao.titulo,
  };
  const textoClausula = t.textoClausula || (isEntrega ? settings.textoTermoEntrega : settings.textoTermoDevolucao);

  // Linhas: do checklist (Fase 6) ou dos ativos vinculados (termos antigos)
  const linhas: ItemTermo[] =
    t.itens && t.itens.length > 0
      ? t.itens
      : assets
          .filter((a) => t.ativoIds.includes(a.id))
          .map((a) => ({
            descricao: a.nome,
            patrimonio: [a.tag, a.serialNumber].filter(Boolean).join(' / '),
            marcaModelo: [a.marca, a.modelo].filter(Boolean).join(' '),
            condicao: 'bom',
            situacao: isEntrega ? 'entregue' : 'devolvido',
            ativoId: a.id,
          }));
  const observacoesLinhas = linhas.filter((l) => l.observacao).map((l) => `${l.descricao}: ${l.observacao}`);
  const pendentes = linhas.filter((l) => l.situacao === 'pendente').map((l) => l.descricao);

  // Documento físico assinado (Storage privado; só a T.I. envia)
  const handleEnviarAssinado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro(null);
    setUploadingSigned(true);
    try {
      const caminho = await enviarTermoAssinadoDb(t.id, arquivo);
      markTermSigned(t.id, caminho);
      setAviso('Documento assinado anexado.');
    } catch (err) {
      setErro(`Não foi possível anexar: ${mensagemDeErro(err)}`);
    } finally {
      setUploadingSigned(false);
    }
  };

  const handleVerAssinado = async () => {
    if (!t.arquivoAssinadoUrl) return;
    setErro(null);
    const janela = window.open('', '_blank');
    try {
      const url = await linkTemporarioDb(t.arquivoAssinadoUrl);
      if (janela) {
        janela.opener = null;
        janela.location.href = url;
      }
    } catch (err) {
      janela?.close();
      setErro(`Não foi possível abrir o termo assinado: ${mensagemDeErro(err)}`);
    }
  };

  const assinar = async () => {
    const quem = souColaborador ? 'Declaro que li e concordo com este termo.' : 'Assinar este termo como responsável da T.I.?';
    if (!window.confirm(`${quem}\n\nO aceite fica registrado com data, hora, usuário e um código de verificação do conteúdo.`))
      return;
    setGravando(true);
    const falha = await aceitarTermo(t.id);
    setGravando(false);
    if (falha) setErro(falha);
    else setAviso('Aceite registrado.');
  };

  const confirmarDispensa = async () => {
    if (!dispensando?.trim()) return setErro('Informe o motivo da dispensa.');
    setGravando(true);
    const falha = await dispensarAssinaturaTermo(t.id, dispensando.trim());
    setGravando(false);
    if (falha) return setErro(falha);
    setDispensando(null);
    setAviso('Dispensa registrada.');
  };

  const confirmarCancelamento = async () => {
    const problema = erroCancelarTermo(cancelando || '');
    if (problema) return setErro(problema);
    setErro(null);
    setGravando(true);
    const falha = await cancelarTermo(t.id, (cancelando || '').trim());
    setGravando(false);
    if (falha) return setErro(falha);
    setCancelando(null);
    setAviso(
      t.chamadoId
        ? 'Termo cancelado. Com o processo ainda aberto, gere o correto no passo "Termo"; termo de entrega também pode ser gerado pela ficha da pessoa.'
        : 'Termo cancelado. Ele continua no histórico com o motivo. Para emitir o correto, use "Gerar termo de entrega" na ficha da pessoa.'
    );
  };

  const podeAceitarColab = !encerrado && souColaborador && !t.aceiteColaboradorEm && Boolean(t.formaAssinatura);
  const podeAceitarTI = !encerrado && isTI && !souColaborador && !t.aceiteTiEm && Boolean(t.formaAssinatura);

  const celula = 'border border-slate-400 px-2 py-1';

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
      <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Barra de ações (fora da impressão) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                {doc.codigo} · {t.codigo}
              </h2>
            </div>
            <p className={`text-xs ${cancelado ? 'text-rose-700' : encerrado ? 'text-emerald-700' : 'text-amber-700'}`}>
              {cancelado
                ? `${situacao.rotulo} em ${formatDate(t.canceladoEm || '')}${
                    t.canceladoPor ? ` por ${employees.find((e) => e.id === t.canceladoPor)?.nome || 'T.I.'}` : ''
                  } — ${t.cancelamentoMotivo || 'sem motivo'}`
                : ROTULO_FORMA[forma]}
              {!cancelado && forma === 'pendente' && (
                <>
                  {' · '}colaborador {t.aceiteColaboradorEm ? '✓' : 'pendente'} · T.I. {t.aceiteTiEm ? '✓' : 'pendente'}
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(podeAceitarColab || podeAceitarTI) && (
              <button
                type="button"
                disabled={gravando}
                onClick={assinar}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <PenLine className="w-3.5 h-3.5" />
                {souColaborador ? 'Li e concordo' : 'Assinar como T.I.'}
              </button>
            )}
            {t.arquivoAssinadoUrl && (
              <button
                type="button"
                onClick={handleVerAssinado}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 hover:bg-emerald-100"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Ver documento assinado
              </button>
            )}
            {isTI && !encerrado && (
              <>
                <label
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer ${
                    uploadingSigned ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingSigned ? 'Enviando...' : 'Anexar assinado (PDF/foto)'}
                  <input
                    type="file"
                    accept={TIPOS_ARQUIVO_ACEITOS.filter((x) => x !== 'text/plain').join(',')}
                    onChange={handleEnviarAssinado}
                    className="sr-only"
                  />
                </label>
                {t.formaAssinatura && (
                  <button
                    type="button"
                    onClick={() => setDispensando(dispensando === null ? '' : null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                  >
                    <Ban className="w-3.5 h-3.5" /> Dispensar assinatura
                  </button>
                )}
              </>
            )}
            {isTI && !cancelado && (
              <button
                type="button"
                onClick={() => setCancelando(cancelando === null ? '' : null)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50"
              >
                <Ban className="w-3.5 h-3.5" /> Cancelar termo
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir A4
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {(aviso || erro || dispensando !== null || cancelando !== null) && (
          <div className="no-print px-6 py-2 border-b border-slate-200 space-y-2 text-xs">
            {aviso && <p className="text-emerald-700">{aviso}</p>}
            {erro && <p className="text-rose-700">{erro}</p>}
            {cancelando !== null && (
              <div className="space-y-1.5">
                <p className="text-slate-600">
                  O termo não é apagado: fica no histórico como cancelado, com o motivo, e não pode mais ser assinado.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={cancelando}
                    onChange={(e) => setCancelando(e.target.value)}
                    placeholder="Motivo (ex.: patrimônio errado; item que não foi entregue)"
                    className="flex-1 min-w-[16rem] px-2.5 py-1.5 border border-slate-300 rounded-md"
                  />
                  <button
                    type="button"
                    disabled={gravando}
                    onClick={confirmarCancelamento}
                    className="px-3 py-1.5 font-semibold text-white bg-rose-600 rounded-md disabled:opacity-50"
                  >
                    Confirmar cancelamento
                  </button>
                </div>
              </div>
            )}
            {dispensando !== null && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={dispensando}
                  onChange={(e) => setDispensando(e.target.value)}
                  placeholder="Motivo (ex.: colaborador não compareceu; desligamento não amigável)"
                  className="flex-1 min-w-[16rem] px-2.5 py-1.5 border border-slate-300 rounded-md"
                />
                <button
                  type="button"
                  disabled={gravando}
                  onClick={confirmarDispensa}
                  className="px-3 py-1.5 font-semibold text-white bg-slate-700 rounded-md disabled:opacity-50"
                >
                  Confirmar dispensa
                </button>
              </div>
            )}
          </div>
        )}

        {/* Folha A4 */}
        <div className="p-8 md:p-10 bg-white sm:max-h-[75vh] sm:overflow-y-auto print:max-h-none print:p-0">
          <div className="print-a4-page mx-auto text-slate-900 text-xs leading-relaxed space-y-5">
            {cancelado && (
              <p className="border-2 border-rose-600 text-rose-700 font-bold uppercase text-center py-1.5 tracking-wider">
                Documento {situacao.rotulo.toLowerCase()} — sem validade
              </p>
            )}
            {/* Cabeçalho do documento controlado */}
            <table className="w-full border-collapse text-[11px]">
              <tbody>
                <tr>
                  <td className={`${celula} w-1/2 font-bold uppercase`} rowSpan={2}>
                    {settings.razaoSocial}
                    <span className="block font-normal normal-case text-slate-600">CNPJ {settings.cnpj}</span>
                  </td>
                  <td className={celula}>
                    <span className="font-semibold">Código:</span> {doc.codigo}
                  </td>
                  <td className={celula}>
                    <span className="font-semibold">Registro:</span> {t.codigo}
                  </td>
                </tr>
                <tr>
                  <td className={celula}>
                    <span className="font-semibold">Área:</span> T.I. · <span className="font-semibold">Versão:</span> {doc.versao}
                  </td>
                  <td className={celula}>
                    <span className="font-semibold">Ref.:</span> {doc.referencia}
                  </td>
                </tr>
                <tr>
                  <td className={`${celula} text-center font-bold uppercase`} colSpan={2}>
                    {doc.titulo}
                  </td>
                  <td className={`${celula} text-center`}>Página 1 de 1</td>
                </tr>
              </tbody>
            </table>

            {/* 1. Identificação */}
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase">1. Identificação</h3>
              <table className="w-full border-collapse text-[11px]">
                <tbody>
                  <tr>
                    <td className={`${celula} w-1/4 font-semibold`}>Data {isEntrega ? 'da entrega' : 'da devolução'}</td>
                    <td className={celula}>{formatDate(t.dataEmissao)}</td>
                    <td className={`${celula} w-1/4 font-semibold`}>Local / Unidade</td>
                    <td className={celula}>{t.localUnidade || settings.cidadeUF}</td>
                  </tr>
                  <tr>
                    <td className={`${celula} font-semibold`}>Colaborador(a)</td>
                    <td className={celula}>
                      {t.colaboradorNome}
                      <span className="text-slate-500"> · Mat. {t.colaboradorMatricula}</span>
                    </td>
                    <td className={`${celula} font-semibold`}>Departamento</td>
                    <td className={celula}>{t.colaboradorSetorNome}</td>
                  </tr>
                  <tr>
                    <td className={`${celula} font-semibold`}>Responsável {isEntrega ? 'pela entrega' : 'pelo recebimento'}</td>
                    <td className={celula}>{t.responsavelTINome}</td>
                    <td className={`${celula} font-semibold`}>Departamento responsável</td>
                    <td className={celula}>T.I.</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* 2. Equipamentos */}
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase">2. Equipamentos {isEntrega ? 'entregues' : 'devolvidos'}</h3>
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100">
                    <th className={`${celula} text-left`}>Equipamento</th>
                    <th className={`${celula} text-left`}>Patrimônio / Nº de série</th>
                    <th className={`${celula} text-left`}>Condição</th>
                    <th className={`${celula} text-left`}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.length > 0 ? (
                    linhas.map((l, i) => (
                      <tr key={`${l.descricao}-${i}`}>
                        <td className={celula}>
                          {l.descricao}
                          {l.marcaModelo && <span className="block text-[10px] text-slate-500">{l.marcaModelo}</span>}
                        </td>
                        <td className={`${celula} font-mono`}>{l.patrimonio || SEM_TOMBO}</td>
                        <td className={celula}>
                          <Caixa marcada={l.condicao === 'bom'} rotulo="Bom" />
                          <Caixa marcada={l.condicao === 'avaria'} rotulo="Avaria" />
                        </td>
                        <td className={celula}>
                          <Caixa
                            marcada={l.situacao === 'entregue' || l.situacao === 'devolvido'}
                            rotulo={isEntrega ? 'Entregue' : 'Devolvido'}
                          />
                          <Caixa marcada={l.situacao === 'pendente'} rotulo="Pendente" />
                          <Caixa marcada={l.situacao === 'na'} rotulo="N/A" />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className={`${celula} text-center text-slate-400`}>
                        Nenhum equipamento listado neste termo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            {/* 3. Observações */}
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase">3. Observações, avarias e itens pendentes</h3>
              <div className="border border-slate-400 min-h-[3.5rem] p-2 text-[11px] space-y-0.5">
                {observacoesLinhas.map((o) => (
                  <p key={o}>• {o}</p>
                ))}
                {pendentes.length > 0 && <p>• Pendente de devolução: {pendentes.join(', ')}</p>}
                {t.observacoes && <p>{t.observacoes}</p>}
              </div>
            </section>

            {/* Declaração */}
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase">Declaração</h3>
              <p className="text-[11px] text-justify">{textoClausula}</p>
            </section>

            {/* Assinaturas */}
            <section className="pt-4 space-y-6">
              <p className="text-right text-[11px]">
                {t.localUnidade || settings.cidadeUF}, {formatDate(t.dataEmissao)}.
              </p>
              <div className="grid grid-cols-2 gap-10 pt-6">
                <div className="text-center space-y-1">
                  <div className="border-b border-slate-500 w-4/5 mx-auto min-h-[1.5rem] text-[10px] italic text-emerald-700">
                    {t.aceiteColaboradorEm && `Aceite eletrônico em ${formatDateTime(t.aceiteColaboradorEm)}`}
                    {forma === 'dispensada' && <span className="text-slate-600">Assinatura dispensada</span>}
                  </div>
                  <p className="font-semibold">{t.colaboradorNome}</p>
                  <p className="text-[10px] text-slate-500">Colaborador(a)</p>
                </div>
                <div className="text-center space-y-1">
                  <div className="border-b border-slate-500 w-4/5 mx-auto min-h-[1.5rem] text-[10px] italic text-emerald-700">
                    {t.aceiteTiEm && `Aceite eletrônico em ${formatDateTime(t.aceiteTiEm)}`}
                  </div>
                  <p className="font-semibold">{t.responsavelTINome}</p>
                  <p className="text-[10px] text-slate-500">Responsável T.I.</p>
                </div>
              </div>
            </section>

            {/* Registro eletrônico (proposta para a versão 03 do documento) */}
            {(t.hashConteudo || forma === 'dispensada') && (
              <section className="border-t border-dashed border-slate-300 pt-2 text-[10px] text-slate-500 space-y-0.5">
                {forma === 'eletronica' && t.dataAssinatura && (
                  <p>Assinado eletronicamente no Nexus em {formatDateTime(t.dataAssinatura)} por ambas as partes.</p>
                )}
                {forma === 'dispensada' && <p>Assinatura do colaborador dispensada pela T.I. Motivo: {t.motivoDispensa}</p>}
                {t.hashConteudo && (
                  <p className="font-mono break-all">Código de verificação do conteúdo (SHA-256): {t.hashConteudo}</p>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
