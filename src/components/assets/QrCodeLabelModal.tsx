import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Asset } from '../../types/index.ts';
import { Printer, Download, ShieldCheck } from 'lucide-react';
import { Janela } from '../ui/Janela.tsx';
import { useApp } from '../../context/AppContext.tsx';

interface QrCodeLabelModalProps {
  asset: Asset;
  onClose: () => void;
}

export const QrCodeLabelModal: React.FC<QrCodeLabelModalProps> = ({ asset, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { settings } = useApp();
  // Nome da empresa das Configurações (antes era fixo "Nexus Corp"/"Nexus Tech")
  const empresa = settings.nomeFantasia || settings.razaoSocial || 'Empresa';

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
    <Janela
      tamanho="p"
      icone={<Printer className="h-4 w-4" />}
      titulo="Etiqueta patrimonial de T.I."
      subtitulo="QR Code para auditoria e leitura com leitor/celular"
      onFechar={onClose}
      rodape={
        <div className="no-print flex items-center justify-end gap-2">
          <button type="button" onClick={handleDownloadImage} className="btn btn-secundario">
            <Download />
            Baixar imagem PNG
          </button>
          <button type="button" onClick={handlePrint} className="btn btn-primario">
            <Printer />
            Imprimir etiqueta
          </button>
        </div>
      }
    >
      {/* Pré-visualização da etiqueta física */}
      <div className="flex flex-col items-center">
          <div className="print-label-sticker w-full max-w-sm bg-white border border-slate-300 rounded-lg p-4 shadow-xs">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  {empresa} · Patrimônio
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
              <span className="truncate">Propriedade de {empresa}</span>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500 text-center">
            Formato otimizado para etiquetas adesivas 80x45mm ou papel térmico.
          </p>
      </div>
    </Janela>
  );
};
