import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { linkTemporarioDb, mensagemDeErro, nomeDoArquivo } from '../../services/supabaseDb.ts';

/** Fase 8: abre um arquivo do armazenamento privado por link temporário (5 minutos) */
export const AbrirArquivo: React.FC<{ caminho: string; rotulo?: string }> = ({ caminho, rotulo }) => {
  const [erro, setErro] = useState('');
  const nome = rotulo ?? nomeDoArquivo(caminho);

  const abrir = async () => {
    setErro('');
    try {
      window.open(await linkTemporarioDb(caminho), '_blank', 'noopener');
    } catch (err) {
      setErro(`Não foi possível abrir o arquivo: ${mensagemDeErro(err)}`);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1 min-w-0">
      <button
        type="button"
        onClick={abrir}
        title={`Abrir ${nome}`}
        className="inline-flex items-center gap-1 min-w-0 px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-md text-left"
      >
        <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="break-all">{nome}</span>
      </button>
      {erro && (
        <span className="text-xs text-red-700" role="alert">
          {erro}
        </span>
      )}
    </span>
  );
};
