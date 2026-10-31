# We Clean It All — Marketplace (Fase 1)

App para **clientes**, **limpiadores** (personas y compañías) y **el dueño**, en `www.wecleanitallfl.com/app/`.
Gratis de operar: la app vive en GitHub Pages (igual que la web) y los datos en Supabase gratis.
La web comercial actual (`/`) no cambia.

## Qué hace hoy

| Quién | Qué puede hacer |
|---|---|
| Cliente | Crear cuenta · pedir limpieza de casa o negocio · ya o con fecha · frecuencia · presupuesto sugerido · ver limpiadores con calificación · pedir uno en específico · seguir el estado · llamar o escribir por WhatsApp al limpiador asignado · cancelar · calificar |
| Limpiador | Registrarse como persona o compañía · perfil completo (ZIPs, servicios, idiomas, experiencia, transporte, equipo, seguro, tarifa) · subir documentos privados · botón **Disponible** tipo Uber · recibir trabajos y aceptar o rechazar (el primero que acepta gana) · ver dirección y cliente solo después de aceptar · empezar y terminar · ganancias y calificación |
| Dueño | Panel con números en vivo · **AI CEO** con resumen y prioridades del día · aprobar, rechazar o pausar limpiadores · ver documentos · ver todos los pedidos y ofertas · asignar a mano · volver a buscar · avisar por WhatsApp gratis con un toque · estado de los conectores |

**Motor de asignación:** cuando entra un pedido, el sistema puntúa a los limpiadores aprobados y disponibles que hacen ese servicio en esa zona:
ZIP exacto (40) o cercano (15) · experiencia (hasta 20) · calificación (hasta 30) · cliente que repite (15) · idioma del cliente (10) · precio dentro del presupuesto (10) · seguro (5) · limpiador pedido por el cliente (100).
Envía la oferta a los mejores 5 (8 si es urgente). El primero que acepta se queda con el trabajo. Si todos rechazan, busca a los siguientes. Si nadie cubre la zona, el pedido aparece en rojo en tu panel para asignarlo a mano.

**Bilingüe** español/inglés. Se instala en el teléfono como app (PWA).

## Estado: conectado a Supabase

- Proyecto de Supabase: **we-clean-it-all** (`fqajygzjteauxornipva`, East US, plan gratis), en la organización "rdcmnation-3555's projects".
- Ya están cargados la base de datos, la seguridad, el bucket privado de documentos y los conectores `ai-ceo` y `notify`. `notify` sigue apagado hasta la Fase 2.
- `app/config.js` ya apunta al proyecto con la clave publicable. Esa clave es pública por diseño.

### Dos ajustes que solo se hacen en el panel de Supabase (2 minutos)

1. **Authentication → Sign In / Providers → Email**: apaga **Confirm email**. El correo gratis de Supabase solo envía a los miembros del equipo del proyecto, así que con la confirmación encendida ningún cliente podría registrarse. Cuando conectes un SMTP propio (por ejemplo Resend, gratis, con tu dominio) la vuelves a encender. En la misma pantalla sube la contraseña mínima a 8.
2. **Authentication → URL Configuration**: Site URL y Redirect URLs = `https://www.wecleanitallfl.com/app/`

### Tu cuenta de dueño

1. En `www.wecleanitallfl.com/app/` → "Necesito limpieza" → crea la cuenta con `wecleanitallfl@gmail.com`.
2. Avísale a Claude (o corre esto en SQL Editor):
   ```sql
   insert into public.admins(user_id) select id from auth.users where email = 'wecleanitallfl@gmail.com';
   ```
3. Sal y vuelve a entrar. La app te pide activar la **verificación en 2 pasos**: escanea el código con Google Authenticator, Microsoft Authenticator o 1Password. Sin ese código nadie entra al panel, aunque tenga tu contraseña.

## Seguridad

