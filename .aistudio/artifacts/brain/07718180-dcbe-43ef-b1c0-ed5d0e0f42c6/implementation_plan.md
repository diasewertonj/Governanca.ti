# Sistema de Confirmações Críticas, Bloqueio de Perda de Dados, Reset de Fábrica e Sincronização Vercel/Firebase

Este plano estabelece a governança de ações sensíveis no **Nexus IT & HR**, eliminando qualquer salvamento automático acidental, inserindo alertas e modais elegantes de confirmação, fornecendo a funcionalidade de zerar dados de exemplo e detalhando a sincronização do banco Firestore e Google Auth na Vercel.

---

## Decisões Confirmadas com o Usuário

> [!IMPORTANT]
> As escolhas abaixo foram alinhadas diretamente nas perguntas de esclarecimento:

1. **Formato Visual das Confirmações:** Diálogo modal centralizado e elegante com visual corporativo limpo, ícone contextual de alerta (amarelo/vermelho), resumo do impacto da ação e botões explícitos **Cancelar** e **Confirmar**.
2. **Proteção Contra Perda de Dados em Formulários:** Bloquear fechamento ou cancelamento quando houver alterações pendentes, exibindo o modal *"Deseja descartar as alterações não salvas?"* com opções *"Continuar Editando"* e *"Descartar Alterações"*.
3. **Ações Críticas que Exigem Confirmação Obrigatória:**
   - Exclusão ou desvinculação de ativos e liberação de assentos de licenças/SaaS.
   - Conclusão definitiva de desligamento / checklist de Offboarding no RH.
   - Transferência de custódia patrimonial de equipamentos entre colaboradores.
   - Remoção de setores e exclusão de cadastros.
4. **Sem Salvamento Automático:** Todas as telas e modais devem exigir clique explícito em **"Salvar Alterações"** ou **"Cancelar"** (ex.: configurações da empresa, segurança BitLocker na ficha 360°, atribuições de perfil, etc.).
5. **Zerar Dados de Exemplo:** Recurso de "Reset de Fábrica" / "Zerar Base de Demonstração" nas Configurações, protegido por modal com digitação de confirmação (ex.: digitar `ZERAR` ou `LIMPAR`), permitindo ao administrador começar uma base limpa de produção na empresa.

---

## 1. Visão Geral e Conceito das Melhorias

```
┌────────────────────────────────────────────────────────────────────────┐
│                        NEXUS GOVERNANCE ENGINE                         │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │               MODAL CENTRAL DE CONFIRMAÇÃO                     │   │
│   ├────────────────────────────────────────────────────────────────┤   │
│   │  [!] Atenção: Ação Irreversível                                │   │
│   │                                                                │   │
│   │  Você está prestes a transferir a custódia do notebook         │   │
│   │  Dell Latitude (#PAT-1042) para Maria Souza.                   │   │
│   │  Um novo Termo de Responsabilidade será gerado.                │   │
│   │                                                                │   │
│   │  [ Cancelar ]                              [ Confirmar Ação ]  │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│   ┌───────────────────────────┐    ┌───────────────────────────────┐   │
│   │  Descarte de Formulário   │    │  Zerar Base de Exemplo        │   │
│   ├───────────────────────────┤    ├───────────────────────────────┤   │
│   │ "Existem dados não salvos.│    │ [Reset de Fábrica]            │   │
│   │  Deseja descartar?"       │    │ Digite 'ZERAR' para confirmar │   │
│   │ [Continuar] [Descartar]   │    │ [Cancelar] [Limpar Tudo]      │   │
│   └───────────────────────────┘    └───────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Experiência do Usuário & Componentes

### A. Componente Global: `ConfirmDialogModal`
- Um modal centralizado reutilizável com:
  - Título claro (ex.: *"Confirmar Transferência de Custódia"*, *"Liberar Assento de Licença"*, *"Concluir Desligamento Definitivo"*).
  - Nível de severidade visual:
    - **Perigo / Destrutivo (Vermelho):** exclusão, desligamento irreversível, zerar banco.
    - **Atenção / Mudança de Estado (Âmbar/Azul):** transferência patrimonial, liberação de assento, encerramento de chamado.
  - Mensagem explicativa contextual destacando o impacto.
  - Botão secundário neutro (`Cancelar`) e botão primário enfático (`Confirmar`, `Sim, Liberar`, `Sim, Excluir`).
  - Fechamento com tecla `Esc` ou clique fora aciona o cancelamento seguro.

### B. Componente: `UnsavedChangesModal`
- Disparado sempre que o usuário preenche ou edita um formulário (Ativo, Licença, Chamado, Colaborador, Configurações) e clica no botão `X` de fechar ou `Cancelar`:
  - Se o formulário estiver "dirty" (modificado), exibe:
    - *"Você tem alterações não salvas. Deseja realmente sair e descartar o que preencheu?"*
    - Botão `Continuar Editando` (retorna ao formulário).
    - Botão `Descartar Alterações` (fecha o modal e limpa os campos).

### C. Eliminação de Salvamento Automático (No Auto-Save)
- **Ficha 360° do Ativo (`Asset360Modal`):**
  - O bloco de Sistema Operacional e BitLocker passa a ter botões explícitos **"Salvar Alterações de Segurança"** e **"Cancelar Edição"**, em vez de mutações instantâneas.
- **Configurações Gerais (`SettingsView`):**
  - Alteração de papéis/roles de colaboradores na aba de Equipe recebe botão de confirmação e salvamento por colaborador.
- **Ficha 360° do Software (`Software360Modal`):**
  - Ajuste de assentos totais e liberação de assentos passam pelo diálogo de confirmação.

### D. Ferramenta "Zerar Dados de Exemplo" (Reset de Fábrica)
- Na aba de Configurações (`SettingsView` $\rightarrow$ submenu "Dados & Sistema"):
  - Card corporativo: **"Gerenciamento da Base de Dados & Modo de Produção"**.
  - Botão **"Zerar Dados de Exemplo (Iniciar Produção)"**:
    - Abre um modal de alta segurança.
    - O usuário deve digitar a palavra de segurança **`ZERAR`**.
    - Mantém apenas a empresa e o usuário administrador logado atual (ou estrutura limpa pré-configurada).
    - Remove todos os ativos mockados, licenças mockadas, chamados mockados, termos e colaboradores de teste.
  - Botão alternativo **"Restaurar Dados de Exemplo"** (para caso queira testar novamente a qualquer momento).

---

## 3. Guia de Integração: Vercel + GitHub + Firebase Firestore & Auth Google

> [!NOTE]
> Você enviou o projeto para o GitHub e Vercel. Abaixo está a arquitetura exata de como os dados e a autenticação Google operam no ambiente de produção Vercel:

### 1. Como Funciona a Autenticação Google no Firebase (Vercel)
1. No [Firebase Console](https://console.firebase.google.com/), acesse seu projeto `studio-3112068630-7fb36`:
   - Vá em **Authentication** $\rightarrow$ **Settings** $\rightarrow$ **Authorized domains** (Domínios Autorizados).
   - Clique em **Add domain** e adicione o domínio da sua Vercel:
     - Exemplo: `seu-projeto.vercel.app` (e seu domínio customizado, se houver).
   - *Sem isso, o Google Auth bloqueará o pop-up com o erro `auth/unauthorized-domain`.*
2. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Localize o OAuth 2.0 Client ID associado ao Firebase.
   - Em **Origens JavaScript autorizadas**, adicione a URL da Vercel (`https://seu-projeto.vercel.app`).

