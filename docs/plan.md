# Aristotle: o que ele quer

As regras que o Diogo pediu e que não podem voltar a cair. Escritas com ele, em português; cada uma diz onde vive no código e no método, para quem mexer lá saber que está a mexer numa delas. O resto da documentação está em inglês ([README.md](README.md)).

## Saltar entre cursos livremente

**Ele salta entre cursos quando quer: nada o prende ao curso que está a decorrer.**

- Qualquer pergunta em aberto, de qualquer curso (aula, revisão ou treino), responde-se a qualquer momento, mesmo com o tutor a dar outro curso. A resposta chega ao tutor.
- Responder lá, ou continuar esse curso, leva o tutor para lá **sem perguntar**: o tutor fecha o curso em que estava com o handoff (`end_session`) e retoma o outro (`start_session`, que lhe entrega a resposta). O curso que ele deixou fica onde estava, com as perguntas abertas por responder.
- Voltar ao primeiro curso retoma-o no mesmo passo, não num passo novo.

Pedido muitas vezes; a 2026-10-24: «I already told you a million times on how I want to be able to switch between courses freely». O caso: uma pergunta do *Threat and challenge appraisal* aparecia como «Not answered», sem caixa, porque o Claude estava a dar *Atoms, bonds and molecules*.

Onde vive: `reopenFor` e `release` em [`server/feed.ts`](../server/feed.ts) (responder noutra sessão nunca é recusado; a chamada do tutor que espera acorda a dizer para onde ele foi), `movedText` em [`server/mcp.ts`](../server/mcp.ts) (o que o tutor lê), o bloqueio que saiu de [`FeedList.svelte`](../ui/src/lib/FeedList.svelte), o botão de continuar que fica sempre em [`ClassPage.svelte`](../ui/src/lib/ClassPage.svelte), e os testes «he answers a question of another class while one is being taught…» e «asking for another class while the tutor waits…» em [`tests/mcp.test.ts`](../tests/mcp.test.ts). No método: [teaching.md](teaching.md), as skills `teach`, `review` e `train`, e o [AGENTS.md](../AGENTS.md).
