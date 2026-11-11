import { Component, computed, input } from '@angular/core';
import { ICONOS, NombreIcono } from './iconos';

// Icono vectorial. Uso:  <app-icono nombre="casa" />   o con tamaño:  <app-icono nombre="casa" [tamano]="28" />
@Component({
  selector: 'app-icono',
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
         stroke-linecap="round" stroke-linejoin="round"
         [attr.width]="tamano()" [attr.height]="tamano()" aria-hidden="true" focusable="false">
      @for (d of rutas(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: [`:host { display: inline-flex; flex: none; line-height: 0; }`],
})
export class Icono {
  nombre = input.required<NombreIcono>();
  tamano = input(20);
  rutas = computed(() => ICONOS[this.nombre()]);
}
