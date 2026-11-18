// ============================================================
// CONFIGURACIÓN
// ============================================================
const SUPABASE_URL = "https://wplaadbewlbyeafohfjm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mBAz_UDxEv1be_GImtSBvQ_q5DBgsA9";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const REDIRECT = window.location.origin + "/jefe-global.html";

const $ = (id) => document.getElementById(id);

const TZ_BA = "America/Argentina/Buenos_Aires";
const hoyISO = () => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ_BA }).format(new Date());

const AVATARES = ["🤖", "🧠", "🦊", "🐺", "🦉", "🐉", "🚀", "⚡"];
const TONOS = [
  { id: "cercano", texto: "Cercano" },
  { id: "formal", texto: "Formal" },
  { id: "directo", texto: "Directo" },
  { id: "divertido", texto: "Divertido" },
];
const GREETINGS = [
  "¡Hola! Qué bueno verte por acá. ¿Cómo estás?",
  "¡Buenas! Bienvenido a boss.net, ¿en qué andamos hoy?",
  "¡Hola, qué tal! Encantado de charlar con vos.",
  "¡Buen día! Contame, ¿qué necesitás?",
  "¡Hola! Me alegra que estés por acá. ¿Empezamos?",
];

// ============================================================
// ESTADO GLOBAL
// Todas las variables compartidas se declaran acá, antes de usarlas.
// ============================================================
let estado = JSON.parse(localStorage.getItem("boss_estado") || '{"notas":[],"tareas":[],"proximoId":1}');
let modo = "entrar";
let sesionActual = null;
let cuentaActual = "";
let perfil = null;
let avatarElegido = AVATARES[0];
let tonoElegido = "cercano";
let mosaicoActivo = null;
let conversacionActual = null;
const historial = []; // { role: "user" | "model", text: "..." }

// ============================================================
// UTILIDADES
// ============================================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderMarkdown(texto) {
  return DOMPurify.sanitize(marked.parse(texto));
}

function registrar(texto) {
  const log = JSON.parse(localStorage.getItem("boss_log") || "[]");
  const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  log.push(`[${hora}] ${texto}`);
  localStorage.setItem("boss_log", JSON.stringify(log.slice(-50)));
}

function claveGroq() {
  return localStorage.getItem("boss_groq_key") || "";
}

// ============================================================
// LOGIN
// ============================================================
const loginScreen = $("loginScreen");
const loginForm = $("loginForm");
const loginBtn = $("loginBtn");
const loginMsg = $("loginMsg");
const emailInput = $("email");
const passInput = $("password");
const recordarme = $("recordarme");
const filaExtra = $("filaExtra");

const mailGuardado = localStorage.getItem("boss_email");
if (mailGuardado) {
  emailInput.value = mailGuardado;
  recordarme.checked = true;
}

function setMsg(texto, ok = false) {
  loginMsg.textContent = texto;
  loginMsg.classList.toggle("ok", ok);
}

function traducirErrorAuth(msg = "") {
  if (msg.includes("Invalid login")) return "Mail o contraseña incorrectos.";
  if (msg.includes("already registered")) return "Ese mail ya tiene cuenta. Probá entrar.";
  if (msg.includes("Email not confirmed")) return "Confirmá tu mail antes de entrar (revisá tu bandeja o spam).";
  if (msg.includes("rate limit")) return "Hiciste muchos intentos. Esperá unos minutos.";
  if (msg.includes("Password")) return "La contraseña debe tener al menos 6 caracteres.";
  if (msg.includes("valid email")) return "Escribí un mail válido.";
  return "No se pudo completar la acción: " + msg;
}

function setModo(nuevo) {
  modo = nuevo;
  const crear = modo === "crear";
  $("tabEntrar").classList.toggle("activo", !crear);
  $("tabCrear").classList.toggle("activo", crear);
  $("lgTitulo").textContent = crear ? "Creá tu cuenta" : "Bienvenido de nuevo";
  $("lgSub").textContent = crear
    ? "Con tu mail y una contraseña alcanza."
    : "Entrá para ver tu agenda y tu agente.";
  loginBtn.textContent = crear ? "Crear cuenta" : "Entrar";
  filaExtra.classList.toggle("lg-oculto", crear);
  setMsg("");
}

