import { Component, inject } from '@angular/core';
import { Confirmar } from '../../services/confirmar';
import { Modal } from '../modal/modal';

// Ventana de confirmación ("¿Eliminar este producto?"). Va una sola vez, en app.html.
@Component({
  selector: 'app-confirmar',
  imports: [Modal],
  template: `
    @if (servicio.pregunta(); as p) {
      <app-modal [titulo]="p.titulo" [angosto]="true" (cerrar)="servicio.responder(false)">
        <p class="confirmar-texto">{{ p.texto }}</p>
        <div class="modal-acciones">
          <button type="button" class="btn" (click)="servicio.responder(false)">Cancelar</button>
          <button type="button" class="btn btn-peligro" (click)="servicio.responder(true)">{{ p.boton }}</button>
        </div>
      </app-modal>
    }
  `,
  styles: [`.confirmar-texto { color: var(--texto-suave); line-height: 1.55; }`],
})
export class ConfirmarVentana {
  servicio = inject(Confirmar);
}
