import { confirmar } from '../ui/dialogo.tsx';
import React, { useState } from 'react';
import { ExternalLink, Trash2, Upload } from 'lucide-react';
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
import { CLASSE_ARQUIVO } from '../comum/campos.ts';
import { Vazio } from '../ui/Tela.tsx';

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
    if (!anexo || !(await confirmar(`Remover o arquivo "${anexo.nome}"? Esta ação não pode ser desfeita.`))) return;
    await removerAnexoAtivo(anexo);
  };

  return (
    <section className="space-y-2">
      <h3 className="secao-titulo">Anexos ({anexos.length})</h3>

      {anexos.length === 0 ? (
        <Vazio>Nenhum arquivo anexado.</Vazio>
      ) : (
        <div className="cartao overflow-hidden">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Tipo</th>
                <th>Enviado em</th>
                <th>Tamanho</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {anexos.map((a) => (
                <tr key={a.id}>
                  <td data-label="Arquivo" className="font-medium break-all text-slate-900">
                    {a.nome}
                  </td>
                  <td data-label="Tipo">{ROTULO_CATEGORIA_ANEXO[a.categoria]}</td>
                  <td data-label="Enviado em">{formatDate(a.criadoEm)}</td>
                  <td data-label="Tamanho" className="font-mono">
                    {a.tamanho ? formatarTamanho(a.tamanho) : '—'}
                  </td>
                  <td data-label="Ações" className="text-right">
                    <span className="acoes-linha">
                      <button type="button" onClick={() => abrir(a.caminho)} className="btn btn-sm btn-secundario">
                        <ExternalLink aria-hidden="true" /> Abrir
                      </button>
                      {podeEditar && (
                        <button
                          type="button"
                          onClick={() => remover(a.id)}
                          title="Remover"
                          aria-label={`Remover ${a.nome}`}
                          className="btn-icone btn-icone-perigo"
                        >
                          <Trash2 />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {podeEditar && (
        <div className="cartao space-y-3 p-4">
          <h4 className="secao-titulo">Anexar arquivo</h4>
          <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[12rem_1fr_auto]">
            <div>
              <label htmlFor={`anexo-cat-${asset.id}`} className="rotulo">
                Tipo do arquivo
              </label>
              <select
                id={`anexo-cat-${asset.id}`}
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaAnexoAtivo)}
                className="campo"
              >
                {(Object.keys(ROTULO_CATEGORIA_ANEXO) as CategoriaAnexoAtivo[])
                  .filter((c) => c !== 'evidencia_baixa')
                  .map((c) => (
                    <option key={c} value={c}>
                      {ROTULO_CATEGORIA_ANEXO[c]}
                    </option>
                  ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor={`anexo-arq-${asset.id}`} className="rotulo">
                Arquivo
              </label>
              <input
                key={chaveInput}
                id={`anexo-arq-${asset.id}`}
                type="file"
                accept={TIPOS_ARQUIVO_ACEITOS.join(',')}
                onChange={(e) => escolher(e.target.files?.[0])}
                className={CLASSE_ARQUIVO}
              />
            </div>
            <button type="button" onClick={anexar} disabled={!arquivo || enviando} className="btn btn-primario">
              <Upload aria-hidden="true" />
              {enviando ? 'Enviando...' : 'Anexar'}
            </button>
          </div>
          <p className="ajuda">PDF ou imagem, até 10 MB.</p>
        </div>
      )}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
};
