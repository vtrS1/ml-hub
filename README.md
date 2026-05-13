# ML Hub â€” Backend (API)

> Backend do desafio tecnico: publicacao e gerenciamento de anuncios no Mercado Livre.

## Stack

- **Node.js 22** + **Express 5** + **TypeScript** (ESM / NodeNext)
- **MongoDB Atlas** via Mongoose
- **Zod** - validacao de schemas e variaveis de ambiente
- **Pino** - logging estruturado
- **JWT** - autenticacao stateless
- **node-cron** - sync automatico a cada 15 min
- **Axios** - cliente HTTP para a API do Mercado Livre

---

## Arquitetura

```
src/
â”œâ”€â”€ config/           # Validacao de env vars (Zod)
â”œâ”€â”€ shared/
â”‚   â”œâ”€â”€ database/     # Conexao MongoDB
â”‚   â”œâ”€â”€ errors/       # AppError customizado
â”‚   â”œâ”€â”€ http/         # Axios client para ML API
â”‚   â”œâ”€â”€ logger/       # Pino logger
â”‚   â”œâ”€â”€ middlewares/  # authMiddleware, errorMiddleware
â”‚   â””â”€â”€ utils/        # withRetry (exponential backoff)
â”œâ”€â”€ modules/
â”‚   â”œâ”€â”€ auth/         # OAuth ML, JWT, seller persistence
â”‚   â”œâ”€â”€ ads/          # CRUD anuncios + sync
â”‚   â”œâ”€â”€ mercadolivre/ # Wrapper ML API
â”‚   â”œâ”€â”€ sync/         # Reconciliacao local â†” ML
â”‚   â””â”€â”€ webhooks/     # Notificacoes ML
â””â”€â”€ jobs/             # syncJob (cron 15min)
```

### Decisoes tecnicas

| Decisao | Motivo |
|---------|--------|
| ESM + NodeNext | Melhor compatibilidade futura, imports explicitos |
| Repository pattern | Desacopla logica de negocio do banco, facilita testes |
| SyncStatus enum | Rastreia estado: SYNCED / PENDING / ERROR / CONFLICT |
| withRetry util | Resiliencia em falhas da API do ML (3 tentativas, backoff) |
| Webhook handler | Recebe notificacoes push do ML sem polling |
| JWT stateless | Sem sessao no servidor, escalavel horizontalmente |

---

## Variaveis de ambiente

Crie `.env` na raiz:

```env
PORT=3000
NODE_ENV=development
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/sellersync
JWT_SECRET=seu_secret_aqui
ML_APP_ID=seu_app_id
ML_CLIENT_SECRET=seu_client_secret
ML_REDIRECT_URI=https://seu-dominio.com/auth/mercadolivre/callback
FRONTEND_URL=http://localhost:4200
```

> Para dev local, use **ngrok** para expor porta 3000 via HTTPS.

---

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Criar .env (ver secao acima)

# 3. Iniciar em modo desenvolvimento
npm run dev

# 4. (Opcional) Expor via ngrok para OAuth
npm run tunnel
```

### Scripts

| Script | Descricao |
|--------|-----------|
| `npm run dev` | Servidor com hot-reload via tsx |
| `npm run build` | Compila TypeScript para ./dist |
| `npm start` | Executa build compilado |
| `npm run tunnel` | Inicia ngrok na porta 3000 |

---

## Endpoints

### Auth
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/auth/mercadolivre` | Inicia OAuth do ML |
| GET | `/auth/mercadolivre/callback` | Callback OAuth, retorna JWT |

### Anuncios *(requer `Authorization: Bearer <token>`)*
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/ads` | Listar (page, limit, status, title) |
| GET | `/ads/:id` | Buscar por ID |
| POST | `/ads` | Criar e publicar no ML |
| PUT | `/ads/:id` | Editar titulo/descricao |
| PATCH | `/ads/:id/price` | Atualizar preco |
| PATCH | `/ads/:id/stock` | Atualizar estoque |
| POST | `/ads/:id/pause` | Pausar anuncio |
| POST | `/ads/:id/activate` | Reativar anuncio |
| POST | `/ads/sync` | Sincronizar com ML |

### Webhooks
| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/webhooks/mercadolivre` | Notificacoes push do ML |

---

## Deploy (Render)

1. Criar **Web Service** em [render.com](https://render.com)
2. Conectar repositorio GitHub
3. Configurar:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Adicionar todas as env vars na aba *Environment*
5. Atualizar `ML_REDIRECT_URI` e `FRONTEND_URL` com URLs de producao
6. Atualizar o Redirect URI no painel do app no Mercado Livre

---

## Fluxo OAuth

```
Usuario clica "Entrar com ML"
  â†’ GET /auth/mercadolivre
  â†’ Redirect para auth.mercadolivre.com.br
  â†’ Usuario autoriza
  â†’ ML redireciona para ML_REDIRECT_URI?code=xxx
  â†’ Backend troca code por access_token + refresh_token
  â†’ Salva seller no MongoDB (upsert)
  â†’ Gera JWT
  â†’ Redireciona para FRONTEND_URL/auth/callback?token=JWT
  â†’ Frontend salva token no localStorage
```

---

## Cenarios de resiliencia tratados

| Cenario | Solucao |
|---------|---------|
| Token ML expirado | Refresh automatico via `refresh_token` |
| Falha na API do ML | Salva como `PENDING`, retry no proximo cron |
| Divergencia local vs ML | Status `CONFLICT` + reconciliacao no sync |
| Duplicidade de anuncio | Verificacao de `mlItemId` unico por vendedor |
| Falhas transitorias | `withRetry` com 3 tentativas e backoff exponencial |