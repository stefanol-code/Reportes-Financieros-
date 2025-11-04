## Autenticación con Supabase — guía rápida

Esta guía explica, en español, cómo implementar autenticación (email/password, magic links y OAuth) usando Supabase en una aplicación web. Incluye ejemplos para cliente (vanilla JS / navegador) y notas para verificación en servidor.

---

## Resumen

- Objetivo: permitir registro, inicio/cierre de sesión y manejo de sesiones con Supabase. 
- Público: aplicaciones web estáticas o con bundler (Vite/Parcel/webpack) y servidores Node.js.

## Requisitos

- Cuenta y proyecto en Supabase (https://supabase.com).
- Obtener URL del proyecto (SUPABASE_URL) y la anon key (SUPABASE_ANON_KEY).
- Node/npm instalado para desarrollar localmente si usas bundlers.

## 1) Crear proyecto en Supabase

1. Entra al panel de Supabase y crea un nuevo proyecto.
2. Añade un proveedor de OAuth (Google, GitHub, etc.) si quieres permitir login social. Configura redirect URLs en la consola.
3. En la sección de API copia: Project URL y anon/public API key.

## 2) Añadir claves al entorno

Guarda las credenciales en variables de entorno o en tu configuración de despliegue:

- SUPABASE_URL
- SUPABASE_ANON_KEY

Nunca subas la service_role key al cliente. Úsala únicamente en servicios de backend seguros.

## 3) Instalar cliente

Si usas npm y bundler:

```powershell
npm init -y
npm install @supabase/supabase-js
```

Si quieres probar en una página estática sin bundler, puedes usar la versión ESM desde CDN en el navegador (ejemplo más abajo).

## 4) Inicializar el cliente (ejemplo JS — navegador con bundler)

```js
// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

En una app sin bundler (index.html) puedes usar:

```html
<script type="module">
  import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

  const SUPABASE_URL = 'https://xyzcompany.supabase.co'
  const SUPABASE_ANON_KEY = 'public-anon-key'
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // ejemplo sencillo
  window.supabase = supabase
  console.log('Supabase inicializado')
</script>
```

## 5) Registro (signup)

Email + password:

```js
const { data, error } = await supabase.auth.signUp({
  email: 'usuario@example.com',
  password: 'mi-contraseña-segura'
})
if (error) console.error('Error signup', error)
else console.log('Registro creado, verifica el email si aplica', data)
```

Magic link (envía link por email):

```js
const { data, error } = await supabase.auth.signInWithOtp({ email: 'user@example.com' })
```

## 6) Inicio de sesión (signin)

Email + password:

```js
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'usuario@example.com',
  password: 'mi-contraseña-segura'
})
```

OAuth (por ejemplo Google):

```js
const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
// Redirige al provider y luego vuelve a tu redirect URL configurada
```

## 7) Cierre de sesión (sign out)

```js
const { error } = await supabase.auth.signOut()
if (error) console.error('Error signOut', error)
```

## 8) Manejo de sesión en el cliente

Supabase guarda sesión en localStorage automáticamente en el navegador. Para reaccionar a cambios de autenticación:

```js
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth event', event, session)
  // event puede ser 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', ...
})
```

Al cargar una página puedes obtener la sesión actual:

```js
const { data: { session } } = await supabase.auth.getSession()
if (session) {
  // usuario autenticado
}
```

## 9) Proteger rutas (ejemplo simple — HTML/JS)

En cada página protegida (o en la inicialización de tu SPA) haz:

```js
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  // redirigir a /login
  window.location.href = '/login.html'
}
```

Si usas frameworks (Next.js, Remix, etc.) utiliza la verificación server-side (ver abajo).

## 10) Verificar la sesión en el servidor

Casos de uso: endpoints protegidos, acciones que requieren service role.

- Si tu servidor solo necesita saber quién es el usuario, envía el header Authorization: Bearer <access_token> desde el cliente y en el servidor valida el JWT (o usa SDKs).
- Con Node.js puedes usar la librería jwt (o la propia función verify de Supabase admin) para verificar la firma del token. También puedes consultar la API REST de Supabase (auth endpoint) si lo prefieres.

Advertencia: la service_role key debe permanecer en el servidor y nunca en el cliente.

Ejemplo simple (Express) — verificación rápida del token (pseudo):

```js
// server.js (Node/Express)
import express from 'express'
import jwt from 'jsonwebtoken'

const app = express()
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET // solo si lo tienes

function verifyUser(req, res, next) {
  const auth = req.headers.authorization?.split(' ')[1]
  if (!auth) return res.status(401).send('No token')
  try {
    const payload = jwt.verify(auth, SUPABASE_JWT_SECRET)
    req.user = payload
    next()
  } catch (err) {
    return res.status(401).send('Invalid token')
  }
}

app.get('/api/protected', verifyUser, (req, res) => {
  res.json({ hello: 'protected', user: req.user })
})
```

Nota: la verificación exacta depende de cómo configures JWT en Supabase; la mayoría de proyectos usan las funciones built-in o comparan `sub` en la sesión.

## 11) Buenas prácticas

- No exponer service_role key en el cliente.
- Configurar redirect URIs en proveedor OAuth.
- Manejar expiración y refresh tokens (Supabase lo administra para la mayoría de casos en el cliente).
- Validar emails y forzar confirmación si la aplicación lo requiere.
- Forzar contraseñas seguras y limitar intentos si es necesario.

## 12) Pequeño contrato (inputs/outputs/errores)

- Inputs: email/password, provider (google/github), redirectURL.
- Outputs: objeto session { access_token, refresh_token, user } o error { message, status }.
- Errores comunes: usuario no encontrado, contraseña incorrecta, redirect URI inválida, token expirado.

## 13) Casos borde (edge cases)

- Usuario elimina su cuenta: invalidar sesiones.
- Token expirado: usar refresh token o reenviar login.
- Doble registro con mismo email: manejar error único en backend.

## 14) Try it — prueba local rápida

1. Instala dependencias:

```powershell
npm install @supabase/supabase-js
```

2. En `index.html` (ejemplo) usa el snippet ESM de arriba, abre la consola y prueba:

- `await window.supabase.auth.signUp({ email: 'tucorreo@ejemplo.com', password: '12345678' })`
- `await window.supabase.auth.signInWithPassword({ email: 'tucorreo@ejemplo.com', password: '12345678' })`

3. Observa eventos con `supabase.auth.onAuthStateChange(...)`.

## 15) Recursos útiles

- Documentación oficial de Supabase: sección Auth (buscar en la web de Supabase).

---

Si quieres, puedo:

- Añadir ejemplos listos para copiar en `app.js` e `index.html` de este repositorio.
- Incluir una sección para Next.js (API routes) o para Express con ejemplos completos.

Fin de la guía.
