import { Injectable, signal } from '@angular/core';

export interface Aviso {
  id: number;
  texto: string;
  tipo: 'ok' | 'info' | 'error';
}

// Mensajes cortos que aparecen abajo a la derecha ("Producto guardado").
@Injectable({ providedIn: 'root' })
export class Toast {
  avisos = signal<Aviso[]>([]);
  private siguiente = 1;

  ok(texto: string) { this.mostrar(texto, 'ok'); }
  info(texto: string) { this.mostrar(texto, 'info'); }
  error(texto: string) { this.mostrar(texto, 'error'); }

  cerrar(id: number) {
    this.avisos.update(l => l.filter(a => a.id !== id));
  }

  private mostrar(texto: string, tipo: Aviso['tipo']) {
    const id = this.siguiente++;
    // Máximo 3 a la vez: el más antiguo se va
    this.avisos.update(l => [...l.slice(-2), { id, texto, tipo }]);
    setTimeout(() => this.cerrar(id), 3400);
  }
}
