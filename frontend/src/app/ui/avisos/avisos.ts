import { Component, inject } from '@angular/core';
import { Toast } from '../../services/toast';
import { Icono } from '../icono/icono';

// Contenedor de los avisos flotantes. Va una sola vez, en app.html.
@Component({
  selector: 'app-avisos',
  imports: [Icono],
  template: `
    <div class="avisos" role="status" aria-live="polite">
      @for (a of toast.avisos(); track a.id) {
        <div class="toast" [class.toast-error]="a.tipo === 'error'">
          <app-icono [nombre]="a.tipo === 'error' ? 'alerta' : 'check-circulo'" />
          <span>{{ a.texto }}</span>
          <button type="button" class="btn-icono" aria-label="Cerrar aviso" (click)="toast.cerrar(a.id)">
            <app-icono nombre="cerrar" [tamano]="18" />
          </button>
          <i class="toast-tiempo"></i>
        </div>
      }
    </div>
  `,
})
export class Avisos {
  toast = inject(Toast);
}