$("tabEntrar").addEventListener("click", () => setModo("entrar"));
$("tabCrear").addEventListener("click", () => setModo("crear"));

$("verPass").addEventListener("click", (e) => {
  const oculta = passInput.type === "password";
  passInput.type = oculta ? "text" : "password";
  e.currentTarget.textContent = oculta ? "Ocultar" : "Ver";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passInput.value;
  loginBtn.disabled = true;
  setMsg(modo === "crear" ? "Creando tu cuenta..." : "Entrando...");

  try {
    if (modo === "crear") {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: REDIRECT },
      });
      if (error) throw error;
      if (!data.session) {
        setModo("entrar");
        setMsg("Cuenta creada. Revisá tu mail para confirmarla y después entrá.", true);
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (recordarme.checked) localStorage.setItem("boss_email", email);
      else localStorage.removeItem("boss_email");
    }
  } catch (err) {
    setMsg(traducirErrorAuth(err.message));
  } finally {
    loginBtn.disabled = false;
  }
});

$("olvide").addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) {
    setMsg("Escribí tu mail arriba y tocá de nuevo.");
    return;
  }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT });
  if (error) setMsg(traducirErrorAuth(error.message));
  else setMsg("Te mandamos un enlace para cambiar la contraseña.", true);
});

$("cerrarSesion").addEventListener("click", async () => {
  await sb.auth.signOut();
});

// ============================================================
// TAREAS Y AVISOS
// ============================================================
function guardarEstado() {
  localStorage.setItem("boss_estado", JSON.stringify(estado));
}

function itemTarea(t) {
  const hoy = hoyISO();
  const clase = t.fecha && t.fecha < hoy ? "tarea vencida" : "tarea";
  const fecha = t.fecha ? `<small>${t.fecha}</small>` : "";
  return `<li class="${clase}" data-id="${t.id}"><span class="tchk"></span><span class="ttxt">${escapeHtml(t.titulo)}</span>${fecha}</li>`;
}

function renderAvisos() {
  const hoy = hoyISO();
  const pendientes = estado.tareas
    .filter((t) => !t.hecha)
    .sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999"));

  const urgentes = pendientes.filter((t) => t.fecha && t.fecha <= hoy);
  $("avisos").innerHTML = urgentes.length
    ? `<div class="box"><strong>Avisos:</strong><ul>${urgentes
        .map((t) => `<li>${escapeHtml(t.titulo)} · ${t.fecha} ${t.fecha < hoy ? "(vencida)" : "(hoy)"}</li>`)
        .join("")}</ul></div>`
    : "";

  $("listaTareas").innerHTML = pendientes.length
    ? pendientes.map(itemTarea).join("")
    : `<li class="vacio">Sin tareas pendientes</li>`;

  refrescarDetalle();
}

function marcarHecha(e) {
  const li = e.target.closest("li[data-id]");
  if (!li) return;
  const tarea = estado.tareas.find((t) => t.id === Number(li.dataset.id));
  if (tarea) {
    tarea.hecha = true;
    guardarEstado();
    renderAvisos();
  }
}

$("listaTareas").addEventListener("click", marcarHecha);

