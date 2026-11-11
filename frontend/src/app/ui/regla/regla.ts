import { Component } from '@angular/core';

// Regla técnica decorativa (marcas finas con números). Uso:  <app-regla />   (ocupa todo el ancho; el color es el del texto)
@Component({
  selector: 'app-regla',
  template: `
    @for (n of numeros; track n) {
      <span class="regla-num" [style.left.px]="n * 80">{{ n }}</span>
    }
  `,
  host: { 'aria-hidden': 'true' },
  styles: [`
    :host {
      display: block;
      position: relative;
      height: 28px;
      overflow: hidden;
      color: var(--acento);
      opacity: 0.4;
      pointer-events: none;
      background-image:
        repeating-linear-gradient(90deg, currentColor 0 1.5px, transparent 1.5px 8px),
        repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 40px),
        repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 80px);
      background-size: 100% 8px, 100% 15px, 100% 24px;
      background-position: left bottom;
      background-repeat: no-repeat;
    }
    .regla-num {
      position: absolute;
      top: 1px;
      padding-left: 7px;
      font: 500 10px/1 var(--fuente-mono);
    }
  `],
})
export class Regla {
  numeros = Array.from({ length: 40 }, (_, i) => i);
}
