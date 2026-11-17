import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { Asset, AssetCategory } from '../../types/index.ts';
import { Copy, Package, Plus } from 'lucide-react';
import { Janela } from '../ui/Janela.tsx';
import { Abas } from '../ui/Abas.tsx';
import { CampoMascara, CampoMoeda, CampoSugestoes } from '../ui/Campos.tsx';
import { confirmarMovimento } from '../ui/dialogo.tsx';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { TIPOS_ARQUIVO_ACEITOS, validarArquivo } from '../../services/supabaseDb.ts';
import { isoLocal } from '../../utils/formatters.ts';
import { erroDuplicadoAtivo, proximaTag } from '../../utils/patrimonio.ts';
import { MASCARAS, aplicarMascara, soDigitos } from '../../utils/mascaras.ts';
import {
  CHAVE,
  CHAVES_ESTRUTURADAS,
  CPU_FABRICANTES,
  CPU_LINHAS,
  DICA_CPU_MODELO,
  DISCO_CAPACIDADES,
  DISCO_TIPOS,
  MEMORIA_TAMANHOS,
  MEMORIA_TIPOS,
  SISTEMAS_OPERACIONAIS,
  TIPOS_EQUIPAMENTO,
  fabricantesDaCategoria,
  gravarEspecificacoes,
  lerEspecificacoes,
  nomeSugerido,
  type Especificacoes,
} from '../../utils/especificacoes.ts';
import { avisoSegundoAtivo, classeDoAtivo, exigeTermo } from '../../utils/inventario.ts';
import { FornecedorFormModal } from '../fornecedores/FornecedorFormModal.tsx';

interface NewAssetModalProps {
  onClose: () => void;
  /** Fase 8: quando informado, o formulário edita este ativo (a custódia muda só por "Transferir") */
  ativo?: Asset;
  /** Seção 9: pré-preenche um cadastro novo (ex.: cadastro rápido no checklist) */
  inicial?: Partial<Asset>;
  /** Seção 9.3: "Duplicar" — mesmo lote; limpa o que é único (patrimônio, série, Service Tag, IMEI, MAC, BitLocker, custódia) */
  duplicarDe?: Asset;
  /** Se vier, é chamado com o ativo criado no lugar de abrir a ficha */
  onCriado?: (a: Asset) => void;
}

const CATEGORIA_LABEL: Record<string, string> = {
  hardware: 'Hardware',
  software: 'Software',
  periferico: 'Periférico',
  telefonia: 'Telefonia',
};

const LOCAL_PADRAO = 'Almoxarifado T.I. - Armário B3';
const SO_PADRAO = 'Windows 11 Pro 64-bit';

type AbaAtivo = 'ident' | 'tecnico' | 'custodia' | 'fiscal';
const ABAS_ATIVO: [AbaAtivo, string][] = [
  ['ident', 'Identificação'],
  ['tecnico', 'Técnico'],
  ['custodia', 'Custódia'],
  ['fiscal', 'Fiscal e garantia'],
];

/** Duplicar: mantém o que é do lote e limpa o que é único de cada aparelho */
function copiaDoLote(a: Asset): Partial<Asset> {
  const cf = { ...(a.customFields || {}) };
  for (const k of [CHAVE.serviceTag, CHAVE.imei, CHAVE.mac]) delete cf[k];
  return {
    nome: a.nome,
    categoria: a.categoria,
    marca: a.marca,
    modelo: a.modelo,
    customFields: cf,
    sistemaOperacional: a.sistemaOperacional,
    fornecedorId: a.fornecedorId,
    fiscal: a.fiscal ? { ...a.fiscal } : undefined,
    setorId: a.setorId,
    // Em uso, a localização é "Em posse de…": não serve para o novo, que entra no estoque
    localizacaoFisica: a.custodianteId ? undefined : a.localizacaoFisica,
    observacoes: a.observacoes,
  };
}

/** Opções do select com o valor atual (lido de dado antigo) quando ele não está na lista */
const comAtual = (lista: string[], atual?: string) => (atual && !lista.includes(atual) ? [atual, ...lista] : lista);

