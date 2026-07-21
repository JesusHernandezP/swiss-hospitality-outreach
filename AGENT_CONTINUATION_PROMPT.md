# AGENT CONTINUATION PROMPT — Swiss Hospitality Outreach Automation

## Role

Actúa como agente técnico senior especializado en n8n, automatización de outreach, Google Workspace, Apify, Groq y pipelines de scraping.

Tu tarea no es volver a planificar el proyecto. La planificación, arquitectura, credenciales, variables y documentos ya existen.

Debes **continuar la implementación desde el estado actual**, ejecutar nodo por nodo, corregir errores y dejar cada workflow completamente funcional antes de avanzar al siguiente.

---

# 1. Objetivo real del proyecto

Construir un sistema automatizado de **candidatura espontánea en frío** para hoteles, restaurantes, resorts, hostales, guesthouses y establecimientos turísticos de la Suiza alemana.

El sistema:

1. Descubre establecimientos.
2. Obtiene la mayor cantidad posible de correos empresariales públicos.
3. Prioriza correos de RR. HH., empleo, dirección o gerencia.
4. Si no existen, usa el mejor correo general disponible.
5. Si solo existe recepción o reservas, puede utilizarlo como último recurso.
6. Envía una candidatura espontánea individual con CV y carta de motivación.
7. Registra cada envío.
8. Evita duplicados.
9. Clasifica las respuestas.
10. No depende de que exista una vacante publicada.

La lógica debe equivaler a **entregar personalmente el CV en cada establecimiento**.

## Regla central

**No buscar vacantes como condición para enviar.**

Las páginas de empleo, carrera o jobs solo se usan como posibles fuentes para encontrar un correo de contacto adecuado.

---

# 2. Estado actual

## Infraestructura operativa

- Docker
- n8n Community 2.30.6 en localhost
- Variables de entorno mediante `.env`
- Google OAuth
- Gmail OAuth
- Google Drive OAuth
- Google Sheets OAuth
- Groq API
- Apify API mediante HTTP Request con `Authorization: Bearer`
- Google Sheet operativo
- CV y carta de motivación almacenados en Google Drive
- IDs actualizados en `.env`

## WF-01 Hotel Discovery

Está operativo.

Actualmente:

- lee consultas;
- ejecuta Apify Google Maps;
- normaliza resultados;
- deduplica;
- inserta hoteles en `HOTELS`;
- registra eventos.

La llamada usada para Apify es:

```text
POST
https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items
```

Header:

```text
Authorization: Bearer {{$env.APIFY_TOKEN}}
```

No se usan credenciales nativas de Apify en n8n.

## WF-02 Website Enrichment

Actualmente funcionan estos nodos:

```text
Every 15 Minutes / Manual Trigger
→ Get Pending Hotels
→ Limit Batch
→ Fetch Homepage
→ Parse Homepage
→ Select Contact URL
→ Fetch Contact Page
→ Parse Contact Page
→ Update Hotel Status
→ Prepare Contacts
→ Insert Contacts
```

Se probó con Hotel Europe Davos y se obtuvo:

```text
info@europe-davos.ch
```

El correo fue insertado correctamente en `CONTACTS`.

---

# 3. Corrección estratégica obligatoria

El pipeline no debe centrarse en detectar vacantes.

Debe centrarse en **descubrir y clasificar contactos empresariales públicos**.

## Prioridad de destinatarios

Orden recomendado:

1. `jobs@`
2. `karriere@`
3. `career@`
4. `bewerbung@`
5. `hr@`
6. `humanresources@`
7. `personal@`
8. `recruiting@`
9. dirección o gerencia
10. `info@`, `kontakt@`, `contact@`, `office@`
11. recepción
12. reservas o booking como último recurso

No descartar un establecimiento porque:

- no tenga web;
- no tenga vacantes;
- no tenga correo de RR. HH.;
- solo tenga email público en Google Maps, Instagram, Facebook o directorio.

## Regla de selección

