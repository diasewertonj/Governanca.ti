import React, { useState } from 'react';
import type { CondicaoItem, ItemTermo, ResponsibilityTerm } from '../../types/index.ts';
import { erroCancelarTermo, erroConferenciaTermo } from '../../utils/termos.ts';

const campo = 'w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

interface Props {
  tipo: 'entrega' | 'devolucao';
  /** Linhas sugeridas; a condição de cada uma é escolhida aqui (nada vem marcado) */
  linhasIniciais: ItemTermo[];
  nomePessoa?: string;
  /** Termo válido que será substituído (pede o motivo) */
  termoAnterior?: ResponsibilityTerm;
  gravando: boolean;
  /** Gera o termo; devolve a mensagem de erro, ou null se deu certo */
  onConfirmar: (linhas: ItemTermo[], motivoSubstituicao: string) => Promise<string | null>;
  onVoltar: () => void;
}

/**
 * Lote 1 (1.12): conferência item a item antes de gerar o termo — condição
 * (bom/avaria) e situação de cada linha, e a confirmação de quem conferiu.
 */
export const ConferenciaTermo: React.FC<Props> = ({
  tipo,
  linhasIniciais,
  nomePessoa,
  termoAnterior,
  gravando,
  onConfirmar,
  onVoltar,
}) => {
  const [linhas, setLinhas] = useState<ItemTermo[]>(linhasIniciais);
  const [conferido, setConferido] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const mudar = (i: number, mudanca: Partial<ItemTermo>) =>
    setLinhas((atual) => atual.map((l, j) => (j === i ? { ...l, ...mudanca } : l)));

  const confirmar = async () => {
    const problema = erroConferenciaTermo(linhas, conferido);
    if (problema) return setErro(problema);
    if (termoAnterior && erroCancelarTermo(motivo)) {
      return setErro(`Explique por que o termo ${termoAnterior.codigo} está sendo substituído.`);
    }
    const semDescricao = linhas.find((l) => l.condicao === 'avaria' && !l.observacao?.trim());
    if (semDescricao) return setErro(`Descreva a avaria de ${semDescricao.descricao}.`);
    setErro(null);
    const falha = await onConfirmar(linhas, motivo.trim());
    if (falha) setErro(falha);
  };

  const feito = tipo === 'entrega' ? 'entregue' : 'devolvido';
  // Devolução: a condição registrada no passo do checklist (que já mexeu no inventário) não muda aqui
  const travada = (i: number) => tipo === 'devolucao' && !!linhasIniciais[i]?.condicao;

  return (
    <div className="rounded-md border border-blue-200 bg-white p-2.5 space-y-2 text-xs">
      <p className="font-semibold text-slate-800">
        Confira cada item{nomePessoa ? ` com ${nomePessoa}` : ''} antes de gerar
      </p>
      <ul className="divide-y divide-slate-100">
        {linhas.map((l, i) => (
          <li key={`${l.descricao}-${i}`} className="py-1.5 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
            <span>
              <span className="font-medium text-slate-900">{l.descricao}</span>{' '}
              <span className="text-slate-500">{l.patrimonio}</span>
            </span>
            <select
              aria-label={`Condição de ${l.descricao}`}
              title={travada(i) ? 'Registrada no passo de devolução' : undefined}
              disabled={travada(i)}
              className={`${campo} disabled:bg-slate-100`}
              value={l.condicao || ''}
              onChange={(e) => mudar(i, { condicao: (e.target.value || undefined) as CondicaoItem | undefined })}
            >
              <option value="">Condição…</option>
              <option value="bom">Bom</option>
              <option value="avaria">Com avaria</option>
            </select>
            <select
              aria-label={`Situação de ${l.descricao}`}
              disabled={travada(i)}
              className={`${campo} disabled:bg-slate-100`}
              value={l.situacao}
              onChange={(e) => mudar(i, { situacao: e.target.value as ItemTermo['situacao'] })}
            >
              <option value={feito}>{tipo === 'entrega' ? 'Entregue' : 'Devolvido'}</option>
              <option value="pendente">Pendente</option>
              <option value="na">Não se aplica</option>
            </select>
            {l.condicao === 'avaria' && !travada(i) && (
              <input
                aria-label={`Avaria de ${l.descricao}`}
                className={`${campo} sm:col-span-3`}
                placeholder="Descreva a avaria"
                value={l.observacao || ''}
                onChange={(e) => mudar(i, { observacao: e.target.value })}
              />
            )}
          </li>
        ))}
      </ul>
      {termoAnterior && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-0.5" htmlFor="conferencia-motivo">
            Por que substituir o termo {termoAnterior.codigo}? *
          </label>
          <input
            id="conferencia-motivo"
            className={campo}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: patrimônio errado; faltou o carregador"
          />
          <p className="text-slate-500 mt-0.5">O termo atual fica no histórico como substituído e perde a validade.</p>
        </div>
      )}
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={conferido} onChange={(e) => setConferido(e.target.checked)} className="mt-0.5" />
        <span>Conferi os itens, a condição e a situação de cada um.</span>
      </label>
      {erro && (
        <p role="alert" className="font-medium text-red-700">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={gravando}
          onClick={onVoltar}
          className="px-3 py-1.5 font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
        >
          Voltar
        </button>
        <button
          type="button"
          disabled={gravando}
          onClick={confirmar}
          className="px-3 py-1.5 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {gravando ? 'Gerando…' : termoAnterior ? 'Gerar novo termo e substituir' : 'Gerar termo'}
        </button>
      </div>
    </div>
  );
};
