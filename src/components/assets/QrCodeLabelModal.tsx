import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Asset } from '../../types/index.ts';
import { Printer, X, Download, ShieldCheck } from 'lucide-react';

interface QrCodeLabelModalProps {
  asset: Asset;
  onClose: () => void;
}

export const QrCodeLabelModal: React.FC<QrCodeLabelModalProps> = ({ asset, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const assetUrl = `${window.location.origin}/#asset/${asset.id}`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        assetUrl,
        {
          width: 140,
          margin: 1,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        },
        (error) => {
          if (error) console.error('Erro ao gerar QR Code:', error);
        }
      );
    }
  }, [assetUrl]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadImage = () => {
    if (canvasRef.current) {
      const url = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `etiqueta-${asset.tag.replace('#', '')}.png`;
      a.click();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Etiqueta Patrimonial de T.I.</h3>
            <p className="text-xs text-slate-500">QR Code para auditoria e leitura com leitor/celular</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pré-visualização da Etiqueta Física */}
        <div className="p-6 bg-slate-50/70 flex flex-col items-center">
          <div className="print-label-sticker w-full max-w-sm bg-white border border-slate-300 rounded-lg p-4 shadow-xs">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Nexus Corp · Patrimônio
                </span>
              </div>
              <span className="font-mono text-sm font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                {asset.tag}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="shrink-0 bg-white p-1 rounded border border-slate-200">
                <canvas ref={canvasRef} className="w-28 h-28 block" />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Equipamento</span>
                  <p className="text-xs font-medium text-slate-900 truncate">{asset.nome}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Marca / Modelo</span>
                  <p className="text-xs text-slate-700 truncate">{asset.marca} {asset.modelo}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Número de Série</span>
                  <p className="font-mono text-xs text-slate-800 truncate">{asset.serialNumber}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <span>Inventário TI · Uso Obrigatório</span>
              <span>Propriedade Nexus Tech</span>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500 text-center">
            Formato otimizado para etiquetas adesivas 80x45mm ou papel térmico.
          </p>
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-white border-t border-slate-100">
          <button
            type="button"
            onClick={handleDownloadImage}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Baixar Imagem PNG
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-xs transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir Etiqueta
          </button>
        </div>
      </div>
    </div>
  );
};
