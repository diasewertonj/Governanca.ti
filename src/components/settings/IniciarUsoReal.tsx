/**
 * Seção 28 · Iniciar uso real (só o administrador, só com o Supabase).
 * Prévia do que sai e do que fica → confirmação pelo nome da empresa → virada pela função
 * do servidor "iniciar-uso-real" (banco + logins + arquivos de teste). Depois recarrega.
 */
import React, { useState } from 'react';
import { AlertTriangle, Rocket } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { iniciarUsoRealDb, previaUsoRealDb, type ItemPreviaUsoReal } from '../../services/supabaseDb.ts';
import { Janela } from '../ui/Janela.tsx';

export const IniciarUsoReal: React.FC = () => {
  const { settings } = useApp();
  const [aberta, setAberta] = useState(false);
  const [previa, setPrevia] = useState<ItemPreviaUsoReal[] | null>(null);
  const [estrutura, setEstrutura] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState<string | null>(null);
  const nomeEmpresa = settings.nomeFantasia || settings.razaoSocial || '';
  const nomes = [settings.nomeFantasia, settings.razaoSocial].filter(Boolean).map((n) => (n as string).trim().toLowerCase());
  const confere = nomes.includes(confirmacao.trim().toLowerCase());

  const abrir = async () => {
    setAberta(true);
    setErro('');
    setPrevia(null);
    try {
      setPrevia(await previaUsoRealDb());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const iniciar = async () => {
    setRodando(true);
    setErro('');
    try {
      const r = await iniciarUsoRealDb(confirmacao, estrutura);
      setFeito(
        `Base iniciada. ${r.loginsRemovidos} login(s) e ${r.arquivosRemovidos} arquivo(s) de teste removidos.` +
          (r.loginsComFalha ? ` ${r.loginsComFalha} login(s) não saíram: remova em Supabase › Authentication.` : '') +
          (r.falhaArquivos ? ' Alguns arquivos não saíram do armazenamento.' : '')
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setRodando(false);
    }
  };

  const grupo = (g: ItemPreviaUsoReal['grupo']) => (previa || []).filter((x) => x.grupo === g);

  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/40 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="ico-lg shrink-0 text-red-600" />
        <div>
          <h4 className="secao-titulo text-red-900">Iniciar uso real</h4>
          <p className="mt-0.5 text-red-700">
            Apaga os dados de teste (pessoas, equipamentos, softwares, contratos, faturas, chamados, logins e arquivos) e mantém você, os dados da empresa,
            prazos, premissas e o catálogo de processos. Antes de apagar, mostra o que sai e o que fica.
          </p>
        </div>
      </div>
      <button type="button" onClick={abrir} className="btn btn-perigo">
        <Rocket /> Iniciar uso real…
      </button>

      {aberta && (
        <Janela
          titulo="Iniciar uso real"
          subtitulo="Confira o que sai e o que fica antes de confirmar"
          tamanho="m"
          onFechar={() => (feito ? window.location.reload() : setAberta(false))}
          rodape={
            feito ? (
              <button type="button" onClick={() => window.location.reload()} className="btn btn-primario">
                Recarregar o sistema
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setAberta(false)} className="btn btn-secundario">
                  Cancelar
                </button>
                <button type="button" disabled={!confere || rodando || !previa} onClick={iniciar} className="btn btn-perigo">
                  {rodando ? 'Apagando…' : 'Apagar os dados de teste e iniciar'}
                </button>
              </>
            )
          }
        >
          {feito ? (
            <p className="text-slate-800">{feito}</p>
          ) : (
            <div className="space-y-4">
              {!previa && !erro && <p className="texto-aux">Contando o que existe na base…</p>}
              {previa && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="cartao p-3">
                    <h5 className="secao-titulo text-red-800">Sai</h5>
                    <ul className="mt-1 space-y-0.5">
                      {grupo('sai').map((x) => (
                        <li key={x.item} className="flex justify-between gap-2">
                          <span>{x.item}</span>
                          <span className="num font-semibold">{x.quantidade}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="cartao p-3 space-y-2">
                    <h5 className="secao-titulo text-emerald-800">Fica</h5>
                    <ul className="space-y-0.5">
                      <li>Você (administrador) e o seu login</li>
                      <li>Dados da empresa, logo, prazos de atendimento e premissas</li>
                      {grupo('fica').map((x) => (
                        <li key={x.item} className="flex justify-between gap-2">
                          <span>{x.item}</span>
                          <span className="num">{x.quantidade}</span>
                        </li>
                      ))}
                      {!estrutura &&
                        grupo('opcional').map((x) => (
                          <li key={x.item} className="flex justify-between gap-2">
                            <span>{x.item}</span>
                            <span className="num">{x.quantidade}</span>
                          </li>
                        ))}
                    </ul>
                    <label className="flex items-start gap-2 text-slate-700">
                      <input type="checkbox" checked={estrutura} onChange={(e) => setEstrutura(e.target.checked)} className="mt-1" />
                      <span>Apagar também departamentos e unidades (se os atuais forem de teste). Você precisará cadastrá-los antes das pessoas.</span>
                    </label>
                  </div>
                </div>
              )}
              <div>
                <label htmlFor="uso-real-confirmacao" className="rotulo">
                  Para confirmar, digite o nome da empresa{nomeEmpresa ? `: ${nomeEmpresa}` : ''}
                </label>
                <input id="uso-real-confirmacao" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="off" className="campo" />
                {!nomeEmpresa && <p className="erro">Preencha o nome da empresa em Configurações › Empresa antes.</p>}
              </div>
              <p className="texto-aux">Não dá para desfazer. Depois da virada, as baixas patrimoniais voltam a ser histórico que não se apaga.</p>
              {erro && (
                <p role="alert" className="erro">
                  {erro}
                </p>
              )}
            </div>
          )}
        </Janela>
      )}
    </div>
  );
};
