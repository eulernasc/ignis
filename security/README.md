# IGNIS — migração segura de autenticação e ocorrências

**Projeto:** `fueltracker-adee5`
**Status:** código e testes de migração preparados na `main`; **Firebase Auth, Cloud Functions, regras e corte de dados NÃO ativados em produção**.

## Diagnóstico confirmado no código

O IGNIS atual valida usuários em `window._authUser`, com hashes de senha e cache local. Sem Firebase Authentication, isso **não é uma identidade que o Firestore possa confiar**. As ocorrências estão em `fueltracker/dados_v4.planejamento2027.tratativas`, em vez de documentos individuais. Os arquivos do site encontrados nesta revisão fazem chamadas Firestore diretas apenas à coleção `fueltracker`.

Consequência: ocultar Editar/Excluir ou conferir `role==='adm'` no navegador não protege contra chamadas adulteradas. A proteção exige um caminho autenticado de escrita no **servidor**, com Firestore direto bloqueado para os documentos sensíveis. As regras atualmente **publicadas** no Firebase ainda não foram lidas nesta revisão e precisam ser verificadas; o histórico do repositório menciona regras públicas.

## Arquitetura implementada, mas ainda não ativada

- `security/functions/index.cjs`: Callable Functions com `request.auth.uid`, autenticação por Firebase Auth, autorização por UID e custom claim `ignisMaster`.
- `security/functions/lib/occurrence-access.cjs`: autor edita a própria; master ou editor delegado edita todas; exclusão é permissão separada. Usuários não verificados ficam sem acesso.
- `security/functions/scripts/bootstrap-master.cjs`: atribuição controlada da claim master, somente depois de confirmar conta real e email verificado.
- `security/functions/scripts/enroll-legacy-user.cjs`: vincula login legado a nova conta Firebase Auth por email confirmado. **Não reutiliza hashes nem senhas antigas**. Gera links de acesso em arquivo privado, nunca no log.
- `security/functions/lib/legacy-migration.cjs` e `scripts/migrate-legacy.cjs`: importação idempotente de ocorrências, com dry-run, hash, backup privado obrigatório e preservação do histórico.
- `security/firestore.rules.REVISAR-ANTES-DE-USAR`: **candidato** de regras que libera temporariamente `fueltracker` como hoje e impede acesso direto a `ignis_secure_cases`, `ignis_case_roles`, `ignis_case_role_events` e vínculos de contas. **Não implantar antes de comparar com as regras reais**.
- `security/pilot.html`: painel de testes com login Firebase Auth e permissões do master, isolado do site principal. Não é uma substituição do IGNIS.
- `security/firebase.json`: configura somente Functions na codebase `ignis-ocorrencias` (sem deploy de regras ou frontend).
- `.github/workflows/test-occurrence-security.yml`: valida sintaxe e cenários de autorização/migração sem alterar Firebase.

### Políticas efetivas depois do corte

| Conta | Criar e ler | Editar próprias | Editar todas | Excluir |
|---|---|---|---|---|
| Usuário ativo e verificado | Sim | Sim | Não | Não |
| Editor com permissão específica | Sim | Sim | Sim | Não |
| Usuário com permissão de exclusão legada | Sim | Sim | Conforme autorização de edição | Não |
| ADM Master por claim server-side | Sim | Sim | Sim | Sim |

Ocorrências antigas sem `createdByUid` autenticado **não** são automaticamente atribuídas pelo nome; continuam visíveis e somente master/editor delegado pode modificá-las. Exclusão lógica mantém eventos e autor. Alterações usam versões e transações.

## Ordem obrigatória, sem bloquear usuários

