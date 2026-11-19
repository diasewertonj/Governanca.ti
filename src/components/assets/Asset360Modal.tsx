import { avisar, confirmarMovimento } from '../ui/dialogo.tsx';
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatCurrency, formatDate, formatChaveNFe } from '../../utils/formatters.ts';
import { CHAVE, ROTULO_CHAVE, SISTEMAS_OPERACIONAIS, resumoEspecificacoes } from '../../utils/especificacoes.ts';
import { avisoSegundoAtivo, classeDoAtivo, exigeTermo, temProcessoAberto } from '../../utils/inventario.ts';
import { aplicarMascara } from '../../utils/mascaras.ts';
import { CampoSugestoes } from '../ui/Campos.tsx';
import { contratosQueCobrem, garantiaEfetiva, nomeContrato } from '../../utils/contratos.ts';
import {
  QrCode,
  FileText,
  Wrench,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Copy,
  Check,
  ArrowRightLeft,
  Lock,
  Archive,
  Laptop,
  Mouse,
  Smartphone,
  Package,
  ChevronRight,
} from 'lucide-react';
import { NewAssetModal } from './NewAssetModal.tsx';
import { AnexosAtivo } from './AnexosAtivo.tsx';
import { DepreciacaoAtivo } from './DepreciacaoAtivo.tsx';
import { BotaoContaDoAtivo } from '../financeiro/FaturasSecao.tsx';
import { LembreteGarantia } from './LembreteGarantia.tsx';
import { ManutencoesAtivo } from './ManutencoesAtivo.tsx';
import { FormManutencao } from './FormManutencao.tsx';
import { FormBaixa } from './FormBaixa.tsx';
import { BaixaPatrimonial } from './BaixaPatrimonial.tsx';
import { ROTULO_MOTIVO_BAIXA, ROTULO_TIPO_MANUTENCAO, baixaVigente, podeEnviarParaManutencao, statusAoMudarCustodia } from '../../utils/cicloVida.ts';
import { chamadosDoAtivo } from '../../utils/vinculos.ts';
import { ChamadosVinculados } from '../servicedesk/ChamadosVinculados.tsx';
import { ContratoPorId } from '../financeiro/FinanceiroViews.tsx';
import { Janela, Dado } from '../ui/Janela.tsx';
import { Abas, type ItemAba } from '../ui/Abas.tsx';
import { Vazio } from '../ui/Tela.tsx';
import type { Asset, AssetCategory, AssetStatus } from '../../types/index.ts';

interface Asset360ModalProps {
  assetId: string;
  /** Fase 9: aberta pelo chamado já com "Enviar para manutenção" ligado a ele */
  manutencaoDoChamado?: string;
  onClose: () => void;
}

type AbaAtivo = 'resumo' | 'custodia' | 'garantia' | 'manutencoes' | 'documentos' | 'chamados' | 'historico';

const SITUACAO: Record<AssetStatus, { rotulo: string; selo: string }> = {
  disponivel: { rotulo: 'Disponível em estoque', selo: 'selo-ok' },
  em_uso: { rotulo: 'Em uso', selo: 'selo-info' },
  manutencao: { rotulo: 'Em manutenção', selo: 'selo-atencao' },
  descartado: { rotulo: 'Baixado', selo: 'selo-neutro' },
};

const ICONE_CATEGORIA: Record<AssetCategory, React.ReactNode> = {
  hardware: <Laptop className="h-4 w-4" />,
  periferico: <Mouse className="h-4 w-4" />,
  telefonia: <Smartphone className="h-4 w-4" />,
  software: <Package className="h-4 w-4" />,
};

/** Texto do botão some no celular (fica só o ícone, com o nome no title/aria-label) */
const Rotulo: React.FC<{ texto: string }> = ({ texto }) => <span className="hidden sm:inline">{texto}</span>;

interface EventoAtivo {
  id: string;
  data: string;
  rotulo: string;
  selo: string;
  texto: string;
  detalhe?: string;
}

