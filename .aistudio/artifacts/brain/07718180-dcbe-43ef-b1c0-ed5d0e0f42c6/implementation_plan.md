# Auditoria de Permissões (RBAC Estrito), Desacoplamento Firebase e Preparação Completa para Supabase

Este plano define a arquitetura de segurança e banco de dados para eliminar vazamentos de dados entre perfis, implementar controle de acesso rigoroso por função (`currentRole`), remover completamente qualquer dependência do Firebase/Firestore e preparar a integração nativa com o **Supabase** (PostgreSQL com Row Level Security).

---

## 1. Auditoria Completa de Segurança e Falhas Encontradas ("Travas Frouxas")

Durante a auditoria profunda da árvore de componentes, foram identificadas as seguintes vulnerabilidades de isolamento entre perfis:

### Falhas Detectadas:
1. **Vazamento na Ficha 360° do Ativo (`Asset360Modal`):**
   - **Problema:** Um colaborador comum que abre os detalhes do seu próprio notebook vê a lista de custodiantes anteriores e consegue **clicar no nome do colaborador anterior**, abrindo o `Employee360Modal` com dados institucionais, cargo, e-mail e histórico de terceiros.
   - **Correção:** Quando `currentRole === 'colaborador'`, desativar completamente cliques em outros usuários. Exibir apenas o nome como texto estático (sem link relacional) ou ocultar dados sensíveis de terceiros. Além disso, a aba de "Mudar Custódia" já foi restringida, mas o botão e campos fiscais/BitLocker não devem ser editáveis nem visíveis para o colaborador comum.
2. **Vazamento no `Employee360Modal`:**
   - **Problema:** O modal de ficha 360° do colaborador não verifica se quem está abrindo é ele mesmo ou um administrador. Se um colaborador comum recebesse ou descobrisse o ID de outro colega, o modal abria com histórico completo.
   - **Correção:** Adicionar trava rígida: Colaboradores comuns só podem abrir a própria ficha (`employeeId === currentUser.id`). Se tentar abrir o perfil de outro colaborador, o sistema bloqueia e exibe aviso de permissão negada.
3. **Vazamento no `TicketDetailModal`:**
   - **Problema:** Ao abrir um chamado, o link do solicitante no card lateral chamava `setSelectedEmployeeIdFor360(ticket.solicitanteId)`. Se o colaborador clicasse, ele acessava o perfil do solicitante caso o chamado não fosse dele.
   - **Correção:** Link clicável de solicitante habilitado apenas para administradores de T.I. e RH. Para colaboradores, é exibido apenas texto não clicável.
4. **Vazamento no Seletor de Perfis do Cabeçalho (`Header`):**
   - **Problema:** O menu do cabeçalho listava todos os colaboradores da empresa no dropdown para alternância livre de usuário sem restrição.
   - **Correção:** A alternância rápida de perfil deve ser restrita apenas a usuários com perfil `ti_admin` (modo simulação/teste) ou em tela de login. Colaboradores comuns não podem alternar para a identidade de outros usuários.
5. **Travamento de Rotas no `App.tsx`:**
   - **Problema:** Se o estado `currentView` for manipulado para `'collaborators'`, `'settings'` ou `'assets'`, a renderização no `main` não checava permissão.
   - **Correção:** Implementar uma camada de guarda de rotas (`RoleGuard`) que valida se a tela requer `ti_admin`, `ti_suporte`, `rh` ou `colaborador`, redirecionando imediatamente para a área permitida.

---

## 2. Eliminação do Firebase / Firestore & Preparação Nativa para Supabase

Conforme sua decisão expressa (*"somente supabase, retire tudo do firestore ou firebase"*), faremos o seguinte:

### A. Remoção Completa do Firebase
1. Remover arquivos e configurações do Firebase:
   - `firebase-applet-config.json`
   - `firebase-blueprint.json`
   - `firestore.rules`
   - Remoção do SDK `firebase` e imports em `src/services/firebase.ts`.
2. Criar a nova camada de serviço em `src/services/supabase.ts` usando o cliente oficial `@supabase/supabase-js`.

