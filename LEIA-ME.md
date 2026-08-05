# Como implantar — App de Rotas Grupo Lamoia

## Arquivos deste pacote
- `Code.gs` — backend (Apps Script)
- `Index.html` — estrutura das 3 telas (login, lista, formulário)
- `CSS.html` — estilos e paleta de cores (variáveis no topo do arquivo)
- `JS.html` — lógica do cliente (login, geolocalização, fotos, salvamento)
- `PROMPT_MELHORADO.md` — especificação revisada do projeto

## Passo a passo

1. **Crie um novo projeto** em [script.google.com](https://script.google.com) (ou dentro do Drive: Novo → Mais → Google Apps Script).
2. Apague o `Code.gs` padrão e crie/cole os 4 arquivos deste pacote (`Code.gs`, `Index.html`, `CSS.html`, `JS.html`) com os mesmos nomes.
   - No editor: ➕ ao lado de "Arquivos" → "HTML" para `Index`, `CSS`, `JS`. O `Code.gs` já vem criado por padrão.
3. **Configure as Propriedades do Script**: no menu ⚙️ (Configurações do projeto) → "Propriedades do script" → adicione:
   - `SUPABASE_URL` = URL do seu projeto Supabase
   - `SUPABASE_SERVICE_KEY` = chave `service_role` (Project Settings → API no Supabase)
   - `DRIVE_FOLDER_ID` = ID da pasta do Drive onde as fotos serão salvas (está na URL da pasta)
   - `TIMEZONE` (opcional) = `America/Sao_Paulo`
4. **Implante como Web App**: Implantar → Nova implantação → tipo "App da Web".
   - Executar como: **Eu** (sua conta)
   - Quem pode acessar: conforme a política da empresa (ex.: "Qualquer pessoa com uma Conta Google" ou domínio interno)
5. Acesse a URL gerada — deve abrir a tela de login.

## ⚠️ Pontos de atenção técnica

- **Conversão para WebP**: acontece no navegador (Canvas API), não no servidor — Apps Script não tem biblioteca nativa para isso. Funciona nos navegadores modernos (Chrome/Edge/Android); no Safari/iOS mais antigo pode haver limitações no suporte a `toBlob('image/webp')` — se isso for um requisito, recomendo testar no aparelho real dos vendedores antes de ir a produção.
- **Chave do Supabase**: fica só no backend (Script Properties), nunca no HTML/JS do cliente — importante para segurança, já que o app não usa Supabase Auth nativo.
- **Compartilhamento das fotos no Drive**: configurado como "qualquer pessoa com o link pode visualizar", para permitir exibição em telas de auditoria futuras. Ajuste em `salvarFoto()` no `Code.gs` se a política de dados exigir algo mais restrito (ex.: compartilhar apenas com um grupo do Google Workspace).
- **Cores**: a paleta em `CSS.html` (variáveis `--cor-primaria`, `--cor-destaque`, etc.) é provisória — troque pelos hex exatos da logo do Grupo Lamoia.
- **Tabela `fotos_vis`**: tem `Nome_Foto` como `unique` — o nome gerado inclui timestamp (e índice quando há múltiplas fotos do mesmo tipo) para evitar colisão.

## Testando localmente antes de liberar para os vendedores
1. Confirme que a função `check_user_password` está de fato publicada/exposta via RPC no Supabase (Database → Functions).
2. Faça login com um usuário `Users`, `Admin Junior` ou `Admin Senior` ativo (`Status = 'a'`).
3. Confirme que existem registros em `ag_agenda`/`ag_agenda_diaria` com `data_agenda = hoje()` para esse `id_vendedor`.
4. Teste o fluxo completo de uma visita (fotos + observação + salvar) e confira no Supabase se `ag_agenda_diaria` e `fotos_vis` foram atualizados, e se o arquivo apareceu na pasta do Drive.
