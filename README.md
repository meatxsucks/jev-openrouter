# jev-openrouter

Cliente de **Jev** (decisiones tipadas con probabilidad) usando la API de OpenRouter, pensado como skill de Claude Code. Sirve para tomar decisiones baratas y estructuradas, como clasificar, filtrar o rutear, sin usar el modelo principal para cada una.

Jev es el modelo de decisiones de TypeSafe AI, disponible en OpenRouter como `typesafe/jev-1.13`. Este proyecto no está afiliado a TypeSafe ni a OpenRouter.

## Qué incluye

- `skills/jev/scripts/jev.mjs`: cliente sin dependencias. Lee un JSON por stdin y devuelve veredictos por stdout.
- `skills/jev/SKILL.md`: la skill para Claude Code, con el formato de las preguntas y cómo leer las respuestas.
- `test/jev.test.mjs`: pruebas sin red, con un `fetch` falso.

Primitivas soportadas: `choice` (elegir una opción) y `noul` (sí/no con probabilidad).

## Instalación

Copiar la skill a tu carpeta de Claude Code:

```bash
mkdir -p ~/.claude/skills
cp -r skills/jev ~/.claude/skills/jev
```

Y definir la clave en tu entorno (nunca en el repo):

```bash
export OPENROUTER_API_KEY="tu-clave"
```

## Uso directo

```bash
echo '{"state":"Pago rechazado tres veces","questions":{"es_urgente":{"type":"noul","instructions":"¿Requiere atención hoy?"}}}' \
  | node skills/jev/scripts/jev.mjs
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

## Pruebas

```bash
npm test
```

Las pruebas no hacen llamadas reales a OpenRouter.

## Limitaciones

- Jev no razona ni explica: devuelve tipo y probabilidad. Valida los umbrales con tus propios datos.
- La ventana de contexto es de 32.000 tokens entre el estado y las preguntas.
- Las decisiones de alto impacto (cobros, borrados, despliegues) necesitan una validación aparte.

## Licencia

MIT. Ver [LICENSE](LICENSE).
