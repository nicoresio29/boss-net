// JEFE GLOBAL - Backend principal
const express = require('express');
const app = express();
app.use(express.json());
const cors = require('cors');
app.use(cors());

// --- MEMORIA TOTAL ---
let memoriaGlobal = [];

// --- USUARIOS Y SUS COMPAÑEROS ---
let usuarios = [
  { id: 1, nombre: "Alejandro", rol: "JEFE_GLOBAL", companero: "JARVIS" }
];

function crearCompanero(nombreElegido, usuarioId) {
  return {
    id: Date.now(),
    usuarioId,
    nombre: nombreElegido, // LUNA, JARVIS, PEPE, SOFIA...
    voz: true,
    activo24_7: true,
    autonomia: 0.90,
    memoria: []
  };
}

// --- FASE 1: PERSONAL PARA VOS ---
app.post('/api/jefe/pregunta', (req, res) => {
  const { mensaje } = req.body;
  // 90% autónomo: responde solo
  // 10% premium/ilegal: escala al JEFE
  const necesitaAprobacion = mensaje.includes("premium") || mensaje.includes("ilegal");
  
  if (necesitaAprobacion) {
    return res.json({ status: "ESCALADO_A_JEFE", mensaje: "Esperando aprobación de Alejandro" });
  }
  
  memoriaGlobal.push(mensaje);
  res.json({ status: "RESPONDIDO_AUTONOMO", respuesta: `Soy JARVIS, ya lo gestioné: ${mensaje}`, memoria: memoriaGlobal });
});

// --- FASE 2: GLOBAL PARA TODOS ---
app.post('/api/global/crear-companero', (req, res) => {
  const { usuarioId, nombreCompanero } = req.body;
  const nuevo = crearCompanero(nombreCompanero, usuarioId);
  res.json({ status: "CREADO", companero: nuevo });
});

// --- DASHBOARD CENTRAL DEL JEFE ---
app.get('/api/jefe/dashboard', (req, res) => {
  res.json({
    totalUsuarios: usuarios.length,
    memoriaTotal: memoriaGlobal.length,
    escaladosPendientes: 0,
    estado: "Vos controlando todo"
  });
});

app.listen(3000, () => console.log("JEFE GLOBAL corriendo en puerto 3000"));