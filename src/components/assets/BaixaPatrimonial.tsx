import { confirmar } from '../ui/dialogo.tsx';
import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { Asset, BaixaAtivo } from '../../types/index.ts';
import { formatCurrency, formatDate } from '../../utils/formatters.ts';
import { ROTULO_DESTINO_BAIXA, ROTULO_MOTIVO_BAIXA, baixaVigente } from '../../utils/cicloVida.ts';
import { AbrirArquivo } from '../comum/AbrirArquivo.tsx';
import { Dado } from '../ui/Janela.tsx';

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
    ...(baixa.destino === 'venda'
      ? [['Valor de venda', <span className="num">{formatCurrency(baixa.valorVenda || 0)}</span>] as [string, React.ReactNode]]
      : []),
    ['Registrada por', `${nome(baixa.criadoPor)} em ${formatDate(baixa.criadoEm)}`],
  ];

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {campos.map(([rotulo, valor]) => (
          <Dado key={rotulo} rotulo={rotulo}>
            {valor}
          </Dado>
        ))}
      </dl>
      {baixa.observacoes && <p className="break-words whitespace-pre-wrap text-slate-700">{baixa.observacoes}</p>}
      {evidencias.length > 0 && (
        <div className="space-y-1">
          <p className="texto-aux">Evidências</p>
          <ul className="flex flex-wrap gap-x-2 gap-y-1">
            {evidencias.map((a) => (
              <li key={a.id} className="min-w-0">
                <AbrirArquivo caminho={a.caminho} rotulo={a.nome} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {baixa.estornadaEm && (
        <p className="break-words text-slate-700">
          <span className="selo selo-neutro mr-1">Estornada</span> em {formatDate(baixa.estornadaEm)} por {nome(baixa.estornadaPor)}
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
    if (!(await confirmar(`Estornar a baixa de ${asset.tag}? O ativo volta ao estoque como "Disponível" e a baixa fica no histórico.`))) return;
    setErro('');
    setSalvando(true);
    const falha = await estornarBaixa(vigente.id, motivo);
    setSalvando(false);
    if (falha) return setErro(falha);
    setEstornando(false);
    setMotivo('');
  };

  return (
    <div className="space-y-4">
      {vigente && (
        <section className="cartao space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="secao-titulo">Baixa patrimonial</h3>
              <span className="selo selo-problema">Vigente</span>
            </div>
            {currentRole === 'ti_admin' && !estornando && (
              <button type="button" onClick={() => setEstornando(true)} className="btn btn-sm btn-secundario">
                <RotateCcw aria-hidden="true" /> Estornar baixa
              </button>
            )}
          </div>
          <DadosDaBaixa baixa={vigente} asset={asset} />

          {estornando && (
            <form onSubmit={confirmarEstorno} className="space-y-2 border-t border-slate-100 pt-3">
              <label htmlFor={`estorno-${vigente.id}`} className="rotulo">
                Motivo do estorno *
              </label>
              <textarea
                id={`estorno-${vigente.id}`}
                rows={2}
                required
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: baixa registrada no ativo errado"
                className="campo"
              />
              <p className="ajuda">O ativo volta ao estoque como "Disponível". O registro da baixa continua no histórico.</p>
              {erro && (
                <p className="erro" role="alert">
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
                  className="btn btn-sm btn-secundario"
                >
                  Voltar
                </button>
                <button type="submit" disabled={salvando} className="btn btn-sm btn-primario">
                  <RotateCcw aria-hidden="true" />
                  {salvando ? 'Estornando...' : 'Confirmar estorno'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {estornadas.length > 0 && (
        <section className="space-y-2">
          <h3 className="secao-titulo">Baixas estornadas ({estornadas.length})</h3>
          <ul className="space-y-3">
            {estornadas.map((b) => (
              <li key={b.id} className="cartao p-4">
                <DadosDaBaixa baixa={b} asset={asset} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
