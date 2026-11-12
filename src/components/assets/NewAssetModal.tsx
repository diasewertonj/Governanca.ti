import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { AssetCategory } from '../../types/index.ts';
import { X, Plus } from 'lucide-react';

interface NewAssetModalProps {
  onClose: () => void;
}

const CATEGORIA_LABEL: Record<string, string> = {
  hardware: 'Hardware',
  software: 'Software',
  periferico: 'Periférico',
  telefonia: 'Telefonia',
};

export const NewAssetModal: React.FC<NewAssetModalProps> = ({ onClose }) => {
  const { assets, departments, employees, addAsset, settings, setSelectedAssetIdFor360 } = useApp();

  const nextTagNumber = 1040 + assets.length + 1;
  const defaultTag = `#PAT-${nextTagNumber}`;

  const [tag, setTag] = useState(defaultTag);
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<AssetCategory>('hardware');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [localizacaoFisica, setLocalizacaoFisica] = useState('Almoxarifado T.I. - Armário B3');
  const [setorId, setSetorId] = useState('dep-1');
  const [custodianteId, setCustodianteId] = useState('');

  // Dados Fiscais
  const [numeroNF, setNumeroNF] = useState('');
  const [chaveAcesso44, setChaveAcesso44] = useState('');
  const [valorCompra, setValorCompra] = useState<number>(0);
  const [fornecedor, setFornecedor] = useState('');
  const [dataAquisicao, setDataAquisicao] = useState(new Date().toISOString().split('T')[0]);
  const [dataGarantia, setDataGarantia] = useState('');
  const [suporteContato, setSuporteContato] = useState('');

  // Segurança e SO (Hardware)
  const [sistemaOperacional, setSistemaOperacional] = useState('Windows 11 Pro 64-bit');
  const [bitlockerKey, setBitlockerKey] = useState('');

  // Campos Customizados
  const [customFields, setCustomFields] = useState<Record<string, string>>({
    processador: '',
    memoriaRam: '',
    armazenamento: '',
  });

  const availableCustomFields = settings.camposPersonalizados.filter(
    (cf) => cf.categoria === categoria
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !marca.trim() || !serialNumber.trim()) return;

    const today = new Date().toISOString().split('T')[0];
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
      fiscal: {
        numeroNF: numeroNF.trim(),
        chaveAcesso44: chaveAcesso44.replace(/\s+/g, '').trim(),
        valorCompra: Number(valorCompra) || 0,
        fornecedor: fornecedor.trim(),
        dataAquisicao,
        dataGarantia,
        suporteContato: suporteContato.trim(),
      },
      customFields,
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

    onClose();
    setSelectedAssetIdFor360(created.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
      <div className="relative w-full max-w-3xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 sm:overflow-hidden my-0 sm:my-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Novo Ativo Patrimonial de T.I.</h2>
            <p className="text-xs text-slate-500">
              Controle de patrimônio, gestão fiscal e rastreabilidade 1:1
            </p>
          </div>
          <button
            onClick={onClose}
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fornecedor
                </label>
                <input
                  type="text"
                  value={fornecedor}
                  onChange={(e) => setFornecedor(e.target.value)}
                  placeholder="Ex: Dell Brasil Ltda"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

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
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Cadastrar Ativo Patrimonial
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
