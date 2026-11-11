import { Component, ElementRef, afterNextRender, inject, input, output } from '@angular/core';
import { Icono } from '../icono/icono';

let siguiente = 0;

// Ventana de cristal que aparece con un deslizamiento suave. Se cierra con la X, con Esc o tocando fuera.
// Uso:
//   <app-modal titulo="Nuevo producto" (cerrar)="modalAbierto.set(false)"> ...contenido... </app-modal>
@Component({
  selector: 'app-modal',
  imports: [Icono],
  host: { '(document:keydown.escape)': 'cerrar.emit()' },
  template: `
    <div class="velo" (click)="cerrar.emit()">
      <div class="ventana" [class.angosta]="angosto()" role="dialog" aria-modal="true"
           [attr.aria-labelledby]="idTitulo" (click)="$event.stopPropagation()">
        <div class="panel-ventana">
          <div class="ventana-cabecera">
            <h2 [id]="idTitulo">{{ titulo() }}</h2>
            <button type="button" class="btn-icono" aria-label="Cerrar" (click)="cerrar.emit()">
              <app-icono nombre="cerrar" />
            </button>
          </div>
          <ng-content />
        </div>
      </div>
    </div>
  `,
})
export class Modal {
  titulo = input.required<string>();
  angosto = input(false);
  cerrar = output<void>();

  idTitulo = 'modal-titulo-' + ++siguiente;

  constructor() {
    const el = inject(ElementRef);
    // Al abrir, el cursor queda en el primer campo
    afterNextRender(() => {
      const primero = (el.nativeElement as HTMLElement).querySelector<HTMLElement>('input, select, textarea');
      primero?.focus({ preventScroll: true });
    });
  }
}
