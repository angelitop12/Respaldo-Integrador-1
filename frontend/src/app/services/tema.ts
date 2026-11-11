import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

// Tema oscuro (por defecto) o claro. Se recuerda en este navegador.
@Injectable({ providedIn: 'root' })
export class Tema {
  private documento = inject(DOCUMENT);
  claro = signal(this.leer());

  constructor() {
    this.aplicar();
  }

  alternar() {
    this.claro.set(!this.claro());
    this.aplicar();
    try { localStorage.setItem('toolstore.tema', this.claro() ? 'claro' : 'oscuro'); } catch { /* sin almacenamiento: no pasa nada */ }
  }

  private leer(): boolean {
    try { return localStorage.getItem('toolstore.tema') === 'claro'; } catch { return false; }
  }

  private aplicar() {
    const raiz = this.documento.documentElement;
    if (this.claro()) raiz.setAttribute('data-tema', 'claro');
    else raiz.removeAttribute('data-tema');
  }
}
