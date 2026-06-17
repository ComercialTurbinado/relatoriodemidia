# Spec — Hooks separados na sessão do Teleprompter

## Contexto
O endpoint `POST /api/integrations/sessions` já recebe `script`, `title` e `client`. A partir de agora, quando o roteiro vier do RADAR (análise de vídeo viral), o payload pode incluir campos extras com os **5 hooks (ganchos de abertura) como opções separadas**, para que o usuário possa escolher e gravar cada um individualmente no painel — em vez de um único texto fixo de abertura.

## Novo payload (campos adicionais, todos opcionais — `script` continua sendo enviado como fallback)

```json
{
  "script": "texto completo já concatenado (hook escolhido + corpo + cta) — mantido para compatibilidade",
  "title": "Roteiro - Reel DYnjFO8vTgM",
  "client": {
    "name": "Claudio Damasco",
    "phone": "5511982195839",
    "external_ref": "cjdamasco"
  },
  "hooks": [
    { "index": 1, "texto": "Hook opção 1, pronto para falar na câmera", "recomendado": false },
    { "index": 2, "texto": "Hook opção 2", "recomendado": true },
    { "index": 3, "texto": "Hook opção 3", "recomendado": false },
    { "index": 4, "texto": "Hook opção 4", "recomendado": false },
    { "index": 5, "texto": "Hook opção 5", "recomendado": false }
  ],
  "hook_recomendado_index": 2,
  "corpo": "Roteiro principal (~150 palavras), SEM o hook — começa direto no desenvolvimento",
  "cta": "Fala de encerramento / chamada para ação (1-2 linhas)",
  "legenda_post": "Legenda já pronta para o post (até 250 palavras, com hashtags) — NÃO faz parte da gravação, só viaja junto pra ficar vinculada à mesma sessão",
  "headline_thumbnail": "Headline curta para a thumbnail/capa (até 7 palavras)"
}
```

## Comportamento esperado no painel
- Se `hooks` vier preenchido (array não vazio): exibir as 5 opções de hook como itens selecionáveis/separados para gravação individual. O item com `recomendado: true` (ou `index === hook_recomendado_index`) deve vir pré-selecionado/destacado como sugestão, mas o usuário pode escolher gravar qualquer um dos 5 (ou todos, se quiser testar variações).
- Depois do hook escolhido, segue a gravação de `corpo` e por último `cta` — esses dois são sempre fixos (não têm variações).
- Se `hooks` não vier (campo ausente ou array vazio) — comportamento atual mantido: usar `script` como texto único corrido.
- `legenda_post` e `headline_thumbnail` **não são gravados em vídeo** — é só texto de referência que deve ficar salvo junto da sessão (mesmo que só para exibir no painel, sem precisar processar).

## Campos
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `hooks` | array de objetos | Não | Lista de opções de hook. Cada item: `{ index: number, texto: string, recomendado: boolean }` |
| `hook_recomendado_index` | number | Não | Índice (1-based) do hook recomendado pela IA — redundante com `recomendado: true` dentro de `hooks`, mas incluído para facilitar leitura direta |
| `corpo` | string | Não | Roteiro principal, sem o hook de abertura |
| `cta` | string | Não | Fala de encerramento / chamada para ação |
| `legenda_post` | string | Não | Legenda pronta para o post — não entra na gravação, é só contexto vinculado à sessão |
| `headline_thumbnail` | string | Não | Headline curta para thumbnail/capa |

## Por quê
Hoje a IA gera 5 variações de gancho/abertura por vídeo analisado, mas só uma chegava ao Teleprompter via `script` (texto único). A ideia é deixar o criador testar/gravar diferentes hooks pro mesmo roteiro, escolhendo na hora da gravação em vez de ficar travado na sugestão da IA.

---

## ⚠️ Pedido importante: ID estável na resposta de `POST /api/integrations/sessions`

Precisamos que a resposta dessa chamada (que hoje já retorna `client_url`, `record_url`, `client_id`) inclua um **ID estável da sessão de gravação** (`record_id`, ou o que já existir de único por sessão) — vamos guardar esse ID do nosso lado.

**Motivo:** depois que o vídeo é editado, o sistema de edição precisa nos avisar (webhook) que o vídeo está pronto, e precisa mandar esse mesmo ID de volta pra a gente saber **qual legenda/roteiro** pertence a esse vídeo específico. Sem um ID estável e único por sessão, não temos como saber com certeza qual legenda enviar se o mesmo cliente tiver mais de uma gravação em andamento.

Se `record_id` já é esse identificador único, ótimo — só precisamos confirmar que ele está sempre presente na resposta. Se não houver hoje, pedimos para adicionar.
