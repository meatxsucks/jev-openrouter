# jev-openrouter

Cliente de **Jev** (decisiones tipadas con probabilidad) a través de la API de OpenRouter, pensado como skill de Claude Code. Sirve para decidir algo barato y estructurado, como clasificar, filtrar o rutear, sin gastar tokens del modelo principal en cada decisión.

Jev es el modelo de decisiones de TypeSafe AI, disponible en OpenRouter como `typesafe/jev-1.13`. Este proyecto no está afiliado a TypeSafe ni a OpenRouter.

## Cómo funciona

```mermaid
flowchart TD
    A[Claude Code necesita una decisión] --> B[Arma el JSON: state + questions]
    B --> C[echo JSON | node jev.mjs]
    C --> D{¿Hay clave y créditos?}
    D -- Sí --> E[POST openrouter.ai/api/alpha/decisions<br/>modelo typesafe/jev-1.13]
    E --> F{Probabilidad}
    F -- "≥ 0.8" --> G[verdict: yes / opción elegida]
    F -- "≤ 0.2" --> H[verdict: no]
    F -- "entre 0.2 y 0.8" --> I[verdict: undecided]
    D -- No --> J[fallback: true + reason]
    J --> K[La skill sigue por su camino normal<br/>y avisa en una línea]
    G --> L[La skill actúa]
    H --> L
    I --> M[Decide la sesión y lo dice]
```

Si Jev no responde (sin clave, sin créditos, red caída, error de OpenRouter o JSON inválido), el script **no falla**: devuelve `fallback: true` con el motivo y sale con código 0. Así la skill nunca se bloquea por falta de créditos.

## Qué incluye

- `skills/jev/scripts/jev.mjs`: cliente sin dependencias (Node 18 o superior). Lee un JSON por stdin y devuelve veredictos por stdout.
- `skills/jev/SKILL.md`: la skill para Claude Code, con el formato de las preguntas y cómo leer las respuestas.
- `test/jev.test.mjs`: 9 pruebas que no hacen llamadas reales (usan un `fetch` falso).

Primitivas soportadas: `choice` (elegir una opción de una lista) y `noul` (sí/no con probabilidad).

## Instalación

Copiar la skill a tu carpeta de Claude Code:

```bash
mkdir -p ~/.claude/skills
cp -r skills/jev ~/.claude/skills/jev
```

Definir la clave en tu entorno. Nunca la pongas en el repo:

```bash
export OPENROUTER_API_KEY="tu-clave"
```

Si usas `claude-or` con la clave en el Llavero de macOS, puedes reutilizarla así:

```bash
export OPENROUTER_API_KEY="$(security find-generic-password -a "$USER" -s claude-openrouter -w 2>/dev/null)"
```

## Uso directo

```bash
echo '{"state":"Pago rechazado tres veces","questions":{"es_urgente":{"type":"noul","instructions":"¿Requiere atención hoy?"}}}' \
  | node skills/jev/scripts/jev.mjs
```

Respuesta con clave y créditos:

```json
{
  "model": "typesafe/jev-1.13-20260917",
  "answers": {
    "es_urgente": { "probability": 0.82, "verdict": "yes" }
  },
  "cost": 0.000011718
}
```

Respuesta sin clave, sin créditos o con error:

```json
{
  "fallback": true,
  "sin_creditos": false,
  "reason": "Falta la variable de entorno OPENROUTER_API_KEY"
}
```

## Uso como módulo

```js
import { decidir } from "./skills/jev/scripts/jev.mjs";

const r = await decidir({
  state: "Pago rechazado tres veces",
  questions: {
    es_urgente: { type: "noul", instructions: "¿Requiere atención hoy?" },
  },
});
console.log(r.answers.es_urgente.verdict); // yes | no | undecided
```

## Configuración

| Variable | Default | Qué hace |
|---|---|---|
| `OPENROUTER_API_KEY` | (obligatoria) | Clave de OpenRouter |
| `JEV_THRESHOLD_HIGH` | `0.8` | Probabilidad mínima para `yes` o una opción |
| `JEV_THRESHOLD_LOW` | `0.2` | Probabilidad máxima para `no` |

## Costo medido

Una pregunta `noul` con un `state` corto costó **USD 0.0000117** (medido el 9 de octubre de 2026). Con ese precio, una carga de 10 USD alcanza para cientos de miles de decisiones de este tipo. El costo real depende del largo del `state` y del número de preguntas, y el script lo reporta en el campo `cost` de cada respuesta.

## Pruebas

```bash
npm test
```

Las pruebas no hacen llamadas reales a OpenRouter. Cubren los umbrales, la construcción del JSON, la normalización de respuestas, el manejo de errores y el fallback del CLI.

## Limitaciones

- Jev no razona ni explica: devuelve tipo y probabilidad. Valida los umbrales con tus propios datos antes de confiar en ellos.
- La ventana de contexto es de 32.000 tokens entre el `state` y las preguntas.
- Las decisiones de alto impacto (cobros, borrados, despliegues) necesitan una validación aparte.

## Licencia

MIT. Ver [LICENSE](LICENSE).
