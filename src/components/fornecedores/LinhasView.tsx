import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useRecursos } from '../../context/RecursosContext.tsx';
import { normalizar } from '../../utils/processos.ts';
import { Busca, CabecalhoTela } from '../ui/Tela.tsx';
import { LinhasLista } from './LinhasLista.tsx';

/** Inventário › Linhas telefônicas: celulares e fixos, com pessoa, aparelho, contrato e histórico de uso */
export const LinhasView: React.FC = () => {
  const { linhas } = useRecursos();
  const [busca, setBusca] = useState('');
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);
  const [novaAberta, setNovaAberta] = useState(false);
  const ativas = linhas.filter((l) => l.status !== 'cancelada').length;

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo="Linhas telefônicas"
        subtitulo={`${ativas} ${ativas === 1 ? 'linha ativa' : 'linhas ativas'} · pessoa, aparelho, contrato e histórico de uso`}
        acoes={
          <button type="button" onClick={() => setNovaAberta(true)} className="btn btn-primario">
            <Plus /> Nova linha
          </button>
        }
        filtros={
          <>
            <Busca id="linhas-busca" valor={busca} onMudar={setBusca} placeholder="Buscar número, plano, pessoa ou contrato..." />
            <label className="inline-flex items-center gap-2 text-slate-700">
              <input type="checkbox" checked={mostrarCanceladas} onChange={(e) => setMostrarCanceladas(e.target.checked)} /> Mostrar canceladas
            </label>
          </>
        }
      />
      <LinhasLista
        busca={normalizar(busca)}
        mostrarCanceladas={mostrarCanceladas}
        novaAberta={novaAberta}
        onFecharNova={() => setNovaAberta(false)}
      />
    </div>
  );
};
