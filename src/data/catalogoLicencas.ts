// =============================================================================
// Seção 28 · Catálogo de modelos de licença (Microsoft e Google). Só sugestão para
// preencher o cadastro — sem preço (muda e varia por revenda) e sem assentos (são de
// cada empresa). Tudo continua editável. Na Fase 13 (multiempresa) vira um catálogo
// mantido pela plataforma para todos os clientes.
// =============================================================================
import type { CategoriaDespesa } from '../types/index.ts';

export interface ModeloLicenca {
  id: string;
  fabricante: 'Microsoft' | 'Google';
  grupo: string;
  nome: string;
  categoria: CategoriaDespesa;
  /** Como costuma ser contratado; a empresa ajusta */
  cobranca: 'mensal' | 'anual';
  descricao: string;
}

const ms = (id: string, grupo: string, nome: string, descricao: string, categoria: CategoriaDespesa = 'software'): ModeloLicenca => ({
  id: `ms-${id}`,
  fabricante: 'Microsoft',
  grupo,
  nome,
  categoria,
  cobranca: 'mensal',
  descricao,
});
const gw = (id: string, nome: string, descricao: string): ModeloLicenca => ({
  id: `gw-${id}`,
  fabricante: 'Google',
  grupo: 'Google Workspace',
  nome,
  categoria: 'software',
  cobranca: 'mensal',
  descricao,
});

export const CATALOGO_LICENCAS: ModeloLicenca[] = [
  // Microsoft 365 para empresas (até 300 usuários)
  ms('m365-basic', 'Microsoft 365 (empresas)', 'Microsoft 365 Business Basic', 'E-mail, Teams, OneDrive e Office na web e no celular'),
  ms('m365-standard', 'Microsoft 365 (empresas)', 'Microsoft 365 Business Standard', 'Basic + Office instalado no computador'),
  ms('m365-premium', 'Microsoft 365 (empresas)', 'Microsoft 365 Business Premium', 'Standard + segurança avançada e gestão de dispositivos (Intune)'),
  ms('m365-apps', 'Microsoft 365 (empresas)', 'Microsoft 365 Apps for business', 'Só o Office instalado e OneDrive, sem e-mail'),
  // Microsoft 365 corporativo
  ms('m365-e3', 'Microsoft 365 (corporativo)', 'Microsoft 365 E3', 'Office, e-mail e segurança corporativa'),
  ms('m365-e5', 'Microsoft 365 (corporativo)', 'Microsoft 365 E5', 'E3 + segurança, conformidade e análise avançadas'),
  ms('m365-f3', 'Microsoft 365 (corporativo)', 'Microsoft 365 F3', 'Linha de frente: apps na web e no celular'),
  ms('o365-e1', 'Office 365', 'Office 365 E1', 'E-mail, Teams e Office na web'),
  ms('o365-e3', 'Office 365', 'Office 365 E3', 'E1 + Office instalado'),
  // Avulsos
  ms('exchange-p1', 'Microsoft (avulsos)', 'Exchange Online (Plano 1)', 'Só e-mail, caixa de 50 GB'),
  ms('exchange-p2', 'Microsoft (avulsos)', 'Exchange Online (Plano 2)', 'Só e-mail, caixa de 100 GB e arquivamento'),
  ms('teams-essentials', 'Microsoft (avulsos)', 'Microsoft Teams Essentials', 'Só Teams (reuniões e chat)'),
  ms('copilot', 'Microsoft (avulsos)', 'Microsoft 365 Copilot', 'Assistente de IA no Office e no Teams', 'ia'),
  ms('powerbi-pro', 'Microsoft (avulsos)', 'Power BI Pro', 'Relatórios e painéis compartilhados'),
  ms('visio-p2', 'Microsoft (avulsos)', 'Visio Plano 2', 'Diagramas e fluxogramas'),
  ms('project-p3', 'Microsoft (avulsos)', 'Project Plano 3', 'Gestão de projetos'),
  // Google Workspace
  gw('business-starter', 'Google Workspace Business Starter', 'Gmail com domínio, Meet e 30 GB por usuário'),
  gw('business-standard', 'Google Workspace Business Standard', 'Starter + 2 TB, gravação no Meet'),
  gw('business-plus', 'Google Workspace Business Plus', 'Standard + 5 TB, Vault e segurança avançada'),
  gw('enterprise-standard', 'Google Workspace Enterprise Standard', 'Corporativo: armazenamento e segurança ampliados'),
  gw('enterprise-plus', 'Google Workspace Enterprise Plus', 'Enterprise Standard + conformidade e análise avançadas'),
  gw('essentials-starter', 'Google Workspace Essentials Starter', 'Drive, Meet e Docs sem Gmail (gratuito)'),
];
