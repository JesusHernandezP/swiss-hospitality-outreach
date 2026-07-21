# SPEC.md — Swiss Hospitality Outreach

## 1. Propósito

Sistema automatizado de candidatura espontánea para establecimientos de hostelería en la Suiza alemana.

El sistema no depende de vacantes publicadas. Su función es presentar el perfil del candidato a Recursos Humanos, dirección o contacto general para oportunidades actuales o futuras.

## 2. Alcance

### Incluido

- Descubrimiento de hoteles y establecimientos turísticos.
- Extracción de webs oficiales.
- Extracción de correos públicos.
- Identificación de páginas de empleo.
- Clasificación de contactos mediante Groq.
- Revisión manual de casos ambiguos.
- Envío individualizado por Gmail.
- Adjuntos desde Google Drive.
- Registro de solicitudes.
- Clasificación de respuestas.
- Métricas diarias.
- Control de duplicados, rebotes y exclusiones.

### Excluido de la primera versión

- Aplicar dentro de formularios complejos de ATS.
- Resolver CAPTCHAs.
- Crear cuentas automáticamente en portales.
- Responder entrevistas automáticamente.
- Negociar condiciones.
- Seguimientos automáticos.
- Scraping agresivo o evasión de bloqueos.
- Migración a PostgreSQL.

## 3. Fuentes de descubrimiento

El sistema debe admitir fuentes configurables:

1. Apify Google Maps Scraper o equivalente.
2. Directorios turísticos y hoteleros públicos.
3. Asociaciones hoteleras regionales.
4. Listas manuales de URLs.
5. Consultas por localidad.
6. Páginas de resultados de empleo, únicamente para descubrir empresas.

### Consultas iniciales sugeridas

```text
Hotel Davos
Hotel Arosa
Hotel St. Moritz
Hotel Pontresina
Hotel Lenzerheide
Hotel Klosters
Hotel Grindelwald
Hotel Wengen
Hotel Mürren
Hotel Adelboden
Hotel Gstaad
Hotel Andermatt
Hotel Engelberg
Hotel Zermatt
Hotel Saas-Fee
Berghotel Graubünden
Wellnesshotel Berner Oberland
Ferienhotel Zentralschweiz
```

La lista debe ser editable desde una pestaña `SEARCH_QUERIES`.

## 4. Modelo de datos

### 4.1 Hoja `HOTELS`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| hotel_id | string | sí | UUID |
| hotel_name | string | sí | Nombre comercial |
| normalized_name | string | sí | Nombre normalizado |
| town | string | no | Localidad |
| canton | string | no | Cantón |
| country | string | sí | CH |
| language_region | enum | no | DE/FR/IT/MIXED/UNKNOWN |
| hotel_type | enum | no | HOTEL/RESORT/BERGHOTEL/GASTHOF/OTHER |
| stars | number | no | Categoría |
| website | url | sí | Web oficial |
| normalized_domain | string | sí | Dominio deduplicado |
| source_url | url | sí | Fuente del descubrimiento |
| career_url | url | no | Página de empleo |
| contact_url | url | no | Página de contacto |
| accommodation | enum | sí | YES/NO/UNKNOWN |
| meals | enum | sí | YES/NO/UNKNOWN |
| active_vacancy | enum | sí | YES/NO/UNKNOWN |
| status | enum | sí | Estado canónico |
| priority | enum | sí | HIGH/MEDIUM/LOW |
| manual_review | boolean | sí | Revisión requerida |
| created_at | datetime | sí | Creación |
| updated_at | datetime | sí | Actualización |
| last_error | string | no | Error más reciente |

