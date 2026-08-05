# Especificação — App de Rotas e Visitas (Google Apps Script + Supabase)
### Grupo Lamoia

## 1. Visão geral

Aplicação web (Google Apps Script Web App) para uso em campo pelos vendedores, permitindo:
1. Login com controle de acesso por tipo de usuário.
2. Visualização da agenda de visitas do dia (do vendedor logado).
3. Registro de uma visita: geolocalização, fotos (fachada / equipamento antes / depois) e observação, com envio para Google Drive + Supabase.

**Banco de dados:** Supabase (Postgres via API REST/PostgREST).
**Backend/hospedagem:** Google Apps Script (`doGet`, funções server-side chamadas via `google.script.run`).
**Armazenamento de mídia:** Google Drive (pasta dedicada).

---

## 2. Paleta de cores / identidade visual

> ⚠️ Não foi possível extrair os códigos hexadecimais exatos da logo do Grupo Lamoia a partir de uma busca pública (o site usa imagens que não retornam cor via leitura de texto). O layout foi construído com **variáveis CSS centralizadas** (`--cor-primaria`, `--cor-secundaria`, `--cor-destaque`, etc. em `CSS.html`) para que baste substituir os valores hexadecimais pelos tons oficiais da marca — extraídos diretamente do arquivo da logo (ex.: com um seletor de cor/eyedropper) — sem tocar no restante do código. Paleta provisória aplicada: azul petróleo (institucional) + laranja/coral (destaque, próprio de marcas de sorvete/gelato) + neutros em cinza-claro para fundo.

---

## 3. Stack técnica e integração

- **Frontend:** HTML/CSS/JS servidos pelo próprio Apps Script (`HtmlService`), SPA (single page, alternância de telas via JavaScript).
- **Backend:** funções em `Code.gs`, chamadas do cliente via `google.script.run`.
- **Banco:** Supabase, acessado pelo Apps Script via `UrlFetchApp` chamando a API REST (`/rest/v1/...`) e RPC (`/rest/v1/rpc/...`).
- **Autenticação no Supabase:** a chave `service_role` (ou uma chave com permissão de leitura/escrita nas tabelas envolvidas) fica armazenada apenas em **Script Properties** do Apps Script — nunca é exposta ao cliente/navegador. Isso é necessário porque o app não usa o Supabase Auth nativo, e sim a função `check_user_password`.
- **Fotos:** processadas **no navegador do vendedor** (client-side), pois o Apps Script server-side **não possui biblioteca nativa de conversão/redimensionamento de imagem para WebP**. A conversão é feita via `<canvas>` (Canvas API), redimensionando para no máximo 1200px no maior lado e exportando como `image/webp`. O resultado (base64) é enviado ao servidor, que grava o Blob no Drive.

### Propriedades de script necessárias (Configuração → Propriedades do projeto)
| Chave | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto, ex.: `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Chave service_role (ou chave com policy adequada) |
| `DRIVE_FOLDER_ID` | ID da pasta do Google Drive onde as fotos serão salvas |

---

## 4. Módulo 1 — Autenticação

- Tela de login com campos **Login** e **Senha**.
- Validação via RPC `check_user_password(p_login text, p_senha text)`, já implementada no banco, que:
  1. Busca o usuário pelo `Login`.
  2. Verifica `Users.Status = 'a'` (ativo).
  3. Compara a senha com o hash bcrypt em `Users.Senha` (com fallback a texto puro em registros legados, migrando-os silenciosamente após o primeiro login).
  4. Retorna `sucesso`, `mensagem` e os dados do usuário (sem a senha).
- **Regra de acesso:** apenas `Users.Tipo` em `Admin Senior`, `Admin Junior` ou `Users` podem entrar. Qualquer outro tipo recebe: *"Usuário não autorizado, entre em contato com o administrador."*
- Sessão do usuário mantida em memória no cliente (variável JS) durante o uso do app (sem cookie/localStorage), válida enquanto a aba estiver aberta.

## 5. Módulo 2 — Lista de visitas do dia

- Consulta `ag_agenda_diaria` unindo com `ag_agenda` (filtro `data_agenda = hoje()` e `id_vendedor = id_user do usuário logado`) e com `Clientes` (para obter a Razão Social).
- Exibe cards ordenados pelo código do cliente (`Clientes.Codigo`), cada um com:
  - **Código** — `ag_agenda_diaria.id_clientes`
  - **Razão** — `Clientes.Razao`
  - **Status** — `ag_agenda_diaria.status_atendimento` (com selo colorido por status)
- Ao clicar em um card → abre a tela de confirmação de visita daquele atendimento.

## 6. Módulo 3 — Confirmação de visita

Formulário pré-preenchido com dados somente leitura:
- **Código** — `ag_agenda_diaria.id_clientes`
- **Razão** — `Clientes.Razao`
- **Status atual** — `ag_agenda_diaria.status_atendimento`

Campos capturados no momento do envio:
- **Data/hora** — timestamp do momento do salvamento → `ag_agenda_diaria.data_hora_atendimento`
- **Latitude / Longitude** — via `navigator.geolocation` → `ag_agenda_diaria.latitude` / `longitude`
- **Foto da fachada** — exatamente 1 foto
- **Fotos do equipamento antes** — 1 ou mais
- **Fotos do equipamento depois** — 1 ou mais
- **Observação** — texto livre, limite de 300 caracteres → `ag_agenda_diaria.observacao`

### Regras de processamento de fotos
1. Cada foto é redimensionada (máx. 1200px no maior lado) e convertida para WebP **no navegador**, antes do envio.
2. As fotos são enviadas e gravadas **antes** da atualização final do registro de visita (ordem: fotos → registro).
3. Cada foto gera:
   - Upload do arquivo `.webp` para a pasta do Google Drive configurada.
   - Um registro em `fotos_vis`: `Nome_Foto` (nome do arquivo gerado), `Loc_Foto` (link do Drive), `Tipo` (`Fachada`, `Antes` ou `Depois`), `id_vis` = `ag_agenda_diaria.id_ad`.

### Botões
- **Salvar**: grava fotos (passo acima) e então atualiza `ag_agenda_diaria` com `status_atendimento = 'Pendente Auditoria'`, `data_hora_atendimento`, `latitude`, `longitude`, `observacao`. Ao concluir, retorna à tela inicial (lista atualizada).
- **Cancelar**: pede confirmação ("Tem certeza que deseja cancelar? As informações preenchidas serão perdidas.") antes de descartar tudo e voltar à tela inicial.

---

## 7. Pontos em aberto / recomendações para o cliente confirmar

1. **Cores oficiais**: enviar os códigos hex exatos da logo (ou o arquivo vetorial) para substituir a paleta provisória.
2. **Foto da fachada**: o que ocorre se o vendedor tentar enviar mais de uma? (implementado como substituição da única foto).
3. **Validações mínimas**: definido como obrigatório ter ao menos 1 foto de fachada, 1 de "antes" e 1 de "depois" antes de habilitar o botão Salvar — confirmar se está correto.
4. **Permissões do Drive**: os arquivos são compartilhados como "qualquer pessoa com o link pode visualizar" para permitir exibição posterior em telas de auditoria — confirmar se atende à política de dados da empresa.
5. **Fuso horário**: timestamps usam o fuso do script (`America/Sao_Paulo` recomendado) — confirmar.
