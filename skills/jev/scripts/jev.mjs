#!/usr/bin/env node
// Cliente de Jev a través de OpenRouter (endpoint Decisions).
// Sin dependencias: usa el fetch nativo de Node 18 o superior.
//
// Uso por línea de comandos: recibe un JSON por stdin y devuelve el resultado por stdout.
//   echo '{"state":"...","questions":{...}}' | node jev.mjs

import { pathToFileURL } from "node:url";

const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const MODELO_POR_DEFECTO = "typesafe/jev-1.13";
const TIMEOUT_MS = 30_000;

// Umbrales para convertir una probabilidad en veredicto. Se pueden cambiar con variables de entorno.
const UMBRAL_ALTO = Number(process.env.JEV_THRESHOLD_HIGH ?? 0.8);
const UMBRAL_BAJO = Number(process.env.JEV_THRESHOLD_LOW ?? 0.2);

export class JevError extends Error {
  constructor(mensaje, status) {
    super(mensaje);
    this.name = "JevError";
    this.status = status;
  }
}

// Convierte la probabilidad de un "sí" en veredicto: yes, no o undecided.
export function veredicto(probabilidad) {
  if (probabilidad >= UMBRAL_ALTO) return "yes";
  if (probabilidad <= UMBRAL_BAJO) return "no";
  return "undecided";
}

// Arma el cuerpo de la petición a partir de preguntas en el formato del proyecto.
// Solo acepta "choice" y "noul"; cualquier otro tipo se rechaza para no mandar algo mal formado.
export function construirCuerpo({ state, questions, model = MODELO_POR_DEFECTO, sessionId }) {
  if (state === undefined || state === null) throw new JevError("Falta el campo state");
  if (!questions || Object.keys(questions).length === 0) throw new JevError("Falta al menos una pregunta");

  const preguntas = {};
  for (const [nombre, q] of Object.entries(questions)) {
    if (q.type === "choice") {
      if (!q.criteria) throw new JevError(`La pregunta ${nombre} necesita criteria`);
      preguntas[nombre] = { type: "choice", instructions: q.instructions, criteria: q.criteria };
    } else if (q.type === "noul") {
      if (q.criteria && (!("true" in q.criteria) || !("false" in q.criteria))) {
        throw new JevError(`La pregunta ${nombre} necesita criteria con las claves "true" y "false"`);
      }
      preguntas[nombre] = { type: "noul", instructions: q.instructions, ...(q.criteria ? { criteria: q.criteria } : {}) };
    } else {
      throw new JevError(`Tipo no soportado en ${nombre}: ${q.type}`);
    }
  }

  const cuerpo = { model, state, questions: preguntas };
  if (sessionId) cuerpo.session_id = sessionId;
  return cuerpo;
}

// Pasa la respuesta cruda de Jev a un formato simple con veredicto.
function normalizar(q, respuesta) {
  if (q.type === "noul") {
    const probabilidad = respuesta.noul;
    return { probability: probabilidad, verdict: veredicto(probabilidad) };
  }
  // choice: el veredicto es la opción elegida solo si su probabilidad supera el umbral alto.
  const probabilidades = respuesta.probabilities;
  const probabilidad =
    probabilidades && typeof probabilidades === "object" && typeof probabilidades[respuesta.choice] === "number"
      ? probabilidades[respuesta.choice]
      : null;
  const verdict = probabilidad !== null && probabilidad >= UMBRAL_ALTO ? respuesta.choice : "undecided";
  return { choice: respuesta.choice, probability: probabilidad, verdict };
}

// Hace una sola llamada a Jev con todas las preguntas juntas, para gastar menos.
export async function decidir({ state, questions, model, sessionId, apiKey = process.env.OPENROUTER_API_KEY, fetchFn = fetch }) {
  if (!apiKey) throw new JevError("Falta la variable de entorno OPENROUTER_API_KEY");

  const cuerpo = construirCuerpo({ state, questions, model, sessionId });

  let res;
  try {
    res = await fetchFn(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new JevError(`Error de red al llamar a OpenRouter: ${e.message}`);
  }

  const texto = await res.text();
  if (!res.ok) throw new JevError(`OpenRouter respondió ${res.status}: ${texto.slice(0, 300)}`, res.status);

  const datos = JSON.parse(texto);
  const respuestas = {};
  for (const [nombre, q] of Object.entries(questions)) {
    const respuesta = datos.answers?.[nombre];
    if (!respuesta) throw new JevError(`Jev no devolvió respuesta para ${nombre}`);
    respuestas[nombre] = normalizar(q, respuesta);
  }

  return { model: datos.model, answers: respuestas, cost: datos.usage?.cost ?? null };
}

async function leerStdin() {
  let texto = "";
  for await (const trozo of process.stdin) texto += trozo;
  return texto;
}

// Si Jev no responde (sin clave, sin créditos, red caída), la skill tiene que seguir avanzando.
// Por eso el CLI devuelve fallback: true con el motivo y sale con código 0, en vez de fallar.
async function main() {
  let resultado;
  try {
    const entrada = JSON.parse(await leerStdin());
    resultado = await decidir(entrada);
  } catch (e) {
    const sinCreditos = e.status === 402 || e.status === 429;
    resultado = { fallback: true, sin_creditos: sinCreditos, reason: e.message };
  }
  process.stdout.write(JSON.stringify(resultado, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
