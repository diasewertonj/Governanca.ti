# Fase 0 — Contenção

Objetivo: fechar o acesso sem login, parar a escalada de privilégio e reduzir quem consegue entrar, **sem** mudar a estrutura do banco. Tempo estimado: 15–20 min.

## O que o diagnóstico de produção mostrou (2026-11-11, somente leitura)
Projeto `Governanca-ti` (`nfatkugyccsdkmyingsu`):
- **As policies reais valem para `public`, o que inclui `anon`.** Só com a anon key (pública, vai no bundle do site) e sem login, qualquer pessoa lê, grava e apaga todas as tabelas. É pior que o CRIT-01 da auditoria, que supunha `TO authenticated`.
- Os nomes das policies (`Leitura <tabela>` / `Gravacao <tabela>`) mostram que o banco veio de uma versão anterior do `supabase-schema.sql`. Não há migrations nem triggers.
- Existe 1 conta de Auth, `admin@admin.com`, que é o único `ti_admin`. O perfil foi criado pelo bug CRIT-02 (id `emp-<uid8>`, cargo padrão). Há 2 colaboradores, e as tabelas de ativos, chamados e termos estão vazias.
- CRIT-03 confirmado: os CHECKs não aceitam `urgente` nem `aguardando_peca`.
- Verificador do Supabase: proteção contra senhas vazadas desligada, 12 FKs sem índice e policies permissivas duplicadas.

> Esta fase **não** resolve tudo. Usuários logados continuam com `using (true)` e leem e gravam todas as tabelas. Isso é a Fase 1.

---

## Passo 1 — Backup
Painel → **Database → Backups**. No plano Free não há backup automático. Como as tabelas de negócio estão vazias (dados fictícios), o risco é baixo, mas confirme.

## Passo 2 — Fechar o acesso sem login (urgente)
**SQL Editor** → cole e rode `supabase/migrations/20261111000001_fase0_fechar_acesso_anon.sql`.
- Passa todas as policies para `authenticated`. A exceção é a leitura de `configuracoes_empresa`, que continua pública porque a tela de login a usa.
- Revoga INSERT/UPDATE/DELETE/TRUNCATE de `anon`.
- Pode ser executada mais de uma vez e tem rollback no fim do arquivo.

Conferência (deve sobrar só `Leitura configuracoes_empresa`):
```sql
select tablename, policyname, cmd, roles from pg_policies
where schemaname = 'public' and (roles @> array['public']::name[] or roles @> array['anon']::name[]);
```

## Passo 3 — Trigger de proteção de papéis
**SQL Editor** → cole e rode `supabase/migrations/20261111000000_fase0_guard_colaborador_role.sql`.
- Só um `ti_admin` ativo cria ou altera papéis.
- Requisições sem login nunca definem papéis.
- O SQL Editor e a service_role continuam liberados.

Conferência (1 linha):
```sql
select tgname, tgenabled from pg_trigger
where tgrelid = 'public.colaboradores'::regclass and not tgisinternal;
```

**Testes locais** (Postgres 16 com o `auth` do Supabase simulado e policies idênticas às de produção): **32/32 cenários**.
- Antes das migrations, o teste reproduz o problema: sem login dá para ler colaboradores, promover a `ti_admin`, apagar chamados e alterar a configuração.
- Depois delas, tudo isso fica bloqueado, a tela de login continua lendo a configuração e o usuário logado continua lendo e abrindo chamados.

Efeito colateral: usuário **novo** não ganha mais perfil automaticamente no primeiro login. Cadastre a pessoa em **Colaboradores** (logado como `ti_admin`) com o mesmo e-mail antes do primeiro acesso.

## Passo 4 — Papéis indevidos
O único `ti_admin` (`admin@admin.com`) foi criado pelo bug, mas é a sua conta de administração. **Não rebaixe agora**, ou ninguém mais administra pela tela. Quando existir um `ti_admin` com e-mail real, rebaixe ou desative essa conta:

```sql
select id, email, role from public.colaboradores where lower(email) = 'admin@admin.com';

update public.colaboradores set role = 'colaborador'
where lower(email) = 'admin@admin.com'
returning id, email, role;
```

## Passo 5 — Configuração do Auth (painel)
| Onde | Ajuste |
|---|---|
| Authentication → Sign In / Providers → *Allow new users to sign up* | **Desligar**. Bloqueia contas novas por e-mail e por Google. Novos usuários entram por *Authentication → Users → Invite* |
| Authentication → Sign In / Providers → Email → *Confirm email* | Ligado |
| Authentication → Sign In / Providers → Google | Desligue se não usa. Se usa com Google Workspace, deixe a tela de consentimento como **Internal** no Google Cloud |
| Authentication → Attack Protection (ou Passwords) → *Leaked password protection* | **Ligar** (apontado pelo verificador do Supabase) |
| Authentication → URL Configuration | *Site URL* = domínio de produção; *Redirect URLs* só produção + `http://localhost:3000` |
| `admin@admin.com` | Troque a senha por uma forte, se ainda for uma senha de teste |

## Passo 6 — Patch de interface (branch `security/fase0-contencao`)
- Configurações acessível só para `ti_admin`: `src/App.tsx`, `src/components/layout/Sidebar.tsx`.
- "Zerar dados" e "Restaurar demo" ocultos com o Supabase conectado: `src/components/settings/SettingsView.tsx`.

É proteção só de interface. Revise o PR e faça o merge na `main`, e a Vercel publica.

## Como validar depois
1. Rode de novo o diagnóstico (`supabase/diagnostics/fase0_diagnostico.sql`), blocos 5 e 6: nenhuma policy para `public`/`anon` além da leitura de configuração.
2. Abra o site sem login: a tela de login aparece normalmente, com a razão social.
3. Logado como `admin@admin.com`: troque o papel de um colaborador fictício e dê F5. A troca persiste.