// ============================================================
// PANEL DERECHO: STUDIO Y WORK
// ============================================================
const mosaicos = {
  vista: {
    titulo: "Vista previa del proyecto",
    html: () => {
      const pend = estado.tareas.filter((t) => !t.hecha).length;
      const hechas = estado.tareas.filter((t) => t.hecha).length;
      return `<ul class="sb-lista">
        <li>Tareas pendientes: <strong>${pend}</strong></li>
        <li>Tareas hechas: <strong>${hechas}</strong></li>
        <li>Notas guardadas: <strong>${estado.notas.length}</strong></li>
        <li>Clave de Groq: <strong>${claveGroq() ? "cargada" : "falta"}</strong></li>
      </ul>`;
    },
  },
  terminal: {
    titulo: "Terminal",
    html: () => {
      const log = JSON.parse(localStorage.getItem("boss_log") || "[]");
      return `<p class="nota">Registro de actividad. Acá no se ejecutan comandos.</p>
        <pre class="log">${log.length ? escapeHtml(log.slice(-20).join("\n")) : "Sin actividad todavía."}</pre>`;
    },
  },
  
  tareas: {
    titulo: "Panel de tareas pendientes",
    html: () => {
      const pend = estado.tareas
        .filter((t) => !t.hecha)
        .sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999"));
      return pend.length
        ? `<ul class="sb-lista">${pend.map(itemTarea).join("")}</ul>`
        : `<p class="vacio">Sin tareas pendientes</p>`;
    },
  },
  calendario: {
    titulo: "Calendario",
    html: () => {
      const pend = estado.tareas.filter((t) => !t.hecha);
      if (!pend.length) return `<p class="vacio">No hay tareas agendadas.</p>`;
      const grupos = {};
      pend.forEach((t) => {
        const k = t.fecha || "Sin fecha";
        if (!grupos[k]) grupos[k] = [];
        grupos[k].push(t);
      });
      return Object.keys(grupos)
        .sort((a, b) => (a === "Sin fecha" ? 1 : b === "Sin fecha" ? -1 : a.localeCompare(b)))
        .map((k) => `<h4 class="dia">${k}</h4><ul class="sb-lista">${grupos[k].map(itemTarea).join("")}</ul>`)
        .join("");
    },
  },
  incidencias: {
    titulo: "Resumen de incidencias",
    html: () => {
      const hoy = hoyISO();
      const pend = estado.tareas.filter((t) => !t.hecha);
      return `<ul class="sb-lista">
        <li>Vencidas: <strong class="rojo">${pend.filter((t) => t.fecha && t.fecha < hoy).length}</strong></li>
        <li>Para hoy: <strong>${pend.filter((t) => t.fecha === hoy).length}</strong></li>
        <li>Prioridad alta: <strong>${pend.filter((t) => t.prioridad === "alta").length}</strong></li>
        <li>Sin fecha: <strong>${pend.filter((t) => !t.fecha).length}</strong></li>
      </ul>`;
    },
  },
  atajos: {
    titulo: "Atajos a recursos",
    html: () => `<div class="atajos">
      <a href="https://console.groq.com/keys" target="_blank" rel="noopener">Groq · API keys</a>
      <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">Supabase</a>
      <a href="https://app.netlify.com" target="_blank" rel="noopener">Netlify</a>
      <a href="https://github.com" target="_blank" rel="noopener">GitHub</a>
    </div>`,
  },
};

function abrirMosaico(id) {
  mosaicoActivo = id;
  refrescarDetalle();
  $("detalle").classList.remove("oculto");
}

function cerrarDetalle() {
  mosaicoActivo = null;
  $("detalle").classList.add("oculto");
}

function refrescarDetalle() {
  if (!mosaicoActivo) return;
  const m = mosaicos[mosaicoActivo];
  $("detalleTitulo").textContent = m.titulo;
  $("detalleBody").innerHTML = m.html();
}

document.querySelectorAll(".ptab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".ptab").forEach((b) => b.classList.toggle("activo", b === btn));
    const work = btn.dataset.area === "work";
    $("areaStudio").classList.toggle("oculto", work);
    $("areaWork").classList.toggle("oculto", !work);
    cerrarDetalle();
  });
});

document.querySelectorAll(".mosaico").forEach((btn) => {
  btn.addEventListener("click", () => abrirMosaico(btn.dataset.mosaico));
});

$("detalleCerrar").addEventListener("click", cerrarDetalle);

// Un solo listener para el detalle: cierra proyectos o marca tareas
$("detalleBody").addEventListener("click", (e) => {
  const btnCerrar = e.target.closest("#cerrarProyecto");
  if (btnCerrar) {
    cerrarProyecto(btnCerrar.dataset.id);
    return;
  }
  marcarHecha(e);
});

// ============================================================
// CLAVE DE GROQ
// ============================================================
const keyScreen = $("keyScreen");
const keyInput = $("groqKeyInput");
const keyMsg = $("keyMsg");

function mostrarClave(puedeCancelar = false) {
  keyInput.value = "";
  keyMsg.textContent = "";
  $("cancelarClave").classList.toggle("oculto", !puedeCancelar);
  keyScreen.classList.remove("oculto");
}

function ocultarClave() {
  keyScreen.classList.add("oculto");
}

// Lista de admins que no necesitan clave de Groq (usan FreeLLMAPI en el servidor)
const ADMIN_EMAILS_FRONT = ["nicolas.resio.95@gmail.com"];

