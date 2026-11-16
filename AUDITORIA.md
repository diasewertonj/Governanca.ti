# Auditoria — Nexus IT & HR (repo `diasewertonj/Governanca.ti`)

Data: 2026-11-11 · Commit auditado: `fd54204` (HEAD de `main`, 7 commits)
Modo: **somente leitura**. Nada foi commitado, nenhuma migration foi executada e o banco de produção não foi acessado. Comandos rodados localmente num clone: `npm install` (sem lockfile), `tsc --noEmit`, `vite build`. Este arquivo existe só no clone local, sem commit.

Legenda de evidência: **[C]** = confirmado lendo o código/SQL (arquivo:linha). **[S]** = suspeita ou depende de algo que não consegui ver (configuração do painel Supabase/Vercel, estado real do banco).

> ⚠️ **Não commitar este arquivo.** O repositório no GitHub é **público**, e este relatório descreve falhas que ainda estão abertas. Ele fica só na pasta local.

---

## Status do projeto (atualizado em 2026-11-13)

### Onde estamos
| Fase | Situação |
|---|---|
| Auditoria | ✅ Concluída (este relatório) |
| Diagnóstico de produção | ✅ Feito pelo conector do Supabase, somente leitura. Achou um problema **pior** que o CRIT-01: as policies valiam também para `anon`, ou seja, acesso total **sem login** |
| Fase 0 · Contenção | ✅ **Banco: aplicada em produção** (2 migrations). 🟡 Interface: branch `security/fase0-contencao`, PR **não aberto** |
| Fase 1 · Segurança real | ✅ **Em produção** (banco + site; PR #1 mesclado, `main` em `57a3d60`, deploy Vercel concluído) |
| Fase 2 · Integridade de dados | ✅ **Em produção** (banco + site). Teste com login real conferido no banco: `#CH-2026-0001` urgente → aguardando peça, troca de papel do RH persistida, zero erros 4xx/5xx nos logs. ⏳ Ativos/custódia/BitLocker ainda não exercitados com login real |
| Fase 3 · Processos completos | ✅ **Em produção** (migration conferida no banco; PR #2 mesclado, `main` em `7ebccfc`, deploy Vercel concluído). 75/75 cenários de banco. Teste com login real conferido no banco: anexo e termo assinado no bucket privado (só caminho no banco), custódia entrega→devolução, BitLocker só na tabela restrita, offboarding concluído, anonimização no cadastro/termo/histórico, zero erros nos logs |
| Fase 4 · Qualidade | ✅ **Em produção** (PR #3, `main` em `84fd786`, CI verde, deploy concluído). Não mexe no banco. Tipos do banco real, TypeScript strict, ESLint, 18 testes unitários + 75 de banco versionados, CI no GitHub Actions, 0 vulnerabilidades, bundle inicial 758 → 523 KB |
| Fase 5 · Usabilidade (Salvar/Cancelar) | ✅ **Em produção** (PR #4, `main` em `356b370`, deploy concluído). Não mexe no banco. Nenhuma edição grava sozinha: chamado (status, técnico, checklist), papéis, setores e dados da empresa com barra Salvar/Cancelar; confirmação em exclusões e liberação de assento; anexos só sobem ao enviar; aviso ao sair com pendências |
| Fase 6 · Processos guiados (on/offboarding) | ✅ **Em produção** (migration aplicada no SQL Editor e conferida; Edge Function `criar-acesso-nexus` v1 publicada com verify_jwt; PR #5 mesclado, `main` em `e3c00ab`, CI verde, deploy Vercel concluído). ⏳ Teste com login real pendente; conector Supabase ainda em modo escrita até o teste. 98/98 cenários de banco, 32 testes unitários, fluxo completo testado no navegador (modo demonstração). Catálogo, checklist com trilha de auditoria, inventário de contas/grupos/acessórios, lembretes, login com senha provisória, termo RG.TI.001/002 com aceite eletrônico. Proposta de versão 03 do termo para a Qualidade em `../Proposta-Qualidade-Termos-TI-v03.md` |
| Fase 7 · Navegação, visual e celular | ✅ **Em produção** (migration do logo aplicada e conferida; PR #6 mesclado, `main` em `761aa85`, CI verde, deploy Vercel concluído; ajuste "sem rolagem lateral" no PR #7, `main` em `e38df31`). Menus por perfil com glossário único, Início do RH, Configurações em 7 abas, logo da empresa, gaveta no celular, modais em tela cheia, fila em cartões, texto ≥ 12px e contraste AA, foco visível, senha provisória na ficha, bundle 556 → 109 KB. |

### Aplicado em produção (projeto `Governanca-ti`)
| Migration | O que fez | Conferência |
|---|---|---|
| `fase0_fechar_acesso_anon` | 17 policies passaram de `public` para `authenticated` (só a leitura de `configuracoes_empresa` ficou pública); `anon` perdeu INSERT/UPDATE/DELETE | Teste no banco real: anônimo vê 0 colaboradores e não grava nada; a tela de login lê a configuração |
| `fase0_guard_colaborador_role` | Trigger: só `ti_admin` ativo cria ou altera papéis; anônimo nunca define papel | Teste no banco real (transação desfeita): não-admin e anônimo bloqueados, admin permitido |

### Status de cada achado
Legenda: ✅ corrigido em produção · 🟡 corrigido no código/migration, falta aplicar ou fazer merge · ⏳ aberto

| Achado | Status | Onde |
|---|---|---|
| CRIT-01 RLS aberta | ✅ sem login (Fase 0) · 🟡 por papel para logados | Fase 1: `20261112000100_fase1_rls_por_papel.sql` |
| CRIT-02 login promove a `ti_admin` | ✅ banco bloqueia (trigger) · 🟡 front não cria nem promove | Fase 1: `AppContext.tsx` |
| CRIT-03 enums `urgente`/`aguardando_peca` | 🟡 front usa `critica`/`aguardando_terceiro` (valores do banco); rótulos seguem "Urgente"/"Aguardando peça". Não exige mudança no banco | Fase 2 |
| CRIT-04 escritas sem checar erro | 🟡 toda gravação checa o erro; a tela desfaz a mudança e mostra um aviso; UPDATE confirma 1 linha afetada | Fase 2 |
| ALTO-01 segredos expostos e no `localStorage` | 🟡 BitLocker e chave de contrato em tabelas só da TI; nada no `localStorage` em produção | Fase 1 |
| ALTO-02 sessão expirada mantém a UI | 🟡 login derivado da sessão; `SIGNED_OUT` limpa tudo | Fase 1 |
| ALTO-03 `ti_suporte` em Configurações / zerar banco | 🟡 UI (Fase 0) + RLS: setores/config só `ti_admin`, exclusões só `ti_admin` | Fases 0 e 1 |
| ALTO-04 last-write-wins | 🟡 UPDATE só dos campos alterados; alocação de licença por RPC atômica | Fase 2 |
| ALTO-05 IDs/códigos colidem | 🟡 UUID no cliente; `#CH-`/`#TR-` por sequence no banco; matrícula de admissão com UUID | Fase 2 |
| ALTO-06 `ON DELETE CASCADE` apaga trilha | 🟡 RESTRICT em custódia, chamados, mensagens e termos | Fase 2 |
| MED-01 custódia inicial não gravada | 🟡 gravada junto com o ativo | Fase 2 |
| MED-02 corrida chamado × mensagem | 🟡 gravação em sequência | Fase 1 |
| MED-03 `setorId` do ativo descartado | 🟡 coluna `ativos.setor_id` + mapeamento | Fase 2 |
| MED-04 upload falso (termo/anexos) | 🟡 Storage privado + upload real + link temporário | Fase 3 |
| MED-05 dados não recarregam após login | 🟡 | Fase 1 |
| MED-06 "Restaurar demo" em produção | 🟡 oculto (UI) | Fase 0 |
| MED-07 índices / paginação | 🟡 14 índices criados · ⏳ paginação (só importa com volume) | Fase 2 / Fase 4 |
| MED-08 integridade em JSONB | ⏳ parcial: alocação de licença já é atômica; tabelas de junção ficam para a Fase 4 | Fase 4 |
| MED-09 sem migrations versionadas | 🟡 pasta `supabase/migrations` criada; 2 migrations registradas em produção | Fases 0 e 1 |
| MED-10 sem cabeçalhos de segurança | 🟡 `vercel.json` com CSP (testada no navegador) | Fase 1 |
| MED-11 `npm install` quebra (ERESOLVE) | 🟡 resolvido (dependências limpas; npm no lugar do bun) | Fase 4 |
| MED-12 sem recuperação de senha | 🟡 "Esqueci minha senha" + tela de definir senha (recuperação e convite) | Fase 3 |
| LGPD (seção 7) | 🟡 aviso de privacidade (texto-base para o jurídico revisar), download dos próprios dados, pedidos do titular, anonimização | Fase 3 |
| BAI-01 credenciais demo na tela de login | 🟡 só no `npm run dev`; fora do bundle de produção | Fases 1 e 4 |
| Verificador: `rls_auto_enable` exposta | 🟡 revoke de EXECUTE | Fase 1 |
| Verificador: proteção de senhas vazadas | ⏳ ação no painel | Você |
| Demais BAI e limpeza (seção 6) | 🟡 strict, ESLint, 80 imports e 4 funções mortas removidos, arquivos do AI Studio removidos, code-splitting, README. ⏳ dividir o `AppContext` (grande) e tabelas de junção (MED-08) | Fase 4 |

### Pendências que dependem de você
1. **Painel do Supabase:** desligar *Allow new users to sign up*; ligar *Leaked password protection*; trocar a senha do `admin@admin.com`, se for de teste.
2. **Aplicar as Fases 1 e 2, nesta ordem:**
   1. migrations, uma de cada vez: `20261112000000_fase1_identidade.sql` → `20261112000100_fase1_rls_por_papel.sql` → `20261113000000_fase2_integridade.sql`;
   2. **logo em seguida**, abrir e fazer o merge do PR de `security/fase2-integridade` na `main`. Ele inclui as Fases 0, 1 e 2. A Vercel publica.

   **Pelo SQL Editor é mais garantido:** as migrations da Fase 1 e da Fase 2 têm `DROP` (policies antigas, colunas de segredo, FKs em cascata), e o conector do Supabase recusa sozinho comandos com `DROP` sem mostrar a confirmação. Foi o que aconteceu com o trigger da Fase 0. Depois de aplicar, eu confiro tudo pelo conector (somente leitura).

   Entre os passos 2.1 e 2.2, a versão antiga do site falha ao salvar ativos e licenças (colunas de segredo mudaram de tabela). Como produção não tem nenhum ativo nem licença, o impacto é nulo se o merge vier logo depois.
3. **Depois da Fase 1, todo usuário precisa de perfil:** cadastre a pessoa em Colaboradores (como `ti_admin`) e convide o e-mail em *Authentication → Users → Invite*. Login sem perfil mostra "Seu login ainda não tem um perfil liberado" e é desconectado.
4. **Trocar o admin de bootstrap:** quando existir um `ti_admin` com e-mail real, rebaixe ou desligue o `admin@admin.com` (criado pelo bug CRIT-02).

### O que muda para cada papel com a Fase 1
| Papel | Vê | Grava |
|---|---|---|
| `colaborador` | o próprio perfil, ativos sob sua custódia, seu histórico e termos, catálogo de licenças (sem chave), os próprios chamados e as mensagens não internas | abre chamados próprios e responde neles (sem nota interna) |
| `rh` | todos os colaboradores, ativos (sem BitLocker), custódia, termos, chamados de on/offboarding e os próprios | cadastra e edita colaboradores (sem mudar papéis nem e-mail de gestores), abre on/offboarding |
| `ti_suporte` | tudo, inclusive segredos e notas internas | ativos, licenças, custódia, termos, chamados, colaboradores (sem papéis) |
| `ti_admin` | tudo | tudo, inclusive papéis, setores, configuração e exclusões |
| desligado / sem perfil / anônimo | nada (anônimo: só a razão social da tela de login) | nada |

### O que a Fase 2 entregou
| Item | Como ficou |
|---|---|
| Chamados urgentes e offboardings sumindo (CRIT-03) | O front grava os valores que o banco aceita, sem mudar o banco |
| Falhas silenciosas (CRIT-04) | Toda gravação confere a resposta; se o banco recusar (permissão, duplicado, vínculo), a tela volta ao estado anterior e aparece um aviso no canto inferior direito |
| Abrir chamado ou gerar termo | Só aparece na tela depois que o banco confirma, já com o código definitivo (`#CH-2026-0001`, `#TR-2026-0001`) |
| Concorrência | Edição envia só os campos alterados; alocar ou liberar assento é atômico e respeita o limite |
| Exclusões | Colaborador ou ativo com histórico, chamados ou termos não pode mais ser excluído (use desligamento / descarte) |
| Testes | 57/57 cenários de banco (Fases 1+2); navegador em modo demo: chamado urgente, status "aguardando peça", transferência de custódia |

### O que a Fase 3 entrega (após aplicar)
| Processo | Antes | Depois |
|---|---|---|
| Anexos de chamado | Nome digitado + foto fixa do Unsplash | Upload real (PDF/imagem/TXT, até 10 MB), privado, abre por link de 5 min |
| Termo assinado | Botão simulado com URL fixa | TI envia o scan; colaborador e RH veem; nada público |
| Offboarding | Checklist manual; ativos e licenças ficavam com a pessoa | 1 clique: devolve ativos, fecha custódia, libera licenças, desliga, resolve |
| Admissão | RH podia sugerir `ti_admin` e qualquer TI efetivava | Papel de gestão só aplicado por `ti_admin` |
| Senha | Sem recuperação | "Esqueci minha senha" e tela de definir senha (recuperação e convite) |
| LGPD | Nada | Aviso de privacidade, cópia dos dados, pedidos do titular, anonimização sem perder histórico |

**Para aplicar a Fase 3:**
1. SQL Editor: `20261114000000_fase3_processos.sql` (cria o bucket e as regras de acesso dele).
2. Merge do PR de `feat/fase3-processos` na `main`.
3. Painel do Supabase → Authentication → URL Configuration: *Site URL* = `https://governanca-ti-psi.vercel.app` e esse endereço também em *Redirect URLs*. Sem isso, os links de recuperação e convite apontam para o lugar errado.

### Decisão pendente (LGPD)
- **PDF do termo assinado após a anonimização:** o cadastro, o histórico e o termo no banco são anonimizados, mas o PDF escaneado continua no bucket, e ele traz o nome e a assinatura reais. Recomendação: manter o PDF como prova durante o prazo de guarda (exercício regular de direitos) e excluí-lo ao fim desse prazo. Isso deve ser definido com o jurídico (prazo) e registrado no aviso de privacidade.

### Sugestões de melhoria (para decidir, não implementadas)
**Processo**
1. **Convite em 1 passo:** hoje é preciso cadastrar o colaborador no app **e** convidar no painel do Supabase. Uma Edge Function (com a chave de serviço só no servidor) permitiria um botão "Convidar" na tela de Colaboradores.
2. **Termo de devolução automático** ao concluir o offboarding, já vinculado à custódia fechada (`termo_id`).
3. **Aceite eletrônico do termo** pelo próprio colaborador (registro de data, hora e usuário), no lugar de imprimir, assinar e escanear.
4. **Notificações por e-mail** (abertura, resposta e resolução de chamado; renovação de licença em 30 dias).
5. **SLA por prioridade** no Service Desk (prazo, atraso, tempo de primeira resposta).
6. **Ambiente de homologação:** projeto Supabase de teste + preview da Vercel apontando para ele, para testar antes de produção.

**Telas e campos**
1. **Editar colaborador** (cargo, setor, gestor, telefone): hoje só o papel é editável.
2. **Editar e descartar ativo** (dados gerais, fiscais e status "descartado"): hoje só SO/BitLocker são editáveis.
3. **Manutenção de ativos:** a seção existe na ficha, mas sempre vazia (não há tabela nem formulário).
4. **`data_desligamento` no cadastro** do colaborador (hoje só fica no chamado).
5. **Licença:** responsável e centro de custo; alerta de renovação.
6. **Legibilidade:** quase todo texto usa 10–12 px. Subir para 13–14 px e revisar o contraste melhora o uso diário e a acessibilidade.
7. **Celular:** a barra lateral é fixa; em telas pequenas ela deveria virar menu recolhível.
8. **Logo da empresa** nos termos (o campo `logoUrl` existe e não é usado).

### Próximas fases
**Fase 3 · Processos completos** (✅ implementada, falta aplicar; itens originais abaixo)
- Supabase Storage privado para termos assinados e anexos (MED-04).
- Offboarding automático (devolver ativos, revogar licenças, `status='desligado'`); onboarding sem RH sugerir papel de gestão.
- Recuperação de senha e fluxo de convite (MED-12).
- LGPD: política de privacidade, base legal, exportação e exclusão por titular, retenção.

**Fase 4 · Qualidade**
- Gerar tipos TypeScript do banco real (`supabase gen types`) depois de aplicar as Fases 1 e 2, e trocar os `any` dos mapeadores.
- Tabelas de junção no lugar de arrays JSONB (licença↔colaborador, termo↔ativo) e paginação das listas.
- Testes automatizados: transformar os 57 cenários de RLS já escritos em pgTAP / `supabase test db`, lógica do contexto (Vitest), E2E de chamado (Playwright).
- `strict: true`, ESLint com `react-hooks`, dividir o `AppContext`, remover código e arquivos mortos, corrigir o ERESOLVE, code-splitting.

### O que não foi verificado
- O comportamento do **novo front contra o banco com as Fases 1 e 2** foi validado por partes: banco em Postgres local (57 cenários) e front por typecheck, build e navegador **em modo demo**, sem Supabase. Um teste ponta a ponta com login real só será possível depois de aplicar as migrations. Roteiro sugerido, como `admin@admin.com`:
  1. abrir um chamado "Urgente" e conferir o código `#CH-2026-0001`;
  2. mudar o status para "Aguardando peça";
  3. trocar o papel de um colaborador fictício;
  4. cadastrar um ativo já entregue a alguém e conferir o histórico após F5.
- O aviso de erro (CRIT-04) não pôde ser visto no modo demo, porque ali nada é gravado. Ele aparece quando o banco recusa algo, por exemplo um colaborador comum tentando alterar um setor.

---

## 0. Reconhecimento

| Item | Valor |
|---|---|
| Tipo | SPA client-side (sem servidor próprio). **Não é Next.js**: não há API routes, server actions, middleware nem edge functions. |
| Framework | React 19 + Vite 8 (`vite.config.ts`), TypeScript 5.8, Tailwind 4 |
| Estado | Um único React Context gigante (`src/context/AppContext.tsx`, 1.157 linhas) + espelho em `localStorage` |
| Dados | `@supabase/supabase-js` 2.x chamado direto do navegador com a anon key (`src/services/supabase.ts`, `src/services/supabaseDb.ts`) |
| Validação | Nenhuma biblioteca (sem zod/yup). Só `required` em HTML e `trim()` |
| UI | Tailwind, lucide-react, qrcode |
| Roteamento | Nenhum router; `useState('dashboard')` em `src/App.tsx:52` troca as views |
| Origem | Gerado no Google AI Studio (pasta `.aistudio/`, `metadata.json`); primeiro rodava em Firebase, depois migrou para Supabase |
| Entrada | `index.html` → `src/main.tsx` → `src/App.tsx` → `AppProvider` |
| Deploy | Vercel (sem `vercel.json`) |
| README | **Não existe**. Foi removido no commit `ffb05f4` |

### Banco (fonte única: `supabase-schema.sql`, não há pasta de migrations nem tipos gerados)

| Tabela | RLS | Policies |
|---|---|---|
| departamentos | ON | SELECT `to authenticated using(true)`; ALL `to authenticated using(true) with check(true)` |
| colaboradores | ON | idem |
| ativos | ON | idem |
| historico_custodia | ON | idem |
| licencas_software | ON | idem |
| chamados | ON | idem |
| chamado_mensagens | ON | idem |
| termos_responsabilidade | ON | idem |
| configuracoes_empresa | ON | SELECT `using(true)` **inclusive anon**; ALL `to authenticated using(true)` |

- Views, funções SQL, `SECURITY DEFINER`, triggers, enums, buckets de storage: **nenhum** [C].
- "Enums" são `CHECK` constraints em colunas `TEXT`.
- Não existe coluna ligando `colaboradores` a `auth.users` (sem `user_id uuid`). O vínculo é feito **no navegador, pelo e-mail** [C].

### Telas (views) e quem vê (checagem só no front)

| View | Componente | Papéis com acesso na UI |
|---|---|---|
| dashboard | `dashboard/DashboardView.tsx` | ti_admin, ti_suporte |
| assets | `assets/AssetsView.tsx` | ti_admin, ti_suporte |
| collaborators | `collaborators/CollaboratorsView.tsx` | ti_*, rh |
| servicedesk | `servicedesk/ServiceDeskView.tsx` | ti_*, rh |
| rh_processes | `rh/RhProcessesView.tsx` | ti_*, rh |
| terms | `terms/TermsView.tsx` | ti_*, rh |
| settings | `settings/SettingsView.tsx` | ti_admin **e ti_suporte** |
| my_assets / my_tickets | `collaborators/MyAssetsView.tsx`, `servicedesk/MyTicketsView.tsx` | todos |

### Mapa de módulos
Colaboradores (RH/TI) · Setores · Ativos de TI + dados fiscais + campos customizados · Custódia (histórico 360°) · Licenças SaaS (assentos) · Service Desk (chamados, mensagens, notas internas, anexos) · Onboarding/Offboarding (chamados especiais) · Termos de responsabilidade (impressão A4 e assinatura) · Configurações (empresa, setores, campos, papéis, "zerar banco").
Não há leads, funil ou pipeline: apesar de chamado de CRM, é um sistema de **governança de TI e ativos**.

---

## 1. Resumo executivo

**Nota geral de risco: CRÍTICO (2/10).**
Hoje a segurança do sistema depende só da interface. O banco aceita leitura e escrita irrestrita de qualquer sessão autenticada, e a lógica de login promove usuários a administrador.

**Os 5 problemas mais graves**
1. **RLS de fachada**: todas as policies são `using (true)`. Qualquer usuário autenticado lê, altera e apaga **todas** as tabelas pela API REST, incluindo trocar o próprio `role` para `ti_admin` e ler chaves BitLocker. [C]
2. **Login grava o usuário como `ti_admin`**: `vincularUsuarioComColaborador` roda com a lista de colaboradores vazia e conclui que ele é o "primeiro usuário". [C] Detalhes em CRIT-02.
3. **Gravações falham em silêncio por divergência de enums**: prioridade `urgente` e status `aguardando_peca` violam os `CHECK` do banco. Todo offboarding, todo chamado "Urgente" e toda mudança para "Aguardando Peça" são perdidos, mas a UI mostra sucesso. [C]
4. **Nenhuma escrita checa `error`**: há 13 chamadas `upsert` e `delete` "fire-and-forget". Junto com a UI otimista, o usuário vê dados que não existem no banco. [C]
5. **Dados sensíveis expostos e persistidos no navegador**: chaves BitLocker, chaves de contrato e notas internas são enviadas a qualquer colaborador e ficam em `localStorage` mesmo **depois do logout**. [C]

---

## 2. Achados por severidade

### CRÍTICO

**CRIT-01 — RLS permite tudo para qualquer autenticado** [C]
- Onde: `supabase-schema.sql:205-256`
- Descrição: cada tabela tem `FOR ALL TO authenticated USING (true) WITH CHECK (true)`. Não há nenhum uso de `auth.uid()` nem de papel. As restrições de papel existem só no React (`App.tsx:56-70`, `Sidebar.tsx:119`, `TicketDetailModal.tsx:376`, `Employee360Modal.tsx:45`).
- Impacto: um colaborador comum, com o token da própria sessão e a anon key (pública no bundle), pode:
  - `PATCH /rest/v1/colaboradores?email=eq.<eu>` com `{"role":"ti_admin"}`;
  - ler `ativos.bitlocker_key`, `licencas_software.chave_contrato` e `chamado_mensagens` com `eh_nota_interna=true`;
  - `DELETE` em qualquer tabela.

  Se o provedor Google ou o signup por e-mail estiverem abertos no Supabase **[S]**, qualquer pessoa da internet consegue esse acesso. A tela de login oferece "Entrar com Google" (`LoginView.tsx:62`), e não há restrição de domínio no código.
- Correção:
  1. Adicionar `colaboradores.auth_user_id uuid unique references auth.users`.
  2. Criar a função `public.current_role()` como `SECURITY DEFINER` com `search_path` fixo, lendo o papel por `auth.uid()`.
  3. Escrever policies separadas por operação. SELECT de `ativos`: TI vê tudo, colaborador vê só onde `custodiante_id` = o próprio. `bitlocker_key` vai para uma tabela separada, visível só para TI. INSERT/UPDATE/DELETE: só `ti_admin`/`ti_suporte`. `colaboradores.role`: UPDATE só por `ti_admin`, via coluna protegida, trigger ou RPC. Mensagens: colaborador vê só as do próprio chamado e nunca `eh_nota_interna`.
  4. No painel: desabilitar signup aberto ou restringir o domínio do Google.
- Esforço: Alto (2-4 dias, com testes).

**CRIT-02 — Escalada automática para `ti_admin` no login** [C, análise estática; não executei]
- Onde: `AppContext.tsx:253-295` (principalmente `:267-268`, `:270`, `:279`, `:291`), junto com `:298-369` e `:375-405`.
- Sequência:
  1. A tela de login carrega e `loadDataFromSupabase()` roda como **anon**. A RLS devolve `[]` sem erro, o health check passa e `setEmployees([])` executa (`:328-329`).
  2. O usuário faz login. `login()` chama `vincularUsuarioComColaborador(authUser)` com `employees === []`. `isFirst = currentList.length === 0` dá `true`, e o papel vira `ti_admin`.
  3. O sistema chama `upsertEmployeeDb({ id: 'emp-' + uid.slice(0,8), role: 'ti_admin', ... })`.
     - Usuário novo: é **inserido como ti_admin** no banco.
     - Usuário auto-provisionado antes (mesmo id determinístico): o upsert **sobrescreve** role, cargo, matrícula e setor.
     - Usuário cadastrado pelo RH (id diferente, mesmo e-mail): a constraint UNIQUE de e-mail falha em silêncio, mas a UI local fica como admin.
  - O caminho do OAuth (`getSession` em `:375`) usa a closure do estado inicial, que também é `[]` depois que a tela de login esvaziou o cache.
- Agravante: os dados não são recarregados depois do login (`useEffect` com deps `[isSupabaseConfigured]`, `:367-369`), então as telas ficam vazias até o F5.
- Verificação sugerida (read-only, em produção): `select id, email, role, cargo, created_at from colaboradores where role='ti_admin';`. Se aparecerem vários `ti_admin` com cargo "Administrador de T.I. & Governança", o bug já ocorreu.
- Reprodução local (descrita, não executada): `supabase start`, aplicar o schema, criar dois usuários, logar com o 1º e depois com o 2º numa janela anônima. Esperado com o bug: o 2º fica `ti_admin`.
- Correção: remover o bootstrap "primeiro usuário vira admin" do cliente. Provisionar o perfil por trigger `on auth.users insert` (sempre `colaborador`) e definir o primeiro admin manualmente via SQL. O papel nunca deve ser escrito pelo cliente.
- Esforço: Médio (1 dia).

**CRIT-03 — Prioridade `urgente` e status `aguardando_peca` violam o CHECK do banco** [C]
- Banco: `supabase-schema.sql:102` aceita `'baixa','media','alta','critica'`, e `:103` aceita `'aberto','em_andamento','aguardando_terceiro','resolvido','cancelado'`.
- Front: `types/index.ts:106-107` usa `'aguardando_peca'` e `'urgente'`.
- Usos:
  - `RhProcessesView.tsx:151`: **todo offboarding** é criado como `urgente`.
  - `NewTicketModal.tsx:217`: opção "Urgente".
  - `ServiceDeskView.tsx:165`, `TicketDetailModal.tsx:485`: "Aguardando Peça".
  - `DashboardView.tsx:29`: o KPI de urgentes depende disso.
- Impacto: o `upsert` em `chamados` falha com 23514, o erro é ignorado (`supabaseDb.ts:321`) e a mensagem inicial falha por FK. A UI mostra "Requisição de Offboarding aberta com sucesso" e, no próximo F5, o chamado desaparece. Em update de status, o chamado volta ao status anterior.
- Correção: alinhar os vocabulários. Recomendo mudar o banco para `urgente`/`aguardando_peca` com uma migration `ALTER ... DROP CONSTRAINT/ADD CONSTRAINT`, ou mudar o front. Depois, gerar tipos com `supabase gen types` para o TypeScript pegar isso.
- Esforço: Baixo (2 h).

**CRIT-04 — Nenhuma escrita verifica `error`; a UI é 100% otimista** [C]
- Onde, em `supabaseDb.ts`:
  - upserts nas linhas 38, 79, 157, 172, 222, 306, 321, 376 e 419;
  - deletes nas linhas 50, 97, 193 e 239;
  - `clearAllDatabaseTables` em 481-496 (o `try/catch` não pega o `{error}` do supabase-js);
  - leituras secundárias que ignoram erro: 110-113 (custódia) e 252-255 (mensagens).
- No `AppContext`, todas as ações atualizam o estado e chamam o upsert sem `await` (ex.: `:604`, `:653`, `:688`, `:697`, `:752`, `:867-868`). A gravação ainda acontece **dentro do updater do `setState`** (`:613`, `:662`, `:697`, `:780`, `:902`, `:919`...), o que é efeito colateral num updater.
- Impacto: qualquer falha (RLS, CHECK, UNIQUE, FK, rede ou sessão expirada) é invisível. O usuário vê o dado salvo, que some no reload ou fica divergente entre máquinas.
- Correção: padronizar `const { data, error } = await ...upsert(...).select().single(); if (error) throw error;`. Nas ações, `await` a gravação, mostrar o erro e fazer rollback do estado otimista. Tirar os efeitos colaterais dos updaters.
- Esforço: Médio (1-2 dias).

### ALTO

**ALTO-01 — Dados sensíveis enviados a todos e persistidos em `localStorage` após logout** [C]
- `fetchAssetsFromDb` traz `bitlocker_key` (`supabaseDb.ts:147`), `fetchLicensesFromDb` traz `chave_contrato` (`:208`) e `fetchTicketsFromDb` traz notas internas (`:252-273`), **para qualquer papel**. O filtro é só visual (`TicketDetailModal.tsx:376`).
- `AppContext.tsx:424-450` grava tudo em `localStorage`. `logout()` (`:586-590`) **não limpa** essas chaves.
- Impacto: em máquina compartilhada, quem abrir o DevTools depois do logout lê chaves BitLocker e notas internas.
- Correção: RLS e colunas separadas (CRIT-01); não persistir dados de negócio em `localStorage` (ou ao menos limpar no logout e no `SIGNED_OUT`); trazer BitLocker sob demanda por RPC auditada.
- Esforço: Médio.

**ALTO-02 — Sessão expirada mantém a UI "logada"** [C]
- `onAuthStateChange` no `SIGNED_OUT` só faz `setSupabaseUser(null)` (`AppContext.tsx:402-404`) e não zera `currentUserId`.
- `currentUserId` é restaurado do `localStorage` (`:244-250`), e `App.tsx:86` decide se está logado por `currentUser`, não pela sessão Supabase.
- Impacto: depois da expiração ou revogação, o usuário continua vendo dados em cache e "salvando" (sem efeito real, por CRIT-04). Editar `nexus_user_id` no `localStorage` muda a identidade na UI. `switchUser` (`:592-597`) ainda está exposto no contexto.
- Correção: derivar autenticação da sessão do Supabase (`session != null`); no `SIGNED_OUT`, limpar estado e storage; remover `switchUser`.
- Esforço: Baixo.

**ALTO-03 — `ti_suporte` acessa Configurações, troca papéis e "zera o banco"** [C]
- O link de Configurações aparece para `isTI` (`Sidebar.tsx:30,210-221`), e `App.tsx:56-70` só bloqueia `colaborador` e `rh`.
- `SettingsView.tsx:776-790` permite promover qualquer pessoa, inclusive a si mesmo, a `ti_admin`. `SettingsView.tsx:1037-1040` chama `clearAllDataToProduction` → `clearAllDatabaseTables`, que apaga todas as tabelas menos o próprio usuário (`supabaseDb.ts:481-496`).
- Impacto: um técnico de suporte apaga a base inteira sem backup no app. E, por CRIT-01, qualquer usuário pode fazer o mesmo pela API.
- Correção: restringir a view e as ações a `ti_admin` no banco (RLS/RPC). Remover o "zerar banco" de produção ou exigir RPC `SECURITY DEFINER` com checagem de papel e backup prévio.
- Esforço: Baixo-Médio.

**ALTO-04 — Last-write-wins com estado obsoleto (sem recarga e sem concorrência)** [C]
- Os dados são lidos uma única vez no mount (`AppContext.tsx:367-369`). Cada ação envia **a linha inteira** a partir do estado local (`upsert`).
- Exemplos: dois técnicos alocando assentos da mesma licença ao mesmo tempo, e o segundo apaga a alocação do primeiro (`colaboradores_ids` é um array JSONB, `:800-818`); um técnico mudando o status de um chamado sobrescreve a atribuição feita por outro.
- Correção: usar `update` parcial com `.eq('id', ...)` e só os campos alterados; tabela de junção `licenca_alocacoes`; versionamento otimista (`updated_at`) ou Supabase Realtime.
- Esforço: Médio.

**ALTO-05 — IDs e códigos gerados no cliente colidem** [C]
- IDs: `emp-`/`ast-`/`lic-`/`tkt-`/`msg-`/`tr-`/`cust-` usam `Date.now().slice(-6)`, que repete a cada ~16,7 min (`AppContext.tsx:601,685,760,848,854,882,976,736`). `dep-` usa `.slice(-4)`, que repete a cada 10 s (`:650`).
- Matrícula: `NX-` + 4 dígitos (`:273,572`; `TicketDetailModal.tsx:80`).
- Códigos `#CH-`/`#TR-` = `tickets.length+1` / `terms.length+1` (`:842,970`), não são atômicos.
- Impacto: como tudo é `upsert`, um ID repetido **sobrescreve silenciosamente outro registro**. Códigos ou matrículas repetidos violam UNIQUE e o registro é perdido (CRIT-04).
- Correção: `crypto.randomUUID()` ou `default gen_random_uuid()` no banco; códigos sequenciais por `sequence` ou trigger no servidor; usar `insert` (não `upsert`) para criação.
- Esforço: Baixo-Médio.

**ALTO-06 — `ON DELETE CASCADE` apaga trilha de auditoria** [C]
- `historico_custodia.colaborador_id` (`schema:68`), `chamados.solicitante_id` (`:104`), `chamado_mensagens.autor_id` (`:126`) e `termos_responsabilidade.colaborador_id` (`:139`).
- Impacto: excluir um colaborador (inclusive via "zerar banco", que apaga `colaboradores`) apaga os termos assinados, o histórico de custódia e os chamados dele. Isso destrói justamente a "rastreabilidade 360°" e a prova documental.
- Correção: `ON DELETE RESTRICT` e soft-delete (`status='desligado'`, que já existe).
- Esforço: Baixo.

### MÉDIO

| ID | Título | Evidência | Impacto / Correção | Esforço |
|---|---|---|---|---|
| MED-01 | Histórico de custódia inicial do ativo nunca é gravado [C] | `NewAssetModal.tsx:84-94` monta `historicoCustodia`, mas `addAsset` só chama `upsertAssetDb` (`AppContext.tsx:688`), que não grava custódia | Ativo cadastrado já "em uso" fica sem histórico no banco; após F5 a timeline some. Chamar `upsertCustodyEntryDb` em `addAsset` (ou trigger) | Baixo |
| MED-02 | Corrida ticket × mensagem inicial (FK) [C] | `AppContext.tsx:867-868`: `upsertTicketDb` e `addTicketMessageDb` em paralelo, sem `await` | A mensagem pode chegar antes do chamado e falhar por FK, sem ninguém notar. Fazer `await` sequencial ou RPC transacional | Baixo |
| MED-03 | `Asset.setorId` descartado [C] | Enviado em `NewAssetModal.tsx:68`; sem coluna no banco e ausente em `upsertAssetDb` (`supabaseDb.ts:172-188`); exibido em `Asset360Modal.tsx:57` | Setor do ativo aparece até o F5 e depois some. Adicionar coluna `setor_id` ou remover o campo | Baixo |
| MED-04 | "Upload" de termo assinado e anexos são falsos [C] | `PrintableTermModal.tsx:27` grava URL fixa `https://cdn.nexuscorp.com.br/...`; `AppContext.tsx:994` idem; `NewTicketModal.tsx:37` grava foto do Unsplash | Termo marcado "assinado" sem arquivo; anexos inexistentes. Implementar Supabase Storage (bucket privado + policies + validação de tipo/tamanho + URL assinada) | Médio |
| MED-05 | Dados não recarregam após login [C] | `AppContext.tsx:367-369` | Telas vazias até F5; somado a CRIT-02. Recarregar no `SIGNED_IN` | Baixo |
| MED-06 | "Restaurar Base de Demonstração" disponível em produção [C] | `SettingsView.tsx:973-986`, `AppContext.tsx:1010-1019` (troca `currentUserId` para `emp-1`) | Mistura dados demo no estado; editar um registro demo faz upsert dele em produção. Remover quando `isSupabaseConfigured` | Baixo |
| MED-07 | Sem índices em FKs/filtros; leitura sem paginação [C] | Schema não cria índices além de PK/UNIQUE; `select('*')` de todas as tabelas inteiras em `supabaseDb.ts:21,56,103,110,199,245,252,351` | Degrada com volume; carrega todas as mensagens de todos os chamados no navegador de cada usuário | Médio |
| MED-08 | Integridade em JSONB sem FK [C] | `licencas_software.colaboradores_ids`, `termos.ativo_ids` (`schema:85,144`); `departamentos.responsavel_id`, `termos.responsavel_ti_id`, `historico_custodia.termo_id` sem FK (`:18,149,73`) | IDs órfãos. Tabelas de junção + FKs | Médio |
| MED-09 | Script SQL não é idempotente; não há migrations [C] | Os `DROP POLICY` usam nomes ("Gravacao departamentos", "Leitura autenticada de setores"…, `:184-202`) diferentes dos `CREATE` ("Gravacao autenticada departamentos"…, `:207-256`) | Rodar o script pela 2ª vez falha com "policy already exists". Adotar `supabase/migrations` versionadas | Baixo |
| MED-10 | Sem cabeçalhos de segurança [C] | Não há `vercel.json` | Sem CSP, `X-Frame-Options`/`frame-ancestors` (clickjacking), `Referrer-Policy`. Token Supabase fica em `localStorage` (padrão), então CSP é a principal defesa contra XSS | Baixo |
| MED-11 | `npm install` quebra (ERESOLVE) [C] | `package.json`: `esbuild ^0.25` × peer `^0.27/^0.28` do Vite 8 | Só instala com `--legacy-peer-deps` ou bun (há `bun.lock`). Remover `esbuild` do devDependencies | Baixo |
| MED-12 | Sem recuperação de senha nem cadastro na UI [C] | Não há `resetPasswordForEmail` no código; `registerUser` (`AppContext.tsx:556`) não é usado por nenhum componente e, se usado, criaria o colaborador só localmente (sem upsert) | Usuários com senha esquecida dependem de reset manual no painel | Baixo-Médio |

### BAIXO

| ID | Título | Evidência |
|---|---|---|
| BAI-01 | Tela de login vem preenchida com `admin.ti@nexuscorp.com.br` / `nexus@2026` [C] | `LoginView.tsx:7-8`; senha demo hardcoded em `AppContext.tsx:545` (só vale sem Supabase, mas está no bundle) |
| BAI-02 | Papel derivado por heurística de e-mail/cargo quando `role` falta [C] | `AppContext.tsx:463-483`, `SettingsView.tsx:711-726` (cargo contendo "administrador" vira ti_admin na UI) |
| BAI-03 | `configuracoes_empresa` legível por anon [C] | `schema:205-206`. Expõe CNPJ, e-mail e telefone da TI (provavelmente aceitável, mas foi uma decisão) |
| BAI-04 | Chave de API Firebase no histórico do git [C] | `firebase-applet-config.json` nos commits `f6de285`/`f38be55`, removido em `ffb05f4` (projeto `studio-3112068630-7fb36`). Chave web do Firebase não é segredo, mas convém apagar o projeto/app Firebase se não for mais usado e restringir a chave no Google Cloud |
| BAI-05 | Bundle único de 758 kB [C] | Aviso do `vite build`; `initialData.ts` (26 kB de dados fictícios) vai junto para produção |
| BAI-06 | `tsconfig` sem `strict` [C] | `tsconfig.json`; "lint" é só `tsc --noEmit`, sem ESLint |
| BAI-07 | Logs [C] | Só `console.error` de objetos de erro do Supabase (`supabaseDb.ts:23,58,105,201,247,353,494`). **Não** encontrei log de senha, token ou dado pessoal. OK |

### Verificado e OK
- `dangerouslySetInnerHTML`, `eval`, `innerHTML`, `document.write`: **nenhum uso** [C]. O React escapa o conteúdo.
- SQL por concatenação: **não há** (só query builder do supabase-js) [C].
- `.env` no `.gitignore` (`.env*` com exceção de `!.env.example`) [C]; nenhum `.env` no histórico [C].
- Nenhuma `service_role` ou secret no código ou no histórico; só a anon key é usada, via `VITE_*` [C].
- `npm audit` no momento do install: **0 vulnerabilidades** em 109 pacotes (o `npm audit` avulso exige lockfile, que não gerei para não alterar o repo).
- `tsc --noEmit`: 0 erros. `vite build`: OK (1 warning de tamanho de chunk).
- Logout chama `supabase.auth.signOut()`, cujo escopo padrão no supabase-js v2 é `global` e revoga o refresh token [C, comportamento da lib]. O problema é só o estado local (ALTO-01/02).
- OAuth `redirectTo: window.location.origin` (`supabase.ts:54`): não é open redirect, desde que a allowlist do Supabase esteja restrita [S].

---

## 3. Fluxo de campos ponta a ponta

Caminho comum: Componente → ação do `AppContext` (estado otimista) → função em `supabaseDb.ts` (mapeia camelCase para snake_case) → `upsert` sem checar erro. Leitura: mount → `fetch*FromDb` → mapeamento inverso.
O mapeamento camelCase/snake_case **está correto em todos os campos que existem nas duas pontas** (conferi linha a linha, `supabaseDb.ts:26-433` × `supabase-schema.sql`). Os problemas são campos sem coluna, enums divergentes e caminhos que não chamam a gravação.

Coluna "Gravado?": ✅ grava (sujeito a CRIT-04: erro não detectado) · ❌ não grava · ⚠️ grava às vezes.

| Entidade | Campo | Exibido | Lido do banco | Enviado no save | Gravado | Status | Evidência |
|---|---|---|---|---|---|---|---|
| Colaborador | id, matricula, nome, email, cargo, setorId, gestorId, status, dataAdmissao, telefone, avatarUrl | ✅ | ✅ | ✅ | ✅ | OK | `supabaseDb.ts:61-92` |
| Colaborador | role | ✅ | ✅ | ✅ | ✅ | **Quebrado (segurança)**: escrito pelo cliente; vira ti_admin no login | CRIT-02; `SettingsView.tsx:780` |
| Colaborador | matricula (auto) | ✅ | ✅ | ✅ | ⚠️ | Parcial: colisão de UNIQUE descarta o registro | `AppContext.tsx:273`, `TicketDetailModal.tsx:80` |
| Colaborador | edição de dados (não-papel) | — | — | — | — | Inexistente: `updateEmployee` não é usado por nenhum componente | grep |
| Colaborador | exclusão | — | — | — | — | Inexistente na UI: `deleteEmployee` não é usado | grep |
| Departamento | nome, codigo, descricao, ativo | ✅ | ✅ | ✅ | ✅ | OK | `supabaseDb.ts:26-45`; `SettingsView.tsx:100,126` |
| Departamento | responsavelId | ❌ | ✅ | ✅ | ✅ | Órfão: nenhuma UI define ou exibe | grep |
| Ativo | tag, nome, categoria, marca, modelo, serialNumber, status, localizacaoFisica, custodianteId, dataEntregaAtual | ✅ | ✅ | ✅ | ✅ | OK | `supabaseDb.ts:134-188`; `NewAssetModal.tsx:58-96` |
| Ativo | sistemaOperacional, bitlockerKey | ✅ | ✅ | ✅ | ✅ | OK funcional / **exposição** (ALTO-01) | `Asset360Modal.tsx:78-81` |
| Ativo | fiscal.{numeroNF, chaveAcesso44, valorCompra, fornecedor, dataAquisicao, dataGarantia, suporteContato} | ✅ | ✅ (JSONB) | ✅ | ✅ | OK | `NewAssetModal.tsx:74-82` |
| Ativo | fiscal.notaFiscalArquivoUrl | ❌ | ✅ | ❌ | — | Órfão (tipo sem uso) | `types/index.ts:45` |
| Ativo | customFields | ✅ | ✅ | ✅ | ✅ | OK (sem validação de `obrigatorio`) | `NewAssetModal.tsx:83` |
| Ativo | **setorId** | ✅ | ❌ | ✅ | ❌ | **Quebrado**: sem coluna | MED-03 |
| Ativo | historicoManutencao | ✅ | ❌ (sempre `[]`) | ❌ | ❌ | **Quebrado/morto**: sem tabela e sem UI de inclusão | `supabaseDb.ts:151`, `Asset360Modal.tsx:609` |
| Ativo | fotos | ❌ | ❌ | ❌ | ❌ | Morto | `types/index.ts:85` |
| Ativo | exclusão | — | — | — | — | Inexistente na UI (`deleteAssetDb` sem uso) | grep |
| Custódia | entrada inicial no cadastro | ✅ | ✅ | ❌ | ❌ | **Quebrado** | MED-01 |
| Custódia | transferência/devolução (id, colaboradorId, colaboradorNome, dataEntrega, dataDevolucao, motivoDevolucao, observacoes) | ✅ | ✅ | ✅ | ✅ | OK | `AppContext.tsx:705-756` |
| Custódia | termoId | ✅ | ✅ | ❌ (nunca definido) | — | Parcial: o termo gerado não é vinculado à custódia | grep |
| Licença | nome, fornecedor, chaveContrato, assentosTotais, valorMensal, tipoCobranca, dataRenovacao, urlPainel, observacoes | ✅ | ✅ | ✅ | ✅ | OK | `SoftwareFormModal.tsx:54-80`; `supabaseDb.ts:204-234` |
| Licença | colaboradoresIds / assentosAlocados | ✅ | ✅ (derivado) | ✅ | ⚠️ | Parcial: last-write-wins (ALTO-04); limite de assentos só no cliente | `AppContext.tsx:800-835` |
| Licença | exclusão | — | — | — | — | Inexistente na UI (`deleteLicense` sem uso) | grep |
| Chamado | titulo, descricao, tipo, categoria, solicitante*, ativoId, softwareId, softwareNome, onboarding, offboarding, dataCriacao, dataAtualizacao | ✅ | ✅ | ✅ | ✅ | OK quando os enums batem | `supabaseDb.ts:276-345` |
| Chamado | **prioridade = urgente** | ✅ | — | ✅ | ❌ | **Quebrado** | CRIT-03 |
| Chamado | **status = aguardando_peca** | ✅ | — | ✅ | ❌ | **Quebrado** | CRIT-03 |
| Chamado | tecnicoResponsavelId/Nome | ✅ | ✅ | ✅ | ✅ | OK (lista de técnicos filtrada por `setorId === 'dep-1'`, hardcoded, `TicketDetailModal.tsx:500`) | |
| Chamado | dataResolucao | ❌ | ❌ | ✅ (estado) | ❌ | Morto: sem coluna e sem exibição | `AppContext.tsx:917` |
| Chamado | anexos | ✅ | ✅ | ✅ | ✅ | **Falso**: URL fictícia | MED-04 |
| Chamado | codigo | ✅ | ✅ | ✅ | ⚠️ | Parcial: colisão em uso concorrente | ALTO-05 |
| Offboarding | checklist (toggle) | ✅ | ✅ | ✅ | ⚠️ | Quebrado na prática: o chamado de offboarding nunca chega ao banco (CRIT-03) | `AppContext.tsx:943-963` |
| Mensagem | texto, autor*, ehNotaInterna, data, anexos | ✅ | ✅ | ✅ | ⚠️ | Parcial: corrida FK na 1ª mensagem (MED-02); nota interna visível via API (CRIT-01) | `supabaseDb.ts:304-317` |
| Mensagem | autorRole → autor_papel | ✅ | ✅ | ✅ | ✅ | OK (renomeação correta) | `:267,311` |
| Termo | codigo, tipo, colaborador*, ativoIds, dataEmissao, statusAssinatura, responsavelTI* | ✅ | ✅ | ✅ | ✅ | OK | `supabaseDb.ts:356-392` |
| Termo | arquivoAssinadoUrl → arquivo_url | ✅ | ✅ | ✅ | ✅ | **Falso** (URL fixa) | MED-04 |
| Termo | data_assinatura | ❌ | ❌ | ✅ (derivado) | ✅ | Parcial: gravado e nunca lido; reescrito com `now()` em todo upsert de termo assinado | `supabaseDb.ts:387` |
| Termo | status `recusado` (banco) | — | colapsado para `gerado` | — | — | Divergência: o banco aceita, o front ignora | `supabaseDb.ts:367` |
| Termo | observacoes | ✅ | ❌ | ❌ | ❌ | Morto: exibido, mas sem coluna nem input | `PrintableTermModal.tsx:215` |
| Configuração | razaoSocial, nomeFantasia, cnpj, endereco, cidadeUF, cep, emailTI, telefoneTI, textos dos termos, camposPersonalizados | ✅ | ✅ | ✅ | ✅ | OK | `SettingsView.tsx:80-91`; `supabaseDb.ts:396-432` |
| Configuração | logoUrl | ❌ | ❌ | ❌ | ❌ | Morto | `types/index.ts:226` |

Itens específicos da Etapa 3:
- `.update()` sem `.eq()`: **não há** (só `upsert` por PK). Os `delete` têm `.eq`/`.neq`. Exceção proposital: `clearAllDatabaseTables` usa `.neq('id','dummy_zero')`, que apaga tudo [C].
- `try/catch` vazio ou `.catch(()=>{})`: não encontrado; o problema é ignorar `{ error }` (CRIT-04).
- Triggers ou funções esperadas pelo código que podem não existir: nenhuma. `updated_at`/`data_atualizacao` vêm do cliente.
- Cache: o espelho em `localStorage` mostra dado antigo até a próxima carga; não há revalidação.

---

## 4. Etapa 2 — autenticação e autorização (respostas com evidência)

| Pergunta | Resposta |
|---|---|
| Não autenticado acessa página privada ou endpoint? | Endpoints: só `configuracoes_empresa` (SELECT anon, `schema:205`); as demais tabelas exigem `authenticated`. Páginas: não há rotas no servidor; tudo está no bundle. A UI só é protegida por `currentUser`, que vem do `localStorage` (`App.tsx:86`, `AppContext.tsx:244`). Forjando `nexus_user_id` + `nexus_employees_v1`, a UI abre, mas sem dados reais do banco (anon recebe `[]`). [C] |
| Autenticado sem admin executa ações de admin? | **Sim.** Pela API (CRIT-01): qualquer escrita. Pela UI: `ti_suporte` troca papéis e zera o banco (ALTO-03). E o próprio login tende a promover a admin (CRIT-02). [C] |
| IDOR: A lê, edita ou exclui registros de B? | **Sim**, para todas as tabelas: as policies não referenciam o dono. O bloqueio de colaborador em `Asset360Modal.tsx:87`, `Employee360Modal.tsx:45` e `TicketDetailModal.tsx:577` é só visual. [C] |
| Logout invalida a sessão? | O token sim (`signOut`, escopo global). Mas dados e `currentUserId` permanecem em `localStorage`, e o `SIGNED_OUT` por expiração não derruba a UI (ALTO-01/02). [C] |
| Recuperação de senha expira e não vaza e-mail? | **Não implementada** (MED-12). A mensagem de login repassa o erro do Supabase ("Invalid login credentials"), que não distingue e-mail inexistente. Configuração de expiração e confirmação: [S] painel. |
| Testes com 2 usuários em Supabase local | **Não executados.** Docker existe na máquina, mas não há Supabase CLI e não quis baixar e subir a stack sem sua confirmação. Roteiro em CRIT-02. |

---

## 5. Processos de negócio (Etapa 4)

| Processo | Status | Onde quebra / o que falta |
|---|---|---|
| Cadastro de colaborador (TI) | Parcial | Grava, mas colisão de id ou matrícula pode sobrescrever ou perder (ALTO-05). Sem edição nem exclusão na UI. Não cria usuário de Auth; o vínculo é por e-mail no 1º login (e cai em CRIT-02). |
| Primeiro acesso / login | **Quebrado** | CRIT-02 e MED-05. |
| Onboarding (RH → TI) | Parcial | O chamado (prioridade `alta`) grava. "Efetivar admissão" (`TicketDetailModal.tsx:67-99`) cria o colaborador com o **papel sugerido pelo RH** (`role: onb.papelAcessoSugerido`), ou seja, o RH pode pedir `ti_admin` e a TI efetiva com 1 clique. Não aloca ativo nem licença automaticamente. |
| Offboarding | **Quebrado** | Prioridade `urgente` faz o chamado nunca persistir (CRIT-03). Checklist manual; não devolve ativos, não revoga licenças e não muda `status='desligado'` automaticamente. |
| Cadastro de ativo | Parcial | Custódia inicial não gravada (MED-01); `setorId` perdido (MED-03). |
| Transferência/devolução de custódia | OK, com ressalvas | Grava fecha + abre + ativo, sem transação: 3 requisições independentes, falha parcial possível. Não gera termo automaticamente nem liga `termoId`. |
| Licenças (alocar/revogar) | Parcial | Limite de assentos e concorrência só no cliente (ALTO-04). |
| Service desk (abrir, responder, status, técnico) | Parcial | Enums (CRIT-03), corrida FK (MED-02), notas internas expostas (CRIT-01), anexos falsos (MED-04). Sem notificações por e-mail. |
| Termos (gerar, imprimir, assinar) | Parcial | Gerar e imprimir OK. "Assinar" é simulado (URL fixa, sem upload, sem prova). |
| Exclusão | Ausente/perigoso | Não há exclusão unitária na UI; só o "zerar banco" global, com CASCADE que apaga trilhas (ALTO-06). |
| Importação/exportação | **Inexistente** | Nenhum CSV ou export. |
| Notificações | **Inexistentes** | Só contadores na sidebar. |
| Agendamento | **Inexistente** | — |

---

## 6. Limpeza de código (separado dos bugs)

- **Funções do contexto sem uso** [C]: `registerUser`, `switchUser` (destruturado em `Header.tsx:25` e não usado), `updateEmployee`, `deleteEmployee`, `deleteLicense`, `handleResetData` em `Header.tsx:50` (definido, sem botão), `authLoading` (sempre `false`, nunca muda), `handleOpenManager` vazio (`Employee360Modal.tsx:101-108`). Serviços sem uso: `deleteAssetDb`.
- **Campos de tipo mortos**: `Asset.fotos`, `Asset.historicoManutencao`, `FiscalData.notaFiscalArquivoUrl`, `Ticket.dataResolucao`, `ResponsibilityTerm.observacoes`, `CompanySettings.logoUrl`, `Department.responsavelId`.
- **Dependências**: `motion` (0 imports), `autoprefixer` (desnecessário no Tailwind 4), `esbuild` (causa ERESOLVE), `@types/qrcode` deveria ir para devDependencies, `@vitejs/plugin-react` e `@tailwindcss/vite` também.
- **Arquivos**: `.aistudio/` (3 imagens e plano, ~250 kB), `public/assets/aistudio/*.png` (6 imagens, ~600 kB, 0 referências), `metadata.json` (AI Studio), `.env.example` com `GEMINI_API_KEY`/`APP_URL` sem uso, comentário de HMR do AI Studio em `vite.config.ts`, script `clean` com `rm -rf` (não roda no Windows).
- **Duplicação**: os mapas de cor e rótulo de status/prioridade/papel se repetem em `ServiceDeskView`, `TicketDetailModal`, `MyTicketsView`, `Header`, `SettingsView`; a heurística de papel está duplicada (`AppContext.tsx:463`, `SettingsView.tsx:711`); os mappers de linha estão inline.
- **Arquitetura**: `AppContext` de 1.157 linhas com 60+ valores no `value`, sem `useMemo`, então qualquer mudança re-renderiza toda a árvore. Componentes de 30-50 kB (`SettingsView` 50 kB, `RhProcessesView` 36 kB, `Asset360Modal` 30 kB).
- **Hooks**: `useEffect(loadData, [isSupabaseConfigured])` com dependência constante e closures obsoletas de `employees`/`supabaseUser` (raiz de CRIT-02); efeitos colaterais dentro de updaters do `setState`; `useEffect` com `[]` capturando `vincularUsuarioComColaborador` obsoleto (`AppContext.tsx:372-410`).
- **Tipagem**: 14 ocorrências de `any` (todas em mappers de `supabaseDb.ts`); sem `strict`; sem tipos gerados do banco. Com `supabase gen types`, CRIT-03 e MED-03 teriam sido erros de compilação.
- **Queries**: N+1 não há, mas o oposto também é ruim: carregar **tudo** (incluindo todas as mensagens) no mount, sem paginação.
- **Lint/typecheck/build**: `tsc` sem erros; build OK; sem ESLint configurado, então não há como medir regras de hooks.
- **Estados de erro/loading**: só há o `authLoading` (morto). Nenhum erro de banco chega à UI.

---

## 7. Banco, deploy, LGPD e testes

**Banco (Etapa 6)**
- Índices ausentes [C]: `colaboradores(setor_id, gestor_id)`, `ativos(custodiante_id, status)`, `historico_custodia(ativo_id, colaborador_id)`, `chamados(solicitante_id, tecnico_responsavel_id, status, data_criacao)`, `chamado_mensagens(chamado_id, data_envio)`, `termos_responsabilidade(colaborador_id)`.
- Constraints que faltam: `assentos_totais >= 0`, `valor_mensal >= 0`, verificar `jsonb_array_length(colaboradores_ids) <= assentos_totais` no servidor, `email` em minúsculas (`citext` ou check), PK `text` gerado no cliente (ver ALTO-05).
- Sem migrations versionadas, sem tipos gerados e sem como comparar o script com o banco real. **Não sei se a produção bate com `supabase-schema.sql`** [S].
- Sem separação dev/prod no código (um único par de `VITE_*`); sem política de backup documentada [S, o Supabase pago tem backup diário; o plano free, não].

**Deploy (Etapa 7)**
- Variáveis usadas pelo código: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (documentadas em `.env.example`) e `DISABLE_HMR` (só dev). `GEMINI_API_KEY` e `APP_URL` estão documentadas e não são usadas.
- Sem `vercel.json`: sem headers de segurança. Como é SPA sem rotas de URL, não precisa de rewrites.
- Monitoramento: nenhum (sem Sentry ou equivalente); erros só no console do navegador.

**LGPD (Etapa 8)**
- Dados pessoais tratados: nome, e-mail, telefone, matrícula, cargo, setor, gestor, data de admissão e desligamento, foto (avatar Google), histórico de posse de equipamentos, conteúdo de chamados.
- Base legal, política de privacidade e aviso: **inexistentes** no repo e na UI [C].
- Direitos do titular (acesso, exportação, exclusão): **sem funcionalidade** [C]. Exclusão unitária não existe; a global apaga junto as trilhas que a empresa precisaria manter.
- Minimização e segurança: falham (CRIT-01, ALTO-01). Dados de todos ficam visíveis a qualquer colaborador.
- Terceiros: Google Fonts (`index.html:14-16`) recebe o IP dos usuários; o avatar vem do Google; anexos fictícios do Unsplash.

**Testes (Etapa 9)**
- **Zero testes automatizados** [C]: sem framework, sem script `test`, sem CI.
- Fluxos críticos sem teste (todos): login/provisionamento de papel, RLS por papel, criação de chamado (todas as prioridades e status), offboarding, custódia, alocação de licença, geração de termo, "zerar banco".

---

## 8. Plano de ação priorizado

**Fase 0: contenção imediata (hoje, antes de qualquer dado real)**
1. Rodar read-only: `select id,email,role,cargo,created_at from colaboradores order by created_at;` e rebaixar admins indevidos.
2. Painel Supabase: desabilitar signup aberto; no Google OAuth, restringir domínio ou desligar; revisar a allowlist de redirect.
3. Remover acesso de `ti_suporte` a Configurações e esconder "Zerar banco" e "Restaurar demo" em produção (patch de front, paliativo).

**Fase 1: segurança real (≈1 semana)**
4. Vínculo `auth_user_id` + trigger de provisionamento (papel padrão `colaborador`) + remover bootstrap no cliente (CRIT-02).
5. Reescrever RLS por papel e por dono, com policies separadas por operação; mover `bitlocker_key` para tabela restrita; esconder notas internas (CRIT-01, ALTO-01).
6. Ações privilegiadas (trocar papel, zerar base, efetivar admissão) via RPC `SECURITY DEFINER` com `set search_path = ''` e checagem de papel.
7. Derivar login da sessão; limpar `localStorage` no logout e no `SIGNED_OUT`; remover `switchUser` (ALTO-02).
8. `vercel.json` com CSP e cabeçalhos (MED-10).

**Fase 2: integridade de dados (≈1 semana)**
9. Alinhar enums e gerar tipos do Supabase (CRIT-03).
10. Checar `error` em todas as escritas e reverter o otimismo em caso de falha (CRIT-04).
11. UUIDs e códigos no servidor; `insert` para criação, `update` parcial para edição (ALTO-05, ALTO-04).
12. Corrigir custódia inicial, corrida ticket/mensagem e `setorId` do ativo (MED-01/02/03).
13. FKs `RESTRICT` + soft delete; tabelas de junção para licença↔colaborador e termo↔ativo (ALTO-06, MED-08).
14. Migrations versionadas em `supabase/migrations` + índices (MED-07, MED-09).

**Fase 3: completar processos (2-3 semanas)**
15. Supabase Storage privado para termos assinados e anexos (MED-04).
16. Offboarding automatizado (devolver ativos, revogar licenças, `status='desligado'`); onboarding sem atribuição de papel privilegiado via RH.
17. Recuperação de senha; recarregar dados no login; paginação; edição e exclusão (soft) de cadastros.
18. LGPD: política de privacidade, registro de base legal, exportação por titular, retenção.

**Fase 4: qualidade**
19. Testes: Vitest para a lógica do contexto; testes de RLS com `supabase test db` (pgTAP) e dois usuários; um E2E Playwright do fluxo de chamado.
20. `strict: true`, ESLint com `react-hooks`, dividir o `AppContext`, remover código e arquivos mortos, code-splitting.

---

## 9. O que não consegui verificar e por quê

| Item | Motivo |
|---|---|
| Estado real do banco de produção (policies aplicadas, colunas, dados de `role`) | Sem acesso, e a regra é não tocar em produção. O schema pode diferir do arquivo. |
| Configurações do Supabase Auth (signup aberto, Google habilitado ou restrito, confirmação de e-mail, expiração de link, allowlist de redirect) | Ficam no painel, não no código. |
| Configuração da Vercel (variáveis definidas, região, proteção de preview) | Sem acesso ao projeto. Não há `vercel.json`. |
| Backups / PITR | Dependem do plano Supabase. |
| Reprodução dinâmica de CRIT-02 e dos testes de IDOR com 2 usuários | Não subi Supabase local (sem CLI instalada). A análise é estática; o roteiro de reprodução está em CRIT-02. |
| Comportamento em React StrictMode / efeitos duplicados | O app não usa StrictMode; não testei em execução. |
| `npm audit` completo pós-lockfile | Não gerei `package-lock.json` para não alterar o repo; usei o resultado do audit no momento do install (0 vulnerabilidades). |
