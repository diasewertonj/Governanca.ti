import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { CategoriaDespesa, Contrato, FormaCobranca, FormaPagamento, Moeda, SoftwareLicense } from '../../types/index.ts';
import { X, Key, Save, AlertCircle, Plus } from 'lucide-react';
import { FornecedorFormModal } from '../fornecedores/FornecedorFormModal.tsx';
import { ContratoFormModal } from '../fornecedores/ContratoFormModal.tsx';
import { contratoVigente, nomeContrato } from '../../utils/contratos.ts';
import { formatDate, isoLocal } from '../../utils/formatters.ts';
import { erroLicenca } from '../../utils/licencas.ts';
import {
  ROTULO_CATEGORIA,
  ROTULO_FORMA_COBRANCA,
  ROTULO_FORMA_PAGAMENTO,
  formaCobrancaDe,
  nomesParecidos,
} from '../../utils/financeiro.ts';

interface SoftwareFormModalProps {
  onClose: () => void;
  softwareToEdit?: SoftwareLicense | null;
}

const CAMPO =
  'w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500';
const ROTULO = 'block text-xs font-semibold text-slate-700 mb-1';
const SECAO = 'space-y-2 pt-3 border-t border-slate-100';
const TITULO = 'text-xs font-bold uppercase tracking-wider text-slate-500';

type Escolha = FormaCobranca | 'novo_contrato';

/**
 * Seção 6 · Cadastro de software/assinatura com fonte única do custo.
 * Identificação (aviso de nome repetido) → fabricante e fornecedor (quem cobra;
 * "comprado direto do fabricante") → "Como é pago?" (sem custo / cobrança própria /
 * contrato existente / criar contrato agora, já preenchido) → assentos → área.
 * Só fecha depois de o banco confirmar.
 */
