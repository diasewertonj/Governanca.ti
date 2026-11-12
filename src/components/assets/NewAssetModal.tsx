import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { Asset, AssetCategory } from '../../types/index.ts';
import { X, Plus, Save } from 'lucide-react';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { TIPOS_ARQUIVO_ACEITOS, validarArquivo } from '../../services/supabaseDb.ts';
import { isoLocal } from '../../utils/formatters.ts';

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

export const NewAssetModal: React.FC<NewAssetModalProps> = ({ onClose, ativo }) => {
  const {
    assets,
    departments,
    employees,
    fornecedores,
    addAsset,
    updateAsset,
    anexarArquivoAtivo,
    settings,
    setSelectedAssetIdFor360,
  } = useApp();

  const nextTagNumber = 1040 + assets.length + 1;
  const defaultTag = `#PAT-${nextTagNumber}`;
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
  const [fornecedor, setFornecedor] = useState(fiscalAtual?.fornecedor ?? '');
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
    if (confirmarDescarte(itensPendentes)) onClose();
  };

  const escolherNotaFiscal = (arquivo: File | undefined) => {
    if (!arquivo) return;
    const erro = validarArquivo(arquivo);
    setErroArquivo(erro || '');
    setNotaFiscal(erro ? null : arquivo);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !marca.trim() || !serialNumber.trim()) return;

    const fiscal = {
      ...(fiscalAtual || {}),
      numeroNF: numeroNF.trim(),
      chaveAcesso44: chaveAcesso44.replace(/\s+/g, '').trim(),
      valorCompra: Number(valorCompra) || 0,
      fornecedor: fornecedor.trim(),
      dataAquisicao,
      dataGarantia,
      suporteContato: suporteContato.trim(),
    };

    if (ativo) {
      updateAsset(ativo.id, {
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
      if (notaFiscal) void anexarArquivoAtivo(ativo.id, notaFiscal, 'nota_fiscal');
      onClose();
      return;
    }

    const today = isoLocal(new Date());
    const isEmUso = Boolean(custodianteId);
    const custodian = employees.find((e) => e.id === custodianteId);

    const created = addAsset({
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
    if (notaFiscal) void anexarArquivoAtivo(created.id, notaFiscal, 'nota_fiscal');

    onClose();
    setSelectedAssetIdFor360(created.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
      <div className="relative w-full max-w-3xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 sm:overflow-hidden my-0 sm:my-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {ativo ? `Editar ativo ${ativo.tag}` : 'Novo Ativo Patrimonial de T.I.'}
            </h2>
            <p className="text-xs text-slate-500">
              {ativo
                ? 'Corrija os dados do ativo. A custódia muda pelo botão "Transferir" da ficha.'
                : 'Controle de patrimônio, gestão fiscal e rastreabilidade 1:1'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={fechar}
            className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 sm:max-h-[75vh] sm:overflow-y-auto">
          {/* Seção 1: Identificação */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              1. Identificação
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome / Descrição
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Notebook Dell Latitude 5430"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tag de Patrimônio (Asset Tag)
                </label>
                <input
                  type="text"
                  required
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className="w-full text-xs font-mono font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-blue-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Categoria
                </label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as AssetCategory)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  <option value="hardware">Hardware (Notebooks, Workstations, Servidores)</option>
                  <option value="periferico">Periféricos (Monitores, Teclados, Mouses, Docks)</option>
                  <option value="telefonia">Telefonia & Redes (Smartphones, Roteadores)</option>
                  <option value="software">Software / Licença Contratada</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Marca / Fabricante
                </label>
                <input
                  type="text"
                  required
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  placeholder="Ex: Dell, Lenovo, Apple"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Modelo Específico
                </label>
                <input
                  type="text"
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Ex: Latitude 5430 Core i7"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Número de Série / Service Tag
                </label>
                <input
                  type="text"
                  required
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="Ex: CN084920M12"
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Seção 2: Especificações técnicas */}
          {(availableCustomFields.length > 0 || categoria === 'hardware') && (
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                2. Especificações técnicas ({CATEGORIA_LABEL[categoria] ?? categoria})
              </h3>

              {availableCustomFields.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {availableCustomFields.map((cf) => (
                    <div key={cf.id}>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {cf.label}
                      </label>
                      <input
                        type="text"
                        value={customFields[cf.key] || ''}
                        onChange={(e) =>
                          setCustomFields({ ...customFields, [cf.key]: e.target.value })
                        }
                        placeholder={`Informe ${cf.label.toLowerCase()}...`}
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              {categoria === 'hardware' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Sistema Operacional da Máquina
                    </label>
                    <select
                      value={sistemaOperacional}
                      onChange={(e) => setSistemaOperacional(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="Windows 11 Pro 64-bit">Windows 11 Pro (64-bit)</option>
                      <option value="Windows 11 Home">Windows 11 Home</option>
                      <option value="Windows 10 Pro 64-bit">Windows 10 Pro (64-bit)</option>
                      <option value="macOS Sequoia 15.x">macOS Sequoia (Apple Silicon / Intel)</option>
                      <option value="macOS Sonoma 14.x">macOS Sonoma (Apple Silicon)</option>
                      <option value="Ubuntu Linux 24.04 LTS">Ubuntu Linux 24.04 LTS</option>
                      <option value="Outro Sistema">Outro Sistema Operacional</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Chave de Recuperação BitLocker / FileVault (Opcional)
                    </label>
                    <input
                      type="text"
                      value={bitlockerKey}
                      onChange={(e) => setBitlockerKey(e.target.value)}
                      placeholder="Ex: 419204-183029-482019-582019-..."
                      className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs text-slate-500 mt-0.5 block">
                      Chave numérica/alfanumérica para desbloqueio emergencial de disco criptografado
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Seção 3: Custódia e alocação */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              3. Custódia e alocação
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {!ativo && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alocação Inicial (1:1)
                </label>
                <select
                  value={custodianteId}
                  onChange={(e) => setCustodianteId(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Setor / Centro de Custo Vinculado
                </label>
                <select
                  value={setorId}
                  onChange={(e) => setSetorId(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
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
                <div>
                  <label htmlFor="ativo-localizacao" className="block text-xs font-semibold text-slate-700 mb-1">
                    Localização física no estoque
                  </label>
                  <input
                    id="ativo-localizacao"
                    type="text"
                    required
                    value={localizacaoFisica}
                    onChange={(e) => setLocalizacaoFisica(e.target.value)}
                    placeholder="Ex.: Almoxarifado T.I. - Armário B3"
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Seção 4: Dados fiscais e garantia */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              4. Dados fiscais e garantia
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Número da Nota Fiscal (NF-e)
                </label>
                <input
                  type="text"
                  value={numeroNF}
                  onChange={(e) => setNumeroNF(e.target.value)}
                  placeholder="Ex: 004821"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Valor de Compra (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={valorCompra || ''}
                  onChange={(e) => setValorCompra(parseFloat(e.target.value))}
                  placeholder="6850.00"
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="ativo-fornecedor" className="block text-xs font-semibold text-slate-700 mb-1">
                  Fornecedor
                </label>
                <select
                  id="ativo-fornecedor"
                  value={fornecedorId}
                  onChange={(e) => setFornecedorId(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Sem vínculo com o cadastro</option>
                  {opcoesFornecedor.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                      {f.ativo ? '' : ' (inativo)'}
                    </option>
                  ))}
                </select>
              </div>

              {!fornecedorId && (
                <div>
                  <label htmlFor="ativo-fornecedor-texto" className="block text-xs font-semibold text-slate-700 mb-1">
                    Fornecedor (texto)
                  </label>
                  <input
                    id="ativo-fornecedor-texto"
                    type="text"
                    value={fornecedor}
                    onChange={(e) => setFornecedor(e.target.value)}
                    placeholder="Ex: Dell Brasil Ltda"
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Data de Aquisição
                </label>
                <input
                  type="date"
                  value={dataAquisicao}
                  onChange={(e) => setDataAquisicao(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fim da Garantia
                </label>
                <input
                  type="date"
                  value={dataGarantia}
                  onChange={(e) => setDataGarantia(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contato de Suporte / Contrato Fabricante
                </label>
                <input
                  type="text"
                  value={suporteContato}
                  onChange={(e) => setSuporteContato(e.target.value)}
                  placeholder="Ex: 0800 970 3355 (Dell ProSupport 24x7)"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Chave de Acesso NF-e (44 dígitos)
                </label>
                <input
                  type="text"
                  maxLength={54}
                  value={chaveAcesso44}
                  onChange={(e) => setChaveAcesso44(e.target.value)}
                  placeholder="35240112345678000190550010000048211002938475"
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Fase 8: arquivo da NF (PDF ou foto), enviado só ao salvar */}
              <div className="md:col-span-3">
                <label htmlFor="ativo-nf-arquivo" className="block text-xs font-semibold text-slate-700 mb-1">
                  Arquivo da nota fiscal (PDF ou foto)
                </label>
                <input
                  id="ativo-nf-arquivo"
                  type="file"
                  accept={TIPOS_ARQUIVO_ACEITOS.join(',')}
                  onChange={(e) => escolherNotaFiscal(e.target.files?.[0])}
                  className="block w-full max-w-full text-xs text-slate-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:text-xs file:font-semibold"
                />
                {erroArquivo ? (
                  <p className="mt-1 text-xs text-red-700" role="alert">{erroArquivo}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    {ativo?.anexos?.some((a) => a.categoria === 'nota_fiscal')
                      ? 'Este ativo já tem nota fiscal anexada; um novo arquivo fica junto dos anteriores.'
                      : 'Até 10 MB. O arquivo fica no armazenamento privado e só a T.I. abre.'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Seção 5: Observações */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">5. Observações</h3>
            <div>
              <label htmlFor="ativo-observacoes" className="sr-only">
                Observações do ativo
              </label>
              <textarea
                id="ativo-observacoes"
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex.: tecla Enter com folga; acompanha carregador original."
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Visível para quem vê o ativo, inclusive o colaborador que está com ele.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={fechar}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
            >
              {ativo ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {ativo ? 'Salvar alterações' : 'Cadastrar Ativo Patrimonial'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