### 2. Sincronização do Banco Firestore (LocalStorage vs Nuvem)
- Atualmente, para garantir velocidade máxima no protótipo, o sistema salva os dados no `localStorage` do navegador e inicializa o cliente Firestore em `src/services/firebase.ts`.
- Vamos implementar no `AppContext` um **sincronizador bidirecional com Firestore**:
  - Salva e carrega coleções em tempo real (`assets`, `employees`, `licenses`, `tickets`, `terms`, `companySettings`) no Firestore se houver conexão online.
  - Mantém fallback automático no `localStorage` offline para resiliência.
- As variáveis de ambiente do Firebase podem ser configuradas no painel da Vercel (`Settings` $\rightarrow$ `Environment Variables`) utilizando o `firebase-applet-config.json` já existente.

---

## 4. Plano de Implementação Passo a Passo

1. **Criação do `ConfirmDialogModal.tsx`**:
   - Componente flexível e acessível de diálogo de confirmação (perigo, aviso, neutro).
2. **Criação do Hook / Helper de Proteção de Formulários (`useUnsavedChanges` ou modal inline)**:
   - Gerenciamento de estado `isDirty` nos modais principais (`NewAssetModal`, `SoftwareFormModal`, `NewTicketModal`, etc.).
3. **Revisão e Aplicação de Confirmações nas Ações Críticas**:
   - `Software360Modal`: confirmação ao liberar assento de um colaborador.
   - `Asset360Modal`: confirmação ao transferir equipamento de custódia e salvar BitLocker.
   - `TicketDetailModal`: confirmação ao encerrar chamado ou checklist de offboarding.
   - `SettingsView`: confirmação ao excluir setor ou campo personalizado.
4. **Criação da Ferramenta "Zerar Dados de Exemplo"**:
   - Adicionar função `resetToEmptyState()` e `restoreDemoState()` em `AppContext.tsx`.
   - Adicionar painel de Gestão da Base em `SettingsView.tsx` com verificação por digitação `ZERAR`.
5. **Aprimoramento da Sincronização com Firestore**:
   - Garantir que as operações leiam e gravem tanto no Firestore quando online quanto no `localStorage`.
   - Adicionar banner informativo discreto nas Configurações com o status de sincronização e o checklist de configuração para Vercel.
6. **Verificação & Compilação**:
   - Executar `compile_applet` e `lint_applet` juntos.
   - Reiniciar dev server e verificar ausência de bugs visuais ou quebras de fluxo.