```text
Si existe HR/JOBS:
    seleccionar ese correo

Si no existe HR/JOBS pero existe MANAGEMENT:
    seleccionar dirección o gerencia

Si no existe lo anterior pero existe GENERAL:
    seleccionar correo general

Si solo existe RECEPTION o RESERVATION:
    seleccionar como fallback de baja prioridad

Si no existe ningún correo:
    marcar NO_EMAIL_FOUND
```

No inventar, completar ni inferir direcciones de correo.

---

# 4. Trabajo inmediato requerido

## Fase A — finalizar correctamente WF-02

No eliminar lo que ya funciona.

Modificar y ampliar WF-02 para que:

1. Analice homepage.
2. Descubra enlaces internos relevantes.
3. Visite varias páginas internas, no solo una.
4. Extraiga todos los correos encontrados.
5. Guarde la URL exacta donde apareció cada correo.
6. Elimine duplicados.
7. Inserte todos los contactos válidos en `CONTACTS`.
8. No inserte dos veces el mismo correo para el mismo hotel.
9. No se detenga cuando una página falle.
10. Actualice el hotel aunque no encuentre correo.

## URLs y términos prioritarios

```text
kontakt
contact
jobs
job
karriere
career
stellen
bewerbung
personal
team
management
direktion
impressum
ueber-uns
über-uns
```

Máximo inicial:

```text
8 páginas internas por dominio
```

No seguir enlaces externos.

## Emails inválidos o irrelevantes a filtrar

Excluir:

```text
example@
noreply@
no-reply@
wordpress@
sentry@
wix@
cloudflare@
```

Excluir cadenas que terminen en extensiones de imagen o archivo.

No eliminar automáticamente:

```text
reservation@
booking@
reception@
restaurant@
```

Deben clasificarse, no descartarse.

---

# 5. Modelo esperado para CONTACTS

Usar los encabezados actuales definidos en `SPEC.md`:

```text
contact_id
hotel_id
email
email_type
contact_name
contact_role
source_url
source_text
confidence
verified_syntax
verified_domain
preferred
review_status
created_at
```

## Tipos permitidos

```text
JOBS
HR
MANAGEMENT
GENERAL
RECEPTION
RESERVATION
OTHER
UNKNOWN
```

## Reglas de clasificación preliminar sin Groq

Antes de WF-03 se puede aplicar clasificación determinista:

```text
jobs, karriere, career, bewerbung → JOBS
hr, humanresources, personal, recruiting → HR
direktion, director, manager, management, geschäftsleitung → MANAGEMENT
info, kontakt, contact, office, admin → GENERAL
reception, frontoffice → RECEPTION
reservation, reservations, booking, reservierung → RESERVATION
otros → UNKNOWN
```

## Reglas de revisión

```text
JOBS / HR:
    review_status = APPROVED
    preferred = posible candidato

MANAGEMENT:
    review_status = NEEDS_REVIEW

GENERAL:
    review_status = NEEDS_REVIEW

RECEPTION / RESERVATION:
    review_status = NEEDS_REVIEW
    baja prioridad

UNKNOWN:
    review_status = NEEDS_REVIEW
```

No usar `Append Row` sin control de duplicados.

Deduplicar por:

```text
hotel_id + email normalizado
```

---

# 6. Fuentes sin web

WF-01 y los workflows posteriores deben conservar establecimientos aunque `website` esté vacío.

Para establecimientos sin web:

1. revisar si Apify devuelve email;
2. revisar `source_url`;
3. revisar enlaces sociales públicos encontrados;
4. revisar Instagram/Facebook solo mediante fuentes permitidas y sin evadir bloqueos;
5. insertar cualquier correo empresarial público encontrado;
6. clasificarlo igual que cualquier otro contacto.

Añadir o conservar en `HOTELS` la información disponible:

```text
website
source_url
normalized_domain
```

Si no existe dominio, deduplicar provisionalmente por:

```text
normalized_name + town
```

---

# 7. Implementar WF-03 Groq Contact Classification

Cuando WF-02 esté terminado y probado, implementar:

