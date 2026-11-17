import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { Asset, AssetCategory } from '../../types/index.ts';
import { Package, Plus } from 'lucide-react';
import { Janela } from '../ui/Janela.tsx';
import { Abas } from '../ui/Abas.tsx';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { TIPOS_ARQUIVO_ACEITOS, validarArquivo } from '../../services/supabaseDb.ts';
import { isoLocal } from '../../utils/formatters.ts';
import { erroDuplicadoAtivo, proximaTag } from '../../utils/patrimonio.ts';
import { FornecedorFormModal } from '../fornecedores/FornecedorFormModal.tsx';

interface NewAssetModalProps {
  onClose: () => void;
  /** Fase 8: quando informado, o formulário edita este ativo (a custódia muda só por "Transferir") */
  ativo?: Asset;
}

const CATEGORIA_LABEL: Record<string, string> = {
  hardware: 'Hardware',
  software: 'Software',
  periferico: 'Periférico',
  telefonia: 'Telefonia',
};

type AbaAtivo = 'ident' | 'tecnico' | 'custodia' | 'fiscal';
const ABAS_ATIVO: [AbaAtivo, string][] = [
  ['ident', 'Identificação'],
  ['tecnico', 'Técnico'],
  ['custodia', 'Custódia'],
  ['fiscal', 'Fiscal e garantia'],
];

