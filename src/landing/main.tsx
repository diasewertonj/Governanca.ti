// Seção 30 · Landing page pública (/). O sistema fica em /app/.
import { createRoot } from 'react-dom/client';
import './landing.css';
import { Landing, temaInicialLanding } from './Landing.tsx';
import { destinoNoSistema } from './redirecionar.ts';

// Endereços antigos (etiqueta QR já impressa, link de senha, janela de processo) vão para o sistema
const destino = destinoNoSistema(window.location.search, window.location.hash);
if (destino) window.location.replace(destino);
else {
  document.documentElement.classList.toggle('dark', temaInicialLanding() === 'escuro');
  createRoot(document.getElementById('landing')!).render(<Landing />);
}