function esMaestra(session) {
  const mail = (session?.user?.email || "").toLowerCase();
  return ADMIN_EMAILS_FRONT.includes(mail);
}

$("guardarClave").addEventListener("click", () => {
  const clave = keyInput.value.trim();
  if (!clave.startsWith("gsk_") || clave.length < 20) {
    keyMsg.textContent = "Esa clave no parece válida. Tiene que empezar con gsk_ y estar completa.";
    return;
  }
  localStorage.setItem("boss_groq_key", clave);
  ocultarClave();
  revisarPantallas(sesionActual);
});

$("cancelarClave").addEventListener("click", ocultarClave);
$("cambiarClave").addEventListener("click", () => mostrarClave(true));

// ============================================================
// CUENTAS
// ============================================================
const btnCuenta = $("btnCuenta");
const menuCuenta = $("menuCuenta");

function cuentasGuardadas() {
  return JSON.parse(localStorage.getItem("boss_cuentas") || "[]");
}

function guardarCuenta(mail) {
  const lista = cuentasGuardadas();
  if (!lista.includes(mail)) {
    lista.push(mail);
    localStorage.setItem("boss_cuentas", JSON.stringify(lista));
  }
}

function renderMenuCuenta() {
  const filas = cuentasGuardadas().map(
    (m) => `<li class="${m === cuentaActual ? "actual" : ""}">
      <button type="button" data-cambiar="${escapeHtml(m)}">${m === cuentaActual ? "✓ " : ""}${escapeHtml(m)}</button>
    </li>`
  );
  filas.push(`<li class="sep"></li>`);
  filas.push(`<li><button type="button" id="agregarCuenta">+ Agregar cuenta</button></li>`);
  menuCuenta.innerHTML = filas.join("");
}

function mostrarCuentaBasica() {
  $("cuentaMail").textContent = cuentaActual || "Sin sesión";
  $("cuentaAvatar").textContent = cuentaActual ? cuentaActual[0].toUpperCase() : "?";
}

function renderCuenta(session) {
  cuentaActual = session?.user?.email || "";
  if (cuentaActual) guardarCuenta(cuentaActual);
  menuCuenta.classList.add("oculto");
  renderMenuCuenta();
  if (!perfil) mostrarCuentaBasica();
}

async function irALogin(mail) {
  await sb.auth.signOut();
  emailInput.value = mail;
  passInput.value = "";
  setModo("entrar");
  loginScreen.classList.remove("oculto");
  setMsg(mail ? "Entrá con la contraseña de esta cuenta." : "Ingresá los datos de la nueva cuenta.");
}

btnCuenta.addEventListener("click", (e) => {
  e.stopPropagation();
  menuCuenta.classList.toggle("oculto");
});

menuCuenta.addEventListener("click", async (e) => {
  const cambiar = e.target.closest("[data-cambiar]");
  if (cambiar) {
    menuCuenta.classList.add("oculto");
    if (cambiar.dataset.cambiar !== cuentaActual) await irALogin(cambiar.dataset.cambiar);
    return;
  }
  if (e.target.closest("#agregarCuenta")) {
    menuCuenta.classList.add("oculto");
    await irALogin("");
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".cuenta-wrap")) menuCuenta.classList.add("oculto");
});

// ============================================================
// PERFIL: nombre, avatar, agente y tono
// ============================================================
const perfilScreen = $("perfilScreen");

function renderOpcionesPerfil() {
  $("avatarGrid").innerHTML = AVATARES.map(
    (a) => `<button type="button" class="avatar-op ${a === avatarElegido ? "elegido" : ""}" data-avatar="${a}">${a}</button>`
  ).join("");
  $("tonoGrid").innerHTML = TONOS.map(
    (t) => `<button type="button" class="tono-op ${t.id === tonoElegido ? "elegido" : ""}" data-tono="${t.id}">${t.texto}</button>`
  ).join("");
}

function abrirFormPerfil(existente = null) {
  avatarElegido = existente?.avatar || AVATARES[0];
  tonoElegido = existente?.tono || "cercano";
  $("perfilNombre").value = existente?.nombre_usuario || "";
  $("perfilAgente").value = existente?.nombre_agente || "";
  $("perfilMsg").textContent = "";
  $("guardarPerfil").textContent = existente ? "Guardar cambios" : "Guardar y empezar";
  renderOpcionesPerfil();
  perfilScreen.classList.remove("oculto");
}

