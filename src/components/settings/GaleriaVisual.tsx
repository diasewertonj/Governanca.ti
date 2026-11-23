/**
 * Seção 19 — Galeria de componentes (Configurações › Sistema › Galeria visual, só admin).
 * Mostra o padrão 2.0 (texto, cores de situação, ícones, botões, campos, tabela,
 * carregando e vazio) e o antes/depois de Início, Chamados e Contas a pagar com
 * dados de exemplo.
 *
 * Exceção justificada na auditoria do padrão: os quadros "Antes" reproduzem de
 * propósito o visual antigo (text-xs, font-bold, ícones w-/h- manuais) para comparação.
 */
import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSignature,
  Info,
  Laptop,
  LifeBuoy,
  Pencil,
  Plus,
  Receipt,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { Abas } from '../ui/Abas.tsx';
import { Busca, CabecalhoTela, Carregando, SeletorDensidade, Vazio } from '../ui/Tela.tsx';

type Comparacao = 'inicio' | 'chamados' | 'contas';

const Bloco: React.FC<{ titulo: string; ajuda?: string; children: React.ReactNode }> = ({ titulo, ajuda, children }) => (
  <section className="cartao space-y-4 p-4 sm:p-6">
    <div>
      <h3 className="secao-titulo">{titulo}</h3>
      {ajuda && <p className="texto-aux mt-1">{ajuda}</p>}
    </div>
    {children}
  </section>
);

const Quadro: React.FC<{ rotulo: 'Antes' | 'Depois'; children: React.ReactNode }> = ({ rotulo, children }) => (
  <figure className="min-w-0 space-y-2">
    <figcaption>
      <span className={`selo ${rotulo === 'Antes' ? 'selo-neutro' : 'selo-ok'}`}>{rotulo}</span>
    </figcaption>
    <div className={`rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 ${rotulo === 'Antes' ? 'estilo-antigo' : ''}`}>{children}</div>
  </figure>
);

// -----------------------------------------------------------------------------
// Dados de exemplo
// -----------------------------------------------------------------------------
const CHAMADOS = [
  { codigo: 'CH-1042', titulo: 'Notebook não liga após atualização', pessoa: 'Mariana Lopes', prioridade: 'Alta', situacao: 'Em andamento', prazo: 'Atrasado 2h', tom: 'problema' },
  { codigo: 'CH-1041', titulo: 'Acesso ao ERP para nova analista', pessoa: 'Carlos Dias', prioridade: 'Média', situacao: 'Aberto', prazo: 'Vence em 3h', tom: 'atencao' },
  { codigo: 'CH-1039', titulo: 'Troca de mouse sem fio', pessoa: 'Júlia Santos', prioridade: 'Baixa', situacao: 'Aguardando', prazo: 'Pausado', tom: 'info' },
  { codigo: 'CH-1035', titulo: 'VPN caindo no home office', pessoa: 'Pedro Alves', prioridade: 'Média', situacao: 'Resolvido', prazo: 'No prazo', tom: 'ok' },
] as const;

const CONTAS = [
  { venc: '12/11/2026', origem: 'Contrato Link dedicado 200 Mb', fornecedor: 'Vivo Empresas', valor: '1.890,00', situacao: 'Vencida', tom: 'problema' },
  { venc: '20/11/2026', origem: 'Microsoft 365 Business Standard', fornecedor: 'Microsoft', valor: '4.312,50', situacao: 'Vence em 1 dia', tom: 'atencao' },
  { venc: '28/11/2026', origem: 'Pedido PC-0087 · 3 monitores 24"', fornecedor: 'Kabum', valor: '2.697,00', situacao: 'A pagar', tom: 'neutro' },
  { venc: '05/12/2026', origem: 'Suporte impressoras (outsourcing)', fornecedor: 'Simpress', valor: '980,00', situacao: 'A pagar', tom: 'neutro' },
] as const;

const SELO_TOM: Record<string, string> = { ok: 'selo-ok', atencao: 'selo-atencao', problema: 'selo-problema', info: 'selo-info', neutro: 'selo-neutro' };
const SELO_ANTIGO: Record<string, string> = {
  ok: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  atencao: 'text-amber-800 bg-amber-50 border-amber-200',
  problema: 'text-rose-700 bg-rose-50 border-rose-200',
  info: 'text-purple-700 bg-purple-50 border-purple-200',
  neutro: 'text-slate-700 bg-slate-50 border-slate-200',
};

