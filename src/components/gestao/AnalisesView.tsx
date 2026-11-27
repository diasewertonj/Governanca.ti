// =============================================================================
// Seção 23 · Análises cruzadas (só o admin): pessoas, desperdício, áreas,
// fornecedores e equipamentos, com a mesma barra de filtros combinados.
// Equipamento entra pelo valor de compra (sem depreciação).
// =============================================================================
import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { useCompras } from '../../context/ComprasContext.tsx';
import type { CategoriaDespesa, Employee } from '../../types/index.ts';
import { baixarExcel, brl, brlOuTraco, paraExcel, ROTULO_CATEGORIA } from '../../utils/financeiro.ts';
import { formatDate } from '../../utils/formatters.ts';
import {
  areaDoEquipamento,
  custoPorAreaPeloUso,
  custoPorFornecedor,
  custoPorPessoa,
  desperdicio,
  LIMITE_MANUTENCAO,
  manutencaoPorModelo,
  mediaPorCargo,
  situacaoEquipamentos,
} from '../../utils/analises.ts';
import { useGestao } from './useGestao.ts';
import { CabecalhoTela, Vazio } from '../ui/Tela.tsx';
import { LinkFicha, Numero, pct } from './pecas.tsx';

export type AbaAnalise = 'pessoas' | 'desperdicio' | 'areas' | 'fornecedores' | 'equipamentos';
export const ABAS_ANALISE: { id: AbaAnalise; rotulo: string }[] = [
  { id: 'pessoas', rotulo: 'Custo por pessoa' },
  { id: 'desperdicio', rotulo: 'Desperdício' },
  // Seção 27: o custo oficial por área (rateio + departamento) está em Exportações; aqui é a estimativa pelo uso
  { id: 'areas', rotulo: 'Custo por área (estimativa pelo uso)' },
  { id: 'fornecedores', rotulo: 'Fornecedores' },
  { id: 'equipamentos', rotulo: 'Equipamentos' },
];

const ANO_ATUAL = new Date().getFullYear();
type Situacao = 'nao_desligados' | Employee['status'] | 'todas';
const ROTULO_SITUACAO: Record<Situacao, string> = { nao_desligados: 'Ativos e férias', ativo: 'Ativos', ferias: 'Férias', desligado: 'Desligados', todas: 'Todas as situações' };

interface Filtros {
  ano: number;
  area: string;
  cargo: string;
  situacao: Situacao;
  fornecedor: string;
  categoria: '' | CategoriaDespesa;
  soAlerta: boolean;
}
const INICIAIS: Filtros = { ano: ANO_ATUAL, area: '', cargo: '', situacao: 'nao_desligados', fornecedor: '', categoria: '', soAlerta: false };

/** Filtros que valem em cada análise */
const USA: Record<AbaAnalise, (keyof Filtros)[]> = {
  pessoas: ['area', 'cargo', 'situacao'],
  desperdicio: ['area'],
  areas: ['ano', 'area', 'categoria'],
  fornecedores: ['ano', 'fornecedor', 'categoria'],
  equipamentos: ['area', 'fornecedor', 'soAlerta'],
};

/** Barra proporcional (visual rápido do peso de cada linha) */
const Barra: React.FC<{ valor: number; maior: number }> = ({ valor, maior }) => (
  <span className="mt-1 block h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
    <span className="block h-full bg-blue-600" style={{ width: `${maior > 0 ? Math.max(1, (valor / maior) * 100) : 0}%` }} />
  </span>
);

/** Bloco de uma lista de desperdício: título, total e itens */
const Bloco: React.FC<{ titulo: string; valor: string; vazio: string; children: React.ReactNode; n: number }> = ({ titulo, valor, vazio, children, n }) => (
  <div className="cartao p-3 space-y-2">
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="secao-titulo">{titulo} ({n})</h3>
      <span className="num font-semibold text-amber-800">{valor}</span>
    </div>
    {n === 0 ? <p className="texto-aux">{vazio}</p> : <ul className="space-y-1">{children}</ul>}
  </div>
);


