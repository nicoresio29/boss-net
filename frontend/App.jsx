import { useState } from 'react';

export default function App() {
  const [nombre, setNombre] = useState("JARVIS");
  const [mensaje, setMensaje] = useState("");

  return (
    <div>
      <h1>JEFE GLOBAL - Dashboard</h1>
      <h2>Tu compañero: {nombre}</h2>
      <select onChange={(e) => setNombre(e.target.value)}>
        <option>LUNA</option>
        <option>JARVIS</option>
        <option>PEPE</option>
        <option>SOFIA</option>
      </select>
      <p>Voz real: ON | Memoria total: ON | Autónomo 90%: ON | Agenda: ON</p>
      <input placeholder="Hablale por voz o texto..." value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
      <button>Enviar a {nombre}</button>
    </div>
  );
}