// -----------------------------------------------------------------------------
// Início
// -----------------------------------------------------------------------------
const InicioAntes: React.FC = () => (
  <div className="space-y-4">
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">Início</h2>
      <p className="text-xs text-slate-500">Visão geral do parque de T.I., do atendimento e do que precisa de atenção</p>
    </div>
    <div className="grid grid-cols-2 gap-3">
      {[
        ['Ativos Totais de T.I.', '172', 'equipamentos'],
        ['Chamados em aberto', '12', 'em aberto'],
        ['Colaboradores Ativos', '96', 'sob gestão'],
        ['Licenças de Software', '211/240', 'assentos'],
      ].map(([r, v, s]) => (
        <div key={r} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">{r}</span>
            <Laptop className="h-4 w-4 text-blue-600" />
          </div>
          <span className="font-mono text-2xl font-bold tracking-tight text-slate-900">{v}</span>
          <span className="ml-2 text-xs text-slate-500">{s}</span>
        </div>
      ))}
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />
        <div>
          <h3 className="text-xs font-bold tracking-wider text-amber-900 uppercase">Garantias e contratos</h3>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            {[
              ['3', 'garantias vencem em 30 dias'],
              ['1', 'vencidas em uso'],
              ['2', 'contratos vencem em 60 dias'],
              ['1 · 2', 'faturas vencidas · vencem em 7 dias'],
            ].map(([v, r]) => (
              <div key={r}>
                <div className="text-xl font-bold text-amber-900">{v}</div>
                <div className="text-xs text-amber-800">{r}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    <div className="rounded-xl border border-slate-200 bg-white">
      <p className="border-b border-slate-100 px-6 py-4 text-xs font-bold tracking-wider text-slate-500 uppercase">Chamados recentes</p>
      {CHAMADOS.slice(0, 3).map((c) => (
        <div key={c.codigo} className="flex items-center justify-between px-6 py-3.5">
          <div>
            <span className="font-mono text-xs font-semibold text-slate-600">{c.codigo}</span>{' '}
            <span className="text-xs font-semibold text-slate-900">{c.titulo}</span>
            <p className="text-xs text-slate-500">{c.pessoa} · suporte</p>
          </div>
          <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${SELO_ANTIGO[c.tom]}`}>{c.situacao}</span>
        </div>
      ))}
    </div>
  </div>
);

const ATENCAO = [
  { tom: 'problema', texto: '1 conta a pagar vencida', detalhe: 'Vivo Empresas · R$ 1.890,00', acao: 'Abrir contas' },
  { tom: 'problema', texto: '2 chamados com prazo estourado', detalhe: 'CH-1042, CH-1028', acao: 'Ver chamados' },
  { tom: 'atencao', texto: '3 garantias vencem em 30 dias', detalhe: 'NB-1042, NB-1077, MN-0311', acao: 'Ver equipamentos' },
  { tom: 'atencao', texto: '4 termos aguardando assinatura', detalhe: 'Mariana Lopes e mais 3', acao: 'Ver termos' },
  { tom: 'info', texto: '2 contratos para renovar em 60 dias', detalhe: 'Link dedicado, Outsourcing de impressão', acao: 'Ver contratos' },
] as const;

const InicioDepois: React.FC = () => (
  <div className="space-y-4">
    <CabecalhoTela
      titulo="Início"
      subtitulo="Quinta-feira, 19 de novembro"
      acoes={
        <button type="button" className="btn btn-primario">
          <Plus aria-hidden="true" /> Abrir chamado
        </button>
      }
    />
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {[
        { r: 'Chamados em aberto', v: '12', s: '2 atrasados', tom: 'problema', i: <LifeBuoy className="ico" /> },
        { r: 'Equipamentos em uso', v: '148', s: 'de 172 · 21 em estoque', tom: 'ok', i: <Laptop className="ico" /> },
        { r: 'Termos a assinar', v: '4', s: 'há mais de 3 dias: 1', tom: 'atencao', i: <FileSignature className="ico" /> },
        { r: 'A pagar em 7 dias', v: 'R$ 6.202', s: '1 vencida', tom: 'problema', i: <Wallet className="ico" /> },
      ].map((k) => (
        <div key={k.r} className="cartao space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="texto-aux">{k.r}</span>
            <span className="text-slate-400" aria-hidden="true">
              {k.i}
            </span>
          </div>
          <p className="numero-kpi">{k.v}</p>
          <p className="texto-aux flex items-center gap-1.5">
            <span className={`semaforo semaforo-${k.tom}`} aria-hidden="true" />
            {k.s}
          </p>
        </div>
      ))}
    </div>
    <div className="grid gap-4 xl:grid-cols-3">
      <section className="cartao xl:col-span-2">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h3 className="secao-titulo">Precisa de atenção</h3>
          <span className="contador contador-alerta">{ATENCAO.length}</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {ATENCAO.map((a) => (
            <li key={a.texto} className="flex items-center gap-3 px-4 py-3">
              <span className={`semaforo semaforo-${a.tom}`} aria-label={a.tom === 'problema' ? 'Urgente' : a.tom === 'atencao' ? 'Atenção' : 'Informação'} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{a.texto}</p>
                <p className="texto-aux truncate">{a.detalhe}</p>
              </div>
              <button type="button" className="btn btn-sm btn-secundario">
                {a.acao}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="cartao space-y-3 p-4">
        <h3 className="secao-titulo">Atalhos</h3>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
          {[
            [<LifeBuoy key="a" aria-hidden="true" />, 'Novo chamado'],
            [<Laptop key="b" aria-hidden="true" />, 'Cadastrar equipamento'],
            [<UserPlus key="c" aria-hidden="true" />, 'Nova admissão'],
            [<Receipt key="d" aria-hidden="true" />, 'Lançar fatura'],
          ].map(([i, r]) => (
            <button key={String(r)} type="button" className="btn btn-secundario justify-start">
              {i}
              {r}
            </button>
          ))}
        </div>
      </section>
    </div>
    <section className="cartao space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="secao-titulo">Números de gestão (admin)</h3>
        <button type="button" className="btn btn-sm btn-discreto">
          Painel executivo <ArrowRight aria-hidden="true" />
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['Dentro do prazo (30 dias)', '92%'],
          ['Tempo médio de solução', '5h 40min'],
          ['1ª resposta média', '38min'],
          ['Reabertos', '3'],
        ].map(([r, v]) => (
          <div key={r}>
            <dt className="texto-aux">{r}</dt>
            <dd className="num text-base font-semibold text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  </div>
);

// -----------------------------------------------------------------------------
// Chamados
// -----------------------------------------------------------------------------
const ChamadosAntes: React.FC = () => (
  <div className="space-y-3">
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Chamados</h2>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
          <Plus className="h-4 w-4" /> Novo chamado
        </button>
      </div>
    </div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {['Chamado', 'Prioridade', 'Situação', 'Prazo', ''].map((h) => (
              <th key={h} className="px-3 py-2 font-semibold tracking-wider text-slate-500 uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CHAMADOS.map((c) => (
            <tr key={c.codigo} className="border-b border-slate-100">
              <td className="px-3 py-2">
                <span className="font-mono font-bold text-blue-700">{c.codigo}</span>
                <p className="font-medium text-slate-900">{c.titulo}</p>
              </td>
              <td className="px-3 py-2 font-bold">{c.prioridade}</td>
              <td className="px-3 py-2">
                <span className={`rounded-md border px-2 py-0.5 font-medium ${SELO_ANTIGO[c.tom]}`}>{c.situacao}</span>
              </td>
              <td className="px-3 py-2">{c.prazo}</td>
              <td className="px-3 py-2">
                <Pencil className="h-3 w-3 text-slate-500" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const ChamadosDepois: React.FC = () => {
  const [aba, setAba] = useState<'abertos' | 'meus' | 'todos'>('abertos');
  const [busca, setBusca] = useState('');
  return (
    <div className="space-y-3">
      <CabecalhoTela
        titulo="Chamados"
        subtitulo="Suporte da T.I.: fila, prazos e responsáveis"
        acoes={
          <button type="button" className="btn btn-primario">
            <Plus aria-hidden="true" /> Novo chamado
          </button>
        }
        abas={
          <Abas
            rotulo="Filas"
            ativa={aba}
            onMudar={setAba}
            itens={[
              { id: 'abertos', rotulo: 'Em aberto', contador: 12 },
              { id: 'meus', rotulo: 'Comigo', contador: 4 },
              { id: 'todos', rotulo: 'Todos' },
            ]}
          />
        }
        filtros={
          <>
            <Busca id="galeria-busca" valor={busca} onMudar={setBusca} placeholder="Buscar chamado..." />
            <select aria-label="Prioridade" className="campo campo-sm">
              <option>Todas as prioridades</option>
            </select>
            <span className="ml-auto">
              <SeletorDensidade />
            </span>
          </>
        }
      />
      <div className="cartao-tabela">
        <table className="tabela tabela-cartoes">
          <thead>
            <tr>
              <th>Chamado</th>
              <th>Prioridade</th>
              <th>Situação</th>
              <th className="num">Prazo</th>
              <th className="col-acoes">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {CHAMADOS.map((c) => (
              <tr key={c.codigo}>
                <td>
                  <span className="block font-semibold text-slate-900">{c.titulo}</span>
                  <span className="texto-aux block">
                    <span className="font-mono">{c.codigo}</span> · {c.pessoa}
                  </span>
                </td>
                <td data-label="Prioridade">{c.prioridade}</td>
                <td data-label="Situação">
                  <span className={`selo ${SELO_TOM[c.tom]}`}>{c.situacao}</span>
                </td>
                <td data-label="Prazo" className="num">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`semaforo semaforo-${c.tom}`} aria-hidden="true" />
                    {c.prazo}
                  </span>
                </td>
                <td className="col-acoes">
                  <div className="acoes-linha">
                    <button type="button" className="btn btn-sm btn-secundario">
                      Abrir
                    </button>
                    <button type="button" className="btn-icone" title="Editar" aria-label={`Editar ${c.codigo}`}>
                      <Pencil />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Contas a pagar
// -----------------------------------------------------------------------------
const ContasAntes: React.FC = () => (
  <div className="space-y-3">
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">Contas a pagar</h2>
      <p className="text-xs text-slate-500">Todas as faturas: contratos, licenças, pedidos de compra e contas avulsas</p>
      <p className="mt-2 text-right text-xs text-slate-600">
        Total na lista: <span className="font-mono font-semibold text-slate-900">R$ 9.879,50</span>
      </p>
    </div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {['Vencimento', 'Origem', 'Valor', 'Situação'].map((h) => (
              <th key={h} className="px-3 py-2 font-semibold tracking-wider text-slate-500 uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CONTAS.map((c) => (
            <tr key={c.origem} className="border-b border-slate-100">
              <td className="px-3 py-2">{c.venc}</td>
              <td className="px-3 py-2">
                <p className="font-medium text-slate-900">{c.origem}</p>
                <p className="text-slate-500">{c.fornecedor}</p>
              </td>
              <td className="px-3 py-2 font-mono font-bold">R$ {c.valor}</td>
              <td className="px-3 py-2">
                <span className={`rounded-md border px-2 py-0.5 font-medium ${SELO_ANTIGO[c.tom]}`}>{c.situacao}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const ContasDepois: React.FC = () => (
  <div className="space-y-3">
    <CabecalhoTela
      titulo="Contas a pagar"
      subtitulo="Todas as faturas: contratos, licenças, pedidos de compra e contas avulsas"
      acoes={
        <>
          <button type="button" className="btn btn-secundario">
            <Download aria-hidden="true" /> Exportar CSV
          </button>
          <button type="button" className="btn btn-primario">
            <Plus aria-hidden="true" /> Lançar fatura
          </button>
        </>
      }
      filtros={
        <>
          <select aria-label="Situação" className="campo campo-sm">
            <option>A pagar e vencidas</option>
          </select>
          <span className="texto-aux ml-auto">
            Total na lista <span className="num ml-1 font-semibold text-slate-900">R$ 9.879,50</span>
          </span>
        </>
      }
    />
    <div className="cartao-tabela">
      <table className="tabela tabela-cartoes">
        <thead>
          <tr>
            <th>Origem</th>
            <th className="num">Vencimento</th>
            <th className="num">Valor</th>
            <th>Situação</th>
            <th className="col-acoes">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {CONTAS.map((c) => (
            <tr key={c.origem}>
              <td>
                <span className="block font-semibold text-slate-900">{c.origem}</span>
                <span className="texto-aux block">{c.fornecedor}</span>
              </td>
              <td data-label="Vencimento" className="num">
                {c.venc}
              </td>
              <td data-label="Valor" className="num font-semibold text-slate-900">
                R$ {c.valor}
              </td>
              <td data-label="Situação">
                <span className={`selo ${SELO_TOM[c.tom]}`}>{c.situacao}</span>
              </td>
              <td className="col-acoes">
                <div className="acoes-linha">
                  <button type="button" className="btn btn-sm btn-secundario">
                    Registrar pagamento
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// -----------------------------------------------------------------------------
// Galeria
// -----------------------------------------------------------------------------
export const GaleriaVisual: React.FC = () => {
  const [comparar, setComparar] = useState<Comparacao>('inicio');
  const [mostrarCarregando, setMostrarCarregando] = useState(true);

  return (
    <div className="space-y-4">
      <Bloco titulo="Antes e depois" ajuda="Dados de exemplo. O quadro “Antes” reproduz o visual atual; o “Depois” usa só as classes do padrão 2.0.">
        <Abas
          rotulo="Tela para comparar"
          ativa={comparar}
          onMudar={setComparar}
          itens={[
            { id: 'inicio', rotulo: 'Início' },
            { id: 'chamados', rotulo: 'Chamados' },
            { id: 'contas', rotulo: 'Contas a pagar' },
          ]}
        />
        <div className="grid gap-4 2xl:grid-cols-2">
          <Quadro rotulo="Antes">
            {comparar === 'inicio' && <InicioAntes />}
            {comparar === 'chamados' && <ChamadosAntes />}
            {comparar === 'contas' && <ContasAntes />}
          </Quadro>
          <Quadro rotulo="Depois">
            {comparar === 'inicio' && <InicioDepois />}
            {comparar === 'chamados' && <ChamadosDepois />}
            {comparar === 'contas' && <ContasDepois />}
          </Quadro>
        </div>
      </Bloco>

      <Bloco titulo="Texto" ajuda="Só dois pesos: normal e semibold. Números de valor, quantidade e prazo com dígitos alinhados (tabular).">
        <div className="space-y-3">
          <p className="tela-titulo">Título de tela · 18 px</p>
          <p className="janela-titulo">Título de janela · 16 px</p>
          <p className="secao-titulo">Título de seção · 12 px maiúsculo</p>
          <p className="texto-corpo">Corpo do texto, campos e tabelas · 13 px. Ex.: Notebook entregue para Mariana Lopes com termo assinado.</p>
          <p className="texto-aux">Texto auxiliar · 12 px, cinza escuro (contraste AA). Ex.: atualizado há 5 minutos.</p>
          <div className="flex flex-wrap items-baseline gap-6">
            <span className="numero-kpi">R$ 18.450</span>
            <span className="numero-kpi">148</span>
            <span className="texto-aux">Número de painel · 26 px</span>
          </div>
          <div className="grid max-w-xs grid-cols-2 gap-x-6">
            <span className="texto-aux">Sem alinhamento</span>
            <span className="texto-aux text-right">Tabular, à direita</span>
            <span>R$ 1.111,10</span>
            <span className="num text-right">R$ 1.111,10</span>
            <span>R$ 980,00</span>
            <span className="num text-right">R$ 980,00</span>
          </div>
        </div>
      </Bloco>

      <Bloco titulo="Cores de situação" ajuda="Um mapa único: verde ok, âmbar atenção, vermelho problema, azul informação, cinza neutro. Sem roxo, rosa ou índigo.">
        <div className="flex flex-wrap gap-2">
          <span className="selo selo-ok">
            <CheckCircle2 aria-hidden="true" /> No prazo
          </span>
          <span className="selo selo-atencao">
            <AlertTriangle aria-hidden="true" /> Vence logo
          </span>
          <span className="selo selo-problema">
            <AlertTriangle aria-hidden="true" /> Atrasado
          </span>
          <span className="selo selo-info">
            <Info aria-hidden="true" /> Pausado
          </span>
          <span className="selo selo-neutro">Cancelado</span>
        </div>
        <div className="flex flex-wrap gap-4">
          {(['ok', 'atencao', 'problema', 'info', ''] as const).map((t) => (
            <span key={t || 'neutro'} className="inline-flex items-center gap-1.5">
              <span className={`semaforo ${t ? `semaforo-${t}` : ''}`} aria-hidden="true" />
              Semáforo {t || 'neutro'}
            </span>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <p className="aviso selo-ok" role="status">
            <CheckCircle2 aria-hidden="true" /> Configurações salvas.
          </p>
          <p className="aviso selo-problema" role="alert">
            <AlertTriangle aria-hidden="true" /> Não foi possível salvar: verifique a conexão.
          </p>
        </div>
      </Bloco>

      <Bloco titulo="Botões e ícones" ajuda="Ícone 16 px nos botões e no menu, 14 px nas ações de linha e nos selos. Todo botão só de ícone tem nome para leitor de tela.">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primario">
            <Plus aria-hidden="true" /> Novo chamado
          </button>
          <button type="button" className="btn btn-secundario">
            Cancelar
          </button>
          <button type="button" className="btn btn-perigo">
            <Trash2 aria-hidden="true" /> Excluir
          </button>
          <button type="button" className="btn btn-discreto">
            Ver todos <ArrowRight aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-sm btn-secundario">
            Abrir
          </button>
          <button type="button" className="btn-icone" title="Editar" aria-label="Editar">
            <Pencil />
          </button>
          <button type="button" className="btn-icone btn-icone-perigo" title="Excluir" aria-label="Excluir">
            <Trash2 />
          </button>
          <button type="button" className="btn btn-primario" disabled>
            Desabilitado
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <Users className="ico" aria-hidden="true" /> ico (16 px)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="ico-sm" aria-hidden="true" /> ico-sm (14 px)
          </span>
          <span className="inline-flex items-center gap-1.5">
            Contadores <span className="contador">4</span> <span className="contador contador-atencao">2</span> <span className="contador contador-alerta">1</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            Avatar <span className="avatar">M</span>
          </span>
        </div>
      </Bloco>

      <Bloco titulo="Campos" ajuda="13 px, rótulo em semibold 12 px, ajuda em cinza escuro e erro em vermelho.">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="g-nome" className="rotulo">
              Nome do equipamento
            </label>
            <input id="g-nome" className="campo" defaultValue="Notebook Dell Latitude 5440" />
            <p className="ajuda">Como aparece nas listas e no termo.</p>
          </div>
          <div>
            <label htmlFor="g-unid" className="rotulo">
              Unidade
            </label>
            <select id="g-unid" className="campo">
              <option>Matriz — São Paulo</option>
            </select>
          </div>
          <div>
            <label htmlFor="g-valor" className="rotulo">
              Valor de compra
            </label>
            <input id="g-valor" className="campo num" placeholder="R$ 0,00" aria-invalid="true" aria-describedby="g-valor-erro" />
            <p id="g-valor-erro" className="erro">
              Informe o valor.
            </p>
          </div>
        </div>
      </Bloco>

      <Bloco titulo="Carregando e vazio" ajuda="Toda lista mostra um esqueleto enquanto carrega e, vazia, diz o porquê e sugere a próxima ação.">
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-sm btn-secundario" onClick={() => setMostrarCarregando((v) => !v)}>
            {mostrarCarregando ? 'Mostrar vazio' : 'Mostrar carregando'}
          </button>
        </div>
        {mostrarCarregando ? (
          <Carregando linhas={4} />
        ) : (
          <Vazio
            titulo="Nenhum chamado em aberto"
            acao={
              <>
                <button type="button" className="btn btn-sm btn-secundario">
                  Limpar filtros
                </button>
                <button type="button" className="btn btn-sm btn-primario">
                  <Plus aria-hidden="true" /> Novo chamado
                </button>
              </>
            }
          >
            Os filtros escolhidos não trazem nenhum chamado. Limpe os filtros ou abra um chamado novo.
          </Vazio>
        )}
        <Carregando formato="painel" linhas={4} rotulo="Carregando indicadores" />
      </Bloco>
    </div>
  );
};
