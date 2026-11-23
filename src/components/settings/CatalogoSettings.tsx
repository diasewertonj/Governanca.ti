import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { CatalogoItem, TipoCatalogo } from '../../types/index.ts';
import { normalizar } from '../../utils/processos.ts';
import { BarraAlteracoes } from '../comum/BarraAlteracoes.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';

const ROTULO_TIPO: Record<TipoCatalogo, string> = {
  conta: 'Contas e sistemas',
  grupo_email: 'Grupos de e-mail',
  equipamento: 'Equipamentos',
  acessorio: 'Acessórios',
  tarefa: 'Tarefas da T.I.',
};
const TIPOS = Object.keys(ROTULO_TIPO) as TipoCatalogo[];

/**
 * Fase 6: catálogo de onboarding. Define o que o RH vê para marcar e o que o
 * checklist sugere. "Sugerido" = já vem marcado; nada é obrigatório.
 * Itens não são apagados (histórico): ficam inativos.
 */
export const CatalogoSettings: React.FC = () => {
  const { catalogo, salvarCatalogo } = useApp();
  const [edicoes, setEdicoes] = useState<Record<string, CatalogoItem>>({});
  const [novos, setNovos] = useState<string[]>([]);
  const [novoTipo, setNovoTipo] = useState<TipoCatalogo>('conta');
  const [novoNome, setNovoNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const atual = (c: CatalogoItem) => edicoes[c.id] || c;
  const lista = [...catalogo.map(atual), ...novos.map((id) => edicoes[id]).filter(Boolean)];
  const editar = (c: CatalogoItem, mudanca: Partial<CatalogoItem>) =>
    setEdicoes((p) => ({ ...p, [c.id]: { ...atual(c), ...mudanca } }));

  const itensPendentes = Object.values(edicoes).map((c) =>
    novos.includes(c.id) ? `Catálogo: incluir ${c.nome}` : `Catálogo: alterar ${catalogo.find((x) => x.id === c.id)?.nome || c.nome}`
  );
  useRegistrarPendencias('catalogo', itensPendentes);

  const incluir = () => {
    const nome = novoNome.trim();
    if (!nome) return;
    if (lista.some((c) => c.tipo === novoTipo && normalizar(c.nome) === normalizar(nome))) {
      return setErro(`"${nome}" já está no catálogo.`);
    }
    const id = crypto.randomUUID();
    const ordem = Math.max(0, ...lista.filter((c) => c.tipo === novoTipo).map((c) => c.ordem)) + 1;
    setEdicoes((p) => ({ ...p, [id]: { id, tipo: novoTipo, nome, sugeridoOnboarding: false, ativo: true, ordem } }));
    setNovos((p) => [...p, id]);
    setNovoNome('');
    setErro(null);
  };

  const salvar = async () => {
    const itens = Object.values(edicoes);
    if (itens.some((c) => !c.nome.trim())) return setErro('Todo item precisa de um nome.');
    setSalvando(true);
    const ok = await salvarCatalogo(itens, novos);
    setSalvando(false);
    if (ok) {
      setEdicoes({});
      setNovos([]);
      setErro(null);
    }
  };

  const campo = 'campo';

  return (
    <div className="cartao">
      <div className="p-4 space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="secao-titulo">Catálogo de admissão</h3>
          <p className="ajuda">
            O que o RH pode pedir e o que o checklist sugere. Itens <strong>sugeridos</strong> já vêm marcados; nada é
            obrigatório. Para tirar um item de uso, desmarque <strong>ativo</strong> (o histórico é mantido).
          </p>
        </div>

        {TIPOS.map((tipo) => {
          const doTipo = lista.filter((c) => c.tipo === tipo).sort((a, b) => a.ordem - b.ordem);
          return (
            <div key={tipo} className="space-y-2">
              <h4 className="rotulo">{ROTULO_TIPO[tipo]}</h4>
              {doTipo.length === 0 ? (
                <p className="texto-aux">Nenhum item.</p>
              ) : (
                <div className="space-y-1">
                  {doTipo.map((c) => (
                    <div
                      key={c.id}
                      className={`grid grid-cols-12 gap-2 items-center p-2 rounded ${
                        edicoes[c.id] ? 'bg-amber-50' : ''
                      } ${c.ativo ? '' : 'opacity-60'}`}
                    >
                      <input
                        className={`${campo} col-span-12 sm:col-span-4`}
                        value={c.nome}
                        onChange={(e) => editar(c, { nome: e.target.value })}
                        aria-label="Nome"
                      />
                      <input
                        className={`${campo} col-span-12 sm:col-span-5`}
                        value={c.descricao || ''}
                        placeholder="Descrição (opcional)"
                        onChange={(e) => editar(c, { descricao: e.target.value || undefined })}
                        aria-label="Descrição"
                      />
                      <label className="col-span-6 sm:col-span-2 flex items-center gap-2 texto-aux">
                        <input
                          type="checkbox"
                          checked={c.sugeridoOnboarding}
                          onChange={(e) => editar(c, { sugeridoOnboarding: e.target.checked })}
                        />
                        Sugerido
                      </label>
                      <label className="col-span-6 sm:col-span-1 flex items-center gap-2 texto-aux">
                        <input type="checkbox" checked={c.ativo} onChange={(e) => editar(c, { ativo: e.target.checked })} />
                        Ativo
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          <select
            value={novoTipo}
            onChange={(e) => setNovoTipo(e.target.value as TipoCatalogo)}
            className="campo campo-sm"
            aria-label="Tipo do novo item"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO[t]}
              </option>
            ))}
          </select>
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                incluir();
              }
            }}
            placeholder="Nome do novo item"
            className="campo campo-sm flex-1 min-w-[12rem]"
          />
          <button
            type="button"
            onClick={incluir}
            className="btn btn-secundario btn-sm"
          >
            <Plus /> Incluir
          </button>
        </div>
        {erro && <p role="alert" className="erro">{erro}</p>}
      </div>
      <BarraAlteracoes
        itens={itensPendentes}
        onCancelar={() => {
          setEdicoes({});
          setNovos([]);
          setErro(null);
        }}
        onSalvar={salvar}
        salvando={salvando}
        rotuloSalvar="Salvar catálogo"
      />
    </div>
  );
};
