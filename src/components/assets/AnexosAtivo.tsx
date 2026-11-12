import React, { useState } from 'react';
import { Paperclip, ExternalLink, Trash2, Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { Asset, CategoriaAnexoAtivo } from '../../types/index.ts';
import { formatDate } from '../../utils/formatters.ts';
import {
  TIPOS_ARQUIVO_ACEITOS,
  formatarTamanho,
  linkTemporarioDb,
  mensagemDeErro,
  validarArquivo,
} from '../../services/supabaseDb.ts';

export const ROTULO_CATEGORIA_ANEXO: Record<CategoriaAnexoAtivo, string> = {
  nota_fiscal: 'Nota fiscal',
  orcamento: 'Orçamento',
  os: 'Ordem de serviço',
  laudo: 'Laudo',
  foto: 'Foto',
  evidencia_baixa: 'Evidência de baixa',
  outro: 'Outro',
};

/** Fase 8: arquivos do ativo (só a T.I. vê e envia). O arquivo sobe ao clicar em "Anexar". */
export const AnexosAtivo: React.FC<{ asset: Asset; podeEditar: boolean }> = ({ asset, podeEditar }) => {
  const { anexarArquivoAtivo, removerAnexoAtivo } = useApp();
  const [categoria, setCategoria] = useState<CategoriaAnexoAtivo>('nota_fiscal');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [chaveInput, setChaveInput] = useState(0);
  const anexos = asset.anexos || [];

  const escolher = (f: File | undefined) => {
    if (!f) return;
    const msg = validarArquivo(f);
    setErro(msg || '');
    setArquivo(msg ? null : f);
  };

  const anexar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    const ok = await anexarArquivoAtivo(asset.id, arquivo, categoria);
    setEnviando(false);
    if (ok) {
      setArquivo(null);
      setChaveInput((k) => k + 1);
    }
  };

  const abrir = async (caminho: string) => {
    try {
      window.open(await linkTemporarioDb(caminho), '_blank', 'noopener');
    } catch (err) {
      setErro(`Não foi possível abrir o arquivo: ${mensagemDeErro(err)}`);
    }
  };

  const remover = async (id: string) => {
    const anexo = anexos.find((a) => a.id === id);
    if (!anexo || !window.confirm(`Remover o arquivo "${anexo.nome}"? Esta ação não pode ser desfeita.`)) return;
    await removerAnexoAtivo(anexo);
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
        <Paperclip className="w-4 h-4 text-slate-600" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Anexos</h3>
        <span className="text-xs text-slate-500">({anexos.length})</span>
      </div>

      {anexos.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhum arquivo anexado.</p>
      ) : (
        <ul className="space-y-2">
          {anexos.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-md border border-slate-200 text-xs"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 break-all">{a.nome}</p>
                <p className="text-slate-500">
                  {ROTULO_CATEGORIA_ANEXO[a.categoria]} · {formatDate(a.criadoEm)}
                  {a.tamanho ? ` · ${formatarTamanho(a.tamanho)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => abrir(a.caminho)}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-md"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir
                </button>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => remover(a.id)}
                    aria-label={`Remover ${a.nome}`}
                    className="p-1.5 text-red-700 hover:bg-red-50 rounded-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {podeEditar && (
        <div className="grid grid-cols-1 md:grid-cols-[10rem_1fr_auto] gap-2 items-center pt-1">
          <label htmlFor={`anexo-cat-${asset.id}`} className="sr-only">
            Tipo do arquivo
          </label>
          <select
            id={`anexo-cat-${asset.id}`}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaAnexoAtivo)}
            className="w-full text-xs px-2 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
          >
            {(Object.keys(ROTULO_CATEGORIA_ANEXO) as CategoriaAnexoAtivo[])
              .filter((c) => c !== 'evidencia_baixa')
              .map((c) => (
                <option key={c} value={c}>
                  {ROTULO_CATEGORIA_ANEXO[c]}
                </option>
              ))}
          </select>
          <label htmlFor={`anexo-arq-${asset.id}`} className="sr-only">
            Arquivo
          </label>
          <input
            key={chaveInput}
            id={`anexo-arq-${asset.id}`}
            type="file"
            accept={TIPOS_ARQUIVO_ACEITOS.join(',')}
            onChange={(e) => escolher(e.target.files?.[0])}
            className="block w-full max-w-full text-xs text-slate-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:text-xs file:font-semibold"
          />
          <button
            type="button"
            onClick={anexar}
            disabled={!arquivo || enviando}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {enviando ? 'Enviando...' : 'Anexar'}
          </button>
        </div>
      )}
      {erro && (
        <p className="text-xs text-red-700" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
};
