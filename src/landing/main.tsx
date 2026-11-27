// Seção 30 · Landing page pública (/). O sistema fica em /app/.
import { createRoot } from 'react-dom/client';
import '../index.css';
import { Landing } from './Landing.tsx';
import { destinoNoSistema } from './redirecionar.ts';

// Endereços antigos (etiqueta QR já impressa, link de senha, janela de processo) vão para o sistema
const destino = destinoNoSistema(window.location.search, window.location.hash);
if (destino) window.location.replace(destino);
else createRoot(document.getElementById('landing')!).render(<Landing />);