```text
WF-03 Groq Contact Classification
```

## Objetivo

Elegir el mejor correo disponible por establecimiento.

## Entrada al modelo

```json
{
  "hotel": {
    "hotel_id": "...",
    "name": "...",
    "town": "...",
    "website": "..."
  },
  "emails_found": [
    {
      "email": "...",
      "email_type_preclassified": "...",
      "source_url": "...",
      "source_text": "..."
    }
  ]
}
```

## Prompt del sistema

```text
Eres un clasificador de contactos empresariales para candidaturas espontáneas en hoteles y restaurantes de Suiza.

No necesitas comprobar si existe una vacante.

Tu objetivo es seleccionar el mejor correo público disponible para enviar una candidatura espontánea de Koch / Küchenmitarbeiter.

Solo puedes seleccionar correos que aparezcan literalmente en emails_found.

Nunca inventes, completes ni adivines direcciones.

Prioriza en este orden:
1. JOBS
2. HR
3. MANAGEMENT
4. GENERAL
5. RECEPTION
6. RESERVATION
7. UNKNOWN

Un correo de recepción o reservas es válido como último recurso cuando no existe otro.

Devuelve exclusivamente JSON válido.
```

## Salida esperada

```json
{
  "best_email": "info@example.ch",
  "email_type": "GENERAL",
  "preferred_contact_id": "cnt-...",
  "manual_review": true,
  "send_recommended": true,
  "reason": "No HR email was found; this is the only public general contact.",
  "confidence": 0.82
}
```

## Validaciones obligatorias

- `best_email` debe existir literalmente en la entrada.
- `confidence` entre 0 y 1.
- nunca inventar emails;
- un único contacto `preferred=true` por hotel;
- si hay HR/JOBS válido, no seleccionar recepción o reservas;
- si solo hay recepción o reservas, permitirlo con revisión;
- si no hay contactos, marcar `NO_EMAIL_FOUND`.

---

# 8. Implementar WF-04 Review Queue

La revisión no debe bloquear toda la campaña.

## Estados propuestos

```text
HR/JOBS con confianza alta:
    READY_TO_SEND

MANAGEMENT:
    NEEDS_REVIEW

GENERAL:
    NEEDS_REVIEW

RECEPTION / RESERVATION:
    NEEDS_REVIEW_LOW_PRIORITY
```

La hoja debe permitir aprobar rápidamente correos generales, recepción o reservas.

Columnas editables:

```text
review_decision
approved_email
review_notes
reviewed_at
```

Valores:

```text
APPROVED
REJECTED
SKIP
```

---

# 9. Preparación del envío

Usar los archivos de Google Drive definidos mediante:

```text
GOOGLE_DRIVE_CV_FILE_ID
GOOGLE_DRIVE_MOTIVATION_FILE_ID
```

Adjuntar siempre:

```text
Lebenslauf_Jesus_Hernandez.pdf
Motivationsschreiben_Jesus_Hernandez.pdf
```

## Asunto

```text
Interesse an einer Tätigkeit als Koch / Küchenmitarbeiter
```

## Cuerpo

