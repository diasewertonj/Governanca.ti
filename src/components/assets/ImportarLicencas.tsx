/**
 * Seção 28 · Importar licenças do Microsoft 365 (CSV) e do Google Workspace (texto colado).
 * Prévia antes de gravar: cria o software novo ou atualiza o que já existe (pelo nome),
 * com assentos, cobrança, renovação e fornecedor (a revenda). O valor e, no Google, a data
 * de renovação não vêm do fabricante: a prévia pede.
 */
import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { SoftwareLicense } from '../../types/index.ts';
import { chaveNome, lerGoogle, lerMicrosoft, type LicencaImportada } from '../../utils/importarLicencas.ts';
import { Janela } from '../ui/Janela.tsx';
import { CampoMoeda } from '../ui/Campos.tsx';

interface Linha extends LicencaImportada {
  incluir: boolean;
  existente?: SoftwareLicense;
  valor?: number;
}

export const ImportarLicencas: React.FC<{ onFechar: () => void }> = ({ onFechar }) => {
  const { licenses, fornecedores, cadastrarLicenca, editarLicenca, cadastrarFornecedor } = useApp();
  const [fonte, setFonte] = useState<'microsoft' | 'google'>('microsoft');
  const [texto, setTexto] = useState('');
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  const [resumo, setResumo] = useState('');

  const preparar = (lidas: LicencaImportada[]) => {
    if (!lidas.length) {
      setLinhas(null);
      return setErro(
        fonte === 'microsoft'
          ? 'Não achei produtos no arquivo. Use o CSV de Faturamento › Seus produtos do centro de administração do Microsoft 365.'
          : 'Não achei assinaturas no texto. Copie a lista de Faturamento › Assinaturas do Google Admin, do título "Assinaturas" até a última linha.'
      );
    }
    setErro('');
    setLinhas(
      lidas.map((l) => {
        const existente = licenses.find((x) => chaveNome(x.nome) === chaveNome(l.nome));
        return { ...l, incluir: true, existente, renovacao: l.renovacao || existente?.dataRenovacao || undefined };
      })
    );
  };

  const lerArquivo = async (f?: File) => {
    if (!f) return;
    preparar(lerMicrosoft(await f.text()));
  };

  const mudar = (i: number, m: Partial<Linha>) => setLinhas((ls) => (ls ? ls.map((l, j) => (j === i ? { ...l, ...m } : l)) : ls));
  const escolhidas = (linhas || []).filter((l) => l.incluir);
  // Cobrança própria exige a data de renovação (regra do banco)
  const faltaData = escolhidas.filter((l) => !l.gratuito && !l.renovacao && !l.existente);

  const fornecedorDe = async (nome: string | undefined, cache: Map<string, string>): Promise<{ id?: string; nome: string }> => {
    const alvo = nome || '';
    if (!alvo) return { nome: '' };
    const chave = chaveNome(alvo);
    if (cache.has(chave)) return { id: cache.get(chave), nome: alvo };
    const achado = fornecedores.find((f) => chaveNome(f.nome) === chave || chaveNome(f.nome).includes(chave) || chave.includes(chaveNome(f.nome)));
    if (achado) {
      cache.set(chave, achado.id);
      return { id: achado.id, nome: achado.nome };
    }
    const r = await cadastrarFornecedor({ nome: alvo, ativo: true });
    if (r.item) cache.set(chave, r.item.id);
    return { id: r.item?.id, nome: alvo };
  };

  const importar = async () => {
    setGravando(true);
    setErro('');
    const cache = new Map<string, string>();
    let criados = 0;
    let atualizados = 0;
    const falhas: string[] = [];
    for (const l of escolhidas) {
      const forn = await fornecedorDe(l.revenda || l.fabricante, cache);
      const obs = `Importado do ${l.fabricante === 'Microsoft' ? 'Microsoft 365' : 'Google Admin'} em ${new Date().toLocaleDateString('pt-BR')}: ${l.detalhe}.`;
      if (l.existente) {
        const e = l.existente;
        const falha = await editarLicenca(e.id, {
          assentosTotais: Math.max(l.assentos, e.assentosAlocados),
          tipoCobranca: l.cobranca,
          fabricante: e.fabricante || l.fabricante,
          ...(l.renovacao ? { dataRenovacao: l.renovacao } : {}),
          ...(l.valor !== undefined ? { valorMensal: l.valor } : {}),
          ...(!e.fornecedorId && forn.id ? { fornecedorId: forn.id, fornecedor: forn.nome } : {}),
          observacoes: [e.observacoes, obs].filter(Boolean).join('\n'),
        });
        if (falha) falhas.push(`${l.nome}: ${falha}`);
        else atualizados++;
      } else {
        const r = await cadastrarLicenca({
          nome: l.nome,
          fornecedor: forn.nome,
          fornecedorId: forn.id,
          fabricante: l.fabricante,
          chaveContrato: '',
          assentosTotais: Math.max(1, l.assentos),
          colaboradoresIds: [],
          dataRenovacao: l.renovacao || '',
          valorMensal: l.gratuito ? 0 : l.valor || 0,
          tipoCobranca: l.cobranca,
          formaCobranca: l.gratuito ? 'sem_custo' : 'propria',
          categoriaDespesa: 'software',
          observacoes: obs,
        });
        if (r.erro) falhas.push(`${l.nome}: ${r.erro}`);
        else criados++;
      }
    }
    setGravando(false);
    setResumo(`${criados} software(s) criado(s) e ${atualizados} atualizado(s).`);
    if (falhas.length) setErro(`Não foi possível gravar: ${falhas.join(' · ')}`);
  };

  return (
    <Janela
      titulo="Importar do Microsoft 365 e do Google"
      subtitulo="Cria os softwares (ou atualiza os que já existem) com assentos, cobrança, renovação e fornecedor"
      icone={<Upload className="ico" />}
      tamanho="g"
      noCaminho={false}
      onFechar={onFechar}
      rodape={
        resumo ? (
          <button type="button" onClick={onFechar} className="btn btn-primario">
            Concluir
          </button>
        ) : (
          <>
            <button type="button" onClick={onFechar} className="btn btn-secundario">
              Cancelar
            </button>
            <button type="button" disabled={!escolhidas.length || faltaData.length > 0 || gravando} onClick={importar} className="btn btn-primario">
              {gravando ? 'Importando…' : `Importar ${escolhidas.length || ''}`.trim()}
            </button>
          </>
        )
      }
    >
      {resumo ? (
        <div className="space-y-2">
          <p className="text-slate-800">{resumo}</p>
          <p className="texto-aux">Os assentos em uso no Nexus vêm das pessoas: atribua cada software pela ficha da pessoa ou do software.</p>
          {erro && (
            <p role="alert" className="erro">
              {erro}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="De onde importar">
            {(['microsoft', 'google'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={fonte === f}
                onClick={() => {
                  setFonte(f);
                  setLinhas(null);
                  setErro('');
                }}
                className={`btn btn-sm ${fonte === f ? 'btn-primario' : 'btn-secundario'}`}
              >
                {f === 'microsoft' ? 'Microsoft 365 (arquivo CSV)' : 'Google Workspace (colar a página)'}
              </button>
            ))}
          </div>

          {fonte === 'microsoft' ? (
            <div>
              <label htmlFor="imp-ms" className="rotulo">
                Arquivo CSV dos produtos
              </label>
              <input id="imp-ms" type="file" accept=".csv,text/csv" onChange={(e) => lerArquivo(e.target.files?.[0])} className="campo" />
              <p className="ajuda">Centro de administração do Microsoft 365 › Faturamento › Seus produtos › Exportar (CSV).</p>
            </div>
          ) : (
            <div>
              <label htmlFor="imp-google" className="rotulo">
                Texto da página de assinaturas
              </label>
              <textarea id="imp-google" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} className="campo font-mono" placeholder="Cole aqui a lista de assinaturas" />
              <p className="ajuda">Google Admin › Faturamento › Assinaturas: selecione a lista inteira, copie (Ctrl+C) e cole aqui.</p>
              <button type="button" disabled={!texto.trim()} onClick={() => preparar(lerGoogle(texto))} className="btn btn-sm btn-secundario mt-2">
                Ler assinaturas
              </button>
            </div>
          )}

          {linhas && (
            <div className="cartao-tabela">
              <table className="tabela tabela-cartoes">
                <thead>
                  <tr>
                    <th>Importar</th>
                    <th>Software</th>
                    <th className="num">Assentos</th>
                    <th>Cobrança</th>
                    <th>Renovação</th>
                    <th>Valor mensal (total)</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={l.nome}>
                      <td data-label="Importar">
                        <input type="checkbox" checked={l.incluir} onChange={(e) => mudar(i, { incluir: e.target.checked })} aria-label={`Importar ${l.nome}`} />
                      </td>
                      <td data-label="Software">
                        <span className="font-semibold text-slate-900">{l.nome}</span>
                        <span className="block texto-aux">{l.detalhe}</span>
                        <span className={`selo mt-1 ${l.existente ? 'selo-info' : 'selo-ok'}`}>{l.existente ? 'Atualiza o cadastrado' : 'Novo'}</span>
                        {l.gratuito && <span className="selo selo-neutro mt-1 ml-1">Sem custo</span>}
                        {l.revenda && <span className="block texto-aux">Fornecedor: {l.revenda}</span>}
                      </td>
                      <td data-label="Assentos" className="num">
                        <input
                          type="number"
                          min={1}
                          value={l.assentos}
                          onChange={(e) => mudar(i, { assentos: Number(e.target.value) || 0 })}
                          className="campo campo-sm w-24"
                          aria-label={`Assentos de ${l.nome}`}
                        />
                      </td>
                      <td data-label="Cobrança">{l.gratuito ? '—' : l.cobranca === 'anual' ? 'Anual' : 'Mensal'}</td>
                      <td data-label="Renovação">
                        {l.gratuito ? (
                          '—'
                        ) : (
                          <input
                            type="date"
                            value={l.renovacao || ''}
                            onChange={(e) => mudar(i, { renovacao: e.target.value || undefined })}
                            className={`campo campo-sm ${!l.renovacao && !l.existente && l.incluir ? 'border-red-400' : ''}`}
                            aria-label={`Renovação de ${l.nome}`}
                          />
                        )}
                      </td>
                      <td data-label="Valor mensal">
                        {l.gratuito ? '—' : <CampoMoeda id={`imp-valor-${i}`} valor={l.valor} onMudar={(v) => mudar(i, { valor: v })} className="campo campo-sm" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {faltaData.length > 0 && <p className="erro">Informe a data de renovação de: {faltaData.map((l) => l.nome).join(', ')} (o Google não envia essa data).</p>}
          {linhas && <p className="texto-aux">O valor é opcional agora: sem ele o software entra com R$ 0 e você completa depois. Fornecedor novo é cadastrado só com o nome.</p>}
          {erro && (
            <p role="alert" className="erro">
              {erro}
            </p>
          )}
        </div>
      )}
    </Janela>
  );
};
