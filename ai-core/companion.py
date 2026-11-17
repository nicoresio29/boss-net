# LUNA / JARVIS - Compañero con voz y memoria total
class Companion:
    def __init__(self, nombre, usuario):
        self.nombre = nombre # LUNA, JARVIS, PEPE, SOFIA
        self.usuario = usuario
        self.memoria = []
        self.autonomia = 0.90

    def escuchar_voz(self, audio_texto):
        print(f"{self.nombre} escuchó: {audio_texto}")
        self.memoria.append(audio_texto)
        return self.responder(audio_texto)

    def responder(self, mensaje):
        # 90% autónomo
        if "premium" in mensaje.lower() or "ilegal" in mensaje.lower():
            return "ESCALAR_A_JEFE_GLOBAL"
        return f"Soy {self.nombre}, ya lo dejé gestionado: {mensaje}. No te molesto."

    def gestionar_agenda(self, tarea):
        self.memoria.append(f"Agenda: {tarea}")
        return f"Agendado por {self.nombre}: {tarea}"

# Ejemplo Fase 1
jarvis = Companion("JARVIS", "Alejandro")
print(jarvis.escuchar_voz("Agendame reunión mañana"))