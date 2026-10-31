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

## Probarlo ahora (modo demo)

Abre `/app/` y toca **Probar como: Cliente / Limpiador / Dueño**. En demo todo se guarda solo en ese teléfono.

## Activarlo de verdad (unos 15 minutos, gratis)

1. Entra a [supabase.com](https://supabase.com) con `wecleanitallfl@gmail.com` → **New project** → región **East US** → guarda la contraseña de la base de datos.
2. **SQL Editor** → pega todo `marketplace/supabase/schema.sql` → **Run**. Después pega `storage.sql` → **Run**.
3. **Authentication → URL Configuration**: Site URL y Redirect URL = `https://www.wecleanitallfl.com/app/`
4. **Authentication → Providers → Email**: activado, con confirmación de correo.
5. **Project Settings → API**: copia **Project URL** y la clave **anon public** y pégalas en `app/config.js` (o pásamelas y lo hago yo). La clave anon es pública por diseño; la seguridad la pone la base de datos.
6. En la app, crea tu cuenta con `wecleanitallfl@gmail.com`. Luego en **SQL Editor**:
   ```sql
   insert into public.admins(user_id) select id from auth.users where email = 'wecleanitallfl@gmail.com';
   ```
   Al volver a entrar verás el **Panel del dueño**.

Notas del plan gratis de Supabase: 500 MB de base de datos, 50,000 usuarios activos al mes, 1 GB de archivos, sin copias de seguridad automáticas. El proyecto se pausa si pasa una semana sin actividad. Para evitarlo, `.github/workflows/supabase-keepalive.yml` lo despierta dos veces por semana. El correo que trae Supabase envía pocos mensajes por hora. Para el lanzamiento conecta un SMTP propio en **Authentication → Emails** (Resend tiene plan gratis).

## Seguridad

- Cada tabla tiene Row Level Security: cada persona solo ve lo suyo.
- Nadie puede aprobarse, cambiarse de rol, inventarse calificaciones ni marcar trabajos ajenos. Lo prueban 60 pruebas automáticas.
- La dirección y el teléfono del cliente solo los ve el limpiador asignado. El directorio muestra solo nombre e inicial, sin teléfono ni correo.
- Aceptar un trabajo bloquea el pedido, así que nunca hay doble asignación.
- Los documentos van en un bucket privado: el limpiador ve los suyos y el dueño todos.
- Cada acción importante queda en `audit_log`.
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
