# Grupo Lamoia — App de Rotas (Netlify)

App de rotas e visitas do Grupo Lamoia, migrado para **Netlify** (static + functions) com fotos no **MEGA**.

## Stack

| Componente | Tecnologia |
|---|---|
| Frontend | HTML / CSS / JS estáticos |
| Backend | Netlify Functions (Node.js) |
| Banco | Supabase (PostgREST) |
| Fotos | MEGA |

## Estrutura

```
├── index.html          # Página principal (SPA)
├── style.css           # Estilos
├── app.js              # Lógica do cliente
├── logo.png            # Logo (adicione o arquivo)
├── netlify.toml        # Configuração Netlify
├── package.json        # Dependências (megajs)
├── .env.example        # Template de variáveis de ambiente
└── netlify/functions/
    ├── shared/
    │   ├── supabase.js # Helper REST Supabase
    │   └── mega.js     # Helper upload MEGA
    ├── auth.js         # Login
    ├── visitas.js      # Lista de visitas do dia
    ├── get-visita.js   # Detalhes da visita
    ├── upload-photo.js # Upload foto → MEGA + fotos_vis
    └── abrir-atendimento.js  # Abrir/Fechar atendimento
```

## Deploy no Netlify

### 1. Preparar o repositório

```bash
# Copie os arquivos para um novo repo (ou sobrescreva o existente)
git init
git add .
git commit -m "Migração para Netlify + MEGA"
git remote add origin git@github.com:seu-usuario/Visitas.git
git push -u origin main
```

### 2. Conectar ao Netlify

1. Acesse [app.netlify.com](https://app.netlify.com)
2. **"Add new site"** → **"Import an existing project"**
3. Selecione o repositório GitHub
4. Configurações de build:
   - **Build command:** `echo "Static site"` (ou deixe vazio)
   - **Publish directory:** `.` (raiz)
5. Clique em **"Deploy site"**

### 3. Configurar variáveis de ambiente

No painel do Netlify: **Site settings** → **Environment variables** → **Add a variable**

| Variável | Descrição | Exemplo |
|---|---|---|
| `SUPABASE_URL` | URL do projeto Supabase | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Chave `service_role` | `eyJhbGci...` |
| `MEGA_EMAIL` | E-mail da conta MEGA | `usuario@email.com` |
| `MEGA_PASSWORD` | Senha da conta MEGA | `***` |
| `TIMEZONE` | Fuso horário (opcional) | `America/Sao_Paulo` |

### 4. Instalar dependências

O Netlify faz `npm install` automaticamente durante o build. A única dependência é `megajs`.

### 5. Adicionar a logo

Coloque o arquivo `logo.png` na raiz do projeto. O HTML faz fallback para o texto "GL" se a imagem não carregar.

### 6. Testar

Acesse a URL gerada pelo Netlify (ex: `https://seu-app.netlify.app`).

## Banco de Dados (Supabase)

Nenhuma alteração necessária no Supabase. As tabelas e funções RPC existentes continuam as mesmas:

- `Users` — autenticação
- `ag_agenda` — agenda do vendedor
- `ag_agenda_diaria` — visitas do dia
- `Clientes` — dados dos clientes
- `fotos_vis` — registro de fotos
- `check_user_password()` — função RPC de login

## Fluxo do App

1. **Login** → autenticação via `check_user_password` no Supabase
2. **Lista** → visitas do dia para o vendedor logado
3. **Pendente** → "Abrir Atendimento": fotos Fachada + Antes → upload MEGA → status "Em Atendimento"
4. **Em Atendimento** → "Fecha Atendimento": fotos Depois + observação → upload MEGA → status "Pendente Auditoria"
5. **Pendente Auditoria** → visualização somente leitura

## Notas

- Fotos são convertidas para WebP no navegador (max 1200px) antes do upload
- O upload para o MEGA pode levar alguns segundos dependendo do tamanho da foto
- A função `upload-photo.js` faz login no MEGA a cada cold start (com cache entre invocações)
- Links do MEGA são públicos após upload (`file.link()`)
