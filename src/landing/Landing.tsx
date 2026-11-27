/**
 * Seção 30 · Landing page do Nexus (/). Pública, leve (não carrega o sistema), tema claro ou
 * escuro (escolha guardada neste navegador; sem escolha, segue o sistema operacional), texturas,
 * prévias das telas internas e "Entrar" levando a /app/. O "Quero conhecer" grava o contato
 * pela API do banco (tabela contatos_site: qualquer um envia, só o administrador lê).
 */
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  Headset,
  KeyRound,
  Laptop,
  LogIn,
  Moon,
  QrCode,
  Sparkles,
  Sun,
  Upload,
  Users,
} from 'lucide-react';

import { LoginRapido } from './LoginRapido.tsx';

const URL_BANCO = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CHAVE_PUBLICA = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const CHAVE_TEMA = 'nexus_landing_tema';

type Tema = 'claro' | 'escuro';
export function temaInicialLanding(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
  } catch {
    // sem armazenamento: segue o sistema
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export const LogoNexus: React.FC<{ className?: string; textoBranco?: boolean }> = ({ className = 'h-9 w-auto', textoBranco }) => (
  <svg viewBox="0 0 520 160" className={className} role="img" aria-label="Nexus">
    <polygon points="80,22 126,48.5 126,101.5 80,128 34,101.5 34,48.5" fill="none" stroke="#2563eb" strokeWidth="7" strokeLinejoin="round" />
    <line x1="80" y1="75" x2="80" y2="36" stroke="#2563eb" strokeWidth="6" strokeLinecap="round" />
    <line x1="80" y1="75" x2="113" y2="94" stroke="#2563eb" strokeWidth="6" strokeLinecap="round" />
    <line x1="80" y1="75" x2="47" y2="94" stroke="#2563eb" strokeWidth="6" strokeLinecap="round" />
    <circle cx="80" cy="75" r="14" fill="#14b8a6" />
    <circle cx="80" cy="36" r="9" fill="#2563eb" />
    <circle cx="113" cy="94" r="9" fill="#2563eb" />
    <circle cx="47" cy="94" r="9" fill="#2563eb" />
    <text x="160" y="100" fontFamily="Plus Jakarta Sans, Segoe UI, Arial, sans-serif" fontSize="72" fontWeight="700" className={textoBranco ? 'fill-white' : 'fill-slate-900 dark:fill-white'} letterSpacing="-1">
      nexus
    </text>
  </svg>
);

/** Revela os blocos ao rolar (uma vez) */
function useRevelar() {
  useEffect(() => {
    const itens = document.querySelectorAll('.revelar');
    if (!('IntersectionObserver' in window)) {
      itens.forEach((el) => el.classList.add('visivel'));
      return;
    }
    const obs = new IntersectionObserver(
      (entradas) =>
        entradas.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visivel');
            obs.unobserve(e.target);
          }
        }),
      { threshold: 0.12 }
    );
    itens.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

// ----------------------------------------------------------------------------------------------
// Prévias das telas internas (ilustrativas, com dados de exemplo)
// ----------------------------------------------------------------------------------------------
const Indicador: React.FC<{ rotulo: string; valor: string; tom?: 'atencao' | 'ok' }> = ({ rotulo, valor, tom }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800/70">
    <p className="text-[10px] text-slate-500 dark:text-slate-400">{rotulo}</p>
    <p className={`mt-0.5 text-sm font-bold ${tom === 'atencao' ? 'text-amber-600' : tom === 'ok' ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>{valor}</p>
  </div>
);

const PreviaPainel: React.FC = () => {
  const barras = [42, 55, 48, 63, 58, 71, 66, 80, 74, 69, 85, 78];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl shadow-blue-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-300">nexus / Início</span>
      </div>
      <div className="flex">
        <div className="hidden w-28 shrink-0 space-y-1.5 border-r border-slate-200 p-2.5 sm:block dark:border-slate-700">
          {['Início', 'Chamados', 'Inventário', 'Softwares', 'Contratos', 'Contas', 'Orçamento'].map((m, i) => (
            <div key={m} className={`rounded-md px-2 py-1 text-[10px] ${i === 0 ? 'bg-blue-600 font-semibold text-white' : 'text-slate-500 dark:text-slate-400'}`}>
              {m}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-2.5 p-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Indicador rotulo="Equipamentos em uso" valor="148" />
            <Indicador rotulo="Licenças sem uso" valor="R$ 2.164/mês" tom="atencao" />
            <Indicador rotulo="Chamados no prazo" valor="96%" tom="ok" />
            <Indicador rotulo="Contratos vencendo" valor="2" tom="atencao" />
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-white p-2.5 md:col-span-3 dark:border-slate-700 dark:bg-slate-800/70">
              <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">Custo de T.I. mês a mês</p>
              <div className="mt-2 flex h-16 items-end gap-1">
                {barras.map((b, i) => (
                  <span key={i} className="flex-1 rounded-t bg-gradient-to-t from-blue-600 to-teal-400" style={{ height: `${b}%` }} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5 md:col-span-2 dark:border-slate-700 dark:bg-slate-800/70">
              <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">Precisa de atenção</p>
              {[
                ['Fatura da operadora vence amanhã', 'amber'],
                ['Microsoft 365 F1: 19 assentos livres', 'amber'],
                ['Admissão de Ana Souza: 2 passos', 'blue'],
              ].map(([t, c]) => (
                <p key={t} className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c === 'amber' ? 'bg-amber-500' : 'bg-blue-500'}`} /> {t}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PreviaPessoa: React.FC = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-blue-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-teal-500 font-bold text-white">AS</span>
      <div>
        <p className="font-semibold text-slate-900 dark:text-white">Ana Souza</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Analista financeira · Financeiro</p>
      </div>
      <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Ativa</span>
    </div>
    <ul className="mt-4 space-y-2 text-sm">
      {[
        [<Laptop key="l" className="h-4 w-4" />, 'Notebook Dell Latitude · PAT-1055', 'Termo assinado'],
        [<KeyRound key="k" className="h-4 w-4" />, 'Microsoft 365 Business Standard', 'Assento em uso'],
        [<QrCode key="q" className="h-4 w-4" />, 'Linha (11) 9 8765-0000', 'Com a pessoa'],
      ].map(([icone, item, situacao]) => (
        <li key={String(item)} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/70">
          <span className="text-blue-600 dark:text-blue-400">{icone}</span>
          <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{item}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{situacao}</span>
        </li>
      ))}
    </ul>
    <div className="mt-4 flex items-center justify-between rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
      <span className="text-slate-500 dark:text-slate-400">Custo mensal da pessoa</span>
      <span className="font-bold text-slate-900 dark:text-white">R$ 412,50</span>
    </div>
  </div>
);

// ----------------------------------------------------------------------------------------------
const PROBLEMAS: { titulo: string; texto: string }[] = [
  { titulo: 'Quem está com o quê?', texto: 'Inventário em planilhas, sem histórico de entrega e devolução.' },
  { titulo: 'Licença paga sem uso', texto: 'Assentos sobrando e ninguém sabe quanto custam por mês.' },
  { titulo: 'Contrato que renovou sozinho', texto: 'O prazo para cancelar passou e ninguém foi avisado.' },
  { titulo: 'Desligamento esquecido', texto: 'Acesso aberto e notebook não devolvido depois que a pessoa saiu.' },
];

const MODULOS: { icone: React.ReactNode; titulo: string; texto: string }[] = [
  { icone: <QrCode />, titulo: 'Inventário com QR Code', texto: 'Equipamentos, acessórios e linhas, com custódia, termo de responsabilidade e conferência física pelo celular.' },
  { icone: <KeyRound />, titulo: 'Softwares e licenças', texto: 'Assentos em uso e livres, renovações e importação do Microsoft 365 e do Google Workspace.' },
  { icone: <FileSignature />, titulo: 'Contratos e faturas', texto: 'Faturas geradas sozinhas, vencimentos, prazo para cancelar e reajuste.' },
  { icone: <Headset />, titulo: 'Chamados com prazo', texto: 'Atendimento com prazos em horário comercial, conversa, histórico e avaliação.' },
  { icone: <ClipboardCheck />, titulo: 'Admissão e desligamento', texto: 'Passo a passo guiado do RH à T.I.: o que entregar, liberar e recolher, com registro de quem fez.' },
  { icone: <BadgeDollarSign />, titulo: 'Financeiro e gestão', texto: 'Contas, orçamento, CAPEX e OPEX, projeção e patrimônio com depreciação.' },
];

const PASSOS: { icone: React.ReactNode; titulo: string; texto: string }[] = [
  { icone: <Upload />, titulo: 'Traga o que já existe', texto: 'Importe as licenças do Microsoft 365 e do Google e cadastre fornecedores, contratos e equipamentos com atalhos.' },
  { icone: <Users />, titulo: 'Ligue às pessoas', texto: 'Entregue equipamentos, atribua licenças e linhas pela ficha de cada pessoa, com termo e histórico.' },
  { icone: <Sparkles />, titulo: 'Deixe o sistema avisar', texto: 'Faturas, vencimentos, prazos de chamado e pendências chegam sozinhos, com o custo de cada coisa.' },
];

const Contato: React.FC = () => {
  const [d, setD] = useState({ nome: '', empresa: '', email: '', telefone: '', mensagem: '', site: '' });
  const [estado, setEstado] = useState<'livre' | 'enviando' | 'ok' | 'erro'>('livre');
  const [erro, setErro] = useState('');
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD((p) => ({ ...p, [k]: e.target.value }));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    // Campo escondido preenchido = robô
    if (d.site) return setEstado('ok');
    if (d.nome.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(d.email.trim())) return setErro('Informe seu nome e um e-mail válido.');
    if (!URL_BANCO || !CHAVE_PUBLICA) return setErro('Envio indisponível agora. Tente novamente mais tarde.');
    setErro('');
    setEstado('enviando');
    try {
      const r = await fetch(`${URL_BANCO}/rest/v1/contatos_site`, {
        method: 'POST',
        headers: { apikey: CHAVE_PUBLICA, Authorization: `Bearer ${CHAVE_PUBLICA}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          nome: d.nome.trim(),
          empresa: d.empresa.trim() || null,
          email: d.email.trim().toLowerCase(),
          telefone: d.telefone.trim() || null,
          mensagem: d.mensagem.trim() || null,
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setEstado('ok');
    } catch {
      setEstado('erro');
      setErro('Não foi possível enviar agora. Tente de novo em instantes.');
    }
  };

  if (estado === 'ok')
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <p className="text-lg font-semibold">Recebemos seu contato.</p>
          <p className="mt-1">Vamos falar com você em breve para mostrar o Nexus.</p>
        </div>
      </div>
    );

  const campo =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
  const rotulo = 'text-sm font-medium text-slate-700 dark:text-slate-300';
  return (
    <form onSubmit={enviar} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <label className={rotulo}>
        Nome *
        <input value={d.nome} onChange={set('nome')} required className={campo} autoComplete="name" />
      </label>
      <label className={rotulo}>
        Empresa
        <input value={d.empresa} onChange={set('empresa')} className={campo} autoComplete="organization" />
      </label>
      <label className={rotulo}>
        E-mail *
        <input type="email" value={d.email} onChange={set('email')} required className={campo} autoComplete="email" />
      </label>
      <label className={rotulo}>
        Telefone
        <input value={d.telefone} onChange={set('telefone')} className={campo} autoComplete="tel" />
      </label>
      <label className={`${rotulo} sm:col-span-2`}>
        Conte um pouco (quantas pessoas, se cuida da T.I. de outras empresas…)
        <textarea value={d.mensagem} onChange={set('mensagem')} rows={3} maxLength={2000} className={campo} />
      </label>
      <input value={d.site} onChange={set('site')} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {erro && <p className="text-sm text-red-600 sm:col-span-2 dark:text-red-400">{erro}</p>}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={estado === 'enviando'}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-teal-500 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:brightness-110 disabled:opacity-60"
        >
          {estado === 'enviando' ? 'Enviando…' : 'Quero conhecer'} <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Usamos seus dados só para responder este contato.</p>
      </div>
    </form>
  );
};

export const Landing: React.FC = () => {
  const [tema, setTema] = useState<Tema>(() => (document.documentElement.classList.contains('dark') ? 'escuro' : 'claro'));
  useRevelar();
  // Login por cima da página (o código do login só carrega ao abrir)
  const [login, setLogin] = useState(() => window.location.hash === '#entrar');
  const alternarTema = () => {
    const novo: Tema = tema === 'escuro' ? 'claro' : 'escuro';
    setTema(novo);
    document.documentElement.classList.toggle('dark', novo === 'escuro');
    try {
      localStorage.setItem(CHAVE_TEMA, novo);
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  };

  const titulo = 'text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white';
  const apoio = 'mt-3 max-w-2xl text-lg text-slate-600 dark:text-slate-300';
  return (
    <div className="min-h-screen overflow-x-clip bg-white text-slate-900 antialiased transition-colors dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <a href="/" aria-label="Nexus — início">
            <LogoNexus />
          </a>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#modulos" className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:inline dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
              Módulos
            </a>
            <a href="#como-funciona" className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:inline dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
              Como funciona
            </a>
            <a href="#contato" className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:inline dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
              Contato
            </a>
            <button
              type="button"
              onClick={alternarTema}
              aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}
              title={tema === 'escuro' ? 'Tema claro' : 'Tema escuro'}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {tema === 'escuro' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button type="button" onClick={() => setLogin(true)} className="ml-1 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700">
              <LogIn className="h-4 w-4" /> Entrar
            </button>
          </nav>
        </div>
      </header>

      <main>
        {/* Abertura */}
        <section className="relative">
          <div className="textura-grade absolute inset-0" aria-hidden="true" />
          <div className="brilho left-[-6rem] top-10 h-72 w-72 bg-blue-500" aria-hidden="true" />
          <div className="brilho right-[-4rem] top-40 h-72 w-72 bg-teal-400" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-20 pt-14 sm:pt-20 lg:grid-cols-2">
            <div className="revelar">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300">
                <Sparkles className="h-3.5 w-3.5" /> Novo: importação do Microsoft 365 e do Google
              </span>
              <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                Tudo o que a T.I. entrega, paga e controla, <span className="texto-degrade">num só lugar.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-slate-600 dark:text-slate-300">
                Inventário, licenças, contratos, chamados e o ciclo do colaborador ligados entre si — do pedido de compra à devolução do notebook, com o custo de
                cada passo.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#contato"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-teal-500 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:brightness-110"
                >
                  Quero conhecer <ArrowRight className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setLogin(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/70 px-6 py-3 font-semibold text-slate-800 backdrop-blur hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:hover:bg-slate-900"
                >
                  <LogIn className="h-4 w-4" /> Já sou cliente
                </button>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
                {['Microsoft 365', 'Google Workspace', 'QR Code', 'Excel e PDF'].map((x) => (
                  <li key={x} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-teal-500" /> {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="revelar relative [perspective:1600px]">
              <div className="flutua lg:[transform:rotateY(-6deg)_rotateX(3deg)]">
                <PreviaPainel />
              </div>
            </div>
          </div>
        </section>

        {/* Problemas */}
        <section className="relative border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="textura-pontos absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-4 py-16">
            <div className="revelar">
              <h2 className={titulo}>O que o Nexus resolve</h2>
              <p className={apoio}>Os problemas de sempre da T.I. de uma empresa — com aviso antes de virar prejuízo.</p>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PROBLEMAS.map((p) => (
                <div key={p.titulo} className="revelar cartao-luz rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <h3 className="mt-3 font-semibold text-slate-900 dark:text-white">{p.titulo}</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{p.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Módulos */}
        <section id="modulos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <div className="revelar">
            <h2 className={titulo}>Módulos que conversam entre si</h2>
            <p className={apoio}>Cada cadastro alimenta os outros: o contrato gera a fatura, a admissão entrega o notebook, o desligamento libera a licença.</p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULOS.map((m) => (
              <div key={m.titulo} className="revelar cartao-luz rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 text-white shadow-md shadow-blue-600/20 [&>svg]:h-5 [&>svg]:w-5">
                  {m.icone}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{m.titulo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{m.texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Uma pessoa, tudo ligado (alusão à ficha 360) */}
        <section className="relative overflow-hidden bg-slate-950 text-white">
          <div className="textura-grade absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="brilho bottom-[-6rem] left-1/3 h-80 w-80 bg-blue-600" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-20 lg:grid-cols-2">
            <div className="revelar">
              <p className="text-sm font-semibold uppercase tracking-wider text-teal-400">Ficha 360 de cada pessoa</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Abra uma pessoa e veja tudo o que está com ela.</h2>
              <p className="mt-4 text-lg text-slate-300">
                Equipamentos com termo assinado, licenças em uso, linha, chamados, processos de admissão e desligamento — e quanto ela custa por mês para a T.I.
              </p>
              <ul className="mt-6 space-y-2 text-slate-300">
                {['Entregar equipamento e atribuir licença sem sair da ficha', 'Termo de responsabilidade gerado e assinado no sistema', 'Desligamento recolhe tudo, passo a passo'].map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-400" /> {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="revelar flutua">
              <PreviaPessoa />
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <div className="revelar">
            <h2 className={titulo}>Como começar</h2>
            <p className={apoio}>Do cadastro ao sistema trabalhando sozinho, em três passos.</p>
          </div>
          <ol className="relative mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            <span className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-blue-600/0 via-blue-600/40 to-teal-500/0 md:block" aria-hidden="true" />
            {PASSOS.map((p, i) => (
              <li key={p.titulo} className="revelar relative">
                <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-sm dark:border-blue-900 dark:bg-slate-900 dark:text-blue-400 [&>svg]:h-5 [&>svg]:w-5">
                  {p.icone}
                </span>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Passo {i + 1}</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{p.titulo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Para quem */}
        <section className="relative border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="textura-pontos absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-5 px-4 py-16 md:grid-cols-2">
            <div className="revelar cartao-luz rounded-2xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-900">
              <Building2 className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              <h3 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Empresas com T.I. própria</h3>
              <p className="mt-2 text-slate-600 dark:text-slate-400">
                Controle do que a empresa tem, paga e entrega a cada pessoa, com o RH e Compras no mesmo fluxo e cada perfil vendo só o que precisa.
              </p>
            </div>
            <div className="revelar cartao-luz rounded-2xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-900">
              <Users className="h-7 w-7 text-teal-600 dark:text-teal-400" />
              <h3 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Quem cuida da T.I. de várias empresas</h3>
              <p className="mt-2 text-slate-600 dark:text-slate-400">Prestadoras de serviço de T.I. organizam cada cliente com os mesmos processos, alertas e relatórios.</p>
            </div>
          </div>
        </section>

        {/* Contato */}
        <section id="contato" className="relative scroll-mt-20">
          <div className="brilho left-1/2 top-10 h-72 w-72 -translate-x-1/2 bg-blue-500" aria-hidden="true" />
          <div className="relative mx-auto max-w-3xl px-4 py-20">
            <div className="revelar rounded-3xl border border-slate-200 bg-white/90 p-7 shadow-xl shadow-blue-900/5 backdrop-blur sm:p-10 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/30">
              <h2 className={titulo}>Quero conhecer</h2>
              <p className="mt-2 text-slate-600 dark:text-slate-300">Deixe seu contato e mostramos o Nexus funcionando com a realidade da sua empresa.</p>
              <div className="mt-7">
                <Contato />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 text-sm text-slate-500 sm:flex-row sm:items-start sm:justify-between dark:text-slate-400">
          <div>
            <LogoNexus className="h-7 w-auto" />
            <p className="mt-2">Governança de T.I. e RH num só lugar.</p>
          </div>
          <p id="privacidade" className="max-w-md">
            Privacidade: os dados do formulário servem só para responder o contato e não são compartilhados. Os dados das empresas clientes ficam no ambiente
            delas, com acesso por perfil. Termos de uso e política de privacidade completos em breve.
          </p>
          <a href="/app/" className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:underline dark:text-blue-400">
            <LogIn className="h-4 w-4" /> Entrar no sistema
          </a>
        </div>
      </footer>
      {login && <LoginRapido onFechar={() => setLogin(false)} />}
    </div>
  );
};
