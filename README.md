# Seller Sync API

API para gerenciamento e sincronização de anúncios do Mercado Livre.

---

## Stack

- **Node.js** + **Express** + **TypeScript**
- **MongoDB** + **Mongoose**
- **Zod** (validação), **Pino** (logs), **node-cron** (jobs)
- **JWT** (autenticação), **Axios** (HTTP client)

---

## Arquitetura

```
src/
├── config/           # Variáveis de ambiente (Zod)
├── modules/
│   ├── auth/         # OAuth ML + JWT
│   ├── ads/          # CRUD de anúncios
│   ├── mercadolivre/ # Client da API ML
│   └── sync/         # Reconciliação de dados
├── shared/
│   ├── database/     # Conexão MongoDB
│   ├── errors/       # AppError
│   ├── http/         # Axios client
│   ├── logger/       # Pino
│   ├── middlewares/  # Auth + Error handler
│   └── utils/        # Retry com exponential backoff
├── jobs/             # Cron de sincronização (15 min)
├── app.ts
└── server.ts
```

---

## Setup Local

### 1. Clonar e instalar

```bash
git clone <repo>
cd ml-hub-api
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite o .env com suas credenciais
```

### 3. Iniciar em desenvolvimento

```bash
npm run dev
```

---

## Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `PORT` | Porta do servidor (padrão: 3000) |
| `NODE_ENV` | Ambiente (`development` / `production`) |
| `MONGO_URI` | String de conexão MongoDB Atlas |
| `JWT_SECRET` | Chave secreta para assinar JWT |
| `ML_APP_ID` | App ID do Mercado Livre |
| `ML_CLIENT_SECRET` | Client Secret do Mercado Livre |
| `ML_REDIRECT_URI` | URI de callback OAuth |
| `FRONTEND_URL` | URL do frontend (CORS + redirect) |

---

## Docker

```bash
# Subir com Docker Compose
docker-compose up --build
```

---

## Endpoints

### Health

```
GET /health
```

### Auth

```
GET  /auth/mercadolivre           → Inicia OAuth
GET  /auth/mercadolivre/callback  → Callback OAuth (recebe JWT)
```

### Ads (requer Authorization: Bearer <token>)

```
GET    /ads                → Listar anúncios (?page&limit&status&title)
GET    /ads/:id            → Buscar anúncio
POST   /ads                → Criar anúncio
PUT    /ads/:id            → Atualizar anúncio
PATCH  /ads/:id/price      → Atualizar preço
PATCH  /ads/:id/stock      → Atualizar estoque
POST   /ads/:id/pause      → Pausar anúncio
POST   /ads/:id/activate   → Ativar anúncio
POST   /ads/sync           → Sincronizar manualmente
```

---

## Fluxo OAuth

1. Frontend acessa `GET /auth/mercadolivre`
2. Backend redireciona para página de login do ML
3. ML redireciona para `/auth/mercadolivre/callback?code=...`
4. Backend troca o code por `access_token` + `refresh_token`
5. Vendedor é salvo/atualizado no MongoDB
6. Backend gera JWT interno e redireciona para `FRONTEND_URL?token=...`
7. Frontend usa o JWT em todas as requisições autenticadas

---

## Sincronização Automática

Um cron job executa a cada **15 minutos**:

- Busca todos os vendedores no banco
- Para cada anúncio com `mlItemId`, consulta a API do ML
- Detecta divergências de preço/estoque → marca como `CONFLICT`
- Atualiza dados locais com os dados do ML
- Em caso de falha → marca como `ERROR` para retry posterior

---

## Decisões Técnicas

- **ESM nativo** (`"type": "module"`) com `"module": "NodeNext"` para resolução correta de módulos
- **tsx** para desenvolvimento com hot reload sem transpilação prévia
- **Zod** para validação de DTOs e variáveis de ambiente com mensagens claras
- **Dependency Injection manual** via constructor para facilitar testes e manter SOLID
- **Retry com exponential backoff** para todas as chamadas à API do ML
- **Optimistic locking** via `updatedAt` para lidar com concorrência
- **SyncStatus** enum para rastreabilidade de cada anúncio

---

## Deploy

- **Backend**: [Render](https://render.com) ou [Railway](https://railway.app)
- **Banco**: [MongoDB Atlas](https://cloud.mongodb.com)