export const AnalisesView: React.FC<{ aba: AbaAnalise; abas: React.ReactNode }> = ({ aba, abas }) => {
  const { employees, assets, licenses, contratos, faturas, fornecedores, departments, settings } = useApp();
  const { linhas } = useRecursos();
  const { pedidos } = useCompras();
  const [f, setF] = useState<Filtros>(INICIAIS);
  const g = useGestao(f.ano);
  const muda = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setF((x) => ({ ...x, [k]: v }));
  const usa = (k: keyof Filtros) => USA[aba].includes(k);

  const pessoasPorId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const nomeArea = (id?: string) => departments.find((d) => d.id === id)?.nome || 'Sem área';
  const nomeForn = (id?: string) => fornecedores.find((x) => x.id === id)?.nome || 'Sem fornecedor';
  const cargos = useMemo(() => [...new Set(employees.map((e) => e.cargo?.trim()).filter(Boolean))].sort(), [employees]);

  const lancs = useMemo(() => g.lancamentos.filter((l) => !f.categoria || l.categoria === f.categoria), [g.lancamentos, f.categoria]);
  const fornecedorDaFatura = (id: string) => {
    const fat = faturas.find((x) => x.id === id);
    if (!fat) return '';
    return (
      fat.fornecedorId ||
      (fat.pedidoId && pedidos.find((p) => p.id === fat.pedidoId)?.fornecedorId) ||
      (fat.contratoId && contratos.find((c) => c.id === fat.contratoId)?.fornecedorId) ||
      (fat.licencaId && licenses.find((l) => l.id === fat.licencaId)?.fornecedorId) ||
      ''
    );
  };

  const passaPessoa = (p: Employee) =>
    (!f.area || p.setorId === f.area) &&
    (!f.cargo || p.cargo?.trim() === f.cargo) &&
    (f.situacao === 'todas' || (f.situacao === 'nao_desligados' ? p.status !== 'desligado' : p.status === f.situacao));

  // Etiquetas dos filtros ligados (só os que valem nesta análise)
  const etiquetas: { rotulo: string; limpar: () => void }[] = [];
  if (usa('area') && f.area) etiquetas.push({ rotulo: `Área: ${nomeArea(f.area)}`, limpar: () => muda('area', '') });
  if (usa('cargo') && f.cargo) etiquetas.push({ rotulo: `Cargo: ${f.cargo}`, limpar: () => muda('cargo', '') });
  if (usa('situacao') && f.situacao !== INICIAIS.situacao) etiquetas.push({ rotulo: ROTULO_SITUACAO[f.situacao], limpar: () => muda('situacao', INICIAIS.situacao) });
  if (usa('fornecedor') && f.fornecedor) etiquetas.push({ rotulo: `Fornecedor: ${nomeForn(f.fornecedor)}`, limpar: () => muda('fornecedor', '') });
  if (usa('categoria') && f.categoria) etiquetas.push({ rotulo: `Categoria: ${ROTULO_CATEGORIA[f.categoria]}`, limpar: () => muda('categoria', '') });
  if (usa('soAlerta') && f.soAlerta) etiquetas.push({ rotulo: 'Só com alerta', limpar: () => muda('soAlerta', false) });

  // Cada análise devolve o conteúdo e o que vai para o Excel
  let conteudo: React.ReactNode = null;
  let exportar: { nome: string; cab: string[]; linhas: (string | number | undefined)[][] } | null = null;
  let subtitulo = '';

  if (aba === 'pessoas') {
    subtitulo = 'Equipamentos com a pessoa (valor de compra) e o que ela custa por mês: assento das licenças e linha telefônica';
    const linhasP = custoPorPessoa(employees.filter((e) => e.tipoVinculo !== 'externo' && passaPessoa(e)), { ativos: assets, licencas: licenses, linhas, contratos }).sort(
      (a, b) => b.valorEquipamentos + b.mensalTotal * 12 - (a.valorEquipamentos + a.mensalTotal * 12)
    );
    const cargosMedia = mediaPorCargo(linhasP);
    const totEq = linhasP.reduce((s, l) => s + l.valorEquipamentos, 0);
    const totMes = linhasP.reduce((s, l) => s + l.mensalTotal, 0);
    exportar = {
      nome: 'custo-por-pessoa',
      cab: ['Pessoa', 'Área', 'Cargo', 'Situação', 'Equipamentos (qtd)', 'Equipamentos (valor de compra)', 'Licenças (qtd)', 'Licenças por mês', 'Linhas por mês', 'Total por mês'],
      linhas: linhasP.map((l) => [l.pessoa.nome, nomeArea(l.pessoa.setorId), l.pessoa.cargo, l.pessoa.status, l.equipamentos.length, l.valorEquipamentos, l.licencas.length, l.mensalLicencas, l.mensalLinhas, l.mensalTotal]),
    };
    conteudo = (
      <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Numero rotulo="Pessoas" valor={String(linhasP.length)} />
          <Numero rotulo="Equipamentos com elas" valor={brl(totEq)} detalhe="valor de compra" />
          <Numero rotulo="Licenças e linhas por mês" valor={brl(totMes)} detalhe={`${brl(totMes * 12)} por ano`} />
          <Numero rotulo="Média por pessoa" valor={linhasP.length ? brl(totMes / linhasP.length) : '—'} detalhe={linhasP.length ? `por mês · equipamentos ${brl(totEq / linhasP.length)}` : undefined} />
        </div>
        {cargosMedia.length > 0 && (
          <div className="cartao p-3 space-y-2">
            <h3 className="secao-titulo">Quanto custa equipar cada cargo (média)</h3>
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
              {cargosMedia.slice(0, 12).map((c) => (
                <li key={c.cargo} className="flex justify-between gap-2">
                  <button type="button" onClick={() => muda('cargo', c.cargo)} className="link text-left truncate">{c.cargo}</button>
                  <span className="num text-slate-700 whitespace-nowrap">{brl(c.equipamentos)} + {brl(c.mensal)}/mês <span className="texto-aux">({c.pessoas})</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {linhasP.length === 0 ? (
          <Vazio>Ninguém com esses filtros.</Vazio>
        ) : (
          <div className="cartao-tabela">
            <table className="tabela tabela-cartoes">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Área · cargo</th>
                  <th>Equipamentos</th>
                  <th>Licenças</th>
                  <th className="num">Linha/mês</th>
                  <th className="num">Total/mês</th>
                </tr>
              </thead>
              <tbody>
                {linhasP.map((l) => (
                  <tr key={l.pessoa.id}>
                    <td data-label="Pessoa">
                      <LinkFicha className="" ficha={{ tipo: 'colaborador', id: l.pessoa.id }}>{l.pessoa.nome}</LinkFicha>
                      {l.pessoa.status === 'desligado' && <span className="selo selo-problema ml-2">Desligado</span>}
                    </td>
                    <td data-label="Área · cargo">{nomeArea(l.pessoa.setorId)} · {l.pessoa.cargo || '—'}</td>
                    <td data-label="Equipamentos">
                      {l.equipamentos.length ? (
                        <>
                          <span className="num">{brl(l.valorEquipamentos)}</span>{' '}
                          <span className="texto-aux">
                            {l.equipamentos.map((a, i) => (
                              <React.Fragment key={a.id}>
                                {i > 0 && ', '}
                                <LinkFicha className="" ficha={{ tipo: 'ativo', id: a.id }}>{a.tag}</LinkFicha>
                              </React.Fragment>
                            ))}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="Licenças">
                      {l.licencas.length ? (
                        <>
                          <span className="num">{brl(l.mensalLicencas)}/mês</span>{' '}
                          <span className="texto-aux">
                            {l.licencas.map((x, i) => (
                              <React.Fragment key={x.licenca.id}>
                                {i > 0 && ', '}
                                <LinkFicha className="" ficha={{ tipo: 'software', id: x.licenca.id }}>{x.licenca.nome}</LinkFicha>
                              </React.Fragment>
                            ))}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="Linha/mês" className="num">{brlOuTraco(l.mensalLinhas)}</td>
                    <td data-label="Total/mês" className="num font-semibold">{brlOuTraco(l.mensalTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  if (aba === 'desperdicio') {
    subtitulo = 'O que está pago e sem uso: desligados com recurso, assentos livres, linhas sem pessoa e equipamentos em estoque';
    const pessoasArea = employees.filter((p) => !f.area || p.setorId === f.area);
    const d = desperdicio({
      pessoas: pessoasArea,
      ativos: assets.filter((a) => !f.area || areaDoEquipamento(a, pessoasPorId) === f.area),
      licencas: licenses,
      linhas,
      contratos,
    });
    exportar = {
      nome: 'desperdicio',
      cab: ['Tipo', 'Item', 'Detalhe', 'Valor por mês', 'Valor de compra'],
      linhas: [
        ...d.desligados.map((c) => ['Desligado com recurso', c.pessoa.nome, [...c.equipamentos.map((a) => a.tag), ...c.licencas.map((l) => l.licenca.nome), ...c.linhas.map((l) => l.numero)].join(', '), c.mensalTotal, c.valorEquipamentos || undefined]),
        ...d.assentosLivres.map((o) => ['Assentos livres', o.licenca.nome, `${o.livres} livre(s)`, Math.round(o.custoMensal * 100) / 100, undefined]),
        ...d.linhasSemPessoa.map((l) => ['Linha sem pessoa', l.numero, l.plano || '', l.valorMensal || 0, undefined]),
        ...d.emEstoque.map((a) => ['Em estoque', `${a.tag} · ${a.nome}`, nomeArea(areaDoEquipamento(a, pessoasPorId)), undefined, a.fiscal?.valorCompra || 0]),
      ],
    };
    conteudo = (
      <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Numero rotulo="Desperdício por mês" valor={brl(d.mensalTotal)} detalhe={`${brl(d.mensalTotal * 12)} por ano`} tom={d.mensalTotal > 0 ? 'atencao' : undefined} />
          <Numero rotulo="Desligados com recurso" valor={String(d.desligados.length)} detalhe={`${brl(d.mensal.desligados)}/mês`} />
          <Numero rotulo="Assentos livres" valor={String(d.assentosLivres.reduce((s, o) => s + o.livres, 0))} detalhe={`${brl(d.mensal.assentosLivres)}/mês`} />
          <Numero rotulo="Equipamentos em estoque" valor={String(d.emEstoque.length)} detalhe={`${brl(d.valorEmEstoque)} parados (compra)`} />
        </div>
        <div className="grid items-start grid-cols-1 xl:grid-cols-2 gap-3">
          <Bloco titulo="Desligados que ainda têm recurso" valor={`${brl(d.mensal.desligados)}/mês`} vazio="Nenhum." n={d.desligados.length}>
            {d.desligados.map((c) => (
              <li key={c.pessoa.id} className="flex justify-between gap-2">
                <span className="min-w-0">
                  <LinkFicha className="" ficha={{ tipo: 'colaborador', id: c.pessoa.id }}>{c.pessoa.nome}</LinkFicha>{' '}
                  <span className="texto-aux">
                    {[c.equipamentos.length && `${c.equipamentos.length} equip.`, c.licencas.length && `${c.licencas.length} licença(s)`, c.linhas.length && `${c.linhas.length} linha(s)`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="num">{brl(c.mensalTotal)}</span>
              </li>
            ))}
          </Bloco>
          <Bloco titulo="Licenças com assento livre" valor={`${brl(d.mensal.assentosLivres)}/mês`} vazio="Nenhuma." n={d.assentosLivres.length}>
            {d.assentosLivres.map((o) => (
              <li key={o.licenca.id} className="flex justify-between gap-2">
                <span className="min-w-0">
                  <LinkFicha className="" ficha={{ tipo: 'software', id: o.licenca.id }}>{o.licenca.nome}</LinkFicha> <span className="texto-aux">{o.livres} livre(s)</span>
                </span>
                <span className="num">{brl(o.custoMensal)}</span>
              </li>
            ))}
          </Bloco>
          <Bloco titulo="Linhas ativas sem pessoa" valor={`${brl(d.mensal.linhasSemPessoa)}/mês`} vazio="Nenhuma." n={d.linhasSemPessoa.length}>
            {d.linhasSemPessoa.map((l) => (
              <li key={l.id} className="flex justify-between gap-2">
                <span>{l.numero} {l.plano && <span className="texto-aux">{l.plano}</span>}</span>
                <span className="num">{brlOuTraco(l.valorMensal || 0)}</span>
              </li>
            ))}
          </Bloco>
          <Bloco titulo="Equipamentos em estoque" valor={brl(d.valorEmEstoque)} vazio="Nenhum." n={d.emEstoque.length}>
            {d.emEstoque.slice(0, 30).map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <LinkFicha className="" ficha={{ tipo: 'ativo', id: a.id }}>{a.tag} · {a.nome}</LinkFicha>
                <span className="num">{brlOuTraco(a.fiscal?.valorCompra || 0)}</span>
              </li>
            ))}
          </Bloco>
        </div>
        {f.area && <p className="texto-aux">Com área: desligados e equipamentos são filtrados pela área; licenças e linhas sem pessoa valem para a empresa toda.</p>}
      </>
    );
  }

  if (aba === 'areas') {
    subtitulo = `Pago + a pagar em ${f.ano}; licenças (e contratos que pagam licenças) vão para a área de quem tem o assento`;
    const linhasA = custoPorAreaPeloUso(lancs, { pessoas: employees, ativos: assets, licencas: licenses, contratos }).filter((a) => !f.area || a.area === f.area);
    const maior = Math.max(0, ...linhasA.map((a) => a.despesas));
    const tot = linhasA.reduce((s, a) => s + a.despesas, 0);
    exportar = {
      nome: `custo-por-area-${f.ano}`,
      cab: ['Área', 'Despesas', 'Pelo uso de licenças', 'Pessoas', 'Por pessoa', 'Equipamentos (valor de compra)'],
      linhas: linhasA.map((a) => [nomeArea(a.area), a.despesas, a.peloUso, a.pessoas, a.porPessoa, a.equipamentos]),
    };
    conteudo = (
      <>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Numero rotulo={`Despesas em ${f.ano}`} valor={brl(tot)} />
          <Numero rotulo="Rateado pelo uso de licenças" valor={brl(linhasA.reduce((s, a) => s + a.peloUso, 0))} />
          <Numero rotulo="Equipamentos com as áreas" valor={brl(linhasA.reduce((s, a) => s + a.equipamentos, 0))} detalhe="valor de compra" />
        </div>
        {linhasA.length === 0 ? (
          <Vazio>Nada lançado em {f.ano} com esses filtros.</Vazio>
        ) : (
          <div className="cartao-tabela">
            <table className="tabela tabela-cartoes">
              <thead>
                <tr>
                  <th>Área</th>
                  <th className="num">Despesas</th>
                  <th className="num">Pelo uso</th>
                  <th className="num">Pessoas</th>
                  <th className="num">Por pessoa</th>
                  <th className="num">Equipamentos</th>
                </tr>
              </thead>
              <tbody>
                {linhasA.map((a) => (
                  <tr key={a.area || 'sem'}>
                    <td data-label="Área">
                      {a.area ? (
                        <button type="button" onClick={() => muda('area', a.area)} className="link text-left">{nomeArea(a.area)}</button>
                      ) : (
                        'Sem área'
                      )}
                      <Barra valor={a.despesas} maior={maior} />
                    </td>
                    <td data-label="Despesas" className="num font-semibold">{brl(a.despesas)}</td>
                    <td data-label="Pelo uso" className="num">{brlOuTraco(a.peloUso)}</td>
                    <td data-label="Pessoas" className="num">{a.pessoas || '—'}</td>
                    <td data-label="Por pessoa" className="num">{a.porPessoa !== undefined ? brl(a.porPessoa) : '—'}</td>
                    <td data-label="Equipamentos" className="num">{brlOuTraco(a.equipamentos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  if (aba === 'fornecedores') {
    subtitulo = `Faturas pagas e a pagar de ${f.ano} por fornecedor (contratos, licenças, compras e avulsas), com contratos e licenças ativos`;
    const linhasF = custoPorFornecedor(lancs, fornecedorDaFatura, { contratos, licencas: licenses }).filter((x) => !f.fornecedor || x.fornecedorId === f.fornecedor);
    const maior = Math.max(0, ...linhasF.map((x) => x.total));
    const cats = (x: (typeof linhasF)[number]) =>
      (Object.entries(x.porCategoria) as [CategoriaDespesa, number][]).sort((a, b) => b[1] - a[1]);
    exportar = {
      nome: `fornecedores-${f.ano}`,
      cab: ['Fornecedor', 'Total', 'Pago', 'A pagar', 'Categorias', 'Contratos ativos', 'Licenças ativas'],
      linhas: linhasF.map((x) => [nomeForn(x.fornecedorId), x.total, x.pago, x.aPagar, cats(x).map(([c, v]) => `${ROTULO_CATEGORIA[c]} ${brl(v)}`).join(' · '), x.contratos, x.licencas]),
    };
    conteudo = (
      <>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Numero rotulo={`Total em ${f.ano}`} valor={brl(linhasF.reduce((s, x) => s + x.total, 0))} />
          <Numero rotulo="Fornecedores" valor={String(linhasF.filter((x) => x.fornecedorId).length)} />
          <Numero rotulo="Os 5 maiores" valor={pct(linhasF.reduce((s, x) => s + x.total, 0) ? linhasF.slice(0, 5).reduce((s, x) => s + x.total, 0) / linhasF.reduce((s, x) => s + x.total, 0) : undefined)} detalhe="do total" />
        </div>
        {linhasF.length === 0 ? (
          <Vazio>Nenhuma fatura em {f.ano} com esses filtros.</Vazio>
        ) : (
          <div className="cartao-tabela">
            <table className="tabela tabela-cartoes">
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th className="num">Total</th>
                  <th className="num">Pago</th>
                  <th className="num">A pagar</th>
                  <th>Categorias</th>
                  <th className="num">Contratos · licenças</th>
                </tr>
              </thead>
              <tbody>
                {linhasF.map((x) => (
                  <tr key={x.fornecedorId || 'sem'}>
                    <td data-label="Fornecedor">
                      <LinkFicha className="" ficha={x.fornecedorId ? { tipo: 'fornecedor', id: x.fornecedorId } : undefined}>{nomeForn(x.fornecedorId)}</LinkFicha>
                      <Barra valor={x.total} maior={maior} />
                    </td>
                    <td data-label="Total" className="num font-semibold">{brl(x.total)}</td>
                    <td data-label="Pago" className="num">{brlOuTraco(x.pago)}</td>
                    <td data-label="A pagar" className="num">{brlOuTraco(x.aPagar)}</td>
                    <td data-label="Categorias" className="texto-aux">
                      {cats(x).map(([c, v], i) => (
                        <React.Fragment key={c}>
                          {i > 0 && ' · '}
                          <button type="button" onClick={() => muda('categoria', c)} className="link">{ROTULO_CATEGORIA[c]}</button> {brl(v)}
                        </React.Fragment>
                      ))}
                    </td>
                    <td data-label="Contratos · licenças" className="num">{x.contratos} · {x.licencas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  if (aba === 'equipamentos') {
    subtitulo = `Idade, fim da vida útil e manutenção (fora da garantia) comparada ao valor de compra; alerta a partir de ${Math.round(LIMITE_MANUTENCAO * 100)}% ou com a vida útil vencida`;
    const todas = situacaoEquipamentos(
      assets.filter((a) => (!f.area || areaDoEquipamento(a, pessoasPorId) === f.area) && (!f.fornecedor || a.fornecedorId === f.fornecedor)),
      settings.vidaUtil
    );
    const linhasE = todas.filter((x) => !f.soAlerta || x.alerta).sort((a, b) => Number(!!b.alerta) - Number(!!a.alerta) || (b.pctDoValor || 0) - (a.pctDoValor || 0) || (a.fimVida || '9').localeCompare(b.fimVida || '9'));
    const modelos = manutencaoPorModelo(todas);
    exportar = {
      nome: 'equipamentos-idade-manutencao',
      cab: ['Tag', 'Equipamento', 'Modelo', 'Área', 'Valor de compra', 'Compra', 'Idade (meses)', 'Fim da vida útil', 'Manutenções', 'Custo de manutenção', '% da compra', 'Alerta'],
      linhas: linhasE.map((x) => [x.ativo.tag, x.ativo.nome, [x.ativo.marca, x.ativo.modelo].filter(Boolean).join(' '), nomeArea(areaDoEquipamento(x.ativo, pessoasPorId)), x.ativo.fiscal?.valorCompra || 0, x.ativo.fiscal?.dataAquisicao, x.idadeMeses, x.fimVida, x.manutencoes, x.custoManutencao, x.pctDoValor !== undefined ? Math.round(x.pctDoValor * 100) : undefined, x.alerta === 'manutencao' ? 'Manutenção alta' : x.alerta === 'vida' ? 'Vida útil vencida' : '']),
    };
    conteudo = (
      <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Numero rotulo="Equipamentos" valor={String(todas.length)} detalhe={brl(todas.reduce((s, x) => s + (x.ativo.fiscal?.valorCompra || 0), 0))} />
          <Numero rotulo="Vida útil vencida" valor={String(todas.filter((x) => x.alerta === 'vida').length)} tom={todas.some((x) => x.alerta === 'vida') ? 'atencao' : undefined} />
          <Numero rotulo={`Manutenção ≥ ${Math.round(LIMITE_MANUTENCAO * 100)}% da compra`} valor={String(todas.filter((x) => x.alerta === 'manutencao').length)} tom={todas.some((x) => x.alerta === 'manutencao') ? 'atencao' : undefined} />
          <Numero rotulo="Gasto com manutenção" valor={brl(todas.reduce((s, x) => s + x.custoManutencao, 0))} detalhe="fora da garantia, desde a compra" />
        </div>
        {modelos.length > 0 && (
          <div className="cartao p-3 space-y-2">
            <h3 className="secao-titulo">Modelos que mais vão para a manutenção</h3>
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
              {modelos.slice(0, 9).map((m) => (
                <li key={m.modelo} className="flex justify-between gap-2">
                  <span className="truncate">{m.modelo}</span>
                  <span className="num text-slate-700 whitespace-nowrap">{m.manutencoes} em {m.unidades} un. · {brl(m.custo)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {linhasE.length === 0 ? (
          <Vazio>Nenhum equipamento com esses filtros.</Vazio>
        ) : (
          <div className="cartao-tabela">
            <table className="tabela tabela-cartoes">
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>Área</th>
                  <th className="num">Compra</th>
                  <th className="num">Idade</th>
                  <th>Fim da vida útil</th>
                  <th className="num">Manutenção</th>
                  <th className="num">% da compra</th>
                </tr>
              </thead>
              <tbody>
                {linhasE.slice(0, 300).map((x) => (
                  <tr key={x.ativo.id}>
                    <td data-label="Equipamento">
                      <LinkFicha className="" ficha={{ tipo: 'ativo', id: x.ativo.id }}>{x.ativo.tag} · {x.ativo.nome}</LinkFicha>
                      {x.alerta && <span className="selo selo-atencao ml-2">{x.alerta === 'vida' ? 'Vida útil vencida' : 'Manutenção alta'}</span>}
                    </td>
                    <td data-label="Área">{nomeArea(areaDoEquipamento(x.ativo, pessoasPorId))}</td>
                    <td data-label="Compra" className="num">{brlOuTraco(x.ativo.fiscal?.valorCompra || 0)}</td>
                    <td data-label="Idade" className="num">{x.idadeMeses !== undefined ? `${Math.floor(x.idadeMeses / 12)}a ${x.idadeMeses % 12}m` : '—'}</td>
                    <td data-label="Fim da vida útil">{x.fimVida ? formatDate(x.fimVida) : '—'}</td>
                    <td data-label="Manutenção" className="num">{x.manutencoes ? `${x.manutencoes} · ${brl(x.custoManutencao)}` : '—'}</td>
                    <td data-label="% da compra" className="num">{pct(x.pctDoValor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {linhasE.length > 300 && <p className="texto-aux p-3">Mostrando 300 de {linhasE.length}. O Excel traz todos.</p>}
          </div>
        )}
      </>
    );
  }

  const exp = exportar;
  return (
    <div className="space-y-3">
      <CabecalhoTela
        titulo="Análises e relatórios"
        subtitulo={subtitulo}
        abas={abas}
        acoes={
          exp && (
            <button type="button" onClick={() => baixarExcel(`${exp.nome}.xls`, paraExcel(exp.nome, exp.cab, exp.linhas))} className="btn btn-secundario">
              <FileSpreadsheet /> Excel
            </button>
          )
        }
        filtros={
          <>
            {usa('ano') && (
              <select aria-label="Ano" value={f.ano} onChange={(e) => muda('ano', Number(e.target.value))} className="campo campo-sm w-auto">
                {[ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}
            {usa('area') && (
              <select aria-label="Área" value={f.area} onChange={(e) => muda('area', e.target.value)} className="campo campo-sm w-auto">
                <option value="">Todas as áreas</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            )}
            {usa('cargo') && (
              <select aria-label="Cargo" value={f.cargo} onChange={(e) => muda('cargo', e.target.value)} className="campo campo-sm w-auto">
                <option value="">Todos os cargos</option>
                {cargos.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            {usa('situacao') && (
              <select aria-label="Situação" value={f.situacao} onChange={(e) => muda('situacao', e.target.value as Situacao)} className="campo campo-sm w-auto">
                {(Object.keys(ROTULO_SITUACAO) as Situacao[]).map((s) => (
                  <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>
                ))}
              </select>
            )}
            {usa('fornecedor') && (
              <select aria-label="Fornecedor" value={f.fornecedor} onChange={(e) => muda('fornecedor', e.target.value)} className="campo campo-sm w-auto">
                <option value="">Todos os fornecedores</option>
                {[...fornecedores].sort((a, b) => a.nome.localeCompare(b.nome)).map((x) => (
                  <option key={x.id} value={x.id}>{x.nome}</option>
                ))}
              </select>
            )}
            {usa('categoria') && (
              <select aria-label="Categoria" value={f.categoria} onChange={(e) => muda('categoria', e.target.value as Filtros['categoria'])} className="campo campo-sm w-auto">
                <option value="">Todas as categorias</option>
                {(Object.keys(ROTULO_CATEGORIA) as CategoriaDespesa[]).map((c) => (
                  <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>
                ))}
              </select>
            )}
            {usa('soAlerta') && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.soAlerta} onChange={(e) => muda('soAlerta', e.target.checked)} /> Só com alerta
              </label>
            )}
            {etiquetas.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 w-full">
                {etiquetas.map((e) => (
                  <button key={e.rotulo} type="button" onClick={e.limpar} className="selo selo-neutro gap-1" aria-label={`Tirar filtro ${e.rotulo}`}>
                    {e.rotulo} <X className="ico-sm" aria-hidden="true" />
                  </button>
                ))}
                {etiquetas.length > 1 && (
                  <button type="button" onClick={() => setF((x) => ({ ...INICIAIS, ano: x.ano }))} className="link text-sm">Limpar filtros</button>
                )}
              </div>
            )}
          </>
        }
      />
      {conteudo}
    </div>
  );
};