1. **Inspecionar produção:** copiar as regras atuais do Firestore, verificar plano Blaze, Authentication (email/senha) e usuários existentes. **Nada de substituir regras sem backup e teste.** Cloud Functions exige Blaze (cobrança por uso, com franquias).
2. **Provisionar master:** criar uma conta Firebase Auth com um email verdadeiro e verificado. Nunca usar a senha antiga ou reutilizar hash. No Cloud Shell ou máquina com credenciais Admin SDK autorizadas, rodar o bootstrap inicialmente **sem** `--execute`:
   ```bash
   cd security/functions
   npm install
   node scripts/bootstrap-master.cjs --project fueltracker-adee5 --email EMAIL_REAL_DO_MASTER
   ```
   Conferir UID/email e definir as três variáveis `CONFIRM_FIREBASE_PROJECT`, `CONFIRM_MASTER_UID`, `CONFIRM_MASTER_EMAIL` antes de executar com `--execute`. Não compartilhar credentials ou tokens.
3. **Provisionar os outros usuários:** para cada login existente, usar `scripts/enroll-legacy-user.cjs` em dry-run com `--login`, `--email`, `--project`. A execução exige `--private-links-file` absoluto e `CONFIRM_FIREBASE_PROJECT`, `CONFIRM_LEGACY_LOGIN`, `CONFIRM_NEW_EMAIL`. Entregar os links privados ao titular por canal seguro. Verificar email; não dar permissão a conta não verificada.
4. **Regras atuais:** conferir se o Firestore realmente utiliza somente `fueltracker` para a UI antiga. Mesclar com regras oficiais, negando acesso direto às coleções sensíveis; verificar que nenhuma regra global aberta sobrepõe a negação. Testar com emulador/perfis reais. **Não usar o fragmento isoladamente.**
5. **Implantar backend isolado:** depois de garantir proteção das novas coleções, a partir de `security/`:
   ```bash
   npx firebase-tools deploy --only functions:ignis-ocorrencias --project fueltracker-adee5
   ```
   Não executar deploy de `firestore:rules` pelo arquivo candidato sem auditoria.
6. **Verificar master e usuários:** entrar no painel de testes, confirmar a claim master, testar contas de autor, terceiro, editor, exclusor e master. O painel só funciona com Functions e Auth implantados.
7. **Copiar as ocorrências:** pausar criação de ocorrências legadas, rodar `scripts/migrate-legacy.cjs --project fueltracker-adee5` em dry-run. Anotar quantidade e SHA256. Para executar exigir `--execute --backup /caminho/privado.json` e três variáveis de confirmação: `CONFIRM_FIREBASE_PROJECT`, `CONFIRM_CASE_COUNT`, `CONFIRM_CASE_SHA256`. O script **não** exclui dados originais.
8. **Integrar a aba Ocorrências ao backend:** trocar todos os caminhos de criar, editar, concluir, prorrogar e excluir para Cloud Functions autenticadas; remover escritas legadas em `saveState`. A UI de Configurações/Usuários deve usar `ignisCaseGrantAccess`, sem aceitar role enviada pelo navegador. **Esta integração ainda não foi feita.**
9. **Virada controlada:** reconciliação final, desligar escritas antigas, validar autorizações e histórico por mês no app, confirmar master e usuário comum, liberar o sistema. Rollback do frontend apenas enquanto não houver novas gravações exclusivas no backend; fazer cópia antes de qualquer reversão.

## Restrições e avisos de segurança

- A coleção antiga `fueltracker` ainda pode estar publicamente legível/editável. O código novo **não corrige o acesso geral ao IGNIS** enquanto a migração completa não acontecer.
- Jamais enviar service account, token, senha, backup ou link de redefinição ao GitHub ou ao chat.
- Custom claims são emitidas **somente pelo Admin SDK**. O master é identificado por `request.auth.token.ignisMaster===true`, jamais por `window._authUser`.
- Se outra regra permissiva cobrir as novas coleções, a negação específica não funciona: Firestore combina regras por OR.
- O repositório não contém o estado das regras efetivamente publicadas no Firebase. Antes da ativação é obrigatório inspecioná-las.
- Nada no código preparado altera automaticamente o banco, as regras, as contas ou o Dashboard.
