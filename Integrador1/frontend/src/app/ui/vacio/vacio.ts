import { Component, input } from '@angular/core';
import { Icono } from '../icono/icono';
import { NombreIcono } from '../icono/iconos';

// Pantalla vacía: el contorno de una herramienta que falta en el tablero.
// Uso:  <app-vacio icono="caja" titulo="..." texto="..."> <button class="btn">...</button> </app-vacio>
@Component({
  selector: 'app-vacio',
  imports: [Icono],
  template: `
    <div class="vacio">
      <div class="vacio-tablero" aria-hidden="true"><app-icono [nombre]="icono()" [tamano]="56" /></div>
      <h3>{{ titulo() }}</h3>
      <p>{{ texto() }}</p>
      <ng-content />
    </div>
  `,
})
export class Vacio {
  icono = input.required<NombreIcono>();
  titulo = input.required<string>();
  texto = input('');
}
