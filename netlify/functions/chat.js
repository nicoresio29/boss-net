const TZ = "America/Argentina/Buenos_Aires";
const SUPABASE_URL = "https://wplaadbewlbyeafohfjm.supabase.co";
const SUPABASE_KEY = "sb_publishable_jGbMu5U9D00_Oe9ATrzvvQ_1a2kYNqj"; // publishable: segura en el servidor
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- Proveedores ----------
const PROVEEDORES = {
  freellmapi: {
    tipo: "maestro",
    url: process.env.FREELLMAPI_URL || "http://127.0.0.1:31415/v1/chat/completions",
    modelo: "auto",
    formato: "openai",
    claveEnv: "FREELLMAPI_KEY",
  },
  groq: {
    tipo: "usuario",
    url: "https://api.groq.com/openai/v1/chat/completions",
    modelo: "openai/gpt-oss-120b",
    formato: "openai",
  },
  gemini: {
    tipo: "usuario",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    modelo: "gemini-2.5-flash",
    formato: "openai",
  },
  openai: {
    tipo: "usuario",
    url: "https://api.openai.com/v1/chat/completions",
    modelo: "gpt-4o-mini",
    formato: "openai",
  },
  anthropic: {
    tipo: "usuario",
    url: "https://api.anthropic.com/v1/messages",
    modelo: "claude-haiku-4-5",
    formato: "anthropic",
  },
};

function hoyISO() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
}

function respond(statusCode, body) {
  return { statusCode, body: JSON.stringify(body) };
}

function esAdmin(usuario) {
  const lista = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
  return lista.includes((usuario.email || "").toLowerCase());
}

// ---------- Supabase ----------
async function obtenerUsuario(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const usuario = await res.json();
  return usuario?.id ? usuario : null;
}

async function db(path, token, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

async function cargarContexto(token, conversacionId) {
  const [historial, memorias] = await Promise.all([
    conversacionId
      ? db(`messages?select=role,content&conversation_id=eq.${conversacionId}&order=created_at.desc&limit=30`, token)
      : Promise.resolve([]),
    db("memorias?select=id,tipo,titulo,detalle,fecha,estado&estado=eq.activo&order=created_at.desc&limit=100", token),
  ]);
  return { historial: historial.reverse(), memorias };
}

async function guardarMensaje(token, userId, conversacionId, role, content) {
  try {
    await db("messages", token, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: userId, conversation_id: conversacionId, role, content }),
    });
  } catch (err) {
    console.log("No se pudo guardar el mensaje:", err.message);
  }
}

async function crearConversacion(token, userId, primerMensaje) {
  const titulo = primerMensaje.slice(0, 40).trim() || "Chat nuevo";
  const [fila] = await db("conversations", token, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, titulo }),
  });
  return fila.id;
}

async function tocarConversacion(token, id) {
  await db(`conversations?id=eq.${id}`, token, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ updated_at: new Date().toISOString() }),
  });
}

// ---------- Herramientas ----------
function fn(name, description, properties = {}, required = []) {
  return {
    type: "function",
    function: { name, description, parameters: { type: "object", properties, required } },
  };
}

const TOOLS = [
  fn("recordar_dato", "Guarda un dato importante del usuario: un cliente, un contacto, una preferencia o algo que no quiere olvidar.", {
    titulo: { type: "string" },
    detalle: { type: "string" },
  }, ["titulo"]),
  fn("crear_proyecto", "Crea un proyecto con nombre y descripción.", {
    titulo: { type: "string" },
    detalle: { type: "string" },
  }, ["titulo"]),
  fn("agendar_evento", "Agenda un evento o compromiso con fecha (YYYY-MM-DD).", {
    titulo: { type: "string" },
    fecha: { type: "string", description: "YYYY-MM-DD" },
    detalle: { type: "string" },
  }, ["titulo", "fecha"]),
  fn("cerrar_memoria", "Cierra un dato, proyecto o evento usando su id.", {
    id: { type: "string" },
  }, ["id"]),
  fn("agregar_tarea", "Agrega una tarea a la lista de pendientes.", {
    titulo: { type: "string" },
    fecha: { type: "string", description: "YYYY-MM-DD, opcional" },
    prioridad: { type: "string", enum: ["alta", "media", "baja"] },
  }, ["titulo"]),
  fn("completar_tarea", "Marca una tarea como hecha usando su id.", {
    id: { type: "integer" },
  }, ["id"]),
  fn("ver_agenda", "Devuelve tareas pendientes y eventos de los próximos 30 días."),
  fn("calcular", "Evalúa una operación matemática simple con números, + - * / ( ) y punto decimal.", {
    expresion: { type: "string" },
  }, ["expresion"]),
];

