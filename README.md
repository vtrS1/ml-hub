# 🛒 ML Hub — Backend (API)

> Backend da plataforma ML Hub: autenticação OAuth, publicação e gerenciamento de anúncios no Mercado Livre.

---

## ✨ Sobre o projeto

O **ML Hub API** é o coração do sistema. Ele se conecta à API oficial do Mercado Livre para:

- 🔐 Autenticar vendedores via OAuth 2.0
- 📦 Criar, editar e sincronizar anúncios automaticamente
- �� Analisar preços de concorrentes em tempo real
- 🔄 Importar anúncios existentes do ML para a plataforma
- ⏰ Sincronização automática via job agendado (cron a cada 15 min)
- 🪝 Receber notificações push via webhooks do Mercado Livre

---

## 🚀 Tecnologias

| Tecnologia | Uso |
|---|---|
| **Node.js 22 + TypeScript** | Runtime e tipagem estática (ESM / NodeNext) |
| **Express 5** | Framework HTTP |
| **MongoDB + Mongoose** | Banco de dados |
| **Zod** | Validação de DTOs e variáveis de ambiente |
| **JWT** | Autenticação stateless |
| **Axios** | Cliente HTTP para a API do ML |
| **Pino** | Logs estruturados |
| **node-cron** | Sincronização agendada |
| **Docker** | Containerização para deploy |

---

## 📁 Estrutura do Projeto

```
src/
├── config/           # Variáveis de ambiente com validação Zod
├── jobs/             # Cron jobs (sincronização automática)
├── modules/
│   ├── ads/          # Anúncios: CRUD, sync, competitors
│   ├── auth/         # OAuth ML, JWT, gestão de sellers
│   ├── mercadolivre/ # Integração direta com a API do ML
│   ├── sync/         # Lógica de sincronização local ↔ ML
│   └── webhooks/     # Recebimento de notificações do ML
└── shared/
    ├── database/     # Conexão MongoDB
    ├── errors/       # AppError, tratamento de erros ML
    ├── http/         # HttpClient com retry automático
    ├── logger/       # Logger com Pino
    ├── middlewares/  # Auth, error handler
    └── utils/        # Utilitários (withRetry, backoff)
```

---

## ⚙️ Configuração

### Pré-requisitos

- Node.js 22+
- MongoDB Atlas (ou local)
- Aplicativo criado no [Mercado Livre Developers](https://developers.mercadolivre.com.br)

### 1. Clone e instale

```bash
git clone https://github.com/seu-usuario/ml-hub.git
cd ml-hub-api
npm install
```

### 2. Configure o `.env`

Crie um arquivo `.env` na raiz:

```env
PORT=3000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/sellersync

# JWT
JWT_SECRET=seu_segredo_jwt_aqui

# Mercado Livre
ML_APP_ID=seu_app_id
ML_CLIENT_SECRET=seu_client_secret
ML_REDIRECT_URI=http://localhost:3000/auth/mercadolivre/callback

# Frontend
FRONTEND_URL=http://localhost:4200
```

> 💡 Para dev local, use o script `npm run tunnel` (ngrok) para expor a porta 3000 via HTTPS — necessário para o OAuth do ML.

### 3. Rode em desenvolvimento

```bash
npm run dev
```

A API estará disponível em `http://localhost:3000`.

---

## 🐳 Docker

```bash
# Build e start
docker-compose up --build

# Apenas start (sem rebuild)
docker-compose up
```

---

## 📜 Scripts

| Script | Descrição |
|---|---|
| `npm run dev` | Servidor com hot-reload via `tsx watch` |
| `npm run build` | Compila TypeScript para `./dist` |
| `npm start` | Executa o build compilado |
| `npm run tunnel` | Expõe porta 3000 via ngrok (OAuth local) |
| `npm run lint` | Verifica código com ESLint |
| `npm run format` | Formata código com Prettier |

---

## 📡 Endpoints

### Autenticação

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/auth/mercadolivre` | Inicia fluxo OAuth com o ML |
| `GET` | `/auth/mercadolivre/callback` | Callback OAuth — retorna JWT |

### Anúncios *(requer `Authorization: Bearer <token>`)*

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/ads` | Lista anúncios (com filtros e paginação) |
| `POST` | `/ads` | Cria e publica novo anúncio no ML |
| `GET` | `/ads/:id` | Detalhe de um anúncio |
| `PUT` | `/ads/:id` | Atualiza título e descrição |
| `PATCH` | `/ads/:id/price` | Atualiza preço |
| `PATCH` | `/ads/:id/stock` | Atualiza estoque |
| `POST` | `/ads/:id/pause` | Pausa anúncio |
| `POST` | `/ads/:id/activate` | Ativa anúncio |
| `POST` | `/ads/sync` | Sincroniza todos os anúncios com o ML |
| `GET` | `/ads/:id/competitors` | Análise de concorrentes |

### Categorias

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/ads/categories` | Categorias raiz do ML |
| `GET` | `/ads/categories/:id` | Detalhes de uma categoria |
| `GET` | `/ads/categories/:id/attributes` | Atributos de uma categoria |

### Webhooks

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/webhooks/mercadolivre` | Recebe notificações push do ML |

---

## 🔒 Autenticação

Todos os endpoints (exceto auth) exigem o header:

```
Authorization: Bearer <jwt_token>
```

O token é gerado após o fluxo OAuth e válido por **7 dias**.

---

## 🔄 Fluxo OAuth

```
Usuário clica "Entrar com ML"
  → GET /auth/mercadolivre
  → Redirect para auth.mercadolivre.com.br
  → Usuário autoriza o app
  → ML redireciona para ML_REDIRECT_URI?code=xxx
  → Backend troca o code por access_token + refresh_token
  → Salva seller no MongoDB (upsert por mlUserId)
  → Gera JWT próprio
  → Redireciona para FRONTEND_URL/auth/callback?token=JWT
  → Frontend salva token no localStorage
```

---

## 🧠 Destaques Técnicos

- **Atributos tag-driven**: ao criar um anúncio, o sistema consulta a API do ML para descobrir quais atributos são obrigatórios para a categoria — sem listas hardcoded. Funciona automaticamente para qualquer categoria.
- **Retry inteligente**: erros de rede são retentados com backoff exponencial. Erros 4xx (validação) nunca são retentados.
- **Token refresh automático**: quando o access token do ML expira, o refresh token é usado transparentemente.
- **Sincronização resiliente**: falhas na API do ML salvam o anúncio como `PENDING` para retry no próximo cron.

---

## 🌐 Deploy no Render

1. Criar **Web Service** em [render.com](https://render.com)
2. Conectar repositório GitHub
3. Configurar runtime: **Docker** (usa o `Dockerfile` do projeto)
4. Adicionar variáveis de ambiente na aba *Environment*
5. Atualizar `ML_REDIRECT_URI` com a URL do Render
6. Atualizar o **Redirect URI** no painel do app no Mercado Livre

**Variáveis necessárias em produção:**

```env
PORT=3000
NODE_ENV=production
MONGO_URI=...
JWT_SECRET=...
ML_APP_ID=...
ML_CLIENT_SECRET=...
ML_REDIRECT_URI=https://seu-backend.onrender.com/auth/mercadolivre/callback
FRONTEND_URL=https://seu-frontend.vercel.app
```

---

## 📄 Licença

MIT
