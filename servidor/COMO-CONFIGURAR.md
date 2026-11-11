# Inscrição e avaliação online por IA: configuração

Peças:

| Arquivo | O que é | Onde vai |
|---|---|---|
| `inscricao/index.html` | Página pública: cadastro e avaliação (3 desenhos de 10 minutos, foto pela câmera) | GitHub Pages |
| `inscricao/privacidade.html` | Aviso de privacidade | GitHub Pages |
| `inscricoes.html` | Área do professor: fotos, rascunho da IA, correção, ok, Relatório de Evolução, envio | GitHub Pages (só abre com o login do professor) |
| `servidor/firestore.rules` | Regras do Firestore | Console do Firebase, Firestore, Regras |
| `servidor/storage.rules` | Regras do Storage | Console do Firebase, Storage, Regras |
| `servidor/worker-jornada-avaliacao.js` | Worker que guarda a chave da Anthropic e só atende o professor | Cloudflare, Worker `jornada-avaliacao` |

Endereços depois de publicado:

- Inscrição: `https://cicero-arte.github.io/sistema-jornada/inscricao/`
- Simulação da inscrição (nada é gravado): `https://cicero-arte.github.io/sistema-jornada/inscricao/?simulacao`
- Área do professor: `https://cicero-arte.github.io/sistema-jornada/inscricoes.html`
- Simulação da área do professor: `https://cicero-arte.github.io/sistema-jornada/inscricoes.html?simulacao`

## Passos à mão (uma vez)

1. Firebase, Authentication, Método de login: ligar "Anônimo".
2. Firebase, Firestore, Regras: colar `firestore.rules` e publicar.
3. Firebase, Storage, Regras: colar `storage.rules` e publicar. Se o console pedir permissão para o Storage consultar o Firestore, aceitar.
4. Cloudflare, Workers: criar o Worker `jornada-avaliacao`, colar `worker-jornada-avaliacao.js` e criar o segredo `ANTHROPIC_API_KEY` (Settings, Variables and Secrets, tipo Secret).
5. Anthropic Console: limite de gasto mensal.
6. App Check (depois que tudo funcionar): registrar o app web com reCAPTCHA Enterprise, colocar a chave do site em `RECAPTCHA_ENTERPRISE_KEY` nas duas páginas e no app, observar por uma semana e só então exigir.

## Testes (para quem mexer no código)

- `teste-regras.mjs`: 41 casos das regras, no emulador do Firebase (`firebase emulators:exec --only firestore,storage "node teste-regras.mjs"`).
- `teste-worker.mjs`: 13 casos do Worker com chaves de teste (`node teste-worker.mjs`).
- As páginas aceitam `?emulador` só quando abertas em `localhost`, para testar sem tocar no projeto real.