export const SoftwareFormModal: React.FC<SoftwareFormModalProps> = ({ onClose, softwareToEdit }) => {
  const {
    cadastrarLicenca,
    editarLicenca,
    editarContrato,
    setSelectedSoftwareIdFor360,
    setSoftwareToEdit,
    fornecedores,
    contratos,
    licenses,
    employees,
  } = useApp();

  const isEditing = Boolean(softwareToEdit);
  const emUso = softwareToEdit?.colaboradoresIds.length || 0;
  // Contrato que hoje cobre a licença (qualquer tipo vigente com ela nos itens)
  const contratoAtual = softwareToEdit
    ? contratos.find((c) => contratoVigente(c) && c.itens.some((i) => i.licencaId === softwareToEdit.id))
    : undefined;

  const [nome, setNome] = useState(softwareToEdit?.nome || '');
  const [fabricante, setFabricante] = useState(softwareToEdit?.fabricante || '');
  const [compradoDireto, setCompradoDireto] = useState(!!softwareToEdit?.compradoDireto);
  const [chaveContrato, setChaveContrato] = useState(softwareToEdit?.chaveContrato || '');
  const [categoria, setCategoria] = useState<CategoriaDespesa>(softwareToEdit?.categoriaDespesa || 'software');
  const [fornecedorId, setFornecedorId] = useState(softwareToEdit?.fornecedorId || '');
  const [novoFornecedor, setNovoFornecedor] = useState<string | null>(null); // nome sugerido
  const opcoesFornecedor = fornecedores.filter((f) => f.ativo || f.id === fornecedorId);
  const fornecedorLegado = !softwareToEdit?.fornecedorId ? softwareToEdit?.fornecedor : undefined;

  const [escolha, setEscolha] = useState<Escolha>(() => (softwareToEdit ? formaCobrancaDe(softwareToEdit, contratos) : 'propria'));
  const [contratoId, setContratoId] = useState(contratoAtual?.id || '');

  const [assentosTotais, setAssentosTotais] = useState<number>(softwareToEdit?.assentosTotais || 1);
  const [valorMensal, setValorMensal] = useState<number>(softwareToEdit?.valorMensal ?? 0);
  const [tipoCobranca, setTipoCobranca] = useState<'mensal' | 'anual'>(softwareToEdit?.tipoCobranca || 'mensal');
  const renovacaoInicial = softwareToEdit?.dataRenovacao || '';
  const [dataRenovacao, setDataRenovacao] = useState(renovacaoInicial);
  const pg = softwareToEdit?.pagamento;
  const [moeda, setMoeda] = useState<Moeda>(pg?.moeda || 'BRL');
  const [valorMoeda, setValorMoeda] = useState(pg?.valorMoeda != null ? String(pg.valorMoeda) : '');
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | ''>(pg?.formaPagamento || '');
  const [cartaoFinal, setCartaoFinal] = useState(pg?.cartaoFinal || '');
  const [titular, setTitular] = useState(pg?.titular || '');
  const [renovacaoAutomatica, setRenovacaoAutomatica] = useState(pg?.renovacaoAutomatica ?? true);
  const [avisoDias, setAvisoDias] = useState(pg?.avisoCancelamentoDias != null ? String(pg.avisoCancelamentoDias) : '');
  const [centroCusto, setCentroCusto] = useState(softwareToEdit?.centroCusto || '');
  const [responsavelId, setResponsavelId] = useState(softwareToEdit?.responsavelId || '');
  const [urlPainel, setUrlPainel] = useState(softwareToEdit?.urlPainel || '');
  const [observacoes, setObservacoes] = useState(softwareToEdit?.observacoes || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // "Criar contrato agora": depois de gravar a licença, abre o contrato já preenchido
  const [contratoRascunho, setContratoRascunho] = useState<Partial<Contrato> | null>(null);
  const [licencaCriadaId, setLicencaCriadaId] = useState<string | null>(null);

  const parecidos = nomesParecidos(nome, licenses, softwareToEdit?.id);
  const contratosDoFornecedor = contratos.filter(
    (c) => c.status !== 'encerrado' && (!fornecedorId || c.fornecedorId === fornecedorId) && (!c.fim || c.fim >= isoLocal(new Date()))
  );
  const semCusto = escolha === 'sem_custo';
  const propria = escolha === 'propria';

  // "Comprado direto do fabricante": o fabricante é quem cobra
  const marcarDireto = (marcado: boolean) => {
    setCompradoDireto(marcado);
    if (!marcado || !fabricante.trim()) return;
    const achado = nomesParecidos(fabricante, fornecedores.filter((f) => f.ativo))[0];
    if (achado) setFornecedorId(achado.id);
    else setNovoFornecedor(fabricante.trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    const problema = erroLicenca(
      {
        nome,
        fornecedorId,
        assentosTotais: Number(assentosTotais),
        emUso,
        dataRenovacao,
        renovacaoMudou: dataRenovacao !== renovacaoInicial,
        pagaPorContrato: !propria,
        semCusto,
      },
      isoLocal(new Date())
    );
    if (problema) return setErrorMsg(problema);
    if (escolha === 'contrato' && !contratoId) return setErrorMsg('Escolha o contrato que paga este software (ou "Criar contrato agora").');
    if (formaPagamento === 'cartao' && cartaoFinal && !/^\d{4}$/.test(cartaoFinal)) return setErrorMsg('Do cartão, informe só os 4 últimos dígitos.');
    // Fornecedor da licença diferente do fornecedor do contrato escolhido
    const contratoEscolhido = contratos.find((c) => c.id === contratoId);
    if (escolha === 'contrato' && contratoEscolhido && fornecedorId && contratoEscolhido.fornecedorId !== fornecedorId) {
      const ok = window.confirm('O contrato escolhido é de outro fornecedor. Usar o fornecedor do contrato neste software?');
      if (!ok) return;
      setFornecedorId(contratoEscolhido.fornecedorId);
    }
    // Deixou de ser pago por contrato: tira a licença dos contratos de licenciamento vigentes (faturas antigas ficam)
    const sairDeContratos =
      escolha !== 'contrato' && escolha !== 'novo_contrato' && softwareToEdit
        ? contratos.filter((c) => contratoVigente(c) && c.tipo === 'licenciamento' && c.itens.some((i) => i.licencaId === softwareToEdit.id))
        : [];
    if (sairDeContratos.length && !window.confirm(`O software sai do contrato ${sairDeContratos.map(nomeContrato).join(', ')}. As faturas já lançadas continuam lá. Continuar?`)) return;
    setErrorMsg(null);

    const fornecedorFinal = escolha === 'contrato' && contratoEscolhido ? contratoEscolhido.fornecedorId : fornecedorId;
    const dados = {
      nome: nome.trim(),
      fornecedor: fornecedores.find((f) => f.id === fornecedorFinal)?.nome || '',
      fornecedorId: fornecedorFinal || undefined,
      fabricante: fabricante.trim() || undefined,
      compradoDireto,
      chaveContrato: chaveContrato.trim(),
      assentosTotais: Number(assentosTotais),
      formaCobranca: (escolha === 'novo_contrato' ? 'contrato' : escolha) as FormaCobranca,
      // Fora da cobrança própria, custo e renovação vêm do contrato (ou não existem): guarda zerado
      valorMensal: propria ? Number(valorMensal) || 0 : 0,
      tipoCobranca: propria ? tipoCobranca : ('mensal' as const),
      dataRenovacao: propria ? dataRenovacao : semCusto ? dataRenovacao : '',
      pagamento: propria
        ? {
            moeda,
            valorMoeda: moeda !== 'BRL' && valorMoeda !== '' ? Number(valorMoeda) : undefined,
            formaPagamento: formaPagamento || undefined,
            cartaoFinal: formaPagamento === 'cartao' ? cartaoFinal || undefined : undefined,
            titular: titular.trim() || undefined,
            renovacaoAutomatica,
            avisoCancelamentoDias: avisoDias === '' ? undefined : Number(avisoDias),
          }
        : undefined,
      categoriaDespesa: categoria,
      centroCusto: centroCusto.trim() || undefined,
      responsavelId: responsavelId || undefined,
      urlPainel: urlPainel.trim() || undefined,
      observacoes: observacoes.trim() || undefined,
    };

    setSalvando(true);
    let licencaId = softwareToEdit?.id || '';
    if (isEditing && softwareToEdit) {
      const falha = await editarLicenca(softwareToEdit.id, dados);
      if (falha) {
        setSalvando(false);
        return setErrorMsg(`Não foi possível salvar: ${falha}`);
      }
    } else {
      const { item, erro } = await cadastrarLicenca({ ...dados, colaboradoresIds: [] });
      if (!item) {
        setSalvando(false);
        return setErrorMsg(`Não foi possível cadastrar: ${erro || 'erro desconhecido'}`);
      }
      licencaId = item.id;
    }

    // Liga ao contrato escolhido / tira dos antigos
    for (const c of sairDeContratos) {
      await editarContrato(c.id, { itens: c.itens.filter((i) => i.licencaId !== licencaId) });
    }
    if (escolha === 'contrato' && contratoEscolhido && !contratoEscolhido.itens.some((i) => i.licencaId === licencaId)) {
      const falha = await editarContrato(contratoEscolhido.id, { itens: [...contratoEscolhido.itens, { licencaId }] });
      if (falha) {
        setSalvando(false);
        return setErrorMsg(`Software salvo, mas não foi incluído no contrato: ${falha}`);
      }
    }
    setSalvando(false);

    if (escolha === 'novo_contrato') {
      setLicencaCriadaId(licencaId);
      setContratoRascunho({
        fornecedorId: fornecedorFinal,
        tipo: 'licenciamento',
        descricao: nome.trim(),
        itens: [{ licencaId }],
        valor: Number(valorMensal) || 0,
        periodicidade: tipoCobranca,
        inicio: isoLocal(new Date()),
        fim: dataRenovacao || undefined,
        categoriaDespesa: categoria,
        centroCusto: centroCusto.trim() || undefined,
      });
      return;
    }
    onClose();
    setSelectedSoftwareIdFor360(licencaId);
  };

  if (contratoRascunho) {
    return (
      <ContratoFormModal
        contrato={null}
        inicial={contratoRascunho}
        onClose={() => {
          onClose();
          if (licencaCriadaId) setSelectedSoftwareIdFor360(licencaCriadaId);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
      <div className="relative w-full max-w-5xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 sm:overflow-hidden my-0 sm:my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100/70 text-blue-700 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 leading-tight">
                {isEditing ? `Editar ${softwareToEdit?.nome}` : 'Novo software / assinatura'}
              </h2>
              <p className="text-xs text-slate-500">Identificação, quem cobra, como é pago e assentos</p>
            </div>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 sm:max-h-[85vh] sm:overflow-y-auto">
          {/* 1. Identificação */}
          <div className="space-y-2">
            <h3 className={TITULO}>Identificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
              <div className="md:col-span-2 xl:col-span-2">
                <label htmlFor="licenca-nome" className={ROTULO}>Nome do software *</label>
                <input id="licenca-nome" type="text" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Microsoft 365 Business Standard, Figma, ChatGPT Team" className={CAMPO} />
                {parecidos.length > 0 && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1 space-y-1">
                    <p>Já existe parecido:</p>
                    {parecidos.map((l) => (
                      <p key={l.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{l.nome}</span>
                        {l.status === 'inativa' && <span>(inativo — reative em vez de criar outro)</span>}
                        <button
                          type="button"
                          onClick={() => {
                            setSoftwareToEdit(null);
                            onClose();
                            setSelectedSoftwareIdFor360(l.id);
                          }}
                          className="underline"
                        >
                          Abrir
                        </button>
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="licenca-categoria" className={ROTULO}>Categoria</label>
                <select id="licenca-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaDespesa)} className={CAMPO}>
                  {(['software', 'ia', 'nuvem', 'servicos', 'outros'] as CategoriaDespesa[]).map((c) => (
                    <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="licenca-fabricante" className={ROTULO}>Fabricante</label>
                <input id="licenca-fabricante" value={fabricante} onChange={(e) => setFabricante(e.target.value)} placeholder="Ex.: Microsoft, Google" className={CAMPO} />
              </div>
              <div className="md:col-span-2 xl:col-span-2">
                <label htmlFor="licenca-chave" className={ROTULO}>Chave / ID da assinatura</label>
                <input id="licenca-chave" type="text" value={chaveContrato} onChange={(e) => setChaveContrato(e.target.value)} placeholder="Opcional" className={`${CAMPO} font-mono`} />
              </div>
            </div>
          </div>

          {/* 2. Quem cobra */}
          <div className={SECAO}>
            <h3 className={TITULO}>Quem cobra (fornecedor)</h3>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={compradoDireto} onChange={(e) => marcarDireto(e.target.checked)} disabled={!fabricante.trim()} />
              Comprado direto do fabricante {fabricante.trim() ? `(${fabricante.trim()})` : '(preencha o fabricante)'}
            </label>
            <div>
              <label htmlFor="licenca-fornecedor" className={ROTULO}>Fornecedor {semCusto ? '(opcional)' : '*'}</label>
              <div className="flex gap-2">
                <select id="licenca-fornecedor" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className={CAMPO}>
                  <option value="">Escolha…</option>
                  {opcoesFornecedor.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                      {f.ativo ? '' : ' (inativo)'}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setNovoFornecedor(compradoDireto ? fabricante.trim() : '')} className="shrink-0 flex items-center gap-1 px-2.5 text-xs font-semibold text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50">
                  <Plus className="w-3.5 h-3.5" /> Novo
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Quem emite a cobrança: a revenda ou o próprio fabricante.</p>
              {fornecedorLegado && !fornecedorId && (
                <p className="text-xs text-amber-800 mt-1">Registro antigo: "{fornecedorLegado}" (texto). Escolha o fornecedor do cadastro.</p>
              )}
            </div>
          </div>

          {/* 3. Como é pago? */}
          <div className={SECAO}>
            <h3 className={TITULO}>Como é pago? *</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(['sem_custo', 'propria', 'contrato', 'novo_contrato'] as Escolha[]).map((op) => (
                <label key={op} className={`flex items-start gap-2 text-xs p-2.5 rounded-lg border cursor-pointer ${escolha === op ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
                  <input type="radio" name="como-pago" checked={escolha === op} onChange={() => setEscolha(op)} className="mt-0.5" />
                  <span>
                    <span className="font-semibold text-slate-900 block">
                      {op === 'novo_contrato' ? 'Criar contrato agora' : op === 'contrato' ? 'Por um contrato existente' : ROTULO_FORMA_COBRANCA[op]}
                    </span>
                    <span className="text-slate-500">
                      {op === 'sem_custo' && 'Gratuito: sem valor nem faturas.'}
                      {op === 'propria' && 'Valor, renovação e faturas ficam no próprio software.'}
                      {op === 'contrato' && 'Valor, renovação e faturas vêm do contrato.'}
                      {op === 'novo_contrato' && 'Abre o contrato já preenchido com este software.'}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {escolha === 'contrato' && (
              <div>
                <label htmlFor="licenca-contrato" className={ROTULO}>Contrato *</label>
                <select id="licenca-contrato" value={contratoId} onChange={(e) => setContratoId(e.target.value)} className={CAMPO}>
                  <option value="">Escolha…</option>
                  {contratosDoFornecedor.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nomeContrato(c)}
                      {c.fim ? ` (até ${formatDate(c.fim)})` : ''}
                    </option>
                  ))}
                </select>
                {fornecedorId && contratosDoFornecedor.length === 0 && (
                  <p className="text-xs text-slate-500 mt-1">Nenhum contrato vigente deste fornecedor. Use "Criar contrato agora".</p>
                )}
              </div>
            )}

            {(propria || escolha === 'novo_contrato') && (
              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
                <div>
                  <label htmlFor="licenca-valor" className={ROTULO}>Valor (R$) *</label>
                  <input id="licenca-valor" type="number" step="0.01" min={0} required value={valorMensal} onChange={(e) => setValorMensal(Number(e.target.value))} className={`${CAMPO} font-mono`} />
                </div>
                <div>
                  <label htmlFor="licenca-cobranca" className={ROTULO}>Periodicidade</label>
                  <select id="licenca-cobranca" value={tipoCobranca} onChange={(e) => setTipoCobranca(e.target.value as 'mensal' | 'anual')} className={CAMPO}>
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="licenca-renovacao" className={ROTULO}>{escolha === 'novo_contrato' ? 'Fim do contrato' : 'Próxima renovação *'}</label>
                  <input id="licenca-renovacao" type="date" required={propria} value={dataRenovacao} onChange={(e) => setDataRenovacao(e.target.value)} className={CAMPO} />
                </div>
              </div>
            )}

            {propria && (
              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
                <div>
                  <label htmlFor="licenca-moeda" className={ROTULO}>Moeda da cobrança</label>
                  <select id="licenca-moeda" value={moeda} onChange={(e) => setMoeda(e.target.value as Moeda)} className={CAMPO}>
                    <option value="BRL">Real (R$)</option>
                    <option value="USD">Dólar (US$)</option>
                    <option value="EUR">Euro (€)</option>
                  </select>
                </div>
                {moeda !== 'BRL' && (
                  <div>
                    <label htmlFor="licenca-vmoeda" className={ROTULO}>Valor em {moeda}</label>
                    <input id="licenca-vmoeda" type="number" step="0.01" min={0} value={valorMoeda} onChange={(e) => setValorMoeda(e.target.value)} className={`${CAMPO} font-mono`} />
                  </div>
                )}
                <div>
                  <label htmlFor="licenca-pgto" className={ROTULO}>Forma de pagamento</label>
                  <select id="licenca-pgto" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento | '')} className={CAMPO}>
                    <option value="">—</option>
                    {Object.entries(ROTULO_FORMA_PAGAMENTO).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                {formaPagamento === 'cartao' && (
                  <div>
                    <label htmlFor="licenca-cartao" className={ROTULO}>Cartão (4 últimos dígitos)</label>
                    <input id="licenca-cartao" inputMode="numeric" maxLength={4} value={cartaoFinal} onChange={(e) => setCartaoFinal(e.target.value.replace(/\D/g, ''))} className={`${CAMPO} font-mono`} />
                  </div>
                )}
                <div>
                  <label htmlFor="licenca-titular" className={ROTULO}>Titular / responsável pelo pagamento</label>
                  <input id="licenca-titular" value={titular} onChange={(e) => setTitular(e.target.value)} className={CAMPO} />
                </div>
                <div>
                  <label htmlFor="licenca-aviso" className={ROTULO}>Avisar para cancelar com (dias)</label>
                  <input id="licenca-aviso" type="number" min={0} value={avisoDias} onChange={(e) => setAvisoDias(e.target.value)} placeholder="Ex.: 30" className={CAMPO} />
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 md:col-span-3 xl:col-span-4">
                  <input type="checkbox" checked={renovacaoAutomatica} onChange={(e) => setRenovacaoAutomatica(e.target.checked)} /> Renova sozinho (cobrança automática)
                </label>
              </div>
            )}
          </div>

          {/* 4. Assentos e responsável */}
          <div className={SECAO}>
            <h3 className={TITULO}>Assentos e responsável</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
              <div>
                <label htmlFor="licenca-assentos" className={ROTULO}>Total de assentos *</label>
                <input id="licenca-assentos" type="number" min={Math.max(1, emUso)} required value={assentosTotais} onChange={(e) => setAssentosTotais(Number(e.target.value))} className={`${CAMPO} font-mono font-bold`} />
                <span className="text-xs text-slate-500 mt-0.5 block">{isEditing ? `${emUso} em uso` : 'Quantas pessoas podem usar'}</span>
              </div>
              <div>
                <label htmlFor="licenca-cc" className={ROTULO}>Área / centro de custo</label>
                <input id="licenca-cc" value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)} className={CAMPO} />
              </div>
              <div>
                <label htmlFor="licenca-resp" className={ROTULO}>Responsável interno</label>
                <select id="licenca-resp" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className={CAMPO}>
                  <option value="">—</option>
                  {employees.filter((e) => e.status !== 'desligado').map((e) => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className={SECAO}>
            <label htmlFor="licenca-painel" className={ROTULO}>Painel de administração (URL)</label>
            <input id="licenca-painel" type="url" value={urlPainel} onChange={(e) => setUrlPainel(e.target.value)} placeholder="https://admin.microsoft.com" className={CAMPO} />
          </div>
          <div>
            <label htmlFor="licenca-obs" className={ROTULO}>Observações</label>
            <textarea id="licenca-obs" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className={`${CAMPO} p-3`} />
          </div>

          {errorMsg && (
            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />
              <span>{salvando ? 'Salvando…' : escolha === 'novo_contrato' ? 'Salvar e criar contrato' : isEditing ? 'Salvar alterações' : 'Cadastrar'}</span>
            </button>
          </div>
        </form>
      </div>

      {novoFornecedor !== null && (
        <FornecedorFormModal nomeInicial={novoFornecedor || undefined} onClose={() => setNovoFornecedor(null)} onSalvo={(f) => setFornecedorId(f.id)} />
      )}
    </div>
  );
};
