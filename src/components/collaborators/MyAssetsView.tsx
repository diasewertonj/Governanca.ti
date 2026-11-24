import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate } from '../../utils/formatters.ts';
import { situacaoTermo, termoAberto, termoContestadoAberto } from '../../utils/termos.ts';
import { Laptop, Key, FileText, LifeBuoy, QrCode } from 'lucide-react';
import { CabecalhoTela, Vazio } from '../ui/Tela.tsx';

interface MyAssetsViewProps {
  onOpenNewTicketForAsset: (assetId: string) => void;
}

const SELO_TOM: Record<string, string> = { ok: 'selo-ok', pendente: 'selo-atencao', neutro: 'selo-neutro', cancelado: 'selo-neutro' };

export const MyAssetsView: React.FC<MyAssetsViewProps> = ({ onOpenNewTicketForAsset }) => {
  const { currentUser, assets, licenses, terms, setSelectedAssetIdFor360, setSelectedTermForPrint, setSelectedAssetForQrCode } = useApp();

  if (!currentUser) return null;

  const myAssets = assets.filter((a) => a.custodianteId === currentUser.id);
  const myLicenses = licenses.filter((l) => l.colaboradoresIds.includes(currentUser.id));
  const myTerms = terms.filter((t) => t.colaboradorId === currentUser.id);
  // Fase 6: termos aguardando o "Li e concordo" do colaborador
  const termosParaAssinar = myTerms.filter((t) => termoAberto(t) && !t.aceiteColaboradorEm && !termoContestadoAberto(t));

  return (
    <div className="space-y-4">
      <CabecalhoTela titulo="Meus equipamentos" subtitulo="Equipamentos, softwares liberados e termos de responsabilidade em seu nome" />

      {termosParaAssinar.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="font-semibold text-amber-900 flex items-center gap-2">
            <FileText className="ico" /> Você tem {termosParaAssinar.length} termo(s) para ler e assinar
          </p>
          <ul className="space-y-2">
            {termosParaAssinar.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                <span>
                  {t.docTitulo || (t.tipo === 'entrega' ? 'Termo de entrega' : 'Recibo de devolução')} · {t.codigo} · {formatDate(t.dataEmissao)}
                </span>
                <button type="button" onClick={() => setSelectedTermForPrint(t)} className="btn btn-sm btn-secundario">
                  Ler e assinar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Equipamentos físicos */}
      <section className="space-y-3">
        <h3 className="secao-titulo flex items-center gap-2">
          <Laptop className="ico" /> Equipamentos físicos ({myAssets.length})
        </h3>

        {myAssets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myAssets.map((asset) => (
              <div key={asset.id} className="cartao p-4 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="selo selo-info font-mono">{asset.tag}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedAssetForQrCode(asset)}
                      title="Ver etiqueta com QR Code"
                      aria-label={`Ver etiqueta com QR Code de ${asset.tag}`}
                      className="btn-icone"
                    >
                      <QrCode />
                    </button>
                  </div>

                  <h4 className="font-semibold text-slate-900 mt-2">{asset.nome}</h4>
                  <p className="texto-aux mt-0.5">
                    {asset.marca} {asset.modelo}
                  </p>
                  <p className="font-mono texto-aux mt-1">S/N: {asset.serialNumber}</p>

                  <div className="mt-3 pt-2 border-t border-slate-100 texto-aux space-y-0.5">
                    <p>
                      Em posse desde: <span className="text-slate-700">{formatDate(asset.dataEntregaAtual)}</span>
                    </p>
                    <p>
                      Localização: <span className="text-slate-700">{asset.localizacaoFisica}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button type="button" onClick={() => onOpenNewTicketForAsset(asset.id)} className="btn btn-sm btn-secundario">
                    <LifeBuoy /> Reportar defeito
                  </button>
                  <button type="button" onClick={() => setSelectedAssetIdFor360(asset.id)} className="btn btn-sm btn-secundario">
                    Ver detalhes
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Vazio>Você não possui nenhum equipamento físico atribuído no momento.</Vazio>
        )}
      </section>

      {/* Licenças ativas */}
      <section className="space-y-3">
        <h3 className="secao-titulo flex items-center gap-2">
          <Key className="ico" /> Softwares e contas liberadas ({myLicenses.length})
        </h3>

        {myLicenses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myLicenses.map((lic) => (
              <div key={lic.id} className="cartao p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{lic.nome}</p>
                  <p className="text-slate-500">{lic.fornecedor}</p>
                </div>
                <span className="selo selo-ok">Acesso liberado</span>
              </div>
            ))}
          </div>
        ) : (
          <Vazio>Nenhum software liberado para você no momento.</Vazio>
        )}
      </section>

      {/* Meus termos de responsabilidade */}
      <section className="space-y-3">
        <h3 className="secao-titulo flex items-center gap-2">
          <FileText className="ico" /> Meus termos de responsabilidade ({myTerms.length})
        </h3>

        {myTerms.length > 0 ? (
          <div className="cartao-tabela">
            <table className="tabela tabela-cartoes">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Termo</th>
                  <th>Emissão</th>
                  <th>Situação</th>
                  <th className="col-acoes">Ações</th>
                </tr>
              </thead>
              <tbody>
                {myTerms.map((term) => {
                  const s = situacaoTermo(term, true, terms.find((x) => x.id === term.substituidoPor)?.codigo);
                  return (
                    <tr key={term.id}>
                      <td data-label="Código" className="font-mono font-semibold text-blue-700">
                        {term.codigo}
                      </td>
                      <td data-label="Termo">
                        <span className="font-semibold text-slate-900">Termo de {term.tipo === 'entrega' ? 'entrega' : 'devolução'}</span>
                        <span className="block text-slate-500">Responsável T.I.: {term.responsavelTINome}</span>
                      </td>
                      <td data-label="Emissão">{formatDate(term.dataEmissao)}</td>
                      <td data-label="Situação">
                        <span className={`selo ${SELO_TOM[s.tom] || 'selo-neutro'}`}>{s.rotulo}</span>
                      </td>
                      <td data-label="Ações" className="col-acoes">
                        <span className="acoes-linha">
                          <button type="button" onClick={() => setSelectedTermForPrint(term)} className="btn btn-sm btn-secundario">
                            Visualizar termo
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio>Nenhum termo gerado até o momento.</Vazio>
        )}
      </section>
    </div>
  );
};
