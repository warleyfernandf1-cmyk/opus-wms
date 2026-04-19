# Ficha Técnica — Opus WMS

> **Versão:** 1.0 | **Stack:** Python / FastAPI · Supabase · Vercel · HTML/JS puro  
> **URL produção:** https://opus-wms.vercel.app  
> **Repositório:** https://github.com/warleyfernandf1-cmyk/opus-wms

---

## 1. Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    VERCEL (produção)                    │
│                                                         │
│  ┌─────────────────────┐   ┌─────────────────────────┐ │
│  │  @vercel/static      │   │   @vercel/python         │ │
│  │  public/**           │   │   api/index.py           │ │
│  │  HTML · CSS · JS     │   │   FastAPI (ASGI)         │ │
│  └──────────┬──────────┘   └───────────┬─────────────┘ │
│             │ GET /                     │ GET /api/*     │
└─────────────┼───────────────────────────┼───────────────┘
              │                           │
              ▼                           ▼
        Navegador               Supabase (PostgreSQL)
        (browser)               yktbnkkhqjsfcqkqlblu
```

### Princípios fundamentais
| Princípio | Descrição |
|---|---|
| **Backend-first** | Nenhuma regra de negócio no frontend. O JS só exibe dados e chama a API. |
| **Modular** | Cada módulo tem seu router + service independentes. |
| **Ciclo de vida do pallet** | `recepcao → resfriamento → armazenamento → picking → expedido`. Rollback sempre na direção contrária. |
| **Exclusão única** | Pallets só são deletados via rollback na recepção. |
| **Audit trail** | Toda mutação grava um registro na tabela `historico`. |

---

## 2. Estrutura de Diretórios

```
OPUS/
├── api/                        # Backend Python (FastAPI)
│   ├── index.py                # Entry point da aplicação
│   ├── db/
│   │   └── client.py           # Conexão Supabase (singleton)
│   ├── models/
│   │   └── schemas.py          # Todos os Pydantic schemas
│   ├── routers/                # Camada HTTP — define endpoints
│   │   ├── recepcao.py
│   │   ├── resfriamento.py
│   │   ├── armazenamento.py
│   │   ├── remontes.py
│   │   ├── picking.py
│   │   ├── expedicao.py
│   │   ├── inventario.py
│   │   ├── dashboard.py
│   │   ├── relatorios.py
│   │   ├── camaras.py
│   │   ├── tuneis.py
│   │   └── historico.py
│   └── services/               # Camada de negócio — lógica pura
│       ├── recepcao.py
│       ├── resfriamento.py
│       ├── armazenamento.py
│       ├── remontes.py
│       ├── picking.py
│       ├── expedicao.py
│       └── inventario.py
├── public/                     # Frontend estático
│   ├── css/
│   │   └── main.css            # Design system global
│   ├── js/
│   │   ├── api.js              # Wrapper de fetch + helpers
│   │   ├── dashboard.js
│   │   ├── recepcao.js
│   │   ├── resfriamento.js
│   │   ├── armazenamento.js
│   │   ├── remontes.js
│   │   ├── picking.js
│   │   ├── expedicao.js
│   │   ├── inventario.js
│   │   ├── relatorios.js
│   │   ├── camaras.js
│   │   ├── tuneis.js
│   │   └── historico.js
│   ├── index.html              # Dashboard
│   ├── recepcao.html
│   ├── resfriamento.html
│   ├── armazenamento.html
│   ├── remontes.html
│   ├── picking.html
│   ├── expedicao.html
│   ├── inventario.html
│   ├── relatorios.html
│   ├── camaras.html
│   ├── tuneis.html
│   └── historico.html
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  # Schema completo + seed
├── .env                        # Credenciais locais (não versionado)
├── .env.example                # Template das variáveis de ambiente
├── .gitignore
├── requirements.txt            # Dependências Python
└── vercel.json                 # Configuração de deploy
```

---

## 3. Arquivos de Configuração

### `vercel.json`
Controla como o Vercel faz o deploy. Define dois builds separados:
- **`@vercel/python`** — empacota `api/index.py` como função serverless (Lambda). Recebe todas as requisições `/api/*`.
- **`@vercel/static`** — serve os arquivos de `public/**` diretamente pela CDN do Vercel. Recebe `/` e qualquer rota não-API.

> **Por que dois builds?** A função Python no Vercel não tem acesso ao diretório `public/` — ele fica fora do Lambda. Os arquivos estáticos precisam ser servidos pela CDN separadamente.

### `requirements.txt`
Dependências Python instaladas no Lambda:
| Pacote | Função |
|---|---|
| `fastapi` | Framework web ASGI |
| `uvicorn` | Servidor ASGI (usado localmente) |
| `supabase` | Client oficial Supabase para Python |
| `python-dotenv` | Carrega `.env` em desenvolvimento local |
| `pydantic` | Validação de dados / schemas |
| `python-multipart` | Suporte a form-data nos endpoints |

### `.env` / `.env.example`
Variáveis de ambiente necessárias:
```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role_jwt>
```
O `.env` nunca vai para o git (listado no `.gitignore`). No Vercel, as variáveis são setadas via dashboard ou CLI (`vercel env add`).

---

## 4. Backend — Detalhamento

### `api/index.py` — Entry Point

É o arquivo que o Vercel executa como função serverless. Responsabilidades:
1. Cria a instância `FastAPI`.
2. Configura CORS (permite todas as origens — adequado para MVP).
3. Registra os 12 routers, cada um com seu prefixo `/api/<modulo>`.
4. Expõe `GET /api/health` para verificação de disponibilidade.

> **Regra:** novos módulos sempre entram aqui como `app.include_router(...)`.

---

### `api/db/client.py` — Conexão Supabase

Implementa o padrão **singleton** para o client Supabase.

```python
def get_db() -> Client:
    # Cria a conexão apenas uma vez durante a vida do Lambda
    # Reutiliza nas chamadas seguintes
```

Lê `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` do ambiente. A `service_role` key bypassa RLS e tem acesso total ao banco — por isso nunca deve ser exposta no frontend.

> **Como usar nos services:** `db = get_db()` no início de cada função.

---

### `api/models/schemas.py` — Contratos de Dados

Define todos os **Pydantic models** que descrevem o formato de entrada e saída de dados. Organizado por módulo:

| Schema | Direção | Uso |
|---|---|---|
| `PalletCreate` | Entrada | Body do POST /recepcao |
| `PalletOut` | Saída | Resposta com pallet completo |
| `SessaoCreate` | Entrada | Iniciar sessão de resfriamento |
| `SessaoFinalizar` | Entrada | Temperatura de saída |
| `SessaoOut` | Saída | Dados da sessão |
| `AlocarPalletIn` | Entrada | Alocar pallet em posição de câmara |
| `PosicaoOut` | Saída | Estado de uma posição de câmara |
| `RemontComplementacao` | Entrada | IDs do pallet original + adição |
| `RemontJuncao` | Entrada | IDs dos dois pallets a fundir |
| `OrdemPickingCreate` | Entrada | Lista de pallets + observações |
| `OrdemPickingOut` | Saída | Dados da OP |
| `OrdemExpedicaoCreate` | Entrada | Lista de pallets |
| `OrdemExpedicaoOut` | Saída | Dados da OE |
| `InventarioItemRegistro` | Entrada | pallet_id + qtd contada |
| `InventarioOut` | Saída | Inventário com acuracidade |
| `HistoricoOut` | Saída | Registro de audit trail |
| `RelatorioOut` | Saída | Relatório pós-execução |

---

## 5. Routers — Camada HTTP

Os routers **não contêm lógica de negócio**. Responsabilidade única: receber a requisição HTTP, chamar o service correspondente, retornar a resposta.

### `api/routers/recepcao.py`
| Método | Endpoint | Ação |
|---|---|---|
| POST | `/api/recepcao/` | Registra novo pallet (gera ID único) |
| GET | `/api/recepcao/` | Lista todos os pallets em fase `recepcao` |
| GET | `/api/recepcao/{id}` | Retorna um pallet específico |
| DELETE | `/api/recepcao/{id}/rollback` | **Única forma de excluir** um pallet |

### `api/routers/resfriamento.py`
| Método | Endpoint | Ação |
|---|---|---|
| GET | `/api/resfriamento/tuneis` | Estado atual dos dois túneis |
| POST | `/api/resfriamento/sessao` | Inicia sessão + move pallets recepcao→resfriamento |
| POST | `/api/resfriamento/sessao/{id}/finalizar` | Finaliza sessão, move para armazenamento, gera OA |
| GET | `/api/resfriamento/sessao/{id}/oa` | Retorna/gera a OA da sessão |
| POST | `/api/resfriamento/{id}/rollback` | Volta pallet resfriamento→recepcao |

### `api/routers/armazenamento.py`
| Método | Endpoint | Ação |
|---|---|---|
| GET | `/api/armazenamento/camaras` | Mapa completo das duas câmaras |
| GET | `/api/armazenamento/posicoes-livres` | Lista posições disponíveis (filtra por câmara) |
| POST | `/api/armazenamento/alocar` | Ocupa uma posição com um pallet |
| POST | `/api/armazenamento/{id}/rollback` | Volta pallet armazenamento→resfriamento |

### `api/routers/remontes.py`
| Método | Endpoint | Ação |
|---|---|---|
| POST | `/api/remontes/complementacao` | Funde pallet original + pallet de adição (sufixo A) |
| POST | `/api/remontes/juncao` | Funde dois pallets distintos em novo ID "P1 \| P2" |

### `api/routers/picking.py`
| Método | Endpoint | Ação |
|---|---|---|
| POST | `/api/picking/ordem` | Cria OP e **reserva** as posições dos pallets |
| GET | `/api/picking/ordens` | Lista todas as OPs |
| GET | `/api/picking/ordens/{id}` | Detalhe de uma OP |
| POST | `/api/picking/ordens/{id}/executar` | Executa OP, libera posições, move pallets |
| POST | `/api/picking/ordens/{id}/cancelar` | Cancela OP e libera todas as reservas |

### `api/routers/expedicao.py`
| Método | Endpoint | Ação |
|---|---|---|
| POST | `/api/expedicao/ordem` | Cria OE para pallets em fase picking |
| GET | `/api/expedicao/ordens` | Lista todas as OEs |
| POST | `/api/expedicao/ordens/{id}/executar` | Executa OE, move pallets para `expedido` |

### `api/routers/inventario.py`
| Método | Endpoint | Ação |
|---|---|---|
| POST | `/api/inventario/iniciar` | Cria inventário e gera itens de todos os pallets armazenados |
| GET | `/api/inventario/` | Lista todos os inventários |
| POST | `/api/inventario/{id}/registrar` | Registra contagem de um pallet |
| POST | `/api/inventario/{id}/finalizar` | Calcula acuracidade e gera relatório |

### `api/routers/dashboard.py`
Executa as queries diretamente no banco (sem service separado, por ser apenas leitura agregada):
- `GET /api/dashboard/kpis` — retorna contagem de pallets por fase + ocupação das câmaras em tempo real.

### `api/routers/relatorios.py`
- `GET /api/relatorios/` — lista relatórios (filtrável por módulo)
- `GET /api/relatorios/{id}` — detalhe com dados JSON do relatório

### `api/routers/camaras.py`
Constantes de layout hardcoded:
```python
GAPS = {"01": {7, 8}, "02": {12, 13}}  # posições de porta
```
- `GET /api/camaras/` — mapa das duas câmaras
- `GET /api/camaras/{id}` — câmara específica com gaps sinalizados

### `api/routers/tuneis.py`
Constantes de layout:
```python
BOCAS_DIREITA  = [1, 2, 3, 4, 5, 6]
BOCAS_ESQUERDA = [7, 8, 9, 10, 11, 12]
```
- `GET /api/tuneis/` — estado de ambos os túneis (inclui pallets em `recepcao` com túnel atribuído)
- `GET /api/tuneis/{id}` — estado de um túnel específico

### `api/routers/historico.py`
- `GET /api/historico/` — audit trail completo (filtrável por `pallet_id` e `acao`, limite padrão 200)
- `GET /api/historico/pallet/{id}` — todo o histórico de um pallet específico

---

## 6. Services — Camada de Negócio

Os services contêm **todas as regras de negócio**. São funções Python puras que recebem parâmetros e retornam dicionários ou lançam `HTTPException`.

### `api/services/recepcao.py`

**Regra crítica: geração de ID único**
```python
def _gerar_id(nro_pallet, db):
    # Busca todos os IDs que começam com o número do pallet
    # Se "10" não existe → retorna "10"
    # Se "10" existe → tenta "10-A-1", "10-A-2", etc.
```

Funções:
- `registrar(body)` — gera ID, insere pallet em `recepcao`, grava histórico
- `listar()` — pallets com `fase = "recepcao"`
- `buscar(id)` — um pallet por ID
- `rollback(id)` — deleta o pallet **somente se** ainda está em `recepcao`; grava histórico

### `api/services/resfriamento.py`

**Regra crítica: sessão por túnel**

- `status_tuneis()` — lista pallets em `recepcao` OU `resfriamento` com túnel atribuído
- `iniciar_sessao(tunel)` — cria sessão + **move automaticamente** todos os pallets daquele túnel de `recepcao → resfriamento`
- `finalizar_sessao(id, temp_saida)` — move todos os pallets do túnel de `resfriamento → armazenamento`, registra temperatura de saída, gera OA
- `gerar_oa(sessao_id)` — cria registro na tabela `ordens_armazenamento` com ID sequencial `OA-YYYYMMDD-NNN`
- `rollback(pallet_id)` — volta pallet individual de `resfriamento → recepcao`

### `api/services/armazenamento.py`

**Regra crítica: verificação de disponibilidade em tempo real**

- `mapa_camaras()` — todas as posições agrupadas por câmara
- `posicoes_livres(camara)` — filtra `status = "livre"` e `is_gap = false`
- `alocar(body)` — valida que a posição está livre + pallet está em armazenamento, atualiza ambos
- `rollback(pallet_id)` — libera a posição de câmara e volta pallet para `resfriamento`

**Layout das câmaras:**
- ID da posição: `C{camara}-R{rua:02d}-P{posicao:02d}` (ex: `C01-R05-P03`)
- Corredor: `C{camara}-COR-P{posicao:02d}`
- Gaps (portas) detectados pelo campo `is_gap = true` no banco

### `api/services/remontes.py`

**Regra crítica: extinção das entidades anteriores**

- `complementacao(original_id, adicao_id)` — soma `qtd_caixas` e `peso`, remove o pallet de adição, mantém o original
- `juncao(id1, id2)` — cria novo pallet com ID `"id1 | id2"`, soma quantidades, deleta ambos os originais

### `api/services/picking.py`

**Regra crítica: bloqueio de posições ao criar OP**

```python
def criar_ordem(body):
    # Para cada pallet:
    #   1. Valida que está em armazenamento com posição definida
    #   2. Muda status da posição para "reservada_picking"
    #   3. Registra a reserva_id = op_id
    # Nenhum outro módulo pode alocar posições com status != "livre"
```

- `criar_ordem(body)` — cria OP + reserva posições
- `executar_ordem(op_id)` — move pallets para `picking`, libera posições
- `cancelar_ordem(op_id)` — volta posições para `ocupada`, OP vira `cancelada`

IDs sequenciais: `OP-YYYYMMDD-NNN`

### `api/services/expedicao.py`

- `criar_ordem(body)` — valida que pallets estão em `picking`, cria OE
- `executar_ordem(oe_id)` — move pallets para `expedido` (fase terminal)

IDs sequenciais: `OE-YYYYMMDD-NNN`

### `api/services/inventario.py`

- `iniciar()` — proíbe dois inventários simultâneos; cria registro + copia todos os pallets em `armazenamento` como itens com `qtd_sistema`
- `registrar_item(inv_id, body)` — grava `qtd_contada` e calcula `divergencia = qtd_sistema - qtd_contada`
- `finalizar(inv_id)` — calcula `acuracidade = corretos / total * 100`, grava relatório na tabela `relatorios`

---

## 7. Banco de Dados — Tabelas

### `pallets` — Entidade central
Representa o estado atual de um pallet no ciclo de vida.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | TEXT PK | ID único: `"10"`, `"10-A-1"`, `"11 \| 12"` |
| `nro_pallet` | TEXT | Número original informado na entrada |
| `qtd_caixas` | INTEGER | Quantidade de caixas |
| `data_embalamento` | DATE | Data de embalamento |
| `variedade` | TEXT | Variedade do produto |
| `classificacao` | TEXT | Classificação |
| `safra` | TEXT | Safra |
| `embalagem` | TEXT | Tipo de embalagem |
| `rotulo` | TEXT | Rótulo |
| `produtor` | TEXT | Nome do produtor |
| `caixa` | TEXT | Tipo de caixa |
| `peso` | NUMERIC | Peso total (kg) |
| `area` | TEXT | Área de origem |
| `controle` | TEXT | Código de controle |
| `mercado` | TEXT | Mercado destino |
| `temp_entrada` | NUMERIC | Temperatura na entrada (°C) |
| `temp_saida` | NUMERIC | Temperatura na saída do túnel (°C) |
| `tunel` | TEXT | `"01"` ou `"02"` |
| `boca` | INTEGER | 1 a 12 |
| `fase` | TEXT | `recepcao` / `resfriamento` / `armazenamento` / `picking` / `expedido` |
| `camara` | TEXT | `"01"` ou `"02"` (preenchido ao alocar) |
| `rua` | INTEGER | 1 a 13 |
| `posicao` | INTEGER | 1 a 6 |
| `is_adicao` | BOOLEAN | `true` se ID tem sufixo A |

### `sessoes_resfriamento`
Controla o ciclo de cada sessão de resfriamento por túnel.

| Coluna | Descrição |
|---|---|
| `id` | UUID gerado pelo Supabase |
| `tunel` | `"01"` ou `"02"` |
| `iniciado_em` | Timestamp de início |
| `finalizado_em` | Timestamp de fim |
| `temp_saida` | Temperatura registrada ao finalizar |
| `oa_id` | Referência à OA gerada |
| `status` | `"ativa"` ou `"finalizada"` |

### `ordens_armazenamento` (OA)
Gerada ao finalizar sessão. Serve como reserva de posições para os pallets que saem do túnel.

### `posicoes_camara`
Tabela **estática + dinâmica**. Criada e populada pelo seed da migration.

| Coluna | Descrição |
|---|---|
| `id` | `"C01-R05-P03"` ou `"C01-COR-P07"` |
| `camara` | `"01"` ou `"02"` |
| `tipo` | `"rua"` ou `"corredor"` |
| `rua` | Número da rua (0 = corredor) |
| `posicao` | Número da posição |
| `status` | `"livre"` / `"ocupada"` / `"reservada_oa"` / `"reservada_picking"` |
| `pallet_id` | FK para `pallets.id` |
| `reserva_id` | ID da OP ou OA que reservou |
| `is_gap` | `true` nas posições de porta (não utilizáveis) |

**Gaps configurados no seed:**
- Câmara 01: corredor posições 7 e 8 (Porta)
- Câmara 02: corredor posições 12 e 13 (Porta)

### `ordens_picking` (OP)
Registra ordens de separação com lista de pallets e posições reservadas (JSONB).

### `ordens_expedicao` (OE)
Registra ordens de expedição com lista de pallets.

### `inventarios` + `itens_inventario`
Cabeçalho do inventário + um item por pallet armazenado com `qtd_sistema`, `qtd_contada` e `divergencia`.

### `historico`
**Audit trail imutável.** Toda ação que muda o estado de um pallet grava aqui.

| `acao` | Quando é gerado |
|---|---|
| `recepcao` | Pallet registrado |
| `resfriamento_inicio` | Sessão iniciada, pallet sai da recepção |
| `resfriamento_fim` | Sessão finalizada, pallet vai para armazenamento |
| `armazenamento_alocacao` | Pallet alocado em posição de câmara |
| `picking_criacao` | OP criada, posições reservadas |
| `picking_execucao` | OP executada, pallet em picking |
| `picking_cancelamento` | OP cancelada, posições liberadas |
| `expedicao` | Pallet expedido (fase terminal) |
| `remonte_complementacao` | Fusão de pallet original + adição |
| `remonte_juncao` | Fusão de dois pallets distintos |
| `rollback_recepcao` | Pallet excluído |
| `rollback_resfriamento` | Pallet voltou para recepção |
| `rollback_armazenamento` | Pallet voltou para resfriamento |

### `relatorios`
Repositório de relatórios gerados pós-execução (inventário, expedição, etc.) com dados em JSONB e timestamps de início/fim para cálculo de tempo médio.

---

## 8. Frontend — Detalhamento

### `public/css/main.css` — Design System

Define todas as variáveis CSS e componentes reutilizáveis:

| Variável | Valor | Uso |
|---|---|---|
| `--bg` | `#0f172a` | Fundo geral |
| `--surface` | `#1e293b` | Cards e sidebar |
| `--surface2` | `#293548` | Inputs e hover |
| `--border` | `#334155` | Bordas |
| `--accent` | `#6366f1` | Cor primária (indigo) |
| `--success` | `#22c55e` | Verde |
| `--warning` | `#f59e0b` | Amarelo |
| `--danger` | `#ef4444` | Vermelho |

Componentes definidos: sidebar, cards, tabelas, formulários, botões (`.btn-primary`, `.btn-danger`, `.btn-ghost`), badges de status (`.badge-recepcao`, `.badge-armazenamento`, etc.), grade de posições de câmara, cards de boca de túnel, sistema de toast.

### `public/js/api.js` — Camada de Comunicação

Centraliza **todo acesso à API**. Todas as outras páginas usam este arquivo.

```javascript
const api = {
  get:    (path)       => request('GET', path),
  post:   (path, body) => request('POST', path, body),
  delete: (path)       => request('DELETE', path),
  put:    (path, body) => request('PUT', path, body),
}
```

Também provê funções auxiliares globais:
- `showToast(msg, type)` — notificações flutuantes (success/error/info)
- `faseBadge(fase)` — HTML de badge colorido por fase
- `statusBadge(status)` — badge de status de posição de câmara
- `fmtDate(d)` — formata data/hora para pt-BR

> **Como adicionar um endpoint:** nunca use `fetch()` diretamente nas páginas. Sempre use `api.get(...)` ou `api.post(...)`.

### Páginas HTML (`public/*.html`)

Cada página segue o mesmo template:
1. Sidebar de navegação (idêntico em todas as páginas)
2. Header com título e badge do módulo
3. Área de conteúdo com formulários e tabelas
4. Dois `<script>`: `api.js` + o JS específico da página

O link ativo na sidebar é detectado automaticamente via JavaScript no `api.js`:
```javascript
const page = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('nav a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('active');
});
```

### JS por Módulo

| Arquivo | Responsabilidade |
|---|---|
| `dashboard.js` | Chama `/api/dashboard/kpis`, renderiza KPIs e gráfico de fases; auto-atualiza a cada 30s |
| `recepcao.js` | Submit do formulário de cadastro, listagem com botão Rollback |
| `resfriamento.js` | Renderiza grade de bocas por túnel, iniciar/finalizar sessão |
| `armazenamento.js` | Formulário de alocação, listagem de pallets armazenados |
| `remontes.js` | Formulários de Complementação e Junção com resultado inline |
| `picking.js` | Criar OP com lista de pallets, executar/cancelar OPs |
| `expedicao.js` | Criar OE, executar expedição |
| `inventario.js` | Iniciar inventário, registrar contagens, finalizar e ver acuracidade |
| `camaras.js` | Renderiza grid visual das câmaras com cores por status; detecta gaps de porta |
| `tuneis.js` | Renderiza layout 3 colunas (direita / corredor / esquerda); auto-atualiza a cada 15s |
| `relatorios.js` | Lista relatórios com filtro por módulo, botão "Ver Dados" |
| `historico.js` | Audit trail com filtro por pallet, Enter para buscar |

---

## 9. Ciclo de Vida Completo do Pallet

```
[RECEPÇÃO]
    │  POST /api/recepcao/
    │  ID gerado: "10" ou "10-A-1" (conflito)
    ▼
[RESFRIAMENTO]
    │  POST /api/resfriamento/sessao  ← Inicia sessão por túnel
    │  (move automaticamente todos os pallets do túnel)
    │  POST /api/resfriamento/sessao/{id}/finalizar
    │  (temp_saida obrigatória → gera OA)
    ▼
[ARMAZENAMENTO]
    │  POST /api/armazenamento/alocar
    │  (posição: câmara + rua + posição)
    │
    ├──► [REMONTES] (opcional)
    │       Complementação: original + A-1 → original (soma)
    │       Junção: P1 + P2 → "P1 | P2" (soma)
    │
    ▼
[PICKING]
    │  POST /api/picking/ordem
    │  (bloqueia posições com status "reservada_picking")
    │  POST /api/picking/ordens/{id}/executar
    ▼
[EXPEDIDO] ← fase terminal
    │  POST /api/expedicao/ordem
    │  POST /api/expedicao/ordens/{id}/executar

── Rollbacks ──────────────────────────────────────────────
  expedido    ← não tem rollback (fase terminal)
  picking     ← cancelar OP volta para armazenamento
  armazenamento → POST /api/armazenamento/{id}/rollback → resfriamento
  resfriamento  → POST /api/resfriamento/{id}/rollback  → recepcao
  recepcao      → DELETE /api/recepcao/{id}/rollback    → EXCLUÍDO
```

---

## 10. Como Adicionar um Novo Módulo

1. **Service** — criar `api/services/novo_modulo.py` com as funções de negócio
2. **Router** — criar `api/routers/novo_modulo.py` com os endpoints
3. **Registrar** — em `api/index.py`:
   ```python
   from api.routers import novo_modulo
   app.include_router(novo_modulo.router, prefix="/api/novo-modulo", tags=["Novo Módulo"])
   ```
4. **Frontend** — criar `public/novo_modulo.html` + `public/js/novo_modulo.js`
5. **Navegação** — adicionar link na sidebar de **todas** as páginas HTML
6. **Schema** (se necessário) — adicionar Pydantic models em `api/models/schemas.py`
7. **Banco** (se necessário) — nova migration em `supabase/migrations/`

---

## 11. Deploy e Manutenção

### Deploy em produção
```bash
cd /caminho/para/OPUS
vercel deploy --prod --yes
```

### Variáveis de ambiente no Vercel
```bash
echo "valor" | vercel env add NOME_VARIAVEL production --yes
```

### Rodar localmente
```bash
pip install -r requirements.txt
cp .env.example .env  # preencher com credenciais
uvicorn api.index:app --reload --port 8000
# Abre: http://localhost:8000/api/docs (Swagger)
```

### Nova migration no Supabase
1. Criar arquivo em `supabase/migrations/002_descricao.sql`
2. Executar no SQL Editor: https://supabase.com/dashboard/project/yktbnkkhqjsfcqkqlblu/sql/new

### Documentação interativa da API
Disponível em produção: https://opus-wms.vercel.app/api/docs
