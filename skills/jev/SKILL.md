---
name: jev
description: Toma decisiones tipadas (sí/no con probabilidad o elegir una opción) con el modelo Jev vía OpenRouter, sin gastar tokens del modelo principal. Úsalo para clasificar, filtrar o rutear cuando se necesita una respuesta estructurada, no texto libre, y cuando la decisión es barata de revisar pero cara de razonar.
---

# Jev (decisiones tipadas vía OpenRouter)

Jev devuelve respuestas tipadas con probabilidad: elige una opción de una lista (`choice`) o responde sí/no con probabilidad (`noul`). No razona ni explica. Sirve para decidir rápido y barato; las decisiones de alto impacto siguen necesitando una verificación determinística o humana.

## Requisitos

- Variable de entorno `OPENROUTER_API_KEY` con una clave de OpenRouter.
- Node 18 o superior. No hay dependencias que instalar.

## Cómo llamarlo

Mandar un JSON por stdin al script:

```bash
echo '{
  "state": "Texto o datos sobre los que decidir",
  "questions": {
    "es_urgente": { "type": "noul", "instructions": "¿Requiere atención hoy?" },
    "equipo": {
      "type": "choice",
      "instructions": "¿Qué equipo lo atiende?",
      "criteria": { "pagos": "Cobros fallidos", "frontend": "Errores de pantalla" }
    }
  }
}' | node ~/.claude/skills/jev/scripts/jev.mjs
```

Reglas del formato:
- `noul` no lleva `criteria`, o si la lleva debe tener las claves `"true"` y `"false"`.
- `choice` necesita `criteria` con al menos una opción.
- Se pueden mandar varias preguntas en una sola llamada. Hacerlo así gasta menos.

## Cómo leer la respuesta

**Si la salida trae `"fallback": true`, Jev no respondió** (sin clave, sin créditos, red caída o error de OpenRouter). En ese caso la skill sigue avanzando sin la decisión de Jev: usa el camino normal de la skill, y avísale a Matías en una línea qué pasó (`reason`). `sin_creditos: true` indica que fue por créditos (402 o 429).

Si no hay fallback, la salida trae `answers` por cada pregunta, con:
- `verdict`: `yes` o `no` para `noul`; la opción elegida o `undecided` para `choice`.
- `probability`: la probabilidad asociada.

Los umbrales por defecto son 0.8 para `yes` o la opción elegida, y 0.2 para `no`. Se cambian con `JEV_THRESHOLD_HIGH` y `JEV_THRESHOLD_LOW`. Si el veredicto es `undecided`, no actúes sobre la respuesta: pregúntale a Matías.

## Límites

- Ventana de contexto de 32.000 tokens entre `state` y las preguntas.
- Las respuestas incluyen `cost` en USD cuando OpenRouter lo informa.
- Si la llamada falla por red o por la clave, el script termina con código 1 y el error en stderr.

## Qué no hacer

- No usarlo para decisiones irreversibles (cobros, borrados, despliegues) sin una validación aparte.
- No pegar claves ni datos personales en `state` sin necesidad.
