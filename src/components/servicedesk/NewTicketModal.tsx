import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { TicketPriority, TicketAttachment } from '../../types/index.ts';
import { X, Paperclip, Send } from 'lucide-react';
import {
  enviarAnexoDb,
  formatarTamanho,
  mensagemDeErro,
  removerArquivosDb,
  TIPOS_ARQUIVO_ACEITOS,
  validarArquivo,
} from '../../services/supabaseDb.ts';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';
import { Janela } from '../ui/Janela.tsx';
import { CATEGORIAS_CHAMADO } from '../../utils/atendimento.ts';

// Anexo escolhido, ainda só no navegador (Fase 5: sobe apenas ao enviar o chamado)
interface AnexoPendente {
  id: string;
  nome: string;
  tamanho: string;
  arquivo: File;
}

interface NewTicketModalProps {
  onClose: () => void;
  /** Fase 10: aberto pelo painel do equipamento — já vem escolhido */
  ativoInicial?: string;
}

export const NewTicketModal: React.FC<NewTicketModalProps> = ({ onClose, ativoInicial }) => {
  const {
    currentUser,
    currentRole,
    supabaseUser,
    departments,
    employees,
    assets,
    licenses,
    createTicket,
    setSelectedTicketIdForDetail,
  } = useApp();
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  // Fase 10: a T.I. pode registrar o chamado em nome de outra pessoa (telefone, presencial)
  const [solicitanteId, setSolicitanteId] = useState(currentUser?.id ?? '');
  const [trocandoAtivo, setTrocandoAtivo] = useState(!ativoInicial);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [erroAnexo, setErroAnexo] = useState<string | null>(null);
  const [enviandoChamado, setEnviandoChamado] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState('Hardware / Equipamento');
  const [prioridade, setPrioridade] = useState<TicketPriority>('media');
  // Fase 9: equipamento e software são vínculos separados (dá para informar os dois)
  const [ativoSel, setAtivoSel] = useState(ativoInicial ?? '');
  const [softwareSel, setSoftwareSel] = useState('');
  const [descricao, setDescricao] = useState('');
  const [anexos, setAnexos] = useState<AnexoPendente[]>([]);

  // Fase 5: chamado em preenchimento conta como alteração não salva
  const preenchido = titulo.trim() !== '' || descricao.trim() !== '' || anexos.length > 0;
  const itensPendentes = preenchido
    ? [`Chamado novo não enviado${anexos.length ? ` (${anexos.length} anexo(s))` : ''}`]
    : [];
  useRegistrarPendencias('novo-chamado', itensPendentes);

  const fechar = () => {
    if (enviandoChamado) return;
    void confirmarDescarte(itensPendentes).then((ok) => ok && onClose());
  };

  if (!currentUser) return null;

  // Quem pede: o próprio usuário ou, para a T.I., a pessoa escolhida
  const solicitante = (isTI && employees.find((e) => e.id === solicitanteId)) || currentUser;
  const emNomeDeOutro = solicitante.id !== currentUser.id;
  const userDepartment = departments.find((d) => d.id === solicitante.setorId);
  const pessoasAtivas = employees.filter((e) => e.status !== 'desligado').sort((a, b) => a.nome.localeCompare(b.nome));

  // Equipamentos em posse do solicitante (o vindo do painel entra mesmo se a lista mudar)
  const myCustodyAssets = assets.filter(
    (a) => (a.custodianteId === solicitante.id && a.status !== 'descartado') || a.id === ativoInicial
  );
  const ativoEscolhido = assets.find((a) => a.id === ativoSel);

  // Softwares alocados para o solicitante
  const myLicenses = licenses.filter((l) => l.colaboradoresIds.includes(solicitante.id));
  const otherLicenses = licenses.filter((l) => !l.colaboradoresIds.includes(solicitante.id));

  const trocarSolicitante = (id: string) => {
    setSolicitanteId(id);
    // Equipamento e software são da pessoa: escolhe de novo
    setAtivoSel('');
    setSoftwareSel('');
    setTrocandoAtivo(true);
  };

  // Fase 5: escolher arquivo só valida tipo/tamanho; o envio ao Storage
  // acontece ao clicar em "Enviar Chamado" (cancelar não deixa arquivo órfão)
  const handleSelecionarArquivos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files || []);
    e.target.value = '';
    if (arquivos.length === 0) return;
    const validos: AnexoPendente[] = [];
    const erros: string[] = [];
    for (const arquivo of arquivos) {
      const erro = validarArquivo(arquivo);
      if (erro) erros.push(erro);
      else validos.push({ id: crypto.randomUUID(), nome: arquivo.name, tamanho: formatarTamanho(arquivo.size), arquivo });
    }
    setErroAnexo(erros.length ? erros.join(' ') : null);
    setAnexos((prev) => [...prev, ...validos]);
  };

  /** Sobe os anexos; se algum falhar, apaga os que já subiram e devolve null */
  const enviarAnexos = async (): Promise<TicketAttachment[] | null> => {
    const enviados: TicketAttachment[] = [];
    for (const a of anexos) {
      try {
        enviados.push(await enviarAnexoDb(a.arquivo, supabaseUser?.id));
      } catch (err) {
        setErroAnexo(`Não foi possível enviar "${a.nome}": ${mensagemDeErro(err)}. O chamado não foi aberto.`);
        await removerArquivosDb(enviados.flatMap((x) => (x.caminho ? [x.caminho] : []))).catch(() => undefined);
        return null;
      }
    }
    return enviados;
  };

  const handleRemoveAttachment = (attId: string) => {
    setAnexos(anexos.filter((a) => a.id !== attId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !descricao.trim()) return;

    const ativoId = ativoSel || undefined;
    const softwareId = softwareSel || undefined;
    const softwareNome = softwareId ? licenses.find((l) => l.id === softwareId)?.nome : undefined;

    if (enviandoChamado || enviandoAnexo) return;
    setEnviandoChamado(true);
    setEnviandoAnexo(anexos.length > 0);
    const anexosEnviados = await enviarAnexos();
    setEnviandoAnexo(false);
    if (!anexosEnviados) {
      setEnviandoChamado(false);
      return;
    }
    const created = await createTicket({
      tipo: 'suporte',
      solicitanteId: solicitante.id,
      solicitanteNome: solicitante.nome,
      solicitanteEmail: solicitante.email,
      solicitanteCargo: solicitante.cargo,
      solicitanteSetorNome: userDepartment?.nome || 'Setor',
      ativoId,
      softwareId,
      softwareNome,
      titulo: titulo.trim(),
      categoria,
      prioridade,
      status: 'aberto',
      descricao: descricao.trim(),
      anexos: anexosEnviados,
    });
    setEnviandoChamado(false);
    if (!created) {
      // Chamado recusado: apaga os anexos que subiram (o modal fica aberto para tentar de novo)
      await removerArquivosDb(anexosEnviados.flatMap((x) => (x.caminho ? [x.caminho] : []))).catch(() => undefined);
      return;
    }
    setAnexos([]);

    onClose();
    setSelectedTicketIdForDetail(created.id);
  };

  const idForm = 'novo-chamado-form';

  return (
    <Janela
      titulo="Abrir chamado"
      tamanho="m"
      onFechar={fechar}
      idTitulo="novo-chamado-titulo"
      rodape={
        <>
          <span />
          <span className="flex gap-2">
            <button type="button" onClick={fechar} className="btn btn-secundario">
              Cancelar
            </button>
            <button type="submit" form={idForm} disabled={enviandoChamado || enviandoAnexo} className="btn btn-primario">
              <Send aria-hidden="true" />
              {enviandoChamado ? 'Abrindo...' : 'Abrir chamado'}
            </button>
          </span>
        </>
      }
    >
      <form id={idForm} onSubmit={handleSubmit} className="space-y-4">
        {/* Preenchimento automático do solicitante */}
        <div className="cartao flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-800">
              {solicitante.nome.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">
                {solicitante.nome} <span className="font-normal text-slate-500">({solicitante.matricula})</span>
              </p>
              <p className="text-slate-600">
                {solicitante.cargo} · {userDepartment?.nome || 'Setor'}
              </p>
              {emNomeDeOutro && <p className="text-blue-800">Registrado pela T.I. em nome desta pessoa</p>}
            </div>
          </div>
          {isTI && (
            <div className="w-full sm:w-64">
              <label htmlFor="novo-chamado-solicitante" className="sr-only">
                Solicitante
              </label>
              <select
                id="novo-chamado-solicitante"
                value={solicitante.id}
                onChange={(e) => trocarSolicitante(e.target.value)}
                className="campo campo-sm"
              >
                {pessoasAtivas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id === currentUser.id ? `${e.nome} (eu)` : e.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="novo-chamado-titulo-campo" className="rotulo">
            Título resumido do chamado
          </label>
          <input
            id="novo-chamado-titulo-campo"
            type="text"
            required
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Teclado falhando teclas específicas ou tela piscando na docking"
            className="campo"
          />
        </div>

        <div>
          <label htmlFor="novo-chamado-descricao" className="rotulo">
            Descrição detalhada do problema
          </label>
          <textarea
            id="novo-chamado-descricao"
            required
            rows={4}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descreva quando o problema começou, se há mensagens de erro na tela e os passos para reproduzir a falha..."
            className="campo"
          />
        </div>

        {/* Fase 9: equipamento e software afetados (opcionais; dá para informar os dois) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="novo-chamado-ativo" className="rotulo">
              Equipamento afetado <span className="font-normal text-slate-500">(se houver)</span>
            </label>
            {/* Fase 10: vindo do painel do equipamento, ele já está escolhido (dá para trocar) */}
            {!trocandoAtivo && ativoEscolhido ? (
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-words">
                  <span className="font-semibold text-slate-900">{ativoEscolhido.tag}</span> · {ativoEscolhido.nome}
                </span>
                <button type="button" onClick={() => setTrocandoAtivo(true)} className="link shrink-0">
                  Trocar
                </button>
              </div>
            ) : (
              <select
                id="novo-chamado-ativo"
                value={ativoSel}
                onChange={(e) => {
                  setAtivoSel(e.target.value);
                  if (e.target.value && !softwareSel) setCategoria('Hardware / Equipamento');
                }}
                className="campo"
              >
                <option value="">— nenhum —</option>
                {myCustodyAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.tag} · {asset.nome} ({asset.marca})
                  </option>
                ))}
              </select>
            )}
            {trocandoAtivo && myCustodyAssets.length === 0 && (
              <p className="ajuda">
                {emNomeDeOutro ? 'Nenhum equipamento com esta pessoa.' : 'Nenhum equipamento sob sua responsabilidade.'}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="novo-chamado-software" className="rotulo">
              Software / licença afetado <span className="font-normal text-slate-500">(se houver)</span>
            </label>
            <select
              id="novo-chamado-software"
              value={softwareSel}
              onChange={(e) => {
                setSoftwareSel(e.target.value);
                if (e.target.value && !ativoSel) setCategoria('Softwares & Licenças');
              }}
              className="campo"
            >
              <option value="">— nenhum —</option>
              {myLicenses.length > 0 && (
                <optgroup label="Minhas licenças">
                  {myLicenses.map((lic) => (
                    <option key={lic.id} value={lic.id}>
                      {lic.nome} ({lic.fornecedor})
                    </option>
                  ))}
                </optgroup>
              )}
              {otherLicenses.length > 0 && (
                <optgroup label="Outros softwares da empresa">
                  {otherLicenses.map((lic) => (
                    <option key={lic.id} value={lic.id}>
                      {lic.nome} ({lic.fornecedor})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <p className="ajuda sm:col-span-2">Informar o equipamento e o software afetados ajuda a T.I. a saber do que se trata.</p>

          <div>
            <label htmlFor="novo-chamado-categoria" className="rotulo">
              Categoria do problema
            </label>
            <select id="novo-chamado-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="campo">
              {CATEGORIAS_CHAMADO.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="novo-chamado-prioridade" className="rotulo">
              Prioridade informada
            </label>
            <select
              id="novo-chamado-prioridade"
              value={prioridade}
              onChange={(e) => setPrioridade(e.target.value as TicketPriority)}
              className="campo"
            >
              <option value="baixa">Baixa (Dúvida ou solicitação sem impacto)</option>
              <option value="media">Média (Impacto parcial no trabalho diário)</option>
              <option value="alta">Alta (Impossibilita atividades principais)</option>
              <option value="critica">Urgente (Bloqueio total / Falha crítica de máquina)</option>
            </select>
          </div>
        </div>

        {/* Anexos de arquivos / prints de erro */}
        <div className="space-y-2">
          <p className="rotulo">Anexos (prints de erro, fotos do estado físico, logs)</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className={`btn btn-sm btn-secundario cursor-pointer ${enviandoAnexo ? 'pointer-events-none opacity-50' : ''}`}>
              <Paperclip aria-hidden="true" />
              Escolher arquivos
              <input
                type="file"
                multiple
                accept={TIPOS_ARQUIVO_ACEITOS.join(',')}
                onChange={handleSelecionarArquivos}
                className="sr-only"
              />
            </label>
            <span className="ajuda !mt-0">PDF, PNG, JPG, WEBP ou TXT · até 10 MB cada</span>
          </div>
          {erroAnexo && <p className="erro">{erroAnexo}</p>}

          {anexos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {anexos.map((att) => (
                <span key={att.id} className="selo selo-neutro">
                  <Paperclip aria-hidden="true" />
                  <span>{att.nome}</span>
                  <span className="text-slate-500">({att.tamanho})</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    title="Remover anexo"
                    aria-label={`Remover o anexo ${att.nome}`}
                    className="btn-icone btn-icone-perigo !p-0.5"
                  >
                    <X />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </form>
    </Janela>
  );
};
