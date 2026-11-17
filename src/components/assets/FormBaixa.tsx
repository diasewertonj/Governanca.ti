import React, { useState } from 'react';
import { AlertTriangle, Archive, Info } from 'lucide-react';
import { Janela } from '../ui/Janela.tsx';
import { useApp } from '../../context/AppContext.tsx';
import type { Asset, DestinoBaixa, MotivoBaixa } from '../../types/index.ts';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import {
  MOTIVOS_SEM_DEVOLUCAO,
  ROTULO_DESTINO_BAIXA,
  ROTULO_MOTIVO_BAIXA,
  bloqueiosDaBaixa,
  motivoDevolucaoNaBaixa,
} from '../../utils/cicloVida.ts';
import { isoLocal } from '../../utils/formatters.ts';
import { ArquivosParaEnviar, enviarArquivos, type ArquivoParaEnviar } from './ArquivosParaEnviar.tsx';
import { confirmar } from '../ui/dialogo.tsx';
import { CampoMoeda } from '../ui/Campos.tsx';

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
  const [valorVenda, setValorVenda] = useState<number | undefined>(undefined);
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
    if (!salvando) void confirmarDescarte(itensPendentes).then((ok) => ok && onClose());
  };

  const mudarMotivo = (novo: MotivoBaixa | '') => {
    setMotivo(novo);
    // Perda, roubo e sinistro não têm para onde ir: sugere "não se aplica"
    if (novo && MOTIVOS_SEM_DEVOLUCAO.includes(novo) && !destino) setDestino('nao_se_aplica');
  };

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando || bloqueios.length > 0 || !motivo || !destino) return;
    const ok = await confirmar({
      titulo: `Dar baixa em ${asset.tag}?`,
      mensagem:
        `${ROTULO_MOTIVO_BAIXA[motivo]} · ${ROTULO_DESTINO_BAIXA[destino]}.\n\n` +
        'O ativo sai da lista principal e do valor do patrimônio e não pode mais ser editado nem transferido. O histórico continua na ficha.' +
        (encerraCustodia ? `\n\nA custódia de ${custodiante?.nome || 'colaborador'} é encerrada.` : '') +
        '\n\nDá para desfazer: o administrador estorna a baixa na ficha e o ativo volta ao estoque como disponível' +
        (encerraCustodia ? ' (sem voltar para a pessoa).' : '.'),
      confirmar: 'Dar baixa',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (!ok) return;

    setErro('');
    setSalvando(true);
    const r = await baixarAtivo(asset.id, {
      motivo,
      destino,
      dataBaixa,
      destinatario: destinatario || undefined,
      documento: documento || undefined,
      valorVenda: destino === 'venda' ? valorVenda : undefined,
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
    <Janela
      tamanho="m"
      idTitulo={id('titulo')}
      icone={<Archive className="h-4 w-4" aria-hidden="true" />}
      titulo="Dar baixa"
      subtitulo={`${asset.tag} · ${asset.nome}`}
      onFechar={fechar}
      rodape={
        <>
          <button type="button" onClick={fechar} disabled={salvando} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="submit" form={id('form')} disabled={salvando || bloqueios.length > 0} className="btn btn-perigo">
            {salvando ? 'Registrando...' : 'Confirmar baixa'}
          </button>
        </>
      }
    >
        <form id={id('form')} onSubmit={registrar} className="space-y-4">
          {bloqueios.length > 0 && (
            <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1" role="status">
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

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label htmlFor={id('motivo')} className="rotulo">
                Motivo *
              </label>
              <select
                id={id('motivo')}
                required
                value={motivo}
                onChange={(e) => mudarMotivo(e.target.value as MotivoBaixa | '')}
                className="campo"
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
              <label htmlFor={id('destino')} className="rotulo">
                Destino *
              </label>
              <select
                id={id('destino')}
                required
                value={destino}
                onChange={(e) => setDestino(e.target.value as DestinoBaixa | '')}
                className="campo"
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
              <label htmlFor={id('data')} className="rotulo">
                Data da baixa *
              </label>
              <input
                id={id('data')}
                type="date"
                required
                value={dataBaixa}
                onChange={(e) => setDataBaixa(e.target.value)}
                className="campo"
              />
            </div>
            <div>
              <label htmlFor={id('destinatario')} className="rotulo">
                Destinatário
              </label>
              <input
                id={id('destinatario')}
                type="text"
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
                placeholder="Instituição, comprador ou recicladora (CNPJ)"
                className="campo"
              />
            </div>
            <div>
              <label htmlFor={id('documento')} className="rotulo">
                Documento
              </label>
              <input
                id={id('documento')}
                type="text"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="Nº do laudo, certificado de descarte, BO..."
                className="campo"
              />
            </div>
            {destino === 'venda' && (
              <div>
                <label htmlFor={id('valor')} className="rotulo">
                  Valor de venda (R$)
                </label>
                <CampoMoeda id={id('valor')} valor={valorVenda} onMudar={setValorVenda} />
              </div>
            )}
            <div className="md:col-span-2 xl:col-span-2">
              <label htmlFor={id('obs')} className="rotulo">
                Observações
              </label>
              <textarea
                id={id('obs')}
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="campo"
              />
            </div>
            <div className="md:col-span-2 xl:col-span-2">
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

        </form>
    </Janela>
  );
};
