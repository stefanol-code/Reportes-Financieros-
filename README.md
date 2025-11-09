# Reportes-Financieros (PRF)

Proyecto front-end y funciones edge para gestionar clientes, proyectos y pagos, y
generar enlaces temporales de acceso a dashboards de cliente.

Este README documenta la arquitectura, el modelo de base de datos, las edge
functions y los pasos para desplegar y probar el flujo de link temporal.

Contenido rápido
- Estado: front + funciones edge incluidas
- DB: scripts SQL en `sql/` (tablas: `clients`, `projects`, `payments`, `access_tokens`, `logs`, `admins`)
- Edge Functions: `functions/generate-token` y `functions/get-client-data`
- Front: `index.html`, `app.js`, `styles.css`

## Bugs críticos

Plantilla para cada bug crítico:
- ID: BUG-YYYY-001
  - Fecha: 2025-10-31
  - Estado: Abierto | Mitigado | Resuelto
  - Descripción: 
  - Impacto: 
  - Reproducción: 
  - Propietario: 
  - Notas: 

## Tareas por hacer

Prioriza con P1 (alto), P2 (medio), P3 (bajo).
- P1
  - [ ] 
- P2
  - [ ] 
- P3
  - [ ] 

## Flujo recomendado
- Crea rama por feature/bugfix.
- Documenta cambios en "Unreleased" al commitear.
- Mueve items a versión cuando se libere (e.g., 0.1.0 - YYYY-MM-DD).
- Registra bugs críticos con la plantilla y vínculo al issue.

## Configuración: Supabase (Autenticación)

Para usar la autenticación con Supabase (registro/login de usuarios) en este proyecto:

- Crea un proyecto en https://supabase.com y copia tu Project URL y anon/public API key.
- En `index.html` se incluye un ejemplo que inicializa el cliente Supabase vía CDN. Puedes reemplazar las constantes por tus valores o preferir usar bundler y variables de entorno.
- No expongas la service_role key en cliente. Úsala solo en servicios backend.

Prueba rápida local (sin bundler): abre `index.html` en un navegador; el script ya cargará el cliente desde CDN. En la pantalla de inicio verás formularios para registro y login de usuario (lado derecho). Para pruebas completas con un bundler, instala `@supabase/supabase-js`:

```powershell
npm install @supabase/supabase-js

```

## Resumen del proyecto (extendido)

Este repositorio contiene una SPA ligera que permite:
- Gestión administrativa (CRUD) de clientes, proyectos y pagos (mock o Supabase).
- Generar enlaces temporales para que un cliente vea su dashboard (token en querystring).
- Dos Edge Functions para crear tokens y validar/servir datos del cliente.

Objetivo principal: permitir al administrador generar un enlace seguro que muestre
el dashboard de un cliente sin requerir autenticación del cliente, con expiración
por tiempo (24 horas) y opción de invalidación tras uso.

---

## Modelo de datos (ER) — resumen

Entidades principales:
- admins (opcional)
- clients
- projects
- payments
- access_tokens
- logs

Relaciones básicas:
- clients 1 --- N projects
- projects 1 --- N payments
- clients 1 --- N access_tokens

ER diagram (ASCII):

  +---------+     1     +----------+     1     +---------+
  | clients |-----------| projects |-----------| payments |
  +---------+  (client) +----------+ (project) +---------+
       |                          
       | 1                       
       +------------------+      
                          |      
                    +-------------+
                    | access_tokens|
                    +-------------+

Tablas y campos clave

- `clients` (id, name, email, created_at)
- `projects` (id, client_id, name, status, budget, balance, created_at)
- `payments` (id, project_id, date, amount, type, created_at)
- `access_tokens` (token PK, client_id FK, expires_at, created_at)
- `logs` (id, action, detail, created_at)
- `admins` (email PK, password_hash, created_at)

Los scripts SQL están en `sql/` y son idempotentes: `create_tables.sql`,
`003_make_ids_serial.sql`, `002_tokens_and_logs.sql`.

---

## Edge Functions — Documentación detallada

Los archivos están en `functions/`.

1) `functions/generate-token/index.ts`

- Descripción: genera un token alfanumérico (ej. `TKN-XXXXX`), lo inserta en la tabla
  `access_tokens` con `expires_at = now() + 24h` y devuelve un link construído con
  `PUBLIC_BASE_URL`.
- Request: POST JSON { client_id: <integer> }
- Response success: 200 JSON { success: true, token, link, expires_at }
- Errores: 400 (client_id missing), 404 (client not found), 500 (insert error)
- Security: la función usa `SUPABASE_SERVICE_ROLE` (secret). No exponerla al cliente.