/** Linha do tempo do equipamento: compra, entregas/devoluções, manutenções e baixas */
function eventosDoAtivo(asset: Asset, nomeFornecedor?: string): EventoAtivo[] {
  const ev: EventoAtivo[] = [];
  if (asset.fiscal?.dataAquisicao) {
    ev.push({
      id: 'compra',
      data: asset.fiscal.dataAquisicao,
      rotulo: 'Compra',
      selo: 'selo-info',
      texto: `Comprado${nomeFornecedor ? ` de ${nomeFornecedor}` : ''}${asset.fiscal.numeroNF ? ` · NF ${asset.fiscal.numeroNF}` : ''}`,
    });
  }
  for (const h of asset.historicoCustodia || []) {
    if (h.dataEntrega) ev.push({ id: `${h.id}-e`, data: h.dataEntrega, rotulo: 'Entrega', selo: 'selo-info', texto: `Entregue a ${h.colaboradorNome}` });
    if (h.dataDevolucao) {
      ev.push({
        id: `${h.id}-d`,
        data: h.dataDevolucao,
        rotulo: 'Devolução',
        selo: 'selo-neutro',
        texto: `Devolvido por ${h.colaboradorNome}`,
        detalhe: h.motivoDevolucao,
      });
    }
  }
  for (const m of asset.historicoManutencao || []) {
    ev.push({
      id: `${m.id}-a`,
      data: m.abertaEm,
      rotulo: 'Manutenção',
      selo: 'selo-atencao',
      texto: `${ROTULO_TIPO_MANUTENCAO[m.tipo]} aberta: ${m.descricao}`,
    });
    if (m.status === 'concluida' && m.concluidaEm) {
      ev.push({ id: `${m.id}-c`, data: m.concluidaEm, rotulo: 'Manutenção', selo: 'selo-ok', texto: `Manutenção concluída: ${m.descricao}` });
    }
    if (m.status === 'cancelada' && m.encerradoEm) {
      ev.push({ id: `${m.id}-x`, data: m.encerradoEm, rotulo: 'Manutenção', selo: 'selo-neutro', texto: `Manutenção cancelada: ${m.descricao}` });
    }
  }
  for (const b of asset.baixas || []) {
    ev.push({ id: `${b.id}-b`, data: b.dataBaixa, rotulo: 'Baixa', selo: 'selo-problema', texto: `Baixa patrimonial: ${ROTULO_MOTIVO_BAIXA[b.motivo]}` });
    if (b.estornadaEm) {
      ev.push({ id: `${b.id}-e`, data: b.estornadaEm, rotulo: 'Estorno', selo: 'selo-neutro', texto: 'Baixa estornada', detalhe: b.motivoEstorno });
    }
  }
  return ev.sort((a, b) => b.data.localeCompare(a.data));
}