async function cargarPerfil() {
  const { data, error } = await sb.from("perfiles").select("*").maybeSingle();
  if (error) {
    console.error("No se pudo leer el perfil:", error);
    return null;
  }
  return data;
}

function pintarPerfil(p) {
  perfil = p;
  $("cuentaAvatar").textContent = p.avatar || "?";
  $("cuentaMail").textContent = p.nombre_usuario || cuentaActual || "Sin sesión";
}

$("avatarGrid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-avatar]");
  if (!b) return;
  avatarElegido = b.dataset.avatar;
  renderOpcionesPerfil();
});

$("tonoGrid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tono]");
  if (!b) return;
  tonoElegido = b.dataset.tono;
  renderOpcionesPerfil();
});

$("guardarPerfil").addEventListener("click", async () => {
  const nombre = $("perfilNombre").value.trim();
  const agente = $("perfilAgente").value.trim() || "boss";
  if (!nombre) {
    $("perfilMsg").textContent = "Escribí tu nombre para continuar.";
    return;
  }

  const btn = $("guardarPerfil");
  btn.disabled = true;

  const { data, error } = await sb
    .from("perfiles")
    .upsert(
      { nombre_usuario: nombre, avatar: avatarElegido, nombre_agente: agente, tono: tonoElegido },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  btn.disabled = false;
  if (error) {
    $("perfilMsg").textContent = "No se pudo guardar el perfil: " + error.message;
    return;
  }
  pintarPerfil(data);
  perfilScreen.classList.add("oculto");
});

$("btnPersonalizar").addEventListener("click", async () => {
  $("sidebar").classList.remove("abierto");
  const existente = await cargarPerfil();
  if (existente) pintarPerfil(existente);
  abrirFormPerfil(existente);
});

// ============================================================
// ORDEN DE PANTALLAS: login → clave de Groq → perfil
// ============================================================
async function revisarPantallas(session) {
  sesionActual = session;

  if (!session) {
    loginScreen.classList.remove("oculto");
    keyScreen.classList.add("oculto");
    perfilScreen.classList.add("oculto");
    return;
  }

  loginScreen.classList.add("oculto"); 
  if (esMaestra(session)) { ocultarClave(); }
  setMsg("");

  if (!claveGroq()) {
    mostrarClave(false);
    perfilScreen.classList.add("oculto");
    return;
  }
  ocultarClave();

  const existente = await cargarPerfil();
  if (existente) {
    pintarPerfil(existente);
    perfilScreen.classList.add("oculto");
  } else {
    abrirFormPerfil(null);
  }
}

// ============================================================
// CHAT
// ============================================================
const chat = $("chat");
const messagesBox = $("messages");
const form = $("form");
const input = $("input");
const sendBtn = $("send");

function mostrarSaludo() {
  const texto = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  chat.innerHTML = `<div class="empty" id="empty"><h2>${escapeHtml(texto)}</h2></div>`;
}

function quitarSaludo() {
  const saludo = document.getElementById("empty");
  if (saludo) saludo.remove();
}

function addMessage(texto, type) {
  quitarSaludo();
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.textContent = texto;
  chat.appendChild(div);
  messagesBox.scrollTop = messagesBox.scrollHeight;
  return div;
}

function addBot(texto) {
  const div = addMessage("", "bot");
  div.innerHTML = renderMarkdown(texto);
  return div;
}

function addTyping() {
  quitarSaludo();
  const div = document.createElement("div");
  div.className = "msg bot typing";
  div.innerHTML = "<span></span><span></span><span></span>";
  chat.appendChild(div);
  messagesBox.scrollTop = messagesBox.scrollHeight;
  return div;
}

function mensajeDeError(err) {
  if (err.status === 401) return "Tu API key de Groq no es válida. Pegá una nueva desde console.groq.com/keys.";
  if (err.status === 403) return "Tu sesión venció. Volvé a entrar.";
  if (err.status === 429) return "Se agotó tu cuota en Groq. Esperá unos minutos o revisá tu plan en console.groq.com.";
  if (err.status === 404) return "El modelo no está disponible. Revisá el nombre del modelo en chat.js.";
  if (err.status >= 500) return "El servidor tuvo un problema. Intentá de nuevo en unos segundos.";
  if (!err.status) return "No hay conexión con el servidor. Revisá tu internet y probá de nuevo.";
  return "No pude responder: " + err.message;
}

// ---------- Lista de chats ----------
function marcarChatActivo() {
  document.querySelectorAll(".chat-item[data-id]").forEach((li) => {
    li.classList.toggle("activo", li.dataset.id === conversacionActual);
  });
}

async function listarChats() {
  const lista = $("listaChats");
  const { data, error } = await sb
    .from("conversations")
    .select("id,titulo,updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    lista.innerHTML = `<li class="vacio">No se pudieron cargar los chats</li>`;
    return;
  }
  if (!data.length) {
    lista.innerHTML = `<li class="vacio">Todavía no hay chats</li>`;
    return;
  }

  lista.innerHTML = data
    .map(
      (c) => `<li class="chat-item" data-id="${c.id}">
        <span class="chat-titulo">${escapeHtml(c.titulo)}</span>
        <button type="button" class="chat-borrar" data-borrar="${c.id}" title="Borrar chat">×</button>
      </li>`
    )
    .join("");
  marcarChatActivo();
}

async function cargarChat(id) {
  const { data, error } = await sb
    .from("messages")
    .select("role,content")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    addMessage("No pude cargar ese chat.", "error");
    return;
  }

  conversacionActual = id;
  chat.innerHTML = "";
  historial.length = 0;

  data.forEach((m) => {
    if (m.role === "user") {
      addMessage(m.content, "user");
      historial.push({ role: "user", text: m.content });
    } else {
      addBot(m.content);
      historial.push({ role: "model", text: m.content });
    }
  });

  marcarChatActivo();
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

async function borrarChat(id) {
  if (!confirm("¿Borrar este chat? Se pierden sus mensajes, pero no los datos que el agente guardó.")) return;

  const { error } = await sb.from("conversations").delete().eq("id", id);
  if (error) {
    alert("No se pudo borrar: " + error.message);
    return;
  }

  if (conversacionActual === id) nuevoChat();
  await listarChats();
}

function nuevoChat() {
  conversacionActual = null;
  historial.length = 0;
  mostrarSaludo();
  marcarChatActivo();
  $("sidebar").classList.remove("abierto");
  input.focus();
}

$("listaChats").addEventListener("click", async (e) => {
  const borrar = e.target.closest("[data-borrar]");
  if (borrar) {
    await borrarChat(borrar.dataset.borrar);
    return;
  }
  const item = e.target.closest(".chat-item[data-id]");
  if (item) {
    await cargarChat(item.dataset.id);
    $("sidebar").classList.remove("abierto");
  }
});

// ---------- Envío de mensajes ----------
async function sendMessage(texto) {
  addMessage(texto, "user");
  historial.push({ role: "user", text: texto });
  registrar("Mensaje: " + texto.slice(0, 60));

  const typing = addTyping();
  sendBtn.disabled = true;

  try {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token || "";

    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-groq-key": claveGroq(),
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        mensaje: texto,
        estado,
        conversacion_id: conversacionActual,
        perfil: perfil
          ? {
              nombre_usuario: perfil.nombre_usuario,
              nombre_agente: perfil.nombre_agente,
              tono: perfil.tono,
            }
          : null,
      }),
    });

    const json = await res.json().catch(() => ({}));
    typing.remove();

    if (!res.ok) {
      throw Object.assign(new Error(json.error || "Error al consultar la IA"), { status: res.status });
    }

    addBot(json.reply);
    historial.push({ role: "model", text: json.reply });

    if (json.estado) {
      estado = json.estado;
      guardarEstado();
      renderAvisos();
    }

    conversacionActual = json.conversacion_id;
    await listarChats();
    await refrescarProyectos();
  } catch (err) {
    typing.remove();
    historial.pop();
    const msg = mensajeDeError(err);
    addMessage(msg, "error");
    registrar("Error: " + msg);

    if (err.status === 401) {
      localStorage.removeItem("boss_groq_key");
      mostrarClave(true);
    }
    if (err.status === 403) await sb.auth.signOut();
    console.error(err);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!claveGroq()) {
    mostrarClave(false);
    return;
  }
  const texto = input.value.trim();
  if (!texto) return;
  input.value = "";
  input.style.height = "auto";
  sendMessage(texto);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
});

