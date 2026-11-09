# Gestão Aprimorada de Ativos, Softwares/SaaS, Assentos, BitLocker e Sistema Operacional

Plano arquitetural e de interface revisado para implementar a gestão completa do ciclo de vida de Softwares/SaaS (assentos, alocação e liberação em modal 360°), campos essenciais de segurança e SO para Hardware (**BitLocker** com cópia segura e **Sistema Operacional** simples), personalização dinâmica por categoria e vínculo de softwares na abertura de chamados técnicos.

---

## Decisões Confirmadas e Atualizações Solicitadas

> [!IMPORTANT]
> As preferências abaixo governam a implementação:

- **BitLocker & Sistema Operacional (Hardware)**: 
  - Campo de **Sistema Operacional** simples (ex.: *Windows 11 Pro*, *Windows 10 Pro*, *macOS Sonoma*, *macOS Sequoia*, *Ubuntu Linux*).
  - Campo de **Chave de Recuperação BitLocker** (numérica/alfanumérica, até 48 dígitos), com botão protegido de copiar chave e indicador de criptografia de disco ativa na ficha 360° do equipamento.
- **Gestão de Assentos de Licenças & SaaS**: Modal 360° dedicado para cada Software/SaaS com painel de métricas contratuais e botões interativos para **Alocar** (adicionar colaborador) e **Liberar Assento** (revogar acesso), além de ajuste fácil da quantidade de assentos contratados.
- **Campos Personalizados por Categoria**: Seção dinâmica renderizada no formulário de cadastro/edição e na ficha 360° do ativo, adaptada automaticamente conforme a categoria (`hardware`, `periferico`, `telefonia`, `software`).
- **Abertura de Chamados Vinculada a Softwares**: Opção integrada de seleção de softwares/licenças no modal de abertura de chamados técnicos (`NewTicketModal`), permitindo relacionar o chamado ao software utilizado.

---

## 1. Visão Geral e Conceito do Produto

O Nexus IT & HR expande o controle de ativos corporativos para abranger governança de segurança física/lógica e gestão contratual de softwares:

1. **Segurança de Endpoint (Hardware)**: Registro da chave de recuperação **BitLocker** e do **Sistema Operacional** instalado na máquina física, agilizando chamados de bloqueio de TPM ou reinstalação sem perda de dados.
2. **Controle de Assentos Contratados vs. Alocados**: Evitar estouro de orçamento por licenças ociosas ou falta de assentos para novas admissões.
3. **Modal 360° do Software**: Permitir aos gestores de T.I. visualizar quem usa cada licença, liberar assentos com 1 clique (devolvendo ao saldo livre) e incluir colaboradores ativos via seleção dinâmica.
4. **Cadastro e Edição Completa de Softwares**: Modal dedicado de criação e edição de softwares (`SoftwareModal`) com quantidade de assentos, vigência, URL de console admin, chave de contrato e valor financeiro.
5. **Campos Customizados por Categoria**: O formulário se ajusta reativamente à categoria selecionada, exibindo campos específicos (especificações para PC, conexões para periféricos, IMEI/Linha para telefonia).
6. **Chamados de Suporte com Vínculo a Softwares**: O colaborador ou técnico poderá abrir chamados técnicos reportando falhas em um software corporativo específico (ex.: Google Workspace, Slack, Figma), garantindo rastreabilidade no Service Desk.

---

## 2. Experiência do Usuário & Design Visual

### A. Novos Campos de Hardware: BitLocker & Sistema Operacional
- **No Cadastro/Edição de Hardware (`NewAssetModal`)**:
  - **Sistema Operacional**: Dropdown com opções padronizadas (*Windows 11 Pro*, *Windows 10 Pro*, *macOS Sequoia*, *macOS Sonoma*, *Ubuntu LTS*, *Outro*).
  - **Chave de Recuperação BitLocker**: Campo monoespaçado com máscara e placeholder para a chave de recuperação do disco.
- **Na Ficha 360° do Equipamento (`Asset360Modal`)**:
  - Card dedicado de **"Segurança de Endpoint & Sistema Operacional"**:
    - Sistema Operacional exibido com selo limpo.
    - Chave BitLocker mascarada com botão seguro **"Copiar Chave BitLocker"** (estilo chave NF-e de 44 dígitos, com confirmação visual).

### B. Gestão de Softwares & Licenças (Aba "Licenças / SaaS")
- **Novo Botão no Topo**: `"Cadastrar Nova Assinatura / SaaS"` ao lado dos filtros.
- **Card do Software com Métricas Aprimoradas**:
  - Nome, fornecedor, valor mensal/anual e contrato.
  - Indicador de capacidade: `X / Y assentos alocados (Z% ocupação)`.
  - Botão proeminente `"Gerenciar Assentos & Ficha 360°"`.
  - Botão de edição de parâmetros da licença.

### C. Modal 360° do Software (`Software360Modal`)
- **Cabeçalho**: Tag de contrato, fornecedor, valor mensal e link direto para o console de administração web.
- **Barra de Ocupação de Assentos**: Visualização clara com aviso de assentos disponíveis restantes.
- **Painel de Atribuição Rápida de Assento**:
  - Dropdown com busca de colaboradores ativos que ainda não possuem a licença.
  - Botão `"+ Alocar Assento"`, com feedback instantâneo e atualização da capacidade.
- **Tabela de Colaboradores Ativos com a Licença**:
  - Avatar, Nome, Cargo, Setor, E-mail.
  - Botão de ação `"Liberar Assento"`, que remove o colaborador da lista e devolve o assento ao saldo disponível.
- **Ajuste de Assentos Totais**: Opção rápida para expandir ou contrair o volume total de assentos contratados.