export const Asset360Modal: React.FC<Asset360ModalProps> = ({ assetId, manutencaoDoChamado, onClose }) => {
  const {
    assets,
    employees,
    departments,
    tickets,
    setSelectedEmployeeIdFor360,
    setSelectedAssetForQrCode,
    setSelectedTermForPrint,
    terms,
    transferAssetCustody,
    updateAsset,
    currentUser,
    currentRole,
    contratos,
    fornecedores,
    settings,
    setSelectedTicketIdForDetail,
  } = useApp();

  const [aba, setAba] = useState<AbaAtivo>(manutencaoDoChamado ? 'manutencoes' : 'resumo');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedBitlocker, setCopiedBitlocker] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedNewUser, setSelectedNewUser] = useState<string>('');
  const [motivoDevolucao, setMotivoDevolucao] = useState('');
  const [isEditingSecurity, setIsEditingSecurity] = useState(false);
  const [editando, setEditando] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [enviandoManutencao, setEnviandoManutencao] = useState(Boolean(manutencaoDoChamado));
  const [dandoBaixa, setDandoBaixa] = useState(false);
  const [contratoAberto, setContratoAberto] = useState<string | null>(null);
  const [tempSO, setTempSO] = useState('');
  const [tempBitlocker, setTempBitlocker] = useState('');

  const asset = assets.find((a) => a.id === assetId);

  if (!asset) return null;

  const currentCustodian = employees.find((e) => e.id === asset.custodianteId);
  const department = departments.find((d) => d.id === asset.setorId);
  // Fase 8: a garantia considera os contratos de suporte/garantia estendida que cobrem o ativo
  const warranty = garantiaEfetiva(asset, contratos);
  const contratosCobertura = contratosQueCobrem(asset.id, contratos);
  const nomeFornecedor = fornecedores.find((f) => f.id === asset.fornecedorId)?.nome || asset.fiscal?.fornecedor;
  const isTI = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const descartado = asset.status === 'descartado';
  const situacao = SITUACAO[asset.status];
  const baixa = baixaVigente(asset);
  const chamados = chamadosDoAtivo(tickets, asset.id);
  const seloGarantia =
    warranty.status === 'valida' ? 'selo-ok' : warranty.status === 'expirando' ? 'selo-atencao' : 'selo-neutro';

  const handleCopyKey = () => {
    if (asset.fiscal?.chaveAcesso44) {
      navigator.clipboard.writeText(asset.fiscal.chaveAcesso44);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleCopyBitlocker = () => {
    if (asset.bitlockerKey) {
      navigator.clipboard.writeText(asset.bitlockerKey);
      setCopiedBitlocker(true);
      setTimeout(() => setCopiedBitlocker(false), 2000);
    }
  };

  const handleSaveSecurity = () => {
    updateAsset(asset.id, {
      sistemaOperacional: tempSO.trim() || undefined,
      bitlockerKey: tempBitlocker.trim() || undefined,
    });
    setIsEditingSecurity(false);
  };

  // AUDITORIA RBAC: colaborador comum não abre o cadastro de outros colaboradores
  const podeVerPessoa = (empId: string) => !(currentRole === 'colaborador' && empId !== currentUser?.id);

  const handleOpenCustodian = (empId: string) => {
    if (!podeVerPessoa(empId)) {
      void avisar('Acesso restrito: Colaboradores não têm permissão para acessar o cadastro de outros colaboradores.');
      return;
    }
    // Fase 9: abre por cima; fechar a ficha da pessoa volta para este equipamento
    setSelectedEmployeeIdFor360(empId);
  };

  const pessoa = (id: string, nome: string) =>
    podeVerPessoa(id) ? (
      <button type="button" onClick={() => handleOpenCustodian(id)} className="link text-left">
        {nome}
      </button>
    ) : (
      <span className="font-medium text-slate-900">{nome}</span>
    );

  // Seção 9.1: quem está com o equipamento tem admissão/desligamento em andamento? (o certo é pelo checklist)
  const processoDoCustodiante = currentCustodian
    ? tickets.find((t) => temProcessoAberto(currentCustodian.id, [t]))
    : undefined;
  const textoProcesso =
    currentCustodian && processoDoCustodiante
      ? processoDoCustodiante.tipo === 'offboarding'
        ? `${currentCustodian.nome} tem desligamento em andamento: o certo é registrar a devolução no checklist do desligamento.`
        : `${currentCustodian.nome} tem admissão em andamento: o certo é registrar a entrega no checklist da admissão.`
      : '';

  // Seção 9.1/9.6: nada muda de mãos sem o resumo "de → para", o termo e o que falta fazer fora do Nexus
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNewUser) return;
    const newId = selectedNewUser === 'estoque' ? null : selectedNewUser;
    const novo = newId ? employees.find((x) => x.id === newId) : undefined;
    const atual = currentCustodian;
    const motivo = motivoDevolucao.trim();
    if (atual && !motivo) return;
    const nomeNovo = novo?.nome || 'a pessoa escolhida';
    const classe = classeDoAtivo(asset);
    const aviso = newId ? avisoSegundoAtivo(asset, newId, assets) : null;
    const status = statusAoMudarCustodia(asset, newId);
    const envolvidos = [atual?.nome, newId ? nomeNovo : undefined].filter((x): x is string => Boolean(x));
    const termo = !exigeTermo(asset, settings.termoExige)
      ? 'Este item não exige termo.'
      : envolvidos.length > 1
        ? `Os termos de ${envolvidos[0]} e de ${envolvidos[1]} ficarão desatualizados: gere o termo atualizado na ficha de cada pessoa (não bloqueia).`
        : `O termo de ${envolvidos[0] || 'a pessoa'} ficará desatualizado: gere o termo atualizado na ficha da pessoa (não bloqueia).`;

    const resposta = await confirmarMovimento({
      titulo: newId ? (atual ? 'Transferir custódia' : 'Entregar equipamento') : 'Devolver ao estoque',
      item: `${asset.tag} · ${asset.nome}`,
      de: atual?.nome || 'Estoque de T.I.',
      para: newId ? nomeNovo : 'Estoque de T.I. (devolução)',
      efeitos: [
        ...(atual ? [`A custódia de ${atual.nome} é fechada hoje com o motivo "${motivo}".`] : []),
        ...(newId ? [`A entrega para ${nomeNovo} fica registrada hoje no histórico de custódia.`] : []),
        status === 'manutencao'
          ? 'A situação continua "Em manutenção" até a manutenção ser concluída.'
          : status === 'em_uso'
            ? 'A situação passa a "Em uso".'
            : 'A situação passa a "Disponível em estoque".',
        ...(textoProcesso ? [textoProcesso] : []),
      ],
      foraDoNexus: [
        ...(atual ? [`Recolher o equipamento com ${atual.nome}.`] : []),
        ...(atual ? [`Fazer backup dos dados de ${atual.nome} e limpar o equipamento antes de ${newId ? `entregar a ${nomeNovo}` : 'guardar no estoque'}.`] : []),
        ...(newId ? [`Entregar o equipamento a ${nomeNovo}.`] : []),
        ...(classe === 'computador' ? ['Trocar o usuário do computador e atualizar o MDM, se for o caso.'] : []),
        ...(classe === 'celular' ? ['Trocar a conta do aparelho e atualizar o MDM, se for o caso.'] : []),
      ],
      termo,
      justificativa: aviso ? { aviso } : undefined,
      desfazer: 'Dá para desfazer transferindo de volta; o histórico guarda as duas movimentações.',
      confirmar: newId ? (atual ? 'Transferir' : 'Entregar') : 'Registrar devolução',
    });
    if (!resposta) return;
    transferAssetCustody(asset.id, newId, atual ? motivo : undefined, resposta.justificativa);
    setShowTransferModal(false);
    setSelectedNewUser('');
    setMotivoDevolucao('');
  };

  const handleViewTerm = (termoId?: string) => {
    if (!termoId) return;
    const term = terms.find((t) => t.id === termoId);
    if (term) setSelectedTermForPrint(term);
  };

  const abrirTransferencia = () => {
    setAba('custodia');
    setShowTransferModal(true);
  };

  const abas: ItemAba<AbaAtivo>[] = [
    { id: 'resumo', rotulo: 'Resumo' },
    { id: 'custodia', rotulo: 'Custódia e histórico' },
    { id: 'garantia', rotulo: 'Garantia e contrato' },
    ...(isTI ? [{ id: 'manutencoes' as const, rotulo: 'Manutenções', contador: (asset.historicoManutencao || []).length }] : []),
    { id: 'documentos', rotulo: 'Documentos', contador: isTI ? (asset.anexos || []).length : undefined },
    { id: 'chamados', rotulo: 'Chamados', contador: chamados.length },
  ];
  const abaAtual = abas.some((a) => a.id === aba) ? aba : 'resumo';
  // Painéis ficam montados (escondidos): o que está em digitação não se perde ao trocar de aba
  const painel = (id: AbaAtivo) => (abaAtual === id ? 'space-y-4' : 'hidden');
  const eventos = eventosDoAtivo(asset, nomeFornecedor);
  // Seção 9.3: Service Tag e IMEI ficam em "Dados do equipamento"; o resto das especificações com rótulos legíveis
  const serviceTag = asset.customFields?.[CHAVE.serviceTag] || '';
  const imei = asset.customFields?.[CHAVE.imei] ? aplicarMascara('imei', asset.customFields[CHAVE.imei]) : '';
  const especificacoes = resumoEspecificacoes(asset.customFields, settings.camposPersonalizados).filter(
    (i) => i.rotulo !== ROTULO_CHAVE[CHAVE.serviceTag] && i.rotulo !== ROTULO_CHAVE[CHAVE.imei]
  );
  const temEspecificacoes = asset.categoria === 'hardware' || especificacoes.length > 0;

  return (
    <>
      <Janela
        tamanho="ficha"
        icone={ICONE_CATEGORIA[asset.categoria] || <Package className="h-4 w-4" />}
        rotuloCaminho={`${asset.tag} · ${asset.nome}`}
        titulo={
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-mono text-blue-700">{asset.tag}</span>
            <span className="truncate">{asset.nome}</span>
            <span className={`selo ${situacao.selo} shrink-0`}>{situacao.rotulo}</span>
          </span>
        }
        subtitulo={
          <>
            {[asset.marca, asset.modelo].filter(Boolean).join(' ')}
            {' · '}
            <span className="capitalize">{asset.categoria}</span>
            {' · S/N '}
            <span className="font-mono">{asset.serialNumber}</span>
          </>
        }
        onFechar={onClose}
        acoes={
          <>
            {isTI && !descartado && (
              <button type="button" title="Editar" aria-label="Editar" onClick={() => setEditando(true)} className="btn btn-sm btn-secundario">
                <Pencil />
                <Rotulo texto="Editar" />
              </button>
            )}
            {isTI && !descartado && (
              <button
                type="button"
                title="Duplicar (cadastrar outro do mesmo lote)"
                aria-label="Duplicar"
                onClick={() => setDuplicando(true)}
                className="btn btn-sm btn-secundario"
              >
                <Copy />
                <Rotulo texto="Duplicar" />
              </button>
            )}
            {isTI && !descartado && (
              <button
                type="button"
                title="Transferir custódia"
                aria-label="Transferir custódia"
                onClick={abrirTransferencia}
                className="btn btn-sm btn-secundario"
              >
                <ArrowRightLeft />
                <Rotulo texto="Transferir custódia" />
              </button>
            )}
            {isTI && podeEnviarParaManutencao(asset) && (
              <button
                type="button"
                title={asset.status === 'manutencao' ? 'Registrar manutenção' : 'Enviar para manutenção'}
                aria-label={asset.status === 'manutencao' ? 'Registrar manutenção' : 'Enviar para manutenção'}
                onClick={() => setEnviandoManutencao(true)}
                className="btn btn-sm btn-secundario"
              >
                <Wrench aria-hidden="true" />
                <Rotulo texto={asset.status === 'manutencao' ? 'Registrar manutenção' : 'Enviar para manutenção'} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedAssetForQrCode(asset)}
              title="Gerar etiqueta física com QR Code"
              aria-label="Gerar etiqueta física com QR Code"
              className="btn btn-sm btn-secundario"
            >
              <QrCode />
              <Rotulo texto="Etiqueta QR" />
            </button>
            {currentRole === 'ti_admin' && !descartado && (
              <button type="button" title="Dar baixa" aria-label="Dar baixa" onClick={() => setDandoBaixa(true)} className="btn btn-sm btn-perigo">
                <Archive aria-hidden="true" />
                <Rotulo texto="Dar baixa" />
              </button>
            )}
          </>
        }
        faixa={<Abas<AbaAtivo> rotulo="Seções da ficha do equipamento" itens={abas} ativa={abaAtual} onMudar={setAba} />}
      >
        {/* ---------------- Resumo ---------------- */}
        <div role="tabpanel" aria-label="Resumo" className={painel('resumo')}>
          {isTI && baixa && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <span>
                Baixa patrimonial em {formatDate(baixa.dataBaixa)}: {ROTULO_MOTIVO_BAIXA[baixa.motivo]}.
              </span>
              <button type="button" onClick={() => setAba('custodia')} className="btn btn-sm btn-secundario">
                Ver baixa
                <ChevronRight />
              </button>
            </div>
          )}

          <section className="cartao space-y-3 p-4">
            <h3 className="secao-titulo">Dados do equipamento</h3>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Dado rotulo="Situação">
                <span className={`selo ${situacao.selo}`}>{situacao.rotulo}</span>
              </Dado>
              <Dado rotulo="Patrimônio">
                <span className="font-mono">{asset.tag}</span>
              </Dado>
              <Dado rotulo="Marca e modelo">{[asset.marca, asset.modelo].filter(Boolean).join(' ') || '—'}</Dado>
              <Dado rotulo="Número de série">
                <span className="font-mono break-all">{asset.serialNumber || '—'}</span>
              </Dado>
              {serviceTag && (
                <Dado rotulo="Service Tag / código expresso">
                  <span className="font-mono break-all">{serviceTag}</span>
                </Dado>
              )}
              {imei && (
                <Dado rotulo="IMEI">
                  <span className="font-mono break-all">{imei}</span>
                </Dado>
              )}
              <Dado rotulo="Com quem está">
                {currentCustodian ? pessoa(currentCustodian.id, currentCustodian.nome) : 'Em estoque'}
              </Dado>
              <Dado rotulo="Setor">{department?.nome || '—'}</Dado>
              <Dado rotulo="Localização">{asset.localizacaoFisica || '—'}</Dado>
              <Dado rotulo="Garantia">
                <span className={`selo ${seloGarantia}`}>{warranty.label}</span>
              </Dado>
              <Dado rotulo="Fornecedor">{nomeFornecedor || '—'}</Dado>
              <Dado rotulo="Categoria">
                <span className="capitalize">{asset.categoria}</span>
              </Dado>
            </dl>
          </section>

          {/* Especificações técnicas: SO/BitLocker (hardware) + atributos personalizados */}
          {temEspecificacoes && (
            <section className="cartao space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="secao-titulo">Especificações técnicas</h3>
                {asset.categoria === 'hardware' && isTI && !descartado && !isEditingSecurity && (
                  <button
                    type="button"
                    onClick={() => {
                      setTempSO(asset.sistemaOperacional || 'Windows 11 Pro 64-bit');
                      setTempBitlocker(asset.bitlockerKey || '');
                      setIsEditingSecurity(true);
                    }}
                    className="btn btn-sm btn-secundario"
                  >
                    <Pencil />
                    Editar SO / BitLocker
                  </button>
                )}
              </div>

              {asset.categoria === 'hardware' &&
                (isEditingSecurity ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label htmlFor={`so-${asset.id}`} className="rotulo">
                          Sistema operacional
                        </label>
                        <CampoSugestoes id={`so-${asset.id}`} value={tempSO} onChange={setTempSO} sugestoes={SISTEMAS_OPERACIONAIS} placeholder="Ex.: Windows 11 Pro 64-bit" />
                      </div>
                      <div>
                        <label htmlFor={`bitlocker-${asset.id}`} className="rotulo">
                          Chave de recuperação BitLocker (48 dígitos)
                        </label>
                        <input
                          id={`bitlocker-${asset.id}`}
                          type="text"
                          value={tempBitlocker}
                          onChange={(e) => setTempBitlocker(e.target.value)}
                          placeholder="Ex: 419204-183029-482019-582019-..."
                          className="campo font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setIsEditingSecurity(false)} className="btn btn-sm btn-secundario">
                        Cancelar
                      </button>
                      <button type="button" onClick={handleSaveSecurity} className="btn btn-sm btn-primario">
                        Salvar segurança
                      </button>
                    </div>
                  </div>
                ) : (
                  <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Dado rotulo="Sistema operacional" className="col-span-2">
                      {asset.sistemaOperacional || 'Windows 11 Pro 64-bit (Padrão Corporativo)'}{' '}
                      <span className="selo selo-info ml-1">Licenciado OEM/Volume</span>
                    </Dado>
                    <Dado rotulo="Chave de recuperação BitLocker" className="col-span-2">
                      {isTI ? (
                        asset.bitlockerKey ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono tracking-wider break-all select-all">{asset.bitlockerKey}</span>
                            <button type="button" onClick={handleCopyBitlocker} className="btn btn-sm btn-secundario">
                              {copiedBitlocker ? <Check /> : <Copy />}
                              {copiedBitlocker ? 'Chave copiada' : 'Copiar chave'}
                            </button>
                          </span>
                        ) : (
                          <span className="font-normal text-slate-500">Nenhuma chave de recuperação BitLocker registrada para este equipamento.</span>
                        )
                      ) : (
                        <span className="flex items-center gap-1.5 font-normal text-slate-500">
                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                          Chave confidencial de criptografia de disco (acesso restrito à equipe de TI).
                        </span>
                      )}
                    </Dado>
                  </dl>
                ))}

              {especificacoes.length > 0 && (
                <dl className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${asset.categoria === 'hardware' ? 'border-t border-slate-100 pt-3' : ''}`}>
                  {especificacoes.map((i, n) => (
                    <Dado key={`${n}-${i.rotulo}`} rotulo={i.rotulo}>
                      <span className="break-words">{i.valor}</span>
                    </Dado>
                  ))}
                </dl>
              )}
            </section>
          )}

          {asset.observacoes && (
            <section className="cartao space-y-2 p-4">
              <h3 className="secao-titulo">Observações</h3>
              <p className="text-xs break-words whitespace-pre-wrap text-slate-700">{asset.observacoes}</p>
            </section>
          )}
        </div>

        {/* ---------------- Custódia ---------------- */}
        <div role="tabpanel" aria-label="Custódia" className={painel('custodia')}>
          <section className="cartao space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="secao-titulo">Com quem está</h3>
              {isTI && !descartado && !showTransferModal && (
                <button type="button" onClick={() => setShowTransferModal(true)} className="btn btn-sm btn-secundario">
                  <ArrowRightLeft />
                  Transferir custódia
                </button>
              )}
            </div>
            {currentCustodian ? (
              <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Dado rotulo="Pessoa">{pessoa(currentCustodian.id, currentCustodian.nome)}</Dado>
                <Dado rotulo="Cargo">{currentCustodian.cargo || '—'}</Dado>
                <Dado rotulo="Setor">{department?.nome || '—'}</Dado>
                <Dado rotulo="Em posse desde">{formatDate(asset.dataEntregaAtual)}</Dado>
              </dl>
            ) : (
              <p className="text-xs text-slate-600">
                Nenhum colaborador alocado no momento. O item está no estoque e pronto para empréstimo.
              </p>
            )}

            {/* Transferência / devolução de custódia 1:1 */}
            {showTransferModal && (
              <form onSubmit={handleExecuteTransfer} className="space-y-3 border-t border-slate-100 pt-3">
                <h4 className="text-xs font-semibold text-slate-900">Transferência / devolução de custódia</h4>
                {textoProcesso && processoDoCustodiante && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <span>{textoProcesso}</span>
                    <button type="button" onClick={() => setSelectedTicketIdForDetail(processoDoCustodiante.id)} className="btn btn-sm btn-secundario">
                      Abrir o processo
                      <ChevronRight />
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label htmlFor={`destino-${asset.id}`} className="rotulo">
                      Novo destino do equipamento *
                    </label>
                    <select
                      id={`destino-${asset.id}`}
                      value={selectedNewUser}
                      onChange={(e) => setSelectedNewUser(e.target.value)}
                      required
                      className="campo"
                    >
                      <option value="">{currentCustodian ? 'Selecione um colaborador ou o estoque...' : 'Selecione um colaborador...'}</option>
                      {currentCustodian && <option value="estoque">Devolver para o estoque de T.I.</option>}
                      <optgroup label="Colaboradores ativos">
                        {employees
                          .filter((e) => e.status === 'ativo' && e.id !== asset.custodianteId)
                          .map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.nome} ({emp.cargo})
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </div>
                  {currentCustodian && (
                    <div>
                      <label htmlFor={`motivo-${asset.id}`} className="rotulo">
                        Motivo da devolução por {currentCustodian.nome} *
                      </label>
                      <input
                        id={`motivo-${asset.id}`}
                        type="text"
                        value={motivoDevolucao}
                        onChange={(e) => setMotivoDevolucao(e.target.value)}
                        placeholder="Ex.: substituição, upgrade ou desligamento..."
                        required
                        className="campo"
                      />
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowTransferModal(false)} className="btn btn-sm btn-secundario">
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-sm btn-primario">
                    Continuar
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="secao-titulo">Histórico de custódia ({asset.historicoCustodia.length})</h3>
            {asset.historicoCustodia.length === 0 ? (
              <Vazio>Nenhum histórico anterior registrado.</Vazio>
            ) : (
              <div className="cartao overflow-hidden">
                <table className="tabela tabela-cartoes">
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>Entrega</th>
                      <th>Devolução</th>
                      <th>Motivo</th>
                      <th className="text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asset.historicoCustodia.map((entry) => (
                      <tr key={entry.id}>
                        <td data-label="Pessoa">{pessoa(entry.colaboradorId, entry.colaboradorNome)}</td>
                        <td data-label="Entrega">{formatDate(entry.dataEntrega)}</td>
                        <td data-label="Devolução">
                          {entry.dataDevolucao ? formatDate(entry.dataDevolucao) : <span className="selo selo-info">Custódia ativa</span>}
                        </td>
                        <td data-label="Motivo" className="break-words">
                          {entry.motivoDevolucao || '—'}
                        </td>
                        <td data-label="Ações" className="text-right">
                          {entry.termoId && (
                            <span className="acoes-linha">
                              <button type="button" onClick={() => handleViewTerm(entry.termoId)} className="btn btn-sm btn-secundario">
                                <FileText />
                                Ver termo
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* ---------------- Garantia e contrato ---------------- */}
        <div role="tabpanel" aria-label="Garantia e contrato" className={painel('garantia')}>
          <section className="cartao space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="secao-titulo">Garantia</h3>
              {(warranty.status === 'expirando' || warranty.status === 'expirada') && !descartado && <LembreteGarantia asset={asset} />}
            </div>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Dado rotulo="Situação">
                <span className={`selo ${seloGarantia}`}>
                  {warranty.status === 'valida' ? <ShieldCheck aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
                  {warranty.label}
                </span>
              </Dado>
              <Dado rotulo="Garantia de fábrica até">{formatDate(asset.fiscal?.dataGarantia)}</Dado>
              <Dado rotulo="Cobertura efetiva até">{formatDate(warranty.fim)}</Dado>
              <Dado rotulo="Suporte do fabricante">{asset.fiscal?.suporteContato || '—'}</Dado>
            </dl>
          </section>

          <section className="space-y-2">
            <h3 className="secao-titulo">Contrato que cobre</h3>
            {contratosCobertura.length === 0 ? (
              <Vazio>Nenhum contrato vigente de suporte ou garantia estendida cobre este equipamento.</Vazio>
            ) : (
              contratosCobertura.map((c) => (
                <div key={c.id} className="cartao space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900">
                      <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                      Coberto pelo contrato {nomeContrato(c)} até {formatDate(c.fim)}
                    </p>
                    {isTI && (
                      <button type="button" onClick={() => setContratoAberto(c.id)} className="btn btn-sm btn-secundario">
                        Abrir contrato
                      </button>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Dado rotulo="Fornecedor">{fornecedores.find((f) => f.id === c.fornecedorId)?.nome || '—'}</Dado>
                    <Dado rotulo="Vigência">
                      {formatDate(c.inicio)} a {formatDate(c.fim)}
                    </Dado>
                    <Dado rotulo="SLA">{c.sla || '—'}</Dado>
                    <Dado rotulo="Contato de suporte">{c.contatoSuporte || '—'}</Dado>
                  </dl>
                </div>
              ))
            )}
          </section>
        </div>

        {/* ---------------- Manutenções (só a T.I.; o colaborador vê só o status) ---------------- */}
        {isTI && (
          <div role="tabpanel" aria-label="Manutenções" className={painel('manutencoes')}>
            <ManutencoesAtivo asset={asset} podeEditar={!descartado} />
          </div>
        )}

        {/* ---------------- Documentos ---------------- */}
        <div role="tabpanel" aria-label="Documentos" className={painel('documentos')}>
          <section className="cartao space-y-3 p-4">
            <h3 className="secao-titulo">Nota fiscal e compra</h3>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Dado rotulo="Nota fiscal (NF-e)">Nº {asset.fiscal?.numeroNF || 'S/N'}</Dado>
              <Dado rotulo="Valor de aquisição">
                <span className="font-mono">{formatCurrency(asset.fiscal?.valorCompra || 0)}</span>
              </Dado>
              <Dado rotulo="Fornecedor">{nomeFornecedor || '—'}</Dado>
              <Dado rotulo="Data de compra">{formatDate(asset.fiscal?.dataAquisicao)}</Dado>
            </dl>
            {asset.fiscal?.chaveAcesso44 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <dl className="min-w-0 flex-1">
                  <Dado rotulo="Chave de acesso NF-e (44 dígitos)">
                    <span className="font-mono tracking-tight break-all">{formatChaveNFe(asset.fiscal.chaveAcesso44)}</span>
                  </Dado>
                </dl>
                <button type="button" onClick={handleCopyKey} className="btn btn-sm btn-secundario shrink-0">
                  {copiedKey ? <Check /> : <Copy />}
                  {copiedKey ? 'Copiado' : 'Copiar chave'}
                </button>
              </div>
            )}
          </section>

          {/* Fase 11: valor atual e depreciação (só TI recebe os dados fiscais) */}
          {isTI && <DepreciacaoAtivo asset={asset} podeEditar={!descartado} />}
          {/* Seção 17 (decisão 11): comprado sem pedido e sem conta → lançar conta a pagar */}
          {isTI && !descartado && (
            <div className="flex justify-end">
              <BotaoContaDoAtivo ativo={asset} compacto />
            </div>
          )}

          {/* Fase 8: arquivos (só TI) */}
          {isTI && <AnexosAtivo asset={asset} podeEditar={!descartado} />}
        </div>

        {/* ---------------- Chamados ---------------- */}
        <div role="tabpanel" aria-label="Chamados" className={painel('chamados')}>
          {/* Fase 9: chamados ligados a este equipamento (cada perfil vê os que o banco libera) */}
          <ChamadosVinculados chamados={chamados} vazio="Nenhum chamado ligado a este equipamento." />
        </div>

        {/* ---------------- Histórico ---------------- */}
        <div role="tabpanel" aria-label="Histórico" className={painel('custodia')}>
          {/* Fase 8: baixa patrimonial vigente e estornadas (só TI) */}
          {isTI && <BaixaPatrimonial asset={asset} />}

          <section className="space-y-2">
            <h3 className="secao-titulo">Linha do tempo</h3>
            {eventos.length === 0 ? (
              <Vazio>Nenhum evento registrado.</Vazio>
            ) : (
              <ol className="cartao divide-y divide-slate-100">
                {eventos.map((ev) => (
                  <li key={ev.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-xs">
                    <span className="w-20 shrink-0 font-mono text-slate-500">{formatDate(ev.data)}</span>
                    <span className={`selo ${ev.selo} shrink-0`}>{ev.rotulo}</span>
                    <span className="min-w-0 flex-1 break-words text-slate-800">
                      {ev.texto}
                      {ev.detalhe && <span className="block text-slate-500">Motivo: {ev.detalhe}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </Janela>
      {/* Fora da janela da ficha: o fundo desfocado (backdrop-filter) prenderia a janela nova na
          rolagem da ficha, e no celular ela abriria fora da tela */}
      {editando && <NewAssetModal ativo={asset} onClose={() => setEditando(false)} />}
      {duplicando && <NewAssetModal duplicarDe={asset} onClose={() => setDuplicando(false)} />}
      {enviandoManutencao && isTI && podeEnviarParaManutencao(asset) && (
        <FormManutencao asset={asset} modo="abrir" chamadoInicial={manutencaoDoChamado} onClose={() => setEnviandoManutencao(false)} />
      )}
      {dandoBaixa && <FormBaixa asset={asset} onClose={() => setDandoBaixa(false)} />}
      {contratoAberto && <ContratoPorId id={contratoAberto} onClose={() => setContratoAberto(null)} />}
    </>
  );
};
