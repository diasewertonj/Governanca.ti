import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { aplicarDensidade, lerDensidade } from './utils/densidade.ts';
import { acompanharSistema, aplicarTema, lerTema } from './utils/tema.ts';

// Seção 19: densidade das tabelas escolhida pelo usuário (salva no navegador)
aplicarDensidade(lerDensidade());
// Seção 22: tema claro, escuro ou automático (no automático acompanha o sistema)
aplicarTema(lerTema());
acompanharSistema();

createRoot(document.getElementById('root')!).render(<App />);
