import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate } from '../../utils/formatters.ts';
import { CLASSE_TOM, situacaoTermo, termoAberto } from '../../utils/termos.ts';
import { Laptop, Key, FileText, LifeBuoy, QrCode } from 'lucide-react';

interface MyAssetsViewProps {
  onOpenNewTicketForAsset: (assetId: string) => void;
}

export const MyAssetsView: React.FC<MyAssetsViewProps> = ({ onOpenNewTicketForAsset }) => {
  const {
    currentUser,
    assets,
    licenses,
    terms,
    setSelectedAssetIdFor360,
    setSelectedTermForPrint,
    setSelectedAssetForQrCode,
  } = useApp();

  if (!currentUser) return null;

  const myAssets = assets.filter((a) => a.custodianteId === currentUser.id);
  const myLicenses = licenses.filter((l) => l.colaboradoresIds.includes(currentUser.id));
  const myTerms = terms.filter((t) => t.colaboradorId === currentUser.id);
  // Fase 6: termos aguardando o "Li e concordo" do colaborador
  const termosParaAssinar = myTerms.filter((t) => termoAberto(t) && !t.aceiteColaboradorEm);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs">
        <h2 className="text-sm font-semibold text-slate-900">Meus equipamentos e licenças</h2>
      </div>

      {termosParaAssinar.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> Você tem {termosParaAssinar.length} termo(s) para ler e assinar
          </p>
          <ul className="space-y-1.5">
            {termosParaAssinar.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs">
                <span>
                  {t.docTitulo || (t.tipo === 'entrega' ? 'Termo de entrega' : 'Recibo de devolução')} · {t.codigo} ·{' '}
                  {formatDate(t.dataEmissao)}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedTermForPrint(t)}
                  className="px-3 py-1 text-xs font-semibold text-white bg-amber-600 rounded-md hover:bg-amber-700"
                >
                  Ler e assinar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Grid de Equipamentos Físicos */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Laptop className="w-4 h-4 text-blue-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            Equipamentos Físicos ({myAssets.length})
          </h3>
        </div>

        {myAssets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myAssets.map((asset) => (
              <div
                key={asset.id}
                className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {asset.tag}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedAssetForQrCode(asset)}
                      title="Ver etiqueta com QR Code"
                      className="text-slate-500 hover:text-slate-700 p-1 rounded"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  </div>

                  <h4 className="font-semibold text-sm text-slate-900 mt-2">{asset.nome}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {asset.marca} {asset.modelo}
                  </p>
                  <p className="font-mono text-xs text-slate-600 mt-1">
                    S/N: {asset.serialNumber}
                  </p>

                  <div className="mt-3 pt-2 border-t border-slate-100 text-xs text-slate-500 space-y-0.5">
                    <p>
                      Em posse desde: <span className="font-medium text-slate-700">{formatDate(asset.dataEntregaAtual)}</span>
                    </p>
                    <p>
                      Localização: <span className="font-medium text-slate-700">{asset.localizacaoFisica}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedAssetIdFor360(asset.id)}
                    className="flex-1 py-1.5 px-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-center"
                  >
                    Ver Detalhes
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenNewTicketForAsset(asset.id)}
                    className="flex-1 py-1.5 px-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100/70 rounded-lg border border-blue-200 transition-colors flex items-center justify-center gap-1"
                  >
                    <LifeBuoy className="w-3.5 h-3.5" />
                    <span>Reportar Defeito</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-xs">
            Você não possui nenhum equipamento físico atribuído no momento.
          </div>
        )}
      </div>

      {/* Licenças Ativas */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-slate-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            Softwares e Contas Liberadas ({myLicenses.length})
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {myLicenses.map((lic) => (
            <div
              key={lic.id}
              className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between text-xs"
            >
              <div>
                <p className="font-semibold text-slate-900">{lic.nome}</p>
                <p className="text-xs text-slate-500">{lic.fornecedor}</p>
              </div>
              <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-medium">
                Acesso Liberado
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Meus Termos de Responsabilidade */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            Meus Termos de Responsabilidade ({myTerms.length})
          </h3>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs divide-y divide-slate-100 overflow-hidden">
          {myTerms.length > 0 ? (
            myTerms.map((term) => (
              <div key={term.id} className="p-4 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-blue-700">{term.codigo}</span>
                    <span className="font-semibold text-slate-900 capitalize">
                      Termo de {term.tipo === 'entrega' ? 'Entrega' : 'Devolução'}
                    </span>
                    {(() => {
                      const s = situacaoTermo(term, true, terms.find((x) => x.id === term.substituidoPor)?.codigo);
                      return <span className={`text-xs px-2 py-0.5 rounded border ${CLASSE_TOM[s.tom]}`}>{s.rotulo}</span>;
                    })()}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Emitido em {formatDate(term.dataEmissao)} · Responsável TI: {term.responsavelTINome}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedTermForPrint(term)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Visualizar Termo A4
                </button>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-slate-500 text-xs">
              Nenhum termo gerado até o momento.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
