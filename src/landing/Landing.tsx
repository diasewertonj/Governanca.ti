/**
 * Seção 30 · Landing page do Nexus (/). Pública, leve (não carrega o sistema) e com
 * "Entrar" levando a /app/. O "Quero conhecer" grava o contato pela API do banco
 * (tabela contatos_site: qualquer um envia, só o administrador lê).
 */
import React, { useState } from 'react';
import {
  ArrowRight,
  BadgeDollarSign,
  Building2,
  ClipboardCheck,
  FileSignature,
  Headset,
  KeyRound,
  LogIn,
  QrCode,
  Users,
} from 'lucide-react';

const URL_BANCO = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CHAVE_PUBLICA = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const LogoNexus: React.FC<{ className?: string }> = ({ className = 'h-9 w-auto' }) => (
  <svg viewBox="0 0 520 160" className={className} role="img" aria-label="Nexus">
    <polygon points="80,22 126,48.5 126,101.5 80,128 34,101.5 34,48.5" fill="none" stroke="#2563eb" strokeWidth="7" strokeLinejoin="round" />
    <line x1="80" y1="75" x2="80" y2="36" stroke="#2563eb" strokeWidth="6" strokeLinecap="round" />
    <line x1="80" y1="75" x2="113" y2="94" stroke="#2563eb" strokeWidth="6" strokeLinecap="round" />
    <line x1="80" y1="75" x2="47" y2="94" stroke="#2563eb" strokeWidth="6" strokeLinecap="round" />
    <circle cx="80" cy="75" r="14" fill="#14b8a6" />
    <circle cx="80" cy="36" r="9" fill="#2563eb" />
    <circle cx="113" cy="94" r="9" fill="#2563eb" />
    <circle cx="47" cy="94" r="9" fill="#2563eb" />
    <text x="160" y="100" fontFamily="Plus Jakarta Sans, Segoe UI, Arial, sans-serif" fontSize="72" fontWeight="700" fill="#0f172a" letterSpacing="-1">
      nexus
    </text>
  </svg>
);

const PROBLEMAS = [
  'Inventário espalhado em planilhas, sem saber quem está com o quê',
  'Licenças pagas e sem ninguém usando',
  'Contratos que renovam sozinhos porque ninguém viu o prazo',
  'Admissão e desligamento sem controle do que entregar e recolher',
];

const MODULOS: { icone: React.ReactNode; titulo: string; texto: string }[] = [
  { icone: <QrCode />, titulo: 'Inventário com QR Code', texto: 'Equipamentos, acessórios e linhas, com custódia, termo de responsabilidade e conferência física.' },
  { icone: <KeyRound />, titulo: 'Softwares e licenças', texto: 'Assentos em uso e livres, renovações e importação do Microsoft 365 e do Google Workspace.' },
  { icone: <FileSignature />, titulo: 'Contratos e faturas', texto: 'Faturas geradas sozinhas, vencimentos, prazo para cancelar e reajuste.' },
  { icone: <Headset />, titulo: 'Chamados com prazo', texto: 'Atendimento com prazos em horário comercial, histórico e avaliação.' },
  { icone: <ClipboardCheck />, titulo: 'Admissão e desligamento', texto: 'Passo a passo guiado: o que entregar, liberar e recolher, com registro de quem fez.' },
  { icone: <BadgeDollarSign />, titulo: 'Financeiro e gestão', texto: 'Contas, orçamento, CAPEX e OPEX, projeção e patrimônio com depreciação.' },
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
    if (!URL_BANCO || !CHAVE_PUBLICA) return setErro('Envio indisponível agora. Escreva para nós pelo e-mail do rodapé.');
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
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <p className="text-lg font-semibold">Recebemos seu contato.</p>
        <p className="mt-1">Vamos falar com você em breve para mostrar o Nexus.</p>
      </div>
    );

  const campo = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';
  return (
    <form onSubmit={enviar} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
      <label className="text-sm text-slate-700">
        Nome *
        <input value={d.nome} onChange={set('nome')} required className={campo} autoComplete="name" />
      </label>
      <label className="text-sm text-slate-700">
        Empresa
        <input value={d.empresa} onChange={set('empresa')} className={campo} autoComplete="organization" />
      </label>
      <label className="text-sm text-slate-700">
        E-mail *
        <input type="email" value={d.email} onChange={set('email')} required className={campo} autoComplete="email" />
      </label>
      <label className="text-sm text-slate-700">
        Telefone
        <input value={d.telefone} onChange={set('telefone')} className={campo} autoComplete="tel" />
      </label>
      <label className="text-sm text-slate-700 sm:col-span-2">
        Conte um pouco (quantas pessoas, se cuida da T.I. de outras empresas…)
        <textarea value={d.mensagem} onChange={set('mensagem')} rows={3} maxLength={2000} className={campo} />
      </label>
      <input value={d.site} onChange={set('site')} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {erro && <p className="text-sm text-red-700 sm:col-span-2">{erro}</p>}
      <div className="sm:col-span-2">
        <button type="submit" disabled={estado === 'enviando'} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {estado === 'enviando' ? 'Enviando…' : 'Quero conhecer'} <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-2 text-xs text-slate-500">Usamos seus dados só para responder este contato.</p>
      </div>
    </form>
  );
};

