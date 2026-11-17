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
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
      <button type="button" onClick={abrir} title={`Abrir ${nome}`} className="btn btn-sm btn-secundario min-w-0 text-left whitespace-normal">
        <ExternalLink aria-hidden="true" />
        <span className="break-all">{nome}</span>
      </button>
      {erro && (
        <span className="erro mt-0" role="alert">
          {erro}
        </span>
      )}
    </span>
  );
};
