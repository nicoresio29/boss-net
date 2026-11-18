# boss.net

Agente personal con chat, memoria a largo plazo, tareas, proyectos y perfil propio. Cada persona entra con su cuenta y usa su propia clave de Groq.

## Stack

- **Interfaz:** HTML, CSS y JavaScript sin frameworks.
- **Servidor:** Netlify Functions (`netlify/functions/chat.js`).
- **Base de datos y autenticación:** Supabase (Auth y Postgres con RLS).
- **Modelo de IA:** API de Groq (`openai/gpt-oss-120b`).
- **Librerías por CDN:** Supabase JS, marked (Markdown) y DOMPurify (sanitización).

## Qué hace

- **Chat con agente:** conversa en español rioplatense y usa herramientas para trabajar con tu información.
- **Memoria a largo plazo:** guarda datos importantes, proyectos y eventos. Los usa en conversaciones futuras, aunque abras un chat nuevo.
- **Chats guardados:** cada conversación queda en la barra lateral y se puede retomar o borrar.
- **Tareas:** lista de pendientes con avisos para las vencidas o de hoy. Se marcan tocándolas.
- **Proyectos:** los proyectos que creás con el agente aparecen en la barra lateral, con detalle y opciones para cerrarlos o borrarlos.
- **Panel Studio y Work:** vista previa del estado, registro de actividad, calendario de tareas, resumen de incidencias y accesos rápidos.
- **Perfil:** nombre de usuario, avatar, nombre del agente y tono de voz, editables desde Personalización.
- **Varias cuentas:** cambiás de cuenta desde el menú inferior de la barra lateral.

## Cómo funciona

- **Interfaz (`jefe-global.html`, `app.js`, `style.css`):** lo que ves y tocás en el navegador.
- **Función del servidor (`netlify/functions/chat.js`):** recibe cada mensaje, consulta tu memoria en Supabase, arma las instrucciones del agente y llama a Groq.
- **Supabase:** guarda tu cuenta, tu perfil, tus chats, tus mensajes y tu memoria. Las políticas de RLS hacen que cada usuario vea solo sus datos.

## Requisitos

- Cuenta en [Supabase](https://supabase.com). El plan gratuito alcanza.
- Cuenta en [Groq](https://console.groq.com) con una API key propia. Es gratuita y no pide tarjeta.
- Cuenta en [Netlify](https://netlify.com) para publicar el sitio.
- Node.js y la CLI de Netlify, solo si querés probar en tu computadora.

## Configuración de Supabase

1. Creá un proyecto y activá el proveedor **Email** en **Authentication → Sign In / Providers**.
2. En **SQL Editor**, creá las tablas `agents`, `tasks`, `notes`, `messages`, `memorias`, `conversations` y `perfiles`, con sus políticas RLS.
3. En **Authentication → URL Configuration**, poné tu URL de Netlify en **Site URL** y en **Redirect URLs**: `https://tu-sitio.netlify.app/**`. Para pruebas locales, agregá `http://localhost:8888/**`.
4. Copiá la **URL del proyecto** y la **Publishable key** desde **Project Settings → API Keys**. La Publishable key va en `app.js`.

> La **Secret key** de Supabase nunca va en el código ni en el repositorio.

## Instalación local

```bash
npm install -g netlify-cli
netlify dev
```

Después abrí `http://localhost:8888/jefe-global.html`.

Si querés usar una clave de Groq desde tu computadora, creá un archivo `.env` en la raíz con `GROQ_API_KEY=...`. Está en `.gitignore`, así que no se sube. Como cada usuario pega su propia clave en la app, esto es opcional.

## Despliegue en Netlify

1. Subí el repositorio a GitHub.
2. En Netlify, elegí **Add new site → Import an existing project** y seleccioná el repositorio.
3. No hace falta comando de build: `netlify.toml` ya define la carpeta de publicación y las funciones.
4. No agregues variables de entorno, porque cada usuario usa su propia clave.

## Estructura del proyecto

```
jefe-global.html              Interfaz principal
app.js                        Lógica del cliente
style.css                     Estilos
favicon.svg                   Logo
icon-192.png                  Ícono para el celular
icon-512.png                  Ícono para el celular
manifest.json                 Configuración para instalar la app
netlify.toml                  Configuración de Netlify
netlify/functions/chat.js     Agente: memoria, herramientas y llamadas a Groq
```

## Seguridad

- La clave de Groq de cada usuario se guarda en su navegador, no en el servidor.
- El servidor verifica la sesión de Supabase antes de responder.
- Las políticas RLS impiden que un usuario lea o modifique datos de otro.
- Nunca subas `.env`, la Secret key de Supabase ni claves reales al repositorio.

## Limitaciones conocidas

- Las tareas del panel todavía se guardan en el navegador, no en la base de datos.
- El calendario y el resumen de incidencias leen solo las tareas locales, no los eventos del agente.
- Las pestañas Studio y Work son de lectura: no ejecutan comandos.
- La generación de imágenes y de código ejecutable no está incluida.

## Licencia

Uso privado. Definí una licencia antes de hacerlo público.