- Cada tabla tiene Row Level Security: cada persona solo ve lo suyo.
- Nadie puede aprobarse, cambiarse de rol, inventarse calificaciones ni marcar trabajos ajenos. Lo prueban 66 pruebas automáticas, y además lo probé en el Supabase real con usuarios temporales que después se borraron.
- La dirección y el teléfono del cliente solo los ve el limpiador asignado. El directorio muestra solo nombre e inicial, sin teléfono ni correo.
- Aceptar un trabajo bloquea el pedido, así que nunca hay doble asignación.
- Los documentos van en un bucket privado: el limpiador ve los suyos y el dueño todos.
- Cada acción importante queda en `audit_log`.
- Los poderes de dueño exigen verificación en 2 pasos en cada sesión. Una contraseña robada no abre el panel.
- Límites contra spam: máximo 5 pedidos abiertos por cliente, 15 al día, y fechas solo dentro de los próximos 6 meses.
- La app no se deja abrir dentro de páginas ajenas (protección contra páginas falsas o *clickjacking*).
- Lo que se cree en el futuro en la base de datos queda privado hasta que se le dé permiso a propósito.
- La app no carga scripts de terceros y tiene una política de seguridad de contenido (CSP) estricta.

Para correr las pruebas: `PGHOST=… PGPORT=… marketplace/supabase/test/run_tests.sh` (Postgres local).

## Conectores listos para la Fase 2

Cada conector queda apagado hasta que pongas su clave en **Supabase → Edge Functions → Secrets**. Mientras tanto nada se pierde: los avisos quedan en cola.

| Conector | Archivo | Qué necesita |
|---|---|---|
| WhatsApp Business (Cloud API) | `supabase/functions/notify` | Cuenta de Meta Business verificada, número, plantillas aprobadas `wcia_job_offer`, `wcia_booking_assigned` y `wcia_worker_approved`. Desde el 1 de octubre de 2026 Meta cobra cada mensaje que manda la empresa. |
| SMS (Twilio) | `notify` | Cuenta de Twilio y número. Se usa si WhatsApp falla. |
| Correo (Resend) | `notify` | Clave de Resend y dominio verificado. |
| AI CEO (Claude) | `supabase/functions/ai-ceo` | `ANTHROPIC_API_KEY`. Sin clave, el panel usa reglas automáticas gratis. |
| Pagos y comisiones | — | Stripe Connect con la cuenta de RDCM NATION, INC. |
| Distancia real | — | PostGIS (ya viene en Supabase) y coordenadas. |

## Comparación con el plan de ChatGPT

✅ = hecho en la Fase 1 · ⏳ = Fase 2 · ↻ = hecho de otra forma

- ✅ Tres apps en un sistema (cliente, limpiador, dueño), con permisos separados por rol
- ✅ Registro de personas y compañías · ✅ residencial y comercial · ✅ registro gratis
- ✅ Perfil del limpiador: nombre, teléfono, correo, ZIPs, experiencia, especialidades, idiomas, tarifa por hora o por trabajo, transporte, equipo, seguro y documentos · ⏳ foto de perfil
- ✅ Disponible / No disponible tipo Uber · ⏳ calendario semanal de horarios
- ✅ Motor de asignación con los 8 factores del plan (la distancia se calcula por ZIP) · ✅ el primero que acepta gana · ✅ limpiador pedido y cliente que repite
- ✅ Tarjeta de oferta como la de WhatsApp del plan (servicio, zona, propiedad, duración, pago, horario, Aceptar o No puedo)
- ↻ WhatsApp: hoy con botones gratis desde tu teléfono. Los avisos automáticos ya se guardan en cola y salen solos cuando se active Meta en la Fase 2.
- ✅ Panel del dueño: aprobar, rechazar, pausar, ver pedidos, asignar, ventas, alertas de calificaciones bajas, recomendaciones del AI CEO
- ⏳ Chat dentro de la app (hoy por WhatsApp o llamada) · ⏳ pagos, comisiones y suscripciones · ⏳ ubicación en vivo del limpiador · ⏳ lista de clientes en el panel
- ↻ AI CEO desde el día uno: una capa de reglas gratis más el conector de Claude, en vez de 30 agentes. El mismo plan de ChatGPT recomendaba crecer los agentes con datos reales.
- ↻ Tecnología: en vez de Next.js + servidor Node + Postgres pagado, la app es una PWA estática con Supabase (Postgres con PostGIS disponible). Cuesta $0 hoy y funciona igual en el teléfono.
- ⏳ Apps nativas de iOS y Android (fase 9 del plan)

## Antes de crecer (no es asesoría legal)

Confirma con un abogado o contador cómo clasificar a los limpiadores (contratistas 1099 o empleados), qué seguro exigir, si vas a hacer verificación de antecedentes, y los términos y la política de privacidad del marketplace.
