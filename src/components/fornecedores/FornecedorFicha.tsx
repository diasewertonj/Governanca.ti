import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Pencil, Plus, Power, RotateCcw } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import type { Fatura, PeriodicidadeContrato } from '../../types/index.ts';
import { formatCurrency, formatDate } from '../../utils/formatters.ts';
import { ROTULO_TIPO_CONTRATO, nomeContrato, resumoVinculos, vinculosDoFornecedor } from '../../utils/contratos.ts';
import { ROTULO_FORMA_COBRANCA, despesasRecorrentes, formaCobrancaDe, valorDaFatura } from '../../utils/financeiro.ts';
import { ROTULO_STATUS_FATURA, rotuloCompetencia, statusExibido, totalPagoNoAno, type StatusExibidoFatura } from '../../utils/faturas.ts';
import { ContratoFicha, SeloContrato } from './ContratoFicha.tsx';
import { ContratoFormModal } from './ContratoFormModal.tsx';
import { FornecedorFormModal } from './FornecedorFormModal.tsx';
import { confirmar } from '../ui/dialogo.tsx';
import { Dado, Janela } from '../ui/Janela.tsx';
import { Abas, type ItemAba } from '../ui/Abas.tsx';
import { Vazio } from '../ui/Tela.tsx';

type AbaFicha = 'resumo' | 'contratos' | 'softwares' | 'equipamentos' | 'faturas';

const SUFIXO_PERIODICIDADE: Record<PeriodicidadeContrato, string> = { mensal: '/mês', anual: '/ano', unico: ' (único)' };
const SELO_FATURA: Record<StatusExibidoFatura, string> = { vencida: 'selo-problema', a_pagar: 'selo-atencao', paga: 'selo-ok', cancelada: 'selo-neutro' };
const ROTULO_STATUS_ATIVO: Record<string, string> = { disponivel: 'Disponível', em_uso: 'Em uso', manutencao: 'Em manutenção', descartado: 'Baixado' };
const SELO_STATUS_ATIVO: Record<string, string> = { disponivel: 'selo-ok', em_uso: 'selo-info', manutencao: 'selo-atencao', descartado: 'selo-neutro' };
const ROTULO_ORIGEM: Record<'licenca' | 'contrato' | 'linha', string> = { licenca: 'Software', contrato: 'Contrato', linha: 'Linha' };

/** Linhas da tabela abrem a ficha; o botão do nome cobre teclado e leitor de tela */
const LINHA_CLICAVEL = 'cursor-pointer hover:bg-slate-50/70';

/**
 * Seção 6 · Ficha do fornecedor (só a T.I.): resumo com o custo mensal de hoje,
 * contratos (abre a ficha do contrato), softwares, equipamentos e faturas
 * de tudo o que ele cobra. Editar abre o cadastro; Desativar/Reativar muda a situação.
 */