### 4.2 Hoja `CONTACTS`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| contact_id | string | sí | UUID |
| hotel_id | string | sí | Relación |
| email | string | sí | Email normalizado |
| email_type | enum | sí | HR/JOBS/MANAGEMENT/GENERAL/RECEPTION/RESERVATION/UNKNOWN |
| contact_name | string | no | Persona |
| contact_role | string | no | Cargo |
| source_url | url | sí | Evidencia |
| source_text | string | no | Fragmento |
| confidence | number | sí | 0–1 |
| verified_syntax | boolean | sí | Validación sintáctica |
| verified_domain | boolean | sí | Dominio válido |
| preferred | boolean | sí | Contacto seleccionado |
| review_status | enum | sí | APPROVED/NEEDS_REVIEW/REJECTED |
| created_at | datetime | sí | Creación |

### 4.3 Hoja `APPLICATIONS`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| application_id | string | sí | UUID |
| hotel_id | string | sí | Hotel |
| contact_id | string | sí | Destinatario |
| recipient_email | string | sí | Email |
| subject | string | sí | Asunto |
| salutation | string | sí | Saludo |
| body_version | string | sí | Versión |
| status | enum | sí | READY_TO_SEND/SENT/etc. |
| scheduled_at | datetime | no | Programación |
| sent_at | datetime | no | Envío |
| gmail_message_id | string | no | ID interno |
| gmail_thread_id | string | no | Hilo |
| response_type | string | no | Clasificación |
| response_at | datetime | no | Fecha |
| retry_count | number | sí | Reintentos |
| last_error | string | no | Error |

### 4.4 Hoja `EVENTS`

```text
event_id
timestamp
workflow
entity_type
entity_id
event_type
details_json
```

### 4.5 Hoja `CONFIG`

```text
key
value
description
```

### 4.6 Hoja `DO_NOT_CONTACT`

```text
email
domain
reason
created_at
```

## 5. Workflow WF-01 — Hotel Discovery

### Trigger

- Manual.
- Programado una vez al día.
- Entrada opcional: región o query.

### Flujo

1. Leer `SEARCH_QUERIES`.
2. Ejecutar consulta en Apify.
3. Normalizar resultados.
4. Filtrar Suiza.
5. Exigir web oficial o marcar para enriquecimiento.
6. Derivar dominio.
7. Deduplicar.
8. Insertar nuevos hoteles en `HOTELS`.
9. Registrar evento.

### Salida mínima

```json
{
  "hotel_name": "Example Hotel",
  "town": "Davos",
  "website": "https://example.ch",
  "normalized_domain": "example.ch",
  "source_url": "..."
}
```

### Criterios

- No duplicar dominios.
- No insertar listados sin evidencia de establecimiento.
- Marcar apartamentos privados y alojamientos irrelevantes como `REJECTED`.

## 6. Workflow WF-02 — Website Enrichment

### Entrada

```text
status = SCRAPE_PENDING
```

### URLs prioritarias

Analizar homepage y enlaces internos con:

```text
kontakt
contact
jobs
job
karriere
career
stellen
bewerbung
team
impressum
personal
ueber-uns
über-uns
```

También probar, con límite:

```text
/kontakt
/contact
/jobs
/karriere
/career
/stellen
/impressum
```

### Extracción

- correos `mailto:`;
- texto visible;
- JSON-LD;
- nombres y cargos;
- career URL;
- términos sobre alojamiento y comidas;
- idioma del sitio;
- indicios de restaurante/cocina.

### Limitaciones

- máximo inicial: 8 páginas por dominio;
- pausa entre peticiones;
- timeout;
- reintentos máximos: 2;
- no seguir enlaces externos;
- no usar navegador dinámico salvo necesidad.

### Evidencias de alojamiento

```text
Mitarbeiterunterkunft
Personalzimmer
Personalwohnung
Unterkunft für Mitarbeitende
Mitarbeiterhaus
Staff accommodation
```

### Evidencias de comidas

```text
Personalrestaurant
Mitarbeiterverpflegung
Verpflegung
vergünstigte Mahlzeiten
staff meals
```

Ausencia de evidencia significa `UNKNOWN`, no `NO`.

## 7. Workflow WF-03 — Groq Contact Classification

