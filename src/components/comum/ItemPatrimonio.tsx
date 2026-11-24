/**
 * Seção 19: cada item que está com a pessoa num cartãozinho próprio, com o
 * ícone do tipo (notebook, monitor, celular, acessório…) — mais fácil de ver
 * o que a pessoa tem de relance. O cartão inteiro é clicável quando há ficha.
 */
import React from 'react';
import {
  BatteryCharging,
  Cable,
  Cpu,
  Headphones,
  Keyboard,
  Laptop,
  type LucideIcon,
  Monitor,
  Mouse,
  Package,
  Plug,
  Printer,
  Router,
  Server,
  Smartphone,
  Tablet,
  Webcam,
} from 'lucide-react';
import type { Asset, TipoAcessorio } from '../../types/index.ts';
import { normalizar } from '../../utils/processos.ts';

const PALAVRAS: [RegExp, LucideIcon][] = [
  [/notebook|laptop|ultrabook|macbook|thinkpad|latitude|elitebook/, Laptop],
  [/monitor|tela/, Monitor],
  [/celular|smartphone|iphone|galaxy|moto |redmi/, Smartphone],
  [/tablet|ipad/, Tablet],
  [/impressora|multifuncional|scanner/, Printer],
  [/switch|roteador|router|firewall|access point|\bap\b|wi-?fi/, Router],
  [/servidor|server|nas\b|storage/, Server],
  [/desktop|workstation|computador|\bpc\b|mini ?pc|optiplex/, Cpu],
  [/teclado/, Keyboard],
  [/mouse/, Mouse],
  [/headset|fone/, Headphones],
  [/webcam|camera|câmera/, Webcam],
  [/cabo|hdmi|displayport/, Cable],
  [/carregador|fonte/, BatteryCharging],
  [/adaptador|hub|dock/, Plug],
];

/** Ícone do equipamento pelo nome (e, se não reconhecer, pela categoria) */
export function iconeDoAtivo(a: Pick<Asset, 'nome' | 'categoria'> & { modelo?: string }): LucideIcon {
  const texto = normalizar(`${a.nome} ${a.modelo || ''}`);
  const achado = PALAVRAS.find(([re]) => re.test(texto));
  if (achado) return achado[1];
  if (a.categoria === 'telefonia') return Smartphone;
  if (a.categoria === 'periferico') return Keyboard;
  return Laptop;
}

const ICONE_ACESSORIO: Record<TipoAcessorio, LucideIcon> = {
  monitor: Monitor,
  mouse: Mouse,
  teclado: Keyboard,
  cabo: Cable,
  headset: Headphones,
  adaptador: Plug,
  carregador: BatteryCharging,
  webcam: Webcam,
  outro: Package,
};
export const iconeDoAcessorio = (tipo?: TipoAcessorio): LucideIcon => ICONE_ACESSORIO[tipo || 'outro'] || Package;

/** Cartão de um item: ícone à esquerda, identificação e detalhes; clicável quando abre a ficha */
export const CartaoItem: React.FC<{
  icone: LucideIcon;
  titulo: React.ReactNode;
  codigo?: React.ReactNode;
  detalhes?: React.ReactNode[];
  extra?: React.ReactNode;
  onAbrir?: () => void;
  rotuloAbrir?: string;
}> = ({ icone: Icone, titulo, codigo, detalhes = [], extra, onAbrir, rotuloAbrir }) => {
  const conteudo = (
    <>
      <span className="janela-icone" aria-hidden="true">
        <Icone className="ico" />
      </span>
      <span className="min-w-0 flex-1">
        {codigo && <span className="texto-aux block font-mono">{codigo}</span>}
        <span className="block font-semibold break-words text-slate-900">{titulo}</span>
        {detalhes.filter(Boolean).map((d, i) => (
          <span key={i} className="texto-aux block break-words">
            {d}
          </span>
        ))}
      </span>
      {extra && <span className="shrink-0 self-start">{extra}</span>}
    </>
  );
  return onAbrir ? (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={rotuloAbrir}
      className="cartao flex w-full items-start gap-3 p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40"
    >
      {conteudo}
    </button>
  ) : (
    <div className="cartao flex items-start gap-3 p-3">{conteudo}</div>
  );
};
