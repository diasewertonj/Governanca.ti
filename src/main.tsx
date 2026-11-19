import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { aplicarDensidade, lerDensidade } from './utils/densidade.ts';

// Seção 19: densidade das tabelas escolhida pelo usuário (salva no navegador)
aplicarDensidade(lerDensidade());

createRoot(document.getElementById('root')!).render(<App />);
