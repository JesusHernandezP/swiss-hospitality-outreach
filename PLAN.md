# PLAN.md — Implementación de Swiss Hospitality Outreach

## Objetivo del plan

Construir el sistema en fases cortas, verificables y reversibles. El agente debe implementar y probar cada fase antes de activar envíos reales.

## Fase 0 — Preparación

### Tareas

- [ ] Crear proyecto o carpeta de workflows.
- [ ] Crear credenciales:
  - Google Sheets
  - Gmail
  - Google Drive
  - Groq
  - Apify
- [ ] Crear Google Sheet con pestañas:
  - `HOTELS`
  - `CONTACTS`
  - `APPLICATIONS`
  - `EVENTS`
  - `CONFIG`
  - `DO_NOT_CONTACT`
  - `SEARCH_QUERIES`
  - `METRICS`
- [ ] Cargar los encabezados definidos en `SPEC.md`.
- [ ] Subir CV y carta PDF a Google Drive.
- [ ] Configurar variables.
- [ ] Establecer:
  - `DRY_RUN=true`
  - `OUTREACH_ENABLED=false`
  - `MAX_DAILY_SENDS=5` para pruebas.
- [ ] Crear `WF-99 Error Handler`.

### Entregable

Infraestructura conectada y prueba de lectura/escritura en cada servicio.

### Criterio de salida

Todas las credenciales funcionan y no existen secretos embebidos.

## Fase 1 — Descubrimiento de establecimientos

### Tareas

- [ ] Implementar `WF-01 Hotel Discovery`.
- [ ] Leer queries desde `SEARCH_QUERIES`.
- [ ] Configurar Apify.
- [ ] Normalizar nombres, URLs y dominios.
- [ ] Deduplicar.
- [ ] Insertar solo nuevos hoteles.
- [ ] Registrar eventos.
- [ ] Probar con Davos, Arosa y Pontresina.
- [ ] Revisar manualmente 20 resultados.

### Pruebas

- Misma web encontrada dos veces.
- Hotel sin web.
- Cadena con varias propiedades.
- Resultado irrelevante.
- URL con `www`.
- URL con parámetros.

### Entregable

Al menos 50 hoteles únicos en `HOTELS`.

### Criterio de salida

Duplicados inferiores al 5 % en la muestra.

## Fase 2 — Enriquecimiento web

### Tareas

- [ ] Implementar `WF-02 Website Enrichment`.
- [ ] Visitar homepage.
- [ ] Descubrir páginas de contacto y empleo.
- [ ] Extraer emails y contexto.
- [ ] Detectar alojamiento y comidas.
- [ ] Guardar evidencias.
- [ ] Limitar páginas y tasa.
- [ ] Implementar caché.
- [ ] Probar páginas HTML, JavaScript, sin emails, con varios emails, 403/429 y redirecciones.

### Entregable

Contactos extraídos para al menos 30 hoteles.

### Criterio de salida

Cada correo tiene URL de origen y no existen correos inventados.

## Fase 3 — Clasificación con Groq

### Tareas

- [ ] Implementar `WF-03 Groq Contact Classification`.
- [ ] Crear prompt estricto.
- [ ] Usar salida JSON.
- [ ] Validar esquema.
- [ ] Verificar que `best_email` pertenece a la entrada.
- [ ] Aplicar reglas:
  - HR/JOBS → posible envío.
  - GENERAL y otros → revisión.
- [ ] Reintentar una vez ante JSON inválido.
- [ ] Enviar errores persistentes a revisión.

### Dataset de prueba

Preparar al menos 15 casos:

- jobs@;
- hr@;
- personal@;
- info@;
- reception@;
- varios correos;
- correo ofuscado;
- sin correo;
- proveedor externo;
- restaurante dentro del hotel.

### Entregable

Clasificación validada de 30 hoteles.

### Criterio de salida

Precisión manual mínima del 90 % al seleccionar el mejor contacto.

## Fase 4 — Revisión manual

### Tareas

- [ ] Implementar `WF-04 Review Queue`.
- [ ] Crear columnas editables.
- [ ] Generar enlaces directos a web, contacto y empleo.
- [ ] Detectar decisiones.
- [ ] Validar email aprobado.
- [ ] Actualizar estados.
- [ ] Implementar `DO_NOT_CONTACT`.

### Entregable

Cola usable para correos generales.

### Criterio de salida

Un caso aprobado y uno rechazado se procesan correctamente.

## Fase 5 — Preparación de candidatura

### Tareas

- [ ] Descargar CV desde Drive.
- [ ] Descargar carta desde Drive.
- [ ] Verificar PDFs.
- [ ] Crear asunto.
- [ ] Crear saludo.
- [ ] Renderizar cuerpo.
- [ ] Crear previsualización en `DRY_RUN`.
- [ ] Comprobar caracteres alemanes.
- [ ] Comprobar firma y teléfono.
- [ ] Guardar versión del cuerpo.