### D. Seção Dinâmica de Campos Personalizados no Cadastro / Edição
- Conforme a categoria muda (`hardware` $\rightarrow$ `periferico` $\rightarrow$ `telefonia` $\rightarrow$ `software`):
  - A seção **"Especificações Técnicas da Categoria"** renderiza dinamicamente os atributos da categoria correspondente.

### E. Seleção de Software no Modal de Novo Chamado (`NewTicketModal`)
- No campo **"Objeto do Chamado"**, além dos equipamentos físicos sob custódia, haverá a opção:
  - `Softwares e Sistemas Corporativos (SaaS)`: lista de softwares corporativos cadastrados.
- O chamado é gravado com o vínculo do software, exibindo o ícone e nome do software na fila do Service Desk e no modal de detalhes do chamado com link direto para sua ficha 360°.

---

## 3. Decisões Técnicas e Arquitetura

```
┌────────────────────────────────────────────────────────────────────────┐
│                          NEXUS IT & HR CONSOLE                         │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │   Hardware 360° Modal   │  │       Software 360° Modal           │  │
│  ├─────────────────────────┤  ├─────────────────────────────────────┤  │
│  │ • SO: Windows 11 Pro    │  │ • Assentos: 18/25 (72% em uso)      │  │
│  │ • BitLocker: 48 dígitos │  │ • [+] Alocar Colaborador            │  │
│  │   [Copiar Chave]        │  │ • Lista de Colaboradores:           │  │
│  │ • Especificações:       │  │   - João Silva  [Liberar Assento]   │  │
│  │   RAM, SSD, Processador │  │   - Maria Souza [Liberar Assento]   │  │
│  └─────────────────────────┘  └─────────────────────────────────────┘  │
│                                                  ▲                     │
│                                                  │                     │
│  ┌─────────────────────────┐                     │                     │
│  │   NewTicketModal        │─────────────────────┘                     │
│  ├─────────────────────────┤                                           │
│  │ Objeto do Chamado:      │ (Vínculo contextual para chamado técnico  │
│  │ [Hardware] ou [SaaS]    │  de software ou hardware)                 │
│  └─────────────────────────┘                                           │
└────────────────────────────────────────────────────────────────────────┘
```

### Entidades e Extensões de Tipos (`src/types/index.ts`):
1. **`Asset`**:
   - `sistemaOperacional?: string;`
   - `bitlockerKey?: string;`
   - `customFields?: Record<string, string>;`

2. **`SoftwareLicense`**:
   - `id: string`
   - `nome: string`
   - `fornecedor: string`
   - `chaveContrato: string`
   - `assentosTotais: number` (editável)
   - `assentosAlocados: number` (calculado dinamicamente a partir de `colaboradoresIds.length`)
   - `colaboradoresIds: string[]`
   - `valorMensal: number`
   - `dataRenovacao: string`
   - `urlPainel?: string`
   - `tipoCobranca?: 'mensal' | 'anual'`
   - `observacoes?: string`

3. **`Ticket`**:
   - `softwareId?: string`
   - `softwareNome?: string`

4. **`AppContextType`**:
   - `addLicense: (license: Omit<SoftwareLicense, 'id' | 'assentosAlocados'>) => SoftwareLicense`
   - `updateLicense: (id: string, updates: Partial<SoftwareLicense>) => void`
   - `deleteLicense: (id: string) => void`
   - `allocateLicense: (licenseId: string, employeeId: string) => void`
   - `revokeLicense: (licenseId: string, employeeId: string) => void`
   - `selectedSoftwareIdFor360: string | null`
   - `setSelectedSoftwareIdFor360: (id: string | null) => void`

---

## 4. Plano de Execução Passo a Passo

1. **Atualização de Tipos & Estado Global (`src/types/index.ts` e `src/context/AppContext.tsx`)**:
   - Adicionar `sistemaOperacional` e `bitlockerKey` em `Asset`.
   - Adicionar `addLicense`, `updateLicense`, `deleteLicense`, `selectedSoftwareIdFor360` no contexto.
   - Suporte a `softwareId` nos tickets de suporte.

2. **Campos BitLocker e Sistema Operacional (`NewAssetModal.tsx` e `Asset360Modal.tsx`)**:
   - Formulário com seleção de Sistema Operacional e input de chave BitLocker para categoria `hardware`.
   - Card seguro em `Asset360Modal` com botão de cópia de chave BitLocker e status de criptografia.

3. **Criação do Modal 360° do Software (`src/components/assets/Software360Modal.tsx`)**:
   - Visualização 360° com links relacionais para os colaboradores alocados.
   - Ações imediatas de alocação de novos colaboradores e liberação de assentos.
   - Ajuste rápido de quantidade de assentos contratados.

4. **Criação do Modal de Cadastro/Edição de Licença SaaS (`src/components/assets/SoftwareFormModal.tsx`)**:
   - Formulário com nome, fornecedor, quantidade total de assentos, valor mensal, chave de contrato, data de renovação e URL de admin.

5. **Aprimoramento dos Campos Dinâmicos por Categoria (`NewAssetModal.tsx`)**:
   - Renderização reativa de acordo com a categoria selecionada (`hardware`, `periferico`, `telefonia`, `software`).

6. **Integração de Softwares na Abertura de Chamados (`src/components/servicedesk/NewTicketModal.tsx`)**:
   - Adição de grupo de Softwares/SaaS no dropdown de objeto do chamado.
   - Exibição contextual na lista de chamados e no `TicketDetailModal` com link direto para a ficha do software.

7. **Validação e Compilação**:
   - Execução de `compile_applet` e `lint_applet` para assegurar 0 erros de tipagem e integridade funcional.