export const NewAssetModal: React.FC<NewAssetModalProps> = ({ onClose, ativo }) => {
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

  // Lote 1: próxima tag = maior número já usado + 1 (não repete tag existente)
  const defaultTag = proximaTag(assets);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<AbaAtivo>('ident');
  const [abasComErro, setAbasComErro] = useState<AbaAtivo[]>([]);
  const fiscalAtual = ativo?.fiscal;

  const [tag, setTag] = useState(ativo?.tag ?? defaultTag);
  const [nome, setNome] = useState(ativo?.nome ?? '');
  const [categoria, setCategoria] = useState<AssetCategory>(ativo?.categoria ?? 'hardware');
  const [marca, setMarca] = useState(ativo?.marca ?? '');
  const [modelo, setModelo] = useState(ativo?.modelo ?? '');
  const [serialNumber, setSerialNumber] = useState(ativo?.serialNumber ?? '');
  const [localizacaoFisica, setLocalizacaoFisica] = useState(ativo?.localizacaoFisica ?? 'Almoxarifado T.I. - Armário B3');
  const [setorId, setSetorId] = useState(ativo?.setorId ?? 'dep-1');
  const [custodianteId, setCustodianteId] = useState(ativo?.custodianteId ?? '');

  // Dados Fiscais
  const [numeroNF, setNumeroNF] = useState(fiscalAtual?.numeroNF ?? '');
  const [chaveAcesso44, setChaveAcesso44] = useState(fiscalAtual?.chaveAcesso44 ?? '');
  const [valorCompra, setValorCompra] = useState<number>(fiscalAtual?.valorCompra ?? 0);
  // Fase 8: fornecedor do cadastro; o texto antigo fica (e aparece) enquanto não houver vínculo
  const [fornecedorId, setFornecedorId] = useState(ativo?.fornecedorId ?? '');
  const [fornecedor] = useState(fiscalAtual?.fornecedor ?? '');
  const [novoFornecedor, setNovoFornecedor] = useState(false);
  const opcoesFornecedor = fornecedores.filter((f) => f.ativo || f.id === fornecedorId);
  const [dataAquisicao, setDataAquisicao] = useState(() => fiscalAtual?.dataAquisicao ?? isoLocal(new Date()));
  const [dataGarantia, setDataGarantia] = useState(fiscalAtual?.dataGarantia ?? '');
  const [suporteContato, setSuporteContato] = useState(fiscalAtual?.suporteContato ?? '');

  // Segurança e SO (Hardware)
  const [sistemaOperacional, setSistemaOperacional] = useState(
    ativo ? ativo.sistemaOperacional ?? '' : 'Windows 11 Pro 64-bit'
  );
  const [bitlockerKey, setBitlockerKey] = useState(ativo?.bitlockerKey ?? '');

  // Campos Customizados
  const [customFields, setCustomFields] = useState<Record<string, string>>(
    ativo?.customFields ?? { processador: '', memoriaRam: '', armazenamento: '' }
  );

  // Fase 8: observações e nota fiscal (o arquivo só sobe ao salvar)
  const [observacoes, setObservacoes] = useState(ativo?.observacoes ?? '');
  const [notaFiscal, setNotaFiscal] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState('');

  const availableCustomFields = settings.camposPersonalizados.filter(
    (cf) => cf.categoria === categoria
  );

  // Aviso ao fechar com alterações não salvas
  const valores = JSON.stringify([tag, nome, categoria, marca, modelo, serialNumber, localizacaoFisica, setorId,
    custodianteId, numeroNF, chaveAcesso44, valorCompra, fornecedorId, fornecedor, dataAquisicao, dataGarantia,
    suporteContato, sistemaOperacional, bitlockerKey, customFields, observacoes]);
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

    const fiscal = {
      ...(fiscalAtual || {}),
      numeroNF: numeroNF.trim(),
      chaveAcesso44: chaveAcesso44.replace(/\s+/g, '').trim(),
      valorCompra: Number(valorCompra) || 0,
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
        sistemaOperacional: categoria === 'hardware' ? sistemaOperacional || undefined : undefined,
        bitlockerKey: categoria === 'hardware' && bitlockerKey.trim() ? bitlockerKey.trim() : undefined,
        fiscal,
        customFields,
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
    const isEmUso = Boolean(custodianteId);
    const custodian = employees.find((e) => e.id === custodianteId);

    setSalvando(true);
    const { item: created, erro: falhaCadastro } = await cadastrarAtivo({
      tag: tag.trim(),
      nome: nome.trim(),
      categoria,
      marca: marca.trim(),
      modelo: modelo.trim(),
      serialNumber: serialNumber.trim(),
      localizacaoFisica: isEmUso
        ? `Home Office / Em posse de ${custodian?.nome || 'Colaborador'}`
        : localizacaoFisica.trim(),
      setorId,
      custodianteId: custodianteId || undefined,
      status: isEmUso ? 'em_uso' : 'disponivel',
      dataEntregaAtual: isEmUso ? today : undefined,
      sistemaOperacional: categoria === 'hardware' ? sistemaOperacional : undefined,
      bitlockerKey: categoria === 'hardware' && bitlockerKey.trim() ? bitlockerKey.trim() : undefined,
      fiscal,
      customFields,
      observacoes: observacoes.trim() || undefined,
      fornecedorId: fornecedorId || undefined,
      historicoCustodia: isEmUso && custodian
        ? [
            {
              id: `cust-${Date.now()}`,
              colaboradorId: custodian.id,
              colaboradorNome: custodian.nome,
              dataEntrega: today,
              observacoes: 'Alocação inicial no cadastro do ativo',
            },
          ]
        : [],
      historicoManutencao: [],
    });
    setSalvando(false);
    if (!created) return setErroSalvar(`Não foi possível cadastrar: ${falhaCadastro || 'erro desconhecido'}`);
    if (notaFiscal) void anexarArquivoAtivo(created.id, notaFiscal, 'nota_fiscal');

    onClose();
    setSelectedAssetIdFor360(created.id);
  };

  const painel = (id: AbaAtivo) => (aba === id ? 'space-y-4' : 'hidden');
  const grade = 'grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4';

  return (
    <>
      <Janela
        tamanho="g"
        icone={<Package className="h-4 w-4" />}
        titulo={ativo ? `Editar ativo ${ativo.tag}` : 'Novo ativo patrimonial de T.I.'}
        subtitulo={
          ativo
            ? 'Corrija os dados do ativo. A custódia muda pelo botão "Transferir" da ficha.'
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
              <div className={grade}>
                <div className="md:col-span-2 xl:col-span-2">
                  <label htmlFor="ativo-nome" className="rotulo">Nome / descrição *</label>
                  <input id="ativo-nome" type="text" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Notebook Dell Latitude 5430" className="campo" />
                </div>
                <div>
                  <label htmlFor="ativo-tag" className="rotulo">Tag de patrimônio (Asset Tag) *</label>
                  <input id="ativo-tag" type="text" required value={tag} onChange={(e) => setTag(e.target.value)} className="campo font-mono font-bold" />
                </div>
                <div>
                  <label htmlFor="ativo-categoria" className="rotulo">Categoria</label>
                  <select id="ativo-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as AssetCategory)} className="campo">
                    <option value="hardware">Hardware (Notebooks, Workstations, Servidores)</option>
                    <option value="periferico">Periféricos (Monitores, Teclados, Mouses, Docks)</option>
                    <option value="telefonia">Telefonia & Redes (Smartphones, Roteadores)</option>
                    <option value="software">Software / Licença Contratada</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ativo-marca" className="rotulo">Marca / fabricante *</label>
                  <input id="ativo-marca" type="text" required value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Ex: Dell, Lenovo, Apple" className="campo" />
                </div>
                <div>
                  <label htmlFor="ativo-modelo" className="rotulo">Modelo específico</label>
                  <input id="ativo-modelo" type="text" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ex: Latitude 5430 Core i7" className="campo" />
                </div>
                <div>
                  <label htmlFor="ativo-serie" className="rotulo">Número de série / Service Tag *</label>
                  <input id="ativo-serie" type="text" required value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Ex: CN084920M12" className="campo font-mono" />
                </div>
                {/* Fase 8: observações visíveis a quem vê o ativo */}
                <div className="md:col-span-3 xl:col-span-4">
                  <label htmlFor="ativo-observacoes" className="rotulo">Observações</label>
                  <textarea
                    id="ativo-observacoes"
                    rows={3}
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
              {availableCustomFields.length === 0 && categoria !== 'hardware' && (
                <p className="text-xs text-slate-500">Esta categoria não tem especificações técnicas para preencher.</p>
              )}
              {availableCustomFields.length > 0 && (
                <div className={grade}>
                  {availableCustomFields.map((cf) => (
                    <div key={cf.id}>
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
              {categoria === 'hardware' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label htmlFor="ativo-so" className="rotulo">Sistema operacional da máquina</label>
                    <select id="ativo-so" value={sistemaOperacional} onChange={(e) => setSistemaOperacional(e.target.value)} className="campo">
                      <option value="Windows 11 Pro 64-bit">Windows 11 Pro (64-bit)</option>
                      <option value="Windows 11 Home">Windows 11 Home</option>
                      <option value="Windows 10 Pro 64-bit">Windows 10 Pro (64-bit)</option>
                      <option value="macOS Sequoia 15.x">macOS Sequoia (Apple Silicon / Intel)</option>
                      <option value="macOS Sonoma 14.x">macOS Sonoma (Apple Silicon)</option>
                      <option value="Ubuntu Linux 24.04 LTS">Ubuntu Linux 24.04 LTS</option>
                      <option value="Outro Sistema">Outro Sistema Operacional</option>
                    </select>
                  </div>
                  <div className="md:col-span-2 xl:col-span-2">
                    <label htmlFor="ativo-bitlocker" className="rotulo">Chave de recuperação BitLocker / FileVault (opcional)</label>
                    <input id="ativo-bitlocker" type="text" value={bitlockerKey} onChange={(e) => setBitlockerKey(e.target.value)} placeholder="Ex: 419204-183029-482019-582019-..." className="campo font-mono" />
                    <p className="ajuda">Chave numérica/alfanumérica para desbloqueio emergencial de disco criptografado</p>
                  </div>
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
                  <div className="md:col-span-2 xl:col-span-2">
                    <label htmlFor="ativo-alocacao" className="rotulo">Alocação inicial (1:1)</label>
                    <select id="ativo-alocacao" value={custodianteId} onChange={(e) => setCustodianteId(e.target.value)} className="campo">
                      <option value="">Manter Disponível no Almoxarifado / Estoque de T.I.</option>
                      <optgroup label="Entregar Imediatamente a um Colaborador">
                        {employees
                          .filter((e) => e.status === 'ativo')
                          .map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.nome} ({emp.cargo})
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor="ativo-setor" className="rotulo">Setor / centro de custo vinculado</label>
                  <select id="ativo-setor" value={setorId} onChange={(e) => setSetorId(e.target.value)} className="campo">
                    {departments
                      .filter((d) => d.ativo)
                      .map((dep) => (
                        <option key={dep.id} value={dep.id}>
                          {dep.nome} ({dep.codigo})
                        </option>
                      ))}
                  </select>
                </div>
                {/* Fase 4: o campo existia no estado, mas não havia como preenchê-lo */}
                {!custodianteId && (
                  <div className="md:col-span-2 xl:col-span-2">
                    <label htmlFor="ativo-localizacao" className="rotulo">Localização física no estoque *</label>
                    <input id="ativo-localizacao" type="text" required value={localizacaoFisica} onChange={(e) => setLocalizacaoFisica(e.target.value)} placeholder="Ex.: Almoxarifado T.I. - Armário B3" className="campo" />
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
                  <input id="ativo-nf" type="text" value={numeroNF} onChange={(e) => setNumeroNF(e.target.value)} placeholder="Ex: 004821" className="campo" />
                </div>
                <div>
                  <label htmlFor="ativo-valor" className="rotulo">Valor de compra (R$)</label>
                  <input id="ativo-valor" type="number" step="0.01" value={valorCompra || ''} onChange={(e) => setValorCompra(parseFloat(e.target.value))} placeholder="6850.00" className="campo font-mono" />
                </div>
                <div>
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
                <div className="md:col-span-2 xl:col-span-2">
                  <label htmlFor="ativo-suporte" className="rotulo">Contato de suporte / contrato do fabricante</label>
                  <input id="ativo-suporte" type="text" value={suporteContato} onChange={(e) => setSuporteContato(e.target.value)} placeholder="Ex: 0800 970 3355 (Dell ProSupport 24x7)" className="campo" />
                </div>
                <div className="md:col-span-3 xl:col-span-4">
                  <label htmlFor="ativo-chave-nfe" className="rotulo">Chave de acesso NF-e (44 dígitos)</label>
                  <input id="ativo-chave-nfe" type="text" maxLength={54} value={chaveAcesso44} onChange={(e) => setChaveAcesso44(e.target.value)} placeholder="35240112345678000190550010000048211002938475" className="campo font-mono" />
                </div>
                {/* Fase 8: arquivo da NF (PDF ou foto), enviado só ao salvar */}
                <div className="md:col-span-3 xl:col-span-4">
                  <label htmlFor="ativo-nf-arquivo" className="rotulo">Arquivo da nota fiscal (PDF ou foto)</label>
                  <input id="ativo-nf-arquivo" type="file" accept={TIPOS_ARQUIVO_ACEITOS.join(',')} onChange={(e) => escolherNotaFiscal(e.target.files?.[0])} className="campo" />
                  {erroArquivo ? (
                    <p className="erro" role="alert">{erroArquivo}</p>
                  ) : (
                    <p className="ajuda">
                      {ativo?.anexos?.some((a) => a.categoria === 'nota_fiscal')
                        ? 'Este ativo já tem nota fiscal anexada; um novo arquivo fica junto dos anteriores.'
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