const ANTHROPIC_TOOLS = TOOLS.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters,
}));

function normalizarEstado(e) {
  return {
    notas: Array.isArray(e?.notas) ? e.notas.slice(-100) : [],
    tareas: Array.isArray(e?.tareas) ? e.tareas.slice(-200) : [],
    proximoId: Number.isInteger(e?.proximoId) ? e.proximoId : 1,
  };
}

async function ejecutarHerramienta(nombre, argsInput, ctx) {
  let args = {};
  if (typeof argsInput === "string") {
    try {
      args = JSON.parse(argsInput || "{}");
    } catch {
      return { error: "Argumentos inválidos" };
    }
  } else if (argsInput && typeof argsInput === "object") {
    args = argsInput;
  }

  const { estado, token, userId, memorias } = ctx;
  const hoy = hoyISO();

  if (nombre === "recordar_dato" || nombre === "crear_proyecto") {
    const titulo = String(args.titulo || "").trim();
    if (!titulo) return { error: "Falta el título" };
    const tipo = nombre === "recordar_dato" ? "dato" : "proyecto";
    const [fila] = await db("memorias", token, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: userId, tipo, titulo, detalle: args.detalle || null }),
    });
    if (tipo === "dato") estado.notas.push({ texto: titulo, fecha: hoy });
    return { ok: true, id: fila.id, mensaje: `${tipo} guardado` };
  }

  if (nombre === "agendar_evento") {
    const titulo = String(args.titulo || "").trim();
    if (!titulo) return { error: "Falta el título" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.fecha || "")) return { error: "La fecha tiene que ser YYYY-MM-DD" };
    const [fila] = await db("memorias", token, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: userId, tipo: "evento", titulo, fecha: args.fecha, detalle: args.detalle || null }),
    });
    return { ok: true, id: fila.id, mensaje: "Evento agendado" };
  }

  if (nombre === "cerrar_memoria") {
    const id = String(args.id || "");
    if (!UUID_RE.test(id)) return { error: "Id inválido" };
    await db(`memorias?id=eq.${id}`, token, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ estado: "cerrado" }),
    });
    return { ok: true, mensaje: "Cerrado" };
  }

  if (nombre === "agregar_tarea") {
    const titulo = String(args.titulo || "").trim();
    if (!titulo) return { error: "Falta el título" };
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(args.fecha || "") ? args.fecha : null;
    const prioridad = ["alta", "media", "baja"].includes(args.prioridad) ? args.prioridad : "media";
    const tarea = { id: estado.proximoId++, titulo, fecha, prioridad, hecha: false };
    estado.tareas.push(tarea);
    return { ok: true, tarea };
  }

  if (nombre === "completar_tarea") {
    const tarea = estado.tareas.find((t) => t.id === Number(args.id));
    if (!tarea) return { error: "No existe esa tarea" };
    tarea.hecha = true;
    return { ok: true, mensaje: `Tarea ${tarea.id} completada` };
  }

  if (nombre === "ver_agenda") {
    const limite = new Date(Date.now() + 30 * 86400000);
    const hasta = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(limite);
    return {
      hoy,
      tareas: estado.tareas.filter((t) => !t.hecha),
      eventos: memorias.filter((m) => m.tipo === "evento" && m.fecha >= hoy && m.fecha <= hasta),
    };
  }

  if (nombre === "calcular") {
    const expr = String(args.expresion || "");
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) return { error: "Expresión no permitida" };
    try {
      return { resultado: Function(`"use strict"; return (${expr});`)() };
    } catch {
      return { error: "No se pudo calcular" };
    }
  }

  return { error: `Herramienta desconocida: ${nombre}` };
}