### Entregable

10 candidaturas renderizadas sin envío.

### Criterio de salida

Revisión humana aprueba asunto, cuerpo, saludo y adjuntos.

## Fase 6 — Envío controlado

### Tareas

- [ ] Implementar `WF-05 Candidate Outreach Sender`.
- [ ] Añadir controles:
  - `OUTREACH_ENABLED`
  - `DRY_RUN`
  - máximo diario
  - horario
  - duplicados
  - `DO_NOT_CONTACT`
  - adjuntos
- [ ] Implementar contador diario.
- [ ] Implementar espera aleatoria.
- [ ] Guardar IDs Gmail.
- [ ] Manejar errores.
- [ ] Activar con máximo 5.
- [ ] Enviar a direcciones propias de prueba.
- [ ] Verificar formato y adjuntos.
- [ ] Enviar lote real de 5.
- [ ] Observar 24 horas.

### Entregable

Primer lote real enviado y registrado.

### Criterio de salida

Cero duplicados, cero mensajes sin adjuntos y cero errores no registrados.

## Fase 7 — Escalado gradual

### Días 1–2

```text
MAX_DAILY_SENDS=25
```

Comprobar:

- rebotes;
- advertencias de Gmail;
- respuestas;
- errores;
- calidad de personalización.

### Días 3–5

Si el sistema está estable:

```text
MAX_DAILY_SENDS=40
```

### Fase estable

```text
MAX_DAILY_SENDS=50–70
```

No escalar si:

- rebote > 5 %;
- Gmail muestra advertencias;
- faltan adjuntos;
- errores > 2 %;
- contactos incorrectos > 10 %;
- hay duplicados.

### Entregable

Volumen estable distribuido durante el día.

## Fase 8 — Clasificación de respuestas

### Tareas

- [ ] Implementar `WF-06 Inbox Response Triage`.
- [ ] Buscar respuestas por thread.
- [ ] Extraer texto relevante.
- [ ] Clasificar con Groq.
- [ ] Validar JSON.
- [ ] Actualizar aplicación.
- [ ] Crear alerta para entrevista, información solicitada y respuesta positiva.
- [ ] Detectar rebotes.
- [ ] No responder automáticamente.

### Casos de prueba

- Rechazo genérico.
- Sin vacante.
- Sin alojamiento.
- Exige residencia suiza.
- Entrevista.
- Pide llamada.
- Respuesta automática.
- Rebote.
- Mensaje ambiguo.

### Entregable

Respuestas vinculadas y clasificadas.

### Criterio de salida

100 % de respuestas positivas generan alerta humana.

## Fase 9 — Métricas y operación

### Tareas

- [ ] Implementar `WF-07 Daily Metrics`.
- [ ] Crear resumen diario.
- [ ] Medir:
  - tasa de respuesta;
  - tasa de entrevista;
  - razones de rechazo;
  - revisiones pendientes;
  - errores;
  - capacidad restante del día.

### Entregable

Dashboard básico en Sheets y resumen diario.

## Fase 10 — Ampliación geográfica

Orden recomendado:

1. Graubünden.
2. Oberland bernés.
3. Suiza central.
4. Valais alemán.
5. St. Gallen/Toggenburg.
6. Appenzell.
7. Glarus.
8. Otras zonas germanófonas.

Añadir localidades por lotes y medir resultados antes de ampliar.

## Backlog posterior

- [ ] Migrar Sheets a PostgreSQL/Supabase.
- [ ] Crear interfaz web.
- [ ] Aplicar en formularios simples.
- [ ] Integrar búsqueda de vacantes.
- [ ] Personalización basada en evidencia.
- [ ] Seguimiento manual asistido.
- [ ] Clasificación de requisitos por oferta.
- [ ] Informes semanales.
- [ ] Separar hoteles por grupo empresarial.
- [ ] Probar versiones alternativas del asunto de forma controlada.

## Orden obligatorio para el agente

1. Leer `AGENTS.md`.
2. Leer `SPEC.md`.
3. Crear la infraestructura.
4. Implementar `WF-99`.
5. Implementar WF-01 a WF-04.
6. Demostrar adquisición y clasificación.
7. Implementar preparación de candidatura.
8. Probar en `DRY_RUN`.
9. Implementar envío.
10. Solicitar activación humana antes de producción.
11. Implementar clasificación de respuestas.
12. Exportar todos los workflows.

## Entregables finales

- JSON de cada workflow.
- Inventario de nodos.
- Google Sheet preparado.
- Documentación de credenciales.
- Tabla de variables.
- Prompts de Groq.
- Casos de prueba y resultados.
- Instrucciones de activación/desactivación.
- Procedimiento de recuperación ante errores.
- Registro de decisiones técnicas.