// ============================================================
// PROYECTOS
// Se guardan en la tabla "memorias" con tipo = 'proyecto'.
// ============================================================
async function cargarProyectos() {
  const { data, error } = await sb
    .from("memorias")
    .select("id,titulo,detalle,created_at")
    .eq("tipo", "proyecto")
    .eq("estado", "activo")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("No se pudieron cargar los proyectos:", error);
    return null;
  }
  return data;
}

function renderProyectos(lista) {
  const ul = $("listaProyectos");
  if (lista === null) {
    ul.innerHTML = `<li class="vacio">No se pudieron cargar los proyectos</li>`;
    return;
  }
  if (!lista.length) {
    ul.innerHTML = `<li class="vacio">Todavía no hay proyectos</li>`;
    return;
  }
  ul.innerHTML = lista
    .map(
      (p) => `<li class="chat-item" data-proyecto="${p.id}">
        <span class="chat-titulo">${escapeHtml(p.titulo)}</span>
        <button type="button" class="chat-borrar" data-borrar-proyecto="${p.id}" title="Borrar proyecto">×</button>
      </li>`
    )
    .join("");
}

async function refrescarProyectos() {
  renderProyectos(await cargarProyectos());
}

async function mostrarDetalleProyecto(id) {
  const { data, error } = await sb
    .from("memorias")
    .select("id,titulo,detalle,created_at")
    .eq("id", id)
    .single();

  if (error) {
    alert("No se pudo cargar el proyecto: " + error.message);
    return;
  }

  mosaicoActivo = null;
  $("detalleTitulo").textContent = data.titulo;
  $("detalleBody").innerHTML = `
    <p class="nota">${escapeHtml(data.detalle || "Sin descripción")}</p>
    <p class="nota">Creado: ${new Date(data.created_at).toLocaleDateString("es-AR")}</p>
    <button type="button" id="cerrarProyecto" data-id="${data.id}">Marcar como cerrado</button>
  `;
  $("detalle").classList.remove("oculto");
}