// ---------- Prompt del sistema ----------
function construirSistema(estado, memorias, perfil) {
  const hoy = hoyISO();
const ahora = ahoraTexto();
  const nombreAgente = perfil?.nombre_agente || "boss";
  const nombreUsuario = perfil?.nombre_usuario || "vos";
  const tonos = {
    cercano: "Hablás de forma cercana y cálida, como un compañero de confianza.",
    formal: "Hablás de forma formal y respetuosa, con frases completas y sin coloquialismos.",
    directo: "Hablás de forma directa y breve, yendo al grano sin rodeos.",
    divertido: "Hablás de forma simpática y con humor liviano, sin perder claridad.",
  };
  const tonoTexto = tonos[perfil?.tono] || tonos.cercano;

  const datos = memorias.filter((m) => m.tipo === "dato").slice(0, 40);
  const proyectos = memorias.filter((m) => m.tipo === "proyecto");
  const eventos = memorias
    .filter((m) => m.tipo === "evento" && m.fecha && m.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, 20);
  const tareas = estado.tareas.filter((t) => !t.hecha).slice(0, 50);

  return `Sos ${nombreAgente}, el asistente personal de ${nombreUsuario} dentro de boss.net. Organizás el día, llevás los proyectos y avisás lo importante. Hablás en español rioplatense con voseo. ${tonoTexto}
Ahora mismo es ${ahora} (hora de Buenos Aires, formato 24h). La fecha ISO de hoy es ${hoy}.

Tenés memoria a largo plazo: lo que sigue es lo que el usuario te pidió recordar. Usalo cuando sea relevante, sin repetirlo de memoria cada vez.

Reglas:
- Si el usuario dice algo importante (un cliente, una fecha, un proyecto, una preferencia), guardalo con la herramienta que corresponda, sin pedir permiso. Un dato suelto va con recordar_dato, un trabajo con varios pasos con crear_proyecto y algo con fecha con agendar_evento.
- Nunca guardes contraseñas, claves de API ni datos de tarjetas.
- Si el usuario pide cerrar algo, usá cerrar_memoria con el id que aparece abajo.
- Si pregunta qué tiene para hacer, usá ver_agenda y ordená por urgencia: vencido, hoy, después.
- Si falta un dato para agendar algo, preguntá una sola cosa.
- Si no sabés algo o no tenés el dato, decilo.
- Usá las herramientas solo para guardar o consultar datos. Cuando ya guardaste lo que te pidieron, respondé en texto y no vuelvas a llamar herramientas.

Datos guardados:
${JSON.stringify(datos)}

Proyectos activos:
${JSON.stringify(proyectos)}

Próximos eventos:
${JSON.stringify(eventos)}

Tareas pendientes:
${JSON.stringify(tareas)}`;
}

// ---------- Llamada a cada proveedor ----------
async function llamarProveedor(prov, messages, { permitirHerramientas = true } = {}) {
  if (prov.formato === "anthropic") {
    const system = messages.find((m) => m.role === "system")?.content || "";
    const resto = messages.filter((m) => m.role !== "system");
    const body = {
      model: prov.modelo,
      max_tokens: 1024,
      system,
      messages: resto,
    };
    if (permitirHerramientas) body.tools = ANTHROPIC_TOOLS;

    const res = await fetch(prov.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": prov.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error?.message || "Error de Anthropic"), { status: res.status });

    const bloques = data.content || [];
    const toolUses = bloques.filter((b) => b.type === "tool_use");
    if (toolUses.length) {
      return {
        texto: null,
        herramientas: {
          formato: "anthropic",
          rawContent: bloques,
          calls: toolUses.map((b) => ({
            id: b.id,
            name: b.name,
            args: b.input || {},
          })),
        },
      };
    }

    const texto = bloques.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return { texto: texto || "No obtuve respuesta.", herramientas: null };
  }

  const body = { model: prov.modelo, messages };
  if (permitirHerramientas) body.tools = TOOLS;

  const res = await fetch(prov.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${prov.key}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error?.message || `Error de ${prov.nombre}`), { status: res.status });

  const mensaje = data.choices?.[0]?.message;
  if (!mensaje) return { texto: "No obtuve respuesta.", herramientas: null };
  if (mensaje.tool_calls?.length) {
    return {
      texto: null,
      herramientas: {
        formato: "openai",
        rawMessage: mensaje,
        calls: mensaje.tool_calls.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          args: tc.function.arguments,
        })),
      },
    };
  }
  return { texto: mensaje.content || "No obtuve respuesta.", herramientas: null };
}

