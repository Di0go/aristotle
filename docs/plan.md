# Aristotle: o que ele quer

As regras que o Diogo pediu e que não podem voltar a cair. Escritas com ele, em português; cada uma diz onde vive no código e no método, para quem mexer lá saber que está a mexer numa delas. O resto da documentação está em inglês ([README.md](README.md)).

## Saltar entre cursos livremente

**Ele salta entre cursos quando quer: nada o prende ao curso que está a decorrer.**

- Qualquer pergunta em aberto, de qualquer curso (aula, revisão ou treino), responde-se a qualquer momento, mesmo com o tutor a dar outro curso. A resposta chega ao tutor.
- Responder lá, ou continuar esse curso, leva o tutor para lá **sem perguntar**: o tutor fecha o curso em que estava com o handoff (`end_session`) e retoma o outro (`start_session`, que lhe entrega a resposta). O curso que ele deixou fica onde estava, com as perguntas abertas por responder.
- Voltar ao primeiro curso retoma-o no mesmo passo, não num passo novo.

Pedido muitas vezes; a 2026-10-24: «I already told you a million times on how I want to be able to switch between courses freely». O caso: uma pergunta do *Threat and challenge appraisal* aparecia como «Not answered», sem caixa, porque o Claude estava a dar *Atoms, bonds and molecules*.

Onde vive: `reopenFor` e `release` em [`server/feed.ts`](../server/feed.ts) (responder noutra sessão nunca é recusado; a chamada do tutor que espera acorda a dizer para onde ele foi), `movedText` em [`server/mcp.ts`](../server/mcp.ts) (o que o tutor lê), o bloqueio que saiu de [`FeedList.svelte`](../ui/src/lib/FeedList.svelte), o botão de continuar que fica sempre em [`ClassPage.svelte`](../ui/src/lib/ClassPage.svelte), e os testes «he answers a question of another class while one is being taught…» e «asking for another class while the tutor waits…» em [`tests/mcp.test.ts`](../tests/mcp.test.ts). No método: [teaching.md](teaching.md), as skills `teach`, `review` e `train`, e o [AGENTS.md](../AGENTS.md).

## Revisões curtas: o tempo é para aprender coisas novas

**As revisões não comem o tempo de aprender.** Um conceito que ele sabe bem deixa de voltar a cada poucos dias, uma revisão é curta, e num dia normal a maior parte do tempo vai para matéria nova.

- Um conceito recebe uma nota por dia, a pior: várias perguntas sobre ele na mesma sessão não contam como várias revisões.
- No máximo 6 conceitos por dia; o resto espera pelos dias seguintes.
- Duas ou três perguntas curtas por passo, resposta numa linha ou duas; só se volta a ensinar o que ele falhou, e só esse conceito.

Pedido a 2026-10-25: «the reviews are way too much, there are concepts there I did a lot of time ago, and they keep appearing again […] I find myself doing more reviews then learning new things».

Onde vive: `gradeReview`, `becameSolid` e `RETENTION` em [`server/reviews.ts`](../server/reviews.ts), `DAILY_REVIEWS` e `reviewsToday` em [`shared/types.ts`](../shared/types.ts), `dueToday` em [`server/topics.ts`](../server/topics.ts), a skill `review`, e o replay em [`scripts/review-replay.ts`](../scripts/review-replay.ts). Os números e as razões estão em [teaching.md](teaching.md#spaced-review).