async function cerrarProyecto(id) {
  if (!confirm("¿Cerrar este proyecto? Deja de aparecer en la lista.")) return;

  const { error } = await sb.from("memorias").update({ estado: "cerrado" }).eq("id", id);
  if (error) {
    alert("No se pudo cerrar: " + error.message);
    return;
  }

  cerrarDetalle();
  await refrescarProyectos();
}

async function borrarProyecto(id) {
  if (!confirm("¿Borrar este proyecto? No se puede deshacer.")) return;

  const { error } = await sb.from("memorias").delete().eq("id", id);
  if (error) {
    alert("No se pudo borrar: " + error.message);
    return;
  }

  cerrarDetalle();
  await refrescarProyectos();
}

$("listaProyectos").addEventListener("click", async (e) => {
  const borrar = e.target.closest("[data-borrar-proyecto]");
  if (borrar) {
    await borrarProyecto(borrar.dataset.borrarProyecto);
    return;
  }
  const item = e.target.closest("[data-proyecto]");
  if (item) await mostrarDetalleProyecto(item.dataset.proyecto);
});

// ============================================================
// NAVEGACIÓN
// ============================================================
$("btnNuevo").addEventListener("click", nuevoChat);


// ============================================================
// SESIÓN
// Un único listener. Se dispara al cargar la página (INITIAL_SESSION)
// y cada vez que cambia el login.
// ============================================================
sb.auth.onAuthStateChange(async (_event, session) => {
  sesionActual = session;

  if (!session) {
    perfil = null;
    conversacionActual = null;
    historial.length = 0;
    $("listaChats").innerHTML = "";
    renderProyectos([]);
  }

  renderCuenta(session);
  await revisarPantallas(session);

  if (session) {
    await listarChats();
    await refrescarProyectos();
  }
});
// ============================================================
// BARRAS REDIMENSIONABLES
// ============================================================
const MIN_IZQ = 200;
const MAX_IZQ = 420;
const MIN_DER = 260;
const MAX_DER = 520;

function aplicarAnchos(izq, der) {
  document.documentElement.style.setProperty("--ancho-izq", izq + "px");
  document.documentElement.style.setProperty("--ancho-der", der + "px");
  localStorage.setItem("boss_anchos", JSON.stringify({ izq, der }));
}