export const Landing: React.FC = () => (
  <div className="min-h-screen bg-white text-slate-900">
    <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <a href="/" aria-label="Nexus — início">
          <LogoNexus />
        </a>
        <nav className="flex items-center gap-2 text-sm">
          <a href="#modulos" className="hidden px-3 py-2 text-slate-600 hover:text-slate-900 sm:inline">Módulos</a>
          <a href="#contato" className="hidden px-3 py-2 text-slate-600 hover:text-slate-900 sm:inline">Contato</a>
          <a href="/app/" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">
            <LogIn className="h-4 w-4" /> Entrar
          </a>
        </nav>
      </div>
    </header>

    <main>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:pt-20">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-600">Governança de T.I. e RH</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Tudo o que a T.I. entrega, paga e controla, num só lugar.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-600">
          Inventário, licenças, contratos, chamados e o ciclo do colaborador ligados entre si — do pedido de compra à devolução do notebook, com o custo de cada
          passo.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#contato" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
            Quero conhecer <ArrowRight className="h-4 w-4" />
          </a>
          <a href="/app/" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50">
            <LogIn className="h-4 w-4" /> Já sou cliente: entrar
          </a>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-bold tracking-tight">O que o Nexus resolve</h2>
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PROBLEMAS.map((p) => (
              <li key={p} className="rounded-xl border border-slate-200 bg-white p-4 text-slate-700">
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="modulos" className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight">Módulos</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULOS.map((m) => (
            <div key={m.titulo} className="rounded-xl border border-slate-200 p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 [&>svg]:h-5 [&>svg]:w-5">{m.icone}</span>
              <h3 className="mt-3 font-semibold">{m.titulo}</h3>
              <p className="mt-1 text-sm text-slate-600">{m.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-14 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <Building2 className="h-6 w-6 text-blue-700" />
            <h3 className="mt-3 text-lg font-semibold">Empresas com T.I. própria</h3>
            <p className="mt-1 text-slate-600">Controle do que a empresa tem, paga e entrega a cada pessoa, com o RH e Compras no mesmo fluxo.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <Users className="h-6 w-6 text-teal-600" />
            <h3 className="mt-3 text-lg font-semibold">Quem cuida da T.I. de várias empresas</h3>
            <p className="mt-1 text-slate-600">Prestadoras de serviço de T.I. organizam cada cliente com os mesmos processos e relatórios.</p>
          </div>
        </div>
      </section>

      <section id="contato" className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight">Quero conhecer</h2>
        <p className="mt-2 text-slate-600">Deixe seu contato e mostramos o Nexus funcionando com a realidade da sua empresa.</p>
        <div className="mt-6">
          <Contato />
        </div>
      </section>
    </main>

    <footer className="border-t border-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <LogoNexus className="h-7 w-auto" />
        <p id="privacidade" className="max-w-xl">
          Privacidade: os dados do formulário servem só para responder o contato e não são compartilhados. Os dados das empresas clientes ficam no ambiente
          delas, com acesso por perfil. Termos de uso e política de privacidade completos em breve.
        </p>
        <a href="/app/" className="font-semibold text-blue-700 hover:underline">
          Entrar no sistema
        </a>
      </div>
    </footer>
  </div>
);
