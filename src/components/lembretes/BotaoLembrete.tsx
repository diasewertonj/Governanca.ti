import React, { useState } from 'react';
import { BellPlus, Check } from 'lucide-react';

/**
 * Botão "Criar lembrete" de 1 clique (garantia do ativo, vencimento do
 * contrato). Só grava no clique; se já houver lembrete aberto, mostra
 * "✓ Lembrete criado"; se a gravação falhar, mostra o motivo.
 */
export const BotaoLembrete: React.FC<{ jaExiste: boolean; criar: () => Promise<string | null> }> = ({
  jaExiste,
  criar,
}) => {
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState('');

  if (jaExiste) {
    return (
      <span className="selo selo-ok">
        <Check aria-hidden="true" />
        Lembrete criado
      </span>
    );
  }

  const clicar = async () => {
    setGravando(true);
    setErro('');
    try {
      const falha = await criar();
      if (falha) setErro(`Lembrete não criado: ${falha}`);
    } finally {
      setGravando(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={clicar}
        disabled={gravando}
        className="btn btn-secundario btn-sm"
      >
        <BellPlus aria-hidden="true" />
        {gravando ? 'Criando...' : 'Criar lembrete'}
      </button>
      {erro && (
        <span className="erro" role="alert">
          {erro}
        </span>
      )}
    </span>
  );
};