export const NewAssetModal: React.FC<NewAssetModalProps> = ({ onClose, ativo, inicial, duplicarDe, onCriado }) => {
  const {
    assets,
    departments,
    employees,
    fornecedores,
    cadastrarAtivo,
    editarAtivo,
    anexarArquivoAtivo,
    settings,
    setSelectedAssetIdFor360,
  } = useApp();

  // De onde vêm os valores iniciais: o ativo em edição, a cópia do lote ou o pré-preenchimento
  const [origem] = useState<Partial<Asset>>(() => ativo ?? (duplicarDe ? copiaDoLote(duplicarDe) : inicial ?? {}));
  const fiscalAtual = origem.fiscal;
  const cfOrigem = origem.customFields || {};

  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<AbaAtivo>('ident');
  const [abasComErro, setAbasComErro] = useState<AbaAtivo[]>([]);

  // Lote 1: próxima tag = maior número já usado + 1 (não repete tag existente)
  const [tag, setTag] = useState(() => origem.tag ?? proximaTag(assets));
  const [categoria, setCategoria] = useState<AssetCategory>(origem.categoria ?? 'hardware');
  const [marca, setMarca] = useState(origem.marca ?? '');
  const [modelo, setModelo] = useState(origem.modelo ?? '');
  const [serialNumber, setSerialNumber] = useState(origem.serialNumber ?? '');
  // Seção 9.3: Service Tag, IMEI e MAC ficam em customFields
  const [serviceTag, setServiceTag] = useState(cfOrigem[CHAVE.serviceTag] ?? '');
  const [imei, setImei] = useState(() => aplicarMascara('imei', cfOrigem[CHAVE.imei] ?? ''));
  const [mac, setMac] = useState(() => aplicarMascara('mac', cfOrigem[CHAVE.mac] ?? ''));
  const [localizacaoFisica, setLocalizacaoFisica] = useState(origem.localizacaoFisica ?? LOCAL_PADRAO);
  const [setorId, setSetorId] = useState(origem.setorId ?? 'dep-1');
  const [custodianteId, setCustodianteId] = useState(origem.custodianteId ?? '');

  // Especificações estruturadas (as partes ficam em customFields)
  const [especInicial] = useState<Especificacoes>(() => lerEspecificacoes(cfOrigem));
  const [espec, setEspec] = useState<Especificacoes>(especInicial);
  const mudarEspec = (k: keyof Especificacoes, v: string) => setEspec((e) => ({ ...e, [k]: v || undefined }));
  const mudarCpuFabricante = (v: string) =>
    setEspec((e) => {
      const linhas = CPU_LINHAS[v];
      const manterLinha = !linhas || !e.cpuLinha || linhas.includes(e.cpuLinha);
      return { ...e, cpuFabricante: v || undefined, cpuLinha: manterLinha ? e.cpuLinha : undefined };
    });

  // Nome sugerido: acompanha tipo, marca, modelo e especificações enquanto a pessoa não editar
  const sugestao = nomeSugerido({ tipo: espec.tipo, marca, modelo, espec: categoria === 'hardware' ? espec : undefined });
  const [nomeManual, setNomeManual] = useState(origem.nome ?? '');
  const [nomeEditado, setNomeEditado] = useState(() => {
    const n = (origem.nome ?? '').trim();
    const sugerido = nomeSugerido({
      tipo: especInicial.tipo,
      marca: origem.marca,
      modelo: origem.modelo,
      espec: (origem.categoria ?? 'hardware') === 'hardware' ? especInicial : undefined,
    });
    return n !== '' && n !== sugerido;
  });
  const nome = nomeEditado ? nomeManual : sugestao;

  // Dados fiscais
  const [numeroNF, setNumeroNF] = useState(fiscalAtual?.numeroNF ?? '');
  const [chaveNfe, setChaveNfe] = useState(() => aplicarMascara('chave_nfe', fiscalAtual?.chaveAcesso44 ?? ''));
  const [valorCompra, setValorCompra] = useState<number | undefined>(fiscalAtual?.valorCompra || undefined);
  // Fase 8: fornecedor do cadastro; o texto antigo fica (e aparece) enquanto não houver vínculo
  const [fornecedorId, setFornecedorId] = useState(origem.fornecedorId ?? '');
  const [fornecedor] = useState(fiscalAtual?.fornecedor ?? '');
  const [novoFornecedor, setNovoFornecedor] = useState(false);
  const opcoesFornecedor = fornecedores.filter((f) => f.ativo || f.id === fornecedorId);
  const [dataAquisicao, setDataAquisicao] = useState(() => fiscalAtual?.dataAquisicao ?? isoLocal(new Date()));
  const [dataGarantia, setDataGarantia] = useState(fiscalAtual?.dataGarantia ?? '');
  const [suporteContato, setSuporteContato] = useState(fiscalAtual?.suporteContato ?? '');

  // Segurança e SO (Hardware)
  const [sistemaOperacional, setSistemaOperacional] = useState(
    ativo ? ativo.sistemaOperacional ?? '' : origem.sistemaOperacional ?? SO_PADRAO
  );
  const [bitlockerKey, setBitlockerKey] = useState(origem.bitlockerKey ?? '');

  // Campos personalizados (os estruturados acima não aparecem de novo aqui)
  const [customFields, setCustomFields] = useState<Record<string, string>>(() => ({ ...cfOrigem }));

  // Fase 8: observações e nota fiscal (o arquivo só sobe ao salvar)
  const [observacoes, setObservacoes] = useState(origem.observacoes ?? '');
  const [notaFiscal, setNotaFiscal] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState('');

  const availableCustomFields = settings.camposPersonalizados.filter(
    (cf) => cf.categoria === categoria && !CHAVES_ESTRUTURADAS.has(cf.key)
  );
  const temImei = categoria === 'telefonia';
  const temMac = categoria === 'hardware' || categoria === 'telefonia';
  const tipos = TIPOS_EQUIPAMENTO[categoria] || [];
  const linhasCpu = CPU_LINHAS[espec.cpuFabricante || ''] || Object.values(CPU_LINHAS).flat();

  // Aviso ao fechar com alterações não salvas
  const valores = JSON.stringify([tag, nome, categoria, marca, modelo, serialNumber, serviceTag, imei, mac, espec,
    localizacaoFisica, setorId, custodianteId, numeroNF, chaveNfe, valorCompra, fornecedorId, fornecedor, dataAquisicao,
    dataGarantia, suporteContato, sistemaOperacional, bitlockerKey, customFields, observacoes]);
  const [valoresIniciais] = useState(valores);
  const itensPendentes =
    valores !== valoresIniciais || notaFiscal
      ? [ativo ? `Edição do ativo ${ativo.tag} não salva` : 'Ativo novo não cadastrado']
      : [];
  useRegistrarPendencias(ativo ? `ativo:${ativo.id}` : 'novo-ativo', itensPendentes);

  const fechar = () => {
    void confirmarDescarte(itensPendentes).then((ok) => ok && onClose());
  };

  const escolherNotaFiscal = (arquivo: File | undefined) => {
    if (!arquivo) return;
    const erro = validarArquivo(arquivo);
    setErroArquivo(erro || '');
    setNotaFiscal(erro ? null : arquivo);
  };

  /** customFields final: campos genéricos + Service Tag/IMEI/MAC + especificações */
  const montarCustomFields = (): Record<string, string> => {
    let cf: Record<string, string> = { ...customFields };
    const por = (chave: string, valor: string) => {
      if (valor.trim()) cf[chave] = valor.trim();
      else delete cf[chave];
    };
    por(CHAVE.serviceTag, serviceTag);
    // IMEI: só os dígitos quando a máscara entendeu; texto diferente fica como foi digitado
    if (temImei) por(CHAVE.imei, MASCARAS.imei.aceita.test(imei) ? soDigitos(imei) : imei);
    if (temMac) por(CHAVE.mac, mac);
    if (categoria === 'hardware') {
      // Sem mexer nas especificações, o texto antigo (ex.: "Intel Core i7 (10 cores…)") fica como estava
      if (JSON.stringify(espec) !== JSON.stringify(especInicial)) cf = gravarEspecificacoes(cf, espec);
    } else {
      por(CHAVE.tipo, espec.tipo || '');
    }
    return Object.fromEntries(Object.entries(cf).filter(([, v]) => v && v.trim()));
  };

  // Lote 1: só fecha depois do banco confirmar; se recusar, o erro aparece aqui e nada se perde
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    // Campos obrigatórios por etapa (etapas ocultas não bloqueiam o envio do navegador)
    const faltas: AbaAtivo[] = [];
    if (!nome.trim() || !tag.trim() || !marca.trim() || !serialNumber.trim()) faltas.push('ident');
    if (!custodianteId && !localizacaoFisica.trim()) faltas.push('custodia');
    if (faltas.length) {
      setAbasComErro(faltas);
      setAba(faltas[0]);
      return setErroSalvar('Preencha os campos obrigatórios (*) das etapas marcadas.');
    }
    const duplicado = erroDuplicadoAtivo(
      assets,
      !ativo || tag.trim() !== ativo.tag ? tag : '',
      !ativo || serialNumber.trim() !== ativo.serialNumber ? serialNumber : '',
      ativo?.id
    );
    if (duplicado) {
      setAbasComErro(['ident']);
      setAba('ident');
      return setErroSalvar(duplicado);
    }
    setErroSalvar(null);
    setAbasComErro([]);

    const cfFinal = montarCustomFields();
    const fiscal = {
      ...(fiscalAtual || {}),
      numeroNF: numeroNF.trim(),
      // Seção 9.3: a chave da NF-e é gravada só com os dígitos
      chaveAcesso44: soDigitos(chaveNfe),
      valorCompra: valorCompra ?? 0,
      // Com vínculo, o texto passa a ser o nome do cadastro; sem vínculo, fica o legado
      fornecedor: fornecedores.find((f) => f.id === fornecedorId)?.nome || fornecedor.trim(),
      dataAquisicao,
      dataGarantia,
      suporteContato: suporteContato.trim(),
    };

    if (ativo) {
      setSalvando(true);
      const falha = await editarAtivo(ativo.id, {
        tag: tag.trim(),
        nome: nome.trim(),
        categoria,
        marca: marca.trim(),
        modelo: modelo.trim(),
        serialNumber: serialNumber.trim(),
        localizacaoFisica: ativo.custodianteId ? ativo.localizacaoFisica : localizacaoFisica.trim(),
        setorId,
        sistemaOperacional: categoria === 'hardware' ? sistemaOperacional.trim() || undefined : undefined,
        bitlockerKey: categoria === 'hardware' && bitlockerKey.trim() ? bitlockerKey.trim() : undefined,
        fiscal,
        customFields: cfFinal,
        observacoes: observacoes.trim() || undefined,
        fornecedorId: fornecedorId || undefined,
      });
      setSalvando(false);
      if (falha) return setErroSalvar(`Não foi possível salvar: ${falha}`);
      if (notaFiscal) void anexarArquivoAtivo(ativo.id, notaFiscal, 'nota_fiscal');
      onClose();
      return;
    }

    const today = isoLocal(new Date());
    const custodian = employees.find((emp) => emp.id === custodianteId);
    const isEmUso = Boolean(custodian);

    // Seção 9.1/9.6: entregar já no cadastro passa pela confirmação do movimento
    let observacaoEntrega = 'Alocação inicial no cadastro do ativo';
    if (custodian) {
      const provisorio = { id: '', tag: tag.trim(), categoria, nome: nome.trim(), customFields: cfFinal };
      const aviso = avisoSegundoAtivo(provisorio, custodian.id, assets);
      const classe = classeDoAtivo(provisorio);
      const resposta = await confirmarMovimento({
        titulo: 'Cadastrar e entregar o equipamento',
        item: `${tag.trim()} · ${nome.trim()}`,
        de: 'Estoque (cadastro novo)',
        para: custodian.nome,
        efeitos: [
          'O equipamento é cadastrado com a situação "Em uso".',
          `A entrega para ${custodian.nome} fica registrada hoje no histórico de custódia.`,
        ],
        foraDoNexus: [
          `Entregar o equipamento a ${custodian.nome}.`,
          ...(classe === 'computador' ? ['Criar o usuário da pessoa no computador e incluir no MDM, se for o caso.'] : []),
          ...(classe === 'celular' ? ['Configurar a conta da pessoa no aparelho e incluir no MDM, se for o caso.'] : []),
        ],
        termo: exigeTermo(provisorio, settings.termoExige)
          ? `O termo de ${custodian.nome} ficará desatualizado até gerar o termo atualizado na ficha da pessoa (não bloqueia).`
          : 'Este item não exige termo.',
        justificativa: aviso ? { aviso } : undefined,
        desfazer: 'Dá para desfazer pela ficha do equipamento (Transferir custódia → devolver ao estoque).',
        confirmar: 'Cadastrar e entregar',
      });
      if (!resposta) return;
      if (resposta.justificativa) observacaoEntrega = `Alocação inicial no cadastro do ativo — justificativa: ${resposta.justificativa}`;
    }

    setSalvando(true);
    const { item: created, erro: falhaCadastro } = await cadastrarAtivo({
      tag: tag.trim(),
      nome: nome.trim(),
      categoria,
      marca: marca.trim(),
      modelo: modelo.trim(),
      serialNumber: serialNumber.trim(),
      localizacaoFisica: custodian ? `Home Office / Em posse de ${custodian.nome}` : localizacaoFisica.trim(),
      setorId,
      custodianteId: custodian?.id,
      status: isEmUso ? 'em_uso' : 'disponivel',
      dataEntregaAtual: isEmUso ? today : undefined,
      sistemaOperacional: categoria === 'hardware' ? sistemaOperacional.trim() || undefined : undefined,
      bitlockerKey: categoria === 'hardware' && bitlockerKey.trim() ? bitlockerKey.trim() : undefined,
      fiscal,
      customFields: cfFinal,
      observacoes: observacoes.trim() || undefined,
      fornecedorId: fornecedorId || undefined,
      historicoCustodia: custodian
        ? [
            {
              id: `cust-${Date.now()}`,
              colaboradorId: custodian.id,
              colaboradorNome: custodian.nome,
              dataEntrega: today,
              observacoes: observacaoEntrega,
            },
          ]
        : [],
      historicoManutencao: [],
    });
    setSalvando(false);
    if (!created) return setErroSalvar(`Não foi possível cadastrar: ${falhaCadastro || 'erro desconhecido'}`);
    if (notaFiscal) void anexarArquivoAtivo(created.id, notaFiscal, 'nota_fiscal');

    onClose();
    if (onCriado) onCriado(created);
    else setSelectedAssetIdFor360(created.id);
  };

  const painel = (id: AbaAtivo) => (aba === id ? 'space-y-4' : 'hidden');
  const grade = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4';
  const gradeTecnica = 'grid grid-cols-2 gap-4 md:grid-cols-4';
  const nfOriginal = duplicarDe?.anexos?.some((a) => a.categoria === 'nota_fiscal');

  return (
    <>
      <Janela
        tamanho="g"
        icone={duplicarDe ? <Copy className="h-4 w-4" /> : <Package className="h-4 w-4" />}
        titulo={ativo ? `Editar ativo ${ativo.tag}` : duplicarDe ? `Duplicar ativo ${duplicarDe.tag} (mesmo lote)` : 'Novo ativo patrimonial de T.I.'}
        subtitulo={
          ativo
            ? 'Corrija os dados do ativo. A custódia muda pelo botão "Transferir" da ficha.'
            : duplicarDe
              ? 'Mesmo modelo, especificações e compra. Preencha o que é único: série, Service Tag, IMEI.'
              : 'Controle de patrimônio, gestão fiscal e rastreabilidade 1:1'
        }
        onFechar={fechar}
        faixa={
          <Abas
            rotulo="Etapas do cadastro"
            ativa={aba}
            onMudar={setAba}
            itens={ABAS_ATIVO.map(([id, rotulo]) => ({
              id,
              rotulo,
              icone: abasComErro.includes(id) ? <span role="img" aria-label="com erro" className="h-2 w-2 rounded-full bg-red-600" /> : undefined,
            }))}
          />
        }
        rodape={
          <>
            <button type="button" onClick={fechar} className="btn btn-secundario">
              Cancelar
            </button>
            <button type="submit" form="form-ativo" disabled={salvando} className="btn btn-primario">
              {salvando ? 'Salvando…' : ativo ? 'Salvar alterações' : 'Cadastrar ativo'}
            </button>
          </>
        }
      >
        <form id="form-ativo" noValidate onSubmit={handleSubmit} className="space-y-4">
          {erroSalvar && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
              {erroSalvar}
            </p>
          )}

          {/* Etapa 1 · Identificação */}
          <div className={painel('ident')}>
            <div className="cartao space-y-3 p-4">
              <h3 className="secao-titulo">Identificação</h3>
              {duplicarDe && (
                <p className="ajuda">
                  Copiado de {duplicarDe.tag}. O patrimônio sugerido é o próximo livre; número de série, Service Tag, IMEI, MAC, BitLocker e quem está
                  com ele ficam em branco.
                </p>
              )}
              <div className={grade}>
                <div>
                  <label htmlFor="ativo-categoria" className="rotulo">Categoria</label>
                  <select id="ativo-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as AssetCategory)} className="campo">
                    <option value="hardware">Hardware (notebooks, desktops, servidores)</option>
                    <option value="periferico">Periféricos (monitores, docks, impressoras)</option>
                    <option value="telefonia">Telefonia e redes (celulares, roteadores)</option>
                    <option value="software">Software / licença contratada</option>
                  </select>
                </div>
                {tipos.length > 0 && (
                  <div>
                    <label htmlFor="ativo-tipo" className="rotulo">Tipo</label>
                    <CampoSugestoes id="ativo-tipo" value={espec.tipo || ''} onChange={(v) => mudarEspec('tipo', v)} sugestoes={tipos} placeholder={`Ex.: ${tipos[0]}`} />
                  </div>
                )}
                <div>
                  <label htmlFor="ativo-marca" className="rotulo">Marca / fabricante *</label>
                  <CampoSugestoes id="ativo-marca" value={marca} onChange={setMarca} sugestoes={fabricantesDaCategoria(categoria)} placeholder="Ex.: Dell, Lenovo, Apple" />
                </div>
                <div>
                  <label htmlFor="ativo-modelo" className="rotulo">Modelo</label>
                  <input id="ativo-modelo" type="text" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ex.: Latitude 5430" className="campo" />
                </div>
                <div className="sm:col-span-2 xl:col-span-3">
                  <label htmlFor="ativo-nome" className="rotulo">Nome / descrição *</label>
                  <input
                    id="ativo-nome"
                    type="text"
                    value={nome}
                    onChange={(e) => {
                      setNomeManual(e.target.value);
                      setNomeEditado(true);
                    }}
                    placeholder="Preenchido sozinho com tipo, marca, modelo e especificações"
                    className="campo"
                  />
                  {nomeEditado && sugestao && sugestao !== nomeManual.trim() ? (
                    <button type="button" onClick={() => setNomeEditado(false)} className="link mt-1 block text-left text-xs break-words">
                      Usar sugestão: {sugestao}
                    </button>
                  ) : (
                    !nomeEditado && <p className="ajuda">Sugerido automaticamente; edite se quiser.</p>
                  )}
                </div>
                <div>
                  <label htmlFor="ativo-tag" className="rotulo">Patrimônio (tag) *</label>
                  <input id="ativo-tag" type="text" value={tag} onChange={(e) => setTag(e.target.value)} className="campo font-mono font-bold" />
                </div>
                <div>
                  <label htmlFor="ativo-serie" className="rotulo">Número de série *</label>
                  <input id="ativo-serie" type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Ex.: CN084920M12" className="campo font-mono" />
                </div>
                <div>
                  <label htmlFor="ativo-service-tag" className="rotulo">Service Tag / código expresso (opcional)</label>
                  <input id="ativo-service-tag" type="text" value={serviceTag} onChange={(e) => setServiceTag(e.target.value.toUpperCase())} placeholder="Ex.: 7HQK2M3" className="campo font-mono" />
                </div>
                {temImei && (
                  <div>
                    <label htmlFor="ativo-imei" className="rotulo">IMEI</label>
                    <CampoMascara id="ativo-imei" tipo="imei" value={imei} onChange={setImei} />
                  </div>
                )}
                {temMac && (
                  <div>
                    <label htmlFor="ativo-mac" className="rotulo">Endereço MAC</label>
                    <CampoMascara id="ativo-mac" tipo="mac" value={mac} onChange={setMac} />
                  </div>
                )}
                {/* Fase 8: observações visíveis a quem vê o ativo */}
                <div className="sm:col-span-2 xl:col-span-4">
                  <label htmlFor="ativo-observacoes" className="rotulo">Observações</label>
                  <textarea
                    id="ativo-observacoes"
                    rows={2}
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Ex.: tecla Enter com folga; acompanha carregador original."
                    className="campo"
                  />
                  <p className="ajuda">Visível para quem vê o ativo, inclusive o colaborador que está com ele.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Etapa 2 · Técnico */}
          <div className={painel('tecnico')}>
            <div className="cartao space-y-3 p-4">
              <h3 className="secao-titulo">Especificações técnicas ({CATEGORIA_LABEL[categoria] ?? categoria})</h3>
              {categoria === 'hardware' && (
                <>
                  <div className={gradeTecnica}>
                    <div>
                      <label htmlFor="ativo-mem" className="rotulo">Memória (GB)</label>
                      <CampoSugestoes
                        id="ativo-mem"
                        inputMode="numeric"
                        value={espec.memoriaGb || ''}
                        onChange={(v) => mudarEspec('memoriaGb', v.replace(/[^\d.,]/g, ''))}
                        sugestoes={MEMORIA_TAMANHOS}
                        placeholder="Ex.: 16"
                      />
                    </div>
                    <div>
                      <label htmlFor="ativo-mem-tipo" className="rotulo">Tipo de memória</label>
                      <select id="ativo-mem-tipo" value={espec.memoriaTipo || ''} onChange={(e) => mudarEspec('memoriaTipo', e.target.value)} className="campo">
                        <option value="">Não informado</option>
                        {comAtual(MEMORIA_TIPOS, espec.memoriaTipo).map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="ativo-disco-tipo" className="rotulo">Armazenamento</label>
                      <select id="ativo-disco-tipo" value={espec.discoTipo || ''} onChange={(e) => mudarEspec('discoTipo', e.target.value)} className="campo">
                        <option value="">Não informado</option>
                        {comAtual(DISCO_TIPOS, espec.discoTipo).map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="ativo-disco-cap" className="rotulo">Capacidade</label>
                      <CampoSugestoes id="ativo-disco-cap" value={espec.discoCapacidade || ''} onChange={(v) => mudarEspec('discoCapacidade', v)} sugestoes={DISCO_CAPACIDADES} placeholder="Ex.: 512 GB" />
                    </div>
                    <div>
                      <label htmlFor="ativo-cpu-fab" className="rotulo">Processador</label>
                      <CampoSugestoes id="ativo-cpu-fab" value={espec.cpuFabricante || ''} onChange={mudarCpuFabricante} sugestoes={CPU_FABRICANTES} placeholder="Ex.: Intel" />
                    </div>
                    <div>
                      <label htmlFor="ativo-cpu-linha" className="rotulo">Linha</label>
                      <CampoSugestoes id="ativo-cpu-linha" value={espec.cpuLinha || ''} onChange={(v) => mudarEspec('cpuLinha', v)} sugestoes={linhasCpu} placeholder={`Ex.: ${linhasCpu[0] || 'Core i7'}`} />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label htmlFor="ativo-cpu-modelo" className="rotulo">Modelo / geração</label>
                      <input
                        id="ativo-cpu-modelo"
                        type="text"
                        value={espec.cpuModelo || ''}
                        onChange={(e) => mudarEspec('cpuModelo', e.target.value)}
                        placeholder={DICA_CPU_MODELO[espec.cpuFabricante || ''] || 'Ex.: 1265U'}
                        className="campo"
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label htmlFor="ativo-so" className="rotulo">Sistema operacional</label>
                      <CampoSugestoes id="ativo-so" value={sistemaOperacional} onChange={setSistemaOperacional} sugestoes={SISTEMAS_OPERACIONAIS} placeholder="Ex.: Windows 11 Pro 64-bit" />
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="ativo-bitlocker" className="rotulo">Chave BitLocker / FileVault (opcional)</label>
                      <input id="ativo-bitlocker" type="text" value={bitlockerKey} onChange={(e) => setBitlockerKey(e.target.value)} placeholder="Ex.: 419204-183029-482019-582019-..." className="campo font-mono" />
                      <p className="ajuda">Para desbloquear o disco criptografado numa emergência.</p>
                    </div>
                  </div>
                  <p className="ajuda">Sugestões ao digitar; qualquer outro valor é aceito. O nome do equipamento acompanha estes dados enquanto não for editado.</p>
                </>
              )}
              {availableCustomFields.length === 0 && categoria !== 'hardware' && (
                <p className="text-xs text-slate-500">Esta categoria não tem especificações técnicas para preencher.</p>
              )}
              {availableCustomFields.length > 0 && (
                <div className={`${gradeTecnica} ${categoria === 'hardware' ? 'border-t border-slate-100 pt-3' : ''}`}>
                  {availableCustomFields.map((cf) => (
                    <div key={cf.id} className="col-span-2 md:col-span-1">
                      <label htmlFor={`ativo-cf-${cf.id}`} className="rotulo">{cf.label}</label>
                      <input
                        id={`ativo-cf-${cf.id}`}
                        type="text"
                        value={customFields[cf.key] || ''}
                        onChange={(e) => setCustomFields({ ...customFields, [cf.key]: e.target.value })}
                        placeholder={`Informe ${cf.label.toLowerCase()}...`}
                        className="campo"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Etapa 3 · Custódia */}
          <div className={painel('custodia')}>
            <div className="cartao space-y-3 p-4">
              <h3 className="secao-titulo">Custódia e alocação</h3>
              <div className={grade}>
                {!ativo && (
                  <div className="sm:col-span-2">
                    <label htmlFor="ativo-alocacao" className="rotulo">Alocação inicial (1:1)</label>
                    <select id="ativo-alocacao" value={custodianteId} onChange={(e) => setCustodianteId(e.target.value)} className="campo">
                      <option value="">Manter disponível no estoque de T.I.</option>
                      <optgroup label="Entregar a um colaborador">
                        {employees
                          .filter((emp) => emp.status === 'ativo')
                          .map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.nome} ({emp.cargo})
                            </option>
                          ))}
                      </optgroup>
                    </select>
                    {custodianteId && <p className="ajuda">Ao cadastrar, você confirma a entrega (de → para, termo e o que falta fazer).</p>}
                  </div>
                )}
                <div>
                  <label htmlFor="ativo-setor" className="rotulo">Setor / centro de custo</label>
                  <select id="ativo-setor" value={setorId} onChange={(e) => setSetorId(e.target.value)} className="campo">
                    {departments
                      .filter((d) => d.ativo || d.id === setorId)
                      .map((dep) => (
                        <option key={dep.id} value={dep.id}>
                          {dep.nome} ({dep.codigo})
                        </option>
                      ))}
                  </select>
                </div>
                {/* Fase 4: o campo existia no estado, mas não havia como preenchê-lo */}
                {!custodianteId && (
                  <div className="sm:col-span-2">
                    <label htmlFor="ativo-localizacao" className="rotulo">Localização física no estoque *</label>
                    <input id="ativo-localizacao" type="text" value={localizacaoFisica} onChange={(e) => setLocalizacaoFisica(e.target.value)} placeholder="Ex.: Almoxarifado T.I. - Armário B3" className="campo" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Etapa 4 · Fiscal e garantia */}
          <div className={painel('fiscal')}>
            <div className="cartao space-y-3 p-4">
              <h3 className="secao-titulo">Dados fiscais e garantia</h3>
              <div className={grade}>
                <div>
                  <label htmlFor="ativo-nf" className="rotulo">Número da nota fiscal (NF-e)</label>
                  <input id="ativo-nf" type="text" value={numeroNF} onChange={(e) => setNumeroNF(e.target.value)} placeholder="Ex.: 004821" className="campo" />
                </div>
                <div>
                  <label htmlFor="ativo-valor" className="rotulo">Valor de compra</label>
                  <CampoMoeda id="ativo-valor" valor={valorCompra} onMudar={setValorCompra} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="ativo-fornecedor" className="rotulo">Fornecedor</label>
                  {/* Lote 1 (L1): fornecedor só do cadastro, com "+ Novo" na hora */}
                  <div className="flex gap-2">
                    <select id="ativo-fornecedor" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="campo">
                      <option value="">Não informado</option>
                      {opcoesFornecedor.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                          {f.ativo ? '' : ' (inativo)'}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setNovoFornecedor(true)} className="btn btn-secundario shrink-0">
                      <Plus /> Novo
                    </button>
                  </div>
                  {!fornecedorId && fornecedor && (
                    <p className="mt-1 text-xs text-amber-800">
                      Registro antigo: "{fornecedor}" (texto). Escolha o fornecedor do cadastro para vincular.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="ativo-aquisicao" className="rotulo">Data de aquisição</label>
                  <input id="ativo-aquisicao" type="date" value={dataAquisicao} onChange={(e) => setDataAquisicao(e.target.value)} className="campo" />
                </div>
                <div>
                  <label htmlFor="ativo-garantia" className="rotulo">Fim da garantia</label>
                  <input id="ativo-garantia" type="date" value={dataGarantia} onChange={(e) => setDataGarantia(e.target.value)} className="campo" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="ativo-suporte" className="rotulo">Contato de suporte / contrato do fabricante</label>
                  <input id="ativo-suporte" type="text" value={suporteContato} onChange={(e) => setSuporteContato(e.target.value)} placeholder="Ex.: 0800 970 3355 (Dell ProSupport 24x7)" className="campo" />
                </div>
                <div className="sm:col-span-2 xl:col-span-4">
                  <label htmlFor="ativo-chave-nfe" className="rotulo">Chave de acesso NF-e (44 dígitos)</label>
                  <CampoMascara id="ativo-chave-nfe" tipo="chave_nfe" value={chaveNfe} onChange={setChaveNfe} />
                </div>
                {/* Fase 8: arquivo da NF (PDF ou foto), enviado só ao salvar */}
                <div className="sm:col-span-2 xl:col-span-4">
                  <label htmlFor="ativo-nf-arquivo" className="rotulo">Arquivo da nota fiscal (PDF ou foto)</label>
                  <input id="ativo-nf-arquivo" type="file" accept={TIPOS_ARQUIVO_ACEITOS.join(',')} onChange={(e) => escolherNotaFiscal(e.target.files?.[0])} className="campo" />
                  {erroArquivo ? (
                    <p className="erro" role="alert">{erroArquivo}</p>
                  ) : (
                    <p className="ajuda">
                      {ativo?.anexos?.some((a) => a.categoria === 'nota_fiscal')
                        ? 'Este ativo já tem nota fiscal anexada; um novo arquivo fica junto dos anteriores.'
                        : nfOriginal
                          ? `O arquivo da nota de ${duplicarDe?.tag} não é copiado; anexe aqui se quiser a nota também neste ativo.`
                          : 'Até 10 MB. O arquivo fica no armazenamento privado e só a T.I. abre.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>
      </Janela>

      {novoFornecedor && <FornecedorFormModal onClose={() => setNovoFornecedor(false)} onSalvo={(f) => setFornecedorId(f.id)} />}
    </>
  );
};
