# AGENTS.md — Swiss Hospitality Outreach

## 1. Misión

Implementar en n8n un sistema de prospección laboral para contactar hoteles, resorts, restaurantes de hotel y establecimientos turísticos de la Suiza alemana, aunque no tengan una vacante publicada.

El sistema debe:

1. Descubrir establecimientos relevantes.
2. Localizar su web oficial.
3. Extraer correos empresariales públicos.
4. Identificar el mejor contacto para candidaturas.
5. Clasificar los resultados con Groq.
6. Enviar una candidatura espontánea individual con CV y carta de motivación.
7. Distribuir los envíos durante el día.
8. Registrar cada acción.
9. Detectar y clasificar respuestas.
10. Impedir duplicados y reenvíos accidentales.

El objetivo operativo es equivalente a entregar el CV personalmente en cada establecimiento.

## 2. Contexto del candidato

- Ciudadano español y de la UE/EFTA.
- Reside actualmente en Madrid.
- Disponibilidad inmediata para trasladarse a Suiza.
- Puestos objetivo: Koch, Küchenmitarbeiter, Jungkoch, Commis de Cuisine, Frühstückskoch y, cuando las funciones sean realmente de cocina, Hilfskoch.
- Experiencia práctica internacional en hoteles, restaurantes, banquetes, room service, desayunos, cocina caliente y fría, grill, plancha, freidora, mise en place, inventario, FIFO y HACCP.
- Idiomas: español nativo, inglés B2 y alemán A1 en aprendizaje activo.
- Preferencias: Suiza alemana, establecimientos turísticos o de montaña, empleo estacional o fijo y, cuando sea posible, alojamiento y manutención.

No descartar un establecimiento porque no tenga una vacante activa. La finalidad es entrar en su base de candidatos y ser considerado para necesidades actuales o futuras.

## 3. Resultado esperado

El agente debe entregar workflows de n8n funcionales, documentados y exportables en JSON, además de:

- estructura de Google Sheets;
- credenciales referenciadas, nunca embebidas;
- prompts de Groq;
- nodos Code necesarios;
- manejo de errores;
- pruebas;
- documentación de despliegue;
- variables configurables;
- criterios de aceptación cumplidos.

No se considera terminado un workflow que solo tenga nodos de ejemplo o pseudocódigo.

## 4. Arquitectura objetivo

```text
Fuentes públicas / Apify / directorios
                  ↓
       WF-01 Hotel Discovery
                  ↓
        Google Sheets: HOTELS
                  ↓
      WF-02 Website Enrichment
                  ↓
  emails + career page + evidencias
                  ↓
  WF-03 Groq Contact Classification
                  ↓
READY_TO_SEND / NEEDS_REVIEW / REJECTED
                  ↓
        WF-04 Review Queue
                  ↓
   WF-05 Candidate Outreach Sender
                  ↓
       Gmail + CV + carta PDF
                  ↓
   WF-06 Inbox Response Triage
                  ↓
 Google Sheets: APPLICATIONS / EVENTS
```

### Stack principal

- n8n: orquestación.
- Google Sheets: base operativa inicial y CRM.
- Gmail: envío y recepción.
- Google Drive: almacenamiento de CV y carta.
- Groq API: clasificación estructurada.
- Apify: descubrimiento y scraping cuando sea necesario.
- HTTP Request + HTML Extract/Code: lectura de webs convencionales.
- PostgreSQL/Supabase: opcional en una fase posterior.

## 5. Principios de implementación

### 5.1 Prioridad de contacto

Clasificar los correos en este orden:

1. `jobs@`, `karriere@`, `career@`, `bewerbung@`
2. `hr@`, `humanresources@`, `personal@`, `recruiting@`
3. Dirección o gerencia publicada por el establecimiento
4. `info@` o contacto general
5. Recepción o reservas, solo como último recurso y con revisión manual

No inventar correos. El modelo solo puede elegir entre direcciones encontradas en fuentes públicas.

### 5.2 Revisión manual

Toda fila con correo general debe quedar en:

```text
NEEDS_REVIEW
```

La revisión debe mostrar lo que encuentre de:

- URL de contacto;
- URL de empleo;
- correos encontrados;
- correo recomendado;
- evidencia textual;
- motivo de la clasificación.

### 5.3 Personalización

Personalización no obligatoria:

- nombre del establecimiento;
- saludo por nombre cuando exista una persona de contacto fiable;
- localidad, opcional;
- cuerpo estable y profesional.

No generar afirmaciones específicas sobre el hotel sin evidencia.

### 5.4 Envío