### Entrada al modelo

```json
{
  "hotel": {
    "name": "...",
    "town": "...",
    "website": "..."
  },
  "emails_found": [
    {
      "email": "jobs@example.ch",
      "source_url": "...",
      "context": "..."
    }
  ],
  "career_page_text": "...",
  "contact_page_text": "..."
}
```

### Esquema de salida

```json
{
  "is_target_establishment": true,
  "language_region": "DE",
  "has_food_operation": true,
  "best_email": "jobs@example.ch",
  "email_type": "JOBS",
  "contact_name": null,
  "contact_role": null,
  "accommodation": "UNKNOWN",
  "meals": "UNKNOWN",
  "manual_review": false,
  "reason": "Public jobs address found on career page",
  "confidence": 0.98
}
```

### Prompt del sistema

```text
Eres un clasificador de contactos empresariales para candidaturas laborales.
Solo puedes seleccionar direcciones que aparezcan literalmente en emails_found.
No inventes, completes ni adivines correos.
Prioriza JOBS y HR, después MANAGEMENT, GENERAL y finalmente RECEPTION/RESERVATION.
Un correo GENERAL requiere manual_review=true.
Marca accommodation o meals como YES/NO únicamente con evidencia explícita.
Devuelve exclusivamente JSON válido conforme al esquema.
```

### Validaciones posteriores

- `best_email` debe existir en `emails_found`.
- `confidence` debe estar entre 0 y 1.
- GENERAL, RECEPTION, RESERVATION o UNKNOWN => `NEEDS_REVIEW`.
- HR o JOBS con confidence ≥ 0.85 => `READY_TO_SEND`.
- Cualquier incoherencia => `ERROR`.

## 8. Workflow WF-04 — Review Queue

### Objetivo

Facilitar la revisión de correos generales.

### Vista de revisión

Debe mostrar:

- hotel;
- localidad;
- web;
- career URL;
- contact URL;
- todos los emails;
- contexto;
- recomendación de Groq;
- alojamiento;
- decisión manual.

Columnas editables:

```text
review_decision
approved_email
review_notes
reviewed_at
```

El workflow detecta decisiones y actualiza el estado.

## 9. Workflow WF-05 — Candidate Outreach Sender

### Condiciones de selección

Solo filas que cumplan:

```text
status = READY_TO_SEND
manual_review = false
o review_decision = APPROVED
domain not in DO_NOT_CONTACT
recipient not previously sent
daily_count < MAX_DAILY_SENDS
current_time within send window
DRY_RUN = false
OUTREACH_ENABLED = true
```

### Asunto predeterminado

```text
Interesse an einer Tätigkeit als Koch / Küchenmitarbeiter
```

Alternativa configurable:

```text
Interesse an aktuellen oder zukünftigen Stellen in Ihrer Küche
```

### Saludo

1. Persona conocida:
   - `Sehr geehrte Frau {{last_name}}`
   - `Sehr geehrter Herr {{last_name}}`
2. Sin persona:
   - `Sehr geehrte Damen und Herren`

### Cuerpo base