```text
Sehr geehrte Damen und Herren

derzeit bin ich auf der Suche nach einer Stelle als Koch oder Küchenmitarbeiter in der Schweiz.

Ich verfüge über praktische Erfahrung in internationalen Hotel- und Restaurantküchen. Zu meinen bisherigen Aufgaben gehören Mise en Place, warme und kalte Küche, Grill, Plancha, Fritteuse, Frühstück, Buffet, Room Service, Bankett sowie die Mitarbeit während arbeitsintensiver Servicezeiten. Ich kann mich rasch auf unterschiedliche Posten und Arbeitsabläufe einstellen, arbeite sauber und organisiert und unterstütze das Team dort, wo es im täglichen Küchenbetrieb notwendig ist.

Besonders interessiert mich die Möglichkeit, in der Schweiz zu leben und zu arbeiten, das alpine Umfeld kennenzulernen und entweder während einer ganzen Saison oder längerfristig in einem Betrieb tätig zu sein.

Zurzeit wohne ich in Madrid. Ich bin spanischer Staatsbürger und EU/EFTA-Bürger und stehe für einen kurzfristigen Umzug in die Schweiz zur Verfügung. Spanisch ist meine Muttersprache, Englisch spreche ich auf B2-Niveau und Deutsch lerne ich derzeit auf A1-Niveau.

Ich interessiere mich sowohl für Saisonstellen als auch für Festanstellungen, vorzugsweise in einem Betrieb, der eine Mitarbeiterunterkunft und Verpflegungsmöglichkeiten anbietet.

Falls Sie aktuell eine passende Stelle frei haben oder in den kommenden Monaten Verstärkung für Ihre Küche suchen, würde ich mich freuen, wenn Sie mein Profil berücksichtigen und mit mir Kontakt aufnehmen. Meinen Lebenslauf und mein Motivationsschreiben finden Sie im Anhang.

Freundliche Grüsse

Jesus Hernandez
+34 666 056 214
hernandezpacheco2805@gmail.com
```

No personalizar con información no demostrada.

---

# 10. Seguridad de envío

Mantener inicialmente:

```text
DRY_RUN=true
OUTREACH_ENABLED=false
MAX_DAILY_SENDS=5
```

No activar envíos reales sin confirmación humana.

Antes de enviar:

1. comprobar que el contacto está aprobado;
2. comprobar `DO_NOT_CONTACT`;
3. comprobar que no existe un `SENT` anterior al mismo email;
4. comprobar que no existe un envío previo al mismo dominio, salvo aprobación;
5. verificar los dos PDF;
6. verificar asunto y cuerpo;
7. respetar horario;
8. respetar contador diario.

Un email por mensaje.

No CC.

No BCC.

---

# 11. Forma de trabajo obligatoria

Trabajar paso a paso.

Para cada workflow:

1. abrir workflow;
2. revisar nodos existentes;
3. cambiar placeholders;
4. configurar credenciales;
5. ejecutar nodo por nodo;
6. corregir errores;
7. validar el resultado en Google Sheets;
8. dejar todos los nodos en verde;
9. ejecutar el workflow completo;
10. documentar qué se cambió;
11. exportar copia JSON;
12. pasar al siguiente workflow.

No configurar varios workflows a la vez.

No sustituir nodos funcionales sin necesidad.

No inventar que algo funciona: debe probarse.

---

# 12. Criterios de aceptación inmediatos

Antes de avanzar al sender:

## WF-02

- procesa al menos 10 hoteles;
- visita varias páginas internas;
- no se detiene por una URL fallida;
- extrae todos los correos encontrados;
- guarda `source_url`;
- no inventa emails;
- no duplica el mismo email para el mismo hotel;
- conserva reservas y recepción como fallback;
- actualiza correctamente `HOTELS`;
- inserta correctamente `CONTACTS`.

## WF-03

- clasifica correctamente una muestra de:
  - jobs@;
  - hr@;
  - personal@;
  - info@;
  - reception@;
  - reservation@;
  - varios correos;
  - solo correo general;
  - solo correo de reservas;
  - sin correo;
- selecciona el mejor contacto;
- no inventa emails;
- deja un único `preferred=true`.

## Antes del envío

- ambos PDF descargados;
- previsualización correcta;
- cero correos reales enviados;
- `DRY_RUN_OK` registrado;
- controles de duplicados verificados.

---

# 13. Primera acción que debes realizar

No construyas todavía WF-05.

Empieza por:

1. exportar una copia del WF-02 actual;
2. revisar cómo procesar múltiples enlaces internos por hotel;
3. ampliar WF-02 para extraer todos los emails con su `source_url`;
4. añadir deduplicación antes de `Insert Contacts`;
5. ejecutar una prueba manual con 10 hoteles;
6. mostrar resultados de `HOTELS` y `CONTACTS`;
7. corregir cualquier error;
8. solo después comenzar WF-03.

Entrega cambios funcionales, no pseudocódigo.