- Un correo por hotel.
- Nunca CC o BCC masivo.
- No reenviar al mismo dominio salvo decisión manual.
- Distribuir los envíos durante el horario configurado.
- Empezar con un lote controlado y escalar.
- No enviar respuestas automáticas a entrevistas o solicitudes de información.
- No realizar seguimientos automáticos sin aprobación.

### 5.5 Cumplimiento

- Usar únicamente información empresarial publicada.
- Respetar términos del sitio, robots.txt cuando corresponda y límites de tasa.
- No evadir CAPTCHAs ni controles de acceso.
- No recopilar datos personales no necesarios.
- Incluir mecanismo `DO_NOT_CONTACT`.
- Detener envíos ante rebotes, advertencias de Gmail o anomalías.

## 6. Convenciones de nombres de workflows

- `WF-01 Hotel Discovery`
- `WF-02 Website Enrichment`
- `WF-03 Groq Contact Classification`
- `WF-04 Review Queue`
- `WF-05 Candidate Outreach Sender`
- `WF-06 Inbox Response Triage`
- `WF-07 Daily Metrics`
- `WF-99 Error Handler`

Los nodos deben tener nombres descriptivos. Evitar nombres como `HTTP Request 3`, `Code 7` o `IF 2`.

## 7. Estados canónicos

```text
DISCOVERED
SCRAPE_PENDING
SCRAPED
HR_EMAIL_FOUND
GENERAL_EMAIL_FOUND
NEEDS_REVIEW
READY_TO_SEND
SENDING
SENT
BOUNCED
REPLIED
INTERVIEW
INFO_REQUEST
REJECTED
NO_VACANCY
NO_ACCOMMODATION
SWISS_RESIDENCE_REQUIRED
DUPLICATE
INVALID_EMAIL
DO_NOT_CONTACT
ERROR
```

## 8. Identificador y deduplicación

Clave primaria lógica:

```text
normalized_domain
```

Reglas:

- eliminar `www.`;
- convertir a minúsculas;
- eliminar protocolo, ruta, query y fragmento;
- un hotel puede tener varias propiedades bajo un mismo grupo, pero no se debe enviar dos veces al mismo correo sin revisión;
- deduplicar por email normalizado, dominio y nombre + localidad.

## 9. Variables de entorno

```text
GROQ_API_KEY
GROQ_MODEL
APIFY_TOKEN
GOOGLE_SHEET_ID
GOOGLE_DRIVE_CV_FILE_ID
GOOGLE_DRIVE_MOTIVATION_FILE_ID
SENDER_EMAIL
TIMEZONE=Europe/Madrid
MAX_DAILY_SENDS=30
SEND_WINDOW_START=08:30
SEND_WINDOW_END=18:30
MIN_DELAY_SECONDS=420
MAX_DELAY_SECONDS=900
DRY_RUN=true
OUTREACH_ENABLED=false
```

No guardar secretos en nodos Code, archivos JSON exportados ni Google Sheets.

## 10. Reglas para Groq

Groq puede:

- determinar si el establecimiento pertenece al objetivo;
- clasificar correos encontrados;
- elegir el mejor correo;
- identificar alojamiento o manutención si hay evidencia;
- clasificar respuestas;
- producir JSON conforme a esquema.

Groq no puede:

- inventar correos;
- inferir que existe alojamiento sin evidencia;
- decidir enviar a un correo general sin pasar por revisión;
- generar datos de contacto que no estén en el input.

Toda salida debe validarse con JSON Schema o un nodo Code.

## 11. Estándar de calidad

Cada workflow debe incluir:

- trigger claro;
- validación de entrada;
- control de duplicados;
- manejo de errores;
- reintentos limitados;
- logging;
- actualización de estado;
- idempotencia;
- modo `DRY_RUN`;
- notas dentro del canvas;
- ejecución de prueba con datos reales limitados.

## 12. Política de cambios

Antes de modificar un workflow existente:

1. Exportar copia JSON.
2. Documentar el cambio.
3. Probar en `DRY_RUN`.
4. Validar que no se envían duplicados.
5. Activar solo después de superar los criterios de aceptación.

## 13. Definición de terminado

El sistema se considera operativo cuando:

- descubre y deduplica hoteles;
- extrae contactos con evidencia;
- Groq produce JSON válido;
- los correos generales quedan en revisión;
- los contactos de RR. HH. pasan a cola;
- Gmail adjunta ambos PDF;
- distribuye los envíos;
- no supera el máximo diario;
- registra `message_id`, fecha y hotel;
- clasifica respuestas;
- existe un interruptor global de emergencia;
- funciona primero en `DRY_RUN` y después en producción controlada.