2) `functions/get-client-data/index.ts`

- Descripción: valida un token recibido por query param o POST body, verifica
  existencia y expiración en `access_tokens`, devuelve `client`, `projects` y
  `payments` asociados.
- Request: GET ?token=<token>  OR POST { token: '<token>' }
- Response success: 200 JSON { success: true, data: { client, projects, payments } }
- Errores: 400 (token missing), 404 (token not found), 403 (token expired), 500 (server error)
- Nota: en el repo la función puede eliminar el token después del uso (single-use).

Ejemplos

Generate token (curl):

```bash
curl -X POST "${FUNCTIONS_BASE_URL}/generate-token" \
  -H 'Content-Type: application/json' \
  -d '{"client_id": 123}'
```

Get client data (curl):

```bash
curl "${FUNCTIONS_BASE_URL}/get-client-data?token=TKN-..."
```

---

## Integración Frontend

- `app.js` contiene funciones que consumen estas edge functions cuando
  `window.FUNCTIONS_BASE_URL` está configurado. Si no está definido, el proyecto
  usa un fallback en memoria (`MOCK_DATA`) para permitir desarrollo local sin
  backend.
- Funciones clave en `app.js`:
  - `generateTokenLink(clientId)` → llama a `generate-token` y devuelve `link`.
  - `viewClientReports(clientId)` → llama a `get-client-data` para mostrar dashboard.
  - `initializeApp()` detecta `?token=` en la URL y carga la vista de cliente.

---

## Deployment y Setup (resumen)

1. Ejecutar migraciones SQL en Supabase (SQL Editor o psql):
   - `sql/create_tables.sql`
   - `sql/003_make_ids_serial.sql`
   - `sql/002_tokens_and_logs.sql`

2. Desplegar Edge Functions con Supabase CLI:

```powershell
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy generate-token --project-ref <PROJECT_REF>
supabase functions deploy get-client-data --project-ref <PROJECT_REF>
```

3. Configurar secrets/variables en Supabase:

```powershell
supabase secrets set SUPABASE_SERVICE_ROLE="<service_role_key>" --project-ref <PROJECT_REF>
supabase secrets set PUBLIC_BASE_URL="https://your-domain.com" --project-ref <PROJECT_REF>
```

4. Opcional: en el front, definir `window.FUNCTIONS_BASE_URL` con la URL base de tus funciones.

---

## Seguridad y recomendaciones

- No exponer la `service_role` en el cliente.
- Usa HTTPS para el `PUBLIC_BASE_URL`.
- Considera el uso de single-use tokens o logging/auditing si los links se comparten.

---

## Desarrollo local

- Puedes levantar un servidor simple para el front:

```powershell
python -m http.server 8000
# abrir http://localhost:8000
```

El front usa un mock si `window.FUNCTIONS_BASE_URL` no está definido.

---

## Contribuciones

- Issues y Pull Requests bienvenidos. Sigue la convención de commits (feat/fix/docs).

---

Fin del README.



## Convención de commits (sugerida)
feat:, fix:, docs:, refactor:, perf:, test:, build:, ci:, chore:, style:, revert:


### SQL


```sql
CREATE TABLE IF NOT EXISTS clients (
    id integer PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);


CREATE TABLE IF NOT EXISTS projects (
    id integer PRIMARY KEY,
    client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status integer NOT NULL DEFAULT 1, -- 1 - 'Activo' | 0 - 'Cerrado'
    budget NUMERIC(14,2) NOT NULL CHECK (budget >= 0),
    balance NUMERIC(14,2) NOT NULL CHECK (balance >= 0),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
    id integer PRIMARY KEY,
    project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    type TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

```sql
alter table clients add column
   if not exists created_by uuid not null default auth.uid(); alter table projects
   add column if not exists created_by uuid not null default auth.uid(); alter
   table payments add column if not exists created_by uuid not null default
   auth.uid(); create index if not exists clients_created_by_idx on
   clients(created_by); create index if not exists projects_created_by_idx on
   projects(created_by); create index if not exists payments_created_by_idx on
   payments(created_by); alter table clients enable row level security; alter table
   projects enable row level security; alter table payments enable row level
   security; create policy "own_clients" on clients for all using (created_by =
   auth.uid()) with check (created_by = auth.uid()); create policy "own_projects"
   on projects for all using (created_by = auth.uid()) with check (created_by =
   auth.uid()); create policy "own_payments" on payments for all using (created_by
   = auth.uid()) with check (created_by = auth.uid());
```