export const FornecedorFicha: React.FC<{ fornecedorId: string; onClose: () => void }> = ({ fornecedorId, onClose }) => {
  const { fornecedores, contratos, licenses, assets, faturas, editarFornecedor, abrirFicha } = useApp();
  const { linhas } = useRecursos();
  const [aba, setAba] = useState<AbaFicha>('resumo');
  const [editando, setEditando] = useState(false);
  const [contratoAberto, setContratoAberto] = useState<string | null>(null);
  const [novoContrato, setNovoContrato] = useState(false);
  const [mudandoSituacao, setMudandoSituacao] = useState(false);
  const [erro, setErro] = useState('');

  const fornecedor = fornecedores.find((f) => f.id === fornecedorId);
  // Fornecedor excluído (pelo cadastro): fecha a ficha
  useEffect(() => {
    if (!fornecedor) onClose();
  }, [fornecedor, onClose]);
  if (!fornecedor) return null;

  const doFornecedor = (x: { fornecedorId?: string }) => x.fornecedorId === fornecedor.id;
  const seusContratos = contratos.filter(doFornecedor).sort((a, b) => (b.fim || '9999-12-31').localeCompare(a.fim || '9999-12-31'));
  const seusSoftwares = licenses.filter(doFornecedor).sort((a, b) => a.nome.localeCompare(b.nome));
  const seusEquipamentos = assets.filter(doFornecedor).sort((a, b) => a.tag.localeCompare(b.tag));
  const idsContratos = new Set(seusContratos.map((c) => c.id));
  const idsSoftwares = new Set(seusSoftwares.map((l) => l.id));
  const suasFaturas = faturas
    .filter((f) => (f.contratoId && idsContratos.has(f.contratoId)) || (f.licencaId && idsSoftwares.has(f.licencaId)))
    .sort((a, b) => b.competencia.localeCompare(a.competencia) || b.vencimento.localeCompare(a.vencimento));
  const custoMensal = despesasRecorrentes({ licencas: licenses, contratos, linhas }).filter(doFornecedor);
  const totalMensal = custoMensal.reduce((s, d) => s + d.mensal, 0);
  const vinculos = vinculosDoFornecedor(fornecedor.id, { contratos, ativos: assets, licencas: licenses });
  const agora = new Date();
  const ano = agora.getFullYear();

  const fechar = () => onClose();

  const origemFatura = (f: Fatura) => {
    if (f.contratoId) {
      const c = seusContratos.find((x) => x.id === f.contratoId);
      return c ? nomeContrato(c) : 'Contrato';
    }
    return seusSoftwares.find((l) => l.id === f.licencaId)?.nome || 'Software';
  };

  const mudarSituacao = async () => {
    if (mudandoSituacao) return;
    if (
      fornecedor.ativo &&
      !(await confirmar({
        titulo: `Desativar o fornecedor ${fornecedor.nome}?`,
        mensagem: 'Ele sai das listas de escolha de contratos, equipamentos e softwares. O histórico continua e dá para reativar depois.',
        confirmar: 'Desativar',
        cancelar: 'Voltar',
      }))
    )
      return;
    setMudandoSituacao(true);
    const falha = await editarFornecedor(fornecedor.id, { ativo: !fornecedor.ativo });
    setMudandoSituacao(false);
    setErro(falha ? `Não foi possível mudar a situação: ${falha}` : '');
  };

  const abas: ItemAba<AbaFicha>[] = [
    { id: 'resumo', rotulo: 'Resumo' },
    { id: 'contratos', rotulo: 'Contratos', contador: seusContratos.length },
    { id: 'softwares', rotulo: 'Softwares', contador: seusSoftwares.length },
    { id: 'equipamentos', rotulo: 'Equipamentos', contador: seusEquipamentos.length },
    { id: 'faturas', rotulo: 'Faturas', contador: suasFaturas.length },
  ];

  const site = fornecedor.site?.trim();
  const linkSite = site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : '';

  const acoes = (
    <>
      <button type="button" onClick={() => setEditando(true)} title="Editar" aria-label="Editar fornecedor" className="btn btn-sm btn-secundario">
        <Pencil aria-hidden="true" />
        <span className="hidden sm:inline">Editar</span>
      </button>
      {fornecedor.ativo ? (
        <button
          type="button"
          onClick={mudarSituacao}
          disabled={mudandoSituacao}
          title="Desativar"
          aria-label="Desativar fornecedor"
          className="btn btn-sm btn-perigo"
        >
          <Power aria-hidden="true" />
          <span className="hidden sm:inline">Desativar</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={mudarSituacao}
          disabled={mudandoSituacao}
          title="Reativar"
          aria-label="Reativar fornecedor"
          className="btn btn-sm btn-secundario"
        >
          <RotateCcw aria-hidden="true" />
          <span className="hidden sm:inline">Reativar</span>
        </button>
      )}
    </>
  );

  return (
    <>
      <Janela
        tamanho="ficha"
        titulo={fornecedor.nome}
        subtitulo={
          <>
            <span className={`selo ${fornecedor.ativo ? 'selo-ok' : 'selo-neutro'} mr-2`}>{fornecedor.ativo ? 'Ativo' : 'Inativo'}</span>
            {resumoVinculos(vinculos)}
          </>
        }
        icone={<Building2 className="ico" />}
        idTitulo="ficha-fornecedor-titulo"
        acoes={acoes}
        onFechar={fechar}
        faixa={<Abas itens={abas} ativa={aba} onMudar={setAba} rotulo="Seções do fornecedor" />}
      >
        {erro && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800" role="alert">
            {erro}
          </p>
        )}

        {aba === 'resumo' && (
          <>
            <section className="cartao space-y-3 p-4">
              <h3 className="secao-titulo">Cadastro</h3>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
                <Dado rotulo="CNPJ">{fornecedor.cnpj ? <span className="font-mono">{fornecedor.cnpj}</span> : undefined}</Dado>
                <Dado rotulo="Contato">{fornecedor.contato || undefined}</Dado>
                <Dado rotulo="Telefone">{fornecedor.telefone || undefined}</Dado>
                <Dado rotulo="E-mail">
                  {fornecedor.email ? (
                    <a href={`mailto:${fornecedor.email}`} className="link break-all">
                      {fornecedor.email}
                    </a>
                  ) : undefined}
                </Dado>
                <Dado rotulo="Site" className="sm:col-span-2">
                  {linkSite ? (
                    <a href={linkSite} target="_blank" rel="noopener noreferrer" className="link break-all">
                      {site}
                    </a>
                  ) : undefined}
                </Dado>
                <Dado rotulo="Situação">{fornecedor.ativo ? 'Ativo' : 'Inativo (fora das listas de escolha)'}</Dado>
                <Dado rotulo="Cadastrado em">{formatDate(fornecedor.criadoEm ? fornecedor.criadoEm.slice(0, 10) : undefined)}</Dado>
              </dl>
              {fornecedor.observacoes && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="texto-aux">Observações</p>
                  <p className="whitespace-pre-line text-slate-900">{fornecedor.observacoes}</p>
                </div>
              )}
            </section>

            <section className="cartao space-y-3 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="secao-titulo">Custo mensal hoje</h3>
                <span className="num font-semibold text-slate-900">{formatCurrency(totalMensal)}</span>
              </div>
              {custoMensal.length === 0 ? (
                <p className="texto-aux">Nenhum contrato vigente nem software com cobrança própria deste fornecedor.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {custoMensal.map((d) => (
                    <li key={`${d.origem}:${d.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0 text-slate-700">
                        <span className="text-slate-500">{ROTULO_ORIGEM[d.origem]} · </span>
                        {d.nome}
                      </span>
                      <span className="num text-slate-900">{formatCurrency(d.mensal)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="ajuda">Contratos vigentes e softwares com cobrança própria; anual dividido por 12.</p>
            </section>
          </>
        )}

        {aba === 'contratos' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="texto-aux">Clique no contrato para abrir a ficha.</p>
              <button type="button" onClick={() => setNovoContrato(true)} className="btn btn-sm btn-secundario">
                <Plus aria-hidden="true" /> Novo contrato
              </button>
            </div>
            {seusContratos.length === 0 ? (
              <Vazio>Nenhum contrato deste fornecedor.</Vazio>
            ) : (
              <div className="cartao-tabela">
                <table className="tabela tabela-cartoes">
                  <thead>
                    <tr>
                      <th>Contrato</th>
                      <th>Tipo</th>
                      <th>Vigência</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seusContratos.map((c) => (
                      <tr key={c.id} onClick={() => setContratoAberto(c.id)} className={LINHA_CLICAVEL}>
                        <td data-label="Contrato" className="font-semibold text-slate-900">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setContratoAberto(c.id);
                            }}
                            className="link text-left"
                          >
                            {c.numero && <span className="mr-2 font-mono">{c.numero}</span>}
                            {c.descricao}
                          </button>
                        </td>
                        <td data-label="Tipo">{ROTULO_TIPO_CONTRATO[c.tipo]}</td>
                        <td data-label="Vigência">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {c.fim ? `até ${formatDate(c.fim)}` : 'Sem data de fim'}
                            <SeloContrato contrato={c} />
                          </span>
                        </td>
                        <td data-label="Valor" className="num text-slate-800">
                          {formatCurrency(c.valor)}
                          <span className="font-sans text-slate-500">{SUFIXO_PERIODICIDADE[c.periodicidade]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {aba === 'softwares' &&
          (seusSoftwares.length === 0 ? (
            <Vazio>Nenhum software com este fornecedor.</Vazio>
          ) : (
            <div className="cartao-tabela">
              <table className="tabela tabela-cartoes">
                <thead>
                  <tr>
                    <th>Software</th>
                    <th>Como é pago</th>
                    <th className="num">Assentos em uso</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {seusSoftwares.map((l) => {
                    const ativa = (l.status || 'ativa') === 'ativa';
                    return (
                      <tr key={l.id} className={ativa ? '' : 'opacity-60'}>
                        <td data-label="Software" className="font-semibold text-slate-900">
                          <button type="button" onClick={() => abrirFicha({ tipo: 'software', id: l.id })} className="link text-left">
                            {l.nome}
                          </button>
                        </td>
                        <td data-label="Como é pago">{ROTULO_FORMA_COBRANCA[formaCobrancaDe(l, contratos)]}</td>
                        <td data-label="Assentos em uso" className="num">
                          {l.colaboradoresIds.length}/{l.assentosTotais}
                        </td>
                        <td data-label="Situação">
                          <span className={`selo ${ativa ? 'selo-ok' : 'selo-neutro'}`}>{ativa ? 'Ativo' : 'Inativo'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

        {aba === 'equipamentos' &&
          (seusEquipamentos.length === 0 ? (
            <Vazio>Nenhum equipamento com este fornecedor.</Vazio>
          ) : (
            <div className="cartao-tabela">
              <table className="tabela tabela-cartoes">
                <thead>
                  <tr>
                    <th>Patrimônio</th>
                    <th>Equipamento</th>
                    <th>Marca / modelo</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {seusEquipamentos.map((a) => (
                    <tr key={a.id} className={a.status === 'descartado' ? 'opacity-60' : ''}>
                      <td data-label="Patrimônio" className="font-mono font-semibold">
                        <button type="button" onClick={() => abrirFicha({ tipo: 'ativo', id: a.id })} className="link text-left">
                          {a.tag}
                        </button>
                      </td>
                      <td data-label="Equipamento">{a.nome}</td>
                      <td data-label="Marca / modelo">{`${a.marca} ${a.modelo}`.trim() || '-'}</td>
                      <td data-label="Situação">
                        <span className={`selo ${SELO_STATUS_ATIVO[a.status] || 'selo-neutro'}`}>{ROTULO_STATUS_ATIVO[a.status] || a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {aba === 'faturas' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="texto-aux">Faturas dos contratos e softwares deste fornecedor. Para lançar ou pagar, abra o contrato ou o software.</p>
              <span className="texto-aux">
                Pago em {ano}: <span className="num font-semibold text-slate-900">{formatCurrency(totalPagoNoAno(suasFaturas, ano))}</span>
              </span>
            </div>
            {suasFaturas.length === 0 ? (
              <Vazio>Nenhuma fatura lançada.</Vazio>
            ) : (
              <div className="cartao-tabela">
                <table className="tabela tabela-cartoes">
                  <thead>
                    <tr>
                      <th>Origem</th>
                      <th>Competência</th>
                      <th className="num">Valor</th>
                      <th>Vencimento</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suasFaturas.map((f) => {
                      const status = statusExibido(f, agora);
                      return (
                        <tr key={f.id} className={status === 'cancelada' ? 'opacity-60' : ''}>
                          <td data-label="Origem" className="font-semibold text-slate-900">
                            {f.contratoId ? (
                              <button type="button" onClick={() => setContratoAberto(f.contratoId as string)} className="link text-left">
                                {origemFatura(f)}
                              </button>
                            ) : (
                              <button type="button" onClick={() => abrirFicha({ tipo: 'software', id: f.licencaId as string })} className="link text-left">
                                {origemFatura(f)}
                              </button>
                            )}
                          </td>
                          <td data-label="Competência">{rotuloCompetencia(f.competencia)}</td>
                          <td data-label="Valor" className="num text-slate-800">
                            {valorDaFatura(f)}
                          </td>
                          <td data-label="Vencimento">{formatDate(f.vencimento)}</td>
                          <td data-label="Situação">
                            <span className={`selo ${SELO_FATURA[status]}`}>
                              {status === 'paga' && <CheckCircle2 aria-hidden="true" />}
                              {ROTULO_STATUS_FATURA[status]}
                            </span>
                            {f.status === 'paga' && f.pagoEm && <span className="mt-0.5 block text-slate-500">em {formatDate(f.pagoEm)}</span>}
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
      </Janela>

      {/* Janelas por cima da ficha: fora dela, para o fundo desfocado não prender a nova na rolagem */}
      {editando && <FornecedorFormModal fornecedor={fornecedor} onClose={() => setEditando(false)} />}
      {contratoAberto && <ContratoFicha key={contratoAberto} contratoId={contratoAberto} onClose={() => setContratoAberto(null)} />}
      {novoContrato && <ContratoFormModal contrato={null} inicial={{ fornecedorId: fornecedor.id }} onClose={() => setNovoContrato(false)} />}
    </>
  );
};