### B. Arquitetura do Supabase (`src/services/supabase.ts`)
- Variáveis de ambiente padronizadas no `.env.example`:
  ```env
  VITE_SUPABASE_URL="https://seu-projeto.supabase.co"
  VITE_SUPABASE_ANON_KEY="sua-chave-anon-publica"
  ```
- O cliente Supabase gerencia:
  - Autenticação nativa (Email/Password ou OAuth Google via Supabase).
  - Persistência das tabelas relacionais com Row Level Security (RLS).
  - Fallback offline inteligente para continuar funcionando perfeitamente mesmo antes de você inserir as chaves de produção.

### C. Script SQL DDL de Produção para Supabase
Forneceremos um script SQL pronto para você executar no **SQL Editor do Supabase** em 1 clique, criando as tabelas com integridade referencial e políticas RLS:
- `departamentos`
- `colaboradores`
- `ativos`
- `historico_custodia`
- `licencas_software`
- `chamados`
- `chamado_mensagens`
- `termos_responsabilidade`
- `configuracoes_empresa`

---

## 3. Matriz de Permissões Rígida (RBAC Matrix)

```
┌─────────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│ Funcionalidade / Tela   │ ti_admin     │ ti_suporte   │ rh           │ colaborador  │
├─────────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Dashboard Geral         │ Total        │ Total        │ Limitado     │ Bloqueado    │
│ Ativos & Estoque TI     │ Total        │ Total        │ Consulta     │ Bloqueado    │
│ Ficha 360° do Ativo     │ Total + BitL │ Total + BitL │ Leitura Bás. │ Apenas Posse │
│ Licenças / SaaS         │ Total        │ Total        │ Consulta     │ Bloqueado    │
│ Colaboradores (Lista)   │ Total        │ Consulta     │ Total        │ Bloqueado    │
│ Ficha 360° Colaborador  │ Total        │ Leitura      │ Total        │ Apenas Próp. │
│ Service Desk Unificado  │ Total        │ Total        │ Apenas RH    │ Bloqueado    │
│ Notas Internas TI       │ Sim          │ Sim          │ Não          │ Não          │
│ On/Offboarding (RH)     │ Atendimento  │ Atendimento  │ Solicitação  │ Bloqueado    │
│ Termos de Resp. A4      │ Emissão/Ass. │ Emissão/Ass. │ Consulta     │ Apenas Seus  │
│ Configurações / Reset   │ Total        │ Bloqueado    │ Bloqueado    │ Bloqueado    │
└─────────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

---

## 4. Guia Passo a Passo: Configuração do Supabase & Chaves

Ao final da implementação, você receberá:
1. Onde pegar sua `SUPABASE_URL` e `SUPABASE_ANON_KEY` no painel do Supabase (`Project Settings` $\rightarrow$ `API`).
2. Como ativar o Google OAuth no Supabase em 3 passos (`Authentication` $\rightarrow$ `Providers` $\rightarrow$ `Google`).
3. O script SQL executável para rodar no editor do Supabase.

---

## 5. Plano de Execução

1. **Instalação do Pacote `@supabase/supabase-js`** e desinstalação de dependências do Firebase.
2. **Criação do Módulo de Serviço Supabase (`src/services/supabase.ts`)**:
   - Inicialização do cliente com validação de chaves.
   - Métodos de sincronização e autenticação.
3. **Refatoração do `AppContext.tsx`**:
   - Remover todo o código Firebase.
   - Integrar persistência Supabase com sincronização automática e fallback em `localStorage`.
   - Adicionar trava de auditoria nas funções de modificação de estado.
4. **Blindagem dos Componentes de Visualização**:
   - `Asset360Modal.tsx`: Colaborador não clica em usuários anteriores; BitLocker e dados fiscais protegidos.
   - `Employee360Modal.tsx`: Verificação estrita de autorização (colaborador só abre a própria ficha).
   - `TicketDetailModal.tsx`: Links de colaborador desabilitados para solicitantes comuns.
   - `App.tsx`: Middleware de verificação de rotas por `currentRole`.
   - `Header.tsx`: Alternador de usuários restrito ao administrador de TI.
5. **Criação do Script SQL para Supabase**:
   - Arquivo `supabase-schema.sql` com todas as tabelas e políticas RLS.
6. **Verificação & Compilação**:
   - Execução de `compile_applet` e `lint_applet` para assegurar 0 erros.
