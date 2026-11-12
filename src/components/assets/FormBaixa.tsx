import React, { useState } from 'react';
import { AlertTriangle, Archive, Info, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Asset, DestinoBaixa, MotivoBaixa } from '../../types/index.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';
import {
  MOTIVOS_SEM_DEVOLUCAO,
  ROTULO_DESTINO_BAIXA,
  ROTULO_MOTIVO_BAIXA,
  bloqueiosDaBaixa,
  motivoDevolucaoNaBaixa,
} from '../../utils/cicloVida.ts';
import { isoLocal } from '../../utils/formatters.ts';
import { ArquivosParaEnviar, enviarArquivos, type ArquivoParaEnviar } from './ArquivosParaEnviar.tsx';

/**
 * Fase 8: "Dar baixa" (só ti_admin) em modal-tela. Explica na tela o que
 * impede a baixa (ativo com alguém, manutenção em andamento) antes de enviar,
 * pede confirmação e só então grava; as evidências sobem depois, ligadas à baixa.
 */
export const FormBaixa: React.FC<{ asset: Asset; onClose: () => void }> = ({ asset, onClose }) => {
  const { employees, baixarAtivo, anexarArquivoAtivo } = useApp();
  const [motivo, setMotivo] = useState<MotivoBaixa | ''>('');
  const [destino, setDestino] = useState<DestinoBaixa | ''>('');
  const [dataBaixa, setDataBaixa] = useState(isoLocal(new Date()));
  const [destinatario, setDestinatario] = useState('');
  const [documento, setDocumento] = useState('');
  const [valorVenda, setValorVenda] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [evidencias, setEvidencias] = useState<ArquivoParaEnviar[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const custodiante = employees.find((e) => e.id === asset.custodianteId);
  const bloqueios = bloqueiosDaBaixa(asset, motivo);
  const encerraCustodia = Boolean(asset.custodianteId && motivo && MOTIVOS_SEM_DEVOLUCAO.includes(motivo));

  const valores = JSON.stringify([motivo, destino, dataBaixa, destinatario, documento, valorVenda, observacoes]);
  const [valoresIniciais] = useState(valores);
  const itensPendentes = valores !== valoresIniciais || evidencias.length ? [`Baixa de ${asset.tag} não registrada`] : [];
  useRegistrarPendencias(`baixa:${asset.id}`, itensPendentes);

  const fechar = () => {
    if (!salvando && confirmarDescarte(itensPendentes)) onClose();
  };

  const mudarMotivo = (novo: MotivoBaixa | '') => {
    setMotivo(novo);
    // Perda, roubo e sinistro não têm para onde ir: sugere "não se aplica"
    if (novo && MOTIVOS_SEM_DEVOLUCAO.includes(novo) && !destino) setDestino('nao_se_aplica');
  };

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando || bloqueios.length > 0 || !motivo || !destino) return;
    const aviso =
      `Confirmar a baixa de ${asset.tag} (${ROTULO_MOTIVO_BAIXA[motivo]} · ${ROTULO_DESTINO_BAIXA[destino]})?\n\n` +
      'O ativo sai da lista principal e não pode mais ser editado nem transferido. Só um estorno o traz de volta.' +
      (encerraCustodia ? `\n\nA custódia de ${custodiante?.nome || 'colaborador'} será encerrada.` : '');
    if (!window.confirm(aviso)) return;

    setErro('');
    setSalvando(true);
    const r = await baixarAtivo(asset.id, {
      motivo,
      destino,
      dataBaixa,
      destinatario: destinatario || undefined,
      documento: documento || undefined,
      valorVenda: destino === 'venda' && valorVenda.trim() !== '' ? Number(valorVenda) : undefined,
      observacoes: observacoes || undefined,
    });
    if (r.erro !== undefined) {
      setErro(r.erro);
      setSalvando(false);
      return;
    }
    // As evidências sobem só agora, ligadas à baixa registrada
    await enviarArquivos(anexarArquivoAtivo, asset.id, evidencias, { baixaId: r.id });
    onClose();
  };

  const id = (campo: string) => `baixa-${asset.id}-${campo}`;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id('titulo')}
        className="relative w-full max-w-2xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 sm:overflow-hidden my-0 sm:my-6"
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="min-w-0">
            <h2 id={id('titulo')} className="text-base font-semibold text-slate-900">
              Dar baixa
            </h2>
            <p className="text-xs text-slate-600 break-words">
              {asset.tag} · {asset.nome}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={fechar}
            className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={registrar} className="p-6 space-y-4 sm:max-h-[75vh] sm:overflow-y-auto">
          {bloqueios.length > 0 && (
            <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2 space-y-1" role="status">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> A baixa ainda não pode ser feita
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                {bloqueios.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {encerraCustodia && (
            <p className="flex items-start gap-1.5 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                O ativo está com {custodiante?.nome || 'um colaborador'}. A custódia será encerrada com o motivo "
                {motivo && motivoDevolucaoNaBaixa(motivo)}".
              </span>
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor={id('motivo')} className={CLASSE_ROTULO}>
                Motivo *
              </label>
              <select
                id={id('motivo')}
                required
                value={motivo}
                onChange={(e) => mudarMotivo(e.target.value as MotivoBaixa | '')}
                className={CLASSE_CAMPO}
              >
                <option value="">Selecione...</option>
                {(Object.keys(ROTULO_MOTIVO_BAIXA) as MotivoBaixa[]).map((m) => (
                  <option key={m} value={m}>
                    {ROTULO_MOTIVO_BAIXA[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={id('destino')} className={CLASSE_ROTULO}>
                Destino *
              </label>
              <select
                id={id('destino')}
                required
                value={destino}
                onChange={(e) => setDestino(e.target.value as DestinoBaixa | '')}
                className={CLASSE_CAMPO}
              >
                <option value="">Selecione...</option>
                {(Object.keys(ROTULO_DESTINO_BAIXA) as DestinoBaixa[]).map((d) => (
                  <option key={d} value={d}>
                    {ROTULO_DESTINO_BAIXA[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={id('data')} className={CLASSE_ROTULO}>
                Data da baixa *
              </label>
              <input
                id={id('data')}
                type="date"
                required
                value={dataBaixa}
                onChange={(e) => setDataBaixa(e.target.value)}
                className={CLASSE_CAMPO}
              />
            </div>
            <div>
              <label htmlFor={id('destinatario')} className={CLASSE_ROTULO}>
                Destinatário
              </label>
              <input
                id={id('destinatario')}
                type="text"
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
                placeholder="Instituição, comprador ou recicladora (CNPJ)"
                className={CLASSE_CAMPO}
              />
            </div>
            <div>
              <label htmlFor={id('documento')} className={CLASSE_ROTULO}>
                Documento
              </label>
              <input
                id={id('documento')}
                type="text"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="Nº do laudo, certificado de descarte, BO..."
                className={CLASSE_CAMPO}
              />
            </div>
            {destino === 'venda' && (
              <div>
                <label htmlFor={id('valor')} className={CLASSE_ROTULO}>
                  Valor de venda (R$)
                </label>
                <input
                  id={id('valor')}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={valorVenda}
                  onChange={(e) => setValorVenda(e.target.value)}
                  className={`${CLASSE_CAMPO} font-mono`}
                />
              </div>
            )}
            <div className="md:col-span-2">
              <label htmlFor={id('obs')} className={CLASSE_ROTULO}>
                Observações
              </label>
              <textarea
                id={id('obs')}
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className={CLASSE_CAMPO}
              />
            </div>
            <div className="md:col-span-2">
              <ArquivosParaEnviar
                id={id('evidencias')}
                rotulo="Evidências (certificado, laudo, foto, BO)"
                itens={evidencias}
                onChange={setEvidencias}
                categorias={['evidencia_baixa']}
              />
            </div>
          </div>

          <p className="flex items-start gap-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
            O ativo sai da lista principal. O histórico continua na ficha.
          </p>

          {erro && (
            <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">
              {erro}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={fechar}
              disabled={salvando}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || bloqueios.length > 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Archive className="w-3.5 h-3.5" aria-hidden="true" />
              {salvando ? 'Registrando...' : 'Confirmar baixa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
