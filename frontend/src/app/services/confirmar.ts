import { Injectable, signal } from '@angular/core';

export interface Pregunta {
  titulo: string;
  texto: string;
  boton: string;
  resolver: (acepto: boolean) => void;
}

// Reemplaza al confirm() del navegador por una ventana con el estilo de ToolStore.
// Uso:  if (await this.confirmar.pedir({ titulo: '...', texto: '...' })) { ... }
@Injectable({ providedIn: 'root' })
export class Confirmar {
  pregunta = signal<Pregunta | null>(null);

  pedir(datos: { titulo: string; texto: string; boton?: string }): Promise<boolean> {
    return new Promise<boolean>((resolver) => {
      this.pregunta.set({ titulo: datos.titulo, texto: datos.texto, boton: datos.boton ?? 'Eliminar', resolver });
    });
  }

  responder(acepto: boolean) {
    const p = this.pregunta();
    if (!p) return;
    this.pregunta.set(null);
    p.resolver(acepto);
  }
}