function cargarAnchos() {
  const guardado = JSON.parse(localStorage.getItem("boss_anchos") || "null");
  if (guardado) aplicarAnchos(guardado.izq, guardado.der);
}

function iniciarArrastre(handle, lado) {
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    handle.classList.add("activo");
    document.body.classList.add("redimensionando");

    const anchoIzq = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--ancho-izq")) || 260;
    const anchoDer = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--ancho-der")) || 330;
    const inicioX = e.clientX;

    function mover(ev) {
      const delta = ev.clientX - inicioX;
      let izq = anchoIzq;
      let der = anchoDer;

      if (lado === "izquierda") {
        izq = Math.min(MAX_IZQ, Math.max(MIN_IZQ, anchoIzq + delta));
      } else {
        der = Math.min(MAX_DER, Math.max(MIN_DER, anchoDer - delta));
      }
      aplicarAnchos(izq, der);
    }

    function soltar() {
      handle.classList.remove("activo");
      document.body.classList.remove("redimensionando");
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
    }

    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
  });
}

document.querySelectorAll(".resize-handle").forEach((h) => {
  iniciarArrastre(h, h.dataset.lado);
});

cargarAnchos();
// ============================================================
// MÓVIL: cerrar paneles, tocar afuera y botón atrás
// ============================================================
const velo = $("velo");

function abrirPanel(id) {
  document.querySelectorAll(".sidebar, .panel").forEach((p) => {
    if (p.id !== id) p.classList.remove("abierto");
  });
  $(id).classList.add("abierto");
  velo.classList.remove("oculto");
  history.pushState({ panel: id }, "");
}

function cerrarPaneles(usarHistoria = true) {
  const estabaAbierto = document.querySelector(".sidebar.abierto, .panel.abierto");
  document.querySelectorAll(".sidebar, .panel").forEach((p) => p.classList.remove("abierto"));
  velo.classList.add("oculto");
  if (usarHistoria && estabaAbierto && history.state?.panel) history.back();
}

$("menuBtn").addEventListener("click", () => abrirPanel("sidebar"));
$("panelBtn").addEventListener("click", () => abrirPanel("panel"));

document.querySelectorAll("[data-cerrar]").forEach((btn) => {
  btn.addEventListener("click", () => cerrarPaneles());
});

velo.addEventListener("click", () => cerrarPaneles());

window.addEventListener("popstate", () => {
  cerrarPaneles(false);
});
// ============================================================
// CAMBIAR CONTRASEÑA DESDE LA CUENTA
// ============================================================
const passScreen = $("passScreen");
const passNueva = $("passNueva");
const passRepetir = $("passRepetir");
const passMsg = $("passMsg");

function mostrarCambioPass() {
  passNueva.value = "";
  passRepetir.value = "";
  passMsg.textContent = "";
  passScreen.classList.remove("oculto");
  passNueva.focus();
}

function ocultarCambioPass() {
  passScreen.classList.add("oculto");
}

$("btnCambiarPass").addEventListener("click", () => {
  $("sidebar").classList.remove("abierto");
  $("velo").classList.add("oculto");
  mostrarCambioPass();
});

$("cancelarPass").addEventListener("click", ocultarCambioPass);

$("guardarPass").addEventListener("click", async () => {
  const nueva = passNueva.value;
  const repetir = passRepetir.value;

  if (nueva.length < 6) {
    passMsg.textContent = "La contraseña tiene que tener al menos 6 caracteres.";
    return;
  }
  if (nueva !== repetir) {
    passMsg.textContent = "Las dos contraseñas no coinciden.";
    return;
  }

  const btn = $("guardarPass");
  btn.disabled = true;
  passMsg.textContent = "Guardando...";

  const { error } = await sb.auth.updateUser({ password: nueva });

  btn.disabled = false;
  if (error) {
    passMsg.textContent = "No se pudo cambiar: " + error.message;
    return;
  }

  passMsg.classList.add("ok");
  passMsg.textContent = "Contraseña cambiada. Ya podés usar la nueva.";
  setTimeout(() => {
    passMsg.classList.remove("ok");
    ocultarCambioPass();
  }, 1500);
});
// ============================================================
// ARRANQUE
// ============================================================
mostrarSaludo();
renderAvisos();