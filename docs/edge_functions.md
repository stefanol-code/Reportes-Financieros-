# Edge Functions — guía y plantillas

Estos archivos son plantillas para implementar las Edge Functions necesarias por la aplicación:

- `generate-token`: crea un token temporal para un `client_id` y lo guarda en `access_tokens`.
- `get-client-data`: valida el token y devuelve `client`, `projects` y `payments` asociados.
- `admin-log`: endpoint protegido para escribir logs en la tabla `logs`.

Variables de entorno necesarias (a configurar en Supabase y localmente):

- `SUPABASE_URL` — URL del proyecto Supabase.
- `SUPABASE_SERVICE_ROLE` — service_role key (secreto, no exponer en el cliente).
- `PUBLIC_BASE_URL` — URL pública donde los clientes acceden al dashboard (por ejemplo la web publicada); usado para construir links (opcional).
- `ADMIN_API_KEY` — clave simple para proteger el endpoint `admin-log` (puede reemplazarse por validación JWT si lo prefieres).

Despliegue (resumen):
1. Instala `supabase` CLI y autentica.
2. Coloca cada función en su carpeta bajo `functions/<name>` (ya incluidas aquí como plantillas).
3. En la consola del proyecto, configura las variables de entorno mencionadas.
4. Despliega con `supabase functions deploy <name>` (o usando tu flujo CI/CD).

Pruebas locales (ejemplos):

- Crear token:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"client_id": 1}' \
  https://<your-functions-host>/generate-token
```

- Obtener datos por token:

```bash
curl -X POST -H "Content-Type: application/json" -d '{"token":"TKN-..."}' https://<your-functions-host>/get-client-data
```

- Insertar log (protegido):

```bash
curl -X POST -H "Content-Type: application/json" -H "x-admin-api-key: <ADMIN_API_KEY>" -d '{"action":"TEST","detail":"Detalle test"}' https://<your-functions-host>/admin-log
```

Notas de seguridad y diseño:
- Las funciones usan la `service_role` para leer/insertar en la base. Eso significa que quien ejecute la función (o llame al endpoint) no necesita acceso directo a la DB, pero el secreto debe mantenerse seguro.
- `get-client-data` es pensado como pública y solo valida token; sin embargo, dado que usa `service_role`, la función corre con privilegios altos en el servidor. Ten cuidado con la exposición de datos.
- Alternativa: puedes implementar autenticación basada en JWT en las funciones y validar `Authorization: Bearer <jwt>` para autorizar admins.

Si quieres, implemento además los archivos de despliegue (`supabase/config.toml`) o un ejemplo de workflow de GitHub Actions para desplegar funciones automáticamente.