```text
{{salutation}}

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

### Adjuntos

Obtener desde Google Drive:

1. CV PDF.
2. Carta de motivación PDF.

Validar:

- existencia;
- formato PDF;
- tamaño admisible;
- nombre profesional;
- contenido binario presente.

### Distribución diaria

Configuración inicial:

```text
MAX_DAILY_SENDS=30
SEND_WINDOW_START=08:30
SEND_WINDOW_END=18:30
MIN_DELAY_SECONDS=420
MAX_DELAY_SECONDS=900
```

Escalado:

- días 1–2: 25–30;
- días 3–5: 40–50, solo si no hay advertencias;
- fase estable: 50–70, sujeto a cuota, rebotes y entregabilidad.

El workflow debe usar un contador diario real. Nunca asumir que el número de ejecuciones equivale al número enviado.

### Idempotencia

Antes de Gmail:

```text
assert no prior SENT for recipient_email
assert no prior SENT for normalized_domain unless manually approved
```

Después de Gmail:

- guardar IDs;
- marcar `SENT`;
- registrar evento.

### Modo DRY_RUN

Con `DRY_RUN=true`:

- construir asunto y cuerpo;
- verificar adjuntos;
- no llamar al nodo de envío;
- guardar previsualización;
- marcar `DRY_RUN_OK`.

## 10. Workflow WF-06 — Inbox Response Triage

### Trigger

Cada 15–30 minutos o mediante búsqueda programada.

### Clasificación Groq

```json
{
  "response_type": "REJECTED",
  "reason": "NO_VACANCY",
  "requires_human_action": false,
  "accommodation": "UNKNOWN",
  "swiss_residence_required": false,
  "summary_es": "No tienen una vacante adecuada actualmente.",
  "confidence": 0.96
}
```

### Tipos

```text
INTERVIEW
INFO_REQUEST
POSITIVE
REJECTED
NO_VACANCY
NO_ACCOMMODATION
SWISS_RESIDENCE_REQUIRED
AUTO_REPLY
BOUNCE
UNKNOWN
```

### Acciones

- `INTERVIEW`, `INFO_REQUEST`, `POSITIVE`: marcar prioridad alta y alertar; no responder.
- `BOUNCE`: marcar email inválido y detener reintentos.
- `REJECTED`: actualizar estado.
- `UNKNOWN`: revisión manual.

## 11. Workflow WF-07 — Métricas

Resumen diario:

- hoteles descubiertos;
- hoteles enriquecidos;
- contactos HR/JOBS;
- revisiones pendientes;
- correos enviados;
- rebotes;
- respuestas;
- entrevistas;
- rechazos;
- porcentaje de respuesta;
- errores.

Guardar en `METRICS` y enviar un resumen al candidato.

## 12. Workflow WF-99 — Error Handler

Capturar:

- workflow;
- ejecución;
- nodo;
- entidad;
- mensaje;
- stack resumido;
- timestamp.

Acciones:

- registrar en `EVENTS`;
- marcar entidad como `ERROR` sin destruir el estado anterior;
- alertar cuando falle Gmail, se alcance cuota, falten adjuntos, Groq devuelva JSON inválido repetidamente, Sheets no responda o aumenten los rebotes.

## 13. Requisitos no funcionales

### Seguridad

- OAuth para Google.
- Secrets en credenciales de n8n.
- Sin claves en Sheets.
- Sin datos sensibles en logs.
- Exportaciones JSON sin secretos.

### Observabilidad

- eventos append-only;
- métricas diarias;
- logs de errores;
- IDs de Gmail;
- trazabilidad hotel → contacto → candidatura → respuesta.

### Rendimiento

- procesamiento por lotes;
- límites por dominio;
- caché de webs visitadas;
- no volver a scrapear antes del periodo configurable.

### Fiabilidad

- reintentos con backoff;
- idempotencia;
- contador diario;
- interruptor global `OUTREACH_ENABLED`.

## 14. Criterios de aceptación

### Descubrimiento

- 100 hoteles únicos importados.
- Menos de 5 % de duplicados después de normalización.

### Contactos

- Cada email tiene `source_url`.
- Ningún email inventado.
- HR/JOBS identificado correctamente en muestra manual.
- GENERAL siempre pasa por revisión.

### Envío

- Dos PDF adjuntos.
- Asunto y saludo correctos.
- Un correo por destinatario.
- Máximo diario respetado.
- Distribución horaria funcional.
- Modo DRY_RUN probado.
- IDs Gmail registrados.

### Respuestas

- Hilos vinculados a la candidatura.
- Respuestas positivas generan alerta.
- Rebotes bloquean nuevos envíos.
- No existe respuesta automática al hotel.

### Seguridad

- Secretos fuera del código.
- Interruptor de emergencia.
- Exportación de workflows disponible.
