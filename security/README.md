# IGNIS · Autorização segura das ocorrências (preparação)

**Status: BACKEND PREPARADO, NÃO ATIVADO EM PRODUÇÃO.**

O site existente continua usando o login do próprio navegador e guarda ocorrências no manifesto compartilhado `fueltracker/dados_v4`. A base de autenticação atual não usa Firebase Authentication. Isso significa que **nenhuma verificação de `window._authUser` ou permissão visual é uma garantia de segurança**. Não se deve publicar regras restritivas sem antes migrar autenticação e armazenamento.

## Regras de negócio implementadas no backend isolado

- Toda ação usa `request.auth.uid` verificado pelo Firebase Authentication.
- O usuário autenticado e ativo pode criar e consultar ocorrências.
- O autor pode atualizar a própria ocorrência: `createdByUid` gerado pelo servidor na criação.
- O ADM Master pode editar e excluir qualquer ocorrência com a claim `ignisMaster` emitida pelo Admin SDK.
- Outros usuários só podem editar todas as ocorrências com `editAll=true` concedida pelo master, e só podem excluir com `deleteCases=true`, ambas permissões **independentes**.
- A exclusão é lógica (`deletedAt`), preservando evento, responsável e histórico de auditoria.
- Cada operação usa transações/versão e validação de campos para reduzir conflitos e impedir alteração de `createdByUid`.
- A opção `Outro` exige uma descrição específica na API e também no formulário atual.
- Ocorrências antigas sem UID de autor verificável não são atribuídas automaticamente pelo nome de exibição. Podem ser editadas pelo master/editor delegado após migração.

Arquivos: `functions/index.cjs`, `functions/lib/occurrence-access.cjs`, testes em `functions/test`, fragmento de regras em `ocorrencias.rules.fragment`.

## Etapas obrigatórias ANTES de ativar

1. Confirmar o projeto Firebase correto, o ambiente de produção, as regras efetivamente publicadas, a configuração de Auth e os backups das coleções e documentos envolvidos.
2. Criar uma migração de usuários para **Firebase Authentication**, verificando credenciais e identidade sem expor ou reutilizar os hashes de senha atualmente acessíveis no navegador. Escolher um procedimento seguro de ativação/recuperação para o ADM Master.
3. Vincular cada login existente ao UID verificado de Firebase Authentication. Não inferir autoria de registros antigos por nome.
4. Atribuir a claim `ignisMaster` através do Admin SDK **fora do cliente** e validar o token renovado antes de ativar as novas regras.
5. Fazer backup e migração auditada de `planejamento2027.tratativas` para `ignis_secure_cases`, mantendo os originais e suas trilhas de histórico intactos durante a transição.
6. Publicar e testar as Cloud Functions em ambiente isolado, com usuários de teste (autor, terceiro, editor delegado, exclusor delegado, master). Confirmar acesso, negações e revogação.
7. Auditar e revisar **todas** as regras atuais: as permissões do Firestore são avaliadas por OR; `allow read, write: if true` em qualquer regra correspondente anula uma negação específica. Não aplicar `ocorrencias.rules.fragment` isoladamente.
8. Integrar a UI de Configurações/Usuários para que **somente o master** conceda `editAll` e `deleteCases`, via Function autenticada. Migrar os botões da aba Ocorrências para as Functions (sem gravações via `saveState`).
9. Testar rollback, novos usuários, perda de conexão, duas edições simultâneas, passagem de mês, dados legados sem autoria e preservação do Dashboard.
10. Ativar em uma única janela coordenada. Validar o usuário master e o acesso comum antes de encerrar o processo. Somente depois eliminar gravações de ocorrências no manifesto antigo.

**Não foram feitas alterações nas regras remotas do Firestore, usuários reais ou Firebase Authentication.** O repositório GitHub por si só não fornece acesso administrativo para executá-las. O backend em `security/functions` é preparação para a migração: não está no diretório padrão de Functions nem configurado para deploy automático.

## Cenários cobertos pelo teste automático
- Sem autenticação ou sem cadastro ativo: negar acesso.
- Autor: editar sua ocorrência, sem direito de exclusão.
- Editor delegado: editar a de outros, sem exclusão.
- Exclusor delegado: excluir sem necessariamente poder editar.
- Master: administração completa.
- Ocorrência legada sem proprietário verificável: apenas editor delegado/master.
- Ocorrência logicamente excluída: negar novas alterações.
