# Ignis — correção crítica de persistência

## Corrigido nesta versão

- Removido o limite fixo de 20 chunks (8.000 abastecimentos) no carregamento do Firebase.
- Chunks e manifesto agora são gravados atomicamente com `writeBatch`.
- O documento principal só passa a apontar para uma versão completa dos registros.
- Saves do Firebase agora são serializados; não há duas gravações concorrentes na mesma aba.
- O estado salvo é clonado antes da gravação, evitando mutação durante o envio.
- `_ultimoSaveAt` só é atualizado depois da confirmação real do Firebase.
- Importação semanal e diária aguardam confirmação do Firebase antes de mostrar sucesso.
- A página não regrava todos os chunks em todo carregamento, salvo quando houve merge real de configurações.
- O aviso ao fechar agora considera save agendado e save em andamento.
- A exclusão total entra na mesma fila segura de gravação.

## Teste recomendado

1. Faça backup JSON no sistema antes de publicar.
2. Publique o `index.html` corrigido.
3. Recarregue e aguarde o status do Firebase.
4. Reimporte um período que aparecia com 0 registros.
5. Aguarde a mensagem de confirmação no Firebase.
6. Recarregue a página e confira o histórico e a tabela de abastecimentos.

## Pendência crítica de segurança

As regras atuais `allow read, write: if true` deixam todo o banco público. Não altere as regras sem preparar a autenticação real, pois isso pode derrubar o acesso do sistema. A migração para Firebase Authentication e regras por usuário deve ser feita como próxima etapa.

## Relatório automático

- O GitHub Action agora lê os abastecimentos dos chunks do Firebase (antes procurava `state.abastecimentos` no documento principal e podia gerar relatório vazio).
- O cálculo diferencia `km/L` para frota pesada/leve e `L/h` para máquinas/tratores.
- Removida a configuração TLS obsoleta `SSLv3` do envio via Microsoft 365.
