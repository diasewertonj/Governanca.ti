import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { CATALOGO_LICENCAS } from '../../data/catalogoLicencas.ts';
import type { CategoriaDespesa, Contrato, FormaCobranca, FormaPagamento, Moeda, SoftwareLicense } from '../../types/index.ts';
import { Key, AlertCircle, Plus } from 'lucide-react';
import { Janela } from '../ui/Janela.tsx';
import { Abas } from '../ui/Abas.tsx';
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
import { confirmar } from '../ui/dialogo.tsx';
import { CampoMoeda, CampoSugestoes } from '../ui/Campos.tsx';
import { FABRICANTES } from '../../utils/especificacoes.ts';

interface SoftwareFormModalProps {
  onClose: () => void;
  softwareToEdit?: SoftwareLicense | null;
}

const CAMPO = 'campo';
const ROTULO = 'rotulo';
const TITULO = 'secao-titulo';

type Escolha = FormaCobranca | 'novo_contrato';
type AbaSoft = 'ident' | 'pagto' | 'assentos';
const ABAS_SOFT: AbaSoft[] = ['ident', 'pagto', 'assentos'];

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
    currentRole,
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
  // Vazio (undefined) = ainda não informado; no cadastro novo começa vazio
  const [valorMensal, setValorMensal] = useState<number | undefined>(softwareToEdit ? (softwareToEdit.valorMensal ?? 0) : undefined);
  // Seção 26: dia do vencimento das faturas automáticas
  const [diaVencimento, setDiaVencimento] = useState(String(softwareToEdit?.diaVencimento ?? 10));
  const [tipoCobranca, setTipoCobranca] = useState<'mensal' | 'anual'>(softwareToEdit?.tipoCobranca || 'mensal');
  const renovacaoInicial = softwareToEdit?.dataRenovacao || '';
  const [dataRenovacao, setDataRenovacao] = useState(renovacaoInicial);
  const pg = softwareToEdit?.pagamento;
  const [moeda, setMoeda] = useState<Moeda>(pg?.moeda || 'BRL');
  const [valorMoeda, setValorMoeda] = useState<number | undefined>(pg?.valorMoeda ?? undefined);
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
  const [aba, setAba] = useState<AbaSoft>('ident');
  const [abasComErro, setAbasComErro] = useState<AbaSoft[]>([]);
  const [salvando, setSalvando] = useState(false);
  // Seção 28: modelo do catálogo; o fornecedor vem se já existir um com o nome do fabricante
  const usarModelo = (id: string) => {
    const m = CATALOGO_LICENCAS.find((x) => x.id === id);
    if (!m) return;
    setNome(m.nome);
    setFabricante(m.fabricante);
    setCategoria(m.categoria);
    setTipoCobranca(m.cobranca);
    const forn = fornecedores.find((f) => f.ativo && f.nome.toLowerCase().includes(m.fabricante.toLowerCase()));
    if (forn && !fornecedorId) setFornecedorId(forn.id);
  };
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
    // Mostra o erro e leva à primeira etapa com problema
    const falha = (msg: string, etapa: AbaSoft) => {
      setErrorMsg(msg);
      setAbasComErro([etapa]);
      setAba(etapa);
    };
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
    if (problema) return falha(problema, /nome/.test(problema) ? 'ident' : /assentos/.test(problema) ? 'assentos' : 'pagto');
    if (escolha === 'contrato' && !contratoId) return falha('Escolha o contrato que paga este software (ou "Criar contrato agora").', 'pagto');
    if (formaPagamento === 'cartao' && cartaoFinal && !/^\d{4}$/.test(cartaoFinal)) return falha('Do cartão, informe só os 4 últimos dígitos.', 'pagto');
    if (urlPainel.trim() && !/^https?:\/\/\S+$/i.test(urlPainel.trim())) return falha('O endereço do painel deve começar com http:// ou https://.', 'assentos');
    if ((propria || escolha === 'novo_contrato') && (valorMensal === undefined || valorMensal < 0)) return falha('Informe o valor (R$).', 'pagto');
    // Fornecedor da licença diferente do fornecedor do contrato escolhido
    const contratoEscolhido = contratos.find((c) => c.id === contratoId);
    if (escolha === 'contrato' && contratoEscolhido && fornecedorId && contratoEscolhido.fornecedorId !== fornecedorId) {
      const ok = (await confirmar('O contrato escolhido é de outro fornecedor. Usar o fornecedor do contrato neste software?'));
      if (!ok) return;
      setFornecedorId(contratoEscolhido.fornecedorId);
    }
    // Deixou de ser pago por contrato: tira a licença dos contratos de licenciamento vigentes (faturas antigas ficam)
    const sairDeContratos =
      escolha !== 'contrato' && escolha !== 'novo_contrato' && softwareToEdit
        ? contratos.filter((c) => contratoVigente(c) && c.tipo === 'licenciamento' && c.itens.some((i) => i.licencaId === softwareToEdit.id))
        : [];
    if (
      sairDeContratos.length &&
      !(await confirmar({
        titulo: `Tirar o software do contrato ${sairDeContratos.map(nomeContrato).join(', ')}?`,
        mensagem:
          'Ao salvar, ele deixa de constar nos itens do contrato; as faturas já lançadas continuam lá.\n\nDá para desfazer: edite o software de novo e escolha "Por um contrato existente".',
        confirmar: 'Tirar do contrato',
        cancelar: 'Voltar',
      }))
    )
      return;
    setErrorMsg(null);
    setAbasComErro([]);

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
      diaVencimento: Math.min(31, Math.max(1, Number(diaVencimento) || 10)),
      dataRenovacao: propria ? dataRenovacao : semCusto ? dataRenovacao : '',
      pagamento: propria
        ? {
            moeda,
            valorMoeda: moeda !== 'BRL' ? valorMoeda : undefined,
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
  const painel = (id: AbaSoft) => (aba === id ? 'space-y-4' : 'hidden');

  return (
    <>
      <Janela
        tamanho="g"
        icone={<Key className="ico" />}
        titulo={isEditing ? `Editar ${softwareToEdit?.nome}` : 'Novo software / assinatura'}
        subtitulo="Identificação, quem cobra, como é pago e assentos"
        onFechar={onClose}
        faixa={
          <Abas
            rotulo="Etapas do cadastro"
            ativa={aba}
            onMudar={setAba}
            itens={ABAS_SOFT.map((id) => ({
              id,
              rotulo: id === 'ident' ? 'Identificação' : id === 'pagto' ? 'Quem cobra e como é pago' : 'Assentos e responsável',
              icone: abasComErro.includes(id) ? <span role="img" aria-label="com erro" className="h-2 w-2 rounded-full bg-red-600" /> : undefined,
            }))}
          />
        }
        rodape={
          <>
            <button type="button" onClick={onClose} className="btn btn-secundario">
              Cancelar
            </button>
            <button type="submit" form="form-software" disabled={salvando} className="btn btn-primario">
              {salvando ? 'Salvando…' : escolha === 'novo_contrato' ? 'Salvar e criar contrato' : isEditing ? 'Salvar alterações' : 'Cadastrar'}
            </button>
          </>
        }
      >
        <form id="form-software" noValidate onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
              <AlertCircle className="ico text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Etapa 1 · Identificação */}
          <div className={painel('ident')}>
            <div className="cartao space-y-2 p-4">
              <h3 className={TITULO}>Identificação</h3>
              {/* Seção 28: começar de um modelo (Microsoft e Google) — preenche, tudo editável */}
              {!isEditing && (
                <div>
                  <label htmlFor="licenca-modelo" className={ROTULO}>Começar de um modelo</label>
                  <select id="licenca-modelo" value="" onChange={(e) => usarModelo(e.target.value)} className={CAMPO}>
                    <option value="">Escolha (opcional): Microsoft 365, Google Workspace…</option>
                    {[...new Set(CATALOGO_LICENCAS.map((m) => m.grupo))].map((g) => (
                      <optgroup key={g} label={g}>
                        {CATALOGO_LICENCAS.filter((m) => m.grupo === g).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome} — {m.descricao}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="ajuda">Preenche nome, fabricante, categoria e cobrança. Assentos, valor e renovação são seus.</p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-2 xl:col-span-2">
                  <label htmlFor="licenca-nome" className={ROTULO}>Nome do software *</label>
                  <input id="licenca-nome" type="text" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Microsoft 365 Business Standard, Figma, ChatGPT Team" className={CAMPO} />
                  {parecidos.length > 0 && (
                    <div className="mt-1 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
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
                            className="link"
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
                  <CampoSugestoes id="licenca-fabricante" value={fabricante} onChange={setFabricante} sugestoes={FABRICANTES.software} placeholder="Ex.: Microsoft, Google" className={CAMPO} />
                </div>
                <div className="md:col-span-2 xl:col-span-2">
                  <label htmlFor="licenca-chave" className={ROTULO}>Chave / ID da assinatura</label>
                  <input id="licenca-chave" type="text" value={chaveContrato} onChange={(e) => setChaveContrato(e.target.value)} placeholder="Opcional" className={`${CAMPO} font-mono`} />
                </div>
              </div>
            </div>
          </div>

          {/* Etapa 2 · Quem cobra e como é pago */}
          <div className={painel('pagto')}>
            <div className="cartao space-y-2 p-4">
              <h3 className={TITULO}>Quem cobra (fornecedor)</h3>
              <label className="inline-flex items-center gap-2 text-slate-700">
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
                  <button type="button" onClick={() => setNovoFornecedor(compradoDireto ? fabricante.trim() : '')} className="btn btn-secundario shrink-0">
                    <Plus /> Novo
                  </button>
                </div>
                <p className="ajuda">Quem emite a cobrança: a revenda ou o próprio fabricante.</p>
                {fornecedorLegado && !fornecedorId && (
                  <p className="mt-1 text-amber-800">Registro antigo: "{fornecedorLegado}" (texto). Escolha o fornecedor do cadastro.</p>
                )}
              </div>
            </div>

            <div className="cartao space-y-3 p-4">
              <h3 className={TITULO}>Como é pago? *</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(['sem_custo', 'propria', 'contrato', 'novo_contrato'] as Escolha[]).map((op) => (
                  <label key={op} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${escolha === op ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
                    <input type="radio" name="como-pago" checked={escolha === op} onChange={() => setEscolha(op)} className="mt-0.5" />
                    <span>
                      <span className="block font-semibold text-slate-900">
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
                    <p className="ajuda">Nenhum contrato vigente deste fornecedor. Use "Criar contrato agora".</p>
                  )}
                </div>
              )}

              {(propria || escolha === 'novo_contrato') && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label htmlFor="licenca-valor" className={ROTULO}>Valor (R$) *</label>
                    <CampoMoeda id="licenca-valor" required valor={valorMensal} onMudar={setValorMensal} className={CAMPO} />
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
                  {propria && (
                    <div>
                      <label htmlFor="licenca-dia-venc" className={ROTULO}>Dia do vencimento</label>
                      <input id="licenca-dia-venc" type="number" min={1} max={31} value={diaVencimento} onChange={(e) => setDiaVencimento(e.target.value)} className={CAMPO} />
                      <p className="ajuda">A fatura é gerada sozinha 30 dias antes.</p>
                    </div>
                  )}
                </div>
              )}

              {propria && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                      <CampoMoeda id="licenca-vmoeda" simbolo={moeda === 'USD' ? 'US$' : moeda === 'EUR' ? '€' : 'R$'} valor={valorMoeda} onMudar={setValorMoeda} className={CAMPO} />
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
                  {/* Seção 17 (decisão 2): o suporte não vê cartão nem titular */}
                  {formaPagamento === 'cartao' && currentRole !== 'ti_suporte' && (
                    <div>
                      <label htmlFor="licenca-cartao" className={ROTULO}>Cartão (4 últimos dígitos)</label>
                      <input id="licenca-cartao" inputMode="numeric" maxLength={4} value={cartaoFinal} onChange={(e) => setCartaoFinal(e.target.value.replace(/\D/g, ''))} className={`${CAMPO} font-mono`} />
                    </div>
                  )}
                  {currentRole !== 'ti_suporte' && (
                    <div>
                      <label htmlFor="licenca-titular" className={ROTULO}>Titular / responsável pelo pagamento</label>
                      <input id="licenca-titular" value={titular} onChange={(e) => setTitular(e.target.value)} className={CAMPO} />
                    </div>
                  )}
                  <div>
                    <label htmlFor="licenca-aviso" className={ROTULO}>Avisar para cancelar com (dias)</label>
                    <input id="licenca-aviso" type="number" min={0} value={avisoDias} onChange={(e) => setAvisoDias(e.target.value)} placeholder="Ex.: 30" className={CAMPO} />
                  </div>
                  <label className="inline-flex items-center gap-2 text-slate-700 md:col-span-3 xl:col-span-4">
                    <input type="checkbox" checked={renovacaoAutomatica} onChange={(e) => setRenovacaoAutomatica(e.target.checked)} /> Renova sozinho (cobrança automática)
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Etapa 3 · Assentos e responsável */}
          <div className={painel('assentos')}>
            <div className="cartao space-y-3 p-4">
              <h3 className={TITULO}>Assentos e responsável</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="licenca-assentos" className={ROTULO}>Total de assentos *</label>
                  {isEditing ? (
                    <>
                      <input id="licenca-assentos" type="number" value={assentosTotais} readOnly aria-readonly="true" className={`${CAMPO} bg-slate-50 font-mono font-semibold`} />
                      <p className="ajuda">
                        {emUso} em uso. Para mudar o total, use "Ajustar total de assentos" na ficha do software (pede motivo e fica no histórico; só o administrador da T.I.).
                      </p>
                    </>
                  ) : (
                    <>
                      <input id="licenca-assentos" type="number" min={Math.max(1, emUso)} required value={assentosTotais} onChange={(e) => setAssentosTotais(Number(e.target.value))} className={`${CAMPO} font-mono font-semibold`} />
                      <p className="ajuda">Quantas pessoas podem usar</p>
                    </>
                  )}
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
                <div className="md:col-span-3 xl:col-span-4">
                  <label htmlFor="licenca-painel" className={ROTULO}>Painel de administração (URL)</label>
                  <input id="licenca-painel" type="url" value={urlPainel} onChange={(e) => setUrlPainel(e.target.value)} placeholder="https://admin.microsoft.com" className={CAMPO} />
                </div>
                <div className="md:col-span-3 xl:col-span-4">
                  <label htmlFor="licenca-obs" className={ROTULO}>Observações</label>
                  <textarea id="licenca-obs" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className={`${CAMPO} p-3`} />
                </div>
              </div>
            </div>
          </div>
        </form>
      </Janela>

      {novoFornecedor !== null && (
        <FornecedorFormModal nomeInicial={novoFornecedor || undefined} onClose={() => setNovoFornecedor(null)} onSalvo={(f) => setFornecedorId(f.id)} />
      )}
    </>
  );
};
