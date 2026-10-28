# Nuestro Álbum Familiar

Aplicación web responsive para organizar recuerdos familiares en álbumes, subir fotografías a un almacenamiento privado y generar resúmenes en español mediante IA. El frontend se publica en GitHub Pages; Supabase administra autenticación, base de datos y archivos.

> **Importante:** GitHub Pages publica el frontend. No guardes fotos familiares en el repositorio. Las fotos deben vivir en Supabase Storage con bucket privado. Los enlaces compartidos funcionan como enlaces portadores: cualquiera que tenga el enlace puede ver el álbum mientras siga activo. Compártelos solo con personas de confianza.

## Incluye

- Interfaz familiar elegante en tonos crema, rosa suave, verde salvia y azul pastel.
- Vista demostrativa sin credenciales.
- Registro/inicio de sesión con Supabase Auth.
- Crear álbumes, filtrar/buscar y subir varias imágenes.
- Bucket privado y URLs firmadas de corta duración para usuarios autenticados.
- Resumen IA a partir de título, fecha, descripción y pies de foto. En esta implementación no se envían las imágenes a la IA.
- Crear/revocar enlaces compartidos (token aleatorio).
- GitHub Actions para desplegar a GitHub Pages.

## Requisitos

- Node.js 20+
- Cuenta de GitHub
- Proyecto de Supabase
- API key de OpenAI si quieres resúmenes con IA

## 1. Ejecutar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

En Windows PowerShell puedes copiar el archivo con:

```powershell
Copy-Item .env.example .env.local
```

Sin configurar `.env.local`, se mostrará la vista de bienvenida con álbumes ilustrativos. Para habilitar las funciones reales, completa la URL y la publishable/anon key del proyecto Supabase.

## 2. Configurar Supabase

1. Crea un proyecto en Supabase.
2. En SQL Editor, ejecuta todo el archivo `supabase/migrations/001_family_album.sql`.
3. En Project Settings → API, copia Project URL y la publishable key (o anon key heredada) a `.env.local`.
4. En Authentication → Providers, habilita Email. Para producción, activa confirmación de correo y configura SMTP si corresponde.
5. En Authentication → URL Configuration, añade tu URL local y la URL final de GitHub Pages a Site URL / Redirect URLs según corresponda.
6. Comprueba en Storage que `family-photos` exista y sea **privado**.
7. Crea una cuenta desde el formulario de inicio de sesión con “Crear cuenta con este correo”. Confirma el correo si Supabase lo requiere.

Ejemplo `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=tu_publishable_key
VITE_SUMMARY_FUNCTION_URL=https://xxxxxxxx.supabase.co/functions/v1/summarize-album
```

No subas `.env.local` al repositorio. `.gitignore` ya lo excluye. La publishable/anon key no es un secreto de servidor; solo es segura en el frontend cuando RLS está activado y las políticas se han revisado. **Nunca** expongas `service_role` ni `OPENAI_API_KEY`.

## 3. Desplegar la función de resumen IA

Instala Supabase CLI y autentícate, enlaza el proyecto y despliega:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy summarize-album
supabase functions deploy shared-album-photos --no-verify-jwt
supabase secrets set OPENAI_API_KEY=tu_clave_secreta
# Opcional:
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```

La función valida el token del usuario y comprueba que sea dueño del álbum antes de leer/actualizar. La clave de OpenAI vive en los secretos del servidor. La función envía a OpenAI únicamente metadatos textuales del álbum y de las fotos, no los archivos de imagen. Revisa las condiciones y costes de la API del proveedor.

## 4. Enlaces compartidos: alcance y precaución

El SQL permite crear un token aleatorio, obtener los metadatos del álbum compartido y revocar el token. La app copia un enlace `?share=TOKEN`.

**Limitación importante de esta versión inicial:** las imágenes están en un bucket privado y las URLs firmadas solo se crean para sesiones autenticadas. Para que los invitados que reciben un enlace vean también las fotos, hay que añadir una Edge Function `shared-album-photos` que:
- reciba el token y el álbum solicitado;
- valide en servidor que el token sigue activo y pertenece a ese álbum;
- firme temporalmente únicamente las rutas de las fotos de ese álbum;
- devuelva las URLs firmadas con vencimiento corto;
- limite solicitudes y no revele rutas de otros álbumes.

No conviertas el bucket en público para resolverlo. La función `shared-album-photos` incluida en el proyecto se despliega con `--no-verify-jwt` porque los invitados no inician sesión; la función valida el token aleatorio y el álbum en el servidor antes de firmar cualquier archivo. Resuelve este punto: valida el token activo y el ID del álbum en el servidor, y devuelve URLs firmadas que vencen a los 5 minutos. Despliega la función y configura `VITE_SHARED_PHOTOS_FUNCTION_URL` antes de compartir álbumes. El enlace debe considerarse una credencial: cualquiera que lo reciba puede reenviarlo. Al revocarlo, las nuevas solicitudes dejan de autorizarse; una URL firmada ya emitida podría seguir funcionando hasta que expire.

## 5. Publicar en GitHub Pages

1. Crea un repositorio llamado `nuestro-album-familiar` (puede ser público porque solo contiene código).
2. Sube el código a la rama `main`:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Nuestro Álbum Familiar"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/nuestro-album-familiar.git
   git push -u origin main
   ```
3. En GitHub, abre Settings → Secrets and variables → Actions → Variables y crea:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (publishable/anon key, nunca service role)
   - `VITE_SUMMARY_FUNCTION_URL`
   - `VITE_SHARED_PHOTOS_FUNCTION_URL`
4. En Settings → Pages, selecciona **GitHub Actions** como Build and deployment source.
5. Espera a que termine el workflow “Deploy to GitHub Pages”.
6. Abre `https://TU_USUARIO.github.io/nuestro-album-familiar/`.
7. Añade la URL publicada a las URLs permitidas de Supabase Auth.

Si el repositorio es el repositorio especial `TU_USUARIO.github.io`, la base URL suele ser `/`; actualiza `BASE_PATH` del workflow para ese caso. GitHub Pages es alojamiento estático, por lo que la aplicación no puede mantener claves privadas en el cliente.

## 6. Estructura

```text
nuestro-album-familiar/
├── .github/
│   └── workflows/deploy.yml
├── src/
│   ├── lib/supabase.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── supabase/
│   ├── migrations/001_family_album.sql
│   └── functions/summarize-album/index.ts
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── tsconfig*.json
├── vite.config.ts
└── README.md
```

## 7. Comprobaciones antes de usar con fotos reales

- [ ] Probar registro, confirmación de correo, login y logout.
- [ ] Verificar que el usuario A no puede consultar álbumes o fotos del usuario B.
- [ ] Probar archivos permitidos, archivos grandes y fallos de red.
- [ ] Probar resumen IA y comprobar que no inventa hechos.
- [ ] Implementar y probar la Edge Function de URLs firmadas para invitados antes de distribuir enlaces.
- [ ] Añadir límites de uso a funciones, alertas de gasto y política de privacidad.
- [ ] Configurar backups y exportación de fotos originales.
- [ ] No almacenar fotos, tokens de acceso ni secretos en el repositorio.

## Nota sobre el prototipo

Esta es una base funcional de frontend e integración inicial. La generación de resúmenes está preparada para la Edge Function incluida. La compartición por enlace incluye una Edge Function para emitir URLs firmadas de corta duración. Despliega y prueba ambas funciones antes de distribuir enlaces; no publiques el sitio como listo para producción sin verificar permisos, revocación y expiración.
