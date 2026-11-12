import React, { useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import type { CategoriaAnexoAtivo } from '../../types/index.ts';
import { TIPOS_ARQUIVO_ACEITOS, formatarTamanho, validarArquivo } from '../../services/supabaseDb.ts';
import { ROTULO_CATEGORIA_ANEXO } from './AnexosAtivo.tsx';
import { CLASSE_ARQUIVO, CLASSE_ROTULO } from '../comum/campos.ts';

export interface ArquivoParaEnviar {
  chave: string;
  arquivo: File;
  categoria: CategoriaAnexoAtivo;
}

type Anexar = (
  ativoId: string,
  arquivo: File,
  categoria: CategoriaAnexoAtivo,
  vinculo?: { manutencaoId?: string; baixaId?: string }
) => Promise<boolean>;

/** Sobe, um a um, os arquivos ligados ao registro já salvo (cada falha já aparece no aviso de erro) */
export async function enviarArquivos(
  anexar: Anexar,
  ativoId: string,
  itens: ArquivoParaEnviar[],
  vinculo: { manutencaoId?: string; baixaId?: string }
) {
  for (const i of itens) await anexar(ativoId, i.arquivo, i.categoria, vinculo);
}

interface ArquivosParaEnviarProps {
  id: string;
  rotulo: string;
  itens: ArquivoParaEnviar[];
  onChange: (itens: ArquivoParaEnviar[]) => void;
  /** A primeira é a sugerida para cada arquivo novo; com uma só, o tipo não é perguntado */
  categorias: CategoriaAnexoAtivo[];
}

/**
 * Fase 8: arquivos escolhidos num formulário (manutenção, baixa). Ficam só no
 * navegador e sobem depois que o registro é salvo, ligados a ele.
 */
export const ArquivosParaEnviar: React.FC<ArquivosParaEnviarProps> = ({ id, rotulo, itens, onChange, categorias }) => {
  const [erro, setErro] = useState('');
  const [chaveInput, setChaveInput] = useState(0);

  const escolher = (lista: FileList | null) => {
    const arquivos = Array.from(lista || []);
    const problemas = arquivos.map(validarArquivo).filter((m): m is string => Boolean(m));
    const validos = arquivos.filter((f) => !validarArquivo(f));
    setErro(problemas.join(' '));
    if (validos.length) {
      onChange([...itens, ...validos.map((arquivo) => ({ chave: crypto.randomUUID(), arquivo, categoria: categorias[0] }))]);
    }
    setChaveInput((k) => k + 1);
  };

  const mudarCategoria = (chave: string, categoria: CategoriaAnexoAtivo) =>
    onChange(itens.map((i) => (i.chave === chave ? { ...i, categoria } : i)));

  return (
    <div className="space-y-2">
      <label htmlFor={id} className={CLASSE_ROTULO}>
        {rotulo}
      </label>
      <input
        key={chaveInput}
        id={id}
        type="file"
        multiple
        accept={TIPOS_ARQUIVO_ACEITOS.join(',')}
        onChange={(e) => escolher(e.target.files)}
        aria-describedby={`${id}-ajuda`}
        className={CLASSE_ARQUIVO}
      />
      <p id={`${id}-ajuda`} className="text-xs text-slate-500">
        PDF ou imagem, até 10 MB cada. Os arquivos sobem só depois de salvar.
      </p>
      {itens.length > 0 && (
        <ul className="space-y-1.5">
          {itens.map((i) => (
            <li
              key={i.chave}
              className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs"
            >
              <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-all text-slate-800">
                {i.arquivo.name} <span className="text-slate-500">· {formatarTamanho(i.arquivo.size)}</span>
              </span>
              {categorias.length > 1 && (
                <>
                  <label htmlFor={`${id}-${i.chave}`} className="sr-only">
                    Tipo de {i.arquivo.name}
                  </label>
                  <select
                    id={`${id}-${i.chave}`}
                    value={i.categoria}
                    onChange={(e) => mudarCategoria(i.chave, e.target.value as CategoriaAnexoAtivo)}
                    className="text-xs px-2 py-1 bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  >
                    {categorias.map((c) => (
                      <option key={c} value={c}>
                        {ROTULO_CATEGORIA_ANEXO[c]}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <button
                type="button"
                onClick={() => onChange(itens.filter((x) => x.chave !== i.chave))}
                aria-label={`Retirar ${i.arquivo.name}`}
                className="p-1 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p className="text-xs text-red-700" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
};
