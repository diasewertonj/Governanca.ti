import React, { useState } from 'react';
import { Archive, History, RotateCcw } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Asset, BaixaAtivo } from '../../types/index.ts';
import { formatCurrency, formatDate } from '../../utils/formatters.ts';
import { ROTULO_DESTINO_BAIXA, ROTULO_MOTIVO_BAIXA, baixaVigente } from '../../utils/cicloVida.ts';
import { AbrirArquivo } from '../comum/AbrirArquivo.tsx';
import { CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/campos.ts';

/** Dados de uma baixa (vigente ou estornada) em pares rótulo/valor */
const DadosDaBaixa: React.FC<{ baixa: BaixaAtivo; asset: Asset }> = ({ baixa, asset }) => {
  const { employees } = useApp();
  const nome = (id?: string) => (id ? employees.find((e) => e.id === id)?.nome || 'Colaborador removido' : '-');
  const evidencias = (asset.anexos || []).filter((a) => a.baixaId === baixa.id);
  const campos: [string, React.ReactNode][] = [
    ['Data da baixa', formatDate(baixa.dataBaixa)],
    ['Motivo', ROTULO_MOTIVO_BAIXA[baixa.motivo]],
    ['Destino', ROTULO_DESTINO_BAIXA[baixa.destino]],
    ['Destinatário', baixa.destinatario || '-'],
    ['Documento', baixa.documento || '-'],
    ...(baixa.destino === 'venda' ? [['Valor de venda', formatCurrency(baixa.valorVenda || 0)] as [string, React.ReactNode]] : []),
    ['Registrada por', `${nome(baixa.criadoPor)} em ${formatDate(baixa.criadoEm)}`],
  ];

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs">
        {campos.map(([rotulo, valor]) => (
          <div key={rotulo} className="min-w-0">
            <dt className="text-xs uppercase font-semibold text-slate-500">{rotulo}</dt>
            <dd className="text-slate-800 break-words">{valor}</dd>
          </div>
        ))}
      </dl>
      {baixa.observacoes && <p className="text-xs text-slate-700 whitespace-pre-wrap break-words">{baixa.observacoes}</p>}
      {evidencias.length > 0 && (
        <div className="text-xs">
          <span className="uppercase font-semibold text-slate-500">Evidências</span>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
            {evidencias.map((a) => (
              <li key={a.id} className="min-w-0">
                <AbrirArquivo caminho={a.caminho} rotulo={a.nome} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {baixa.estornadaEm && (
        <p className="text-xs text-slate-700 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 break-words">
          <span className="font-semibold">Estornada</span> em {formatDate(baixa.estornadaEm)} por {nome(baixa.estornadaPor)}
          {baixa.motivoEstorno ? `: ${baixa.motivoEstorno}` : ''}
        </p>
      )}
    </div>
  );
};

/**
 * Fase 8: baixa patrimonial na ficha (só a T.I. recebe esses dados). Mostra a
 * baixa vigente com as evidências e, para ti_admin, "Estornar baixa" (motivo e
 * confirmação). Baixas estornadas ficam abaixo, como histórico.
 */
export const BaixaPatrimonial: React.FC<{ asset: Asset }> = ({ asset }) => {
  const { currentRole, estornarBaixa } = useApp();
  const [estornando, setEstornando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const vigente = baixaVigente(asset);
  const estornadas = (asset.baixas || []).filter((b) => b.estornadaEm).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  if (!vigente && estornadas.length === 0) return null;

  const confirmarEstorno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vigente || salvando) return;
    if (!motivo.trim()) return setErro('Informe o motivo do estorno.');
    if (!window.confirm(`Estornar a baixa de ${asset.tag}? O ativo volta ao estoque como "Disponível" e a baixa fica no histórico.`)) return;
    setErro('');
    setSalvando(true);
    const falha = await estornarBaixa(vigente.id, motivo);
    setSalvando(false);
    if (falha) return setErro(falha);
    setEstornando(false);
    setMotivo('');
  };

  return (
    <div className="space-y-3">
      {vigente && (
        <div className="border border-red-200 bg-red-50/40 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-red-100">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-red-700" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-900">Baixa patrimonial</h3>
            </div>
            {currentRole === 'ti_admin' && !estornando && (
              <button
                type="button"
                onClick={() => setEstornando(true)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Estornar baixa
              </button>
            )}
          </div>
          <DadosDaBaixa baixa={vigente} asset={asset} />

          {estornando && (
            <form onSubmit={confirmarEstorno} className="border border-slate-200 bg-white rounded-md p-3 space-y-2">
              <label htmlFor={`estorno-${vigente.id}`} className={CLASSE_ROTULO}>
                Motivo do estorno *
              </label>
              <textarea
                id={`estorno-${vigente.id}`}
                rows={2}
                required
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: baixa registrada no ativo errado"
                className={CLASSE_CAMPO}
              />
              <p className="text-xs text-slate-600">O ativo volta ao estoque como "Disponível". O registro da baixa continua no histórico.</p>
              {erro && (
                <p className="text-xs font-medium text-red-700" role="alert">
                  {erro}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => {
                    setEstornando(false);
                    setMotivo('');
                    setErro('');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  {salvando ? 'Estornando...' : 'Confirmar estorno'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {estornadas.length > 0 && (
        <div className="border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
            <History className="w-4 h-4 text-slate-600" aria-hidden="true" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Baixas estornadas</h3>
            <span className="text-xs text-slate-500">({estornadas.length})</span>
          </div>
          <ul className="space-y-3">
            {estornadas.map((b) => (
              <li key={b.id} className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <DadosDaBaixa baixa={b} asset={asset} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