// ---------- Bucle del agente ----------
async function correrAgente(messages, prov, ctx) {
  const MAX_PASOS = 8;

  for (let paso = 0; paso < MAX_PASOS; paso++) {
    const { texto, herramientas } = await llamarProveedor(prov, messages);
    if (texto !== null) return texto;

    if (herramientas.formato === "anthropic") {
      messages.push({ role: "assistant", content: herramientas.rawContent });
      const resultados = [];
      for (const llamada of herramientas.calls) {
        const res = await ejecutarHerramienta(llamada.name, llamada.args, ctx);
        resultados.push({
          type: "tool_result",
          tool_use_id: llamada.id,
          content: JSON.stringify(res),
        });
      }
      messages.push({ role: "user", content: resultados });
    } else {
      messages.push(herramientas.rawMessage);
      for (const llamada of herramientas.calls) {
        const resultado = await ejecutarHerramienta(llamada.name, llamada.args, ctx);
        messages.push({ role: "tool", tool_call_id: llamada.id, content: JSON.stringify(resultado) });
      }
    }
  }

  const { texto } = await llamarProveedor(
    prov,
    [
      ...messages,
      { role: "system", content: "Ya no podés usar herramientas. Respondé al usuario en texto con lo que ya hiciste y lo que falta." },
    ],
    { permitirHerramientas: false }
  );
  return texto || "Guardé lo que pude, pero no llegué a resumirlo. Decime qué querés ver primero.";
}

// ---------- Handler ----------
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return respond(405, { error: "Método no permitido" });

  const token = (event.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  if (!token) return respond(403, { error: "Tenés que iniciar sesión" });

  const usuario = await obtenerUsuario(token);
  if (!usuario) return respond(403, { error: "Tu sesión venció, volvé a entrar" });

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return respond(400, { error: "Solicitud inválida" });
  }

  const mensaje = String(body.mensaje || "").trim();
  if (!mensaje) return respond(400, { error: "Mensaje vacío" });

  const proveedorElegido = String(body.proveedor || "groq").toLowerCase();
  let prov;

  if (esAdmin(usuario)) {
    const claveMaestra = process.env.FREELLMAPI_KEY;
    if (!claveMaestra) return respond(500, { error: "Falta FREELLMAPI_KEY en el .env" });
    prov = { ...PROVEEDORES.freellmapi, nombre: "FreeLLMAPI", key: claveMaestra };
  } else {
    const config = PROVEEDORES[proveedorElegido];
    if (!config || config.tipo !== "usuario") {
      return respond(400, { error: "Proveedor no disponible" });
    }
    const claveUsuario = String(body.clave || "").trim();
    if (!claveUsuario) return respond(401, { error: `Falta tu clave de ${proveedorElegido}` });
    prov = { ...config, nombre: proveedorElegido, key: claveUsuario };
  }

  const estado = normalizarEstado(body.estado);
  let conversacionId = UUID_RE.test(body.conversacion_id || "") ? body.conversacion_id : null;

  try {
    if (!conversacionId) {
      conversacionId = await crearConversacion(token, usuario.id, mensaje);
    }

    const { historial, memorias } = await cargarContexto(token, conversacionId);
    await guardarMensaje(token, usuario.id, conversacionId, "user", mensaje);

    const messages = [
      { role: "system", content: construirSistema(estado, memorias, body.perfil) },
      ...historial.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: mensaje },
    ];

    const reply = await correrAgente(messages, prov, {
      estado,
      token,
      userId: usuario.id,
      memorias,
    });

    await guardarMensaje(token, usuario.id, conversacionId, "assistant", reply);
    await tocarConversacion(token, conversacionId);

    return respond(200, { reply, estado, conversacion_id: conversacionId });
  } catch (err) {
    console.log(`Error de ${prov.nombre}:`, err.message);
    if (err.status) return respond(err.status, { error: err.message });
    return respond(500, { error: "No se pudo completar la respuesta" });
  }
};
function ahoraTexto() {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    dateStyle: "full",
    timeStyle: "short",
    hour12: false,
  }).format(new Date());
}