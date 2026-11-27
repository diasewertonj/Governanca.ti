/**
 * Seção 28 · Atalhos da ficha da pessoa (só a T.I.): entregar equipamento, atribuir software
 * e entregar linha sem sair da pessoa. Escolhido o item, abre o fluxo de sempre (ficha do
 * equipamento ou do software, formulário da linha) já com a pessoa escolhida — as mesmas
 * confirmações, termo e histórico; nada é refeito aqui.
 */
import React, { useState } from 'react';
import { Laptop, Phone, Plus, Key } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { licencaAtiva } from '../../utils/licencas.ts';
import { Janela } from '../ui/Janela.tsx';
import { FormLinha } from '../fornecedores/LinhasLista.tsx';

type Escolha = 'equipamento' | 'software' | 'linha';

export const AtalhosPessoa: React.FC<{ pessoaId: string; pessoaNome: string }> = ({ pessoaId, pessoaNome }) => {
  const { assets, licenses, abrirFicha } = useApp();
  const { linhas, salvarLinha } = useRecursos();
  const [escolhendo, setEscolhendo] = useState<Escolha | null>(null);
  const [itemId, setItemId] = useState('');
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null);

  const equipamentos = assets.filter((a) => a.status === 'disponivel').sort((a, b) => a.tag.localeCompare(b.tag));
  const softwares = licenses
    .filter((l) => licencaAtiva(l) && !l.colaboradoresIds.includes(pessoaId))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const linhasLivres = linhas.filter((l) => l.status === 'ativa' && !l.colaboradorId);

  const continuar = () => {
    if (!itemId || !escolhendo) return;
    if (escolhendo === 'equipamento') abrirFicha({ tipo: 'ativo', id: itemId, entregarPara: pessoaId });
    else if (escolhendo === 'software') abrirFicha({ tipo: 'software', id: itemId, entregarPara: pessoaId });
    else setLinhaAberta(itemId);
    setEscolhendo(null);
    setItemId('');
  };

  const opcoes =
    escolhendo === 'equipamento'
      ? equipamentos.map((a) => ({ id: a.id, texto: `${a.tag} · ${a.nome}` }))
      : escolhendo === 'software'
        ? softwares.map((l) => {
            const livres = Math.max(0, l.assentosTotais - l.assentosAlocados);
            return { id: l.id, texto: `${l.nome} · ${livres ? `${livres} livre(s)` : 'sem assento livre'}` };
          })
        : linhasLivres.map((l) => ({ id: l.id, texto: [l.numero, l.plano].filter(Boolean).join(' · ') }));
  const vazio =
    escolhendo === 'equipamento'
      ? 'Nenhum equipamento disponível em estoque.'
      : escolhendo === 'software'
        ? 'Nenhum software ativo para atribuir (ou a pessoa já tem todos).'
        : 'Nenhuma linha ativa sem pessoa.';
  const linha = linhaAberta ? linhas.find((l) => l.id === linhaAberta) : undefined;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEscolhendo('equipamento')} className="btn btn-sm btn-secundario">
          <Laptop aria-hidden="true" /> Entregar equipamento
        </button>
        <button type="button" onClick={() => setEscolhendo('software')} className="btn btn-sm btn-secundario">
          <Key aria-hidden="true" /> Atribuir software
        </button>
        <button type="button" onClick={() => setEscolhendo('linha')} className="btn btn-sm btn-secundario">
          <Phone aria-hidden="true" /> Entregar linha
        </button>
      </div>

      {escolhendo && (
        <Janela
          tamanho="p"
          noCaminho={false}
          titulo={escolhendo === 'equipamento' ? 'Entregar equipamento' : escolhendo === 'software' ? 'Atribuir software' : 'Entregar linha'}
          subtitulo={`Para ${pessoaNome}`}
          icone={<Plus className="ico" />}
          onFechar={() => setEscolhendo(null)}
          rodape={
            <>
              <button type="button" onClick={() => setEscolhendo(null)} className="btn btn-secundario">
                Cancelar
              </button>
              <button type="button" disabled={!itemId} onClick={continuar} className="btn btn-primario">
                Continuar
              </button>
            </>
          }
        >
          {opcoes.length === 0 ? (
            <p className="texto-aux">{vazio}</p>
          ) : (
            <div className="space-y-2">
              <label htmlFor="atalho-item" className="rotulo">
                Qual?
              </label>
              <select id="atalho-item" value={itemId} onChange={(e) => setItemId(e.target.value)} className="campo">
                <option value="">Escolha…</option>
                {opcoes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.texto}
                  </option>
                ))}
              </select>
              <p className="ajuda">Em seguida abre a confirmação de sempre, com o termo e o histórico.</p>
            </div>
          )}
        </Janela>
      )}

      {linha && (
        <FormLinha
          linha={linha}
          colaboradorInicial={pessoaId}
          onSalvar={async (dados) => {
            const r = await salvarLinha(dados);
            if (r.erro) return r.erro;
            setLinhaAberta(null);
            return null;
          }}
          onCancelar={() => setLinhaAberta(null)}
        />
      )}
    </>
  );
};
