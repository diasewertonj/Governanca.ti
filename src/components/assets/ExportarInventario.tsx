/**
 * Janela "Exportar inventário": o que entra (tipos), filtros, colunas (Básico/Financeiro/
 * Completo ou avulsas) e formato (Excel com uma aba por tipo, ou um CSV por tipo).
 */
import React, { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import type { Asset } from '../../types/index.ts';
import { baixarCsv, baixarExcel, paraCsv, paraExcelAbas } from '../../utils/financeiro.ts';
import { LIMITE_CAPITALIZACAO_PADRAO } from '../../utils/gestaoFinanceira.ts';
import { licencaAtiva } from '../../utils/licencas.ts';
import { isoLocal } from '../../utils/formatters.ts';
import {
  COLUNAS_POR_TIPO,
  ROTULO_TIPO_INVENTARIO,
  colunasDoNivel,
  montarAba,
  type Contexto,
  type NivelColuna,
  type TipoInventario,
} from '../../utils/exportarInventario.ts';
import { Janela } from '../ui/Janela.tsx';
import { dentroDoPeriodo, usePeriodo, ATALHOS_PASSADO } from '../ui/FiltroPeriodo.tsx';

const TIPOS: TipoInventario[] = ['equipamentos', 'acessorios', 'softwares', 'linhas'];
const ROTULO_NIVEL: Record<NivelColuna, string> = {
  basico: 'Básico',
  financeiro: 'Financeiro',
  completo: 'Completo',
};

export const ExportarInventario: React.FC<{
  /** Equipamentos como estão na tela agora (busca e filtros aplicados) */
  equipamentosDaTela: Asset[];
  tipoInicial: TipoInventario;
  onFechar: () => void;
}> = ({ equipamentosDaTela, tipoInicial, onFechar }) => {
  const { assets, licenses, employees, departments, contratos, settings, currentRole } = useApp();
  const { estoque, linhas } = useRecursos();
  const veValores = currentRole === 'ti_admin' || currentRole === 'ti_suporte';

  const [tipos, setTipos] = useState<TipoInventario[]>([tipoInicial]);
  const [usarTela, setUsarTela] = useState(false);
  const [situacao, setSituacao] = useState<'todos' | 'em_uso' | 'disponivel' | 'manutencao'>('todos');
  const [incluirBaixados, setIncluirBaixados] = useState(false);
  const [area, setArea] = useState('');
  const { periodo, seletor } = usePeriodo('todos', ['todos', ...ATALHOS_PASSADO]);
  const [nivel, setNivel] = useState<NivelColuna>(veValores ? 'financeiro' : 'basico');
  const [colunas, setColunas] = useState<Record<TipoInventario, string[]>>(() => {
    const ini = veValores ? 'financeiro' : 'basico';
    return {
      equipamentos: colunasDoNivel(COLUNAS_POR_TIPO.equipamentos, ini),
      acessorios: colunasDoNivel(COLUNAS_POR_TIPO.acessorios, ini),
      softwares: colunasDoNivel(COLUNAS_POR_TIPO.softwares, ini),
      linhas: colunasDoNivel(COLUNAS_POR_TIPO.linhas, ini),
    };
  });
  const [formato, setFormato] = useState<'excel' | 'csv'>('excel');

  const escolherNivel = (nv: NivelColuna) => {
    setNivel(nv);
    setColunas({
      equipamentos: colunasDoNivel(COLUNAS_POR_TIPO.equipamentos, nv),
      acessorios: colunasDoNivel(COLUNAS_POR_TIPO.acessorios, nv),
      softwares: colunasDoNivel(COLUNAS_POR_TIPO.softwares, nv),
      linhas: colunasDoNivel(COLUNAS_POR_TIPO.linhas, nv),
    });
  };
  const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  // Itens de cada tipo, com os filtros escolhidos
  const equipamentos = (usarTela ? equipamentosDaTela : assets)
    .filter((a) => usarTela || incluirBaixados || a.status !== 'descartado')
    .filter((a) => usarTela || situacao === 'todos' || a.status === situacao)
    .filter((a) => !area || a.setorId === area)
    .filter((a) => dentroDoPeriodo(a.fiscal?.dataAquisicao, periodo));
  const itens = {
    equipamentos,
    acessorios: estoque.filter((i) => incluirBaixados || i.ativo),
    softwares: licenses.filter((l) => incluirBaixados || licencaAtiva(l)),
    linhas: linhas.filter((l) => incluirBaixados || l.status !== 'cancelada'),
  };

  const ctx: Contexto = {
    pessoas: employees,
    areas: departments,
    contratos,
    vida: settings.vidaUtil,
    limite: settings.premissasFinanceiras?.limiteCapitalizacao ?? LIMITE_CAPITALIZACAO_PADRAO,
    veValores,
  };

  const exportar = () => {
    const hoje = isoLocal(new Date());
    const abas = tipos.map((t) => {
      // cada tipo tem sua lista de colunas; o cast junta os tipos de item numa chamada só
      const { cabecalho, linhas: ls } = montarAba(COLUNAS_POR_TIPO[t] as never, colunas[t], itens[t] as never[], ctx);
      return { nome: ROTULO_TIPO_INVENTARIO[t], tipo: t, cabecalho, linhas: ls };
    });
    if (formato === 'excel') baixarExcel(`inventario-${hoje}.xls`, paraExcelAbas(abas));
    else abas.forEach((a) => baixarCsv(`inventario-${a.tipo}-${hoje}.csv`, paraCsv(a.cabecalho, a.linhas)));
    onFechar();
  };

  const pronto = tipos.length > 0 && tipos.every((t) => colunas[t].length > 0);

  return (
    <Janela
      titulo="Exportar inventário"
      subtitulo="Escolha o que entra, os filtros e as colunas"
      tamanho="g"
      onFechar={onFechar}
      noCaminho={false}
      rodape={
        <>
          <button type="button" onClick={onFechar} className="btn btn-secundario">Cancelar</button>
          <button type="button" onClick={exportar} disabled={!pronto} className="btn btn-primario">
            {formato === 'excel' ? <FileSpreadsheet /> : <Download />} Exportar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset className="space-y-1">
          <legend className="rotulo">O que entra</legend>
          {TIPOS.map((t) => (
            <label key={t} className="flex items-center gap-2 text-slate-700">
              <input type="checkbox" checked={tipos.includes(t)} onChange={() => setTipos((l) => alternar(l, t))} />
              {ROTULO_TIPO_INVENTARIO[t]} <span className="texto-aux">({itens[t].length})</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="rotulo">Filtros</legend>
          {tipos.includes('equipamentos') && (
            <>
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={usarTela} onChange={(e) => setUsarTela(e.target.checked)} />
                Equipamentos: usar a busca e os filtros que estão na tela ({equipamentosDaTela.length})
              </label>
              {!usarTela && (
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label="Situação dos equipamentos" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} className="campo campo-sm">
                    <option value="todos">Todas as situações</option>
                    <option value="em_uso">Em uso</option>
                    <option value="disponivel">Em estoque</option>
                    <option value="manutencao">Em manutenção</option>
                  </select>
                  <select aria-label="Área" value={area} onChange={(e) => setArea(e.target.value)} className="campo campo-sm">
                    <option value="">Todas as áreas</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.nome}</option>
                    ))}
                  </select>
                  <span className="texto-aux">Comprados em:</span>
                  {seletor}
                </div>
              )}
            </>
          )}
          <label className="flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={incluirBaixados} onChange={(e) => setIncluirBaixados(e.target.checked)} />
            Incluir baixados, desativados, inativos e cancelados
          </label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="rotulo">Colunas</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Conjunto de colunas">
            {(Object.keys(ROTULO_NIVEL) as NivelColuna[]).map((nv) => (
              <button key={nv} type="button" onClick={() => escolherNivel(nv)} aria-pressed={nivel === nv} className={`btn btn-sm ${nivel === nv ? 'btn-primario' : 'btn-secundario'}`}>
                {ROTULO_NIVEL[nv]}
              </button>
            ))}
          </div>
          {!veValores && <p className="texto-aux">Valores e custos ficam com a T.I.: essas colunas saem vazias.</p>}
          {tipos.map((t) => (
            <details key={t} className="cartao p-2">
              <summary className="cursor-pointer font-semibold text-slate-900">
                {ROTULO_TIPO_INVENTARIO[t]} · {colunas[t].length} colunas
              </summary>
              <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {COLUNAS_POR_TIPO[t].map((c) => (
                  <label key={c.chave} className="flex items-center gap-2 text-slate-700">
                    <input type="checkbox" checked={colunas[t].includes(c.chave)} onChange={() => setColunas((m) => ({ ...m, [t]: alternar(m[t], c.chave) }))} />
                    {c.rotulo}
                  </label>
                ))}
              </div>
            </details>
          ))}
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="rotulo">Formato</legend>
          <label className="flex items-center gap-2 text-slate-700">
            <input type="radio" name="formato-inventario" checked={formato === 'excel'} onChange={() => setFormato('excel')} />
            Excel (uma aba por tipo)
          </label>
          <label className="flex items-center gap-2 text-slate-700">
            <input type="radio" name="formato-inventario" checked={formato === 'csv'} onChange={() => setFormato('csv')} />
            CSV (um arquivo por tipo)
          </label>
        </fieldset>
      </div>
    </Janela>
  );
};
