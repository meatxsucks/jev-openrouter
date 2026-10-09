// Pruebas del cliente: sin red, usando un fetch falso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirCuerpo, decidir, veredicto, JevError } from "../skills/jev/scripts/jev.mjs";

const preguntasEjemplo = {
  es_bug: { type: "noul", instructions: "¿Es un defecto de software?" },
  equipo: {
    type: "choice",
    instructions: "¿Qué equipo lo atiende?",
    criteria: { pagos: "Cobros fallidos", frontend: "Errores de pantalla" },
  },
};

function fetchFalso(respuestaJson, status = 200) {
  const llamadas = [];
  const fn = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return new Response(JSON.stringify(respuestaJson), { status });
  };
  fn.llamadas = llamadas;
  return fn;
}

test("veredicto usa los umbrales 0.8 y 0.2", () => {
  assert.equal(veredicto(0.9), "yes");
  assert.equal(veredicto(0.8), "yes");
  assert.equal(veredicto(0.5), "undecided");
  assert.equal(veredicto(0.2), "no");
  assert.equal(veredicto(0.1), "no");
});

test("construirCuerpo arma el JSON con model y questions", () => {
  const cuerpo = construirCuerpo({ state: "Pantalla en blanco", questions: preguntasEjemplo });
  assert.equal(cuerpo.model, "typesafe/jev-1.13");
  assert.equal(cuerpo.state, "Pantalla en blanco");
  assert.deepEqual(cuerpo.questions.es_bug, { type: "noul", instructions: "¿Es un defecto de software?" });
  assert.equal(cuerpo.questions.equipo.type, "choice");
});

test("construirCuerpo rechaza tipos no soportados", () => {
  assert.throws(
    () => construirCuerpo({ state: "x", questions: { a: { type: "score", instructions: "?", criteria: [] } } }),
    JevError,
  );
});

test("construirCuerpo exige true y false en noul con criteria", () => {
  assert.throws(
    () => construirCuerpo({ state: "x", questions: { a: { type: "noul", instructions: "?", criteria: { si: "x" } } } }),
    JevError,
  );
});

test("decidir envía bearer, POST y normaliza las respuestas", async () => {
  const fetchFn = fetchFalso({
    model: "typesafe/jev-1.13",
    answers: {
      es_bug: { type: "noul", noul: 0.93 },
      equipo: { type: "choice", choice: "pagos", probabilities: { pagos: 0.85, frontend: 0.15 } },
    },
    usage: { input_tokens: 120, output_tokens: 10, cost: 0.0004 },
  });

  const r = await decidir({
    state: "Pago rechazado",
    questions: preguntasEjemplo,
    apiKey: "clave-de-prueba",
    fetchFn,
  });

  const [llamada] = fetchFn.llamadas;
  assert.equal(llamada.url, "https://openrouter.ai/api/alpha/decisions");
  assert.equal(llamada.opciones.method, "POST");
  assert.equal(llamada.opciones.headers.Authorization, "Bearer clave-de-prueba");
  assert.equal(JSON.parse(llamada.opciones.body).state, "Pago rechazado");

  assert.deepEqual(r.answers.es_bug, { probability: 0.93, verdict: "yes" });
  assert.deepEqual(r.answers.equipo, { choice: "pagos", probability: 0.85, verdict: "pagos" });
  assert.equal(r.cost, 0.0004);
});

test("una choice con probabilidad baja queda como undecided", async () => {
  const fetchFn = fetchFalso({
    model: "typesafe/jev-1.13",
    answers: {
      es_bug: { type: "noul", noul: 0.5 },
      equipo: { type: "choice", choice: "frontend", probabilities: { pagos: 0.4, frontend: 0.6 } },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  const r = await decidir({ state: "x", questions: preguntasEjemplo, apiKey: "k", fetchFn });
  assert.equal(r.answers.equipo.verdict, "undecided");
  assert.equal(r.answers.es_bug.verdict, "undecided");
});

test("decidir falla sin API key", async () => {
  await assert.rejects(
    () => decidir({ state: "x", questions: preguntasEjemplo, apiKey: "", fetchFn: fetchFalso({}) }),
    /OPENROUTER_API_KEY/,
  );
});

test("decidir expone el status cuando OpenRouter responde error", async () => {
  const fetchFn = fetchFalso({ error: "no autorizado" }, 401);
  await assert.rejects(
    () => decidir({ state: "x", questions: preguntasEjemplo, apiKey: "k", fetchFn }),
    (e) => e instanceof JevError && e.status === 401,
  );
});
